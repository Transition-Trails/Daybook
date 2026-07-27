#!/usr/bin/env node
// One-shot migration: creates the three email-layer tables.
// Run from repo root: node lib/db/migrate-email.mjs
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS store_email_config (
        store_id          TEXT PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
        from_display_name TEXT,
        from_domain       TEXT,
        from_local_part   TEXT,
        domain_status     TEXT NOT NULL DEFAULT 'not_started',
        resend_domain_id  TEXT,
        dns_records       JSONB,
        dkim_verified_at  TIMESTAMPTZ,
        spf_verified_at   TIMESTAMPTZ,
        last_verify_check_at TIMESTAMPTZ,
        last_verify_error TEXT,
        tier1_suspended   BOOLEAN NOT NULL DEFAULT false,
        suspended_reason  TEXT,
        monthly_volume    INTEGER NOT NULL DEFAULT 0,
        bounce_count      INTEGER NOT NULL DEFAULT 0,
        complaint_count   INTEGER NOT NULL DEFAULT 0,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_log (
        id                  SERIAL PRIMARY KEY,
        idempotency_key     TEXT UNIQUE,
        store_id            TEXT REFERENCES stores(id) ON DELETE SET NULL,
        recipient_email     TEXT NOT NULL,
        template            TEXT NOT NULL,
        tier                TEXT NOT NULL DEFAULT 'platform',
        from_address        TEXT NOT NULL,
        subject             TEXT NOT NULL,
        provider_message_id TEXT,
        status              TEXT NOT NULL DEFAULT 'queued',
        status_updated_at   TIMESTAMPTZ,
        error_message       TEXT,
        sent_at             TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_log_store_created ON email_log(store_id, created_at DESC)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_auto_response_dedupe (
        id           SERIAL PRIMARY KEY,
        thread_ref   TEXT NOT NULL,
        sender_email TEXT NOT NULL,
        sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_email_ar_ref ON email_auto_response_dedupe(thread_ref, sender_email, sent_at DESC)`);

    await client.query("COMMIT");
    console.log("✓ email tables created");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
