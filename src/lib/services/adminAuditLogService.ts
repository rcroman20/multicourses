import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";

export type AdminAuditCategory =
  | "access"
  | "approval"
  | "billing"
  | "course"
  | "deletion"
  | "inbox"
  | "notification"
  | "settings"
  | "institution"
  | "backup"
  | "report"
  | "announcement";

export interface AdminAuditLogEntry {
  id: string;
  actorEmail: string;
  actorName: string;
  action: string;
  category: AdminAuditCategory;
  targetType: string;
  targetId: string;
  targetLabel: string;
  detail: string;
  createdAt: Date | null;
}

export interface AppendAdminAuditLogInput {
  actorEmail: string;
  actorName?: string;
  action: string;
  category: AdminAuditCategory;
  targetType: string;
  targetId?: string;
  targetLabel?: string;
  detail?: string;
}

const COLLECTION_NAME = "adminAuditLog";

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

export async function appendAdminAuditLog(input: AppendAdminAuditLogInput): Promise<string> {
  const ref = await addDoc(collection(firebaseDB, COLLECTION_NAME), {
    actorEmail: String(input.actorEmail || "").trim().toLowerCase(),
    actorName: String(input.actorName || "").trim() || "Admin",
    action: String(input.action || "").trim(),
    category: input.category,
    targetType: String(input.targetType || "").trim(),
    targetId: String(input.targetId || "").trim(),
    targetLabel: String(input.targetLabel || "").trim(),
    detail: String(input.detail || "").trim(),
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

export async function getAdminAuditLogEntries(limitCount = 200): Promise<AdminAuditLogEntry[]> {
  const snapshot = await getDocs(
    query(
      collection(firebaseDB, COLLECTION_NAME),
      orderBy("createdAt", "desc"),
      limit(Math.max(1, limitCount)),
    ),
  );

  return snapshot.docs.map((docSnap) => {
    const data = (docSnap.data() || {}) as Record<string, unknown>;
    return {
      id: docSnap.id,
      actorEmail: String(data.actorEmail || "").trim(),
      actorName: String(data.actorName || "").trim() || "Admin",
      action: String(data.action || "").trim(),
      category: String(data.category || "settings").trim() as AdminAuditCategory,
      targetType: String(data.targetType || "").trim(),
      targetId: String(data.targetId || "").trim(),
      targetLabel: String(data.targetLabel || "").trim(),
      detail: String(data.detail || "").trim(),
      createdAt: toDate(data.createdAt),
    };
  });
}
