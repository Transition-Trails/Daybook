/**
 * /editions/new — standalone two-path edition create page.
 *
 * "Start blank"        — fill name / description / price → save draft.
 * "✦ Start with Claude" — describe a concept → AI spec → editable → save draft.
 *
 * After either path creates the edition the user is navigated to /editions/:id.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, BookOpen, Sparkles, ArrowLeft, RefreshCw,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { aiApi, extractJson, isValidHex, PALETTE_LABELS } from "@/lib/ai";
import { ErrorState } from "@/components/shared";

// ── API helpers ───────────────────────────────────────────────────────────────

interface EditionPayload {
  name: string;
  description: string;
  sections: string[];
  priceLow: number;
  priceHigh: number;
  status: "draft";
  globalAvailable: boolean;
}

async function createEdition(data: EditionPayload): Promise<{ id: string }> {
  const res = await fetch("/api/editions", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error((b as any)?.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Claude spec shape ─────────────────────────────────────────────────────────

interface EditionAiResult {
  name: string;
  description: string;
  sections: string[];
  palette: string[];
  priceLow: number;
  priceHigh: number;
}

const SYSTEM_PROMPT = `You are a product designer for Daybook, a premium digital planner brand.
When given a planner edition concept, respond ONLY with valid JSON — no markdown, no explanation.
{
  "name": "edition name (3-6 words, e.g. 'The Christmas 2026 Planner')",
  "description": "2-sentence pitch that captures who it's for and what makes it special",
  "sections": ["Section A","Section B","Section C","Section D","Section E"],
  "palette": ["#hex1","#hex2","#hex3","#hex4","#hex5","#hex6"],
  "priceLow": 12,
  "priceHigh": 18
}
sections: 5–7 planner section names that make sense for this theme.
palette 6 colors: accent, accent-dark, secondary, tertiary, ink, paper.
priceLow/priceHigh: suggested USD retail price (integers).`;

// ── Shared field styles ───────────────────────────────────────────────────────

const FIELD = "w-full rounded-xl border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-foreground/40 transition-colors";
const CLAY = "#C87560";
const NAVY = "#1B2A4A";

// ── Blank-start form ──────────────────────────────────────────────────────────

function BlankForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [priceLow, setPriceLow]       = useState("12");
  const [priceHigh, setPriceHigh]     = useState("18");

  const mut = useMutation({
    mutationFn: () =>
      createEdition({
        name: name.trim(),
        description: description.trim(),
        sections: [],
        priceLow: parseFloat(priceLow) || 0,
        priceHigh: parseFloat(priceHigh) || 0,
        status: "draft",
        globalAvailable: false,
      }),
    onSuccess: (data) => {
      toast({ title: "Edition created", description: `"${name}" saved as draft.` });
      onCreated(data.id);
    },
    onError: (err: Error) =>
      toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Classic Planner 2027"
          className={FIELD}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Who is this edition for, and what makes it distinctive?"
          className={`${FIELD} resize-none`}
        />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Price from ($)</label>
          <input
            type="number" min="0" step="0.01"
            value={priceLow}
            onChange={(e) => setPriceLow(e.target.value)}
            className={FIELD}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-muted-foreground">Price to ($)</label>
          <input
            type="number" min="0" step="0.01"
            value={priceHigh}
            onChange={(e) => setPriceHigh(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>

      {mut.isError && (
        <p className="text-[11.5px]" style={{ color: "#b23b3b" }}>
          {String((mut.error as Error)?.message ?? "Create failed")}
        </p>
      )}

      <button
        onClick={() => mut.mutate()}
        disabled={!name.trim() || mut.isPending}
        style={{ background: NAVY, cursor: !name.trim() || mut.isPending ? "not-allowed" : "pointer" }}
        className="flex items-center gap-2 px-5 py-2 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {mut.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
        Create draft
      </button>
    </div>
  );
}

// ── Claude-start form ─────────────────────────────────────────────────────────

function ClaudeForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt]           = useState("");
  const [aiMeta, setAiMeta]           = useState<{ model: string; provider: string } | null>(null);
  const [result, setResult]           = useState<EditionAiResult | null>(null);
  const [parseError, setParseError]   = useState<string | null>(null);

  // Editable after generation
  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections]       = useState<string[]>([]);
  const [palette, setPalette]         = useState<string[]>([]);
  const [priceLow, setPriceLow]       = useState("12");
  const [priceHigh, setPriceHigh]     = useState("18");

  const generate = useMutation({
    mutationFn: () => aiApi.complete(SYSTEM_PROMPT, prompt.trim()),
    onSuccess: (res) => {
      setParseError(null);
      setAiMeta({ model: res.model, provider: res.provider });
      try {
        const parsed = extractJson<EditionAiResult>(res.text);
        setResult(parsed);
        setName(parsed.name ?? "");
        setDescription(parsed.description ?? "");
        setSections(Array.isArray(parsed.sections) ? parsed.sections : []);
        setPalette(Array.isArray(parsed.palette) ? parsed.palette.slice(0, 6) : []);
        setPriceLow(String(parsed.priceLow ?? 12));
        setPriceHigh(String(parsed.priceHigh ?? 18));
      } catch (e) {
        setResult(null);
        setParseError(`Couldn't parse the response. ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    onError: (err: Error) => setParseError(err.message),
  });

  const save = useMutation({
    mutationFn: () =>
      createEdition({
        name: name.trim(),
        description: description.trim(),
        sections,
        priceLow: parseFloat(priceLow) || 0,
        priceHigh: parseFloat(priceHigh) || 0,
        status: "draft",
        globalAvailable: false,
      }),
    onSuccess: (data) => {
      toast({ title: "Edition saved as draft", description: `"${name}" is ready to review.` });
      onCreated(data.id);
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11.5px] font-medium text-muted-foreground">Describe the edition</label>
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate.mutate(); }}
          placeholder={'e.g. "A Christmas planner for 2026 — cosy December daily logs, gift tracker, warm cranberry and gold palette"'}
          className={`${FIELD} resize-none`}
        />
        <p className="text-[10.5px] text-muted-foreground">⌘ + Enter to generate</p>
      </div>

      <button
        onClick={() => generate.mutate()}
        disabled={generate.isPending || !prompt.trim()}
        style={{ background: CLAY, cursor: generate.isPending || !prompt.trim() ? "not-allowed" : "pointer" }}
        className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-[13px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {generate.isPending ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin" />Claude is thinking…</>
        ) : (
          <><BookOpen className="w-3.5 h-3.5" />Generate edition spec</>
        )}
      </button>

      {parseError && !generate.isPending && (
        <ErrorState message={parseError} onRetry={() => generate.mutate()} />
      )}

      {result && !generate.isPending && (
        <div className="space-y-4 pt-1 border-t border-border">
          {aiMeta && (
            <p className="text-[10.5px] text-muted-foreground">
              Generated by {aiMeta.model ?? aiMeta.provider}
            </p>
          )}

          {/* Palette */}
          {palette.length > 0 && (
            <div>
              <p className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Palette</p>
              <div className="grid grid-cols-6 gap-1.5">
                {palette.map((hex, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      className="w-full aspect-square rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: isValidHex(hex) ? hex : "#ccc" }}
                    />
                    <span className="text-[9px] text-muted-foreground text-center leading-tight">{PALETTE_LABELS[i]}</span>
                    <Input
                      value={hex}
                      onChange={(e) => { const n = [...palette]; n[i] = e.target.value; setPalette(n); }}
                      className="h-5 text-[9px] text-center px-0.5 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sections */}
          {sections.length > 0 && (
            <div>
              <p className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Sections</p>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s, i) => (
                  <Badge key={i} variant="secondary" className="px-2.5 py-0.5 bg-[#F7F0E6] text-[#1B2A4A] border-[#E7DCCB] text-[11px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Name + Description editable */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Edition name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[12.5px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Description</Label>
              <Textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="resize-none text-[12.5px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Price from ($)</Label>
                <Input type="number" min="0" value={priceLow} onChange={(e) => setPriceLow(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Price to ($)</Label>
                <Input type="number" min="0" value={priceHigh} onChange={(e) => setPriceHigh(e.target.value)} className="h-8" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !prompt.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              <RefreshCw className="w-3 h-3" />Regenerate
            </button>
            <div className="flex-1" />
            <button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              style={{ background: CLAY, cursor: !name.trim() || save.isPending ? "not-allowed" : "pointer" }}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full text-white text-[12.5px] font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save as draft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditionNew() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const handleCreated = (id: string) => {
    qc.invalidateQueries({ queryKey: ["editions"] });
    setLocation(`/editions/${id}`);
  };

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-300">
      {/* Back link */}
      <Link href="/editions">
        <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-6 cursor-pointer transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to editions
        </span>
      </Link>

      <div className="mb-8">
        <h1 className="font-display font-semibold text-2xl text-foreground">New edition</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a draft edition — fill it in yourself or let Claude design the spec.
        </p>
      </div>

      {/* Two-path cards */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Blank start */}
        <div className="rounded-[14px] border bg-card shadow-sm p-6 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 shrink-0" style={{ color: NAVY }} />
              <p className="font-display font-semibold text-[15px] text-foreground">Start blank</p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Fill in the details yourself. You can attach themes, packs, and inserts from the detail page.
            </p>
          </div>
          <BlankForm onCreated={handleCreated} />
        </div>

        {/* Claude start */}
        <div className="rounded-[14px] border bg-card shadow-sm p-6 space-y-5" style={{ borderColor: "rgba(200, 117, 96, 0.3)" }}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 shrink-0" style={{ color: CLAY }} />
              <p className="font-display font-semibold text-[15px] text-foreground">✦ Start with Claude</p>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Describe your edition concept — Claude generates the name, sections, palette and price.
            </p>
          </div>
          <ClaudeForm onCreated={handleCreated} />
        </div>
      </div>
    </div>
  );
}
