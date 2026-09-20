import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  assignCanonImageRoles,
  buildCanonImageExport,
  canonImageAssetDirectory,
  enforceCanonImageOrder,
  normaliseCanonImageRole,
  type CanonImageExportRecord,
} from "../lib/worldsmith/context-snapshot-images";
import type { ObjectStorageService } from "../lib/objectStorage";

async function fixtures() {
  return {
    "/objects/elias-primary": {
      bytes: await sharp({ create: { width: 3, height: 4, channels: 3, background: "#553322" } }).jpeg().toBuffer(),
      contentType: "image/jpeg",
    },
    "/objects/elias-reference": {
      bytes: await sharp({ create: { width: 5, height: 6, channels: 3, background: "#334455" } }).webp().toBuffer(),
      contentType: "image/webp",
    },
    "/objects/frederick-primary": {
      bytes: await sharp({ create: { width: 7, height: 8, channels: 4, background: "#223344ff" } }).png().toBuffer(),
      contentType: "image/png",
    },
  };
}

function record(overrides: Partial<CanonImageExportRecord>): CanonImageExportRecord {
  return {
    id: "record-1",
    worldId: "wyc",
    name: "Record",
    canonType: "character",
    status: "accepted",
    imageGallery: [],
    updatedAt: new Date("2026-09-19T12:00:00.000Z"),
    ...overrides,
  };
}

describe("WorldSmith Canon image snapshots", () => {
  it("normalises editor image roles to the canonical gallery contract", () => {
    expect(normaliseCanonImageRole("primary_image")).toBe("primary");
    expect(normaliseCanonImageRole("primary_portrait")).toBe("primary");
    expect(normaliseCanonImageRole("generated_concept")).toBe("reference");
    expect(normaliseCanonImageRole("location-exterior")).toBe("reference");
    expect(normaliseCanonImageRole("alternate_portrait")).toBe("alternate");
    expect(normaliseCanonImageRole("unsupported_role")).toBeUndefined();
  });

  it("enforces ordered editor galleries even when stale metadata has no primary", () => {
    expect(enforceCanonImageOrder([
      { url: "/objects/one", role: "reference" },
      { url: "/objects/two", role: "primary" },
      { url: "/objects/three", role: "detail" },
    ]).map(image => image.role)).toEqual(["primary", "reference", "detail"]);
  });

  it("keeps legacy ordered galleries compatible while assigning future-safe roles", () => {
    expect(assignCanonImageRoles([
      { url: "/objects/one" },
      { url: "/objects/two" },
    ]).map(image => image.role)).toEqual(["primary", "reference"]);
    expect(assignCanonImageRoles([])).toEqual([]);
  });

  it("uses one explicit asset primary even when a reference asset sorts first", async () => {
    const assets = await fixtures();
    const storage = {
      getObjectEntityFile: async (objectPath: string) => {
        const fixture = assets[objectPath as keyof typeof assets];
        if (!fixture) throw new Error("missing object");
        return {
          download: async () => [fixture.bytes],
          getMetadata: async () => [{
            contentType: fixture.contentType,
            updated: "2026-09-19T10:00:00.000Z",
          }],
        };
      },
    } as unknown as ObjectStorageService;
    const result = await buildCanonImageExport([
      record({
        id: "legacy-assets",
        imageGallery: [],
        assets: [{
          id: "a-reference",
          objectPath: "/objects/elias-reference",
          role: "reference",
          approvalStatus: "approved",
          canonicalStrength: "reference",
        }, {
          id: "z-primary",
          objectPath: "/objects/elias-primary",
          role: "primary",
          approvalStatus: "approved",
          canonicalStrength: "canonical",
        }],
      }),
    ], storage);
    const manifest = JSON.parse(String(result.files.find(file => file.path === result.manifestPath)?.content));
    expect(manifest.records[0].images.map((image: { role: string }) => image.role))
      .toEqual(["primary", "reference"]);
    expect(manifest.records[0].images[0].source_asset_id).toBe("z-primary");
  });

  it("repairs a legacy gallery with no primary before snapshot validation", async () => {
    const assets = await fixtures();
    const storage = {
      getObjectEntityFile: async (objectPath: string) => {
        const fixture = assets[objectPath as keyof typeof assets];
        if (!fixture) throw new Error("missing object");
        return {
          download: async () => [fixture.bytes],
          getMetadata: async () => [{ contentType: fixture.contentType, updated: "2026-09-19T10:00:00.000Z" }],
        };
      },
    } as unknown as ObjectStorageService;
    const result = await buildCanonImageExport([
      record({
        id: "legacy-gallery",
        imageGallery: [
          { url: "/objects/elias-primary", role: "reference" },
          { url: "/objects/elias-reference", role: "alternate" },
        ],
      }),
    ], storage);
    const manifest = JSON.parse(String(result.files.find(file => file.path === result.manifestPath)?.content));
    expect(manifest.records[0].images.map((image: { role: string }) => image.role))
      .toEqual(["primary", "alternate"]);
  });

  it("rejects explicit galleries with no primary or conflicting primaries", () => {
    expect(() => assignCanonImageRoles([
      { url: "/objects/one", role: "reference" },
      { url: "/objects/two", role: "alternate" },
    ])).toThrow("one image designated as primary");
    expect(() => assignCanonImageRoles([
      { url: "/objects/one", role: "primary" },
      { url: "/objects/two", role: "primary" },
    ])).toThrow("more than one primary");
  });

  it("rejects external or signed image URLs before object storage access", async () => {
    const storage = {
      getObjectEntityFile: async () => { throw new Error("must not be called"); },
    } as unknown as ObjectStorageService;
    await expect(buildCanonImageExport([
      record({ id: "canon-secret", imageGallery: [{ url: "https://storage.example/signed?token=secret" }] }),
    ], storage)).rejects.toThrow("canon-secret does not have a valid internal asset ID");
  });

  it("creates safe stable asset directories from canonical IDs and names", () => {
    expect(canonImageAssetDirectory({
      id: "EDB 29/F8A",
      name: "Élias Ashcroft & Co.",
      canonType: "character",
    })).toBe("characters/edb-29-f8a-elias-ashcroft-co");
  });

  it("preserves PNG, JPEG, and WebP bytes and emits a deterministic manifest", async () => {
    const assets = await fixtures();
    const storage = {
      getObjectEntityFile: async (objectPath: string) => {
        const fixture = assets[objectPath as keyof typeof assets];
        if (!fixture) throw new Error("missing object");
        return {
          download: async () => [fixture.bytes],
          getMetadata: async () => [{
            contentType: objectPath === "/objects/frederick-primary" ? "image/jpeg" : fixture.contentType,
            updated: "2026-09-19T10:00:00.000Z",
          }],
        };
      },
    } as unknown as ObjectStorageService;
    const records = [
      record({
        id: "frederick-id",
        name: "Frederick Ashcroft",
        portraitUrl: "/objects/frederick-primary",
        imageGallery: [{ url: "/objects/frederick-primary", role: "primary" }],
        assets: [{
          id: "frederick-asset",
          objectPath: "/objects/frederick-primary",
          role: "reference",
          approvalStatus: "approved",
          canonicalStrength: "reference",
        }],
      }),
      record({
        id: "elias-id",
        name: "Elias Ashcroft",
        imageGallery: [
          { url: "/objects/elias-primary", role: "primary" },
          { url: "/objects/elias-reference", role: "reference" },
        ],
      }),
      record({ id: "clara-id", name: "Clara Bellamy Ashcroft", imageGallery: [] }),
    ];

    const first = await buildCanonImageExport(records, storage);
    const second = await buildCanonImageExport([...records].reverse(), storage);
    const firstManifest = String(first.files.find(file => file.path === first.manifestPath)?.content);
    const secondManifest = String(second.files.find(file => file.path === second.manifestPath)?.content);
    expect(firstManifest).toBe(secondManifest);
    const manifest = JSON.parse(firstManifest);
    expect(manifest.schema_version).toBe("1.0");
    expect(manifest.records.map((entry: { record_name: string }) => entry.record_name)).toEqual([
      "Clara Bellamy Ashcroft",
      "Elias Ashcroft",
      "Frederick Ashcroft",
    ]);
    expect(manifest.records[0].images).toEqual([]);
    expect(manifest.records[1].images.map((image: { role: string; mime_type: string }) => [image.role, image.mime_type])).toEqual([
      ["primary", "image/jpeg"],
      ["reference", "image/webp"],
    ]);
    expect(manifest.records[1].images[0]).toMatchObject({ width: 3, height: 4 });
    expect(manifest.records[2].images[0]).toMatchObject({ width: 7, height: 8, mime_type: "image/png" });
    expect(manifest.records[1].images[0].source_asset_id).toBe("/objects/elias-primary");
    expect(manifest.records[1].images[0].sha256).toBe(
      createHash("sha256").update(assets["/objects/elias-primary"].bytes).digest("hex"),
    );
    expect(first.files.find(file => file.path.endsWith("portrait-primary.jpg"))?.content)
      .toEqual(assets["/objects/elias-primary"].bytes);
    expect(first.files.find(file => file.path.endsWith("image-reference-01.webp"))?.content)
      .toEqual(assets["/objects/elias-reference"].bytes);
  });

  it("reports the canonical ID and non-secret asset ID when object retrieval fails", async () => {
    const storage = {
      getObjectEntityFile: async () => { throw new Error("not found"); },
    } as unknown as ObjectStorageService;
    await expect(buildCanonImageExport([
      record({ id: "canon-missing", imageGallery: [{ url: "/objects/missing" }] }),
    ], storage)).rejects.toThrow("canon-missing (asset missing)");
  });
});