/**
 * StyleGuides — list, create, and edit WorldSmith style guide documents.
 *
 * Each style guide is a named text document that gets linked to production
 * specs to provide visual / tone grounding during compilation.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Layers, FileText, ChevronRight, Loader2, X, Save, Pencil,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StyleGuide {
  id: string;
  world_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const wordCount = (text: string) =>
  text.trim() ? text.trim().split(/\s+/).length : 0;

// ── Drawer ────────────────────────────────────────────────────────────────────

interface DrawerProps {
  worldId: string;
  guide: StyleGuide | null; // null = create mode
  onClose: () => void;
}

function StyleGuideDrawer({ worldId, guide, onClose }: DrawerProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState(guide?.name ?? "");
  const [content, setContent] = useState(guide?.content ?? "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (guide) {
        return apiFetch(`/v1/editorial/style-guides/${guide.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: name.trim(), content }),
        });
      }
      return apiFetch("/v1/editorial/style-guides", {
        method: "POST",
        body: JSON.stringify({ world_id: worldId, name: name.trim(), content }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-style-guides", worldId] });
      toast({ title: guide ? "Style guide updated" : "Style guide created" });
      onClose();
    },
    onError: () => {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#C87560]" />
            <span className="font-semibold text-gray-900">
              {guide ? "Edit Style Guide" : "New Style Guide"}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Volume I Visual Language Guide"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C87560]/30 focus:border-[#C87560]"
            />
          </div>

          {/* Content */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Content
              </label>
              <span className="text-xs text-gray-400">{wordCount(content).toLocaleString()} words</span>
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Describe the visual language, tone, palette references, typography rules, illustration style, and any negative constraints for this collection…"
              rows={20}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C87560]/30 focus:border-[#C87560] resize-y font-mono leading-relaxed"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Plain text accepted. This content is passed verbatim to the compiler during generation.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1B2A4A] text-white rounded-lg hover:bg-[#243660] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Save className="w-3.5 h-3.5" />}
            {guide ? "Save Changes" : "Create Style Guide"}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function GuideCard({ guide, onEdit }: { guide: StyleGuide; onEdit: () => void }) {
  const wc = wordCount(guide.content);
  const preview = guide.content.slice(0, 160).trim();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md hover:border-gray-300 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 w-8 h-8 rounded-lg bg-[#C87560]/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-[#C87560]" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{guide.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">
                {wc > 0 ? `${wc.toLocaleString()} words` : "No content yet"}
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400">Updated {fmtDate(guide.updated_at)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={onEdit}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all opacity-0 group-hover:opacity-100"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      </div>

      {preview && (
        <p className="mt-3 text-sm text-gray-500 leading-relaxed line-clamp-3 pl-11">
          {preview}{guide.content.length > 160 ? "…" : ""}
        </p>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#C87560]/10 flex items-center justify-center mb-4">
        <Layers className="w-7 h-7 text-[#C87560]" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No style guides yet</h3>
      <p className="text-sm text-gray-500 max-w-xs mb-6">
        Style guides define the visual language, palette, illustration rules, and tone
        that the compiler uses when generating artwork for a spec.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-4 py-2 bg-[#1B2A4A] text-white text-sm rounded-lg hover:bg-[#243660] transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create First Style Guide
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StyleGuides() {
  const { selectedWorldId, selectedWorld } = useEditorial();
  const [drawerGuide, setDrawerGuide] = useState<StyleGuide | null | "new">(undefined as any);
  const drawerOpen = drawerGuide !== undefined && drawerGuide !== (undefined as any);

  const { data, isLoading } = useQuery({
    queryKey: ["editorial-style-guides", selectedWorldId],
    queryFn: () =>
      apiFetch<{ style_guides: StyleGuide[] }>(
        `/v1/editorial/style-guides${selectedWorldId ? `?world_id=${selectedWorldId}` : ""}`
      ),
    enabled: true,
  });

  const guides = data?.style_guides ?? [];

  const openNew = () => setDrawerGuide("new");
  const openEdit = (g: StyleGuide) => setDrawerGuide(g);
  const closeDrawer = () => setDrawerGuide(undefined as any);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#C87560]" />
            Style Guides
          </h1>
          {selectedWorld && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <ChevronRight className="w-3 h-3" />
              {selectedWorld.name}
            </p>
          )}
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-3 py-2 bg-[#1B2A4A] text-white text-sm rounded-lg hover:bg-[#243660] transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Style Guide
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : guides.length === 0 ? (
          <EmptyState onNew={openNew} />
        ) : (
          <div className="space-y-3 max-w-3xl">
            <p className="text-xs text-gray-400 mb-4">
              {guides.length} style guide{guides.length !== 1 ? "s" : ""} · Link a guide to a spec from the Spec Editor
            </p>
            {guides.map(g => (
              <GuideCard key={g.id} guide={g} onEdit={() => openEdit(g)} />
            ))}
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <StyleGuideDrawer
          worldId={selectedWorldId ?? ""}
          guide={drawerGuide === "new" ? null : drawerGuide as StyleGuide}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
