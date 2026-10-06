# Delivery operations refresh

This version updates dispatch, driver handoff, return tracking, and the office TV board. Push notifications and SMS are intentionally deferred.

## Before deployment

1. Back up the production database using the normal Supabase process.
2. Run `supabase/operations-v2.sql` in the existing Supabase project's SQL editor. This is additive and rerunnable. It does not reset the database or reopen historical deliveries.
3. Run `npm ci`, `npm test`, and `npm run build` from this directory.
4. Deploy the frontend only after the migration succeeds. Keep the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configuration. No new secrets are required.
5. Use a payroll-excluded test delivery to check the flows below on an actual driver phone and the office TV before switching staff over.

Do not rerun `supabase/setup.sql` as a replacement for the new migration. The live project already contains columns and operational data from previous updates.

## Behavior

- Jess publishes a draft with **Make delivery live**. This exposes the job in the driver app; it does not send a notification or claim one was sent.
- Drivers select their name, which is remembered on their device. All / Unassigned views are read-only in the interface. The existing shared account remains; selected names are self-reported attribution, not independently authenticated identities.
- Actions follow Assigned → At dealer → En route → Customer handoff. Admin status corrections require a reason.
- The customer handoff retains existing signature, condition, photo, and photo-exception requirements. COD must be collected or have a written exception. An exception remains outstanding for dispatch; it is not treated as money collected.
- A delivery stays in the archive and payroll after handoff while unfinished COD, trade, and paperwork tasks remain accessible in the driver app and dispatch closeout queue.
- Drivers confirm UPS handover, return to dealer (optional recipient), or handover to Jess / office. No tracking number or receipt upload is required. Office handover transfers the remaining paperwork task to Jess; it does not mark the final return complete.
- Admin marks genuinely electronic deals **No original paperwork to return** in the delivery form. Selecting the e-contract photo exception does not automatically waive the return of other original documents.
- The database trigger recomputes closeout from current row values, so independent COD / trade / paperwork updates cannot prematurely close a run. Historic records keep their existing closed state.
- TV board retains daily, weekly, monthly, map, and fullscreen views. Four large cards per page rotate every 15 seconds. Data refreshes every 30 seconds, with last successful update and stale/error states. Pending closeout is included across date ranges so old unfinished returns stay visible.
- The driver app and dispatch refresh every 30 seconds and on window focus. GPS still depends on browser permissions and active-page behavior. The display reports sharing errors rather than implying background tracking is guaranteed.
- Contact dispatch uses `tel:+17325470333` (Jess). There is no Call Dealer action. Navigation uses full dealer addresses entered by admin.

## Validation

- Production build.
- Offline component integration test: Jess call link, no dealer call, COD requirement, failed-save draft retention, and successful handoff payload.
- In-memory PostgreSQL migration tests: repeat application, untouched historical records, sequential UPS / trade / COD returns, office ownership, reopening when an obligation becomes outstanding, and preserved delivery-based pay.
- Eastern date boundaries around midnight and daylight saving time.

Actual Supabase permissions, phone photo uploads and GPS, dialer behavior, and TV fullscreen need device/staging checks. No live data was changed during implementation.

## Rollback

Restore the previous frontend deployment if needed. Leave additive columns and return data in place; do not drop them during a rollback. Avoid using the old frontend to complete new runs during rollback because it does not expose outstanding return tasks.
