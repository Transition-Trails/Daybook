import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomerAccount from "@/pages/shop/CustomerAccount";

function renderAccount() {
  const location = memoryLocation({ path: "/s/sample/account", record: true, static: false });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook}>
        <Route path="/s/:storeSlug/account"><CustomerAccount /></Route>
      </Router>
    </QueryClientProvider>,
  );
  return location;
}
function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
}

describe("Customer account auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/me") return response({}, 401);
      if (url === "/api/shop/sample") return response({ store: { name: "Sample Shop" } });
      return response({ success: true, message: "Check your inbox." });
    }));
  });

  it("sends the customer login contract and returns to the store", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input, init) => {
      if (String(input) === "/api/auth/customer/login") return response({ id: "c1", name: "Alex", email: "alex@example.com" });
      return String(input) === "/api/auth/me" ? response({}, 401) : String(input) === "/api/shop/sample"
        ? response({ store: { name: "Sample Shop" } }) : response({ success: true });
    });
    const location = renderAccount();
    await userEvent.type(await screen.findByLabelText("Email"), "alex@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secure-pass-123");
    await userEvent.click(screen.getAllByRole("button", { name: /^Sign in$/ }).at(-1)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/customer/login", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alex@example.com", password: "secure-pass-123" }),
    })));
    await waitFor(() => expect(location.history?.at(-1)).toBe("/s/sample"));
  });

  it("sends storeSlug with registration and displays the response message", async () => {
    const fetchMock = vi.mocked(fetch);
    renderAccount();
    await userEvent.click(await screen.findByRole("button", { name: "Create account" }));
    await userEvent.type(screen.getByLabelText("Name"), "Alex Customer");
    await userEvent.type(screen.getByLabelText("Email"), "alex@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "secure-pass-123");
    fireEvent.click(screen.getAllByRole("button", { name: /^Create account$/ }).at(-1)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/customer/register", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ storeSlug: "sample", name: "Alex Customer", email: "alex@example.com", password: "secure-pass-123" }),
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Check your inbox.");
  });

  it("requests a password reset with the current store slug", async () => {
    const fetchMock = vi.mocked(fetch);
    renderAccount();
    await userEvent.click(await screen.findByRole("button", { name: "Forgot password?" }));
    await userEvent.type(screen.getByLabelText("Email"), "alex@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset instructions" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/customer/password-reset/request", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ storeSlug: "sample", email: "alex@example.com" }),
    })));
    expect(await screen.findByRole("status")).toHaveTextContent("Check your inbox.");
  });
});