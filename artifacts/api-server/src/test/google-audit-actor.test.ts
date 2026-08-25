import { describe, expect, it } from "vitest";
import { resolveGoogleAuditActor } from "../lib/google-audit-actor";

describe("resolveGoogleAuditActor", () => {
  it("attributes an action to the explicitly selected store membership", () => {
    expect(resolveGoogleAuditActor({
      platformRole: null,
      selectedStoreId: "store-bravo",
      memberships: [
        { storeId: "store-alpha", role: "store_owner" },
        { storeId: "store-bravo", role: "support" },
      ],
    })).toEqual({ actorRole: "support", scope: "store-bravo" });
  });

  it("uses the deterministic first membership when no store is selected", () => {
    expect(resolveGoogleAuditActor({
      platformRole: null,
      memberships: [
        { storeId: "store-alpha", role: "store_staff" },
        { storeId: "store-bravo", role: "store_owner" },
      ],
    })).toEqual({ actorRole: "store_staff", scope: "store-alpha" });
  });

  it("fails closed for an unknown membership role", () => {
    expect(resolveGoogleAuditActor({
      platformRole: null,
      selectedStoreId: "store-alpha",
      memberships: [{ storeId: "store-alpha", role: "legacy_admin" }],
    })).toEqual({ actorRole: "user", scope: "platform" });
  });

  it("attributes super-admin activity to the platform", () => {
    expect(resolveGoogleAuditActor({
      platformRole: "super_admin",
      selectedStoreId: "store-alpha",
      memberships: [{ storeId: "store-alpha", role: "store_owner" }],
    })).toEqual({ actorRole: "super_admin", scope: "platform" });
  });
});