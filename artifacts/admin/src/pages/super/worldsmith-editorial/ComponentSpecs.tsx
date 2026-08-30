/**
 * ComponentSpecs — reusable component specification library.
 *
 * Component specs describe the production and print characteristics shared by
 * one or more Production Specs. They are created here and linked from the
 * Production Spec editor.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FileText, Loader2, Pencil, Plus, Save, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { editorialRichTextToPlainText } from "@/lib/editorial-rich-text";

interface ComponentSpec {
  id: string;
  worldId: string;
  name: string;
  componentType: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const COMPONENT_TYPES = [
  "Hero Paper",
  "Decorative Paper",
  "Journal Card",
  "Coordinating Paper",
  "Ephemera Sheet",
  "Notepaper",
  "Endpaper",
  "Washi Tape",
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function ComponentSpecDrawer({
  worldId,
  componentSpec,
  onClose,
}: {
  worldId: string;
  componentSpec: ComponentSpec | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(componentSpec?.name ?? "");
  const [componentType, setComponentType] = useState(componentSpec?.componentType ?? "Hero Paper");
  const [content, setContent] = useState(componentSpec?.content ?? "");

  const saveMutation = useMutation({
    mutationFn: () =>
      componentSpec
        ? apiFetch(`/v1/editorial/component-specs/${componentSpec.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: name.trim(), content }),
          })
        : apiFetch("/v1/editorial/component-specs", {
            method: "POST",
            body: JSON.stringify({
              world_id: worldId,
              name: name.trim(),
              component_type: componentType,
              content,
            }),
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-component-specs", worldId] });
      toast({ title: componentSpec ? "Component spec updated" : "Component spec created" });
      onClose();
    },
    onError: (error: Error) =>
      toast({ title: "Save failed", description: error.message || "Please try again.", variant: "destructive" }),
  });

  const wordCount = editorialRichTextToPlainText(content).split(/\s+/).filter(Boolean).length;
  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#C87560]" />
            <h2 className="font-semibold text-gray-900">
              {componentSpec ? "Edit Component Spec" : "New Component Spec"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="e.g. Hero Paper — Victorian Garden Journal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#C87560] focus:ring-2 focus:ring-[#C87560]/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Component type <span className="text-red-500">*</span>
            </label>
            <select
              value={componentType}
              onChange={event => setComponentType(event.target.value)}
              disabled={Boolean(componentSpec)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#C87560] focus:ring-2 focus:ring-[#C87560]/20 disabled:bg-gray-50 disabled:text-gray-500"
            >
              {COMPONENT_TYPES.map(type => <option key={type}>{type}</option>)}
            </select>
            {componentSpec && (
              <p className="mt-1.5 text-xs text-gray-400">
                Component type is fixed after creation so linked Production Specs remain consistent.
              </p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Specification details</label>
              <span className="text-xs text-gray-400">{wordCount.toLocaleString()} words</span>
            </div>
            <textarea
              value={content}
              onChange={event => setContent(event.target.value)}
              rows={18}
              placeholder="Describe dimensions, paper stock, margins, orientation, bleed, finishing, and other production requirements…"
              className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm leading-relaxed outline-none focus:border-[#C87560] focus:ring-2 focus:ring-[#C87560]/20"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              These details are available to every Production Spec that links this component spec.
            </p>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="flex items-center gap-2 rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#243660] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {componentSpec ? "Save Changes" : "Create Component Spec"}
          </button>
        </footer>
      </div>
    </>
  );
}

function ComponentSpecCard({ componentSpec, onEdit }: { componentSpec: ComponentSpec; onEdit: () => void }) {
  const preview = editorialRichTextToPlainText(componentSpec.content).slice(0, 180).trim();
  return (
    <article className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#C87560]/10">
            <FileText className="h-4 w-4 text-[#C87560]" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-gray-900">{componentSpec.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#C87560]/10 px-2 py-0.5 text-xs font-medium text-[#C87560]">
                {componentSpec.componentType}
              </span>
              <span className="text-xs text-gray-400">Updated {fmtDate(componentSpec.updatedAt)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 opacity-0 transition-all hover:border-gray-300 hover:bg-gray-50 group-hover:opacity-100"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>
      {preview && <p className="mt-3 line-clamp-3 pl-11 text-sm leading-relaxed text-gray-500">{preview}{preview.length >= 180 ? "…" : ""}</p>}
    </article>
  );
}

export default function ComponentSpecs() {
  const { selectedWorldId, selectedWorld } = useEditorial();
  const [, navigate] = useLocation();
  const [drawerSpec, setDrawerSpec] = useState<ComponentSpec | null | undefined>(undefined);
  const { data, isLoading, error } = useQuery({
    queryKey: ["editorial-component-specs", selectedWorldId],
    queryFn: () => apiFetch<{ component_specs: ComponentSpec[] }>(
      `/v1/editorial/component-specs${selectedWorldId ? `?world_id=${encodeURIComponent(selectedWorldId)}` : ""}`,
    ),
  });
  const specs = data?.component_specs ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FileText className="h-5 w-5 text-[#C87560]" /> Component Specs
          </h1>
          {selectedWorld && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
              <ChevronRight className="h-3 w-3" /> {selectedWorld.name}
            </p>
          )}
        </div>
        <button
          onClick={() => setDrawerSpec(null)}
          disabled={!selectedWorldId}
          title={!selectedWorldId ? "Select a world first" : undefined}
          className="flex items-center gap-2 rounded-lg bg-[#1B2A4A] px-3 py-2 text-sm text-white transition-colors hover:bg-[#243660] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Component Spec
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : error ? (
          <div className="py-24 text-center text-sm text-red-500">Component specs could not be loaded.</div>
        ) : specs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FileText className="mb-4 h-10 w-10 text-[#C87560]/60" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">No component specs yet</h2>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-gray-500">
              Create reusable production and print requirements, then link them from any Production Spec.
            </p>
            <button
              onClick={() => setDrawerSpec(null)}
              disabled={!selectedWorldId}
              className="flex items-center gap-2 rounded-lg bg-[#1B2A4A] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Create First Component Spec
            </button>
          </div>
        ) : (
          <div className="max-w-3xl space-y-3">
            <p className="mb-4 text-xs text-gray-400">
              {specs.length} component spec{specs.length === 1 ? "" : "s"} · Link one from the Production Spec editor
            </p>
            {specs.map(componentSpec => (
              <ComponentSpecCard key={componentSpec.id} componentSpec={componentSpec} onEdit={() => setDrawerSpec(componentSpec)} />
            ))}
          </div>
        )}
      </main>

      {drawerSpec !== undefined && selectedWorldId && (
        <ComponentSpecDrawer worldId={selectedWorldId} componentSpec={drawerSpec} onClose={() => setDrawerSpec(undefined)} />
      )}
    </div>
  );
}