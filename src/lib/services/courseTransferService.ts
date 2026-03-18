import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

type TransferCourseOwnershipInput = {
  courseId: string;
  targetTeacherEmail: string;
  actorUserId?: string;
};

type TeacherIdentity = {
  id: string;
  email: string;
  name: string;
};

export type TransferCourseOwnershipResult = {
  courseId: string;
  courseCode: string;
  previousTeacherId: string;
  previousTeacherName: string;
  targetTeacherId: string;
  targetTeacherName: string;
  targetTeacherEmail: string;
};

const BATCH_WRITE_LIMIT = 450;

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizeRole = (value: unknown): "docente" | "estudiante" | "" => {
  const normalized = normalizeText(value).toLowerCase();
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

const normalizeApproval = (value: unknown): "pending" | "approved" | "rejected" | "" => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "pending" || normalized === "approved" || normalized === "rejected") {
    return normalized;
  }
  return "";
};

const normalizePlanStatus = (value: unknown): "active" | "expired" | "pending_payment" | "" => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "active" || normalized === "expired" || normalized === "pending_payment") {
    return normalized;
  }
  return "";
};

const appendUpdate = async (
  updates: Array<{ ref: ReturnType<typeof doc>; payload: Record<string, unknown> }>,
): Promise<void> => {
  if (updates.length === 0) return;

  let batch = writeBatch(firebaseDB);
  let count = 0;

  for (const item of updates) {
    batch.update(item.ref, item.payload);
    count += 1;

    if (count >= BATCH_WRITE_LIMIT) {
      await batch.commit();
      batch = writeBatch(firebaseDB);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
};

const findTeacherByEmail = async (email: string): Promise<TeacherIdentity> => {
  const normalizedEmail = normalizeText(email).toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Teacher email is required.");
  }

  const [usersSnap, studentsSnap] = await Promise.all([
    getDocs(query(collection(firebaseDB, "usuarios"), where("email", "==", normalizedEmail))),
    getDocs(query(collection(firebaseDB, "estudiantes"), where("email", "==", normalizedEmail))),
  ]);

  const userDoc = usersSnap.docs[0] || null;
  const studentDoc = studentsSnap.docs[0] || null;
  if (!userDoc && !studentDoc) {
    throw new Error("Teacher not found with that email.");
  }

  const resolvedId = userDoc?.id || studentDoc?.id || "";
  if (!resolvedId) {
    throw new Error("Could not resolve teacher account.");
  }

  const userData = (userDoc?.data() || {}) as Record<string, unknown>;
  const studentData = (studentDoc?.data() || {}) as Record<string, unknown>;

  const role =
    normalizeRole(userData.role) ||
    normalizeRole(studentData.role) ||
    normalizeRole(userData.requestedRole) ||
    normalizeRole(studentData.requestedRole);
  if (role !== "docente") {
    throw new Error("Destination user must be registered as teacher.");
  }

  const approval =
    normalizeApproval(userData.teacherApprovalStatus) ||
    normalizeApproval(studentData.teacherApprovalStatus);
  if (approval && approval !== "approved") {
    throw new Error("Destination teacher must be approved first.");
  }

  const planStatus =
    normalizePlanStatus(userData.teacherPlanStatus) ||
    normalizePlanStatus(studentData.teacherPlanStatus);
  if (planStatus === "expired" || planStatus === "pending_payment") {
    throw new Error("Destination teacher must have an active paid plan.");
  }

  const name =
    normalizeText(userData.name) ||
    normalizeText(studentData.name) ||
    normalizedEmail.split("@")[0] ||
    "Teacher";

  return {
    id: resolvedId,
    email: normalizedEmail,
    name,
  };
};

const collectCourseScopedUpdates = async (
  courseId: string,
  targetTeacherId: string,
  targetTeacherName: string,
): Promise<Array<{ ref: ReturnType<typeof doc>; payload: Record<string, unknown> }>> => {
  // Keep this list aligned with Firestore rules. `courseBackups` is create/delete-only (no update).
  const collectionsToSync = ["gradeSheets", "evaluaciones", "assessments"];
  const updates: Array<{ ref: ReturnType<typeof doc>; payload: Record<string, unknown> }> = [];

  for (const collectionName of collectionsToSync) {
    const snap = await getDocs(
      query(collection(firebaseDB, collectionName), where("courseId", "==", courseId)),
    );

    snap.docs.forEach((item) => {
      updates.push({
        ref: doc(firebaseDB, collectionName, item.id),
        payload: {
          teacherId: targetTeacherId,
          teacherName: targetTeacherName,
          updatedAt: serverTimestamp(),
        },
      });
    });
  }

  return updates;
};

const collectCourseContentBackfillUpdates = async (
  courseId: string,
): Promise<Array<{ ref: ReturnType<typeof doc>; payload: Record<string, unknown> }>> => {
  const updates: Array<{ ref: ReturnType<typeof doc>; payload: Record<string, unknown> }> = [];
  const touchedFileIds = new Set<string>();
  const touchedLegacyWeekIds = new Set<string>();
  const touchedStructuredWeekIds = new Set<string>();

  const periodsSnap = await getDocs(
    query(collection(firebaseDB, "periods"), where("courseId", "==", courseId)),
  );

  for (const periodDocSnap of periodsSnap.docs) {
    updates.push({
      ref: doc(firebaseDB, "periods", periodDocSnap.id),
      payload: {
        courseId,
        updatedAt: serverTimestamp(),
      },
    });

    const filesByPeriodSnap = await getDocs(
      query(collection(firebaseDB, "course_files"), where("periodId", "==", periodDocSnap.id)),
    );

    filesByPeriodSnap.docs.forEach((fileDocSnap) => {
      if (touchedFileIds.has(fileDocSnap.id)) return;
      touchedFileIds.add(fileDocSnap.id);
      updates.push({
        ref: doc(firebaseDB, "course_files", fileDocSnap.id),
        payload: {
          courseId,
          updatedAt: serverTimestamp(),
        },
      });
    });

    const weeksByPeriodSnap = await getDocs(
      query(collection(firebaseDB, "weeks"), where("periodId", "==", periodDocSnap.id)),
    );

    for (const weekDocSnap of weeksByPeriodSnap.docs) {
      if (touchedStructuredWeekIds.has(weekDocSnap.id)) continue;
      touchedStructuredWeekIds.add(weekDocSnap.id);
      updates.push({
        ref: doc(firebaseDB, "weeks", weekDocSnap.id),
        payload: {
          courseId,
          updatedAt: serverTimestamp(),
        },
      });

      const filesByWeekSnap = await getDocs(
        query(collection(firebaseDB, "course_files"), where("weekId", "==", weekDocSnap.id)),
      );

      filesByWeekSnap.docs.forEach((fileDocSnap) => {
        if (touchedFileIds.has(fileDocSnap.id)) return;
        touchedFileIds.add(fileDocSnap.id);
        updates.push({
          ref: doc(firebaseDB, "course_files", fileDocSnap.id),
          payload: {
            courseId,
            updatedAt: serverTimestamp(),
          },
        });
      });
    }
  }

  const structuredWeeksSnap = await getDocs(
    query(collection(firebaseDB, "weeks"), where("courseId", "==", courseId)),
  );

  for (const weekDocSnap of structuredWeeksSnap.docs) {
    touchedStructuredWeekIds.add(weekDocSnap.id);
    updates.push({
      ref: doc(firebaseDB, "weeks", weekDocSnap.id),
      payload: {
        courseId,
        updatedAt: serverTimestamp(),
      },
    });

    const filesByWeekSnap = await getDocs(
      query(collection(firebaseDB, "course_files"), where("weekId", "==", weekDocSnap.id)),
    );

    filesByWeekSnap.docs.forEach((fileDocSnap) => {
      if (touchedFileIds.has(fileDocSnap.id)) return;
      touchedFileIds.add(fileDocSnap.id);
      updates.push({
        ref: doc(firebaseDB, "course_files", fileDocSnap.id),
        payload: {
          courseId,
          updatedAt: serverTimestamp(),
        },
      });
    });
  }

  const directFilesSnap = await getDocs(
    query(collection(firebaseDB, "course_files"), where("courseId", "==", courseId)),
  );

  directFilesSnap.docs.forEach((fileDocSnap) => {
    if (touchedFileIds.has(fileDocSnap.id)) return;
    touchedFileIds.add(fileDocSnap.id);
    updates.push({
      ref: doc(firebaseDB, "course_files", fileDocSnap.id),
      payload: {
        courseId,
        updatedAt: serverTimestamp(),
      },
    });
  });

  const unitsSnap = await getDocs(
    query(collection(firebaseDB, "unidades"), where("courseId", "==", courseId)),
  );

  for (const unitDocSnap of unitsSnap.docs) {
    const weeksSnap = await getDocs(
      query(collection(firebaseDB, "semanas"), where("unitId", "==", unitDocSnap.id)),
    );

    for (const weekDocSnap of weeksSnap.docs) {
      touchedLegacyWeekIds.add(weekDocSnap.id);
      updates.push({
        ref: doc(firebaseDB, "semanas", weekDocSnap.id),
        payload: {
          courseId,
          updatedAt: serverTimestamp(),
        },
      });

      const slidesSnap = await getDocs(
        query(collection(firebaseDB, "diapositivas"), where("weekId", "==", weekDocSnap.id)),
      );

      slidesSnap.docs.forEach((slideDocSnap) => {
        updates.push({
          ref: doc(firebaseDB, "diapositivas", slideDocSnap.id),
          payload: {
            courseId,
            updatedAt: serverTimestamp(),
          },
        });
      });
    }
  }

  for (const legacyWeekId of touchedLegacyWeekIds) {
    const filesByLegacyWeekSnap = await getDocs(
      query(collection(firebaseDB, "course_files"), where("weekId", "==", legacyWeekId)),
    );

    filesByLegacyWeekSnap.docs.forEach((fileDocSnap) => {
      if (touchedFileIds.has(fileDocSnap.id)) return;
      touchedFileIds.add(fileDocSnap.id);
      updates.push({
        ref: doc(firebaseDB, "course_files", fileDocSnap.id),
        payload: {
          courseId,
          updatedAt: serverTimestamp(),
        },
      });
    });
  }

  return updates;
};

export async function backfillTransferredCourseContent(courseId: string): Promise<number> {
  const normalizedCourseId = normalizeText(courseId);
  if (!normalizedCourseId) return 0;

  const contentBackfillUpdates = await collectCourseContentBackfillUpdates(normalizedCourseId);
  await appendUpdate(contentBackfillUpdates);
  return contentBackfillUpdates.length;
}

export async function transferCourseOwnership(
  input: TransferCourseOwnershipInput,
): Promise<TransferCourseOwnershipResult> {
  const courseId = normalizeText(input.courseId);
  const targetTeacherEmail = normalizeText(input.targetTeacherEmail).toLowerCase();
  const actorUserId = normalizeText(input.actorUserId);

  if (!courseId) throw new Error("Course id is required.");
  if (!targetTeacherEmail) throw new Error("Destination teacher email is required.");

  const courseRef = doc(firebaseDB, "cursos", courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) {
    throw new Error("Course not found.");
  }

  const courseData = (courseSnap.data() || {}) as Record<string, unknown>;
  const currentTeacherId = normalizeText(courseData.teacherId);
  const currentTeacherName = normalizeText(courseData.teacherName) || "Teacher";
  const courseCode = normalizeText(courseData.code);

  if (!currentTeacherId) {
    throw new Error("This course has no teacher assigned.");
  }

  if (actorUserId && actorUserId !== currentTeacherId) {
    throw new Error("Only the current teacher can transfer this course.");
  }

  const targetTeacher = await findTeacherByEmail(targetTeacherEmail);
  if (targetTeacher.id === currentTeacherId) {
    throw new Error("This teacher already owns the course.");
  }

  const scopedUpdates = await collectCourseScopedUpdates(
    courseId,
    targetTeacher.id,
    targetTeacher.name,
  );
  const contentBackfillUpdates = await collectCourseContentBackfillUpdates(courseId);

  // Important: update related docs first while the current owner still passes `isCourseTeacher(courseId)`.
  await appendUpdate(scopedUpdates);
  await appendUpdate(contentBackfillUpdates);

  await updateDoc(courseRef, {
    teacherId: targetTeacher.id,
    teacherName: targetTeacher.name,
    updatedAt: serverTimestamp(),
  });

  return {
    courseId,
    courseCode,
    previousTeacherId: currentTeacherId,
    previousTeacherName: currentTeacherName,
    targetTeacherId: targetTeacher.id,
    targetTeacherName: targetTeacher.name,
    targetTeacherEmail: targetTeacher.email,
  };
}
