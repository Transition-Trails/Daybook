---
name: Storefront showcase commerce
description: The storefront commerce boundary and planner delivery promise.
---

Only paid downloadable planner editions use the checkout path. Themes and sticker packs are browse-only showcases and must not display prices unless a supported checkout path is deliberately added for them.

**Why:** The server checkout resolver supports editions and rejects themes and sticker packs. Showing prices on non-purchasable cards creates a broken commerce promise.

**How to apply:** Keep the public storefront focused on choosing and downloading a planner. Treat Google Drive as an optional extra copy, never the only delivery path or a prerequisite for successful planner generation.