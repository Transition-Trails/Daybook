import type { Store, StoreFlags } from "./api";

export const FLAG_KEYS = [
  "aiEnabled",
  "customDomain",
  "editionsCap",
  "storageQuota",
  "inkEnabled",
  "worldsmithEnabled",
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];
export type FlagConflictMap = Partial<Record<FlagKey, true>>;

export interface ReconciledFlagRow {
  store: Store;
  flags: StoreFlags;
  original: StoreFlags;
  conflicts: FlagConflictMap;
}

const DEFAULTS: Omit<StoreFlags, "storeId"> = {
  aiEnabled: false,
  customDomain: false,
  editionsCap: 5,
  storageQuota: 1024,
  inkEnabled: false,
  worldsmithEnabled: false,
};

function setFlagValue(
  target: StoreFlags,
  key: FlagKey,
  value: StoreFlags[FlagKey],
): void {
  (target as unknown as Record<FlagKey, boolean | number>)[key] = value;
}

export function normalizeFlags(storeId: string, flags?: Partial<StoreFlags>): StoreFlags {
  return {
    storeId,
    aiEnabled: flags?.aiEnabled ?? DEFAULTS.aiEnabled,
    customDomain: flags?.customDomain ?? DEFAULTS.customDomain,
    editionsCap: flags?.editionsCap ?? DEFAULTS.editionsCap,
    storageQuota: flags?.storageQuota ?? DEFAULTS.storageQuota,
    inkEnabled: flags?.inkEnabled ?? DEFAULTS.inkEnabled,
    worldsmithEnabled: flags?.worldsmithEnabled ?? DEFAULTS.worldsmithEnabled,
  };
}

export function isFlagRowDirty(row: ReconciledFlagRow, key: FlagKey): boolean {
  return row.flags[key] !== row.original[key];
}

/**
 * Applies a fresh server snapshot without replacing edits the operator has
 * queued locally. Clean fields follow the server; dirty fields keep their
 * local value and are marked when the server moved underneath them.
 */
export function reconcileFlagRows(
  stores: Store[],
  serverFlags: StoreFlags[],
  currentRows: ReconciledFlagRow[],
): ReconciledFlagRow[] {
  const serverByStore = new Map(serverFlags.map((flags) => [flags.storeId, flags]));
  const currentByStore = new Map(currentRows.map((row) => [row.store.id, row]));

  return stores.map((store) => {
    const server = normalizeFlags(store.id, serverByStore.get(store.id));
    const current = currentByStore.get(store.id);
    if (!current) {
      return { store, flags: server, original: { ...server }, conflicts: {} };
    }

    const flags = { ...current.flags };
    const original = { ...current.original };
    const conflicts: FlagConflictMap = { ...current.conflicts };
    for (const key of FLAG_KEYS) {
      const dirty = isFlagRowDirty(current, key);
      const serverChanged = server[key] !== current.original[key];
      if (!dirty) {
        setFlagValue(flags, key, server[key]);
        setFlagValue(original, key, server[key]);
        delete conflicts[key];
      } else {
        // The new snapshot is now the base for the pending local edit.
        setFlagValue(original, key, server[key]);
        if (current.flags[key] === server[key]) {
          delete conflicts[key];
        } else if (serverChanged) {
          conflicts[key] = true;
        }
      }
    }
    return { store, flags, original, conflicts };
  });
}

/**
 * Reconciles the response to a save. An operator can edit another value while
 * the request is in flight; only values that are unchanged since submission
 * are considered clean.
 */
export function reconcileSavedFlagRows(
  currentRows: ReconciledFlagRow[],
  changes: Array<{ storeId: string; flags: Partial<StoreFlags> }>,
  serverFlags: StoreFlags[],
): ReconciledFlagRow[] {
  const serverByStore = new Map(serverFlags.map((flags) => [flags.storeId, flags]));
  const submittedByStore = new Map(changes.map((change) => [change.storeId, change.flags]));

  return currentRows.map((row) => {
    const submitted = submittedByStore.get(row.store.id);
    const server = normalizeFlags(row.store.id, serverByStore.get(row.store.id));
    if (!submitted) return row;

    const flags = { ...row.flags };
    const original = { ...row.original };
    const conflicts = { ...row.conflicts };
    for (const key of FLAG_KEYS) {
      if (submitted[key] === undefined) continue;
      setFlagValue(original, key, server[key]);
      if (flags[key] === submitted[key]) {
        setFlagValue(flags, key, server[key]);
      }
      delete conflicts[key];
    }
    return { ...row, flags, original, conflicts };
  });
}