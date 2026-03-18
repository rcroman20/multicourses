import {
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
import type { User } from "@/contexts/AuthContext";
import { syncPublicInstitutionDirectoryRecord } from "@/lib/services/institutionProfileService";

export type InstitutionMemberRole = "docente" | "estudiante";

export interface InstitutionProfile {
  id: string;
  name: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  ownerAvatarUrl: string;
  ownerAvatarEmoji: string;
  planStatus: "active" | "inactive" | "pending_payment";
  planName: string;
  courseLimit: number | null;
  studentLimit: number | null;
  teacherLimit: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstitutionDashboardData {
  institution: InstitutionProfile;
  teachers: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
    avatarEmoji: string;
    institutionManaged: boolean;
    activeCoursesCount: number;
    approvalStatus: "approved" | "pending";
  }>;
  pendingTeacherRequests: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
    avatarEmoji: string;
    idNumber: string;
    whatsApp: string;
    requestedAt: Date | null;
  }>;
  students: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
    avatarEmoji: string;
    enrolledCoursesCount: number;
  }>;
  courses: Array<{
    id: string;
    name: string;
    code: string;
    semester: string;
    group: string;
    teacherId: string;
    teacherName: string;
    enrolledStudentsCount: number;
    createdAt: Date;
  }>;
}

type InstitutionCourseInput = {
  institutionId: string;
  institutionName: string;
  actorUserId: string;
  actorName: string;
  name: string;
  code: string;
  semester: string;
  group: string;
  credits: number;
  description: string;
  teacherId?: string;
  classSchedule?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    location?: string;
  }>;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const getAvatarUrlFromRecord = (data: Record<string, unknown>): string =>
  String(data.avatarUrl || data.photoURL || data.photoUrl || "").trim();
const getErrorCode = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? String((error as { code: string }).code).trim().toLowerCase()
    : "";

const toRole = (value: unknown): string => toText(value).toLowerCase();
const normalizeInstitutionKey = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const hasInstitutionPrivileges = (primary: Record<string, unknown>, secondary: Record<string, unknown>) => {
  const role = toRole(primary.role) || toRole(secondary.role);
  const requestedRole = toRole(primary.requestedRole) || toRole(secondary.requestedRole);
  const institutionRole = toRole(primary.institutionRole) || toRole(secondary.institutionRole);

  return (
    role === "institucion" ||
    requestedRole === "institucion" ||
    institutionRole === "owner" ||
    institutionRole === "coordinator"
  );
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    try {
      return (value as { toDate: () => Date }).toDate();
    } catch {
      return new Date();
    }
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toPositiveNumberOrNull = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

async function getUserDocsByEmail(email: string) {
  const normalizedEmail = toText(email).toLowerCase();
  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  const [usersSnap, studentsSnap] = await Promise.all([
    getDocs(query(collection(firebaseDB, "usuarios"), where("email", "==", normalizedEmail), limit(1))),
    getDocs(query(collection(firebaseDB, "estudiantes"), where("email", "==", normalizedEmail), limit(1))),
  ]);

  const userDoc = usersSnap.docs[0] || null;
  const studentDoc = studentsSnap.docs[0] || null;

  if (!userDoc && !studentDoc) {
    throw new Error("No existing user found with that email.");
  }

  const targetId = userDoc?.id || studentDoc?.id || "";
  if (!targetId) {
    throw new Error("Could not resolve the target user.");
  }

  return {
    id: targetId,
    email: normalizedEmail,
    userDoc,
    studentDoc,
    name:
      toText(userDoc?.data()?.name) ||
      toText(studentDoc?.data()?.name) ||
      normalizedEmail.split("@")[0] ||
      "User",
  };
}

async function getTeacherSummary(teacherId: string): Promise<{ id: string; name: string; email: string } | null> {
  if (!teacherId) return null;
  const [userSnap, studentSnap] = await Promise.all([
    getDoc(doc(firebaseDB, "usuarios", teacherId)),
    getDoc(doc(firebaseDB, "estudiantes", teacherId)),
  ]);
  if (!userSnap.exists() && !studentSnap.exists()) return null;

  const userData = userSnap.exists() ? userSnap.data() : {};
  const studentData = studentSnap.exists() ? studentSnap.data() : {};
  return {
    id: teacherId,
    name: toText(userData.name) || toText(studentData.name) || "Teacher",
    email: toText(userData.email) || toText(studentData.email),
  };
}

async function assertInstitutionTeacher(
  teacherId: string,
  institutionId: string,
): Promise<{ id: string; name: string; email: string } | null> {
  if (!teacherId) return null;
  const teacher = await getTeacherSummary(teacherId);
  if (!teacher) {
    throw new Error("Assigned teacher was not found.");
  }

  const [userSnap, studentSnap] = await Promise.all([
    getDoc(doc(firebaseDB, "usuarios", teacherId)),
    getDoc(doc(firebaseDB, "estudiantes", teacherId)),
  ]);
  const userData = userSnap.exists() ? userSnap.data() : {};
  const studentData = studentSnap.exists() ? studentSnap.data() : {};
  if (hasInstitutionPrivileges(userData, studentData)) {
    throw new Error("Institution accounts cannot be assigned as teachers.");
  }

  const role =
    toText(userData.role).toLowerCase() ||
    toText(studentData.role).toLowerCase() ||
    toText(userData.requestedRole).toLowerCase() ||
    toText(studentData.requestedRole).toLowerCase();
  const teacherInstitutionId =
    toText(userData.institutionId) || toText(studentData.institutionId);

  if (role !== "docente" && role !== "teacher") {
    throw new Error("Assigned user must be a teacher.");
  }

  if (teacherInstitutionId && teacherInstitutionId !== institutionId) {
    throw new Error("Assigned teacher belongs to another institution.");
  }

  return teacher;
}

async function getInstitutionProfileDoc(institutionId: string) {
  return getDoc(doc(firebaseDB, "instituciones", institutionId));
}

async function getUserAvatarIdentity(userId: string): Promise<{
  avatarUrl: string;
  avatarEmoji: string;
}> {
  if (!userId) {
    return {
      avatarUrl: "",
      avatarEmoji: "",
    };
  }

  const [userSnap, studentSnap] = await Promise.all([
    getDoc(doc(firebaseDB, "usuarios", userId)),
    getDoc(doc(firebaseDB, "estudiantes", userId)),
  ]);

  const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
  const studentData = studentSnap.exists() ? (studentSnap.data() as Record<string, unknown>) : {};

  return {
    avatarUrl: getAvatarUrlFromRecord(userData) || getAvatarUrlFromRecord(studentData),
    avatarEmoji: toText(userData.avatarEmoji) || toText(studentData.avatarEmoji),
  };
}

export async function findInstitutionByName(name: string): Promise<InstitutionProfile | null> {
  const normalizedTarget = normalizeInstitutionKey(name);
  if (!normalizedTarget) return null;

  const institutionsSnap = await getDocs(collection(firebaseDB, "instituciones"));
  const match = institutionsSnap.docs.find((docSnap) => {
    const data = docSnap.data() || {};
    return normalizeInstitutionKey(toText(data.name)) === normalizedTarget;
  });

  if (!match) return null;

  const data = match.data() || {};
  return {
    id: match.id,
    name: toText(data.name) || toText(name) || "Institution",
    ownerUserId: toText(data.ownerUserId),
    ownerName: toText(data.ownerName) || "Institution",
    ownerEmail: toText(data.ownerEmail),
    ownerAvatarUrl: "",
    ownerAvatarEmoji: "",
    planStatus:
      toText(data.planStatus) === "inactive" || toText(data.planStatus) === "pending_payment"
        ? (toText(data.planStatus) as "inactive" | "pending_payment")
        : "active",
    planName: toText(data.planName) || "Institution Plan",
    courseLimit: toPositiveNumberOrNull(data.courseLimit),
    studentLimit: toPositiveNumberOrNull(data.studentLimit),
    teacherLimit: toPositiveNumberOrNull(data.teacherLimit),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function ensureInstitutionProfile(user: User): Promise<InstitutionProfile> {
  if (user.role !== "institucion") {
    throw new Error("Only institution users can bootstrap an institution profile.");
  }

  const institutionId = toText(user.institutionId) || user.id;
  const institutionName = toText(user.institutionName) || toText(user.name) || "Institution";
  const institutionRef = doc(firebaseDB, "instituciones", institutionId);
  const snap = await getDoc(institutionRef);

  if (!snap.exists()) {
    await setDoc(
      institutionRef,
      {
        name: institutionName,
        ownerUserId: user.id,
        ownerName: user.name || "Institution",
        ownerEmail: user.email || "",
        planStatus: user.institutionPlanStatus || "active",
        planName: user.institutionPlanName || "Institution Plan",
        courseLimit: user.institutionCourseLimit ?? null,
        studentLimit: user.institutionStudentLimit ?? null,
        teacherLimit: user.institutionTeacherLimit ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await Promise.all([
    setDoc(
      doc(firebaseDB, "usuarios", user.id),
      {
        role: "institucion",
        institutionId,
        institutionName,
        institutionRole: user.institutionRole || "owner",
        institutionPlanStatus: user.institutionPlanStatus || "active",
        institutionPlanName: user.institutionPlanName || "Institution Plan",
        institutionCourseLimit: user.institutionCourseLimit ?? null,
        institutionStudentLimit: user.institutionStudentLimit ?? null,
        institutionTeacherLimit: user.institutionTeacherLimit ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
    setDoc(
      doc(firebaseDB, "estudiantes", user.id),
      {
        role: "institucion",
        institutionId,
        institutionName,
        institutionRole: user.institutionRole || "owner",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  const current = await getInstitutionProfileDoc(institutionId);
  const data = current.data() || {};
  await syncPublicInstitutionDirectoryRecord({
    id: institutionId,
    name: toText(data.name) || institutionName,
    planStatus:
      toText(data.planStatus) === "inactive" || toText(data.planStatus) === "pending_payment"
        ? (toText(data.planStatus) as "inactive" | "pending_payment")
        : "active",
  }).catch(() => undefined);
  return {
    id: institutionId,
    name: toText(data.name) || institutionName,
    ownerUserId: toText(data.ownerUserId) || user.id,
    ownerName: toText(data.ownerName) || user.name || "Institution",
    ownerEmail: toText(data.ownerEmail) || user.email || "",
    ownerAvatarUrl: "",
    ownerAvatarEmoji: "",
    planStatus:
      toText(data.planStatus) === "inactive" || toText(data.planStatus) === "pending_payment"
        ? (toText(data.planStatus) as "inactive" | "pending_payment")
        : "active",
    planName: toText(data.planName) || "Institution Plan",
    courseLimit: toPositiveNumberOrNull(data.courseLimit),
    studentLimit: toPositiveNumberOrNull(data.studentLimit),
    teacherLimit: toPositiveNumberOrNull(data.teacherLimit),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function getInstitutionDashboardData(user: User): Promise<InstitutionDashboardData> {
  if (user.role !== "institucion") {
    throw new Error("Only institution users can access the institution workspace.");
  }

  const fallbackInstitutionId = toText(user.institutionId) || user.id;
  const fallbackInstitutionName =
    toText(user.institutionName) || toText(user.name) || "Institution";
  const institutionSnap = await getInstitutionProfileDoc(fallbackInstitutionId);
  const institutionBase = institutionSnap.exists()
    ? (() => {
        const data = institutionSnap.data() || {};
        return {
          id: fallbackInstitutionId,
          name: toText(data.name) || fallbackInstitutionName,
          ownerUserId: toText(data.ownerUserId) || user.id,
          ownerName: toText(data.ownerName) || user.name || "Institution",
          ownerEmail: toText(data.ownerEmail) || user.email || "",
          ownerAvatarUrl: "",
          ownerAvatarEmoji: "",
          planStatus:
            toText(data.planStatus) === "inactive" || toText(data.planStatus) === "pending_payment"
              ? (toText(data.planStatus) as "inactive" | "pending_payment")
              : "active",
          planName: toText(data.planName) || user.institutionPlanName || "Institution Plan",
          courseLimit: toPositiveNumberOrNull(data.courseLimit),
          studentLimit: toPositiveNumberOrNull(data.studentLimit),
          teacherLimit: toPositiveNumberOrNull(data.teacherLimit),
          createdAt: toDate(data.createdAt),
          updatedAt: toDate(data.updatedAt),
        } satisfies InstitutionProfile;
      })()
    : await ensureInstitutionProfile(user);
  const ownerAvatarIdentity = await getUserAvatarIdentity(institutionBase.ownerUserId || user.id);
  const institution: InstitutionProfile = {
    ...institutionBase,
    ownerAvatarUrl: ownerAvatarIdentity.avatarUrl,
    ownerAvatarEmoji: ownerAvatarIdentity.avatarEmoji,
  };
  const institutionId = institution.id;
  await syncPublicInstitutionDirectoryRecord({
    id: institution.id,
    name: institution.name,
    planStatus: institution.planStatus,
  }).catch(() => undefined);

  const [usersSnap, studentsSnap, coursesSnap] = await Promise.all([
    getDocs(query(collection(firebaseDB, "usuarios"), where("institutionId", "==", institutionId))),
    getDocs(query(collection(firebaseDB, "estudiantes"), where("institutionId", "==", institutionId))),
    getDocs(query(collection(firebaseDB, "cursos"), where("institutionId", "==", institutionId))),
  ]);

  const teacherCounts = new Map<string, number>();
  const studentCourseIds = new Map<string, Set<string>>();
  const courses = coursesSnap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const teacherId = toText(data.teacherId);
      if (teacherId) {
        teacherCounts.set(teacherId, (teacherCounts.get(teacherId) || 0) + 1);
      }
      const enrolledStudents = Array.isArray(data.enrolledStudents) ? data.enrolledStudents : [];
      enrolledStudents.forEach((studentId) => {
        const normalizedId = toText(studentId);
        if (!normalizedId) return;
        const collector = studentCourseIds.get(normalizedId) || new Set<string>();
        collector.add(docSnap.id);
        studentCourseIds.set(normalizedId, collector);
      });
      return {
        id: docSnap.id,
        name: toText(data.name),
        code: toText(data.code),
        semester: toText(data.semester),
        group: toText(data.group),
        teacherId,
        teacherName: toText(data.teacherName),
        enrolledStudentsCount: enrolledStudents.filter((value) => toText(value)).length,
        createdAt: toDate(data.createdAt),
      };
    })
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  const mergedUsers = new Map<
    string,
    {
      id: string;
      name: string;
      email: string;
      idNumber: string;
      whatsApp: string;
      avatarUrl: string;
      avatarEmoji: string;
      role: string;
      requestedRole: string;
      teacherApprovalStatus: string;
      requestedAt: Date | null;
      institutionManaged: boolean;
      institutionAccount: boolean;
    }
  >();

  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    mergedUsers.set(docSnap.id, {
      id: docSnap.id,
      name: toText(data.name) || "User",
      email: toText(data.email),
      idNumber: toText(data.idNumber),
      whatsApp: toText(data.whatsApp) || toText(data.whatsapp),
      avatarUrl: getAvatarUrlFromRecord(data),
      avatarEmoji: toText(data.avatarEmoji),
      role: toText(data.role).toLowerCase(),
      requestedRole: toText(data.requestedRole).toLowerCase(),
      teacherApprovalStatus: toText(data.teacherApprovalStatus).toLowerCase(),
      requestedAt: toDate(data.teacherRequestedAt) || toDate(data.createdAt),
      institutionManaged: Boolean(data.institutionManaged),
      institutionAccount: hasInstitutionPrivileges(data, {}),
    });
  });

  studentsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const existing = mergedUsers.get(docSnap.id);
    if (existing) {
      mergedUsers.set(docSnap.id, {
        ...existing,
        name: existing.name || toText(data.name) || "User",
        email: existing.email || toText(data.email),
        idNumber: existing.idNumber || toText(data.idNumber),
        whatsApp: existing.whatsApp || toText(data.whatsApp) || toText(data.whatsapp),
        avatarUrl: existing.avatarUrl || getAvatarUrlFromRecord(data),
        avatarEmoji: existing.avatarEmoji || toText(data.avatarEmoji),
        role: existing.role || toText(data.role).toLowerCase(),
        requestedRole: existing.requestedRole || toText(data.requestedRole).toLowerCase(),
        teacherApprovalStatus:
          existing.teacherApprovalStatus || toText(data.teacherApprovalStatus).toLowerCase(),
        requestedAt: existing.requestedAt || toDate(data.teacherRequestedAt) || toDate(data.createdAt),
        institutionManaged: existing.institutionManaged || Boolean(data.institutionManaged),
        institutionAccount: existing.institutionAccount || hasInstitutionPrivileges({}, data),
      });
      return;
    }

    mergedUsers.set(docSnap.id, {
      id: docSnap.id,
      name: toText(data.name) || "User",
      email: toText(data.email),
      idNumber: toText(data.idNumber),
      whatsApp: toText(data.whatsApp) || toText(data.whatsapp),
      avatarUrl: getAvatarUrlFromRecord(data),
      avatarEmoji: toText(data.avatarEmoji),
      role: toText(data.role).toLowerCase(),
      requestedRole: toText(data.requestedRole).toLowerCase(),
      teacherApprovalStatus: toText(data.teacherApprovalStatus).toLowerCase(),
      requestedAt: toDate(data.teacherRequestedAt) || toDate(data.createdAt),
      institutionManaged: Boolean(data.institutionManaged),
      institutionAccount: hasInstitutionPrivileges({}, data),
    });
  });

  const teachers = Array.from(mergedUsers.values())
    .filter((entry) => !entry.institutionAccount)
    .filter(
      (entry) =>
        entry.role === "docente" ||
        entry.role === "teacher" ||
        ((entry.requestedRole === "docente" || entry.requestedRole === "teacher") &&
          entry.teacherApprovalStatus === "pending"),
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      avatarUrl: entry.avatarUrl,
      avatarEmoji: entry.avatarEmoji,
      institutionManaged: entry.institutionManaged,
      activeCoursesCount: teacherCounts.get(entry.id) || 0,
      approvalStatus: entry.teacherApprovalStatus === "pending" ? "pending" : "approved",
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const students = Array.from(mergedUsers.values())
    .filter((entry) => !entry.institutionAccount)
    .filter((entry) => entry.role === "estudiante" || entry.role === "student")
    .filter(
      (entry) =>
        !(
          (entry.requestedRole === "docente" || entry.requestedRole === "teacher") &&
          entry.teacherApprovalStatus === "pending"
        ),
    )
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      avatarUrl: entry.avatarUrl,
      avatarEmoji: entry.avatarEmoji,
      enrolledCoursesCount: studentCourseIds.get(entry.id)?.size || 0,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const pendingTeacherRequests = Array.from(mergedUsers.values())
    .filter((entry) => !entry.institutionAccount)
    .filter((entry) => entry.requestedRole === "docente" || entry.requestedRole === "teacher")
    .filter((entry) => entry.teacherApprovalStatus === "pending")
    .filter((entry) => entry.role !== "docente" && entry.role !== "teacher")
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      avatarUrl: entry.avatarUrl,
      avatarEmoji: entry.avatarEmoji,
      idNumber: entry.idNumber,
      whatsApp: entry.whatsApp,
      requestedAt: entry.requestedAt,
    }))
    .sort((left, right) => {
      const leftTime = left.requestedAt?.getTime() || 0;
      const rightTime = right.requestedAt?.getTime() || 0;
      return rightTime - leftTime;
    });

  return {
    institution,
    teachers,
    pendingTeacherRequests,
    students,
    courses,
  };
}

export async function linkUserToInstitutionByEmail(input: {
  institutionId: string;
  institutionName: string;
  email: string;
  desiredRole: InstitutionMemberRole;
}): Promise<void> {
  const target = await getUserDocsByEmail(input.email);
  const userData = target.userDoc?.data() || {};
  const studentData = target.studentDoc?.data() || {};

  if (hasInstitutionPrivileges(userData, studentData)) {
    throw new Error("Institution accounts cannot be linked as teachers or students.");
  }

  const institutionSnap = await getInstitutionProfileDoc(input.institutionId);
  if (institutionSnap.exists()) {
    const institutionData = institutionSnap.data() || {};
    if (toText(institutionData.ownerUserId) === target.id) {
      throw new Error("The institution owner cannot be linked as a teacher or student.");
    }
  }

  const userPayload: Record<string, unknown> = {
    id: target.id,
    email: target.email,
    name: target.name,
    role: input.desiredRole,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    institution: input.institutionName,
    updatedAt: serverTimestamp(),
  };
  const studentPayload: Record<string, unknown> = {
    id: target.id,
    email: target.email,
    name: target.name,
    role: input.desiredRole,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    institution: input.institutionName,
    updatedAt: serverTimestamp(),
  };

  if (input.desiredRole === "docente") {
    userPayload.requestedRole = "docente";
    userPayload.teacherApprovalStatus = "approved";
    userPayload.teacherInstitutionName = input.institutionName;
    userPayload.institutionManaged = true;

    studentPayload.requestedRole = "docente";
    studentPayload.teacherApprovalStatus = "approved";
    studentPayload.teacherInstitutionName = input.institutionName;
    studentPayload.institutionManaged = true;
  }

  await Promise.all([
    setDoc(doc(firebaseDB, "usuarios", target.id), userPayload, { merge: true }),
    setDoc(doc(firebaseDB, "estudiantes", target.id), studentPayload, { merge: true }),
  ]);
}

export async function createInstitutionCourse(input: InstitutionCourseInput): Promise<string> {
  const name = toText(input.name);
  const code = toText(input.code).toUpperCase();
  const semester = toText(input.semester);
  const group = toText(input.group);
  const credits = Number(input.credits || 0);
  const description = toText(input.description);
  const classSchedule = Array.isArray(input.classSchedule)
    ? input.classSchedule
        .map((entry) => ({
          dayOfWeek: Number(entry?.dayOfWeek),
          startTime: toText(entry?.startTime),
          endTime: toText(entry?.endTime),
          location: toText(entry?.location),
        }))
        .filter(
          (entry) =>
            Number.isInteger(entry.dayOfWeek) &&
            entry.dayOfWeek >= 0 &&
            entry.dayOfWeek <= 6 &&
            entry.startTime.length > 0 &&
            entry.endTime.length > 0,
        )
    : [];

  if (!name || name.length < 3) throw new Error("Course name is required.");
  if (!code || code.length < 3) throw new Error("Course code is required.");
  if (!semester) throw new Error("Semester is required.");
  if (!group) throw new Error("Group is required.");
  if (!Number.isFinite(credits) || credits < 0) throw new Error("Credits cannot be negative.");

  const institutionSnap = await getInstitutionProfileDoc(input.institutionId);
  if (!institutionSnap.exists()) {
    throw new Error("Institution profile was not found.");
  }
  const institutionData = institutionSnap.data() || {};
  const courseLimit = toPositiveNumberOrNull(institutionData.courseLimit);
  const planStatus = toText(institutionData.planStatus) || "active";
  if (planStatus === "pending_payment" || planStatus === "inactive") {
    throw new Error("Institution plan is not active.");
  }

  const [existingCodeSnap, currentCoursesSnap] = await Promise.all([
    getDocs(query(collection(firebaseDB, "cursos"), where("code", "==", code), limit(1))),
    getDocs(query(collection(firebaseDB, "cursos"), where("institutionId", "==", input.institutionId))),
  ]);

  if (!existingCodeSnap.empty) {
    throw new Error(`Course code "${code}" already exists.`);
  }

  if (courseLimit && currentCoursesSnap.size >= courseLimit) {
    throw new Error(`Institution plan limit reached: ${courseLimit} courses.`);
  }

  const teacher = await assertInstitutionTeacher(toText(input.teacherId), input.institutionId);
  const courseRef = doc(collection(firebaseDB, "cursos"));
  await setDoc(courseRef, {
    name,
    code,
    semester,
    group,
    credits,
    description,
    institutionId: input.institutionId,
    institutionName: input.institutionName,
    createdByInstitutionId: input.institutionId,
    createdByInstitutionName: input.institutionName,
    createdBy: input.actorUserId,
    createdByName: input.actorName,
    status: "active",
    enrolledStudents: [],
    classSchedule,
    ...(teacher
      ? {
          teacherId: teacher.id,
          teacherName: teacher.name,
        }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return courseRef.id;
}

export async function approveInstitutionTeacherRequest(input: {
  institutionId: string;
  teacherId: string;
  approvedBy: string;
}): Promise<void> {
  const institutionSnap = await getInstitutionProfileDoc(input.institutionId);
  if (!institutionSnap.exists()) {
    throw new Error("Institution profile was not found.");
  }

  const institutionData = institutionSnap.data() || {};
  const institutionName = toText(institutionData.name) || "Institution";
  const planStatus = toText(institutionData.planStatus) || "active";
  if (planStatus === "pending_payment" || planStatus === "inactive") {
    throw new Error("Institution plan is not active.");
  }

  const [userSnap, studentSnap] = await Promise.all([
    getDoc(doc(firebaseDB, "usuarios", input.teacherId)),
    getDoc(doc(firebaseDB, "estudiantes", input.teacherId)),
  ]);
  if (!userSnap.exists() && !studentSnap.exists()) {
    throw new Error("Teacher request was not found.");
  }

  const userData = userSnap.exists() ? userSnap.data() : {};
  const studentData = studentSnap.exists() ? studentSnap.data() : {};
  if (hasInstitutionPrivileges(userData, studentData)) {
    throw new Error("Institution accounts cannot be approved as teachers.");
  }

  const targetInstitutionId = toText(userData.institutionId) || toText(studentData.institutionId);
  if (targetInstitutionId !== input.institutionId) {
    throw new Error("This teacher request belongs to another institution.");
  }

  const requestedRole =
    toText(userData.requestedRole).toLowerCase() || toText(studentData.requestedRole).toLowerCase();
  const approvalStatus =
    toText(userData.teacherApprovalStatus).toLowerCase() ||
    toText(studentData.teacherApprovalStatus).toLowerCase();
  const currentRole = toText(userData.role).toLowerCase() || toText(studentData.role).toLowerCase();

  if (requestedRole !== "docente" && requestedRole !== "teacher") {
    throw new Error("This account does not have a pending teacher request.");
  }

  if (approvalStatus !== "pending" && currentRole === "docente") {
    throw new Error("This teacher request is already approved.");
  }

  const approvalPayload = {
    role: "docente",
    requestedRole: "docente",
    teacherApprovalStatus: "approved",
    institutionId: input.institutionId,
    institutionName,
    institution: institutionName,
    teacherInstitutionName: institutionName,
    institutionManaged: true,
    updatedAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(firebaseDB, "usuarios", input.teacherId), approvalPayload, { merge: true }),
    setDoc(
      doc(firebaseDB, "estudiantes", input.teacherId),
      {
        ...approvalPayload,
        teacherApprovedBy: toText(input.approvedBy) || institutionName,
      },
      { merge: true },
    ),
  ]);
}

export async function assignInstitutionCourseTeacher(input: {
  institutionId: string;
  courseId: string;
  teacherId?: string;
}): Promise<void> {
  const courseRef = doc(firebaseDB, "cursos", input.courseId);
  const courseSnap = await getDoc(courseRef);
  if (!courseSnap.exists()) {
    throw new Error("Course not found.");
  }

  const courseData = courseSnap.data() || {};
  if (toText(courseData.institutionId) !== input.institutionId) {
    throw new Error("This course belongs to another institution.");
  }

  const teacher = await assertInstitutionTeacher(toText(input.teacherId), input.institutionId);
  const teacherId = teacher?.id || "";
  const teacherName = teacher?.name || "";

  await updateDoc(courseRef, {
    teacherId,
    teacherName,
    updatedAt: serverTimestamp(),
  });

  const scopedCollections = ["gradeSheets", "evaluaciones", "assessments"] as const;
  await Promise.all(
    scopedCollections.map(async (collectionName) => {
      try {
        const snap = await getDocs(
          query(collection(firebaseDB, collectionName), where("courseId", "==", input.courseId)),
        );
        await Promise.all(
          snap.docs.map((docSnap) =>
            updateDoc(doc(firebaseDB, collectionName, docSnap.id), {
              teacherId,
              teacherName,
              updatedAt: serverTimestamp(),
            }),
          ),
        );
      } catch (error) {
        if (getErrorCode(error).includes("permission-denied")) {
          console.warn(
            "[institutionService] Skipped teacher propagation due to permissions.",
            { collectionName, courseId: input.courseId },
          );
          return;
        }
        throw error;
      }
    }),
  );
}
