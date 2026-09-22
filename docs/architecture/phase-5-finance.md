# Phase 5 financial architecture

Scope: Phase 5 only. Development receipts and payouts simulate outcomes; they never represent live customer charges or bank transfers. See `phase-5-final-validation.md` for verification results.

## Authority and atomicity

Payment amounts come exclusively from the booking snapshot. Provider verification must prove order, payment, amount, currency and captured status. A browser assertion of success is never sufficient. All finance mutations take a PostgreSQL transaction-scoped advisory lock; capture/refund application additionally locks the booking row. Finalization atomically records capture, booking confirmation, earning snapshot, ledger entries and booking event.

Capture after reservation expiration or cancellation must not reclaim released slot capacity. Such captures are retained as financial obligations and flagged for refund/reconciliation instead of confirming the booking.

## External operations

External order/refund/payout calls cannot share a PostgreSQL transaction. Persist operation intent before dispatch; use stable operation identifiers. Ambiguous provider outcomes require status lookup, never blind repeat dispatch. The development provider must be explicitly restricted to development/test; simulated payments and payouts never represent external money movement.

## Money and refunds

All amounts use integer paise. Commission uses basis points with deterministic integer rounding. Preserve gross, tax, discount, commission basis points and rule version at capture. Refund allocation uses cumulative proportional commission reversal so multiple partial refunds equal a full refund exactly.

Refund reservations take the shared finance lock and include created, pending, processing and successful refunds when enforcing the captured ceiling. Earning settlement eligibility is frozen while a refund is pending. Already allocated earnings remain on hold even after reversal; refunds against them are rejected pending a separately authorized adjustment workflow, rather than rewriting paid history.

## Ledger and settlements

The ledger is append-only with database mutation protection and unique source/category keys. Entries represent signed changes in separately named accounts; reporting must not add all categories together as revenue. Corrections append compensating entries.

Settlement items uniquely allocate earnings. Generation serializes selection under the shared finance lock; processing uses a persisted payout intent. Partner finance queries enforce gym or branch membership before returning data, and gym-wide settlements require gym-wide permission.

## Provider reference

Razorpay verification uses HMAC-SHA256 checkout signatures plus an authenticated payment fetch. Webhook signatures use exact raw request bytes. Provider event IDs are unique per provider. Event registration, domain processing and acknowledgement are separate durable steps; domain effects are transactional and replay-safe if acknowledgement fails. References: [checkout integration](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/), [refund entity](https://razorpay.com/docs/api/refunds/entity/), [refund webhooks](https://razorpay.com/docs/webhooks/refunds/).

## Payment and refund lifecycle

`PAYMENT_PENDING booking → order CREATED/PENDING → provider verification → payment SUCCESS + booking CONFIRMED + earning + ledger`.

The state machine also supports authorization and failure. A verified late capture records the financial obligation but cannot resurrect an expired reservation; `requiresReview` blocks settlement. Expiration/capacity release remains owned by Phase 4.

`captured payment → refund PROCESSING intent → provider response/webhook/status fetch → PENDING, SUCCESS or FAILED`.

Refund event adapters decode `refund.created`, `refund.pending` (development compatibility), `refund.processed` and `refund.failed` into a provider-independent lookup. The endpoint verifies raw signatures before parsing. Authenticated refund status must match payment ID, amount, refund ID, currency where returned, and internal receipt. The receipt permits recovery when webhook delivery beats the refund API response. Unknown refunds are retained as unmatched events, never invented as new refund records.

SUCCESS is terminal: older pending/failure observations cannot regress it. FAILED is terminal; a contradictory provider success raises an integrity error for review. A failed refund reserves no further balance; a new idempotency key may request another refund. A duplicate request retains the original failed record/result. Refund success updates payment totals, earning deductions, three ledger entries and, for full refunds only, the booking status in one transaction. Verified status changes are audited once. Override bypasses the time window, not an invalid booking lifecycle.

## Commission and account semantics

Default commission is configured in basis points (1500 = 15%). BigInt intermediate arithmetic rounds half-up deterministically. Capture snapshots commission amount, BPS and version; later configuration changes never rewrite it. Tax/discount are zero in the current booking snapshot model.

For a 100000-paise payment, commission is 15000 and gym payable is 85000. Cumulative refunds reverse the original commission proportionally; multiple partial refunds total exactly the original commission when fully refunded.

| Source | Account | Signed amount |
| --- | --- | ---: |
| Payment | provider_clearing | +gross |
| Payment | platform_revenue | +commission |
| Payment | gym_payable | +gross − commission |
| Refund | provider_clearing | −refund |
| Refund | platform_revenue | −commission reversal |
| Refund | gym_payable | −refund + commission reversal |
| Settlement | gym_payable | −net payable |
| Settlement reversal | gym_payable | +original net payable |

These are separate account movements, not a double-entry general ledger. Do not sum all accounts to calculate revenue. Earning net = gross − original commission − cumulative refund + cumulative commission reversal. Backend summaries aggregate in the database.

## Settlement reversal and holds

`eligible earnings → READY → PROCESSING → PAID → REVERSED` is the implemented development path. Other enum states are extension points; there is no generic state-update endpoint. An ambiguous payout leaves PROCESSING for review; no real payout integration is enabled.

An authorized admin records a verified correction with settlement ID, reason and idempotency key. Only PAID can reverse. A unique immutable SettlementReversal connects the original settlement and original ledger entry with the actor, reason and request key. A new SETTLEMENT_REVERSAL ledger entry restores the payable liability, earning `settled` becomes false, and the settlement becomes REVERSED atomically. Same-key retries return the original reversal; conflicting inputs fail. Different-key repeated reversals fail without additional entries.

Original ledger entries, settlement items, payout reference and paid timestamp remain unchanged. Unique earning allocations are retained as a **payout hold**: restored liability does not authorize another transfer. Reversed earnings are not auto-selected for new settlements. The portal displays this hold. Releasing/reallocating held earnings is deliberately not exposed in Phase 5.

## Concurrency and database guarantees

- PostgreSQL advisory transaction lock serializes financial writes; booking row locks coordinate capture/refund with Phase 4 booking mutations. Redis is not a financial authority.
- Unique booking/payment, provider payment/order/refund, event ID, earning/payment, ledger source/category/account, settlement item/earning and reversal/settlement constraints prevent duplicates.
- Empty-update Prisma upsert can race; event registration handles a unique-key winner by rereading and comparing the immutable payload hash.
- Provider calls happen outside transactions. Persisted order/refund intent prevents blind replay of an uncertain external request. Development payout references are deterministic and repeat-safe; future payout adapters must supply an equivalent durable idempotency contract.
- Ledger UPDATE/DELETE/TRUNCATE is blocked by PostgreSQL triggers. Earning/payment snapshots and established provider references are protected. Reversal records and settlement items cannot be edited/deleted.
- The shared lock is intentionally conservative and may limit throughput. Per-gym lock optimization requires measured load and lock-order review.

## Reconciliation

The admin read-only scan uses a RepeatableRead snapshot so simultaneous mutations cannot produce torn-read findings. Payment and settlement scans each process at most 500 records, with independent cursors. Additional confirmed-without-capture and uncertain-order scans are bounded and expose truncation. No scan silently changes historical data.

Checks include snapshot mismatch, captured/pending booking, late-capture review, missing earnings/capture ledger, refund ledger/count and earning refunded-total mismatch, settled earnings without valid paid settlement, settlement/reversal ledger mismatch, missing reversal record, duplicate earning allocation, and item/settlement total mismatch. Issue codes are stable strings such as `PAYMENT_SNAPSHOT_MISMATCH`, `MISSING_CAPTURE_LEDGER`, `EARNING_REFUND_MISMATCH`, `SETTLEMENT_LEDGER_MISMATCH`, `MISSING_SETTLEMENT_REVERSAL`, `FINANCIAL_TOTAL_MISMATCH`.

## API contract

All paths below are under `/api/v1`. Swagger uses the actual routes; financial responses use paise, not rupees. No customer-accessible refund endpoint was introduced; refunds are admin-controlled.

| Role | Method/path | Contract |
| --- | --- | --- |
| Customer | POST bookings/:bookingId/payment | Owned pending/unexpired booking; booking-scoped idempotency |
| Customer | POST payments/:paymentId/verify | Signed provider proof plus independent status lookup |
| Provider | POST webhooks/payments/:provider | Both payment/refund events; raw signature + event-ID headers |
| Partner | GET partner/finance/summary | Authorized gym or branch required |
| Partner | GET partner/finance/:resource | payments, earnings, settlements; scoped filters/pagination |
| Partner | GET partner/finance/:resource/:id | Authorized payment/earning/settlement detail |
| Admin | GET admin/finance/summary | Platform aggregates |
| Admin | GET admin/finance/:resource | payments, refunds, earnings, settlements, ledger |
| Admin | GET admin/finance/:resource/:id | payments, earnings or settlements |
| Admin | GET admin/finance/reconciliation | after / afterSettlement cursors; report only |
| Admin | POST admin/finance/refunds | Required Idempotency-Key; amount/reason/override |
| Admin | POST admin/finance/refunds/:id/reconcile | Provider status lookup; no redispatch |
| Admin | POST admin/finance/settlements | Required Idempotency-Key; closed [start,end) period |
| Admin | POST admin/finance/settlements/:id/process | Settlement-scoped repeat-safe development payout |
| Admin | POST admin/finance/settlements/:id/reverse | Required Idempotency-Key + reason; compensating accounting |
| Admin | POST admin/finance/payments/:id/simulate | Development-only capture, no money |

List filters: page (default 1), limit (default 20, maximum 100), gymId, branchId, from, to and resource-appropriate status. Booking filter applies to payment/refund/earning records. Date-only `to` includes that entire UTC date; timestamp `to` is inclusive. Settlement periods end exclusively. Settlements are gym-wide and reject branch filters. Earnings status accepts PAID/PENDING; other resources validate their lifecycle statuses.

Idempotency keys contain 8–120 characters. Refund keys bind payment, amount, reason, actor and policy override. Settlement generation keys bind gym and period; reversal keys bind settlement, reason and actor. Exact retries return the original result, conflicting inputs return `IDEMPOTENCY_KEY_CONFLICT`. Webhook event IDs are separately unique per provider; changed payload under the same ID is an integrity error.

## Local validation and limitations

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, then `pnpm --filter @gymride/backend test:finance:runtime` with local PostgreSQL/PostGIS and an existing `gymride_finance_test` database. The runtime runner derives local credentials without printing them, targets only that database, applies migrations, and uses only development providers. Runtime fixtures are retained for audit/debugging; no existing development data is deleted. Docker is not required.

Razorpay adapter contracts are implemented but real/test-key provider acceptance remains credential-dependent. No live charge, refund, bank transfer, or payout was executed. Real payout transport and automatic release of reversed earning holds are not enabled. Unknown external operation outcomes require controlled provider investigation; they are not silently retried. No automatic background financial mutation job is enabled. Phase 6 and later phases remain untouched.
