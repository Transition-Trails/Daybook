import { describe, expect, it } from "vitest";
import type { Store, StoreFlags } from "@/lib/api";
import {
  isFlagRowDirty,
  reconcileFlagRows,
  reconcileSavedFlagRows,
  type ReconciledFlagRow,
} from "@/lib/flag-reconciliation";

const store: Store = {
  id: "store-a",
  name: "Store A",
  slug: "store-a",
  domain: null,
  ownerUserId: "user-a",
  plan: "pro",
  status: "active",
  isSeed: false,
  defaultMode: "curated",
  subscriptionActive: true,
  createdAt: "2026-08-27T00:00:00.000Z",
  updatedAt: "2026-08-27T00:00:00.000Z",
};

const serverFlags: StoreFlags = {
  storeId: store.id,
  aiEnabled: false,
  customDomain: false,
  editionsCap: 5,
  storageQuota: 1024,
  inkEnabled: false,
  worldsmithEnabled: false,
};

function rowWithEdit(key: "aiEnabled" | "editionsCap", value: boolean | number): ReconciledFlagRow {
  return {
    store,
    flags: { ...serverFlags, [key]: value },
    original: { ...serverFlags },
    conflicts: {},
  };
}

describe("feature flag server reconciliation", () => {
  it("preserves a dirty capability through a background refetch", () => {
    const current = rowWithEdit("aiEnabled", true);
    const [reconciled] = reconcileFlagRows(
      [{ ...store, name: "Store A renamed" }],
      [{ ...serverFlags, customDomain: true }],
      [current],
    );

    expect(reconciled.flags.aiEnabled).toBe(true);
    expect(isFlagRowDirty(reconciled, "aiEnabled")).toBe(true);
    expect(reconciled.conflicts.aiEnabled).toBeUndefined();
    expect(reconciled.flags.customDomain).toBe(true);
    expect(reconciled.original.customDomain).toBe(true);
    expect(reconciled.store.name).toBe("Store A renamed");
  });

  it("marks a conflict when a dirty field changes to a third value on the server", () => {
    const current = rowWithEdit("editionsCap", 10);
    const [reconciled] = reconcileFlagRows(
      [store],
      [{ ...serverFlags, editionsCap: 7 }],
      [current],
    );

    expect(reconciled.flags.editionsCap).toBe(10);
    expect(reconciled.original.editionsCap).toBe(7);
    expect(reconciled.conflicts.editionsCap).toBe(true);

    const [refetchedAgain] = reconcileFlagRows(
      [store],
      [{ ...serverFlags, editionsCap: 7 }],
      [reconciled],
    );
    expect(refetchedAgain.flags.editionsCap).toBe(10);
    expect(refetchedAgain.conflicts.editionsCap).toBe(true);
  });

  it("does not replace untouched stores with defaults after a partial bulk-save response", () => {
    const storeB = { ...store, id: "store-b", name: "Store B", slug: "store-b" };
    const storeBFlags: StoreFlags = {
      ...serverFlags,
      storeId: storeB.id,
      aiEnabled: true,
      editionsCap: 25,
      storageQuota: 8192,
    };
    const rows: ReconciledFlagRow[] = [
      rowWithEdit("aiEnabled", true),
      {
        store: storeB,
        flags: { ...storeBFlags },
        original: { ...storeBFlags },
        conflicts: {},
      },
    ];

    const afterStoreASave = reconcileSavedFlagRows(
      rows,
      [{ storeId: store.id, flags: { aiEnabled: true } }],
      [{ ...serverFlags, aiEnabled: true }],
    );

    expect(afterStoreASave[1].flags).toEqual(storeBFlags);
    expect(afterStoreASave[1].original).toEqual(storeBFlags);

    const beforeRefetchEdit = afterStoreASave.map((row) =>
      row.store.id === storeB.id
        ? { ...row, flags: { ...row.flags, aiEnabled: false } }
        : row,
    );
    expect(isFlagRowDirty(beforeRefetchEdit[1], "aiEnabled")).toBe(true);

    const afterStoreBSave = reconcileSavedFlagRows(
      beforeRefetchEdit,
      [{ storeId: storeB.id, flags: { aiEnabled: false } }],
      [{ ...storeBFlags, aiEnabled: false }],
    );
    expect(afterStoreBSave[1].flags.aiEnabled).toBe(false);
    expect(afterStoreBSave[1].original.aiEnabled).toBe(false);
    expect(afterStoreBSave[1].flags.editionsCap).toBe(25);
    expect(afterStoreBSave[1].flags.storageQuota).toBe(8192);
  });
});