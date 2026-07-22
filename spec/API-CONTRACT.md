REST/JSON, auth via session cookie or Bearer.
AUTH: GET /auth/google (scopes Drive, Calendar, Tasks, Docs); GET /auth/notion (later, stub); GET /auth/callback; POST /auth/logout; GET /me (User + connections + plan). Admin routes require role staff/owner.
CATALOG (admin write, public reads only status=live): for each of themes, packs, inserts, products, editions — GET /{entity}, GET /{entity}/{id}, POST /{entity}, PATCH /{entity}/{id} (e.g. {status:'live'} to publish), DELETE /{entity}/{id} (soft-delete). Edition attach/detach = PATCH its themes|packs|inserts|products id arrays.
PLANNER: POST /planners (body PlannerConfig -> renders PDF per link scheme, writes to Drive, returns {id,drive:{pdfFileId,configFileId}}); GET /planners/{id}; POST /planners/{id}/reexport (partial style/output; setup fields locked).
GOOGLE SYNC: GET /calendar/events?start&end; POST /calendar/push; GET+POST /tasks (two-way); POST /docs (note/brain-dump -> Google Doc in Drive/Daybook); GET /drive/status; POST /drive/backup; POST /drive/art (upload or Canva import -> Asset).
AI PROXY: POST /ai/complete {system,messages,provider} -> {text}; routes to Claude/ChatGPT/Gemini per user's aiProvider, honors aiEnabled; server holds keys. Used by user assistant + admin studios + trend research.
BILLING: POST /checkout {plan} -> Stripe session; POST /webhooks/stripe grants owned ids / sets plan.
REALTIME (optional): GET /events (SSE) sync-status + edited-since badges.
