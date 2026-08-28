import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app";

describe("admin login session persistence", () => {
  it("keeps the authenticated user available on the next request", async () => {
    const agent = request.agent(app);

    const login = await agent
      .post("/api/auth/test-login")
      .send({ email: "super@ci.test" });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({
      id: "ci_super_admin",
      platformRole: "super_admin",
    });

    const afterNavigation = await agent.get("/api/auth/me");

    expect(afterNavigation.status).toBe(200);
    expect(afterNavigation.body).toMatchObject({
      id: "ci_super_admin",
      platformRole: "super_admin",
    });
  });
});