import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { ActorContext } from "../lib/roles";
import { requireAuth } from "../lib/auth-middleware";
import {
  authorizePlannerPreviewRequest,
  canPreviewCatalogAsset,
} from "../lib/planner-preview-authorization";

const storeActor: ActorContext = {
  userId: "staff-b",
  platformRole: null,
  isSuperAdmin: false,
  storeId: "store-b",
  storeRole: "store_staff",
  effectiveRole: "store-b:store_staff",
};

function makePreviewApi(actor: ActorContext) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isAuthenticated = (() => true) as Request["isAuthenticated"];
    req.actor = actor;
    next();
  });
  app.post(
    "/api/planners/preview",
    requireAuth,
    authorizePlannerPreviewRequest,
    (_req, res) => res.status(200).type("application/pdf").send("%PDF-preview"),
  );
  return app;
}

describe("planner preview catalog authorization", () => {
  it("blocks a valid store member from previewing another store's private asset", () => {
    expect(canPreviewCatalogAsset(storeActor, {
      authoredByStoreId: "store-a",
      status: "live",
    })).toBe(false);
  });

  it("blocks a forged store header without membership when store context is omitted", () => {
    expect(canPreviewCatalogAsset({
      ...storeActor,
      storeId: "store-a",
      storeRole: null,
      effectiveRole: "authenticated",
    }, {
      authoredByStoreId: "store-a",
      status: "live",
    })).toBe(false);
  });

  it("allows the current store's assets and live global catalog assets only", () => {
    expect(canPreviewCatalogAsset(storeActor, { authoredByStoreId: "store-b", status: "draft" })).toBe(true);
    expect(canPreviewCatalogAsset(storeActor, { authoredByStoreId: null, status: "live" })).toBe(true);
    expect(canPreviewCatalogAsset(storeActor, { authoredByStoreId: null, status: "draft" })).toBe(false);
  });

  it("limits customer catalog previews to live assets in their own store", () => {
    const customer: ActorContext = { ...storeActor, storeRole: "customer" };
    expect(canPreviewCatalogAsset(customer, { authoredByStoreId: "store-b", status: "live" })).toBe(true);
    expect(canPreviewCatalogAsset(customer, { authoredByStoreId: "store-b", status: "draft" })).toBe(false);
    expect(canPreviewCatalogAsset(customer, { authoredByStoreId: "store-a", status: "live" })).toBe(false);
  });

  it("allows a customer session to preview the storefront catalog for its store", async () => {
    const customer: ActorContext = {
      ...storeActor,
      userId: "customer-a",
      storeRole: "customer",
      effectiveRole: "store-b:customer",
    };
    const response = await request(makePreviewApi(customer))
      .post("/api/planners/preview")
      .send({
        storeContext: { storeId: "store-b" },
        setup: { weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: 2027, monthCount: 12 },
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
  });

  it("blocks customer preview requests scoped to another store", async () => {
    const customer: ActorContext = {
      ...storeActor,
      storeRole: "customer",
      effectiveRole: "store-b:customer",
    };
    const response = await request(makePreviewApi(customer))
      .post("/api/planners/preview")
      .send({ storeContext: { storeId: "store-a" } });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/cross-store/i);
  });

  it("blocks customers from using preview for staff-only widget composition authoring", async () => {
    const customer: ActorContext = {
      ...storeActor,
      storeRole: "customer",
      effectiveRole: "store-b:customer",
    };
    const response = await request(makePreviewApi(customer))
      .post("/api/planners/preview")
      .send({
        storeContext: { storeId: "store-b" },
        style: { composition: { placements: [{ widgetId: "widget-1" }] } },
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/store staff/i);
  });

  it("preserves store staff composition preview access", async () => {
    const response = await request(makePreviewApi(storeActor))
      .post("/api/planners/preview")
      .send({
        storeContext: { storeId: "store-b" },
        style: { composition: { placements: [{ widgetId: "widget-1" }] } },
      });

    expect(response.status).toBe(200);
  });
});