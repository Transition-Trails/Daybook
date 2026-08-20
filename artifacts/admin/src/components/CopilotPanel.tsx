/**
 * CopilotPanel — reusable slide-in AI co-writing panel.
 *
 * Manages its own chat state (messages, input, retry-by-id).
 * The caller provides:
 *   onSend          — async fn that sends a message and returns {reply}
 *   onCaptureTarget — called at send time to snapshot the apply target immutably
 *   onApply         — called with (text, targetKey, targetLabel) when user clicks Apply
 *   greeting        — shown as the first AI message when the panel opens
 *
 * IMPORTANT: `onCaptureTarget` is called exactly once per send/retry, locking
 * the target metadata to the assistant response it accompanies. This prevents
 * Apply from drifting to a different field or record if the user navigates
 * while a request is in-flight.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, ArrowRight, Loader2, Paperclip, FileText, Copy, Check, RefreshCw } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

// ── WorldSmith editorial palette ──────────────────────────────────────────────
const INK         = "#1B2A4A";
const CLAY        = "#C87560";
const PARCHMENT   = "#EFE9E1";
const WARM_WHITE  = "#FDFAF7";
const WARM_BORDER = "#DDD4C4";

export interface ApplyTarget {
  key: string;
  label: string;
}

/** A canon record the AI has identified as worth creating based on the conversation. */
export interface RecordSuggestion {
  name: string;
  canonType: string;
  narrative?: string;
}

export interface CopilotMsg {
  id: number;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
  /**
   * True for the local greeting message injected before the first real AI
   * turn.  Synthetic messages are shown in the thread but are NEVER included
   * in the history sent to the server — Anthropic's Messages API requires
   * conversations to start with a user message, and even OpenAI performs
   * better without a fabricated assistant preamble.
   */
  synthetic?: boolean;
  /** Captured at send time — immutable once set. Only present on real assistant messages. */
  applyTarget?: ApplyTarget;
  /** Canon record suggestions surfaced by the editorial copilot. */
  suggestions?: RecordSuggestion[];
  /**
   * Attachment stored with the user turn so that a transient failure can
   * be retried with the original attachment intact. Only present on user
   * messages that were sent with an attachment.
   */
  attachment?: PendingAttachment;
}

interface CopilotSummary {
  content: string;
  sourceTurnCount: number;
  chatTurnCount: number;
  sourceWasLimited: boolean;
  createdAt: number;
  contextLabel: string;
}

/** A pending attachment the user has selected but not yet sent. */
export interface PendingAttachment {
  dataUrl: string;
  mediaType: string;
  kind: "image" | "document";
  name: string;
}

export interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Display label for the currently focused field ("Visual Palette", "Summary", …) — used in the header and as the default placeholder. */
  activeFieldLabel: string;
  /** Panel header title. Default: "Co-write" */
  title?: string;
  /** Extra class names applied to the root <aside> — use to override width/position. */
  className?: string;
  /** Extra inline styles applied to the root <aside>. */
  panelStyle?: React.CSSProperties;
  /**
   * When provided, the conversation thread is persisted to sessionStorage under
   * this key. Navigating away and returning restores the previous thread rather
   * than starting fresh. Use a stable, entity-scoped key like
   * `"copilot-canon-<recordId>"` or `"copilot-story-<storyId>"`.
   *
   * The greeting is suppressed on restore so the user re-enters mid-conversation.
   */
  storageKey?: string;
  /**
   * When true, shows a paperclip button beside the send button that lets the
   * user attach an image (PNG/JPG/WEBP/GIF ≤ 4 MB) or a document
   * (TXT/MD/PDF text layer ≤ 50 KB). The attachment is base64-encoded and
   * forwarded to `onSend` as a third argument. Default: false.
   */
  allowAttachments?: boolean;
  /**
   * Called when the user sends a message.
   * Receives the text + sanitised conversation history + optional attachment.
   * Must return {reply: string} — may also include suggestions[] for the editorial surface.
   */
  onSend: (
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
    attachment?: PendingAttachment,
  ) => Promise<{ reply: string; suggestions?: RecordSuggestion[] }>;
  /**
   * Called when the editor asks to turn the current conversation into reusable
   * notes. The panel persists the resulting summary with its conversation key.
   */
  onSummarize?: (
    history: { role: "user" | "assistant"; content: string }[],
  ) => Promise<{ summary: string }>;
  /**
   * Called when the user clicks "Create record" on an AI-suggested canon record.
   * Only meaningful when connected to the editorial surface.
   */
  onCreateRecord?: (suggestion: RecordSuggestion) => void;
  /**
   * Called once per send/retry, synchronously, before the network request is
   * made. Return a snapshot of the current target (field key + label).  The
   * returned value is attached to the resulting assistant message; Apply always
   * uses this snapshot rather than whatever `activeFieldLabel` is at click time.
   *
   * If omitted the panel falls back to `activeFieldLabel` with key="".
   */
  onCaptureTarget?: () => ApplyTarget;
  /**
   * Called when the user clicks "Apply →" on an AI message.
   * Receives the text to apply, the target key, and the target label —
   * all captured at the time the original request was sent.
   */
  onApply?: (text: string, targetKey: string, targetLabel: string) => void;
  /**
   * If supplied and the chat is empty when the panel first opens,
   * this text is shown as the opening AI message.
   */
  greeting?: string;
  /**
   * Optional CTA rendered at the bottom of the panel, below the input.
   * Use for actions like "Create Spec →" that follow a brainstorm session.
   */
  footerCta?: React.ReactNode;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const IMAGE_ACCEPT  = "image/png,image/jpeg,image/webp,image/gif";
const DOC_ACCEPT    = ".txt,.md,.pdf";
const ACCEPT_ALL    = `${IMAGE_ACCEPT},${DOC_ACCEPT}`;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;       // 4 MB
const MAX_DOC_BYTES   = 50 * 1024;              // 50 KB extracted UTF-8

// Never install pdfjs-dist into this Vite project: its worker bundle can corrupt
// Vite's dependency optimizer. Load it from the CDN exactly as PlannerLibrary
// does, and cache the module so repeated PDF attachments reuse the same loader.
const PDFJS_BASE = "https://unpkg.com/pdfjs-dist@6.1.200/build";
let pdfjsCache: Promise<unknown> | null = null;
function getPdfjs(): Promise<unknown> {
  if (!pdfjsCache) {
    pdfjsCache = (
      import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`) as Promise<Record<string, unknown>>
    ).then((lib) => {
      (lib.GlobalWorkerOptions as { workerSrc: string }).workerSrc =
        `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsCache;
}

type PdfjsLoader = () => Promise<unknown>;

export async function extractPdfText(file: File, loadPdfjs: PdfjsLoader = getPdfjs): Promise<string> {
  const pdfjs = await loadPdfjs() as {
    getDocument: (params: { data: ArrayBuffer }) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: unknown }> }>;
        }>;
      }>;
    };
  };
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];
  let textBytes = 0;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const pageText = (await page.getTextContent()).items
      .map(item => typeof item.str === "string" ? item.str : "")
      .filter(Boolean)
      .join(" ");
    if (pageText) {
      const separator = parts.length > 0 ? "\n\n" : "";
      textBytes += new TextEncoder().encode(separator + pageText).length;
      if (textBytes > MAX_DOC_BYTES) {
        throw new Error("Document text must be 50 KB or less.");
      }
      parts.push(pageText);
    }
  }

  const text = parts.join("\n\n").trim();
  if (!text) {
    throw new Error("This PDF has no readable text layer. Try an image of the page instead.");
  }
  return text;
}

// ── sessionStorage helpers ────────────────────────────────────────────────────
function loadThread(key: string): CopilotMsg[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Attachments are deliberately turn-local. Strip any attachment shape from
    // legacy sessions too, so a page reload can never restore base64 file data.
    return Array.isArray(parsed)
      ? (parsed as CopilotMsg[]).map(({ attachment: _attachment, ...message }) => message)
      : [];
  } catch {
    return [];
  }
}
function saveThread(key: string, msgs: CopilotMsg[]) {
  try {
    // Keep the chat transcript, but never persist attachment payloads.
    sessionStorage.setItem(
      key,
      JSON.stringify(msgs.map(({ attachment: _attachment, ...message }) => message)),
    );
  } catch { /* storage full */ }
}

function summaryStorageKey(key: string) {
  return `${key}:summary`;
}

function loadSummary(key: string): CopilotSummary | null {
  try {
    const raw = sessionStorage.getItem(summaryStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CopilotSummary>;
    if (
      typeof parsed.content !== "string" ||
      typeof parsed.sourceTurnCount !== "number" ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.contextLabel !== "string"
    ) return null;
    return {
      ...parsed,
      // Summaries created before bounded provenance was added retain the
      // previous count as their best available staleness baseline.
      chatTurnCount: typeof parsed.chatTurnCount === "number"
        ? parsed.chatTurnCount
        : parsed.sourceTurnCount,
      sourceWasLimited: parsed.sourceWasLimited === true,
    } as CopilotSummary;
  } catch {
    return null;
  }
}

function saveSummary(key: string, summary: CopilotSummary | null) {
  try {
    const storageKey = summaryStorageKey(key);
    if (!summary) sessionStorage.removeItem(storageKey);
    else sessionStorage.setItem(storageKey, JSON.stringify(summary));
  } catch { /* storage full / private mode */ }
}

// ── Suggestion card ───────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  character: "Character",
  location: "Location",
  object: "Object",
  faction: "Faction",
  creature: "Creature",
  concept: "Concept",
};

function SuggestionCard({
  suggestion,
  onCreateRecord,
}: {
  suggestion: RecordSuggestion;
  onCreateRecord: (s: RecordSuggestion) => void;
}) {
  return (
    <div
      className="rounded-xl p-3 mt-1"
      style={{ background: "#F0E9DF", border: `1px solid ${WARM_BORDER}` }}
    >
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold leading-tight" style={{ color: INK }}>
            {suggestion.name}
          </p>
          <p className="text-[10.5px] uppercase tracking-widest mt-0.5 font-medium" style={{ color: CLAY }}>
            {TYPE_LABELS[suggestion.canonType] ?? suggestion.canonType}
          </p>
          {suggestion.narrative && (
            <p className="text-[11.5px] mt-1.5 leading-relaxed" style={{ color: "#4B5563" }}>
              {suggestion.narrative.length > 120
                ? suggestion.narrative.slice(0, 120) + "…"
                : suggestion.narrative}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={() => onCreateRecord(suggestion)}
        className="mt-2 flex items-center gap-1 text-[11.5px] font-semibold hover:underline"
        style={{ color: CLAY }}
      >
        Create record <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

// ── Attachment chip ───────────────────────────────────────────────────────────
function AttachmentChip({
  attachment,
  onClear,
}: {
  attachment: PendingAttachment;
  onClear: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 mb-2 rounded-lg px-2.5 py-1.5 text-[12px] max-w-full"
      style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}`, color: INK }}
    >
      {attachment.kind === "image" ? (
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="w-8 h-8 rounded object-cover shrink-0"
        />
      ) : (
        <Paperclip className="w-3.5 h-3.5 shrink-0" style={{ color: CLAY }} />
      )}
      <span className="truncate flex-1 leading-tight" title={attachment.name}>
        {attachment.name}
      </span>
      <button
        onClick={onClear}
        aria-label="Remove attachment"
        className="shrink-0 hover:opacity-70 transition-opacity"
        style={{ color: "#9B8E80" }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * A conversation belongs to its storage key, not to the mounted drawer.
 * Keying the stateful session means switching worlds or records atomically
 * tears down the old thread before the new key can receive any writes.
 */
export function CopilotPanel(props: CopilotPanelProps) {
  return <CopilotPanelSession key={props.storageKey ?? "__copilot-transient__"} {...props} />;
}

function CopilotPanelSession({
  isOpen,
  onClose,
  activeFieldLabel,
  title = "Co-write",
  onSend,
  onCaptureTarget,
  onApply,
  onCreateRecord,
  greeting,
  className = "",
  panelStyle,
  footerCta,
  storageKey,
  allowAttachments = false,
  onSummarize,
}: CopilotPanelProps) {
  // Seed chat from sessionStorage if a key is provided, so the thread
  // survives navigation away and back.
  const [chat, setChat] = useState<CopilotMsg[]>(() =>
    storageKey ? loadThread(storageKey) : [],
  );
  const [chatInput, setChatInput] = useState("");
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentProcessing, setAttachmentProcessing] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CopilotSummary | null>(() =>
    storageKey ? loadSummary(storageKey) : null,
  );
  const [showSummary, setShowSummary] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Seed msgIdRef above any restored messages so IDs don't collide.
  const msgIdRef = useRef(chat.reduce((max, m) => Math.max(max, m.id), 0));
  const nextId = () => ++msgIdRef.current;

  // Persist to sessionStorage whenever the thread changes.
  useEffect(() => {
    if (storageKey) saveThread(storageKey, chat);
  }, [storageKey, chat]);

  useEffect(() => {
    if (storageKey) saveSummary(storageKey, summary);
  }, [storageKey, summary]);

  // Show greeting on first open (while chat is still empty).
  // The greeting is flagged `synthetic: true` so it is NEVER included in the
  // history array sent to the server — Anthropic's Messages API rejects
  // conversations that start with an assistant message.
  // Skip greeting entirely when restoring a saved thread.
  const greetedRef = useRef(chat.length > 0); // pre-mark as greeted if thread restored
  useEffect(() => {
    if (isOpen && !greetedRef.current && greeting && chat.length === 0) {
      greetedRef.current = true;
      setChat([{ id: nextId(), role: "assistant", content: greeting, synthetic: true }]);
    }
    if (!isOpen) {
      // allow re-greeting only if the thread is empty (e.g. after a clear)
      greetedRef.current = chat.length > 0;
    }
  }, [isOpen, greeting, chat.length]);

  // ── Attachment file processing ─────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    setAttachmentError(null);
    setAttachmentProcessing(true);
    try {
      const isImage = file.type.startsWith("image/");
      const isDocument = !isImage && (
        file.type === "text/plain" ||
        file.type === "text/markdown" ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt") ||
        file.type === "application/pdf" ||
        file.name.endsWith(".pdf")
      );

      if (!isImage && !isDocument) {
        setAttachmentError("Unsupported file type. Use PNG, JPG, WEBP, or GIF for images; TXT, MD, or PDF for documents.");
        return;
      }

      if (isImage) {
        if (file.size > MAX_IMAGE_BYTES) {
          setAttachmentError("Image must be 4 MB or smaller.");
          return;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        const mediaType = file.type || "image/png";
        setPendingAttachment({ dataUrl, mediaType, kind: "image", name: file.name });
      } else {
        // PDF needs actual text-layer extraction; FileReader.readAsText would
        // only decode the binary PDF container and produce unusable mojibake.
        const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
        if (!isPdf && file.size > MAX_DOC_BYTES) {
          setAttachmentError("Document text must be 50 KB or less.");
          return;
        }
        const text = isPdf
          ? await extractPdfText(file)
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = () => reject(new Error("Failed to read file"));
              reader.readAsText(file, "utf-8");
            });

        // Check size of the extracted text
        const textBytes = new TextEncoder().encode(text).length;
        if (textBytes > MAX_DOC_BYTES) {
          setAttachmentError("Document text must be 50 KB or less.");
          return;
        }

        // Encode as base64 data URL for uniform handling
        const b64 = btoa(unescape(encodeURIComponent(text)));
        const dataUrl = `data:text/plain;base64,${b64}`;
        setPendingAttachment({ dataUrl, mediaType: "text/plain", kind: "document", name: file.name });
      }
    } catch (err) {
      setAttachmentError(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAttachmentProcessing(false);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    // Reset so the same file can be picked again after clearing
    e.target.value = "";
  }, [processFile]);

  // ── Paste handler: images from clipboard ──────────────────────────────────

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowAttachments) return;
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.type.startsWith("image/"));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (file) void processFile(file);
  }, [allowAttachments, processFile]);

  const clearAttachment = useCallback(() => {
    setPendingAttachment(null);
    setAttachmentError(null);
  }, []);

  // ── Mutation ──────────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: (payload: {
      turnId: number;
      message: string;
      history: CopilotMsg[];
      capturedTarget: ApplyTarget;
      attachment: PendingAttachment | null;
    }) =>
      onSend(
        payload.message,
        // Exclude failed turns and synthetic greetings from history sent to server.
        // Synthetic exclusion is critical: Anthropic rejects conversations that start
        // with an assistant message; OpenAI also performs better without fabricated preambles.
        payload.history
          .filter(m => !m.failed && !m.synthetic)
          .map(({ role, content }) => ({ role, content })),
        payload.attachment ?? undefined,
      ).then(result => ({ ...result, capturedTarget: payload.capturedTarget })),
    onSuccess: (data) => {
      setChat(c => [
        ...c,
        {
          id: nextId(),
          role: "assistant",
          content: data.reply,
          applyTarget: data.capturedTarget,
          suggestions: data.suggestions,
        },
      ]);
    },
    onError: (_err, vars) => {
      setChat(c => c.map(m => m.id === vars.turnId ? { ...m, failed: true } : m));
    },
  });

  const usableHistory = chat
    .filter(m => !m.failed && !m.synthetic)
    .map(({ role, content }) => ({ role, content }));
  const hasUsefulConversation =
    usableHistory.some(m => m.role === "user") &&
    usableHistory.some(m => m.role === "assistant");
  const summaryIsStale = !!summary && usableHistory.length > summary.chatTurnCount;

  const summaryMutation = useMutation({
    mutationFn: async (history: { role: "user" | "assistant"; content: string }[]) => {
      if (!onSummarize) throw new Error("Conversation summaries are unavailable.");
      const result = await onSummarize(history);
      if (!result.summary.trim()) throw new Error("The summary was empty. Try again.");
      return result;
    },
    onSuccess: (data, history) => {
      setSummary({
        content: data.summary.trim(),
        sourceTurnCount: history.length,
        chatTurnCount: usableHistory.length,
        sourceWasLimited: usableHistory.length > history.length,
        createdAt: Date.now(),
        contextLabel: activeFieldLabel,
      });
      setShowSummary(true);
      setCopiedSummary(false);
      setCopyError(null);
    },
  });

  // Scroll to bottom after new messages or while thinking
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, sendMutation.isPending]);

  const sendChat = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending || attachmentProcessing) return;
    // Snapshot the target synchronously before any async work
    const capturedTarget: ApplyTarget = onCaptureTarget?.() ?? { key: "", label: activeFieldLabel };
    const history = chat.filter(m => !m.failed && !m.synthetic);
    const turnId = nextId();
    // Capture and clear attachment before any state update
    const attachmentToSend = pendingAttachment;
    // Display a user message with attachment indicator if present.
    // The attachment is stored on the message itself so that a failed turn
    // can be retried with the original attachment intact.
    const displayContent = attachmentToSend
      ? (attachmentToSend.kind === "image"
          ? `[📎 ${attachmentToSend.name}] ${trimmed}`
          : `[📄 ${attachmentToSend.name}] ${trimmed}`)
      : trimmed;
    setChat(c => [
      ...c,
      {
        id: turnId,
        role: "user",
        content: displayContent,
        attachment: attachmentToSend ?? undefined,
      },
    ]);
    setChatInput("");
    setPendingAttachment(null);
    setAttachmentError(null);
    sendMutation.mutate({ turnId, message: trimmed, history, capturedTarget, attachment: attachmentToSend });
  };

  const retryTurn = (turnId: number) => {
    if (sendMutation.isPending) return;
    const msg = chat.find(m => m.id === turnId && m.role === "user" && m.failed);
    if (!msg) return;
    // Re-capture target at retry time (user may have switched fields intentionally)
    const capturedTarget: ApplyTarget = onCaptureTarget?.() ?? { key: "", label: activeFieldLabel };
    // Strip failed turns AND synthetic greetings (same rule as in sendMutation)
    const history = chat.filter(m => !m.failed && !m.synthetic && m.id !== turnId);
    // Strip the attachment display prefix (📎/📄) to recover the raw text message.
    const content = msg.content.replace(/^\[(?:📎|📄)[^\]]*\] /, "");
    setChat(c => c.map(m => m.id === turnId ? { ...m, failed: false } : m));
    // Replay the stored attachment so the retry is equivalent to the original request.
    sendMutation.mutate({ turnId, message: content, history, capturedTarget, attachment: msg.attachment ?? null });
  };

  const createSummary = () => {
    if (!hasUsefulConversation || summaryMutation.isPending) return;
    // Match the server's summary bound exactly so the notes provenance and
    // freshness state describe the same conversation window the model sees.
    summaryMutation.mutate(usableHistory.slice(-20));
  };

  const copySummary = async () => {
    if (!summary) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary.content);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = summary.content;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("Copy failed");
      }
      setCopiedSummary(true);
      setCopyError(null);
      window.setTimeout(() => setCopiedSummary(false), 1800);
    } catch {
      setCopiedSummary(false);
      setCopyError("Couldn’t copy notes. Try again or select the text to copy it manually.");
    }
  };

  if (!isOpen) return null;

  const sendDisabled = !chatInput.trim() || sendMutation.isPending || attachmentProcessing;

  return (
    <aside
      className={[
        "w-[340px] shrink-0 sticky top-4 flex flex-col rounded-2xl overflow-hidden animate-in slide-in-from-right-4 fade-in duration-200",
        className,
      ].join(" ")}
      style={{
        maxHeight: "calc(100vh - 8rem)",
        minHeight: "420px",
        background: WARM_WHITE,
        border: `1px solid ${WARM_BORDER}`,
        ...panelStyle,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between gap-2 shrink-0"
        style={{ background: INK, borderBottom: `1px solid ${INK}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: CLAY }} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight">{title}</div>
            <div className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
              Helping with: {activeFieldLabel}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="hover:opacity-80 shrink-0" style={{ color: "rgba(255,255,255,0.6)" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {onSummarize && (
        <div
          className="px-3 py-2 flex items-center gap-2 shrink-0"
          style={{ background: "#F7F1E9", borderBottom: `1px solid ${WARM_BORDER}` }}
        >
          <button
            type="button"
            onClick={createSummary}
            disabled={!hasUsefulConversation || summaryMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-45 transition-opacity"
            style={{ color: INK, border: `1px solid ${WARM_BORDER}`, background: "white" }}
          >
            {summaryMutation.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CLAY }} />
              : summaryIsStale
                ? <RefreshCw className="w-3.5 h-3.5" style={{ color: CLAY }} />
                : <FileText className="w-3.5 h-3.5" style={{ color: CLAY }} />}
            {summary ? (summaryIsStale ? "Update summary" : "Refresh summary") : "Create summary"}
          </button>
          {summary && !showSummary && (
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="text-[11.5px] font-semibold hover:underline"
              style={{ color: CLAY }}
            >
              Review notes
            </button>
          )}
          {!hasUsefulConversation && (
            <span className="text-[10.5px] leading-tight" style={{ color: "#8A7B6A" }}>
              Add a question and reply to make notes.
            </span>
          )}
        </div>
      )}

      {/* Thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        style={{ background: WARM_WHITE }}
      >
        {showSummary && summary ? (
          <div className="space-y-3">
            <div
              className="rounded-xl p-3.5"
              style={{ background: "#F0E9DF", border: `1px solid ${WARM_BORDER}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: CLAY }}>
                    Co-write notes
                  </p>
                  <p className="text-[12px] mt-1 font-medium" style={{ color: INK }}>
                    {summary.contextLabel}
                  </p>
                </div>
                <FileText className="w-4 h-4 shrink-0" style={{ color: CLAY }} />
              </div>
              <p className="text-[10.5px] mt-2" style={{ color: "#8A7B6A" }}>
                {summary.sourceWasLimited
                  ? `Based on the latest ${summary.sourceTurnCount} conversation turns`
                  : `Based on ${summary.sourceTurnCount} conversation turns`}
              </p>
            </div>

            {summaryIsStale && (
              <div className="rounded-xl px-3 py-2 text-[11.5px] leading-relaxed" style={{ background: "#FFF3E8", color: "#7D4E28", border: "1px solid #E8C9A7" }}>
                New messages have been added since these notes were created. Update the summary when you are ready.
              </div>
            )}

            <div
              className="rounded-xl px-3.5 py-3.5 text-[13px] leading-relaxed whitespace-pre-wrap"
              style={{ background: "white", color: INK, border: `1px solid ${WARM_BORDER}` }}
            >
              {summary.content}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{ color: INK, border: `1px solid ${WARM_BORDER}`, background: "white" }}
              >
                Back to chat
              </button>
              <button
                type="button"
                onClick={() => void copySummary()}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{ color: INK, border: `1px solid ${WARM_BORDER}`, background: "white" }}
              >
                {copiedSummary ? <Check className="w-3.5 h-3.5" style={{ color: "#3F6B4C" }} /> : <Copy className="w-3.5 h-3.5" style={{ color: CLAY }} />}
                {copiedSummary ? "Copied" : "Copy notes"}
              </button>
            </div>
            {copyError && (
              <p role="alert" className="rounded-xl px-3 py-2 text-[11.5px] leading-relaxed" style={{ background: "#FDF0F0", color: "#B23B3B", border: "1px solid #EABABA" }}>
                {copyError}
              </p>
            )}
          </div>
        ) : chat.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%]">
                <div
                  className="rounded-2xl rounded-br-sm px-3.5 py-2.5 text-[13px] leading-relaxed"
                  style={{ background: PARCHMENT, color: INK }}
                >
                  {m.content}
                </div>
                {m.failed && (
                  <div className="text-[11px] text-red-600 mt-1 text-right">
                    Failed.{" "}
                    <button onClick={() => retryTurn(m.id)} className="underline" aria-label="Retry">
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex justify-start">
              <div className="max-w-[90%]">
                <div
                  className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
                  style={{ background: "#EDE4D8", color: INK }}
                >
                  <span style={{ color: CLAY }} className="mr-1">✦</span>
                  {m.content}
                </div>
                {onApply && i > 0 && m.applyTarget && (
                  <button
                    onClick={() => onApply(m.content, m.applyTarget!.key, m.applyTarget!.label)}
                    className="mt-1.5 text-[11.5px] font-semibold hover:underline flex items-center gap-0.5"
                    style={{ color: CLAY }}
                  >
                    Apply to {m.applyTarget.label} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
                {onCreateRecord && m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: CLAY }}>
                      {m.suggestions.length === 1 ? "Suggested record" : `${m.suggestions.length} suggested records`}
                    </p>
                    {m.suggestions.map((s, si) => (
                      <SuggestionCard key={si} suggestion={s} onCreateRecord={onCreateRecord} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] flex items-center gap-2"
              style={{ background: "#EDE4D8", color: "#8A7B6A" }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: CLAY }} />
              thinking…
            </div>
          </div>
        )}
        {summaryMutation.isError && (
          <div role="alert" className="rounded-xl px-3 py-2.5 text-[11.5px] leading-relaxed" style={{ background: "#FDF0F0", color: "#B23B3B", border: "1px solid #EABABA" }}>
            Couldn&apos;t {summary ? "update" : "create"} notes.{" "}
            <button type="button" className="underline font-semibold" onClick={createSummary}>
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="p-3 shrink-0"
        style={{ borderTop: `1px solid ${WARM_BORDER}`, background: WARM_WHITE }}
      >
        {/* Attachment chip */}
        {pendingAttachment && (
          <AttachmentChip attachment={pendingAttachment} onClear={clearAttachment} />
        )}
        {/* Attachment error */}
        {attachmentError && (
          <p className="text-[11px] text-red-600 mb-2">{attachmentError}</p>
        )}

        <div className="flex items-end gap-2">
          {allowAttachments && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ALL}
                className="hidden"
                aria-hidden="true"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachmentProcessing || sendMutation.isPending}
                aria-label="Attach file"
                title="Attach image or document"
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 transition-colors"
                style={{
                  border: `1px solid ${WARM_BORDER}`,
                  background: pendingAttachment ? PARCHMENT : "white",
                  color: pendingAttachment ? CLAY : "#9B8E80",
                }}
              >
                {attachmentProcessing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Paperclip className="w-3.5 h-3.5" />}
              </button>
            </>
          )}
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.shiftKey || e.metaKey)) {
                e.preventDefault();
                sendChat(chatInput);
              }
            }}
            onPaste={allowAttachments ? handlePaste : undefined}
            rows={4}
            placeholder={`Ask about ${activeFieldLabel.toLowerCase()}…`}
            className="flex-1 rounded-xl px-3 py-2 text-[13px] leading-relaxed resize-none outline-none"
              style={{
                border: `1px solid ${WARM_BORDER}`,
                background: "white",
                color: INK,
                minHeight: 96,
                maxHeight: 220,
              }}
          />
          <button
            onClick={() => sendChat(chatInput)}
            disabled={sendDisabled}
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity"
            style={{ background: INK }}
            aria-label="Send"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10.5px] mt-1.5" style={{ color: "#9B8E80" }}>
          Shift+Enter to send
          {onApply && " · Apply replaces the targeted field"}
          {allowAttachments && " · Paste or attach an image/document"}
        </p>
      </div>

      {/* Optional footer CTA */}
      {footerCta && (
        <div
          className="px-3 pb-3 shrink-0"
          style={{ background: WARM_WHITE }}
        >
          {footerCta}
        </div>
      )}
    </aside>
  );
}
