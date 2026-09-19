/**
 * CanonLibrary — emotional register badges
 *
 * Keeps the shared card/table register treatment aligned with the canonical
 * palette, while ensuring incomplete or stale register values stay invisible.
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

const { WORLD_ID, records } = vi.hoisted(() => {
  const WORLD_ID = "world-register-badges";
  const records = [
    {
      id: "record-confidence",
      worldId: WORLD_ID,
      name: "The Archive Keeper",
      status: "accepted",
      canonType: "character",
      narrativeDetails: "Keeps the world’s oldest stories.",
      historicalContext: "",
      visualNotes: "",
      emotionalRegister: "Confidence",
      narrativeVisibility: null,
      canonStability: null,
      specRefCount: 0,
      portraitUrl: "/objects/archive-keeper",
      updatedAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "record-null",
      worldId: WORLD_ID,
      name: "Unsettled Record",
      status: "accepted",
      canonType: "lore",
      narrativeDetails: "",
      historicalContext: "",
      visualNotes: "",
      emotionalRegister: null,
      narrativeVisibility: null,
      canonStability: null,
      specRefCount: 0,
      portraitUrl: null,
      updatedAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "record-empty",
      worldId: WORLD_ID,
      name: "Unlabeled Record",
      status: "accepted",
      canonType: "lore",
      narrativeDetails: "",
      historicalContext: "",
      visualNotes: "",
      emotionalRegister: "",
      narrativeVisibility: null,
      canonStability: null,
      specRefCount: 0,
      portraitUrl: null,
      updatedAt: "2025-01-01T00:00:00Z",
    },
    {
      id: "record-unknown",
      worldId: WORLD_ID,
      name: "Legacy Register Record",
      status: "accepted",
      canonType: "lore",
      narrativeDetails: "",
      historicalContext: "",
      visualNotes: "",
      emotionalRegister: "Unrecognized",
      narrativeVisibility: null,
      canonStability: null,
      specRefCount: 0,
      portraitUrl: null,
      updatedAt: "2025-01-01T00:00:00Z",
    },
  ];

  return { WORLD_ID, records };
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(() => Promise.resolve({
    canon_records: records,
    total: records.length,
    by_type: { character: 1, lore: 3 },
  })),
}));

vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: WORLD_ID,
    selectedWorld: { id: WORLD_ID, name: "Badge Test World" },
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith/editorial/canon", vi.fn()],
  useSearch: () => "",
}));

import CanonLibrary from "@/pages/super/worldsmith-editorial/CanonLibrary";

function renderLibrary() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CanonLibrary />
    </QueryClientProvider>,
  );
}

function expectConfidenceBadge(scope: HTMLElement) {
  const badge = within(scope).getByText("Confidence");
  expect(badge).toHaveStyle({
    background: "#F7EDE8",
    color: "#C87560",
  });
}

describe("CanonLibrary emotional register badges", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(apiFetch).mockResolvedValue({
      canon_records: records,
      total: records.length,
      by_type: { character: 1, lore: 3 },
    });
  });
  afterEach(() => sessionStorage.clear());

  it("renders the Confidence label and canonical palette in card and table views", async () => {
    renderLibrary();

    await waitFor(() => expect(screen.getByText("The Archive Keeper")).toBeInTheDocument());
    expect(screen.queryByText("Build Your Canon Library")).not.toBeInTheDocument();

    const card = screen.getByText("The Archive Keeper").closest('[role="button"]');
    expect(card).not.toBeNull();
    expectConfidenceBadge(card!);

    fireEvent.click(screen.getByRole("button", { name: "Show table view" }));

    const row = screen.getByText("The Archive Keeper").closest("tr");
    expect(row).not.toBeNull();
    expectConfidenceBadge(row!);
  });

  it("shows saved portraits and falls back to the default thumbnail when an image fails", async () => {
    renderLibrary();

    const portrait = await screen.findByRole("img", { name: "The Archive Keeper thumbnail" });
    expect(portrait).toHaveAttribute("src", "/api/storage/objects/archive-keeper");
    expect(screen.getByTestId("canon-thumbnail-record-confidence")).toHaveClass("aspect-square");
    expect(screen.getByRole("img", { name: "Default thumbnail for Unsettled Record" })).toBeInTheDocument();

    fireEvent.error(portrait);

    expect(screen.getByRole("img", { name: "Default thumbnail for The Archive Keeper" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "The Archive Keeper thumbnail" })).not.toBeInTheDocument();
  });

  it("groups the card grid by record type with counts and omits empty groups", async () => {
    renderLibrary();

    const characterGroup = await screen.findByRole("region", { name: "Character" });
    const loreGroup = screen.getByRole("region", { name: "Lore" });

    expect(within(characterGroup).getByText("1")).toBeInTheDocument();
    expect(within(characterGroup).getByText("The Archive Keeper")).toBeInTheDocument();
    expect(within(loreGroup).getByText("3")).toBeInTheDocument();
    expect(within(loreGroup).getByText("Unsettled Record")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Location" })).not.toBeInTheDocument();
  });

  it("collapses a type section from its accessible header while keeping the count visible", async () => {
    renderLibrary();

    const characterGroup = await screen.findByRole("region", { name: "Character" });
    const header = within(characterGroup).getByRole("button", { name: "Character, 1 record" });

    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(header).toHaveAttribute("aria-controls", "canon-group-content-character");
    expect(within(characterGroup).getByText("The Archive Keeper")).toBeInTheDocument();

    fireEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(within(characterGroup).getByText("1")).toBeInTheDocument();
    expect(within(characterGroup).queryByText("The Archive Keeper")).not.toBeInTheDocument();
  });

  it("remembers collapsed sections for the current world during the browser session", async () => {
    const firstRender = renderLibrary();
    const header = await screen.findByRole("button", { name: "Character, 1 record" });
    fireEvent.click(header);

    expect(sessionStorage.getItem(`canon-collapsed-sections-${WORLD_ID}`)).toBe(
      JSON.stringify(["character"]),
    );

    firstRender.unmount();
    renderLibrary();

    const restoredHeader = await screen.findByRole("button", { name: "Character, 1 record" });
    expect(restoredHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("The Archive Keeper")).not.toBeInTheDocument();
    expect(screen.getByText("Unsettled Record")).toBeInTheDocument();
  });

  it("shows a flat card grid when a single record type is selected", async () => {
    sessionStorage.setItem(`canon-filters-${WORLD_ID}`, JSON.stringify({
      type: "character",
      status: "all",
      search: "",
      visibility: null,
      stability: null,
      emotionalRegister: "all",
    }));

    renderLibrary();

    expect(await screen.findByText("The Archive Keeper")).toBeInTheDocument();
    expect(screen.queryByText("Unsettled Record")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Character" })).not.toBeInTheDocument();
  });

  it("does not render badges for null, empty, or unrecognized register values in either view", async () => {
    renderLibrary();

    await waitFor(() => expect(screen.getByText("Unsettled Record")).toBeInTheDocument());

    for (const name of ["Unsettled Record", "Unlabeled Record", "Legacy Register Record"]) {
      const card = screen.getByText(name).closest('[role="button"]');
      expect(card).not.toBeNull();
      expect(within(card!).queryByText(/null|unrecognized/i)).not.toBeInTheDocument();
      const badgeGroup = card!.firstElementChild?.firstElementChild;
      expect(badgeGroup).not.toBeNull();
      expect(badgeGroup!.childElementCount).toBe(1);
    }

    fireEvent.click(screen.getByRole("button", { name: "Show table view" }));

    for (const name of ["Unsettled Record", "Unlabeled Record", "Legacy Register Record"]) {
      const row = screen.getByText(name).closest("tr");
      expect(row).not.toBeNull();
      expect(within(row!).queryByText(/null|unrecognized/i)).not.toBeInTheDocument();
      expect(within(row!).getAllByRole("cell")[4]).toBeEmptyDOMElement();
    }
  });

  it("shows a retry state rather than the empty-world launcher when records cannot load", async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Network unavailable"));
    renderLibrary();

    expect(await screen.findByText("We couldn’t load your canon records.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Build Your Canon Library")).not.toBeInTheDocument();
  });
});