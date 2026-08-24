/**
 * One browser-storage boundary for WorldSmith. Reads transparently migrate the
 * prior scattered keys, with the canonical key taking precedence when both exist.
 */
const PREFIX = "daybook:worldsmith:v1";

export const worldsmithStorageKeys = {
  selectedWorld: `${PREFIX}:selected-world`,
  selectedCollection: `${PREFIX}:selected-collection`,
  drawerCollapsed: `${PREFIX}:drawer-collapsed`,
  copilotOpen: `${PREFIX}:copilot-open`,
  compilerAutoPreview: `${PREFIX}:compiler-auto-preview`,
  styleGuideDraft: (worldId: string | null | undefined) =>
    `${PREFIX}:style-guide-draft:${worldId ?? "__none__"}`,
} as const;

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readWorldsmithStorage(key: string, legacyKeys: readonly string[] = []): string | null {
  const storage = browserStorage();
  if (!storage) return null;
  try {
    const canonical = storage.getItem(key);
    if (canonical !== null) return canonical;
    for (const legacyKey of legacyKeys) {
      const legacyValue = storage.getItem(legacyKey);
      if (legacyValue !== null) {
        storage.setItem(key, legacyValue);
        storage.removeItem(legacyKey);
        return legacyValue;
      }
    }
  } catch {
    // Browser privacy settings can make local storage unavailable.
  }
  return null;
}

export function writeWorldsmithStorage(key: string, value: string): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeWorldsmithStorage(key: string): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function removeWorldsmithStorageWithLegacy(key: string, legacyKeys: readonly string[]): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    legacyKeys.forEach(legacyKey => storage.removeItem(legacyKey));
    return true;
  } catch {
    return false;
  }
}

export const worldsmithStorage = {
  selectedWorld: () => readWorldsmithStorage(worldsmithStorageKeys.selectedWorld, ["ws:editorial:world"]),
  setSelectedWorld: (worldId: string) => writeWorldsmithStorage(worldsmithStorageKeys.selectedWorld, worldId),
  selectedCollection: () => readWorldsmithStorage(worldsmithStorageKeys.selectedCollection, ["ws:editorial:collection"]),
  setSelectedCollection: (collectionId: string) => writeWorldsmithStorage(worldsmithStorageKeys.selectedCollection, collectionId),
  clearSelectedCollection: () => removeWorldsmithStorageWithLegacy(
    worldsmithStorageKeys.selectedCollection,
    ["ws:editorial:collection"],
  ),
  drawerCollapsed: () => readWorldsmithStorage(worldsmithStorageKeys.drawerCollapsed, ["ws:editorial:drawer-collapsed"]),
  setDrawerCollapsed: (collapsed: boolean) => writeWorldsmithStorage(worldsmithStorageKeys.drawerCollapsed, String(collapsed)),
  copilotOpen: () => readWorldsmithStorage(worldsmithStorageKeys.copilotOpen, ["ws:editorial:copilot"]),
  setCopilotOpen: (open: boolean) => writeWorldsmithStorage(worldsmithStorageKeys.copilotOpen, String(open)),
  compilerAutoPreview: () => readWorldsmithStorage(worldsmithStorageKeys.compilerAutoPreview, ["worldsmith:auto-preview"]),
  setCompilerAutoPreview: (enabled: boolean) => writeWorldsmithStorage(worldsmithStorageKeys.compilerAutoPreview, String(enabled)),
  styleGuideDraft: (worldId: string | null | undefined) => readWorldsmithStorage(
    worldsmithStorageKeys.styleGuideDraft(worldId),
    [`daybook:style-guide-draft:${worldId ?? "__none__"}`],
  ),
  setStyleGuideDraft: (worldId: string | null | undefined, value: string) =>
    writeWorldsmithStorage(worldsmithStorageKeys.styleGuideDraft(worldId), value),
  clearStyleGuideDraft: (worldId: string | null | undefined) =>
    removeWorldsmithStorageWithLegacy(
      worldsmithStorageKeys.styleGuideDraft(worldId),
      [`daybook:style-guide-draft:${worldId ?? "__none__"}`],
    ),
};