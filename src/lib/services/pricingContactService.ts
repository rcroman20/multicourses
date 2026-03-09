import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

export type PricingContactRole = "teacher" | "organization" | "admin_team";

export interface SubmitPricingContactInput {
  name: string;
  email: string;
  institutionName: string;
  role: PricingContactRole;
  desiredCourses: number;
  desiredStudents: number;
  interestedPlanId?: string;
  message?: string;
}

export interface PricingContactRequestRecord {
  id: string;
  name: string;
  email: string;
  institutionName: string;
  role: PricingContactRole;
  desiredCourses: number;
  desiredStudents: number;
  interestedPlanId: string;
  message: string;
  status: "new" | "resolved";
  source: "landing_estimator";
  createdAt: Date | null;
  resolvedAt?: Date | null;
  resolvedBy?: string;
}

const COLLECTION_NAME = "pricingContactRequests";

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

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

export async function submitPricingContactRequest(
  input: SubmitPricingContactInput,
): Promise<string> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const institutionName = input.institutionName.trim();
  const role = input.role;
  const desiredCourses = Math.max(0, Math.floor(Number(input.desiredCourses) || 0));
  const desiredStudents = Math.max(0, Math.floor(Number(input.desiredStudents) || 0));
  const interestedPlanId = String(input.interestedPlanId || "").trim();
  const message = String(input.message || "").trim();

  if (name.length < 3) throw new Error("Name must be at least 3 characters.");
  if (!isValidEmail(email)) throw new Error("Please enter a valid email.");
  if (institutionName.length < 2) {
    throw new Error("Institution/organization name is required.");
  }
  if (!["teacher", "organization", "admin_team"].includes(role)) {
    throw new Error("Invalid requester role.");
  }

  const ref = await addDoc(collection(firebaseDB, COLLECTION_NAME), {
    name,
    email,
    institutionName,
    role,
    desiredCourses,
    desiredStudents,
    interestedPlanId: interestedPlanId || null,
    message: message || null,
    status: "new",
    source: "landing_estimator",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function getPricingContactRequests(): Promise<PricingContactRequestRecord[]> {
  const snap = await getDocs(
    query(
      collection(firebaseDB, COLLECTION_NAME),
      orderBy("createdAt", "desc"),
      limit(300),
    ),
  );

  return snap.docs.map((docSnap) => {
    const data = (docSnap.data() || {}) as Record<string, unknown>;
    const roleRaw = String(data.role || "").trim();
    const role: PricingContactRole =
      roleRaw === "organization" || roleRaw === "admin_team" ? roleRaw : "teacher";

    return {
      id: docSnap.id,
      name: String(data.name || "").trim(),
      email: String(data.email || "").trim(),
      institutionName: String(data.institutionName || "").trim(),
      role,
      desiredCourses: Math.max(0, Math.floor(Number(data.desiredCourses) || 0)),
      desiredStudents: Math.max(0, Math.floor(Number(data.desiredStudents) || 0)),
      interestedPlanId: String(data.interestedPlanId || "").trim(),
      message: String(data.message || "").trim(),
      status: String(data.status || "new").trim().toLowerCase() === "resolved" ? "resolved" : "new",
      source: "landing_estimator",
      createdAt: toDate(data.createdAt),
      resolvedAt: toDate(data.resolvedAt),
      resolvedBy: String(data.resolvedBy || "").trim(),
    };
  });
}

export async function markPricingContactRequestResolved(
  requestId: string,
  resolvedBy: string,
): Promise<void> {
  await setDoc(
    doc(firebaseDB, COLLECTION_NAME, requestId),
    {
      status: "resolved",
      resolvedBy: String(resolvedBy || "").trim().toLowerCase() || null,
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
