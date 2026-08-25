# Google reconnect verification

This is a controlled provider-level check for the Google OAuth lifecycle. Run it
only against a non-production Daybook deployment and a dedicated Google account
whose Drive and Calendar data can be safely changed. Do not use a personal or
production account.

The check complements the automated lifecycle tests:

```bash
pnpm --filter @workspace/api-server run test -- src/test/google-auth.test.ts src/test/google-sync-races.test.ts
```

Those tests prove the fencing and temporary-outage behavior with deterministic
provider responses. This runbook proves that Google's real consent and revoke
flows issue a usable grant for both existing sync surfaces.

## One-time setup

1. Create a dedicated Google test account and a separate non-production Daybook
   deployment.
2. In the Google Cloud OAuth client used by that deployment, enable:
   - Google Drive API
   - Google Calendar API
   - Google Tasks API (the OAuth flow requests it even though this check does
     not exercise Tasks)
3. Register the deployment callback URL:
   `https://<non-production-domain>/api/auth/callback`.
4. Confirm the deployment has `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   its normal session/database configuration. Never paste any secret or token
   into this checklist, a ticket, or a log.
5. Prepare one disposable planner/config ID for the test. The Drive backup
   endpoint stores the supplied config JSON; use test data only.

## Baseline and initial consent

Use the Daybook admin **Google Sync** page in a browser signed in as the
dedicated account.

1. If the page is disconnected, select **Connect Google** and complete consent.
   The OAuth flow uses offline access and explicitly asks for consent so a
   refresh grant is available.
2. Confirm the page reports **Connected** and record the following sanitized
   baseline values from the browser's same-origin console. The response contains
   no access or refresh token fields:

   ```js
   const before = await (await fetch("/api/me")).json();
   const beforeStatus = await (await fetch("/api/sync/status")).json();
   console.table({
     connections: JSON.stringify(before.connections),
     driveFolder: beforeStatus.driveFolder,
     connected: beforeStatus.connected,
     retrying: beforeStatus.retrying,
   });
   ```

   Save the `connections` object only in the non-production test notes. The
   values outside `googleDrive`, `googleCalendar`, `googleTasks`,
   `googleDocs`, and the `*LastSynced` timestamps are the non-Google metadata
   that must survive reconnect.
3. Click **Push Event** and create one disposable all-day event. Confirm the
   success toast and that the event appears in the dedicated account's primary
   Calendar.
4. Click **Backup Now** and confirm the success toast. Confirm a
   `daybook-config-<planner-id>.json` file appears in the account's root-level
   `Daybook` folder.

## Revoke and verify the reconnect state

1. In the dedicated Google account, open **Google Account → Security → Your
   connections to third-party apps**, select the non-production Daybook OAuth
   app, and remove its access. If the account presents a separate consent
   screen, remove the app there as well.
2. Return to Daybook and force a sync action (for example, **Push Event**).
   The response must be HTTP 401 with:

   ```json
   {
     "error": "reconnect_required",
     "reason": "disconnected",
     "reconnectUrl": "/api/auth/google"
   }
   ```

   The UI must show the reconnect banner and must not continue retrying the
   revoked grant.
3. Refresh the Google Sync page. It must show **Disconnected**, a reconnect
   action, and no successful Drive or Calendar operation.
4. A temporary outage is not a revoke. The automated status test covers a
   simulated HTTP 503: the status remains HTTP 200 with
   `connected: true`, `retrying: true`, and `reconnectUrl: null`. If a
   provider/network incident occurs during this manual check, record it as an
   outage and retry later; do not mark the account revoked based on that
   incident.

## Re-consent and prove both sync paths

1. Select the reconnect action and complete Google consent again with the same
   dedicated account. Do not create a second Daybook user.
2. Confirm the page returns to **Connected**. Run:

   ```js
   const after = await (await fetch("/api/me")).json();
   const afterStatus = await (await fetch("/api/sync/status")).json();
   console.table({
     connections: JSON.stringify(after.connections),
     driveFolder: afterStatus.driveFolder,
     connected: afterStatus.connected,
     retrying: afterStatus.retrying,
   });
   ```

   Compare `after.connections` with the baseline. The four Google feature flags
   should be `true`; existing non-Google keys and values must be unchanged.
   The prior `driveFolder` should be reused when it was already present.
3. Push a second disposable Calendar event. Confirm the UI succeeds and the
   event appears in the dedicated account's primary Calendar.
4. Run a second Drive backup. Confirm the UI succeeds and a new
   `daybook-config-<planner-id>.json` file appears in the existing Daybook
   folder.
5. Re-fetch `/api/sync/status`. Confirm `connected: true`, `retrying: false`,
   and non-null `calendarLastSynced` and `driveLastSynced`.
6. Record pass/fail, deployment URL, UTC timestamp, account alias (not an
   email address), and the sanitized before/after connection metadata. Never
   record OAuth authorization codes, access tokens, refresh tokens, cookies, or
   secret values.

## Acceptance criteria

- Consent can be revoked and the app presents `reconnect_required` rather than
  silently retrying a terminal grant.
- Temporary Google failures preserve the connected state and do not show the
  reconnect UI.
- Re-consent clears the disconnected state and restores all Google feature
  flags.
- A post-reconnect Drive backup and Calendar push both succeed against Google.
- The same user record retains its existing non-Google connection metadata and
  previously resolved Drive folder.