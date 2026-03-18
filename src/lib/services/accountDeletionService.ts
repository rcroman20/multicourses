import {
  Timestamp,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { deleteUserByAdmin } from "@/lib/services/adminUserDeletionService";

const ACCOUNT_DELETION_REQUESTS_COLLECTION = "accountDeletionRequests";
const DELETED_ACCOUNTS_COLLECTION = "deletedAccounts";
const LEGACY_REQUEST_COLLECTION = "estudiantes";
const LEGACY_REQUEST_FIELD = "accountDeletionRequest";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 300;

export type AccountDeletionStatus = "pending" | "completed" | "cancelled";
export type AccountDeletionRole = "docente" | "estudiante" | "institucion";

export interface AccountDeletionRequestRecord {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: AccountDeletionRole;
  status: AccountDeletionStatus;
  requestedAt: Date | null;
  scheduledDeletionAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
}

interface RequestAccountDeletionInput {
  userId: string;
  email: string;
  name: string;
  role: AccountDeletionRole;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return String((error as { code: string }).code).toLowerCase();
  }
  return "";
}

function isFunctionsFallbackError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (
    code.includes("functions/unavailable") ||
    code.includes("functions/not-found") ||
    code.includes("functions/unimplemented") ||
    code.includes("functions/internal") ||
    code.includes("functions/deadline-exceeded")
  ) {
    return true;
  }

  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? String((error as { message: string }).message).toLowerCase()
      : "";

  return (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("cors") ||
    message.includes("access-control-allow-origin") ||
    message.includes("preflight")
  );
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return ((value as { toDate: () => Date }).toDate());
    } catch {
      return null;
    }
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapRequestDoc(snapshot: any): AccountDeletionRequestRecord {
  const data = snapshot.data() || {};
  return {
    id: snapshot.id,
    userId: data.userId || snapshot.id,
    email: data.email || "",
    name: data.name || "User",
    role: (data.role || "estudiante") as AccountDeletionRole,
    status: (data.status || "pending") as AccountDeletionStatus,
    requestedAt: toDate(data.requestedAt),
    scheduledDeletionAt: toDate(data.scheduledDeletionAt),
    completedAt: toDate(data.completedAt),
    completedBy: data.completedBy || null,
  };
}

function requestDocRef(userId: string) {
  return doc(firebaseDB, ACCOUNT_DELETION_REQUESTS_COLLECTION, userId);
}

function legacyRequestDocRef(userId: string) {
  return doc(firebaseDB, LEGACY_REQUEST_COLLECTION, userId);
}

function mapLegacyRequest(
  source: Record<string, unknown>,
  fallbackUserId: string,
): AccountDeletionRequestRecord | null {
  const nested = (source?.[LEGACY_REQUEST_FIELD] || null) as
    | Record<string, unknown>
    | null;
  if (!nested) return null;

  return {
    id: String(nested.userId || fallbackUserId),
    userId: String(nested.userId || fallbackUserId),
    email: String(nested.email || ""),
    name: String(nested.name || "User"),
    role: (nested.role || "estudiante") as AccountDeletionRole,
    status: (nested.status || "pending") as AccountDeletionStatus,
    requestedAt: toDate(nested.requestedAt),
    scheduledDeletionAt: toDate(nested.scheduledDeletionAt),
    completedAt: toDate(nested.completedAt),
    completedBy: nested.completedBy ? String(nested.completedBy) : null,
  };
}

async function getPrimaryRequest(userId: string): Promise<AccountDeletionRequestRecord | null> {
  try {
    const snap = await getDoc(requestDocRef(userId));
    if (!snap.exists()) return null;
    return mapRequestDoc(snap);
  } catch {
    return null;
  }
}

async function getLegacyRequest(userId: string): Promise<AccountDeletionRequestRecord | null> {
  try {
    const snap = await getDoc(legacyRequestDocRef(userId));
    if (!snap.exists()) return null;
    return mapLegacyRequest((snap.data() || {}) as Record<string, unknown>, snap.id);
  } catch {
    return null;
  }
}

async function setLegacyRequest(
  userId: string,
  request: Partial<AccountDeletionRequestRecord>,
): Promise<void> {
  const legacyRef = legacyRequestDocRef(userId);
  const existingSnap = await getDoc(legacyRef).catch(() => null);
  const legacyRole = request.role === "docente"
    ? "docente"
    : request.role === "institucion"
      ? "institucion"
      : "estudiante";

  await setDoc(
    legacyRef,
    {
      // Keep top-level role so Firestore create rules for /estudiantes/{id} pass
      // when this fallback creates a missing document.
      role: legacyRole,
      ...(existingSnap?.exists() ? {} : { createdAt: serverTimestamp() }),
      [LEGACY_REQUEST_FIELD]: {
        userId,
        email: (request.email || "").trim().toLowerCase(),
        name: request.name || "User",
        role: legacyRole,
        status: request.status || "pending",
        requestedAt: request.requestedAt
          ? Timestamp.fromDate(request.requestedAt)
          : serverTimestamp(),
        scheduledDeletionAt: request.scheduledDeletionAt
          ? Timestamp.fromDate(request.scheduledDeletionAt)
          : Timestamp.fromDate(new Date(Date.now() + THIRTY_DAYS_MS)),
        completedAt: request.completedAt
          ? Timestamp.fromDate(request.completedAt)
          : null,
        completedBy: request.completedBy || null,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function deleteDocsInChunks(docs: any[]): Promise<number> {
  if (!docs.length) return 0;
  let deleted = 0;

  for (let index = 0; index < docs.length; index += BATCH_LIMIT) {
    const chunk = docs.slice(index, index + BATCH_LIMIT);
    const batch = writeBatch(firebaseDB);
    chunk.forEach((snapshot) => batch.delete(snapshot.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

async function deleteByField(collectionName: string, field: string, value: string): Promise<number> {
  try {
    const q = query(collection(firebaseDB, collectionName), where(field, "==", value));
    const snap = await getDocs(q);
    return await deleteDocsInChunks(snap.docs);
  } catch {
    return 0;
  }
}

async function removeFromCourseEnrollment(collectionName: string, userId: string): Promise<void> {
  try {
    const q = query(collection(firebaseDB, collectionName), where("enrolledStudents", "array-contains", userId));
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map((snapshot) =>
        updateDoc(snapshot.ref, {
          enrolledStudents: arrayRemove(userId),
        }).catch(() => undefined),
      ),
    );
  } catch {
    // ignore cleanup failures in optional collections
  }
}

async function deleteCourseScopedData(courseId: string): Promise<void> {
  const courseScopedCollections = [
    "assessments",
    "evaluaciones",
    "gradeSheets",
    "submissions",
    "notas",
    "course_files",
    "periods",
    "weeks",
    "semanas",
    "unidades",
    "diapositivas",
    "exerciseQuestions",
    "exerciseThemeLinks",
    "quizAttempts",
    "assessmentForumComments",
    "slides",
    "units",
    "courseBackups",
  ];

  await Promise.all(courseScopedCollections.map((name) => deleteByField(name, "courseId", courseId)));
}

function getInstitutionOwnerId(courseData: Record<string, unknown>): string {
  return toText(courseData.createdByInstitutionId) || toText(courseData.institutionId);
}

function isInstitutionOwnedCourse(courseData: Record<string, unknown>): boolean {
  return Boolean(getInstitutionOwnerId(courseData));
}

async function deleteTeacherOwnedCourses(collectionName: string, teacherId: string): Promise<void> {
  try {
    const q = query(collection(firebaseDB, collectionName), where("teacherId", "==", teacherId));
    const snap = await getDocs(q);

    for (const courseDoc of snap.docs) {
      const courseData = (courseDoc.data() || {}) as Record<string, unknown>;
      if (isInstitutionOwnedCourse(courseData)) {
        continue;
      }
      await deleteCourseScopedData(courseDoc.id);
      await deleteDoc(courseDoc.ref).catch(() => undefined);
    }
  } catch {
    // ignore cleanup failures in optional collections
  }
}

async function deleteInstitutionOwnedCourses(
  collectionName: string,
  institutionId: string,
): Promise<void> {
  if (!institutionId) return;

  try {
    const [byInstitutionSnap, byCreatorSnap] = await Promise.all([
      getDocs(query(collection(firebaseDB, collectionName), where("institutionId", "==", institutionId))),
      getDocs(
        query(collection(firebaseDB, collectionName), where("createdByInstitutionId", "==", institutionId)),
      ),
    ]);

    const dedupedCourses = new Map<string, any>();
    [...byInstitutionSnap.docs, ...byCreatorSnap.docs].forEach((courseDoc) => {
      dedupedCourses.set(courseDoc.id, courseDoc);
    });

    for (const courseDoc of dedupedCourses.values()) {
      await deleteCourseScopedData(courseDoc.id);
      await deleteDoc(courseDoc.ref).catch(() => undefined);
    }
  } catch {
    // ignore cleanup failures in optional collections
  }
}

async function deleteUserNotifications(userId: string): Promise<void> {
  try {
    const notificationsRef = collection(firebaseDB, "usuarios", userId, "notifications");
    const snap = await getDocs(notificationsRef);
    await deleteDocsInChunks(snap.docs);
  } catch {
    // ignore
  }
}

async function purgeUserData(userId: string, email: string): Promise<void> {
  const normalizedEmail = (email || "").trim().toLowerCase();

  await deleteUserNotifications(userId);
  await Promise.all([
    deleteDoc(doc(firebaseDB, "usuarios", userId)).catch(() => undefined),
    deleteDoc(doc(firebaseDB, "estudiantes", userId)).catch(() => undefined),
    deleteDoc(doc(firebaseDB, "instituciones", userId)).catch(() => undefined),
  ]);

  if (normalizedEmail) {
    await Promise.all([
      deleteByField("usuarios", "email", normalizedEmail),
      deleteByField("estudiantes", "email", normalizedEmail),
    ]);
  }

  await Promise.all([
    removeFromCourseEnrollment("cursos", userId),
    removeFromCourseEnrollment("courses", userId),
  ]);

  await Promise.all([
    deleteTeacherOwnedCourses("cursos", userId),
    deleteTeacherOwnedCourses("courses", userId),
    deleteInstitutionOwnedCourses("cursos", userId),
    deleteInstitutionOwnedCourses("courses", userId),
  ]);

  const userScopedCleanup = [
    ["assessments", "createdBy"],
    ["evaluaciones", "createdBy"],
    ["gradeSheets", "teacherId"],
    ["gradeSheets", "createdBy"],
    ["submissions", "studentId"],
    ["submissions", "gradedBy"],
    ["notas", "studentId"],
    ["notas", "gradedBy"],
    ["quizAttempts", "studentId"],
    ["assessmentForumComments", "authorId"],
    ["assessmentForumComments", "userId"],
    ["exerciseQuestions", "createdBy"],
    ["exerciseQuestions", "teacherId"],
    ["exerciseThemeLinks", "createdBy"],
    ["courseBackups", "teacherId"],
  ] as const;

  await Promise.all(
    userScopedCleanup.map(([collectionName, field]) =>
      deleteByField(collectionName, field, userId),
    ),
  );
}

export async function purgeUserDataInSparkMode(
  userId: string,
  email: string,
): Promise<void> {
  const normalizedUserId = String(userId || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedUserId) {
    throw new Error("User id is required.");
  }

  await purgeUserData(normalizedUserId, normalizedEmail);
}

export async function requestAccountDeletion(
  input: RequestAccountDeletionInput,
): Promise<AccountDeletionRequestRecord> {
  const now = Date.now();
  const scheduledDeletionAt = new Date(now + THIRTY_DAYS_MS);
  const existing = await getAccountDeletionRequest(input.userId);
  if (existing?.status === "pending") return existing;

  const payload = {
    userId: input.userId,
    email: (input.email || "").trim().toLowerCase(),
    name: input.name || "User",
    role: input.role,
    status: "pending" as AccountDeletionStatus,
    requestedAt: new Date(),
    scheduledDeletionAt,
    completedAt: null,
    completedBy: null,
  };

  try {
    await setDoc(
      requestDocRef(input.userId),
      {
        userId: payload.userId,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        status: payload.status,
        requestedAt: serverTimestamp(),
        scheduledDeletionAt: Timestamp.fromDate(scheduledDeletionAt),
        completedAt: null,
        completedBy: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    // Firestore rules may block this collection in some deployments.
    await setLegacyRequest(input.userId, payload);
  }

  const created = await getAccountDeletionRequest(input.userId);
  if (created) return created;
  return {
    id: payload.userId,
    ...payload,
  };
}

export async function getAccountDeletionRequest(
  userId?: string,
): Promise<AccountDeletionRequestRecord | null> {
  if (!userId) return null;
  const primary = await getPrimaryRequest(userId);
  if (primary) return primary;
  return await getLegacyRequest(userId);
}

export async function cancelAccountDeletionRequest(
  userId?: string,
): Promise<AccountDeletionRequestRecord | null> {
  if (!userId) return null;
  const request = await getAccountDeletionRequest(userId);
  if (!request) return null;
  if (request.status !== "pending") return request;

  let updatedInPrimary = false;
  try {
    await updateDoc(requestDocRef(userId), {
      status: "cancelled",
      completedAt: serverTimestamp(),
      completedBy: "user_cancelled",
      updatedAt: serverTimestamp(),
    });
    updatedInPrimary = true;
  } catch {
    updatedInPrimary = false;
  }

  if (!updatedInPrimary) {
    try {
      await setLegacyRequest(userId, {
        ...request,
        status: "cancelled",
        completedAt: new Date(),
        completedBy: "user_cancelled",
      });
    } catch {
      return request;
    }
  }

  const updated = await getAccountDeletionRequest(userId);
  return (
    updated || {
      ...request,
      status: "cancelled",
      completedAt: new Date(),
      completedBy: "user_cancelled",
    }
  );
}

export async function getPendingAccountDeletionRequests(): Promise<AccountDeletionRequestRecord[]> {
  let primary: AccountDeletionRequestRecord[] = [];
  try {
    const q = query(
      collection(firebaseDB, ACCOUNT_DELETION_REQUESTS_COLLECTION),
      where("status", "==", "pending"),
    );
    const snap = await getDocs(q);
    primary = snap.docs.map(mapRequestDoc);
  } catch {
    primary = [];
  }

  let legacy: AccountDeletionRequestRecord[] = [];
  try {
    const q = query(
      collection(firebaseDB, LEGACY_REQUEST_COLLECTION),
      where(`${LEGACY_REQUEST_FIELD}.status`, "==", "pending"),
    );
    const snap = await getDocs(q);
    legacy = snap.docs
      .map((docSnap) =>
        mapLegacyRequest((docSnap.data() || {}) as Record<string, unknown>, docSnap.id),
      )
      .filter((entry): entry is AccountDeletionRequestRecord => Boolean(entry));
  } catch {
    legacy = [];
  }

  const merged = new Map<string, AccountDeletionRequestRecord>();
  [...legacy, ...primary].forEach((entry) => {
    if (!merged.has(entry.userId) || primary.find((p) => p.userId === entry.userId)) {
      merged.set(entry.userId, entry);
    }
  });

  return Array.from(merged.values())
    .sort((a, b) => {
      const left = a.scheduledDeletionAt?.getTime() || Number.MAX_SAFE_INTEGER;
      const right = b.scheduledDeletionAt?.getTime() || Number.MAX_SAFE_INTEGER;
      return left - right;
    });
}

export async function processAccountDeletionRequest(
  userId: string,
  adminEmail: string,
): Promise<AccountDeletionRequestRecord | null> {
  const request = await getAccountDeletionRequest(userId);
  if (!request) return null;
  if (request.status === "completed") return request;
  const normalizedAdmin = (adminEmail || "admin").trim().toLowerCase() || "admin";

  try {
    // Preferred path: Cloud Function removes Firestore + Firebase Auth.
    await deleteUserByAdmin(request.userId, { allowTeacherDeletion: true });
    await purgeUserData(request.userId, request.email);
  } catch (error) {
    // Spark fallback: if callable backend is unavailable, purge Firestore data now
    // and mark account as deleted so login flow blocks stale auth sessions.
    if (!isFunctionsFallbackError(error)) {
      throw error;
    }
    await purgeUserData(request.userId, request.email);
  }

  const completedAt = new Date();

  await Promise.all([
    setDoc(
      requestDocRef(request.userId),
      {
        status: "completed",
        completedAt: serverTimestamp(),
        completedBy: normalizedAdmin,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ).catch(() => undefined),
    setDoc(
      doc(firebaseDB, DELETED_ACCOUNTS_COLLECTION, request.userId),
      {
        userId: request.userId,
        email: (request.email || "").trim().toLowerCase(),
        completedBy: normalizedAdmin,
        completedAt: serverTimestamp(),
        source: "admin_process",
      },
      { merge: true },
    ).catch(() => undefined),
  ]);

  return {
    ...request,
    status: "completed",
    completedAt,
    completedBy: normalizedAdmin,
  };
}

export async function processDueAccountDeletionRequests(
  adminEmail: string,
): Promise<{ processed: number; totalPending: number }> {
  const pending = await getPendingAccountDeletionRequests();
  const now = Date.now();
  const due = pending.filter(
    (entry) => entry.scheduledDeletionAt && entry.scheduledDeletionAt.getTime() <= now,
  );

  for (const request of due) {
    await processAccountDeletionRequest(request.userId, adminEmail);
  }

  return {
    processed: due.length,
    totalPending: pending.length,
  };
}

export async function isAccountMarkedDeleted(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const snap = await getDoc(doc(firebaseDB, DELETED_ACCOUNTS_COLLECTION, userId));
    if (snap.exists()) return true;
  } catch {
    // ignore and fallback
  }

  const primary = await getPrimaryRequest(userId);
  if (primary?.status === "completed") return true;

  const legacy = await getLegacyRequest(userId);
  if (legacy?.status === "completed") return true;

  return false;
}
