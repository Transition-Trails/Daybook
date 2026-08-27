import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SuperFeatureFlags from "@/pages/super/FeatureFlags";

describe("feature flag rows", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("exposes one-line store rows as named controls and opens the matching drawer", async () => {
    const store = {
      id: "long-store",
      name: "A deliberately long store name that needs truncation",
      slug: "long-store",
      domain: null,
      ownerUserId: "owner",
      plan: "starter",
      status: "trial",
      isSeed: false,
      defaultMode: "curated",
      subscriptionActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/api/stores/flags")
        ? [{
            storeId: store.id,
            aiEnabled: false,
            customDomain: false,
            editionsCap: 5,
            storageQuota: 1024,
            inkEnabled: false,
            worldsmithEnabled: false,
          }]
        : [store];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <SuperFeatureFlags />
      </QueryClientProvider>,
    );

    const row = await screen.findByRole("button", {
      name: `Edit feature flags for ${store.name}`,
    });
    expect(row).toHaveClass("min-h-14");
    await userEvent.click(row);
    expect(screen.getByRole("heading", { name: store.name })).toBeInTheDocument();
  });
});