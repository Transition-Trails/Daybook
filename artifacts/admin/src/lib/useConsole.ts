/**
 * useConsole — determines which admin console to show based on the current
 * user's platform role and store memberships.
 *
 * Returns:
 *   - loading:      still fetching user data
 *   - unauthenticated: no session (redirect to /login)
 *   - super:        user is super_admin → Super Admin console
 *   - store:        user is a store member → Store Admin console
 *   - unauthorized: authenticated but no admin access
 */
import { useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { meApi, type MeStore, type StoreImpersonation, resolveStoreId } from "./api";
import { isStaffRole } from "./permissions";

export type ConsoleKind =
  | "loading"
  | "unauthenticated"
  | "super"
  | "store"
  | "unauthorized";

export interface ConsoleState {
  kind: ConsoleKind;
  user: ReturnType<typeof useGetMe>["data"];
  stores: MeStore[];
  /** First non-customer store the user belongs to (for default Store Admin routing) */
  primaryStore: MeStore | undefined;
  /** Server-issued support scope; never inferred from a store role or URL. */
  impersonation?: StoreImpersonation | null;
}

export function useConsole(): ConsoleState {
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useGetMe();

  const isSuper = (user as any)?.platformRole === "super_admin";
  const impersonation = (user as typeof user & {
    impersonation?: StoreImpersonation | null;
  } | undefined)?.impersonation ?? null;

  const {
    data: stores = [],
    isLoading: storesLoading,
  } = useQuery({
    queryKey: ["me/stores", { includeSeed: isSuper && !!impersonation }] as const,
    queryFn: () => meApi.stores({ includeSeed: isSuper && !!impersonation }),
    enabled: !!user,
    retry: false,
  });

  if (userLoading || (!!user && storesLoading)) {
    return { kind: "loading", user: undefined, stores: [], primaryStore: undefined, impersonation: null };
  }

  if (userError || !user) {
    return { kind: "unauthenticated", user: undefined, stores: [], primaryStore: undefined, impersonation: null };
  }

  if (isSuper) {
    return { kind: "super", user, stores, primaryStore: undefined, impersonation };
  }

  // Store members: find their first non-customer store
  const adminStores = stores.filter(s => isStaffRole(s.role));

  if (adminStores.length > 0) {
    return {
      kind: "store",
      user,
      stores: adminStores,
      primaryStore: adminStores[0],
      impersonation: null,
    };
  }

  return { kind: "unauthorized", user, stores: [], primaryStore: undefined, impersonation: null };
}
