-- Repair scene-detail ownership for databases that already applied 0052.
-- Resolve through the canonical scene -> act -> story chain, never an empty
-- placeholder world. Orphaned rows are retained only when a valid scene exists.
UPDATE ws_story_scene_details d
SET story_id = s.story_id, world_id = s.world_id
FROM ws_scenes s
WHERE s.id = d.scene_id
  AND (d.story_id IS NULL OR d.world_id IS NULL OR d.world_id = '');

UPDATE ws_story_scene_details d
SET story_id = a.story_id, world_id = a.world_id
FROM ws_scenes s
JOIN ws_story_acts a ON a.id = s.act_id
WHERE s.id = d.scene_id
  AND (d.story_id IS NULL OR d.world_id IS NULL OR d.world_id = '');

UPDATE ws_story_scene_details d
SET world_id = st.world_id
FROM ws_stories st
WHERE st.id = d.story_id
  AND (d.world_id IS NULL OR d.world_id = '');

DELETE FROM ws_story_scene_details
WHERE world_id IS NULL OR world_id = '';