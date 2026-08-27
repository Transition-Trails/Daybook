import { AdminLayout } from "./AdminLayout";
import type { MeStore } from "@/lib/api";

interface StoreAdminShellProps {
  children: React.ReactNode;
  store: MeStore;
  role: string;
  allStores?: MeStore[];
}

/**
 * Compatibility wrapper for store routes. All role-aware navigation,
 * impersonation UI, and layout styling live in the shared AdminLayout.
 */
export function StoreAdminShell({ children, store, role, allStores = [] }: StoreAdminShellProps) {
  return <AdminLayout role="owner" storeRole={role} store={store} allStores={allStores}>{children}</AdminLayout>;
}