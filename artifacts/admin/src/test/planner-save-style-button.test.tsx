/**
 * Planner Studio — Save style button disabled invariant
 *
 * Verifies that the "Save style" button:
 *   - is NOT present in the DOM when template === null
 *     (BuildCenter renders the creation form instead)
 *   - IS present and NOT disabled when a template is selected
 *
 * This prevents a silent data-loss path where a super-admin could click
 * Save with no template selected and receive only an opaque error toast.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BuildCenter } from "@/pages/studios/PlannerStudioHub";
import { type PlatformPlannerConfig } from "@/lib/api";

// ── Module-level mocks ──────────────────────────────────────────────────────

vi.mock("@/contexts/AiDrawerContext", () => ({
  useAiDrawer: () => ({ setAiContext: vi.fn(), clearAiContext: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  catalogApi: {
    themes:   () => Promise.resolve([]),
    packs:    () => Promise.resolve([]),
    inserts:  () => Promise.resolve([]),
    editions: () => Promise.resolve([]),
  },
  platformPlannersApi: {
    create:   vi.fn(),
    patch:    vi.fn(),
    generate: vi.fn(),
    publish:  vi.fn(),
    get:      vi.fn(),
  },
  platformApi: {
    eink: () => Promise.resolve({
      presets: [{
        key: "custom_reader",
        name: "Custom Reader",
        pixelWidth: 1600,
        pixelHeight: 2200,
        trimWidth: 420,
        trimHeight: 580,
        linkSupport: "partial",
        linksQuality: "partial",
        safeInset: 18,
        sellGuidance: "Use the persisted custom profile.",
      }],
      rules: [],
    }),
  },
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/ai", () => ({
  aiApi: { ask: vi.fn() },
  extractJson: vi.fn(),
}));

// Stub wouter so BuildCenter doesn't need a Router context
vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
  useSearch:   () => "",
  Link:        ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub the heavy StudioLayout sub-tree — BuildCenter doesn't use it directly
// but some imported primitives pull in lucide-react which needs no special stub.
vi.mock("@/components/studio/StudioLayout", () => ({
  StudioLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/studio/primitives", () => ({
  SectionLabel:    ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ChipRow:         ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MultiChipRow:    ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) =>
                     <div data-testid="multi-chip-row" />,
  SegmentedControl: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) =>
                     <div data-testid="segmented-control" />,
  EmptyState:      ({ title }: { title: string }) => <div>{title}</div>,
  ErrorState:      ({ title }: { title: string }) => <div>{title}</div>,
  SkeletonRows:    () => <div />,
  RailCard:        ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DockAiAssistant: () => <div />,
  StatusPill:      ({ label }: { label: string }) => <span>{label}</span>,
  ActionChip:      ({ label, onClick }: { label: string; onClick: () => void }) =>
                     <button onClick={onClick}>{label}</button>,
  CHIP_ACTIVE_BG:  "#1B2A4A",
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderBuildCenter(template: PlatformPlannerConfig | null) {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <BuildCenter
        template={template}
        onUpdated={vi.fn()}
        onCreateNew={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function makeTemplate(overrides: Partial<PlatformPlannerConfig> = {}): PlatformPlannerConfig {
  return {
    id:          "tpl-1",
    name:        "2027 Full-Year Planner",
    status:      "draft",
    productType: "planner",
    editionId:   "ed-1",
    generatedAt: null,
    drive:       { pdfFileId: null, configFileId: null },
    setup: {
      weekStart:   "mon",
      orientation: "vertical",
      startMonth:  0,
      startYear:   2027,
      monthCount:  12,
      datingMode:  "dated",
    },
    style:  { themeId: "", paletteId: "", tabPos: "right", sections: [], packIds: [], insertIds: [] },
    output: { calMode: "none", eventMins: 60, aiInPdf: false },
    ...overrides,
  } as unknown as PlatformPlannerConfig;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("BuildCenter — Save style button disabled invariant", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does NOT render a Save style button when template is null", () => {
    renderBuildCenter(null);
    // With no template the creation form is shown — no save path exists
    expect(screen.queryByRole("button", { name: /save style/i })).toBeNull();
  });

  it("renders the Save style button when a template is selected", () => {
    renderBuildCenter(makeTemplate());
    expect(screen.getByRole("button", { name: /save style/i })).toBeTruthy();
  });

  it("Save style button is NOT disabled when a template is selected (initial idle state)", () => {
    renderBuildCenter(makeTemplate());
    const btn = screen.getByRole("button", { name: /save style/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Create template button is disabled when name is empty", () => {
    renderBuildCenter(null);
    const btn = screen.getByRole("button", { name: /create template/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("BuildCenter — Save setup button disabled invariant", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does NOT render a Save setup button when template is null", () => {
    renderBuildCenter(null);
    // Creation form is shown — no setup save path exists
    expect(screen.queryByRole("button", { name: /save setup/i })).toBeNull();
  });

  it("renders the Save setup button when a template is selected", () => {
    renderBuildCenter(makeTemplate());
    expect(screen.getByRole("button", { name: /save setup/i })).toBeTruthy();
  });

  it("Save setup button is NOT disabled when a template is selected (initial idle state, not locked)", () => {
    // generatedAt: null → isLocked = false → disabled = false
    renderBuildCenter(makeTemplate({ generatedAt: null }));
    const btn = screen.getByRole("button", { name: /save setup/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("BuildCenter — Generate button disabled invariant", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does NOT render a Generate button when template is null", () => {
    renderBuildCenter(null);
    // Creation form is shown — no generate path exists
    expect(screen.queryByRole("button", { name: /generate planner/i })).toBeNull();
  });

  it("renders the Generate planner button when a template is selected", () => {
    renderBuildCenter(makeTemplate());
    expect(screen.getByRole("button", { name: /generate planner/i })).toBeTruthy();
  });

  it("Generate planner button is NOT disabled when template has an editionId (initial idle state)", () => {
    // editionId: "ed-1" → !template.editionId = false → disabled = false
    renderBuildCenter(makeTemplate({ editionId: "ed-1" }));
    const btn = screen.getByRole("button", { name: /generate planner/i });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("BuildCenter — persisted E-ink profiles", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("selects a newly persisted profile and sends its key to generation", async () => {
    const { platformPlannersApi } = await import("@/lib/api");
    vi.mocked(platformPlannersApi.generate).mockResolvedValue({
      id: "tpl-1",
      drive: { pdfFileId: "pdf-1", configFileId: null },
      pageCount: 1,
      fileName: "custom-reader.pdf",
    });
    vi.mocked(platformPlannersApi.get).mockResolvedValue(makeTemplate());

    renderBuildCenter(makeTemplate());
    const profile = await screen.findByRole("button", { name: /Custom Reader/i });
    expect(profile.textContent).toContain("420×580 pt");

    await userEvent.click(profile);
    expect(screen.getByText("Use the persisted custom profile.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /^generate/i }));

    await waitFor(() => {
      expect(platformPlannersApi.generate).toHaveBeenCalledWith(
        "tpl-1",
        expect.objectContaining({ einkDevice: "custom_reader", inkFriendly: true }),
      );
    });
  });
});

describe("BuildCenter — Publish button disabled invariant", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does NOT render a Publish button when template is null", () => {
    renderBuildCenter(null);
    // Creation form is shown — no publish path exists
    expect(screen.queryByRole("button", { name: /publish to catalog/i })).toBeNull();
  });

  it("Publish button is present but disabled when pdfFileId is null", () => {
    // drive.pdfFileId === null → PDF not yet generated → must stay blocked
    renderBuildCenter(makeTemplate({ drive: { pdfFileId: null, configFileId: null } }));
    const btn = screen.getByRole("button", { name: /publish to catalog/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("Publish button is present but disabled when template is already published", () => {
    // status === "published" → already live → re-publishing must stay blocked
    renderBuildCenter(makeTemplate({ status: "published", drive: { pdfFileId: "file-1", configFileId: null } }));
    const btn = screen.getByRole("button", { name: /published/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
