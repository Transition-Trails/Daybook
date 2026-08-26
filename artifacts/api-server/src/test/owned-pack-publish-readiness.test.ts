import { describe, expect, it } from "vitest";
import { validatePackPublishReadiness } from "../routes/owned-catalog.js";

describe("owned sticker-pack publish readiness", () => {
  it("requires a real cover, member sticker, and positive whole-cent price", async () => {
    await expect(validatePackPublishReadiness("store", null, {
      price: 4.99,
      stickerIds: ["sticker-1"],
    })).resolves.toBe("A live sticker pack requires a valid cover asset reference.");

    await expect(validatePackPublishReadiness("store", null, {
      coverDriveFileId: "cover-file",
      price: 4.991,
      stickerIds: ["sticker-1"],
    })).resolves.toBe("A live sticker pack requires a positive price in whole cents.");

    await expect(validatePackPublishReadiness("store", null, {
      coverDriveFileId: "cover-file",
      price: 4.99,
      stickerIds: [],
    })).resolves.toBe("A live sticker pack requires at least one sticker asset.");
  });

  it("accepts complete publish data", async () => {
    await expect(validatePackPublishReadiness("store", null, {
      coverDriveFileId: "cover-file",
      price: 4.99,
      stickerIds: ["sticker-1"],
    })).resolves.toBeNull();
  });

  it("rejects an edit that would strip a live pack's cover or stickers", async () => {
    const current = { coverDriveFileId: "cover-file", price: 4.99 };
    await expect(validatePackPublishReadiness("store", current, {
      coverDriveFileId: null,
      stickerIds: ["sticker-1"],
    }, 1)).resolves.toBe("A live sticker pack requires a valid cover asset reference.");

    await expect(validatePackPublishReadiness("store", current, {
      stickerIds: [],
    }, 1)).resolves.toBe("A live sticker pack requires at least one sticker asset.");
  });
});