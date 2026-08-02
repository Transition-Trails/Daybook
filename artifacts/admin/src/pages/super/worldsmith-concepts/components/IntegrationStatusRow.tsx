import { useState } from "react";
import { RefreshCw, Settings, AlertCircle, ExternalLink, CheckCircle2, HelpCircle, Info } from "lucide-react";
import type { IntegrationRecord } from "../seed-data";
import { INTEGRATION_STATUS_LABELS, timeAgo } from "../seed-data";
import { IntegrationBadge } from "./StatusBadge";

interface IntegrationStatusRowProps {
  integration: IntegrationRecord;
  compact?: boolean;
}

const SERVICE_ICONS: Record<string, string> = {
  notion: "N",
  google_drive: "G",
  image_provider: "⬡",
  daybook_sync: "D",
  github: "⌥",
};

export function IntegrationStatusRow({ integration, compact }: IntegrationStatusRowProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    // Simulated mock connection test
    await new Promise(r => setTimeout(r, 1200));
    setTesting(false);
    setTestResult(integration.status === "connected" ? "ok" : "fail");
    setTimeout(() => setTestResult(null), 3000);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold bg-muted text-muted-foreground shrink-0">
          {SERVICE_ICONS[integration.service] ?? "?"}
        </span>
        <span className="text-[12px] text-foreground flex-1">{integration.label}</span>
        <IntegrationBadge status={integration.status} />
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-card space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-md flex items-center justify-center text-[13px] font-bold bg-muted text-muted-foreground shrink-0">
          {SERVICE_ICONS[integration.service] ?? "?"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground">{integration.label}</p>
          {integration.worldId !== "global" && (
            <p className="text-[10.5px] text-muted-foreground">World-level</p>
          )}
        </div>
        <IntegrationBadge status={integration.status} />
      </div>

      {integration.errorMessage && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200">
          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">{integration.errorMessage}</p>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap">
        {integration.lastCheck && (
          <span className="text-[10.5px] text-muted-foreground flex items-center gap-0.5">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Checked {timeAgo(integration.lastCheck)}
          </span>
        )}
        {integration.lastFailure && (
          <span className="text-[10.5px] text-red-600 flex items-center gap-0.5">
            <AlertCircle className="w-2.5 h-2.5" />
            Failed {timeAgo(integration.lastFailure)}
          </span>
        )}
        <div className="flex-1" />
        {testResult === "ok" && <span className="text-[10.5px] text-green-600 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> Connected</span>}
        {testResult === "fail" && <span className="text-[10.5px] text-red-600 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> Failed</span>}
        <button
          onClick={handleTest}
          disabled={testing}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5 px-2 py-0.5 rounded border border-border hover:border-foreground/20 disabled:opacity-50"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${testing ? "animate-spin" : ""}`} />
          {testing ? "Testing…" : "Test"}
        </button>
        {integration.status === "needs_configuration" && (
          <button className="text-[11px] font-medium text-[#C87560] hover:underline flex items-center gap-0.5">
            <Settings className="w-2.5 h-2.5" />
            Configure
          </button>
        )}
        {integration.errorMessage && (
          <button className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-0.5">
            <ExternalLink className="w-2.5 h-2.5" />
            View error
          </button>
        )}
      </div>
    </div>
  );
}

interface IntegrationPanelProps {
  integrations: IntegrationRecord[];
  title?: string;
}

export function IntegrationPanel({ integrations, title = "Integration health" }: IntegrationPanelProps) {
  const issues = integrations.filter(i => i.status !== "connected" && i.status !== "not_required");

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        {issues.length > 0 && (
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {integrations.map(i => (
          <IntegrationStatusRow key={i.id} integration={i} />
        ))}
      </div>
    </div>
  );
}
