/**
 * Store Edition Studio — three-phase hub.
 *
 * URL routing (all params relative to /store/:id/studios/edition):
 *   (no params)  → LIST  — table of owned editions + "New edition" button
 *   ?mode=create → CREATE — two-path: Start blank | ✦ Start with Claude
 *   ?edit=<id>   → EDIT  — pre-filled form with catalog attachment
 *
 * Ownership model:
 *   • All creates stamp origin='owned', authoredByStoreId, status='draft'
 *   • store_staff  : create + edit drafts
 *   • store_owner  : create, edit drafts, publish / unpublish
 *   • Blank creates work regardless of aiEnabled; Claude path gates on aiEnabled
 */
import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, RefreshCw, Save, BookOpen, ChevronDown, ChevronUp, Sparkles,
  ArrowLeft, Plus, Globe, EyeOff, Edit3, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ClaudeHeader } from "@/components/shared/ClaudeHeader";
import { ErrorState, SkeletonRows } from "@/components/shared";
import { isValidHex, PALETTE_LABELS } from "@/lib/ai";
import { SuperAdminAiBanner } from "./AiDisabledState";
import {
  storeStudiosApi, studioGenerateApi,
  type CatalogItem, type OwnedList,
} from "@/lib/api";
import { FontSpecimenCard } from "@/components/FontSpecimenCard";

// ── Types ─────────────────────────────────────────────────────────────────────

import { isStoreOwnerRole, isSuperAdminRole } from "@/lib/permissions";

interface Props {
  storeId: string;
  role: string;
  aiEnabled: boolean;
}

interface OwnedEdition extends CatalogItem {
  priceLow?: number;
  priceHigh?: number;
  sections?: string[];
  createdAt?: string;
  updatedAt?: string;
  themes?: string[];
  packs?: string[];
  inserts?: string[];
  products?: string[];
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const CLAY   = "#C87560";
const NAVY   = "#1B2A4A";
const FIELD  = "w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors";

function StatusBadge({ status }: { status: string }) {
  if (status === "live")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">● Live</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Draft</span>;
}

function MultiChips({
  items, selected, onToggle, originBadge,
}: {
  items: CatalogItem[];
  selected: string[];
  onToggle: (id: string) => void;
  originBadge?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
      {items.map((item) => (
        <Badge
          key={item.id}
          variant={selected.includes(item.id) ? "default" : "outline"}
          className={selected.includes(item.id)
            ? "cursor-pointer bg-[#1B2A4A] text-white border-[#1B2A4A]"
            : "cursor-pointer hover:border-[#C87560]"}
          onClick={() => onToggle(item.id)}
        >
          {item.name}
          {originBadge && item.origin === "owned" && (
            <span className="ml-1 text-[9px] font-semibold opacity-70">★</span>
          )}
        </Badge>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing available yet</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — LIST
// ═══════════════════════════════════════════════════════════════════════════════

function EditionList({
  storeId, role, onNew, onEdit,
}: {
  storeId: string;
  role: string;
  onNew: () => void;
  onEdit: (id: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = isStoreOwnerRole(role);

  const { data: owned, isLoading, error, refetch } = useQuery<OwnedList>({
    queryKey: ["store-owned-list", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
    staleTime: 30_000,
  });
  const editions = (owned?.editions ?? []) as OwnedEdition[];

  const publishMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "live" | "draft" }) =>
      storeStudiosApi.editions.update(storeId, id, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      toast({ title: vars.status === "live" ? "Edition published" : "Edition unpublished" });
    },
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => storeStudiosApi.editions.delete(storeId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      toast({ title: "Edition deleted" });
    },
    onError: (err: Error) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8"><SkeletonRows rows={5} cols={1} /></div>;
  if (error) return <ErrorState message="Couldn't load editions" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-2xl text-foreground">Your Editions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Editions you own exclusively — buyers access them via your store.
          </p>
        </div>
        <button
          onClick={onNew}
          style={{ background: CLAY }}
          className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          New edition
        </button>
      </div>

      {/* Empty state */}
      {editions.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-border bg-card/60 p-12 flex flex-col items-center gap-3 text-center">
          <BookOpen className="w-8 h-8 text-muted-foreground/40" />
          <p className="font-display font-semibold text-foreground">No editions yet</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Create your first edition — it starts as a draft and you publish when ready.
          </p>
          <button
            onClick={onNew}
            style={{ background: NAVY }}
            className="mt-2 flex items-center gap-2 px-5 py-2 rounded-full text-white text-[13px] font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Create first edition
          </button>
        </div>
      )}

      {/* Table */}
      {editions.length > 0 && (
        <div className="rounded-[14px] border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {editions.map((ed, i) => (
                <tr
                  key={ed.id}
                  className={`border-b last:border-0 transition-colors hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-foreground leading-tight">{ed.name}</p>
                    {ed.sections && ed.sections.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
                        {ed.sections.slice(0, 3).join(" · ")}{ed.sections.length > 3 ? ` +${ed.sections.length - 3}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={ed.status} />
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {ed.priceLow != null && ed.priceHigh != null
                      ? `$${ed.priceLow}–$${ed.priceHigh}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 justify-end">
                      {/* Publish / Unpublish — owner only */}
                      {isOwner && ed.status === "draft" && (
                        <button
                          onClick={() => publishMut.mutate({ id: ed.id, status: "live" })}
                          disabled={publishMut.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40"
                        >
                          <Globe className="w-3 h-3" />Publish
                        </button>
                      )}
                      {isOwner && ed.status === "live" && (
                        <button
                          onClick={() => publishMut.mutate({ id: ed.id, status: "draft" })}
                          disabled={publishMut.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-40"
                        >
                          <EyeOff className="w-3 h-3" />Unpublish
                        </button>
                      )}
                      {/* Edit */}
                      <button
                        onClick={() => onEdit(ed.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-medium border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Edit3 className="w-3 h-3" />Edit
                      </button>
                      {/* Delete — owner only, draft only */}
                      {isOwner && ed.status === "draft" && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${ed.name}"? This cannot be undone.`)) {
                              deleteMut.mutate(ed.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                          className="p-1.5 rounded-full text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ownership note */}
      <p className="text-[11.5px] text-muted-foreground">
        Editions listed here are exclusively yours (origin: owned). Catalog editions your store is entitled to appear in your shop catalog automatically.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — CREATE (two-path)
// ═══════════════════════════════════════════════════════════════════════════════

function BlankCreateCard({
  storeId, onCreated,
}: {
  storeId: string;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName]         = useState("");
  const [priceLow, setPriceLow] = useState("12");
  const [priceHigh, setPriceHigh] = useState("18");

  const mut = useMutation({
    mutationFn: () =>
      storeStudiosApi.editions.create(storeId, {
        name: name.trim(),
        sections: [],
        priceLow: parseFloat(priceLow) || 0,
        priceHigh: parseFloat(priceHigh) || 0,
      }),
    onSuccess: (data) => {
      toast({ title: "Edition created", description: `"${name}" saved as draft.` });
      onCreated((data as { id: string }).id);
    },
    onError: (err: Error) =>
      toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="rounded-[14px] border bg-card shadow-sm p-6 flex flex-col gap-5 h-full">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 shrink-0" style={{ color: NAVY }} />
          <p className="font-display font-semibold text-[15px] text-foreground">Start blank</p>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Fill in details yourself. Attach themes, packs, and inserts from the edit view.
        </p>
      </div>

      <div className="flex-1 space-y-4">
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Edition name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) mut.mutate(); }}
            placeholder="e.g. Classic Planner 2027"
            className={FIELD}
          />
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-medium text-muted-foreground">Price from ($)</label>
            <input type="number" min="0" step="0.01" value={priceLow}
              onChange={(e) => setPriceLow(e.target.value)} className={FIELD} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-medium text-muted-foreground">Price to ($)</label>
            <input type="number" min="0" step="0.01" value={priceHigh}
              onChange={(e) => setPriceHigh(e.target.value)} className={FIELD} />
          </div>
        </div>

        {mut.isError && (
          <p className="text-[11.5px]" style={{ color: "#b23b3b" }}>
            {String((mut.error as Error)?.message ?? "Create failed")}
          </p>
        )}
      </div>

      <button
        onClick={() => mut.mutate()}
        disabled={!name.trim() || mut.isPending}
        style={{ background: NAVY, cursor: !name.trim() || mut.isPending ? "not-allowed" : "pointer" }}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {mut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Create draft
      </button>
    </div>
  );
}

function ClaudeCreateCard({
  storeId, aiEnabled, isSuperAdmin, onCreated,
}: {
  storeId: string;
  aiEnabled: boolean;
  isSuperAdmin?: boolean;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [prompt, setPrompt]           = useState("");
  const [aiMeta, setAiMeta]           = useState<{ model: string; provider: string } | null>(null);
  const [parseError, setParseError]   = useState<string | null>(null);
  const [generated, setGenerated]     = useState(false);
  const [name, setName]               = useState("");
  const [sections, setSections]       = useState<string[]>([]);
  const [palette, setPalette]         = useState<string[]>([]);
  const [priceLow, setPriceLow]       = useState("12");
  const [priceHigh, setPriceHigh]     = useState("18");

  const generate = useMutation({
    mutationFn: () => studioGenerateApi.generateEdition(storeId, { prompt: prompt.trim() }),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      setName(res.name ?? "");
      setSections(Array.isArray(res.sections) ? res.sections : []);
      setPalette(Array.isArray(res.palette) ? res.palette.slice(0, 6) : []);
      setPriceLow(String(res.priceLow ?? 12));
      setPriceHigh(String(res.priceHigh ?? 18));
      setGenerated(true);
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: () =>
      storeStudiosApi.editions.create(storeId, {
        name: name.trim(),
        sections,
        priceLow: parseFloat(priceLow) || 0,
        priceHigh: parseFloat(priceHigh) || 0,
        palette: palette.length === 6 && palette.every(isValidHex) ? palette : undefined,
      }),
    onSuccess: (data) => {
      toast({ title: "Edition saved as draft", description: `"${name}" is ready to review.` });
      onCreated((data as { id: string }).id);
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  if (!aiEnabled) {
    if (isSuperAdmin) {
      return (
        <div className="rounded-[14px] border bg-card shadow-sm p-6 flex flex-col h-full">
          <SuperAdminAiBanner />
        </div>
      );
    }
    return (
      <div className="rounded-[14px] border bg-card shadow-sm p-6 flex flex-col gap-4 opacity-60 select-none h-full">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: CLAY }} />
          <p className="font-display font-semibold text-[15px] text-foreground">✦ Start with Claude</p>
        </div>
        <p className="text-[12px] text-muted-foreground">
          AI Studios aren't enabled for your plan. Enable them in store settings to use Claude.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[14px] border bg-card shadow-sm p-6 flex flex-col gap-4 h-full"
      style={{ borderColor: "rgba(200, 117, 96, 0.3)" }}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: CLAY }} />
          <p className="font-display font-semibold text-[15px] text-foreground">✦ Start with Claude</p>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Describe your edition — Claude generates sections, palette, and price.
        </p>
        {aiMeta && (
          <p className="text-[10.5px] text-muted-foreground mt-0.5">via {aiMeta.model ?? aiMeta.provider}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
          placeholder={'e.g. "A Christmas planner for 2026 — cosy December logs, gift tracker, cranberry and gold palette"'}
          className={`${FIELD} resize-none`}
        />
        <p className="text-[10.5px] text-muted-foreground">⌘ + Enter to generate</p>
      </div>

      <button
        onClick={() => generate.mutate()}
        disabled={generate.isPending || !prompt.trim()}
        style={{ background: CLAY, cursor: generate.isPending || !prompt.trim() ? "not-allowed" : "pointer" }}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {generate.isPending
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Claude is thinking…</>
          : <><BookOpen className="w-3.5 h-3.5" />Generate spec</>}
      </button>

      {parseError && !generate.isPending && (
        <ErrorState message={parseError} onRetry={() => generate.mutate()} />
      )}

      {generated && !generate.isPending && (
        <div className="space-y-3 pt-2 border-t border-border">
          {/* Palette swatches */}
          {palette.length === 6 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Palette</p>
              <div className="grid grid-cols-6 gap-1">
                {palette.map((hex, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <div className="w-full aspect-square rounded-md border shadow-sm"
                      style={{ backgroundColor: isValidHex(hex) ? hex : "#ccc" }} />
                    <span className="text-[8.5px] text-muted-foreground">{PALETTE_LABELS[i]}</span>
                    <Input value={hex}
                      onChange={(e) => { const n = [...palette]; n[i] = e.target.value; setPalette(n); }}
                      className="h-4 text-[8px] text-center px-0 font-mono" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          {sections.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Sections</p>
              <div className="flex flex-wrap gap-1">
                {sections.map((s, i) => (
                  <Badge key={i} variant="secondary" className="text-[10.5px] px-2 py-0.5 bg-[#F7F0E6] text-[#1B2A4A] border-[#E7DCCB]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Editable name + price */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[10.5px]">Edition name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[12.5px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10.5px]">Price from ($)</Label>
                <Input type="number" min="0" value={priceLow}
                  onChange={(e) => setPriceLow(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10.5px]">Price to ($)</Label>
                <Input type="number" min="0" value={priceHigh}
                  onChange={(e) => setPriceHigh(e.target.value)} className="h-8" />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !prompt.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-3 h-3" />Regenerate
            </button>
            <div className="flex-1" />
            <button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              style={{ background: CLAY, cursor: !name.trim() || save.isPending ? "not-allowed" : "pointer" }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-[12px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {save.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditionCreate({
  storeId, role, aiEnabled, onCreated, onBack,
}: {
  storeId: string;
  role: string;
  aiEnabled: boolean;
  onCreated: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} style={{ cursor: "pointer" }}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />Back to editions
        </button>
      </div>

      <div>
        <h1 className="font-display font-semibold text-2xl text-foreground">New edition</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Start blank and fill it in, or let Claude design the spec for you.
          Both paths save as draft — you publish when ready.
        </p>
      </div>

      {/* Two-path cards — equal height */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
        <BlankCreateCard storeId={storeId} onCreated={onCreated} />
        <ClaudeCreateCard storeId={storeId} aiEnabled={aiEnabled} isSuperAdmin={isSuperAdminRole(role)} onCreated={onCreated} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — EDIT (existing form, mostly unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

interface AttachableItems {
  themes: CatalogItem[];
  packs: CatalogItem[];
  inserts: CatalogItem[];
  products: CatalogItem[];
  editions: CatalogItem[];
}

function EditionEdit({
  storeId, editId, role, aiEnabled, onBack,
}: {
  storeId: string;
  editId: string;
  role: string;
  aiEnabled: boolean;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = isStoreOwnerRole(role);

  const [prompt, setPrompt]           = useState("");
  const [showRevise, setShowRevise]   = useState(false);
  const [reviseFromId, setReviseFromId] = useState("");
  const [aiMeta, setAiMeta]           = useState<{ model: string; provider: string } | null>(null);
  const [parseError, setParseError]   = useState<string | null>(null);

  const [name, setName]               = useState("");
  const [sections, setSections]       = useState<string[]>([]);
  const [palette, setPalette]         = useState<string[]>([]);
  const [priceLow, setPriceLow]       = useState("12");
  const [priceHigh, setPriceHigh]     = useState("18");
  const [selThemes, setSelThemes]     = useState<string[]>([]);
  const [selPacks, setSelPacks]       = useState<string[]>([]);
  const [selInserts, setSelInserts]   = useState<string[]>([]);
  const [selProducts, setSelProducts] = useState<string[]>([]);
  const [prefilled, setPrefilled]     = useState(false);
  const [hasResult, setHasResult]     = useState(false);

  const { data: owned } = useQuery<OwnedList>({
    queryKey: ["store-owned-list", storeId],
    queryFn: () => storeStudiosApi.list(storeId),
    enabled: !!editId,
  });
  const existingEdition = editId
    ? (owned?.editions ?? []).find((e) => e.id === editId) as OwnedEdition | undefined
    : undefined;

  useEffect(() => {
    if (!existingEdition || prefilled) return;
    setName(existingEdition.name);
    setSections((existingEdition.sections as string[]) ?? []);
    setPriceLow(String(existingEdition.priceLow ?? 12));
    setPriceHigh(String(existingEdition.priceHigh ?? 18));
    setSelThemes((existingEdition.themes as string[]) ?? []);
    setSelPacks((existingEdition.packs as string[]) ?? []);
    setSelInserts((existingEdition.inserts as string[]) ?? []);
    setSelProducts((existingEdition.products as string[]) ?? []);
    setHasResult(true);
    setPrefilled(true);
  }, [existingEdition, prefilled]);

  const attachable = useQuery<AttachableItems>({
    queryKey: ["store-attachable", storeId],
    queryFn: () => storeStudiosApi.attachable(storeId),
  });

  const ownedEditions = (attachable.data?.editions ?? []).filter(
    (e) => e.origin === "owned" && e.authoredByStoreId === storeId,
  );

  const generate = useMutation({
    mutationFn: () => studioGenerateApi.generateEdition(storeId, { prompt: prompt.trim() }),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      setName(res.name ?? "");
      setSections(Array.isArray(res.sections) ? res.sections : []);
      setPalette(Array.isArray(res.palette) ? res.palette.slice(0, 6) : []);
      setPriceLow(String(res.priceLow ?? 12));
      setPriceHigh(String(res.priceHigh ?? 18));
      setHasResult(true);
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: () =>
      storeStudiosApi.editions.update(storeId, editId, {
        name: name.trim(),
        sections,
        priceLow: parseFloat(priceLow) || 0,
        priceHigh: parseFloat(priceHigh) || 0,
        themeIds: selThemes,
        packIds: selPacks,
        insertIds: selInserts,
        productIds: selProducts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      qc.invalidateQueries({ queryKey: ["store-attachable", storeId] });
      toast({ title: "Edition updated", description: `"${name}" has been saved.` });
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const publishMut = useMutation({
    mutationFn: (newStatus: "live" | "draft") =>
      storeStudiosApi.editions.update(storeId, editId, { status: newStatus }),
    onSuccess: (_, newStatus) => {
      qc.invalidateQueries({ queryKey: ["store-owned-list", storeId] });
      toast({ title: newStatus === "live" ? "Edition published" : "Edition unpublished" });
    },
    onError: (err: Error) =>
      toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Loading while we wait for pre-fill
  if (!prefilled && !owned) {
    return <div className="p-8"><SkeletonRows rows={4} cols={1} /></div>;
  }
  if (!existingEdition && owned) {
    return <ErrorState message="Edition not found or no longer accessible." />;
  }

  const currentStatus = existingEdition?.status ?? "draft";

  return (
    <div className="max-w-3xl mx-auto space-y-0 animate-in fade-in duration-300">
      {/* Edit mode banner */}
      <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-lg bg-[#1B2A4A]/10 border border-[#1B2A4A]/20">
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5" />Your editions
        </button>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-sm font-medium text-[#1B2A4A]">
          Editing: {existingEdition?.name ?? "edition"}
        </span>
        <div className="ml-auto">
          <StatusBadge status={currentStatus} />
        </div>
      </div>

      <ClaudeHeader
        title="Edit edition"
        description="Update the edition spec below. Regenerate with Claude, or edit directly. Attach catalog items before publishing."
        model={aiMeta?.model}
        provider={aiMeta?.provider}
      />

      {/* Regenerate section (collapsible, AI gated) */}
      {aiEnabled && (
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-4">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowRevise(!showRevise)}
            >
              {showRevise ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Regenerate with Claude (optional)
            </button>
            {showRevise && (
              <div className="space-y-3">
                {ownedEditions.length > 1 && (
                  <Select value={reviseFromId} onValueChange={(id) => {
                    setReviseFromId(id);
                    const ed = ownedEditions.find((e) => e.id === id);
                    if (ed) setPrompt(`Revise "${ed.name}" for next year. Keep the core identity but refresh the seasonal references, section names, and palette.`);
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Base on another edition…" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownedEditions.map((ed) => (
                        <SelectItem key={ed.id} value={ed.id}>{ed.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Textarea
                  rows={2}
                  placeholder="Describe changes…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
                  className="resize-none font-sans"
                />
                <Button
                  size="sm"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending || !prompt.trim()}
                  className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
                >
                  {generate.isPending
                    ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Thinking…</>
                    : <><BookOpen className="w-3.5 h-3.5 mr-2" />Regenerate spec</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {parseError && !generate.isPending && (
        <div className="mb-6"><ErrorState message={parseError} onRetry={() => generate.mutate()} /></div>
      )}

      {hasResult && (
        <div className="space-y-4 mb-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Edition spec</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {/* Palette (only when AI generated) */}
              {palette.length === 6 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Palette</p>
                  <div className="grid grid-cols-6 gap-2">
                    {palette.map((hex, i) => (
                      <div key={i} className="flex flex-col items-center gap-1.5">
                        <div className="w-full aspect-square rounded-lg border border-border shadow-sm"
                          style={{ backgroundColor: isValidHex(hex) ? hex : "#ccc" }} />
                        <span className="text-[10px] text-muted-foreground text-center leading-tight">{PALETTE_LABELS[i]}</span>
                        <Input value={hex}
                          onChange={(e) => { const n = [...palette]; n[i] = e.target.value; setPalette(n); }}
                          className="h-6 text-[10px] text-center px-1 font-mono" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sections */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sections</p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((s, i) => (
                    <Badge key={i} variant="secondary" className="px-3 py-1 bg-[#F7F0E6] text-[#1B2A4A] border-[#E7DCCB]">{s}</Badge>
                  ))}
                  {sections.length === 0 && (
                    <p className="text-xs text-muted-foreground">No sections — regenerate with Claude to add them.</p>
                  )}
                </div>
              </div>

              {/* Name + Price */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Edition name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Price low (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input type="number" min="0" value={priceLow}
                      onChange={(e) => setPriceLow(e.target.value)} className="pl-6" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Price high (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <Input type="number" min="0" value={priceHigh}
                      onChange={(e) => setPriceHigh(e.target.value)} className="pl-6" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Catalog attachment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attach catalog items</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose from your store's owned items (★) and entitled catalog content.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {attachable.isLoading ? (
                <div className="col-span-2"><SkeletonRows rows={3} cols={1} /></div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Themes</Label>
                    <MultiChips items={attachable.data?.themes ?? []} selected={selThemes} onToggle={toggle(setSelThemes)} originBadge />
                    {/* Font specimens — shown for each selected theme that has a heading or body font */}
                    {selThemes.length > 0 &&
                      (owned?.themes ?? [])
                        .filter((t) => selThemes.includes(t.id) && (t.fontPairing?.heading || t.fontPairing?.body))
                        .map((t) => (
                          <FontSpecimenCard
                            key={t.id}
                            fontPairing={t.fontPairing!}
                            themeName={t.name}
                            compact
                          />
                        ))}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sticker packs</Label>
                    <MultiChips items={attachable.data?.packs ?? []} selected={selPacks} onToggle={toggle(setSelPacks)} originBadge />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Inserts</Label>
                    <MultiChips items={attachable.data?.inserts ?? []} selected={selInserts} onToggle={toggle(setSelInserts)} originBadge />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Related products</Label>
                    <MultiChips items={attachable.data?.products ?? []} selected={selProducts} onToggle={toggle(setSelProducts)} originBadge />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />Back to list
            </Button>
            <div className="flex-1" />
            {/* Publish / Unpublish — owner only */}
            {isOwner && currentStatus === "draft" && (
              <Button
                size="sm"
                variant="outline"
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => publishMut.mutate("live")}
                disabled={publishMut.isPending}
              >
                {publishMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Globe className="w-3.5 h-3.5 mr-2" />}
                Publish
              </Button>
            )}
            {isOwner && currentStatus === "live" && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => publishMut.mutate("draft")}
                disabled={publishMut.isPending}
              >
                {publishMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <EyeOff className="w-3.5 h-3.5 mr-2" />}
                Unpublish
              </Button>
            )}
            <Button
              size="sm"
              className="bg-[#C87560] hover:bg-[#A85E4E] text-white"
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
            >
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — routes between the three phases
// ═══════════════════════════════════════════════════════════════════════════════

export default function StoreEditionStudio({ storeId, role, aiEnabled }: Props) {
  const search = useSearch();
  const [, setLocation] = useLocation();

  const params  = new URLSearchParams(search);
  const editId  = params.get("edit") ?? undefined;
  const mode    = params.get("mode") ?? undefined;
  const base    = `/store/${storeId}/studios/edition`;

  const goList   = () => setLocation(base);
  const goCreate = () => setLocation(`${base}?mode=create`);
  const goEdit   = (id: string) => setLocation(`${base}?edit=${id}`);

  if (editId) {
    return (
      <EditionEdit
        storeId={storeId}
        editId={editId}
        role={role}
        aiEnabled={aiEnabled}
        onBack={goList}
      />
    );
  }

  if (mode === "create") {
    return (
      <EditionCreate
        storeId={storeId}
        role={role}
        aiEnabled={aiEnabled}
        onCreated={goEdit}
        onBack={goList}
      />
    );
  }

  return (
    <EditionList
      storeId={storeId}
      role={role}
      onNew={goCreate}
      onEdit={goEdit}
    />
  );
}
