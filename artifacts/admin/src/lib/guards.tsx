/**
 * Route guards for the admin console.
 *
 * Extracted from App.tsx into this module so they can be imported in tests,
 * exercising the real guard logic rather than bypassing it with hand-crafted
 * store objects.
 */
import { Redirect } from "wouter";
import type { ConsoleState } from "./useConsole";

// ── RequireSuperAdmin ──────────────────────────────────────────────────────

export function RequireSuperAdmin({
  state,
  children,
}: {
  state: ConsoleState;
  children: React.ReactNode;
}) {
  if (state.kind === "super") return <>{children}</>;
  return <Redirect to="/unauthorized" />;
}

// ── RequireStore ───────────────────────────────────────────────────────────

export function RequireStore({
  state,
  storeId,
  children,
}: {
  state: ConsoleState;
  storeId: string | undefined;
  children: (store: ConsoleState["stores"][number]) => React.ReactNode;
}) {
  // super_admin can access any store; create a synthetic store entry if the
  // store is not in their fetched stores list (e.g. freshly loaded page).
  if (state.kind === "super" && storeId) {
    const store =
      state.stores.find((s) => (s.storeId ?? (s as any).id) === storeId) ??
      ({ storeId, id: storeId, name: storeId, role: "super_admin" } as any);
    return <>{children(store)}</>;
  }

  if (state.kind === "store") {
    const store = state.stores.find(
      (s) => (s.storeId ?? (s as any).id) === storeId,
    );
    if (store) return <>{children(store)}</>;
  }

  return <Redirect to="/unauthorized" />;
}

// ── StoreStudioLoader ──────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { storesApi } from "./api";

/**
 * Fetches store AI flags once (cached by React Query) and passes aiEnabled to
 * the studio child. Super admins bypass the loading gate — they can always
 * access studios regardless of the store's AI plan.
 */
export function StoreStudioLoader({
  storeId,
  isSuperAdmin = false,
  children,
}: {
  storeId: string;
  isSuperAdmin?: boolean;
  children: (aiEnabled: boolean) => React.ReactNode;
}) {
  const { data: flags, isLoading } = useQuery({
    queryKey: ["store-flags", storeId],
    queryFn: () => storesApi.flags.get(storeId),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading && !isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  return <>{children(flags?.aiEnabled ?? false)}</>;
}
