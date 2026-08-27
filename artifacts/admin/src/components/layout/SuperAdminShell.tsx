import { AdminLayout } from "./AdminLayout";

/**
 * Compatibility wrapper for existing route declarations.
 * The visual shell is shared with store administration in AdminLayout.
 */
export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return <AdminLayout role="super">{children}</AdminLayout>;
}

export const HOUSE_STORE_ID = "store-house";