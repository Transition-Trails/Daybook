---
name: Authored planner interiors
description: Durable rules for versioned SVG planner interior assets and their rendered exports.
---

Authored planner interiors are immutable once versioned, and editions pin a specific version rather than an editable interior. The SVG is the rendering source of truth; the page manifest only supplies trim and deterministic sequencing.

**Why:** A product already sold or previewed must reproduce identically. Permitting SVG constructs that the PDF renderer silently ignores makes an approved interior visibly differ in export.

**How to apply:** Create a new version for any interior change. Keep the SVG validator fail-closed: accept only attributes, paints, and primitives the vector renderer faithfully implements, including embedded authored fonts and equivalent link geometry. Route any pinned edition through the authored renderer for both preview and generation; retain the legacy generator only for unpinned editions. Normalize generic ink-friendly and device options before either path so custom interiors produce the same B&W/device asset policy as legacy planners.

The shared SVG sanitizer is also the only sanitization boundary for Studio-generated inserts and widgets. Keep it in use across SVG consumers instead of maintaining route-local regex sanitizers.

**Why:** Divergent sanitizers create inconsistent external-resource and executable-markup protections between assets that can later be reused in planner products.

**How to apply:** Strengthen or test `sanitizeSvg` centrally whenever SVG safety rules change, and keep persisted authored assets under the stricter fail-closed validator.