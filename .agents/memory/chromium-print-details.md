---
name: Chromium printing of HTML details
description: Closed details elements can drop reference material from Chromium-generated PDF exports.
---

When printing a self-contained HTML reference to PDF with headless Chromium, explicitly open every `<details>` element whose body must appear in the PDF. Do not rely on print CSS alone to reveal collapsed content.

**Why:** A Canon field guide's schema appendix was present in its HTML source but missing from PDF text extraction until the `<details>` elements had `open`.

**How to apply:** Check the generated PDF text for representative content inside expandable sections before presenting the file.