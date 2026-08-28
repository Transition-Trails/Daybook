import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertCircle, ArrowLeft, BookOpen, CheckCircle2, ChevronRight,
  FileText, ImageIcon, Loader2, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { apiFetch, storageApi } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import {
  EditorialRichTextField,
  EditorialSection,
  editorialRichTextToPlainText,
} from "@/components/EditorialRichText";
import { FontLibraryPicker } from "@/components/FontLibraryPicker";

const INK = "#1B2A4A";
const CLAY = "#C87560";
const BORDER = "var(--admin-border)";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

const CANON_TYPES = [
  { key: "character", label: "Character", color: "#8B5CF6" },
  { key: "location", label: "Location", color: "#3B82F6" },
  { key: "object", label: "Object", color: "#F59E0B" },
  { key: "event", label: "Event", color: "#EC4899" },
  { key: "lore", label: "Lore", color: "#10B981" },
  { key: "atmosphere", label: "Atmosphere", color: CLAY },
  { key: "material", label: "Material", color: "#6B7280" },
  { key: "relationship", label: "Relationship", color: "#06B6D4" },
  { key: "motif", label: "Motif", color: "#A855F7" },
] as const;

const TRANSITIONS: Record<string, string[]> = {
  proposed: ["under_review", "rejected"],
  under_review: ["accepted", "superseded", "rejected", "proposed"],
  accepted: ["superseded"],
  superseded: ["proposed"],
  rejected: ["proposed"],
};

const TRANSITION_LABELS: Record<string, string> = {
  under_review: "Send for review",
  accepted: "Accept record",
  superseded: "Supersede",
  rejected: "Reject",
  proposed: "Reopen as proposed",
};

interface CanonRecord {
  id: string;
  worldId: string;
  name: string;
  status: string;
  canonType?: string | null;
  narrativeDetails: string;
  historicalContext: string;
  visualNotes: string;
  notes?: string | null;
  typography?: Array<{fontId:string; family:string; roles:Array<{role:string;weight?:string}>}>;
  portraitUrl?: string | null;
  notionPageId?: string | null;
  specRefCount: number;
  createdAt: string;
  updatedAt: string;
}

interface LinkedSpec {
  id: string;
  productionItem: string;
  componentType: string;
  status: string;
}

interface FormState {
  name: string;
  canonType: string;
  narrativeDetails: string;
  historicalContext: string;
  visualNotes: string;
  notes: string;
  typography: Array<{fontId:string; family:string; roles:Array<{role:string;weight?:string}>}>;
  portraitUrl: string | null;
}

function createEmptyForm(search: string): FormState {
  const params = new URLSearchParams(search);
  return {
    name: params.get("name") ?? "",
    canonType: params.get("type") ?? "location",
    narrativeDetails: params.get("narrative") ?? "",
    historicalContext: "",
    visualNotes: "",
    notes: "",
    typography: [],
    portraitUrl: null,
  };
}

function ImageField({
  portraitUrl,
  uploading,
  generating,
  onUpload,
  onGenerate,
  onRemove,
}: {
  portraitUrl: string | null;
  uploading: boolean;
  generating: boolean;
  onUpload: (file: File) => Promise<boolean>;
  onGenerate: () => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const imageUrl = portraitUrl ? `/api/storage${portraitUrl}` : null;
  return (
    <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: INK }}>Record image</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#667085" }}>
            A portrait or visual reference for this canon entry.
          </p>
        </div>
        {portraitUrl && (
          <button type="button" onClick={onRemove} disabled={uploading || generating} className="text-xs font-semibold hover:underline disabled:opacity-60" style={{ color: "#B42318" }}>
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading || generating}
        className="group flex w-full min-h-48 overflow-hidden rounded-xl border border-dashed transition-colors disabled:cursor-wait"
        style={{ borderColor: portraitUrl ? "#D7CDC0" : "#CDBEAF", background: "var(--admin-card-subtle)" }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="Canon record reference" className="h-48 w-full object-cover" />
        ) : (
          <span className="flex w-full flex-col items-center justify-center gap-2 px-5 py-7">
            {uploading || generating ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: CLAY }} /> : <ImageIcon className="h-6 w-6" style={{ color: "#A49687" }} />}
            <span className="text-xs font-semibold" style={{ color: INK }}>{generating ? "Generating reference…" : uploading ? "Uploading image…" : "Add an image"}</span>
            <span className="text-[11px]" style={{ color: "#7C6F62" }}>JPEG, PNG, WebP, GIF, or AVIF · up to 8 MB</span>
          </span>
        )}
        {imageUrl && (
          <span className="absolute sr-only">Replace image</span>
        )}
      </button>
      {imageUrl && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || generating} className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline disabled:opacity-60" style={{ color: CLAY }}>
            <Upload className="h-3.5 w-3.5" /> Replace image
          </button>
          <button type="button" onClick={onGenerate} disabled={uploading || generating} className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline disabled:opacity-60" style={{ color: INK }}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate a new reference"}
          </button>
        </div>
      )}
      {!imageUrl && (
        <button type="button" onClick={onGenerate} disabled={uploading || generating} className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60" style={{ background: INK }}>
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "Generating reference…" : "Generate from canon details"}
        </button>
      )}
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#7C6F62" }}>
        Generation uses this record’s name, type, narrative, visual notes, and world visual direction. You can still upload your own artwork.
      </p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void onUpload(file);
          event.target.value = "";
        }}
      />
    </section>
  );
}

export default function CanonRecordEditor({ recordId }: { recordId?: string }) {
  const isNew = !recordId;
  const [, navigate] = useLocation();
  const search = useSearch();
  const { selectedWorld, worlds } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => createEmptyForm(search));
  const [imageUploading, setImageUploading] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [openedSections, setOpenedSections] = useState({ narrative: true, historical: false, visual: false, notes: false });
  const initialPortraitRef = useRef<string | null>(null);
  const initializedRecordRef = useRef<string | null>(null);
  const provisionalPortraitsRef = useRef<Set<string>>(new Set());

  const { data: recordData, isLoading, isError } = useQuery<{ canon_record: CanonRecord }>({
    queryKey: ["editorial-canon-record", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`),
    enabled: !!recordId,
    staleTime: 30_000,
  });
  const record = recordData?.canon_record;
  const recordWorld = record ? worlds.find(world => world.id === record.worldId) : selectedWorld;
  const worldId = record?.worldId ?? selectedWorld?.id;
  const isImageProcessing = imageUploading || imageGenerating;

  useEffect(() => {
    if (record && initializedRecordRef.current !== record.id) {
      initializedRecordRef.current = record.id;
      initialPortraitRef.current = record.portraitUrl ?? null;
      setForm({
        name: record.name,
        canonType: record.canonType ?? "location",
        narrativeDetails: record.narrativeDetails ?? "",
        historicalContext: record.historicalContext ?? "",
        visualNotes: record.visualNotes ?? "",
        notes: record.notes ?? "",
        typography: record.typography ?? [],
        portraitUrl: record.portraitUrl ?? null,
      });
    }
  }, [record]);

  const { data: specsData } = useQuery<{ specs: LinkedSpec[] }>({
    queryKey: ["editorial-canon-record-specs", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/specs`),
    enabled: !!recordId && !!record,
    staleTime: 30_000,
  });
  const linkedSpecs = specsData?.specs ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        canon_type: form.canonType,
        narrative_details: form.narrativeDetails,
        historical_context: form.historicalContext,
        visual_notes: form.visualNotes,
        notes: form.notes,
        typography: form.typography,
        portrait_url: form.portraitUrl,
      };
      if (isNew) {
        if (!worldId) throw new Error("Choose a world before creating a record");
        return apiFetch<{ canon_record: CanonRecord }>("/v1/editorial/canon-records", {
          method: "POST",
          body: JSON.stringify({ ...payload, world_id: worldId }),
        });
      }
      return apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async result => {
      const previousPortrait = initialPortraitRef.current;
      if (previousPortrait && previousPortrait !== form.portraitUrl) {
        await storageApi.deleteObject(previousPortrait).catch(() => undefined);
      }
      provisionalPortraitsRef.current.clear();
      queryClient.setQueryData(["editorial-canon-record", result.canon_record.id], { canon_record: result.canon_record });
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("editorial-canon"),
      });
      initialPortraitRef.current = result.canon_record.portraitUrl ?? null;
      toast({ title: isNew ? "Canon record created" : "Canon record saved" });
      if (isNew) {
        navigate(`/super/worldsmith/editorial/canon/${result.canon_record.id}`);
      }
    },
    onError: async (error: Error) => {
      await Promise.all([...provisionalPortraitsRef.current].map(path => storageApi.deleteObject(path).catch(() => undefined)));
      provisionalPortraitsRef.current.clear();
      setForm(current => ({ ...current, portraitUrl: initialPortraitRef.current }));
      toast({ title: isNew ? "Could not create canon record" : "Could not save canon record", description: error.message, variant: "destructive" });
    },
  });

  const transitionMutation = useMutation({
    mutationFn: (status: string) => apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}/transition`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
    onSuccess: result => {
      queryClient.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("editorial-canon"),
      });
      toast({ title: `Moved to ${result.canon_record.status.replace(/_/g, " ")}` });
    },
    onError: () => toast({ title: "Could not update workflow", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`, { method: "DELETE" }),
    onSuccess: async () => {
      const objectsToRemove = new Set([
        ...(record?.portraitUrl ? [record.portraitUrl] : []),
        ...provisionalPortraitsRef.current,
      ]);
      await Promise.all([...objectsToRemove].map(path => storageApi.deleteObject(path).catch(() => undefined)));
      provisionalPortraitsRef.current.clear();
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("editorial-canon"),
      });
      toast({ title: "Canon record deleted" });
      navigate("/super/worldsmith/editorial/canon");
    },
    onError: () => toast({ title: "Could not delete canon record", variant: "destructive" }),
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const handleImageUpload = useCallback(async (file: File): Promise<boolean> => {
    if (!IMAGE_TYPES.has(file.type)) {
      toast({ title: "Use an image file", description: "Choose a JPEG, PNG, WebP, GIF, or AVIF image.", variant: "destructive" });
      return false;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image is too large", description: "Choose an image smaller than 8 MB.", variant: "destructive" });
      return false;
    }
    setImageUploading(true);
    try {
      const { uploadURL, objectPath } = await storageApi.requestUploadUrl(file.name, file.size, file.type);
      const response = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!response.ok) throw new Error("The image upload was rejected");
      const previousPortrait = form.portraitUrl;
      if (previousPortrait && previousPortrait !== initialPortraitRef.current) {
        provisionalPortraitsRef.current.delete(previousPortrait);
        await storageApi.deleteObject(previousPortrait).catch(() => undefined);
      }
      provisionalPortraitsRef.current.add(objectPath);
      setForm(current => ({ ...current, portraitUrl: objectPath }));
      return true;
    } catch (error) {
      toast({ title: "Image upload failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return false;
    } finally {
      setImageUploading(false);
    }
  }, [form.portraitUrl, toast]);

  const generateImage = useCallback(async () => {
    if (!form.name.trim()) {
      toast({ title: "Name this canon record first", description: "The record name anchors the generated reference.", variant: "destructive" });
      return;
    }

    setImageGenerating(true);
    try {
      const result = await apiFetch<{ image_data_url: string }>("/v1/editorial/canon-records/generate-image", {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          name: form.name,
          canon_type: form.canonType,
          narrative_details: form.narrativeDetails,
          historical_context: form.historicalContext,
          visual_notes: form.visualNotes,
        }),
      });
      const generatedResponse = await fetch(result.image_data_url);
      if (!generatedResponse.ok) throw new Error("The generated image could not be prepared for saving");
      const blob = await generatedResponse.blob();
      const generatedFile = new File(
        [blob],
        `${form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "canon-reference"}.png`,
        { type: blob.type || "image/png" },
      );
      const uploaded = await handleImageUpload(generatedFile);
      if (!uploaded) return;
      toast({ title: "Reference image generated", description: "It is ready to save with this canon record." });
    } catch (error) {
      toast({
        title: "Image generation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setImageGenerating(false);
    }
  }, [form, handleImageUpload, toast, worldId]);

  const cancel = async () => {
    if (isImageProcessing) return;
    await Promise.all([...provisionalPortraitsRef.current].map(path => storageApi.deleteObject(path).catch(() => undefined)));
    provisionalPortraitsRef.current.clear();
    navigate("/super/worldsmith/editorial/canon");
  };

  const removePortrait = async () => {
    if (isImageProcessing) return;
    const currentPortrait = form.portraitUrl;
    if (currentPortrait && currentPortrait !== initialPortraitRef.current) {
      provisionalPortraitsRef.current.delete(currentPortrait);
      await storageApi.deleteObject(currentPortrait).catch(() => undefined);
    }
    setField("portraitUrl", null);
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: CLAY }} /></div>;
  }
  if (!isNew && (isError || !record)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="h-8 w-8" style={{ color: "#9CA3AF" }} />
        <p className="text-sm" style={{ color: INK }}>Canon record not found.</p>
        <button onClick={() => navigate("/super/worldsmith/editorial/canon")} className="text-sm font-semibold hover:underline" style={{ color: CLAY }}>Back to Canon Library</button>
      </div>
    );
  }
  if (isNew && !selectedWorld) {
    return <div className="flex h-full items-center justify-center text-sm" style={{ color: "#7D8797" }}>Choose a world before creating a Canon Record.</div>;
  }

  const typeMeta = CANON_TYPES.find(type => type.key === form.canonType) ?? CANON_TYPES[1]!;
  const allowedTransitions = record ? TRANSITIONS[record.status] ?? [] : [];
  const section = (key: keyof typeof openedSections, title: string, hint: string, value: string, placeholder: string, minHeight: number) => (
    <EditorialSection
      title={title}
      hint={hint}
      open={openedSections[key]}
      onToggle={() => setOpenedSections(current => ({ ...current, [key]: !current[key] }))}
      preview={editorialRichTextToPlainText(value).slice(0, 140)}
    >
      {key === "visual" && (
        <FontLibraryPicker
          value={form.typography}
          onChange={choices => setField("typography", choices as any)}
        />
      )}
      <EditorialRichTextField value={value} placeholder={placeholder} minHeight={minHeight} onChange={next => setField(key === "narrative" ? "narrativeDetails" : key === "historical" ? "historicalContext" : key === "visual" ? "visualNotes" : "notes", next)} />
    </EditorialSection>
  );

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--admin-card-subtle)" }}>
      <header className="h-12 flex items-center gap-2 px-7 border-b bg-white" style={{ borderColor: BORDER }}>
        <span className="text-[11px]" style={{ color: "#98A2B3" }}>WorldSmith</span>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <span className="text-[11px]" style={{ color: "#667085" }}>{recordWorld?.name ?? "World"}</span>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <Link
          href="/super/worldsmith/editorial/canon"
          onClick={event => {
            if (isImageProcessing) event.preventDefault();
          }}
          aria-disabled={isImageProcessing}
          className={isImageProcessing ? "pointer-events-none opacity-50" : ""}
        >
          <span className="cursor-pointer text-[11px]" style={{ color: "#667085" }}>Canon Library</span>
        </Link>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <span className="text-[11px] font-semibold" style={{ color: INK }}>{isNew ? "New record" : record?.name}</span>
      </header>

      <div className="w-full px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-5 mb-7">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: CLAY }}>
              <BookOpen className="w-3.5 h-3.5" />
              Editorial Studio · Canon
            </div>
            <h1 className="mt-2 text-3xl leading-tight" style={{ color: INK, fontFamily: "'Playfair Display', Georgia, serif" }}>
              {isNew ? "New Canon Record" : `${record?.name} — Canon Record`}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "#667085" }}>
              {isNew
                ? "Capture an authoritative part of your world with narrative context, visual direction, and a reference image."
                : "Refine the details that stories, visual assets, and production work use as their canonical source."}
            </p>
          </div>
          <button onClick={cancel} disabled={isImageProcessing} className="inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50" style={{ color: CLAY }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to library
          </button>
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            if (isImageProcessing) return;
            if (!form.name.trim()) {
              toast({ title: "A record name is required", variant: "destructive" });
              return;
            }
            saveMutation.mutate();
          }}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"
        >
          <div className="space-y-5">
            <section className="rounded-2xl border p-7" style={{ background: "var(--admin-card)", borderColor: BORDER }}>
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_230px]">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#786D60" }}>Record name</span>
                  <input
                    autoFocus={isNew}
                    value={form.name}
                    onChange={event => setField("name", event.target.value)}
                    placeholder="Name this canonical record"
                    className="mt-2 w-full border-b bg-transparent pb-2 text-2xl font-semibold outline-none focus:border-[#C87560]"
                    style={{ color: INK, borderColor: "#D9CFC3", fontFamily: "'Playfair Display', Georgia, serif" }}
                  />
                </label>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#786D60" }}>Canon type</span>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CANON_TYPES.map(type => (
                      <button
                        type="button"
                        key={type.key}
                        onClick={() => setField("canonType", type.key)}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                        style={form.canonType === type.key
                          ? { color: type.color, background: `${type.color}16`, borderColor: `${type.color}70` }
                          : { color: "#667085", background: "white", borderColor: "#E5DED6" }}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px]" style={{ color: "#7C6F62" }}>Selected: <span style={{ color: typeMeta.color }}>{typeMeta.label}</span></p>
                </div>
              </div>
            </section>

            {section("narrative", "Narrative details", "Its story, purpose, and significance in the world.", form.narrativeDetails, "Write the record’s story — how it exists in your world and what it carries…", 210)}
            {section("historical", "Historical context", "Origins, era, provenance, and changes over time.", form.historicalContext, "Give this record a history and temporal grounding…", 170)}
            {section("visual", "Visual notes", "Colour, light, texture, materials, and physical presence.", form.visualNotes, "Describe the details a visual artist or prompt should carry forward…", 170)}
            {section("notes", "Editorial notes", "Flags, open questions, and cross-reference notes for the team.", form.notes, "Capture working notes that belong with this record…", 140)}
          </div>

          <aside className="space-y-5">
            <ImageField
              portraitUrl={form.portraitUrl}
              uploading={imageUploading}
              generating={imageGenerating}
              onUpload={handleImageUpload}
              onGenerate={generateImage}
              onRemove={removePortrait}
            />

            {!isNew && record && (
              <>
                <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
                  <h2 className="text-sm font-semibold" style={{ color: INK }}>Workflow</h2>
                  <p className="mt-1 text-xs capitalize" style={{ color: "#667085" }}>Current status: {record.status.replace(/_/g, " ")}</p>
                  {allowedTransitions.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {allowedTransitions.map(status => (
                        <button type="button" key={status} onClick={() => transitionMutation.mutate(status)} disabled={transitionMutation.isPending} className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60" style={{ borderColor: "#E5DED6", color: INK }}>
                          {TRANSITION_LABELS[status] ?? status}
                          {transitionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-xs" style={{ color: "#98A2B3" }}>No further workflow actions are available.</p>}
                </section>

                <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold" style={{ color: INK }}>Linked specs</h2>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#F2EEE8", color: "#786D60" }}>{linkedSpecs.length}</span>
                  </div>
                  {linkedSpecs.length ? (
                    <div className="mt-3 space-y-2">
                      {linkedSpecs.slice(0, 6).map(spec => (
                        <Link key={spec.id} href={`/super/worldsmith/editorial/specs/${spec.id}`}>
                          <span className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-[var(--admin-card-subtle)]">
                            <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "#98A2B3" }} />
                            <span className="min-w-0"><span className="block truncate text-xs font-medium" style={{ color: INK }}>{spec.productionItem}</span><span className="block truncate text-[10px]" style={{ color: "#98A2B3" }}>{spec.componentType}</span></span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-xs leading-relaxed" style={{ color: "#98A2B3" }}>No production specs reference this record yet.</p>}
                </section>

                <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
                  <h2 className="text-sm font-semibold" style={{ color: INK }}>Record details</h2>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between gap-3"><dt style={{ color: "#98A2B3" }}>Created</dt><dd style={{ color: "#667085" }}>{new Date(record.createdAt).toLocaleDateString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt style={{ color: "#98A2B3" }}>Updated</dt><dd style={{ color: "#667085" }}>{new Date(record.updatedAt).toLocaleDateString()}</dd></div>
                    <div className="flex justify-between gap-3"><dt style={{ color: "#98A2B3" }}>Spec references</dt><dd style={{ color: "#667085" }}>{record.specRefCount}</dd></div>
                  </dl>
                </section>

                <button type="button" onClick={() => setDeleteOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold" style={{ borderColor: "#F4C7C2", background: "#FFF8F7", color: "#B42318" }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete record
                </button>
              </>
            )}
          </aside>

          <div className="xl:col-span-2 flex items-center justify-between gap-3 rounded-2xl border px-5 py-4" style={{ background: "white", borderColor: BORDER }}>
            <p className="text-xs" style={{ color: "#786D60" }}>{isNew ? "The record will be saved as Proposed." : "Save your changes before leaving this record."}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={cancel} disabled={saveMutation.isPending || isImageProcessing} className="rounded-lg border px-3.5 py-2 text-xs font-semibold disabled:opacity-50" style={{ borderColor: "#DDD4C4", color: "#667085" }}>Cancel</button>
              <button type="submit" disabled={saveMutation.isPending || isImageProcessing} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60" style={{ background: INK }}>
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {isNew ? "Create record" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold" style={{ color: INK }}>Delete this record?</h2><p className="mt-2 text-sm leading-relaxed" style={{ color: "#667085" }}>This removes the record and its links from the Canon Library.</p></div><button onClick={() => setDeleteOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setDeleteOpen(false)} className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: "#DDD4C4", color: "#667085" }}>Cancel</button><button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">{deleteMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Delete record</button></div>
          </div>
        </div>
      )}
    </div>
  );
}