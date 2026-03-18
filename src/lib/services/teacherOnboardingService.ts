import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { loadAdminPlatformSettings } from "@/lib/services/adminSettingsService";

export const TEACHER_ONBOARDING_COURSE_CODE = "MCT-ONB-101";
export const TEACHER_ONBOARDING_DURATION_MONTHS = 2;

type OnboardingCourseRecord = {
  id: string;
  enrolledStudents: string[];
};

const toDateOrNull = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonths = (baseDate: Date, months: number): Date => {
  const next = new Date(baseDate.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
};

export async function getTeacherOnboardingCourse(): Promise<OnboardingCourseRecord | null> {
  const snap = await getDocs(
    query(
      collection(firebaseDB, "cursos"),
      where("code", "==", TEACHER_ONBOARDING_COURSE_CODE),
      limit(1),
    ),
  );

  const docSnap = snap.docs[0];
  if (!docSnap) return null;

  const data = (docSnap.data() || {}) as Record<string, unknown>;
  const enrolledStudents = Array.isArray(data.enrolledStudents)
    ? data.enrolledStudents.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      )
    : [];

  return {
    id: docSnap.id,
    enrolledStudents,
  };
}

export async function ensureTeacherOnboardingEnrollment(
  teacherId: string,
  explicitCourse?: OnboardingCourseRecord,
): Promise<{ enrolled: boolean; dueAt: Date | null }> {
  const normalizedTeacherId = String(teacherId || "").trim();
  if (!normalizedTeacherId) throw new Error("Teacher id is required.");

  const course = explicitCourse || (await getTeacherOnboardingCourse());
  const platformSettings = await loadAdminPlatformSettings();
  const onboardingDurationMonths = Math.max(
    1,
    Number(platformSettings.defaultOnboardingMonths) || TEACHER_ONBOARDING_DURATION_MONTHS,
  );
  if (!course) {
    throw new Error(
      `Onboarding course ${TEACHER_ONBOARDING_COURSE_CODE} was not found. Create it first.`,
    );
  }

  const studentRef = doc(firebaseDB, "estudiantes", normalizedTeacherId);
  const studentSnap = await getDoc(studentRef);
  const studentData = (studentSnap.exists() ? studentSnap.data() : {}) as Record<string, unknown>;

  const currentStatus = String(studentData.teacherOnboardingStatus || "").trim().toLowerCase();
  if (currentStatus === "completed" || currentStatus === "closed") {
    return {
      enrolled: false,
      dueAt:
        toDateOrNull(studentData.teacherOnboardingDueAt) ||
        toDateOrNull(studentData.teacherOnboardingEnrolledAt),
    };
  }

  const currentEnrolledAt = toDateOrNull(studentData.teacherOnboardingEnrolledAt);
  const currentDueAt = toDateOrNull(studentData.teacherOnboardingDueAt);
  const baseDate = currentEnrolledAt || new Date();
  const dueAt = currentDueAt || addMonths(baseDate, onboardingDurationMonths);

  const isAlreadyEnrolled = course.enrolledStudents.includes(normalizedTeacherId);
  if (!isAlreadyEnrolled) {
    await updateDoc(doc(firebaseDB, "cursos", course.id), {
      enrolledStudents: arrayUnion(normalizedTeacherId),
    });
  }

  await setDoc(
    studentRef,
    {
      teacherOnboardingCourseId: course.id,
      teacherOnboardingCourseCode: TEACHER_ONBOARDING_COURSE_CODE,
      teacherOnboardingStatus: "in_progress",
      teacherOnboardingEnrolledAt: currentEnrolledAt || serverTimestamp(),
      teacherOnboardingDueAt: dueAt,
      teacherOnboardingClosedAt: null,
      teacherOnboardingClosedBy: null,
      courses: arrayUnion(course.id),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return {
    enrolled: !isAlreadyEnrolled,
    dueAt,
  };
}

export async function closeTeacherOnboardingIfExpired(
  teacherId: string,
): Promise<boolean> {
  const normalizedTeacherId = String(teacherId || "").trim();
  if (!normalizedTeacherId) return false;

  const studentRef = doc(firebaseDB, "estudiantes", normalizedTeacherId);
  const studentSnap = await getDoc(studentRef);
  if (!studentSnap.exists()) return false;

  const studentData = (studentSnap.data() || {}) as Record<string, unknown>;
  const platformSettings = await loadAdminPlatformSettings();
  const onboardingDurationMonths = Math.max(
    1,
    Number(platformSettings.defaultOnboardingMonths) || TEACHER_ONBOARDING_DURATION_MONTHS,
  );
  const status = String(studentData.teacherOnboardingStatus || "").trim().toLowerCase();
  if (status === "completed" || status === "closed") return false;

  const enrolledAt = toDateOrNull(studentData.teacherOnboardingEnrolledAt);
  const storedDueAt = toDateOrNull(studentData.teacherOnboardingDueAt);
  const effectiveDueAt =
    storedDueAt ||
    (enrolledAt ? addMonths(enrolledAt, onboardingDurationMonths) : null);
  if (!effectiveDueAt) return false;
  if (effectiveDueAt.getTime() > Date.now()) return false;

  const courseIdRaw = studentData.teacherOnboardingCourseId;
  const courseId = typeof courseIdRaw === "string" ? courseIdRaw.trim() : "";
  if (courseId) {
    await updateDoc(doc(firebaseDB, "cursos", courseId), {
      enrolledStudents: arrayRemove(normalizedTeacherId),
    }).catch(() => undefined);
  } else {
    const fallbackCourse = await getTeacherOnboardingCourse();
    if (fallbackCourse) {
      await updateDoc(doc(firebaseDB, "cursos", fallbackCourse.id), {
        enrolledStudents: arrayRemove(normalizedTeacherId),
      }).catch(() => undefined);
    }
  }

  const closePayload: Record<string, unknown> = {
    teacherOnboardingStatus: "closed",
    teacherOnboardingDueAt: effectiveDueAt,
    teacherOnboardingClosedAt: serverTimestamp(),
    teacherOnboardingClosedBy: "system",
    updatedAt: serverTimestamp(),
  };
  if (courseId) {
    closePayload.courses = arrayRemove(courseId);
  }

  await setDoc(
    studentRef,
    closePayload,
    { merge: true },
  );

  return true;
}
