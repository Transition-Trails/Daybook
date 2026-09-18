import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Square, X, Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ContextSnapshotStatus } from "./ContextSnapshotStatus";

interface PunchTemplate {
  id: string;
  name: string;
  code: string;
  version: number;
}

interface ProductionProfile {
  id: string;
  name: string;
  code: string;
  status: "draft" | "active" | "archived";
  outputMedium: "digital" | "print";
  finishedWidth: number | null;
  finishedHeight: number | null;
  units: "inches" | "millimeters";
  orientationBehavior: "fixed_portrait" | "fixed_landscape" | "supports_both" | "square";
  bleed: number | null;
  outerSafeMargin: number | null;
  bindingType: "none" | "disc_bound";
  bindingSafeZone: number | null;
  bindingEdgeBehavior: "none" | "left" | "right" | "mirrored";
  punchTemplateId: string | null;
  punchTemplateVersion: number | null;
  punchTemplate?: PunchTemplate | null;
  currentPunchTemplate?: PunchTemplate | null;
}

function SafeZonePreview({ profile }: { profile: Partial<ProductionProfile> }) {
  const [side, setSide] = useState<"recto" | "verso">("recto");

  const w = Number(profile.finishedWidth);
  const h = Number(profile.finishedHeight);

  if (!w || !h || w <= 0 || h <= 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
        Enter positive dimensions to see preview
      </div>
    );
  }

  const bleed = Number(profile.bleed) || 0;
  const outer = Number(profile.outerSafeMargin) || 0;
  const binding = Number(profile.bindingSafeZone) || 0;
  
  let leftSafe = outer;
  let rightSafe = outer;

  if (profile.bindingEdgeBehavior === "left") {
    leftSafe = Math.max(leftSafe, binding);
  } else if (profile.bindingEdgeBehavior === "right") {
    rightSafe = Math.max(rightSafe, binding);
  } else if (profile.bindingEdgeBehavior === "mirrored") {
    if (side === "recto") {
      leftSafe = Math.max(leftSafe, binding);
    } else {
      rightSafe = Math.max(rightSafe, binding);
    }
  }

  const totalW = w + bleed * 2;
  const totalH = h + bleed * 2;

  const toPct = (val: number, max: number) => `${(val / max) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Geometry Visualization</h4>
        {profile.bindingEdgeBehavior === "mirrored" && (
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={(e) => { e.preventDefault(); setSide("verso"); }}
              className={`rounded px-2 py-1 text-xs font-medium ${side === "verso" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              Verso (Left)
            </button>
            <button
              onClick={(e) => { e.preventDefault(); setSide("recto"); }}
              className={`rounded px-2 py-1 text-xs font-medium ${side === "recto" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              Recto (Right)
            </button>
          </div>
        )}
      </div>

      <div className="relative mx-auto bg-gray-100 border border-gray-200 shadow-inner flex items-center justify-center overflow-hidden"
           style={{ width: '100%', maxWidth: '300px', aspectRatio: `${totalW}/${totalH}` }}>
        
        {/* Bleed Area */}
        <div className="absolute inset-0 bg-[var(--admin-amber)]/20 border border-dashed border-[var(--admin-amber)]" title="Bleed" />
        
        {/* Trim Area */}
        <div 
          className="absolute bg-white shadow-md border border-gray-300"
          style={{
            left: toPct(bleed, totalW),
            right: toPct(bleed, totalW),
            top: toPct(bleed, totalH),
            bottom: toPct(bleed, totalH),
          }}
          title="Trim Rectangle"
        >
          {/* Safe Area */}
          <div 
            className="absolute border-2 border-dashed border-[var(--admin-blue)] bg-[var(--admin-card-subtle)]/30"
            style={{
              left: toPct(leftSafe, w),
              right: toPct(rightSafe, w),
              top: toPct(outer, h),
              bottom: toPct(outer, h),
            }}
            title="Safe Content Area"
          >
            <div className="flex h-full items-center justify-center text-[10px] font-medium text-blue-800 opacity-50 text-center px-2">
              Safe Content
            </div>
          </div>

          {/* Binding Zone Visual Indicator */}
          {binding > 0 && profile.bindingEdgeBehavior !== "none" && (
            <div 
              className="absolute bg-[var(--admin-clay)]/20 border-r border-[var(--admin-clay)]/40 flex items-center justify-center"
              style={{
                left: profile.bindingEdgeBehavior === "right" || (profile.bindingEdgeBehavior === "mirrored" && side === "verso") ? "auto" : 0,
                right: profile.bindingEdgeBehavior === "right" || (profile.bindingEdgeBehavior === "mirrored" && side === "verso") ? 0 : "auto",
                top: 0,
                bottom: 0,
                width: toPct(binding, w),
                borderRightWidth: (profile.bindingEdgeBehavior === "right" || (profile.bindingEdgeBehavior === "mirrored" && side === "verso")) ? 0 : '1px',
                borderLeftWidth: (profile.bindingEdgeBehavior === "right" || (profile.bindingEdgeBehavior === "mirrored" && side === "verso")) ? '1px' : 0,
              }}
              title="Binding Safe Zone"
            >
               <span className="text-[10px] text-[var(--admin-clay)] opacity-80 rotate-[-90deg] whitespace-nowrap">Binding Zone</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4 text-[10px] text-gray-500">
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[var(--admin-amber)]/20 border border-dashed border-[var(--admin-amber)]"></span> Bleed</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-white border border-gray-300"></span> Trim</div>
        <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[var(--admin-card-subtle)]/30 border-2 border-dashed border-[var(--admin-blue)]"></span> Content Safe</div>
        {binding > 0 && <div className="flex items-center gap-1"><span className="w-3 h-3 bg-[var(--admin-clay)]/20"></span> Binding Safe</div>}
      </div>
    </div>
  );
}

function ProductionProfileDrawer({
  profile,
  onClose,
}: {
  profile: ProductionProfile | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [repinPunchTemplate, setRepinPunchTemplate] = useState(false);
  
  const { data: punchData } = useQuery({
    queryKey: ["editorial-punch-templates"],
    queryFn: () => apiFetch<{ punch_templates: PunchTemplate[] }>("/v1/editorial/punch-templates"),
  });
  const punchTemplates = punchData?.punch_templates ?? [];
  
  const [formData, setFormData] = useState<Partial<ProductionProfile>>(
    profile ?? {
      name: "",
      code: "",
      status: "draft",
      outputMedium: "print",
      orientationBehavior: "fixed_portrait",
      units: "inches",
      bindingType: "none",
      bindingEdgeBehavior: "none",
      bleed: 0.125,
      outerSafeMargin: 0.25,
      bindingSafeZone: 0,
    }
  );

  const handleChange = (field: keyof ProductionProfile, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "outputMedium" && value === "digital"
        ? { punchTemplateId: null, bindingType: "none", bindingSafeZone: 0, bindingEdgeBehavior: "none" }
        : {}),
      ...(field === "bindingType" && value === "none"
        ? { punchTemplateId: null, bindingSafeZone: 0, bindingEdgeBehavior: "none" }
        : {}),
      ...(field === "bindingType" && value === "disc_bound"
        ? { bindingSafeZone: 0.75, bindingEdgeBehavior: "mirrored" }
        : {}),
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        name: formData.name?.trim(),
        code: formData.code?.trim(),
        finishedWidth: formData.finishedWidth ? Number(formData.finishedWidth) : null,
        finishedHeight: formData.finishedHeight ? Number(formData.finishedHeight) : null,
        bleed: formData.bleed ? Number(formData.bleed) : 0,
        outerSafeMargin: formData.outerSafeMargin ? Number(formData.outerSafeMargin) : 0,
        bindingSafeZone: formData.bindingSafeZone ? Number(formData.bindingSafeZone) : 0,
        punchTemplateId: formData.outputMedium === "digital" ? null : formData.punchTemplateId || null,
        repinPunchTemplate,
      };

      if (profile) {
        return apiFetch(`/v1/editorial/production-profiles/${profile.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        return apiFetch("/v1/editorial/production-profiles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-production-profiles"] });
      toast({ title: profile ? "Profile updated" : "Profile created" });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message || "Please check inputs and try again.",
        variant: "destructive",
      });
    },
  });

  const canSave = formData.name?.trim() && formData.code?.trim() && formData.outputMedium && formData.orientationBehavior && !saveMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-4xl flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Square className="h-4 w-4 text-[var(--admin-clay)]" />
            <h2 className="font-semibold text-gray-900">
              {profile ? "Edit Production Profile" : "New Production Profile"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col md:flex-row h-full">
            <div className="flex-1 space-y-8 p-6 overflow-y-auto border-r border-gray-100">
              {profile && <ContextSnapshotStatus entityType="production-profiles" entityId={profile.id} />}
              
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Identity</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="profileName" className="mb-1.5 block text-sm font-medium text-gray-700">Profile Name *</label>
                    <input
                      id="profileName"
                      value={formData.name || ""}
                      onChange={(e) => handleChange("name", e.target.value)}
                      placeholder="e.g. Disc-Bound — Half Letter"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="profileCode" className="mb-1.5 block text-sm font-medium text-gray-700">Profile Code *</label>
                    <input
                      id="profileCode"
                      value={formData.code || ""}
                      onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                      placeholder="e.g. DISC-HL-85"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] uppercase"
                    />
                  </div>
                  <div>
                    <label htmlFor="profileStatus" className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
                    <select
                      id="profileStatus"
                      value={formData.status}
                      onChange={(e) => handleChange("status", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Page Geometry</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="outputMedium" className="mb-1.5 block text-sm font-medium text-gray-700">Output Medium</label>
                    <select
                      id="outputMedium"
                      value={formData.outputMedium}
                      onChange={(e) => handleChange("outputMedium", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    >
                      <option value="print">Print</option>
                      <option value="digital">Digital</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="orientationBehavior" className="mb-1.5 block text-sm font-medium text-gray-700">Orientation Behavior</label>
                    <select
                      id="orientationBehavior"
                      value={formData.orientationBehavior}
                      onChange={(e) => handleChange("orientationBehavior", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    >
                      <option value="fixed_portrait">Fixed Portrait</option>
                      <option value="fixed_landscape">Fixed Landscape</option>
                      <option value="supports_both">Supports Both</option>
                      <option value="square">Square</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="finishedWidth" className="mb-1.5 block text-sm font-medium text-gray-700">Finished Width</label>
                    <input
                      id="finishedWidth"
                      type="number" step="0.01"
                      value={formData.finishedWidth ?? ""}
                      onChange={(e) => handleChange("finishedWidth", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="finishedHeight" className="mb-1.5 block text-sm font-medium text-gray-700">Finished Height</label>
                    <input
                      id="finishedHeight"
                      type="number" step="0.01"
                      value={formData.finishedHeight ?? ""}
                      onChange={(e) => handleChange("finishedHeight", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="units" className="mb-1.5 block text-sm font-medium text-gray-700">Units</label>
                    <select
                      id="units"
                      value={formData.units}
                      onChange={(e) => handleChange("units", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    >
                      <option value="inches">Inches</option>
                      <option value="millimeters">Millimeters</option>
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Print Safety</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bleed" className="mb-1.5 block text-sm font-medium text-gray-700">Bleed</label>
                    <input
                      id="bleed"
                      type="number" step="0.01"
                      value={formData.bleed ?? ""}
                      onChange={(e) => handleChange("bleed", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="outerSafeMargin" className="mb-1.5 block text-sm font-medium text-gray-700">Outer Safe Margin</label>
                    <input
                      id="outerSafeMargin"
                      type="number" step="0.01"
                      value={formData.outerSafeMargin ?? ""}
                      onChange={(e) => handleChange("outerSafeMargin", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4 border-b pb-2">Binding & Punch</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bindingType" className="mb-1.5 block text-sm font-medium text-gray-700">Binding Type</label>
                    <select
                      id="bindingType"
                      value={formData.bindingType}
                      onChange={(e) => handleChange("bindingType", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    >
                      <option value="none">None</option>
                      <option value="disc_bound">Disc-Bound</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="bindingEdgeBehavior" className="mb-1.5 block text-sm font-medium text-gray-700">Binding Edge Behavior</label>
                    <select
                      id="bindingEdgeBehavior"
                      value={formData.bindingEdgeBehavior}
                      onChange={(e) => handleChange("bindingEdgeBehavior", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    >
                      <option value="none">None</option>
                      <option value="mirrored">Mirrored</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="bindingSafeZone" className="mb-1.5 block text-sm font-medium text-gray-700">Binding Safe Zone</label>
                    <input
                      id="bindingSafeZone"
                      type="number" step="0.01"
                      value={formData.bindingSafeZone ?? ""}
                      onChange={(e) => handleChange("bindingSafeZone", e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                    />
                  </div>
                  {formData.outputMedium !== "digital" && (
                    <div>
                      <label htmlFor="punchTemplateId" className="mb-1.5 block text-sm font-medium text-gray-700">Punch Template</label>
                      <select
                        id="punchTemplateId"
                        value={formData.punchTemplateId || ""}
                        onChange={(e) => handleChange("punchTemplateId", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                      >
                        <option value="">None</option>
                        {punchTemplates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      {profile
                        && profile.punchTemplateId === formData.punchTemplateId
                        && profile.punchTemplateVersion != null
                        && punchTemplates.find((template) => template.id === formData.punchTemplateId)?.version !== profile.punchTemplateVersion && (
                          <button
                            type="button"
                            onClick={() => setRepinPunchTemplate(true)}
                            className="mt-2 text-xs font-medium text-[var(--admin-blue)] hover:underline"
                          >
                            {repinPunchTemplate ? "Latest punch-template version will be used" : "Use latest punch-template version"}
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </section>
            </div>
            
            <div className="w-full md:w-80 bg-gray-50 p-6 flex flex-col items-center">
               <SafeZonePreview profile={formData} />
               <div className="mt-8 text-xs text-gray-500 leading-relaxed text-center">
                 Background artwork may enter the binding zone, trim, and bleed.
                 Critical content must remain inside the Safe Content area.
               </div>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--admin-blue)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {profile ? "Save Changes" : "Create Production Profile"}
          </button>
        </footer>
      </div>
    </>
  );
}

function ProductionProfileCard({ profile, onEdit }: { profile: ProductionProfile; onEdit: () => void }) {
  return (
    <article className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--admin-clay)]/10">
            <Square className="h-4 w-4 text-[var(--admin-clay)]" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-gray-900">{profile.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {profile.code}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">
                {profile.status}
              </span>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 capitalize">
                {profile.outputMedium}
              </span>
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 capitalize">
                {profile.bindingType.replace("_", "-")}
              </span>
            </div>
            <div className="mt-2 text-sm text-gray-500 flex gap-4">
              <span>{profile.finishedWidth ?? "?"} × {profile.finishedHeight ?? "?"} {profile.units}</span>
              {profile.bindingSafeZone !== null && <span>{profile.bindingSafeZone} {profile.units} Binding Safe</span>}
              {profile.punchTemplate && (
                <span>Template: {profile.punchTemplate.name} · pinned v{profile.punchTemplateVersion ?? profile.punchTemplate.version}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 opacity-0 transition-all hover:border-gray-300 hover:bg-gray-50 group-hover:opacity-100"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>
    </article>
  );
}

export default function ProductionProfiles() {
  const [drawerProfile, setDrawerProfile] = useState<ProductionProfile | null | undefined>(undefined);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["editorial-production-profiles"],
    queryFn: () => apiFetch<{ production_profiles: ProductionProfile[] }>("/v1/editorial/production-profiles"),
  });
  const profiles = data?.production_profiles ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Square className="h-5 w-5 text-[var(--admin-clay)]" /> Production Profiles
          </h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
            Define output geometry and safe areas separately from creative specs.
          </p>
        </div>
        <button
          onClick={() => setDrawerProfile(null)}
          className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--admin-blue)]"
        >
          <Plus className="h-4 w-4" /> New Profile
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : error ? (
          <div className="py-24 text-center text-sm text-red-500">Production profiles could not be loaded.</div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Square className="mb-4 h-10 w-10 text-[var(--admin-clay)]/60" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">No production profiles yet</h2>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-gray-500">
              Create reusable output sizes and safety zones for planners.
            </p>
            <button
              onClick={() => setDrawerProfile(null)}
              className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> Create First Profile
            </button>
          </div>
        ) : (
          <div className="max-w-4xl space-y-3">
            <p className="mb-4 text-xs text-gray-400">
              {profiles.length} production profile{profiles.length === 1 ? "" : "s"}
            </p>
            {profiles.map(p => (
              <ProductionProfileCard key={p.id} profile={p} onEdit={() => setDrawerProfile(p)} />
            ))}
          </div>
        )}
      </main>

      {drawerProfile !== undefined && (
        <ProductionProfileDrawer profile={drawerProfile} onClose={() => setDrawerProfile(undefined)} />
      )}
    </div>
  );
}
