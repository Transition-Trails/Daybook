const nullableProductionSpecColumns = new Set([
  "public.ws_production_specs.production_item",
  "public.ws_production_specs.component_type",
]);

export function isRepairableLegacyColumnDifference(key, expected, actual) {
  return nullableProductionSpecColumns.has(key)
    && expected.type === "text"
    && expected.notNull === true
    && actual.type === "text"
    && actual.notNull === false;
}