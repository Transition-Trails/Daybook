import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  storeMembersTable,
  storesTable,
  userAuthTokensTable,
  usersTable,
} from "@workspace/db";
import type { User } from "@workspace/db";

const emailMock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/email/send", () => ({ sendEmail: emailMock.send }));

import authRouter from "../routes/auth";
import {
  passwordSessionVersionMatches,
  shouldInvalidateLegacyPasswordSession,
} from "../lib/passport";

const runId = randomBytes(5).toString("hex");
const ownerId = `customer-auth-owner-${runId}`;
const storeId = `customer-auth-store-${runId}`;
const storeSlug = `customer-auth-${runId}`;
const email = `customer-${runId}@example.test`;
const registeredIds = new Set<string>();
const originalAppUrl = process.env.APP_URL;

function makeTestApp() {
  const app = express();
  let sessionUser: User | null = null;
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const testReq = req as unknown as {
      isAuthenticated: () => boolean;
      login: (user: User, callback: (error?: Error | null) => void) => void;
      session: {
        regenerate: (callback: (error?: Error | null) => void) => void;
        save: (callback: (error?: Error | null) => void) => void;
      };
      log: { error: (...args: unknown[]) => void };
      user?: User;
    };
    testReq.isAuthenticated = () => sessionUser !== null;
    testReq.login = (user, callback) => {
      sessionUser = user;
      testReq.user = user;
      callback(null);
    };
    testReq.session = {
      regenerate: (callback) => callback(null),
      save: (callback) => callback(null),
    };
    testReq.log = { error: vi.fn() };
    next();
  });
  app.use(authRouter);
  return { app, getSessionUser: () => sessionUser };
}

function tokenFromEmail(callIndex: number): string {
  const html = emailMock.send.mock.calls[callIndex]?.[0]?.html as string;
  const match = html.match(/\/s\/[^/?]+\/account\?(?:verify|reset)=([^"&<]+)/);
  if (!match?.[1]) throw new Error("expected customer auth email URL");
  return decodeURIComponent(match[1]);
}

beforeAll(async () => {
  process.env.APP_URL = "https://trusted.example.test";
  emailMock.send.mockResolvedValue(undefined);
  await db.insert(usersTable).values({
    id: ownerId,
    email: `${ownerId}@example.test`,
    name: "Fixture owner",
    provider: "google",
  });
  await db.insert(storesTable).values({
    id: storeId,
    slug: storeSlug,
    name: "Customer Auth Store",
    ownerUserId: ownerId,
    status: "active",
  });
});

afterAll(async () => {
  for (const id of registeredIds) {
    await db.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, id));
    await db.delete(storeMembersTable).where(eq(storeMembersTable.userId, id));
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  await db.delete(storesTable).where(eq(storesTable.id, storeId));
  await db.delete(usersTable).where(eq(usersTable.id, ownerId));
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("customer email/password authentication", () => {
  it("registers, verifies once, prevents unverified login, and returns only safe customer data", async () => {
    const app = makeTestApp();
    emailMock.send.mockClear();
    const registration = await request(app.app).post("/auth/customer/register").send({
      storeSlug, name: "Buyer", email, password: "buyer-password-123",
    });
    expect(registration.status).toBe(200);
    expect(registration.body).toMatchObject({ success: true, message: expect.any(String) });
    expect(emailMock.send).toHaveBeenCalledWith(expect.objectContaining({
      template: "customer_email_verification",
      requireProvider: true,
      to: email,
    }));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.passwordHash).toBeNull();
    expect(user?.platformRole).toBeNull();
    registeredIds.add(user!.id);
    const [membership] = await db.select().from(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, storeId), eq(storeMembersTable.userId, user!.id)));
    expect(membership?.role).toBe("customer");
    const token = tokenFromEmail(0);
    const [storedToken] = await db.select().from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.userId, user!.id));
    expect(storedToken?.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(storedToken?.tokenHash).not.toBe(token);
    await db.insert(userAuthTokensTable).values({
      userId: user!.id,
      storeId,
      purpose: "email_verification",
      tokenHash: createHash("sha256").update("expired-token-fixture-0123456789abcdef").digest("hex"),
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredVerification = await request(makeTestApp().app).post("/auth/customer/verify")
      .send({ token: "expired-token-fixture-0123456789abcdef" });
    expect(expiredVerification.status).toBe(400);

    const unverifiedLogin = await request(makeTestApp().app).post("/auth/customer/login")
      .send({ email, password: "buyer-password-123" });
    expect(unverifiedLogin.status).toBe(401);

    const verifiedApp = makeTestApp();
    const verification = await request(verifiedApp.app).post("/auth/customer/verify").send({ token });
    expect(verification.status).toBe(200);
    expect(verification.body).toEqual({ success: true });
    expect(verifiedApp.getSessionUser()?.id).toBe(user!.id);
    const repeated = await request(makeTestApp().app).post("/auth/customer/verify").send({ token });
    expect(repeated.status).toBe(400);

    const loginApp = makeTestApp();
    const login = await request(loginApp.app).post("/auth/customer/login")
      .send({ email, password: "buyer-password-123" });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ id: user!.id, name: "Buyer", email });
    expect(loginApp.getSessionUser()?.id).toBe(user!.id);
    expect(JSON.stringify(login.body)).not.toContain("passwordHash");
    const consoleLogin = await request(makeTestApp().app).post("/auth/staff/login")
      .send({ email, password: "buyer-password-123" });
    expect(consoleLogin.status).toBe(401);
  });

  it("sends generic reset responses, changes password once, and rejects invalid tokens", async () => {
    emailMock.send.mockClear();
    const app = makeTestApp();
    const known = await request(app.app).post("/auth/customer/password-reset/request")
      .send({ storeSlug, email });
    const unknown = await request(app.app).post("/auth/customer/password-reset/request")
      .send({ storeSlug, email: `missing-${runId}@example.test` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(emailMock.send).toHaveBeenCalledTimes(1);
    const token = tokenFromEmail(0);
    const [beforeReset] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    const reset = await request(app.app).post("/auth/customer/password-reset/confirm")
      .send({ token, password: "new-buyer-password-123" });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ success: true });
    const [afterReset] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    expect(afterReset?.passwordCredentialVersion).toBe((beforeReset?.passwordCredentialVersion ?? 0) + 1);
    expect(passwordSessionVersionMatches(
      afterReset?.passwordCredentialVersion,
      beforeReset?.passwordCredentialVersion ?? 0,
    )).toBe(false);
    expect(passwordSessionVersionMatches(
      afterReset?.passwordCredentialVersion,
      afterReset?.passwordCredentialVersion ?? 0,
    )).toBe(true);
    expect(shouldInvalidateLegacyPasswordSession(afterReset!, [{ role: "customer" }])).toBe(true);
    // ID-only legacy staff sessions remain accepted rather than blanket-invalidated.
    expect(shouldInvalidateLegacyPasswordSession({
      ...afterReset!,
      passwordCredentialVersion: 1,
    }, [{ role: "store_staff" }])).toBe(false);
    expect((await request(makeTestApp().app).post("/auth/customer/login")
      .send({ email, password: "new-buyer-password-123" })).status).toBe(200);
    const repeated = await request(app.app).post("/auth/customer/password-reset/confirm")
      .send({ token, password: "another-password-123" });
    expect(repeated.status).toBe(400);
    const invalid = await request(app.app).post("/auth/customer/password-reset/confirm")
      .send({ token: "invalid-invalid-invalid-invalid", password: "valid-password-123" });
    expect(invalid.status).toBe(400);
  });

  it("does not overwrite an existing staff email and does not permit staff customer login", async () => {
    emailMock.send.mockClear();
    const staffEmail = `${ownerId}@example.test`;
    const before = await db.select().from(usersTable).where(eq(usersTable.id, ownerId));
    const response = await request(makeTestApp().app).post("/auth/customer/register").send({
      storeSlug, name: "Overwrite attempt", email: staffEmail, password: "bad-password-123",
    });
    expect(response.status).toBe(200);
    expect((await db.select().from(usersTable).where(eq(usersTable.id, ownerId)))[0])
      .toMatchObject({ name: before[0]?.name, email: before[0]?.email, googleId: before[0]?.googleId });
    expect(emailMock.send).not.toHaveBeenCalled();
    const login = await request(makeTestApp().app).post("/auth/customer/login")
      .send({ email: staffEmail, password: "bad-password-123" });
    expect(login.status).toBe(401);
  });

  it("rolls back a new account when verification email delivery fails", async () => {
    const failedEmail = `mail-fail-${runId}@example.test`;
    emailMock.send.mockRejectedValueOnce(new Error("provider unavailable"));
    const response = await request(makeTestApp().app).post("/auth/customer/register").send({
      storeSlug, name: "Mail failure", email: failedEmail, password: "buyer-password-123",
    });
    expect(response.status).toBe(503);
    expect((await db.select().from(usersTable).where(eq(usersTable.email, failedEmail))).length).toBe(0);
    expect((await db.select().from(userAuthTokensTable)
      .where(eq(userAuthTokensTable.tokenHash, "never-persisted"))).length).toBe(0);
  });

  it("rejects expired and unknown-store registration requests", async () => {
    const badStore = await request(makeTestApp().app).post("/auth/customer/register").send({
      storeSlug: `missing-${runId}`, name: "Buyer", email: `bad-${runId}@example.test`,
      password: "buyer-password-123",
    });
    expect(badStore.status).toBe(400);
    const invalidToken = await request(makeTestApp().app).post("/auth/customer/verify")
      .send({ token: "invalid-invalid-invalid-invalid" });
    expect(invalidToken.status).toBe(400);
  });

  it("uses the victim's latest pending password after an attacker-first registration", async () => {
    const takeoverEmail = `takeover-${runId}@example.test`;
    emailMock.send.mockClear();
    const app = makeTestApp().app;
    const attackerRegistration = await request(app).post("/auth/customer/register").send({
      storeSlug, name: "Attacker", email: takeoverEmail, password: "attacker-password-123",
    });
    expect(attackerRegistration.status).toBe(200);
    const attackerToken = tokenFromEmail(0);

    const victimRegistration = await request(app).post("/auth/customer/register").send({
      storeSlug, name: "Victim", email: takeoverEmail, password: "victim-password-123",
    });
    expect(victimRegistration.status).toBe(200);
    expect(victimRegistration.body).toEqual(attackerRegistration.body);
    const victimToken = tokenFromEmail(1);
    const [pending] = await db.select().from(usersTable).where(eq(usersTable.email, takeoverEmail));
    expect(pending?.emailVerifiedAt).toBeNull();
    expect(pending?.passwordHash).toBeNull();
    registeredIds.add(pending!.id);

    const stale = await request(app).post("/auth/customer/verify").send({ token: attackerToken });
    expect(stale.status).toBe(400);
    const verification = await request(app).post("/auth/customer/verify").send({ token: victimToken });
    expect(verification.status).toBe(200);
    const [verified] = await db.select().from(usersTable).where(eq(usersTable.id, pending!.id));
    expect(await bcrypt.compare("victim-password-123", verified?.passwordHash ?? "")).toBe(true);
    expect(await bcrypt.compare("attacker-password-123", verified?.passwordHash ?? "")).toBe(false);
    expect((await request(makeTestApp().app).post("/auth/customer/login")
      .send({ email: takeoverEmail, password: "attacker-password-123" })).status).toBe(401);
    expect((await request(makeTestApp().app).post("/auth/customer/login")
      .send({ email: takeoverEmail, password: "victim-password-123" })).status).toBe(200);
  });
});