import { isOwnerAdminEmail } from "@/lib/services/adminAccessService";
import {
  canAccessDelegatedAdminPermission,
  type DelegatedAdminPermissions,
} from "@/lib/services/adminPermissionsService";

export function hasAdminPermission(
  permission: keyof DelegatedAdminPermissions,
  email: string | null | undefined,
): boolean {
  return canAccessDelegatedAdminPermission(permission, email);
}

export function assertAdminPermission(
  permission: keyof DelegatedAdminPermissions,
  email: string | null | undefined,
  message: string,
): void {
  if (hasAdminPermission(permission, email)) return;
  throw new Error(message);
}

export function assertOwnerAdmin(email: string | null | undefined, message: string): void {
  if (isOwnerAdminEmail(email)) return;
  throw new Error(message);
}
