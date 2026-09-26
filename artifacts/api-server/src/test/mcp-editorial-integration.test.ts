import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  db, pool, usersTable, worldsmithWorldsTable, wsStoriesTable, wsStoryActsTable,
  wsStoryBeatsTable, wsRevealThreadsTable,
  wsCanonRecordsTable, wsCanonRecordStoryLinksTable, auditLogTable,
  mcpOAuthClientsTable, mcpOAuthTokensTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import { executeViewTool } from "../lib/worldsmith/mcp-editorial-views";
import mcpRouter from "../routes/mcp";

describe("authenticated editorial MCP tools", () => {
  it("requires separate consent and saves the complete reference lane under the world revision", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `reference-world-${suffix}`;
    const otherWorldId = `other-reference-world-${suffix}`;
    const first = `reference-first-${suffix}`;
    const second = `reference-second-${suffix}`;
    const foreign = `reference-foreign-${suffix}`;
    const clientId = `reference-client-${suffix}`;
    const oldToken = randomBytes(32).toString("base64url");
    const consentedToken = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });
    const content = async (token: string, name: string, args: Record<string, unknown>) =>
      (await call(token, name, args)).body.result.structuredContent;
    try {
      await db.insert(worldsmithWorldsTable).values([
        { id: worldId, name: "References Test World", code: "RTW" },
        { id: otherWorldId, name: "Foreign References World", code: "FRW" },
      ]);
      await db.insert(wsStoriesTable).values([
        { id: first, worldId, title: "First", sortOrder: 1 },
        { id: second, worldId, title: "Cross-era", sortOrder: 2 },
        { id: foreign, worldId: otherWorldId, title: "Foreign", sortOrder: 1 },
      ]);
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Reference lane test client", redirectUris: ["https://example.com/cb"],
      });
      for (const [token, scopes] of [
        [oldToken, ["worldsmith:editorial:read", "worldsmith:editorial:write"]],
        [consentedToken, ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:references:write"]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"), kind: "access",
          familyId: randomUUID(), clientId, userId: user.id, resource: getMcpResource(),
          scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }
      const initial = await content(oldToken, "search_sequences", { world_id: worldId });
      const anchor = initial.sequences[0].id as string;
      const foreignSequence = await content(oldToken, "search_sequences", { world_id: otherWorldId });
      const wrongWorld = await call(oldToken, "get_sequence", {
        world_id: worldId, sequence_id: foreignSequence.sequences[0].id,
      });
      expect(wrongWorld.body.result.content[0].text).toContain("SEQUENCE_NOT_FOUND");
      const missingWorld = await call(oldToken, "get_sequence", {
        world_id: `missing-${suffix}`, sequence_id: anchor,
      });
      expect(missingWorld.body.result.content[0].text).toContain("WORLD_NOT_FOUND");
      const attempted = { world_id: worldId, sequence_id: anchor, expected_revision: initial.revision,
        groups: [[first]], references: [second] };
      expect((await call(oldToken, "update_sequence", attempted)).status).toBe(403);
      expect((await content(oldToken, "search_sequences", { world_id: worldId })).revision).toBe(initial.revision);
      for (const layout of [
        { groups: [[first], [second]], references: [second] },
        { groups: [[first]], references: [foreign] },
        { groups: [[first]], references: [] },
      ]) {
        const rejected = await call(consentedToken, "update_sequence", { ...attempted, ...layout });
        expect(rejected.body.result.content[0].text).toContain("INVALID_GROUPING");
      }
      const moved = await content(consentedToken, "update_sequence", attempted);
      expect(moved.sequences.map((group: { story_ids: string[] }) => group.story_ids)).toEqual([[first]]);
      expect(moved.references.map((story: { id: string }) => story.id)).toEqual([second]);
      expect(moved.revision).not.toBe(initial.revision);
      const saved = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, second));
      expect(saved[0].sequenceRole).toBe("reference");
      const stale = await call(consentedToken, "update_sequence", attempted);
      expect(stale.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const singleGroup = moved.sequences[0].id as string;
      const allReferences = await content(consentedToken, "update_sequence", {
        world_id: worldId, sequence_id: singleGroup, expected_revision: moved.revision,
        groups: [], references: [first, second],
      });
      expect(allReferences.sequences).toEqual([]);
      expect(allReferences.references).toHaveLength(2);
      const anchored = await content(consentedToken, "get_sequence", { world_id: worldId, sequence_id: worldId });
      expect(anchored.revision).toBe(allReferences.revision);
      const staleRead = await call(consentedToken, "get_sequence", { world_id: worldId, sequence_id: singleGroup });
      expect(staleRead.body.result.content[0].text).toContain("SEQUENCE_NOT_FOUND");
      const restored = await content(consentedToken, "update_sequence", {
        world_id: worldId, sequence_id: worldId, expected_revision: anchored.revision,
        groups: [[second], [first]], references: [],
      });
      expect(restored.references).toEqual([]);
      expect(restored.sequences.map((group: { story_ids: string[] }) => group.story_ids)).toEqual([[second], [first]]);
      expect((await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, second)))[0].sequenceRole).toBe("chronological");
      const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, worldId));
      expect(audits).toHaveLength(3);
      expect(audits[0].metadata).toEqual(expect.objectContaining({
        before_rows: { stories: [{ id: second, sortOrder: 2, sequenceRole: "chronological" }] },
        after_rows: { stories: [{ id: second, sortOrder: 2, sequenceRole: "reference" }] },
      }));
    } finally {
      await db.delete(auditLogTable).where(eq(auditLogTable.targetId, worldId));
      await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.worldId, [worldId, otherWorldId]));
      await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, otherWorldId]));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
  it("pages current virtual sequence IDs while retaining group positions, matches, and references", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `paged-sequences-${suffix}`;
    const clientId = `paged-client-${suffix}`;
    const token = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const search = async (args: Record<string, unknown>) => {
      const response = await request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_sequences", arguments: { world_id: worldId, ...args } } });
      expect(response.body.result.isError).not.toBe(true);
      return response.body.result.structuredContent;
    };
    const stories = [
      { id: `a-${suffix}`, worldId, title: "Alpha", summary: "needle", sortOrder: 0 },
      { id: `b-${suffix}`, worldId, title: "Bravo", summary: "needle", sortOrder: 1 },
      { id: `c-${suffix}`, worldId, title: "Charlie", summary: "other", sortOrder: 1 },
      { id: `d-${suffix}`, worldId, title: "Delta", summary: "needle", sortOrder: 2 },
      { id: `e-${suffix}`, worldId, title: "Echo", summary: "needle", sortOrder: 3 },
      { id: `f-${suffix}`, worldId, title: "Foxtrot", summary: "needle", sortOrder: 0 },
      { id: `r-${suffix}`, worldId, title: "Reference", summary: "needle", sortOrder: 1, sequenceRole: "reference" },
    ];
    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Paged sequences", code: "PAGED" });
      await db.insert(wsStoriesTable).values(stories);
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Paged sequences test client", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"), kind: "access",
        familyId: randomUUID(), clientId, userId: user.id, resource: getMcpResource(),
        scopes: ["worldsmith:editorial:read"], expiresAt: new Date(Date.now() + 60_000),
      });
      const full = await search({});
      expect(full.sequences).toHaveLength(5);
      const unfiltered = await search({ limit: 2 });
      expect(unfiltered.sequences).toEqual([...full.sequences].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 2));
      expect(unfiltered).toMatchObject({ total: 5, references_total: 1, has_more: true, layout_complete: false });
      const expected = full.sequences.filter((group: { members: { title: string; summary: string }[] }) =>
        group.members.some(member => `${member.title} ${member.summary}`.toLowerCase().includes("needle")));
      expect((await search({ query: "needle" })).sequences).toEqual(expected);
      const sorted = [...expected].sort((a, b) => a.id.localeCompare(b.id));
      const page1 = await search({ query: "needle", limit: 2 });
      const page2 = await search({ query: "needle", limit: 2, after_id: page1.next_cursor, expected_revision: page1.revision });
      const page3 = await search({ query: "needle", limit: 2, after_id: page2.next_cursor, expected_revision: page1.revision });
      expect([...page1.sequences, ...page2.sequences, ...page3.sequences]).toEqual(sorted);
      for (const page of [page1, page2, page3]) {
        expect(page).toMatchObject({
          total: expected.length, references_total: 1, layout_complete: false, revision: full.revision,
          references: [expect.objectContaining({ id: `r-${suffix}` })],
        });
      }
      expect(page1.has_more).toBe(true);
      expect(page2.has_more).toBe(true);
      expect(page3.has_more).toBe(false);
      expect(page3.next_cursor).toBeNull();
      expect((await search({ after_id: sorted[sorted.length - 1].id, expected_revision: page1.revision })).sequences).toEqual([]);
      expect(await search({ query: "absent", limit: 2 })).toMatchObject({
        sequences: [], references: [], total: 0, references_total: 0, has_more: false, next_cursor: null,
      });
      const shared = full.sequences.find((group: { story_ids: string[] }) => group.story_ids.length === 2);
      expect(shared.id).toBe(`sequence_${createHash("sha256").update([`b-${suffix}`, `c-${suffix}`].join("\n")).digest("hex").slice(0, 24)}`);
      expect(page1.sequences.every((group: { expected_revision: string }) => group.expected_revision === full.revision)).toBe(true);
      const missingRevision = await request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
          name: "search_sequences", arguments: { world_id: worldId, query: "needle", limit: 2, after_id: page1.next_cursor },
        } });
      expect(missingRevision.body.result.isError).toBe(true);
      expect(missingRevision.body.result.content[0].text).toContain("INVALID_ARGUMENTS");
      expect(missingRevision.body.result.content[0].text).toContain("expected_revision is required");
      // Another editor moves a member out of its group between page requests.
      // The old cursor is no longer safe to follow, even though each request
      // individually reads a consistent snapshot.
      await db.update(wsStoriesTable).set({ sortOrder: 2 }).where(eq(wsStoriesTable.id, `c-${suffix}`));
      const stale = await request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
          name: "search_sequences", arguments: {
            world_id: worldId, query: "needle", limit: 2,
            after_id: page1.next_cursor, expected_revision: page1.revision,
          },
        } });
      expect(stale.body.result.isError).toBe(true);
      expect(stale.body.result.structuredContent).toBeUndefined();
      expect(stale.body.result.content[0].text).toContain("STALE_PAGE");
      expect(stale.body.result.content[0].text).toContain("restart paging from the first page");
      const restarted = await search({ query: "needle", limit: 2 });
      expect(restarted.revision).not.toBe(page1.revision);
      const continued = await search({
        query: "needle", limit: 2, after_id: restarted.next_cursor, expected_revision: restarted.revision,
      });
      expect(continued.revision).toBe(restarted.revision);
    } finally {
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
  it("keeps a paged sequence search on one snapshot when a storyline changes between reads", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `snapshot-sequences-${randomUUID()}`;
    const firstId = `${worldId}-first`;
    const secondId = `${worldId}-second`;
    const referenceId = `${worldId}-reference`;
    const origin = "https://example.com";
    const args = { world_id: worldId, query: "needle", limit: 1 };
    let resume!: () => void;
    const released = new Promise<void>(resolve => { resume = resolve; });
    let selected!: () => void;
    const pageSelected = new Promise<void>(resolve => { selected = resolve; });
    let intercept = false;
    const connect = pool.connect.bind(pool);
    const wrappedClients = new Map<object, unknown>();
    const connectSpy = vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
      // Pool.query acquires clients with a callback; only wrap the
      // promise-based client used by Drizzle's transaction.
      if (typeof args[0] === "function") {
        return (connect as (callback: unknown) => void)(args[0]);
      }
      return connect().then(client => {
        if (wrappedClients.has(client)) return client;
        const originalQuery = client.query;
        wrappedClients.set(client, originalQuery);
        client.query = ((...args: unknown[]) => {
          // pool.query uses the callback overload; leave it untouched.
          if (typeof args[args.length - 1] === "function") {
            return (originalQuery as (...values: unknown[]) => unknown).apply(client, args);
          }
          return (async () => {
            const result = await (originalQuery as (...values: unknown[]) => Promise<unknown>).apply(client, args);
            const config = args[0];
            const text = typeof config === "string" ? config : (config as { text?: string }).text;
            if (intercept && text?.includes("WITH members AS")) {
              intercept = false;
              selected();
              await released;
            }
            return result;
          })();
        }) as typeof client.query;
        return client;
      });
    }) as typeof pool.connect);
    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Snapshot sequences", code: "SNAP" });
      await db.insert(wsStoriesTable).values([
        { id: firstId, worldId, title: "Needle first", sortOrder: 1 },
        { id: secondId, worldId, title: "Other", sortOrder: 2 },
        { id: referenceId, worldId, title: "Needle reference", sortOrder: 3, sequenceRole: "reference" },
      ]);
      const before = await executeViewTool(user.id, "search_sequences", args, origin);
      intercept = true;
      const pending = executeViewTool(user.id, "search_sequences", args, origin);
      await pageSelected;
      await db.update(wsStoriesTable).set({ title: "Changed first", summary: "gone" }).where(eq(wsStoriesTable.id, firstId));
      await db.update(wsStoriesTable).set({ title: "Changed reference", sequenceRole: "chronological" })
        .where(eq(wsStoriesTable.id, referenceId));
      resume();
      expect(await pending).toEqual(before);
      const after = await executeViewTool(user.id, "search_sequences", args, origin) as typeof before;
      expect(after).not.toEqual(before);
      expect((after as { sequences: unknown[] }).sequences).toEqual([]);
    } finally {
      resume();
      connectSpy.mockRestore();
      for (const [client, originalQuery] of wrappedClients) {
        const pooledClient = client as { query: typeof pool.query };
        pooledClient.query = originalQuery as typeof pool.query;
      }
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
    }
  });
  it.each(["search_sequences", "get_sequence"] as const)(
    "keeps a full %s view on one snapshot when a storyline changes between reads",
    async tool => {
      const [user] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.platformRole, "super_admin")).limit(1);
      if (!user) throw new Error("A seeded development super-admin is required");
      const worldId = `full-snapshot-${randomUUID()}`;
      const storyId = `${worldId}-story`;
      const referenceId = `${worldId}-reference`;
      const origin = "https://example.com";
      const args = tool === "get_sequence"
        ? { world_id: worldId, sequence_id: worldId }
        : { world_id: worldId };
      let resume!: () => void;
      const released = new Promise<void>(resolve => { resume = resolve; });
      let selected!: () => void;
      const storiesSelected = new Promise<void>(resolve => { selected = resolve; });
      let intercept = false;
      const connect = pool.connect.bind(pool);
      const wrappedClients = new Map<object, unknown>();
      const connectSpy = vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
        if (typeof args[0] === "function") return (connect as (callback: unknown) => void)(args[0]);
        return connect().then(client => {
          if (wrappedClients.has(client)) return client;
          const originalQuery = client.query;
          wrappedClients.set(client, originalQuery);
          client.query = ((...queryArgs: unknown[]) => {
            if (typeof queryArgs[queryArgs.length - 1] === "function") {
              return (originalQuery as (...values: unknown[]) => unknown).apply(client, queryArgs);
            }
            return (async () => {
              const result = await (originalQuery as (...values: unknown[]) => Promise<unknown>).apply(client, queryArgs);
              const config = queryArgs[0];
              const text = typeof config === "string" ? config : (config as { text?: string }).text;
              if (intercept && text?.includes('from "ws_stories"') && text.includes("order by")) {
                intercept = false;
                selected();
                await released;
              }
              return result;
            })();
          }) as typeof client.query;
          return client;
        });
      }) as typeof pool.connect);
      try {
        await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Full snapshot", code: "FULL" });
        await db.insert(wsStoriesTable).values([
          { id: storyId, worldId, title: "Before", sortOrder: 1 },
          { id: referenceId, worldId, title: "Reference before", sortOrder: 2, sequenceRole: "reference" },
        ]);
        const before = await executeViewTool(user.id, tool, args, origin);
        intercept = true;
        const pending = executeViewTool(user.id, tool, args, origin);
        await storiesSelected;
        await db.update(wsStoriesTable).set({ title: "After", sortOrder: 3 })
          .where(eq(wsStoriesTable.id, storyId));
        await db.update(wsStoriesTable).set({ title: "Reference after", sequenceRole: "chronological" })
          .where(eq(wsStoriesTable.id, referenceId));
        resume();
        expect(await pending).toEqual(before);
        const after = await executeViewTool(user.id, tool, args, origin) as typeof before;
        expect(after).not.toEqual(before);
        expect((after as { revision: string }).revision).not.toBe((before as { revision: string }).revision);
      } finally {
        resume();
        connectSpy.mockRestore();
        for (const [client, originalQuery] of wrappedClients) {
          (client as { query: typeof pool.query }).query = originalQuery as typeof pool.query;
        }
        await db.delete(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
        await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      }
    },
  );
  it.each(["search_sequences", "get_sequence"] as const)(
    "keeps a full %s layout and revision on one snapshot when a story is inserted mid-read",
    async tool => {
      const [user] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.platformRole, "super_admin")).limit(1);
      if (!user) throw new Error("A seeded development super-admin is required");
      const worldId = `insert-snapshot-${randomUUID()}`;
      const storyId = `${worldId}-story`;
      const insertedId = `${worldId}-inserted`;
      const origin = "https://example.com";
      const args = tool === "get_sequence"
        ? { world_id: worldId, sequence_id: worldId }
        : { world_id: worldId };
      let resume!: () => void;
      const released = new Promise<void>(resolve => { resume = resolve; });
      let selected!: () => void;
      const storiesSelected = new Promise<void>(resolve => { selected = resolve; });
      let intercept = false;
      const connect = pool.connect.bind(pool);
      const wrappedClients = new Map<object, unknown>();
      const connectSpy = vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
        if (typeof args[0] === "function") return (connect as (callback: unknown) => void)(args[0]);
        return connect().then(client => {
          if (wrappedClients.has(client)) return client;
          const originalQuery = client.query;
          wrappedClients.set(client, originalQuery);
          client.query = ((...queryArgs: unknown[]) => {
            if (typeof queryArgs[queryArgs.length - 1] === "function") {
              return (originalQuery as (...values: unknown[]) => unknown).apply(client, queryArgs);
            }
            return (async () => {
              const result = await (originalQuery as (...values: unknown[]) => Promise<unknown>).apply(client, queryArgs);
              const config = queryArgs[0];
              const text = typeof config === "string" ? config : (config as { text?: string }).text;
              if (intercept && text?.includes('from "ws_stories"') && text.includes("order by")) {
                intercept = false;
                selected();
                await released;
              }
              return result;
            })();
          }) as typeof client.query;
          return client;
        });
      }) as typeof pool.connect);
      try {
        await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Insertion snapshot", code: "INS" });
        await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Original", sortOrder: 1 });
        const before = await executeViewTool(user.id, tool, args, origin) as {
          revision: string; sequences: Array<{ id: string; story_ids: string[]; expected_revision: string }>;
        };
        expect(before.sequences.map(group => group.story_ids)).toEqual([[storyId]]);
        intercept = true;
        const pending = executeViewTool(user.id, tool, args, origin);
        await storiesSelected;
        // The new member changes both the virtual group ID and the world revision.
        // The paused reader has already selected the old membership.
        await db.insert(wsStoriesTable).values({ id: insertedId, worldId, title: "New member", sortOrder: 1 });
        resume();
        expect(await pending).toEqual(before);
        const after = await executeViewTool(user.id, tool, args, origin) as typeof before;
        expect(after.sequences.map(group => group.story_ids)).toEqual([[insertedId, storyId]]);
        expect(after.sequences[0].id).not.toBe(before.sequences[0].id);
        expect(after.revision).not.toBe(before.revision);
        expect(after.sequences[0].expected_revision).toBe(after.revision);
      } finally {
        resume();
        connectSpy.mockRestore();
        for (const [client, originalQuery] of wrappedClients) {
          (client as { query: typeof pool.query }).query = originalQuery as typeof pool.query;
        }
        await db.delete(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
        await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      }
    },
  );
  it("keeps Story Map graphs and search revisions on one snapshot across concurrent edits", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `snapshot-map-${randomUUID()}`;
    const storyId = `${worldId}-story`;
    const actId = `${worldId}-act`;
    const recordId = `${worldId}-record`;
    const linkId = `${worldId}-link`;
    const origin = "https://example.com";
    let resume!: () => void;
    let selected!: () => void;
    let released = new Promise<void>(resolve => { resume = resolve; });
    let storiesSelected = new Promise<void>(resolve => { selected = resolve; });
    let intercept = false;
    const connect = pool.connect.bind(pool);
    const wrappedClients = new Map<object, unknown>();
    const connectSpy = vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
      if (typeof args[0] === "function") return (connect as (callback: unknown) => void)(args[0]);
      return connect().then(client => {
        if (wrappedClients.has(client)) return client;
        const originalQuery = client.query;
        wrappedClients.set(client, originalQuery);
        client.query = ((...args: unknown[]) => {
          if (typeof args[args.length - 1] === "function") {
            return (originalQuery as (...values: unknown[]) => unknown).apply(client, args);
          }
          return (async () => {
            const result = await (originalQuery as (...values: unknown[]) => Promise<unknown>).apply(client, args);
            const config = args[0];
            const text = typeof config === "string" ? config : (config as { text?: string }).text;
            if (intercept && text?.includes('from "ws_stories"') && text.includes('"sort_order"')) {
              intercept = false;
              selected();
              await released;
            }
            return result;
          })();
        }) as typeof client.query;
        return client;
      });
    }) as typeof pool.connect);
    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Map before", code: "SMAP" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Story before", sortOrder: 1 });
      await db.insert(wsStoryActsTable).values({ id: actId, worldId, storyId, title: "Movement before", actNumber: 1 });
      await db.insert(wsCanonRecordsTable).values({
        id: recordId, worldId, name: "Canon before", canonType: "character", status: "proposed",
      });
      await db.insert(wsCanonRecordStoryLinksTable).values({
        id: linkId, canonRecordId: recordId, storyId, actId,
      });

      for (const [tool, args, label] of [
        ["get_story_map", { map_id: worldId }, "first"],
        ["search_story_maps", { world_id: worldId }, "second"],
      ] as const) {
        const before = await executeViewTool(user.id, tool, args, origin);
        intercept = true;
        const pending = executeViewTool(user.id, tool, args, origin);
        await storiesSelected;
        // A separate connection commits changes to every part of the graph
        // while the map's acts, links, and canon queries are still pending.
        await db.transaction(async tx => {
          await tx.update(worldsmithWorldsTable).set({ name: `Map ${label}` }).where(eq(worldsmithWorldsTable.id, worldId));
          await tx.update(wsStoriesTable).set({ title: `Story ${label}` }).where(eq(wsStoriesTable.id, storyId));
          await tx.update(wsStoryActsTable).set({ title: `Movement ${label}` }).where(eq(wsStoryActsTable.id, actId));
          await tx.update(wsCanonRecordsTable).set({ name: `Canon ${label}` }).where(eq(wsCanonRecordsTable.id, recordId));
          await tx.update(wsCanonRecordStoryLinksTable).set({ actId: label === "first" ? null : actId })
            .where(eq(wsCanonRecordStoryLinksTable.id, linkId));
        });
        resume();
        expect(await pending).toEqual(before);
        const after = await executeViewTool(user.id, tool, args, origin);
        expect(after).not.toEqual(before);
        if (tool === "get_story_map") {
          expect(after).toMatchObject({
            world_name: "Map first",
            stories: [{ title: "Story first", movements: [{ title: "Movement first" }] }],
            links: [{ actId: null, canon_record: { name: "Canon first" } }],
          });
        } else {
          expect(after).toMatchObject({ maps: [{ name: "Map second" }] });
          const currentMap = await executeViewTool(user.id, "get_story_map", { map_id: worldId }, origin) as { revision: string };
          expect((after as { maps: { revision: string }[] }).maps[0]?.revision).toBe(currentMap.revision);
        }
        released = new Promise<void>(resolve => { resume = resolve; });
        storiesSelected = new Promise<void>(resolve => { selected = resolve; });
      }
    } finally {
      resume();
      connectSpy.mockRestore();
      for (const [client, originalQuery] of wrappedClients) {
        (client as { query: typeof pool.query }).query = originalQuery as typeof pool.query;
      }
      await db.delete(wsCanonRecordStoryLinksTable).where(eq(wsCanonRecordStoryLinksTable.id, linkId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId));
      await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, actId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
    }
  });
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

  it("commits simultaneous beat and reveal edits with independent revisions and audits", async () => {
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
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Beat and Reveal MCP World", code: "BRW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Beat and Reveal", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(wsRevealThreadsTable).values({ id: revealId, worldId, storyId, title: "Secret", truth: "Original truth" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Beat and reveal editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:editorial:read", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const beforeBeat = await call("get_story_beat", { storyline_id: storyId, beat_id: beatId });
      const beforeReveal = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
      expect(beforeBeat.status).toBe(200);
      expect(beforeReveal.status).toBe(200);
      const beatRevision = beforeBeat.body.result.structuredContent.revision as string;
      const revealRevision = beforeReveal.body.result.structuredContent.revision as string;
      const beatSummary = "Beat saved beside reveal";
      const revealTruth = "Truth saved beside beat";
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = [
          call("update_story_beat", {
            storyline_id: storyId, beat_id: beatId, expected_revision: beatRevision,
            changes: { summary: beatSummary },
          }).then(response => response),
          call("update_reveal_thread", {
            storyline_id: storyId, reveal_id: revealId, expected_revision: revealRevision,
            changes: { truth: revealTruth },
          }).then(response => response),
        ];
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
      const [beatResponse, revealResponse] = await Promise.all(pending);
      expect(blocked).toBe(2);
      for (const response of [beatResponse, revealResponse]) {
        expect(response.status).toBe(200);
        expect(response.body.result.isError).not.toBe(true);
      }
      expect(beatResponse.body.result.structuredContent.record.summary).toBe(beatSummary);
      expect(revealResponse.body.result.structuredContent.record.truth).toBe(revealTruth);
      const [savedBeat] = await db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      const [savedReveal] = await db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      expect(savedBeat.summary).toBe(beatSummary);
      expect(savedReveal.truth).toBe(revealTruth);
      const afterBeat = await call("get_story_beat", { storyline_id: storyId, beat_id: beatId });
      const afterReveal = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
      expect(afterBeat.body.result.structuredContent.revision).toBe(beatResponse.body.result.structuredContent.revision);
      expect(afterReveal.body.result.structuredContent.revision).toBe(revealResponse.body.result.structuredContent.revision);
      expect(afterBeat.body.result.structuredContent.revision).not.toBe(beatRevision);
      expect(afterReveal.body.result.structuredContent.revision).not.toBe(revealRevision);
      expect(afterBeat.body.result.structuredContent.revision).not.toBe(afterReveal.body.result.structuredContent.revision);
      for (const { id, kind, field, before, after } of [
        { id: beatId, kind: "story_beat", field: "summary", before: "", after: beatSummary },
        { id: revealId, kind: "reveal_thread", field: "truth", before: "Original truth", after: revealTruth },
      ]) {
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, id));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          actorUserId: user.id,
          action: `worldsmith.editorial.${kind}.update`,
          targetType: `worldsmith_${kind}`,
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { [field]: { before, after } },
          }),
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

  it("commits simultaneous edits to different reveals with separate revisions and audits", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const revealIds = [`mcp-reveal-${randomUUID()}`, `mcp-reveal-${randomUUID()}`];
    const clientId = `mcp-client-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Separate Reveal MCP World", code: "SRW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Separate Reveals", status: "draft" });
      const originalTruths = ["First original truth", "Second original truth"];
      await db.insert(wsRevealThreadsTable).values(revealIds.map((id, index) => ({
        id, worldId, storyId, title: `Secret ${index + 1}`, truth: originalTruths[index],
      })));
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Separate reveal editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:editorial:read", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const revisions = await Promise.all(revealIds.map(async revealId => {
        const response = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
        expect(response.status).toBe(200);
        return response.body.result.structuredContent.revision as string;
      }));
      const truths = ["First revealed truth", "Second revealed truth"];
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = revealIds.map((revealId, index) =>
          call("update_reveal_thread", {
            storyline_id: storyId, reveal_id: revealId, expected_revision: revisions[index],
            changes: { truth: truths[index] },
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
        expect(response.body.result.structuredContent.record.truth).toBe(truths[index]);
        const [persisted] = await db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealIds[index]));
        expect(persisted.truth).toBe(truths[index]);
        const after = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealIds[index] });
        expect(after.body.result.structuredContent.revision).toBe(response.body.result.structuredContent.revision);
        expect(after.body.result.structuredContent.revision).not.toBe(revisions[index]);
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, revealIds[index]));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          action: "worldsmith.editorial.reveal_thread.update",
          targetType: "worldsmith_reveal_thread",
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { truth: { before: originalTruths[index], after: truths[index] } },
          }),
        }));
      }
      expect(responses[0].body.result.structuredContent.revision)
        .not.toBe(responses[1].body.result.structuredContent.revision);
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, revealIds));
      await db.delete(wsRevealThreadsTable).where(inArray(wsRevealThreadsTable.id, revealIds));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("commits simultaneous storyline and beat edits with separate revisions and audits", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const beatId = `mcp-beat-${randomUUID()}`;
    const clientId = `mcp-client-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Parent and Beat MCP World", code: "PBW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Parent and Beat", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Parent and beat editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const beforeStory = await call("get_storyline", { storyline_id: storyId });
      const beforeBeat = await call("get_story_beat", { storyline_id: storyId, beat_id: beatId });
      expect(beforeStory.status).toBe(200);
      expect(beforeBeat.status).toBe(200);
      const storyRevision = beforeStory.body.result.structuredContent.revision as string;
      const beatRevision = beforeBeat.body.result.structuredContent.revision as string;
      const storySummary = "Storyline updated alongside its beat";
      const beatSummary = "Beat updated alongside its storyline";
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = [
          call("update_storyline", {
            storyline_id: storyId, expected_revision: storyRevision, changes: { summary: storySummary },
          }).then(response => response),
          call("update_story_beat", {
            storyline_id: storyId, beat_id: beatId, expected_revision: beatRevision,
            changes: { summary: beatSummary },
          }).then(response => response),
        ];
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
      const [storyResponse, beatResponse] = await Promise.all(pending);
      expect(blocked).toBe(2);
      for (const response of [storyResponse, beatResponse]) {
        expect(response.status).toBe(200);
        expect(response.body.result.isError).not.toBe(true);
      }
      expect(storyResponse.body.result.structuredContent.record.summary).toBe(storySummary);
      expect(beatResponse.body.result.structuredContent.record.summary).toBe(beatSummary);
      const [savedStory] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      const [savedBeat] = await db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      expect(savedStory.summary).toBe(storySummary);
      expect(savedBeat.summary).toBe(beatSummary);
      const afterStory = await call("get_storyline", { storyline_id: storyId });
      const afterBeat = await call("get_story_beat", { storyline_id: storyId, beat_id: beatId });
      expect(afterStory.body.result.structuredContent.revision).toBe(storyResponse.body.result.structuredContent.revision);
      expect(afterStory.body.result.structuredContent.story_beats[0].revision)
        .toBe(beatResponse.body.result.structuredContent.revision);
      expect(afterBeat.body.result.structuredContent.revision).toBe(beatResponse.body.result.structuredContent.revision);
      expect(afterStory.body.result.structuredContent.revision).not.toBe(storyRevision);
      expect(afterBeat.body.result.structuredContent.revision).not.toBe(beatRevision);
      for (const { id, kind, fieldValue } of [
        { id: storyId, kind: "storyline", fieldValue: storySummary },
        { id: beatId, kind: "story_beat", fieldValue: beatSummary },
      ]) {
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, id));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          action: `worldsmith.editorial.${kind}.update`,
          targetType: `worldsmith_${kind}`,
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { summary: { before: "", after: fieldValue } },
          }),
        }));
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, beatId]));
      await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("commits simultaneous storyline and reveal edits with separate revisions and audits", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
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
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Parent and Reveal MCP World", code: "PRW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Parent and Reveal", status: "draft" });
      await db.insert(wsRevealThreadsTable).values({ id: revealId, worldId, storyId, title: "Secret", truth: "Original truth" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Parent and reveal editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const beforeStory = await call("get_storyline", { storyline_id: storyId });
      const beforeReveal = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
      expect(beforeStory.status).toBe(200);
      expect(beforeReveal.status).toBe(200);
      const storyRevision = beforeStory.body.result.structuredContent.revision as string;
      const revealRevision = beforeReveal.body.result.structuredContent.revision as string;
      const storySummary = "Storyline updated alongside its reveal";
      const revealTruth = "Truth updated alongside its storyline";
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = [
          call("update_storyline", {
            storyline_id: storyId, expected_revision: storyRevision, changes: { summary: storySummary },
          }).then(response => response),
          call("update_reveal_thread", {
            storyline_id: storyId, reveal_id: revealId, expected_revision: revealRevision,
            changes: { truth: revealTruth },
          }).then(response => response),
        ];
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
      const [storyResponse, revealResponse] = await Promise.all(pending);
      expect(blocked).toBe(2);
      for (const response of [storyResponse, revealResponse]) {
        expect(response.status).toBe(200);
        expect(response.body.result.isError).not.toBe(true);
      }
      expect(storyResponse.body.result.structuredContent.record.summary).toBe(storySummary);
      expect(revealResponse.body.result.structuredContent.record.truth).toBe(revealTruth);
      const [savedStory] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      const [savedReveal] = await db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      expect(savedStory.summary).toBe(storySummary);
      expect(savedReveal.truth).toBe(revealTruth);
      const afterStory = await call("get_storyline", { storyline_id: storyId });
      const afterReveal = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
      expect(afterStory.body.result.structuredContent.revision).toBe(storyResponse.body.result.structuredContent.revision);
      expect(afterStory.body.result.structuredContent.reveal_threads[0].revision)
        .toBe(revealResponse.body.result.structuredContent.revision);
      expect(afterReveal.body.result.structuredContent.revision).toBe(revealResponse.body.result.structuredContent.revision);
      expect(afterStory.body.result.structuredContent.revision).not.toBe(storyRevision);
      expect(afterReveal.body.result.structuredContent.revision).not.toBe(revealRevision);
      for (const { id, kind, field, before, after } of [
        { id: storyId, kind: "storyline", field: "summary", before: "", after: storySummary },
        { id: revealId, kind: "reveal_thread", field: "truth", before: "Original truth", after: revealTruth },
      ]) {
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, id));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          action: `worldsmith.editorial.${kind}.update`,
          targetType: `worldsmith_${kind}`,
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { [field]: { before, after } },
          }),
        }));
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, revealId]));
      await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("commits a storyline and two reveal edits queued in the same save burst", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const revealIds = [`mcp-reveal-${randomUUID()}`, `mcp-reveal-${randomUUID()}`];
    const clientId = `mcp-client-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Three-edit MCP World", code: "TEW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Three-edit Story", status: "draft" });
      const originalTruths = ["First original truth", "Second original truth"];
      await db.insert(wsRevealThreadsTable).values(revealIds.map((id, index) => ({
        id, worldId, storyId, title: `Secret ${index + 1}`, truth: originalTruths[index],
      })));
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Three-edit editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(),
        scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const beforeStory = await call("get_storyline", { storyline_id: storyId });
      expect(beforeStory.status).toBe(200);
      const storyRevision = beforeStory.body.result.structuredContent.revision as string;
      const revealRevisions = await Promise.all(revealIds.map(async revealId => {
        const response = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
        expect(response.status).toBe(200);
        return response.body.result.structuredContent.revision as string;
      }));
      const storySummary = "Storyline updated with two reveals";
      const truths = ["First truth updated with storyline", "Second truth updated with storyline"];
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = [
          call("update_storyline", {
            storyline_id: storyId, expected_revision: storyRevision, changes: { summary: storySummary },
          }).then(response => response),
          ...revealIds.map((revealId, index) =>
            call("update_reveal_thread", {
              storyline_id: storyId, reveal_id: revealId, expected_revision: revealRevisions[index],
              changes: { truth: truths[index] },
            }).then(response => response)),
        ];
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline) {
          // PostgreSQL queues later writers behind earlier waiters, not necessarily behind the holder.
          const { rows } = await pool.query<{ blocked: number }>(
            `WITH RECURSIVE waiters(pid) AS (
               SELECT pid FROM pg_stat_activity
               WHERE pid <> $1 AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
               UNION
               SELECT activity.pid FROM pg_stat_activity AS activity
               JOIN waiters ON waiters.pid = ANY(pg_blocking_pids(activity.pid))
               WHERE activity.wait_event_type = 'Lock'
             )
             SELECT count(*)::int AS blocked FROM waiters`,
            [pid],
          );
          blocked = rows[0].blocked;
          if (blocked >= 3) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
      const [storyResponse, ...revealResponses] = await Promise.all(pending);
      expect(blocked).toBe(3);
      for (const response of [storyResponse, ...revealResponses]) {
        expect(response.status).toBe(200);
        expect(response.body.result.isError).not.toBe(true);
      }
      expect(storyResponse.body.result.structuredContent.record.summary).toBe(storySummary);
      const [savedStory] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      expect(savedStory.summary).toBe(storySummary);
      const afterStory = await call("get_storyline", { storyline_id: storyId });
      expect(afterStory.body.result.structuredContent.revision).toBe(storyResponse.body.result.structuredContent.revision);
      expect(afterStory.body.result.structuredContent.revision).not.toBe(storyRevision);
      for (const [index, revealId] of revealIds.entries()) {
        const response = revealResponses[index];
        expect(response.body.result.structuredContent.record.truth).toBe(truths[index]);
        const [savedReveal] = await db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
        expect(savedReveal.truth).toBe(truths[index]);
        const afterReveal = await call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId });
        const revision = response.body.result.structuredContent.revision;
        expect(afterReveal.body.result.structuredContent.revision).toBe(revision);
        expect(afterStory.body.result.structuredContent.reveal_threads.find(
          (reveal: { id: string }) => reveal.id === revealId,
        )?.revision).toBe(revision);
        expect(revision).not.toBe(revealRevisions[index]);
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, revealId));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          actorUserId: user.id,
          action: "worldsmith.editorial.reveal_thread.update",
          targetType: "worldsmith_reveal_thread",
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { truth: { before: originalTruths[index], after: truths[index] } },
          }),
        }));
      }
      const storyAudits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, storyId));
      expect(storyAudits).toHaveLength(1);
      expect(storyAudits[0]).toEqual(expect.objectContaining({
        actorUserId: user.id,
        action: "worldsmith.editorial.storyline.update",
        targetType: "worldsmith_storyline",
        metadata: expect.objectContaining({
          actor_user_id: user.id,
          before_after: { summary: { before: "", after: storySummary } },
        }),
      }));
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, ...revealIds]));
      await db.delete(wsRevealThreadsTable).where(inArray(wsRevealThreadsTable.id, revealIds));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("commits a storyline, beat, and reveal queued in the same save burst", async () => {
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
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Mixed Burst MCP World", code: "MBW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Mixed Burst", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(wsRevealThreadsTable).values({ id: revealId, worldId, storyId, title: "Secret", truth: "Original truth" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Mixed burst editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(),
        scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const before = await Promise.all([
        call("get_storyline", { storyline_id: storyId }),
        call("get_story_beat", { storyline_id: storyId, beat_id: beatId }),
        call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId }),
      ]);
      for (const response of before) expect(response.status).toBe(200);
      const originalRevisions = before.map(response => response.body.result.structuredContent.revision as string);
      const storySummary = "Storyline saved with both child types";
      const beatSummary = "Beat saved with storyline and reveal";
      const revealTruth = "Truth saved with storyline and beat";
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = [
          call("update_storyline", {
            storyline_id: storyId, expected_revision: originalRevisions[0], changes: { summary: storySummary },
          }).then(response => response),
          call("update_story_beat", {
            storyline_id: storyId, beat_id: beatId, expected_revision: originalRevisions[1],
            changes: { summary: beatSummary },
          }).then(response => response),
          call("update_reveal_thread", {
            storyline_id: storyId, reveal_id: revealId, expected_revision: originalRevisions[2],
            changes: { truth: revealTruth },
          }).then(response => response),
        ];
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline) {
          // Later writers may wait on earlier waiters instead of directly on the holder.
          const { rows } = await pool.query<{ blocked: number }>(
            `WITH RECURSIVE waiters(pid) AS (
               SELECT pid FROM pg_stat_activity
               WHERE pid <> $1 AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
               UNION
               SELECT activity.pid FROM pg_stat_activity AS activity
               JOIN waiters ON waiters.pid = ANY(pg_blocking_pids(activity.pid))
               WHERE activity.wait_event_type = 'Lock'
             )
             SELECT count(*)::int AS blocked FROM waiters`,
            [pid],
          );
          blocked = rows[0].blocked;
          if (blocked >= 3) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
      const responses = await Promise.all(pending);
      expect(blocked).toBe(3);
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.body.result.isError).not.toBe(true);
      }

      const [savedStory] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      const [savedBeat] = await db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      const [savedReveal] = await db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      const after = await Promise.all([
        call("get_storyline", { storyline_id: storyId }),
        call("get_story_beat", { storyline_id: storyId, beat_id: beatId }),
        call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId }),
      ]);
      expect([savedStory.summary, savedBeat.summary, savedReveal.truth])
        .toEqual([storySummary, beatSummary, revealTruth]);
      const revisions = responses.map(response => response.body.result.structuredContent.revision as string);
      expect(new Set(revisions).size).toBe(3);
      for (const [index, response] of after.entries()) {
        expect(response.status).toBe(200);
        expect(response.body.result.structuredContent.revision).toBe(revisions[index]);
        expect(revisions[index]).not.toBe(originalRevisions[index]);
      }
      expect(after[0].body.result.structuredContent.story_beats[0].revision).toBe(revisions[1]);
      expect(after[0].body.result.structuredContent.reveal_threads[0].revision).toBe(revisions[2]);
      for (const { id, kind, field, previous, value } of [
        { id: storyId, kind: "storyline", field: "summary", previous: "", value: storySummary },
        { id: beatId, kind: "story_beat", field: "summary", previous: "", value: beatSummary },
        { id: revealId, kind: "reveal_thread", field: "truth", previous: "Original truth", value: revealTruth },
      ]) {
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, id));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          actorUserId: user.id,
          action: `worldsmith.editorial.${kind}.update`,
          targetType: `worldsmith_${kind}`,
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { [field]: { before: previous, after: value } },
          }),
        }));
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, beatId, revealId]));
      await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });

  it("attributes serialized storyline, beat, and reveal saves to their own operators in either arrival order", async () => {
    const suffix = randomUUID();
    const operators = [
      { id: `mcp-editor-a-${suffix}`, token: randomBytes(32).toString("base64url") },
      { id: `mcp-editor-b-${suffix}`, token: randomBytes(32).toString("base64url") },
    ];
    const worldId = `mcp-world-${suffix}`;
    const storyId = `mcp-story-${suffix}`;
    const beatId = `mcp-beat-${suffix}`;
    const revealId = `mcp-reveal-${suffix}`;
    const clientId = `mcp-client-${suffix}`;
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (operator: number, name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${operators[operator].token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(usersTable).values(operators.map((operator, index) => ({
        id: operator.id, email: `mcp-editor-${index}-${suffix}@example.com`,
        name: `MCP Editor ${index}`, platformRole: "super_admin",
      })));
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Two Editor MCP World", code: "TMW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Two Editor Story", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(wsRevealThreadsTable).values({ id: revealId, worldId, storyId, title: "Secret", truth: "Original truth" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Two editor attribution test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values(operators.map(operator => ({
        tokenHash: createHash("sha256").update(operator.token).digest("hex"),
        kind: "access" as const, familyId: randomUUID(), clientId, userId: operator.id,
        resource: getMcpResource(),
        scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      })));

      const edits = [
        { id: storyId, kind: "storyline", get: "get_storyline", update: "update_storyline",
          args: { storyline_id: storyId }, field: "summary", previous: "", operator: 0, table: wsStoriesTable },
        { id: beatId, kind: "story_beat", get: "get_story_beat", update: "update_story_beat",
          args: { storyline_id: storyId, beat_id: beatId }, field: "summary", previous: "", operator: 1, table: wsStoryBeatsTable },
        { id: revealId, kind: "reveal_thread", get: "get_reveal_thread", update: "update_reveal_thread",
          args: { storyline_id: storyId, reveal_id: revealId }, field: "truth", previous: "Original truth", operator: 0, table: wsRevealThreadsTable },
      ] as const;

      for (const round of [0, 1]) {
        const before = await Promise.all(edits.map(edit => call(edit.operator, edit.get, edit.args)));
        for (const response of before) {
          expect(response.status).toBe(200);
          expect(response.body.result.isError).not.toBe(true);
        }
        const revisions = before.map(response => response.body.result.structuredContent.revision as string);
        const order = round === 0 ? [0, 1, 2] : [2, 1, 0];
        const values = edits.map((_, index) => `Round ${round + 1} edit ${index}`);
        const holder = await pool.connect();
        let pending: Promise<import("supertest").Response>[] = [];
        let blocked = 0;
        try {
          await holder.query("BEGIN");
          const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
          await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
          pending = order.map(index => {
            const edit = edits[index];
            return call(edit.operator, edit.update, {
              ...edit.args, expected_revision: revisions[index],
              changes: { [edit.field]: values[index] },
            }).then(response => response);
          });
          const deadline = Date.now() + 8_000;
          while (Date.now() < deadline) {
            const { rows } = await pool.query<{ blocked: number }>(
              `WITH RECURSIVE waiters(pid) AS (
                 SELECT pid FROM pg_stat_activity
                 WHERE pid <> $1 AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
                 UNION
                 SELECT activity.pid FROM pg_stat_activity AS activity
                 JOIN waiters ON waiters.pid = ANY(pg_blocking_pids(activity.pid))
                 WHERE activity.wait_event_type = 'Lock'
               )
               SELECT count(*)::int AS blocked FROM waiters`,
              [pid],
            );
            blocked = rows[0].blocked;
            if (blocked >= 3) break;
            await new Promise(resolve => setTimeout(resolve, 25));
          }
        } finally {
          await holder.query("ROLLBACK");
          holder.release();
        }
        const responses = await Promise.all(pending);
        expect(blocked).toBe(3);
        for (const response of responses) {
          expect(response.status).toBe(200);
          expect(response.body.result.isError).not.toBe(true);
        }
        for (const [index, edit] of edits.entries()) {
          const [saved] = await db.select().from(edit.table).where(eq(edit.table.id, edit.id));
          expect((saved as Record<string, unknown>)[edit.field]).toBe(values[index]);
          const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, edit.id));
          const matching = audits.filter(audit =>
            (audit.metadata as { before_after?: Record<string, { after: unknown }> })?.before_after?.[edit.field]?.after === values[index]);
          expect(matching).toHaveLength(1);
          expect(audits).toHaveLength(round + 1);
          expect(matching[0]).toEqual(expect.objectContaining({
            actorUserId: operators[edit.operator].id,
            action: `worldsmith.editorial.${edit.kind}.update`,
            targetType: `worldsmith_${edit.kind}`,
            metadata: expect.objectContaining({
              actor_user_id: operators[edit.operator].id,
              before_after: { [edit.field]: { before: round === 0 ? edit.previous : values[index].replace("Round 2", "Round 1"), after: values[index] } },
            }),
          }));
        }
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, beatId, revealId]));
      await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      await db.delete(usersTable).where(inArray(usersTable.id, operators.map(operator => operator.id)));
    }
  });

  it("leaves only the winning editor's edit and audit when two editors save the same revision", async () => {
    const suffix = randomUUID();
    const operators = [
      { id: `mcp-editor-a-${suffix}`, token: randomBytes(32).toString("base64url") },
      { id: `mcp-editor-b-${suffix}`, token: randomBytes(32).toString("base64url") },
    ];
    const worldId = `mcp-world-${suffix}`;
    const storyId = `mcp-story-${suffix}`;
    const beatId = `mcp-beat-${suffix}`;
    const clientId = `mcp-client-${suffix}`;
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const call = (operator: number, name: string, args: Record<string, unknown>) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${operators[operator].token}`)
        .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(usersTable).values(operators.map((operator, index) => ({
        id: operator.id, email: `mcp-conflict-${index}-${suffix}@example.com`,
        name: `Conflicting Editor ${index}`, platformRole: "super_admin",
      })));
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Conflicting MCP World", code: "CFW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Conflicting Story", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Conflicting editorial saves test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values(operators.map(operator => ({
        tokenHash: createHash("sha256").update(operator.token).digest("hex"),
        kind: "access" as const, familyId: randomUUID(), clientId, userId: operator.id,
        resource: getMcpResource(),
        scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      })));

      for (const edit of [
        { id: storyId, kind: "storyline", get: "get_storyline", update: "update_storyline",
          args: { storyline_id: storyId }, table: wsStoriesTable },
        { id: beatId, kind: "story_beat", get: "get_story_beat", update: "update_story_beat",
          args: { storyline_id: storyId, beat_id: beatId }, table: wsStoryBeatsTable },
      ] as const) {
        const before = await Promise.all(operators.map((_, index) => call(index, edit.get, edit.args)));
        for (const response of before) {
          expect(response.status).toBe(200);
          expect(response.body.result.isError).not.toBe(true);
        }
        const revision = before[0].body.result.structuredContent.revision as string;
        expect(before[1].body.result.structuredContent.revision).toBe(revision);
        const values = operators.map((_, index) => `${edit.kind} from editor ${index}`);
        const holder = await pool.connect();
        let pending: Promise<import("supertest").Response>[] = [];
        let blocked = 0;
        try {
          await holder.query("BEGIN");
          const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
          await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
          pending = operators.map((_, index) =>
            call(index, edit.update, {
              ...edit.args, expected_revision: revision, changes: { summary: values[index] },
            }).then(response => response));
          const deadline = Date.now() + 8_000;
          while (Date.now() < deadline) {
            const { rows } = await pool.query<{ blocked: number }>(
              `WITH RECURSIVE waiters(pid) AS (
                 SELECT pid FROM pg_stat_activity
                 WHERE pid <> $1 AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
                 UNION
                 SELECT activity.pid FROM pg_stat_activity AS activity
                 JOIN waiters ON waiters.pid = ANY(pg_blocking_pids(activity.pid))
                 WHERE activity.wait_event_type = 'Lock'
               )
               SELECT count(*)::int AS blocked FROM waiters`,
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
        expect(responses.map(response => response.status)).toEqual([200, 200]);
        const winningIndex = responses.findIndex(response => response.body.result?.isError !== true);
        expect(winningIndex).toBeGreaterThanOrEqual(0);
        const losingIndex = 1 - winningIndex;
        expect(responses[losingIndex].body.result.isError).toBe(true);
        expect(responses[losingIndex].body.result.content[0].text).toContain("REVISION_CONFLICT");
        const winningRecord = responses[winningIndex].body.result.structuredContent;
        expect(winningRecord.record.summary).toBe(values[winningIndex]);
        expect(winningRecord.revision).not.toBe(revision);

        const [saved] = await db.select().from(edit.table).where(eq(edit.table.id, edit.id));
        expect(saved.summary).toBe(values[winningIndex]);
        const after = await call(losingIndex, edit.get, edit.args);
        expect(after.status).toBe(200);
        expect(after.body.result.structuredContent.revision).toBe(winningRecord.revision);
        expect(after.body.result.structuredContent.record.summary).toBe(values[winningIndex]);

        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, edit.id));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          actorUserId: operators[winningIndex].id,
          action: `worldsmith.editorial.${edit.kind}.update`,
          targetType: `worldsmith_${edit.kind}`,
          metadata: expect.objectContaining({
            actor_user_id: operators[winningIndex].id,
            before_after: { summary: { before: "", after: values[winningIndex] } },
          }),
        }));
        expect(audits.some(audit => audit.actorUserId === operators[losingIndex].id ||
          (audit.metadata as { actor_user_id?: string })?.actor_user_id === operators[losingIndex].id)).toBe(false);
      }
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, beatId]));
      await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      await db.delete(usersTable).where(inArray(usersTable.id, operators.map(operator => operator.id)));
    }
  });

  it("rejects only the stale beat in a queued storyline, beat, and reveal burst", async () => {
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
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Stale Burst MCP World", code: "SBW" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Stale Burst", status: "draft" });
      await db.insert(wsStoryBeatsTable).values({ id: beatId, worldId, storyId, beatType: "setup", title: "Opening" });
      await db.insert(wsRevealThreadsTable).values({ id: revealId, worldId, storyId, title: "Secret", truth: "Original truth" });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Stale burst editorial test", redirectUris: ["https://example.com/cb"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash: createHash("sha256").update(token).digest("hex"),
        kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(),
        scopes: ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:story-details:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const before = await Promise.all([
        call("get_storyline", { storyline_id: storyId }),
        call("get_story_beat", { storyline_id: storyId, beat_id: beatId }),
        call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId }),
      ]);
      for (const response of before) expect(response.status).toBe(200);
      const originalRevisions = before.map(response => response.body.result.structuredContent.revision as string);
      // Simulate an intervening save without an MCP audit: the queued beat request
      // carries a real, formerly valid revision rather than an invented token.
      const existingBeatSummary = "Already revised";
      await db.update(wsStoryBeatsTable).set({ summary: existingBeatSummary, updatedAt: new Date() })
        .where(eq(wsStoryBeatsTable.id, beatId));
      const currentBeat = await call("get_story_beat", { storyline_id: storyId, beat_id: beatId });
      expect(currentBeat.status).toBe(200);
      const currentBeatRevision = currentBeat.body.result.structuredContent.revision as string;
      expect(currentBeatRevision).not.toBe(originalRevisions[1]);

      const storySummary = "Valid storyline save";
      const rejectedBeatSummary = "Stale beat save";
      const revealTruth = "Valid reveal save";
      const holder = await pool.connect();
      let pending: Promise<import("supertest").Response>[] = [];
      let blocked = 0;
      try {
        await holder.query("BEGIN");
        const { rows: [{ pid }] } = await holder.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        await holder.query("SELECT id FROM ws_stories WHERE id = $1 FOR UPDATE", [storyId]);
        pending = [
          call("update_storyline", {
            storyline_id: storyId, expected_revision: originalRevisions[0], changes: { summary: storySummary },
          }).then(response => response),
          call("update_story_beat", {
            storyline_id: storyId, beat_id: beatId, expected_revision: originalRevisions[1],
            changes: { summary: rejectedBeatSummary },
          }).then(response => response),
          call("update_reveal_thread", {
            storyline_id: storyId, reveal_id: revealId, expected_revision: originalRevisions[2],
            changes: { truth: revealTruth },
          }).then(response => response),
        ];
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline) {
          const { rows } = await pool.query<{ blocked: number }>(
            `WITH RECURSIVE waiters(pid) AS (
               SELECT pid FROM pg_stat_activity
               WHERE pid <> $1 AND wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
               UNION
               SELECT activity.pid FROM pg_stat_activity AS activity
               JOIN waiters ON waiters.pid = ANY(pg_blocking_pids(activity.pid))
               WHERE activity.wait_event_type = 'Lock'
             )
             SELECT count(*)::int AS blocked FROM waiters`,
            [pid],
          );
          blocked = rows[0].blocked;
          if (blocked >= 3) break;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
      const responses = await Promise.all(pending);
      expect(blocked).toBe(3);
      expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
      expect(responses[0].body.result.isError).not.toBe(true);
      expect(responses[1].body.result.isError).toBe(true);
      expect(responses[1].body.result.content[0].text).toContain("REVISION_CONFLICT");
      expect(responses[2].body.result.isError).not.toBe(true);

      const [savedStory] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      const [savedBeat] = await db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      const [savedReveal] = await db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
      expect([savedStory.summary, savedBeat.summary, savedReveal.truth])
        .toEqual([storySummary, existingBeatSummary, revealTruth]);
      const after = await Promise.all([
        call("get_storyline", { storyline_id: storyId }),
        call("get_story_beat", { storyline_id: storyId, beat_id: beatId }),
        call("get_reveal_thread", { storyline_id: storyId, reveal_id: revealId }),
      ]);
      for (const response of after) expect(response.status).toBe(200);
      const storyRevision = responses[0].body.result.structuredContent.revision as string;
      const revealRevision = responses[2].body.result.structuredContent.revision as string;
      expect(new Set([storyRevision, currentBeatRevision, revealRevision]).size).toBe(3);
      expect(storyRevision).not.toBe(originalRevisions[0]);
      expect(revealRevision).not.toBe(originalRevisions[2]);
      expect(after[0].body.result.structuredContent.revision).toBe(storyRevision);
      expect(after[0].body.result.structuredContent.story_beats[0].revision).toBe(currentBeatRevision);
      expect(after[0].body.result.structuredContent.reveal_threads[0].revision).toBe(revealRevision);
      expect(after[1].body.result.structuredContent.revision).toBe(currentBeatRevision);
      expect(after[2].body.result.structuredContent.revision).toBe(revealRevision);

      for (const { id, kind, field, previous, value } of [
        { id: storyId, kind: "storyline", field: "summary", previous: "", value: storySummary },
        { id: revealId, kind: "reveal_thread", field: "truth", previous: "Original truth", value: revealTruth },
      ]) {
        const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, id));
        expect(audits).toHaveLength(1);
        expect(audits[0]).toEqual(expect.objectContaining({
          actorUserId: user.id,
          action: `worldsmith.editorial.${kind}.update`,
          targetType: `worldsmith_${kind}`,
          metadata: expect.objectContaining({
            actor_user_id: user.id,
            before_after: { [field]: { before: previous, after: value } },
          }),
        }));
      }
      expect(await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, beatId))).toHaveLength(0);
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [storyId, beatId, revealId]));
      await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, beatId));
      await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, revealId));
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
        "search_worlds", "get_world", "get_world_creative_context",
        "search_story_maps", "get_story_map",
        "search_storylines", "get_storyline",
        "get_story_beat", "update_story_beat", "get_reveal_thread", "update_reveal_thread",
        "search_movements", "get_movement",
        "search_sequences", "get_sequence",
      ]));
      expect(names).not.toContain("update_sequence");
      const writeNames = (await rpc(writeToken, "tools/list")).body.result.tools.map((tool: { name: string }) => tool.name);
      expect(writeNames).toEqual(expect.arrayContaining([
        "update_world", "update_story_map", "update_storyline", "update_movement", "update_sequence",
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
      expect(map.stories[0]).toEqual(expect.objectContaining({
        sequence_role: "chronological", sequence_label: "Chronological",
      }));
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
      const getSequenceSchema = (await rpc(readToken, "tools/list")).body.result.tools
        .find((tool: { name: string }) => tool.name === "get_sequence").inputSchema;
      expect(getSequenceSchema.required).toEqual(["world_id", "sequence_id"]);
      const missingWorld = await call(readToken, "get_sequence", { sequence_id: selectedId });
      expect(missingWorld.body.result.content[0].text).toContain("INVALID_ARGUMENTS");
      const sequence = await result("get_sequence", { world_id: worldId, sequence_id: selectedId });
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
      await db.update(wsStoriesTable).set({ sequenceRole: "reference" }).where(eq(wsStoriesTable.id, secondStoryId));
      const referenceMap = await result("get_story_map", { map_id: worldId });
      expect(referenceMap.stories.find((story: { id: string }) => story.id === secondStoryId))
        .toEqual(expect.objectContaining({
          sequence_role: "reference", sequence_label: "Reference · outside chronology",
        }));
      const referenceSequences = await result("search_sequences", { world_id: worldId });
      expect(referenceSequences.sequences.flatMap((group: { story_ids: string[] }) => group.story_ids))
        .not.toContain(secondStoryId);
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