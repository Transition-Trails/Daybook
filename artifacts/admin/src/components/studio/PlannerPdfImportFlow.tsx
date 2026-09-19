import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, EyeOff, FileUp, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CHIP_ACTIVE_BG } from "@/components/studio/primitives";
import {
  plannerImportsApi,
  type PlannerImportDetail,
  type PlannerImportPage,
  type PlannerImportPageBehavior,
  type PlannerImportSectionType,
  type PlatformPlannerConfig,
} from "@/lib/api";

const MAX_BYTES = 50 * 1024 * 1024;
const REVIEW_PAGE_SIZE = 24;
const SECTIONS: Array<{ value: PlannerImportSectionType; label: string }> = [
  ["cover", "Cover"], ["front-matter", "Front Matter"], ["year", "Year"],
  ["month", "Month"], ["monthly-divider", "Monthly Divider"], ["week", "Week"],
  ["day", "Day"], ["notes", "Notes"], ["reference", "Reference"],
  ["dashboard", "Dashboard"], ["other", "Other"],
].map(([value, label]) => ({ value: value as PlannerImportSectionType, label }));
const BEHAVIORS: Array<{ value: PlannerImportPageBehavior; label: string }> = [
  { value: "unique", label: "Unique" }, { value: "template", label: "Template" },
  { value: "repeating", label: "Repeating" },
];

function PageThumbnail({ importId, page }: { importId: string; page: PlannerImportPage }) {
  return (
    <img
      src={plannerImportsApi.thumbnailUrl(importId, page.id)}
      className="max-h-full max-w-full rounded object-contain shadow-sm"
      alt={`Preview of source page ${page.sourcePageNumber}`}
    />
  );
}

type Props = {
  editions: any[];
  onCreateNew: (template: PlatformPlannerConfig) => void;
  onCancel: () => void;
};

export default function PlannerPdfImportFlow({ editions, onCreateNew, onCancel }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState<"upload" | "review" | "map">("upload");
  const [detail, setDetail] = useState<PlannerImportDetail | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [editionId, setEditionId] = useState("");
  const [reviewPage, setReviewPage] = useState(0);

  const orderedPages = useMemo(
    () => [...(detail?.pages ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    [detail?.pages],
  );
  const reviewPageCount = Math.max(1, Math.ceil(orderedPages.length / REVIEW_PAGE_SIZE));
  const visiblePages = orderedPages.slice(
    reviewPage * REVIEW_PAGE_SIZE,
    (reviewPage + 1) * REVIEW_PAGE_SIZE,
  );
  const patchPages = async (patches: Array<Partial<PlannerImportPage> & { id: string }>) => {
    if (!detail) return;
    try { setDetail(await plannerImportsApi.updatePages(detail.id, patches)); }
    catch (e) { setError((e as Error).message); }
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
      if (file.size > MAX_BYTES) throw new Error("PDF must be 50 MiB or smaller.");
      const signed = await plannerImportsApi.requestUploadUrl({ name: file.name, size: file.size, contentType: "application/pdf" });
      const result = await fetch(signed.uploadURL, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!result.ok) throw new Error("The PDF upload failed. Please try again.");
      return plannerImportsApi.analyze({ objectPath: signed.objectPath, fileName: file.name, fileSize: file.size });
    },
    onSuccess: (value) => { setDetail(value); setFileName(value.originalFileName); setStep("review"); setError(null); },
    onError: (e: Error) => setError(e.message),
  });
  const create = useMutation({
    mutationFn: () => plannerImportsApi.createPlanner(detail!.id, { name: name.trim(), ...(editionId ? { editionId } : {}) }),
    onSuccess: (template) => {
      qc.invalidateQueries({ queryKey: ["platform-planners"] });
      toast({ title: "Planner created", description: "Your imported pages are ready for overlays and navigation." });
      onCreateNew(template);
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const bulk = (patch: Partial<PlannerImportPage>) => patchPages(orderedPages.filter(p => selected.has(p.id)).map(p => ({ id: p.id, ...patch })));
  const move = (page: PlannerImportPage, delta: number) => {
    const index = orderedPages.findIndex(p => p.id === page.id), other = orderedPages[index + delta];
    if (!other) return;
    patchPages([{ id: page.id, orderIndex: other.orderIndex }, { id: other.id, orderIndex: page.orderIndex }]);
  };

  return (
    <div className="space-y-5 pb-8" style={{ maxWidth: 900 }}>
      <div className="flex items-start justify-between gap-4">
        <div><h2 className="font-display font-semibold text-[17px]">Import a planner PDF</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Preserve the original artwork as immutable page backgrounds, then map Daybook structure and overlays on top.</p></div>
        <button onClick={onCancel} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Cancel PDF import"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" aria-label="Import progress">
        {["upload", "review", "map"].map((item, index) => <div key={item} className="flex items-center gap-2" style={step === item ? { color: CHIP_ACTIVE_BG } : undefined}><span className={`grid h-6 w-6 place-items-center rounded-full border ${index <= ["upload", "review", "map"].indexOf(step) ? "text-white" : ""}`} style={index <= ["upload", "review", "map"].indexOf(step) ? { background: CHIP_ACTIVE_BG } : undefined}>{index + 1}</span>{item === "upload" ? "Upload" : item === "review" ? "Review Pages" : "Map Structure"}{index < 2 && <span className="mx-1 text-border">/</span>}</div>)}
      </div>

      {step === "upload" && <div className="rounded-2xl border border-dashed p-10 text-center" style={{ background: "var(--admin-card)" }}>
        <FileUp className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h3 className="font-display text-[15px] font-semibold">Start with your finished planner PDF</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">Up to 50 MiB. Pages remain preserved as the source; Daybook does not attempt Canva/Figma-style artwork extraction.</p>
        <label className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white" style={{ background: CHIP_ACTIVE_BG }}>
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Choose PDF
          <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={upload.isPending} onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file); }} />
        </label>
        {upload.isPending && <p className="mt-3 text-[12px] text-muted-foreground">Uploading and analyzing pages…</p>}
      </div>}

      {step === "review" && detail && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-[12px]"><span><strong>{fileName}</strong> · {detail.pageCount} pages</span><button className="text-muted-foreground underline" onClick={() => setStep("upload")}>Choose another PDF</button></div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
          <button className="rounded-full border px-3 py-1.5 text-[12px]" onClick={() => setSelected(new Set(selected.size === orderedPages.length ? [] : orderedPages.map(p => p.id)))}>{selected.size === orderedPages.length ? "Clear selection" : "Select all"}</button>
          <span className="text-[11px] text-muted-foreground">{selected.size} selected</span>
          <select aria-label="Bulk section classification" disabled={!selected.size} onChange={e => e.target.value && bulk({ sectionType: e.target.value as PlannerImportSectionType })} className="rounded-full border bg-background px-2 py-1.5 text-[12px]"><option value="">Set section…</option>{SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select aria-label="Bulk page behavior" disabled={!selected.size} onChange={e => e.target.value && bulk({ behavior: e.target.value as PlannerImportPageBehavior })} className="rounded-full border bg-background px-2 py-1.5 text-[12px]"><option value="">Set behavior…</option>{BEHAVIORS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select>
          <button onClick={() => setStep("map")} className="ml-auto rounded-full px-4 py-2 text-[12px] font-semibold text-white" style={{ background: CHIP_ACTIVE_BG }}>Continue to map structure</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePages.map((page) => {
            const index = orderedPages.findIndex(candidate => candidate.id === page.id);
            return <div key={page.id} className={`rounded-xl border p-2 ${selected.has(page.id) ? "border-primary ring-1 ring-primary" : ""} ${page.hidden ? "opacity-50" : ""}`}>
            <button className="mb-2 flex h-48 w-full items-center justify-center rounded-lg bg-muted/30" onClick={() => toggle(page.id)} aria-label={`${selected.has(page.id) ? "Deselect" : "Select"} page ${page.sourcePageNumber}`}><PageThumbnail importId={detail.id} page={page} /></button>
            <div className="flex items-center justify-between text-[11px] font-semibold"><span>Page {page.sourcePageNumber}</span><span className="font-normal text-muted-foreground">{page.widthPoints}×{page.heightPoints} pt</span></div>
            <div className="mt-2 grid gap-1.5"><label className="text-[10px] text-muted-foreground">Section<select value={page.sectionType} onChange={e => patchPages([{ id: page.id, sectionType: e.target.value as PlannerImportSectionType }])} className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-[11px]">{SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
              <label className="text-[10px] text-muted-foreground">Behavior<select value={page.behavior} onChange={e => patchPages([{ id: page.id, behavior: e.target.value as PlannerImportPageBehavior }])} className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-[11px]">{BEHAVIORS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select></label>
              {(page.behavior !== "unique") && <label className="text-[10px] text-muted-foreground">Template / group key<input value={page.templateKey ?? ""} onChange={e => patchPages([{ id: page.id, templateKey: e.target.value || null }])} placeholder="e.g. weekly-spread" className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-[11px]" /></label>}
              <label className="text-[10px] text-muted-foreground">Label<input value={page.label ?? ""} onChange={e => patchPages([{ id: page.id, label: e.target.value || null }])} placeholder="Optional page label" className="mt-0.5 w-full rounded border bg-background px-1.5 py-1 text-[11px]" /></label>
            </div>
            <div className="mt-2 flex items-center gap-1"><button onClick={() => move(page, -1)} disabled={index === 0} className="rounded border p-1 disabled:opacity-30" aria-label="Move page up"><ArrowUp className="h-3 w-3" /></button><button onClick={() => move(page, 1)} disabled={index === orderedPages.length - 1} className="rounded border p-1 disabled:opacity-30" aria-label="Move page down"><ArrowDown className="h-3 w-3" /></button><button onClick={() => plannerImportsApi.duplicatePage(detail.id, page.id).then(setDetail).catch(e => setError(e.message))} className="rounded border p-1" aria-label="Duplicate page"><Copy className="h-3 w-3" /></button><button onClick={() => patchPages([{ id: page.id, hidden: !page.hidden }])} className="ml-auto rounded border p-1" aria-label={page.hidden ? "Show page" : "Hide page"}>{page.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button></div>
          </div>;
          })}
        </div>
        {reviewPageCount > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={() => setReviewPage(page => Math.max(0, page - 1))} disabled={reviewPage === 0} className="rounded-full border px-4 py-2 text-[12px] disabled:opacity-40">Previous</button>
            <span className="text-[11px] text-muted-foreground">
              Pages {reviewPage * REVIEW_PAGE_SIZE + 1}–{Math.min((reviewPage + 1) * REVIEW_PAGE_SIZE, orderedPages.length)} of {orderedPages.length}
            </span>
            <button type="button" onClick={() => setReviewPage(page => Math.min(reviewPageCount - 1, page + 1))} disabled={reviewPage >= reviewPageCount - 1} className="rounded-full border px-4 py-2 text-[12px] disabled:opacity-40">Next</button>
          </div>
        )}
      </div>}

      {step === "map" && detail && <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">{SECTIONS.map(s => { const count = detail.pages.filter(p => p.sectionType === s.value && !p.hidden).length; return <div key={s.value} className="rounded-xl border p-3"><div className="text-[11px] text-muted-foreground">{s.label}</div><div className="font-display text-xl font-semibold">{count}</div></div>; })}</div>
        <div className="rounded-xl border p-5"><h3 className="font-display text-[15px] font-semibold">Create the structured planner project</h3><p className="mt-1 text-[12px] text-muted-foreground">Your source PDF stays untouched. Daybook will create page records from this mapping, ready for navigation, dates, fields, and interactive overlays.</p><div className="mt-4 space-y-3"><label className="block text-[11px] font-medium text-muted-foreground">Planner name *<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 2027 Wellness Planner" className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-[13px]" /></label><label className="block text-[11px] font-medium text-muted-foreground">Edition (optional)<select value={editionId} onChange={e => setEditionId(e.target.value)} className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-[13px]"><option value="">No edition yet</option>{editions.filter(e => e.status !== "deleted").map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></div><div className="mt-5 flex gap-2"><button onClick={() => setStep("review")} className="rounded-full border px-4 py-2 text-[12px]"><ArrowLeft className="mr-1 inline h-3 w-3" /> Back to review</button><button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="rounded-full px-5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" style={{ background: CHIP_ACTIVE_BG }}>{create.isPending ? "Creating…" : "Create planner"}</button></div></div>
      </div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
    </div>
  );
}