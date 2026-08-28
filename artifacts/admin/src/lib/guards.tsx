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
  // A hard reload starts with an unresolved /auth/me request. Do not turn that
  // transient state into a permanent navigation to /unauthorized.
  if (state.kind === "loading") return null;
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
  // Keep the requested URL stable while authentication and memberships load.
  // Once resolved, the existing authorization checks below still fail closed.
  if (state.kind === "loading") return null;

  // Platform admins enter store pages only through a live, server-issued
  // impersonation scope. A URL or synthetic role is not authorization.
  if (
    state.kind === "super" &&
    storeId &&
    state.impersonation?.storeId === storeId
  ) {
    const store = state.stores.find(
      (candidate) => (candidate.storeId ?? (candidate as any).id) === storeId,
    );
    if (store) return <>{children(store)}</>;
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
import { flagsQueryOptions } from "./api";

/**
 * Fetches store AI flags once (cached by React Query) and passes aiEnabled to
 * the studio child. Super admins bypass the loading gate — they can always
 * access studios regardless of the store's AI plan.
 *
 * Intentionally never blocks on isLoading: the studio page renders immediately
 * with aiEnabled=false while the flags fetch is in-flight, then re-renders once
 * the data arrives.  The retry banner in StoreAdminShell handles the slow / error
 * case visibly so there is no need for a spinner here.
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
  const { data: flags } = useQuery(flagsQueryOptions(storeId));
  // isSuperAdmin is kept in the signature for call-site compatibility; super
  // admins receive aiEnabled=true from the shell guard that wraps them, so the
  // value here doesn't matter — fall through regardless.
  void isSuperAdmin;
  return <>{children(flags?.aiEnabled ?? false)}</>;
}
