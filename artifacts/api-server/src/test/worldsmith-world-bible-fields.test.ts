/**
 * WorldSmith — World Bible field persistence regression tests.
 *
 * Exercises `buildEnrichedWorld` — the actual function called by
 * GET /v1/worldsmith/worlds — rather than a locally duplicated mapper.
 *
 * Regression guard: before the fix that introduced this helper, the enriched
 * response omitted all five World Bible fields.  WorldSmithHome received them
 * as `undefined`, initialised the settings form with empty strings / [], and a
 * save of any unrelated setting silently overwrote stored aesthetic identity
 * with nulls.
 */

import { describe, it, expect } from "vitest";
import { buildEnrichedWorld } from "../routes/worldsmith.js";
import type { AssetCountRow } from "../routes/worldsmith.js";

// ---------------------------------------------------------------------------
// Minimal DB row fixture — only the fields the enrichment function accesses.
// ---------------------------------------------------------------------------

type WorldRow = Parameters<typeof buildEnrichedWorld>[0];

function makeWorldRow(overrides: Partial<WorldRow> = {}): WorldRow {
  return {
    id: "world-001",
    name: "Thornvale",
    code: "THV",
    description: "A world of mist and memory",
    status: "active",
    coverColor: "#1B2A4A",
    coverAccent: "#C87560",
    currentCollection: "autumn",
    currentVolume: "Vol I",
    owner: "editor-1",
    tags: ["fantasy"],
    notionProductionDbId: "notion-db-id",
    notionCanonDbId: null,
    notionStyleGuideId: null,
    notionStyleGuidesDbId: null,
    styleGuideVersion: 1,
    driveFolderId: "drive-id",
    imageProvider: "dalle",
    createdBy: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    visualPalette: "Muted amber, deep slate, bone white. Light always arrives oblique.",
    proseVoice: "Close third-person, past tense. Short declarative sentences under pressure.",
    atmosphericNotes: "Persistent low damp. Smoke and mildew undercut every interior.",
    materialWorld: "Worn leather, tallow candles, iron rivets, stone that never fully dries.",
    worldRules: ["No magic north of the Ridgeline", "Time moves faster in the Undercroft"],
    coverImageUrl: null,
    ...overrides,
  };
}

const NO_ASSETS: AssetCountRow[] = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildEnrichedWorld — World Bible fields in GET /v1/worldsmith/worlds", () => {
  it("preserves all four text aesthetic fields verbatim", () => {
    const row = makeWorldRow();
    const enriched = buildEnrichedWorld(row, NO_ASSETS);

    expect(enriched.visualPalette).toBe(row.visualPalette);
    expect(enriched.proseVoice).toBe(row.proseVoice);
    expect(enriched.atmosphericNotes).toBe(row.atmosphericNotes);
    expect(enriched.materialWorld).toBe(row.materialWorld);
  });

  it("preserves the worldRules array in full and in order", () => {
    const row = makeWorldRow();
    const enriched = buildEnrichedWorld(row, NO_ASSETS);

    expect(enriched.worldRules).toEqual(row.worldRules);
    expect(enriched.worldRules).toHaveLength(2);
    expect(enriched.worldRules[0]).toBe("No magic north of the Ridgeline");
    expect(enriched.worldRules[1]).toBe("Time moves faster in the Undercroft");
  });

  it("includes all five World Bible keys even when all values are null / empty", () => {
    const row = makeWorldRow({
      visualPalette: null,
      proseVoice: null,
      atmosphericNotes: null,
      materialWorld: null,
      worldRules: [],
    });

    const enriched = buildEnrichedWorld(row, NO_ASSETS);

    // Keys must be present so WorldSmithHome can distinguish "not configured"
    // from "never returned". Absent keys cause the form to initialise as
    // `undefined`, which the save mutation treats as a clear instruction to
    // null the field — silently overwriting existing aesthetic identity.
    expect(Object.prototype.hasOwnProperty.call(enriched, "visualPalette")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "proseVoice")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "atmosphericNotes")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "materialWorld")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(enriched, "worldRules")).toBe(true);

    expect(enriched.visualPalette).toBeNull();
    expect(enriched.worldRules).toHaveLength(0);
  });

  it("does not truncate long aesthetic text values", () => {
    const longText = "A".repeat(2000);
    const enriched = buildEnrichedWorld(makeWorldRow({ visualPalette: longText }), NO_ASSETS);

    expect(enriched.visualPalette).toHaveLength(2000);
    expect(enriched.visualPalette).toBe(longText);
  });

  it("resolves asset stats by world code (case-insensitive) while preserving World Bible fields", () => {
    const assets: AssetCountRow[] = [
      { world: "thv", total: 12, underReview: 3 },
    ];
    const enriched = buildEnrichedWorld(makeWorldRow(), assets);

    expect(enriched.assetCount).toBe(12);
    expect(enriched.reviewCount).toBe(3);
    // Aesthetic fields must survive alongside the stats merge
    expect(enriched.visualPalette).toBeTruthy();
    expect(enriched.worldRules).toHaveLength(2);
  });

  it("falls back to zero stats when no asset row matches — fields still present", () => {
    const assets: AssetCountRow[] = [
      { world: "OTHER", total: 99, underReview: 5 },
    ];
    const enriched = buildEnrichedWorld(makeWorldRow(), assets);

    expect(enriched.assetCount).toBe(0);
    expect(enriched.reviewCount).toBe(0);
    expect(enriched.visualPalette).toBeTruthy();
  });
});
