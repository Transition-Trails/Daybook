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
import { meApi, type MeStore, resolveStoreId } from "./api";

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
}

export function useConsole(): ConsoleState {
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useGetMe();

  // Mirror backend isSuperAdmin(): platformRole === "super_admin" OR legacy role === "owner"
  const isSuper =
    (user as any)?.platformRole === "super_admin" ||
    (user as any)?.role === "owner";

  const {
    data: stores = [],
    isLoading: storesLoading,
  } = useQuery({
    queryKey: ["me/stores"] as const,
    queryFn: () => meApi.stores(),
    enabled: !!user,
    retry: false,
  });

  if (userLoading || (!!user && storesLoading)) {
    return { kind: "loading", user: undefined, stores: [], primaryStore: undefined };
  }

  if (userError || !user) {
    return { kind: "unauthenticated", user: undefined, stores: [], primaryStore: undefined };
  }

  if (isSuper) {
    return { kind: "super", user, stores, primaryStore: undefined };
  }

  // Store members: find their first non-customer store
  const adminStores = stores.filter(s => s.role !== "customer");

  if (adminStores.length > 0) {
    return {
      kind: "store",
      user,
      stores: adminStores,
      primaryStore: adminStores[0],
    };
  }

  return { kind: "unauthorized", user, stores: [], primaryStore: undefined };
}
