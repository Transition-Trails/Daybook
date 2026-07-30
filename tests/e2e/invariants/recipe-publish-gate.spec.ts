/**
 * Invariant: a product recipe with a "Blocks release" engine gap cannot be published.
 *
 * Tests:
 *  1. ci_bad_recipe has status=draft (can be saved)
 *  2. POST publish on ci_bad_recipe → 409 with ENGINE_GAPS_BLOCK_RELEASE
 *  3. Remove the blocking gap → publish succeeds → 200
 *  4. A recipe with no gaps publishes on first attempt
 *
 * The server must enforce this — the admin UI "publish" button is not the gate.
 */
import { test, expect } from "../fixtures/base.js";

const BAD_RECIPE_ID = "ci_bad_recipe";

test.describe("recipe-publish-gate invariant", () => {
  test("ci_bad_recipe exists as a draft in the DB", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.get(`/api/platform/recipes/${BAD_RECIPE_ID}`);
    expect(res.status(), "bad recipe should be fetchable").toBe(200);
    const recipe = await res.json() as { status: string; claudeBrief?: { engineGaps?: unknown[] } };
    expect(recipe.status, "bad recipe should be in draft status").toBe("draft");
    const gaps = recipe.claudeBrief?.engineGaps ?? [];
    expect(gaps.length, "bad recipe should have at least one engine gap").toBeGreaterThan(0);
  });

  test("publishing a recipe with a Blocks-release gap returns 409", async ({ asSuperAdmin }) => {
    const res = await asSuperAdmin.request.post(`/api/platform/recipes/${BAD_RECIPE_ID}/publish`);
    expect(res.status(), "blocked recipe must return 409 Conflict").toBe(409);
    const body = await res.json() as { code?: string; error?: string };
    expect(body.code, "error code must be ENGINE_GAPS_BLOCK_RELEASE").toBe("ENGINE_GAPS_BLOCK_RELEASE");
  });

  test("removing the blocking gap allows publish", async ({ asSuperAdmin }) => {
    // Create a fresh recipe with a blocking gap
    const createRes = await asSuperAdmin.request.post("/api/platform/recipes", {
      data: {
        name:     "CI publish gate — gap then clear",
        category: "planner",
        parts:    [],
        claudeBrief: {
          assistantGrounding: "CI test",
          engineGaps: [
            { severity: "Blocks release", description: "CI gap", gap: "ci_removable_gap" },
          ],
        },
      },
    });
    expect(createRes.status(), "recipe creation should succeed").toBe(201);
    const { id } = await createRes.json() as { id: string };

    // Attempt to publish → must fail
    const block = await asSuperAdmin.request.post(`/api/platform/recipes/${id}/publish`);
    expect(block.status(), "should be blocked while gap exists").toBe(409);

    // Clear the blocking gap
    const patch = await asSuperAdmin.request.patch(`/api/platform/recipes/${id}`, {
      data: {
        claudeBrief: {
          assistantGrounding: "CI test — gap cleared",
          engineGaps: [],
        },
      },
    });
    expect(patch.status(), "patching recipe should succeed").toBe(200);

    // Now publish should succeed
    const publish = await asSuperAdmin.request.post(`/api/platform/recipes/${id}/publish`);
    expect(publish.status(), "publish should succeed after gap is removed").toBe(200);

    const published = await publish.json() as { status: string };
    expect(published.status, "recipe status should now be live").toBe("live");
  });

  test("a recipe with no gaps publishes on first attempt", async ({ asSuperAdmin }) => {
    const createRes = await asSuperAdmin.request.post("/api/platform/recipes", {
      data: {
        name:     "CI publish gate — clean recipe",
        category: "planner",
        parts:    [],
        claudeBrief: {
          assistantGrounding: "CI test — no gaps",
          engineGaps: [],
        },
      },
    });
    expect(createRes.status()).toBe(201);
    const { id } = await createRes.json() as { id: string };

    const res = await asSuperAdmin.request.post(`/api/platform/recipes/${id}/publish`);
    expect(res.status(), "clean recipe should publish with 200").toBe(200);
  });
});
