/**
 * Typed fetch helpers for the multi-tenant platform API.
 * All calls use session cookies (credentials: 'include') and
 * the standard /api prefix routed by the Replit path proxy.
 */

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body?.error ?? `HTTP ${res.status}`) as Error & {
      code?: string;
      status?: number;
    };
    // Preserve structured API failure metadata for contextual recovery UI.
    error.code = typeof body?.code === "string" ? body.code : undefined;
    error.status = res.status;
    throw error;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// apiFetch variant for DELETE calls that may return 409 with structured body.
// On 409, attaches affectedEditions to the thrown error.
async function apiFetchDelete(path: string, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(`/api${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...headers },
  });
  if (res.ok || res.status === 204) return;
  const body = await res.json().catch(() => ({}));
  const err = new Error(body?.error ?? `HTTP ${res.status}`) as Error & {
    affectedEditions?: { id: string; name: string }[];
  };
  if (res.status === 409) err.affectedEditions = body.affectedEditions ?? [];
  throw err;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type StoreStatus  = "active" | "trial" | "suspended";
export type StorePlan    = "starter" | "pro";
export type StoreRole    = "store_owner" | "store_staff" | "support" | "customer";
export type DefaultMode  = "curated" | "independent";
export type ItemOrigin   = "starter" | "licensed" | "owned";
export type EntitlementStatus = "entitled" | "gated-license-lapsed" | "not-yours";

export interface Store {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  ownerUserId: string;
  plan: StorePlan;
  status: StoreStatus;
  defaultMode: DefaultMode;
  subscriptionActive: boolean;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

/** Returned by GET /me/stores for store members (partial shape — no slug/domain) */
export interface MeStore {
  storeId?: string;  // set for store members
  id?: string;       // set for super_admin (full Store shape)
  name: string;
  status: StoreStatus;
  plan: StorePlan;
  role: StoreRole | "super_admin";
}

export interface StoreWithRole extends Store {
  role: StoreRole | "super_admin";
  /** alias populated for member rows from /me/stores */
  storeId?: string;
}

/** Resolves the canonical store ID regardless of which shape /me/stores returned */
export function resolveStoreId(store: MeStore | StoreWithRole): string {
  return (store as StoreWithRole).storeId ?? (store as Store).id ?? "";
}

export interface StoreMember {
  id: number;
  storeId: string;
  userId: string;
  role: StoreRole;
  createdAt: string;
}

export interface StoreFlags {
  storeId: string;
  aiEnabled: boolean;
  customDomain: boolean;
  editionsCap: number;
  storageQuota: number;
  inkEnabled: boolean;
  worldsmithEnabled: boolean;
}

export interface StoreCatalogEntry {
  id: number;
  storeId: string;
  itemType: string;
  itemId: string;
  origin: ItemOrigin;
  entitlementStatus: EntitlementStatus;
  createdAt: string;
}

export interface CatalogItemWithOrigin extends CatalogItem {
  origin: ItemOrigin;
  authoredByStoreId: string | null;
}

export interface PlatformStats {
  stores: { total: number; active: number; byStatus: Record<string, number> };
  users: { total: number };
  planners: { total: number };
  mrr: { amountUsd: number; note: string };
}

export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  category: string;
  kind: "article" | "faq";
  scope: string;
  status: "live" | "draft";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: number;
  actorUserId: string;
  actorRole: string;
  scope: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  status: string;
  globalAvailable: boolean;
  digitalPriceCents?: number | null;
  purchasable?: boolean;
  origin?: ItemOrigin;
  authoredByStoreId?: string | null;
  [key: string]: unknown;
}

// ── Platform endpoints ──────────────────────────────────────────────────────

export const platformApi = {
  stats: () => apiFetch<PlatformStats>("/platform/stats"),
  audit: (params?: { storeId?: string; action?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.storeId) q.set("storeId", params.storeId);
    if (params?.action) q.set("action", params.action);
    if (params?.limit) q.set("limit", String(params.limit));
    return apiFetch<AuditEntry[]>(`/audit${q.size ? `?${q}` : ""}`);
  },
  stickers: (params?: { q?: string; origin?: string; functionType?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.q)            q.set("q", params.q);
    if (params?.origin)       q.set("origin", params.origin);
    if (params?.functionType) q.set("functionType", params.functionType);
    if (params?.status)       q.set("status", params.status);
    return apiFetch<(LibrarySticker & { authoredByStoreId: string | null })[]>(
      `/platform/stickers${q.size ? `?${q}` : ""}`,
    );
  },
};

// ── Platform sticker authoring endpoints (super_admin) ──────────────────────

export interface PlatformStickerPack {
  id: string;
  name: string;
  origin: string;
  status: string;
  price?: number | null;
  tags?: string[];
  coverImage?: string | null;
  /** Up to 4 member sticker images ordered by position — for fanned cluster display. */
  memberImages?: string[];
}

export interface StickerShapeRecipe {
  id: string;
  origin: "starter" | "owned";
  authoredByStoreId: string | null;
  name: string;
  slug: string;
  functionType: StickerFunctionType;
  svgTemplate: string;
  aspectRatio: number;
  defaultSizeMm: number;
  takesLabel: boolean;
  status: "draft" | "live";
  createdAt: string;
  updatedAt: string;
}

export type StickerShapeRecipeInput = Omit<
  StickerShapeRecipe,
  "id" | "origin" | "authoredByStoreId" | "createdAt" | "updatedAt"
>;

export const shapeRecipesApi = {
  listPlatform: () =>
    apiFetch<StickerShapeRecipe[]>("/platform/sticker-shape-recipes"),
  createPlatform: (data: StickerShapeRecipeInput) =>
    apiFetch<StickerShapeRecipe>("/platform/sticker-shape-recipes", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePlatform: (id: string, data: StickerShapeRecipeInput) =>
    apiFetch<StickerShapeRecipe>(`/platform/sticker-shape-recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  previewPlatform: (data: StickerShapeRecipeInput & {
    label?: string;
    paletteColors?: string[];
  }) =>
    apiFetch<{ processedImageData: string; cutlineSvg: string }>(
      "/platform/sticker-shape-recipes/preview",
      { method: "POST", body: JSON.stringify(data) },
    ),
  listStore: (storeId: string) =>
    apiFetch<StickerShapeRecipe[]>(`/stores/${storeId}/sticker-shape-recipes`, {
      headers: { "x-store-id": storeId },
    }),
  createStore: (storeId: string, data: StickerShapeRecipeInput) =>
    apiFetch<StickerShapeRecipe>(`/stores/${storeId}/sticker-shape-recipes`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),
  copyStore: (storeId: string, id: string) =>
    apiFetch<StickerShapeRecipe>(`/stores/${storeId}/sticker-shape-recipes/${id}/copy`, {
      method: "POST",
      headers: { "x-store-id": storeId },
    }),
  updateStore: (storeId: string, id: string, data: StickerShapeRecipeInput) =>
    apiFetch<StickerShapeRecipe>(`/stores/${storeId}/sticker-shape-recipes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),
  previewStore: (storeId: string, data: StickerShapeRecipeInput & {
    label?: string;
    paletteColors?: string[];
  }) =>
    apiFetch<{ processedImageData: string; cutlineSvg: string }>(
      `/stores/${storeId}/sticker-shape-recipes/preview`,
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      },
    ),
  render: (storeId: string, data: {
    recipeId: string;
    label?: string;
    paletteColors?: string[];
    sizeInMm?: number;
    name?: string;
    packId?: string;
  }) =>
    apiFetch<{ sticker: LibrarySticker; processedImageData: string; cutlineSvg: string; recipeId: string }>(
      `/stores/${storeId}/stickers/render/from-recipe`,
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      },
    ),
};

export const platformStickersApi = {
  create: (data: {
    name: string;
    tags?: string[];
    functionType: string;
    imageBase64: string;
    borderStyle?: string;
    /** Legacy 96-DPI pixel value, accepted for existing records only. */
    borderWidth?: number;
    borderWidthMm?: number;
    borderColor?: string;
    sizeInMm?: number;
    exportTargets?: StickerExportTargets;
    status?: "draft" | "live";
  }) =>
    apiFetch<LibrarySticker>("/platform/stickers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      name?: string;
      tags?: string[];
      functionType?: string;
      imageBase64?: string;
      borderStyle?: string;
      /** Legacy 96-DPI pixel value, accepted for existing records only. */
      borderWidth?: number | null;
      borderWidthMm?: number | null;
      borderColor?: string | null;
      sizeInMm?: number | null;
      exportTargets?: StickerExportTargets;
      status?: "draft" | "live";
    },
  ) =>
    apiFetch<LibrarySticker>(`/platform/stickers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  get: (id: string) =>
    apiFetch<LibrarySticker & { packs: { packId: string; position: number }[] }>(
      `/platform/stickers/${id}`,
    ),

  duplicate: (id: string) =>
    apiFetch<LibrarySticker>(`/platform/stickers/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  usage: (id: string) =>
    apiFetch<StickerUsage>(`/platform/stickers/${id}/usage`),

  /** Raw delete — caller must handle 409 affectedPacks themselves. */
  deleteRaw: (id: string, force = false): Promise<Response> =>
    fetch(`/api/platform/stickers/${id}${force ? "?force=true" : ""}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }),

  listPacks: () =>
    apiFetch<PlatformStickerPack[]>("/platform/sticker-packs"),

  bulkSetFunctionType: (ids: string[], functionType: string) =>
    apiFetch<BulkResult>("/platform/stickers/bulk/function-type", {
      method: "POST",
      body: JSON.stringify({ ids, functionType }),
    }),

  bulkAddToPack: (ids: string[], packId: string) =>
    apiFetch<BulkResult>("/platform/stickers/bulk/add-to-pack", {
      method: "POST",
      body: JSON.stringify({ ids, packId }),
    }),

  bulkPublish: (ids: string[], publish: boolean) =>
    apiFetch<BulkResult>("/platform/stickers/bulk/publish", {
      method: "POST",
      body: JSON.stringify({ ids, publish }),
    }),

  bulkDelete: (ids: string[]) =>
    apiFetch<BulkResult>("/platform/stickers/bulk", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    }),

  /** Generate a labelled set of transparent PNGs server-side (no DB write). */
  generateSet: (data: {
    setType:      string;
    labelStyle:   string;
    fontKey:      string;
    color:        string;
    sizeInMm?:    number | null;
    borderStyle?: string;
    borderWidth?: number | null;
    borderWidthMm?: number | null;
    borderColor?: string | null;
    shadowStyle?: string;
  }) =>
    apiFetch<{ items: Array<{ name: string; imageBase64: string }> }>(
      "/platform/stickers/generate-set",
      { method: "POST", body: JSON.stringify(data) },
    ),

  /** Save a batch of pre-processed images directly to stickers_library (no pipeline). */
  batchCreate: (data: {
    items:        Array<{ name: string; imageBase64: string }>;
    functionType: string;
    sizeInMm?:    number | null;
    status?:      "draft" | "live";
    /** Shared set identifier stamped on every row — enables DB-level grouping. */
    setId?:       string | null;
  }) =>
    apiFetch<{ created: number; stickers: LibrarySticker[] }>(
      "/platform/stickers/batch",
      { method: "POST", body: JSON.stringify(data) },
    ),

  /** Create a new platform sticker pack in-studio. */
  createPack: (data: {
    name:        string;
    price?:      number | null;
    tags?:       string[];
    stickerIds?: string[];
    status?:     "draft" | "live";
  }) =>
    apiFetch<PlatformStickerPack>(
      "/platform/sticker-packs",
      { method: "POST", body: JSON.stringify(data) },
    ),
};

// ── Me endpoints ────────────────────────────────────────────────────────────

export const meApi = {
  stores: () => apiFetch<StoreWithRole[]>("/me/stores"),
};

// ── Store endpoints ─────────────────────────────────────────────────────────

export const storesApi = {
  list: () => apiFetch<Store[]>("/stores"),
  create: (data: Partial<Store>) =>
    apiFetch<Store>("/stores", { method: "POST", body: JSON.stringify(data) }),
  update: (storeId: string, data: Partial<Store>, xStoreId?: string) =>
    apiFetch<Store>(`/stores/${storeId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: xStoreId ? { "x-store-id": xStoreId } : {},
    }),
  get: (storeId: string) => apiFetch<Store & { flags: StoreFlags; memberCount: number }>(`/stores/${storeId}`),

  members: {
    list: (storeId: string) =>
      apiFetch<StoreMember[]>(`/stores/${storeId}/members`, {
        headers: { "x-store-id": storeId },
      }),
    add: (storeId: string, data: { userId: string; role: StoreRole }) =>
      apiFetch<StoreMember>(`/stores/${storeId}/members`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    remove: (storeId: string, userId: string) =>
      apiFetch<void>(`/stores/${storeId}/members/${userId}`, {
        method: "DELETE",
        headers: { "x-store-id": storeId },
      }),
  },

  catalog: {
    list: (storeId: string) =>
      apiFetch<StoreCatalogEntry[]>(`/stores/${storeId}/catalog`, {
        headers: { "x-store-id": storeId },
      }),
    enable: (storeId: string, itemType: string, itemId: string) =>
      apiFetch<StoreCatalogEntry>(`/stores/${storeId}/catalog`, {
        method: "POST",
        body: JSON.stringify({ itemType, itemId }),
        headers: { "x-store-id": storeId },
      }),
    disable: (storeId: string, itemType: string, itemId: string) =>
      apiFetch<void>(`/stores/${storeId}/catalog/${itemType}/${itemId}`, {
        method: "DELETE",
        headers: { "x-store-id": storeId },
      }),
  },

  flags: {
    get: (storeId: string) => apiFetch<StoreFlags>(`/stores/${storeId}/flags`),
    update: (storeId: string, data: Partial<StoreFlags>) =>
      apiFetch<StoreFlags>(`/stores/${storeId}/flags`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },

  entitlement: {
    update: (storeId: string, data: { subscriptionActive?: boolean; defaultMode?: DefaultMode }) =>
      apiFetch<{ id: string; subscriptionActive: boolean; defaultMode: DefaultMode }>(
        `/stores/${storeId}/entitlement`,
        { method: "PATCH", body: JSON.stringify(data) },
      ),
  },
};

/**
 * Shared React Query options for the store flags endpoint.
 *
 * - Adds an 8 s AbortController to the fetch so a hung network call never
 *   blocks indefinitely.
 * - retry: 1 / retryDelay: 1 000 ms — one quiet retry before surfacing an
 *   error to the UI.
 * - staleTime: 60 s — avoids redundant re-fetches within a session.
 *
 * Both StoreAdminShell and StoreStudioLoader use this same options object so
 * React Query deduplicates the request and shares the cached result.
 */
export function flagsQueryOptions(storeId: string) {
  return {
    queryKey: ["store-flags", storeId] as const,
    queryFn: (): Promise<StoreFlags> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      return apiFetch<StoreFlags>(`/stores/${storeId}/flags`, {
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    },
    staleTime: 60_000,
    retry: 1,
    retryDelay: 1_000,
  };
}

// ── Help endpoints ──────────────────────────────────────────────────────────

export const inkApi = {
  /**
   * Check whether Ink is enabled for the current user.
   * Pass storeSlug when calling from a shop route so the flag is checked
   * against that specific store (for buyers who aren't store members).
   */
  enabled: (storeSlug?: string) =>
    apiFetch<{ enabled: boolean }>(
      `/ink/enabled${storeSlug ? `?storeSlug=${encodeURIComponent(storeSlug)}` : ""}`,
    ),
};

export const helpApi = {
  list: (params?: { scope?: string; kind?: string }) => {
    const q = new URLSearchParams();
    if (params?.scope) q.set("scope", params.scope);
    if (params?.kind) q.set("kind", params.kind);
    return apiFetch<HelpArticle[]>(`/help${q.size ? `?${q}` : ""}`);
  },
  create: (data: Partial<HelpArticle>) =>
    apiFetch<HelpArticle>("/help", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<HelpArticle>) =>
    apiFetch<HelpArticle>(`/help/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiFetch<void>(`/help/${id}`, { method: "DELETE" }),
};

// ── Store Studios API (store-scoped owned catalog creation + management) ─────

export interface AttachableItems {
  themes: CatalogItem[];
  packs: CatalogItem[];
  inserts: CatalogItem[];
  products: CatalogItem[];
  editions: CatalogItem[];
}

/** A palette as returned by the API (platform catalog or owned) */
export interface OwnedPalette {
  id: string;
  name: string;
  colors: string[];
  status: string;
  origin: ItemOrigin;
  authoredByStoreId: string | null;
  globalAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A background as returned by the API */
export interface OwnedBackground {
  id: string;
  name: string;
  type: "color" | "texture" | "image";
  assetRef: string | null;
  status: string;
  origin: ItemOrigin;
  authoredByStoreId: string | null;
  globalAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** An owned theme as returned by GET /stores/:storeId/owned */
export interface OwnedTheme {
  id: string;
  name: string;
  desc: string | null;
  colors: string[];
  price: number;
  status: string;
  origin: "owned";
  authoredByStoreId: string;
  fontPairing?: { heading?: string; subheading?: string; body?: string; accent?: string } | null;
  createdAt: string;
  updatedAt: string;
  /** Palettes linked to this theme — present when fetched with palette join */
  palettes?: OwnedPalette[];
}

/** An owned sticker pack as returned by GET /stores/:storeId/owned */
export interface OwnedPack {
  id: string;
  name: string;
  tags: string[];
  price: number;
  coverDriveFileId?: string | null;
  status: string;
  origin: "owned";
  authoredByStoreId: string;
  createdAt: string;
  updatedAt: string;
}

/** An owned edition as returned by GET /stores/:storeId/owned */
export interface OwnedEdition {
  id: string;
  name: string;
  status: string;
  sections: string[];
  priceLow: number | null;
  priceHigh: number | null;
  themes: string[];
  packs: string[];
  inserts: string[];
  products: string[];
  origin: "owned";
  authoredByStoreId: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** Grouped response from GET /stores/:storeId/owned */
export interface OwnedList {
  themes: OwnedTheme[];
  packs: OwnedPack[];
  inserts: Array<{ id: string; name: string; status: string; origin: "owned"; authoredByStoreId: string; createdAt: string; updatedAt: string; [key: string]: unknown }>;
  editions: OwnedEdition[];
  palettes?: OwnedPalette[];
  backgrounds?: OwnedBackground[];
}

export const storeStudiosApi = {
  /** List all non-deleted owned items for the store, grouped by type. */
  list: (storeId: string) =>
    apiFetch<OwnedList>(`/stores/${storeId}/owned`, {
      headers: { "x-store-id": storeId },
    }),

  themes: {
    create: (
      storeId: string,
      data: { name: string; description?: string; colors: string[]; status: "draft" | "live" },
    ) =>
      apiFetch<CatalogItem>(`/stores/${storeId}/owned/themes`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    update: (
      storeId: string,
      id: string,
      data: { name?: string; description?: string; colors?: string[]; status?: "draft" | "live" },
    ) =>
      apiFetch<CatalogItem>(`/stores/${storeId}/owned/themes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    /** DELETE — throws with affectedEditions on 409 conflict */
    delete: (storeId: string, id: string, force = false) =>
      apiFetchDelete(
        `/stores/${storeId}/owned/themes/${id}${force ? "?force=true" : ""}`,
        { "x-store-id": storeId },
      ),
  },

  packs: {
    create: (
      storeId: string,
      data: {
        name: string; tags?: string[]; price?: number; coverDriveFileId?: string | null;
        stickerIds?: string[]; status: "draft" | "live";
      },
    ) =>
      apiFetch<CatalogItem>(`/stores/${storeId}/owned/sticker-packs`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    update: (
      storeId: string,
      id: string,
      data: {
        name?: string; tags?: string[]; price?: number; coverDriveFileId?: string | null;
        stickerIds?: string[]; status?: "draft" | "live";
      },
    ) =>
      apiFetch<CatalogItem>(`/stores/${storeId}/owned/sticker-packs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    /** DELETE — throws with affectedEditions on 409 conflict */
    delete: (storeId: string, id: string, force = false) =>
      apiFetchDelete(
        `/stores/${storeId}/owned/sticker-packs/${id}${force ? "?force=true" : ""}`,
        { "x-store-id": storeId },
      ),
  },

  inserts: {
    update: (
      storeId: string,
      id: string,
      data: { name?: string; status?: "draft" | "live" },
    ) =>
      apiFetch<CatalogItem>(`/stores/${storeId}/owned/inserts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    /** DELETE — throws with affectedEditions on 409 conflict */
    delete: (storeId: string, id: string, force = false) =>
      apiFetchDelete(
        `/stores/${storeId}/owned/inserts/${id}${force ? "?force=true" : ""}`,
        { "x-store-id": storeId },
      ),
  },

  palettes: {
    list: (storeId: string) =>
      apiFetch<OwnedPalette[]>(`/stores/${storeId}/owned/palettes`, {
        headers: { "x-store-id": storeId },
      }),
    create: (storeId: string, data: { name: string; colors: string[]; status?: "draft" | "live" }) =>
      apiFetch<OwnedPalette>(`/stores/${storeId}/owned/palettes`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    update: (storeId: string, id: string, data: { name?: string; colors?: string[]; status?: "draft" | "live" }) =>
      apiFetch<OwnedPalette>(`/stores/${storeId}/owned/palettes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    delete: (storeId: string, id: string) =>
      apiFetchDelete(`/stores/${storeId}/owned/palettes/${id}`, { "x-store-id": storeId }),
    /** Replace the full palette list for a theme (ordered by position) */
    setForTheme: (storeId: string, themeId: string, paletteIds: string[]) =>
      apiFetch<{ count: number }>(`/stores/${storeId}/owned/themes/${themeId}/palettes`, {
        method: "PUT",
        body: JSON.stringify({ paletteIds }),
        headers: { "x-store-id": storeId },
      }),
    /** Get palettes linked to a theme */
    getForTheme: (storeId: string, themeId: string) =>
      apiFetch<OwnedPalette[]>(`/stores/${storeId}/owned/themes/${themeId}/palettes`, {
        headers: { "x-store-id": storeId },
      }),
  },

  backgrounds: {
    list: (storeId: string) =>
      apiFetch<OwnedBackground[]>(`/stores/${storeId}/owned/backgrounds`, {
        headers: { "x-store-id": storeId },
      }),
    create: (storeId: string, data: { name: string; type?: "color" | "texture" | "image"; assetRef?: string; status?: "draft" | "live" }) =>
      apiFetch<OwnedBackground>(`/stores/${storeId}/owned/backgrounds`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    update: (storeId: string, id: string, data: { name?: string; type?: "color" | "texture" | "image"; assetRef?: string | null; status?: "draft" | "live" }) =>
      apiFetch<OwnedBackground>(`/stores/${storeId}/owned/backgrounds/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    delete: (storeId: string, id: string) =>
      apiFetchDelete(`/stores/${storeId}/owned/backgrounds/${id}`, { "x-store-id": storeId }),
    setForTheme: (storeId: string, themeId: string, backgroundIds: string[]) =>
      apiFetch<{ count: number }>(`/stores/${storeId}/owned/themes/${themeId}/backgrounds`, {
        method: "PUT",
        body: JSON.stringify({ backgroundIds }),
        headers: { "x-store-id": storeId },
      }),
    /** Get backgrounds currently linked to a theme */
    getForTheme: (storeId: string, themeId: string) =>
      apiFetch<OwnedBackground[]>(`/stores/${storeId}/owned/themes/${themeId}/backgrounds`, {
        headers: { "x-store-id": storeId },
      }),
    /** Generate an AI background image. When saveToStore=true, inserts a background row. */
    generate: (
      storeId: string,
      data: {
        brief: string;
        name: string;
        backgroundType?: "texture" | "image";
        saveToStore: boolean;
      },
    ) =>
      apiFetch<{ expandedPrompt: string; assetRef: string; savedId: string | null }>(
        `/stores/${storeId}/backgrounds/generate`,
        { method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId } },
      ),
  },

  editions: {
    create: (
      storeId: string,
      data: {
        name: string;
        description?: string;
        sections?: string[];
        priceLow?: number;
        priceHigh?: number;
        digitalPriceCents?: number;
        themeIds?: string[];
        packIds?: string[];
        insertIds?: string[];
        productIds?: string[];
        palette?: string[];
      },
    ) =>
      apiFetch<CatalogItem & { autoThemeId?: string }>(`/stores/${storeId}/owned/editions`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    update: (
      storeId: string,
      id: string,
      data: {
        name?: string;
        sections?: string[];
        priceLow?: number;
        priceHigh?: number;
        digitalPriceCents?: number;
        themeIds?: string[];
        packIds?: string[];
        insertIds?: string[];
        productIds?: string[];
        status?: "draft" | "live";
      },
    ) =>
      apiFetch<CatalogItem>(`/stores/${storeId}/owned/editions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "x-store-id": storeId },
      }),
    delete: (storeId: string, id: string) =>
      apiFetchDelete(`/stores/${storeId}/owned/editions/${id}`, { "x-store-id": storeId }),
  },

  attachable: (storeId: string) =>
    apiFetch<AttachableItems>(`/stores/${storeId}/owned/attachable`, {
      headers: { "x-store-id": storeId },
    }),
};

// ── Sticker Library ─────────────────────────────────────────────────────────

export const STICKER_FUNCTION_TYPES = [
  "checkbox",
  "flag",
  "habit",
  "time-block",
  "tab",
  "date",
  "banner",
  "decorative",
] as const;

export type StickerFunctionType = (typeof STICKER_FUNCTION_TYPES)[number];

export interface StickerExportTargets {
  goodnotes: boolean;
  ink: boolean;
  cricut: boolean;
}

/** A sticker from the library (GET /stores/:storeId/stickers) */
export interface LibrarySticker {
  id: string;
  name: string;
  tags: string[];
  functionType: string;
  status: string;
  origin: ItemOrigin;
  authoredByStoreId: string | null;
  borderStyle: string;
  /** Legacy 96-DPI pixel value. New records use borderWidthMm. */
  borderWidth: number | null;
  borderWidthMm: number | null;
  borderColor: string | null;
  sizeInMm: number | null;
  exportTargets: StickerExportTargets;
  processedImageData: string | null;
  cutlineSvg: string | null;
  /** Stable group identifier shared by every member of a generated set. Null for hand-uploaded stickers. */
  setId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Attached pack count — present in list responses */
  packCount?: number;
}

export interface StickerUsage {
  stickerId: string;
  packs: { packId: string; packName: string | null; packStatus: string | null; position: number }[];
  editions: { editionId: string; editionName: string; packId: string }[];
}

export interface BulkResult {
  updated?: number;
  deleted?: number;
  added?: number;
  skipped: number;
}

export const stickersApi = {
  list: (
    storeId: string,
    params?: { q?: string; functionType?: string; scope?: string },
  ) => {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.functionType) q.set("functionType", params.functionType);
    if (params?.scope) q.set("scope", params.scope);
    return apiFetch<LibrarySticker[]>(
      `/stores/${storeId}/stickers${q.size ? `?${q}` : ""}`,
      { headers: { "x-store-id": storeId } },
    );
  },

  get: (storeId: string, id: string) =>
    apiFetch<LibrarySticker & { packs: { packId: string; position: number }[] }>(
      `/stores/${storeId}/stickers/${id}`,
      { headers: { "x-store-id": storeId } },
    ),

  create: (
    storeId: string,
    data: {
      name: string;
      tags?: string[];
      functionType: string;
      imageBase64: string;
      borderStyle?: string;
      /** Legacy 96-DPI pixel value, accepted for existing records only. */
      borderWidth?: number;
      borderWidthMm?: number;
      borderColor?: string;
      sizeInMm?: number;
      exportTargets?: StickerExportTargets;
      status?: "draft" | "live";
    },
  ) =>
    apiFetch<LibrarySticker>(`/stores/${storeId}/stickers`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  update: (
    storeId: string,
    id: string,
    data: {
      name?: string;
      tags?: string[];
      functionType?: string;
      imageBase64?: string;
      borderStyle?: string;
      /** Legacy 96-DPI pixel value, accepted for existing records only. */
      borderWidth?: number | null;
      borderWidthMm?: number | null;
      borderColor?: string | null;
      sizeInMm?: number | null;
      exportTargets?: StickerExportTargets;
      status?: "draft" | "live";
    },
  ) =>
    apiFetch<LibrarySticker>(`/stores/${storeId}/stickers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  duplicate: (storeId: string, id: string) =>
    apiFetch<LibrarySticker>(`/stores/${storeId}/stickers/${id}/duplicate`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "x-store-id": storeId },
    }),

  usage: (storeId: string, id: string) =>
    apiFetch<StickerUsage>(`/stores/${storeId}/stickers/${id}/usage`, {
      headers: { "x-store-id": storeId },
    }),

  delete: (storeId: string, id: string, force = false) =>
    apiFetchDelete(
      `/stores/${storeId}/stickers/${id}${force ? "?force=true" : ""}`,
      { "x-store-id": storeId },
    ),

  bulkSetFunctionType: (storeId: string, ids: string[], functionType: string) =>
    apiFetch<BulkResult>(`/stores/${storeId}/stickers/bulk/function-type`, {
      method: "POST",
      body: JSON.stringify({ ids, functionType }),
      headers: { "x-store-id": storeId },
    }),

  bulkAddToPack: (storeId: string, ids: string[], packId: string) =>
    apiFetch<BulkResult>(`/stores/${storeId}/stickers/bulk/add-to-pack`, {
      method: "POST",
      body: JSON.stringify({ ids, packId }),
      headers: { "x-store-id": storeId },
    }),

  bulkPublish: (storeId: string, ids: string[], publish: boolean) =>
    apiFetch<BulkResult>(`/stores/${storeId}/stickers/bulk/publish`, {
      method: "POST",
      body: JSON.stringify({ ids, publish }),
      headers: { "x-store-id": storeId },
    }),

  bulkDelete: (storeId: string, ids: string[]) =>
    apiFetch<BulkResult>(`/stores/${storeId}/stickers/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ ids }),
      headers: { "x-store-id": storeId },
    }),
};

// ── Catalog (global) endpoints ──────────────────────────────────────────────

export const catalogApi = {
  themes:   () => apiFetch<CatalogItem[]>("/themes"),
  packs:    () => apiFetch<CatalogItem[]>("/packs"),
  inserts:  () => apiFetch<CatalogItem[]>("/inserts"),
  products: () => apiFetch<CatalogItem[]>("/related-products"),
  // The query version avoids reusing pre-commerce-policy browser cache entries
  // that do not include the server-owned `purchasable` field.
  editions: () => apiFetch<CatalogItem[]>("/editions?commercePolicy=v1"),
  themesForStore:   (storeId: string) => apiFetch<CatalogItem[]>("/themes", { headers: { "x-store-id": storeId } }),
  packsForStore:    (storeId: string) => apiFetch<CatalogItem[]>("/packs", { headers: { "x-store-id": storeId } }),
  insertsForStore:  (storeId: string) => apiFetch<CatalogItem[]>("/inserts", { headers: { "x-store-id": storeId } }),
  editionsForStore: (storeId: string) => apiFetch<CatalogItem[]>("/editions?commercePolicy=v1", { headers: { "x-store-id": storeId } }),

  updateTheme:   (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/themes/${id}`,          { method: "PATCH", body: JSON.stringify(data) }),
  updatePack:    (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/packs/${id}`,   { method: "PATCH", body: JSON.stringify(data) }),
  updateInsert:  (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/inserts/${id}`,         { method: "PATCH", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/related-products/${id}`,{ method: "PATCH", body: JSON.stringify(data) }),

  /** Create a new platform edition (status="draft"). ID auto-generated from name. */
  createEdition: (data: {
    name: string;
    tier?: string;
    description?: string;
    priceLow?: number;
    priceHigh?: number;
  }) => {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
    const rand = Math.random().toString(36).slice(2, 7);
    const id   = `ed-${slug}-${rand}`;
    return apiFetch<CatalogItem>("/editions", {
      method: "POST",
      body: JSON.stringify({ id, status: "draft", globalAvailable: true, origin: "licensed", ...data }),
    });
  },

  /** Duplicate an edition: carries over catalog attachments, bumps year in name, starts as draft. */
  duplicateEdition: (id: string) =>
    apiFetch<CatalogItem>(`/editions/${encodeURIComponent(id)}/duplicate`, { method: "POST" }),

  /** Update any field on a platform edition. */
  updateEdition: (id: string, data: Partial<CatalogItem>) =>
    apiFetch<CatalogItem>(`/editions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
};

// ── Studio grounded-generate endpoints (server-side, profile-injected) ────────

export interface ThemeGenerateResult {
  name: string; description: string; colors: string[]; model: string; provider: string;
}
export interface PackGenerateResult {
  name: string; tags: string[]; ideas: string[]; model: string; provider: string;
}
export interface EditionGenerateResult {
  name: string; description: string; sections: string[]; palette: string[];
  priceLow: number; priceHigh: number; model: string; provider: string;
}
export interface TrendCard { trend: string; insight: string; idea: string; }
export interface TrendsGenerateResult {
  trends: TrendCard[]; model: string; provider: string;
}
export interface CopilotAction {
  type: "generate_listing" | "generate_social" | "generate_mockup" | "draft_all";
}
export interface CopilotResult { message: string; action?: CopilotAction; }

export interface InsertGenerateResult { svgData: string; hotspotMap: unknown; model: string; provider: string; }
export interface WidgetGenerateResult { svgData: string; hotspotMap: unknown; model: string; provider: string; }

export const studioGenerateApi = {
  generateTheme: (storeId: string, data: { prompt: string }) =>
    apiFetch<ThemeGenerateResult>(`/stores/${storeId}/studios/theme/generate`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
  generatePack: (storeId: string, data: { prompt: string }) =>
    apiFetch<PackGenerateResult>(`/stores/${storeId}/studios/pack/generate`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
  generateEdition: (storeId: string, data: { prompt: string }) =>
    apiFetch<EditionGenerateResult>(`/stores/${storeId}/studios/edition/generate`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
  generateTrends: (storeId: string, data: { prompt: string }) =>
    apiFetch<TrendsGenerateResult>(`/stores/${storeId}/studios/trends/generate`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
  /** Generate a recolourable vector insert page SVG. */
  insert: (storeId: string, data: { prompt: string; exampleImageBase64?: string }) =>
    apiFetch<InsertGenerateResult>(`/stores/${storeId}/studios/insert/generate`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
  /** Generate a functional widget SVG (tracker, grid, etc.). */
  widget: (storeId: string, data: { prompt: string; sizeVariant?: "7-day" | "30-day" | "month" }) =>
    apiFetch<WidgetGenerateResult>(`/stores/${storeId}/studios/widget/generate`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
};

export const copilotApi = {
  send: (
    storeId: string,
    data: {
      messages: { role: "user" | "assistant"; content: string }[];
      context?: { activeTool?: string; selectedProduct?: { type: string; id: string; name: string } | null; brief?: string };
    },
  ) =>
    apiFetch<CopilotResult>(`/stores/${storeId}/marketing/copilot`, {
      method: "POST", body: JSON.stringify(data), headers: { "x-store-id": storeId },
    }),
};

// ── Store Profile & Voice ─────────────────────────────────────────────────────

export interface StoreProfileFacts {
  storeName?: string;
  pitch?: string;
  whatTheySell?: string;
  whoItsFor?: string;
  differentiators?: string[];
  links?: string[];
}

export interface StoreProfileVoice {
  toneTags?: string[];
  wordsWeLove?: string[];
  wordsToAvoid?: string[];
  formalityLevel?: "formal" | "balanced" | "casual" | "playful";
  emojiLevel?: "none" | "light" | "heavy";
  styleSample?: string;
}

export interface StoreProfile {
  storeId: string;
  facts: StoreProfileFacts;
  voice: StoreProfileVoice;
  createdAt?: string;
  updatedAt?: string;
}

export const storeProfileApi = {
  get: (storeId: string) =>
    apiFetch<StoreProfile>(`/stores/${storeId}/profile`, {
      headers: { "x-store-id": storeId },
    }),
  save: (storeId: string, data: { facts?: StoreProfileFacts; voice?: StoreProfileVoice }) =>
    apiFetch<StoreProfile>(`/stores/${storeId}/profile`, {
      method: "PUT",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),
};

// ── Marketing Studio ──────────────────────────────────────────────────────────

export interface MarketingListingResult {
  title: string;
  description: string;
  tags: string[];
  channel: string;
  model: string;
  provider: string;
}

export interface MarketingSocialPost {
  channel: string;
  caption: string;
  hashtags: string[];
}

export interface MarketingSocialResult {
  posts: MarketingSocialPost[];
  model: string;
  provider: string;
}

export interface MarketingMockupFrame {
  id: string;
  label: string;
  description: string;
  imageSrc: string;
  simulated: boolean;
}

export interface MarketingMockupResult {
  frames: MarketingMockupFrame[];
  simulated: boolean;
  notice: string;
}

export interface MarketingAsset {
  id: string;
  storeId: string;
  assetType: "listing" | "social" | "mockup";
  title: string;
  data: Record<string, unknown>;
  status: string;
  sourceEditionId: string | null;
  sourcePackId: string | null;
  channelTarget: string | null;
  voiceSnapshot: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export const marketingApi = {
  generateListing: (
    storeId: string,
    data: {
      editionId?: string;
      packId?: string;
      brief?: string;
      voiceOverride?: Partial<StoreProfileVoice>;
      channel?: "etsy" | "tiktok" | "storefront";
    },
  ) =>
    apiFetch<MarketingListingResult>(`/stores/${storeId}/marketing/generate/listing`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  generateSocial: (
    storeId: string,
    data: {
      editionId?: string;
      packId?: string;
      brief?: string;
      voiceOverride?: Partial<StoreProfileVoice>;
      channels?: string[];
    },
  ) =>
    apiFetch<MarketingSocialResult>(`/stores/${storeId}/marketing/generate/social`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  generateMockup: (
    storeId: string,
    data: {
      editionId?: string;
      packId?: string;
      brief?: string;
      sceneDescription?: string;
    },
  ) =>
    apiFetch<MarketingMockupResult>(`/stores/${storeId}/marketing/generate/mockup`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  listAssets: (storeId: string) =>
    apiFetch<MarketingAsset[]>(`/stores/${storeId}/marketing/assets`, {
      headers: { "x-store-id": storeId },
    }),

  saveAsset: (
    storeId: string,
    data: {
      assetType: string;
      title: string;
      data: Record<string, unknown>;
      sourceEditionId?: string;
      sourcePackId?: string;
      channelTarget?: string;
      voiceSnapshot?: Record<string, unknown>;
    },
  ) =>
    apiFetch<MarketingAsset>(`/stores/${storeId}/marketing/assets`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  deleteAsset: (storeId: string, id: string) =>
    apiFetch<void>(`/stores/${storeId}/marketing/assets/${id}`, {
      method: "DELETE",
      headers: { "x-store-id": storeId },
    }),
};

// ── Store Planners ─────────────────────────────────────────────────────────────

export type PlannerDatingMode = "dated" | "undated" | "perpetual";

export interface StorePlannerSetup {
  weekStart: "sun" | "mon";
  orientation: "landscape" | "vertical";
  startMonth: number;
  startYear: number;
  monthCount: number;
  datingMode?: PlannerDatingMode;
}

export interface StorePlannerStyle {
  themeId?: string | null;
  paletteId?: string | null;
  backgroundId?: string | null;
  tabPos?: "right" | "top" | "bottom" | "none";
  tabTheme?: "neutral" | "accent";
  tabShape?: string;
  notePaper?: "dot" | "graph" | "lined" | "mixed";
  sections?: string[];
  renderStyle?: "realistic" | "flat";
  size?: "A5" | "B6" | "Personal" | "Half letter" | "Letter" | "iPad 4:3";
  binding?: { type: "coil" | "twin-loop" | "discs" | "3-ring" | "none"; finish: "gold" | "rose gold" | "silver" | "matte black" | "white" };
  paperColour?: "cream" | "white" | "ivory" | "kraft" | "slate";
  coverType?: "texture" | "photo" | "pattern" | "solid";
  coverTitle?: string;
  coverSubtitle?: string;
  coverYear?: number;
  /** Per-role font overrides — empty string means use theme default. */
  fonts?: {
    heading?: string;
    subheading?: string;
    script?: string;
    accent?: string;
  } | null;
}

export interface StorePlannerOutput {
  calMode?: "none" | "google" | "ics";
  eventMins?: number;
  aiInPdf?: boolean;
}

export interface StorePlannerConfig {
  id: string;
  userId: string;
  storeId: string | null;
  editionId: string | null;
  year: number | null;
  setup: StorePlannerSetup;
  style: StorePlannerStyle;
  output: StorePlannerOutput;
  drive: { pdfFileId: string | null; configFileId: string | null };
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorePlannerResult {
  id: string;
  drive: { pdfFileId: string | null; configFileId: string | null };
  pageCount: number;
  fileName: string;
}

export const storePlannersApi = {
  list: (storeId: string) =>
    apiFetch<StorePlannerConfig[]>(`/stores/${storeId}/planners`, {
      headers: { "x-store-id": storeId },
    }),

  get: (storeId: string, id: string) =>
    apiFetch<StorePlannerConfig>(`/stores/${storeId}/planners/${id}`, {
      headers: { "x-store-id": storeId },
    }),

  create: (
    storeId: string,
    data: {
      editionId?: string;
      year?: number;
      setup: StorePlannerSetup;
      style?: StorePlannerStyle;
      output?: StorePlannerOutput;
    },
  ) =>
    apiFetch<StorePlannerResult>(`/stores/${storeId}/planners`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  patch: (
    storeId: string,
    id: string,
    data: { setup?: Partial<StorePlannerSetup>; style?: Partial<StorePlannerStyle>; output?: Partial<StorePlannerOutput>; editionId?: string | null },
  ) =>
    apiFetch<StorePlannerConfig>(`/stores/${storeId}/planners/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  reexport: (storeId: string, id: string, data: { style?: Partial<StorePlannerStyle>; output?: Partial<StorePlannerOutput> }) =>
    apiFetch<StorePlannerResult>(`/stores/${storeId}/planners/${id}/reexport`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),
};

// ── Platform Planner Templates ────────────────────────────────────────────────

export interface PlatformPlannerConfig {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  editionId: string | null;
  productType: string;
  setup: StorePlannerSetup;
  style: StorePlannerStyle;
  output: StorePlannerOutput;
  drive: { pdfFileId: string | null; configFileId: string | null };
  generatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const platformPlannersApi = {
  list: () =>
    apiFetch<PlatformPlannerConfig[]>("/platform/planners"),

  get: (id: string) =>
    apiFetch<PlatformPlannerConfig>(`/platform/planners/${id}`),

  create: (data: {
    name: string;
    description?: string;
    editionId?: string;
    setup?: Partial<StorePlannerSetup>;
    style?: Partial<StorePlannerStyle>;
    output?: Partial<StorePlannerOutput>;
  }) =>
    apiFetch<PlatformPlannerConfig>("/platform/planners", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  patch: (
    id: string,
    data: {
      name?: string;
      description?: string;
      editionId?: string | null;
      setup?: Partial<StorePlannerSetup>;
      style?: Partial<StorePlannerStyle>;
      output?: Partial<StorePlannerOutput>;
    },
  ) =>
    apiFetch<PlatformPlannerConfig>(`/platform/planners/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  generate: (id: string, opts?: { inkFriendly?: boolean; einkDevice?: string | null }) =>
    apiFetch<{ id: string; drive: { pdfFileId: string | null; configFileId: string | null; inkFriendlyPdfFileId?: string | null }; pageCount: number; fileName: string; einkCaveat?: string | null }>(
      `/platform/planners/${id}/generate`,
      { method: "POST", body: JSON.stringify(opts ?? {}) },
    ),

  publish: (id: string) =>
    apiFetch<PlatformPlannerConfig>(`/platform/planners/${id}/publish`, {
      method: "POST",
    }),

  delete: (id: string) =>
    apiFetch<void>(`/platform/planners/${id}`, { method: "DELETE" }),
};

// ── Immutable authored planner interiors ──────────────────────────────────────

export type PlannerInteriorManifest = {
  trim: { w: number; h: number; unit: "mm" };
  pages: Array<{
    template: string;
    once?: true;
    repeat?: { over: "months" | "days"; from: string; to: string };
  }>;
};

export type PlannerInteriorAssets = Record<string, string>;

export interface PlannerInterior {
  id: string;
  storeId: string;
  name: string;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlannerInteriorVersion {
  id: string;
  interiorId: string;
  version: number;
  manifest: PlannerInteriorManifest;
  assets: PlannerInteriorAssets;
  createdAt: string;
}

export const plannerInteriorsApi = {
  list: () => apiFetch<PlannerInterior[]>("/v1/planner-interiors"),

  get: (id: string) =>
    apiFetch<{ interior: PlannerInterior; versions: PlannerInteriorVersion[] }>(`/v1/planner-interiors/${id}`),

  create: (data: { storeId: string; name: string; manifest: PlannerInteriorManifest; assets: PlannerInteriorAssets }) =>
    apiFetch<{ interior: PlannerInterior; version: PlannerInteriorVersion }>("/v1/planner-interiors", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createVersion: (id: string, data: { manifest: PlannerInteriorManifest; assets: PlannerInteriorAssets }) =>
    apiFetch<{ interior: PlannerInterior; version: PlannerInteriorVersion }>(`/v1/planner-interiors/${id}/versions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  previewUrl: (id: string, versionId?: string) =>
    `/api/v1/planner-interiors/${id}/preview${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`,

  pinEdition: (editionId: string, versionId: string) =>
    apiFetch(`/v1/editions/${editionId}/pin-interior`, {
      method: "POST",
      body: JSON.stringify({ versionId }),
    }),
};

// ── Widgets ───────────────────────────────────────────────────────────────────

export interface Widget {
  id: string;
  name: string;
  storeId: string | null;
  sizeVariants: string[];
  svgData: string | null;
  paletteSlots: Record<string, string> | null;
  status: "draft" | "live";
  origin: "starter" | "licensed" | "owned";
  authoredByStoreId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const widgetsApi = {
  list: (storeId: string) =>
    apiFetch<Widget[]>(`/stores/${storeId}/widgets`, {
      headers: { "x-store-id": storeId },
    }),

  create: (storeId: string, data: { name: string; sizeVariants?: string[]; svgData?: string; paletteSlots?: Record<string, string>; status?: "draft" | "live" }) =>
    apiFetch<Widget>(`/stores/${storeId}/widgets`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  patch: (storeId: string, id: string, data: Partial<{ name: string; sizeVariants: string[]; svgData: string; paletteSlots: Record<string, string>; status: "draft" | "live" }>) =>
    apiFetch<Widget>(`/stores/${storeId}/widgets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: { "x-store-id": storeId },
    }),

  delete: (storeId: string, id: string) =>
    apiFetchDelete(`/stores/${storeId}/widgets/${id}`, { "x-store-id": storeId }),
};

// ── Planner Hotspot Maps ──────────────────────────────────────────────────────

export interface PlannerHotspot {
  id: string;
  storeId: string;
  templateKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  targetType: string;
  targetRef?: string | null;
  confidence?: number | null;
  source: "auto" | "manual";
  label?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HotspotInput {
  x: number;
  y: number;
  w: number;
  h: number;
  targetType: string;
  targetRef?: string | null;
  confidence?: number | null;
  source?: "auto" | "manual";
  label?: string | null;
}

export interface ProposedHotspot extends HotspotInput {
  confidence: number;
  source: "auto";
}

/** Summarises how many hotspots exist per templateKey for this store. */
export interface HotspotTemplateSummary {
  templateKey: string;
  count: number;
}

export const plannerHotspotsApi = {
  /** List all templateKeys with non-zero hotspot counts for this store. */
  listTemplates: (storeId: string) =>
    apiFetch<{ templates: HotspotTemplateSummary[] }>(
      `/stores/${storeId}/planners/hotspots`,
      { headers: { "x-store-id": storeId } },
    ),

  /** Get all hotspots for a single templateKey. */
  get: (storeId: string, templateKey: string) =>
    apiFetch<PlannerHotspot[]>(
      `/stores/${storeId}/planners/hotspots/${templateKey}`,
      { headers: { "x-store-id": storeId } },
    ),

  /** Replace the entire hotspot map for a templateKey (PUT semantics). */
  save: (storeId: string, templateKey: string, hotspots: HotspotInput[]) =>
    apiFetch<{ saved: PlannerHotspot[]; count: number }>(
      `/stores/${storeId}/planners/hotspots/${templateKey}`,
      {
        method: "PUT",
        body: JSON.stringify({ hotspots }),
        headers: { "x-store-id": storeId },
      },
    ),

  /** Delete a single hotspot by ID. */
  deleteOne: (storeId: string, id: string) =>
    apiFetch<void>(`/stores/${storeId}/planners/hotspots/${id}`, {
      method: "DELETE",
      headers: { "x-store-id": storeId },
    }),

  /**
   * Submit a base64 page image to Claude Vision for hotspot auto-detection.
   * Returns proposed hotspots for seller review — NOT saved automatically.
   */
  autoDetect: (
    storeId: string,
    templateKey: string,
    imageBase64: string,
    mediaType?: string,
  ) =>
    apiFetch<{ proposed: ProposedHotspot[]; model: string; provider: string }>(
      `/stores/${storeId}/planners/hotspots/${templateKey}/auto-detect`,
      {
        method: "POST",
        body: JSON.stringify({ imageBase64, mediaType }),
        headers: { "x-store-id": storeId },
      },
    ),
};

// ── Theme Studio catalog API ───────────────────────────────────────────────────

export interface HardwareCatalogItem {
  id: string; name: string; kind: string; finish?: string;
  status: string; globalAvailable: boolean; origin: string;
}
export interface AccessoryCatalogItem {
  id: string; name: string; kind: string;
  status: string; globalAvailable: boolean; origin: string;
}
export interface FontCatalogItem {
  id: string; familyName: string; variants: unknown[];
  sampleUrl?: string; curatedPairings: unknown[];
  status: string; globalAvailable: boolean; origin: string;
}
export interface AssetTypeDescriptor {
  slot: string; label: string; glyph: string;
  count: number; studios: string[];
}

export const themeApi = {
  /** List hardware catalog items. */
  hardware: () => apiFetch<HardwareCatalogItem[]>("/hardware"),

  /** List accessories catalog items. */
  accessories: () => apiFetch<AccessoryCatalogItem[]>("/accessories"),

  /** List fonts catalog items. */
  fonts: () => apiFetch<FontCatalogItem[]>("/fonts"),

  /** Replace a theme's slot with a new set of catalog IDs. */
  attachSlot: (themeId: string, slot: string, ids: string[]) =>
    apiFetch<{ updated: number }>(`/themes/${themeId}/${slot}`, {
      method: "PUT",
      body: JSON.stringify(ids),
    }),

  /** Stage an AI-proposed bundle (server-side ephemeral cache). */
  stageBundle: (themeId: string, bundle: Record<string, string[]>) =>
    apiFetch<{ themeId: string; staged: Record<string, string[]> }>(
      `/themes/${themeId}/stage-bundle`,
      { method: "POST", body: JSON.stringify({ bundle }) },
    ),

  /** Commit accepted slots from a staged bundle to the DB. */
  commitBundle: (themeId: string, accepted: Record<string, string[]>) =>
    apiFetch<{ themeId: string; updated: number }>(
      `/themes/${themeId}/commit-bundle`,
      { method: "POST", body: JSON.stringify({ accepted }) },
    ),

  /** Retrieve the 9 asset-type descriptors with catalog item counts. */
  assetTypes: () => apiFetch<AssetTypeDescriptor[]>("/catalog/asset-types"),
};

// (insert + widget generate methods are part of studioGenerateApi above)

// ─── PRODUCT RECIPES ──────────────────────────────────────────────────────────

export interface ProductRecipeDecisionCard {
  prompt:  string;
  optionA: { label: string; consequence: string };
  optionB: { label: string; consequence: string };
}

export interface ProductRecipeRelease {
  planTiers: string[];
  month:     number;
  year:      number;
}

export interface ProductRecipe {
  id:           string;
  name:         string;
  category:     string;
  decisionCard: ProductRecipeDecisionCard | null;
  parts:        string[];
  physicalPath: { prints: boolean; impositionSheet?: string; templates?: string[] } | null;
  claudeBrief:  { asks: string[]; generates: string } | null;
  release:      ProductRecipeRelease | null;
  status:       "draft" | "live" | "retired";
  buildCount:   number;
  createdAt:    string;
  updatedAt:    string;
}

export interface RecipeStats {
  live:              number;
  draft:             number;
  shipsNext:         number;
  renewalsCitingNew: number;
}

export const recipesApi = {
  list: () =>
    apiFetch<ProductRecipe[]>("/platform/recipes"),

  stats: () =>
    apiFetch<RecipeStats>("/platform/recipes/stats"),

  get: (id: string) =>
    apiFetch<ProductRecipe>(`/platform/recipes/${id}`),

  create: (data: Partial<ProductRecipe>) =>
    apiFetch<ProductRecipe>("/platform/recipes", {
      method: "POST", body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<ProductRecipe>) =>
    apiFetch<ProductRecipe>(`/platform/recipes/${id}`, {
      method: "PATCH", body: JSON.stringify(data),
    }),

  publish: (id: string) =>
    apiFetch<ProductRecipe>(`/platform/recipes/${id}/publish`, { method: "POST" }),

  retire: (id: string) =>
    apiFetch<ProductRecipe>(`/platform/recipes/${id}/retire`, { method: "POST" }),

  delete: (id: string) =>
    apiFetch<{ ok: boolean; status: string }>(`/platform/recipes/${id}`, { method: "DELETE" }),

  draftFromBrief: (brief: string, images?: Array<{ base64: string; mediaType: string; role: "layout" | "style" }>) =>
    apiFetch<{
      productType: string;
      partsOn: string[];
      partsOff: Array<{ key: string; reason: string }>;
      decisionCard: { prompt: string; optionA: { label: string; consequence: string }; optionB: { label: string; consequence: string } };
      reading: { type: string; partsOn: string; partsOff: string; question: string };
      gaps: Array<{ title: string; explanation: string; severity: string }>;
      imageReading: string | null;
    }>("/platform/recipes/draft-from-brief", { method: "POST", body: JSON.stringify({ brief, images }) }),
};

export const storageApi = {
  requestUploadUrl: (name: string, size: number, contentType: string) =>
    apiFetch<{ uploadURL: string; objectPath: string }>("/storage/uploads/request-url", {
      method: "POST",
      body: JSON.stringify({ name, size, contentType }),
    }),
  /** Delete a private object entity by its /objects/… path. Resolves on success or if already gone. */
  deleteObject: (objectPath: string) =>
    apiFetch<void>(
      `/storage/objects/${objectPath.replace(/^\/objects\//, "")}`,
      { method: "DELETE" },
    ),
};

// ─── SUPPORT ──────────────────────────────────────────────────────────────────

export interface SupportTicket {
  id: string;
  reporterUserId: string | null;
  reporterRole: string;
  recipientScope: string;
  storeId: string | null;
  area: string;
  symptoms: string[];
  body: string | null;
  screenshotRefs: string[];
  diagnostics: Record<string, unknown>;
  status: "open" | "replied" | "fixed" | "closed";
  buildRef: string | null;
  closeReason: string | null;
  closeNote: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replyCount?: number;
}

export interface CloseReasonPattern {
  reason: string;
  label: string;
  count: number;
}

export interface NoArticleCluster {
  area: string;
  areaLabel: string;
  count: number;
}

export interface CloseReasonPatternsResult {
  byReason: CloseReasonPattern[];
  noArticleClusters: NoArticleCluster[];
  total: number;
  months: number;
}

export interface TicketReply {
  id: number;
  ticketId: string;
  authorUserId: string | null;
  authorRole: string;
  body: string;
  createdAt: string;
}

export interface RecentBuild {
  id: string;
  name: string;
  type: string;
  generatedAt: string | null;
  meta: string;
  badge: string | null;
  style: Record<string, unknown> | null;
  setup: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  storeId: string | null;
  themeName: string | null;
  editionName: string | null;
  lastJobStatus: string | null;
  lastJobError: string | null;
}

export interface HelpArticleMatch {
  id: string;
  title: string;
  excerpt: string;
  confidence: "EXACT MATCH" | "LIKELY" | "RELATED" | null;
}

// ── Email types ───────────────────────────────────────────────────────────────

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: string | number;
  status: string;
}

export interface StoreEmailConfig {
  storeId: string;
  fromDisplayName: string | null;
  fromDomain: string | null;
  fromLocalPart: string | null;
  domainStatus: string;
  resendDomainId: string | null;
  dnsRecords: DnsRecord[] | null;
  dkimVerifiedAt: string | null;
  spfVerifiedAt: string | null;
  lastVerifyCheckAt: string | null;
  lastVerifyError: string | null;
  tier1Suspended: boolean;
  suspendedReason: string | null;
  monthlyVolume: number;
  bounceCount: number;
  complaintCount: number;
}

export interface DeliverabilityRow {
  storeId: string;
  storeName: string;
  domainStatus: string | null;
  fromDomain: string | null;
  tier1Suspended: boolean | null;
  suspendedReason: string | null;
  bounceCount: number | null;
  complaintCount: number | null;
  monthlyVolume: number | null;
  total: number;
  sent: number;
  failed: number;
  bounceRate: number;
  complaintRate: number;
}

export const emailSettingsApi = {
  get: (storeId: string) =>
    apiFetch<{ config: StoreEmailConfig | null }>(`/store/${storeId}/email-settings`),

  update: (storeId: string, data: { fromDisplayName?: string; fromLocalPart?: string }) =>
    apiFetch<{ config: StoreEmailConfig }>(`/store/${storeId}/email-settings`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  registerDomain: (storeId: string, data: { fromDomain: string; fromLocalPart?: string }) =>
    apiFetch<{ domain: { id: string; name: string; status: string; records: DnsRecord[] } }>(
      `/store/${storeId}/email-settings/domain`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  verifyDomain: (storeId: string) =>
    apiFetch<{ domain: { id: string; name: string; status: string; records: DnsRecord[] } }>(
      `/store/${storeId}/email-settings/domain/verify`,
      { method: "POST" },
    ),

  removeDomain: (storeId: string) =>
    apiFetch<{ ok: boolean }>(`/store/${storeId}/email-settings/domain`, { method: "DELETE" }),

  deliverability: () =>
    apiFetch<{ stores: DeliverabilityRow[] }>("/super/email/deliverability"),

  unsuspend: (storeId: string) =>
    apiFetch<{ ok: boolean }>(`/super/email/stores/${storeId}/unsuspend`, { method: "POST" }),
};

export const supportApi = {
  articles: (area: string, symptoms: string[], scope = "platform") =>
    apiFetch<{ articles: HelpArticleMatch[] }>(
      `/support/articles?area=${encodeURIComponent(area)}&symptoms=${encodeURIComponent(symptoms.join(","))}&scope=${encodeURIComponent(scope)}`,
    ),

  recentActivity: (storeId?: string) =>
    apiFetch<{ builds: RecentBuild[] }>(
      `/support/recent-activity${storeId ? `?storeId=${storeId}` : ""}`,
    ),

  myTickets: () =>
    apiFetch<{ tickets: SupportTicket[] }>("/support/tickets/mine"),

  inbox: (params?: { storeId?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.storeId) q.set("storeId", params.storeId);
    if (params?.status)  q.set("status",  params.status);
    const qs = q.toString();
    return apiFetch<{ tickets: SupportTicket[] }>(`/support/inbox${qs ? `?${qs}` : ""}`);
  },

  get: (id: string) =>
    apiFetch<{ ticket: SupportTicket; replies: TicketReply[] }>(`/support/tickets/${id}`),

  create: (data: {
    area: string;
    symptoms?: string[];
    body?: string;
    buildRef?: string;
    storeId?: string;
    screenshotRefs?: string[];
    extraDiagnostics?: Record<string, unknown>;
  }) =>
    apiFetch<{ ticket: SupportTicket }>("/support/tickets", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  addReply: (ticketId: string, body: string) =>
    apiFetch<{ reply: TicketReply }>(`/support/tickets/${ticketId}/replies`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  updateStatus: (
    ticketId: string,
    status: string,
    opts?: { closeReason?: string; closeNote?: string },
  ) =>
    apiFetch<{ ok: boolean }>(`/support/tickets/${ticketId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...opts }),
    }),

  closeReasonPatterns: (params?: { storeId?: string; months?: number }) => {
    const q = new URLSearchParams();
    if (params?.storeId) q.set("storeId", params.storeId);
    if (params?.months)  q.set("months",  String(params.months));
    const qs = q.toString();
    return apiFetch<CloseReasonPatternsResult>(`/support/close-reason-patterns${qs ? `?${qs}` : ""}`);
  },
};

export interface CustomerPaymentHistoryEntry {
  id: string;
  order: {
    id: string;
    storeId: string;
    createdAt: string;
    totalCents: number;
    currency: string;
  };
  plan: { id: string; name: string };
  source: string;
  status: string;
  amountCents: number | null;
  currency: string | null;
  stripe: {
    paymentIntentId: string | null;
    subscriptionId: string | null;
    invoiceId: string | null;
  };
  lifecycleEvent: {
    id: string | null;
    type: string | null;
    at: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

export const billingApi = {
  customerPayments: (userId: string) =>
    apiFetch<{ payments: CustomerPaymentHistoryEntry[] }>(
      `/billing/users/${encodeURIComponent(userId)}/payments`,
    ),
};

export interface SupportOrder {
  id: string;
  storeId: string;
  buyerEmail: string;
  buyerName: string | null;
  items: Array<{ name: string; priceCents: number; downloadUrl?: string }>;
  totalCents: number;
  currency: string;
  downloadLinks: Array<{ name: string; url: string }>;
  resendTokenExpiresAt: string;
  resendCount: number;
  receiptSentAt: string | null;
  receiptAttempts: number;
  receiptLastError: string | null;
  receiptLastAttemptAt: string | null;
  createdAt: string;
}

export type ReceiptStatus = "sent" | "pending" | "failed";
export const ordersApi = {
  list: (storeId: string, receiptStatus?: ReceiptStatus) => {
    const query = receiptStatus ? `?receiptStatus=${encodeURIComponent(receiptStatus)}` : "";
    return apiFetch<{ orders: SupportOrder[] }>(`/store/${encodeURIComponent(storeId)}/orders${query}`, {
      headers: { "x-store-id": storeId },
    });
  },
  get: (id: string, storeId?: string) => apiFetch<{ order: SupportOrder }>(
    `/orders/${encodeURIComponent(id)}`,
    storeId ? { headers: { "x-store-id": storeId } } : undefined,
  ),
  resendReceipt: (id: string, storeId?: string) => apiFetch<{ ok: boolean }>(
    `/orders/${encodeURIComponent(id)}/resend-receipt`,
    {
      method: "POST",
      ...(storeId ? { headers: { "x-store-id": storeId } } : {}),
    },
  ),
};

// ── Releases ───────────────────────────────────────────────────────────────────

export interface ReleaseNote {
  id: number;
  releaseId: number;
  sortOrder: number;
  note: string;
}

export interface ReleaseWithNotes {
  id: number;
  version: string;
  versionType: string;
  title: string;
  releaseDate: string | null;
  githubSha: string | null;
  isPublished: boolean;
  reviewStatus: "draft" | "preparing" | "review_requested" | "failed" | "merged";
  reviewBranch: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  reviewCommitSha: string | null;
  reviewAttempt: number;
  reviewError: string | null;
  reviewRequestedAt: string | null;
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: ReleaseNote[];
}

export interface ReleaseGitHealth {
  safeToRequestReview: boolean;
  branch: string | null;
  head: string | null;
  origin: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: string[];
  conflicts: string[];
  isDetached: boolean;
  isRebasing: boolean;
  remoteSyncVerified: boolean;
  githubConfigured: boolean;
  blockers: string[];
  recentCommits: Array<{ sha: string; subject: string }>;
}

export const releasesApi = {
  list: () =>
    apiFetch<ReleaseWithNotes[]>("/platform/releases"),

  create: (body: {
    version: string;
    versionType: string;
    title: string;
    notes?: string[];
  }) =>
    apiFetch<ReleaseWithNotes>("/platform/releases", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: number, body: {
    version?: string;
    versionType?: string;
    title?: string;
    notes?: string[];
  }) =>
    apiFetch<ReleaseWithNotes>(`/platform/releases/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: (id: number) =>
    apiFetch<{ ok: boolean }>(`/platform/releases/${id}`, { method: "DELETE" }),

  gitHealth: () =>
    apiFetch<ReleaseGitHealth>("/platform/releases/git-health"),

  requestReview: (id: number) =>
    apiFetch<ReleaseWithNotes>(`/platform/releases/${id}/request-review`, {
      method: "POST",
      body: JSON.stringify({ approved: true }),
    }),

  confirmMerge: (id: number) =>
    apiFetch<ReleaseWithNotes>(`/platform/releases/${id}/confirm-merge`, {
      method: "POST",
    }),
};

// ── House store constant (mirrors api-server) ─────────────────────────────────
export const HOUSE_STORE_ID = "store-house";

// ── Catalog promotion / demotion ──────────────────────────────────────────────

export type CatalogItemType =
  | "theme" | "pack" | "insert" | "edition"
  | "palette" | "background" | "widget" | "hardware" | "accessory";

export interface HouseOwnedItem {
  id: string;
  name: string;
  itemType: CatalogItemType;
  origin: ItemOrigin;
  status: string;
  authoredByStoreId: string | null;
}

export interface AdoptionBlockError {
  error: string;
  code: "ADOPTION_BLOCK";
  adoptedByCount: number;
  adopters: { storeId: string; name: string }[];
}

export const promoteCatalogApi = {
  /** List all items authored by the house store (any origin). */
  listHouseOwned: () =>
    apiFetch<HouseOwnedItem[]>("/platform/catalog/house-owned"),

  /** Move an owned house-store item to the platform catalog. */
  promote: (itemType: CatalogItemType, itemId: string, targetOrigin: "starter" | "licensed") =>
    apiFetch<HouseOwnedItem>("/platform/catalog/promote", {
      method: "POST",
      body: JSON.stringify({ itemType, itemId, targetOrigin }),
      headers: { "Content-Type": "application/json" },
    }),

  /** Return a promoted item back to owned status (blocked if adopted). */
  demote: (itemType: CatalogItemType, itemId: string) =>
    apiFetch<HouseOwnedItem>("/platform/catalog/demote", {
      method: "POST",
      body: JSON.stringify({ itemType, itemId }),
      headers: { "Content-Type": "application/json" },
    }),
};
