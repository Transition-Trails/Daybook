import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/useConsole", () => ({
  useConsole: () => ({
    kind: "super",
    user: { id: "u-super", name: "Platform Admin", platformRole: "super_admin" },
    stores: [],
    primaryStore: undefined,
  }),
}));

vi.mock("@/components/layout/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-shell">{children}</div>
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/layout/GlobalAiDrawer", () => ({
  GlobalAiDrawer: () => null,
}));

vi.mock("@/components/ui/toaster", () => ({
  Toaster: () => null,
}));

vi.mock("@workspace/object-storage-web", () => ({
  ObjectUploader: () => null,
  useUpload: () => ({
    uploadFiles: vi.fn(),
    isUploading: false,
    progress: 0,
  }),
}));

// The redirect test should exercise the real route table without loading the
// data-heavy studio workspaces. Each stub still identifies the workspace that
// a canonical destination is expected to render.
vi.mock("@/pages/studios/ThemeStudioHub", () => ({
  default: () => <div data-testid="studio-workspace">Theme Studio · Compose</div>,
}));

vi.mock("@/pages/studios/PlannerStudioHub", () => ({
  default: () => <div data-testid="studio-workspace">Planner Studio · Editions</div>,
}));

vi.mock("@/pages/studios/MarketingStudioHub", () => ({
  default: () => <div data-testid="studio-workspace">Marketing Studio · Trends</div>,
}));

vi.mock("@/pages/studios/StickerStudioHub", () => ({
  default: () => <div data-testid="studio-workspace">Sticker Studio · Packs</div>,
}));

import App from "@/App";

const BOOKMARKS = [
  {
    legacy: "/studios/theme",
    canonical: "/studios/theme-builder",
    workspace: "Theme Studio · Compose",
  },
  {
    legacy: "/studios/edition",
    canonical: "/studios/planner?mode=editions",
    workspace: "Planner Studio · Editions",
  },
  {
    legacy: "/studios/trends",
    canonical: "/studios/marketing?mode=trends",
    workspace: "Marketing Studio · Trends",
  },
  {
    legacy: "/studios/pack",
    canonical: "/studios/stickers?mode=packs",
    workspace: "Sticker Studio · Packs",
  },
] as const;

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("platform studio bookmark redirects", () => {
  it.each(BOOKMARKS)(
    "takes a signed-in platform admin from $legacy to $canonical",
    async ({ legacy, canonical, workspace }) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      window.history.replaceState({}, "", legacy);

      render(<App />);

      await waitFor(() => {
        expect(`${window.location.pathname}${window.location.search}`).toBe(canonical);
      });
      expect(screen.getByTestId("studio-workspace")).toHaveTextContent(workspace);
      expect(consoleError).not.toHaveBeenCalled();
    },
  );
});