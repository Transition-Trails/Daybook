import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { describe, expect, it, vi } from "vitest";
import OrderDetail from "@/pages/orders/detail";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  ordersApi: {
    get: vi.fn(async () => ({
      order: {
        id: "order-123",
        storeId: "store-123",
        buyerName: "Test Buyer",
        buyerEmail: "buyer@example.com",
        currency: "usd",
        totalCents: 2500,
        createdAt: "2026-08-27T12:00:00.000Z",
        items: [{ name: "Planner", priceCents: 2500 }],
        receiptSentAt: "2026-08-27T12:01:00.000Z",
        receiptLastError: null,
      },
    })),
    resendReceipt: vi.fn(),
  },
}));

describe("canonical order detail navigation", () => {
  it("returns platform admins to the canonical users list", async () => {
    const location = memoryLocation({
      path: "/super/orders/order-123",
      record: true,
      static: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook}>
          <Route path="/super/orders/:id">
            <OrderDetail />
          </Route>
        </Router>
      </QueryClientProvider>,
    );

    const backLink = await waitFor(() => {
      const link = container.querySelector<HTMLAnchorElement>('a[href="/super/users"]');
      expect(link).not.toBeNull();
      return link!;
    });
    await userEvent.click(backLink);

    expect(location.history?.at(-1)).toBe("/super/users");
  });
});