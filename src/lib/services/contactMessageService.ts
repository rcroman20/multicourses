import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

export type ContactMessageRole = "student" | "teacher" | "admin" | "organization" | "other";

export interface SubmitContactMessageInput {
  name: string;
  email: string;
  phone?: string;
  institution?: string;
  role: ContactMessageRole;
  subject: string;
  message: string;
}

export interface ContactMessageRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  institution: string;
  role: ContactMessageRole;
  subject: string;
  message: string;
  status: "new" | "resolved";
  archived?: boolean;
  archivedAt?: Date | null;
  archivedBy?: string;
  source: "contact_page";
  createdAt: Date | null;
  resolvedAt?: Date | null;
  resolvedBy?: string;
}

const COLLECTION_NAME = "contactMessages";

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

export async function submitContactMessage(
  input: SubmitContactMessageInput,
): Promise<string> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = String(input.phone || "").trim();
  const institution = String(input.institution || "").trim();
  const role = input.role;
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (name.length < 3) throw new Error("Name must be at least 3 characters.");
  if (!isValidEmail(email)) throw new Error("Please enter a valid email.");
  if (subject.length < 4) throw new Error("Subject must be at least 4 characters.");
  if (message.length < 10) throw new Error("Message must be at least 10 characters.");
  if (!["student", "teacher", "admin", "organization", "other"].includes(role)) {
    throw new Error("Invalid contact role.");
  }

  const ref = await addDoc(collection(firebaseDB, COLLECTION_NAME), {
    name,
    email,
    phone: phone || null,
    institution: institution || null,
    role,
    subject,
    message,
    status: "new",
    source: "contact_page",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function getContactMessages(): Promise<ContactMessageRecord[]> {
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
    const role: ContactMessageRole =
      roleRaw === "student" ||
      roleRaw === "teacher" ||
      roleRaw === "admin" ||
      roleRaw === "organization"
        ? roleRaw
        : "other";

    return {
      id: docSnap.id,
      name: String(data.name || "").trim(),
      email: String(data.email || "").trim(),
      phone: String(data.phone || "").trim(),
      institution: String(data.institution || "").trim(),
      role,
      subject: String(data.subject || "").trim(),
      message: String(data.message || "").trim(),
      status: String(data.status || "new").trim().toLowerCase() === "resolved" ? "resolved" : "new",
      archived: Boolean(data.archived),
      archivedAt: toDate(data.archivedAt),
      archivedBy: String(data.archivedBy || "").trim(),
      source: "contact_page",
      createdAt: toDate(data.createdAt),
      resolvedAt: toDate(data.resolvedAt),
      resolvedBy: String(data.resolvedBy || "").trim(),
    };
  });
}

export async function markContactMessageResolved(
  messageId: string,
  resolvedBy: string,
): Promise<void> {
  await setDoc(
    doc(firebaseDB, COLLECTION_NAME, messageId),
    {
      status: "resolved",
      resolvedBy: String(resolvedBy || "").trim().toLowerCase() || null,
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function archiveContactMessage(
  messageId: string,
  archivedBy: string,
): Promise<void> {
  await setDoc(
    doc(firebaseDB, COLLECTION_NAME, messageId),
    {
      archived: true,
      archivedBy: String(archivedBy || "").trim().toLowerCase() || null,
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function restoreContactMessage(
  messageId: string,
): Promise<void> {
  await setDoc(
    doc(firebaseDB, COLLECTION_NAME, messageId),
    {
      archived: false,
      archivedBy: null,
      archivedAt: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteContactMessage(messageId: string): Promise<void> {
  await deleteDoc(doc(firebaseDB, COLLECTION_NAME, messageId));
}
