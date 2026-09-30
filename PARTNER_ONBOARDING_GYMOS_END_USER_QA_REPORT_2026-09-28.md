# PARTNER ONBOARDING + GYMOS END-USER QA COMPLETED

## 1. Environment

- Date: 2026-09-28 (Asia/Kolkata)
- Repository: `GYMRide-FullStack`
- Branch / baseline commit: `main` / `01620b64006b7cfbf755cea9c25c12065cfb5233`
- Runtime: Node.js 22.23.2, pnpm 11.19.0
- Services: backend `localhost:3000`, admin `localhost:3001`, partner `localhost:3002`
- Database: PostgreSQL/PostGIS database `gymride_codex_dev`; Redis available
- Migration state: 20 migrations applied
- Test persona: Aarav Mehta, `+919000009902`, `aarav.qa@example.test`
- Created gym: PulseForge Fitness (`ff45f4d0-250e-4bd8-b476-3403b2d61325`)
- Scope: real browser interaction as a new gym owner plus admin review; database access was read-only and used only for verification.

## 2. Baseline Validation

PASS. Before the end-user journey, all standard suites passed: 368 tests total (backend 209, mobile 79, API client 7, validation 3, web UI 25, admin 10, partner 35). The PostgreSQL/PostGIS runtime suite passed 97 tests across 6 suites. Lint, workspace type-check, backend build, admin build, and partner build also passed.

The worktree already contained extensive modified and untracked GymOS/onboarding implementation files before QA started. They were treated as user-owned changes and were not edited, reverted, staged, or committed.

## 3. New Partner Login

PASS. Registered and authenticated a previously unused partner phone number through the browser. The resulting account has `CUSTOMER` and `GYM_OWNER` roles. Profile details were saved and later displayed as Aarav Mehta. Logout and OTP re-login succeeded.

One initial profile-save click did not produce conclusive evidence of a product defect; the operation succeeded when explicitly retried and verified, so it is not logged as a bug.

## 4. Onboarding Experience

PASS WITH UX NOTES. The onboarding path guided the owner through gym identity, branch configuration, marketplace plans, review, and submission. Required states and approval status were understandable. Configuration is spread across several pages, which is workable but makes final verification dependent on navigating back through individual records.

## 5. Gym Creation

PASS. Created PulseForge Fitness with the description: “Modern strength, conditioning, and recovery gym built for busy professionals.” The gym persisted with the expected identity and progressed from draft to submitted to approved.

## 6. Owner Relationship

PASS. Read-only database verification found exactly one gym membership relationship between the new owner and PulseForge Fitness. No duplicate owner link or orphan gym was found.

## 7. Branch Setup

PASS.

- PulseForge Fitness - Arera Colony (`52ec14b3-720b-4db5-947e-269adc4a0bbc`): Cardio, Free Weights, Personal Trainer, Locker, Shower, Parking; Monday–Saturday 06:00–22:00; Sunday closed.
- PulseForge Fitness - MP Nagar (`92a6759a-c9d7-4373-aebc-94ce81889818`): four amenities; all seven days 06:00–22:00.
- Both branches active with 60-minute slots, capacity 20, booking window 30 days, and minimum advance 60 minutes.

The data persisted correctly. The admin approval page did not show slot configuration; see `GR-QA-001`.

## 8. Free Marketplace Setup

PASS. Created two active public marketplace products through the owner UI, available at both branches:

- PulseForge Day Pass: ₹399, one day.
- PulseForge Monthly: ₹1,999, 30 days.

Read-only verification confirmed exactly these two `gym_plans` rows and their minor-unit prices of 39,900 and 199,900.

## 9. Submission

PASS. Submitted the gym only after explicit confirmation. The owner UI changed to the pending-review state, and that state survived logout and OTP re-login. The audit log contains `GYM_SUBMITTED` at 2026-09-28 15:42:27 IST.

## 10. Admin Approval

PASS WITH ISSUE. The admin review accurately displayed the owner, gym, branches, amenities, operating hours, and public plans. The approval action was performed only after explicit confirmation. The audit log contains `GYM_APPROVED` at 2026-09-28 15:45:52 IST. Branch slot settings were absent from the review; see `GR-QA-001`.

## 11. Existing Partner Re-login

PASS. After approval, logout and OTP re-login landed the owner in the partner dashboard rather than onboarding or an access-denied page. Approved marketplace, booking, finance, and GymOS navigation remained available.

## 12. GymOS Default Lock

PASS WITH ISSUE. Before entitlement activation, GymOS data APIs rejected protected data with an entitlement-required response and did not disclose records. However, direct protected URLs briefly rendered their full page shells and actions before the API error instead of routing immediately to the GymOS paywall; see `GYMOS-QA-001`.

## 13. GymOS Plan Selection

PASS. The paywall displayed Starter ₹599/month, Growth ₹1,299/month, and Pro ₹2,299/month. Growth was selected for PulseForge Fitness.

## 14. Development Payment

PASS. The authorized development payment simulation created subscription `88baa047-3db7-412e-91e2-ca4ff219439f` and successful development payment `d94a9a11-9554-4593-aba2-f94594d06261` for 129,900 minor units. No real payment instrument or real money was used.

## 15. Pending Admin Activation

PASS. Successful simulated payment left the subscription in `PENDING_PAYMENT`; it did not self-activate. The owner saw “GymOS activation pending,” while GymOS modules remained locked. This correctly enforced the separate administrative activation step.

## 16. Admin GymOS Activation

PASS WITH UX NOTE. Admin showed PulseForge Fitness, Growth, pending status, the successful development payment reference, and request date. Activation occurred only after explicit confirmation. The admin table omitted owner identity; see `GYMOS-QA-002`. The audit log contains `GYMOS_SUBSCRIPTION_ACTIVATED` at 2026-09-28 16:00:21 IST.

## 17. GymOS Unlock

PASS. After refresh, the partner UI showed Growth as `ACTIVE`, with period end 2026-10-28 and access to members, memberships, attendance, payments/dues, analytics, reminders, staff, multi-branch, and CRM capabilities. Read-only verification showed one subscription for the gym and an active entitlement.

## 18. Members Created

PASS. Five active direct GymOS members were created through the frontend:

| Code | Member | Phone |
|---|---|---|
| GM-000001 | Rahul Sharma | +919000009921 |
| GM-000002 | Priya Verma | +919000009922 |
| GM-000003 | Aman Jain | +919000009923 |
| GM-000004 | Neha Singh | +919000009924 |
| GM-000005 | Rohit Patel | +919000009925 |

The UI showed 5/500 active members. Database verification found five unique member codes and no platform `user_id` links, confirming these are direct GymOS records rather than marketplace customer accounts.

## 19. GymOS Membership Plans

PASS WITH ISSUE. Created two active, all-branch GymOS plans:

- `PF-MONTHLY`: PulseForge Monthly, one month, ₹1,500.
- `PF-QUARTERLY`: PulseForge Quarterly, three months, ₹4,000.

The creation form retained the first plan’s values after success and required manual replacement before creating the second; see `GYMOS-QA-003`.

## 20. Membership Assignment

PASS WITH ISSUE.

- Rahul Sharma: `PF-MONTHLY`, 2026-09-28 through 2026-10-27, active.
- Priya Verma: `PF-QUARTERLY`, 2026-09-28 through 2026-12-27, active.

Correct charges were created automatically. Immediately after assignment, the member detail financial summary still showed ₹0 until later data refresh/navigation even though the payments view already contained the charge; see `GYMOS-QA-004`.

## 21. Attendance

PASS. Rahul’s active membership was accepted for manual check-in at Arera Colony. The live present count rose to one. Manual check-out then returned it to zero and produced one closed history record. Database evidence shows one record with both timestamps and `MANUAL` check-in/check-out methods. No duplicate open attendance exists.

## 22. Payments/Dues

PASS. With explicit confirmation for each representational financial record:

- Recorded ₹1,000 by UPI, reference `QA-UPI-1000`, receipt `GR-2026-000001`; Rahul’s balance became ₹500.
- Recorded ₹500 by cash, reference `QA-CASH-500`, receipt `GR-2026-000002`; Rahul’s ₹1,500 charge became paid with ₹0 outstanding.
- Priya’s ₹4,000 quarterly charge remains unpaid, as intended.

Database evidence shows two recorded payments totalling ₹1,500, one paid ₹1,500 charge, and one unpaid ₹4,000 charge.

## 23. Analytics

PASS WITH LABEL NOTE. Analytics reflected five active member profiles, one unique visitor, ₹1,500 collections, ₹4,000 outstanding, Arera Colony with one visit, and Monday 16:00–17:00 as the busiest period. “Active members” represents active member profiles, not active paid memberships; clearer labeling would reduce ambiguity because only two memberships were assigned.

## 24. Reminders

BLOCKED BY PRODUCT ISSUE. The reminders page loaded rules and campaigns. A safe preview-only campaign was prepared with name `QA Overdue Preview`, segment Overdue, and a future schedule, but both Preview and Schedule remained disabled despite all visible required fields being populated. No reminder, notification, or real message was sent. See `GYMOS-QA-005`.

## 25. Marketplace/GymOS Isolation

PASS. The public marketplace retained exactly two `gym_plans`. The five GymOS members remained only in `gym_members` with null platform-user links. GymOS plans remained in `gym_os_membership_plans`, member payments remained in `gym_os_member_payments`, and GymOS attendance remained in `gym_os_attendances`; they did not appear as marketplace bookings, marketplace payments, customer accounts, or marketplace check-ins.

## 26. Cross-Gym Security

PASS FOR AVAILABLE COVERAGE. While authenticated as the PulseForge owner, directly opening IronCore Fitness Bhopal’s plan-management URL returned “Gym not found” and disclosed no catalog data. Before activation, protected GymOS data endpoints also returned entitlement errors without records. Read-only integrity queries found zero membership, charge, payment, or attendance rows whose gym differed from the associated member’s gym. The fixture database contained no direct GymOS members for another gym, so a foreign-member detail URL could not be exercised against a real target.

## 27. UX Findings

- Admin approval is thorough for identity, branch, hours, amenities, and marketplace plans, but lacks slot configuration.
- Protected GymOS page shells appear before entitlement errors on direct navigation.
- Admin subscription review would be faster and safer with owner identity visible.
- Membership plan creation should reset or clearly switch into duplicate/edit behavior after success.
- Member financial totals need immediate cache/query invalidation after membership assignment.
- Reminder buttons provide no explanation for why they remain disabled.
- Finance asks the owner to manually supply a gym UUID instead of selecting from owned gyms.
- Analytics should distinguish active member profiles from active memberships.

## 28. Database Integrity

PASS.

- Exactly one PulseForge owner relationship and one GymOS subscription.
- Five unique direct members; zero linked marketplace user accounts.
- Two GymOS membership plans, two active memberships, two charges, two payments, and one closed attendance record match UI observations.
- Zero duplicate member codes and zero duplicate open attendance records.
- Zero cross-gym member/membership, charge, payment, or attendance mismatches.
- Submission, approval, subscription creation/activation, member creation, plan changes, membership/charge creation, attendance, and both payment events are present in `audit_logs`.
- The runtime suite recreated a clean PostgreSQL/PostGIS database, applied all 20 migrations, seeded it, and passed 97 tests.

## 29. Bugs Found

### GR-QA-001 — Admin approval omits branch slot configuration

- Severity: Low
- Area: Partner onboarding / admin approval
- Reproduction: Configure branch slot duration, capacity, booking window, and minimum advance; submit the gym; open its admin review page.
- Actual: Owner, branches, amenities, hours, and plans appear, but slot configuration does not.
- Expected: Review should expose commercially relevant slot settings, or clearly link to them, before approval.

### GYMOS-QA-001 — Locked GymOS direct URLs render protected page shells

- Severity: Medium
- Area: Entitlement UX / defense in depth
- Reproduction: With an approved gym but no active GymOS entitlement, directly open protected GymOS module URLs.
- Actual: Full module shells and controls render before data calls return “entitlement required.” No protected records were disclosed.
- Expected: Route guard should redirect to the paywall or render a locked state before protected module UI appears.

### GYMOS-QA-002 — Admin GymOS subscription table omits owner identity

- Severity: Low
- Area: Admin activation review
- Reproduction: Open Admin → GymOS with a pending paid subscription.
- Actual: Gym, plan, status, payment reference, and dates appear, but owner name/contact does not.
- Expected: Owner identity should be visible during manual activation review.

### GYMOS-QA-003 — Membership-plan create form retains submitted values

- Severity: Low
- Area: GymOS membership plans
- Reproduction: Create one plan, then observe the create form.
- Actual: The successful plan’s fields remain populated, increasing accidental duplicate/overwrite risk.
- Expected: Clear the form after success or explicitly indicate a deliberate duplicate/edit state.

### GYMOS-QA-004 — Member financial summary is stale after assignment

- Severity: Medium
- Area: GymOS member detail
- Reproduction: Assign a paid membership from a member detail page and immediately view its financial summary.
- Actual: Summary remains ₹0 while Payments/Dues already shows the generated charge; later refresh/navigation reconciles it.
- Expected: Membership assignment should invalidate/refetch the member financial summary immediately.

### GYMOS-QA-005 — Owner cannot preview or schedule a completed reminder campaign form

- Severity: Medium
- Area: GymOS reminders
- Reproduction: As the `CUSTOMER · GYM_OWNER`, enter a campaign name, choose Overdue, and provide a valid future schedule.
- Actual: Preview and Schedule remain disabled with no validation explanation.
- Expected: An entitled owner should be able to preview, and—after explicit confirmation—schedule a valid campaign, or the UI should state the missing permission/field.
- Impact: Reminder campaign workflow could not be completed. No message was sent.

## 30. Final Regression

PASS after using the repository-compatible Node 22 runtime.

- Standard tests: 368 passed, 0 failed.
- PostgreSQL/PostGIS runtime tests: 97 passed across 6 suites, 0 failed.
- Lint: backend, admin, and partner passed.
- Type-check: all participating workspace projects passed.
- Production build: backend, admin, and partner passed.
- `git diff --check`: passed.

An initial command invocation used the host’s default Node 20.20.2 and pnpm exited before running checks because pnpm 11.19.0 requires Node 22.13 or newer. This was an environment invocation error, not a code failure; all checks passed when rerun with Node 22.23.2.

## 31. Git Integrity

PASS. No application source, schema, migration, configuration, CSS, or test file was modified by this QA execution. Existing dirty-worktree changes were preserved. No commit, reset, checkout, staging action, or destructive command was performed. The only new QA artifact from this run is this report.

## 32. Overall Result

**PASS WITH ISSUES.** The primary new-owner business journey is operational end to end: account creation, onboarding, two-branch setup, free marketplace setup, submission, admin approval, re-login, GymOS paywall, simulated payment, pending state, admin activation, entitlement unlock, five member records, two GymOS plans, two membership assignments, attendance, partial/full payment recording, analytics, data isolation, authorization checks, and audit persistence all worked.

The reminders workflow is blocked for the owner, and four additional UX/data-refresh issues should be addressed. No observed issue caused data corruption, cross-gym disclosure, marketplace/GymOS contamination, payment overstatement, or regression failure.

### Required declarations

- Frontend-only business-data interaction: **YES**. All business records and state changes were created through the browser UI; database access was read-only verification.
- Direct database insertion or mutation: **NO**.
- Source fixes or source modifications during QA: **NO**.
- Customer mobile logic changed: **NO**.
- Real payment charged: **NO**; only the development payment simulator was used after confirmation.
- Real reminder/message sent: **NO**.

QA is complete. Awaiting explicit next instruction before any fixes or further state changes.
