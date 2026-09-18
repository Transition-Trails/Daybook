import { describe, expect, it, vi } from "vitest";
import {
  canonSnapshotPath,
  contextSnapshotIsOutdated,
  ContextSnapshotGitHubPublisher,
  mapWithConcurrency,
  renderCanonSnapshot,
  shouldAutoSyncContextSnapshot,
  snapshotHash,
} from "../lib/worldsmith/context-snapshot";

const record = {
  id: "WC-PLC-001",
  worldId: "wychcombe",
  worldName: "Wychcombe",
  name: "Stationery House",
  status: "accepted",
  canonType: "location",
  narrativeDetails: "<p>The Stationery House anchors the high street.</p>",
  historicalContext: "",
  visualNotes: "Warm windows, oxblood paint, hand-lettered signs.",
  emotionalRegister: "Confidence",
  sensoryClauses: "",
  narrativeVisibility: "explicit",
  temporalScope: "Victorian era",
  canonStability: "high",
  emotionalValence: null,
  notes: "Confirm the rear workshop dimensions.",
  updatedAt: new Date("2026-09-18T10:00:00.000Z"),
  relationships: [
    { relationType: "supports", recordId: "WC-CHR-002", name: "Ada Bell", canonType: "character" },
    { relationType: "precedes", recordId: "WC-EVT-003", name: "The Winter Closing", canonType: "event" },
  ],
  linkedSpecs: [{ id: "spec-1", name: "Stationery House Hero Paper" }],
  linkedPromptModules: [{ id: "module-1", name: "Wychcombe Material Language" }],
};

describe("WorldSmith Context Snapshots", () => {
  it("renders deterministic, readable Canon Markdown without invented empty sections", () => {
    const generatedAt = new Date("2026-09-18T12:00:00.000Z");
    const first = renderCanonSnapshot(record, generatedAt);
    const second = renderCanonSnapshot({ ...record, relationships: [...record.relationships].reverse() }, generatedAt);

    expect(first).toBe(second);
    expect(first).toContain("# Stationery House");
    expect(first).toContain("**Status:** accepted");
    expect(first).toContain("**Confidence / stability:** high");
    expect(first).toContain("The Stationery House anchors the high street.");
    expect(first).toContain("## Related Canon Records");
    expect(first).toContain("Generated from Daybook. Do not edit as source data.");
    expect(first).not.toContain("## Historical Context");
    expect(first).not.toContain("Not provided");
    expect(snapshotHash(first)).toHaveLength(64);
  });

  it("uses a predictable world and Canon category path", () => {
    expect(canonSnapshotPath(record)).toBe(
      "worlds/wychcombe/context/canon/locations/wc-plc-001-stationery-house.md",
    );
  });

  it("creates a new GitHub file and records the returned commit", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: "worlds/wychcombe/context/canon/locations/stationery-house.md" },
        commit: { sha: "commit-1" },
      }), { status: 201 }));
    const publisher = new ContextSnapshotGitHubPublisher({
      fetchImpl: fetchImpl as typeof fetch,
      token: "test-token",
      repository: "Transition-Trails/WorldSmith",
      branch: "main",
    });

    const result = await publisher.publish("worlds/wychcombe/context/canon/locations/stationery-house.md", "# Stationery House\n", "Update context snapshot");

    expect(result.commitSha).toBe("commit-1");
    const body = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(body.sha).toBeUndefined();
    expect(Buffer.from(body.content, "base64").toString("utf8")).toBe("# Stationery House\n");
  });

  it("updates an existing GitHub file using its current blob SHA", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "blob-before" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: "snapshot.md" },
        commit: { sha: "commit-2" },
      }), { status: 200 }));
    const publisher = new ContextSnapshotGitHubPublisher({
      fetchImpl: fetchImpl as typeof fetch,
      token: "test-token",
      repository: "Transition-Trails/WorldSmith",
      branch: "main",
    });

    await publisher.publish("snapshot.md", "# Updated\n", "Update context snapshot");

    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toMatchObject({ sha: "blob-before", branch: "main" });
  });

  it("removes the previous GitHub path after publishing a renamed snapshot", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: "worlds/wychcombe/context/canon/locations/new-name.md" },
        commit: { sha: "commit-new" },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "old-blob" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ commit: { sha: "commit-cleanup" } }), { status: 200 }));
    const publisher = new ContextSnapshotGitHubPublisher({
      fetchImpl: fetchImpl as typeof fetch,
      token: "test-token",
      repository: "Transition-Trails/WorldSmith",
      branch: "main",
    });

    await publisher.publish(
      "worlds/wychcombe/context/canon/locations/new-name.md",
      "# New name\n",
      "Update context snapshot",
      "worlds/wychcombe/context/canon/locations/old-name.md",
    );

    expect(fetchImpl.mock.calls[3]?.[1]?.method).toBe("DELETE");
    expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body))).toMatchObject({
      sha: "old-blob",
      branch: "main",
    });
  });

  it("reports a failed previous-path cleanup after the new snapshot publishes", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: "new.md" },
        commit: { sha: "commit-new" },
      }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "old-blob" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }));
    const publisher = new ContextSnapshotGitHubPublisher({
      fetchImpl: fetchImpl as typeof fetch,
      token: "test-token",
      repository: "Transition-Trails/WorldSmith",
      branch: "main",
    });

    await expect(publisher.publish("new.md", "# New\n", "Update", "old.md"))
      .rejects.toThrow("could not remove its previous path");
  });

  it("creates and publishes to the dedicated Context Snapshot branch by default", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ object: { sha: "main-head" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ref: "refs/heads/context-snapshots" }), { status: 201 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        content: { path: "snapshot.md" },
        commit: { sha: "snapshot-commit" },
      }), { status: 201 }));
    const publisher = new ContextSnapshotGitHubPublisher({
      fetchImpl: fetchImpl as typeof fetch,
      token: "test-token",
      repository: "Transition-Trails/Daybook",
    });

    await publisher.publish("snapshot.md", "# Snapshot\n", "context: update snapshot");

    expect(fetchImpl.mock.calls[2]?.[0]).toContain("/git/refs");
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({
      ref: "refs/heads/context-snapshots",
      sha: "main-head",
    });
    expect(fetchImpl.mock.calls[3]?.[0]).toContain("ref=context-snapshots");
    expect(JSON.parse(String(fetchImpl.mock.calls[4]?.[1]?.body))).toMatchObject({
      branch: "context-snapshots",
    });
  });

  it("selects missing, failed, and stale snapshots without refreshing current ones", () => {
    const updatedAt = new Date("2026-09-18T10:00:00.000Z");
    expect(contextSnapshotIsOutdated(updatedAt, null)).toBe(true);
    expect(contextSnapshotIsOutdated(updatedAt, {
      status: "sync_failed", recordUpdatedAt: updatedAt, lastSnapshotAt: updatedAt,
    })).toBe(true);
    expect(contextSnapshotIsOutdated(updatedAt, {
      status: "current", recordUpdatedAt: new Date("2026-09-18T09:00:00.000Z"), lastSnapshotAt: updatedAt,
    })).toBe(true);
    expect(contextSnapshotIsOutdated(updatedAt, {
      status: "current", recordUpdatedAt: updatedAt, lastSnapshotAt: updatedAt,
    })).toBe(false);
  });

  it("bounds concurrent snapshot work and preserves result order", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });
    expect(peak).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it("auto-publishes accepted Canon while keeping unaccepted Canon manual by default", () => {
    expect(shouldAutoSyncContextSnapshot({ autoSync: false }, "accepted")).toBe(false);
    expect(shouldAutoSyncContextSnapshot({ autoSync: true }, "accepted")).toBe(true);
    expect(shouldAutoSyncContextSnapshot({ autoSync: true }, "proposed")).toBe(false);
    expect(shouldAutoSyncContextSnapshot({ autoSync: true }, "under_review")).toBe(false);
    expect(shouldAutoSyncContextSnapshot({ autoSync: true, autoSyncUnaccepted: true }, "under_review")).toBe(true);
    expect(shouldAutoSyncContextSnapshot({ autoSync: true }, "published")).toBe(false);
    expect(shouldAutoSyncContextSnapshot({ autoSync: true })).toBe(true);
  });
});
