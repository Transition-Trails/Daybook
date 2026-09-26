import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  db,
  storeMembersTable,
  storesTable,
  userAuthTokensTable,
  usersTable,
} from "@workspace/db";
import type { Profile } from "passport-google-oauth20";
import type { User } from "@workspace/db";

const emailMock = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../lib/email/send", () => ({ sendEmail: emailMock.send }));

import { authenticateGoogleProfile } from "../lib/passport";
import authRouter from "../routes/auth";

const suffix = Math.random().toString(36).slice(2, 10);
const ownerId = `google-link-owner-${suffix}`;
const storeId = `google-link-store-${suffix}`;
const customerId = `google-link-customer-${suffix}`;
const staffId = `google-link-staff-${suffix}`;
const otherGoogleId = `google-link-other-google-${suffix}`;
const customerEmail = `google-link-${suffix}@example.test`;
const staffEmail = `google-link-staff-${suffix}@example.test`;
const otherGoogleEmail = `google-link-other-${suffix}@example.test`;
const ids = [customerId, staffId, otherGoogleId];
const originalAppUrl = process.env.APP_URL;

function makeAuthApp() {
  const app = express();
  let sessionUser: User | null = null;
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const testReq = req as unknown as {
      login: (user: User, callback: (error?: Error | null) => void) => void;
      session: {
        regenerate: (callback: (error?: Error | null) => void) => void;
        save: (callback: (error?: Error | null) => void) => void;
      };
      log: { error: (...args: unknown[]) => void };
    };
    testReq.login = (user, callback) => {
      sessionUser = user;
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

function googleProfile(
  id: string,
  email: string,
  emailVerified: boolean,
): Profile {
  return {
    id,
    provider: "google",
    profileUrl: "",
    displayName: "Google Buyer",
    photos: [],
    emails: [{ value: email, verified: emailVerified }],
    _raw: "",
    _json: { email, email_verified: emailVerified },
  } as unknown as Profile;
}

beforeAll(async () => {
  process.env.APP_URL = "https://trusted.example.test";
  emailMock.send.mockResolvedValue(undefined);
  const passwordHash = await bcrypt.hash("linked-customer-password", 12);
  await db.insert(usersTable).values([
    {
      id: ownerId,
      email: `${ownerId}@example.test`,
      name: "Link fixture owner",
      provider: "google",
    },
    {
      id: customerId,
      email: customerEmail,
      name: "Verified password customer",
      provider: "password",
      passwordHash,
      emailVerifiedAt: new Date(),
      platformRole: null,
    },
    {
      id: staffId,
      email: staffEmail,
      name: "Verified staff account",
      provider: "password",
      passwordHash,
      emailVerifiedAt: new Date(),
      platformRole: null,
    },
    {
      id: otherGoogleId,
      email: otherGoogleEmail,
      name: "Different Google identity",
      provider: "google",
      googleId: `existing-google-${suffix}`,
      googleAccessToken: "existing-access-token",
      googleRefreshToken: "existing-refresh-token",
      emailVerifiedAt: new Date(),
    },
  ]);
  await db.insert(storesTable).values({
    id: storeId,
    slug: storeId,
    name: "Google Link Store",
    ownerUserId: ownerId,
    status: "active",
  });
  await db.insert(storeMembersTable).values([
    { storeId, userId: customerId, role: "customer" },
    { storeId, userId: staffId, role: "store_staff" },
  ]);
});

afterAll(async () => {
  await db.delete(userAuthTokensTable).where(eq(userAuthTokensTable.userId, customerId));
  await db.delete(storeMembersTable).where(eq(storeMembersTable.storeId, storeId));
  await db.delete(storesTable).where(eq(storesTable.id, storeId));
  for (const id of ids) await db.delete(usersTable).where(eq(usersTable.id, id));
  await db.delete(usersTable).where(eq(usersTable.id, ownerId));
  if (originalAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = originalAppUrl;
});

describe("Google customer account linking", () => {
  it("links only an asserted verified customer and reuses that account without replacing its password", async () => {
    const [before] = await db.select().from(usersTable).where(eq(usersTable.id, customerId));
    const profile = googleProfile(`google-sub-${suffix}`, customerEmail, true);
    const linked = await authenticateGoogleProfile("google-access-1", "google-refresh-1", profile);

    expect(linked.id).toBe(customerId);
    expect(linked.googleId).toBe(`google-sub-${suffix}`);
    expect(linked.passwordHash).toBe(before?.passwordHash);
    expect(linked.emailVerifiedAt).toEqual(before?.emailVerifiedAt);
    expect(linked.googleAccessToken).toBe("google-access-1");

    const authApp = makeAuthApp();
    const customerLogin = await request(authApp.app).post("/auth/customer/login")
      .send({ email: customerEmail, password: "linked-customer-password" });
    expect(customerLogin.status).toBe(200);
    expect(customerLogin.body).toEqual({
      id: customerId,
      name: "Verified password customer",
      email: customerEmail,
    });
    expect(authApp.getSessionUser()?.id).toBe(customerId);

    const resetRequest = await request(authApp.app).post("/auth/customer/password-reset/request")
      .send({ storeSlug: storeId, email: customerEmail });
    expect(resetRequest.status).toBe(200);
    expect(emailMock.send).toHaveBeenCalledWith(expect.objectContaining({
      template: "customer_password_reset",
      requireProvider: true,
    }));
    const resetEmail = emailMock.send.mock.calls.at(-1)?.[0]?.html as string;
    const resetToken = resetEmail.match(/\/s\/[^/?]+\/account\?reset=([^"&<]+)/)?.[1];
    expect(resetToken).toBeTruthy();
    const reset = await request(authApp.app).post("/auth/customer/password-reset/confirm")
      .send({ token: decodeURIComponent(resetToken!), password: "linked-customer-password-new" });
    expect(reset.status).toBe(200);
    expect((await db.select().from(usersTable).where(eq(usersTable.id, customerId)))[0]?.passwordHash)
      .not.toBe(before?.passwordHash);

    const reused = await authenticateGoogleProfile("google-access-2", undefined, profile);
    expect(reused.id).toBe(customerId);
    expect(reused.passwordHash).not.toBe(before?.passwordHash);
    const relogin = await request(makeAuthApp().app).post("/auth/customer/login")
      .send({ email: customerEmail, password: "linked-customer-password-new" });
    expect(relogin.status).toBe(200);
    expect(reused.googleAccessToken).toBe("google-access-2");
    // A subsequent OAuth response without a refresh grant does not clear the
    // existing Google grant or modify the customer's password credentials.
    expect(reused.googleRefreshToken).toBe("google-refresh-1");
  });

  it("rejects unverified email, staff-account, and different-Google-identity collisions without token overwrites", async () => {
    await expect(authenticateGoogleProfile(
      "unverified-access",
      "unverified-refresh",
      googleProfile(`unverified-sub-${suffix}`, customerEmail, false),
    )).rejects.toThrow(/verified/i);
    const [customer] = await db.select().from(usersTable).where(eq(usersTable.id, customerId));
    expect(customer?.googleId).toBe(`google-sub-${suffix}`);
    expect(customer?.googleAccessToken).toBe("google-access-2");

    const [staffBefore] = await db.select().from(usersTable).where(eq(usersTable.id, staffId));
    await expect(authenticateGoogleProfile(
      "staff-collision-access",
      "staff-collision-refresh",
      googleProfile(`staff-sub-${suffix}`, staffEmail, true),
    )).rejects.toThrow(/cannot be linked/i);
    const [staffAfter] = await db.select().from(usersTable).where(eq(usersTable.id, staffId));
    expect(staffAfter?.googleId).toBeNull();
    expect(staffAfter?.googleAccessToken).toBe(staffBefore?.googleAccessToken);
    expect(staffAfter?.passwordHash).toBe(staffBefore?.passwordHash);

    const [otherBefore] = await db.select().from(usersTable).where(eq(usersTable.id, otherGoogleId));
    await expect(authenticateGoogleProfile(
      "different-user-access",
      "different-user-refresh",
      googleProfile(`different-sub-${suffix}`, otherGoogleEmail, true),
    )).rejects.toThrow(/cannot be linked/i);
    const [otherAfter] = await db.select().from(usersTable).where(eq(usersTable.id, otherGoogleId));
    expect(otherAfter?.googleId).toBe(otherBefore?.googleId);
    expect(otherAfter?.googleAccessToken).toBe(otherBefore?.googleAccessToken);
    expect(otherAfter?.googleRefreshToken).toBe(otherBefore?.googleRefreshToken);
  });
});