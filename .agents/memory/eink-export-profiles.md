---
name: E-ink device export profiles
description: Authority, cache, enforcement, and poor-link risk rules for E-ink exports.
---

## Authority and cache

E-ink device presets and enforcement rules are operator-managed database records. The synchronous render pipeline reads an in-process cache, but generation, preview, and platform-risk queries must refresh it from shared storage first. A successful empty database result is authoritative; bundled defaults are only a startup/query-failure fallback.

**Why:** Render helpers are synchronous, while operators expect saved changes to affect the next export on every API instance. Treating an empty table as “use defaults” would resurrect deliberately deleted profiles.

**How to apply:** Any new render/check/report entry point that consumes E-ink configuration must refresh before calling synchronous helpers. Mutations should also update the local cache immediately.

## Editable enforcement

Every editable enforcement value must change output or checking behavior: grayscale controls colour flattening, contrast and file weight gate completed files, line weight changes drawn strokes, and toolbar margin sets the minimum authored-content inset together with the device safe inset.

**Why:** An operator-facing threshold that is persisted but ignored creates false confidence and misleading compliance claims.

**How to apply:** When adding a rule, wire enabled state and threshold into both legacy and authored rendering where relevant, and keep preview behavior aligned with final export.

## Poor-link risk

Poor-link profiles suppress URI annotations in generated PDFs. A live listing is risky when its poor-link device is paired with any URI-producing option, including direct calendar links, calendar overlays, or AI links. The E-ink page and platform decision queue must consume the same risk result.

**Why:** Separate predicates drift and let misleading listings disappear from one operator surface.

**How to apply:** Normalize device keys before lookup, extend the shared predicate whenever a new URI-producing feature is added, and cover suppression with real-PDF annotation tests.