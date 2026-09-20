-- Repair databases that applied the initial Field Architecture migration
-- before the final structured metadata columns and indexes were added.
ALTER TABLE ws_visual_identity_locks
  ADD COLUMN IF NOT EXISTS applies_to_life_stages jsonb NOT NULL DEFAULT '[]';

ALTER TABLE ws_knowledge_entries
  ADD COLUMN IF NOT EXISTS applicable_life_stage text;
ALTER TABLE ws_knowledge_entries
  ADD COLUMN IF NOT EXISTS applicable_era text;

ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS directionality text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS emotional_valence text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS power_balance text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS public_visibility text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS dependency jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS primary_tension jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS story_function jsonb NOT NULL DEFAULT '[]';
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS unspoken_truth text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS change_over_time text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS boundaries text;
ALTER TABLE ws_canon_relationships
  ADD COLUMN IF NOT EXISTS key_scenes text;

ALTER TABLE ws_assets
  ADD COLUMN IF NOT EXISTS source_credit text;

ALTER TABLE ws_story_scene_details
  ADD COLUMN IF NOT EXISTS story_id text;
ALTER TABLE ws_story_scene_details
  ADD COLUMN IF NOT EXISTS world_id text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS ws_vocabularies_key_scope_unique
  ON ws_vocabularies(key, scope, world_id);
CREATE UNIQUE INDEX IF NOT EXISTS ws_vocab_options_key_scope_unique
  ON ws_vocabulary_options(vocabulary_id, key, world_id);
CREATE INDEX IF NOT EXISTS ws_scene_details_world_idx
  ON ws_story_scene_details(world_id);
CREATE INDEX IF NOT EXISTS ws_scene_details_story_idx
  ON ws_story_scene_details(story_id);