/**
 * WorldSmith cover upload — input reset on same-file re-selection
 *
 * Confirms that the onChange handler calls `e.target.value = ""` after every
 * file selection so the browser fires onChange again if the user picks the
 * same file a second time.
 *
 * Strategy: intercept the HTMLInputElement `value` setter with a plain
 * function wrapper (not vi.fn(), which has an incompatible type signature for
 * PropertyDescriptor.set) and count how many times it is called with "".  If
 * `e.target.value = ""` is removed from the component the counter stays at 0
 * and the assertions fail — making these genuine regression guards.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorldSmithHome from "@/pages/super/WorldSmithHome";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRequestUploadUrl, mockDeleteObject, mockApiFetch, mockToast } = vi.hoisted(() => ({
  mockRequestUploadUrl: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockApiFetch: vi.fn(),
  mockToast: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/api", () => ({
  apiFetch: mockApiFetch,
  storageApi: {
    requestUploadUrl: mockRequestUploadUrl,
    deleteObject: mockDeleteObject,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/components/CopilotPanel", () => ({
  CopilotPanel: () => <div data-testid="copilot-panel" />,
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetMe: () => ({
    data: { id: "u-super", name: "Super Admin", platformRole: "super_admin" },
    isLoading: false,
    error: null,
  }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith", vi.fn()],
  useSearch: () => "",
  Link: ({ children, href }: { children: React.ReactNode; href?: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── Test world fixture ────────────────────────────────────────────────────────

const WORLD_ID = "world-test-cover";

const MOCK_WORLD = {
  id: WORLD_ID,
  name: "The Verdant Realms",
  code: "VR",
  description: "A living world of ancient forests.",
  status: "active" as const,
  coverColor: "#2D4A2D",
  coverAccent: "#8FAF6D",
  owner: "u-super",
  tags: [],
  assetCount: 0,
  reviewCount: 0,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const COVER_URL = "/objects/worldsmith/vr/cover.jpg";
const MOCK_WORLD_WITH_COVER = {
  ...MOCK_WORLD,
  coverImageUrl: COVER_URL,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(name = "cover.jpg", type = "image/jpeg"): File {
  return new File(["data"], name, { type });
}

function renderApp(world = MOCK_WORLD) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(["worldsmith/worlds"], { worlds: [world] });
  qc.setQueryData(["worldsmith/assets"], { assets: [] });
  qc.setQueryData(["worldsmith/health"], { integrations: [] });

  return render(
    <QueryClientProvider client={qc}>
      <WorldSmithHome />
    </QueryClientProvider>,
  );
}

async function navigateToWorld(world = MOCK_WORLD): Promise<void> {
  const card = await screen.findByLabelText(`Open ${world.name}`);
  fireEvent.click(card);
}

async function navigateToWorldAndGetInput(world = MOCK_WORLD): Promise<HTMLInputElement> {
  await navigateToWorld(world);
  return screen.findByTestId("cover-file-input") as Promise<HTMLInputElement>;
}

/**
 * Simulate the browser dispatching an onChange event with a file.
 * jsdom does not allow setting files directly; override the descriptor.
 */
function triggerFileChange(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "files", {
    configurable: true,
    value: Object.assign([file], { item: (i: number) => (i === 0 ? file : null) }),
  });
  fireEvent.change(input);
}

// ── Value-setter intercept ────────────────────────────────────────────────────
//
// We need to know when the handler assigns "" to the input value.  We cannot
// use vi.fn() here because its inferred type is incompatible with
// PropertyDescriptor["set"] — the TypeScript compiler rejects the assignment.
// Instead we use a plain closure that accumulates calls.

function installValueSetterSpy(descriptor: PropertyDescriptor): { getResetCount: () => number } {
  let resetCount = 0;

  // Plain function — satisfies PropertyDescriptor["set"] without any cast.
  const spy = function (this: HTMLInputElement, v: string) {
    if (v === "") resetCount += 1;
    descriptor.set!.call(this, v);
  };

  Object.defineProperty(HTMLInputElement.prototype, "value", {
    set: spy,
    get: descriptor.get,
    configurable: true,
  });

  return { getResetCount: () => resetCount };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("cover upload — input reset", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalDescriptor: PropertyDescriptor;
  let getResetCount: () => number;

  beforeEach(() => {
    originalFetch = globalThis.fetch;

    mockRequestUploadUrl.mockResolvedValue({
      uploadURL: "https://storage.example.com/upload",
      objectPath: "/covers/cover.jpg",
    });
    mockDeleteObject.mockResolvedValue(undefined);
    mockApiFetch.mockResolvedValue({ id: WORLD_ID });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    originalDescriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!;
    ({ getResetCount } = installValueSetterSpy(originalDescriptor));
  });

  afterEach(() => {
    Object.defineProperty(HTMLInputElement.prototype, "value", originalDescriptor);
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("resets input.value to '' after a successful upload so the same file can be re-selected", async () => {
    renderApp();
    const input = await navigateToWorldAndGetInput();
    const file = makeFile("photo.jpg");

    // First selection
    triggerFileChange(input, file);
    await waitFor(() => expect(mockRequestUploadUrl).toHaveBeenCalledTimes(1));

    // The setter must have been called with "" — fails if the reset is removed.
    expect(getResetCount()).toBeGreaterThanOrEqual(1);

    const resetAfterFirst = getResetCount();

    // Second selection with the SAME file object — must trigger a second upload.
    triggerFileChange(input, file);
    await waitFor(() => expect(mockRequestUploadUrl).toHaveBeenCalledTimes(2));

    // Reset must have fired again for the second selection.
    expect(getResetCount()).toBeGreaterThan(resetAfterFirst);
  });

  it("resets input.value even after a failed upload so the user can retry with the same file", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    renderApp();
    const input = await navigateToWorldAndGetInput();
    const file = makeFile("photo.jpg");

    // First attempt — PUT fails
    triggerFileChange(input, file);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );

    // Reset must have fired even on the failure path.
    expect(getResetCount()).toBeGreaterThanOrEqual(1);
  });

  it("resets input.value even for a non-image file so the input never gets stuck", async () => {
    renderApp();
    const input = await navigateToWorldAndGetInput();

    // Trigger with a PDF — handleCoverUpload returns early before any API call.
    triggerFileChange(input, makeFile("report.pdf", "application/pdf"));

    await new Promise((r) => setTimeout(r, 50));

    // No upload should have started.
    expect(mockRequestUploadUrl).not.toHaveBeenCalled();
    expect(screen.queryByText("Uploading…")).toBeNull();

    // The reset must still fire so re-selecting any file (including a valid
    // image after a mistaken PDF pick) works correctly.
    expect(getResetCount()).toBeGreaterThanOrEqual(1);
  });

  it("removes the stored cover and reverts the hero to its gradient without reloading", async () => {
    const worldWithoutCover = { ...MOCK_WORLD, coverImageUrl: null };
    mockApiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === `/v1/worldsmith/worlds/${WORLD_ID}` && init?.method === "PATCH") {
        return worldWithoutCover;
      }
      if (path === "/v1/worldsmith/worlds") {
        return { worlds: [worldWithoutCover] };
      }
      return { id: WORLD_ID };
    });

    renderApp(MOCK_WORLD_WITH_COVER);
    await navigateToWorld(MOCK_WORLD_WITH_COVER);

    expect(screen.getByTestId("world-cover-image")).toHaveAttribute(
      "src",
      `/api/storage${COVER_URL}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove cover image" }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/v1/worldsmith/worlds/${WORLD_ID}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ coverImageUrl: null }),
        }),
      );
      expect(mockDeleteObject).toHaveBeenCalledWith(COVER_URL);
      expect(screen.queryByTestId("world-cover-image")).toBeNull();
    });

    // The same mounted hero must now use the world's configured gradient colour.
    expect(screen.getByTestId("world-hero")).toHaveStyle({
      background: MOCK_WORLD.coverColor,
    });
  });
});
