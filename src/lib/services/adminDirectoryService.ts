import { collection, getDocs } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { isAdminEmail } from "@/lib/services/adminAccessService";
import { isInstitutionMissing } from "@/lib/services/institutionProfileService";
import { getTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import {
  getTeacherPlanDefinition,
  resolveTeacherPlanId,
  type TeacherPlanId,
} from "@/lib/services/teacherPlanService";

export type AdminDirectoryRole = "docente" | "estudiante" | "admin" | "institucion";
export type AdminDirectoryApprovalStatus = "pending" | "approved" | "rejected" | null;

export interface AdminDirectoryUserRecord {
  userId: string;
  email: string;
  name: string;
  role: AdminDirectoryRole;
  requestedRole: AdminDirectoryRole | null;
  institutionWriteRole: AdminDirectoryRole;
  avatarUrl: string;
  avatarEmoji: string;
  phone: string;
  institutionName: string;
  institutionMissing: boolean;
  institutionOwnership: string;
  institutionType: string;
  teacherApprovalStatus: AdminDirectoryApprovalStatus;
  teacherPlanId: TeacherPlanId | null;
  teacherPlanLabel: string;
  teacherPlanStatus: string;
  teacherPlanAssignedAt: Date | null;
  teacherPlanExpiresAt: Date | null;
  paymentMethod: string;
  teacherRequestedAt: Date | null;
  teacherApprovedAt: Date | null;
  teacherRejectedAt: Date | null;
  paymentRequestedAt: Date | null;
  activeCoursesCount: number;
  enrolledCoursesCount: number;
}

export interface AdminDirectoryDataset {
  users: AdminDirectoryUserRecord[];
  warnings: string[];
}

const INSTITUTION_FIELDS = [
  "teacherInstitutionName",
  "institutionName",
  "institution",
  "schoolName",
  "organizationName",
  "organization",
  "companyName",
  "cohortInstitutionName",
  "cohortInstitution",
] as const;

type MutableDirectoryUser = {
  userId: string;
  sourceIds: Set<string>;
  email: string;
  name: string;
  role: AdminDirectoryRole | null;
  requestedRole: AdminDirectoryRole | null;
  avatarUrl: string;
  avatarEmoji: string;
  phone: string;
  institutionName: string;
  institutionOwnership: string;
  institutionType: string;
  teacherApprovalStatus: AdminDirectoryApprovalStatus;
  teacherPlanId: TeacherPlanId | null;
  teacherPlanStatus: string;
  teacherPlanAssignedAt: Date | null;
  teacherPlanExpiresAt: Date | null;
  paymentMethod: string;
  teacherRequestedAt: Date | null;
  teacherApprovedAt: Date | null;
  teacherRejectedAt: Date | null;
  paymentRequestedAt: Date | null;
  activeCoursesCount: number;
  enrolledCoursesCount: number;
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeEmail = (value: unknown): string => toText(value).toLowerCase();

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

const normalizeRole = (value: unknown): AdminDirectoryRole | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

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

  if (
    normalized === "admin" ||
    normalized === "administrador" ||
    normalized === "administrator"
  ) {
    return "admin";
  }

  if (
    normalized === "institucion" ||
    normalized === "institution" ||
    normalized === "organization" ||
    normalized === "organizacion"
  ) {
    return "institucion";
  }

  return null;
};

const normalizeInstitutionKey = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const getInstitutionLabel = (...sources: Array<Record<string, unknown> | null>): string => {
  for (const field of INSTITUTION_FIELDS) {
    for (const source of sources) {
      if (!source) continue;
      const label = toText(source[field]);
      if (!label || isInstitutionMissing(label)) continue;
      return label.replace(/\s+/g, " ").trim();
    }
  }
  return "";
};

const getRecordKey = (
  sourceId: string,
  email: string,
  byKey: Map<string, MutableDirectoryUser>,
  idToKey: Map<string, string>,
  emailToKey: Map<string, string>,
): string => {
  if (sourceId && idToKey.has(sourceId)) return String(idToKey.get(sourceId));
  if (byKey.has(sourceId)) return sourceId;
  if (email && emailToKey.has(email)) return String(emailToKey.get(email));
  return sourceId || email;
};

const getOrCreateUser = (
  sourceId: string,
  email: string,
  byKey: Map<string, MutableDirectoryUser>,
  idToKey: Map<string, string>,
  emailToKey: Map<string, string>,
): MutableDirectoryUser => {
  const key = getRecordKey(sourceId, email, byKey, idToKey, emailToKey);
  const existing = byKey.get(key);
  if (existing) {
    if (sourceId) {
      existing.sourceIds.add(sourceId);
      idToKey.set(sourceId, key);
    }
    return existing;
  }

  const created: MutableDirectoryUser = {
    userId: sourceId || key,
    sourceIds: new Set(sourceId ? [sourceId] : []),
    email,
    name: "",
    role: null,
    requestedRole: null,
    avatarUrl: "",
    avatarEmoji: "",
    phone: "",
    institutionName: "",
    institutionOwnership: "",
    institutionType: "",
    teacherApprovalStatus: null,
    teacherPlanId: null,
    teacherPlanStatus: "",
    teacherPlanAssignedAt: null,
    teacherPlanExpiresAt: null,
    paymentMethod: "",
    teacherRequestedAt: null,
    teacherApprovedAt: null,
    teacherRejectedAt: null,
    paymentRequestedAt: null,
    activeCoursesCount: 0,
    enrolledCoursesCount: 0,
  };

  byKey.set(key, created);
  if (sourceId) idToKey.set(sourceId, key);
  if (email) emailToKey.set(email, key);
  return created;
};

const mergeProfileIntoUser = (
  target: MutableDirectoryUser,
  data: Record<string, unknown>,
  fallbackId: string,
): void => {
  const normalizedEmail = normalizeEmail(data.email) || target.email;
  const role =
    normalizeRole(data.role) ||
    normalizeRole(data.userRole) ||
    normalizeRole(data.requestedRole);
  const requestedRole = normalizeRole(data.requestedRole);
  const institutionName = getInstitutionLabel(data);
  const institutionOwnership =
    toText(data.teacherInstitutionOwnership) || toText(data.institutionOwnership);
  const institutionType =
    toText(data.teacherInstitutionType) || toText(data.institutionType);

  target.userId = target.userId || fallbackId;
  target.email = target.email || normalizedEmail;
  target.name = target.name || toText(data.name) || "User";
  target.role = target.role || role;
  target.requestedRole = target.requestedRole || requestedRole;
  target.avatarUrl =
    target.avatarUrl ||
    toText(data.avatarUrl) ||
    toText(data.photoURL) ||
    toText(data.photoUrl);
  target.avatarEmoji = target.avatarEmoji || toText(data.avatarEmoji);
  target.phone =
    target.phone ||
    toText(data.phone) ||
    toText(data.whatsApp) ||
    toText(data.whatsapp);
  target.institutionName = target.institutionName || institutionName;
  target.institutionOwnership = target.institutionOwnership || institutionOwnership;
  target.institutionType = target.institutionType || institutionType;
  target.teacherApprovalStatus =
    target.teacherApprovalStatus ||
    ((): AdminDirectoryApprovalStatus => {
      const status = toText(data.teacherApprovalStatus).toLowerCase();
      if (status === "pending" || status === "approved" || status === "rejected") {
        return status;
      }
      return null;
    })();
  target.teacherPlanId =
    target.teacherPlanId ||
    resolveTeacherPlanId(toText(data.teacherPlanId) || toText(data.teacherInterestedPlan));
  target.teacherPlanStatus = target.teacherPlanStatus || toText(data.teacherPlanStatus);
  target.teacherPlanAssignedAt =
    target.teacherPlanAssignedAt || toDate(data.teacherPlanAssignedAt);
  target.teacherPlanExpiresAt =
    target.teacherPlanExpiresAt || toDate(data.teacherPlanExpiresAt);
  target.paymentMethod = target.paymentMethod || toText(data.teacherPaymentMethod);
  target.teacherRequestedAt = target.teacherRequestedAt || toDate(data.teacherRequestedAt);
  target.teacherApprovedAt = target.teacherApprovedAt || toDate(data.teacherApprovedAt);
  target.teacherRejectedAt = target.teacherRejectedAt || toDate(data.teacherRejectedAt);
  target.paymentRequestedAt =
    target.paymentRequestedAt || toDate(data.teacherPaymentRequestedAt);
};

const normalizeEnrollmentEntry = (entry: unknown): string => {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const maybeId =
      (entry as { id?: unknown }).id ||
      (entry as { studentId?: unknown }).studentId ||
      (entry as { userId?: unknown }).userId;
    return typeof maybeId === "string" ? maybeId : "";
  }
  return "";
};

export async function getAdminDirectoryDataset(): Promise<AdminDirectoryDataset> {
  const warnings: string[] = [];
  const [usersResult, studentsResult, coursesResult, legacyCoursesResult, approvalsResult] = await Promise.allSettled([
    getDocs(collection(firebaseDB, "usuarios")),
    getDocs(collection(firebaseDB, "estudiantes")),
    getDocs(collection(firebaseDB, "courses")),
    getDocs(collection(firebaseDB, "cursos")),
    getTeacherApprovalRequests(),
  ]);

  const byKey = new Map<string, MutableDirectoryUser>();
  const idToKey = new Map<string, string>();
  const emailToKey = new Map<string, string>();

  if (usersResult.status === "fulfilled") {
    usersResult.value.docs.forEach((docSnap) => {
      const data = (docSnap.data() || {}) as Record<string, unknown>;
      const email = normalizeEmail(data.email);
      const user = getOrCreateUser(docSnap.id, email, byKey, idToKey, emailToKey);
      mergeProfileIntoUser(user, data, docSnap.id);
    });
  } else {
    warnings.push("Could not load `usuarios` records.");
  }

  if (studentsResult.status === "fulfilled") {
    studentsResult.value.docs.forEach((docSnap) => {
      const data = (docSnap.data() || {}) as Record<string, unknown>;
      const email = normalizeEmail(data.email);
      const user = getOrCreateUser(docSnap.id, email, byKey, idToKey, emailToKey);
      mergeProfileIntoUser(user, data, docSnap.id);
    });
  } else {
    warnings.push("Could not load `estudiantes` records.");
  }

  const registerCourseMembership = (docs: Array<{ id: string; data: () => Record<string, unknown> }>) => {
    docs.forEach((docSnap) => {
      const data = (docSnap.data() || {}) as Record<string, unknown>;
      const teacherId = toText(data.teacherId);
      if (teacherId) {
        const teacherKey = idToKey.get(teacherId) || teacherId;
        const teacher = byKey.get(teacherKey);
        if (teacher) teacher.activeCoursesCount += 1;
      }

      const enrolledStudents = Array.isArray(data.enrolledStudents) ? data.enrolledStudents : [];
      enrolledStudents.forEach((entry) => {
        const studentId = normalizeEnrollmentEntry(entry);
        if (!studentId) return;
        const studentKey = idToKey.get(studentId) || studentId;
        const student = byKey.get(studentKey);
        if (student) student.enrolledCoursesCount += 1;
      });
    });
  };

  if (coursesResult.status === "fulfilled") {
    registerCourseMembership(
      coursesResult.value.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
    );
  }

  if (legacyCoursesResult.status === "fulfilled") {
    registerCourseMembership(
      legacyCoursesResult.value.docs as Array<{ id: string; data: () => Record<string, unknown> }>,
    );
  }

  if (coursesResult.status === "rejected" && legacyCoursesResult.status === "rejected") {
    warnings.push("Could not load course membership counts.");
  }

  if (approvalsResult.status === "fulfilled") {
    approvalsResult.value.forEach((approval) => {
      const email = normalizeEmail(approval.email);
      const user = getOrCreateUser(approval.userId, email, byKey, idToKey, emailToKey);
      user.userId = user.userId || approval.userId;
      user.email = user.email || email;
      user.name = user.name || approval.name || "User";
      user.requestedRole = user.requestedRole || "docente";
      user.institutionName = user.institutionName || toText(approval.institutionName);
      user.institutionOwnership =
        user.institutionOwnership || toText(approval.institutionOwnership);
      user.institutionType = user.institutionType || toText(approval.institutionType);
      user.teacherApprovalStatus = approval.status;
      user.teacherPlanId =
        user.teacherPlanId ||
        resolveTeacherPlanId(approval.teacherPlanId || approval.interestedPlan) ||
        null;
      user.teacherPlanStatus = user.teacherPlanStatus || toText(approval.teacherPlanStatus);
      user.paymentMethod = user.paymentMethod || toText(approval.paymentMethod);
      user.teacherRequestedAt = user.teacherRequestedAt || approval.requestedAt || null;
      user.teacherRejectedAt = user.teacherRejectedAt || approval.rejectedAt || null;
      user.paymentRequestedAt =
        user.paymentRequestedAt || approval.paymentRequestedAt || null;
    });
  } else {
    warnings.push("Could not load teacher approval workflow data.");
  }

  const users = Array.from(byKey.values())
    .map((entry) => {
      const email = entry.email;
      const role: AdminDirectoryRole =
        isAdminEmail(email) ? "admin" : entry.role || entry.requestedRole || "estudiante";
      const requestedRole = entry.requestedRole;
      const institutionName = entry.institutionName;
      const institutionMissing = isInstitutionMissing(institutionName);
      const institutionWriteRole: AdminDirectoryRole =
        role === "admin"
          ? "admin"
          : role === "institucion"
            ? "institucion"
          : role === "docente" || requestedRole === "docente"
            ? "docente"
            : "estudiante";
      const teacherPlanId = entry.teacherPlanId;
      const teacherPlanLabel = teacherPlanId
        ? getTeacherPlanDefinition(teacherPlanId).label
        : "Not assigned";
      const teacherApprovalStatus: AdminDirectoryApprovalStatus =
        role === "docente"
          ? entry.teacherApprovalStatus || "approved"
          : requestedRole === "docente"
            ? entry.teacherApprovalStatus || "pending"
            : entry.teacherApprovalStatus;

      const legacyEnrollmentCount = entry.sourceIds.size > 0
        ? Array.from(entry.sourceIds).reduce((total, sourceId) => {
            const userRecord = usersResult.status === "fulfilled"
              ? usersResult.value.docs.find((docSnap) => docSnap.id === sourceId)
              : null;
            const studentRecord = studentsResult.status === "fulfilled"
              ? studentsResult.value.docs.find((docSnap) => docSnap.id === sourceId)
              : null;
            const userCourses = Array.isArray(userRecord?.data()?.courses) ? userRecord?.data()?.courses : [];
            const studentCourses = Array.isArray(studentRecord?.data()?.courses) ? studentRecord?.data()?.courses : [];
            return total + Math.max(userCourses.length, studentCourses.length);
          }, 0)
        : 0;

      return {
        userId: entry.userId,
        email,
        name: entry.name || "User",
        role,
        requestedRole,
        institutionWriteRole,
        avatarUrl: entry.avatarUrl,
        avatarEmoji: entry.avatarEmoji,
        phone: entry.phone,
        institutionName: institutionMissing ? "" : institutionName,
        institutionMissing,
        institutionOwnership: entry.institutionOwnership,
        institutionType: entry.institutionType,
        teacherApprovalStatus,
        teacherPlanId,
        teacherPlanLabel,
        teacherPlanStatus: entry.teacherPlanStatus || "",
        teacherPlanAssignedAt: entry.teacherPlanAssignedAt,
        teacherPlanExpiresAt: entry.teacherPlanExpiresAt,
        paymentMethod: entry.paymentMethod || "",
        teacherRequestedAt: entry.teacherRequestedAt,
        teacherApprovedAt: entry.teacherApprovedAt,
        teacherRejectedAt: entry.teacherRejectedAt,
        paymentRequestedAt: entry.paymentRequestedAt,
        activeCoursesCount: entry.activeCoursesCount,
        enrolledCoursesCount: Math.max(entry.enrolledCoursesCount, legacyEnrollmentCount),
      } satisfies AdminDirectoryUserRecord;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return { users, warnings };
}

export function getInstitutionKey(label: string): string {
  return normalizeInstitutionKey(label);
}
