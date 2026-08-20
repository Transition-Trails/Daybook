/**
 * Editorial Studio navigation coverage.
 *
 * The test-mode CI seed provides the world used by the Editorial shell, while
 * the test-only login route creates the deterministic super-admin session.
 */
import { test, expect } from "../fixtures/base.js";

test.describe("Editorial Studio navigation", () => {
  test("a super admin can reach the Readiness Board from the Editorial sidebar", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/worldsmith/editorial/bible");

    const readinessBoardLink = asSuperAdmin.getByRole("link", { name: "Readiness Board" });
    await expect(readinessBoardLink).toBeVisible();
    await readinessBoardLink.click();

    await expect(asSuperAdmin).toHaveURL(/\/super\/worldsmith\/editorial\/board$/);
    await expect(asSuperAdmin.getByText("Readiness Board", { exact: true }).first()).toBeVisible();
    await expect(asSuperAdmin.getByText("Drafts", { exact: true })).toBeVisible();
  });
});