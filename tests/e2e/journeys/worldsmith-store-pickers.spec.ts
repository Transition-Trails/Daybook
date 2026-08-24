/**
 * Store-facing World Bible palette and font selection.
 *
 * The route-level API regression covers tenant isolation. This journey confirms
 * that a signed-in store staff member receives the scoped palette library and
 * can make both picker selections in the actual World Bible UI.
 */
import { test, expect } from "../fixtures/base.js";

const STORE_WORLD_ROUTE = "/store/ci_store_a/worldsmith";
const WORLD_NAME = "CI Editorial World";

async function openWorldBible(page: import("@playwright/test").Page) {
  await page.goto(STORE_WORLD_ROUTE);
  await expect(page.getByRole("article", { name: `Open ${WORLD_NAME}` })).toBeVisible();
  await page.getByRole("article", { name: `Open ${WORLD_NAME}` }).click();
  await page.getByRole("button", { name: "World Bible", exact: true }).click();
}

test.describe("Store World Bible catalog pickers", () => {
  test("store staff can choose a Daybook palette and font", async ({ asStaffA }) => {
    await openWorldBible(asStaffA);

    await asStaffA.getByRole("button", { name: "Use a Daybook palette" }).click();
    await expect(asStaffA.getByRole("button", { name: "CI Palette A" })).toBeVisible();
    await asStaffA.getByRole("button", { name: "CI Palette A" }).click();
    await expect(asStaffA.getByText("Daybook Palette: CI Palette A")).toBeVisible();

    const fontPicker = asStaffA.getByRole("button", { name: "Use a Daybook font" }).locator("xpath=..");
    await fontPicker.getByRole("button", { name: "Use a Daybook font" }).click();
    await expect.poll(async () => fontPicker.getByRole("button").count()).toBeGreaterThan(1);
    await fontPicker.getByRole("button").nth(1).click();
    await expect(fontPicker.getByRole("button", { name: /^Remove / })).toBeVisible();
  });
});