---
name: Admin test session flush
description: Why admin login responses must wait for the session store before browser navigation.
---

Admin password and development test-login routes must not respond until Passport's session has been explicitly saved.

**Why:** Hosted browser verification can navigate or reload immediately after login. Relying on the response-end save races the PostgreSQL session store, causing an apparently successful login to fall back to the unauthorized screen.

**How to apply:** After `req.login` succeeds, call `req.session.save` and send the success response only from its callback. Treat a save failure as a login failure. Verify with both a cookie-preserving HTTP agent and a real browser reload.