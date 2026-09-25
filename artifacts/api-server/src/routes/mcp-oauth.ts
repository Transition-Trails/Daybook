import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, mcpOAuthAuthorizationCodesTable, mcpOAuthClientsTable, mcpOAuthTokensTable, usersTable } from "@workspace/db";
import { isSuperAdmin } from "../lib/roles";
import { limitMcpRegistration } from "../lib/mcp-registration-limit";
import {
  createOpaqueSecret,
  AUTHORIZATION_CODE_TTL_SECONDS,
  getMcpIssuer,
  getMcpResource,
  hasWriteWithoutRead,
  isValidS256Challenge,
  issueMcpTokenPair,
  MCP_SCOPES,
  parseMcpScopes,
  REFRESH_TOKEN_TTL_SECONDS,
  sha256,
  verifyPkce,
  type McpScope,
} from "../lib/mcp-oauth";

const oauthRouter: IRouter = Router();
const metadataRouter: IRouter = Router();

interface ConsentSession {
  csrf: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  resource: string;
  scopes: McpScope[];
  codeChallenge: string;
  codeChallengeMethod: "S256";
  resumeUrl: string;
}

function setPrivateHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function oauthError(res: Response, status: number, error: string, description?: string): void {
  setPrivateHeaders(res);
  res.status(status).json({ error, ...(description ? { error_description: description } : {}) });
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 2048) return false;
  try {
    const parsed = new URL(uri);
    return parsed.protocol === "https:" &&
      !parsed.username && !parsed.password &&
      !parsed.hash &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "[::1]" &&
      !parsed.hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

async function findClient(clientId: unknown) {
  if (typeof clientId !== "string" || clientId.length > 256) return undefined;
  const [client] = await db.select().from(mcpOAuthClientsTable)
    .where(eq(mcpOAuthClientsTable.clientId, clientId)).limit(1);
  return client;
}

function getRequestParam(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isSupportedScopeSet(value: unknown): value is McpScope[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((scope) => typeof scope === "string" && MCP_SCOPES.includes(scope as McpScope));
}

function describeScope(scope: McpScope): string {
  switch (scope) {
    case "worldsmith:canon:read": return "Read Canon data";
    case "worldsmith:canon:write": return "Write Canon data";
    case "worldsmith:editorial:read": return "Read WorldSmith worlds, story maps, storylines, movements, and sequences";
    case "worldsmith:editorial:write": return "Write WorldSmith worlds, story maps, storylines, movements, and sequences";
  }
}

metadataRouter.get("/.well-known/oauth-authorization-server", (_req, res) => {
  let issuer: string;
  try {
    issuer = getMcpIssuer();
  } catch (error) {
    oauthError(res, 503, "server_error", error instanceof Error ? error.message : "OAuth issuer is not configured");
    return;
  }
  setPrivateHeaders(res);
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/mcp/oauth/authorize`,
    token_endpoint: `${issuer}/mcp/oauth/token`,
    registration_endpoint: `${issuer}/mcp/oauth/register`,
    revocation_endpoint: `${issuer}/mcp/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...MCP_SCOPES],
  });
});

function protectedResourceMetadata(_req: Request, res: Response): void {
  let issuer: string;
  let resource: string;
  try {
    issuer = getMcpIssuer();
    resource = getMcpResource();
  } catch (error) {
    oauthError(res, 503, "server_error", error instanceof Error ? error.message : "OAuth issuer is not configured");
    return;
  }
  setPrivateHeaders(res);
  res.json({
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: [...MCP_SCOPES],
  });
}

metadataRouter.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);
metadataRouter.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);

// Mount this router at /mcp/oauth (the routes below are relative to that base).
oauthRouter.post("/register", async (req, res): Promise<void> => {
  let admission: Awaited<ReturnType<typeof limitMcpRegistration>>;
  try {
    admission = await limitMcpRegistration(req.ip || req.socket.remoteAddress || "unknown");
  } catch (error) {
    req.log?.error({ err: error }, "MCP registration rate limiter unavailable");
    oauthError(res, 503, "server_error", "Registration is temporarily unavailable");
    return;
  }
  if (!admission.allowed) {
    res.setHeader("Retry-After", String(admission.retryAfter));
    oauthError(res, 429, "slow_down", "Dynamic client registration limit exceeded");
    return;
  }
  const body = req.body as { redirect_uris?: unknown; client_name?: unknown };
  if (!Array.isArray(body?.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 20 ||
      !body.redirect_uris.every(validRedirectUri) || new Set(body.redirect_uris).size !== body.redirect_uris.length) {
    oauthError(res, 400, "invalid_client_metadata", "redirect_uris must contain unique HTTPS URLs");
    return;
  }
  if (body.client_name !== undefined && (typeof body.client_name !== "string" || body.client_name.trim().length === 0 || body.client_name.length > 128)) {
    oauthError(res, 400, "invalid_client_metadata", "client_name must be a non-empty string of at most 128 characters");
    return;
  }
  const clientId = createOpaqueSecret();
  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "MCP client";
  await db.insert(mcpOAuthClientsTable).values({
    clientId,
    clientName,
    redirectUris: body.redirect_uris,
  });
  setPrivateHeaders(res);
  res.status(201).json({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: body.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
});

oauthRouter.get("/authorize", async (req, res): Promise<void> => {
  const clientId = getRequestParam(req.query.client_id);
  const redirectUri = getRequestParam(req.query.redirect_uri);
  const responseType = getRequestParam(req.query.response_type);
  const state = getRequestParam(req.query.state);
  const resource = getRequestParam(req.query.resource);
  const challenge = getRequestParam(req.query.code_challenge);
  const challengeMethod = getRequestParam(req.query.code_challenge_method);
  const scopeParam = getRequestParam(req.query.scope);
  const scopes = scopeParam === undefined ? ["worldsmith:canon:read"] as McpScope[] : parseMcpScopes(scopeParam);
  const client = await findClient(clientId);
  if (!client || !redirectUri || !client.redirectUris.includes(redirectUri)) {
    oauthError(res, 400, "invalid_request", "Unknown client or redirect_uri does not exactly match registration");
    return;
  }
  if (responseType !== "code" || !state || state.length > 1024 || !resource || !scopes ||
      !isValidS256Challenge(challenge) || challengeMethod !== "S256") {
    oauthError(res, 400, "invalid_request", "response_type=code, state, resource, and S256 PKCE are required; scope, when supplied, must be supported");
    return;
  }
  if (hasWriteWithoutRead(scopes)) {
    oauthError(res, 400, "invalid_scope", "Each write scope requires its corresponding read scope to be explicitly requested as well");
    return;
  }
  let expectedResource: string;
  try {
    expectedResource = getMcpResource();
  } catch (error) {
    oauthError(res, 503, "server_error", error instanceof Error ? error.message : "OAuth issuer is not configured");
    return;
  }
  if (resource !== expectedResource) {
    oauthError(res, 400, "invalid_target", "resource must identify this MCP server");
    return;
  }

  const resumeUrl = req.originalUrl;
  if (!req.isAuthenticated()) {
    setPrivateHeaders(res);
    // Only preserve an internal absolute path; never let an authorization
    // request turn login's returnTo into an open redirect.
    const safeReturnTo = resumeUrl.startsWith("/") && !resumeUrl.startsWith("//") && !resumeUrl.includes("\\")
      ? resumeUrl
      : "/mcp/oauth/authorize";
    res.redirect(302, `/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
    return;
  }
  const signedInUser = req.user as { id?: unknown } | undefined;
  const userId = typeof signedInUser?.id === "string" ? signedInUser.id : "";
  const [user] = userId ? await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1) : [];
  if (!user || !isSuperAdmin(user)) {
    oauthError(res, 403, "access_denied", "Only current Daybook super admins can authorize MCP access");
    return;
  }
  const csrf = createOpaqueSecret();
  const callbackOrigin = new URL(redirectUri).origin;
  const requestsCanonWrite = scopes.includes("worldsmith:canon:write");
  const requestsEditorialWrite = scopes.includes("worldsmith:editorial:write");
  const consent: ConsentSession = {
    csrf,
    userId: user.id,
    clientId: client.clientId,
    redirectUri,
    state,
    resource,
    scopes,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    resumeUrl,
  };
  (req.session as typeof req.session & { mcpOAuthConsent?: ConsentSession }).mcpOAuthConsent = consent;
  setPrivateHeaders(res);
  res.type("html").send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorize MCP access</title></head><body>` +
    `<main><h1>Authorize MCP access</h1><p>Signed in as ${htmlEscape(user.email)}.</p>` +
    `<section role="alert" style="border:3px solid #9a3412;background:#fff7ed;padding:16px;margin:16px 0">` +
    `<h2>Unverified client name: ${htmlEscape(client.clientName)}</h2>` +
    `<p>The name is self-reported by the registrant and does not prove this client is operated by that organization.</p>` +
    `<p><strong>Exact registered callback origin:</strong> <code>${htmlEscape(callbackOrigin)}</code></p>` +
    `<p><strong>Exact registered callback URL:</strong> <code>${htmlEscape(redirectUri)}</code></p>` +
    `<p>These HTTPS URLs match this client's registration; the registrant's identity/domain ownership is not independently verified.</p></section>` +
    `<p>This client requests:</p><ul>${scopes.map((scope) => `<li>${htmlEscape(describeScope(scope))}</li>`).join("")}</ul>` +
    `<p>Only approve if you trust the client and the callback details above.</p><form method="post" action="/mcp/oauth/authorize">` +
    `<input type="hidden" name="csrf_token" value="${htmlEscape(csrf)}">` +
    `${requestsCanonWrite ? `<fieldset style="border:2px solid #b91c1c;padding:12px;margin:12px 0"><legend>Separate write permission</legend>` +
      `<label><input type="checkbox" name="allow_write" value="yes" required> I explicitly authorize this unverified client to write Canon data on my behalf.</label></fieldset>` : ""}` +
    `${requestsEditorialWrite ? `<fieldset style="border:2px solid #b91c1c;padding:12px;margin:12px 0"><legend>Separate WorldSmith editorial write permission</legend>` +
      `<label><input type="checkbox" name="allow_editorial_write" value="yes" required> I explicitly authorize this unverified client to write WorldSmith worlds, story maps, storylines, movements, and sequences on my behalf.</label></fieldset>` : ""}` +
    `<button type="submit" name="consent" value="approve">Approve requested access</button> ` +
    `<button type="submit" name="consent" value="deny" formnovalidate>Deny</button></form></main></body></html>`,
  );
});

oauthRouter.post("/authorize", async (req, res): Promise<void> => {
  const session = req.session as typeof req.session & { mcpOAuthConsent?: ConsentSession };
  const consent = session.mcpOAuthConsent;
  delete session.mcpOAuthConsent;
  const body = req.body as {
    csrf_token?: unknown;
    consent?: unknown;
    allow_write?: unknown;
    allow_editorial_write?: unknown;
  };
  const csrf = typeof body?.csrf_token === "string" ? body.csrf_token : "";
  if (!req.isAuthenticated() || !consent || !csrf || csrf !== consent.csrf || !["approve", "deny"].includes(String(body?.consent))) {
    oauthError(res, 400, "invalid_request", "Consent form expired or invalid; restart authorization");
    return;
  }
  const userSession = req.user as { id?: unknown } | undefined;
  if (userSession?.id !== consent.userId) {
    oauthError(res, 403, "access_denied", "The signed-in account changed; restart authorization");
    return;
  }
  if (body.consent !== "approve") {
    const target = new URL(consent.redirectUri);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("state", consent.state);
    res.redirect(302, target.toString());
    return;
  }
  if (consent.scopes.includes("worldsmith:canon:write") && body.allow_write !== "yes") {
    oauthError(res, 400, "access_denied", "Explicit separate consent is required for Canon write access");
    return;
  }
  if (consent.scopes.includes("worldsmith:editorial:write") && body.allow_editorial_write !== "yes") {
    oauthError(res, 400, "access_denied", "Explicit separate consent is required for WorldSmith editorial write access");
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, consent.userId)).limit(1);
  const client = await findClient(consent.clientId);
  if (!user || !isSuperAdmin(user) || !client || !client.redirectUris.includes(consent.redirectUri)) {
    oauthError(res, 403, "access_denied", "The account or client is no longer eligible");
    return;
  }
  const code = createOpaqueSecret();
  await db.insert(mcpOAuthAuthorizationCodesTable).values({
    codeHash: sha256(code),
    clientId: consent.clientId,
    userId: consent.userId,
    redirectUri: consent.redirectUri,
    resource: consent.resource,
    scopes: consent.scopes,
    codeChallenge: consent.codeChallenge,
    expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
  });
  const target = new URL(consent.redirectUri);
  target.searchParams.set("code", code);
  target.searchParams.set("state", consent.state);
  setPrivateHeaders(res);
  res.redirect(302, target.toString());
});

oauthRouter.post("/token", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const grantType = getRequestParam(body?.grant_type);
  const clientId = getRequestParam(body?.client_id);
  const resource = getRequestParam(body?.resource);
  if (!clientId || !resource) {
    oauthError(res, 400, "invalid_request", "client_id and resource are required");
    return;
  }
  const client = await findClient(clientId);
  if (!client) {
    oauthError(res, 401, "invalid_client");
    return;
  }
  let expectedResource: string;
  try {
    expectedResource = getMcpResource();
  } catch (error) {
    oauthError(res, 503, "server_error", error instanceof Error ? error.message : "OAuth issuer is not configured");
    return;
  }
  if (resource !== expectedResource) {
    oauthError(res, 400, "invalid_target", "resource must identify this MCP server");
    return;
  }
  if (grantType === "authorization_code") {
    const code = getRequestParam(body.code);
    const redirectUri = getRequestParam(body.redirect_uri);
    const verifier = getRequestParam(body.code_verifier);
    if (!code || !redirectUri || !verifier || !client.redirectUris.includes(redirectUri)) {
      oauthError(res, 400, "invalid_grant", "Authorization code, registered redirect_uri, and verifier are required");
      return;
    }
    const [codeRow] = await db.delete(mcpOAuthAuthorizationCodesTable).where(and(
      eq(mcpOAuthAuthorizationCodesTable.codeHash, sha256(code)),
      eq(mcpOAuthAuthorizationCodesTable.clientId, clientId),
      eq(mcpOAuthAuthorizationCodesTable.redirectUri, redirectUri),
      eq(mcpOAuthAuthorizationCodesTable.resource, resource),
      gt(mcpOAuthAuthorizationCodesTable.expiresAt, new Date()),
    )).returning();
    if (!codeRow || !verifyPkce(verifier, codeRow.codeChallenge)) {
      oauthError(res, 400, "invalid_grant", "Code is invalid, expired, already redeemed, or PKCE verification failed");
      return;
    }
    if (!isSupportedScopeSet(codeRow.scopes)) {
      oauthError(res, 400, "invalid_scope", "Authorization grant contains unsupported scopes");
      return;
    }
    let approvedScopes = codeRow.scopes;
    if (hasWriteWithoutRead(approvedScopes)) {
      oauthError(res, 400, "invalid_scope", "Authorization grant has a write scope without its corresponding read scope");
      return;
    }
    if (body.scope !== undefined) {
      const requestedScopes = parseMcpScopes(body.scope);
      if (!requestedScopes || hasWriteWithoutRead(requestedScopes) ||
          requestedScopes.some((scope) => !approvedScopes.includes(scope))) {
        oauthError(res, 400, "invalid_scope", "Requested scopes are invalid or exceed the user's authorization");
        return;
      }
      approvedScopes = requestedScopes;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, codeRow.userId)).limit(1);
    if (!user || !isSuperAdmin(user)) {
      oauthError(res, 400, "invalid_grant", "The authorizing account is no longer eligible");
      return;
    }
    const tokens = await issueMcpTokenPair({
      userId: codeRow.userId,
      clientId,
      resource,
      scopes: approvedScopes,
    });
    setPrivateHeaders(res);
    res.json(tokens);
    return;
  }
  if (grantType === "refresh_token") {
    const refreshToken = getRequestParam(body.refresh_token);
    if (!refreshToken) {
      oauthError(res, 400, "invalid_grant", "refresh_token is required");
      return;
    }
    const tokenHash = sha256(refreshToken);
    const [existing] = await db.select().from(mcpOAuthTokensTable).where(and(
      eq(mcpOAuthTokensTable.tokenHash, tokenHash),
      eq(mcpOAuthTokensTable.kind, "refresh"),
      eq(mcpOAuthTokensTable.clientId, clientId),
    )).limit(1);
    if (!existing) {
      oauthError(res, 400, "invalid_grant");
      return;
    }
    if (!isSupportedScopeSet(existing.scopes)) {
      oauthError(res, 400, "invalid_scope", "Refresh token contains unsupported scopes");
      return;
    }
    const requestedScopes = body.scope === undefined ? existing.scopes : parseMcpScopes(body.scope);
    if (!requestedScopes || hasWriteWithoutRead(requestedScopes)) {
      oauthError(res, 400, "invalid_scope", "Each write scope requires its corresponding read scope to be explicitly requested as well");
      return;
    }
    if (existing.resource !== resource ||
        requestedScopes.some((scope) => !(existing.scopes as string[]).includes(scope))) {
      oauthError(res, 400, "invalid_grant", "Refresh token is expired, audience-mismatched, or scope escalation was requested");
      return;
    }
    const outcome = await db.transaction(async (tx) => {
      // Every mutation of a refresh family uses this database-wide lock. A
      // replay cannot revoke the family between consuming and issuing tokens.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${existing.familyId}, 0))`);
      const [current] = await tx.select().from(mcpOAuthTokensTable)
        .where(eq(mcpOAuthTokensTable.tokenHash, tokenHash)).limit(1);
      if (!current || current.revokedAt) {
        await tx.update(mcpOAuthTokensTable).set({ revokedAt: new Date() })
          .where(eq(mcpOAuthTokensTable.familyId, existing.familyId));
        return { error: "Refresh token replay detected; token family revoked" } as const;
      }
      if (current.expiresAt <= new Date()) {
        return { error: "Refresh token is expired" } as const;
      }
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, current.userId)).limit(1);
      if (!user || !isSuperAdmin(user)) {
        await tx.update(mcpOAuthTokensTable).set({ revokedAt: new Date() })
          .where(eq(mcpOAuthTokensTable.familyId, existing.familyId));
        return { error: "The authorizing account is no longer eligible" } as const;
      }
      const [consumed] = await tx.update(mcpOAuthTokensTable).set({ revokedAt: new Date() })
        .where(and(
          eq(mcpOAuthTokensTable.tokenHash, tokenHash),
          isNull(mcpOAuthTokensTable.revokedAt),
          gt(mcpOAuthTokensTable.expiresAt, new Date()),
        )).returning();
      if (!consumed) return { error: "Refresh token is expired" } as const;
      const tokens = await issueMcpTokenPair({
        userId: current.userId, clientId, resource, scopes: requestedScopes,
        familyId: current.familyId,
      }, tx);
      return { tokens } as const;
    });
    if ("error" in outcome) {
      oauthError(res, 400, "invalid_grant", outcome.error);
      return;
    }
    setPrivateHeaders(res);
    res.json({ ...outcome.tokens, refresh_token_expires_in: REFRESH_TOKEN_TTL_SECONDS });
    return;
  }
  oauthError(res, 400, "unsupported_grant_type");
});

oauthRouter.post("/revoke", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const token = getRequestParam(body?.token);
  const clientId = getRequestParam(body?.client_id);
  if (!token || !clientId) {
    oauthError(res, 400, "invalid_request", "token and client_id are required");
    return;
  }
  if (!await findClient(clientId)) {
    oauthError(res, 401, "invalid_client");
    return;
  }
  const [grant] = await db.select().from(mcpOAuthTokensTable).where(and(
    eq(mcpOAuthTokensTable.tokenHash, sha256(token)),
    eq(mcpOAuthTokensTable.clientId, clientId),
  )).limit(1);
  if (grant) {
    if (grant.kind === "refresh") {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${grant.familyId}, 0))`);
        await tx.update(mcpOAuthTokensTable).set({ revokedAt: new Date() })
          .where(eq(mcpOAuthTokensTable.familyId, grant.familyId));
      });
    } else {
      await db.update(mcpOAuthTokensTable).set({ revokedAt: new Date() })
        .where(eq(mcpOAuthTokensTable.tokenHash, grant.tokenHash)).returning();
    }
  }
  setPrivateHeaders(res);
  res.status(200).send();
});

/** Mount oauthRouter at /mcp/oauth to serve /authorize, /token, /register, /revoke. */
/** Mount metadataRouter at the server root for RFC 8414 and both RFC 9728 well-known URLs. */
export { oauthRouter, metadataRouter };