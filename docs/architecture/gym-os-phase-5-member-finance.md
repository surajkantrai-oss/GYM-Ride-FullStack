# GymOS Phase 5 — Member Payments, Dues and Renewals

## Scope and separation

GymOS member finance tracks private fees collected by a gym from its direct members. It is a separate bounded context from GYMRide marketplace payments, refunds, commissions, earnings, ledger and settlements. GymOS payments never enter the marketplace ledger and are not platform revenue.

## Financial model

Every newly assigned or renewed `GymOsMembership` creates one immutable `GymOsMemberCharge` from its price/currency snapshot. The due date is the membership start date. Existing pre-Phase-5 memberships are not backfilled, so no historical payment state is fabricated. A zero-price membership creates a zero-value `PAID` charge for an honest audit trail.

`GymOsMemberPayment` records a positive integer-minor-unit payment, method, UTC payment time, safe reference, actor and idempotency key. It is immutable after recording. `GymOsPaymentAllocation` applies it to a charge. Phase 5 allocates one payment to one charge while preserving the relational structure for future multi-charge allocation. Overpayments and currency conversion are prohibited.

Charge totals are derived from allocations whose payments remain `RECORDED`. Status is maintained transactionally as `UNPAID`, `PARTIALLY_PAID` or `PAID`; `OVERDUE` is derived from outstanding value and the gym-local date. Membership operational lifecycle and payment state remain independent.

## Receipts and reversals

Each payment receives a concurrency-safe per-gym/year receipt number such as `GR-2026-000001`, allocated through an atomic database counter. Receipt metadata is immutable and remains after reversal. The authenticated receipt endpoint returns gym/member/membership/payment facts for printable portal presentation; Phase 5 does not add a PDF dependency.

Payments are never edited or deleted. Owner/Manager reversal changes `RECORDED` to `REVERSED`, records actor/time/reason, removes the allocation's financial effect, refreshes the charge status and preserves the receipt. Staff may record front-desk payments but cannot reverse them.

## Transactions, idempotency and reconciliation

Payment recording locks the charge with a PostgreSQL transaction-scoped advisory lock. It re-derives paid/outstanding within the transaction before allocating, preventing concurrent overpayment. Independent partial payments that fit the remaining balance can both succeed. A gym-scoped `Idempotency-Key` uniqueness constraint returns the original result for a matching retry and rejects payload conflicts.

Reversal locks the payment, permits one transition only and recalculates its charge. Foreign keys, positive-value checks, unique receipts and unique membership charges protect integrity. The read-only reconciliation endpoint reports paid-above-charge and stored-status mismatches without silently rewriting history.

## Time, currency and security

All money uses integer minor units. Payment and charge currency are server-derived from the membership snapshot; conversion is not supported. Payment timestamps are UTC. Today, month and overdue ranges use the first configured branch timezone, falling back to `Asia/Kolkata`.

All Partner APIs require an active GymOS `DUES` entitlement. Owner/Manager can record and reverse; Staff can view and record but cannot reverse. Admin/Super Admin have read-only cross-gym lists, summaries and reconciliation. Gym-scoped lookups prevent IDOR. No card number, CVV, bank credential or UPI credential is stored or logged.

## Surfaces and APIs

Partner GymOS navigation includes Payments / Dues. Its dashboard provides collected-today/month, outstanding and overdue KPIs, searchable dues, partial/full manual recording, receipts, history and reversal controls. Member detail contains a finance summary and payment history. Admin has a clearly labeled, read-only GymOS member-finance view.

Partner routes include summary, charges, payments, recording, reversal, member finance and receipts under `/partner/gyms/:gymId/gym-os`. Admin routes live under `/admin/gym-os/finance` and never mutate member finance. Swagger documents minor-unit money, idempotency and role requirements.

## Limitations and future work

Phase 5 provides manual `CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, `CHEQUE` and `OTHER` recording. These are operator attestations, not provider-verified transactions. There is no online order flow, auto-debit, PDF generation, wallet/credit, coupon engine, tax filing, payouts, reminders or deep analytics. Renewal creates its new charge atomically with the membership; payment is then recorded through the idempotent payment endpoint. Phase 6 may add analytics and reminders without changing this history.
