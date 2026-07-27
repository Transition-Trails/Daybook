/**
 * Theme detail / composer
 *
 * Tabs:
 *   Basic     — name, id (new only), desc, price
 *   Palettes  — pick from platform palettes, mark one primary, drag to reorder
 *   Backgrounds — pick from platform backgrounds
 *   Font Pairing — heading / subheading / body / accent + live preview
 *   Packs     — pick from platform sticker packs
 *
 * API calls use raw fetch because the generated api-client-react types don't
 * model the enriched theme response or the composer sub-routes.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useFontLoader } from "@/components/FontSpecimenCard";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, Loader2, Check, X, AlertTriangle, Star, Palette, Image, Type, Package, Plus, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────

interface RichPalette {
  id: string;
  name: string;
  colors: string[];
  isPrimary: boolean;
  position: number;
}
interface RichBackground {
  id: string;
  name: string;
  type: string;
  value: string | null;
}
interface RichPack {
  id: string;
  name: string;
}
interface FontPairing {
  heading?: string;
  subheading?: string;
  body?: string;
  accent?: string;
}
interface EnrichedTheme {
  id: string;
  name: string;
  desc: string | null;
  status: string;
  origin: string;
  price: number;
  colors: string[];
  fontPairing: FontPairing | null;
  palettes: RichPalette[];
  backgrounds: RichBackground[];
  packs: RichPack[];
}
interface PaletteRow  { id: string; name: string; colors: string[] }
interface BackgroundRow { id: string; name: string; type: string; value: string | null }
interface PackRow     { id: string; name: string }

// ── API helpers ───────────────────────────────────────────────────────────

const api = {
  async getTheme(id: string): Promise<EnrichedTheme> {
    const r = await fetch(`/api/themes/${id}`, { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async createTheme(body: Record<string, unknown>): Promise<EnrichedTheme> {
    const r = await fetch("/api/themes", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patchTheme(id: string, body: Record<string, unknown>): Promise<EnrichedTheme> {
    const r = await fetch(`/api/themes/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async deleteTheme(id: string): Promise<void> {
    const r = await fetch(`/api/themes/${id}`, { method: "DELETE", credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
  },
  async putPalettes(id: string, links: { paletteId: string; isPrimary: boolean; position: number }[]): Promise<RichPalette[]> {
    const r = await fetch(`/api/themes/${id}/palettes`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(links),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async putBackgrounds(id: string, links: { backgroundId: string; position: number }[]): Promise<RichBackground[]> {
    const r = await fetch(`/api/themes/${id}/backgrounds`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(links),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async putPacks(id: string, links: { packId: string; position: number }[]): Promise<RichPack[]> {
    const r = await fetch(`/api/themes/${id}/packs`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(links),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async putFontPairing(id: string, fp: FontPairing | null): Promise<FontPairing | null> {
    const r = await fetch(`/api/themes/${id}/font-pairing`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fp ?? {}),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async listPalettes(): Promise<PaletteRow[]> {
    const r = await fetch("/api/palettes", { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async listBackgrounds(): Promise<BackgroundRow[]> {
    const r = await fetch("/api/backgrounds", { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async listPacks(): Promise<PackRow[]> {
    const r = await fetch("/api/packs", { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

// ── Chip toggle helper ────────────────────────────────────────────────────

const CHIP_BASE = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium border transition-colors cursor-pointer select-none";
const CHIP_ON   = "bg-[#1B2A4A] text-white border-[#1B2A4A]";
const CHIP_OFF  = "bg-muted text-muted-foreground border-border hover:bg-muted/70";

// ── Tab nav ───────────────────────────────────────────────────────────────

type Tab = "basic" | "palettes" | "backgrounds" | "fonts" | "packs";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "basic",       label: "Basic info",      icon: <Save className="w-3.5 h-3.5" /> },
  { id: "palettes",    label: "Palettes",         icon: <Palette className="w-3.5 h-3.5" /> },
  { id: "backgrounds", label: "Backgrounds",      icon: <Image className="w-3.5 h-3.5" /> },
  { id: "fonts",       label: "Font pairing",     icon: <Type className="w-3.5 h-3.5" /> },
  { id: "packs",       label: "Sticker packs",    icon: <Package className="w-3.5 h-3.5" /> },
];

// ── Palette item row ──────────────────────────────────────────────────────

function PaletteItem({
  palette,
  selected,
  isPrimary,
  onToggle,
  onMakePrimary,
}: {
  palette: PaletteRow;
  selected: boolean;
  isPrimary: boolean;
  onToggle: () => void;
  onMakePrimary: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${selected ? "border-[#1B2A4A]/40 bg-[#1B2A4A]/5" : "border-border bg-card hover:bg-muted/40"}`}>
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${selected ? "bg-[#1B2A4A] border-[#1B2A4A]" : "border-muted-foreground/30"}`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </button>

      {/* Swatches */}
      <div className="flex items-center gap-0.5">
        {palette.colors.slice(0, 6).map((c, i) => (
          <span key={i} style={{ background: c }} className="w-5 h-5 rounded-sm border border-black/10" />
        ))}
      </div>

      <span className="flex-1 text-sm font-medium text-foreground truncate">{palette.name}</span>

      {/* Primary star */}
      {selected && (
        <button
          onClick={onMakePrimary}
          title={isPrimary ? "Primary palette" : "Make primary"}
          className={`p-1 rounded transition-colors ${isPrimary ? "text-amber-500" : "text-muted-foreground hover:text-amber-400"}`}
        >
          <Star className={`w-3.5 h-3.5 ${isPrimary ? "fill-amber-500" : ""}`} />
        </button>
      )}
    </div>
  );
}

// ── Background preview ────────────────────────────────────────────────────

function BgPreview({ bg, size = 28 }: { bg: BackgroundRow; size?: number }) {
  if (bg.type === "color" && bg.value)
    return <span style={{ background: bg.value, width: size, height: size }} className="rounded-md border border-black/10 shrink-0" />;
  if (bg.type === "image" && bg.value)
    return <img src={bg.value} alt="" style={{ width: size, height: size }} className="rounded-md object-cover border border-black/10 shrink-0" />;
  return <span style={{ width: size, height: size }} className="rounded-md bg-muted border border-dashed border-border shrink-0" />;
}

// ── Background item row ───────────────────────────────────────────────────

function BackgroundItem({ bg, selected, onToggle }: {
  bg: BackgroundRow;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${selected ? "border-[#1B2A4A]/40 bg-[#1B2A4A]/5" : "border-border bg-card hover:bg-muted/40"}`}>
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${selected ? "bg-[#1B2A4A] border-[#1B2A4A]" : "border-muted-foreground/30"}`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </button>
      <BgPreview bg={bg} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{bg.name}</p>
        <p className="text-[10px] text-muted-foreground">{bg.type}</p>
      </div>
    </div>
  );
}

// ── Pack item row ─────────────────────────────────────────────────────────

function PackItem({ pack, selected, onToggle }: {
  pack: PackRow;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${selected ? "border-[#1B2A4A]/40 bg-[#1B2A4A]/5" : "border-border bg-card hover:bg-muted/40"}`}>
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors ${selected ? "bg-[#1B2A4A] border-[#1B2A4A]" : "border-muted-foreground/30"}`}
      >
        {selected && <Check className="w-3 h-3 text-white" />}
      </button>
      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm font-medium text-foreground truncate">{pack.name}</span>
    </div>
  );
}

// ── Palettes tab ──────────────────────────────────────────────────────────

function PalettesTab({ theme, onSaved }: { theme: EnrichedTheme; onSaved: () => void }) {
  const { toast } = useToast();
  const { data: allPalettes = [], isLoading } = useQuery<PaletteRow[]>({
    queryKey: ["palettes-library"],
    queryFn: api.listPalettes,
  });

  // Local state: map of paletteId → { selected, isPrimary }
  const [selection, setSelection] = useState<Record<string, { selected: boolean; isPrimary: boolean; position: number }>>(() => {
    const out: Record<string, { selected: boolean; isPrimary: boolean; position: number }> = {};
    for (const p of theme.palettes) out[p.id] = { selected: true, isPrimary: p.isPrimary, position: p.position };
    return out;
  });

  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelection(prev => {
      const cur = prev[id];
      if (cur?.selected) {
        const next = { ...prev, [id]: { ...cur, selected: false } };
        // If we de-selected the primary, pick a new primary
        if (cur.isPrimary) {
          const remaining = Object.entries(next).find(([, v]) => v.selected);
          if (remaining) next[remaining[0]].isPrimary = true;
        }
        return next;
      }
      const selectedCount = Object.values(prev).filter(v => v.selected).length;
      return { ...prev, [id]: { selected: true, isPrimary: selectedCount === 0, position: selectedCount } };
    });
  };

  const makePrimary = (id: string) => {
    setSelection(prev => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k].isPrimary = k === id;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const links = Object.entries(selection)
        .filter(([, v]) => v.selected)
        .sort(([, a], [, b]) => a.position - b.position)
        .map(([paletteId, v], i) => ({ paletteId, isPrimary: v.isPrimary, position: i }));
      await api.putPalettes(theme.id, links);
      toast({ title: "Palettes saved" });
      onSaved();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.values(selection).filter(v => v.selected).length;

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Select palettes to include in this bundle. Star one as the primary representative.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save {selectedCount > 0 ? `(${selectedCount})` : ""}
        </button>
      </div>

      {selectedCount === 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">No palettes selected — this theme will appear as a hollow bundle.</p>
        </div>
      )}

      <div className="grid gap-2">
        {allPalettes.map(p => (
          <PaletteItem
            key={p.id}
            palette={p}
            selected={selection[p.id]?.selected ?? false}
            isPrimary={selection[p.id]?.isPrimary ?? false}
            onToggle={() => toggle(p.id)}
            onMakePrimary={() => makePrimary(p.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Backgrounds tab ───────────────────────────────────────────────────────

function BackgroundsTab({ theme, onSaved }: { theme: EnrichedTheme; onSaved: () => void }) {
  const { toast } = useToast();
  const { data: allBgs = [], isLoading } = useQuery<BackgroundRow[]>({
    queryKey: ["backgrounds-library"],
    queryFn: api.listBackgrounds,
  });

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(theme.backgrounds.map(b => b.id)),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const links = [...selected].map((backgroundId, i) => ({ backgroundId, position: i }));
      await api.putBackgrounds(theme.id, links);
      toast({ title: "Backgrounds saved" });
      onSaved();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Choose backgrounds available when this theme is selected.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>

      {allBgs.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No backgrounds in the library yet.{" "}
          <Link href="/catalog/backgrounds"><span className="underline underline-offset-2">Add some</span></Link>
        </p>
      )}

      <div className="grid gap-2">
        {allBgs.map(bg => (
          <BackgroundItem
            key={bg.id}
            bg={bg}
            selected={selected.has(bg.id)}
            onToggle={() => toggle(bg.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Font pairing tab ──────────────────────────────────────────────────────

const SUGGESTED_PAIRS: { label: string; heading: string; body: string }[] = [
  { label: "Editorial",  heading: "Playfair Display",   body: "Lato" },
  { label: "Botanical",  heading: "Cormorant Garamond", body: "Source Sans Pro" },
  { label: "Coastal",    heading: "Spectral",           body: "Work Sans" },
  { label: "Literary",   heading: "Crimson Pro",        body: "Instrument Sans" },
  { label: "Modern",     heading: "DM Serif Display",   body: "DM Sans" },
  { label: "Academic",   heading: "EB Garamond",        body: "Inter" },
];

function FontPairingTab({ theme, onSaved }: { theme: EnrichedTheme; onSaved: () => void }) {
  const { toast } = useToast();
  const [fp, setFp] = useState<FontPairing>(theme.fontPairing ?? {});
  const [saving, setSaving] = useState(false);

  // Collect every family referenced by the current pairing state + all suggested
  // presets, then load them all at once so chips and the live preview render in
  // the correct typefaces without per-chip waterfalls.
  const allFamilies = useMemo(() => Array.from(new Set([
    ...SUGGESTED_PAIRS.flatMap(p => [p.heading, p.body]),
    ...[fp.heading, fp.subheading, fp.body, fp.accent].filter(Boolean) as string[],
  ])), [fp.heading, fp.subheading, fp.body, fp.accent]);
  useFontLoader(allFamilies);

  const save = async () => {
    setSaving(true);
    try {
      await api.putFontPairing(theme.id, fp);
      toast({ title: "Font pairing saved" });
      onSaved();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (p: { heading: string; body: string }) => {
    setFp(prev => ({ ...prev, heading: p.heading, subheading: p.heading, body: p.body }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Set the Google Font names for heading, subheading, body, and accent roles.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {/* Suggested presets — label in heading face, descriptor in body face */}
      <div className="space-y-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Suggested pairings</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PAIRS.map(p => {
            const isActive = fp.heading === p.heading && fp.body === p.body;
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border transition-colors cursor-pointer select-none text-left"
                style={isActive
                  ? { background: "#1B2A4A", borderColor: "#1B2A4A" }
                  : { background: "hsl(var(--muted))", borderColor: "hsl(var(--border))" }}
              >
                {/* Pairing name in the heading face */}
                <span
                  style={{
                    fontFamily: `'${p.heading}', Georgia, serif`,
                    fontSize:   13,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color:      isActive ? "#fff" : "#1B2A4A",
                  }}
                >
                  {p.label}
                </span>
                {/* Family names in the body face */}
                <span
                  style={{
                    fontFamily: `'${p.body}', system-ui, sans-serif`,
                    fontSize:   10,
                    lineHeight: 1.3,
                    color:      isActive ? "rgba(255,255,255,0.65)" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {p.heading} / {p.body}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Manual fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(["heading", "subheading", "body", "accent"] as const).map(role => (
          <div key={role} className="space-y-1.5">
            <label className="text-xs font-medium text-foreground capitalize">{role}</label>
            <Input
              value={fp[role] ?? ""}
              onChange={e => setFp(prev => ({ ...prev, [role]: e.target.value }))}
              placeholder={role === "heading" ? "e.g. Playfair Display" : role === "body" ? "e.g. Lato" : "optional"}
              className="font-mono text-sm"
            />
          </div>
        ))}
      </div>

      {/* Live preview — each role label is set in its own assigned face */}
      {(fp.heading || fp.body) && (
        <div className="rounded-xl border border-border p-6 bg-muted/30 space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Preview</p>

          {fp.heading && (
            <div className="space-y-0.5">
              <p style={{
                fontFamily: `'${fp.heading}', Georgia, serif`,
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "#9CA3AF",
              }}>
                Heading — {fp.heading}
              </p>
              <p style={{ fontFamily: `'${fp.heading}', Georgia, serif` }}
                className="text-2xl font-bold text-foreground leading-tight">
                The quick brown fox
              </p>
            </div>
          )}

          {fp.subheading && (
            <div className="space-y-0.5">
              <p style={{
                fontFamily: `'${fp.subheading}', Georgia, serif`,
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "#9CA3AF",
              }}>
                Subheading — {fp.subheading}
              </p>
              <p style={{ fontFamily: `'${fp.subheading}', Georgia, serif` }}
                className="text-base text-muted-foreground">
                A beautiful subheading line
              </p>
            </div>
          )}

          {fp.body && (
            <div className="space-y-0.5">
              <p style={{
                fontFamily: `'${fp.body}', system-ui, sans-serif`,
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "#9CA3AF",
              }}>
                Body — {fp.body}
              </p>
              <p style={{ fontFamily: `'${fp.body}', system-ui, sans-serif` }}
                className="text-sm text-foreground/80 leading-relaxed">
                Body text uses this font for reading comfort across long-form planner content.
              </p>
            </div>
          )}

          {fp.accent && (
            <div className="space-y-0.5">
              <p style={{
                fontFamily: `'${fp.accent}', Georgia, serif`,
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.12em", color: "#9CA3AF",
              }}>
                Accent — {fp.accent}
              </p>
              <p style={{ fontFamily: `'${fp.accent}', Georgia, serif` }}
                className="text-xs text-muted-foreground uppercase tracking-wider">
                Accent label text
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
            Fonts render here once the Google Fonts stylesheet loads. The PDF generator embeds them directly.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Packs tab ─────────────────────────────────────────────────────────────

function PacksTab({ theme, onSaved }: { theme: EnrichedTheme; onSaved: () => void }) {
  const { toast } = useToast();
  const { data: allPacks = [], isLoading } = useQuery<PackRow[]>({
    queryKey: ["packs-library"],
    queryFn: api.listPacks,
  });

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(theme.packs.map(p => p.id)),
  );
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const links = [...selected].map((packId, i) => ({ packId, position: i }));
      await api.putPacks(theme.id, links);
      toast({ title: "Packs saved" });
      onSaved();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Attach sticker packs to this theme bundle.
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1B2A4A] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save {selected.size > 0 ? `(${selected.size})` : ""}
        </button>
      </div>

      {allPacks.length === 0 && (
        <p className="text-sm text-muted-foreground italic">No sticker packs in the library yet.</p>
      )}

      <div className="grid gap-2">
        {allPacks.map(pack => (
          <PackItem
            key={pack.id}
            pack={pack}
            selected={selected.has(pack.id)}
            onToggle={() => toggle(pack.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Basic info tab ────────────────────────────────────────────────────────

function BasicInfoTab({
  theme,
  isNew,
  onCreated,
  onSaved,
}: {
  theme?: EnrichedTheme;
  isNew: boolean;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    id:    theme?.id    ?? "",
    name:  theme?.name  ?? "",
    desc:  theme?.desc  ?? "",
    price: String(theme?.price ?? 0),
  });
  const [saving, setSaving] = useState(false);

  // Keep form in sync if theme reloads
  useEffect(() => {
    if (theme) {
      setForm({ id: theme.id, name: theme.name, desc: theme.desc ?? "", price: String(theme.price ?? 0) });
    }
  }, [theme?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (isNew) {
        if (!form.id.trim()) { toast({ title: "ID is required", variant: "destructive" }); setSaving(false); return; }
        await api.createTheme({
          id: form.id.trim(),
          name: form.name.trim(),
          desc: form.desc.trim() || undefined,
          price: parseFloat(form.price) || 0,
          colors: [],
        });
        toast({ title: "Theme created" });
        onCreated?.(form.id.trim());
      } else {
        await api.patchTheme(theme!.id, {
          name: form.name.trim(),
          desc: form.desc.trim() || undefined,
          price: parseFloat(form.price) || 0,
        });
        toast({ title: "Saved" });
        onSaved?.();
      }
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-4">
      {isNew && (
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">ID <span className="text-muted-foreground text-xs">(slug, e.g. t-autumn-2025)</span></label>
          <Input
            value={form.id}
            onChange={e => setForm(p => ({ ...p, id: e.target.value }))}
            placeholder="t-my-theme"
            className="font-mono"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Name</label>
        <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Description</label>
        <Textarea
          value={form.desc}
          onChange={e => setForm(p => ({ ...p, desc: e.target.value }))}
          className="resize-none h-20"
          placeholder="A short buyer-facing description of this theme's visual identity."
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Price (USD)</label>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={form.price}
          onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
          className="max-w-[120px]"
        />
      </div>
      <Button onClick={save} disabled={saving} className="mt-2">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {isNew ? "Create theme" : "Save changes"}
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function ThemeDetail() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isNew = !params.id || params.id === "new";
  const id = isNew ? "" : (params.id as string);

  const [activeTab, setActiveTab] = useState<Tab>("basic");

  const { data: theme, isLoading, refetch } = useQuery<EnrichedTheme>({
    queryKey: ["theme-detail", id],
    queryFn: () => api.getTheme(id),
    enabled: !isNew,
  });

  const handleRefresh = useCallback(() => {
    refetch();
    qc.invalidateQueries({ queryKey: ["themes-enriched"] });
  }, [refetch, qc]);

  const handleCreated = (newId: string) => {
    qc.invalidateQueries({ queryKey: ["themes-enriched"] });
    setLocation(`/catalog/themes/${newId}`);
  };

  const handleDelete = async () => {
    if (!confirm("Delete this theme? The palettes will remain in the library.")) return;
    try {
      await api.deleteTheme(id);
      toast({ title: "Theme deleted" });
      qc.invalidateQueries({ queryKey: ["themes-enriched"] });
      setLocation("/catalog/themes");
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  const handlePublish = async () => {
    if (!theme) return;
    const newStatus = theme.status === "live" ? "draft" : "live";
    try {
      await api.patchTheme(id, { status: newStatus });
      toast({ title: newStatus === "live" ? "Theme published" : "Theme unpublished" });
      handleRefresh();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  const palettesCompleted = (theme?.palettes.length ?? 0) > 0;
  const fontCompleted     = !!(theme?.fontPairing?.heading && theme?.fontPairing?.body);

  if (!isNew && isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/catalog/themes"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-foreground">
              {isNew ? "New theme" : (theme?.name ?? id)}
            </h1>
            {!isNew && (
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{id}</p>
            )}
          </div>
        </div>

        {!isNew && theme && (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePublish}
              className={`px-3 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors ${
                theme.status === "live"
                  ? "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  : "bg-[#1B2A4A] text-white border-[#1B2A4A] hover:opacity-90"
              }`}
            >
              {theme.status === "live" ? "Unpublish" : "Publish"}
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete theme"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Bundle completeness indicator (edit mode only) */}
      {!isNew && theme && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-xl border border-border">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-muted-foreground mr-1">Bundle status</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${palettesCompleted ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
            {palettesCompleted ? <Check className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
            {palettesCompleted ? `${theme.palettes.length} palettes` : "No palettes"}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${theme.backgrounds.length ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>
            {theme.backgrounds.length ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
            {theme.backgrounds.length ? `${theme.backgrounds.length} bgs` : "No backgrounds"}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${fontCompleted ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>
            {fontCompleted ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
            {fontCompleted ? `${theme.fontPairing!.heading} / ${theme.fontPairing!.body}` : "No font pairing"}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${theme.packs.length ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground border-border"}`}>
            {theme.packs.length ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
            {theme.packs.length ? `${theme.packs.length} packs` : "No packs"}
          </span>
        </div>
      )}

      {/* Tabs — hidden for new theme until after creation */}
      {!isNew && (
        <div className="flex items-center gap-1 border-b border-border pb-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-t-lg text-[12.5px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#1B2A4A] text-[#1B2A4A] bg-muted/30"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div className="min-h-[300px]">
        {(isNew || activeTab === "basic") && (
          <BasicInfoTab
            theme={theme}
            isNew={isNew}
            onCreated={handleCreated}
            onSaved={handleRefresh}
          />
        )}
        {!isNew && theme && activeTab === "palettes"    && <PalettesTab    theme={theme} onSaved={handleRefresh} />}
        {!isNew && theme && activeTab === "backgrounds" && <BackgroundsTab theme={theme} onSaved={handleRefresh} />}
        {!isNew && theme && activeTab === "fonts"       && <FontPairingTab  theme={theme} onSaved={handleRefresh} />}
        {!isNew && theme && activeTab === "packs"       && <PacksTab        theme={theme} onSaved={handleRefresh} />}
      </div>
    </div>
  );
}
