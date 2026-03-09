type TeacherPlanAccessInput = {
  role?: unknown;
  teacherPlanStatus?: unknown;
  teacherPlanExpiresAt?: unknown;
};

const normalizeRole = (value: unknown): "docente" | "estudiante" | "" => {
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

export const toDateOrNull = (value: unknown): Date | null => {
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

export const isTeacherPlanExpired = (input: TeacherPlanAccessInput | null | undefined): boolean => {
  if (!input) return false;
  const role = normalizeRole(input.role);
  if (role !== "docente") return false;

  const status = String(input.teacherPlanStatus || "").trim().toLowerCase();
  if (status === "expired" || status === "pending_payment") return true;

  const expiresAt = toDateOrNull(input.teacherPlanExpiresAt);
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
};
