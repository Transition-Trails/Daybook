import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  db,
  usersTable,
  worldsmithWorldsTable,
  wsProductionSpecsTable,
} from "@workspace/db";
import { executeProductionSpecTool } from "../lib/worldsmith/mcp-production-specs.js";

const nonce = randomUUID();
const worldIds = [`mcp-prod-spec-${nonce}-a`, `mcp-prod-spec-${nonce}-b`];
let adminId: string;
let specId: string | undefined;
const additionalSpecIds: string[] = [];

beforeAll(async () => {
  const [admin] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.platformRole, "super_admin")).limit(1);
  if (!admin) throw new Error("Production spec MCP tests need a seeded super-admin user");
  adminId = admin.id;
  await db.insert(worldsmithWorldsTable).values(worldIds.map((id, index) => ({
    id, name: `MCP production specs ${nonce} ${index}`, code: `PS${index}${nonce.slice(0, 4)}`,
  })));
});

afterAll(async () => {
  const createdIds = [specId, ...additionalSpecIds].filter((value): value is string => Boolean(value));
  if (createdIds.length) {
    await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, createdIds));
    await db.delete(wsProductionSpecsTable).where(inArray(wsProductionSpecsTable.id, createdIds));
  }
  await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, worldIds));
});

describe("MCP Production Spec tools", () => {
  it("creates validated records and scopes reads to the supplied world", async () => {
    const createInput = {
      record_id: randomUUID(),
      world_id: worldIds[0],
      production_item: "  Field Notes  ",
      component_type: "Journal Card",
      design_intent: "<script>bad()</script><p>Useful field notes</p>",
      prompt_payload: "Build a journal card",
      draft: false,
    };
    const created = await executeProductionSpecTool(adminId, "create_production_spec", createInput) as {
      spec: { id: string; productionItem: string; specId: string; designIntent: string };
      revision: string;
    };
    specId = created.spec.id;
    expect(created.spec.id).toBe(createInput.record_id);
    expect(created.spec.productionItem).toBe("Field Notes");
    expect(created.spec.specId).toContain("-JRC-");
    expect(created.spec.designIntent).toBe("<p>Useful field notes</p>");
    expect(created.revision).toMatch(/^sha256:/);
    const createAudits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, specId));
    expect(createAudits.some(row => row.action === "worldsmith.editorial.production_spec.create")).toBe(true);
    await expect(executeProductionSpecTool(adminId, "create_production_spec", createInput))
      .rejects.toMatchObject({ status: 409, code: "RECORD_ID_EXISTS" });
    const duplicateRows = await db.select().from(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, createInput.record_id));
    const duplicateCreateAudits = await db.select().from(auditLogTable)
      .where(eq(auditLogTable.targetId, createInput.record_id));
    expect(duplicateRows).toHaveLength(1);
    expect(duplicateCreateAudits.filter(row => row.action === "worldsmith.editorial.production_spec.create"))
      .toHaveLength(1);

    const listed = await executeProductionSpecTool(adminId, "list_production_specs", {
      world_id: worldIds[0],
    }) as { specs: Array<{ id: string }> };
    expect(listed.specs.map(spec => spec.id)).toContain(specId);

    const detail = await executeProductionSpecTool(adminId, "get_production_spec", {
      world_id: worldIds[0], spec_id: specId,
    }) as { spec: { id: string }; relationships: Record<string, unknown> };
    expect(detail.spec.id).toBe(specId);
    await expect(executeProductionSpecTool(adminId, "get_production_spec", {
      world_id: worldIds[1], spec_id: specId,
    })).rejects.toMatchObject({ code: "SPEC_NOT_FOUND" });
  });

  it("rejects foreign or missing links and unauthorized users", async () => {
    await expect(executeProductionSpecTool(adminId, "create_production_spec", {
      record_id: randomUUID(),
      world_id: worldIds[0],
      production_item: "Invalid link",
      component_type: "Notepaper",
      style_guide_id: `missing-style-${nonce}`,
    })).rejects.toMatchObject({ code: "LINKED_RECORD_NOT_FOUND" });

    await expect(executeProductionSpecTool(`not-a-user-${nonce}`, "list_production_specs", {
      world_id: worldIds[0],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serializes generated spec IDs for concurrent creates in one world", async () => {
    const createDraft = (label: string) => executeProductionSpecTool(adminId, "create_production_spec", {
      record_id: randomUUID(),
      world_id: worldIds[0],
      production_item: label,
      component_type: "Journal Card",
      draft: false,
    }) as Promise<{ spec: { id: string; specId: string } }>;
    const [first, second] = await Promise.all([
      createDraft(`Concurrent A ${nonce}`),
      createDraft(`Concurrent B ${nonce}`),
    ]);
    additionalSpecIds.push(first.spec.id, second.spec.id);
    expect(first.spec.specId).not.toBe(second.spec.specId);
  });

  it("requires the current revision and preserves pending recompilation across successive edits", async () => {
    if (!specId) throw new Error("Spec fixture was not created");
    await db.update(wsProductionSpecsTable).set({
      status: "compiled",
      compiledPromptStatus: "Compiled",
      notionPageId: `notion-${nonce}`,
      syncedAt: new Date(),
    }).where(eq(wsProductionSpecsTable.id, specId));
    const [current] = await db.select().from(wsProductionSpecsTable)
      .where(eq(wsProductionSpecsTable.id, specId)).limit(1);
    const { revisionFor } = await import("../lib/worldsmith/editorial-revision.js");
    const expectedRevision = revisionFor(current);

    const updated = await executeProductionSpecTool(adminId, "update_production_spec", {
      world_id: worldIds[0],
      spec_id: specId,
      expected_revision: expectedRevision,
      changes: { design_intent: "Revised intent" },
    }) as { spec: { status: string; compiledPromptStatus: string }; revision: string; recompile_required: boolean };
    expect(updated.recompile_required).toBe(true);
    expect(updated.spec.status).toBe("changes_pending");
    expect(updated.spec.compiledPromptStatus).toBe("Recompile Required");

    const successive = await executeProductionSpecTool(adminId, "update_production_spec", {
      world_id: worldIds[0],
      spec_id: specId,
      expected_revision: updated.revision,
      changes: { narrative_purpose: "A subsequent edit" },
    }) as { spec: { status: string; compiledPromptStatus: string }; recompile_required: boolean };
    expect(successive.recompile_required).toBe(true);
    expect(successive.spec.status).toBe("changes_pending");
    expect(successive.spec.compiledPromptStatus).toBe("Recompile Required");
    const writeAudits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, specId));
    expect(writeAudits.some(row => row.action === "worldsmith.editorial.production_spec.update")).toBe(true);

    await expect(executeProductionSpecTool(adminId, "update_production_spec", {
      world_id: worldIds[0],
      spec_id: specId,
      expected_revision: expectedRevision,
      changes: { design_intent: "Stale overwrite" },
    })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await expect(executeProductionSpecTool(adminId, "update_production_spec", {
      world_id: worldIds[1],
      spec_id: specId,
      expected_revision: updated.spec ? "stale" : "",
      changes: { design_intent: "Out of world" },
    })).rejects.toMatchObject({ code: "SPEC_NOT_FOUND" });
  });
});