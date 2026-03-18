import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
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
const PUBLIC_INSTITUTIONS_COLLECTION = "publicDirectory";
const PUBLIC_INSTITUTIONS_DOC = "institutions";
const PUBLIC_INSTITUTION_LIST_FIELDS = [
  "items",
  "institutions",
  "suggestions",
  "institutionSuggestions",
  "options",
] as const;
const PUBLIC_INSTITUTION_RECORD_FIELDS = [
  "records",
  "directory",
  "entries",
] as const;
const CANDIDATE_INSTITUTION_KEYS = [
  "label",
  "name",
  "institution",
  "institutionName",
  "value",
  "title",
] as const;

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

const collectInstitutionFromUnknown = (
  value: unknown,
  collector: Map<string, string>,
  depth = 0,
): void => {
  if (depth > 3 || value === null || value === undefined) return;

  if (typeof value === "string") {
    const label = normalizeInstitutionLabel(value);
    if (isInstitutionMissing(label)) return;
    const key = normalizeInstitutionKey(label);
    if (!collector.has(key)) {
      collector.set(key, label);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectInstitutionFromUnknown(entry, collector, depth + 1));
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    CANDIDATE_INSTITUTION_KEYS.forEach((field) => {
      collectInstitutionFromUnknown(record[field], collector, depth + 1);
    });
  }
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
  const [publicResult, usersResult, studentsResult] = await Promise.allSettled([
    getDoc(doc(firebaseDB, PUBLIC_INSTITUTIONS_COLLECTION, PUBLIC_INSTITUTIONS_DOC)),
    getDocs(collection(firebaseDB, "usuarios")),
    getDocs(collection(firebaseDB, "estudiantes")),
  ]);

  const canReadProfiles =
    usersResult.status === "fulfilled" || studentsResult.status === "fulfilled";

  if (canReadProfiles) {
    const dedupedFromProfiles = new Map<string, string>();

    if (usersResult.status === "fulfilled") {
      usersResult.value.docs.forEach((docSnap) => {
        collectInstitutionFromRecord((docSnap.data() || {}) as Record<string, unknown>, dedupedFromProfiles);
      });
    }

    if (studentsResult.status === "fulfilled") {
      studentsResult.value.docs.forEach((docSnap) => {
        collectInstitutionFromRecord((docSnap.data() || {}) as Record<string, unknown>, dedupedFromProfiles);
      });
    }

    const suggestions = Array.from(dedupedFromProfiles.values()).sort((left, right) =>
      left.localeCompare(right),
    );

    void replacePublicInstitutionSuggestions(suggestions).catch(() => undefined);
    return suggestions;
  }

  const deduped = new Map<string, string>();
  if (publicResult.status === "fulfilled" && publicResult.value.exists()) {
    const data = publicResult.value.data() as Record<string, unknown>;
    PUBLIC_INSTITUTION_LIST_FIELDS.forEach((field) => {
      collectInstitutionFromUnknown(data[field], deduped);
    });
    collectInstitutionFromRecord(data, deduped);
  }

  return Array.from(deduped.values()).sort((left, right) => left.localeCompare(right));
}

export async function syncPublicInstitutionSuggestions(
  institutionNames: string[],
): Promise<void> {
  const labels = Array.from(
    new Set(
      institutionNames
        .map((item) => normalizeInstitutionLabel(item))
        .filter((item) => item.length >= 2 && !isInstitutionMissing(item)),
    ),
  );

  if (labels.length === 0) return;

  const deduped = new Map<string, string>();
  labels.forEach((label) => {
    const key = normalizeInstitutionKey(label);
    if (!deduped.has(key)) {
      deduped.set(key, label);
    }
  });

  const publicRef = doc(firebaseDB, PUBLIC_INSTITUTIONS_COLLECTION, PUBLIC_INSTITUTIONS_DOC);
  const publicSnap = await getDoc(publicRef).catch(() => null);
  if (publicSnap && publicSnap.exists()) {
    const data = publicSnap.data() as Record<string, unknown>;
    PUBLIC_INSTITUTION_LIST_FIELDS.forEach((field) => {
      collectInstitutionFromUnknown(data[field], deduped);
    });
    collectInstitutionFromRecord(data, deduped);
  }

  const mergedItems = Array.from(deduped.values()).sort((left, right) =>
    left.localeCompare(right),
  );

  await setDoc(
    publicRef,
    {
      items: mergedItems,
      institutions: mergedItems,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export interface PublicInstitutionDirectoryRecord {
  id: string;
  name: string;
  planStatus: "active" | "inactive" | "pending_payment";
}

const normalizePublicInstitutionPlanStatus = (
  value: unknown,
): PublicInstitutionDirectoryRecord["planStatus"] => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "inactive" || normalized === "pending_payment") {
    return normalized;
  }
  return "active";
};

const getPublicInstitutionRecordsFromData = (
  data: Record<string, unknown> | null,
): PublicInstitutionDirectoryRecord[] => {
  if (!data) return [];

  const records: PublicInstitutionDirectoryRecord[] = [];
  PUBLIC_INSTITUTION_RECORD_FIELDS.forEach((field) => {
    const raw = data[field];
    if (!Array.isArray(raw)) return;
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const record = entry as Record<string, unknown>;
      const id = toText(record.id);
      const name =
        normalizeInstitutionLabel(record.name) ||
        normalizeInstitutionLabel(record.label) ||
        normalizeInstitutionLabel(record.institutionName);
      if (!id || isInstitutionMissing(name)) return;
      records.push({
        id,
        name,
        planStatus: normalizePublicInstitutionPlanStatus(record.planStatus),
      });
    });
  });

  return records;
};

export async function findPublicInstitutionByName(
  institutionName: string,
): Promise<PublicInstitutionDirectoryRecord | null> {
  const normalizedInstitution = normalizeInstitutionLabel(institutionName);
  if (isInstitutionMissing(normalizedInstitution)) return null;

  const publicSnap = await getDoc(
    doc(firebaseDB, PUBLIC_INSTITUTIONS_COLLECTION, PUBLIC_INSTITUTIONS_DOC),
  ).catch(() => null);
  if (!publicSnap || !publicSnap.exists()) return null;

  const records = getPublicInstitutionRecordsFromData(
    publicSnap.data() as Record<string, unknown>,
  );
  const targetKey = normalizeInstitutionKey(normalizedInstitution);
  return (
    records.find((record) => normalizeInstitutionKey(record.name) === targetKey) || null
  );
}

export async function syncPublicInstitutionDirectoryRecord(
  record: PublicInstitutionDirectoryRecord,
): Promise<void> {
  const normalizedName = normalizeInstitutionLabel(record.name);
  const normalizedId = toText(record.id);
  if (!normalizedId || isInstitutionMissing(normalizedName)) return;

  const publicRef = doc(firebaseDB, PUBLIC_INSTITUTIONS_COLLECTION, PUBLIC_INSTITUTIONS_DOC);
  const publicSnap = await getDoc(publicRef).catch(() => null);
  const currentData =
    publicSnap && publicSnap.exists()
      ? (publicSnap.data() as Record<string, unknown>)
      : null;

  const suggestions = new Map<string, string>();
  if (currentData) {
    PUBLIC_INSTITUTION_LIST_FIELDS.forEach((field) => {
      collectInstitutionFromUnknown(currentData[field], suggestions);
    });
    collectInstitutionFromRecord(currentData, suggestions);
  }
  const normalizedKey = normalizeInstitutionKey(normalizedName);
  if (!suggestions.has(normalizedKey)) {
    suggestions.set(normalizedKey, normalizedName);
  }

  const mergedRecords = new Map<string, PublicInstitutionDirectoryRecord>();
  getPublicInstitutionRecordsFromData(currentData).forEach((entry) => {
    mergedRecords.set(normalizeInstitutionKey(entry.name), entry);
  });
  mergedRecords.set(normalizedKey, {
    id: normalizedId,
    name: normalizedName,
    planStatus: normalizePublicInstitutionPlanStatus(record.planStatus),
  });

  const items = Array.from(suggestions.values()).sort((left, right) => left.localeCompare(right));
  const records = Array.from(mergedRecords.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  await setDoc(
    publicRef,
    {
      items,
      institutions: items,
      records,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function replacePublicInstitutionSuggestions(
  institutionNames: string[],
): Promise<void> {
  const labels = Array.from(
    new Set(
      institutionNames
        .map((item) => normalizeInstitutionLabel(item))
        .filter((item) => item.length >= 2 && !isInstitutionMissing(item)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  await setDoc(
    doc(firebaseDB, PUBLIC_INSTITUTIONS_COLLECTION, PUBLIC_INSTITUTIONS_DOC),
    {
      items: labels,
      institutions: labels,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
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
  await syncPublicInstitutionSuggestions([normalizedInstitution]).catch(() => undefined);

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
