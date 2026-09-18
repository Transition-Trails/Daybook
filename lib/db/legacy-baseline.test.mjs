import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isRepairableLegacyColumnDifference } from "./legacy-baseline.mjs";

const productionItem = "public.ws_production_specs.production_item";
const expectedRequiredText = { type: "text", notNull: true };

test("accepts only the tracked nullable production-spec legacy shape", () => {
  assert.equal(
    isRepairableLegacyColumnDifference(
      productionItem,
      expectedRequiredText,
      { type: "text", notNull: false },
    ),
    true,
  );
});

test("rejects a wrong SQL type even when the legacy column is nullable", () => {
  assert.equal(
    isRepairableLegacyColumnDifference(
      productionItem,
      expectedRequiredText,
      { type: "integer", notNull: false },
    ),
    false,
  );
});

test("rejects the same nullability difference on any other column", () => {
  assert.equal(
    isRepairableLegacyColumnDifference(
      "public.ws_production_specs.design_intent",
      expectedRequiredText,
      { type: "text", notNull: false },
    ),
    false,
  );
});

test("keeps the original suggestion-refresh migration checksum stable", async () => {
  const sql = await readFile(
    new URL("./drizzle/0037_worldsmith_suggestion_refreshes.sql", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(sql).digest("hex"),
    "380f1936e1772cecde2b041af898b6bce97eefde7efa6ab36680834f234795a1",
  );
});