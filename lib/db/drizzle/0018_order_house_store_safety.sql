/* Ensure a fresh install has the platform seller required by billing orders. */
INSERT INTO "users" (
  "id", "provider", "email", "name", "role", "owned", "ai_enabled",
  "ai_provider", "connections"
)
VALUES (
  'user-platform-system', 'system', 'platform-system@daybook.invalid',
  'Daybook Platform', 'owner', '[]'::jsonb, false, 'claude',
  '{"googleDrive":false,"googleCalendar":false,"googleTasks":false,"googleDocs":false,"notion":false}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "stores" (
  "id", "name", "slug", "owner_user_id", "plan", "status",
  "default_mode", "subscription_active"
)
VALUES (
  'store-house', 'Daybook Platform', 'daybook-platform', 'user-platform-system',
  'pro', 'active', 'curated', true
)
ON CONFLICT ("id") DO NOTHING;