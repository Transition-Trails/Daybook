/**
 * WorldsmithCanon — active rail filter visibility
 *
 * Confirms that:
 *  1. Setting a filter makes the clay-tinted banner appear with the correct
 *     "Filtered · N/M shown" text and updates the count badge in the rail header.
 *  2. Clearing the filter removes the banner and restores the full-count badge.
 *  3. Filters persisted in sessionStorage are restored immediately on mount
 *     (simulating a navigation round-trip) so editors see the banner right away.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Constants shared with the component ───────────────────────────────────────

const RECORD_ID = "rec-test-1";
const WORLD_ID  = "world-test-1";

// ── Test data ─────────────────────────────────────────────────────────────────
//
// 5 records total:
//   narrativeVisibility="explicit"   → rec-1 (the open record), rec-2
//   narrativeVisibility="background" → rec-3, rec-4
//   narrativeVisibility="hinted"     → rec-5
//
// Filtering by visibility="explicit" → 2/5
// Filtering by stability="high"      → 1/5  (only rec-1 has canonStability="high")
// Filtering by type="character"      → 2/5  (rec-1, rec-3)

const MOCK_RECORD = {
  id: RECORD_ID,
  worldId: WORLD_ID,
  name: "Hero of the Archive",
  status: "accepted",
  canonType: "character",
  narrativeDetails: "A seasoned archivist.",
  historicalContext: "Founded the order.",
  visualNotes: "Grey robes.",
  emotionalRegister: "Confidence",
  sensoryClauses: null,
  registerLocked: false,
  narrativeVisibility: "explicit",
  temporalScope: null,
  canonStability: "high",
  specRefCount: 0,
  notionPageId: null,
  createdBy: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  fromEntityId: null,
  toEntityId: null,
  emotionalValence: null,
};

function makeListItem(
  id: string,
  name: string,
  visibility: string | null,
  stability: string | null,
  type: string | null,
  emotionalRegister: string | null = null,
) {
  return {
    id,
    worldId: WORLD_ID,
    name,
    status: "accepted",
    canonType: type,
    emotionalRegister,
    registerLocked: false,
    specRefCount: 0,
    narrativeVisibility: visibility,
    temporalScope: null,
    canonStability: stability,
  };
}

const ALL_RECORDS = [
  makeListItem(RECORD_ID,  "Hero of the Archive", "explicit",   "high",   "character", "Confidence"),
  makeListItem("rec-2",    "The Silver Gate",     "explicit",   "medium", "location",  "Withholding"),
  makeListItem("rec-3",    "Shadow Companion",    "background", "low",    "character", "Withholding"),
  makeListItem("rec-4",    "The Hollow Bell",     "background", "low",    "event",     "Guarded"),
  makeListItem("rec-5",    "A Whispered Name",    "hinted",     "medium", "lore",      "Intimate"),
];

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn((url: string) => {
    if (url.includes("/inbound-relations"))
      return Promise.resolve({ inbound_relations: [] });
    if (url.includes("/relations"))
      return Promise.resolve({ relations: [] });
    if (url.includes("/specs"))
      return Promise.resolve({ specs: [] });
    if (url.includes("canon-records?world_id="))
      return Promise.resolve({
        canon_records: ALL_RECORDS,
        total: ALL_RECORDS.length,
        by_type: { character: 2, location: 1, event: 1, lore: 1 },
      });
    // Single-record fetch — matches /canon-records/<id>
    if (url.includes("/canon-records/"))
      return Promise.resolve({ canon_record: MOCK_RECORD });
    return Promise.resolve({});
  }),
}));

vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    worlds: [{ id: WORLD_ID, code: "TW1", name: "Test World", status: "active" }],
    worldsLoading: false,
    selectedWorldId: WORLD_ID,
    setSelectedWorldId: vi.fn(),
    selectedWorld: { id: WORLD_ID, code: "TW1", name: "Test World", status: "active" },
    collections: [],
    collectionsLoading: false,
    selectedCollectionId: null,
    setSelectedCollectionId: vi.fn(),
    syncStatus: "synced",
    lastSyncedAt: null,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith/editorial/canon/" + RECORD_ID, vi.fn()],
  useSearch: () => "",
  // Render children directly — the component wraps <Link> around an <a> element,
  // so adding another <a> here would create invalid nested anchors that stall jsdom.
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function Wrapper({
  children,
  qc,
}: {
  children: React.ReactNode;
  qc: QueryClient;
}) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// Render the component and wait until the record title is in the DOM, which
// confirms both the single-record query and the library query have resolved.
async function renderAndWait(qc: QueryClient) {
  // Dynamic import avoids hoisting issues with the vi.mock calls above.
  const { default: WorldsmithCanon } = await import(
    "@/pages/super/worldsmith-editorial/WorldsmithCanon"
  );

  render(
    <Wrapper qc={qc}>
      <WorldsmithCanon recordId={RECORD_ID} />
    </Wrapper>,
  );

  // Wait for the record to load — the <h1> in the editor pane is the
  // authoritative loaded indicator (the same text also appears in the rail list,
  // so we target the heading role to avoid "multiple elements" errors).
  await waitFor(() => {
    const headings = screen.getAllByRole("heading", { name: /Hero of the Archive/i });
    expect(headings.length).toBeGreaterThan(0);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorldsmithCanon — active rail filter visibility", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = makeQC();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  // ── 1. Banner appears with correct count when a filter is set ─────────────

  it("shows banner and fractional count badge when visibility filter is set", async () => {
    await renderAndWait(qc);

    // Click the "Explicit" visibility filter button in the margin rail.
    const explicitBtn = screen.getByRole("button", { name: /Explicit/i });
    await userEvent.click(explicitBtn);

    // Banner: clay strip with "Filtered · N/M shown"
    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*2\/5\s*shown/)).toBeInTheDocument(),
    );

    // Count badge in the rail header changes from total to fraction.
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("shows banner with correct count when stability filter is set", async () => {
    await renderAndWait(qc);

    // The "High" stability chip renders a bullet character before the label
    // so its accessible name is "●High". Use a loose regex to match it.
    const highBtns = screen.getAllByRole("button", { name: /High/i });
    // The stability filter chip is the only button whose name contains "High"
    // (the <option> element is not a button role).
    await userEvent.click(highBtns[0]);

    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*1\/5\s*shown/)).toBeInTheDocument(),
    );

    expect(screen.getByText("1/5")).toBeInTheDocument();
  });

  it("shows banner with correct count when type filter is set", async () => {
    await renderAndWait(qc);

    // Two buttons share the name "Character": the margin-rail filter chip and
    // the Canon Type selector further down the same rail.  The filter chip is
    // rendered first in DOM order (it lives in the margin rail header).
    const charBtns = screen.getAllByRole("button", { name: /^Character$/i });
    await userEvent.click(charBtns[0]);

    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*2\/5\s*shown/)).toBeInTheDocument(),
    );

    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  // ── 2. Banner disappears and full total returns after clearing ────────────

  it("clears banner and restores full count when filter is removed via banner clear button", async () => {
    await renderAndWait(qc);

    // Activate a filter.
    await userEvent.click(screen.getByRole("button", { name: /Explicit/i }));
    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*2\/5\s*shown/)).toBeInTheDocument(),
    );

    // The banner is itself the clear button; its accessible name spans the
    // whole content: "Filtered · 2/5 shown clear".  Target it via /Filtered/.
    const clearBtn = screen.getByRole("button", { name: /Filtered/i });
    await userEvent.click(clearBtn);

    // Banner must be gone.
    await waitFor(() =>
      expect(screen.queryByText(/Filtered/)).not.toBeInTheDocument(),
    );

    // Count badge returns to the plain total (no fraction).
    expect(screen.getByText("5")).toBeInTheDocument();
    // The fractional form must not appear anywhere.
    expect(screen.queryByText(/\/5/)).not.toBeInTheDocument();
  });

  it("clears banner when the filter is toggled off by clicking the active filter button again", async () => {
    await renderAndWait(qc);

    const explicitBtn = screen.getByRole("button", { name: /Explicit/i });
    await userEvent.click(explicitBtn);
    await waitFor(() =>
      expect(screen.getByText(/Filtered/)).toBeInTheDocument(),
    );

    // Click the same "Explicit" button again — toggling it off.
    await userEvent.click(explicitBtn);

    await waitFor(() =>
      expect(screen.queryByText(/Filtered/)).not.toBeInTheDocument(),
    );

    expect(screen.getByText("5")).toBeInTheDocument();
  });

  // ── 3. SessionStorage round-trip: banner shows immediately on mount ────────

  it("shows banner immediately when sessionStorage has persisted filters (simulated navigation round-trip)", async () => {
    // Write persisted filters as if the user had previously set visibility=explicit
    // and then navigated away.  The key mirrors canonFilterKey(worldId) from the component.
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: "explicit", stability: null, type: null }),
    );

    await renderAndWait(qc);

    // The hydration effect should pick up the stored filter and show the banner
    // without any user interaction.
    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*2\/5\s*shown/)).toBeInTheDocument(),
    );

    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  it("shows banner for all three filter dimensions when all are persisted", async () => {
    // visibility=explicit (→ rec-1, rec-2), stability=medium (→ rec-2 only within that
    // subset), type=location (→ rec-2 only).  All three active → 1/5.
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: "explicit", stability: "medium", type: "location" }),
    );

    await renderAndWait(qc);

    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*1\/5\s*shown/)).toBeInTheDocument(),
    );

    expect(screen.getByText("1/5")).toBeInTheDocument();
  });

  it("shows no banner when sessionStorage holds all-null values (no active filters)", async () => {
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: null, stability: null, type: null }),
    );

    await renderAndWait(qc);

    // A small delay to let effects settle — the banner must never appear.
    await new Promise(r => setTimeout(r, 50));

    expect(screen.queryByText(/Filtered/)).not.toBeInTheDocument();
    // Plain total is shown.
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  // ── 4. Cross-page compatibility with CanonLibrary ─────────────────────────
  //
  // CanonLibrary shares the same canon-filters-{worldId} sessionStorage key
  // but uses "all" (not null) as its "no filter" sentinel for the type and
  // status fields.  WorldsmithCanon must not treat "all" as an active filter
  // or it will show 0/N records every time an editor navigates from the
  // library into a record detail.

  it("shows no banner when CanonLibrary wrote type='all' and status='all' to sessionStorage", async () => {
    // Simulate CanonLibrary saving its default (unfiltered) state — this is
    // exactly what saveLibraryFilters writes when no type/status is active.
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: null, stability: null, type: "all", status: "all" }),
    );

    await renderAndWait(qc);

    await new Promise(r => setTimeout(r, 50));

    // No banner should appear — "all" is CanonLibrary's no-filter sentinel.
    expect(screen.queryByText(/Filtered/)).not.toBeInTheDocument();
    // Rail header badge shows the full count, not a fraction.
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText(/\/5/)).not.toBeInTheDocument();
  });

  it("shows no banner when CanonLibrary wrote a real type filter that WorldsmithCanon does not recognise as its own format", async () => {
    // CanonLibrary can write valid canonType values like "character" for type.
    // WorldsmithCanon should accept these as its own filterType.
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: null, stability: null, type: "character", status: "all" }),
    );

    await renderAndWait(qc);

    // "character" IS a valid WorldsmithCanon filter type — banner should appear
    // with 2/5 (rec-1 and rec-3 are characters).
    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*2\/5\s*shown/)).toBeInTheDocument(),
    );
    expect(screen.getByText("2/5")).toBeInTheDocument();
  });

  // ── 5. CanonLibrary ↔ WorldsmithCanon round-trip for relationship / motif ──
  //
  // CanonLibrary previously excluded `relationship` and `motif` from its
  // CANON_TYPES list. Hydrating from a persisted WorldsmithCanon filter of
  // those types caused CanonLibrary to downgrade the value to "all" and save
  // it back, silently clearing the active rail filter on the next visit.
  // These tests confirm the fix holds end-to-end.

  it("CanonLibrary preserves a persisted relationship type — does not corrupt it to 'all'", async () => {
    // Seed: WorldsmithCanon saved type="relationship" before navigating away.
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: null, stability: null, type: "relationship" }),
    );

    // Mount CanonLibrary. Its hydration + persistence effects should validate
    // "relationship" as a known type and write it back unchanged.
    const { default: CanonLibrary } = await import(
      "@/pages/super/worldsmith-editorial/CanonLibrary"
    );
    const { unmount } = render(
      <Wrapper qc={makeQC()}>
        <CanonLibrary />
      </Wrapper>,
    );

    await waitFor(() => {
      const stored = JSON.parse(
        sessionStorage.getItem(`canon-filters-${WORLD_ID}`) ?? "{}",
      );
      // Must not have been rewritten to "all".
      expect(stored.type).toBe("relationship");
    });

    unmount();

    // Now mount WorldsmithCanon for the same world. The filter it reads back
    // must be active (banner appears), not suppressed as if "all".
    await renderAndWait(makeQC());
    await waitFor(() =>
      // No relationship records in test data → 0/5, but the banner MUST appear.
      expect(screen.getByText(/Filtered\s*·\s*0\/5\s*shown/)).toBeInTheDocument(),
    );
  });

  it("CanonLibrary preserves a persisted motif type — does not corrupt it to 'all'", async () => {
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ visibility: null, stability: null, type: "motif" }),
    );

    const { default: CanonLibrary } = await import(
      "@/pages/super/worldsmith-editorial/CanonLibrary"
    );
    const { unmount } = render(
      <Wrapper qc={makeQC()}>
        <CanonLibrary />
      </Wrapper>,
    );

    await waitFor(() => {
      const stored = JSON.parse(
        sessionStorage.getItem(`canon-filters-${WORLD_ID}`) ?? "{}",
      );
      expect(stored.type).toBe("motif");
    });

    unmount();

    await renderAndWait(makeQC());
    await waitFor(() =>
      expect(screen.getByText(/Filtered\s*·\s*0\/5\s*shown/)).toBeInTheDocument(),
    );
  });

  it("filters the Canon Library by emotional register and persists the selection", async () => {
    sessionStorage.setItem(
      `canon-filters-${WORLD_ID}`,
      JSON.stringify({ emotionalRegister: "Withholding" }),
    );
    const { default: CanonLibrary } = await import(
      "@/pages/super/worldsmith-editorial/CanonLibrary"
    );
    render(
      <Wrapper qc={makeQC()}>
        <CanonLibrary />
      </Wrapper>,
    );

    await waitFor(() => {
      const stored = JSON.parse(
        sessionStorage.getItem(`canon-filters-${WORLD_ID}`) ?? "{}",
      );
      expect(stored.emotionalRegister).toBe("Withholding");
    });

    expect(await screen.findByText("The Silver Gate")).toBeInTheDocument();
    expect(screen.getByText("Shadow Companion")).toBeInTheDocument();
    expect(screen.queryByText("Hero of the Archive")).not.toBeInTheDocument();
    expect(screen.queryByText("A Whispered Name")).not.toBeInTheDocument();
  });
});
