/**
 * One-off, authenticated production verification. No credential or bearer
 * value is ever printed. Run only with a trusted, verified published origin:
 *   node artifacts/api-server/scripts/verify-production-mcp.mjs https://example.replit.app
 */
import { createHash, randomBytes } from "node:crypto";

const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://")) {
  throw new Error("Pass the verified HTTPS production origin as the only argument");
}
const editAndRestore = process.argv[3] === "--edit-and-restore";
if (process.argv[3] && !editAndRestore) {
  throw new Error("Only --edit-and-restore is supported as an optional second argument");
}
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  throw new Error("Existing ADMIN_EMAIL and ADMIN_PASSWORD secrets are required");
}

const cookies = new Map();
function absorbCookies(response) {
  for (const header of response.headers.getSetCookie()) {
    const first = header.split(";")[0];
    const separator = first.indexOf("=");
    if (separator > 0) cookies.set(first.slice(0, separator), first.slice(separator + 1));
  }
}
async function send(path, { method = "GET", body, contentType, auth } = {}) {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: "manual",
    headers: {
      ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body,
  });
  absorbCookies(response);
  return response;
}
function requireStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label} returned HTTP ${response.status}`);
}
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const state = randomBytes(16).toString("hex");
const resource = `${origin}/mcp`;
const callback = `${origin}/mcp/oauth/verification-callback`;
let clientId;
let tokens;
let writeTokens;
try {
  const metadataResponse = await send("/.well-known/oauth-authorization-server");
  requireStatus(metadataResponse, 200, "OAuth discovery");
  const metadata = await metadataResponse.json();
  if (metadata.issuer !== origin || !metadata.scopes_supported.includes("worldsmith:canon:read")) {
    throw new Error("Unexpected production OAuth issuer or scope");
  }
  const registration = await send("/mcp/oauth/register", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      client_name: "WorldSmith production verification",
      redirect_uris: [callback],
    }),
  });
  requireStatus(registration, 201, "OAuth client registration");
  clientId = (await registration.json()).client_id;

  const login = await send("/api/auth/staff/login", {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  requireStatus(login, 200, "Production admin sign-in");
  const authorize = new URL("/mcp/oauth/authorize", origin);
  for (const [key, value] of Object.entries({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    state,
    resource,
    scope: "worldsmith:canon:read",
    code_challenge: challenge,
    code_challenge_method: "S256",
  })) authorize.searchParams.set(key, value);
  const consentPage = await send(authorize.pathname + authorize.search);
  requireStatus(consentPage, 200, "OAuth consent page");
  const html = await consentPage.text();
  const csrf = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];
  if (!csrf || !html.includes(callback) || !html.includes("Read Canon data")) {
    throw new Error("OAuth consent form did not match the registered callback and read scope");
  }
  const consent = await send("/mcp/oauth/authorize", {
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: new URLSearchParams({ csrf_token: csrf, consent: "approve" }),
  });
  requireStatus(consent, 302, "OAuth authorization");
  const redirect = new URL(consent.headers.get("location"));
  if (redirect.origin !== origin || redirect.pathname !== "/mcp/oauth/verification-callback" ||
      redirect.searchParams.get("state") !== state) {
    throw new Error("OAuth authorization redirected to an unexpected callback");
  }
  const code = redirect.searchParams.get("code");
  if (!code) throw new Error("OAuth authorization did not issue a code");
  const exchange = await send("/mcp/oauth/token", {
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: clientId,
      code, redirect_uri: callback, code_verifier: verifier, resource,
    }),
  });
  requireStatus(exchange, 200, "OAuth code exchange");
  tokens = await exchange.json();
  if (tokens.scope !== "worldsmith:canon:read") throw new Error("Unexpected granted scope");

  async function rpc(method, params = {}) {
    const response = await send("/mcp", {
      method: "POST", contentType: "application/json", auth: tokens.access_token,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    requireStatus(response, 200, `MCP ${method}`);
    const payload = await response.json();
    if (payload.error || payload.result?.isError) throw new Error(`MCP ${method} returned an error`);
    return payload.result;
  }
  const tools = (await rpc("tools/list")).tools;
  if (!Array.isArray(tools)) throw new Error("MCP tools/list omitted tools");
  const names = tools.map(tool => tool.name);
  const read = await rpc("tools/call", {
    name: "get_canon_record",
    arguments: { record_id: "edb29f8a-af50-49fa-bf8c-9c07dadd4ad6" },
  });
  const result = read.structuredContent;
  if (result?.record?.name !== "Elias Ashcroft" || result.record.canonType !== "character") {
    throw new Error("Authenticated MCP read returned the wrong record");
  }
  console.log(JSON.stringify({
    authenticated: true, tools: names, advertisedScopes: metadata.scopes_supported,
    grantedScopes: tokens.scope, readRecord: {
      id: result.record.id, name: result.record.name,
      status: result.record.status, revision: result.revision ?? result.version,
    },
  }));
  if (editAndRestore) {
    const updateTool = tools.find(tool => tool.name === "update_canon_record");
    const required = updateTool?.inputSchema?.required ?? [];
    if (!["record_id", "changes", "expected_revision"].every(key => required.includes(key))) {
      throw new Error("Published update_canon_record does not expose the required revision-based input");
    }
    const original = result.character_profile ?? {};
    const existingField = ["coreDesire", "coreNeed", "coreFear", "misconception", "pronouns"]
      .find(key => typeof original[key] === "string" && original[key].length > 0);
    if (!existingField && result.character_profile !== null) {
      throw new Error("An existing profile has no safely reversible free-text field");
    }
    const field = existingField ?? "pronouns";
    const originalValue = existingField ? original[field] : null;
    const initialRevision = result.revision ?? result.version;
    const temporary = originalValue === null
      ? `Temporary MCP verification ${randomBytes(4).toString("hex")}`
      : `${originalValue} [temporary MCP verification ${randomBytes(4).toString("hex")}]`;
    const args = {
      record_id: result.record.id, expected_revision: initialRevision,
      changes: { [field]: temporary },
    };

    const denied = await send("/mcp", {
      method: "POST", contentType: "application/json", auth: tokens.access_token,
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: "update_canon_record", arguments: args },
      }),
    });
    requireStatus(denied, 403, "Read-only grant attempting a write");

    const nextState = randomBytes(16).toString("hex");
    authorize.searchParams.set("scope", "worldsmith:canon:read worldsmith:canon:write");
    authorize.searchParams.set("state", nextState);
    const writeConsentPage = await send(authorize.pathname + authorize.search);
    requireStatus(writeConsentPage, 200, "Write OAuth consent page");
    const writeHtml = await writeConsentPage.text();
    const writeCsrf = /name="csrf_token" value="([^"]+)"/.exec(writeHtml)?.[1];
    if (!writeCsrf || !writeHtml.includes("Separate write permission")) {
      throw new Error("Write access was not shown as a separate OAuth consent");
    }
    const writeConsent = await send("/mcp/oauth/authorize", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({ csrf_token: writeCsrf, consent: "approve", allow_write: "yes" }),
    });
    requireStatus(writeConsent, 302, "Write OAuth authorization");
    const writeRedirect = new URL(writeConsent.headers.get("location"));
    if (writeRedirect.origin !== origin || writeRedirect.pathname !== "/mcp/oauth/verification-callback" ||
        writeRedirect.searchParams.get("state") !== nextState) {
      throw new Error("Write OAuth authorization redirected to an unexpected callback");
    }
    const writeCode = writeRedirect.searchParams.get("code");
    if (!writeCode) throw new Error("Write authorization did not issue a code");
    const writeExchange = await send("/mcp/oauth/token", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: clientId,
        code: writeCode, redirect_uri: callback, code_verifier: verifier, resource,
      }),
    });
    requireStatus(writeExchange, 200, "Write OAuth code exchange");
    writeTokens = await writeExchange.json();
    if (writeTokens.scope !== "worldsmith:canon:read worldsmith:canon:write") {
      throw new Error("Write grant did not contain the exact requested scopes");
    }
    async function tool(name, argumentsObject) {
      const response = await send("/mcp", {
        method: "POST", contentType: "application/json", auth: writeTokens.access_token,
        body: JSON.stringify({
          jsonrpc: "2.0", id: 3, method: "tools/call",
          params: { name, arguments: argumentsObject },
        }),
      });
      requireStatus(response, 200, `Write-granted ${name}`);
      return (await response.json()).result;
    }
    let writeAttempted = false;
    try {
      writeAttempted = true;
      const saved = await tool("update_canon_record", args);
      if (saved?.isError || saved?.structuredContent?.record?.id !== result.record.id ||
          saved.structuredContent.revision !== initialRevision + 1 ||
          saved.structuredContent.character_profile?.[field] !== temporary) {
        throw new Error("Temporary edit was not returned as a saved, revisioned record");
      }
      const conflicting = await tool("update_canon_record", args);
      if (!conflicting?.isError || !conflicting.content?.[0]?.text?.includes("VERSION_CONFLICT")) {
        throw new Error("Stale expected_revision was not rejected");
      }
      const fieldOptions = await tool("get_canon_field_options", {
        world_id: result.record.worldId, canon_type: "character",
      });
      if (fieldOptions?.isError) throw new Error("Could not inspect Character field options");
      const hasLifeStageChoices = (fieldOptions.structuredContent?.fields?.lifeStage?.choices?.length ?? 0) > 0;
      const invalid = await tool("update_canon_record", {
        record_id: result.record.id, expected_revision: initialRevision + 1,
        changes: hasLifeStageChoices
          ? { lifeStage: "__not_a_world_vocabulary_option__" }
          : { definitelyNotACharacterField: "invalid" },
      });
      const invalidCode = hasLifeStageChoices ? "INVALID_PICKLIST_VALUE" : "INVALID_CHANGES";
      if (!invalid?.isError || !invalid.content?.[0]?.text?.includes(invalidCode)) {
        throw new Error("Invalid Character field value was not rejected");
      }
      console.log(JSON.stringify({
        permissionCheck: "read-only grant rejected", revisionConflict: "rejected",
        invalidField: invalidCode, editedField: field,
      }));
    } finally {
      if (writeAttempted) {
        const latest = (await tool("get_canon_record", { record_id: result.record.id })).structuredContent;
        if (!latest) throw new Error(`Cannot inspect ${field} after the attempted write`);
        if (latest.character_profile?.[field] === originalValue && latest.revision === initialRevision) {
          // The write was rejected before any mutation.
        } else if (latest.character_profile?.[field] !== temporary) {
          throw new Error(`Cannot safely restore ${field}: the field changed outside this verification`);
        } else {
          const restored = await tool("update_canon_record", {
            record_id: result.record.id, expected_revision: latest.revision,
            changes: { [field]: originalValue },
          });
          if (restored?.isError || restored?.structuredContent?.character_profile?.[field] !==
              (originalValue ?? undefined)) {
            throw new Error(`Restoring ${field} failed; inspect the record change history`);
          }
          const verified = (await tool("get_canon_record", { record_id: result.record.id })).structuredContent;
          if (JSON.stringify(verified?.character_profile) !== JSON.stringify(result.character_profile) ||
              verified.workflow_status !== result.workflow_status ||
              verified.revision !== initialRevision + 2) {
            throw new Error(`Restoration check failed for ${field}`);
          }
          console.log(JSON.stringify({
            restored: true, recordId: result.record.id, field,
            status: verified.workflow_status, revision: verified.revision,
          }));
        }
      }
    }
  }
} finally {
  if (clientId) {
    for (const token of [
      tokens?.access_token, tokens?.refresh_token,
      writeTokens?.access_token, writeTokens?.refresh_token,
    ].filter(Boolean)) {
      await send("/mcp/oauth/revoke", {
        method: "POST", contentType: "application/x-www-form-urlencoded",
        body: new URLSearchParams({ token, client_id: clientId }),
      }).catch(() => {});
    }
  }
}