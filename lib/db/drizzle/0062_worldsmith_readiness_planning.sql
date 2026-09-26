CREATE TABLE "ws_readiness_assignments" (
  "world_id" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "lane" text NOT NULL DEFAULT 'backlog',
  "revision" integer NOT NULL DEFAULT 1,
  "updated_by" text,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ws_readiness_assignments_pk" PRIMARY KEY ("entity_type", "entity_id"),
  CONSTRAINT "ws_readiness_assignments_lane_check" CHECK ("lane" IN ('backlog', 'in_progress', 'review', 'ready')),
  CONSTRAINT "ws_readiness_assignments_entity_type_check" CHECK ("entity_type" IN ('canon_record', 'storyline', 'beat'))
);
CREATE INDEX "ws_readiness_assignments_world_idx" ON "ws_readiness_assignments" ("world_id", "entity_type");