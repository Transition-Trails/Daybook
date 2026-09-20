import { describe, expect, it } from "vitest";
import { reconcileCanonImageRoles } from "@workspace/db/canon-image-reconciliation";

const record = {
  id: "canon-1",
  worldId: "world-1",
  name: "Canon One",
};
const eligible = (asset: { id: string; objectPath: string; role: string }) => ({
  ...asset,
  approvalStatus: "approved",
  canonicalStrength: "canonical",
  mimeType: "image/png",
});

describe("Canon image role reconciliation", () => {
  it("uses gallery order to resolve conflicting primary roles across the record and assets", () => {
    const result = reconcileCanonImageRoles({
      ...record,
      portraitUrl: "/objects/two",
      imageUrls: ["/objects/two", "/objects/one"],
      imageGallery: [
        { url: "/objects/one", role: "reference" },
        { url: "/objects/two", role: "primary" },
      ],
    }, [
      eligible({ id: "asset-one", objectPath: "/objects/one", role: "reference" }),
      eligible({ id: "asset-two", objectPath: "/objects/two", role: "primary" }),
    ]);

    expect(result.primaryUrl).toBe("/objects/one");
    expect(result.imageGallery.map(image => image.role)).toEqual(["primary", "reference"]);
    expect(result.portraitUrl).toBe("/objects/one");
    expect(result.imageUrls).toEqual(["/objects/one", "/objects/two"]);
    expect(result.assetRoles).toEqual([
      { id: "asset-one", role: "primary" },
      { id: "asset-two", role: "reference" },
    ]);
  });

  it("uses portrait_url when the gallery is missing and creates one primary", () => {
    const result = reconcileCanonImageRoles({
      ...record,
      portraitUrl: "/objects/portrait",
      imageUrls: [],
      imageGallery: [],
    }, [
      eligible({ id: "asset-portrait", objectPath: "/objects/portrait", role: "reference" }),
    ]);

    expect(result.imageGallery).toEqual([{
      url: "/objects/portrait",
      name: "",
      description: "",
      role: "primary",
    }]);
    expect(result.assetRoles).toEqual([{ id: "asset-portrait", role: "primary" }]);
  });

  it("demotes duplicate primaries and is repeatable after reconciliation", () => {
    const first = reconcileCanonImageRoles({
      ...record,
      portraitUrl: "/objects/one",
      imageUrls: ["/objects/one", "/objects/two"],
      imageGallery: [
        { url: "/objects/one", role: "primary" },
        { url: "/objects/two", role: "primary" },
      ],
    }, [
      eligible({ id: "asset-one", objectPath: "/objects/one", role: "primary" }),
      eligible({ id: "asset-two", objectPath: "/objects/two", role: "primary" }),
    ]);
    expect(first.imageGallery.map(image => image.role)).toEqual(["primary", "reference"]);
    expect(first.assetRoles.map(asset => asset.role)).toEqual(["primary", "reference"]);

    const second = reconcileCanonImageRoles({
      ...record,
      portraitUrl: first.portraitUrl,
      imageUrls: first.imageUrls,
      imageGallery: first.imageGallery,
    }, first.assetRoles.map(asset => eligible({
      ...asset,
      objectPath: asset.id === "asset-one" ? "/objects/one" : "/objects/two",
    })));
    expect(second.recordChanged).toBe(false);
    expect(second.changedAssetIds).toEqual([]);
  });

  it("preserves all ordered legacy image URLs when constructing a missing gallery", () => {
    const result = reconcileCanonImageRoles({
      ...record,
      portraitUrl: "/objects/one",
      imageUrls: ["/objects/one", "/objects/two", "/objects/three"],
      imageGallery: [],
    }, []);

    expect(result.imageGallery.map(image => [image.url, image.role])).toEqual([
      ["/objects/one", "primary"],
      ["/objects/two", "reference"],
      ["/objects/three", "reference"],
    ]);
    expect(result.imageUrls).toEqual(["/objects/one", "/objects/two", "/objects/three"]);
    const second = reconcileCanonImageRoles({
      ...record,
      portraitUrl: result.portraitUrl,
      imageUrls: result.imageUrls,
      imageGallery: result.imageGallery,
    }, []);
    expect(second.recordChanged).toBe(false);
  });

  it("does not promote an unrelated asset when no eligible asset matches the authoritative primary", () => {
    const result = reconcileCanonImageRoles({
      ...record,
      portraitUrl: "/objects/gallery-primary",
      imageUrls: ["/objects/gallery-primary"],
      imageGallery: [{ url: "/objects/gallery-primary", role: "primary" }],
    }, [
      {
        id: "approved-other",
        objectPath: "/objects/other",
        role: "primary",
        approvalStatus: "approved",
        canonicalStrength: "canonical",
        mimeType: "image/png",
      },
      {
        id: "draft-match",
        objectPath: "/objects/gallery-primary",
        role: "primary",
        approvalStatus: "draft",
        canonicalStrength: "canonical",
        mimeType: "image/png",
      },
      {
        id: "document",
        objectPath: "/objects/gallery-primary",
        role: "primary",
        approvalStatus: "approved",
        canonicalStrength: "canonical",
        mimeType: "application/pdf",
      },
    ]);

    expect(result.assetRoles).toEqual([
      { id: "approved-other", role: "reference" },
      { id: "draft-match", role: "primary" },
      { id: "document", role: "primary" },
    ]);
    const second = reconcileCanonImageRoles({
      ...record,
      portraitUrl: result.portraitUrl,
      imageUrls: result.imageUrls,
      imageGallery: result.imageGallery,
    }, result.assetRoles.map(asset => ({
      ...asset,
      objectPath: asset.id === "approved-other" ? "/objects/other" : "/objects/gallery-primary",
      approvalStatus: asset.id === "draft-match" ? "draft" : "approved",
      canonicalStrength: "canonical",
      mimeType: asset.id === "document" ? "application/pdf" : "image/png",
    })));
    expect(second.recordChanged).toBe(false);
    expect(second.changedAssetIds).toEqual([]);
  });
});