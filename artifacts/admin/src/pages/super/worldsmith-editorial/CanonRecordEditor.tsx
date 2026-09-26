import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertCircle, ArrowLeft, BookOpen, CheckCircle2, ChevronRight,
  FileText, Github, ImageIcon, Loader2, RefreshCw, Sparkles, Trash2, Upload, X,
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
import { CanonRecordConnections } from "@/components/editorial/CanonRecordConnections";
import { SingleSelect, MultiChipSelect, StructuredRepeater } from "@/components/worldsmith/editorial/EditorialFields";
import { LocationForm, ObjectForm, EventForm, LoreForm, AtmosphereForm, MotifForm, RelationshipForm, CharacterIdentityForm, CharacterKnowledgeForm, LifeStageVariantForm, GenerationLocksForm, MaterialForm } from "@/components/worldsmith/editorial/CanonTypeForms";

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
  version: number;
  name: string;
  status: string;
  canonType?: string | null;
  narrativeDetails: string;
  historicalContext: string;
  visualNotes: string;
  canonGuardrails: string;
  relationshipDetails: string;
  characterDirection: string;
  confirmedCanon: string;
  promptSummary: string;
  promptSummarySourceHash?: string | null;
  promptSummaryGeneratedAt?: string | null;
  promptSummaryStatus?: "missing" | "current" | "stale";
  identitySummary: string;
  identitySummarySourceHash?: string | null;
  identitySummaryGeneratedAt?: string | null;
  identitySummaryStatus?: "missing" | "current" | "stale" | "not_applicable";
  notes?: string | null;
  typography?: Array<{fontId:string; family:string; roles:Array<{role:string;weight?:string}>}>;
  portraitUrl?: string | null;
  imageUrls?: string[];
  imageGallery?: CanonImage[];
  globalMetadata?: Record<string, any> | null;
  structuredProfile?: Record<string, any> | null;
  generationProfile?: Record<string, any> | null;
  notionPageId?: string | null;
  specRefCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CanonImage {
  id?: string;
  url: string;
  name: string;
  description: string;
  role?: string;
  lifeStageVariant?: string;
  rightsStatus?: string;
  creatorCredit?: string;
  workflowStatus?: string;
  generationPrompt?: string;
  canonicalStrength?: string;
  generationModel?: string;
  positiveGuidance?: string;
  negativeGuidance?: string;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  checksum?: string | null;
  source?: string;
}

interface CanonImageRelation {
  toRecordId: string;
  relationType: string | null;
  targetName: string;
  targetCanonType: string | null;
}

interface LinkedSpec {
  id: string;
  productionItem: string;
  componentType: string;
  status: string;
}

interface ContextSnapshot {
  status: "not_generated" | "current" | "out_of_date" | "sync_failed" | "blocked";
  githubPath: string;
  githubCommitSha?: string | null;
  lastSnapshotAt?: string | null;
  recordUpdatedAt?: string | null;
  lastError?: string | null;
  autoSync: boolean;
  autoSyncUnaccepted: boolean;
  imageIssue?: { recordId: string; recordName: string; message: string } | null;
  imageIssues?: Array<{ recordId: string; recordName: string; message: string }>;
}

function isPrimaryImage(image: CanonImage): boolean {
  return ["primary", "primary_portrait", "primary_image"].includes(image.role ?? "");
}

function promptPreviewText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean)
      .join(", ");
  }
  return typeof value === "string" ? value.trim() : "";
}

interface FormState {
  name: string;
  canonType: string;
  narrativeDetails: string;
  historicalContext: string;
  visualNotes: string;
  canonGuardrails: string;
  relationshipDetails: string;
  characterDirection: string;
  confirmedCanon: string;
  promptSummary: string;
  identitySummary: string;
  notes: string;
  typography: Array<{fontId:string; family:string; roles:Array<{role:string;weight?:string}>}>;
  images: CanonImage[];
  globalMetadata: Record<string, any>;
  structuredProfile: Record<string, any>;
  generationProfile: Record<string, any>;
}

function createEmptyForm(search: string): FormState {
  const params = new URLSearchParams(search);
  return {
    name: params.get("name") ?? "",
    canonType: params.get("type") ?? "location",
    narrativeDetails: params.get("narrative") ?? "",
    historicalContext: "",
    visualNotes: "",
    canonGuardrails: "",
    relationshipDetails: "",
    characterDirection: "",
    confirmedCanon: "",
    promptSummary: "",
    identitySummary: "",
    notes: "",
    typography: [],
    images: [],
    globalMetadata: {},
    structuredProfile: {},
    generationProfile: {},
  };
}

function ImageField({
  images,
  uploading,
  generating,
  prompt,
  relatedRecords,
  selectedRelatedRecordIds,
  canGeneratePrimary,
  canonType,
  onUpload,
  onGenerate,
  onRemove,
  onMakePrimary,
  onChangeMetadata,
  onPromptChange,
  onRelatedRecordsChange,
}: {
  images: CanonImage[];
  uploading: boolean;
  generating: boolean;
  prompt: string;
  relatedRecords: CanonImageRelation[];
  selectedRelatedRecordIds: string[];
  canGeneratePrimary: boolean;
  canonType: string;
  onUpload: (file: File) => Promise<boolean>;
  onGenerate: (mode: "primary_portrait" | "reference") => void;
  onRemove: (imageUrl: string) => void;
  onMakePrimary: (imageUrl: string) => void;
  onChangeMetadata: (imageUrl: string, changes: Partial<CanonImage>) => void;
  onPromptChange: (prompt: string) => void;
  onRelatedRecordsChange: (recordIds: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasImages = images.length > 0;
  const primary = images.find(isPrimaryImage);
  const additional = images.filter(image => image !== primary);
  const primaryLabel = canonType === "character" ? "Primary Canon portrait" : "Primary Canon image";
  return (
    <section id="canon-images" className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: INK }}>Canon images</h2>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#667085" }}>
            Choose a primary Canon image and add named supporting images with descriptions.
          </p>
        </div>
        <span className="text-[11px] font-semibold" style={{ color: "var(--admin-muted)" }}>
          {images.length} {images.length === 1 ? "image" : "images"}
        </span>
      </div>
      {hasImages && !primary && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          No primary image is designated. Review the images below, choose “Make primary,” then save this Canon record.
        </p>
      )}
      {hasImages ? (
        <div className="space-y-5">
          {primary && <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: INK }}>{primaryLabel}</h3>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--admin-muted)" }}>The authoritative image used across the Canon Library.</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(primary!.url)}
                disabled={uploading || generating}
                aria-label="Remove primary Canon portrait"
                className="rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold disabled:opacity-60"
                style={{ color: "var(--destructive)", borderColor: BORDER }}
              >
                Remove
              </button>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border mb-3" style={{ borderColor: BORDER, background: "var(--admin-card-subtle)" }}>
              <img src={`/api/storage${primary!.url}`} alt={primaryLabel} className="h-full w-full object-contain" />
              <span className="absolute bottom-2 left-2 rounded-full bg-[var(--admin-ink)] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
                Primary
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[11px] font-semibold" style={{ color: INK }}>Asset Title</label>
                <input
                  value={primary!.name}
                  maxLength={200}
                  onChange={event => onChangeMetadata(primary!.url, { name: event.target.value })}
                  placeholder="e.g. Primary Portrait"
                  className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: BORDER, color: INK }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: INK }}>Rights Status</label>
                <select
                  value={primary!.rightsStatus || "unknown"}
                  onChange={e => onChangeMetadata(primary!.url, { rightsStatus: e.target.value })}
                  className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <option value="owned">Owned</option>
                  <option value="licensed">Licensed</option>
                  <option value="public_domain">Public Domain</option>
                  <option value="generated">Generated (No Copyright)</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: INK }}>Approval Status</label>
                <select
                  value={primary.workflowStatus || "draft"}
                  onChange={event => onChangeMetadata(primary.url, { workflowStatus: event.target.value })}
                  className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved">Approved</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: INK }}>Canonical Strength</label>
                <select
                  value={primary.canonicalStrength || "reference"}
                  onChange={event => onChangeMetadata(primary.url, { canonicalStrength: event.target.value })}
                  className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: BORDER, color: INK }}
                >
                  <option value="inspiration_only">Inspiration only</option>
                  <option value="reference">Reference</option>
                  <option value="canonical">Canonical</option>
                  <option value="defining">Defining</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold" style={{ color: INK }}>Creator / Source</label>
                <input
                  value={primary!.creatorCredit || ""}
                  maxLength={200}
                  onChange={event => onChangeMetadata(primary!.url, { creatorCredit: event.target.value })}
                  placeholder="Creator name or source link"
                  className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: BORDER, color: INK }}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[11px] font-semibold" style={{ color: INK }}>Description & Alt Text</label>
                <textarea
                  value={primary!.description}
                  maxLength={2000}
                  rows={2}
                  onChange={event => onChangeMetadata(primary!.url, { description: event.target.value })}
                  className="w-full resize-y rounded-lg border bg-white px-2.5 py-2 text-xs leading-relaxed outline-none"
                  style={{ borderColor: BORDER, color: INK }}
                />
              </div>
            </div>
          </div>}

          {additional.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: INK }}>Additional images</h3>
              <p className="mb-3 text-[11px]" style={{ color: "var(--admin-muted)" }}>Choose “Make primary,” then save the record. Your other images will stay attached.</p>
              <div className="space-y-4">
                {additional.map((image, index) => (
                  <div key={image.url} className="rounded-xl border p-4" style={{ borderColor: BORDER, background: "var(--admin-card-subtle)" }}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-gray-200 text-gray-700">
                          {image.role?.replace(/_/g, ' ') || "Reference"}
                        </span>
                        {image.workflowStatus && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider" style={{ background: image.workflowStatus === 'approved' ? '#DEF7EC' : '#FEF3C7', color: image.workflowStatus === 'approved' ? '#03543F' : '#92400E' }}>
                            {image.workflowStatus}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onMakePrimary(image.url)}
                          disabled={uploading || generating}
                          aria-label={`Make ${image.name || `image ${index + 2}`} primary`}
                          className="text-[10px] font-semibold disabled:opacity-60"
                          style={{ color: CLAY }}
                        >
                          Make primary
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(image.url)}
                          disabled={uploading || generating}
                          className="text-[10px] font-semibold disabled:opacity-60"
                          style={{ color: "var(--destructive)" }}
                        >
                          Remove Asset
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)] items-start">
                      <div className="flex flex-col gap-2">
                        <div className="aspect-square overflow-hidden rounded-lg border bg-white" style={{ borderColor: BORDER }}>
                          <img src={`/api/storage${image.url}`} alt={image.name || `Additional Canon image ${index + 1}`} className="h-full w-full object-contain" />
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label htmlFor={`canon-image-name-${index}`} className="text-[11px] font-semibold" style={{ color: INK }}>Asset Title</label>
                          <input
                            id={`canon-image-name-${index}`}
                            value={image.name}
                            maxLength={200}
                            onChange={event => onChangeMetadata(image.url, { name: event.target.value })}
                            placeholder="e.g. Winter travel attire"
                            className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: BORDER, color: INK }}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label htmlFor={`canon-image-role-${index}`} className="text-[11px] font-semibold" style={{ color: INK }}>Asset Role</label>
                          <select
                            id={`canon-image-role-${index}`}
                            aria-label={`Additional image ${index + 1} asset role`}
                            value={image.role || "reference"}
                            onChange={e => onChangeMetadata(image.url, { role: e.target.value })}
                            className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: BORDER, color: INK }}
                          >
                            <option value="reference">Reference</option>
                            <option value="alternate_portrait">Alternate Portrait</option>
                            <option value="full_body">Full Body</option>
                            <option value="life_stage_reference">Life-Stage Reference</option>
                            <option value="wardrobe_reference">Wardrobe Reference</option>
                            <option value="expression_reference">Expression Reference</option>
                            <option value="location_exterior">Location Exterior</option>
                            <option value="location_interior">Location Interior</option>
                            <option value="object_reference">Object Reference</option>
                            <option value="mood_reference">Mood Reference</option>
                            <option value="historical_reference">Historical Reference</option>
                            <option value="generated_concept">Generated Concept</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold" style={{ color: INK }}>Rights Status</label>
                          <select
                            value={image.rightsStatus || "unknown"}
                            onChange={e => onChangeMetadata(image.url, { rightsStatus: e.target.value })}
                            className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: BORDER, color: INK }}
                          >
                            <option value="owned">Owned</option>
                            <option value="licensed">Licensed</option>
                            <option value="public_domain">Public Domain</option>
                            <option value="generated">Generated (No Copyright)</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold" style={{ color: INK }}>Creator / Source</label>
                          <input
                            value={image.creatorCredit || ""}
                            maxLength={200}
                            onChange={event => onChangeMetadata(image.url, { creatorCredit: event.target.value })}
                            placeholder="Creator name or source link"
                            className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: BORDER, color: INK }}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[11px] font-semibold" style={{ color: INK }}>Workflow Status</label>
                          <select
                            value={image.workflowStatus || "suggested"}
                            onChange={e => onChangeMetadata(image.url, { workflowStatus: e.target.value })}
                            className="w-full rounded-lg border bg-white px-2.5 py-2 text-xs outline-none"
                            style={{ borderColor: BORDER, color: INK }}
                          >
                            <option value="suggested">Suggested</option>
                            <option value="pending_approval">Pending Approval</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label htmlFor={`canon-image-description-${index}`} className="block text-[11px] font-semibold" style={{ color: INK }}>Description & Alt Text</label>
                          <textarea
                            id={`canon-image-description-${index}`}
                            value={image.description}
                            maxLength={2000}
                            rows={2}
                            onChange={event => onChangeMetadata(image.url, { description: event.target.value })}
                            placeholder="Explain what this image captures and when it should be used."
                            className="w-full resize-y rounded-lg border bg-white px-2.5 py-2 text-xs leading-relaxed outline-none"
                            style={{ borderColor: BORDER, color: INK }}
                          />
                        </div>

                        {image.generationPrompt && (
                          <div className="flex flex-col gap-1.5 sm:col-span-2 p-2.5 rounded-lg border bg-gray-50 mt-1" style={{ borderColor: BORDER }}>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Generation Prompt</label>
                            <p className="text-[11px] text-gray-700 leading-relaxed italic">{image.generationPrompt}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || generating}
          className="group flex aspect-square w-full min-h-48 overflow-hidden rounded-xl border border-dashed transition-colors disabled:cursor-wait"
          style={{ borderColor: "#CDBEAF", background: "var(--admin-card-subtle)" }}
        >
          <span className="flex w-full flex-col items-center justify-center gap-2 px-5 py-7">
            {uploading || generating ? <Loader2 className="h-6 w-6 animate-spin" style={{ color: CLAY }} /> : <ImageIcon className="h-6 w-6" style={{ color: "#A49687" }} />}
            <span className="text-xs font-semibold" style={{ color: INK }}>{generating ? `Generating ${canonType === "character" ? "portrait" : "image"}…` : uploading ? "Uploading image…" : `Add the ${primaryLabel.toLowerCase()}`}</span>
            <span className="text-[11px]" style={{ color: "#7C6F62" }}>JPEG, PNG, WebP, GIF, or AVIF · up to 8 MB</span>
          </span>
        </button>
      )}
      {hasImages && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading || generating} className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline disabled:opacity-60" style={{ color: CLAY }}>
            <Upload className="h-3.5 w-3.5" /> Add supporting images
          </button>
          <button type="button" onClick={() => onGenerate("reference")} disabled={uploading || generating} className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline disabled:opacity-60" style={{ color: INK }}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Generating…" : "Generate a new reference"}
          </button>
        </div>
      )}
      {!hasImages && canGeneratePrimary && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: BORDER, background: "var(--admin-card-subtle)" }}>
          <p className="text-[11px] font-semibold" style={{ color: INK }}>
            {canonType === "character" ? "Start with the character’s identity image" : `Generate the authoritative image for this ${canonType || "Canon record"}`}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed" style={{ color: "var(--admin-muted)" }}>
            {canonType === "character"
              ? "Generate an isolated, neutral-background portrait grounded in this character’s Canon. You can add described reference scenes after it is created."
              : "Generate a clear primary image grounded in this record’s Canon and world direction. You can add described supporting images after it is created."}
          </p>
          <button
            type="button"
            data-testid="button-generate-primary-canon-portrait"
            onClick={() => onGenerate("primary_portrait")}
            disabled={uploading || generating}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: INK }}
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {generating ? "Generating primary image…" : canonType === "character" ? "Generate Primary Canon Portrait" : "Generate Primary Canon Image"}
          </button>
        </div>
      )}
      {!hasImages && !canGeneratePrimary && (
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--admin-muted)" }}>
          Save and name this Canon record before generating its primary image.
        </p>
      )}
      {hasImages && <div className="mt-4 rounded-xl border p-3" style={{ borderColor: BORDER, background: "var(--admin-card-subtle)" }}>
        <label htmlFor="canon-reference-prompt" className="text-[11px] font-semibold" style={{ color: INK }}>
          What should this reference show?
        </label>
        <textarea
          id="canon-reference-prompt"
          data-testid="input-canon-reference-prompt"
          value={prompt}
          onChange={event => onPromptChange(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Describe the composition, moment, pose, lighting, or details you want."
          className="mt-1.5 w-full resize-y rounded-lg border bg-white px-2.5 py-2 text-xs leading-relaxed outline-none focus:border-[var(--admin-ink)]"
          style={{ borderColor: BORDER, color: INK }}
        />
        {relatedRecords.length > 0 && (
          <fieldset className="mt-3">
            <legend className="text-[11px] font-semibold" style={{ color: INK }}>Base it on related Canon</legend>
            <p className="mt-0.5 text-[10px]" style={{ color: "var(--admin-muted)" }}>
              Select up to 5 linked records. Their approved details and relationship context will ground the image.
            </p>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {relatedRecords.map(related => {
                const checked = selectedRelatedRecordIds.includes(related.toRecordId);
                const disabled = !checked && selectedRelatedRecordIds.length >= 5;
                return (
                  <label
                    key={related.toRecordId}
                    className="flex cursor-pointer items-start gap-2 rounded-lg bg-white px-2.5 py-2 text-xs"
                    style={{ color: INK }}
                  >
                    <input
                      type="checkbox"
                      data-testid={`checkbox-reference-canon-${related.toRecordId}`}
                      checked={checked}
                      disabled={disabled || uploading || generating}
                      onChange={event => onRelatedRecordsChange(
                        event.target.checked
                          ? [...selectedRelatedRecordIds, related.toRecordId]
                          : selectedRelatedRecordIds.filter(id => id !== related.toRecordId),
                      )}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{related.targetName}</span>
                      <span className="block text-[10px] capitalize" style={{ color: "var(--admin-muted)" }}>
                        {related.targetCanonType || "Canon"} · {(related.relationType || "related").replace(/_/g, " ")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        <button
          type="button"
          data-testid="button-generate-canon-reference"
          onClick={() => onGenerate("reference")}
          disabled={uploading || generating || !prompt.trim()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: INK }}
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {generating ? "Generating reference…" : "Generate reference image"}
        </button>
      </div>}
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#7C6F62" }}>
        Generation also uses this record’s Canon details and world visual direction. You can still upload your own artwork.
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) void Promise.all(files.map(onUpload));
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
  const [conflictedRecordId, setConflictedRecordId] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageRelatedRecordIds, setImageRelatedRecordIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [openedSections, setOpenedSections] = useState({
    narrative: true,
    historical: false,
    visual: false,
    canonGuardrails: false,
    relationshipDetails: false,
    characterDirection: false,
    confirmedCanon: false,
    notes: false,
  });
  const initialImagesRef = useRef<string[]>([]);
  const initializedRecordRef = useRef<string | null>(null);
  const provisionalPortraitsRef = useRef<Set<string>>(new Set());
  const imageGenerationLockRef = useRef(false);

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
  const { data: imageRelationsData } = useQuery<{ relations: CanonImageRelation[] }>({
    queryKey: ["editorial-canon-record-relations", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/relations`),
    enabled: !!recordId,
    staleTime: 30_000,
  });
  const imageRelations = imageRelationsData?.relations ?? [];

  const { data: recordAssetsData, isPending: isPendingAssets } = useQuery<{ assets: any[] }>({
    queryKey: ["editorial-assets", recordId],
    queryFn: () => apiFetch<{ assets: any[] }>(`/v1/editorial/assets?world_id=${worldId}`).then(res => ({
      assets: (res.assets || []).filter((a: any) => a.recordId === recordId)
    })),
    enabled: !!recordId && !!worldId,
  });

  const { data: locksData, isPending: isPendingLocks } = useQuery<{ locks: any[] }>({
    queryKey: ["editorial-identity-locks", recordId],
    queryFn: () => apiFetch<{ locks: any[] }>(`/v1/editorial/identity-locks?world_id=${worldId}`).then(res => ({
      locks: (res.locks || []).filter((a: any) => a.recordId === recordId)
    })),
    enabled: !!recordId && !!worldId,
  });

  const { data: variantsData, isPending: isPendingVariants } = useQuery<{ variants: any[] }>({
    queryKey: ["editorial-character-variants", recordId],
    queryFn: () => apiFetch<{ variants: any[] }>(`/v1/editorial/character-variants?world_id=${worldId}`).then(res => ({
      variants: (res.variants || []).filter((a: any) => a.recordId === recordId)
    })),
    enabled: !!recordId && !!worldId && record?.canonType === "character",
  });

  const { data: knowledgeData, isPending: isPendingKnowledge } = useQuery<{ knowledge: any[] }>({
    queryKey: ["editorial-knowledge", recordId],
    queryFn: () => apiFetch<{ knowledge: any[] }>(`/v1/editorial/knowledge?world_id=${worldId}`).then(res => ({
      knowledge: (res.knowledge || []).filter((a: any) => a.recordId === recordId)
    })),
    enabled: !!recordId && !!worldId && record?.canonType === "character",
  });

  const { data: profileData, isPending: isPendingProfile } = useQuery<{ profile: any }>({
    queryKey: ["editorial-profile", recordId],
    queryFn: () => apiFetch<{ profile: any }>(`/v1/editorial/profiles/${record?.canonType}/${recordId}?world_id=${worldId}`),
    enabled: !!recordId && !!worldId && !!record?.canonType,
  });

  const { data: fieldContextData, isFetching: isFetchingFieldContext } = useQuery<{ context: any }>({
    queryKey: ["editorial-canon-field-context", recordId],
    queryFn: () => apiFetch<{ context: any }>(`/v1/editorial/canon-records/${recordId}/field-context?world_id=${worldId}`),
    enabled: !!recordId && !!worldId,
  });

  useEffect(() => {
    if (record && initializedRecordRef.current !== record.id) {
      if (
        (!!recordId && !!worldId && isPendingAssets) ||
        (!!recordId && !!worldId && isPendingLocks) ||
        (!!recordId && !!worldId && !!record.canonType && isPendingProfile) ||
        (!!recordId && !!worldId && record.canonType === "character" && (isPendingVariants || isPendingKnowledge))
      ) {
        return;
      }
      initializedRecordRef.current = record.id;

      const galleryByUrl = new Map((record.imageGallery ?? []).map(image => [image.url, image]));
      const assetByUrl = new Map<string, CanonImage>(
        (recordAssetsData?.assets || []).map(a => {
          const galleryImage = galleryByUrl.get(a.objectPath);
          return [a.objectPath, {
            id: a.id,
            url: a.objectPath,
            name: galleryImage?.name || a.title || "",
            description: galleryImage?.description || a.altText || "",
            // The Canon gallery owns primary/reference ordering. Asset records
            // carry richer metadata but must not downgrade the primary image.
            role: galleryImage?.role || a.role,
            lifeStageVariant: a.variantId,
            rightsStatus: a.rightsStatus,
            creatorCredit: a.sourceCredit,
            workflowStatus: a.approvalStatus,
            generationPrompt: a.generationPrompt,
            canonicalStrength: a.canonicalStrength || "reference",
            generationModel: a.generationModel || "",
            positiveGuidance: a.positiveGuidance || "",
            negativeGuidance: a.negativeGuidance || "",
            width: a.width,
            height: a.height,
            byteSize: a.byteSize,
            checksum: a.checksum,
            source: a.source || "upload",
          }];
        }),
      );
      const orderedGallery = record.imageGallery?.length
        ? record.imageGallery
        : (record.imageUrls ?? []).map((url, index) => ({
            url,
            name: index === 0 ? "Primary Canon image" : "",
            description: "",
            role: index === 0 ? "primary" : "reference",
          }));
      const assetImages: CanonImage[] = orderedGallery.map(image => ({
        ...image,
        ...assetByUrl.get(image.url),
        name: image.name || assetByUrl.get(image.url)?.name || "",
        description: image.description || assetByUrl.get(image.url)?.description || "",
        role: image.role || assetByUrl.get(image.url)?.role,
      }));
      for (const [url, image] of assetByUrl) {
        if (!assetImages.some(existing => existing.url === url)) assetImages.push(image);
      }
      if (record.portraitUrl && !assetImages.some(image => image.url === record.portraitUrl)) {
        assetImages.unshift({ url: record.portraitUrl, name: "Primary Canon portrait", description: "", role: "primary" });
      }

      initialImagesRef.current = assetImages.map(image => image.url);

      // The Canon record is the authoritative source for structured metadata
      // (including MCP writes). A legacy typed profile can still supply fields
      // that have not yet been copied into the Canon record.
      const structuredProfile = {
        ...(profileData?.profile?.profile ?? {}),
        ...(record.structuredProfile ?? {}),
      };
      const generationProfile = record.generationProfile ?? {};

      if (variantsData?.variants) {
        structuredProfile.variants = variantsData.variants.map(v => ({
          id: v.id,
          variantName: v.variantName,
          lifeStage: v.lifeStage,
          active: v.active,
          isDefault: v.isDefault,
          apparentAgeRange: v.profile?.apparent_age_range || v.profile?.apparentAgeRange || "",
          storyPeriodLabel: v.profile?.story_period_label || v.profile?.storyPeriodLabel || "",
          hairChanges: v.profile?.hair_changes || v.profile?.hairChanges || "",
          facialHairChanges: v.profile?.facial_hair_changes || v.profile?.facialHairChanges || "",
          healthMobilityChanges: v.profile?.health_mobility_changes || v.profile?.healthMobilityChanges || "",
          wardrobeProfile: v.profile?.wardrobe_profile || v.profile?.wardrobeProfile || "",
          occupationStatus: v.profile?.occupation_status || v.profile?.occupationStatus || "",
          emotionalBaseline: v.profile?.emotional_baseline || v.profile?.emotionalBaseline || "",
          referenceAssetIds: v.profile?.reference_asset_ids || v.profile?.referenceAssetIds || [],
          allowedDeviations: v.profile?.allowed_deviations || v.profile?.allowedDeviations || "",
          visualNotes: v.profile?.visual_notes || v.profile?.visualNotes || "",
        }));
      }
      if (knowledgeData?.knowledge) {
        structuredProfile.knowledge = knowledgeData.knowledge.map(k => ({
          id: k.id,
          topicRecordId: k.topicRecordId,
          knowledgeState: k.knowledgeState,
          confidence: k.confidence,
          source: k.source,
          disclosure: k.disclosure,
          access: k.access,
          applicableLifeStage: k.applicableLifeStage,
          applicableEra: k.applicableEra,
          belief: k.belief,
          objectiveTruth: k.objectiveTruth,
          consequence: k.consequence
        }));
      }
      if (locksData?.locks) {
        generationProfile.identityLocks = locksData.locks.map(l => ({
          id: l.id,
          variantId: l.variantId,
          traitCategory: l.category,
          canonicalValue: l.value,
          lockStrength: l.strength,
          appliesToLifeStages: l.appliesToLifeStages,
          positivePrompt: l.positivePrompt,
          negativePrompt: l.negativePrompt,
          explanation: l.explanation
        }));
      }

      setForm({
        name: record.name,
        canonType: record.canonType ?? "location",
        narrativeDetails: record.narrativeDetails ?? "",
        historicalContext: record.historicalContext ?? "",
        visualNotes: record.visualNotes ?? "",
        canonGuardrails: record.canonGuardrails ?? "",
        relationshipDetails: record.relationshipDetails ?? "",
        characterDirection: record.characterDirection ?? "",
        confirmedCanon: record.confirmedCanon ?? "",
        promptSummary: record.promptSummary ?? "",
        identitySummary: record.identitySummary ?? "",
        notes: record.notes ?? "",
        typography: record.typography ?? [],
        images: assetImages,
        globalMetadata: record.globalMetadata ?? {},
        structuredProfile,
        generationProfile,
      });
    }
  }, [record, recordAssetsData, variantsData, knowledgeData, locksData, profileData]);

  const { data: specsData } = useQuery<{ specs: LinkedSpec[] }>({
    queryKey: ["editorial-canon-record-specs", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/specs`),
    enabled: !!recordId && !!record,
    staleTime: 30_000,
  });
  const linkedSpecs = specsData?.specs ?? [];
  const { data: snapshotData, isError: snapshotLoadFailed, error: snapshotLoadError, refetch: retrySnapshot } = useQuery<{ snapshot: ContextSnapshot }>({
    queryKey: ["editorial-canon-context-snapshot", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/context-snapshot`),
    enabled: !!recordId && !!record,
    staleTime: 30_000,
  });
  const snapshot = snapshotData?.snapshot;

  const snapshotMutation = useMutation({
    mutationFn: () => apiFetch<{ snapshot: ContextSnapshot }>(
      `/v1/editorial/canon-records/${recordId}/context-snapshot`,
      { method: "POST" },
    ),
    onSuccess: result => {
      queryClient.setQueryData(["editorial-canon-context-snapshot", recordId], result);
      toast({ title: "Context Snapshot updated" });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ["editorial-canon-context-snapshot", recordId] });
      toast({ title: "Context Snapshot failed", description: error.message, variant: "destructive" });
    },
  });

  const snapshotPolicyMutation = useMutation({
    mutationFn: (policy: { autoSync: boolean; autoSyncUnaccepted: boolean }) =>
      apiFetch<{ snapshot: ContextSnapshot }>(`/v1/editorial/canon-records/${recordId}/context-snapshot`, {
        method: "PATCH",
        body: JSON.stringify({
          auto_sync: policy.autoSync,
          auto_sync_unaccepted: policy.autoSyncUnaccepted,
        }),
      }),
    onSuccess: result => {
      queryClient.setQueryData(["editorial-canon-context-snapshot", recordId], result);
      toast({ title: result.snapshot.autoSync ? "Automatic updates enabled" : "Automatic updates disabled" });
    },
    onError: (error: Error) => toast({
      title: "Could not update snapshot policy",
      description: error.message,
      variant: "destructive",
    }),
  });

  const summaryMutation = useMutation({
    mutationFn: (kind: "prompt" | "identity" | "both") =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}/regenerate-summary`, {
        method: "POST",
        body: JSON.stringify({ kind }),
      }),
    onSuccess: result => {
      queryClient.setQueryData(["editorial-canon-record", recordId], result);
      setForm(current => ({
        ...current,
        promptSummary: result.canon_record.promptSummary ?? "",
        identitySummary: result.canon_record.identitySummary ?? "",
      }));
      queryClient.invalidateQueries({ queryKey: ["editorial-canon-context-snapshot", recordId] });
      toast({ title: "Prompt summary regenerated" });
    },
    onError: (error: Error) => toast({
      title: "Could not regenerate summary",
      description: error.message,
      variant: "destructive",
    }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        canon_type: form.canonType,
        narrative_details: form.narrativeDetails,
        historical_context: form.historicalContext,
        visual_notes: form.visualNotes,
        canon_guardrails: form.canonGuardrails,
        relationship_details: form.relationshipDetails,
        character_direction: form.characterDirection,
        confirmed_canon: form.confirmedCanon,
        prompt_summary: form.promptSummary,
        identity_summary: form.identitySummary,
        notes: form.notes,
        typography: form.typography,
        portrait_url: form.images.find(isPrimaryImage)?.url ?? null,
        image_urls: form.images.map(image => image.url),
        image_gallery: form.images,
        global_metadata: form.globalMetadata,
        structured_profile: form.structuredProfile,
        generation_profile: form.generationProfile,
      };
      if (isNew) {
        if (!worldId) throw new Error("Choose a world before creating a record");
        return apiFetch<{ canon_record: CanonRecord }>("/v1/editorial/canon-records", {
          method: "POST",
          body: JSON.stringify({ ...payload, world_id: worldId }),
        });
      }
      if (typeof record?.version !== "number" || !Number.isInteger(record.version)) {
        throw new Error("The latest Canon record version is unavailable. Reload the record before saving.");
      }
      const expectedVersion = record.version;
      return apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...payload, expected_version: expectedVersion, defer_auto_snapshot: true }),
      });
    },
    onSuccess: async result => {
      const savedRecordId = result.canon_record.id;
      let latestRecord = result.canon_record;
      const currentImageUrls = form.images.map(image => image.url);
      const removedImages = initialImagesRef.current.filter(imageUrl => !currentImageUrls.includes(imageUrl));
      await Promise.all(removedImages.map(imageUrl => storageApi.deleteObject(imageUrl).catch(() => undefined)));
      provisionalPortraitsRef.current.clear();

      // Sync assets API
      if (worldId) {
        try {
          const existingAssetsReq = await apiFetch<{ assets: any[] }>(`/v1/editorial/assets?world_id=${worldId}`);
          const existingAssets = existingAssetsReq.assets.filter(a => a.recordId === savedRecordId);

          for (const img of form.images) {
            const existing = existingAssets.find(a => a.objectPath === img.url);
            const payload = {
              world_id: worldId,
              record_id: savedRecordId,
              role: img.role || "reference",
              title: img.name || "Asset",
              alt_text: img.description || "",
              object_path: img.url,
              source: img.source || (img.url.includes("generated") ? "generated" : "upload"),
              source_credit: img.creatorCredit || null,
              rights_status: img.rightsStatus || "unknown",
              approval_status: img.workflowStatus || "draft",
              canonical_strength: img.canonicalStrength || "reference",
              generation_prompt: img.generationPrompt || null,
              generation_model: img.generationModel || null,
              positive_guidance: img.positiveGuidance || null,
              negative_guidance: img.negativeGuidance || null,
              width: img.width || null,
              height: img.height || null,
              byte_size: img.byteSize || null,
              checksum: img.checksum || null
            };

            if (existing) {
              await apiFetch(`/v1/editorial/assets/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
            } else {
              await apiFetch(`/v1/editorial/assets`, { method: "POST", body: JSON.stringify(payload) });
            }
          }

          const toDelete = existingAssets.filter(a => !currentImageUrls.includes(a.objectPath));
          for (const a of toDelete) {
            await apiFetch(`/v1/editorial/assets/${a.id}?world_id=${worldId}`, { method: "DELETE" }).catch(() => null);
          }
        } catch (err) {
          console.error("Asset sync failed:", err);
          throw new Error("Failed to sync assets. Record was saved but images may be inconsistent.");
        }

        try {
          if (form.canonType !== "relationship") {
            const profilePayload = { ...form.structuredProfile };

            // Strip out duplicated collections that are stored in dedicated tables
            if (form.canonType === "character") {
              delete profilePayload.variants;
              delete profilePayload.knowledge;
            }

            // Save the structured profile using the generic profile endpoint
            // (Material canon records use the 'object' profile route on the backend but the generic route accepts 'material' and maps it internally)
            if (form.canonType === "character" && !Number.isInteger(latestRecord.version)) {
              throw new Error("The latest Character version is unavailable. Reload the record before saving.");
            }
            const profileResult = await apiFetch<{ version?: number }>(`/v1/editorial/profiles/${form.canonType}/${savedRecordId}`, {
              method: "PUT",
              body: JSON.stringify({
                world_id: worldId,
                schema_version: 1,
                ...(form.canonType === "character" ? { expected_version: latestRecord.version } : {}),
                profile: profilePayload
              })
            });
            if (form.canonType === "character" && Number.isInteger(profileResult.version)) {
              latestRecord = { ...latestRecord, version: profileResult.version! };
            }
          }

          if (form.canonType === "character") {
            const variants = form.structuredProfile.variants || [];
            const knowledge = form.structuredProfile.knowledge || [];
            const identityLocks = form.generationProfile.identityLocks || [];

            // Sync variants with batch endpoint, passing full camelCase array directly
            // (variantBoundary preprocess handles the mapping automatically)
            const mappedVariants = variants.map((v: any) => ({
              variant_name: v.variantName,
              life_stage: v.lifeStage,
              is_default: v.isDefault,
              profile: {
                story_period_label: v.storyPeriodLabel,
                apparent_age_range: v.apparentAgeRange,
                hair_changes: v.hairChanges,
                facial_hair_changes: v.facialHairChanges,
                health_mobility_changes: v.healthMobilityChanges,
                wardrobe_profile: v.wardrobeProfile,
                occupation_status: v.occupationStatus,
                emotional_baseline: v.emotionalBaseline,
                reference_asset_ids: v.referenceAssetIds,
                allowed_deviations: v.allowedDeviations,
                visual_notes: v.visualNotes,
              }
            }));

            await apiFetch(`/v1/editorial/canon-records/${savedRecordId}/variants`, {
              method: "PUT",
              body: JSON.stringify({
                world_id: worldId,
                variants: mappedVariants
              })
            });

            // Sync knowledge with batch endpoint, mapping to expected snake_case
            await apiFetch(`/v1/editorial/canon-records/${savedRecordId}/knowledge`, {
              method: "PUT",
              body: JSON.stringify({
                world_id: worldId,
                knowledge: knowledge.map((k: any) => ({
                  topic_record_id: k.topicRecordId || null,
                  knowledge_state: k.knowledgeState,
                  confidence: k.confidence || null,
                  source: k.source || null,
                  disclosure: k.disclosure || null,
                  access: k.access || null,
                  applicable_life_stage: k.applicableLifeStage || null,
                  applicable_era: k.applicableEra || null,
                  belief: k.belief || null,
                  objective_truth: k.objectiveTruth || null,
                  consequence: k.consequence || null
                }))
              })
            });

            // Sync locks with batch endpoint, mapping to expected snake_case
            await apiFetch(`/v1/editorial/canon-records/${savedRecordId}/identity-locks`, {
              method: "PUT",
              body: JSON.stringify({
                world_id: worldId,
                locks: identityLocks.map((l: any) => ({
                  variant_id: l.variantId || null,
                  category: l.traitCategory,
                  value: l.canonicalValue,
                  strength: l.lockStrength || "preferred",
                  applies_to_life_stages: l.appliesToLifeStages || [],
                  positive_prompt: l.positivePrompt || null,
                  negative_prompt: l.negativePrompt || null,
                  explanation: l.explanation || null
                }))
              })
            });
          }
        } catch (err) {
          console.error("Related collection sync failed:", err);
          if ((err as Error & { status?: number }).status === 409) throw err;
          throw new Error("Failed to sync character metadata (variants/locks/knowledge) or profile. Record was saved but metadata may be inconsistent.");
        }
      }

      let contextSnapshotStatus: "current" | "sync_failed" | null = null;
      try {
        const result = await apiFetch<{ context_snapshot_status: "current" | "sync_failed" | null }>(
          `/v1/editorial/canon-records/${savedRecordId}/context-snapshot/auto-sync`,
          { method: "POST", body: JSON.stringify({ expected_version: latestRecord.version }) },
        );
        contextSnapshotStatus = result.context_snapshot_status;
      } catch (error) {
        toast({
          title: "Context Snapshot could not be checked",
          description: `The record and images were saved. ${(error as Error).message}`,
          variant: "destructive",
        });
      }
      queryClient.setQueryData(["editorial-canon-record", savedRecordId], { canon_record: latestRecord });
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("editorial-canon"),
      });
      queryClient.invalidateQueries({ queryKey: ["editorial-assets", savedRecordId] });
      queryClient.invalidateQueries({ queryKey: ["editorial-character-variants", savedRecordId] });
      queryClient.invalidateQueries({ queryKey: ["editorial-identity-locks", savedRecordId] });
      queryClient.invalidateQueries({ queryKey: ["editorial-knowledge", savedRecordId] });
      queryClient.invalidateQueries({ queryKey: ["editorial-canon-context-snapshot", savedRecordId] });
      initialImagesRef.current = currentImageUrls;

      setForm(prev => ({
        ...prev,
        globalMetadata: latestRecord.globalMetadata ?? {},
        structuredProfile: latestRecord.structuredProfile ?? {},
        generationProfile: latestRecord.generationProfile ?? {},
      }));

      toast({ title: isNew ? "Canon record created" : "Canon record saved" });
      if (contextSnapshotStatus === "sync_failed") {
        toast({ title: "Context Snapshot failed", description: "The record and images were saved, but the automatic snapshot needs attention.", variant: "destructive" });
      }
      if (isNew) {
        navigate(`/super/worldsmith/editorial/canon/${result.canon_record.id}`);
      }
    },
    onError: async (error: Error) => {
      await Promise.all([...provisionalPortraitsRef.current].map(path => storageApi.deleteObject(path).catch(() => undefined)));
      provisionalPortraitsRef.current.clear();
      setForm(current => ({
        ...current,
        images: current.images.filter(image => initialImagesRef.current.includes(image.url)),
      }));
      const conflict = (error as Error & { status?: number }).status === 409;
      if (conflict && recordId) {
        setConflictedRecordId(recordId);
        await queryClient.invalidateQueries({ queryKey: ["editorial-canon-record", recordId] });
      }
      toast({
        title: conflict ? "Canon record changed" : isNew ? "Could not create canon record" : "Could not save canon record",
        description: conflict ? "Another save updated this record. Reload it before trying again." : error.message,
        variant: "destructive",
      });
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
    mutationFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}?world_id=${worldId}`, { method: "DELETE" }),
    onSuccess: async () => {
      const objectsToRemove = new Set([
        ...(record?.imageGallery?.length
          ? record.imageGallery.map(image => image.url)
          : record?.imageUrls?.length ? record.imageUrls : record?.portraitUrl ? [record.portraitUrl] : []),
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

  const handleImageUpload = useCallback(async (
    file: File,
    generatedMetadata?: Partial<CanonImage>,
  ): Promise<boolean> => {
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
      provisionalPortraitsRef.current.add(objectPath);
      setForm(current => ({
        ...current,
        images: (() => {
          const image: CanonImage = {
            url: objectPath,
            name: generatedMetadata?.name ?? (current.images.length === 0
              ? "Primary Canon image"
              : file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim()),
            description: generatedMetadata?.description ?? "",
            ...generatedMetadata,
            role: generatedMetadata?.role ?? (current.images.length === 0 ? "primary" : "reference"),
          };
           return generatedMetadata?.role === "primary"
             ? [image, ...current.images.map(existing => isPrimaryImage(existing) ? { ...existing, role: "reference" } : existing)]
            : [...current.images, image];
        })(),
      }));
      return true;
    } catch (error) {
      toast({ title: "Image upload failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
      return false;
    } finally {
      setImageUploading(false);
    }
  }, [toast]);

  const generateImage = useCallback(async (mode: "primary_portrait" | "reference") => {
    if (imageGenerationLockRef.current) return;
    const effectiveMode = form.images.length === 0 ? "primary_portrait" : mode;
    if (!form.name.trim()) {
      toast({ title: "Name this canon record first", description: "The record name anchors the generated reference.", variant: "destructive" });
      return;
    }
    if (effectiveMode === "reference" && !imagePrompt.trim()) {
      toast({ title: "Describe the reference image", description: "Add what you want the generated image to show.", variant: "destructive" });
      return;
    }

    imageGenerationLockRef.current = true;
    setImageGenerating(true);
    try {
      const result = await apiFetch<{
        image_data_url: string;
        generation?: { model?: string; modelVersion?: string; settings?: Record<string, unknown> };
      }>("/v1/editorial/canon-records/generate-image", {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          name: form.name,
          canon_type: form.canonType,
          narrative_details: form.narrativeDetails,
          historical_context: form.historicalContext,
          visual_notes: form.visualNotes,
          mode: effectiveMode,
          prompt: effectiveMode === "reference" ? imagePrompt.trim() : undefined,
          source_record_id: recordId,
          related_record_ids: imageRelatedRecordIds,
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
      const uploaded = await handleImageUpload(generatedFile, {
        name: effectiveMode === "primary_portrait"
          ? (form.canonType === "character" ? "Primary Canon portrait" : "Primary Canon image")
          : undefined,
        description: effectiveMode === "primary_portrait"
          ? (form.canonType === "character"
            ? "Primary Canon Portrait"
            : "Primary Canon Image")
          : imagePrompt.trim(),
        role: effectiveMode === "primary_portrait"
          ? "primary"
          : "generated_concept",
        rightsStatus: "generated",
        workflowStatus: effectiveMode === "primary_portrait" ? "approved" : "draft",
        generationPrompt: effectiveMode === "reference"
          ? imagePrompt.trim()
          : (form.canonType === "character" ? "Governed Primary Canon Portrait" : "Governed Primary Canon Image"),
        canonicalStrength: effectiveMode === "primary_portrait" ? "canonical" : "reference",
        generationModel: result.generation?.model,
        source: "generated",
        byteSize: blob.size,
      });
      if (!uploaded) return;
      toast({
        title: effectiveMode === "primary_portrait"
          ? (form.canonType === "character" ? "Primary Canon Portrait generated" : "Primary Canon image generated")
          : "Reference image generated",
        description: "It is ready to save with this canon record.",
      });
    } catch (error) {
      toast({
        title: "Image generation failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      imageGenerationLockRef.current = false;
      setImageGenerating(false);
    }
  }, [form, handleImageUpload, imagePrompt, imageRelatedRecordIds, recordId, toast, worldId]);

  const cancel = async () => {
    if (isImageProcessing) return;
    await Promise.all([...provisionalPortraitsRef.current].map(path => storageApi.deleteObject(path).catch(() => undefined)));
    provisionalPortraitsRef.current.clear();
    navigate("/super/worldsmith/editorial/canon");
  };

  const removeImage = async (imageUrl: string) => {
    if (isImageProcessing) return;
    const removedImage = form.images.find(image => image.url === imageUrl);
    if (removedImage && isPrimaryImage(removedImage) && form.images.length > 1) {
      toast({ title: "Choose another primary image first", description: "Make a supporting image primary and save before removing this one.", variant: "destructive" });
      return;
    }
    const nextImages = form.images.filter(image => image.url !== imageUrl);
    setForm(current => ({ ...current, images: current.images.filter(image => image.url !== imageUrl) }));
    setImageUploading(true);
    try {
      if (removedImage?.id && worldId) {
        await apiFetch(`/v1/editorial/assets/${removedImage.id}?world_id=${worldId}`, { method: "DELETE" });
      }
      if (recordId) {
        const result = await apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}`, {
          method: "PATCH",
          body: JSON.stringify({
            portrait_url: nextImages.find(isPrimaryImage)?.url ?? null,
            image_urls: nextImages.map(image => image.url),
            image_gallery: nextImages,
          }),
        });
        queryClient.setQueryData(["editorial-canon-record", recordId], result);
      }
      await storageApi.deleteObject(imageUrl).catch(() => undefined);
      provisionalPortraitsRef.current.delete(imageUrl);
      initialImagesRef.current = initialImagesRef.current.filter(url => url !== imageUrl);
      queryClient.invalidateQueries({ queryKey: ["editorial-assets", recordId] });
      toast({ title: "Image removed" });
    } catch (error) {
      setForm(current => ({
        ...current,
        images: current.images.some(image => image.url === imageUrl)
          ? current.images
          : form.images,
      }));
      toast({
        title: "Could not remove image",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setImageUploading(false);
    }
  };

  const updateImageMetadata = (
    imageUrl: string,
    changes: Partial<CanonImage>,
  ) => {
    setField("images", form.images.map(image => (
      image.url === imageUrl ? { ...image, ...changes } : image
    )));
  };

  const makeImagePrimary = (imageUrl: string) => {
    setForm(current => {
      const selected = current.images.find(image => image.url === imageUrl);
      if (!selected || (current.images[0]?.url === imageUrl && isPrimaryImage(selected))) return current;
      return {
        ...current,
        images: [
          { ...selected, role: "primary" },
          ...current.images
            .filter(image => image.url !== imageUrl)
            .map(image => image.role === "primary" || image.role === "primary_portrait" || image.role === "primary_image"
              ? { ...image, role: "reference" }
              : image),
        ],
      };
    });
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
  const fieldContext = fieldContextData?.context;
  const fieldWarnings = Array.isArray(fieldContext?.warnings) ? fieldContext.warnings : [];
  const fieldNegative = Array.isArray(fieldContext?.negative) ? fieldContext.negative : [];
  const fieldAttributions = Array.isArray(fieldContext?.attributions) ? fieldContext.attributions : [];
  const fieldPrompt = promptPreviewText(fieldContext?.prompt);
  const section = (
    key: keyof typeof openedSections,
    field: keyof Pick<FormState, "narrativeDetails" | "historicalContext" | "visualNotes" | "canonGuardrails" | "relationshipDetails" | "characterDirection" | "confirmedCanon" | "notes">,
    title: string,
    hint: string,
    value: string,
    placeholder: string,
    minHeight: number,
  ) => (
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
      <EditorialRichTextField value={value} placeholder={placeholder} minHeight={minHeight} onChange={next => setField(field, next)} />
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
          <div className="flex items-center gap-4">
            <button onClick={cancel} disabled={isImageProcessing} className="inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50" style={{ color: CLAY }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to library
            </button>
            <button
              type="submit"
              form="canon-record-form"
              data-testid="canon-top-save"
              disabled={saveMutation.isPending || isImageProcessing || conflictedRecordId === recordId}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: INK }}
            >
              {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {isNew ? "Create record" : "Save changes"}
            </button>
          </div>
        </div>

        <form
          id="canon-record-form"
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

            <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: INK }}>Global Metadata</h2>
                  <p className="mt-1 text-xs text-gray-500">Classification and governance across all canon types.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SingleSelect
                  label="Workflow Status"
                  vocabKey="workflow_status"
                  value={record?.status ?? "draft"}
                  onChange={() => {}} // Controlled by transitions above usually, but leaving it disabled here or read-only
                  options={[
                    { key: "draft", label: "Draft" },
                    { key: "under_review", label: "In Review" },
                    { key: "accepted", label: "Accepted" },
                    { key: "superseded", label: "Superseded" },
                    { key: "archived", label: "Archived" }
                  ]}
                  placeholder={record?.status?.replace(/_/g, " ") ?? "Draft"}
                />
                <SingleSelect
                  label="Canon Stability"
                  vocabKey="canon_stability"
                  value={form.globalMetadata.stability ?? ""}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, stability: v })}
                  options={[
                    { key: "fluid", label: "Fluid" },
                    { key: "developing", label: "Developing" },
                    { key: "stable", label: "Stable" },
                    { key: "locked", label: "Locked" }
                  ]}
                />
                <SingleSelect
                  label="Narrative Visibility"
                  vocabKey="narrative_visibility"
                  value={form.globalMetadata.visibility ?? ""}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, visibility: v })}
                  options={[
                    { key: "public", label: "Public Knowledge" },
                    { key: "limited", label: "Limited Knowledge" },
                    { key: "private", label: "Private" },
                    { key: "secret", label: "Secret" },
                    { key: "author_only", label: "Author Only" }
                  ]}
                />
                <SingleSelect
                  label="Temporal Scope"
                  vocabKey="temporal_scope"
                  value={form.globalMetadata.temporalScope ?? ""}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, temporalScope: v })}
                  options={[
                    { key: "timeless", label: "Timeless" },
                    { key: "entire_story", label: "Entire Story" },
                    { key: "era_specific", label: "Era-Specific" },
                    { key: "life_stage", label: "Life-Stage-Specific" },
                    { key: "event_bound", label: "Event-Bound" },
                    { key: "scene_bound", label: "Scene-Bound" }
                  ]}
                />
                <SingleSelect
                  label="Importance"
                  vocabKey="importance"
                  value={form.globalMetadata.importance ?? ""}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, importance: v })}
                  options={[
                    { key: "background", label: "Background" },
                    { key: "supporting", label: "Supporting" },
                    { key: "significant", label: "Significant" },
                    { key: "central", label: "Central" },
                    { key: "foundational", label: "Foundational" }
                  ]}
                />
                <SingleSelect
                  label="Spoiler Level"
                  vocabKey="spoiler_level"
                  value={form.globalMetadata.spoilerLevel ?? ""}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, spoilerLevel: v })}
                  options={[
                    { key: "none", label: "None" },
                    { key: "mild", label: "Mild" },
                    { key: "major", label: "Major" },
                    { key: "endgame", label: "Endgame" }
                  ]}
                />
                <SingleSelect
                  label="Evidence Confidence"
                  vocabKey="evidence_confidence"
                  value={form.globalMetadata.evidenceConfidence ?? ""}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, evidenceConfidence: v })}
                  options={[
                    { key: "speculative", label: "Speculative" },
                    { key: "plausible", label: "Plausible" },
                    { key: "supported", label: "Supported" },
                    { key: "confirmed", label: "Confirmed" },
                    { key: "disputed", label: "Disputed" }
                  ]}
                />
                <MultiChipSelect
                  label="Source Type"
                  vocabKey="source_type"
                  values={form.globalMetadata.sourceType ?? []}
                  onChange={v => setField("globalMetadata", { ...form.globalMetadata, sourceType: v })}
                  options={[
                    { key: "observation", label: "Direct Observation" },
                    { key: "document", label: "Document" },
                    { key: "oral", label: "Oral Account" },
                    { key: "tradition", label: "Family Tradition" },
                    { key: "institutional", label: "Institutional Record" },
                    { key: "physical", label: "Physical Evidence" },
                    { key: "inference", label: "Inference" },
                    { key: "authorial", label: "Authorial Canon" }
                  ]}
                />
              </div>
            </section>

            {form.canonType === "character" && (
              <section className="rounded-2xl border p-7 space-y-8" style={{ background: "white", borderColor: BORDER }}>
                <CharacterIdentityForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
                <CharacterKnowledgeForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
                <LifeStageVariantForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
                <GenerationLocksForm data={form.generationProfile} onChange={v => setField("generationProfile", v)} worldId={worldId!} />
              </section>
            )}

            {form.canonType === "location" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Location Profile</h2>
                <LocationForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "object" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Object Profile</h2>
                <ObjectForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "event" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Event Profile</h2>
                <EventForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "lore" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Lore & Principle Profile</h2>
                <LoreForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "atmosphere" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Atmosphere Profile</h2>
                <AtmosphereForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "motif" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Motif Profile</h2>
                <MotifForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "relationship" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Relationship Profile</h2>
                <RelationshipForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}
            {form.canonType === "material" && (
              <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
                <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Material Profile</h2>
                <MaterialForm data={form.structuredProfile} onChange={v => setField("structuredProfile", v)} worldId={worldId!} />
              </section>
            )}

            {section("narrative", "narrativeDetails", "Narrative details", "Its story, purpose, and significance in the world.", form.narrativeDetails, "Write the record’s story — how it exists in your world and what it carries…", 210)}
            {section("historical", "historicalContext", "Historical context", "Origins, era, provenance, and changes over time.", form.historicalContext, "Give this record a history and temporal grounding…", 170)}
            {section("visual", "visualNotes", "Visual notes", "Colour, light, texture, materials, and physical presence.", form.visualNotes, "Describe the details a visual artist or prompt should carry forward…", 170)}
            {form.canonType === "character" && (
              <>
                {section("canonGuardrails", "canonGuardrails", "Canon Guardrails", "Boundaries and truths that future writing must not contradict.", form.canonGuardrails, "Define what must always remain true for this character…", 170)}
                {section("relationshipDetails", "relationshipDetails", "Relationship details", "Important bonds, tensions, loyalties, and relational history.", form.relationshipDetails, "Describe this character’s significant relationships…", 170)}
                {section("characterDirection", "characterDirection", "Character Direction", "The intended trajectory, pressures, and development for this character.", form.characterDirection, "Capture where this character is headed and what should shape that journey…", 170)}
                {section("confirmedCanon", "confirmedCanon", "Confirmed Canon", "Established facts that are approved as authoritative.", form.confirmedCanon, "Record confirmed character facts and decisions…", 170)}
              </>
            )}
            {section("notes", "notes", "Editorial notes", "Flags, open questions, and cross-reference notes for the team.", form.notes, "Capture working notes that belong with this record…", 140)}
            {!isNew && record && worldId && (
              <CanonRecordConnections recordId={record.id} worldId={worldId} />
            )}
          </div>

          <aside className="space-y-5">
            {!isNew && record && (
              <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: INK }}>
                      <Sparkles className="h-4 w-4" style={{ color: CLAY }} /> Prompt summary
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "#667085" }}>
                      Compact, reviewed Canon context used by image generation.
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                    style={{
                      color: record.promptSummaryStatus === "current" ? "#027A48" : record.promptSummaryStatus === "stale" ? "#B54708" : "#667085",
                      background: record.promptSummaryStatus === "current" ? "#ECFDF3" : record.promptSummaryStatus === "stale" ? "#FFFAEB" : "#F2F4F7",
                    }}
                  >
                    {record.promptSummaryStatus ?? "missing"}
                  </span>
                </div>
                <textarea
                  value={form.promptSummary}
                  onChange={event => setField("promptSummary", event.target.value)}
                  maxLength={3500}
                  rows={8}
                  placeholder="Generate a compact production summary from this Canon record."
                  className="mt-4 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-[#C87560]/20"
                  style={{ borderColor: BORDER, color: INK }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px]" style={{ color: "#98A2B3" }}>{form.promptSummary.length.toLocaleString()} / 3,500</span>
                  <button
                    type="button"
                    onClick={() => summaryMutation.mutate(form.canonType === "character" ? "both" : "prompt")}
                    disabled={summaryMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    style={{ borderColor: BORDER, color: INK }}
                  >
                    {summaryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {form.canonType === "character" ? "Regenerate both" : "Regenerate"}
                  </button>
                </div>
                {form.canonType === "character" && (
                  <div className="mt-5 border-t pt-4" style={{ borderColor: BORDER }}>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold" style={{ color: INK }}>Identity summary</label>
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-semibold"
                        style={{
                          color: record.identitySummaryStatus === "current" ? "#027A48" : record.identitySummaryStatus === "stale" ? "#B54708" : "#667085",
                          background: record.identitySummaryStatus === "current" ? "#ECFDF3" : record.identitySummaryStatus === "stale" ? "#FFFAEB" : "#F2F4F7",
                        }}
                      >
                        {record.identitySummaryStatus ?? "missing"}
                      </span>
                    </div>
                    <textarea
                      value={form.identitySummary}
                      onChange={event => setField("identitySummary", event.target.value)}
                      maxLength={2000}
                      rows={6}
                      placeholder="Repeatable face, age, hair, posture, wardrobe, and identity constraints."
                      className="mt-2 w-full resize-y rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-[#C87560]/20"
                      style={{ borderColor: BORDER, color: INK }}
                    />
                    <p className="mt-1 text-right text-[10px]" style={{ color: "#98A2B3" }}>{form.identitySummary.length.toLocaleString()} / 2,000</p>
                  </div>
                )}
              </section>
            )}

            <ImageField
              images={form.images}
              uploading={imageUploading}
              generating={imageGenerating}
              prompt={imagePrompt}
              relatedRecords={imageRelations}
              selectedRelatedRecordIds={imageRelatedRecordIds}
              canGeneratePrimary={Boolean(form.name.trim())}
              canonType={form.canonType}
              onUpload={handleImageUpload}
              onGenerate={generateImage}
              onRemove={removeImage}
              onMakePrimary={makeImagePrimary}
              onChangeMetadata={updateImageMetadata}
              onPromptChange={setImagePrompt}
              onRelatedRecordsChange={setImageRelatedRecordIds}
            />

            {!isNew && record && (
              <>
                <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: INK }}>
                        <Github className="h-4 w-4" style={{ color: CLAY }} /> Context Snapshot
                      </h2>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "#667085" }}>
                        Readable GitHub context generated from this Daybook record.
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                      style={{
                         color: snapshot?.status === "current" ? "#027A48" : snapshot?.status === "sync_failed" ? "#B42318" : "#8A5A00",
                         background: snapshot?.status === "current" ? "#ECFDF3" : snapshot?.status === "sync_failed" ? "#FEF3F2" : "#FFFAEB",
                      }}
                    >
                      {(snapshot?.status ?? "not_generated").replace(/_/g, " ")}
                    </span>
                  </div>
                  <dl className="mt-4 space-y-2 text-xs">
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#98A2B3" }}>GitHub path · context-snapshots branch</dt>
                      <dd className="mt-1 break-all font-mono text-[10px] leading-relaxed" style={{ color: "#667085" }}>
                        {snapshot?.githubPath ?? (snapshotLoadFailed ? "Unavailable" : "Loading…")}
                      </dd>
                    </div>
                    {snapshot?.lastSnapshotAt && (
                      <div className="flex justify-between gap-3">
                        <dt style={{ color: "#98A2B3" }}>Last updated</dt>
                        <dd style={{ color: "#667085" }}>{new Date(snapshot.lastSnapshotAt).toLocaleString()}</dd>
                      </div>
                    )}
                  </dl>
                  {snapshotLoadFailed && (
                    <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                      Could not load Context Snapshot status: {snapshotLoadError?.message ?? "Please try again."}{" "}
                      <button type="button" className="font-semibold underline" onClick={() => void retrySnapshot()}>Retry</button>
                    </p>
                  )}
                  {snapshot?.lastError && (
                    <p className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] leading-relaxed text-red-700">{snapshot.lastError}</p>
                  )}
                  {(snapshot?.imageIssues?.length || snapshot?.imageIssue) && (
                    <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                      <p className="font-semibold">Snapshot updates are blocked by Canon images on these records:</p>
                      <ul className="mt-2 list-disc space-y-2 pl-4">
                        {(snapshot.imageIssues?.length ? snapshot.imageIssues : snapshot.imageIssue ? [snapshot.imageIssue] : []).map(issue => (
                          <li key={issue.recordId}>
                            {issue.recordId === recordId
                              ? <a href="#canon-images" className="font-semibold underline">{issue.recordName} (this record)</a>
                              : <a href={`/super/worldsmith/editorial/canon/${encodeURIComponent(issue.recordId)}#canon-images`} className="font-semibold underline">{issue.recordName}</a>}
                            {" — "}{issue.message}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2">Review the intended primary’s designation, approval and canonical strength, then save the affected records before updating the snapshot.</p>
                    </div>
                  )}
                  <label className="mt-4 flex items-start gap-2 text-xs" style={{ color: INK }}>
                    <input
                      type="checkbox"
                      checked={snapshot?.autoSync ?? false}
                      disabled={!snapshot || snapshotPolicyMutation.isPending}
                      onChange={event => snapshotPolicyMutation.mutate({
                        autoSync: event.target.checked,
                        autoSyncUnaccepted: snapshot?.autoSyncUnaccepted ?? false,
                      })}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold">Update automatically after saves</span>
                      <span className="mt-0.5 block text-[10px] leading-relaxed" style={{ color: "#667085" }}>
                        Accepted Canon publishes automatically. GitHub errors never undo the Daybook save.
                      </span>
                    </span>
                  </label>
                  {snapshot?.autoSync && record.status !== "accepted" && (
                    <label className="mt-3 flex items-start gap-2 text-xs" style={{ color: INK }}>
                      <input
                        type="checkbox"
                        checked={snapshot.autoSyncUnaccepted}
                        disabled={snapshotPolicyMutation.isPending}
                        onChange={event => snapshotPolicyMutation.mutate({
                          autoSync: true,
                          autoSyncUnaccepted: event.target.checked,
                        })}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-semibold">Include unaccepted Canon</span>
                        <span className="mt-0.5 block text-[10px] leading-relaxed" style={{ color: "#667085" }}>
                          Proposed and under-review records stay manual unless this exception is enabled.
                        </span>
                      </span>
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => snapshotMutation.mutate()}
                     disabled={snapshotMutation.isPending || !snapshot || snapshot.status === "blocked"}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                    style={{ borderColor: "#DDD4C4", color: INK }}
                  >
                    {snapshotMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5" />}
                    Update Context Snapshot
                  </button>
                  <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#98A2B3" }}>
                    Save record changes first. Daybook remains the source of truth.
                  </p>
                </section>

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

                <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold" style={{ color: INK }}>Prompt Preview</h2>
                    {isFetchingFieldContext && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                  </div>
                  {!fieldContext ? (
                    <p className="text-xs text-gray-400">Save the record to preview prompt generation context.</p>
                  ) : (
                    <div className="space-y-4">
                      {fieldWarnings.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
                          <h3 className="text-[10px] font-bold uppercase tracking-wide text-yellow-800">Warnings</h3>
                          <ul className="list-disc pl-4 text-[11px] text-yellow-900 space-y-0.5">
                            {fieldWarnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}
                      <div>
                        <h3 className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#786D60" }}>Generated Prompt</h3>
                        <div className="bg-gray-50 border rounded-lg p-3 text-xs leading-relaxed" style={{ borderColor: BORDER, color: INK }}>
                          {fieldPrompt || "No positive prompt content."}
                        </div>
                      </div>
                      {fieldNegative.length > 0 && (
                        <div>
                          <h3 className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#786D60" }}>Negative Prompt</h3>
                          <div className="bg-red-50 border rounded-lg p-3 text-xs leading-relaxed" style={{ borderColor: "#F4C7C2", color: "#B42318" }}>
                            {fieldNegative.join(", ")}
                          </div>
                        </div>
                      )}
                      {fieldAttributions.length > 0 && (
                        <div>
                          <h3 className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#786D60" }}>Source Attribution</h3>
                          <ul className="space-y-1.5">
                            {fieldAttributions.map((attr: any, i: number) => (
                              <li key={i} className="text-[10px] leading-tight">
                                <span className="font-semibold" style={{ color: INK }}>{attr.clause}</span>
                                <span className="mx-1 text-gray-400">←</span>
                                <span style={{ color: "#667085" }}>{attr.source}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
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
              <button type="submit" disabled={saveMutation.isPending || isImageProcessing || conflictedRecordId === recordId} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60" style={{ background: INK }}>
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