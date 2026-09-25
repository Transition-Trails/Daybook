import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const { fakeDb, rows } = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  fakeDb: {} as Record<string, any>,
}));

vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  const tableName = (table: any) => table?.[Symbol.for("drizzle:Name")];
  const queryBuilder = () => {
    let result: unknown[] = [];
    const chain: any = {
      from(table: unknown) { result = rows[tableName(table)] ?? []; return chain; },
      where() { return chain; },
      orderBy() { return chain; },
      limit() { return Promise.resolve(result); },
      for() { return chain; },
      set() { return chain; },
      values() { return chain; },
      onConflictDoUpdate() { return chain; },
      returning() { return Promise.resolve(result); },
      then(resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  };
  Object.assign(fakeDb, {
    select: () => queryBuilder(),
    insert: () => queryBuilder(),
    update: () => queryBuilder(),
    transaction: (callback: (tx: unknown) => Promise<unknown>) => callback(fakeDb),
  });
  return { ...actual, db: fakeDb };
});
vi.mock("../lib/auth-middleware.js", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock("../middleware/requireRole.js", () => ({
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { CANON_TOOLS, CanonToolError, executeCanonTool, updateCharacterProfile, validateCharacterProfileChanges } from "../lib/worldsmith/mcp-canon.js";
import worldsmithFoundationRouter from "../routes/worldsmith-foundation.js";

const canonRecord = {
  id: "char-1", worldId: "world-1", name: "Ari", canonType: "character", status: "accepted",
  version: 4, imageGallery: [{ url: "/primary.png", name: "Portrait", description: "" }],
  imageUrls: ["/primary.png"], narrativeDetails: "An archivist", notes: "",
};

function setRows() {
  rows.users = [{ id: "admin-1" }];
  rows.worldsmith_worlds = [{ id: "world-1" }];
  rows.ws_canon_records = [canonRecord];
  rows.ws_character_profiles = [{ recordId: "char-1", schemaVersion: 1, profile: { pronouns: "she/her" } }];
  rows.ws_assets = [{ id: "asset-1", recordId: "char-1", title: "Portrait", objectPath: "/portrait.png" }];
  rows.ws_asset_links = [];
  rows.ws_vocabularies = [];
  rows.ws_vocabulary_options = [];
  rows.mcp_canon_history = [];
}

describe("WorldSmith canon MCP service", () => {
  beforeEach(() => setRows());

  it("publishes exactly the five canon tools and reads complete record details", async () => {
    expect(CANON_TOOLS.map(tool => tool.name)).toEqual([
      "search_canon_records", "get_canon_record", "get_canon_field_options",
      "update_character_attributes", "get_record_change_history",
    ]);
    const result = await executeCanonTool("admin-1", "get_canon_record", { record_id: "char-1" }, "https://editor.example");
    expect(result).toMatchObject({
      record: { id: "char-1", status: "accepted", version: 4 },
      character_profile: { pronouns: "she/her" },
      workflow_status: "accepted",
      linked_images: { gallery: [{ url: "/primary.png" }], assets: [{ id: "asset-1" }] },
    });
  });

  it("maps snake_case vocabulary keys onto camelCase Character fields", async () => {
    rows.ws_vocabularies = [{ id: "v-life", key: "life_stage", label: "Life stage", active: true, worldId: null }];
    rows.ws_vocabulary_options = [{ id: "o-adult", vocabularyId: "v-life", key: "adult", label: "Adult", description: "", active: true, worldId: null }];
    const result = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "character",
    }, "https://editor.example") as {
      fields: Record<string, { choices: Array<{ key: string }>; maxItems?: number }>;
      vocabularies: Array<{ key: string; options: Array<{ key: string }> }>;
    };
    expect(result.fields.lifeStage.choices).toEqual([{ key: "adult", label: "Adult", description: "" }]);
    expect(result.vocabularies[0]?.key).toBe("life_stage");
    expect(result.vocabularies[0]?.options[0]?.key).toBe("adult");
  });

  it("merges a valid partial profile while rejecting unknown and invalid fields", () => {
    expect(validateCharacterProfileChanges({ pronouns: "she/her" }, { lifeStage: "adult" }).profile)
      .toEqual({ pronouns: "she/her", lifeStage: "adult" });
    expect(() => validateCharacterProfileChanges({}, { unknownField: "x" })).toThrow(CanonToolError);
    expect(() => validateCharacterProfileChanges({}, { occupation: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"] }))
      .toThrow(CanonToolError);
    expect(() => validateCharacterProfileChanges({}, { occupation: [{ key: "custom" }] })).toThrow(CanonToolError);
    expect(validateCharacterProfileChanges({}, { occupation: [{ key: "custom", custom: "Archivist of forbidden maps" }] }).profile)
      .toEqual({ occupation: [{ key: "custom", custom: "Archivist of forbidden maps" }] });
  });

  it("rejects stale compare-and-swap versions before mutating profile state", async () => {
    await expect(updateCharacterProfile("admin-1", "char-1", { lifeStage: "adult" }, 3))
      .rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("returns REST 409 for a stale Character profile PUT expected_version", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { id: "admin-1", platformRole: "super_admin" };
      next();
    });
    app.use("/", worldsmithFoundationRouter);
    const response = await request(app)
      .put("/v1/editorial/profiles/character/char-1")
      .send({ world_id: "world-1", expected_version: 3, profile: {} });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("VERSION_CONFLICT");
  });

  it("updates valid typed attributes and increments the record version", async () => {
    rows.ws_vocabularies = [{ id: "v-life", key: "life_stage", label: "Life stage", active: true, worldId: null }];
    rows.ws_vocabulary_options = [{ id: "o-adult", vocabularyId: "v-life", key: "adult", label: "Adult", description: "", active: true, worldId: null }];
    rows.ws_character_profiles = [{ recordId: "char-1", schemaVersion: 7, profile: { pronouns: "she/her" } }];
    const updated = { ...canonRecord, version: 5 };
    // The transaction's CAS update returns its resulting row.
    const originalReturning = fakeDb.update;
    fakeDb.update = () => {
      const builder: any = {
        set: () => builder, where: () => builder, returning: () => Promise.resolve([updated]),
      };
      return builder;
    };
    try {
      const result = await executeCanonTool("admin-1", "update_character_attributes", {
        record_id: "char-1", expected_version: 4, changes: { lifeStage: "adult" },
      }, "https://editor.example");
      expect(result).toMatchObject({ profile: { pronouns: "she/her", lifeStage: "adult" }, version: 5, schema_version: 7 });
      await expect(executeCanonTool("admin-1", "update_character_attributes", {
        record_id: "char-1", expected_version: 4, changes: { lifeStage: "child" },
      }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
    } finally {
      fakeDb.update = originalReturning;
    }
  });

  it("keeps Character profile PUT replacement semantics, including field removal and an empty profile", async () => {
    const originalUpdate = fakeDb.update;
    fakeDb.update = () => {
      const builder: any = { set: () => builder, where: () => builder, returning: () => Promise.resolve([{ ...canonRecord, version: 5 }]) };
      return builder;
    };
    try {
      const clearedField = await updateCharacterProfile("admin-1", "char-1", { lifeStage: "adult" }, undefined, 1, true);
      expect(clearedField.profile).toEqual({ lifeStage: "adult" });
      expect(clearedField.diff.pronouns).toEqual({ before: "she/her", after: null });

      setRows();
      const clearedProfile = await updateCharacterProfile("admin-1", "char-1", {}, undefined, 1, true);
      expect(clearedProfile.profile).toEqual({});
      expect(clearedProfile.diff.pronouns).toEqual({ before: "she/her", after: null });
    } finally {
      fakeDb.update = originalUpdate;
    }
  });
});