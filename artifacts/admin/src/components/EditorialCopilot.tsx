import { useRef } from "react";
import { CopilotPanel, type ApplyTarget } from "@/components/CopilotPanel";
import { apiFetch } from "@/lib/api";

export type EditorialCopilotSurface = "spec" | "style_guide" | "prompt_module";

interface EditorialCopilotProps {
  isOpen: boolean;
  onClose: () => void;
  surface: EditorialCopilotSurface;
  worldId: string | null | undefined;
  storageKey: string;
  title: string;
  greeting: string;
  activeTarget: ApplyTarget;
  context: Record<string, unknown>;
  onApply: (text: string, targetKey: string, targetLabel: string) => void;
  className?: string;
  panelStyle?: React.CSSProperties;
}

/**
 * Shared editorial co-write rail. The latest draft is read only when a turn is
 * sent, while CopilotPanel snapshots the apply target before that async work
 * starts. This keeps responses grounded in the current draft without letting an
 * Apply action drift when the editor changes fields or sections.
 */
export function EditorialCopilot({
  isOpen,
  onClose,
  surface,
  worldId,
  storageKey,
  title,
  greeting,
  activeTarget,
  context,
  onApply,
  className,
  panelStyle,
}: EditorialCopilotProps) {
  const targetRef = useRef(activeTarget);
  const contextRef = useRef(context);
  // A world switch must create an entirely separate session even when the
  // surrounding wizard remains mounted.
  const scopedStorageKey = `${storageKey}:world:${worldId ?? "unselected"}`;
  targetRef.current = activeTarget;
  contextRef.current = context;

  return (
    <CopilotPanel
      isOpen={isOpen}
      onClose={onClose}
      storageKey={scopedStorageKey}
      title={title}
      activeFieldLabel={activeTarget.label}
      greeting={greeting}
      className={className}
      panelStyle={panelStyle}
      onCaptureTarget={() => ({ ...targetRef.current })}
      onSend={(message, history) =>
        apiFetch<{ reply: string }>("/v1/worldsmith/copilot", {
          method: "POST",
          body: JSON.stringify({
            surface,
            worldId,
            field: targetRef.current.key,
            fieldLabel: targetRef.current.label,
            message,
            history,
            context: contextRef.current,
          }),
        })
      }
      onApply={onApply}
    />
  );
}