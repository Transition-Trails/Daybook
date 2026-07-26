/**
 * AiDrawerContext — global state for the app-wide AI assistant drawer.
 *
 * Any authenticated surface can call:
 *   const { openAssistant, setAiContext } = useAiDrawer();
 *
 * Studio hubs call setAiContext() in a useEffect (with clearAiContext cleanup)
 * to register their surface-specific system prompt and preview content.
 *
 * Non-studio pages leave context at DEFAULT; GlobalAiDrawer derives
 * surface-specific suggestions from the current route.
 *
 * Persistence: open/tab state survives reload via localStorage "ai:drawer:v1".
 * Context (systemPrompt etc.) is ephemeral — re-set by the page on mount.
 */
import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";

export type AiDrawerTab = "assistant" | "preview";

export interface AiContextPayload {
  systemPrompt: string;
  examplePrompts: string[];
  contextLabel: string;
  previewContent: ReactNode | null;
}

const DEFAULT_PAYLOAD: AiContextPayload = {
  systemPrompt:
    "You are a helpful assistant for Daybook, a platform for building and selling premium digital planners. Help with platform questions, store management, editions, and AI studio usage.",
  examplePrompts: [
    "What's the best action to take right now?",
    "How does the entitlement system work?",
    "How do I enable AI studios for a store?",
  ],
  contextLabel: "Daybook",
  previewContent: null,
};

// ── localStorage helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = "ai:drawer:v1";

interface StoredState {
  open: boolean;
  tab: AiDrawerTab;
}

function readStorage(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { open: false, tab: "assistant" };
    const p = JSON.parse(raw) as Partial<StoredState>;
    return {
      open: typeof p.open === "boolean" ? p.open : false,
      tab:  p.tab === "preview" ? "preview" : "assistant",
    };
  } catch {
    return { open: false, tab: "assistant" };
  }
}

function writeStorage(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota / private mode — ignore */ }
}

// ── Context ────────────────────────────────────────────────────────────────────

interface AiDrawerContextType {
  // Persisted state
  open: boolean;
  tab: AiDrawerTab;
  // Ephemeral context (set by current page)
  payload: AiContextPayload;
  // Actions
  openAssistant: () => void;
  openPreview:   () => void;
  closeDrawer:   () => void;
  setTab:        (tab: AiDrawerTab) => void;
  /** Called by studio pages on mount to register surface context */
  setAiContext:   (ctx: Partial<AiContextPayload>) => void;
  /** Called on unmount to reset to default (so non-studio pages get clean state) */
  clearAiContext: () => void;
}

const AiDrawerCtx = createContext<AiDrawerContextType | null>(null);

export function AiDrawerProvider({ children }: { children: ReactNode }) {
  const stored = useRef<StoredState>(readStorage());

  const [open, setOpen_]     = useState<boolean>(stored.current.open);
  const [tab,  setTabState]  = useState<AiDrawerTab>(stored.current.tab);
  const [payload, setPayload] = useState<AiContextPayload>(DEFAULT_PAYLOAD);

  // Write + set in one call so localStorage is always in sync
  const writeAndSet = useCallback(
    (nextOpen: boolean, nextTab: AiDrawerTab) => {
      stored.current = { open: nextOpen, tab: nextTab };
      setOpen_(nextOpen);
      setTabState(nextTab);
      writeStorage({ open: nextOpen, tab: nextTab });
    },
    [],
  );

  const openAssistant = useCallback(() => writeAndSet(true,  "assistant"), [writeAndSet]);
  const openPreview   = useCallback(() => writeAndSet(true,  "preview"),   [writeAndSet]);
  const closeDrawer   = useCallback(() => writeAndSet(false, tab),          [writeAndSet, tab]);

  const setTab = useCallback(
    (t: AiDrawerTab) => writeAndSet(open, t),
    [writeAndSet, open],
  );

  const setAiContext = useCallback((ctx: Partial<AiContextPayload>) => {
    setPayload((prev) => ({ ...prev, ...ctx }));
  }, []);

  const clearAiContext = useCallback(() => {
    setPayload(DEFAULT_PAYLOAD);
  }, []);

  return (
    <AiDrawerCtx.Provider
      value={{
        open, tab, payload,
        openAssistant, openPreview, closeDrawer, setTab,
        setAiContext, clearAiContext,
      }}
    >
      {children}
    </AiDrawerCtx.Provider>
  );
}

export function useAiDrawer(): AiDrawerContextType {
  const ctx = useContext(AiDrawerCtx);
  if (!ctx) throw new Error("useAiDrawer must be used inside AiDrawerProvider");
  return ctx;
}

export { DEFAULT_PAYLOAD };
