/**
 * PROTOTYPE_DATA — Create New World wizard (8-step, prototype only).
 * Connection tests are mocked. On completion, adds the world to prototype context.
 */
import { useState } from "react";
import { X, Check, ChevronRight, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import type { World } from "../seed-data";
import { usePrototype } from "../prototype-context";

interface WizardState {
  // Step 1: World Details
  name: string;
  code: string;
  description: string;
  owner: string;
  // Step 2: Creative Foundation
  styleGuide: string;
  canonGovernance: string;
  defaultSpec: string;
  // Step 3: Notion
  notionToken: string;
  notionDbId: string;
  // Step 4: Google Drive
  driveRoot: string;
  worldFolder: string;
  // Step 5: Image Provider
  imageProvider: string;
  apiKeyHint: string;
  // Step 6: Daybook Config
  namingConvention: string;
  assetPrefix: string;
  // Step 7: Verify (populated by mock tests)
  verifyResults: Record<string, "ok" | "fail" | "pending" | "idle">;
  // Step 8: Summary (computed)
}

const INITIAL: WizardState = {
  name: "", code: "", description: "", owner: "",
  styleGuide: "", canonGovernance: "Living Archive", defaultSpec: "Standard Layout",
  notionToken: "••••••••••••••••", notionDbId: "",
  driveRoot: "My Drive / WorldSmith", worldFolder: "",
  imageProvider: "dalle3", apiKeyHint: "",
  namingConvention: "{WORLD_CODE}_{COMPONENT}_{INDEX}", assetPrefix: "",
  verifyResults: {},
};

const STEPS = [
  "World Details",
  "Creative Foundation",
  "Notion Connection",
  "Google Drive",
  "Image Provider",
  "Daybook Config",
  "Verify Setup",
  "Summary",
];

const LS_KEY = "ws-proto:wizard-draft";

function loadDraft(): Partial<WizardState> | null {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}
function saveDraft(s: WizardState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* noop */ }
}
function clearDraft() {
  try { localStorage.removeItem(LS_KEY); } catch { /* noop */ }
}

export function CreateWorldWizard() {
  const { closeWizard, addWorld, setWorldFilter } = usePrototype();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => {
    const draft = loadDraft();
    return draft ? { ...INITIAL, ...draft } : { ...INITIAL };
  });
  const [verifying, setVerifying] = useState(false);
  const [done, setDone] = useState(false);

  const update = (field: keyof WizardState, value: string) => {
    setState(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = (): boolean => {
    if (step === 0) return state.name.trim().length > 0 && state.code.trim().length > 0;
    if (step === 2) return state.notionDbId.trim().length > 0;
    if (step === 3) return state.worldFolder.trim().length > 0;
    return true;
  };

  const handleSaveAndResume = () => {
    saveDraft(state);
    closeWizard();
  };

  const handleVerify = async () => {
    setVerifying(true);
    setState(prev => ({
      ...prev,
      verifyResults: {
        notion: "pending",
        google_drive: "pending",
        image_provider: "pending",
        daybook: "pending",
      },
    }));

    // Stagger mock connection checks
    await sleep(600);
    setState(prev => ({ ...prev, verifyResults: { ...prev.verifyResults, notion: "ok" } }));
    await sleep(500);
    setState(prev => ({ ...prev, verifyResults: { ...prev.verifyResults, google_drive: "ok" } }));
    await sleep(700);
    setState(prev => ({
      ...prev, verifyResults: {
        ...prev.verifyResults,
        image_provider: state.imageProvider !== "none" ? "ok" : "idle",
      }
    }));
    await sleep(400);
    setState(prev => ({ ...prev, verifyResults: { ...prev.verifyResults, daybook: "ok" } }));

    setVerifying(false);
    setStep(7);
  };

  const handleFinish = () => {
    const newWorld: World = {
      id: `world-${state.code.toLowerCase().replace(/\s+/g, "-")}`,
      name: state.name,
      code: state.code.toUpperCase(),
      description: state.description || `${state.name} — newly created world.`,
      status: "in_setup",
      health: "in_setup",
      healthReasons: ["Recently created — setup in progress"],
      coverColor: "linear-gradient(135deg, #3A3A3A 0%, #6A6A6A 100%)",
      coverAccent: "#AAAAAA",
      productionCompletion: 0,
      awaitingReview: 0,
      blockers: 0,
      lastActivity: new Date().toISOString(),
      integrationHealth: "connected",
      owner: state.owner || "You",
      tags: [],
    };
    addWorld(newWorld);
    setWorldFilter(newWorld.id);
    clearDraft();
    setDone(true);
    setTimeout(closeWizard, 1800);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create New World">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              PROTOTYPE · New World
            </p>
            <h2 className="text-base font-semibold text-foreground">{STEPS[step]}</h2>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <StepIndicator current={step} total={STEPS.length} />
          </div>
          <button
            onClick={closeWizard}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Close wizard"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {done ? (
            <DoneScreen name={state.name} />
          ) : (
            <>
              {step === 0 && <StepWorldDetails state={state} update={update} />}
              {step === 1 && <StepCreativeFoundation state={state} update={update} />}
              {step === 2 && <StepNotionConnection state={state} update={update} />}
              {step === 3 && <StepGoogleDrive state={state} update={update} />}
              {step === 4 && <StepImageProvider state={state} update={update} />}
              {step === 5 && <StepDaybookConfig state={state} update={update} />}
              {step === 6 && <StepVerify results={state.verifyResults} verifying={verifying} onVerify={handleVerify} />}
              {step === 7 && <StepSummary state={state} verifyResults={state.verifyResults} />}
            </>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center gap-3">
            <button
              onClick={handleSaveAndResume}
              className="text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Save & resume later
            </button>
            <div className="flex-1" />
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 rounded-lg text-sm border border-border hover:border-foreground/20 transition-colors"
              >
                Back
              </button>
            )}
            {step < 6 && (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                style={{ background: "#1B2A4A" }}
              >
                Continue
              </button>
            )}
            {step === 6 && !verifying && Object.keys(state.verifyResults).length === 0 && (
              <button
                onClick={handleVerify}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: "#1B2A4A" }}
              >
                Run verification
              </button>
            )}
            {step === 7 && (
              <button
                onClick={handleFinish}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "#C87560" }}
              >
                Create World →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${i === current ? "w-6 bg-[#C87560]" : i < current ? "w-3 bg-[#C87560]/50" : "w-3 bg-muted"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12.5px] font-semibold text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/40 transition-colors";

function StepWorldDetails({ state, update }: { state: WizardState; update: (f: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">Give your World a name and identity. The code is used as a prefix throughout the system.</p>
      <Field label="World name" required hint="e.g. Wychcombe">
        <input className={inputCls} value={state.name} onChange={e => update("name", e.target.value)} placeholder="My World" />
      </Field>
      <Field label="World code" required hint="2–4 uppercase letters, e.g. WYC. Used as a prefix in filenames and IDs.">
        <input className={inputCls} value={state.code} onChange={e => update("code", e.target.value.toUpperCase().slice(0, 4))} placeholder="WYC" />
      </Field>
      <Field label="Description" hint="Briefly describe the creative identity of this World.">
        <textarea className={inputCls} value={state.description} onChange={e => update("description", e.target.value)} rows={3} placeholder="A world of…" />
      </Field>
      <Field label="Owner" hint="Who is responsible for this World?">
        <input className={inputCls} value={state.owner} onChange={e => update("owner", e.target.value)} placeholder="Your name" />
      </Field>
    </div>
  );
}

function StepCreativeFoundation({ state, update }: { state: WizardState; update: (f: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">Configure the creative foundations that govern production for this World.</p>
      <Field label="Primary Style Guide" hint="The Notion page or document that defines visual identity.">
        <input className={inputCls} value={state.styleGuide} onChange={e => update("styleGuide", e.target.value)} placeholder="Paste a Notion URL or style guide name" />
      </Field>
      <Field label="Canon governance" hint="System used to manage authoritative world facts.">
        <select className={inputCls} value={state.canonGovernance} onChange={e => update("canonGovernance", e.target.value)}>
          <option>Living Archive</option>
          <option>Notion Database</option>
          <option>Git repository</option>
          <option>None</option>
        </select>
      </Field>
      <Field label="Default component specification" hint="Template applied when creating new specs for this World.">
        <select className={inputCls} value={state.defaultSpec} onChange={e => update("defaultSpec", e.target.value)}>
          <option>Standard Layout</option>
          <option>Editorial Layout</option>
          <option>Field Guide Layout</option>
          <option>Minimal Layout</option>
        </select>
      </Field>
      <div className="rounded-lg border border-border p-3 bg-muted/20">
        <p className="text-[11.5px] font-medium text-foreground mb-1">Optional in prototype</p>
        <p className="text-[11px] text-muted-foreground">Visual identity assets and reference images can be added after World creation.</p>
      </div>
    </div>
  );
}

function StepNotionConnection({ state, update }: { state: WizardState; update: (f: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="text-[12px] font-medium text-green-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Global Notion token connected
        </p>
        <p className="text-[11px] text-green-700 mt-0.5">The platform Notion integration is active. Provide the database ID for this World's production specifications.</p>
      </div>
      <Field label="Production Specification Database ID" required hint="The Notion database where this World's production specs live.">
        <input className={inputCls} value={state.notionDbId} onChange={e => update("notionDbId", e.target.value)} placeholder="Paste a Notion database URL or ID" />
      </Field>
      <div className="rounded-lg border border-border p-3 bg-muted/10 space-y-1">
        <p className="text-[11.5px] font-medium text-foreground">Required Notion databases</p>
        {["Production Specifications", "Canon Reference", "Style Guides", "Visual Assets"].map((db, i) => (
          <p key={i} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[8px]">{i + 1}</span>
            {db}
          </p>
        ))}
      </div>
    </div>
  );
}

function StepGoogleDrive({ state, update }: { state: WizardState; update: (f: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-green-200 bg-green-50 p-3">
        <p className="text-[12px] font-medium text-green-800 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> Google Drive connected
        </p>
        <p className="text-[11px] text-green-700 mt-0.5">Platform Drive integration is active. Set the folder for this World's assets.</p>
      </div>
      <Field label="WorldSmith root folder" hint="The root path where all WorldSmith worlds are stored.">
        <input className={inputCls} value={state.driveRoot} onChange={e => update("driveRoot", e.target.value)} />
      </Field>
      <Field label="World folder name" required hint={`This World's folder, e.g. "${state.name || "Wychcombe"}"`}>
        <input className={inputCls} value={state.worldFolder} onChange={e => update("worldFolder", e.target.value)} placeholder={state.name || "World name"} />
      </Field>
    </div>
  );
}

function StepImageProvider({ state, update }: { state: WizardState; update: (f: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">Choose an image generation provider for this World. Not required for text-only specifications.</p>
      <Field label="Provider">
        <select className={inputCls} value={state.imageProvider} onChange={e => update("imageProvider", e.target.value)}>
          <option value="dalle3">DALL-E 3 (OpenAI)</option>
          <option value="stable_diffusion">Stable Diffusion</option>
          <option value="midjourney">Midjourney</option>
          <option value="none">None — text-only</option>
        </select>
      </Field>
      {state.imageProvider !== "none" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11.5px] font-medium text-amber-800">API credentials</p>
          <p className="text-[11px] text-amber-700 mt-0.5">In production, credentials are managed via environment secrets. This prototype uses the platform-level key.</p>
        </div>
      )}
    </div>
  );
}

function StepDaybookConfig({ state, update }: { state: WizardState; update: (f: keyof WizardState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">Configure how Daybook names and identifies assets for this World.</p>
      <Field label="File naming convention" hint="Variables: {WORLD_CODE}, {COMPONENT}, {INDEX}, {DATE}">
        <input className={inputCls} value={state.namingConvention} onChange={e => update("namingConvention", e.target.value)} />
      </Field>
      <Field label="Asset ID prefix" hint="Prefix for stable Daybook Asset IDs. Defaults to the World code.">
        <input className={inputCls} value={state.assetPrefix || state.code} onChange={e => update("assetPrefix", e.target.value)} placeholder={state.code || "WYC"} />
      </Field>
    </div>
  );
}

function StepVerify({ results, verifying, onVerify }: {
  results: Record<string, "ok" | "fail" | "pending" | "idle">;
  verifying: boolean;
  onVerify: () => void;
}) {
  const checks = [
    { key: "notion",       label: "Notion connection" },
    { key: "google_drive", label: "Google Drive folder" },
    { key: "image_provider", label: "Image provider" },
    { key: "daybook",      label: "Daybook sync" },
  ];

  return (
    <div className="space-y-5">
      <p className="text-[12.5px] text-muted-foreground">Run a verification check to confirm all connections are working before creating the World.</p>
      <div className="space-y-2">
        {checks.map(c => {
          const r = results[c.key];
          return (
            <div key={c.key} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <span className="w-6 h-6 flex items-center justify-center shrink-0">
                {!r || r === "idle" ? <span className="w-2 h-2 rounded-full bg-muted-foreground/30" /> : null}
                {r === "pending" ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
                {r === "ok" ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : null}
                {r === "fail" ? <AlertCircle className="w-4 h-4 text-red-500" /> : null}
              </span>
              <p className="text-sm text-foreground">{c.label}</p>
              <div className="flex-1" />
              {r === "ok" && <span className="text-[11px] text-green-600">Connected</span>}
              {r === "fail" && <span className="text-[11px] text-red-600">Failed</span>}
              {(!r || r === "idle") && <span className="text-[11px] text-muted-foreground">Ready to check</span>}
            </div>
          );
        })}
      </div>
      {!verifying && Object.keys(results).length === 0 && (
        <p className="text-[12px] text-muted-foreground text-center">Press "Run verification" to test all connections.</p>
      )}
    </div>
  );
}

function StepSummary({ state, verifyResults }: { state: WizardState; verifyResults: Record<string, string> }) {
  const allOk = Object.values(verifyResults).every(v => v === "ok" || v === "idle");
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border p-3 ${allOk ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        <p className={`text-[12.5px] font-semibold ${allOk ? "text-green-800" : "text-amber-800"}`}>
          {allOk ? "✓ All checks passed — ready to create" : "⚠ Some checks need attention"}
        </p>
      </div>
      <div className="space-y-2 text-[12.5px]">
        {[
          ["World name", state.name],
          ["Code", state.code],
          ["Owner", state.owner || "—"],
          ["Canon governance", state.canonGovernance],
          ["Image provider", state.imageProvider === "none" ? "None" : state.imageProvider.replace("_", " ")],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-muted-foreground w-36 shrink-0">{k}</span>
            <span className="font-medium text-foreground">{v}</span>
          </div>
        ))}
      </div>
      <p className="text-[11.5px] text-muted-foreground border-t border-border pt-3">
        The World will be created in setup status. You can continue configuration after creation.
      </p>
    </div>
  );
}

function DoneScreen({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
        <Check className="w-6 h-6 text-green-600" />
      </div>
      <p className="text-base font-semibold text-foreground">"{name}" created</p>
      <p className="text-[12.5px] text-muted-foreground mt-1">Redirecting to your new World…</p>
    </div>
  );
}
