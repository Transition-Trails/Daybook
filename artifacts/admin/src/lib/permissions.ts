/**
 * Client-side permission helpers mirror the server's single RBAC model.
 * Unknown values deliberately receive no elevated access.
 */
export function canWrite(role: string | undefined): boolean {
  return role === "store_owner" || role === "store_staff" || role === "super_admin";
}

export function canPublish(role: string | undefined): boolean {
  return role === "store_owner" || role === "super_admin";
}

export function isStaffRole(role: string | undefined): boolean {
  return role === "store_owner" || role === "store_staff" || role === "support" || role === "super_admin";
}

export function isSuperAdminRole(role: string | undefined): boolean {
  return role === "super_admin";
}

/** Intentionally excludes platform admins from store-owner-only controls. */
export function isStoreOwnerRole(role: string | undefined): boolean {
  return role === "store_owner";
}