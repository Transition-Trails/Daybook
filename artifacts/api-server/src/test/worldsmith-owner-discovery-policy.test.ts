import { describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import worldsmithRouter from "../routes/worldsmith.js";
import {
  ownerDiscoveryDecisionAllowed,
} from "../lib/worldsmith/owner-discovery-policy.js";

describe("owner discovery decision policy", () => {
  it("allows only the documented state transitions", () => {
    expect(ownerDiscoveryDecisionAllowed("accept", "submitted")).toBe(true);
    expect(ownerDiscoveryDecisionAllowed("accept", "in_review")).toBe(true);
    expect(ownerDiscoveryDecisionAllowed("accept", "returned")).toBe(false);
    expect(ownerDiscoveryDecisionAllowed("return", "submitted")).toBe(true);
    expect(ownerDiscoveryDecisionAllowed("return", "in_review")).toBe(true);
    expect(ownerDiscoveryDecisionAllowed("reject", "returned")).toBe(true);
    expect(ownerDiscoveryDecisionAllowed("accept", "accepted")).toBe(false);
    expect(ownerDiscoveryDecisionAllowed("return", "accepted")).toBe(false);
    expect(ownerDiscoveryDecisionAllowed("reject", "rejected")).toBe(false);
    expect(ownerDiscoveryDecisionAllowed("return", "returned")).toBe(false);
  });

  it("does not expose editorial decision endpoints on the owner router", () => {
    const paths = ((worldsmithRouter as any).stack ?? [])
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path as string);
    expect(paths.some((path: string) => path.includes("/owner-discoveries/:id/accept"))).toBe(false);
    expect(paths.some((path: string) => path.includes("/owner-discoveries/:id/reject"))).toBe(false);
  });

  it("requires authentication before owner submission or revision", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).isAuthenticated = () => false;
      next();
    });
    app.use("/api", worldsmithRouter);

    const submission = await request(app)
      .post("/api/v1/worldsmith/owner-discoveries")
      .send({ world_id: "world", title: "Discovery", story_moment: "moment", owner_context: "context" });
    expect(submission.status).toBe(401);

    const revision = await request(app)
      .post("/api/v1/worldsmith/owner-discoveries/discovery/revisions")
      .send({ snapshot: { title: "revision" } });
    expect(revision.status).toBe(401);
  });
});