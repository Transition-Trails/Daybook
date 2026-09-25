import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  db, pool, usersTable, worldsmithWorldsTable, wsStoriesTable, wsStoryActsTable,
  wsStoryBeatsTable, wsRevealThreadsTable,
  wsCanonRecordsTable, wsCanonRecordStoryLinksTable, auditLogTable,
  mcpOAuthClientsTable, mcpOAuthTokensTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";

describe("authenticated editorial MCP tools", () => {
  it("serializes simultaneous beat and reveal edits behind the storyline lock", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const beatId = `mcp-beat-${randomUUID()}`;
    const revealId = `mcp-reveal-${randomUUID()}`;
    const clientId = `mcp-client-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Concurrent MCP World", code: "CMW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Concurrent Story", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(wsRevealThreadsTable).values({ id: revealId, worldId, storyId, title: "Secret", truth: "Original" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Concurrent editorial MCP test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:editorial:read", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      for (const { getName, updateName, idKey, id, field, table } of [
        { getName: "get_story_beat", updateName: "update_story_beat", idKey: "beat_id", id: beatId, field: "summary", table: wsStoryBeatsTable },
        { getName: "get_reveal_thread", updateName: "update_reveal_thread", idKey: "reveal_id", id: revealId, field: "truth", table: wsRevealThreadsTable },
      ] as const) {
        const before = await call(getName, { storyline_id: storyId, [idKey]: id });
        expect(before.status).toBe(200);
        const revision = before.body.result.structuredContent.revision as string;
        const holder = await pool.connect();
        let pending: Promise<import("supertest").Response>[] = [];
        let blocked = 0;
        try {
          await holder.query("BEGIN");
          const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
          await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
          // Start both HTTP requests while the parent row is held by another connection.
          pending = ["first", "second"].map(value =>
            call(updateName, {
              storyline_id: storyId, [idKey]: id, expected_revision: revision,
              changes: { [field]: value },
            }).then(response => response));
          const deadline = Date.now() + 8_000;
          while (Date.now() < deadline) {
            const { rows } = await pool.query<{ blocked: number }>(
              `SELECT count(*)::int AS blocked FROM pg_stat_activity
               WHERE pid <> $1 AND wait_event_type = 'Lock'
                 AND ($1 = ANY(pg_blocking_pids(pid))
                   OR EXISTS (
                     SELECT 1 FROM pg_stat_activity AS first_waiter
                     WHERE first_waiter.pid = ANY(pg_blocking_pids(pg_stat_activity.pid))
                       AND $1 = ANY(pg_blocking_pids(first_waiter.pid))
                   ))`,
              [pid],
            );
            blocked = rows[0].blocked;
            if (blocked >= 2) break;
            await new Promise(resolve => setTimeout(resolve, 25));
          }
        } finally {
          await holder.query("ROLLBACK");
          holder.release();
        }
        const responses = await Promise.all(pending);
        expect(blocked).toBe(2);
        const winners = responses.filter(response => response.body.result?.isError !== true);
        const losers = responses.filter(response => response.body.result?.isError === true);
        expect(responses.map(response => response.status)).toEqual([200, 200]);
        expect(winners).toHaveLength(1);
        expect(losers).toHaveLength(1);
        expect(losers[0].body.result.content[0].text).toContain("REVISION_CONFLICT");
        const winningRecord = winners[0].body.result.structuredContent;
        const [persisted] = await db.select().from(table).where(eq(table.id, id));
        const savedValue = "summary" in persisted ? persisted.summary : persisted.truth;
        expect(savedValue).toBe(winningRecord.record[field]);
        expect(["first", "second"]).toContain(savedValue);
        const after = await call(getName, { storyline_id: storyId, [idKey]: id });
        expect(after.body.result.structuredContent.revision).toBe(winningRecord.revision);
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, id));
        expect(audits).toHaveLength(1);
        expect(audits[0].metadata).toEqual(expect.objectContaining({
          actor_user_id: user.id,
          before_after: { [field]: { before: field === "summary" ? "" : "Original", after: savedValue } },
        }));
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [beatId, revealId]));
      await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("commits simultaneous edits to different beats with separate audits", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const beatIds = [`mcp-beat-${randomUUID()}`, `mcp-beat-${randomUUID()}`];
    const clientId = `mcp-client-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Separate Beat MCP World", code: "SBW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Separate Beats", status: "draft" });
      await db.insert(wsStoryBeatsTable).values(beatIds.map((id, index) => ({
        id, worldId, storyId, beatType: "setup", title: `Beat ${index + 1}`,
      })));
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Separate beat editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:editorial:read", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const revisions = await Promise.all(beatIds.map(async beatId => {
        const response = await call("get_story_beat", { storyline_id: storyId, beat_id: beatId });
        expect(response.status).toBe(200);
        return response.body.result.structuredContent.revision as string;
      }));
      const summaries = ["First beat edited", "Second beat edited"];
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = beatIds.map((beatId, index) =>
          call("update_story_beat", {
            storyline_id: storyId, beat_id: beatId, expected_revision: revisions[index],
            changes: { summary: summaries[index] },
          }).then(response => response));
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline) {
          const { rows } = await pool.query<{ blocked: number }>(
            `SELECT count(*)::int AS blocked FROM pg_stat_activity
             WHERE pid <> $1 AND wait_event_type = 'Lock'
               AND ($1 = ANY(pg_blocking_pids(pid))
                 OR EXISTS (
                   SELECT 1 FROM pg_stat_activity AS first_waiter
                   WHERE first_waiter.pid = ANY(pg_blocking_pids(pg_stat_activity.pid))
                     AND $1 = ANY(pg_blocking_pids(first_waiter.pid))
                 ))`,
            [pid],
          );
          blocked = rows[0].blocked;
          if (blocked >= 2) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
      const responses = await Promise.all(pending);
      expect(blocked).toBe(2);
      for (const [index, response] of responses.entries()) {
        expect(response.status).toBe(200);
        expect(response.body.result.isError).not.toBe(true);
        expect(response.body.result.structuredContent.record.summary).toBe(summaries[index]);
        const [persisted] = await db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatIds[index]));
        expect(persisted.summary).toBe(summaries[index]);
        const after = await call("get_story_beat", { storyline_id: storyId, beat_id: beatIds[index] });
        expect(after.body.result.structuredContent.revision).toBe(response.body.result.structuredContent.revision);
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, beatIds[index]));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          action: "worldsmith.editorial.story_beat.update",
          targetType: "worldsmith_story_beat",
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { summary: { before: "", after: summaries[index] } },
          }),
        }));
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, beatIds));
      await db.delete(wsStoryBeatsTable).where(inArray(wsStoryBeatsTable.id, beatIds));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("discovers the hierarchy, validates and audits reversible edits on disposable records", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const secondStoryId = `mcp-story-${randomUUID()}`;
    const movementId = `mcp-movement-${randomUUID()}`;
    const beatId = `mcp-beat-${randomUUID()}`;
    const otherBeatId = `mcp-beat-${randomUUID()}`;
    const mismatchedBeatId = `mcp-beat-${randomUUID()}`;
    const revealId = `mcp-reveal-${randomUUID()}`;
    const canonId = `mcp-canon-${randomUUID()}`;
    const clientId = `mcp-client-${randomUUID()}`;
    const readToken = randomBytes(32).toString("base64url");
    const writeToken = randomBytes(32).toString("base64url");
    const canonOnlyToken = randomBytes(32).toString("base64url");
    const editorialOnlyToken = randomBytes(32).toString("base64url");
    const childWriteToken = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });
    const result = async (name: string, args: Record<string, unknown>) =>
      (await call(writeToken, name, args)).body.result.structuredContent;

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "MCP Test World", code: "MTW" });
      await db.insert(wsStoriesTable).values([
        { id: storyId, worldId, title: "Test Story One", sortOrder: 1, status: "draft" },
        { id: secondStoryId, worldId, title: "Test Story Two", sortOrder: 2, status: "draft" },
      ]);
      await db.insert(wsStoryActsTable).values({
        id: movementId, worldId, storyId, title: "Test Movement", actNumber: 1,
      });
      await db.insert(wsStoryBeatsTable).values([
        { id: beatId, worldId, storyId, beatType: "setup", title: "Opening", status: "draft" },
        { id: otherBeatId, worldId, storyId: secondStoryId, beatType: "turn", title: "Other story" },
      ]);
      await db.insert(wsRevealThreadsTable).values({
        id: revealId, worldId, storyId, title: "Hidden motive", truth: "Original truth",
      });
      await db.insert(wsCanonRecordsTable).values({
        id: canonId, worldId, name: "Disposable proposed character", canonType: "character", status: "proposed",
      });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Disposable editorial MCP test", redirectUris: ["https://example.com/cb"],
      });
      for (const [token, scopes] of [
        [readToken, ["worldsmith:canon:read", "worldsmith:editorial:read"]],
        [writeToken, ["worldsmith:canon:read", "worldsmith:canon:write", "worldsmith:editorial:read", "worldsmith:editorial:write"]],
        [canonOnlyToken, ["worldsmith:canon:read", "worldsmith:canon:write"]],
        [editorialOnlyToken, ["worldsmith:editorial:read"]],
        [childWriteToken, ["worldsmith:editorial:read", "worldsmith:editorial:story-details:write"]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"),
          kind: "access", familyId: randomUUID(), clientId, userId: user.id,
          resource: getMcpResource(), scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }

      const discovery = await rpc(readToken, "tools/list");
      expect(discovery.status).toBe(200);
      const names = discovery.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        "search_canon_records", "get_canon_record", "get_canon_field_options", "update_canon_record", "get_record_change_history",
        "search_worlds", "get_world", "update_world",
        "search_story_maps", "get_story_map", "update_story_map",
        "search_storylines", "get_storyline", "update_storyline",
        "get_story_beat", "update_story_beat", "get_reveal_thread", "update_reveal_thread",
        "search_movements", "get_movement", "update_movement",
        "search_sequences", "get_sequence", "update_sequence",
      ]));
      const canonOnly = await rpc(canonOnlyToken, "tools/list");
      expect(canonOnly.body.result.tools.map((tool: { name: string }) => tool.name)).toHaveLength(5);
      expect((await call(canonOnlyToken, "get_world", { world_id: worldId })).status).toBe(403);
      const editorialOnly = await rpc(editorialOnlyToken, "tools/list");
      expect(editorialOnly.body.result.tools.map((tool: { name: string }) => tool.name))
        .not.toContain("get_canon_record");
      expect((await call(editorialOnlyToken, "get_canon_record", { record_id: canonId })).status).toBe(403);
      expect((await call(editorialOnlyToken, "get_world", { world_id: worldId })).status).toBe(200);
      const worlds = await result("search_worlds", { query: "MCP Test World" });
      expect(worlds.worlds).toEqual(expect.arrayContaining([expect.objectContaining({
        id: worldId, name: "MCP Test World", editor_url: expect.stringContaining("/editorial/bible"),
      })]));
      const world = await result("get_world", { world_id: worldId });
      expect(world.record.id).toBe(worldId);
      expect(typeof world.revision).toBe("string");
      const denied = await call(readToken, "update_world", {
        world_id: worldId, expected_revision: world.revision, changes: { description: "temporary" },
      });
      expect(denied.status).toBe(403);
      const editedWorld = await result("update_world", {
        world_id: worldId, expected_revision: world.revision, changes: { description: "temporary" },
      });
      expect(editedWorld.record.description).toBe("temporary");
      expect(editedWorld.record.status).toBe("in_setup");
      const stale = await call(writeToken, "update_world", {
        world_id: worldId, expected_revision: world.revision, changes: { description: "overwritten" },
      });
      expect(stale.body.result.isError).toBe(true);
      expect(stale.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const invalid = await call(writeToken, "update_world", {
        world_id: worldId, expected_revision: editedWorld.revision, changes: { status: "active" },
      });
      expect(invalid.body.result.isError).toBe(true);
      expect(invalid.body.result.content[0].text).toContain("INVALID_ARGUMENTS");

      const maps = await result("search_story_maps", { world_id: worldId });
      expect(maps.maps[0]).toEqual(expect.objectContaining({
        id: worldId, editor_url: expect.stringContaining("/editorial/connections"),
      }));
      const map = await result("get_story_map", { map_id: worldId });
      expect(map.stories).toHaveLength(2);
      const storylines = await result("search_storylines", { world_id: worldId, query: "Story One" });
      expect(storylines.storylines[0]).toEqual(expect.objectContaining({ id: storyId, world_id: worldId }));
      const storyline = await result("get_storyline", { storyline_id: storyId });
      expect(storyline.movements).toEqual(expect.arrayContaining([expect.objectContaining({ id: movementId })]));
      expect(storyline.story_beats).toEqual([expect.objectContaining({ id: beatId, revision: expect.any(String) })]);
      expect(storyline.reveal_threads).toEqual([expect.objectContaining({ id: revealId, revision: expect.any(String) })]);
      const beat = await result("get_story_beat", { storyline_id: storyId, beat_id: beatId });
      const reveal = await result("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
      expect(beat.revision).toBe(storyline.story_beats[0].revision);
      expect(reveal.revision).toBe(storyline.reveal_threads[0].revision);
      const beatArgs = { storyline_id: storyId, beat_id: beatId, expected_revision: beat.revision, changes: { summary: "New beat summary" } };
      expect((await call(writeToken, "update_story_beat", beatArgs)).status).toBe(403);
      expect((await call(readToken, "update_story_beat", beatArgs)).status).toBe(403);
      const updatedBeat = (await call(childWriteToken, "update_story_beat", beatArgs)).body.result.structuredContent;
      expect(updatedBeat.record).toEqual(expect.objectContaining({ summary: "New beat summary", status: "draft" }));
      const staleBeat = await call(childWriteToken, "update_story_beat", beatArgs);
      expect(staleBeat.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const wrongParent = await call(childWriteToken, "update_story_beat", {
        storyline_id: storyId, beat_id: otherBeatId, expected_revision: beat.revision, changes: { title: "Stolen" },
      });
      expect(wrongParent.body.result.content[0].text).toContain("INVALID_PARENT");
      await db.insert(wsStoryBeatsTable).values({
        id: mismatchedBeatId, worldId: "unrelated-world", storyId, beatType: "setup", title: "Invalid world",
      });
      expect((await call(childWriteToken, "get_story_beat", {
        storyline_id: storyId, beat_id: mismatchedBeatId,
      })).body.result.content[0].text).toContain("INVALID_PARENT");
      expect((await call(childWriteToken, "update_story_beat", {
        storyline_id: storyId, beat_id: mismatchedBeatId, expected_revision: beat.revision, changes: { title: "Wrong world" },
      })).body.result.content[0].text).toContain("INVALID_PARENT");
      const invalidBeat = await call(childWriteToken, "update_story_beat", {
        storyline_id: storyId, beat_id: beatId, expected_revision: updatedBeat.revision, changes: { status: "accepted" },
      });
      expect(invalidBeat.body.result.content[0].text).toContain("INVALID_ARGUMENTS");
      const updatedReveal = (await call(childWriteToken, "update_reveal_thread", {
        storyline_id: storyId, reveal_id: revealId, expected_revision: reveal.revision, changes: { truth: "New truth" },
      })).body.result.structuredContent;
      expect(updatedReveal.record.truth).toBe("New truth");
      await db.update(wsRevealThreadsTable).set({ title: "Edited outside MCP" }).where(eq(wsRevealThreadsTable.id, revealId));
      expect((await call(childWriteToken, "update_reveal_thread", {
        storyline_id: storyId, reveal_id: revealId, expected_revision: updatedReveal.revision, changes: { title: "Stale overwrite" },
      })).body.result.content[0].text).toContain("REVISION_CONFLICT");
      expect((await call(childWriteToken, "update_reveal_thread", {
        storyline_id: secondStoryId, reveal_id: revealId, expected_revision: updatedReveal.revision, changes: { title: "Wrong parent" },
      })).body.result.content[0].text).toContain("INVALID_PARENT");
      expect((await call(childWriteToken, "update_reveal_thread", {
        storyline_id: storyId, reveal_id: revealId, expected_revision: updatedReveal.revision, changes: { worldId: "elsewhere" },
      })).body.result.content[0].text).toContain("INVALID_ARGUMENTS");
      const editedStory = await result("update_storyline", {
        storyline_id: storyId, expected_revision: storyline.revision, changes: { summary: "Temporary summary" },
      });
      expect(editedStory.record.summary).toBe("Temporary summary");
      expect(editedStory.record.status).toBe("draft");
      const movements = await result("search_movements", { storyline_id: storyId });
      expect(movements.movements[0]).toEqual(expect.objectContaining({
        id: movementId, storyline_id: storyId, world_id: worldId,
      }));
      const movement = await result("get_movement", { movement_id: movementId });
      expect(movement.scenes).toEqual([]);
      const editedMovement = await result("update_movement", {
        movement_id: movementId, expected_revision: movement.revision, changes: { tagline: "Temporary purpose" },
      });
      expect(editedMovement.record.tagline).toBe("Temporary purpose");
      expect(editedMovement.record.storyId).toBe(storyId);

      const currentMap = await result("get_story_map", { map_id: worldId });
      const wrongLinkParent = await call(writeToken, "update_story_map", {
        map_id: worldId, expected_revision: currentMap.revision,
        add_links: [{ canon_record_id: canonId, story_id: secondStoryId, act_id: movementId }],
      });
      expect(wrongLinkParent.body.result.isError).toBe(true);
      expect(wrongLinkParent.body.result.content[0].text).toContain("INVALID_MOVEMENT");
      const linkedMap = await result("update_story_map", {
        map_id: worldId, expected_revision: currentMap.revision,
        add_links: [{ canon_record_id: canonId, story_id: storyId, act_id: movementId }],
      });
      expect(linkedMap.links).toEqual(expect.arrayContaining([expect.objectContaining({
        canonRecordId: canonId, storyId, actId: movementId,
      })]));

      const sequences = await result("search_sequences", { world_id: worldId });
      expect(sequences.sequences).toHaveLength(2);
      expect(sequences.sequences[0]).toEqual(expect.objectContaining({
        world_id: worldId, story_map_id: worldId,
        name: expect.any(String), editor_url: expect.stringContaining("story_id="),
      }));
      const selectedId = sequences.sequences[0].id;
      const sequence = await result("get_sequence", { sequence_id: selectedId });
      expect(sequence.sequence.id).toBe(selectedId);
      const reordered = await result("update_sequence", {
        world_id: worldId, sequence_id: selectedId, expected_revision: sequences.revision,
        groups: [[secondStoryId], [storyId]],
      });
      expect(reordered.sequences[0].story_ids).toEqual([secondStoryId]);
      const sequenceStale = await call(writeToken, "update_sequence", {
        world_id: worldId, sequence_id: selectedId, expected_revision: sequences.revision,
        groups: [[storyId], [secondStoryId]],
      });
      expect(sequenceStale.body.result.isError).toBe(true);
      expect(sequenceStale.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const audits = await db.select().from(auditLogTable)
        .where(and(eq(auditLogTable.actorUserId, user.id),
          inArray(auditLogTable.targetId, [worldId, storyId, movementId, beatId, revealId])));
      expect(audits.filter(entry => entry.action.startsWith("worldsmith."))).toHaveLength(7);
      expect(audits.find(entry => entry.targetId === beatId)?.metadata).toEqual(expect.objectContaining({
        actor_user_id: user.id, before_after: { summary: { before: "", after: "New beat summary" } },
      }));
      expect(audits.find(entry => entry.targetId === revealId)?.metadata).toEqual(expect.objectContaining({
        actor_user_id: user.id, before_after: { truth: { before: "Original truth", after: "New truth" } },
      }));
      expect((await db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, canonId)))[0]?.status).toBe("proposed");
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [worldId, storyId, movementId, beatId, revealId]));
      await db.delete(wsCanonRecordStoryLinksTable).where(eq(wsCanonRecordStoryLinksTable.canonRecordId, canonId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, canonId));
      await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, movementId));
      await db.delete(wsStoryBeatsTable).where(inArray(wsStoryBeatsTable.id, [beatId, otherBeatId, mismatchedBeatId]));
      await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
});