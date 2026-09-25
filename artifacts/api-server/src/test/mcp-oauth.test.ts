import { createHash } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tables = {
    clients: {
      clientId: "clientId", clientName: "clientName", redirectUris: "redirectUris",
    },
    codes: {
      codeHash: "codeHash", clientId: "clientId", userId: "userId", redirectUri: "redirectUri",
      resource: "resource", scopes: "scopes", codeChallenge: "codeChallenge", expiresAt: "expiresAt",
    },
    tokens: {
      tokenHash: "tokenHash", kind: "kind", familyId: "familyId", clientId: "clientId",
      userId: "userId", resource: "resource", scopes: "scopes", expiresAt: "expiresAt",
      revokedAt: "revokedAt", replacedByHash: "replacedByHash",
    },
    users: { id: "id" },
  };
  const data: Record<string, Record<string, unknown>[]> = {
    clients: [], codes: [], tokens: [], users: [],
  };
  let transactionQueue = Promise.resolve();
  let pauseReplacement: (() => Promise<void>) | undefined;
  let transactionQueued: (() => void) | undefined;
  const setReplacementPause = (pause?: () => Promise<void>) => { pauseReplacement = pause; };
  const setTransactionQueued = (notify?: () => void) => { transactionQueued = notify; };
  const tableName = (table: unknown) => table === tables.clients ? "clients"
    : table === tables.codes ? "codes" : table === tables.tokens ? "tokens" : "users";
  const match = (row: Record<string, unknown>, condition: any): boolean => {
    if (Array.isArray(condition)) return condition.every((part) => match(row, part));
    if (condition.op === "eq") return row[condition.column] === condition.value;
    if (condition.op === "isNull") return row[condition.column] == null;
    if (condition.op === "gt") return row[condition.column] instanceof Date
      ? (row[condition.column] as Date).getTime() > condition.value.getTime()
      : Number(row[condition.column]) > Number(condition.value);
    return true;
  };
  const db = {
    execute: async () => ({ rows: [] }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          limit: async (limit: number) => data[tableName(table)].filter((row) => match(row, condition)).slice(0, limit),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === tables.tokens && Array.isArray(values) && pauseReplacement) {
          await pauseReplacement();
        }
        const rows = Array.isArray(values) ? values : [values];
        data[tableName(table)].push(...rows.map((row) => ({ ...row })));
      },
    }),
    delete: (table: unknown) => ({
      where: (condition: unknown) => ({
        returning: async () => {
          const name = tableName(table);
          const deleted = data[name].filter((row) => match(row, condition));
          data[name] = data[name].filter((row) => !match(row, condition));
          return deleted;
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (change: Record<string, unknown>) => ({
        where: (condition: unknown) => ({
          returning: async () => {
            const rows = data[tableName(table)].filter((row) => match(row, condition));
            rows.forEach((row) => Object.assign(row, change));
            return rows;
          },
          then: (resolve: (rows: Record<string, unknown>[]) => void) => {
            const rows = data[tableName(table)].filter((row) => match(row, condition));
            rows.forEach((row) => Object.assign(row, change));
            resolve(rows);
          },
        }),
      }),
    }),
  };
  Object.assign(db, {
    transaction: async <T>(callback: (tx: typeof db) => Promise<T>): Promise<T> => {
      const previous = transactionQueue;
      let release!: () => void;
      transactionQueue = new Promise<void>((resolve) => { release = resolve; });
      transactionQueued?.();
      await previous;
      try { return await callback(db); }
      finally { release(); }
    },
  });
  return { tables, data, db, setReplacementPause, setTransactionQueued };
});

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  mcpOAuthClientsTable: mocks.tables.clients,
  mcpOAuthAuthorizationCodesTable: mocks.tables.codes,
  mcpOAuthTokensTable: mocks.tables.tokens,
  usersTable: mocks.tables.users,
}));
vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: string, value: unknown) => ({ op: "eq", column, value }),
  gt: (column: string, value: unknown) => ({ op: "gt", column, value }),
  isNull: (column: string) => ({ op: "isNull", column }),
  sql: (parts: TemplateStringsArray, ...values: unknown[]) => parts.join("?") + values.length,
}));
vi.mock("../lib/mcp-registration-limit.js", () => ({
  limitMcpRegistration: vi.fn(async () => ({ allowed: true })),
}));

import { metadataRouter, oauthRouter } from "../routes/mcp-oauth.js";
import { limitMcpRegistration } from "../lib/mcp-registration-limit.js";
import {
  getMcpIssuer,
  getMcpResource,
  hasWriteWithoutRead,
  issueMcpTokenPair,
  parseMcpScopes,
  sha256,
  verifyMcpAccessToken,
  verifyMcpBearer,
  verifyPkce,
} from "../lib/mcp-oauth.js";

const user = { id: "oauth-test-admin", email: "admin@example.test", platformRole: "super_admin" };
const clientId = "mcp-test-client";
const redirectUri = "https://client.example/callback";

function makeApp(authenticated = true) {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).isAuthenticated = () => authenticated;
    req.user = authenticated ? user as never : undefined;
    (req as any).session = consentSession;
    next();
  });
  app.use("/mcp/oauth", oauthRouter);
  app.use(metadataRouter);
  return app;
}

const consentSession: Record<string, unknown> = {};
const verifier = "0123456789012345678901234567890123456789012";
const challenge = () => createHash("sha256").update(verifier).digest("base64url");
const app = makeApp();

function resetState() {
  mocks.setReplacementPause();
  mocks.setTransactionQueued();
  for (const rows of Object.values(mocks.data)) rows.length = 0;
  mocks.data.users.push({ ...user });
  mocks.data.clients.push({
    clientId, clientName: "Test MCP", redirectUris: [redirectUri],
  });
  for (const key of Object.keys(consentSession)) delete consentSession[key];
}

describe("MCP OAuth authorization server", () => {
  beforeEach(() => {
    resetState();
    vi.mocked(limitMcpRegistration).mockReset().mockResolvedValue({ allowed: true });
    process.env.MCP_PUBLIC_ORIGIN = "https://daybook.example";
    process.env.NODE_ENV = "test";
  });

  it("keeps ChatGPT dynamic registration open but refuses limited attempts without creating clients", async () => {
    const registration = () => request(app).post("/mcp/oauth/register").send({
      client_name: "ChatGPT",
      redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    });
    const created = await registration().expect(201);
    expect(created.body.client_id).toBeTruthy();
    expect(mocks.data.clients).toHaveLength(2);

    vi.mocked(limitMcpRegistration).mockResolvedValueOnce({ allowed: false, retryAfter: 42 });
    const denied = await registration().expect(429);
    expect(denied.body.error).toBe("slow_down");
    expect(denied.headers["retry-after"]).toBe("42");
    expect(mocks.data.clients).toHaveLength(2);

    vi.mocked(limitMcpRegistration).mockRejectedValueOnce(new Error("DB unavailable"));
    const unavailable = await registration().expect(503);
    expect(unavailable.body.error).toBe("server_error");
    expect(mocks.data.clients).toHaveLength(2);
  });

  it("validates S256 PKCE verifiers and refuses malformed challenges", () => {
    expect(verifyPkce(verifier, challenge())).toBe(true);
    expect(verifyPkce(`${verifier}x`, challenge())).toBe(false);
    expect(verifyPkce("short", challenge())).toBe(false);
    expect(parseMcpScopes("worldsmith:canon:read worldsmith:canon:write")).toEqual([
      "worldsmith:canon:read", "worldsmith:canon:write",
    ]);
    expect(parseMcpScopes(
      "worldsmith:editorial:read worldsmith:editorial:write",
    )).toEqual(["worldsmith:editorial:read", "worldsmith:editorial:write"]);
    expect(parseMcpScopes(
      "worldsmith:canon:read worldsmith:canon:write worldsmith:editorial:read worldsmith:editorial:write",
    )).toHaveLength(4);
    expect(parseMcpScopes("read write")).toBeNull();
    expect(hasWriteWithoutRead(["worldsmith:canon:write"])).toBe(true);
    expect(hasWriteWithoutRead(["worldsmith:canon:read", "worldsmith:canon:write"])).toBe(false);
    expect(hasWriteWithoutRead(["worldsmith:editorial:write"])).toBe(true);
    expect(hasWriteWithoutRead(["worldsmith:editorial:read", "worldsmith:editorial:write"])).toBe(false);
    expect(hasWriteWithoutRead(["worldsmith:canon:read", "worldsmith:editorial:write"])).toBe(true);
    expect(hasWriteWithoutRead(["worldsmith:editorial:read", "worldsmith:canon:write"])).toBe(true);
  });

  it("rejects write-only scope instead of silently adding read permission", async () => {
    const response = await request(app).get("/mcp/oauth/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "write-only-state",
      code_challenge: challenge(),
      code_challenge_method: "S256",
      resource: getMcpResource(),
      scope: "worldsmith:canon:write",
    }).expect(400);
    expect(response.body.error).toBe("invalid_scope");
    expect(mocks.data.codes).toHaveLength(0);
  });

  it("aliases root protected-resource metadata and defaults omitted scope to read-only explicit consent", async () => {
    const authorizationMetadata = await request(app)
      .get("/.well-known/oauth-authorization-server").expect(200);
    const scoped = await request(app).get("/.well-known/oauth-protected-resource/mcp").expect(200);
    const unscoped = await request(app).get("/.well-known/oauth-protected-resource").expect(200);
    expect(unscoped.body).toEqual(scoped.body);
    expect(unscoped.body.resource).toBe(getMcpResource());
    const allScopes = [
      "worldsmith:canon:read",
      "worldsmith:canon:write",
      "worldsmith:editorial:read",
      "worldsmith:editorial:write",
    ];
    expect(authorizationMetadata.body.scopes_supported).toEqual(allScopes);
    expect(scoped.body.scopes_supported).toEqual(allScopes);

    const consent = await request(app).get("/mcp/oauth/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "oauth-state",
      code_challenge: challenge(),
      code_challenge_method: "S256",
      resource: getMcpResource(),
    }).expect(200);
    expect(consent.text).toContain("Read Canon data");
    expect(consent.text).not.toContain("Write Canon data");
    // A request without scope still pauses for user consent; it is not granted implicitly.
    expect(mocks.data.codes).toHaveLength(0);
  });

  it("redirects unauthenticated authorization to login with a same-origin return path", async () => {
    const response = await request(makeApp(false)).get("/mcp/oauth/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "oauth-state",
      code_challenge: challenge(),
      code_challenge_method: "S256",
      resource: getMcpResource(),
    }).expect(302);
    const location = new URL(response.headers.location, "https://daybook.example");
    expect(location.pathname).toBe("/login");
    const returnTo = location.searchParams.get("returnTo");
    expect(returnTo).toMatch(/^\/mcp\/oauth\/authorize\?/);
    expect(new URL(returnTo!, "https://daybook.example").origin).toBe("https://daybook.example");
  });

  it("requires a separate write checkbox and displays unverified client identity and exact callback", async () => {
    const authorize = () => request(app).get("/mcp/oauth/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "write-state",
      code_challenge: challenge(),
      code_challenge_method: "S256",
      resource: getMcpResource(),
      scope: "worldsmith:canon:read worldsmith:canon:write",
    });
    const consent = await authorize().expect(200);
    expect(consent.text).toContain("self-reported");
    expect(consent.text).toContain("https://client.example");
    expect(consent.text).toContain("https://client.example/callback");
    expect(consent.text).toContain('name="allow_write"');
    expect(consent.text).toContain("required");
    const csrf = consent.text.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();

    await request(app).post("/mcp/oauth/authorize").type("form").send({
      csrf_token: csrf,
      consent: "approve",
    }).expect(400);
    expect(mocks.data.codes).toHaveLength(0);

    const retry = await authorize().expect(200);
    const retryCsrf = retry.text.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    const approval = await request(app).post("/mcp/oauth/authorize").type("form").send({
      csrf_token: retryCsrf,
      consent: "approve",
      allow_write: "yes",
    }).expect(302);
    expect(new URL(approval.headers.location).searchParams.get("state")).toBe("write-state");
    expect(mocks.data.codes[0].scopes).toEqual(["worldsmith:canon:read", "worldsmith:canon:write"]);
  });

  it("describes WorldSmith editorial scopes and separately requires consent for each write domain", async () => {
    const authorize = () => request(app).get("/mcp/oauth/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "combined-write-state",
      code_challenge: challenge(),
      code_challenge_method: "S256",
      resource: getMcpResource(),
      scope: "worldsmith:canon:read worldsmith:canon:write worldsmith:editorial:read worldsmith:editorial:write",
    });
    const consent = await authorize().expect(200);
    expect(consent.text).toContain("Read Canon data");
    expect(consent.text).toContain("Write Canon data");
    expect(consent.text).toContain("Read WorldSmith worlds, story maps, storylines, movements, and sequences");
    expect(consent.text).toContain("Write WorldSmith worlds, story maps, storylines, movements, and sequences");
    expect(consent.text).toContain('name="allow_write"');
    expect(consent.text).toContain('name="allow_editorial_write"');
    const csrf = consent.text.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    await request(app).post("/mcp/oauth/authorize").type("form").send({
      csrf_token: csrf,
      consent: "approve",
      allow_write: "yes",
    }).expect(400);
    expect(mocks.data.codes).toHaveLength(0);

    const retry = await authorize().expect(200);
    const retryCsrf = retry.text.match(/name="csrf_token" value="([^"]+)"/)?.[1];
    await request(app).post("/mcp/oauth/authorize").type("form").send({
      csrf_token: retryCsrf,
      consent: "approve",
      allow_write: "yes",
      allow_editorial_write: "yes",
    }).expect(302);
    expect(mocks.data.codes[0].scopes).toEqual([
      "worldsmith:canon:read",
      "worldsmith:canon:write",
      "worldsmith:editorial:read",
      "worldsmith:editorial:write",
    ]);
  });

  it("uses the trusted Replit domain in development and still requires resource at authorize and token", async () => {
    delete process.env.MCP_PUBLIC_ORIGIN;
    process.env.APP_URL = "http://localhost:5000";
    process.env.REPLIT_DEV_DOMAIN = "preview.example.replit.dev";
    expect(getMcpIssuer()).toBe("https://preview.example.replit.dev");

    await request(app).get("/mcp/oauth/authorize").query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: "oauth-state",
      code_challenge: challenge(),
      code_challenge_method: "S256",
    }).expect(400);
    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "authorization_code",
      client_id: clientId,
      code: "some-code",
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }).expect(400);
  });

  it("redeems a code once and rejects an invalid verifier", async () => {
    const wrongCode = "wrong-pkce-authorization-code";
    mocks.data.codes.push({
      codeHash: sha256(wrongCode), clientId, userId: user.id, redirectUri,
      resource: getMcpResource(), scopes: ["worldsmith:canon:read"], codeChallenge: challenge(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "authorization_code", client_id: clientId, code: wrongCode, redirect_uri: redirectUri,
      code_verifier: `${verifier}x`, resource: getMcpResource(),
    }).expect(400);
    const code = "one-time-authorization-code";
    mocks.data.codes.push({
      codeHash: sha256(code), clientId, userId: user.id, redirectUri,
      resource: getMcpResource(), scopes: ["worldsmith:canon:read", "worldsmith:canon:write"], codeChallenge: challenge(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const redeemed = await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri,
      code_verifier: verifier, resource: getMcpResource(),
    }).expect(200);
    expect(redeemed.body.access_token).toBeTruthy();
    expect(redeemed.body.refresh_token).toBeTruthy();
    expect(mocks.data.codes).toHaveLength(0);
    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "authorization_code", client_id: clientId, code, redirect_uri: redirectUri,
      code_verifier: verifier, resource: getMcpResource(),
    }).expect(400);
  });

  it("enforces the editorial read/write pair during code exchange and refresh", async () => {
    const code = "editorial-authorization-code";
    mocks.data.codes.push({
      codeHash: sha256(code),
      clientId,
      userId: user.id,
      redirectUri,
      resource: getMcpResource(),
      scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write"],
      codeChallenge: challenge(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const redeemed = await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: getMcpResource(),
    }).expect(200);
    expect(redeemed.body.scope).toBe("worldsmith:editorial:read worldsmith:editorial:write");

    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: redeemed.body.refresh_token,
      resource: getMcpResource(),
      scope: "worldsmith:editorial:write",
    }).expect(400);
    const refreshed = await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: redeemed.body.refresh_token,
      resource: getMcpResource(),
    }).expect(200);
    expect(refreshed.body.scope).toBe("worldsmith:editorial:read worldsmith:editorial:write");
  });

  it("rotates refresh tokens and revokes the family when an old token is replayed", async () => {
    const initial = await issueMcpTokenPair({
      userId: user.id, clientId, resource: getMcpResource(), scopes: ["worldsmith:canon:read"],
    });
    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token", client_id: clientId, refresh_token: initial.refresh_token,
      resource: getMcpResource(), scope: "worldsmith:canon:read worldsmith:canon:write",
    }).expect(400);
    const rotated = await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token", client_id: clientId, refresh_token: initial.refresh_token,
      resource: getMcpResource(),
    }).expect(200);
    expect(rotated.body.refresh_token).not.toBe(initial.refresh_token);
    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token", client_id: clientId, refresh_token: initial.refresh_token,
      resource: getMcpResource(),
    }).expect(400);
    expect(await verifyMcpBearer(rotated.body.access_token)).toBeNull();
  });

  it("revokes newly issued credentials when a concurrent old-token replay follows rotation", async () => {
    const initial = await issueMcpTokenPair({
      userId: user.id, clientId, resource: getMcpResource(), scopes: ["worldsmith:canon:read"],
    });
    let notifyPaused!: () => void;
    let resumeInsert!: () => void;
    const paused = new Promise<void>((resolve) => { notifyPaused = resolve; });
    const resume = new Promise<void>((resolve) => { resumeInsert = resolve; });
    mocks.setReplacementPause(async () => { notifyPaused(); await resume; });
    const refresh = (token: string) => request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token", client_id: clientId, refresh_token: token, resource: getMcpResource(),
    });
    const first = refresh(initial.refresh_token).then((response) => response);
    await paused;
    let notifyQueued!: () => void;
    const queued = new Promise<void>((resolve) => { notifyQueued = resolve; });
    mocks.setTransactionQueued(notifyQueued);
    const replay = refresh(initial.refresh_token).then((response) => response);
    await queued;
    mocks.setTransactionQueued();
    resumeInsert();
    const issued = await first;
    expect(issued.status).toBe(200);
    expect((await replay).status).toBe(400);
    expect(await verifyMcpBearer(issued.body.access_token)).toBeNull();
    const replacement = await refresh(issued.body.refresh_token);
    expect(replacement.status).toBe(400);
    expect(replacement.body.error).toBe("invalid_grant");
  });

  it("revokes an access credential and rechecks current privilege on every verification", async () => {
    const grant = await issueMcpTokenPair({
      userId: user.id, clientId, resource: getMcpResource(), scopes: ["worldsmith:canon:read"],
    });
    await expect(verifyMcpAccessToken(grant.access_token)).resolves.toEqual({
      userId: user.id, clientId, scopes: ["worldsmith:canon:read"],
    });
    await request(app).post("/mcp/oauth/revoke").type("form").send({
      client_id: clientId, token: grant.access_token,
    }).expect(200);
    await expect(verifyMcpAccessToken(grant.access_token)).rejects.toMatchObject({
      status: 401, code: "invalid_token",
    });

    const secondGrant = await issueMcpTokenPair({
      userId: user.id, clientId, resource: getMcpResource(), scopes: ["worldsmith:canon:read"],
    });
    mocks.data.users[0].platformRole = null;
    expect(await verifyMcpBearer(secondGrant.access_token)).toBeNull();
    await request(app).post("/mcp/oauth/token").type("form").send({
      grant_type: "refresh_token", client_id: clientId,
      refresh_token: secondGrant.refresh_token, resource: getMcpResource(),
    }).expect(400);
  });
});