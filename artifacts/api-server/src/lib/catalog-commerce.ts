/**
 * Catalog commerce policy.
 *
 * Keep this list deliberately small: an item type belongs here only after its
 * secure fulfillment path exists. The same policy is used for checkout,
 * storefront metadata, and seller catalog messaging.
 */
export const PURCHASABLE_ITEM_TYPES = ["edition"] as const;
export type PurchasableItemType = (typeof PURCHASABLE_ITEM_TYPES)[number];

export function isPurchasableItemType(itemType: string): itemType is PurchasableItemType {
  return (PURCHASABLE_ITEM_TYPES as readonly string[]).includes(itemType);
}

/**
 * An item can be advertised as purchasable only when it has both a supported
 * secure-delivery path and an explicit, valid price. An omitted price means the
 * edition is available to browse but not ready for checkout.
 */
export function isPurchasableCatalogItem(
  itemType: string,
  item: object | null | undefined,
): boolean {
  const price = (item as { digitalPriceCents?: unknown } | null | undefined)?.digitalPriceCents;
  return isPurchasableItemType(itemType)
    && typeof price === "number"
    && Number.isInteger(price)
    && price >= 0;
}