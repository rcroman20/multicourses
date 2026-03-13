import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import type { UserRole } from "@/contexts/AuthContext";
import { firebaseDB } from "@/lib/firebase";

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

const PLACEHOLDER_KEYS = new Set<string>([
  "",
  "independent",
  "none",
  "n/a",
  "na",
  "not provided",
  "no institution",
  "no institution linked",
  "sin institucion",
  "sin institucion registrada",
  "ninguna",
  "-",
]);

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const collapseSpaces = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalizeInstitutionKey = (value: string): string =>
  collapseSpaces(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeInstitutionLabel = (value: unknown): string => collapseSpaces(toText(value));

const getErrorCode = (error: unknown): string => {
  if (typeof error !== "object" || error === null) return "";
  if (!("code" in error)) return "";
  return String((error as { code?: unknown }).code || "").toLowerCase();
};

export const isInstitutionMissing = (value: unknown): boolean => {
  const normalized = normalizeInstitutionLabel(value);
  if (!normalized) return true;
  return PLACEHOLDER_KEYS.has(normalizeInstitutionKey(normalized));
};

const collectInstitutionFromRecord = (
  data: Record<string, unknown> | null,
  collector: Map<string, string>,
): void => {
  if (!data) return;

  INSTITUTION_FIELDS.forEach((field) => {
    const label = normalizeInstitutionLabel(data[field]);
    if (isInstitutionMissing(label)) return;
    const key = normalizeInstitutionKey(label);
    if (!collector.has(key)) {
      collector.set(key, label);
    }
  });
};

const resolveInstitutionFromSources = (
  role: UserRole,
  sources: Array<Record<string, unknown> | null>,
): string => {
  const prioritizedFields =
    role === "estudiante"
      ? ["institutionName", "institution", "teacherInstitutionName", ...INSTITUTION_FIELDS]
      : ["teacherInstitutionName", "institutionName", "institution", ...INSTITUTION_FIELDS];

  for (const field of prioritizedFields) {
    for (const source of sources) {
      if (!source) continue;
      const label = normalizeInstitutionLabel(source[field]);
      if (!isInstitutionMissing(label)) {
        return label;
      }
    }
  }

  return "";
};

export async function getUserStoredInstitution(userId: string, role: UserRole): Promise<string> {
  if (!userId) return "";

  const [userSnap, studentSnap] = await Promise.all([
    getDoc(doc(firebaseDB, "usuarios", userId)),
    getDoc(doc(firebaseDB, "estudiantes", userId)),
  ]);

  const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : null;
  const studentData = studentSnap.exists() ? (studentSnap.data() as Record<string, unknown>) : null;
  return resolveInstitutionFromSources(role, [userData, studentData]);
}

export async function getInstitutionSuggestions(): Promise<string[]> {
  const [usersResult, studentsResult] = await Promise.allSettled([
    getDocs(collection(firebaseDB, "usuarios")),
    getDocs(collection(firebaseDB, "estudiantes")),
  ]);

  const deduped = new Map<string, string>();

  if (usersResult.status === "fulfilled") {
    usersResult.value.docs.forEach((docSnap) => {
      collectInstitutionFromRecord((docSnap.data() || {}) as Record<string, unknown>, deduped);
    });
  }

  if (studentsResult.status === "fulfilled") {
    studentsResult.value.docs.forEach((docSnap) => {
      collectInstitutionFromRecord((docSnap.data() || {}) as Record<string, unknown>, deduped);
    });
  }

  return Array.from(deduped.values()).sort((left, right) => left.localeCompare(right));
}

export interface SaveUserInstitutionInput {
  userId: string;
  role: UserRole;
  email?: string;
  name?: string;
  institutionName: string;
}

export async function saveUserInstitution(input: SaveUserInstitutionInput): Promise<string> {
  const normalizedInstitution = normalizeInstitutionLabel(input.institutionName);
  if (normalizedInstitution.length < 2 || isInstitutionMissing(normalizedInstitution)) {
    throw new Error("A valid institution name is required.");
  }

  const userRef = doc(firebaseDB, "usuarios", input.userId);
  const studentRef = doc(firebaseDB, "estudiantes", input.userId);
  const commonPayload: Record<string, unknown> = {
    institutionName: normalizedInstitution,
    institution: normalizedInstitution,
    updatedAt: serverTimestamp(),
  };
  if (input.role === "docente" || input.role === "admin") {
    commonPayload.teacherInstitutionName = normalizedInstitution;
  }

  if (input.role === "admin") {
    const userSnap = await getDoc(userRef);
    await setDoc(
      userRef,
      userSnap.exists()
        ? {
            ...commonPayload,
          }
        : {
            id: input.userId,
            email: toText(input.email),
            name: toText(input.name) || "Admin",
            role: "admin",
            ...commonPayload,
          },
      { merge: true },
    );

    return normalizedInstitution;
  }

  const [userSnap, studentSnap] = await Promise.all([getDoc(userRef), getDoc(studentRef)]);

  const userPayload = userSnap.exists()
    ? commonPayload
    : {
        id: input.userId,
        email: toText(input.email),
        name: toText(input.name) || "User",
        role: input.role,
        ...commonPayload,
      };

  const studentPayload = studentSnap.exists()
    ? commonPayload
    : {
        id: input.userId,
        email: toText(input.email),
        name: toText(input.name) || "User",
        role: input.role,
        ...commonPayload,
      };

  await Promise.all([
    setDoc(userRef, userPayload, { merge: true }),
    setDoc(studentRef, studentPayload, { merge: true }),
  ]);

  return normalizedInstitution;
}

export function getInstitutionSaveErrorMessage(error: unknown): string {
  const code = getErrorCode(error);
  if (code.includes("permission-denied")) {
    return "No tienes permisos para actualizar tu institución. Revisa tu rol/permisos.";
  }
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) {
    return "No se pudo conectar con la base de datos. Intenta de nuevo en unos segundos.";
  }
  return "No pudimos guardar la institución. Intenta de nuevo.";
}
