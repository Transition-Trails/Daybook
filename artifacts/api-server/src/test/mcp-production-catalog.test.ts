import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  auditLogTable, db, usersTable, worldsmithWorldsTable, wsCollectionsTable,
} from "@workspace/db";
import { CanonToolError } from "../lib/worldsmith/mcp-canon";
import {
  executeProductionCatalogTool, PRODUCTION_CATALOG_TOOLS, PRODUCTION_CATALOG_WRITE_TOOLS,
} from "../lib/worldsmith/mcp-production-catalog";

describe("production catalog MCP tools", () => {
  it("exposes bounded CRUD tools without workflow or delete actions", () => {
    const names = PRODUCTION_CATALOG_TOOLS.map(tool => tool.name);
    for (const domain of ["collections", "volumes", "style_guides", "component_specs", "production_profiles", "punch_templates", "prompt_modules"]) {
      expect(names).toContain(`list_${domain}`);
      expect(names).toContain(`create_${domain.replace(/s$/, "")}`);
      expect(names).toContain(`update_${domain.replace(/s$/, "")}`);
    }
    expect(names.some(name => name.startsWith("delete_") || name.includes("publish") || name.includes("status"))).toBe(false);
    expect(PRODUCTION_CATALOG_WRITE_TOOLS.size).toBe(14);
    for (const tool of PRODUCTION_CATALOG_TOOLS) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      if (tool.name.startsWith("create_")) {
        expect((tool.inputSchema.properties as any).record_id).toMatchObject({ type: "string", format: "uuid" });
        expect(tool.inputSchema.required).toContain("record_id");
      }
    }
  });

  it("creates, reads, revision-checks, and audits a world collection", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `mcp-catalog-world-${suffix}`;
    const recordId = randomUUID();
    await db.insert(worldsmithWorldsTable).values({
      id: worldId, name: "MCP catalog test", code: `C${suffix.slice(0, 8)}`,
    });
    try {
      const createArgs = { record_id: recordId, world_id: worldId, name: "Autumn", year: 2026 };
      const created = await executeProductionCatalogTool(user.id, "create_collection", createArgs) as {
        collection: { id: string; name: string; revision: string };
      };
      expect(created.collection).toMatchObject({ id: recordId, name: "Autumn" });
      await expect(executeProductionCatalogTool(user.id, "create_collection", createArgs))
        .rejects.toMatchObject({ status: 409, code: "RECORD_ID_CONFLICT" });
      const [persisted] = await db.select().from(wsCollectionsTable)
        .where(eq(wsCollectionsTable.id, recordId));
      expect(persisted).toBeTruthy();
      const creationAudits = await db.select().from(auditLogTable).where(and(
        eq(auditLogTable.targetId, recordId),
        eq(auditLogTable.action, "worldsmith.production_catalog.collections.create"),
      ));
      expect(creationAudits).toHaveLength(1);
      const read = await executeProductionCatalogTool(user.id, "get_collection", {
        id: created.collection.id, world_id: worldId,
      }) as { revision: string };
      expect(read.revision).toBe(created.collection.revision);
      const updated = await executeProductionCatalogTool(user.id, "update_collection", {
        id: created.collection.id, world_id: worldId,
        expected_revision: read.revision, changes: { name: "Autumn 2026" },
      }) as { collection: { name: string; revision: string } };
      expect(updated.collection.name).toBe("Autumn 2026");
      await executeProductionCatalogTool(user.id, "create_collection", {
        record_id: randomUUID(), world_id: worldId, name: "Winter",
      });
      await executeProductionCatalogTool(user.id, "create_collection", {
        record_id: randomUUID(), world_id: worldId, name: "Spring",
      });
      const firstPage = await executeProductionCatalogTool(user.id, "list_collections", {
        world_id: worldId, limit: 2,
      }) as { collections: Array<{ id: string }>; has_more: boolean; next_cursor: string | null };
      expect(firstPage.collections).toHaveLength(2);
      expect(firstPage.has_more).toBe(true);
      expect(firstPage.next_cursor).toBe(firstPage.collections[1]?.id);
      const secondPage = await executeProductionCatalogTool(user.id, "list_collections", {
        world_id: worldId, after_id: firstPage.next_cursor!, limit: 2,
      }) as { collections: Array<{ id: string }>; has_more: boolean; next_cursor: string | null };
      expect(secondPage.collections).toHaveLength(1);
      expect(secondPage.has_more).toBe(false);
      const pageIds = [...firstPage.collections, ...secondPage.collections].map(row => row.id);
      expect(pageIds).toEqual([...pageIds].sort());
      const componentUpdate = PRODUCTION_CATALOG_TOOLS.find(tool => tool.name === "update_component_spec")!;
      expect((componentUpdate.inputSchema.properties as any).changes.properties).not.toHaveProperty("component_type");
      await expect(executeProductionCatalogTool(user.id, "update_component_spec", {
        id: "unneeded", world_id: worldId, expected_revision: "revision",
        changes: { component_type: "identity-change" },
      })).rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENTS" });
      await expect(executeProductionCatalogTool(user.id, "update_collection", {
        id: created.collection.id, world_id: worldId,
        expected_revision: read.revision, changes: { description: "stale" },
      })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
      const [audit] = await db.select().from(auditLogTable).where(and(
        eq(auditLogTable.targetId, created.collection.id),
        eq(auditLogTable.action, "worldsmith.production_catalog.collections.update"),
      ));
      expect(audit).toBeTruthy();
      expect(PRODUCTION_CATALOG_WRITE_TOOLS.has("update_collection")).toBe(true);
    } finally {
      const rows = await db.select({ id: wsCollectionsTable.id }).from(wsCollectionsTable)
        .where(eq(wsCollectionsTable.worldId, worldId));
      for (const row of rows) {
        await db.delete(auditLogTable).where(eq(auditLogTable.targetId, row.id));
        await db.delete(wsCollectionsTable).where(eq(wsCollectionsTable.id, row.id));
      }
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
    }
  });

  it("enforces global profile invariants and restricts global resources", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    await expect(executeProductionCatalogTool(user.id, "create_production_profile", {
      name: "Broken print", code: "BROKEN", outputMedium: "print", orientationBehavior: "fixed_portrait",
    })).rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENTS" });
    await expect(executeProductionCatalogTool("__not_a_super_admin__", "list_punch_templates", {}))
      .rejects.toBeInstanceOf(CanonToolError);
    await expect(executeProductionCatalogTool("__not_a_super_admin__", "list_collections", { world_id: "any-world" }))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});