import type { ActorContext } from "./roles";

type ScopedCatalogAsset = {
  authoredByStoreId: string | null;
  status?: string | null;
};

export function canPreviewCatalogAsset(
  actor: ActorContext,
  asset: ScopedCatalogAsset,
): boolean {
  if (actor.isSuperAdmin) return true;
  if (asset.authoredByStoreId) {
    return asset.authoredByStoreId === actor.storeId
      && ["store_owner", "store_staff"].includes(actor.storeRole ?? "");
  }
  return asset.status === "live";
}