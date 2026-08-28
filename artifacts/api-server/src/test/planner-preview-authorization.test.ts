import { describe, expect, it } from "vitest";
import type { ActorContext } from "../lib/roles";
import { canPreviewCatalogAsset } from "../lib/planner-preview-authorization";

const storeActor: ActorContext = {
  userId: "staff-b",
  platformRole: null,
  isSuperAdmin: false,
  storeId: "store-b",
  storeRole: "store_staff",
  effectiveRole: "store-b:store_staff",
};

describe("planner preview catalog authorization", () => {
  it("blocks a valid store member from previewing another store's private asset", () => {
    expect(canPreviewCatalogAsset(storeActor, {
      authoredByStoreId: "store-a",
      status: "live",
    })).toBe(false);
  });

  it("blocks a forged store header without membership when store context is omitted", () => {
    expect(canPreviewCatalogAsset({
      ...storeActor,
      storeId: "store-a",
      storeRole: null,
      effectiveRole: "authenticated",
    }, {
      authoredByStoreId: "store-a",
      status: "live",
    })).toBe(false);
  });

  it("allows the current store's assets and live global catalog assets only", () => {
    expect(canPreviewCatalogAsset(storeActor, { authoredByStoreId: "store-b", status: "draft" })).toBe(true);
    expect(canPreviewCatalogAsset(storeActor, { authoredByStoreId: null, status: "live" })).toBe(true);
    expect(canPreviewCatalogAsset(storeActor, { authoredByStoreId: null, status: "draft" })).toBe(false);
  });
});