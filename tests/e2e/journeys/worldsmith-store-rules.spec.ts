/**
 * Store-facing World Bible permissions.
 *
 * The test-mode CI seed assigns both a store owner and staff member to the
 * same WorldSmith-enabled store. Neither check changes fixture data.
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

test.describe("Store World Bible rules permissions", () => {
  test("store staff can open the store Bible but cannot change World Rules", async ({ asStaffA }) => {
    await openWorldBible(asStaffA);

    await expect(asStaffA).toHaveURL(/\/store\/ci_store_a\/worldsmith$/);
    await expect(asStaffA.getByRole("note")).toHaveText(
      "World Rules are read-only for store staff. Ask a store owner to update them because they apply to every future image prompt.",
    );
    await expect(asStaffA.getByText("Keep all test content explicitly labelled as CI data.").last()).toBeVisible();
    await expect(asStaffA.getByRole("button", { name: "Remove rule 1" })).toHaveCount(0);
    await expect(asStaffA.getByPlaceholder("Add a rule…")).toHaveCount(0);
  });

  test("store owners retain World Rules controls", async ({ asOwnerA }) => {
    await openWorldBible(asOwnerA);

    await expect(asOwnerA.getByRole("button", { name: "Remove rule 1" })).toBeVisible();
    await expect(asOwnerA.getByPlaceholder("Add a rule…")).toBeVisible();
    await expect(asOwnerA.getByRole("note")).toHaveCount(0);
  });
});