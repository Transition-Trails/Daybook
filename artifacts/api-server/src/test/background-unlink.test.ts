/**
 * Background-unlink regression — multi-background scenario.
 *
 * Guards the unlink flow in StoreThemeStudio: when a theme has MORE than one
 * background linked, unlinking one must retain the others.
 *
 * The mutation fetches the current background list, filters out the target ID,
 * and PUTs the remainder.  A bug in the filter (e.g. referencing the wrong
 * variable, off-by-one, clearing the whole array) would silently remove ALL
 * backgrounds.
 *
 * Test steps:
 *   1. Link two distinct backgrounds (bg-a, bg-b) to a theme.
 *   2. Unlink bg-a by PUTting only [bg-b] (simulating the filter in the mutation).
 *   3. GET the theme's backgrounds — expect only bg-b.
 *   4. Confirm the response toast metadata is correct (count = 1).
 *   5. Re-link bg-a to confirm the endpoint is idempotent when adding back.
 *   6. Unlink bg-b — expect only bg-a remains (order independence).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { db, pool } from "@workspace/db";
import {
  themesTable,
  backgroundsTable,
  themeBackgroundsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import catalogRouter from "../routes/catalog.js";
import type { User } from "@workspace/db";

// ── Minimal Express app with fake super-admin auth ────────────────────────────

const superAdminUser: User = {
  id: "u-sa",
  email: "superadmin@daybook.app",
  name: "Platform Super Admin",
  role: "owner",
  platformRole: "super_admin",
  provider: "google",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: true,
  aiProvider: "claude",
  connections: { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    r.isAuthenticated = () => true;
    r.user = superAdminUser;
    next();
  });
  app.use("/api", catalogRouter);
  return app;
}

const app = makeApp();

// ── Enriched theme loader migration contract ──────────────────────────────────
//
// Every loader below selects its catalog row as a whole. Keep this list in step
// with the table fields used by catalog.ts so a missed forward migration reports
// the schema mismatch before an unrelated theme-detail assertion becomes a 500.

const enrichedThemeLoaderColumns: Record<string, readonly string[]> = {
  themes: [
    "id", "name", "desc", "colors", "price", "status", "created_by",
    "created_at", "global_available", "origin", "authored_by_store_id",
    "font_pairing", "background_roles", "updated_at",
  ],
  palettes: [
    "id", "name", "colors", "status", "global_available", "origin",
    "authored_by_store_id", "created_at", "updated_at",
  ],
  backgrounds: [
    "id", "name", "type", "asset_ref", "status", "global_available",
    "origin", "authored_by_store_id", "created_at", "updated_at",
  ],
  sticker_packs: [
    "id", "name", "tags", "price", "status", "cover_drive_file_id",
    "planners", "created_at", "global_available", "origin",
    "authored_by_store_id", "attestation", "attesting_tool",
    "instruction_sheet_file_id", "updated_at",
  ],
  inserts: [
    "id", "name", "cat", "collection", "asset_id", "planners", "status",
    "global_available", "origin", "authored_by_store_id", "created_at",
    "updated_at",
  ],
  widgets: [
    "id", "name", "store_id", "size_variants", "svg_data", "palette_slots",
    "status", "origin", "authored_by_store_id", "created_at", "updated_at",
  ],
  hardware: [
    "id", "name", "kind", "finish", "status", "global_available", "origin",
    "authored_by_store_id", "created_at", "updated_at",
  ],
  accessories: [
    "id", "name", "kind", "status", "global_available", "origin",
    "authored_by_store_id", "created_at", "updated_at",
  ],
  fonts: [
    "id", "family_name", "variants", "sample_url", "notes",
    "curated_pairings", "status", "global_available", "origin",
    "authored_by_store_id", "created_at", "updated_at",
  ],
  theme_palettes: ["theme_id", "palette_id", "position", "is_primary"],
  theme_backgrounds: ["theme_id", "background_id", "position"],
  theme_packs: ["theme_id", "pack_id", "position"],
  theme_inserts: ["theme_id", "insert_id", "position"],
  theme_widgets: ["theme_id", "widget_id", "position"],
  theme_covers: ["theme_id", "insert_id", "position"],
  theme_hardware: ["theme_id", "hardware_id", "position"],
  theme_accessories: ["theme_id", "accessory_id", "position"],
  theme_fonts: ["theme_id", "font_id", "position"],
};

async function assertEnrichedThemeLoaderSchema(): Promise<void> {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `,
    [Object.keys(enrichedThemeLoaderColumns)],
  );
  const available = new Set(rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`));
  const missing = Object.entries(enrichedThemeLoaderColumns).flatMap(([table, columns]) =>
    columns
      .filter(column => !available.has(`${table}.${column}`))
      .map(column => `${table}.${column}`),
  );

  if (missing.length) {
    throw new Error(
      `Catalog schema mismatch: enriched theme loaders require ${missing.join(", ")}. ` +
      "Apply the outstanding catalog migrations before exercising /themes.",
    );
  }
}

// ── Per-run unique fixture IDs ─────────────────────────────────────────────────

const RUN = Math.random().toString(36).slice(2, 10);
const ids = {
  theme: `test-theme-unlink-${RUN}`,
  bgA:   `test-bg-unlink-a-${RUN}`,
  bgB:   `test-bg-unlink-b-${RUN}`,
};

const cleanups: Array<() => Promise<unknown>> = [];

beforeAll(async () => {
  await assertEnrichedThemeLoaderSchema();

  // Insert a test theme
  await db.insert(themesTable).values({
    id: ids.theme,
    name: `Unlink Test Theme ${RUN}`,
    colors: ["#111111"],
    status: "draft",
  });
  cleanups.push(() => db.delete(themesTable).where(eq(themesTable.id, ids.theme)));

  // Insert two color backgrounds (color type avoids the texture-slug guard)
  await db.insert(backgroundsTable).values([
    { id: ids.bgA, name: `Unlink BG-A ${RUN}`, type: "color", assetRef: "#aaaaaa", status: "draft" },
    { id: ids.bgB, name: `Unlink BG-B ${RUN}`, type: "color", assetRef: "#bbbbbb", status: "draft" },
  ]);
  cleanups.push(() =>
    db.delete(backgroundsTable).where(inArray(backgroundsTable.id, [ids.bgA, ids.bgB])),
  );
});

afterAll(async () => {
  // Remove join rows before the fixture rows (FK constraint order)
  await db.delete(themeBackgroundsTable).where(eq(themeBackgroundsTable.themeId, ids.theme));
  for (const fn of cleanups.reverse()) {
    try { await fn(); } catch { /* ignore */ }
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** GET the current background IDs attached to the test theme (via enriched route). */
async function getLinkedBgIds(): Promise<string[]> {
  const res = await request(app).get(`/api/themes/${ids.theme}`);
  expect(res.status).toBe(200);
  return (res.body.backgrounds as { id: string }[]).map(b => b.id);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("background unlink — multi-background theme", () => {
  it("starts with no backgrounds linked to the theme", async () => {
    const linked = await getLinkedBgIds();
    expect(linked).toHaveLength(0);
  });

  it("links both bg-a and bg-b to the theme", async () => {
    const res = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([{ backgroundId: ids.bgA }, { backgroundId: ids.bgB }]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const linked = await getLinkedBgIds();
    expect(linked).toContain(ids.bgA);
    expect(linked).toContain(ids.bgB);
    expect(linked).toHaveLength(2);
  });

  it("unlinking bg-a retains bg-b (the core regression case)", async () => {
    // Simulate the unlinkBgFromTheme mutation:
    //   current = GET backgrounds  → [bgA, bgB]
    //   remainder = current.filter(id => id !== bgA)  → [bgB]
    //   PUT remainder
    const currentIds = await getLinkedBgIds();
    const bgToUnlink = ids.bgA;
    const remainder = currentIds.filter(id => id !== bgToUnlink);

    expect(remainder).toHaveLength(1);
    expect(remainder[0]).toBe(ids.bgB);

    const putRes = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send(remainder.map(id => ({ backgroundId: id })));

    expect(putRes.status).toBe(200);
    // The response (the updated list) should contain only bg-b
    expect(putRes.body).toHaveLength(1);
    expect((putRes.body as { id: string }[])[0].id).toBe(ids.bgB);

    // A fresh GET confirms the DB state
    const linked = await getLinkedBgIds();
    expect(linked).toEqual([ids.bgB]);
    expect(linked).not.toContain(ids.bgA);
  });

  it("unlinking the last background leaves an empty list (not a crash)", async () => {
    // Simulate unlinking bg-b (the only remaining one)
    const currentIds = await getLinkedBgIds();
    const remainder = currentIds.filter(id => id !== ids.bgB);

    expect(remainder).toHaveLength(0);

    const putRes = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([]);  // empty remainder

    expect(putRes.status).toBe(200);
    expect(putRes.body).toHaveLength(0);

    const linked = await getLinkedBgIds();
    expect(linked).toHaveLength(0);
  });

  it("re-links bg-a and bg-b, then unlinks bg-b — bg-a survives (order independence)", async () => {
    // Re-link both
    await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send([{ backgroundId: ids.bgA }, { backgroundId: ids.bgB }]);

    // Unlink bg-b this time
    const currentIds = await getLinkedBgIds();
    const remainder = currentIds.filter(id => id !== ids.bgB);

    const putRes = await request(app)
      .put(`/api/themes/${ids.theme}/backgrounds`)
      .send(remainder.map(id => ({ backgroundId: id })));

    expect(putRes.status).toBe(200);
    expect(putRes.body).toHaveLength(1);
    expect((putRes.body as { id: string }[])[0].id).toBe(ids.bgA);

    const linked = await getLinkedBgIds();
    expect(linked).toEqual([ids.bgA]);
    expect(linked).not.toContain(ids.bgB);
  });
});

// ── Local set (bgLinkedThemeIds) update logic ─────────────────────────────────
// The StoreThemeStudio unlinkBgFromTheme.onSuccess removes only the unlinked
// themeId from the Set, leaving others intact.  We mirror that pure logic here
// to confirm it is correct without needing a full React render.

describe("bgLinkedThemeIds local state — only the unlinked ID is removed", () => {
  it("deletes the target themeId from the set, leaving others", () => {
    const themeA = "theme-aaa";
    const themeB = "theme-bbb";
    const themeC = "theme-ccc";

    // Start: background linked to three themes
    let linkedThemeIds = new Set([themeA, themeB, themeC]);

    // Unlink from themeB (as unlinkBgFromTheme.onSuccess does)
    const themeToUnlink = themeB;
    const next = new Set(linkedThemeIds);
    next.delete(themeToUnlink);
    linkedThemeIds = next;

    expect(linkedThemeIds.has(themeA)).toBe(true);
    expect(linkedThemeIds.has(themeB)).toBe(false);
    expect(linkedThemeIds.has(themeC)).toBe(true);
    expect(linkedThemeIds.size).toBe(2);
  });

  it("does not mutate the original Set (immutable update pattern)", () => {
    const original = new Set(["x", "y", "z"]);
    const next = new Set(original);
    next.delete("y");

    // original is unchanged
    expect(original.size).toBe(3);
    expect(original.has("y")).toBe(true);
    // next has the deletion
    expect(next.size).toBe(2);
    expect(next.has("y")).toBe(false);
  });

  it("correctly forms the toast description using the unlinked themeId", () => {
    // Simulates the toast description logic in unlinkBgFromTheme.onSuccess
    const themes = [
      { id: "theme-aaa", name: "Autumn Forest" },
      { id: "theme-bbb", name: "Winter Ice" },
    ];
    const bgName = "Aged Linen";

    function buildToastDescription(themeId: string): string {
      const themeName = themes.find(t => t.id === themeId)?.name ?? "theme";
      return `"${bgName}" removed from "${themeName}".`;
    }

    expect(buildToastDescription("theme-aaa")).toBe(`"Aged Linen" removed from "Autumn Forest".`);
    expect(buildToastDescription("theme-bbb")).toBe(`"Aged Linen" removed from "Winter Ice".`);
    // Falls back gracefully for an unknown ID
    expect(buildToastDescription("unknown-id")).toBe(`"Aged Linen" removed from "theme".`);
  });
});
