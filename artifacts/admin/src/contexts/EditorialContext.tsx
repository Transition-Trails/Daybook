import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

export interface WorldRecord {
  id: string;
  name: string;
  code: string;
  status: string;
  description?: string | null;
  currentCollection?: string | null;
  notionProductionDbId?: string | null;
  notionCanonDbId?: string | null;
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
  collections: CollectionRecord[];
  collectionsLoading: boolean;
  selectedCollectionId: string | null;
  setSelectedCollectionId: (id: string | null) => void;
  syncStatus: "synced" | "pending" | "error";
  lastSyncedAt: Date | null;
}

const EditorialContext = createContext<EditorialContextValue | null>(null);

export function EditorialProvider({ children }: { children: ReactNode }) {
  const [worlds, setWorlds] = useState<WorldRecord[]>([]);
  const [worldsLoading, setWorldsLoading] = useState(true);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(() =>
    localStorage.getItem("ws:editorial:world") ?? null
  );
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(() =>
    localStorage.getItem("ws:editorial:collection") ?? null
  );
  const [lastSyncedAt] = useState<Date | null>(new Date());

  // Load worlds
  useEffect(() => {
    setWorldsLoading(true);
    apiFetch<{ worlds: WorldRecord[] }>("/v1/editorial/worlds")
      .then(data => {
        setWorlds(data.worlds);
        // Auto-select first active world if none selected
        if (!selectedWorldId && data.worlds.length > 0) {
          const active = data.worlds.find(w => w.status === "active") ?? data.worlds[0];
          setSelectedWorldId(active.id);
        }
      })
      .catch(() => {})
      .finally(() => setWorldsLoading(false));
  }, []);

  // Persist world selection
  useEffect(() => {
    if (selectedWorldId) localStorage.setItem("ws:editorial:world", selectedWorldId);
  }, [selectedWorldId]);

  // Load collections when world changes
  useEffect(() => {
    if (!selectedWorldId) { setCollections([]); return; }
    setCollectionsLoading(true);
    apiFetch<{ collections: CollectionRecord[] }>(`/v1/editorial/collections?world_id=${selectedWorldId}`)
      .then(data => setCollections(data.collections))
      .catch(() => setCollections([]))
      .finally(() => setCollectionsLoading(false));
  }, [selectedWorldId]);

  // Persist collection selection
  useEffect(() => {
    if (selectedCollectionId) localStorage.setItem("ws:editorial:collection", selectedCollectionId);
    else localStorage.removeItem("ws:editorial:collection");
  }, [selectedCollectionId]);

  const selectedWorld = worlds.find(w => w.id === selectedWorldId) ?? null;

  return (
    <EditorialContext.Provider value={{
      worlds,
      worldsLoading,
      selectedWorldId,
      setSelectedWorldId,
      selectedWorld,
      collections,
      collectionsLoading,
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
