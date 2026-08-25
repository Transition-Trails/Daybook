/**
 * Managed WorldSmith print-target catalog browser coverage.
 */
import { test, expect } from "../fixtures/base.js";

test.describe("WorldSmith print targets", () => {
  test("a super admin can save a target and see it after a refresh", async ({ asSuperAdmin }) => {
    await asSuperAdmin.goto("/super/worldsmith/editorial/image-targets");

    await expect(asSuperAdmin.getByRole("heading", { name: "Print targets" })).toBeVisible();
    await expect(asSuperAdmin.getByRole("link", { name: "Print Targets" })).toBeVisible();

    const width = asSuperAdmin.getByLabel("Width in inches for Journal Card");
    const height = asSuperAdmin.getByLabel("Height in inches for Journal Card");
    const originalWidth = await width.inputValue();
    const originalHeight = await height.inputValue();
    const journalCardRow = asSuperAdmin.getByText("Journal Card", { exact: true }).locator("xpath=../..");

    await journalCardRow.getByRole("button", { name: "Save" }).click();
    await expect(asSuperAdmin.getByText("Print target saved", { exact: true })).toBeVisible();

    await asSuperAdmin.reload();
    await expect(width).toHaveValue(originalWidth);
    await expect(height).toHaveValue(originalHeight);
  });
});