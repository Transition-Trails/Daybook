import connectPgSimple from "connect-pg-simple";
import session from "express-session";
import { pool } from "@workspace/db";

const PgStore = connectPgSimple(session);

export const SESSION_TABLE_NAME = "daybook_sessions";
export const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_PRUNE_INTERVAL_SECONDS = 15 * 60;

export type SessionStoreOptions = {
  tableName?: string;
  createTableIfMissing?: boolean;
  pruneSessionInterval?: false | number;
};

/**
 * Build a PostgreSQL-backed session store.
 *
 * The table is created by the tracked database migration rather than lazily by
 * each API instance. That avoids a startup race when multiple instances come
 * online at the same time.
 */
export function createSessionStore(options: SessionStoreOptions = {}) {
  return new PgStore({
    pool,
    tableName: SESSION_TABLE_NAME,
    createTableIfMissing: false,
    pruneSessionInterval: SESSION_PRUNE_INTERVAL_SECONDS,
    ...options,
  });
}