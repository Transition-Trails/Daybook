import { Router, type Request, type Response } from "express";
import { CANON_TOOLS, CHARACTER_REPEATER_WRITE_TOOLS, executeCanonTool } from "../lib/worldsmith/mcp-canon";
import { CANON_METADATA_TOOL } from "../lib/worldsmith/canon-metadata";
import { CANON_EDITORIAL_TOOLS, CANON_EDITORIAL_WRITE_TOOLS, executeCanonEditorialTool } from "../lib/worldsmith/mcp-canon-editorial";
import { RELATION_TOOLS, RELATION_WRITE_TOOLS, executeRelationTool } from "../lib/worldsmith/mcp-canon-relations";
import { RECORD_TOOLS, RECORD_WRITE_TOOLS, RECORD_CREATE_TOOLS, executeRecordTool } from "../lib/worldsmith/mcp-editorial-records";
import { SCENE_TOOLS, SCENE_WRITE_TOOLS, executeSceneTool } from "../lib/worldsmith/mcp-editorial-scenes";
import { VIEW_TOOLS, VIEW_WRITE_TOOLS, executeViewTool } from "../lib/worldsmith/mcp-editorial-views";
import { PRODUCTION_CATALOG_TOOLS, PRODUCTION_CATALOG_WRITE_TOOLS, executeProductionCatalogTool } from "../lib/worldsmith/mcp-production-catalog";
import { PRODUCTION_SPEC_TOOLS, PRODUCTION_SPEC_WRITE_TOOLS, executeProductionSpecTool } from "../lib/worldsmith/mcp-production-specs";
import { PRINT_TARGET_TOOLS, PRINT_TARGET_WRITE_TOOLS, executePrintTargetTool } from "../lib/worldsmith/mcp-print-targets";
import { READINESS_PLANNING_TOOLS, READINESS_PLANNING_WRITE_TOOLS, executeReadinessPlanningTool } from "../lib/worldsmith/mcp-readiness-planning";
import { getMcpIssuer, verifyMcpAccessToken } from "../lib/mcp-oauth";
import { logger } from "../lib/logger";

const router = Router();
const PROTOCOL_VERSION = "2025-11-25";
const READ_SCOPE = "worldsmith:canon:read";
const WRITE_SCOPE = "worldsmith:canon:write";
const EDITORIAL_READ_SCOPE = "worldsmith:editorial:read";
const EDITORIAL_WRITE_SCOPE = "worldsmith:editorial:write";
const EDITORIAL_CREATE_SCOPE = "worldsmith:editorial:create";
const REFERENCES_WRITE_SCOPE = "worldsmith:editorial:references:write";
const STORY_DETAILS_WRITE_SCOPE = "worldsmith:editorial:story-details:write";
const CANON_EDITORIAL_WRITE_SCOPE = "worldsmith:canon:editorial:write";
const CANON_RELATIONS_WRITE_SCOPE = "worldsmith:canon:relations:write";
const SCENES_READ_SCOPE = "worldsmith:editorial:scenes:read";
const SCENES_WRITE_SCOPE = "worldsmith:editorial:scenes:write";
const PRODUCTION_READ_SCOPE = "worldsmith:production:read";
const PRODUCTION_WRITE_SCOPE = "worldsmith:production:write";
const READINESS_READ_SCOPE = "worldsmith:readiness:read";
const READINESS_WRITE_SCOPE = "worldsmith:readiness:write";
const MCP_RESOURCE = "/mcp";
const MAX_BODY_BYTES = 1_000_000;
const tools = [...CANON_TOOLS, ...CANON_EDITORIAL_TOOLS, ...RELATION_TOOLS, ...RECORD_TOOLS, ...VIEW_TOOLS, ...SCENE_TOOLS,
  ...PRODUCTION_CATALOG_TOOLS, ...PRODUCTION_SPEC_TOOLS, ...PRINT_TARGET_TOOLS, ...READINESS_PLANNING_TOOLS];
const productionTool = (name: string) => [...PRODUCTION_CATALOG_TOOLS, ...PRODUCTION_SPEC_TOOLS, ...PRINT_TARGET_TOOLS]
  .some(tool => tool.name === name);
const productionWriteTool = (name: string) => PRODUCTION_CATALOG_WRITE_TOOLS.has(name)
  || PRODUCTION_SPEC_WRITE_TOOLS.has(name) || PRINT_TARGET_WRITE_TOOLS.has(name);

function publicOrigin(req: Request): string {
  return getMcpIssuer();
}

function challenge(req: Request, res: Response, error = "invalid_token"): void {
  const url = `${publicOrigin(req)}/.well-known/oauth-protected-resource/mcp`;
  const requiredScopes = `${READ_SCOPE} ${WRITE_SCOPE} ${EDITORIAL_READ_SCOPE} ${EDITORIAL_WRITE_SCOPE} ${EDITORIAL_CREATE_SCOPE} ${REFERENCES_WRITE_SCOPE} ${STORY_DETAILS_WRITE_SCOPE} ${CANON_EDITORIAL_WRITE_SCOPE} ${CANON_RELATIONS_WRITE_SCOPE} ${SCENES_READ_SCOPE} ${SCENES_WRITE_SCOPE} ${PRODUCTION_READ_SCOPE} ${PRODUCTION_WRITE_SCOPE} ${READINESS_READ_SCOPE} ${READINESS_WRITE_SCOPE}`;
  res.set("WWW-Authenticate", `Bearer realm="WorldSmith", error="${error}", resource_metadata="${url}", scope="${requiredScopes}"`);
  res.status(error === "insufficient_scope" ? 403 : 401).json({ error });
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

router.all(MCP_RESOURCE, async (req: Request, res: Response): Promise<void> => {
  if (req.method === "OPTIONS") {
    res.set("Allow", "POST, OPTIONS").status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS").status(405).end();
    return;
  }
  const authorization = req.get("authorization");
  const bearer = /^Bearer ([A-Za-z0-9._~+/-]+)$/i.exec(authorization ?? "");
  if (!bearer) {
    challenge(req, res);
    return;
  }
  let identity: Awaited<ReturnType<typeof verifyMcpAccessToken>>;
  try {
    identity = await verifyMcpAccessToken(bearer[1]!);
  } catch {
    challenge(req, res);
    return;
  }
  if (!identity.scopes.includes(READ_SCOPE) && !identity.scopes.includes(EDITORIAL_READ_SCOPE)
       && !identity.scopes.includes(SCENES_READ_SCOPE) && !identity.scopes.includes(PRODUCTION_READ_SCOPE)
       && !identity.scopes.includes(READINESS_READ_SCOPE)) {
    challenge(req, res, "insufficient_scope");
    return;
  }
  if (Number(req.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    res.status(413).json({ error: "MCP request too large" });
    return;
  }
  let message: Record<string, unknown> | null;
  try {
    message = typeof req.body === "string"
      ? JSON.parse(req.body) as Record<string, unknown>
      : req.body as Record<string, unknown> | null;
  } catch {
    res.status(400).json(rpcError(null, -32700, "Invalid JSON"));
    return;
  }
  if (!message || Array.isArray(message) || typeof message !== "object" || message.jsonrpc !== "2.0"
      || typeof message.method !== "string") {
    res.status(400).json(rpcError(null, -32600, "Invalid JSON-RPC request"));
    return;
  }
  const id = message.id;
  const method = message.method;
  const visibleTools = tools.filter(tool => (
    productionTool(tool.name)
      ? identity.scopes.includes(PRODUCTION_READ_SCOPE)
        && (!productionWriteTool(tool.name) || identity.scopes.includes(PRODUCTION_WRITE_SCOPE))
      :
    READINESS_PLANNING_TOOLS.some(item => item.name === tool.name)
      ? identity.scopes.includes(READINESS_READ_SCOPE)
        && (!READINESS_PLANNING_WRITE_TOOLS.has(tool.name) || identity.scopes.includes(READINESS_WRITE_SCOPE))
      :
    CANON_TOOLS.some(canon => canon.name === tool.name)
       ? identity.scopes.includes(READ_SCOPE)
          && ((tool.name !== CANON_METADATA_TOOL.name && !CHARACTER_REPEATER_WRITE_TOOLS.has(tool.name))
            || identity.scopes.includes(CANON_EDITORIAL_WRITE_SCOPE))
      : CANON_EDITORIAL_TOOLS.some(canonEditorial => canonEditorial.name === tool.name)
        ? identity.scopes.includes(READ_SCOPE) && identity.scopes.includes(CANON_EDITORIAL_WRITE_SCOPE)
         : RELATION_TOOLS.some(relation => relation.name === tool.name)
           ? identity.scopes.includes(READ_SCOPE) && identity.scopes.includes(CANON_RELATIONS_WRITE_SCOPE)
        : SCENE_TOOLS.some(scene => scene.name === tool.name)
          ? identity.scopes.includes(SCENES_READ_SCOPE)
            && (!SCENE_WRITE_TOOLS.has(tool.name) || identity.scopes.includes(SCENES_WRITE_SCOPE))
      : RECORD_TOOLS.some(record => record.name === tool.name)
        ? identity.scopes.includes(EDITORIAL_READ_SCOPE)
           && (!RECORD_WRITE_TOOLS.has(tool.name) || identity.scopes.includes(EDITORIAL_WRITE_SCOPE))
           && (!RECORD_CREATE_TOOLS.has(tool.name) || identity.scopes.includes(EDITORIAL_CREATE_SCOPE))
        : VIEW_TOOLS.some(view => view.name === tool.name)
          ? identity.scopes.includes(EDITORIAL_READ_SCOPE)
            && (!VIEW_WRITE_TOOLS.has(tool.name) || identity.scopes.includes(EDITORIAL_WRITE_SCOPE))
          : false
  ));
  if (id === undefined) {
    // Stateless MCP notifications (including notifications/initialized) have no response body.
    res.status(202).end();
    return;
  }
  if (typeof id !== "string" && typeof id !== "number") {
    res.status(400).json(rpcError(null, -32600, "Invalid JSON-RPC id"));
    return;
  }
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  const reply = (result: unknown) => res.status(200).json({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "worldsmith-canon", version: "1.0.0" },
      });
      return;
    case "ping":
      reply({});
      return;
    case "tools/list":
      logger.info({
        mcpMethod: "tools/list",
        toolCount: visibleTools.length,
        scopes: identity.scopes,
      }, "MCP tool discovery completed");
      reply({ tools: visibleTools });
      return;
    case "tools/call": {
      const params = message.params;
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        res.status(200).json(rpcError(id, -32602, "Invalid tool parameters"));
        return;
      }
      const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
      if (typeof name !== "string" || !tools.some(tool => tool.name === name)) {
        res.status(200).json(rpcError(id, -32602, "Unknown tool"));
        return;
      }
      const canonTool = CANON_TOOLS.some(tool => tool.name === name);
      const readinessTool = READINESS_PLANNING_TOOLS.some(tool => tool.name === name);
      const canonEditorialTool = CANON_EDITORIAL_TOOLS.some(tool => tool.name === name);
      const relationTool = RELATION_TOOLS.some(tool => tool.name === name);
      const sceneTool = SCENE_TOOLS.some(tool => tool.name === name);
      const editorialRecordOrViewTool = RECORD_TOOLS.some(tool => tool.name === name)
        || VIEW_TOOLS.some(tool => tool.name === name);
      if ((canonTool && !identity.scopes.includes(READ_SCOPE))
          || (canonEditorialTool && !identity.scopes.includes(READ_SCOPE))
          || (relationTool && !identity.scopes.includes(READ_SCOPE))
          || (sceneTool && !identity.scopes.includes(SCENES_READ_SCOPE))
          || (editorialRecordOrViewTool && !identity.scopes.includes(EDITORIAL_READ_SCOPE))
          || (productionTool(name) && !identity.scopes.includes(PRODUCTION_READ_SCOPE))
          || (readinessTool && !identity.scopes.includes(READINESS_READ_SCOPE))) {
        logger.info({ mcpTool: name, outcome: "insufficient_scope" }, "MCP tool call denied");
        challenge(req, res, "insufficient_scope");
        return;
      }
      if ((name === "update_canon_record" && !identity.scopes.includes(WRITE_SCOPE))
          || (CANON_EDITORIAL_WRITE_TOOLS.has(name) && !identity.scopes.includes(CANON_EDITORIAL_WRITE_SCOPE))
          || (RELATION_WRITE_TOOLS.has(name) && !identity.scopes.includes(CANON_RELATIONS_WRITE_SCOPE))
            || ((name === CANON_METADATA_TOOL.name || CHARACTER_REPEATER_WRITE_TOOLS.has(name))
              && !identity.scopes.includes(CANON_EDITORIAL_WRITE_SCOPE))
          || (SCENE_WRITE_TOOLS.has(name) && !identity.scopes.includes(SCENES_WRITE_SCOPE))
          || ((name === "update_story_beat" || name === "update_reveal_thread")
            && !identity.scopes.includes(STORY_DETAILS_WRITE_SCOPE))
           || (productionWriteTool(name) && !identity.scopes.includes(PRODUCTION_WRITE_SCOPE))
            || (READINESS_PLANNING_WRITE_TOOLS.has(name) && !identity.scopes.includes(READINESS_WRITE_SCOPE))
           || ((RECORD_WRITE_TOOLS.has(name) || VIEW_WRITE_TOOLS.has(name))
             && !identity.scopes.includes(EDITORIAL_WRITE_SCOPE))
            || (RECORD_CREATE_TOOLS.has(name) && !identity.scopes.includes(EDITORIAL_CREATE_SCOPE))
           || (name === "update_sequence" && args !== null && typeof args === "object"
             && !Array.isArray(args) && Object.hasOwn(args, "references")
             && !identity.scopes.includes(REFERENCES_WRITE_SCOPE))) {
        logger.info({ mcpTool: name, outcome: "insufficient_scope" }, "MCP tool call denied");
        challenge(req, res, "insufficient_scope");
        return;
      }
      try {
         const data = PRODUCTION_CATALOG_TOOLS.some(tool => tool.name === name)
           ? await executeProductionCatalogTool(identity.userId, name, args ?? {})
           : PRODUCTION_SPEC_TOOLS.some(tool => tool.name === name)
             ? await executeProductionSpecTool(identity.userId, name, args ?? {})
             : PRINT_TARGET_TOOLS.some(tool => tool.name === name)
               ? await executePrintTargetTool(identity.userId, name, args ?? {})
         : CANON_TOOLS.some(tool => tool.name === name)
          ? await executeCanonTool(identity.userId, name, args ?? {}, publicOrigin(req))
          : CANON_EDITORIAL_TOOLS.some(tool => tool.name === name)
            ? await executeCanonEditorialTool(identity.userId, name, args ?? {}, publicOrigin(req))
           : relationTool
             ? await executeRelationTool(identity.userId, name, args ?? {})
          : RECORD_TOOLS.some(tool => tool.name === name)
            ? await executeRecordTool(identity.userId, name, args ?? {}, publicOrigin(req))
            : VIEW_TOOLS.some(tool => tool.name === name)
              ? await executeViewTool(identity.userId, name, args ?? {}, publicOrigin(req))
               : READINESS_PLANNING_TOOLS.some(tool => tool.name === name)
                 ? await executeReadinessPlanningTool(identity.userId, name, args ?? {})
                 : await executeSceneTool(identity.userId, name, args ?? {}, publicOrigin(req));
        const result = {
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: data,
        };
        logger.info({
          mcpTool: name,
          outcome: "success",
          responseBytes: Buffer.byteLength(JSON.stringify({ jsonrpc: "2.0", id, result })),
        }, "MCP tool call completed");
        reply(result);
      } catch (err) {
        const error = err as Error & { code?: string; status?: number };
        logger.warn({
          mcpTool: name,
          outcome: "tool_error",
          code: error.code ?? "tool_error",
          status: error.status ?? null,
        }, "MCP tool call returned an error");
        if (error.status && error.status >= 500) {
          logger.error({ err, method: name }, "MCP canon tool failed");
        }
        reply({
          isError: true,
          content: [{ type: "text", text: JSON.stringify({
            code: error.code ?? "tool_error",
            message: error.status && error.status < 500 ? error.message : "The operation could not be completed",
          }) }],
        });
      }
      return;
    }
    default:
      res.status(200).json(rpcError(id, -32601, "Method not found"));
  }
});

export default router;