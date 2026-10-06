# Driver push notifications

## Driver setup
On iPhone, open the live app in Safari, Share → Add to Home Screen (Open as Web App enabled), then launch its icon and sign in. Select the phone's driver under Alerts on this phone, tap Enable alerts and allow notifications. Send a test alert, close the app, and confirm it arrives. Driver filtering does not change the phone assignment. Turn off / change driver before rebinding a phone. Admins can test from Drivers or open /driver.

No separate driver accounts or SMS provider are required. Shared-account driver names remain self-reported; a phone token isolates registrations, but does not turn the shared account into independent authenticated driver identities.

## Dispatch
Make delivery live saves the delivery and queues one job per distinct assigned driver in the same database transaction. Drafts generate no alerts. Duplicate publish clicks do not enqueue duplicates. Changing assigned drivers on a live delivery creates a new revision and cancels old pending acknowledgments. The push contains no customer contact, address or payment data; tapping opens the assigned delivery after sign-in. Got it is recorded against the phone's fixed driver assignment.

Dispatch shows queued, sending, push accepted, no phone enabled, send failed and acknowledged states. Accepted means the push service accepted the message; it does not prove phone display or reading. Unacknowledged alerts older than ten minutes are flagged for follow-up. There is no automatic SMS or repeat nag after an accepted push. A driver can acknowledge directly in the app without tapping the notification.

## Backend
- Migrations: driver_push_alerts and driver_push_scheduler.
- Edge function: driver-push, with explicit getUser authentication and server-side profile checks. Gateway JWT verification is disabled only because a separate Vault-backed worker secret authenticates scheduled requests. Worker credentials only permit draining the queue and a non-sending encryption self-check.
- Fresh VAPID pair and worker token in Supabase Vault; Claude's embedded private key is not used. No private keys in Git, frontend, or logs.
- Devices and jobs use RLS with no browser policies and revoked anon/authenticated grants intentionally: all access goes through the server, with device possession tokens and owner checks. Both scheduler and immediate admin invocation claim jobs atomically to avoid ordinary duplicate sends. A crash after provider acceptance can cause a retry; a stable notification tag replaces duplicate displays.
- Scheduler runs every minute but only calls the sender when jobs are due. Up to three attempts; no-device and exhausted failures need setup or dispatch retry. New phone enrollment requeues no-device jobs from the previous 24 hours.
- Expired push endpoints are disabled. Subscription endpoints are restricted to supported push providers. Test alerts are throttled per phone.
- Service worker has no fetch/offline cache. No GPS/location sharing has been reintroduced.

## Verification
Six automated tests cover handoff regressions, queue routing/deduplication/reassignment/access restrictions and safe deep links. Frontend production build passes. The deployed endpoint rejects unauthenticated requests; Vault access and phone table access are denied to browser roles. Scheduled worker and encrypted-payload self-check are verified separately. Local Deno type check is blocked by package-registry connectivity; Supabase deployment resolves the pinned packages.

An actual iPhone test is still required to verify permission, lock-screen delivery, notification tap, and acknowledgment across two phones. Focus settings and OS notification settings can suppress visible alerts.

## Existing advisor findings
Pre-existing functions and password settings have unrelated advisor warnings; this change does not alter them. New push tables deliberately produce an informational RLS/no-policy notice because access is server-only: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Rollback
Restore the prior frontend and unschedule only lfg-delivery-push if disabling the feature. Keep subscriptions, keys, and history intact. Do not run a general database reset.
