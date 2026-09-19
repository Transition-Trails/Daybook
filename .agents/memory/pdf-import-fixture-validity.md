---
name: PDF import fixture validity
description: Distinguishes planner import defects from malformed PDF test fixtures that parse but render blank.
---

PDF import tests that draw text must embed a real font resource. A raw content stream that references a missing or non-dictionary font can still expose valid page counts and dimensions while rendering as a blank page.

**Why:** A three-page fixture passed structural analysis but every renderer produced white pages. Poppler identified the real issue as an unknown font tag and invalid font resource; a standards-compliant control PDF rendered correctly.

**How to apply:** Generate fixtures with a PDF library and explicitly embed the font before drawing text. When thumbnails are blank, inspect the exact uploaded source with `pdffonts` and `pdftotext` before changing product rendering code.