/**
 * ImageTargets — platform-managed print dimensions for orientation-aware
 * WorldSmith components. Changes apply to subsequent image generations without
 * requiring a server deployment.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Ruler, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface ImageTarget {
  component_type: string;
  print_width_in: number | null;
  print_height_in: number | null;
  updated_at: string | null;
}

interface ImageTargetsResponse {
  image_targets: ImageTarget[];
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Not configured";
  return `Updated ${new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

export default function ImageTargets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, { width: string; height: string }>>({});
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ImageTargetsResponse>({
    queryKey: ["editorial-image-targets"],
    queryFn: () => apiFetch<ImageTargetsResponse>("/v1/editorial/image-targets"),
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(data.image_targets.map((target) => [
      target.component_type,
      {
        width: target.print_width_in === null ? "" : String(target.print_width_in),
        height: target.print_height_in === null ? "" : String(target.print_height_in),
      },
    ])));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (target: ImageTarget) => {
      const draft = drafts[target.component_type];
      return apiFetch<{ image_target: ImageTarget }>(
        `/v1/editorial/image-targets/${encodeURIComponent(target.component_type)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            print_width_in: Number(draft?.width),
            print_height_in: Number(draft?.height),
          }),
        },
      );
    },
    onSuccess: ({ image_target }) => {
      qc.setQueryData<ImageTargetsResponse>(["editorial-image-targets"], (current) => current
        ? {
            image_targets: current.image_targets.map((target) =>
              target.component_type === image_target.component_type ? image_target : target,
            ),
          }
        : current);
      toast({ title: "Print target saved", description: `${image_target.component_type} will use the new dimensions for future generations.` });
    },
    onError: (error) => {
      toast({
        title: "Could not save print target",
        description: error instanceof Error ? error.message : "Please check the dimensions and try again.",
        variant: "destructive",
      });
    },
  });

  const updateDraft = (componentType: string, field: "width" | "height", value: string) => {
    setDrafts((current) => ({
      ...current,
      [componentType]: { ...current[componentType], [field]: value },
    }));
  };

  return (
    <div className="h-full overflow-y-auto bg-[#FDFBF8]">
      <header className="border-b border-[#E8E0D6] bg-white px-8 py-7">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#C87560]">
                <Ruler className="h-4 w-4" />
                Generation configuration
              </div>
              <h1 className="font-serif text-3xl font-semibold text-[#1B2A4A]">Print targets</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Maintain the physical dimensions used to derive WorldSmith image targets.
                Changes are stored in the catalog and apply to new generations without a code deployment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[#DDD4C4] bg-white px-3 py-2 text-sm font-medium text-[#1B2A4A] shadow-sm transition hover:bg-[#F8F4EF] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-8">
        <div className="mb-5 rounded-xl border border-[#E8E0D6] bg-[#F8F4EF] px-5 py-4 text-sm text-[#4B5563]">
          <strong className="text-[#1B2A4A]">Why this matters:</strong>{" "}
          orientation-aware components must have an explicit catalog entry. A missing entry blocks generation instead of silently falling back to a square target.
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-gray-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading print targets…
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Could not load the print target catalog.{" "}
            <button type="button" className="font-semibold underline" onClick={() => refetch()}>Try again</button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#E8E0D6] bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_8rem_7rem] gap-4 border-b border-[#E8E0D6] bg-[#FBF8F4] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
              <span>Component type</span>
              <span>Width (in)</span>
              <span>Height (in)</span>
              <span>Status</span>
              <span className="text-right">Action</span>
            </div>
            {data?.image_targets.map((target) => {
              const draft = drafts[target.component_type] ?? { width: "", height: "" };
              const valid = Number(draft.width) > 0 && Number(draft.height) > 0;
              const saving = saveMutation.isPending && saveMutation.variables?.component_type === target.component_type;
              return (
                <div key={target.component_type} className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_8rem_7rem] items-center gap-4 border-b border-[#F0EBE5] px-5 py-4 last:border-b-0">
                  <div>
                    <p className="font-medium text-[#1B2A4A]">{target.component_type}</p>
                    <p className="mt-1 text-xs text-gray-400">Orientation-aware</p>
                  </div>
                  <label className="sr-only" htmlFor={`width-${target.component_type}`}>Width in inches for {target.component_type}</label>
                  <input
                    id={`width-${target.component_type}`}
                    type="number"
                    min="0.01"
                    max="1000"
                    step="0.01"
                    value={draft.width}
                    onChange={(event) => updateDraft(target.component_type, "width", event.target.value)}
                    className="w-full rounded-lg border border-[#DDD4C4] px-3 py-2 text-sm text-[#1B2A4A] outline-none focus:border-[#C87560] focus:ring-2 focus:ring-[#C87560]/20"
                  />
                  <label className="sr-only" htmlFor={`height-${target.component_type}`}>Height in inches for {target.component_type}</label>
                  <input
                    id={`height-${target.component_type}`}
                    type="number"
                    min="0.01"
                    max="1000"
                    step="0.01"
                    value={draft.height}
                    onChange={(event) => updateDraft(target.component_type, "height", event.target.value)}
                    className="w-full rounded-lg border border-[#DDD4C4] px-3 py-2 text-sm text-[#1B2A4A] outline-none focus:border-[#C87560] focus:ring-2 focus:ring-[#C87560]/20"
                  />
                  <span className={`text-xs font-medium ${target.print_width_in === null ? "text-amber-600" : "text-emerald-600"}`}>
                    {target.print_width_in === null ? "Missing" : formatUpdatedAt(target.updated_at)}
                  </span>
                  <button
                    type="button"
                    disabled={!valid || saving}
                    onClick={() => saveMutation.mutate(target)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#263C66] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}