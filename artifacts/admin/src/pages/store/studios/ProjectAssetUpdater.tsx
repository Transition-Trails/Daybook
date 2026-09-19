import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RefreshCw, Eye, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storePlannersApi, type PlannerProjectAsset } from "@/lib/api";

export function ProjectAssetUpdater({
  storeId,
  plannerId,
  asset,
}: {
  storeId: string;
  plannerId: string;
  asset: PlannerProjectAsset;
}) {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const { data: updateInfo, isLoading } = useQuery({
    queryKey: ["planner-project-asset-update", storeId, plannerId, asset.id],
    queryFn: () => storePlannersApi.worldsmithAssets.checkUpdate(storeId, plannerId, asset.id),
  });

  const replaceMutation = useMutation({
    mutationFn: () => storePlannersApi.worldsmithAssets.replace(storeId, plannerId, asset.id, { confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planner-project-assets", storeId, plannerId] });
      setWarning(null);
      setShowPreview(false);
    },
    onError: (err: any) => {
      if (err.code === "ASSET_MODIFIED") {
        setWarning("Asset was modified in the workspace. Are you sure you want to replace it?");
      } else {
        setWarning(err.message || "Failed to replace asset.");
      }
    },
  });

  const provenance = asset.worldId ? `WorldSmith / ${asset.componentType}` : "Unknown Source";

  return (
    <div className="pt-3 border-t border-border mt-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Provenance</p>
        <p className="text-xs">{provenance}</p>
        {asset.sourceAssetVersion && (
          <p className="text-[10px] text-muted-foreground">Version {asset.sourceAssetVersion}</p>
        )}
      </div>

      {isLoading ? (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" /> Checking for updates...
        </div>
      ) : updateInfo?.updateAvailable ? (
        <div className="bg-primary/10 border border-primary/20 rounded p-2 space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Update Available
          </p>
          <p className="text-[10px] text-muted-foreground">
            Version {updateInfo.latestVersion} is available (Current: {updateInfo.currentVersion}).
          </p>
          
          {showPreview ? (
            <div className="space-y-2">
              <div className="relative aspect-square rounded bg-muted border overflow-hidden">
                <img src={`/api/stores/${storeId}/planners/${plannerId}/worldsmith-assets/source/${asset.sourceAssetId}/render`} className="w-full h-full object-cover" alt="Preview" />
              </div>
              <div className="flex flex-col gap-1">
                <Button data-testid="button-replace-asset" size="sm" onClick={() => replaceMutation.mutate()} disabled={replaceMutation.isPending}>
                  {replaceMutation.isPending ? "Replacing..." : "Replace Asset"}
                </Button>
                <Button data-testid="button-keep-current" size="sm" variant="outline" onClick={() => setShowPreview(false)}>
                  Keep Current
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button data-testid="button-preview-update" size="sm" variant="outline" className="flex-1 text-[10px] h-7" onClick={() => setShowPreview(true)}>
                <Eye className="w-3 h-3 mr-1" /> Preview
              </Button>
            </div>
          )}

          {warning && (
            <div data-testid="text-asset-warning" className="text-[10px] text-destructive flex gap-1 mt-1 p-1 bg-destructive/10 rounded">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{warning}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Check className="w-3 h-3 text-green-600" /> Up to date
        </div>
      )}
    </div>
  );
}
