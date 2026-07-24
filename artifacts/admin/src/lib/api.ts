/**
 * Typed fetch helpers for the multi-tenant platform API.
 * All calls use session cookies (credentials: 'include') and
 * the standard /api prefix routed by the Replit path proxy.
 */

async function apiFetch<T = unknown>(
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
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
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

// ── Help endpoints ──────────────────────────────────────────────────────────

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

// ── Catalog (global) endpoints ──────────────────────────────────────────────

export const catalogApi = {
  themes:   () => apiFetch<CatalogItem[]>("/themes"),
  packs:    () => apiFetch<CatalogItem[]>("/sticker-packs"),
  inserts:  () => apiFetch<CatalogItem[]>("/inserts"),
  products: () => apiFetch<CatalogItem[]>("/related-products"),
  editions: () => apiFetch<CatalogItem[]>("/editions"),

  updateTheme:   (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/themes/${id}`,          { method: "PATCH", body: JSON.stringify(data) }),
  updatePack:    (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/sticker-packs/${id}`,   { method: "PATCH", body: JSON.stringify(data) }),
  updateInsert:  (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/inserts/${id}`,         { method: "PATCH", body: JSON.stringify(data) }),
  updateProduct: (id: string, data: Partial<CatalogItem>) => apiFetch<CatalogItem>(`/related-products/${id}`,{ method: "PATCH", body: JSON.stringify(data) }),
};
