import { and, desc, eq, gt } from "drizzle-orm";
import { ORIENTATION_AWARE_TYPES } from "@workspace/api-zod/readiness";
import { auditLogTable, db, usersTable, worldsmithImageTargetsTable } from "@workspace/db";
import { describe, expect, it } from "vitest";
import {
  executePrintTargetTool,
  PRINT_TARGET_TOOLS,
  PRINT_TARGET_WRITE_TOOLS,
} from "../lib/worldsmith/mcp-print-targets";

describe("print target MCP tools", () => {
  it("lists the fixed catalog and gets, creates, updates, and revision-checks target dimensions", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const componentType = [...ORIENTATION_AWARE_TYPES][0];
    if (!componentType) throw new Error("An orientation-aware component type is required");
    const [original] = await db.select().from(worldsmithImageTargetsTable)
      .where(eq(worldsmithImageTargetsTable.componentType, componentType)).limit(1);
    const [lastAudit] = await db.select({ id: auditLogTable.id }).from(auditLogTable)
      .orderBy(desc(auditLogTable.id)).limit(1);
    const auditFloor = lastAudit?.id ?? 0;

    try {
      await db.delete(worldsmithImageTargetsTable).where(eq(worldsmithImageTargetsTable.componentType, componentType));
      const listed = await executePrintTargetTool(user.id, "list_print_targets", {}) as {
        print_targets: Array<{ component_type: string; print_width_in: number | null; revision: string }>;
      };
      expect(listed.print_targets.map(target => target.component_type)).toEqual([...ORIENTATION_AWARE_TYPES]);
      expect(listed.print_targets.find(target => target.component_type === componentType)).toMatchObject({
        print_width_in: null,
        revision: expect.stringMatching(/^sha256:/),
      });

      const empty = await executePrintTargetTool(user.id, "get_print_target", { component_type: ` ${componentType} ` }) as {
        print_target: { component_type: string; print_width_in: null; revision: string };
      };
      expect(empty.print_target).toMatchObject({ component_type: componentType, print_width_in: null });
      const created = await executePrintTargetTool(user.id, "create_print_target", {
        component_type: componentType, print_width_in: 8.5, print_height_in: 11,
      }) as { print_target: { print_width_in: number; print_height_in: number } };
      expect(created.print_target).toMatchObject({ print_width_in: 8.5, print_height_in: 11 });
      await expect(executePrintTargetTool(user.id, "create_print_target", {
        component_type: componentType, print_width_in: 12, print_height_in: 14,
      })).rejects.toMatchObject({ status: 409, code: "PRINT_TARGET_EXISTS" });
      const afterConflictingCreate = await executePrintTargetTool(user.id, "get_print_target", {
        component_type: componentType,
      }) as { print_target: { print_width_in: number; print_height_in: number } };
      expect(afterConflictingCreate.print_target).toMatchObject({ print_width_in: 8.5, print_height_in: 11 });

      const current = await executePrintTargetTool(user.id, "get_print_target", { component_type: componentType }) as {
        print_target: { revision: string };
      };
      const updated = await executePrintTargetTool(user.id, "update_print_target", {
        component_type: componentType,
        expected_revision: current.print_target.revision,
        changes: { print_width_in: 9, print_height_in: 12 },
      }) as { print_target: { print_width_in: number; print_height_in: number } };
      expect(updated.print_target).toMatchObject({ print_width_in: 9, print_height_in: 12 });

      await expect(executePrintTargetTool(user.id, "update_print_target", {
        component_type: componentType,
        expected_revision: current.print_target.revision,
        changes: { print_width_in: 10, print_height_in: 13 },
      })).rejects.toMatchObject({ status: 409, code: "REVISION_CONFLICT" });
      const afterConflictingUpdate = await executePrintTargetTool(user.id, "get_print_target", {
        component_type: componentType,
      }) as { print_target: { print_width_in: number; print_height_in: number } };
      expect(afterConflictingUpdate.print_target).toMatchObject({ print_width_in: 9, print_height_in: 12 });
      await expect(executePrintTargetTool(user.id, "create_print_target", {
        component_type: "unmanaged_component", print_width_in: 4, print_height_in: 5,
      })).rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENTS" });
      const audits = await db.select().from(auditLogTable).where(and(
        gt(auditLogTable.id, auditFloor),
        eq(auditLogTable.targetId, componentType),
        eq(auditLogTable.actorUserId, user.id),
      ));
      expect(audits.map(audit => audit.action)).toEqual(expect.arrayContaining([
        "worldsmith.editorial.print_target.create",
        "worldsmith.editorial.print_target.update",
      ]));
      expect(PRINT_TARGET_TOOLS.map(tool => tool.name)).toEqual([
        "list_print_targets", "get_print_target", "create_print_target", "update_print_target",
      ]);
      expect(PRINT_TARGET_WRITE_TOOLS).toEqual(new Set(["create_print_target", "update_print_target"]));
    } finally {
      await db.delete(auditLogTable).where(and(
        gt(auditLogTable.id, auditFloor),
        eq(auditLogTable.targetId, componentType),
        eq(auditLogTable.actorUserId, user.id),
      ));
      await db.delete(worldsmithImageTargetsTable).where(eq(worldsmithImageTargetsTable.componentType, componentType));
      if (original) await db.insert(worldsmithImageTargetsTable).values(original);
    }
  });

  it("checks current super-admin authorization on every call", async () => {
    await expect(executePrintTargetTool("__missing__", "list_print_targets", {}))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});