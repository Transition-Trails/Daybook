ALTER TABLE "ws_stories" ADD COLUMN "sequence_role" text NOT NULL DEFAULT 'chronological';
ALTER TABLE "ws_stories" ADD CONSTRAINT "ws_stories_sequence_role_check"
  CHECK ("sequence_role" IN ('chronological', 'reference'));
ALTER TABLE "worldsmith_worlds" ADD COLUMN "story_sequence_revision" integer NOT NULL DEFAULT 0;

-- An umbrella account spans eras; leave its existing position and all other
-- stories' positions intact so the migration is non-destructive and reversible.
UPDATE "ws_stories" SET "sequence_role" = 'reference'
WHERE "world_id" = 'wychcombe' AND "title" = 'The Wychcombe Origin Story';