# Daybook — Setup & Required Secrets

All secrets are set in **Replit Secrets** (the padlock icon in the sidebar, or Tools → Secrets). The app reads them at startup via `process.env.*`.

---

## 1. AI Provider

Powers the admin Theme Studio, Pack Studio, Edition Studio, trend research, and the in-planner user assistant (`POST /ai/complete`).

| Secret name | Required? | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Required** (to use Claude) | API key from [console.anthropic.com](https://console.anthropic.com). Claude is the default provider. |
| `OPENAI_API_KEY` | Optional | API key from [platform.openai.com](https://platform.openai.com). Needed only if a user's `aiProvider` is set to `"openai"`. |
| `GEMINI_API_KEY` | Optional | API key from [aistudio.google.com](https://aistudio.google.com). Needed only if a user's `aiProvider` is set to `"gemini"`. |
| `DEFAULT_AI_PROVIDER` | Optional | Server-wide fallback provider. Values: `claude` (default), `openai`, `gemini`. |

**What setting these unlocks:**  
Setting `ANTHROPIC_API_KEY` immediately activates the admin studios (theme/pack/edition AI drafts), the trends research view, and the AI assistant deep-links embedded in generated PDFs.

---

## 2. Google OAuth (sign-in + service sync)

Powers the "Sign in with Google" button on the admin login page. Also required later for Drive save of generated PDFs and Calendar/Tasks/Docs sync.

| Secret name | Required? | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | **Required** | OAuth 2.0 client ID from [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials. |
| `GOOGLE_CLIENT_SECRET` | **Required** | The corresponding client secret for the same OAuth client. |
| `APP_URL` | Optional | Override for the production base URL (e.g. `https://studio.daybook.app`). Used to build the OAuth callback URL and PDF deep-links. Auto-derived from `REPLIT_DEV_DOMAIN` in development if not set. |
| `GOOGLE_CALLBACK_URL` | Optional | Full override for the OAuth callback URL. Only set this if you need to override the auto-derived value (e.g. a custom domain behind a proxy). |

**These are already set** in this Replit project (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

### Registering the callback URL in Google Cloud Console

In your OAuth client, add this URI under **Authorized redirect URIs**:

```
https://<your-replit-dev-domain>/api/auth/callback
```

The exact URL the server will use is logged at startup:

```
[INFO] Google OAuth callback URL  callbackUrl: "https://…picard.replit.dev/api/auth/callback"
```

For production, also add your deployed URL: `https://studio.daybook.app/api/auth/callback`

### OAuth scopes registered on the consent screen

The sign-in flow currently requests only:

- `profile`
- `email`

These are non-sensitive scopes and work with any Google Workspace Internal app without admin approval.

> **Note:** Drive, Calendar, Tasks, and Docs scopes will be added as incremental permission requests at the point where the user connects those services (the sync stubs under `/api/calendar`, `/api/tasks`, `/api/docs`, `/api/drive`). Do **not** add them to the initial sign-in consent screen — they require Workspace admin approval and will cause the login to 403.

---

## 3. Session

| Secret name | Required? | Description |
|---|---|---|
| `SESSION_SECRET` | **Required** | Random string used to sign session cookies. Already set in Replit Secrets. Rotate it to invalidate all active sessions. |

---

## Later phase

The following are intentionally deferred. The endpoints exist and return `501 Not Implemented` or graceful stubs — no keys are needed now and nothing will break without them.

### Stripe Billing

| Secret name | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Live or test secret key from the Stripe Dashboard. Activates `POST /checkout` (creates Stripe checkout sessions). |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe Dashboard → Developers → Webhooks. Activates `POST /webhooks/stripe` signature verification. |

Register the webhook endpoint in Stripe as:
```
https://<your-domain>/api/webhooks/stripe
```

### Notion Sync

Notion sync (`GET /auth/notion`) is a stub endpoint. No environment variables are wired yet. Credential names and integration steps will be documented when that phase begins.
