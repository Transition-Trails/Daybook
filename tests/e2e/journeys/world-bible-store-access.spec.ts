/**
 * Store-scoped World Bible access regression coverage.
 *
 * The CI seed gives both personas a shared store-owned world. Staff may shape
 * its prose, but only a store owner may change the World Rules that govern
 * every later prompt.
 */
import { test, expect } from "../fixtures/base.js";

const STORE_A = "ci_store_a";
const WORLD_ID = "ci_editorial_world";
const WORLD_NAME = "CI Editorial World";

async function openWorldBible(page: import("@playwright/test").Page) {
  await page.goto(`/store/${STORE_A}/worldsmith`);
  await expect(page.locator(`article[aria-label="Open ${WORLD_NAME}"]`)).toBeVisible();
  await page.locator(`article[aria-label="Open ${WORLD_NAME}"]`).click();
  await page.getByRole("button", { name: "World Bible", exact: true }).click();
  await expect(page.getByRole("heading", { name: `${WORLD_NAME} — World Bible` })).toBeVisible();
}

function proseVoiceEditor(page: import("@playwright/test").Page) {
  return page
    .getByRole("button", { name: /How does this world speak\?/ })
    .locator("..")
    .getByRole("textbox");
}

function worldRulesSection(page: import("@playwright/test").Page) {
  return page
    .getByRole("button", { name: /What rules does this world follow\?/ })
    .locator("..");
}

test.describe("Store-scoped World Bible access", () => {
  test("staff see read-only World Rules and can save World Bible prose", async ({ asStaffA }) => {
    const originalResponse = await asStaffA.request.get("/api/v1/worldsmith/worlds", {
      headers: { "x-store-id": STORE_A },
    });
    expect(originalResponse.ok()).toBe(true);
    const originalWorld = (await originalResponse.json()).worlds.find(
      (world: { id: string }) => world.id === WORLD_ID,
    ) as { proseVoice: string | null };
    expect(originalWorld).toBeTruthy();

    const replacementProse = "CI store staff browser prose verification.";
    try {
      await openWorldBible(asStaffA);

      const rules = worldRulesSection(asStaffA);
      await expect(rules.getByText("Keep all test content explicitly labelled as CI data.")).toBeVisible();
      await expect(rules.getByRole("note")).toContainText(
        "World Rules are read-only for store staff",
      );
      await expect(rules.getByRole("button", { name: /Remove rule/i })).toHaveCount(0);
      await expect(rules.getByPlaceholder("Add a rule…")).toHaveCount(0);

      const prose = proseVoiceEditor(asStaffA);
      await prose.click();
      await prose.press("Control+A");
      await prose.fill(replacementProse);

      const saveResponse = asStaffA.waitForResponse(response =>
        response.request().method() === "PATCH" &&
        response.url().includes(`/api/v1/worldsmith/worlds/${WORLD_ID}`),
      );
      await asStaffA.getByRole("button", { name: "Save World Bible", exact: true }).click();
      expect((await saveResponse).status()).toBe(200);
      await expect(asStaffA.getByText("World Bible saved", { exact: true })).toBeVisible();

      await expect.poll(async () => {
        const response = await asStaffA.request.get("/api/v1/worldsmith/worlds", {
          headers: { "x-store-id": STORE_A },
        });
        const { worlds } = await response.json() as {
          worlds: Array<{ id: string; proseVoice: string | null }>;
        };
        return worlds.find(world => world.id === WORLD_ID)?.proseVoice;
      }).toContain(replacementProse);
    } finally {
      const restore = await asStaffA.request.patch(`/api/v1/worldsmith/worlds/${WORLD_ID}`, {
        headers: { "x-store-id": STORE_A },
        data: { proseVoice: originalWorld.proseVoice },
      });
      expect(restore.ok(), "staff should be able to restore World Bible prose").toBe(true);
    }
  });

  test("store owners retain the World Rules controls", async ({ asOwnerA }) => {
    await openWorldBible(asOwnerA);

    await expect(asOwnerA.getByRole("button", { name: "Remove rule 1" })).toBeVisible();
    await expect(asOwnerA.getByPlaceholder("Add a rule…")).toBeVisible();
    await expect(asOwnerA.getByRole("note")).toHaveCount(0);
  });
});