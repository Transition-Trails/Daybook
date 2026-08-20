/**
 * Editorial Studio regression coverage.
 *
 * The test-mode CI seed provides all referenced IDs and test login creates the
 * super-admin browser session. This keeps authenticated rich-text coverage
 * isolated from real editorial records.
 */
import { test, expect } from "../fixtures/base.js";

const FIXTURES = {
  worldId: "ci_editorial_world",
  canonRecordId: "ci_editorial_canon_record",
  styleGuideId: "ci_editorial_style_guide",
  promptModuleId: "ci_editorial_prompt_module",
  specId: "ci_editorial_spec",
} as const;

function contentEditor(page: import("@playwright/test").Page) {
  return page.locator('[contenteditable="true"]');
}

test.describe("Editorial Studio rich text", () => {
  test("a super admin can edit, navigate, and safely save editorial prose", async ({ asSuperAdmin }) => {
    const browserErrors: string[] = [];
    const failedApiRequests: string[] = [];
    asSuperAdmin.on("pageerror", error => browserErrors.push(error.message));
    asSuperAdmin.on("console", message => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    asSuperAdmin.on("response", response => {
      if (response.url().includes("/api/") && response.status() >= 400) {
        failedApiRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    await test.step("open a Production Spec and use its Creative rich-text sections", async () => {
      await asSuperAdmin.goto(`/super/worldsmith/editorial/specs/${FIXTURES.specId}`);
      await asSuperAdmin.getByRole("button", { name: "Creative" }).click();

      for (const title of ["Design Intent", "Narrative Purpose", "Required Content", "Review Criteria"]) {
        await expect(asSuperAdmin.getByText(title, { exact: true })).toBeVisible();
      }

      const designIntent = contentEditor(asSuperAdmin).first();
      await designIntent.click();
      await asSuperAdmin.getByRole("button", { name: "Bold" }).click();
      await designIntent.press("End");
      await designIntent.type(" toolbar check");

      const narrativePurpose = asSuperAdmin.getByRole("button", { name: /Narrative Purpose/ });
      await narrativePurpose.click();
      await expect(narrativePurpose).toHaveAttribute("aria-expanded", "true");
    });

    await test.step("use Canon Record prose accordions and the World Bible link", async () => {
      await asSuperAdmin.goto(`/super/worldsmith/editorial/canon/${FIXTURES.canonRecordId}`);
      for (const title of ["Narrative", "Historical Context", "Visual Notes", "Notes"]) {
        await expect(asSuperAdmin.getByText(title, { exact: true })).toBeVisible();
      }

      const narrative = asSuperAdmin.getByRole("button", { name: /Narrative/ }).first();
      await narrative.click();
      await expect(narrative).toHaveAttribute("aria-expanded", "false");
      await narrative.click();
      await expect(narrative).toHaveAttribute("aria-expanded", "true");
      // At the desktop test viewport this spans the complete 433px prose rail,
      // rather than a narrow card-sized column.
      expect((await narrative.boundingBox())?.width).toBeGreaterThan(400);

      await asSuperAdmin.getByText("Open World Bible", { exact: true }).click();
      await expect(asSuperAdmin).toHaveURL(/\/super\/worldsmith\/editorial\/bible$/);
    });

    await test.step("use in-page Style Guide and Prompt Module routes", async () => {
      await asSuperAdmin.goto(`/super/worldsmith/editorial/style-guides/${FIXTURES.styleGuideId}`);
      await expect(asSuperAdmin).toHaveURL(new RegExp(`/style-guides/${FIXTURES.styleGuideId}$`));
      await expect(asSuperAdmin.getByText("Editorial Document", { exact: true })).toBeVisible();

      await asSuperAdmin.goto(`/super/worldsmith/editorial/modules/${FIXTURES.promptModuleId}`);
      await expect(asSuperAdmin).toHaveURL(new RegExp(`/modules/${FIXTURES.promptModuleId}$`));
      await expect(asSuperAdmin.getByText("Editorial Document", { exact: true })).toBeVisible();
    });

    await test.step("preserve permitted formatting and remove unsafe markup on save", async () => {
      const styleGuidePath = `/api/v1/editorial/style-guides/${FIXTURES.styleGuideId}`;
      const originalResponse = await asSuperAdmin.request.get(styleGuidePath);
      expect(originalResponse.ok()).toBe(true);
      const originalContent = (await originalResponse.json()).style_guide.content as string;

      try {
        await asSuperAdmin.goto(`/super/worldsmith/editorial/style-guides/${FIXTURES.styleGuideId}`);
        const editor = contentEditor(asSuperAdmin);
        await editor.click();
        await editor.press("Control+A");
        await editor.type("Retained formatting from authenticated browser save");
        await editor.press("Control+A");
        await asSuperAdmin.getByRole("button", { name: "Bold" }).click();
        await editor.press("Control+A");
        await asSuperAdmin.getByRole("button", { name: "Italic" }).click();
        await asSuperAdmin.getByRole("button", { name: "Save", exact: true }).click();
        await expect(asSuperAdmin.getByText("Style Guide saved", { exact: true })).toBeVisible();

        await asSuperAdmin.reload();
        const formattedHtml = await contentEditor(asSuperAdmin).innerHTML();
        expect(formattedHtml).toMatch(/<(strong|b)>/);
        expect(formattedHtml).toMatch(/<(em|i)>/);
        expect(formattedHtml).toContain("Retained formatting from authenticated browser save");

        const unsafeSave = await asSuperAdmin.request.patch(styleGuidePath, {
          data: {
            content: '<p><strong>Retained bold prose</strong> <em>and italic prose</em>.</p><ul><li>Retained list item</li></ul><img src=x onerror="window.__unsafe=1"><script>window.__unsafe=2</script>',
          },
        });
        expect(unsafeSave.ok()).toBe(true);

        await asSuperAdmin.reload();
        const sanitizedHtml = await contentEditor(asSuperAdmin).innerHTML();
        expect(sanitizedHtml).toContain("<strong>Retained bold prose</strong>");
        expect(sanitizedHtml).toContain("<em>and italic prose</em>");
        expect(sanitizedHtml).toContain("<ul><li>Retained list item</li></ul>");
        expect(sanitizedHtml).not.toMatch(/<script|onerror=|<img/i);
      } finally {
        const restore = await asSuperAdmin.request.patch(styleGuidePath, {
          data: { content: originalContent },
        });
        expect(restore.ok()).toBe(true);
        const restored = await asSuperAdmin.request.get(styleGuidePath);
        expect((await restored.json()).style_guide.content).toBe(originalContent);
      }
    });

    expect(browserErrors).toEqual([]);
    expect(failedApiRequests).toEqual([]);
  });
});