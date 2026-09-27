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
    delete: () => queryBuilder(),
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

async function withSuccessfulMetadataUpdate(run: () => Promise<void>) {
  const originalUpdate = fakeDb.update;
  fakeDb.update = () => {
    const builder: any = {
      set: () => builder,
      where: () => builder,
      returning: () => Promise.resolve([{ ...rows.ws_canon_records[0] as object, version: 5 }]),
    };
    return builder;
  };
  try { await run(); } finally { fakeDb.update = originalUpdate; }
}

describe("WorldSmith canon MCP service", () => {
  beforeEach(() => setRows());

  it("publishes Canon read, profile, and field-level metadata tools", async () => {
    expect(CANON_TOOLS.map(tool => tool.name)).toEqual([
      "search_canon_records", "get_canon_record", "get_canon_field_options",
      "update_canon_metadata", "update_canon_record", "get_record_change_history",
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
    expect(result.fields.lifeStage.choices).toContainEqual({ key: "adult", label: "Adult", description: "" });
    expect(result.vocabularies[0]?.key).toBe("life_stage");
    expect(result.vocabularies[0]?.options[0]?.key).toBe("adult");
  });

  it("discovers global metadata and type-specific structured paths for every Canon type", async () => {
    const expected: Record<string, string> = {
      character: "pronouns", location: "locationScale", object: "objectClass",
      event: "eventType", lore: "loreType", atmosphere: "emotionalRegister",
      material: "rarity", relationship: "relationshipType", motif: "motifClass",
    };
    for (const [canonType, firstField] of Object.entries(expected)) {
      const result = await executeCanonTool("admin-1", "get_canon_field_options", {
        world_id: "world-1", canon_type: canonType,
      }, "https://editor.example") as any;
      expect(result.paths.global_metadata.storage_path).toContain("global_metadata");
      expect(result.paths.global_metadata.fields.stability.path).toBe("globalMetadata.stability");
      expect(result.paths.structured_profile.fields[firstField].path).toBe(`structuredProfile.${firstField}`);
      expect(result.paths.structured_profile.fields[firstField].type).toBeTruthy();
      expect(result.paths.structured_profile.fields[firstField].fallback_choices.length).toBeGreaterThan(0);
      expect(result.paths.direct_columns).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "canon_stability", note: expect.stringContaining("distinct") }),
      ]));
    }
    await expect(executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "unknown",
    }, "https://editor.example")).rejects.toMatchObject({ code: "UNSUPPORTED_CANON_TYPE" });
  });

  it("offers and accepts the Object choices shown by its record-type schema without database vocabularies", async () => withSuccessfulMetadataUpdate(async () => {
    rows.ws_canon_records = [{ ...canonRecord, canonType: "object", structuredProfile: {}, globalMetadata: {} }];
    const options = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "object",
    }, "https://editor.example") as any;
    const fields = options.paths.structured_profile.fields;
    expect(options.paths.global_metadata.fields.importance.choices)
      .toContainEqual(expect.objectContaining({ key: "central", allowed: true, source: "api_default" }));
    for (const [name, keys] of Object.entries({
      objectClass: ["documentary"],
      scale: ["portable"],
      material: ["paper", "leather"],
      authenticity: ["original"],
      storyFunction: ["evidence", "record"],
    })) {
      for (const key of keys) {
        expect(fields[name].choices).toContainEqual(expect.objectContaining({ key, source: "api_default", allowed: true }));
        expect(fields[name].fallback_choices).toContainEqual(expect.objectContaining({ key, allowed: true }));
      }
    }
    await expect(executeCanonTool("admin-1", "update_canon_metadata", {
      record_id: "char-1", expected_version: 4,
      changes: { global_metadata: { importance: "central" }, structured_profile: {
        objectClass: "documentary", scale: "portable", material: ["paper", "leather"],
        authenticity: "original", storyFunction: ["evidence", "record"],
      } },
    }, "https://editor.example")).resolves.toBeTruthy();
    await expect(executeCanonTool("admin-1", "update_canon_metadata", {
      record_id: "char-1", expected_version: 4,
      changes: { structured_profile: { objectClass: "organic" } },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
  }));

  it("uses the same defaults for other Canon types and lets world options override or extend them", async () => withSuccessfulMetadataUpdate(async () => {
    for (const [canonType, field, value] of [
      ["character", "pronouns", "she_her"],
      ["location", "locationScale", "estate"],
      ["event", "eventType", ["discovery"]],
      ["lore", "loreType", ["legend"]],
      ["relationship", "relationshipType", ["friend"]],
      ["material", "material", ["brittle"]],
      ["atmosphere", "intensity", "moderate"],
      ["motif", "recurrence", "regular"],
    ] as const) {
      rows.ws_canon_records = [{ ...canonRecord, canonType, structuredProfile: {} }];
      const options = await executeCanonTool("admin-1", "get_canon_field_options", {
        world_id: "world-1", canon_type: canonType,
      }, "https://editor.example") as any;
      expect(options.paths.structured_profile.fields[field].choices)
        .toContainEqual(expect.objectContaining({ key: Array.isArray(value) ? value[0] : value, allowed: true }));
      await expect(executeCanonTool("admin-1", "update_canon_metadata", {
        record_id: "char-1", expected_version: 4, changes: { structured_profile: { [field]: value } },
      }, "https://editor.example")).resolves.toBeTruthy();
    }

    rows.ws_canon_records = [{ ...canonRecord, canonType: "object", structuredProfile: {} }];
    rows.ws_vocabularies = [{ id: "world-material", key: "material", recordType: "object", worldId: "world-1", active: true }];
    rows.ws_vocabulary_options = [
      { id: "disabled-paper", vocabularyId: "world-material", key: "paper", label: "Paper retired", active: false, worldId: "world-1" },
      { id: "world-parchment", vocabularyId: "world-material", key: "parchment", label: "Parchment", active: true, worldId: "world-1" },
    ];
    const options = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "object",
    }, "https://editor.example") as any;
    expect(options.paths.structured_profile.fields.material.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "paper", allowed: false, label: "Paper retired" }),
      expect.objectContaining({ key: "leather", allowed: true, source: "api_default" }),
      expect.objectContaining({ key: "parchment", allowed: true, source: "world" }),
    ]));
    await expect(executeCanonTool("admin-1", "update_canon_metadata", {
      record_id: "char-1", expected_version: 4, changes: { structured_profile: { material: ["paper"] } },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
    await expect(executeCanonTool("admin-1", "update_canon_metadata", {
      record_id: "char-1", expected_version: 4, changes: { structured_profile: { material: ["leather", "parchment"] } },
    }, "https://editor.example")).resolves.toBeTruthy();
  }));

  it("reports scoped and inactive vocabulary choices without treating them as writable", async () => {
    rows.ws_vocabularies = [
      { id: "global-importance", key: "importance", label: "Importance", active: true, worldId: null },
      { id: "world-importance", key: "importance", label: "Importance", active: true, worldId: "world-1" },
      { id: "inactive-vocab", key: "importance", label: "Inactive scoped vocabulary", active: false, worldId: "world-1" },
    ];
    rows.ws_vocabulary_options = [
      { id: "global", vocabularyId: "global-importance", key: "central", label: "Central", description: "", active: true, worldId: null },
      { id: "world", vocabularyId: "world-importance", key: "local", label: "Local", description: "", active: true, worldId: "world-1" },
      { id: "inactive", vocabularyId: "world-importance", key: "retired", label: "Retired", description: "", active: false, worldId: "world-1" },
      { id: "active-option-in-inactive-vocab", vocabularyId: "inactive-vocab", key: "inactive-vocab-choice", label: "Inactive vocabulary choice", description: "", active: true, worldId: "world-1" },
    ];
    const result = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "location",
    }, "https://editor.example") as any;
    const options = result.paths.global_metadata.fields.importance.choices;
    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "central", source: "global", active: true, allowed: true }),
      expect.objectContaining({ key: "local", source: "world", active: true, allowed: true }),
      expect.objectContaining({ key: "retired", source: "world", active: false, allowed: false }),
      expect.objectContaining({ key: "inactive-vocab-choice", vocabulary_active: false, active: true, allowed: false }),
    ]));
  });

  it("preserves global and world entries for same-key Character vocabularies", async () => {
    rows.ws_vocabularies = [
      { id: "global-life-stage", key: "life_stage", label: "Global life stage", description: "Global description", scope: "global", active: true, worldId: null, version: 2 },
      { id: "world-life-stage", key: "life_stage", label: "World life stage", description: "World description", scope: "world", active: true, worldId: "world-1", version: 3 },
    ];
    rows.ws_vocabulary_options = [
      { id: "global-adult", vocabularyId: "global-life-stage", key: "adult", label: "Adult", description: "", active: true, worldId: null, version: 1, displayOrder: 1 },
      { id: "world-elder", vocabularyId: "world-life-stage", key: "elder", label: "Elder", description: "", active: true, worldId: "world-1", version: 1, displayOrder: 1 },
    ];
    const result = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "character",
    }, "https://editor.example") as any;
    const lifeStageVocabularies = result.vocabularies.filter((vocabulary: any) => vocabulary.key === "life_stage");
    expect(lifeStageVocabularies).toHaveLength(2);
    expect(lifeStageVocabularies.map((vocabulary: any) => vocabulary.world_id)).toEqual([null, "world-1"]);
    expect(lifeStageVocabularies.map((vocabulary: any) => vocabulary.description)).toEqual(["Global description", "World description"]);
    expect(lifeStageVocabularies[0].options.map((option: any) => option.key)).toContain("adult");
    expect(lifeStageVocabularies[1].options.map((option: any) => option.key)).toContain("elder");
    expect(result.fields.lifeStage.choices.map((choice: any) => choice.key)).toEqual(expect.arrayContaining(["adult", "elder"]));
    expect(lifeStageVocabularies.map((vocabulary: any) => vocabulary.record_type)).toEqual([null, null]);
  });

  it("uses record-type vocabularies ahead of legacy same-key choices and returns their scope", async () => {
    rows.ws_vocabularies = [
      { id: "legacy-condition", key: "condition", label: "Shared Condition", scope: "world", worldId: "world-1", recordType: null, active: true },
      { id: "object-condition", key: "condition", label: "Object Condition", scope: "world", worldId: "world-1", recordType: "object", active: false },
      { id: "location-condition", key: "condition", label: "Location Condition", scope: "world", worldId: "world-1", recordType: "location", active: true },
    ];
    rows.ws_vocabulary_options = [
      { id: "legacy-worn", vocabularyId: "legacy-condition", key: "worn", label: "Worn", description: "", active: true, worldId: "world-1" },
      { id: "object-new", vocabularyId: "object-condition", key: "new", label: "New", description: "", active: true, worldId: "world-1" },
      { id: "location-urban", vocabularyId: "location-condition", key: "urban", label: "Urban", description: "", active: true, worldId: "world-1" },
    ];

    const object = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "object",
    }, "https://editor.example") as any;
    expect(object.paths.structured_profile.fields.condition.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "new", vocabulary_active: false, allowed: false }),
    ]));
    expect(object.paths.structured_profile.fields.condition.choices.every((choice: any) => !choice.allowed)).toBe(true);
    expect(object.vocabularies.filter((vocabulary: any) => vocabulary.key === "condition").map((vocabulary: any) => ({
      record_type: vocabulary.record_type, label: vocabulary.label,
    }))).toEqual([{ record_type: "object", label: "Object Condition" }]);

    const location = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "location",
    }, "https://editor.example") as any;
    expect(location.paths.structured_profile.fields.condition.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "urban", allowed: true, source: "world" }),
      expect.objectContaining({ key: "worn", allowed: true, source: "api_default" }),
    ]));
    expect(location.paths.structured_profile.fields.condition.choices.some((choice: any) => choice.vocabulary_id === "legacy-condition")).toBe(false);
  });

  it("rejects cross-type and inactive overrides in metadata and Character profile writes", async () => {
    rows.ws_vocabularies = [
      { id: "legacy-life-stage", key: "life_stage", scope: "world", worldId: "world-1", recordType: null, active: true },
      { id: "character-life-stage", key: "life_stage", scope: "world", worldId: "world-1", recordType: "character", active: true },
      { id: "object-condition", key: "condition", scope: "world", worldId: "world-1", recordType: "object", active: true },
      { id: "location-condition", key: "condition", scope: "world", worldId: "world-1", recordType: "location", active: true },
    ];
    rows.ws_vocabulary_options = [
      { id: "legacy-adult", vocabularyId: "legacy-life-stage", key: "adult", label: "Adult", description: "", active: true, worldId: "world-1" },
      { id: "character-child", vocabularyId: "character-life-stage", key: "child", label: "Child", description: "", active: true, worldId: "world-1" },
      { id: "object-new", vocabularyId: "object-condition", key: "new", label: "New", description: "", active: true, worldId: "world-1" },
      { id: "object-worn-disabled", vocabularyId: "object-condition", key: "worn", label: "Worn", description: "", active: false, worldId: "world-1" },
      { id: "location-worn", vocabularyId: "location-condition", key: "worn", label: "Worn", description: "", active: true, worldId: "world-1" },
    ];

    const character = await executeCanonTool("admin-1", "get_canon_field_options", {
      world_id: "world-1", canon_type: "character",
    }, "https://editor.example") as any;
    expect(character.fields.lifeStage.choices.map((choice: any) => choice.key)).toEqual(["child"]);
    expect(character.vocabularies.find((vocabulary: any) => vocabulary.key === "life_stage")?.record_type).toBe("character");
    await expect(updateCharacterProfile("admin-1", "char-1", { lifeStage: "adult" }))
      .rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
    await expect(executeCanonTool("admin-1", "update_canon_record", {
      record_id: "char-1", expected_revision: 4, changes: { lifeStage: "adult" },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });

    rows.ws_canon_records = [{ ...canonRecord, canonType: "object" }];
    await expect(executeCanonTool("admin-1", "update_canon_metadata", {
      record_id: "char-1", expected_version: 4, changes: { structured_profile: { condition: "worn" } },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
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
    expect(validateCharacterProfileChanges({ pronouns: "she/her" }, { pronouns: null }).profile).toEqual({});
    expect(() => validateCharacterProfileChanges({}, { unknownField: null })).toThrow(CanonToolError);
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
      const result = await executeCanonTool("admin-1", "update_canon_record", {
        record_id: "char-1", expected_revision: 4, changes: { lifeStage: "adult" },
      }, "https://editor.example");
      expect(result).toMatchObject({
        record: { id: "char-1", version: 5 },
        character_profile: { pronouns: "she/her", lifeStage: "adult" },
        revision: 5, character_profile_schema_version: 7,
      });
      await expect(executeCanonTool("admin-1", "update_canon_record", {
        record_id: "char-1", expected_revision: 4, changes: { lifeStage: "child" },
      }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
    } finally {
      fakeDb.update = originalReturning;
    }
  });

  it("updates explicit metadata fields with CAS and preserves untouched keys", async () => {
    const metadataRecord = {
      ...canonRecord, canonType: "location", version: 4,
      globalMetadata: { untouched: "keep", importance: "central" },
      structuredProfile: { untouched: "also keep", locationScale: "city" },
    };
    rows.ws_canon_records = [metadataRecord];
    rows.ws_vocabularies = [{ id: "importance-vocab", key: "importance", label: "Importance", active: true, worldId: null }];
    rows.ws_vocabulary_options = [
      { id: "central-option", vocabularyId: "importance-vocab", key: "central", label: "Central", description: "", active: true, worldId: null },
      { id: "local-option", vocabularyId: "importance-vocab", key: "local", label: "Local", description: "", active: true, worldId: "world-1" },
      { id: "retired-option", vocabularyId: "importance-vocab", key: "retired", label: "Retired", description: "", active: false, worldId: "world-1" },
    ];
    let saved: Record<string, unknown> | undefined;
    const originalUpdate = fakeDb.update;
    fakeDb.update = () => {
      const builder: any = {
        set: (value: Record<string, unknown>) => { saved = value; return builder; },
        where: () => builder,
        returning: () => Promise.resolve([{ ...metadataRecord, ...saved, version: 5 }]),
      };
      return builder;
    };
    try {
      const updated = await executeCanonTool("admin-1", "update_canon_metadata", {
        record_id: "char-1", expected_version: 4,
        changes: { global_metadata: { importance: "local" }, structured_profile: { locationScale: null } },
      }, "https://editor.example") as any;
      expect(updated.record.globalMetadata).toEqual({ untouched: "keep", importance: "local" });
      expect(updated.record.structuredProfile).toEqual({ untouched: "also keep" });
      expect(updated.revision).toBe(5);
      expect(saved).toMatchObject({ version: 5, globalMetadata: { untouched: "keep", importance: "local" } });
      await expect(executeCanonTool("admin-1", "update_canon_metadata", {
        record_id: "char-1", expected_version: 3, changes: { global_metadata: { importance: "central" } },
      }, "https://editor.example")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      await expect(executeCanonTool("admin-1", "update_canon_metadata", {
        record_id: "char-1", expected_version: 4, changes: { global_metadata: { unknown: "x" } },
      }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
      await expect(executeCanonTool("admin-1", "update_canon_metadata", {
        record_id: "char-1", expected_version: 4, changes: { global_metadata: { importance: "retired" } },
      }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_PICKLIST_VALUE" });
      await expect(executeCanonTool("admin-1", "update_canon_metadata", {
        record_id: "char-1", expected_version: 4, changes: { structured_profile: { eventType: ["birth"] } },
      }, "https://editor.example")).rejects.toMatchObject({ code: "UNSUPPORTED_METADATA_FIELD" });
    } finally {
      fakeDb.update = originalUpdate;
    }
  });

  it("requires a current super-admin for metadata writes", async () => {
    rows.users = [];
    await expect(executeCanonTool("not-admin", "update_canon_metadata", {
      record_id: "char-1", expected_version: 4, changes: { global_metadata: { importance: "central" } },
    }, "https://editor.example")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
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