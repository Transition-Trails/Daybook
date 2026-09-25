import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { apiFetch } from "@/lib/api";
import { worldsmithStorage } from "@/lib/worldsmith/storage";
import type { WorldCreativeFields } from "@/lib/worldsmith/world-editor-types";

export interface WorldRecord extends WorldCreativeFields {
  id: string;
  name: string;
  code: string;
  status: string;
  description?: string | null;
  currentCollection?: string | null;
  notionProductionDbId?: string | null;
  notionCanonDbId?: string | null;
  visualPalette?: string | null;
  proseVoice?: string | null;
  atmosphericNotes?: string | null;
  materialWorld?: string | null;
  worldRules?: string[] | null;
  typography?: Array<{ fontId: string; family: string; roles: Array<{ role: string; weight?: string }> }>;
}

export interface CollectionRecord {
  id: string;
  worldId: string;
  name: string;
  season?: string | null;
  year?: number | null;
  status: string;
}

interface EditorialContextValue {
  worlds: WorldRecord[];
  worldsLoading: boolean;
  selectedWorldId: string | null;
  setSelectedWorldId: (id: string | null) => void;
  selectedWorld: WorldRecord | null;
  updateWorld: (world: WorldRecord) => void;
  collections: CollectionRecord[];
  collectionsLoading: boolean;
  refreshCollections: () => Promise<void>;
  selectedCollectionId: string | null;
  setSelectedCollectionId: (id: string | null) => void;
  syncStatus: "synced" | "pending" | "error";
  lastSyncedAt: Date | null;
}

const EditorialContext = createContext<EditorialContextValue | null>(null);

export function EditorialProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const [worlds, setWorlds] = useState<WorldRecord[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(true);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(() =>
    worldsmithStorage.selectedWorld()
  );
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(() =>
    worldsmithStorage.selectedCollection()
  );
  const [lastSyncedAt] = useState<Date | null>(new Date());
  const worldLinkLocation = useRef<string | null>(null);

  const isWorldSelectableEditorialRoute = (
    path: string,
  ) => path === "/super/worldsmith/editorial/bible"
    || path === "/super/worldsmith/editorial/connections"
    || /^\/super\/worldsmith\/editorial\/stories(?:\/(?:new|[^/]+))?$/.test(path);

  // Load worlds
  useEffect(() => {
    setWorldsLoading(true);
    apiFetch<{ worlds: WorldRecord[] }>("/v1/editorial/worlds")
      .then(data => {
        setWorlds(data.worlds);
      })
      .catch(() => {})
      .finally(() => setWorldsLoading(false));
  }, []);

  // A world_id is an explicit deep-link instruction only on the editorial
  // editor routes. Validate it after worlds load so stale/unknown IDs never
  // displace the current selection.
  useEffect(() => {
    if (!isWorldSelectableEditorialRoute(location)) {
      worldLinkLocation.current = null;
      return;
    }
    if (worldsLoading) return;

    const routeKey = `${location}?${search}`;
    if (worldLinkLocation.current === routeKey) return;
    worldLinkLocation.current = routeKey;

    const params = new URLSearchParams(search);
    const requestedWorldId = params.get("world_id");
    const linkedWorld = requestedWorldId
      ? worlds.find(world => world.id === requestedWorldId)
      : undefined;
    if (linkedWorld) {
      setSelectedWorldId(linkedWorld.id);
      return;
    }

    setSelectedWorldId(current => {
      if (current && worlds.some(world => world.id === current)) return current;
      const active = worlds.find(world => world.status === "active") ?? worlds[0];
      return active?.id ?? null;
    });
  }, [location, search, worlds, worldsLoading]);

  // Preserve the default active-world selection on editorial surfaces that
  // do not accept world_id deep links.
  useEffect(() => {
    if (isWorldSelectableEditorialRoute(location) || worldsLoading || selectedWorldId || worlds.length === 0) return;
    const active = worlds.find(world => world.status === "active") ?? worlds[0];
    if (active) setSelectedWorldId(active.id);
  }, [location, selectedWorldId, worlds, worldsLoading]);

  // Persist world selection
  useEffect(() => {
    if (selectedWorldId) worldsmithStorage.setSelectedWorld(selectedWorldId);
  }, [selectedWorldId]);

  const refreshCollections = useCallback(async () => {
    if (!selectedWorldId) {
      setCollections([]);
      return;
    }
    setCollectionsLoading(true);
    try {
      const data = await apiFetch<{ collections: CollectionRecord[] }>(
        `/v1/editorial/collections?world_id=${selectedWorldId}`,
      );
      setCollections(data.collections);
    } catch {
      setCollections([]);
    } finally {
      setCollectionsLoading(false);
    }
  }, [selectedWorldId]);

  // Load collections when world changes
  useEffect(() => {
    void refreshCollections();
  }, [refreshCollections]);

  // Persist collection selection
  useEffect(() => {
    if (selectedCollectionId) worldsmithStorage.setSelectedCollection(selectedCollectionId);
    else worldsmithStorage.clearSelectedCollection();
  }, [selectedCollectionId]);

  const selectedWorld = worlds.find(w => w.id === selectedWorldId) ?? null;
  const updateWorld = (updatedWorld: WorldRecord) => {
    setWorlds(current => current.map(world => world.id === updatedWorld.id ? updatedWorld : world));
  };

  return (
    <EditorialContext.Provider value={{
      worlds,
      worldsLoading,
      selectedWorldId,
      setSelectedWorldId,
      selectedWorld,
      updateWorld,
      collections,
      collectionsLoading,
      refreshCollections,
      selectedCollectionId,
      setSelectedCollectionId,
      syncStatus: "synced",
      lastSyncedAt,
    }}>
      {children}
    </EditorialContext.Provider>
  );
}

export function useEditorial() {
  const ctx = useContext(EditorialContext);
  if (!ctx) throw new Error("useEditorial must be used inside EditorialProvider");
  return ctx;
}
