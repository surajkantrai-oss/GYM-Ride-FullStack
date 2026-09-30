# GymOS Phase 6 — Analytics and reminders

## Scope and analytics

Phase 6 adds deterministic, gym-scoped operational analytics and controlled direct-member reminders. It does not change customer-mobile GYMRide notifications, introduce AI advice, or claim live WhatsApp/SMS/email delivery.

`GymOsAnalyticsService` calculates all metrics server-side. Partner and Admin clients consume aggregates rather than downloading ledgers. Every Partner query applies resource authorization and the `REPORTS` entitlement. Money uses integer minor units.

Every analytics endpoint uses `GymOsAnalyticsRangeResolver` and supports `TODAY`, `LAST_7_DAYS`, `LAST_30_DAYS`, `THIS_MONTH`, `LAST_MONTH`, and `CUSTOM`. Custom periods are inclusive local dates, limited to 366 days, and converted to an exclusive UTC end instant using the first configured branch timezone (falling back to `Asia/Kolkata`). This handles month/year boundaries and daylight-saving transitions without fixed-offset arithmetic.

The overview reports member and membership states; daily, weekday, and hourly attendance; busiest periods; unique visitors; frequency buckets; expiry and renewal cohorts; recorded collections; derived outstanding/overdue dues; payment-method totals; branch comparisons; and bounded inactivity segments. Outstanding is always charge snapshot minus allocations from `RECORDED` payments. Renewal rate is linked renewed memberships divided by expired memberships ending in the selected cohort; it is deterministic, not predictive. Branch finance attribution is explicitly unavailable because charges and payments have no authoritative branch dimension.

## Reminder domain

- `GymOsReminderRule` stores gym/type/channel/offset configuration. Defaults are created idempotently and disabled.
- `GymOsMemberCommunicationPreference` stores transactional/marketing consent and channels.
- `GymOsReminderCampaign` stores an audited scheduled campaign using only server-defined segments.
- `GymOsReminderDelivery` is the persistent intent/outbox and history. Its unique `dedupeKey` is the concurrency boundary.
- `GymOsMessagingProvider` isolates delivery. The development provider returns deterministic local references and never contacts an external service.

Supported triggers are membership expiry, payment due/overdue, inactivity, and an authorized manual transactional reminder. Campaign segments cover expiry in seven days, overdue charges, no visit for 14 days, and new memberships with no attendance after seven days. Campaign previews report eligible, opted-out, and missing-contact counts; targets are re-evaluated at execution. Templates are server-owned; callers cannot submit message text or recipients.

`GymOsReminderTimeService` applies the same gym-local quiet-hour policy to rules, manual reminders, and campaigns. When `GYMOS_REMINDER_QUEUE_ENABLED=true`, BullMQ registers bounded repeat jobs for evaluation, dispatch, campaign execution/reconciliation, and stale-processing recovery. Jobs use finite attempts, exponential backoff, bounded concurrency, and stable job identifiers. Local development may keep the queue disabled and use the authorized evaluation/processing paths.

Creation uses database uniqueness. Dispatch atomically claims work, rechecks preferences, contact, entitlement and current source state, and skips stale intent. Provider failures have a maximum of five attempts and capped backoff. Stale processing rows are safely recovered. Campaigns complete only after their deliveries are terminal. Manual requests are capped at 2 per member/day, 200 per gym/day and 20 per actor/day; campaign scheduling is capped at 10 per gym/day.

Push is not used because a direct member need not own a GYMRide account/device token. Production adapters and credentials remain external acceptance work.

## Authorization, audit, privacy

Owners/managers configure and send; staff have read-only analytics/history. Admin is read-only oversight. Cross-gym resources resolve as not found. Rule, manual-send, preference and campaign changes append audit records. Deliveries store internal references and status, never rendered contacts, arbitrary message text or credentials.

Partner APIs are below `/api/v1/partner/gyms/:gymId/gym-os`: `analytics/*`, `reminders/rules`, `reminders/deliveries`, `reminders/manual`, campaign preview/create/list/cancel, and member communication preferences. Admin oversight uses `/api/v1/admin/gym-os/analytics/:gymId` and `/api/v1/admin/gym-os/reminders/*`.

## Validation and performance

PostgreSQL runtime tests cover authorization, financial derivation, custom periods, duplicate reminder concurrency, opt-out/stale handling, campaigns, bounded retries, and stale recovery. A rollback-only performance fixture creates 1,000 members and memberships plus 30,000 attendance rows. Local `EXPLAIN ANALYZE` runs used the intended membership, attendance, expiry, finance, and branch indexes and completed below 25 ms on that fixture. This is local fixture evidence, not a production-scale latency claim.

## Known limitations

- Development delivery is simulation only; no live provider is configured.
- Branch finance allocation is omitted because charges/payments have no authoritative branch dimension.
- Queue execution requires Redis when enabled and is intentionally disabled by default in local development.
- Analytics are operational aggregates, not accounting exports or predictive advice.
