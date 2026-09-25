import { createHash } from "node:crypto";
import { pool } from "@workspace/db";

const ADDRESS_LIMIT = 30;
const GLOBAL_LIMIT = 1_000;

type Queryable = Pick<typeof pool, "connect">;

/**
 * Each registration attempt consumes both the site-wide and address budget.
 * PostgreSQL's ON CONFLICT update serializes concurrent increments across API
 * processes. A denied attempt never creates a client record.
 */
export function createRegistrationLimiter(database: Queryable = pool) {
  return async (address: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      // The site-wide cap bounds distinct-address rows to 1000 per hour.
      // Keep only this and the previous hour, even after a process restart.
      await client.query(
        `DELETE FROM mcp_oauth_registration_limits
         WHERE window_started_at < date_trunc('hour', now()) - interval '1 hour'`,
      );
      const addressKey = createHash("sha256").update(address).digest("hex");
      for (const [scope, key, limit] of [
        ["global", "registration", GLOBAL_LIMIT],
        ["address", addressKey, ADDRESS_LIMIT],
      ] as const) {
        const result = await client.query(
          `INSERT INTO mcp_oauth_registration_limits (scope, subject_key, window_started_at, attempts)
           VALUES ($1, $2, date_trunc('hour', now()), 1)
           ON CONFLICT (scope, subject_key, window_started_at)
           DO UPDATE SET attempts = mcp_oauth_registration_limits.attempts + 1
             WHERE mcp_oauth_registration_limits.attempts < $3
           RETURNING attempts`,
          [scope, key, limit],
        );
        if (result.rowCount === 0) {
          if (scope === "address") {
            // A single noisy address must not consume the shared budget on
            // attempts that can no longer create clients.
            await client.query(
              `UPDATE mcp_oauth_registration_limits SET attempts = attempts - 1
               WHERE scope = 'global' AND subject_key = 'registration'
                 AND window_started_at = date_trunc('hour', now())`,
            );
          }
          const retry = await client.query<{ retry_after: number }>(
            `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM
              (date_trunc('hour', now()) + interval '1 hour' - now()))))::integer AS retry_after`,
          );
          await client.query("COMMIT");
          return { allowed: false, retryAfter: retry.rows[0].retry_after };
        }
      }
      await client.query("COMMIT");
      return { allowed: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

export const limitMcpRegistration = createRegistrationLimiter();