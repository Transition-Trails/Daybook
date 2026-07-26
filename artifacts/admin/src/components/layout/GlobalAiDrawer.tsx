/**
 * GlobalAiDrawer — the single AI assistant drawer instance for the whole app.
 *
 * Always mounted (renders via CSS transform, not conditional) so chat history
 * and conversation state survive open/close cycles.
 *
 * Context resolution order (highest priority first):
 *   1. Studio page called setAiContext() — systemPrompt differs from default
 *   2. Location-based fallback — contextLabel + systemPrompt from current route
 *   3. Hard-coded DEFAULT_PAYLOAD
 *
 * Body layout: AppDrawer body is display:flex / flex-col / overflow:hidden.
 * DockAiAssistant handles its own internal scroll (flex-1 + overflow-y:auto).
 * Preview content gets an explicit overflow-y:auto wrapper.
 * → exactly ONE scrollable region visible at a time.
 */
import { useLocation }     from "wouter";
import { AppDrawer }        from "@/components/ui/AppDrawer";
import {
  useAiDrawer,
  DEFAULT_PAYLOAD,
  type AiContextPayload,
} from "@/contexts/AiDrawerContext";
import { DockAiAssistant }  from "@/components/studio/primitives";
import { Bot, Eye }         from "lucide-react";

// ── Surface-specific fallback contexts ────────────────────────────────────────

function getSurfaceCtx(location: string): Partial<AiContextPayload> {
  if (location === "/super") return {
    contextLabel: "Super admin · Dashboard",
    systemPrompt:
      "You are a platform operations assistant for Daybook. Help the super admin understand platform health, revenue metrics, store status, and system configuration.",
    examplePrompts: [
      "Why would MRR drop suddenly?",
      "What does a suspended store mean for its buyers?",
      "How does the subscription entitlement gate work?",
    ],
  };
  if (location.startsWith("/super/stores")) return {
    contextLabel: "Super admin · Stores",
    systemPrompt:
      "You are an operations assistant. Help the super admin review store health, subscription status, trial risk, and support issues across all Daybook stores.",
    examplePrompts: [
      "Which signals indicate a store is at churn risk?",
      "What should I check before suspending a store?",
      "How do I grant a store access to AI studios?",
    ],
  };
  if (location.startsWith("/super/revenue")) return {
    contextLabel: "Super admin · Revenue",
    systemPrompt:
      "You are a revenue analyst for the Daybook platform. Help interpret MRR trends, plan mix, and store upgrade opportunities.",
    examplePrompts: [
      "What causes MRR fluctuation?",
      "How do I identify upgrade candidates?",
      "Explain the difference between Pro and Starter plans.",
    ],
  };
  if (location.startsWith("/super")) return {
    contextLabel: "Super admin",
    systemPrompt:
      "You are an assistant for Daybook platform operations. Help with feature flags, audit logs, catalog management, and system health.",
    examplePrompts: [
      "How do feature flags affect store behaviour?",
      "What's logged in the audit trail?",
      "How does the global catalog relate to store catalogs?",
    ],
  };
  if (location.match(/^\/store\/[^/]+\/catalog/)) return {
    contextLabel: "Store · Catalog",
    systemPrompt:
      "You are a product curation assistant for a Daybook planner store. Help select, organise, and price editions, themes, and bundles.",
    examplePrompts: [
      "Which edition tiers perform best?",
      "How do I add a platform edition to my store?",
      "What's the difference between curated and independent content mode?",
    ],
  };
  if (location.match(/^\/store\/[^/]+\/stickers/)) return {
    contextLabel: "Store · Sticker library",
    systemPrompt:
      "You are a sticker curation expert for a Daybook store. Help audit the library, spot gaps, and decide what to create or retire.",
    examplePrompts: [
      "How should I tag stickers for better discovery?",
      "What makes a strong sticker pack?",
      "When should I retire a sticker?",
    ],
  };
  if (location.match(/^\/store\/[^/]+\/studios/)) return {
    contextLabel: "Store · Studio",
    systemPrompt:
      "You are an AI studio assistant for a Daybook store. Help with planner building, theme creation, sticker design, and marketing copy.",
    examplePrompts: [
      "How do I build my first planner?",
      "What makes a theme work for print?",
      "How do I write a strong Etsy listing?",
    ],
  };
  if (location.match(/^\/store\/[^/]+/)) return {
    contextLabel: "Store admin",
    systemPrompt:
      "You are a store management assistant for a Daybook planner store. Help with store operations, catalog curation, customer management, and AI studio usage.",
    examplePrompts: [
      "How do I enable AI studios?",
      "What actions improve store performance?",
      "Explain the planner build flow.",
    ],
  };
  if (
    location.startsWith("/daybook") ||
    location.startsWith("/studios") ||
    location.startsWith("/catalog")
  ) return {
    contextLabel: "Platform catalog",
    systemPrompt:
      "You are an assistant for the Daybook platform catalog admin. Help with themes, palettes, inserts, editions, and catalog configuration.",
    examplePrompts: [
      "How do themes relate to editions?",
      "What's the difference between a palette and a background?",
      "How do starter stickers work?",
    ],
  };
  return {};
}

// ── Tab strip ─────────────────────────────────────────────────────────────────

function DrawerTabStrip({
  tab,
  onTab,
}: {
  tab: "assistant" | "preview";
  onTab: (t: "assistant" | "preview") => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid hsl(37 37% 85%)",
        background: "#FFFDF9",
        flexShrink: 0,
      }}
    >
      {(["assistant", "preview"] as const).map((t) => {
        const active = tab === t;
        return (
          <button
            key={t}
            onClick={() => onTab(t)}
            style={{
              cursor: "pointer",
              flex: 1,
              padding: "10px 0",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid #C87560" : "2px solid transparent",
              color: active ? "#1B2A4A" : "hsl(215 16% 52%)",
              transition: "color 140ms",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            {t === "assistant" ? (
              <Bot style={{ width: 12, height: 12 }} />
            ) : (
              <Eye style={{ width: 12, height: 12 }} />
            )}
            {t === "assistant" ? "AI Assistant" : "Preview"}
          </button>
        );
      })}
    </div>
  );
}

// ── Context chip ──────────────────────────────────────────────────────────────

function ContextChip({ label }: { label: string }) {
  if (!label || label === "Daybook") return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(200,117,96,0.10)",
        color: "#C87560",
        border: "1px solid rgba(200,117,96,0.22)",
        whiteSpace: "nowrap",
        flexShrink: 0,
        maxWidth: 180,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function GlobalAiDrawer() {
  const [location]                           = useLocation();
  const { open, tab, payload, closeDrawer, setTab } = useAiDrawer();

  // Merge: studio-set payload wins when it differs from the default system prompt.
  const isDefault = payload.systemPrompt === DEFAULT_PAYLOAD.systemPrompt;
  const surface   = isDefault ? getSurfaceCtx(location) : {};

  const resolved: AiContextPayload = {
    systemPrompt:   surface.systemPrompt   ?? payload.systemPrompt,
    examplePrompts: surface.examplePrompts ?? payload.examplePrompts,
    contextLabel:   surface.contextLabel   ?? payload.contextLabel,
    previewContent: payload.previewContent,
  };

  const hasPreview = resolved.previewContent !== null;
  const activeTab  = hasPreview ? tab : "assistant";

  return (
    <AppDrawer
      open={open}
      onClose={closeDrawer}
      side="right"
      title="✦ AI Assistant"
      width={400}
      badge={<ContextChip label={resolved.contextLabel} />}
    >
      {/* AppDrawer body is display:flex / flex-col / overflow:hidden.
          This div fills it completely and manages tabs + content. */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

        {/* Tab strip — only when preview content is registered */}
        {hasPreview && (
          <DrawerTabStrip tab={activeTab} onTab={setTab} />
        )}

        {/* ── Assistant panel ─────────────────────────────────────────────
            Keep mounted even when preview is active so chat history
            survives tab switching. Hidden via display:none. */}
        <div
          style={{
            display: activeTab === "assistant" ? "flex" : "none",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* key resets chat when the surface changes (mode/studio switch) */}
          <DockAiAssistant
            key={resolved.systemPrompt}
            systemPrompt={resolved.systemPrompt}
            examplePrompts={resolved.examplePrompts}
          />
        </div>

        {/* ── Preview panel ───────────────────────────────────────────────
            Scrollable wrapper for preview content (no own internal scroll). */}
        {hasPreview && (
          <div
            style={{
              display: activeTab === "preview" ? "flex" : "none",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "hsl(37 30% 78%) transparent",
            } as React.CSSProperties}
          >
            {resolved.previewContent}
          </div>
        )}
      </div>
    </AppDrawer>
  );
}
