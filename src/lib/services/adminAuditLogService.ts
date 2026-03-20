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

export async function appendAdminAuditLog(input: AppendAdminAuditLogInput): Promise<string> {
  void input;
  return "";
}

export async function getAdminAuditLogEntries(limitCount = 200): Promise<AdminAuditLogEntry[]> {
  void limitCount;
  return [];
}
