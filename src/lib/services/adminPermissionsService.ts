import { doc, getDoc, setDoc } from "firebase/firestore";
import { isOwnerAdminEmail } from "@/lib/services/adminAccessService";
import { firebaseDB } from "@/lib/firebase";

export type DelegatedAdminPermissions = {
  manageTeacherApprovals: boolean;
  manageTeacherOps: boolean;
  manageDeletions: boolean;
  manageInbox: boolean;
  manageSettings: boolean;
  manageBilling: boolean;
  manageInstitutions: boolean;
  manageUsersDirectory: boolean;
  exportReports: boolean;
  manageBackups: boolean;
};

const STORAGE_KEY = "socrattica:admin-delegated-permissions:v1";
export const ADMIN_PERMISSIONS_CHANGED_EVENT = "admin-permissions-changed";
const ADMIN_PERMISSIONS_DOC_PATH = ["adminConfig", "delegatedPermissions"] as const;

const defaultPermissions: DelegatedAdminPermissions = {
  manageTeacherApprovals: true,
  manageTeacherOps: true,
  manageDeletions: false,
  manageInbox: true,
  manageSettings: false,
  manageBilling: true,
  manageInstitutions: true,
  manageUsersDirectory: true,
  exportReports: true,
  manageBackups: false,
};

export function getDelegatedAdminPermissions(): DelegatedAdminPermissions {
  if (typeof window === "undefined") return defaultPermissions;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPermissions;
    const parsed = JSON.parse(raw) as Partial<DelegatedAdminPermissions>;
    return { ...defaultPermissions, ...parsed };
  } catch {
    return defaultPermissions;
  }
}

export function saveDelegatedAdminPermissions(
  permissions: DelegatedAdminPermissions,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(permissions));
  window.dispatchEvent(new CustomEvent(ADMIN_PERMISSIONS_CHANGED_EVENT));
}

export function resetDelegatedAdminPermissions(): DelegatedAdminPermissions {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(ADMIN_PERMISSIONS_CHANGED_EVENT));
  }
  return defaultPermissions;
}

export function canAccessDelegatedAdminPermission(
  permission: keyof DelegatedAdminPermissions,
  email: string | null | undefined,
): boolean {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;
  if (isOwnerAdminEmail(normalizedEmail)) return true;

  const permissions = getDelegatedAdminPermissions();
  return Boolean(permissions[permission]);
}

export async function hydrateDelegatedAdminPermissionsFromFirestore(): Promise<DelegatedAdminPermissions> {
  try {
    const snap = await getDoc(doc(firebaseDB, ...ADMIN_PERMISSIONS_DOC_PATH));
    if (!snap.exists()) return getDelegatedAdminPermissions();

    const data = (snap.data() || {}) as Partial<DelegatedAdminPermissions>;
    const merged = { ...defaultPermissions, ...data };
    saveDelegatedAdminPermissions(merged);
    return merged;
  } catch {
    return getDelegatedAdminPermissions();
  }
}

export async function persistDelegatedAdminPermissionsToFirestore(
  permissions: DelegatedAdminPermissions,
): Promise<void> {
  saveDelegatedAdminPermissions(permissions);
  await setDoc(
    doc(firebaseDB, ...ADMIN_PERMISSIONS_DOC_PATH),
    {
      ...permissions,
      updatedAt: new Date(),
    },
    { merge: true },
  );
}
