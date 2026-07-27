---
name: Transactional email layer
description: Resend-backed email system with tier-1 (platform domain) and tier-2 (store custom domain), idempotent send, rate limiting, and webhook delivery tracking.
---

## Provider
Resend (`resend` + `svix` packages in api-server). Adapter interface in `lib/email/adapter.ts`; swap providers by replacing `resend-adapter.ts`.

## Key env vars
- `RESEND_API_KEY` — secret
- `RESEND_WEBHOOK_SECRET` — secret (svix signing key from Resend dashboard)
- `EMAIL_FROM_DOMAIN` — verified sending domain (e.g. `mail.daybook.app`); placeholder `notifications.example.com` until set
- `EMAIL_PLATFORM_NAME` — display name in tier-1 From header (default `Daybook`)
- `EMAIL_TIER1_DAILY_LIMIT` — per-store daily cap (default 200)
- `EMAIL_TIER1_MONTHLY_UPGRADE_THRESHOLD` — volume that triggers upgrade prompt (default 1000)
- `PLATFORM_ADMIN_EMAIL` — optional; receives new-ticket-platform notifications

## DB tables (created by `node lib/db/migrate-email.mjs`)
- `store_email_config` — per-store email settings; domain status enum: `not_started | pending | verified | failed`; resend_domain_id for Resend domains API; bounce/complaint counters; tier1_suspended flag
- `email_log` — every send attempt; idempotency_key UNIQUE prevents double-send; provider_message_id linked to webhook updates
- `email_auto_response_dedupe` — 24-hour dedup for no-reply auto-responses

## Architecture
- `lib/email/index.ts` — adapter selector (Resend when key present, null adapter otherwise)
- `lib/email/identity.ts` — `resolveEmailIdentity(storeId, storeName)` returns `{ from, replyTo, tier }`; tier-2 when domain_status=verified, else tier-1
- `lib/email/send.ts` — `sendEmail()` with idempotency check, rate limit, log row, adapter call, status update
- `lib/email/rate-limit.ts` — in-memory daily counter + DB suspension check
- `lib/email/domain-verify.ts` — wraps Resend domains API (`registerDomain`, `verifyDomain`, `getDomainStatus`, `deleteDomain`)
- `lib/email/senders.ts` — event functions called fire-and-forget from routes: `onTicketCreated`, `onTicketReplied`, `onTicketClosed`, `sendOrderReceipt`, `sendAutoResponse`
- `lib/email/templates/` — `layout.ts` (base HTML + text), `support.ts`, `order.ts`, `auto-response.ts`

## API routes
- `GET/PUT /store/:storeId/email-settings` — read/update display name
- `POST /store/:storeId/email-settings/domain` — register domain with Resend, store DNS records
- `POST /store/:storeId/email-settings/domain/verify` — trigger DNS check
- `DELETE /store/:storeId/email-settings/domain` — remove custom domain
- `GET /super/email/deliverability` — per-store send/bounce/complaint table
- `POST /super/email/stores/:storeId/unsuspend` — lift suspension
- `POST /api/webhooks/resend` — delivery events (bounce, complaint, delivered); auto-suspends on 10% bounce / 0.5% complaint rate
- `POST /api/webhooks/inbound-email` — auto-response trigger (needs external MX inbound routing pointed here)

## Webhook raw body
The Resend webhook is mounted with `express.raw()` in `app.ts` BEFORE `express.json()` (same pattern as Stripe webhook). svix verifies the signature via `RESEND_WEBHOOK_SECRET`.

## Admin pages
- `/store/:storeId/email-settings` — `EmailSettings.tsx`; DNS checklist table; verify button; status badges; fallback explanation
- `/super/email/deliverability` — `Deliverability.tsx`; per-store table; auto-suspend alerts; unsuspend button

## Hook points in support.ts
- After `POST /support/tickets` returns → `onTicketCreated()`
- After `POST /support/tickets/:id/replies` returns → `onTicketReplied()`
- When `PATCH /support/tickets/:id/status` sets status=closed → `onTicketClosed()`

## Resend SDK quirks
- `domains.verify()`, `domains.get()`, `domains.remove()` take a plain string ID, NOT `{ id: string }` — the object form throws a TS type error
- `emails.send()` uses `replyTo` (camelCase), not `reply_to`

**Why separate file for PLATFORM_ADMIN_EMAIL:**
No list of super-admin emails exists in DB; a single env var is the simplest safe approach. If multi-admin notify is needed later, query users WHERE platform_role='super_admin'.
