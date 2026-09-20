export type CanonGalleryImage = {
  url: string;
  name?: string;
  description?: string;
  role?: string;
};

export type CanonAssetImage = {
  id: string;
  objectPath?: string | null;
  role: string;
  approvalStatus?: string | null;
  canonicalStrength?: string | null;
  mimeType?: string | null;
};

export type CanonImageRecord = {
  id: string;
  worldId: string;
  name: string;
  portraitUrl?: string | null;
  imageUrls?: string[] | null;
  imageGallery?: CanonGalleryImage[] | null;
};

export type CanonImageReconciliation = {
  primaryUrl: string | null;
  imageGallery: Array<Required<Pick<CanonGalleryImage, "url">> & Omit<CanonGalleryImage, "url">>;
  imageUrls: string[];
  portraitUrl: string | null;
  assetRoles: Array<{ id: string; role: string }>;
  recordChanged: boolean;
  changedAssetIds: string[];
};

function validUrl(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function comparableGallery(images: CanonGalleryImage[]) {
  return images.map(image => ({
    url: image.url,
    name: image.name ?? "",
    description: image.description ?? "",
    role: image.role ?? "reference",
  }));
}

function eligibleCanonAsset(asset: CanonAssetImage): boolean {
  const approval = String(asset.approvalStatus ?? "").toLowerCase().replace(/-/g, "_");
  const strength = String(asset.canonicalStrength ?? "canonical").toLowerCase();
  const mimeType = String(asset.mimeType ?? "").toLowerCase();
  return ["approved", "accepted", "canon", "editor_approved"].includes(approval)
    && ["canonical", "reference", "defining", "locked"].includes(strength)
    && (!mimeType || mimeType.startsWith("image/"))
    && validUrl(asset.objectPath);
}

export function reconcileCanonImageRoles(
  record: CanonImageRecord,
  assets: CanonAssetImage[],
): CanonImageReconciliation {
  const gallery = (Array.isArray(record.imageGallery) ? record.imageGallery : [])
    .filter((image): image is CanonGalleryImage => !!image && validUrl(image.url))
    .map(image => ({ ...image, url: image.url.trim() }));
  const legacyUrls = (Array.isArray(record.imageUrls) ? record.imageUrls : [])
    .filter(validUrl)
    .map(url => url.trim());
  const portraitUrl = validUrl(record.portraitUrl) ? record.portraitUrl.trim() : null;
  const eligibleAssets = [...assets]
    .filter(eligibleCanonAsset)
    .sort((a, b) => a.id.localeCompare(b.id));

  const primaryUrl = gallery[0]?.url
    ?? portraitUrl
    ?? legacyUrls[0]
    ?? eligibleAssets[0]?.objectPath?.trim()
    ?? null;

  const sourceGallery = gallery.length
    ? gallery
    : legacyUrls.length
      ? legacyUrls.map(url => ({
          url,
          name: "",
          description: "",
          role: "reference",
        }))
      : primaryUrl
        ? [{
            url: primaryUrl,
            name: "",
            description: "",
            role: "primary",
          }]
        : [];
  const imageGallery = sourceGallery.map((image, index) => ({
    ...image,
    name: image.name ?? "",
    description: image.description ?? "",
    role: index === 0 ? "primary" : image.role === "primary" ? "reference" : image.role ?? "reference",
  }));
  const imageUrls = imageGallery.map(image => image.url);

  const matchingAsset = primaryUrl
    ? eligibleAssets.find(asset => asset.objectPath?.trim() === primaryUrl)
    : undefined;
  const primaryAssetId = matchingAsset?.id;
  const assetRoles = assets.map(asset => ({
    id: asset.id,
    role: !eligibleCanonAsset(asset)
      ? asset.role
      : asset.id === primaryAssetId
      ? "primary"
      : asset.role.trim().toLowerCase().replace(/[\s-]+/g, "_") === "primary"
        ? "reference"
        : asset.role,
  }));
  const changedAssetIds = assetRoles
    .filter(next => assets.find(asset => asset.id === next.id)?.role !== next.role)
    .map(asset => asset.id);

  const currentGallery = comparableGallery(
    (Array.isArray(record.imageGallery) ? record.imageGallery : [])
      .filter((image): image is CanonGalleryImage => !!image && validUrl(image.url)),
  );
  const recordChanged = JSON.stringify(currentGallery) !== JSON.stringify(comparableGallery(imageGallery))
    || JSON.stringify(Array.isArray(record.imageUrls) ? record.imageUrls : []) !== JSON.stringify(imageUrls)
    || (record.portraitUrl ?? null) !== primaryUrl;

  return {
    primaryUrl,
    imageGallery,
    imageUrls,
    portraitUrl: primaryUrl,
    assetRoles,
    recordChanged,
    changedAssetIds,
  };
}