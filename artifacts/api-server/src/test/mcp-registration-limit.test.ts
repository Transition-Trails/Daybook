import { describe, expect, it } from "vitest";
import { createRegistrationLimiter } from "../lib/mcp-registration-limit";

// Two independent "processes" share this fake PostgreSQL store. BEGIN takes a
// lock so concurrent requests exercise the atomic admission contract.
function sharedDatabase() {
  let hour = 0;
  let secondsIntoHour = 0;
  const rows = new Map<string, { hour: number; attempts: number }>();
  let queue = Promise.resolve();
  const connect = async () => {
    let unlock: () => void = () => {};
    return ({
    query: async (sql: string, params?: readonly unknown[]) => {
      if (sql === "BEGIN") {
        const previous = queue;
        queue = new Promise<void>((resolve) => { unlock = resolve; });
        await previous;
        return { rowCount: 0, rows: [] };
      }
      if (sql === "COMMIT" || sql === "ROLLBACK") {
        unlock();
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("DELETE FROM mcp_oauth_registration_limits")) {
        for (const [key, row] of rows) if (row.hour < hour - 1) rows.delete(key);
        return { rowCount: 0, rows: [] };
      }
      if (sql.startsWith("UPDATE mcp_oauth_registration_limits")) {
        rows.get("global:registration")!.attempts--;
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith("SELECT GREATEST")) {
        return { rowCount: 1, rows: [{ retry_after: 3600 - secondsIntoHour }] };
      }
      if (sql.startsWith("INSERT INTO mcp_oauth_registration_limits")) {
        const [scope, subject, limit] = params as [string, string, number];
        const key = `${scope}:${subject}`;
        const existing = rows.get(key);
        if (existing?.hour === hour && existing.attempts >= limit) return { rowCount: 0, rows: [] };
        rows.set(key, { hour, attempts: existing?.hour === hour ? existing.attempts + 1 : 1 });
        return { rowCount: 1, rows: [{ attempts: rows.get(key)!.attempts }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release: () => {},
  });
  };
  return {
    pool: { connect } as unknown as Parameters<typeof createRegistrationLimiter>[0],
    rows,
    nextHour: () => { hour++; },
    setSecondsIntoHour: (seconds: number) => { secondsIntoHour = seconds; },
  };
}

describe("shared MCP registration admission", () => {
  it("enforces the 30-per-address limit across concurrent instances and fresh limiter construction", async () => {
    const shared = sharedDatabase();
    const instanceA = createRegistrationLimiter(shared.pool);
    const instanceB = createRegistrationLimiter(shared.pool);
    const admitted = await Promise.all(
      Array.from({ length: 40 }, (_, i) => (i % 2 ? instanceA : instanceB)("192.0.2.1")),
    );
    expect(admitted.filter((result) => result.allowed)).toHaveLength(30);
    shared.setSecondsIntoHour(600);
    const restarted = createRegistrationLimiter(shared.pool);
    expect(await restarted("192.0.2.1")).toEqual({ allowed: false, retryAfter: 3000 });
    expect(shared.rows.get("global:registration")?.attempts).toBe(30);
    shared.nextHour();
    expect(await restarted("192.0.2.1")).toEqual({ allowed: true });
    shared.nextHour();
    expect(await restarted("192.0.2.2")).toEqual({ allowed: true });
    expect([...shared.rows.values()].every((row) => row.hour >= 1)).toBe(true);
  });

  it("bounds registration by a shared global budget even with rotating addresses", async () => {
    const shared = sharedDatabase();
    const first = createRegistrationLimiter(shared.pool);
    const second = createRegistrationLimiter(shared.pool);
    for (let i = 0; i < 1000; i++) {
      expect((await (i % 2 ? first : second)(`198.51.100.${i}`)).allowed).toBe(true);
    }
    expect(await second("203.0.113.9")).toEqual({ allowed: false, retryAfter: 3600 });
    expect(shared.rows.size).toBe(1001); // 1000 address buckets + global
    shared.nextHour();
    expect(await first("203.0.113.9")).toEqual({ allowed: true });
    shared.nextHour();
    expect(await second("203.0.113.9")).toEqual({ allowed: true });
    expect(shared.rows.size).toBe(2); // expired buckets removed
  });
});