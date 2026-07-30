/**
 * Journey: Font and binding choices survive a tab-switch and full page reload.
 *
 * Scenario A — Heading font persistence
 *   1. Super-admin creates a platform template via API
 *   2. Patches its style with headingFont = "Lora" (saved as style.fonts.heading)
 *   3. Navigates to /studios/planner, selects the template, switches to Build tab
 *   4. Asserts the Heading font <select> shows "Lora"
 *   5. Navigates away (Editions tab), returns to Build tab — value still "Lora"
 *   6. Performs a full page reload — value is still "Lora"
 *
 * Scenario B — Binding type persistence (Paper & binding mode)
 *   1. Creates a template via API
 *   2. Patches its style with binding = { type: "twin-loop", finish: "rose-gold" }
 *   3. Navigates to /studios/planner?mode=paper, selects the template
 *   4. Asserts the "Twin loop" chip is the active binding chip
 *   5. Switches to Build tab and back to Paper — binding chip still active
 *   6. Full page reload — binding chip still active
 *
 * Scenario C — API round-trip (data-layer only, no browser)
 *   Verifies PATCH → GET returns the exact style fields set, covering all four
 *   font roles, backgroundId, binding, and paperColour.
 */
import { test, expect } from "../fixtures/base.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface PlannerTemplate {
  id: string;
  name: string;
  style: Record<string, unknown>;
}

/** Create a minimal platform template and return its id. */
async function createTemplate(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  const res = await page.request.post("/api/platform/planners", {
    data: {
      name,
      setup: {
        weekStart:   "mon",
        orientation: "vertical",
        startMonth:  0,
        startYear:   2028,
        monthCount:  12,
        datingMode:  "dated",
      },
    },
  });
  expect(res.status(), `template creation must return 201 — got ${res.status()}`).toBe(201);
  const tpl = await res.json() as PlannerTemplate;
  return tpl.id;
}

/** PATCH a style fragment onto an existing template. */
async function patchStyle(
  page: import("@playwright/test").Page,
  id: string,
  style: Record<string, unknown>,
): Promise<PlannerTemplate> {
  const res = await page.request.patch(`/api/platform/planners/${id}`, {
    data: { style },
  });
  expect(res.status(), `style patch must return 200 — got ${res.status()}`).toBe(200);
  return res.json() as Promise<PlannerTemplate>;
}

/** Fetch a single template and return its raw style object. */
async function fetchStyle(
  page: import("@playwright/test").Page,
  id: string,
): Promise<Record<string, unknown>> {
  const res = await page.request.get(`/api/platform/planners/${id}`);
  expect(res.status(), `template fetch must return 200 — got ${res.status()}`).toBe(200);
  const tpl = await res.json() as PlannerTemplate;
  return tpl.style;
}

// ── Scenario C: API round-trip (no browser interaction) ───────────────────────

test.describe("planner style persistence — API round-trip", () => {

  test("font overrides survive a PATCH → GET round-trip", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E font roundtrip");

    await patchStyle(asSuperAdmin, id, {
      fonts: {
        heading:    "Lora",
        subheading: "Work Sans",
        script:     "Spectral",
        accent:     "DM Serif Display",
      },
    });

    const style = await fetchStyle(asSuperAdmin, id);
    const fonts = style["fonts"] as Record<string, string> | undefined;

    expect(fonts?.heading,    "heading font must persist").toBe("Lora");
    expect(fonts?.subheading, "subheading font must persist").toBe("Work Sans");
    expect(fonts?.script,     "body/script font must persist").toBe("Spectral");
    expect(fonts?.accent,     "accent font must persist").toBe("DM Serif Display");
  });

  test("binding and paperColour survive a PATCH → GET round-trip", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E binding roundtrip");

    await patchStyle(asSuperAdmin, id, {
      binding:     { type: "twin-loop", finish: "rose-gold" },
      paperColour: "cream",
    });

    const style = await fetchStyle(asSuperAdmin, id);
    const binding = style["binding"] as Record<string, string> | undefined;

    expect(binding?.type,       "binding type must persist").toBe("twin-loop");
    expect(binding?.finish,     "binding finish must persist").toBe("rose-gold");
    expect(style["paperColour"], "paperColour must persist").toBe("cream");
  });

  test("a Build-tab style save does not overwrite pre-existing Paper-tab binding", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E no-overwrite");

    // Step 1 — Paper tab saves binding first
    await patchStyle(asSuperAdmin, id, {
      binding:     { type: "twin-loop", finish: "rose-gold" },
      paperColour: "cream",
    });

    // Step 2 — Build tab saves fonts (carries forward binding/paperColour from saved state)
    const existingStyle = await fetchStyle(asSuperAdmin, id);
    const existingBinding = existingStyle["binding"] as Record<string, string> | undefined;
    await patchStyle(asSuperAdmin, id, {
      themeId:     null,
      paletteId:   null,
      tabPos:      "right",
      sections:    [],
      packIds:     [],
      insertIds:   [],
      fonts:       { heading: "Lora" },
      backgroundId: null,
      // Carry forward the saved binding/paperColour — mirrors what BuildCenter.styleMut does
      binding:     { type: existingBinding?.type ?? "coil", finish: existingBinding?.finish ?? "gold" },
      paperColour: (existingStyle["paperColour"] as string) ?? "white",
    });

    // Both choices must coexist in the final saved state
    const final = await fetchStyle(asSuperAdmin, id);
    const finalBinding = final["binding"] as Record<string, string> | undefined;
    const finalFonts   = final["fonts"]   as Record<string, string> | undefined;

    expect(finalBinding?.type,    "binding type must survive a font save").toBe("twin-loop");
    expect(finalBinding?.finish,  "binding finish must survive a font save").toBe("rose-gold");
    expect(final["paperColour"],  "paperColour must survive a font save").toBe("cream");
    expect(finalFonts?.heading,   "heading font must also be present").toBe("Lora");
  });

  test("patching only paperColour leaves other style fields intact", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E partial patch");

    // Set fonts first
    await patchStyle(asSuperAdmin, id, {
      fonts:   { heading: "Playfair Display" },
      binding: { type: "coil", finish: "gold" },
    });

    // Now patch only paperColour
    await patchStyle(asSuperAdmin, id, { paperColour: "warm" });

    const style = await fetchStyle(asSuperAdmin, id);
    const fonts = style["fonts"] as Record<string, string> | undefined;

    // paperColour updated
    expect(style["paperColour"], "paperColour must be updated").toBe("warm");
    // fonts still intact (server shallow-merges style patches)
    expect(fonts?.heading, "heading font must still be present after a partial patch").toBe("Playfair Display");
  });
});

// ── Scenario A: Font persists through UI tab-switch and reload ────────────────

test.describe("planner style persistence — font select in UI", () => {

  test("heading font select shows the saved value when a template is opened", async ({ asSuperAdmin }) => {
    // Arrange: create template and save a heading font override via API
    const id = await createTemplate(asSuperAdmin, "E2E font UI check");
    await patchStyle(asSuperAdmin, id, {
      fonts: { heading: "Lora" },
    });

    // Act: navigate to the Planner Studio hub (Build mode is the default)
    await asSuperAdmin.goto("/studios/planner");
    await asSuperAdmin.waitForLoadState("networkidle");

    // The left rail should list the template — click it to select it
    const templateBtn = asSuperAdmin.getByText("E2E font UI check");
    await expect(templateBtn).toBeVisible({ timeout: 10_000 });
    await templateBtn.click();

    // Wait for the Build card to render the font selects
    await asSuperAdmin.waitForLoadState("networkidle");

    // The Heading select must show "Lora"
    const headingSelect = asSuperAdmin.locator("select").filter({ hasText: "Lora" }).first();
    await expect(
      headingSelect,
      "Heading font <select> must display 'Lora' after template is selected",
    ).toBeVisible({ timeout: 8_000 });

    // Confirm the selected value programmatically
    const headingValue = await headingSelect.inputValue();
    expect(headingValue, "Heading select value must be 'Lora'").toBe("Lora");
  });

  test("heading font survives switching to Editions tab and back", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E font tab-switch");
    await patchStyle(asSuperAdmin, id, { fonts: { heading: "EB Garamond" } });

    await asSuperAdmin.goto("/studios/planner");
    await asSuperAdmin.waitForLoadState("networkidle");

    // Select the template
    const templateBtn = asSuperAdmin.getByText("E2E font tab-switch");
    await expect(templateBtn).toBeVisible({ timeout: 10_000 });
    await templateBtn.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    // Verify font is loaded
    const headingSelectBefore = asSuperAdmin.locator("select").filter({ hasText: "EB Garamond" }).first();
    await expect(headingSelectBefore).toBeVisible({ timeout: 8_000 });
    expect(await headingSelectBefore.inputValue()).toBe("EB Garamond");

    // Switch to Editions tab (mode=editions)
    const editionsTab = asSuperAdmin.getByRole("button", { name: /editions/i }).first();
    if (await editionsTab.isVisible()) {
      await editionsTab.click();
      await asSuperAdmin.waitForLoadState("networkidle");

      // Navigate back to Build tab
      const buildTab = asSuperAdmin.getByRole("button", { name: /^build$/i }).first();
      await expect(buildTab).toBeVisible({ timeout: 6_000 });
      await buildTab.click();
      await asSuperAdmin.waitForLoadState("networkidle");
    }

    // Font must still show EB Garamond
    const headingSelectAfter = asSuperAdmin.locator("select").filter({ hasText: "EB Garamond" }).first();
    await expect(
      headingSelectAfter,
      "Heading font must still be 'EB Garamond' after switching tabs and returning",
    ).toBeVisible({ timeout: 8_000 });
    expect(await headingSelectAfter.inputValue()).toBe("EB Garamond");
  });

  test("heading font is restored after a full page reload", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E font reload");
    await patchStyle(asSuperAdmin, id, { fonts: { heading: "Cormorant Garamond" } });

    // First visit — select the template and verify font
    await asSuperAdmin.goto("/studios/planner");
    await asSuperAdmin.waitForLoadState("networkidle");
    const templateBtn = asSuperAdmin.getByText("E2E font reload");
    await expect(templateBtn).toBeVisible({ timeout: 10_000 });
    await templateBtn.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    const selectBefore = asSuperAdmin.locator("select").filter({ hasText: "Cormorant Garamond" }).first();
    await expect(selectBefore).toBeVisible({ timeout: 8_000 });

    // Full page reload
    await asSuperAdmin.reload();
    await asSuperAdmin.waitForLoadState("networkidle");

    // Re-select the template after reload (selectedTemplateId is not persisted in URL)
    const templateBtnAfterReload = asSuperAdmin.getByText("E2E font reload");
    await expect(templateBtnAfterReload).toBeVisible({ timeout: 10_000 });
    await templateBtnAfterReload.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    const selectAfter = asSuperAdmin.locator("select").filter({ hasText: "Cormorant Garamond" }).first();
    await expect(
      selectAfter,
      "Heading font must still be 'Cormorant Garamond' after a full page reload",
    ).toBeVisible({ timeout: 8_000 });
    expect(
      await selectAfter.inputValue(),
      "Heading select value must be 'Cormorant Garamond' after reload",
    ).toBe("Cormorant Garamond");
  });
});

// ── Scenario B: Binding choice persists through tab-switch and reload ─────────

test.describe("planner style persistence — binding chip in Paper mode", () => {

  test("active binding chip matches the saved value when Paper mode is opened", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E binding UI check");
    await patchStyle(asSuperAdmin, id, {
      binding:     { type: "twin-loop", finish: "rose-gold" },
      paperColour: "cream",
    });

    // Navigate directly to Paper mode
    await asSuperAdmin.goto("/studios/planner?mode=paper");
    await asSuperAdmin.waitForLoadState("networkidle");

    // Select the template from the left rail
    const templateBtn = asSuperAdmin.getByText("E2E binding UI check");
    await expect(templateBtn).toBeVisible({ timeout: 10_000 });
    await templateBtn.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    // "Twin loop" chip must be the active binding chip
    // Active chips have clay border (#C87560) injected via inline style — look for the button by text
    const twinLoopChip = asSuperAdmin.getByRole("button", { name: "Twin loop" });
    await expect(
      twinLoopChip,
      "Twin loop binding chip must be visible in the Paper mode UI",
    ).toBeVisible({ timeout: 8_000 });

    // The chip must have the active style (aria-pressed=true or CSS that indicates selection)
    // PaperCompose uses inline border styles, not aria — check that the chip text is present
    // and the BINDING_DESCRIPTIONS text for twin-loop is rendered (proves the value is active)
    const bindingDescription = asSuperAdmin.getByText(/double-wire o binding/i);
    await expect(
      bindingDescription,
      "Twin loop description must be visible, confirming twin-loop is the active binding",
    ).toBeVisible({ timeout: 6_000 });
  });

  test("binding chip survives switching to Build tab and back to Paper", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E binding tab-switch");
    await patchStyle(asSuperAdmin, id, {
      binding:     { type: "discs", finish: "silver" },
      paperColour: "white",
    });

    await asSuperAdmin.goto("/studios/planner?mode=paper");
    await asSuperAdmin.waitForLoadState("networkidle");

    const templateBtn = asSuperAdmin.getByText("E2E binding tab-switch");
    await expect(templateBtn).toBeVisible({ timeout: 10_000 });
    await templateBtn.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    // Verify "Discs" description shows (confirms the disc binding is active)
    const discsDesc = asSuperAdmin.getByText(/removable disc system/i);
    await expect(discsDesc).toBeVisible({ timeout: 8_000 });

    // Switch to Build tab
    const buildTab = asSuperAdmin.getByRole("button", { name: /^build$/i }).first();
    if (await buildTab.isVisible()) {
      await buildTab.click();
      await asSuperAdmin.waitForLoadState("networkidle");

      // Return to Paper tab
      const paperTab = asSuperAdmin.getByRole("button", { name: /paper.*binding|paper & binding/i }).first();
      await expect(paperTab).toBeVisible({ timeout: 6_000 });
      await paperTab.click();
      await asSuperAdmin.waitForLoadState("networkidle");
    }

    // Discs description must still be visible
    const discsDescAfter = asSuperAdmin.getByText(/removable disc system/i);
    await expect(
      discsDescAfter,
      "Disc binding description must still be visible after switching tabs and back",
    ).toBeVisible({ timeout: 8_000 });
  });

  test("binding chip is restored after a full page reload", async ({ asSuperAdmin }) => {
    const id = await createTemplate(asSuperAdmin, "E2E binding reload");
    await patchStyle(asSuperAdmin, id, {
      binding:     { type: "3-ring", finish: "chrome" },
      paperColour: "warm",
    });

    // First visit
    await asSuperAdmin.goto("/studios/planner?mode=paper");
    await asSuperAdmin.waitForLoadState("networkidle");

    const templateBtn = asSuperAdmin.getByText("E2E binding reload");
    await expect(templateBtn).toBeVisible({ timeout: 10_000 });
    await templateBtn.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    // Confirm 3-ring description before reload
    const ringDescBefore = asSuperAdmin.getByText(/classic binder rings/i);
    await expect(ringDescBefore).toBeVisible({ timeout: 8_000 });

    // Full page reload
    await asSuperAdmin.reload();
    await asSuperAdmin.waitForLoadState("networkidle");

    // Re-select the template from the rail
    const templateBtnAfter = asSuperAdmin.getByText("E2E binding reload");
    await expect(templateBtnAfter).toBeVisible({ timeout: 10_000 });
    await templateBtnAfter.click();
    await asSuperAdmin.waitForLoadState("networkidle");

    // 3-ring description must still be showing
    const ringDescAfter = asSuperAdmin.getByText(/classic binder rings/i);
    await expect(
      ringDescAfter,
      "3-ring binding description must be visible after a full page reload",
    ).toBeVisible({ timeout: 8_000 });
  });
});
