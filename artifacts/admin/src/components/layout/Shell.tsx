import { AdminLayout } from "./AdminLayout";

/**
 * Legacy route compatibility wrapper. Catalog and platform pages now share
 * the same admin shell rather than mounting a second sidebar.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return <AdminLayout role="super">{children}</AdminLayout>;
}