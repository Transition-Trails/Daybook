import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, STARTER_SHAPE_RECIPES, stickerShapeRecipesTable } from "@workspace/db";

vi.mock("../middleware/requireRole", () => ({
  requireStoreAccess: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import shapeRecipesRouter from "../routes/shape-recipes";

function makeApp(actorStoreId: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.actor = {
      platformRole: null,
      isSuperAdmin: false,
      storeId: actorStoreId,
      storeRole: "store_owner",
      userId: "shape-recipe-route-test",
      effectiveRole: `${actorStoreId}:store_owner`,
    };
    next();
  });
  app.use(shapeRecipesRouter);
  return app;
}

describe("store shape recipe route scope", () => {
  beforeAll(async () => {
    await db.insert(stickerShapeRecipesTable).values([...STARTER_SHAPE_RECIPES]).onConflictDoNothing();
  });

  it("lists every seeded starter recipe for a store member", async () => {
    const response = await request(makeApp("store-alpha"))
      .get("/stores/store-alpha/sticker-shape-recipes");

    expect(response.status).toBe(200);
    expect(response.body.filter((recipe: { origin: string }) => recipe.origin === "starter")).toHaveLength(
      STARTER_SHAPE_RECIPES.length,
    );
  });

  it("blocks a member from reading another store's recipe catalog", async () => {
    const response = await request(makeApp("store-alpha"))
      .get("/stores/store-beta/sticker-shape-recipes");

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/cross-store|store/i);
  });

  it("blocks cross-store recipe preview before validating or rendering", async () => {
    const recipe = STARTER_SHAPE_RECIPES[0];
    const response = await request(makeApp("store-alpha"))
      .post("/stores/store-beta/sticker-shape-recipes/preview")
      .send(recipe);

    expect(response.status).toBe(403);
  });

  it("returns a physically sized 300-DPI cutline from the preview route", async () => {
    const recipe = STARTER_SHAPE_RECIPES[0];
    const response = await request(makeApp("store-alpha"))
      .post("/stores/store-alpha/sticker-shape-recipes/preview")
      .send(recipe);

    expect(response.status).toBe(200);
    expect(response.body.cutlineSvg).toContain('viewBox="0 0 709 236"');
    expect(response.body.cutlineSvg).toContain('width="60mm" height="20mm"');
  });

  it("rejects unsupported recipe shadows before rendering", async () => {
    const response = await request(makeApp("store-alpha"))
      .post("/stores/store-alpha/stickers/render/from-recipe")
      .send({ recipeId: STARTER_SHAPE_RECIPES[0].id, shadowStyle: "soft" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/shadowStyle is not supported/i);
  });

  it("allows only one of two concurrent starter creates with the same slug", async () => {
    const slug = `concurrent-starter-${crypto.randomUUID().slice(0, 8)}`;
    const body = {
      ...STARTER_SHAPE_RECIPES[0],
      id: undefined,
      name: "Concurrent starter",
      slug,
      status: "draft",
    };
    try {
      const responses = await Promise.all([
        request(makeApp("store-alpha")).post("/platform/sticker-shape-recipes").send(body),
        request(makeApp("store-alpha")).post("/platform/sticker-shape-recipes").send(body),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    } finally {
      await db.delete(stickerShapeRecipesTable).where(eq(stickerShapeRecipesTable.slug, slug));
    }
  });
});