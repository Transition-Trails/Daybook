import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { EditorialCopilot } from "@/components/EditorialCopilot";
import type { ApplyTarget } from "@/components/CopilotPanel";
import {
  EditorialRichTextField,
  EditorialSection,
  editorialRichTextToPlainText,
} from "@/components/EditorialRichText";
import { FontLibraryPicker } from "@/components/FontLibraryPicker";

type DocumentKind = "style-guide" | "prompt-module";
type PromptModuleSection = "world" | "style" | "general";
type EditorialDocument = {
  id: string;
  worldId: string;
  name: string;
  content: string;
  section?: PromptModuleSection;
  dependencyIds?: string[] | null;
  typography?: Array<{fontId:string; family:string; roles:Array<{role:string;weight?:string}>}>;
};

const CONFIG = {
  "style-guide": {
    singular: "Style Guide",
    pluralPath: "/super/worldsmith/editorial/style-guides",
    endpoint: "style-guides",
    responseKey: "style_guide",
    contentHint: "Define visual language, typography, tone, materials, and clear constraints for future production.",
    placeholder: "Describe the visual language, tone, palette references, typography rules, illustration style, and any negative constraints…",
    copilotSurface: "style_guide",
  },
  "prompt-module": {
    singular: "Prompt Module",
    pluralPath: "/super/worldsmith/editorial/modules",
    endpoint: "prompt-modules",
    responseKey: "prompt_module",
    contentHint: "Write reusable generation guidance. Formatting improves the working document; compilers receive clean plain text.",
    placeholder: "Write the reusable prompt fragment here. Include constraints, alternatives, targeting, and quality guidance…",
    copilotSurface: "prompt_module",
  },
} as const;

export default function EditorialDocumentEditor({ kind, documentId }: { kind: DocumentKind; documentId: string }) {
  const config = CONFIG[kind];
  const [, navigate] = useLocation();
  const { selectedWorldId } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [section, setSection] = useState<PromptModuleSection>("general");
  const [content, setContent] = useState("");
  const [typography, setTypography] = useState<Array<{fontId:string; family:string; roles:Array<{role:string;weight?:string}>}>>([]);
  const [open, setOpen] = useState({ identity: true, content: true });
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeTarget, setActiveTarget] = useState<ApplyTarget>({ key: "content", label: "Document content" });
  const session = useRef(`copilot-${kind}-${documentId}`);

  const { data, isLoading, error } = useQuery<{ [key: string]: EditorialDocument }>({
    queryKey: ["editorial-document", kind, documentId],
    queryFn: () => apiFetch(`\/v1\/editorial\/${config.endpoint}\/${documentId}`),
  });
  const document = data?.[config.responseKey] as EditorialDocument | undefined;

  useEffect(() => {
    if (document) {
      setName(document.name);
      setSection(document.section ?? "general");
      setContent(document.content);
      setTypography(document.typography ?? []);
    }
  }, [document]);

  const saveMutation = useMutation({
    mutationFn: () => apiFetch(`\/v1\/editorial\/${config.endpoint}\/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        content,
        typography,
        ...(kind === "prompt-module" ? { section } : {}),
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["editorial-document", kind, documentId] });
      queryClient.invalidateQueries({ queryKey: [`editorial-${config.endpoint}`, selectedWorldId] });
      toast({ title: `${config.singular} saved` });
    },
    onError: () => toast({ title: "Save failed", description: "Please try again.", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !document) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">This {config.singular.toLowerCase()} is unavailable.</p>
        <button onClick={() => navigate(config.pluralPath)} className="text-sm font-medium text-[#1B2A4A] underline">Back to library</button>
      </div>
    );
  }

  const wordCount = editorialRichTextToPlainText(content).split(/\s+/).filter(Boolean).length;
  const canSave = name.trim().length > 0 && !saveMutation.isPending;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#FAF8F3]">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-background px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={() => navigate(config.pluralPath)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to library">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{config.singular}</p>
            <h1 className="truncate text-lg font-semibold text-[#1B2A4A]">{name || `Untitled ${config.singular}`}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCopilotOpen(value => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#C87560]" /> Co-write
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3.5 py-2 text-sm font-medium text-white hover:bg-[#243660] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
          <div className="space-y-4">
            <EditorialSection title="Identity" hint={`A clear name makes this ${config.singular.toLowerCase()} easy to link and reuse.`} open={open.identity} onToggle={() => setOpen(prev => ({ ...prev, identity: !prev.identity }))} preview={name || undefined}>
              <label className="block text-xs font-medium text-muted-foreground">
                Name
                <input
                  value={name}
                  onFocus={() => setActiveTarget({ key: "name", label: `${config.singular} name` })}
                  onChange={event => setName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#1B2A4A]/40 focus:ring-1 focus:ring-[#1B2A4A]/10"
                  placeholder={`Name this ${config.singular.toLowerCase()}…`}
                />
              </label>
              {kind === "prompt-module" && (
                <label className="mt-4 block text-xs font-medium text-muted-foreground">
                  Compiler section
                  <select
                    value={section}
                    onChange={event => setSection(event.target.value as PromptModuleSection)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-[#1B2A4A]/40 focus:ring-1 focus:ring-[#1B2A4A]/10"
                  >
                    <option value="world">World & collection context</option>
                    <option value="style">Style system</option>
                    <option value="general">General module</option>
                  </select>
                  <span className="mt-1.5 block font-normal text-muted-foreground">
                    This controls compiled-prompt placement independently of the module name.
                  </span>
                </label>
              )}
            </EditorialSection>

            <EditorialSection title="Editorial Document" hint={config.contentHint} open={open.content} onToggle={() => setOpen(prev => ({ ...prev, content: !prev.content }))} preview={`${wordCount.toLocaleString()} words`}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Safe formatting is retained for editorial work; generation always uses plain text.</p>
                <span className="shrink-0 text-xs text-muted-foreground">{wordCount.toLocaleString()} words</span>
              </div>
              {kind === "style-guide" && (
                <FontLibraryPicker
                  value={typography}
                  onChange={choices => setTypography(choices as any)}
                />
              )}
              <EditorialRichTextField
                value={content}
                onFocus={() => setActiveTarget({ key: "content", label: "Document content" })}
                onChange={setContent}
                placeholder={config.placeholder}
                minHeight={420}
              />
            </EditorialSection>
          </div>
        </main>
        <EditorialCopilot
          isOpen={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          surface={config.copilotSurface}
          worldId={document.worldId}
          storageKey={session.current}
          title={`${config.singular} Copilot`}
          greeting={`I can help refine ${name ? `"${name}"` : `this ${config.singular.toLowerCase()}`} while staying grounded in the selected world.`}
          activeTarget={activeTarget}
          context={{ draft: { name, content: editorialRichTextToPlainText(content) }, assetId: document.id }}
          onApply={(text, key) => key === "name" ? setName(text.trim()) : setContent(text)}
          className="max-xl:!absolute max-xl:!right-3 max-xl:!top-3 max-xl:z-30"
          panelStyle={{ maxHeight: "calc(100% - 1.5rem)", minHeight: "min(420px, calc(100% - 1.5rem))" }}
        />
      </div>
    </div>
  );
}