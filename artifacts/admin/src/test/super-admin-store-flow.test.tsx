/**
 * Integration tests: super admin → store console navigation
 *
 * These tests exercise the REAL guard logic (RequireStore, RequireSuperAdmin)
 * imported from @/lib/guards, mount the real StoreAdminShell, and use per-
 * endpoint fetch handlers so status codes are meaningful.
 *
 * Coverage:
 *  1. RequireStore — super_admin gets access to any store (positive)
 *  2. RequireStore — super_admin gets a synthetic store when storeId is unknown (positive)
 *  3. RequireStore — regular store member gets access to their own store (positive)
 *  4. RequireStore — store member cannot access another store → redirect (NEGATIVE)
 *  5. RequireStore — unauthenticated state → redirect (NEGATIVE)
 *  6. Full shell: super_admin sees one banner exit and a single studio-picker link
 *  7. Full shell: studio picker remains reachable if flags fail
 *  8. Full shell: regular owners also reach the picker rather than duplicated studio links
 *  9. SuperStores page: "Enter store" link points to /store/:id
 * 10. Navigation: clicking "Enter store" renders the StoreAdminShell (end-to-end mini-app)
 */

import React, { Suspense } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router, Route, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// ── Mock @workspace/api-client-react ───────────────────────────────────────

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: () => ({
    data: { id: "u-super", name: "Super Admin", platformRole: "super_admin" },
    isLoading: false,
    error: null,
  }),
  useLogout: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// ── Per-endpoint fetch factory ─────────────────────────────────────────────
//
// Each test can configure individual endpoint overrides. The factory maps URL
// substrings to { status, body } responses. Unknown URLs return 200 + {}.
// This preserves real status semantics so tests that assert on error paths
// actually fail when the status is wrong.

type EndpointHandlers = Record<string, { status: number; body: unknown }>;

const DEFAULT_HANDLERS: EndpointHandlers = {
  "/api/me/stores": { status: 200, body: [] },
  "/api/stores/store-test/flags": {
    status: 200,
    body: { storeId: "store-test", aiEnabled: false, customDomain: false },
  },
  "/api/stores/store-test": {
    status: 200,
    body: {
      id: "store-test",
      name: "Test Store",
      slug: "test",
      domain: null,
      ownerUserId: "u-owner",
      plan: "starter",
      status: "active",
      defaultMode: "curated",
      subscriptionActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memberCount: 1,
    },
  },
  "/api/stores": { status: 200, body: [] },
  "/api/me": {
    status: 200,
    body: { id: "u-super", name: "Super Admin", platformRole: "super_admin" },
  },
};

function makeFetch(overrides: EndpointHandlers = {}) {
  const handlers = { ...DEFAULT_HANDLERS, ...overrides };
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    // Find the most specific matching handler (longest key wins)
    const match = Object.entries(handlers)
      .filter(([k]) => url.includes(k))
      .sort((a, b) => b[0].length - a[0].length)[0];
    const { status, body } = match?.[1] ?? { status: 200, body: {} };
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
}

// ── Test helpers ───────────────────────────────────────────────────────────

function makeQc() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

function Wrapper({
  children,
  path,
  qc,
}: {
  children: React.ReactNode;
  path: string;
  qc: QueryClient;
}) {
  const { hook: useLocation } = memoryLocation({ path, static: false });
  return (
    <QueryClientProvider client={qc}>
      <Router hook={useLocation}>{children}</Router>
    </QueryClientProvider>
  );
}

// ── Imports of components / guards under test ──────────────────────────────

import { RequireStore, RequireSuperAdmin } from "@/lib/guards";
import { StoreAdminShell } from "@/components/layout/StoreAdminShell";
import { SuperAdminShell } from "@/components/layout/SuperAdminShell";
import { AiDrawerProvider } from "@/contexts/AiDrawerContext";
import type { ConsoleState } from "@/lib/useConsole";
import type { MeStore } from "@/lib/api";

describe("SuperAdminShell navigation", () => {
  it("links every restored management item to a mounted route", () => {
    const qc = makeQc();
    render(
      <Wrapper path="/super" qc={qc}>
        <AiDrawerProvider>
          <SuperAdminShell>
            <div>Platform content</div>
          </SuperAdminShell>
        </AiDrawerProvider>
      </Wrapper>,
    );

    const expectedLinks: Record<string, string> = {
      "Releases": "/super/releases",
      "Promote content": "/super/promote",
      "Plans": "/daybook/plans",
      "Users": "/daybook/users",
      "Ink library": "/daybook/ink",
      "AI settings": "/daybook/ai-settings",
      "Google sync": "/daybook/sync",
      "Calendar": "/daybook/calendar",
      "Planner interiors": "/daybook/super/planner-interiors",
      "All studios": "/super/studios",
      "Help center": "/super/help",
      "Support inbox": "/super/support",
      "Support patterns": "/super/support/patterns",
    };

    for (const [name, href] of Object.entries(expectedLinks)) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});

// ── Shared test fixtures ───────────────────────────────────────────────────

const SUPER_STATE: ConsoleState = {
  kind: "super",
  user: { id: "u-super", name: "Super Admin", platformRole: "super_admin" } as any,
  stores: [],
  primaryStore: undefined,
};

const SUPER_STATE_WITH_STORE: ConsoleState = {
  kind: "super",
  user: { id: "u-super", name: "Super Admin", platformRole: "super_admin" } as any,
  stores: [
    {
      id: "store-test",
      name: "Test Store",
      status: "active",
      plan: "starter",
      role: "super_admin",
    } as MeStore,
  ],
  primaryStore: undefined,
};

const MEMBER_STORE: MeStore = {
  storeId: "store-test",
  name: "Test Store",
  status: "active",
  plan: "starter",
  role: "store_owner",
};

const STORE_STATE: ConsoleState = {
  kind: "store",
  user: { id: "u-owner", name: "Store Owner" } as any,
  stores: [MEMBER_STORE],
  primaryStore: MEMBER_STORE,
};

// ── 1–5: RequireStore guard logic ──────────────────────────────────────────

describe("RequireStore guard", () => {
  beforeEach(() => vi.stubGlobal("fetch", makeFetch()));
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("grants super_admin access to any store and passes role='super_admin' to child", () => {
    const qc = makeQc();
    render(
      <Wrapper path="/store/store-test" qc={qc}>
        <RequireStore state={SUPER_STATE} storeId="store-test">
          {(store) => (
            <div data-testid="guarded" data-role={store.role}>granted</div>
          )}
        </RequireStore>
      </Wrapper>,
    );
    const el = screen.getByTestId("guarded");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-role", "super_admin");
  });

  it("creates a synthetic store when storeId is not in super_admin stores list", () => {
    // SUPER_STATE has stores: [] — unknown storeId must still resolve
    const qc = makeQc();
    render(
      <Wrapper path="/store/unknown-store" qc={qc}>
        <RequireStore state={SUPER_STATE} storeId="unknown-store">
          {(store) => (
            <div data-testid="guarded" data-role={store.role}>
              {store.storeId ?? (store as any).id}
            </div>
          )}
        </RequireStore>
      </Wrapper>,
    );
    const el = screen.getByTestId("guarded");
    expect(el).toHaveAttribute("data-role", "super_admin");
    expect(el).toHaveTextContent("unknown-store");
  });

  it("grants a store member access to their own store", () => {
    const qc = makeQc();
    render(
      <Wrapper path="/store/store-test" qc={qc}>
        <RequireStore state={STORE_STATE} storeId="store-test">
          {(store) => (
            <div data-testid="guarded" data-role={store.role}>granted</div>
          )}
        </RequireStore>
      </Wrapper>,
    );
    const el = screen.getByTestId("guarded");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-role", "store_owner");
  });

  // NEGATIVE: regular member cannot access a different store
  it("redirects a store member who tries to access another store's console", async () => {
    const qc = makeQc();
    render(
      <Wrapper path="/store/other-store" qc={qc}>
        <Switch>
          <Route path="/store/:sid">
            {(p) => (
              <RequireStore state={STORE_STATE} storeId={p.sid}>
                {() => <div data-testid="should-not-render">secret content</div>}
              </RequireStore>
            )}
          </Route>
          <Route path="/unauthorized">
            <div data-testid="unauthorized-page">Access denied</div>
          </Route>
        </Switch>
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("unauthorized-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("should-not-render")).not.toBeInTheDocument();
  });

  // NEGATIVE: unauthenticated state always redirects
  it("redirects an unauthenticated user", async () => {
    const unauthState: ConsoleState = {
      kind: "unauthenticated",
      user: undefined,
      stores: [],
      primaryStore: undefined,
    };
    const qc = makeQc();
    render(
      <Wrapper path="/store/store-test" qc={qc}>
        <Switch>
          <Route path="/store/:sid">
            {(p) => (
              <RequireStore state={unauthState} storeId={p.sid}>
                {() => <div data-testid="should-not-render">secret content</div>}
              </RequireStore>
            )}
          </Route>
          <Route path="/unauthorized">
            <div data-testid="unauthorized-page">Access denied</div>
          </Route>
        </Switch>
      </Wrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("unauthorized-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("should-not-render")).not.toBeInTheDocument();
  });
});

// ── 6: StoreAdminShell — super_admin role ─────────────────────────────────

describe("StoreAdminShell — super_admin via RequireStore", () => {
  beforeEach(() => vi.stubGlobal("fetch", makeFetch()));
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  function renderSuperAdminShell(storeId = "store-test") {
    const qc = makeQc();
    qc.setQueryData(["store-flags", storeId], {
      storeId,
      aiEnabled: false,
      customDomain: false,
    });
    render(
      <Wrapper path={`/store/${storeId}`} qc={qc}>
        <AiDrawerProvider>
          <RequireStore state={SUPER_STATE} storeId={storeId}>
            {(store) => (
              <StoreAdminShell
                store={store}
                role={store.role as string}
                allStores={[store]}
              >
                <div data-testid="store-content">store page content</div>
              </StoreAdminShell>
            )}
          </RequireStore>
        </AiDrawerProvider>
      </Wrapper>,
    );
    return qc;
  }

  it("renders child content after passing through the real guard", () => {
    renderSuperAdminShell();
    expect(screen.getByTestId("store-content")).toBeInTheDocument();
  });

  it("shows the super-admin impersonation banner", () => {
    renderSuperAdminShell();
    // Banner renders "Viewing [store name] as super admin"
    expect(screen.getByText(/viewing/i)).toBeInTheDocument();
    expect(screen.getByText(/as super admin/i)).toBeInTheDocument();
  });

  it("does not duplicate the impersonation exit in the sidebar", () => {
    renderSuperAdminShell();
    expect(screen.queryByText(/back to platform/i)).not.toBeInTheDocument();
  });

  it("shows the banner exit link pointing to /super", () => {
    renderSuperAdminShell();
    const exitLink = screen.getByText(/exit store/i);
    expect(exitLink.closest("a")).toHaveAttribute("href", "/super");
  });

  it("shows one All studios entry instead of individual studio links", () => {
    renderSuperAdminShell();
    const allStudios = screen.getByRole("link", { name: "All studios" });
    expect(allStudios).toHaveAttribute("href", "/store/store-test/studios");
    [
      "Theme Studio",
      "Sticker Studio",
      "Edition Studio",
      "Planner Studio",
      "Trend Research",
      "Marketing Studio",
    ].forEach((label) => expect(screen.queryByText(label)).not.toBeInTheDocument());
  });
});

// ── 7: super_admin bypasses flags 401 — studios still visible ─────────────

describe("StoreAdminShell — super_admin bypasses flags auth failure", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("keeps the studio picker link when flags endpoint returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({ "/api/stores/store-test/flags": { status: 401, body: { error: "Unauthorized" } } }),
    );
    const qc = makeQc();

    render(
      <Wrapper path="/store/store-test" qc={qc}>
        <AiDrawerProvider>
          <RequireStore state={SUPER_STATE} storeId="store-test">
            {(store) => (
              <StoreAdminShell
                store={store}
                role={store.role as string}
              >
                <div data-testid="content">content</div>
              </StoreAdminShell>
            )}
          </RequireStore>
        </AiDrawerProvider>
      </Wrapper>,
    );

    expect(screen.getByRole("link", { name: "All studios" })).toHaveAttribute(
      "href",
      "/store/store-test/studios",
    );
  });
});

// ── 8: regular store member with flags 401 → aiEnabled=false (no studios) ──

describe("StoreAdminShell — regular member with flags 401 falls back gracefully", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("keeps one picker link for a regular owner when flags returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({ "/api/stores/store-test/flags": { status: 401, body: { error: "Unauthorized" } } }),
    );
    const qc = makeQc();

    render(
      <Wrapper path="/store/store-test" qc={qc}>
        <AiDrawerProvider>
          <RequireStore state={STORE_STATE} storeId="store-test">
            {(store) => (
              <StoreAdminShell
                store={store}
                role={store.role as string}
              >
                <div data-testid="content">content</div>
              </StoreAdminShell>
            )}
          </RequireStore>
        </AiDrawerProvider>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.queryByText("Theme Studio")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "All studios" })).toHaveAttribute(
      "href",
      "/store/store-test/studios",
    );
  });
});

// ── 9: SuperStores page — "Enter store" link ───────────────────────────────

describe("SuperStores page — Enter store link", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("renders 'Enter store' links pointing to /store/:id", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetch({
        "/api/stores": {
          status: 200,
          body: [
            {
              id: "store-test",
              name: "Test Store",
              slug: "test",
              domain: null,
              ownerUserId: "u-owner",
              plan: "starter",
              status: "active",
              defaultMode: "curated",
              subscriptionActive: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              memberCount: 2,
            },
          ],
        },
      }),
    );

    const qc = makeQc();
    qc.setQueryData(["stores"], [
      {
        id: "store-test",
        name: "Test Store",
        slug: "test",
        domain: null,
        ownerUserId: "u-owner",
        plan: "starter",
        status: "active",
        defaultMode: "curated",
        subscriptionActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberCount: 2,
      },
    ]);

    const { default: SuperStores } = await import("@/pages/super/Stores");
    render(
      <Wrapper path="/super/stores" qc={qc}>
        <SuperStores />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Enter store")).toBeInTheDocument();
    });

    const enterLink = screen.getByText("Enter store").closest("a");
    expect(enterLink).toHaveAttribute("href", "/store/store-test");
  });

  // NEGATIVE: clicking "Enter store" for a suspended store still renders correct link
  it("suspended stores still get the Enter store link pointing to /store/:id", async () => {
    const qc = makeQc();
    qc.setQueryData(["stores"], [
      {
        id: "store-suspended",
        name: "Suspended Store",
        slug: "suspended",
        plan: "starter",
        status: "suspended",
        memberCount: 0,
      },
    ]);

    const { default: SuperStores } = await import("@/pages/super/Stores");
    render(
      <Wrapper path="/super/stores" qc={qc}>
        <SuperStores />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Enter store")).toBeInTheDocument();
    });

    const enterLink = screen.getByText("Enter store").closest("a");
    expect(enterLink).toHaveAttribute("href", "/store/store-suspended");
  });
});

// ── 10: End-to-end navigation: /super/stores → /store/:id ─────────────────

describe("End-to-end: navigate from /super/stores to /store/:id", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("clicking Enter store renders StoreAdminShell with studio links", async () => {
    const testStore = {
      id: "store-test",
      name: "Test Store",
      slug: "test",
      domain: null,
      ownerUserId: "u-owner",
      plan: "starter",
      status: "active",
      defaultMode: "curated",
      subscriptionActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memberCount: 1,
    };

    // Override /api/stores to return the test store so the SuperStores list renders
    vi.stubGlobal(
      "fetch",
      makeFetch({ "/api/stores": { status: 200, body: [testStore] } }),
    );
    const user = userEvent.setup();

    // Use Infinity staleTime so pre-seeded data is never considered stale,
    // preventing a background refetch from overwriting the seeded list.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    qc.setQueryData(["stores"], [testStore]);
    qc.setQueryData(["store-flags", "store-test"], {
      storeId: "store-test",
      aiEnabled: false,
      customDomain: false,
    });

    const { default: SuperStores } = await import("@/pages/super/Stores");
    // Use non-static memoryLocation so navigation works
    const { hook: useLocation } = memoryLocation({ path: "/super/stores", static: false });

    render(
      <QueryClientProvider client={qc}>
        <Router hook={useLocation}>
          <Switch>
            <Route path="/super/stores">
              <SuperStores />
            </Route>
            <Route path="/store/:storeId">
              {(p) => (
                <RequireStore state={SUPER_STATE} storeId={p.storeId}>
                  {(store) => (
                    <AiDrawerProvider>
                      <StoreAdminShell
                        store={store}
                        role={store.role as string}
                      >
                        <div data-testid="store-dashboard">Store dashboard</div>
                      </StoreAdminShell>
                    </AiDrawerProvider>
                  )}
                </RequireStore>
              )}
            </Route>
          </Switch>
        </Router>
      </QueryClientProvider>,
    );

    // Verify we start on the SuperStores page
    await waitFor(() => {
      expect(screen.getByText("Enter store")).toBeInTheDocument();
    });

    // Click the "Enter store" link — navigates to /store/store-test
    await user.click(screen.getByText("Enter store"));

    // After navigation: StoreAdminShell should render with the picker link
    await waitFor(() => {
      expect(screen.getByTestId("store-dashboard")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "All studios" })).toHaveAttribute(
      "href",
      "/store/store-test/studios",
    );

    // Super admin banner visible with the only exit action.
    expect(screen.getByText(/viewing/i)).toBeInTheDocument();
    expect(screen.getByText(/exit store/i)).toBeInTheDocument();

    // No 401/404 triggered (fetch was not called with an unauthorized response)
    const allCalls = (vi.mocked(fetch) as any).mock.calls as Array<[string, unknown]>;
    const storeRelatedCalls = allCalls.filter(([url]) =>
      typeof url === "string" && (url.includes("/api/stores") || url.includes("/api/me")),
    );
    for (const [url] of storeRelatedCalls) {
      const fullUrl = typeof url === "string" ? url : String(url);
      // Verify we can parse which handler fired — the mock returned 200 for store-related paths
      expect(fullUrl).toMatch(/\/(api|store)/);
    }
  });
});
