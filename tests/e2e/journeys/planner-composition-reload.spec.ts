import { test, expect } from "../fixtures/base.js";

const STORE_ID = "ci_store_a";

test("development admin session and planner placement survive a reload", async ({ asSuperAdmin }) => {
  const impersonate = await asSuperAdmin.request.post(`/api/stores/${STORE_ID}/impersonate`);
  expect(impersonate.status(), "super admin must enter the seeded store").toBe(200);

  const create = await asSuperAdmin.request.post(`/api/stores/${STORE_ID}/planners`, {
    data: {
      productType: "planner",
      year: 2098,
      setup: {
        monthCount: 1,
        startMonth: 0,
        startYear: 2098,
        weekStart: "mon",
        orientation: "vertical",
        datingMode: "dated",
      },
      style: { size: "A5", sections: [] },
      output: { calMode: "week", eventMins: 30, aiInPdf: false },
    },
  });
  expect(create.status(), "planner fixture must be created").toBe(201);

  const createWidget = await asSuperAdmin.request.post(`/api/stores/${STORE_ID}/widgets`, {
    data: {
      name: `Reload widget ${Date.now()}`,
      sizeVariants: ["7-day"],
      svgData: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect x="2" y="2" width="116" height="76" rx="8" fill="{{slot:paper}}" stroke="{{slot:ink}}"/><path d="M18 24h84M18 40h84M18 56h84" stroke="{{slot:accent}}" stroke-width="3"/></svg>',
      paletteSlots: {
        paper: "paper",
        ink: "ink",
        accent: "accent",
      },
    },
  });
  expect(createWidget.status(), "widget fixture must be created").toBe(201);

  await asSuperAdmin.goto(`/store/${STORE_ID}/studios/planners`);
  await expect(asSuperAdmin.getByRole("button", { name: /2098 Planner/i }).last()).toBeVisible();
  await asSuperAdmin.getByRole("button", { name: /2098 Planner/i }).last().click();
  await asSuperAdmin.getByRole("button", { name: "Inserts & widgets" }).click();

  const widget = asSuperAdmin.locator('[data-testid^="button-place-widget-"]').first();
  await expect(widget, "the seeded store must expose a widget").toBeVisible();
  await widget.click();

  const placementLabel = `Reload placement ${Date.now()}`;
  await asSuperAdmin.getByTestId("input-placement-label").fill(placementLabel);
  await asSuperAdmin.getByTestId("button-save-composition").click();
  await expect(asSuperAdmin.getByTestId("status-composition-save")).toHaveText("Saved just now");

  await asSuperAdmin.reload();
  await expect(asSuperAdmin, "reload must not bounce the authenticated admin").not.toHaveURL(/\/unauthorized/);
  await expect(asSuperAdmin.getByRole("button", { name: /2098 Planner/i }).last()).toBeVisible();
  await asSuperAdmin.getByRole("button", { name: /2098 Planner/i }).last().click();
  await asSuperAdmin.getByRole("button", { name: "Inserts & widgets" }).click();

  await expect(asSuperAdmin.getByText(placementLabel)).toBeVisible();
});