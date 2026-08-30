---
name: WorldSmith final-art source boundary
description: Durable isolation and identity rules for local and Notion-backed final-art generation.
---

Treat `production_spec_id` as an explicitly local request and `notion_production_spec_id` as an explicitly Notion-backed request. A local record may already carry a Notion page ID after publishing; that link must never switch its compile, validation, generation, storage, or status-write behavior to Notion.

**Why:** Inferring source from a stored Notion link can make a locally initiated final-art request write status or artwork to Notion. Environment-wide resolver flags are also too broad when both identifier types share one endpoint.

**How to apply:** Select the inheritance resolver and every external write boundary from the submitted identifier type. Local final art stays in protected App Storage. Identical requests reuse one package; explicit regeneration gets a separate package identity so a failed retry cannot replace the last successful artwork.