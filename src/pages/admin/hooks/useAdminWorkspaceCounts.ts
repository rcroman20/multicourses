import { useCallback, useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDB } from "@/lib/firebase";
import { getAdminEmails } from "@/lib/services/adminAccessService";
import { getPendingAccountDeletionRequests } from "@/lib/services/accountDeletionService";
import { getTeacherApprovalRequests } from "@/lib/services/teacherApprovalService";
import { getPricingContactRequests } from "@/lib/services/pricingContactService";
import { getContactMessages } from "@/lib/services/contactMessageService";

export type AdminWorkspaceTab =
  | "admins"
  | "teacherApprovals"
  | "teacherOps"
  | "deletions"
  | "pricingLeads";

export type AdminWorkspaceCounts = {
  admins: number;
  approvals: number;
  teacherOps: number;
  deletions: number;
  inbox: number;
};

const defaultCounts: AdminWorkspaceCounts = {
  admins: 0,
  approvals: 0,
  teacherOps: 0,
  deletions: 0,
  inbox: 0,
};

const toText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isTeacherRecord = (roleValue: unknown, requestedRoleValue: unknown): boolean => {
  const role = toText(roleValue).toLowerCase();
  const requestedRole = toText(requestedRoleValue).toLowerCase();
  return (
    role === "docente" ||
    role === "teacher" ||
    requestedRole === "docente" ||
    requestedRole === "teacher"
  );
};

export function useAdminWorkspaceCounts() {
  const [counts, setCounts] = useState<AdminWorkspaceCounts>(defaultCounts);
  const [loadingCounts, setLoadingCounts] = useState(false);

  const refreshCounts = useCallback(async () => {
    setLoadingCounts(true);
    try {
      const [approvals, deletions, pricingLeads, contactMessages, usersSnap] =
        await Promise.all([
          getTeacherApprovalRequests(),
          getPendingAccountDeletionRequests(),
          getPricingContactRequests(),
          getContactMessages(),
          getDocs(collection(firebaseDB, "usuarios")),
        ]);

      const teacherOps = usersSnap.docs.reduce((acc, item) => {
        const data = (item.data() || {}) as Record<string, unknown>;
        return acc + (isTeacherRecord(data.role, data.requestedRole) ? 1 : 0);
      }, 0);

      setCounts({
        admins: getAdminEmails().length,
        approvals: approvals.length,
        teacherOps,
        deletions: deletions.length,
        inbox:
          pricingLeads.filter((entry) => entry.status !== "resolved").length +
          contactMessages.filter((entry) => entry.status !== "resolved").length,
      });
    } catch {
      setCounts((prev) => ({
        ...prev,
        admins: getAdminEmails().length,
      }));
    } finally {
      setLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  return { counts, loadingCounts, refreshCounts };
}
