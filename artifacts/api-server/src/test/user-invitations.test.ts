import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, storeMembersTable, storesTable, userInvitationsTable, usersTable } from "@workspace/db";
import type { User } from "@workspace/db";
import authRouter from "../routes/auth";
import usersRouter from "../routes/users";

const runId = randomBytes(5).toString("hex");
const dormantId = `invite-dormant-${runId}`;
const credentialId = `invite-credential-${runId}`;
const isolatedLoginId = `invite-isolated-login-${runId}`;
const acceptedEmail = `accepted-${runId}@example.test`;
const credentialEmail = `credential-${runId}@example.test`;
const isolatedLoginEmail = `isolated-login-${runId}@example.test`;
const invitationIds: string[] = [];
const originalSenderDomain = process.env.EMAIL_FROM_DOMAIN;
const registeredUserIds = new Set<string>();

const admin = {
  id: "u-sa",
  email: "superadmin@daybook.app",
  name: "Test super admin",
  platformRole: "super_admin",
} as User;
const otherIdentity = {
  id: "u-alpha-owner",
  email: "owner@store-alpha.com",
  name: "Store owner",
  platformRole: null,
} as User;

function makeTestApp(identity: User | null) {
  const app = express();
  let sessionUser: User | null = null;
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    let activeUser = identity;
    const testReq = req as unknown as {
      isAuthenticated: () => boolean;
      login: (user: User, callback: (error?: Error | null) => void) => void;
      session: { save: (callback: (error?: Error | null) => void) => void };
      user?: User;
    };
    testReq.isAuthenticated = () => activeUser !== null;
    if (activeUser) testReq.user = activeUser;
    testReq.login = (user, callback) => {
      activeUser = user;
      sessionUser = user;
      testReq.user = user;
      callback(null);
    };
    testReq.session = { save: (callback) => callback(null) };
    next();
  });
  app.use(authRouter);
  app.use(usersRouter);
  return { app, getSessionUser: () => sessionUser };
}

async function issueInvitation(email: string, role = "store_staff", storeId: string | null = "store-alpha") {
  const token = randomBytes(32).toString("base64url");
  const [row] = await db.insert(userInvitationsTable).values({
    email,
    role,
    storeId,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdBy: admin.id,
  }).returning({ id: userInvitationsTable.id });
  invitationIds.push(row.id);
  return token;
}

beforeAll(async () => {
  const credentialHash = await bcrypt.hash("invited-login-password", 12);
  await db.insert(usersTable).values([
    {
      id: dormantId,
      email: `Dormant-${runId}@example.test`,
      name: "Dormant row",
      provider: "google",
      platformRole: null,
      owned: [],
    },
    {
      id: credentialId,
      email: credentialEmail,
      name: "Credential account",
      provider: "password",
      passwordHash: credentialHash,
      platformRole: null,
      owned: [],
    },
    {
      id: isolatedLoginId,
      email: isolatedLoginEmail,
      name: "Isolated login account",
      provider: "password",
      passwordHash: credentialHash,
      platformRole: null,
      owned: [],
    },
  ]);
});

afterAll(async () => {
  await db.delete(userInvitationsTable).where(
    invitationIds.length
      ? eq(userInvitationsTable.id, invitationIds[0]!)
      : eq(userInvitationsTable.id, "__no_invitation__"),
  );
  for (const id of invitationIds.slice(1)) {
    await db.delete(userInvitationsTable).where(eq(userInvitationsTable.id, id));
  }
  for (const id of registeredUserIds) {
    await db.delete(storeMembersTable).where(eq(storeMembersTable.userId, id));
    await db.delete(usersTable).where(eq(usersTable.id, id));
  }
  await db.delete(storeMembersTable).where(eq(storeMembersTable.userId, dormantId));
  await db.delete(usersTable).where(eq(usersTable.id, dormantId));
  await db.delete(usersTable).where(eq(usersTable.id, credentialId));
  await db.delete(usersTable).where(eq(usersTable.id, isolatedLoginId));
  if (originalSenderDomain === undefined) delete process.env.EMAIL_FROM_DOMAIN;
  else process.env.EMAIL_FROM_DOMAIN = originalSenderDomain;
});

describe("secure user invitations", () => {
  it("previews without exposing its token and reports existing account credential state", async () => {
    const token = await issueInvitation(credentialEmail);
    const [store] = await db.select({ name: storesTable.name }).from(storesTable)
      .where(eq(storesTable.id, "store-alpha"));
    const response = await request(makeTestApp(null).app)
      .get("/auth/invitations/preview")
      .query({ token });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      email: credentialEmail,
      role: "store_staff",
      storeName: store?.name,
      accountExists: true,
      requiresSignIn: true,
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
  });

  it("requires matching sign-in for credential accounts and rejects another identity", async () => {
    const token = await issueInvitation(credentialEmail);
    const anonymous = await request(makeTestApp(null).app)
      .post("/auth/invitations/accept")
      .send({ token, name: "Wrong path", password: "long-password" });
    expect(anonymous.status).toBe(401);

    const mismatch = await request(makeTestApp(otherIdentity).app)
      .post("/auth/invitations/accept")
      .send({ token, name: "Wrong path", password: "long-password" });
    expect(mismatch.status).toBe(403);

    const [account] = await db.select().from(usersTable).where(eq(usersTable.id, credentialId));
    expect(account?.platformRole).toBeNull();
    const [invitation] = await db.select().from(userInvitationsTable)
      .where(eq(userInvitationsTable.tokenHash, createHash("sha256").update(token).digest("hex")));
    expect(invitation?.acceptedAt).toBeNull();
  });

  it("allows password sign-in for an invited account without granting console roles", async () => {
    await issueInvitation(credentialEmail);
    const testApp = makeTestApp(null);
    const login = await request(testApp.app).post("/auth/staff/login").send({
      email: credentialEmail,
      password: "invited-login-password",
    });

    expect(login.status).toBe(200);
    expect(login.body.memberships).toEqual([]);
    expect(testApp.getSessionUser()?.email).toBe(credentialEmail);
    const [account] = await db.select().from(usersTable).where(eq(usersTable.id, credentialId));
    expect(account?.platformRole).toBeNull();
    expect(await db.select().from(storeMembersTable).where(eq(storeMembersTable.userId, credentialId))).toHaveLength(0);
    const forbiddenConsoleAction = await request(makeTestApp(account!).app).get("/users/invitations");
    expect(forbiddenConsoleAction.status).toBe(403);
  });

  it("does not allow password login when the invitation is expired or already accepted", async () => {
    const expiredToken = await issueInvitation(isolatedLoginEmail);
    const [expiredRow] = await db.select().from(userInvitationsTable)
      .where(eq(userInvitationsTable.tokenHash, createHash("sha256").update(expiredToken).digest("hex")));
    await db.update(userInvitationsTable).set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(userInvitationsTable.id, expiredRow!.id));
    const expiredLogin = await request(makeTestApp(null).app).post("/auth/staff/login").send({
      email: isolatedLoginEmail,
      password: "invited-login-password",
    });
    expect(expiredLogin.status).toBe(401);

    const acceptedToken = await issueInvitation(isolatedLoginEmail);
    const [acceptedRow] = await db.select().from(userInvitationsTable)
      .where(eq(userInvitationsTable.tokenHash, createHash("sha256").update(acceptedToken).digest("hex")));
    await db.update(userInvitationsTable).set({ acceptedAt: new Date() })
      .where(eq(userInvitationsTable.id, acceptedRow!.id));
    const acceptedLogin = await request(makeTestApp(null).app).post("/auth/staff/login").send({
      email: isolatedLoginEmail,
      password: "invited-login-password",
    });
    expect(acceptedLogin.status).toBe(401);
  });

  it("registers a dormant account, assigns the invited store role only on acceptance, and consumes the token once", async () => {
    const token = await issueInvitation(`dormant-${runId.toUpperCase()}@EXAMPLE.TEST`);
    const testApp = makeTestApp(null);
    const accepted = await request(testApp.app).post("/auth/invitations/accept").send({
      token,
      name: "New Store Staff",
      password: "an-adequate-password",
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ success: true });
    expect(testApp.getSessionUser()?.email).toBe(`Dormant-${runId}@example.test`);

    const [account] = await db.select().from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${`dormant-${runId.toUpperCase()}@EXAMPLE.TEST`.toLowerCase()}`);
    if (account) registeredUserIds.add(account.id);
    expect(account?.name).toBe("New Store Staff");
    expect(await bcrypt.compare("an-adequate-password", account?.passwordHash ?? "")).toBe(true);
    const [membership] = await db.select().from(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, "store-alpha"), eq(storeMembersTable.userId, account!.id)));
    expect(membership?.role).toBe("store_staff");
    const repeated = await request(testApp.app).post("/auth/invitations/accept").send({ token });
    expect(repeated.status).toBe(400);
  });

  it("serializes concurrent acceptances so the invitation is consumed only once", async () => {
    const email = `race-${runId}@example.test`;
    const token = await issueInvitation(email);
    const attempt = (name: string, password: string) =>
      request(makeTestApp(null).app).post("/auth/invitations/accept").send({ token, name, password });
    const results = await Promise.all([
      attempt("Racing user one", "first-valid-password"),
      attempt("Racing user two", "second-valid-password"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);

    const [account] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    expect(account).toBeDefined();
    registeredUserIds.add(account!.id);
    const memberships = await db.select().from(storeMembersTable)
      .where(and(eq(storeMembersTable.storeId, "store-alpha"), eq(storeMembersTable.userId, account!.id)));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("store_staff");
  });

  it("refuses creation with the placeholder platform sender and does not persist or send", async () => {
    process.env.EMAIL_FROM_DOMAIN = "notifications.example.com";
    const before = await db.select({ id: userInvitationsTable.id }).from(userInvitationsTable);
    const response = await request(makeTestApp(admin).app).post("/users/invitations").send({
      email: `not-sent-${runId}@example.test`,
      role: "super_admin",
    });
    expect(response.status).toBe(503);
    expect(response.body.error).toContain("verified platform sender domain");
    const after = await db.select({ id: userInvitationsTable.id }).from(userInvitationsTable);
    expect(after).toHaveLength(before.length);
  });

  it("does not expose token digests in the super-admin invitation list and denies other roles", async () => {
    const token = await issueInvitation(acceptedEmail, "super_admin", null);
    const listed = await request(makeTestApp(admin).app).get("/users/invitations");
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(token);
    expect(JSON.stringify(listed.body)).not.toContain(createHash("sha256").update(token).digest("hex"));
    const denied = await request(makeTestApp(otherIdentity).app).get("/users/invitations");
    expect(denied.status).toBe(403);
  });
});