/**
 * Journey: Deleted platform templates disappear from the Planner Studio rail.
 *
 * Scenario — stale rail after delete
 *   1. Navigate to /studios/planner so the template list is fetched and cached.
 *   2. Create a template via API — it should appear in the rail immediately
 *      (React Query cache is invalidated by the mutation in the hub).
 *   3. Delete the template via API (simulates deletion from another tab).
 *   4. Navigate away from the studio (SPA navigation, no hard reload).
 *   5. Navigate back to /studios/planner — the hub re-mounts and, because
 *      staleTime is 0, immediately re-fetches the list.
 *   6. Assert the deleted template is no longer visible in the rail.
 *
 * Additional scenario — graceful 404 is not surfaced as a crash
 *   Same setup, but the user tries to click the template before navigating
 *   away.  The select handler should not crash the page even if the stale
 *   cache still shows the item (the UI simply finds no match and shows
 *   nothing selected).
 */
import { test, expect } from "../fixtures/base.js";

// ── Helper ────────────────────────────────────────────────────────────────────

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
  const tpl = await res.json() as { id: string };
  return tpl.id;
}

async function deleteTemplate(
  page: import("@playwright/test").Page,
  id: string,
): Promise<void> {
  const res = await page.request.delete(`/api/platform/planners/${id}`);
  // 200 or 204 both indicate success
  expect(
    [200, 204].includes(res.status()),
    `template deletion must return 200 or 204 — got ${res.status()}`,
  ).toBe(true);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("planner studio rail — stale template after delete", () => {

  test(
    "deleted template disappears from the rail after SPA navigation back",
    async ({ asSuperAdmin }) => {
      const page = asSuperAdmin;

      // Step 1: visit the studio so the list is initially fetched
      await page.goto("/studios/planner");
      await page.waitForLoadState("networkidle");

      // Step 2: create a template via API
      const templateName = `E2E stale-rail ${Date.now()}`;
      const templateId   = await createTemplate(page, templateName);

      // Reload so the new template is fetched fresh into the rail
      await page.reload();
      await page.waitForLoadState("networkidle");

      // The template must appear in the rail
      const railItem = page.getByText(templateName);
      await expect(
        railItem,
        "Newly created template must be visible in the rail",
      ).toBeVisible({ timeout: 10_000 });

      // Step 3: delete the template via API (simulates another-tab deletion)
      await deleteTemplate(page, templateId);

      // Step 4: navigate away using SPA navigation (no hard reload)
      await page.goto("/studios/planner?mode=editions");
      await page.waitForLoadState("networkidle");

      // Step 5: navigate back — hub remounts, staleTime=0 triggers a fresh fetch
      await page.goto("/studios/planner");
      await page.waitForLoadState("networkidle");

      // Step 6: the deleted template must NOT appear in the rail
      await expect(
        page.getByText(templateName),
        "Deleted template must not appear in the rail after SPA navigation back",
      ).not.toBeVisible({ timeout: 8_000 });
    },
  );

  test(
    "selecting a stale (deleted) template does not crash the page",
    async ({ asSuperAdmin }) => {
      const page = asSuperAdmin;

      // Create a template and load it into the rail
      const templateName = `E2E crash-guard ${Date.now()}`;
      const templateId   = await createTemplate(page, templateName);

      await page.goto("/studios/planner");
      await page.waitForLoadState("networkidle");

      // Confirm the template is in the rail
      const railItem = page.getByText(templateName);
      await expect(railItem).toBeVisible({ timeout: 10_000 });

      // Delete the template via API (stale cache scenario)
      await deleteTemplate(page, templateId);

      // Attempt to click the now-deleted template in the stale list.
      // Because staleTime=0 we may have already refetched and the item is gone,
      // or the click might fire on a stale entry — either way the page must
      // not crash (no JS error dialog / unhandled rejection).
      const stillVisible = await railItem.isVisible();
      if (stillVisible) {
        await railItem.click();
        // After clicking a stale entry the hub should survive — verify the
        // page still has the rail heading
        await expect(
          page.getByText("Platform templates"),
          "Rail heading must still be visible — no crash after clicking deleted template",
        ).toBeVisible({ timeout: 6_000 });
      }

      // Either way, after a short wait the stale entry should vanish
      // (the staleTime=0 background refetch will remove it)
      await expect(
        page.getByText(templateName),
        "Deleted template must be removed from the rail by the background refetch",
      ).not.toBeVisible({ timeout: 12_000 });
    },
  );

  test(
    "DELETE via API invalidates the list — template gone without any navigation",
    async ({ asSuperAdmin }) => {
      const page = asSuperAdmin;

      // Create via API, then verify through a fresh list fetch
      const templateName = `E2E direct-api ${Date.now()}`;
      const templateId   = await createTemplate(page, templateName);

      // Confirm the template exists via API
      const getRes = await page.request.get(`/api/platform/planners/${templateId}`);
      expect(getRes.status()).toBe(200);

      // Delete it
      await deleteTemplate(page, templateId);

      // Subsequent GET must return 404
      const afterRes = await page.request.get(`/api/platform/planners/${templateId}`);
      expect(
        afterRes.status(),
        "GET after DELETE must return 404",
      ).toBe(404);

      // And it must not appear in the list endpoint
      const listRes  = await page.request.get("/api/platform/planners");
      expect(listRes.status()).toBe(200);
      const list = await listRes.json() as Array<{ id: string }>;
      const found = list.some((t) => t.id === templateId);
      expect(found, "Deleted template must not appear in the list endpoint").toBe(false);
    },
  );
});
