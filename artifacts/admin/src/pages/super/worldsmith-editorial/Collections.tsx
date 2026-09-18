/**
 * Collections — browse and maintain the collection context that groups
 * Production Specs and Volumes inside a WorldSmith world.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ChevronRight, Download, ExternalLink, FolderOpen, Loader2, Pencil,
  Plus, Save, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";

interface Collection {
  id: string;
  worldId: string;
  name: string;
  season?: string | null;
  year?: number | null;
  description: string;
  status: string;
  updatedAt: string;
}

interface Volume {
  id: string;
  worldId: string;
  collectionId?: string | null;
  name: string;
  code?: string | null;
  status: string;
  description: string;
}

const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function CollectionDrawer({
  worldId,
  collection,
  refreshCollections,
  onClose,
}: {
  worldId: string;
  collection: Collection | null;
  refreshCollections: () => Promise<void>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(collection?.name ?? "");
  const [season, setSeason] = useState(collection?.season ?? "");
  const [year, setYear] = useState(collection?.year?.toString() ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [status, setStatus] = useState(collection?.status ?? "draft");

  const mutation = useMutation({
    mutationFn: () =>
      collection
        ? apiFetch(`/v1/editorial/collections/${collection.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: name.trim(),
              season: season.trim() || null,
              year: year.trim() ? Number(year) : null,
              description,
              status,
            }),
          })
        : apiFetch("/v1/editorial/collections", {
            method: "POST",
            body: JSON.stringify({
              world_id: worldId,
              name: name.trim(),
              season: season.trim() || null,
              year: year.trim() ? Number(year) : null,
              description,
            }),
          }),
    onSuccess: async () => {
      await refreshCollections();
      queryClient.invalidateQueries({ queryKey: ["editorial-collections", worldId] });
      toast({ title: collection ? "Collection updated" : "Collection created" });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "Save failed", description: error.message || "Please try again.", variant: "destructive" }),
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <section className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" aria-label={collection ? "Edit collection" : "New collection"}>
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[var(--admin-clay)]" />
            <h2 className="font-semibold text-gray-900">{collection ? "Edit Collection" : "New Collection"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Collection name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="e.g. Victorian Garden Journal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Season</label>
              <input
                value={season}
                onChange={event => setSeason(event.target.value)}
                placeholder="e.g. Autumn"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Year</label>
              <input
                type="number"
                value={year}
                onChange={event => setYear(event.target.value)}
                placeholder="2026"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              />
            </div>
          </div>

          {collection && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={status}
                onChange={event => setStatus(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={8}
              placeholder="Describe the collection's purpose, scope, and relationship to the world…"
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {collection ? "Save Changes" : "Create Collection"}
          </button>
        </footer>
      </section>
    </>
  );
}

function VolumeDrawer({
  worldId,
  volume,
  initialCollectionId,
  collections,
  refreshCollections,
  onClose,
}: {
  worldId: string;
  volume: Volume | null;
  initialCollectionId: string | null;
  collections: Collection[];
  refreshCollections: () => Promise<void>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(volume?.name ?? "");
  const [code, setCode] = useState(volume?.code ?? "");
  const [collectionId, setCollectionId] = useState(volume?.collectionId ?? initialCollectionId ?? "");
  const [description, setDescription] = useState(volume?.description ?? "");
  const [status, setStatus] = useState(volume?.status ?? "draft");

  const mutation = useMutation({
    mutationFn: () =>
      volume
        ? apiFetch(`/v1/editorial/volumes/${volume.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: name.trim(),
              code: code.trim() || null,
              collection_id: collectionId || null,
              description,
              status,
            }),
          })
        : apiFetch("/v1/editorial/volumes", {
            method: "POST",
            body: JSON.stringify({
              world_id: worldId,
              name: name.trim(),
              code: code.trim() || null,
              collection_id: collectionId || null,
              description,
            }),
          }),
    onSuccess: async () => {
      await refreshCollections();
      await queryClient.invalidateQueries({ queryKey: ["editorial-volumes", worldId] });
      await queryClient.invalidateQueries({ queryKey: ["editorial-collections", worldId] });
      toast({ title: volume ? "Volume updated" : "Volume created" });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "Save failed", description: error.message || "Please try again.", variant: "destructive" }),
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <section className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" aria-label={volume ? "Edit volume" : "New volume"}>
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--admin-clay)]" />
            <h2 className="font-semibold text-gray-900">{volume ? "Edit Volume" : "New Volume"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Volume name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="e.g. Visual Language"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Volume code</label>
              <input
                value={code}
                onChange={event => setCode(event.target.value)}
                placeholder="e.g. V01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
              <select
                value={status}
                onChange={event => setStatus(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Collection</label>
            <select
              aria-label="Volume collection"
              value={collectionId}
              onChange={event => setCollectionId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
            >
              <option value="">Unassigned</option>
              {collections.map(collectionOption => (
                <option key={collectionOption.id} value={collectionOption.id}>{collectionOption.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">Assigning a volume to a collection makes it available from that collection’s Production Specs.</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={7}
              placeholder="Describe this volume's editorial scope…"
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
            />
          </div>
        </div>

        <footer className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {volume ? "Save Changes" : "Create Volume"}
          </button>
        </footer>
      </section>
    </>
  );
}

function CollectionCard({
  collection,
  volumes,
  onEdit,
  onViewSpecs,
  onExportCollection,
  onExportVolume,
  exportingScope,
  onAddVolume,
  onEditVolume,
}: {
  collection: Collection;
  volumes: Volume[];
  onEdit: () => void;
  onViewSpecs: () => void;
  onExportCollection: () => void;
  onExportVolume: (volume: Volume) => void;
  exportingScope: string | null;
  onAddVolume: () => void;
  onEditVolume: (volume: Volume) => void;
}) {
  const collectionVolumes = volumes.filter(volume => volume.collectionId === collection.id);
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--admin-card-subtle)]">
            <FolderOpen className="h-4 w-4 text-[var(--admin-clay)]" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-gray-900">{collection.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {(collection.season || collection.year) && <span>{[collection.season, collection.year].filter(Boolean).join(" · ")}</span>}
              <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize text-gray-600">{collection.status}</span>
              <span>Updated {dateLabel(collection.updatedAt)}</span>
            </div>
          </div>
        </div>
        <button type="button" onClick={onEdit} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>

      {collection.description && <p className="mt-4 text-sm leading-relaxed text-gray-600">{collection.description}</p>}

      <div className="mt-5 border-t border-gray-100 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <BookOpen className="h-3.5 w-3.5" /> Volumes
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onAddVolume} className="text-xs font-medium text-[var(--admin-clay)] hover:underline">
              + Add volume
            </button>
            <button type="button" onClick={onViewSpecs} className="text-xs font-medium text-[var(--admin-ink)] hover:underline">
              View Production Specs →
            </button>
            <button
              type="button"
              onClick={onExportCollection}
              disabled={exportingScope !== null}
              className="flex items-center gap-1 text-xs font-medium text-[var(--admin-ink)] hover:underline disabled:cursor-wait disabled:opacity-50"
            >
              {exportingScope === `collection:${collection.id}`
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Download className="h-3 w-3" />}
              Download collection PDF
            </button>
          </div>
        </div>
        {collectionVolumes.length === 0 ? (
          <p className="text-sm text-gray-400">No volumes are linked to this collection yet.</p>
        ) : (
          <div className="space-y-2">
            {collectionVolumes.map(volume => (
              <div key={volume.id} className="rounded-lg bg-[var(--admin-card-subtle)] px-3 py-2">
                <div className="flex items-center gap-2">
                  {volume.code && <span className="text-xs font-semibold text-[var(--admin-clay)]">{volume.code}</span>}
                  <span className="text-sm font-medium text-gray-700">{volume.name}</span>
                  <span className="ml-auto text-[10px] capitalize text-gray-400">{volume.status}</span>
                  <button
                    type="button"
                    onClick={() => onExportVolume(volume)}
                    disabled={exportingScope !== null}
                    className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700 disabled:cursor-wait disabled:opacity-50"
                    aria-label={`Download ${volume.name} Production Specs PDF`}
                    title="Download Production Specs PDF"
                  >
                    {exportingScope === `volume:${volume.id}`
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Download className="h-3 w-3" />}
                  </button>
                  <button type="button" onClick={() => onEditVolume(volume)} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700" aria-label={`Edit ${volume.name}`}>
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
                {volume.description && <p className="mt-1 text-xs leading-relaxed text-gray-500">{volume.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export default function Collections() {
  const { selectedWorldId, selectedWorld, setSelectedCollectionId, refreshCollections } = useEditorial();
  const [, navigate] = useLocation();
  const [drawerCollection, setDrawerCollection] = useState<Collection | null | undefined>(undefined);
  const [drawerVolume, setDrawerVolume] = useState<{ volume: Volume | null; collectionId: string | null } | undefined>(undefined);
  const [exportingScope, setExportingScope] = useState<string | null>(null);
  const { toast } = useToast();
  const collectionsQuery = useQuery({
    queryKey: ["editorial-collections", selectedWorldId],
    queryFn: () => apiFetch<{ collections: Collection[] }>(
      `/v1/editorial/collections${selectedWorldId ? `?world_id=${encodeURIComponent(selectedWorldId)}` : ""}`,
    ),
  });
  const volumesQuery = useQuery({
    queryKey: ["editorial-volumes", selectedWorldId],
    queryFn: () => apiFetch<{ volumes: Volume[] }>(
      `/v1/editorial/volumes${selectedWorldId ? `?world_id=${encodeURIComponent(selectedWorldId)}` : ""}`,
    ),
    enabled: Boolean(selectedWorldId),
  });
  const collections = collectionsQuery.data?.collections ?? [];
  const volumes = volumesQuery.data?.volumes ?? [];

  const viewSpecs = (collectionId: string) => {
    setSelectedCollectionId(collectionId);
    navigate("/super/worldsmith/editorial/specs");
  };

  const downloadPdf = async (scope: "collection" | "volume", id: string) => {
    const key = `${scope}:${id}`;
    setExportingScope(key);
    try {
      const response = await fetch(
        `/api/v1/editorial/production-spec-export.pdf?${scope}_id=${encodeURIComponent(id)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `PDF export failed (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] ?? "production-specifications.pdf";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Production Specs PDF downloaded" });
    } catch (error) {
      toast({
        title: "PDF export failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExportingScope(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FolderOpen className="h-5 w-5 text-[var(--admin-clay)]" /> Collections &amp; Volumes
          </h1>
          {selectedWorld && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <ChevronRight className="h-3 w-3" /> {selectedWorld.name}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDrawerCollection(null)}
          disabled={!selectedWorldId}
          title={!selectedWorldId ? "Select a world first" : undefined}
          className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Collection
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {!selectedWorldId ? (
          <div className="py-24 text-center text-sm text-gray-500">Select a world to view its collections.</div>
        ) : collectionsQuery.isLoading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : collectionsQuery.isError ? (
          <div className="py-24 text-center text-sm text-red-500">Collections could not be loaded.</div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FolderOpen className="mb-4 h-10 w-10 text-[var(--admin-clay)]/60" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">No collections for this world</h2>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-gray-500">
              Collections organize volumes and Production Specs around a shared creative release.
            </p>
            <button type="button" onClick={() => setDrawerCollection(null)} className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-sm font-medium text-white">
              <Plus className="h-4 w-4" /> Create First Collection
            </button>
          </div>
        ) : (
          <div className="max-w-3xl space-y-3">
            <p className="mb-4 text-xs text-gray-400">
              {collections.length} collection{collections.length === 1 ? "" : "s"} · Collection details and linked volumes for {selectedWorld?.name}
            </p>
            {collections.map(collection => (
              <CollectionCard
                key={collection.id}
                collection={collection}
                volumes={volumes}
                onEdit={() => setDrawerCollection(collection)}
                onAddVolume={() => setDrawerVolume({ volume: null, collectionId: collection.id })}
                onEditVolume={volume => setDrawerVolume({ volume, collectionId: volume.collectionId ?? null })}
                onViewSpecs={() => viewSpecs(collection.id)}
                onExportCollection={() => void downloadPdf("collection", collection.id)}
                onExportVolume={volume => void downloadPdf("volume", volume.id)}
                exportingScope={exportingScope}
              />
            ))}
            {volumes.filter(volume => !volume.collectionId).length > 0 && (
              <section className="rounded-xl border border-dashed border-gray-300 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-800">Unassigned Volumes</h2>
                    <p className="mt-1 text-xs text-gray-400">Assign these volumes to a collection to include them in its editorial context.</p>
                  </div>
                  <button type="button" onClick={() => setDrawerVolume({ volume: null, collectionId: null })} className="text-xs font-medium text-[var(--admin-clay)] hover:underline">
                    + Add volume
                  </button>
                </div>
                <div className="space-y-2">
                  {volumes.filter(volume => !volume.collectionId).map(volume => (
                    <div key={volume.id} className="flex items-center gap-2 rounded-lg bg-[var(--admin-card-subtle)] px-3 py-2">
                      {volume.code && <span className="text-xs font-semibold text-[var(--admin-clay)]">{volume.code}</span>}
                      <span className="text-sm text-gray-700">{volume.name}</span>
                      <span className="ml-auto text-[10px] capitalize text-gray-400">{volume.status}</span>
                      <button type="button" onClick={() => setDrawerVolume({ volume, collectionId: null })} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700" aria-label={`Edit ${volume.name}`}>
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {drawerCollection !== undefined && selectedWorldId && (
        <CollectionDrawer
          worldId={selectedWorldId}
          collection={drawerCollection}
          refreshCollections={refreshCollections}
          onClose={() => setDrawerCollection(undefined)}
        />
      )}
      {drawerVolume !== undefined && selectedWorldId && (
        <VolumeDrawer
          worldId={selectedWorldId}
          volume={drawerVolume.volume}
          initialCollectionId={drawerVolume.collectionId}
          collections={collections}
          refreshCollections={refreshCollections}
          onClose={() => setDrawerVolume(undefined)}
        />
      )}
    </div>
  );
}