/**
 * Platform planner generation background round-trip regression.
 *
 * This deliberately goes through the persisted catalog rows and the real
 * platform generation route. The response must preserve safe background
 * metadata when rendering falls back, without exposing the stored asset.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { db } from "@workspace/db";
import {
  backgroundsTable,
  editionsTable,
  platformPlannerTemplatesTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { User } from "@workspace/db";
import platformPlannersRouter from "../routes/platform-planners.js";

const RUN = Math.random().toString(36).slice(2, 10);
const ids = {
  edition: `platform-bg-roundtrip-edition-${RUN}`,
  brokenBackground: `platform-bg-roundtrip-broken-${RUN}`,
  validBackground: `platform-bg-roundtrip-valid-${RUN}`,
  brokenTemplate: `platform-bg-roundtrip-broken-template-${RUN}`,
  validTemplate: `platform-bg-roundtrip-valid-template-${RUN}`,
};

const BROKEN_ASSET_REF = "data:image/png;base64,not-a-valid-catalog-image";
const VALID_ASSET_REF =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const superAdminUser: User = {
  id: "u-sa",
  email: "superadmin@daybook.app",
  name: "Platform Super Admin",
  platformRole: "super_admin",
  provider: "google",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: true,
  aiProvider: "claude",
  connections: {
    googleDrive: false,
    googleCalendar: false,
    googleTasks: false,
    googleDocs: false,
    notion: false,
  },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  planCurrentPeriodEnd: null,
  planStatus: null,
  stripeSubscriptionId: null,
  stripePaymentIntentId: null,
  stripeSubscriptionEventCreatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const testRequest = req as any;
    testRequest.isAuthenticated = () => true;
    testRequest.user = superAdminUser;
    testRequest.log = {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
    };
    next();
  });
  app.use("/api", platformPlannersRouter);
  return app;
}

const app = makeApp();

const setup = {
  weekStart: "mon" as const,
  orientation: "vertical" as const,
  startMonth: 0,
  startYear: 2027,
  monthCount: 1,
  datingMode: "dated" as const,
};

function templateValues(
  id: string,
  name: string,
  backgroundId: string,
): typeof platformPlannerTemplatesTable.$inferInsert {
  return {
    id,
    name,
    editionId: ids.edition,
    productType: "planner",
    setup,
    style: {
      size: "A5",
      renderStyle: "flat",
      sections: ["Projects"],
      backgroundId,
    },
    output: {
      calMode: "none",
      eventMins: 60,
      aiInPdf: false,
      saveToDrive: false,
    },
    drive: { pdfFileId: null, configFileId: null },
    status: "draft",
  };
}

beforeAll(async () => {
  await db.insert(editionsTable).values({
    id: ids.edition,
    name: `Platform Background Round Trip ${RUN}`,
    status: "draft",
    productType: "planner",
  });
  await db.insert(backgroundsTable).values([
    {
      id: ids.brokenBackground,
      name: `Broken Catalog Image ${RUN}`,
      type: "image",
      assetRef: BROKEN_ASSET_REF,
      status: "draft",
    },
    {
      id: ids.validBackground,
      name: `Valid Catalog Image ${RUN}`,
      type: "image",
      assetRef: VALID_ASSET_REF,
      status: "draft",
    },
  ]);
  await db.insert(platformPlannerTemplatesTable).values([
    templateValues(
      ids.brokenTemplate,
      `Broken Background Template ${RUN}`,
      ids.brokenBackground,
    ),
    templateValues(
      ids.validTemplate,
      `Valid Background Template ${RUN}`,
      ids.validBackground,
    ),
  ]);
});

afterAll(async () => {
  await db
    .delete(platformPlannerTemplatesTable)
    .where(inArray(platformPlannerTemplatesTable.id, [
      ids.brokenTemplate,
      ids.validTemplate,
    ]));
  await db
    .delete(backgroundsTable)
    .where(inArray(backgroundsTable.id, [
      ids.brokenBackground,
      ids.validBackground,
    ]));
  await db.delete(editionsTable).where(eq(editionsTable.id, ids.edition));
});

describe("POST /platform/planners/:id/generate background round trip", () => {
  it("returns safe metadata and the failure reason for a broken saved image", async () => {
    const response = await request(app)
      .post(`/api/platform/planners/${ids.brokenTemplate}/generate`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.backgroundWarnings).toEqual([{
      backgroundId: ids.brokenBackground,
      backgroundName: `Broken Catalog Image ${RUN}`,
      backgroundType: "image",
      reason: "embed_failed",
    }]);
    expect(JSON.stringify(response.body)).not.toContain(BROKEN_ASSET_REF);
    expect(response.body).not.toHaveProperty("assetRef");
  }, 120_000);

  it("returns no warning for a valid saved image and does not expose its asset", async () => {
    const response = await request(app)
      .post(`/api/platform/planners/${ids.validTemplate}/generate`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.backgroundWarnings).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain(VALID_ASSET_REF);
    expect(response.body).not.toHaveProperty("assetRef");
  }, 120_000);
});