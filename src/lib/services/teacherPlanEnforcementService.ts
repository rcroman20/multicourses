import { httpsCallable } from "firebase/functions";
import { firebaseAuth, firebaseDB, firebaseFunctions } from "@/lib/firebase";
import type { CourseClassSchedule } from "@/types/academic";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  TEACHER_PLAN_DEFINITIONS,
  getTeacherPlanDefinition,
} from "@/lib/services/teacherPlanService";

type EnrollmentAction = "enroll" | "unenroll";

interface CreateCourseWithPlanPayload {
  name: string;
  code: string;
  semester: string;
  group: string;
  credits: number;
  description: string;
  classSchedule: CourseClassSchedule[];
}

interface CreateCourseWithPlanResponse {
  ok: boolean;
  courseId: string;
  planName: string;
  courseLimit: number;
}

interface ChangeEnrollmentPayload {
  courseId: string;
  studentId: string;
  action: EnrollmentAction;
}

interface ChangeEnrollmentResponse {
  ok: boolean;
  courseId: string;
  studentId: string;
  action: EnrollmentAction;
  planName: string;
  studentLimit: number;
}

type TeacherPlanContext = {
  name: string;
  courseLimit: number;
  studentLimit: number;
  expiresAt: Date | null;
  status: string;
};

const normalizeUserRole = (value: unknown): "docente" | "estudiante" | "" => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "docente" ||
    normalized === "teacher" ||
    normalized === "profesor" ||
    normalized === "professor" ||
    normalized === "instructor"
  ) {
    return "docente";
  }
  if (
    normalized === "estudiante" ||
    normalized === "student" ||
    normalized === "alumno" ||
    normalized === "learner"
  ) {
    return "estudiante";
  }
  return "";
};

const normalizeTeacherApprovalStatus = (
  value: unknown,
): "pending" | "approved" | "rejected" | "" => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pending" || normalized === "approved" || normalized === "rejected") {
    return normalized;
  }
  return "";
};

const toDate = (value: unknown): Date | null => {
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

const toPositiveNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseFunctionError = (error: unknown, fallbackMessage: string): Error => {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? String((error as { message: string }).message).replace(/^functions\/[a-z-]+:\s*/i, "").trim()
      : "";

  return new Error(message || fallbackMessage);
};

const getFunctionCode = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return String((error as { code: string }).code).trim().toLowerCase();
  }
  return "";
};

const isLocalDevEnvironment = (): boolean => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
};

const isFunctionsUnavailableError = (error: unknown): boolean => {
  const code = getFunctionCode(error);
  if (
    code.includes("functions/not-found") ||
    code.includes("functions/unavailable") ||
    code.includes("functions/unimplemented") ||
    code.includes("functions/deadline-exceeded")
  ) {
    return true;
  }

  if (code.includes("functions/internal")) {
    const internalMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message.toLowerCase()
        : "";
    if (
      internalMessage.includes("failed to fetch") ||
      internalMessage.includes("network request failed") ||
      internalMessage.includes("cors") ||
      internalMessage.includes("access-control-allow-origin") ||
      internalMessage.includes("preflight") ||
      internalMessage.includes("net::err_failed")
    ) {
      return true;
    }
  }

  if (error instanceof TypeError) {
    const networkMessage = String(error.message || "").toLowerCase();
    if (
      networkMessage.includes("failed to fetch") ||
      networkMessage.includes("networkerror") ||
      networkMessage.includes("network request failed")
    ) {
      return true;
    }
  }

  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";
  return (
    (message.includes("not found") && message.includes("function")) ||
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("cors") ||
    message.includes("access-control-allow-origin") ||
    message.includes("preflight") ||
    message.includes("net::err_failed")
  );
};

const getCurrentUserId = (): string => {
  const uid = firebaseAuth.currentUser?.uid || "";
  if (!uid) throw new Error("You must be signed in.");
  return uid;
};

const getTeacherPlanContext = async (teacherId: string): Promise<TeacherPlanContext> => {
  const [userSnap, studentSnap] = await Promise.all([
    getDoc(doc(firebaseDB, "usuarios", teacherId)),
    getDoc(doc(firebaseDB, "estudiantes", teacherId)),
  ]);

  const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
  const studentData = studentSnap.exists() ? (studentSnap.data() as Record<string, unknown>) : {};
  const merged = { ...studentData, ...userData };

  const role = normalizeUserRole(merged.role);
  const approval = normalizeTeacherApprovalStatus(merged.teacherApprovalStatus);
  if (role !== "docente") {
    throw new Error("Only approved teachers can perform this action.");
  }
  if (approval && approval !== "approved") {
    throw new Error("Teacher account is not approved yet.");
  }

  const hasExplicitPlan =
    typeof merged.teacherPlanId === "string" &&
    merged.teacherPlanId.trim().length > 0;
  const definition = hasExplicitPlan
    ? getTeacherPlanDefinition(merged.teacherPlanId as string)
    : TEACHER_PLAN_DEFINITIONS.scale;
  const expiresAt = toDate(merged.teacherPlanExpiresAt);
  const status = String(merged.teacherPlanStatus || "active").trim().toLowerCase();

  return {
    name:
      typeof merged.teacherPlanName === "string" && merged.teacherPlanName.trim().length > 0
        ? merged.teacherPlanName.trim()
        : definition.label,
    courseLimit: toPositiveNumber(merged.teacherPlanCourseLimit, definition.courseLimit),
    studentLimit: toPositiveNumber(merged.teacherPlanStudentLimit, definition.studentLimit),
    expiresAt,
    status,
  };
};

const assertPlanIsActive = (plan: TeacherPlanContext): void => {
  if (plan.status === "pending_payment") {
    throw new Error("Teacher request approved, but payment is still pending.");
  }
  if (plan.status === "expired") {
    throw new Error("Teacher plan is expired. Renew the plan to continue.");
  }
  if (plan.expiresAt && plan.expiresAt.getTime() < Date.now()) {
    throw new Error("Teacher plan is expired. Renew the plan to continue.");
  }
};

const normalizeSchedule = (schedule: CourseClassSchedule[]): CourseClassSchedule[] =>
  (Array.isArray(schedule) ? schedule : [])
    .map((entry) => ({
      dayOfWeek: Number(entry.dayOfWeek),
      startTime: String(entry.startTime || "").trim(),
      endTime: String(entry.endTime || "").trim(),
      location: String(entry.location || "").trim(),
    }))
    .filter(
      (entry) =>
        Number.isInteger(entry.dayOfWeek) &&
        entry.dayOfWeek >= 0 &&
        entry.dayOfWeek <= 6 &&
        entry.startTime.length > 0 &&
        entry.endTime.length > 0 &&
        entry.startTime < entry.endTime,
    );

async function createCourseWithPlanFallback(
  payload: CreateCourseWithPlanPayload,
): Promise<CreateCourseWithPlanResponse> {
  const teacherId = getCurrentUserId();
  const plan = await getTeacherPlanContext(teacherId);
  assertPlanIsActive(plan);

  const name = String(payload.name || "").trim();
  const code = String(payload.code || "").trim().toUpperCase();
  const semester = String(payload.semester || "").trim();
  const group = String(payload.group || "").trim();
  const credits = Number(payload.credits || 0);
  const description = String(payload.description || "").trim();
  const classSchedule = normalizeSchedule(payload.classSchedule || []);

  if (!name || name.length < 3) throw new Error("Course name is required.");
  if (!code || code.length < 3) throw new Error("Course code is required.");
  if (!semester) throw new Error("Semester is required.");
  if (!group) throw new Error("Group is required.");
  if (!Number.isFinite(credits) || credits < 0) throw new Error("Credits cannot be negative.");
  if (!description || description.length < 10) {
    throw new Error("Description must be at least 10 characters.");
  }
  const [existingCodeSnap, teacherCoursesSnap, teacherProfileSnap] = await Promise.all([
    getDocs(query(collection(firebaseDB, "cursos"), where("code", "==", code))),
    getDocs(query(collection(firebaseDB, "cursos"), where("teacherId", "==", teacherId))),
    getDoc(doc(firebaseDB, "usuarios", teacherId)),
  ]);

  if (!existingCodeSnap.empty) {
    throw new Error(`Course code "${code}" already exists. Please use a unique code.`);
  }
  if (teacherCoursesSnap.size >= plan.courseLimit) {
    throw new Error(
      `Plan limit reached: ${plan.name} allows up to ${plan.courseLimit} courses.`,
    );
  }

  const teacherName =
    teacherProfileSnap.exists() && typeof teacherProfileSnap.data()?.name === "string"
      ? String(teacherProfileSnap.data()?.name).trim()
      : "Teacher";

  const courseRef = doc(collection(firebaseDB, "cursos"));
  await setDoc(courseRef, {
    name,
    code,
    semester,
    group,
    credits,
    description,
    classSchedule,
    teacherId,
    teacherName: teacherName || "Teacher",
    createdAt: new Date(),
    updatedAt: new Date(),
    status: "active",
    enrolledStudents: [],
  });

  return {
    ok: true,
    courseId: courseRef.id,
    planName: plan.name,
    courseLimit: plan.courseLimit,
  };
}

async function changeCourseEnrollmentWithPlanFallback(
  payload: ChangeEnrollmentPayload,
): Promise<ChangeEnrollmentResponse> {
  const actorUserId = getCurrentUserId();
  const courseId = String(payload.courseId || "").trim();
  const studentId = String(payload.studentId || "").trim();
  const action = payload.action;

  if (!courseId || !studentId) throw new Error("courseId and studentId are required.");
  if (action !== "enroll" && action !== "unenroll") {
    throw new Error("action must be enroll or unenroll.");
  }

  const courseRef = doc(firebaseDB, "cursos", courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) throw new Error("Course not found.");

  const courseData = courseSnap.data() as Record<string, unknown>;
  const teacherId =
    typeof courseData.teacherId === "string" ? courseData.teacherId.trim() : "";
  if (!teacherId) throw new Error("Course has no teacher assigned.");

  const canManageAsTeacher = actorUserId === teacherId;
  const canManageAsSelf = actorUserId === studentId;
  if (!canManageAsTeacher && !canManageAsSelf) {
    throw new Error("You are not allowed to change this enrollment.");
  }

  const plan = await getTeacherPlanContext(teacherId);
  assertPlanIsActive(plan);

  const enrolledStudents = Array.isArray(courseData.enrolledStudents)
    ? (courseData.enrolledStudents as unknown[]).filter(
        (id) => typeof id === "string" && String(id).trim().length > 0,
      )
    : [];
  const alreadyEnrolled = enrolledStudents.includes(studentId);

  if (action === "enroll" && !alreadyEnrolled) {
    const teacherCoursesSnap = await getDocs(
      query(collection(firebaseDB, "cursos"), where("teacherId", "==", teacherId)),
    );
    const uniqueStudentIds = new Set<string>();
    teacherCoursesSnap.forEach((courseDoc) => {
      const ids = Array.isArray(courseDoc.data()?.enrolledStudents)
        ? (courseDoc.data().enrolledStudents as unknown[])
        : [];
      for (const id of ids) {
        if (typeof id === "string" && id.trim().length > 0) {
          uniqueStudentIds.add(id);
        }
      }
    });

    const projectedTotal = uniqueStudentIds.has(studentId)
      ? uniqueStudentIds.size
      : uniqueStudentIds.size + 1;
    if (projectedTotal > plan.studentLimit) {
      throw new Error(
        `Plan limit reached: ${plan.name} allows up to ${plan.studentLimit} unique students.`,
      );
    }
  }

  if (action === "enroll") {
    await updateDoc(courseRef, {
      enrolledStudents: arrayUnion(studentId),
      updatedAt: new Date(),
    });
    await setDoc(
      doc(firebaseDB, "estudiantes", studentId),
      {
        id: studentId,
        role: "estudiante",
        courses: arrayUnion(courseId),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } else {
    await updateDoc(courseRef, {
      enrolledStudents: arrayRemove(studentId),
      updatedAt: new Date(),
    });
    await setDoc(
      doc(firebaseDB, "estudiantes", studentId),
      {
        courses: arrayRemove(courseId),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  }

  return {
    ok: true,
    courseId,
    studentId,
    action,
    planName: plan.name,
    studentLimit: plan.studentLimit,
  };
}

export async function createCourseWithPlan(
  payload: CreateCourseWithPlanPayload,
): Promise<CreateCourseWithPlanResponse> {
  try {
    const callable = httpsCallable<CreateCourseWithPlanPayload, CreateCourseWithPlanResponse>(
      firebaseFunctions,
      "createCourseWithPlan",
    );
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    const localDev = isLocalDevEnvironment();
    const shouldUseFallback =
      localDev || isFunctionsUnavailableError(error);
    if (shouldUseFallback) {
      return createCourseWithPlanFallback(payload);
    }
    throw parseFunctionError(
      error,
      "Could not create course with your current teacher plan.",
    );
  }
}

export async function changeCourseEnrollmentWithPlan(
  payload: ChangeEnrollmentPayload,
): Promise<ChangeEnrollmentResponse> {
  try {
    const callable = httpsCallable<ChangeEnrollmentPayload, ChangeEnrollmentResponse>(
      firebaseFunctions,
      "changeCourseEnrollmentWithPlan",
    );
    const result = await callable(payload);
    return result.data;
  } catch (error) {
    const localDev = isLocalDevEnvironment();
    const shouldUseFallback =
      localDev || isFunctionsUnavailableError(error);
    if (shouldUseFallback) {
      return changeCourseEnrollmentWithPlanFallback(payload);
    }
    throw parseFunctionError(
      error,
      "Could not update course enrollment with your current teacher plan.",
    );
  }
}
