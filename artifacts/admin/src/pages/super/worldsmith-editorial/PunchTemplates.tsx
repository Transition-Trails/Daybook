import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, Loader2, Plus, Save, X, Pencil } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PunchTemplate {
  id: string;
  name: string;
  code: string;
  bindingType: string;
  status: "draft" | "testing" | "approved" | "archived";
  discCount: number | null;
  referencePageHeight: number | null;
  units: "inches" | "millimeters";
  punchCenterSpacing: number | null;
  edgeOffset: number | null;
  mushroomHeadDiameter: number | null;
  stemWidth: number | null;
  stemDepth: number | null;
  topOffset: number | null;
  bottomOffset: number | null;
  manufacturingTolerance: number | null;
  version: number;
}

function PunchTemplateDrawer({
  template,
  onClose,
}: {
  template: PunchTemplate | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<Partial<PunchTemplate>>(
    template ?? {
      name: "",
      code: "",
      bindingType: "disc_bound",
      status: "draft",
      units: "inches",
      version: 1,
    }
  );

  const handleChange = (field: keyof PunchTemplate, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        name: formData.name?.trim(),
        code: formData.code?.trim(),
        discCount: formData.discCount ? Number(formData.discCount) : null,
        referencePageHeight: formData.referencePageHeight ? Number(formData.referencePageHeight) : null,
        punchCenterSpacing: formData.punchCenterSpacing ? Number(formData.punchCenterSpacing) : null,
        edgeOffset: formData.edgeOffset ? Number(formData.edgeOffset) : null,
        mushroomHeadDiameter: formData.mushroomHeadDiameter ? Number(formData.mushroomHeadDiameter) : null,
        stemWidth: formData.stemWidth ? Number(formData.stemWidth) : null,
        stemDepth: formData.stemDepth ? Number(formData.stemDepth) : null,
        topOffset: formData.topOffset ? Number(formData.topOffset) : null,
        bottomOffset: formData.bottomOffset ? Number(formData.bottomOffset) : null,
        manufacturingTolerance: formData.manufacturingTolerance ? Number(formData.manufacturingTolerance) : null,
      };

      if (template) {
        return apiFetch(`/v1/editorial/punch-templates/${template.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        return apiFetch("/v1/editorial/punch-templates", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-punch-templates"] });
      toast({ title: template ? "Punch template updated" : "Punch template created" });
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

  const canSave = formData.name?.trim() && formData.code?.trim() && !saveMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-[var(--admin-clay)]" />
            <h2 className="font-semibold text-gray-900">
              {template ? "Edit Punch Template" : "New Punch Template"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="templateName" className="mb-1.5 block text-sm font-medium text-gray-700">Template Name *</label>
              <input
                id="templateName"
                value={formData.name || ""}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g. 9-Disc Classic — v1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              />
            </div>
            <div>
              <label htmlFor="templateCode" className="mb-1.5 block text-sm font-medium text-gray-700">Template Code *</label>
              <input
                id="templateCode"
                value={formData.code || ""}
                onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                placeholder="e.g. PUNCH-9D-CLASSIC-V1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20 uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="bindingType" className="mb-1.5 block text-sm font-medium text-gray-700">Binding Type</label>
              <select
                id="bindingType"
                value={formData.bindingType}
                onChange={(e) => handleChange("bindingType", e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              >
                <option value="disc_bound">Disc-Bound</option>
              </select>
            </div>
            <div>
              <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => handleChange("status", e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              >
                <option value="draft">Draft</option>
                <option value="testing">Testing</option>
                <option value="approved">Approved</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label htmlFor="units" className="mb-1.5 block text-sm font-medium text-gray-700">Units</label>
              <select
                id="units"
                value={formData.units}
                onChange={(e) => handleChange("units", e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:ring-2 focus:ring-[var(--admin-clay)]/20"
              >
                <option value="inches">Inches</option>
                <option value="millimeters">Millimeters</option>
              </select>
            </div>
          </div>

          <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 mt-8">Page Compatibility</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="discCount" className="mb-1.5 block text-sm font-medium text-gray-700">Disc Count</label>
              <input
                id="discCount"
                type="number"
                value={formData.discCount ?? ""}
                onChange={(e) => handleChange("discCount", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="referencePageHeight" className="mb-1.5 block text-sm font-medium text-gray-700">Reference Page Height</label>
              <input
                id="referencePageHeight"
                type="number"
                step="0.01"
                value={formData.referencePageHeight ?? ""}
                onChange={(e) => handleChange("referencePageHeight", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
          </div>

          <h3 className="border-b border-gray-200 pb-2 text-sm font-semibold text-gray-900 mt-8">Punch Geometry</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="punchCenterSpacing" className="mb-1.5 block text-sm font-medium text-gray-700">Punch Center Spacing</label>
              <input
                id="punchCenterSpacing"
                type="number" step="0.001"
                value={formData.punchCenterSpacing ?? ""}
                onChange={(e) => handleChange("punchCenterSpacing", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="edgeOffset" className="mb-1.5 block text-sm font-medium text-gray-700">Edge Offset</label>
              <input
                id="edgeOffset"
                type="number" step="0.001"
                value={formData.edgeOffset ?? ""}
                onChange={(e) => handleChange("edgeOffset", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="mushroomHeadDiameter" className="mb-1.5 block text-sm font-medium text-gray-700">Mushroom Head Diameter</label>
              <input
                id="mushroomHeadDiameter"
                type="number" step="0.001"
                value={formData.mushroomHeadDiameter ?? ""}
                onChange={(e) => handleChange("mushroomHeadDiameter", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="stemWidth" className="mb-1.5 block text-sm font-medium text-gray-700">Stem Width</label>
              <input
                id="stemWidth"
                type="number" step="0.001"
                value={formData.stemWidth ?? ""}
                onChange={(e) => handleChange("stemWidth", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="stemDepth" className="mb-1.5 block text-sm font-medium text-gray-700">Stem Depth</label>
              <input
                id="stemDepth"
                type="number" step="0.001"
                value={formData.stemDepth ?? ""}
                onChange={(e) => handleChange("stemDepth", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="topOffset" className="mb-1.5 block text-sm font-medium text-gray-700">Top Offset</label>
              <input
                id="topOffset"
                type="number" step="0.001"
                value={formData.topOffset ?? ""}
                onChange={(e) => handleChange("topOffset", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="bottomOffset" className="mb-1.5 block text-sm font-medium text-gray-700">Bottom Offset</label>
              <input
                id="bottomOffset"
                type="number" step="0.001"
                value={formData.bottomOffset ?? ""}
                onChange={(e) => handleChange("bottomOffset", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
            <div>
              <label htmlFor="manufacturingTolerance" className="mb-1.5 block text-sm font-medium text-gray-700">Manufacturing Tolerance</label>
              <input
                id="manufacturingTolerance"
                type="number" step="0.001"
                value={formData.manufacturingTolerance ?? ""}
                onChange={(e) => handleChange("manufacturingTolerance", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
              />
            </div>
          </div>
          
          <div>
             <label htmlFor="version" className="mb-1.5 block text-sm font-medium text-gray-700">Version</label>
             <input
                id="version"
                type="number"
                value={formData.version ?? 1}
                onChange={(e) => handleChange("version", e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
             />
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
            {template ? "Save Changes" : "Create Punch Template"}
          </button>
        </footer>
      </div>
    </>
  );
}

function PunchTemplateCard({ template, onEdit }: { template: PunchTemplate; onEdit: () => void }) {
  return (
    <article className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-gray-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--admin-clay)]/10">
            <Circle className="h-4 w-4 text-[var(--admin-clay)]" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-gray-900">{template.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {template.code}
              </span>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 capitalize">
                {template.status}
              </span>
              <span className="text-xs text-gray-500">v{template.version}</span>
            </div>
            <div className="mt-2 text-sm text-gray-500 flex gap-4">
              <span>{template.discCount ?? "?"} Discs</span>
              <span>Ref Height: {template.referencePageHeight ?? "?"} {template.units}</span>
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

export default function PunchTemplates() {
  const [drawerTemplate, setDrawerTemplate] = useState<PunchTemplate | null | undefined>(undefined);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["editorial-punch-templates"],
    queryFn: () => apiFetch<{ punch_templates: PunchTemplate[] }>("/v1/editorial/punch-templates"),
  });
  const templates = data?.punch_templates ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Circle className="h-5 w-5 text-[var(--admin-clay)]" /> Punch Templates
          </h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
            Define physical punch geometry separately from page dimensions.
          </p>
        </div>
        <button
          onClick={() => setDrawerTemplate(null)}
          className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-3 py-2 text-sm text-white transition-colors hover:bg-[var(--admin-blue)]"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : error ? (
          <div className="py-24 text-center text-sm text-red-500">Punch templates could not be loaded.</div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Circle className="mb-4 h-10 w-10 text-[var(--admin-clay)]/60" />
            <h2 className="mb-2 text-lg font-semibold text-gray-900">No punch templates yet</h2>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-gray-500">
              Create reusable punch geometry templates that can be linked from any disc-bound Production Profile.
            </p>
            <button
              onClick={() => setDrawerTemplate(null)}
              className="flex items-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" /> Create First Template
            </button>
          </div>
        ) : (
          <div className="max-w-4xl space-y-3">
            <p className="mb-4 text-xs text-gray-400">
              {templates.length} punch template{templates.length === 1 ? "" : "s"}
            </p>
            {templates.map(t => (
              <PunchTemplateCard key={t.id} template={t} onEdit={() => setDrawerTemplate(t)} />
            ))}
          </div>
        )}
      </main>

      {drawerTemplate !== undefined && (
        <PunchTemplateDrawer template={drawerTemplate} onClose={() => setDrawerTemplate(undefined)} />
      )}
    </div>
  );
}
