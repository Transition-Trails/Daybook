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
import { useState, useRef, useEffect } from "react";
import { Sparkles, X, ArrowRight, Loader2, Paperclip } from "lucide-react";
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

/** An attachment pending send — not persisted to sessionStorage. */
export interface PendingAttachment {
  /** Full data: URI — "data:<mime>;base64,…" */
  dataUrl: string;
  mediaType: string;
  /** "image" for image/* types, "document" for text/plain, text/markdown, application/pdf */
  kind: "image" | "document";
  name: string;
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
   * When true, renders the paperclip attachment button beside the send button.
   * Accepts image/* (≤ 4 MB) and plain-text documents — .txt, .md, .pdf (≤ 50 KB extracted).
   * The attachment travels as a base64 payload in the request body for the current turn only;
   * it is NOT stored in sessionStorage or sent in subsequent history.
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

// ── sessionStorage helpers ────────────────────────────────────────────────────
function loadThread(key: string): CopilotMsg[] {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CopilotMsg[]) : [];
  } catch {
    return [];
  }
}
function saveThread(key: string, msgs: CopilotMsg[]) {
  try { sessionStorage.setItem(key, JSON.stringify(msgs)); } catch { /* storage full */ }
}

// ── Attachment limits ─────────────────────────────────────────────────────────
const IMAGE_MAX_BYTES    = 4 * 1024 * 1024;   // 4 MiB
const DOCUMENT_MAX_CHARS = 50_000;             // 50 K chars extracted text

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);
const ACCEPTED_DOC_TYPES   = new Set(["text/plain", "text/markdown", "application/pdf"]);

// PDF.js is loaded from the same CDN pattern used by the Ink viewer. Do not add
// pdfjs-dist to the Vite dependency graph: its package build is incompatible
// with this app's Vite setup.
const PDFJS_BASE = "https://unpkg.com/pdfjs-dist@6.1.200/build";
let pdfjsCache: Promise<{
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
      }>;
    }>;
  };
}> | null = null;

function getPdfjs() {
  if (!pdfjsCache) {
    pdfjsCache = (
      import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`) as Promise<{
        GlobalWorkerOptions: { workerSrc: string };
        getDocument: (options: { data: Uint8Array }) => {
          promise: Promise<{
            numPages: number;
            getPage: (pageNumber: number) => Promise<{
              getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
            }>;
          }>;
        };
      }>
    ).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
      return lib;
    });
  }
  return pdfjsCache;
}

async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await getPdfjs();
  const document = await pdfjs.getDocument({ data }).promise;
  // Keep both request size and model context bounded. The final character cap
  // below is authoritative; this page cap avoids unnecessary work on long PDFs.
  const pageCount = Math.min(document.numPages, 40);
  const textPages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    textPages.push(content.items.map((item) => item.str ?? "").join(" "));
    if (textPages.join("\n").length > DOCUMENT_MAX_CHARS) break;
  }

  return textPages.join("\n").trim();
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
}: CopilotPanelProps) {
  // Seed chat from sessionStorage if a key is provided, so the thread
  // survives navigation away and back.
  const [chat, setChat] = useState<CopilotMsg[]>(() =>
    storageKey ? loadThread(storageKey) : [],
  );
  const [chatInput, setChatInput] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  // Seed msgIdRef above any restored messages so IDs don't collide.
  const msgIdRef = useRef(chat.reduce((max, m) => Math.max(max, m.id), 0));
  const nextId = () => ++msgIdRef.current;

  // ── Attachment state ─────────────────────────────────────────────────────
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist to sessionStorage whenever the thread changes.
  useEffect(() => {
    if (storageKey) saveThread(storageKey, chat);
  }, [storageKey, chat]);

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

  // ── Attachment file reader ──────────────────────────────────────────────
  const processFile = async (file: File) => {
    setAttachmentError(null);

    const isImage = ACCEPTED_IMAGE_TYPES.has(file.type);
    const isDoc   = ACCEPTED_DOC_TYPES.has(file.type) || file.name.endsWith(".md");

    if (!isImage && !isDoc) {
      setAttachmentError("Unsupported type. Attach an image (PNG/JPG/WebP/GIF) or text file (TXT/MD/PDF).");
      return;
    }

    if (isImage && file.size > IMAGE_MAX_BYTES) {
      setAttachmentError("Images must be 4 MB or smaller.");
      return;
    }

    setAttachmentLoading(true);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPendingAttachment({ dataUrl, mediaType: file.type, kind: "image", name: file.name });
        setAttachmentLoading(false);
      };
      reader.onerror = () => { setAttachmentError("Could not read file."); setAttachmentLoading(false); };
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
      try {
        const text = await extractPdfText(file);
        if (!text) {
          setAttachmentError("This PDF has no readable text layer. Attach a text PDF or an image instead.");
        } else if (text.length > DOCUMENT_MAX_CHARS) {
          setAttachmentError("Document too long. Attach documents with fewer than 50 000 characters.");
        } else {
          const b64 = btoa(unescape(encodeURIComponent(text)));
          setPendingAttachment({
            dataUrl: `data:text/plain;base64,${b64}`,
            mediaType: "text/plain",
            kind: "document",
            name: file.name,
          });
        }
      } catch {
        setAttachmentError("Could not read this PDF. Attach a text PDF or an image instead.");
      } finally {
        setAttachmentLoading(false);
      }
    } else {
      // TXT and Markdown documents are read as UTF-8 text.
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        if (text.length > DOCUMENT_MAX_CHARS) {
          setAttachmentError(`Document too long. Attach documents with fewer than 50 000 characters.`);
          setAttachmentLoading(false);
          return;
        }
        // Store as data URI for uniform handling: base64-encode the UTF-8 text
        const b64 = btoa(unescape(encodeURIComponent(text)));
        const dataUrl = `data:text/plain;base64,${b64}`;
        setPendingAttachment({ dataUrl, mediaType: "text/plain", kind: "document", name: file.name });
        setAttachmentLoading(false);
      };
      reader.onerror = () => { setAttachmentError("Could not read file."); setAttachmentLoading(false); };
      reader.readAsText(file);
    }
  };

  // Paste handler — intercept images pasted from clipboard
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowAttachments) return;
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(i => i.kind === "file" && i.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        processFile(file);
      }
    }
  };

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

  // Scroll to bottom after new messages or while thinking
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, sendMutation.isPending]);

  const sendChat = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending || attachmentLoading) return;
    // Snapshot the target synchronously before any async work
    const capturedTarget: ApplyTarget = onCaptureTarget?.() ?? { key: "", label: activeFieldLabel };
    const history = chat.filter(m => !m.failed && !m.synthetic);
    const turnId = nextId();
    setChat(c => [...c, { id: turnId, role: "user", content: trimmed }]);
    setChatInput("");
    const attachmentToSend = pendingAttachment;
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
    setChat(c => c.map(m => m.id === turnId ? { ...m, failed: false } : m));
    // Attachments are not retried — they were a one-shot payload
    sendMutation.mutate({ turnId, message: msg.content, history, capturedTarget, attachment: null });
  };

  if (!isOpen) return null;

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

      {/* Thread */}
      <div
        ref={threadRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
        style={{ background: WARM_WHITE }}
      >
        {chat.map((m, i) =>
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
                    <button onClick={() => retryTurn(m.id)} className="underline">
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
      </div>

      {/* Input area */}
      <div
        className="p-3 shrink-0"
        style={{ borderTop: `1px solid ${WARM_BORDER}`, background: WARM_WHITE }}
      >
        {/* ── Attachment chip ── */}
        {allowAttachments && pendingAttachment && (
          <div className="mb-2 flex items-center gap-2">
            {pendingAttachment.kind === "image" ? (
              <div
                className="relative rounded-lg overflow-hidden shrink-0"
                style={{ width: 48, height: 48, border: `1px solid ${WARM_BORDER}` }}
              >
                <img
                  src={pendingAttachment.dataUrl}
                  alt={pendingAttachment.name}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div
                className="rounded-lg px-2.5 py-1.5 text-[11px] font-medium truncate max-w-[180px]"
                style={{ background: PARCHMENT, color: INK, border: `1px solid ${WARM_BORDER}` }}
                title={pendingAttachment.name}
              >
                📄 {pendingAttachment.name}
              </div>
            )}
            <button
              onClick={() => { setPendingAttachment(null); setAttachmentError(null); }}
              className="shrink-0 rounded-full p-0.5 hover:opacity-70"
              style={{ background: "#E5D9CC", color: INK }}
              aria-label="Remove attachment"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* ── Attachment loading indicator ── */}
        {allowAttachments && attachmentLoading && (
          <div className="mb-2 flex items-center gap-2 text-[11px]" style={{ color: "#9B8E80" }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            Reading file…
          </div>
        )}

        {/* ── Attachment error ── */}
        {allowAttachments && attachmentError && (
          <div className="mb-2 text-[11px] text-red-600 leading-snug">
            {attachmentError}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Hidden file input */}
          {allowAttachments && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,text/plain,text/markdown,application/pdf"
              className="sr-only"
              aria-label="Attach file"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
                // Reset so the same file can be re-selected after removal
                e.target.value = "";
              }}
            />
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
            onPaste={handlePaste}
            rows={2}
            placeholder={`Ask about ${activeFieldLabel.toLowerCase()}…`}
            className="flex-1 rounded-xl px-3 py-2 text-[13px] leading-relaxed resize-none outline-none"
            style={{
              border: `1px solid ${WARM_BORDER}`,
              background: "white",
              color: INK,
            }}
          />

          <div className="flex flex-col gap-1.5 shrink-0">
            {/* Paperclip button — only shown when allowAttachments */}
            {allowAttachments && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={attachmentLoading || !!pendingAttachment}
                className="w-9 h-9 rounded-xl flex items-center justify-center disabled:opacity-40 transition-opacity"
                style={{ background: PARCHMENT, color: INK, border: `1px solid ${WARM_BORDER}` }}
                aria-label="Attach file"
                title="Attach an image or document"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => sendChat(chatInput)}
              disabled={!chatInput.trim() || sendMutation.isPending || attachmentLoading}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white disabled:opacity-40 transition-opacity"
              style={{ background: INK }}
              aria-label="Send"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-[10.5px] mt-1.5" style={{ color: "#9B8E80" }}>
          Shift+Enter to send
          {allowAttachments && " · Paste or attach an image / document"}
          {onApply && " · Apply replaces the targeted field"}
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
