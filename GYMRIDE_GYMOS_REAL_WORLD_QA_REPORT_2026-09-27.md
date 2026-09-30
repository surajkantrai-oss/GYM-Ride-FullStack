# GYMRIDE + GYMOS REAL-WORLD QA COMPLETED

Execution date: 27 September 2026 (Asia/Kolkata)

Overall result: **BLOCKED**

The GYMRide owner/admin setup path was exercised successfully through the real web UIs. The GymOS acceptance pass could not proceed because the live development database has none of the seven GymOS migrations applied. Per the no-fix/no-schema-change instruction, QA did not apply them.

## 1. QA Environment

| Item | Result |
| --- | --- |
| Git branch | `main` |
| HEAD | `01620b64006b7cfbf755cea9c25c12065cfb5233` |
| Initial worktree | Already dirty with existing GymOS implementation changes and untracked GymOS files/migrations |
| Backend URL | `http://localhost:3000/api/v1` |
| Backend health | HTTP 200; application, database, and Redis reported `up` |
| Admin URL | `http://localhost:3001` |
| Partner URL | `http://localhost:3002` |
| Mobile environment | `development`; API `http://localhost:3000/api/v1` |
| PostgreSQL | Local `gymride_codex_dev`, reachable and readable |
| Redis | Listening on 6379; backend health reported `up` |
| BullMQ | GymOS reminder queue disabled in development (`GYMOS_REMINDER_QUEUE_ENABLED` defaults false); booking, check-in, and notification queues also disabled by local configuration |
| Payments | Development provider by configuration default |
| GymOS messaging | Development provider implementation; no real messages sent |
| Node.js | Workspace requires 22.23.2. Shell initially selected 20.20.2; all validation was run with installed Node 22.23.2 |
| pnpm | 11.19.0 |

Migration status on the live development database: 20 migrations discovered, with the following seven unapplied:

- `20260926000000_gym_os_saas_foundation`
- `20260927000000_gym_os_members`
- `20260928000000_gym_os_membership_lifecycle`
- `20260929000000_gym_os_attendance`
- `20260930000000_gym_os_member_finance`
- `20261001000000_gym_os_analytics_reminders`
- `20261002000000_gym_os_phase6_completion`

Read-only `information_schema` verification returned zero `gym_os_%` tables in `gymride_codex_dev`.

## 2. Baseline Validation

| Check | Result |
| --- | --- |
| Standard tests | PASS: 70 test files, 340 tests |
| PostgreSQL runtime tests | PASS: 6 suites, 97 tests against guarded `gymride_finance_test` |
| Backend lint | PASS |
| Admin lint | PASS |
| Partner lint | PASS |
| Mobile lint | PASS |
| Workspace typecheck | PASS |
| Backend build | PASS |
| Admin build | PASS; 20 routes generated |
| Partner build | PASS; 22 route groups generated |

The first `pnpm test` launch failed before tests because the shell selected Node 20, which cannot run pnpm 11.19.0. Re-running with the repository's installed Node 22.23.2 succeeded. This was recorded as an environment/toolchain issue, not a product test failure.

## 3. Test Data Created Through Frontend

| Entity | Data created |
| --- | --- |
| Gym | IronCore Fitness Bhopal (`APPROVED`) |
| Branches | MP Nagar Branch; Kolar Road Branch (both `ACTIVE`) |
| Amenities | 12 on MP Nagar; 9 on Kolar Road |
| Operating hours | MP Nagar 06:00–22:00 daily; Kolar Road 06:00–22:00 Monday–Saturday and closed Sunday |
| Marketplace plans | IronCore Day Pass, ₹499, both branches, `ACTIVE`; IronCore Monthly Unlimited, ₹2,499, both branches, `ACTIVE` |
| GymOS subscriptions | None; blocked before paywall/plan selection |
| GymOS members | None; blocked |
| GymOS membership plans | None; blocked |
| GymOS memberships | None; blocked |
| GymOS attendance | None; blocked |
| GymOS payments/dues/receipts | None; blocked |
| Reminder rules/campaigns | None; blocked |

**BUSINESS DATA CREATED THROUGH FRONTEND: YES** (GYMRide marketplace setup only; GymOS data creation was blocked.)

Read-only database verification confirmed the exact gym, two branches, two prices in paise (`49900`, `249900`), and `GYM_SUBMITTED`/`GYM_APPROVED` audit events.

## 4. Gym Owner Testing

- PASS: Development OTP owner login.
- PASS: Empty gym form validation.
- PASS: Gym creation success state and detail navigation.
- PASS: Two realistic branches created through UI with Bhopal addresses, timezone, contacts, coordinates, amenities, and hours.
- PASS: Branch activation and readiness counts.
- PASS: Two marketplace plans created, assigned to both branches, and activated.
- PASS: Gym submitted for review; Partner state became `PENDING APPROVAL`.
- PASS: After Admin approval, Partner dashboard reflected the additional live gym and branches.
- FAIL/BLOCKED: Initial slot configuration page could not load.
- FAIL/BLOCKED: GymOS entry page returned a generic unexpected error.

## 5. Manager Testing

BLOCKED. No Manager account or active Manager membership exists in the local database, no Partner/Admin staff-management UI was found, and GymOS itself was unavailable because its tables are missing. No direct database business-data insertion was used.

## 6. Staff Testing

BLOCKED for the same reasons as Manager testing. No Staff identity was directly seeded or inserted.

## 7. Admin Testing

- PASS: Development OTP Admin login.
- PASS: Submitted gym appeared in Pending Review with correct owner phone, branch count, and status.
- PASS: Detail showed both branches, amenities, operating hours, and both active marketplace plans.
- PASS: Approval changed the gym to `APPROVED` and appended the audit trail.
- NOT RUN: Reject path; a second fully configured disposable gym was not created after the primary blocker was established.
- NOT RUN: Suspend/reactivate, to avoid unnecessary operational mutation after approval.
- FAIL/BLOCKED: GymOS plan/subscription oversight returned generic load errors because the backing tables do not exist.

## 8. Customer Testing

BLOCKED. The running iOS Simulator was displaying a different application, not GYMRide. The new gym also had no slot configuration because the first-time Slot Settings UI failed. Automated mobile tests passed, but OTP discovery, booking, development payment, My Bookings, check-in, review, notification, Flex, and recommendation acceptance were not claimed as manually verified.

## 9. GymOS Subscription Testing

BLOCKED before the no-subscription paywall. Partner GymOS failed while loading subscription state; Admin GymOS plan and subscription lists also failed. No development payment was initiated, so no financial confirmation was required and no real money was charged.

## 10. Member Management

BLOCKED. Member create/list/import/limits/status/archive and communication preferences could not be reached. No CSV was uploaded because the target UI and tables were unavailable.

## 11. Membership Lifecycle

BLOCKED. Plan creation, assignment, scheduled/expiring states, freeze/resume, cancellation, renewal, history, and lifecycle calculations were not executable.

## 12. Attendance

BLOCKED. Manual check-in/out, duplicate prevention, branch scope, QR rotation/expiry/tampering, and eligibility cases were not executable.

## 13. Member Finance

BLOCKED. Charges, partial/full/unpaid/overdue states, reversals, idempotency, receipts, and authorization could not be exercised.

## 14. Analytics

BLOCKED. GymOS membership, renewal, attendance, finance, branch, and no-visit analytics were not executable.

## 15. Reminders

BLOCKED. Rules, preferences, opt-out, quiet hours, manual reminders, stale-state re-evaluation, delivery history, and retry behavior were not executable. The queue is disabled in the current development configuration.

## 16. Campaigns

BLOCKED. Preview, scheduling, target re-evaluation, cancellation, and BullMQ execution were not executable.

## 17. Marketplace Regression

- PASS: Owner login, gym creation, branch configuration, plan creation/activation, submission, and Admin approval.
- PASS: Existing Admin and Partner dashboards remained operational.
- FAIL/BLOCKED: First-time Slot Settings prevented inventory configuration and therefore blocked a complete customer booking acceptance path for the created gym.
- BLOCKED: Customer mobile runtime acceptance was not available in the active simulator.

## 18. Cross-Domain Isolation

BLOCKED. No GymOS direct members, membership finance, or attendance could be created, so marketplace/GymOS isolation could not be compared at runtime.

## 19. Security / IDOR

- PASS: Safe random gym-ID tampering in Partner returned `Gym not found` with no record disclosure or stack trace.
- BLOCKED: Partner A versus another owner's Gym B could not be established without a second owner identity.
- BLOCKED: GymOS member, membership, attendance, payment, receipt, and campaign ID checks lacked backing tables/data.
- PASS (observed): Owner and Admin portals enforced their separate authenticated workspaces.

## 20. Database Integrity

Read-only checks on the live development database found:

- Correct persisted state for the QA gym, branches, marketplace plans, and audit events.
- Zero orphan `plan_branches` records.
- Zero duplicate active legacy gym-membership sets.
- Zero slot configurations for the QA gym, matching the UI failure.
- Zero GymOS tables, so duplicate subscription, member, attendance, dues, allocation, receipt, reminder, and cross-gym GymOS integrity checks were blocked rather than passed.

The guarded runtime database independently applied all 20 migrations and passed its 97 PostgreSQL runtime tests. That does not change or validate the missing schema in `gymride_codex_dev`.

## 21. UI/UX Findings

- Desktop Partner/Admin shells, cards, forms, tables, status badges, breadcrumbs, loading states, confirmation dialogs, and empty states were visually coherent with the current GYMRide design language.
- Required-field validation appeared inline for gym, branch, and plan forms.
- Runtime errors remained generic and did not expose SQL, JWTs, provider secrets, or stack traces.
- At a 390×844 viewport, Partner bottom navigation exceeded the available width and the rightmost items were clipped/truncated.
- GymOS error copy (`An unexpected error occurred`) is safe but not actionable for a blocked environment.

## 22. Performance Findings

- The tested GYMRide owner/admin pages were responsive enough for manual use with the current small local dataset.
- No reliable large-list performance test was possible because the required 20–30 GymOS members could not be created.
- No slow-query conclusion is made without a representative GymOS dataset and quantitative profiling.

## 23. Automated Regression After QA

| Check | Result | Comparison |
| --- | --- | --- |
| Standard tests | PASS: 70 files, 340 tests | Same as baseline |
| PostgreSQL runtime tests | PASS: 6 suites, 97 tests | Same as baseline |
| Backend/Admin/Partner lint | PASS | Same as baseline |
| Mobile lint | PASS | Same as baseline |
| Workspace typecheck | PASS | Same as baseline |
| Backend/Admin/Partner builds | PASS | Same as baseline |

## 24. Bugs Found

| ID | Severity | Module | Role | Summary | Reproducible | Blocking |
| --- | --- | --- | --- | --- | --- | --- |
| GYMOS-QA-001 | BLOCKER | GymOS / database deployment | Owner, Admin, Manager, Staff | Live dev database lacks all GymOS migrations/tables; Partner and Admin GymOS fail to load | 100% | Yes |
| GR-QA-001 | HIGH | Marketplace slot settings | Owner | New branch with no slot config returns an empty response that the UI attempts to parse as JSON | 100% | Yes, for booking setup |
| GR-QA-002 | LOW | Partner responsive navigation | Owner, Manager, Staff | Bottom navigation clips rightmost items at 390 px width | 100% at tested viewport | No |

### GYMOS-QA-001 — Live dev database has no GymOS schema

**Severity:** BLOCKER  
**Role:** Owner, Admin, Manager, Staff  
**Environment:** Local development, `gymride_codex_dev`, API `localhost:3000`, Partner `localhost:3002`, Admin `localhost:3001`  
**Module:** GymOS subscription and all GymOS modules  
**Preconditions:** Backend and portals running; authenticated owner/admin  
**Steps to reproduce:**

1. Sign in to Partner as the seeded owner.
2. Select an approved gym and open GymOS.
3. Sign in to Admin and open GymOS.
4. Run read-only Prisma migration status and inspect `information_schema`.

**Expected:** Partner displays no-subscription paywall and plans; Admin displays commercial plans/subscriptions.  
**Actual:** Partner displays `We couldn’t load this` / `An unexpected error occurred`. Admin displays the same error for commercial data and subscriptions. Seven GymOS migrations are pending and zero `gym_os_%` tables exist.  
**Evidence:** `prisma migrate status` reports seven pending migrations; read-only table query returns zero rows; both UIs reproduce.  
**Database state:** Existing GYMRide tables are present; GymOS tables are absent.  
**API endpoint:** GymOS plan/subscription endpoints used by `/gym-os` (requests fail before usable data is returned).  
**Reproducibility:** 100%.  
**Workaround:** None permitted within this QA pass; applying migrations would violate the explicit no-schema-change instruction.

### GR-QA-001 — First-time Slot Settings cannot render

**Severity:** HIGH  
**Role:** Owner  
**Environment:** Local development Partner Portal  
**Module:** Marketplace branch slot configuration  
**Preconditions:** Owner has an active branch with amenities and operating hours but no existing slot config.  
**Steps to reproduce:**

1. Open the branch detail.
2. Select Slot settings.
3. Wait for settings to load.

**Expected:** Default slot values render, allowing the first configuration to be saved.  
**Actual:** Page displays `Failed to execute 'json' on 'Response': Unexpected end of JSON input`; the configuration form is unavailable.  
**Evidence:** Reproduced on MP Nagar Branch; read-only DB query confirms no `branch_slot_configs` row for either QA branch.  
**Database state:** Zero slot configs for the QA gym.  
**API endpoint:** `GET /api/v1/partner/branches/{branchId}/slot-config`.  
**Reproducibility:** 100% for tested new branch.  
**Workaround:** None through the UI.

### GR-QA-002 — Mobile-width Partner navigation clips items

**Severity:** LOW  
**Role:** Owner, Manager, Staff  
**Environment:** Partner Portal, 390×844 viewport  
**Module:** Responsive navigation  
**Preconditions:** Authenticated Partner dashboard.  
**Steps to reproduce:**

1. Set viewport to 390×844.
2. Open Partner Dashboard.
3. Inspect bottom navigation.

**Expected:** All navigation items remain fully visible or accessible through an explicit overflow mechanism.  
**Actual:** The rightmost labels/items are clipped at the viewport edge.  
**Evidence:** Visual inspection at the specified viewport.  
**Database state:** Not applicable.  
**API endpoint:** Not applicable.  
**Reproducibility:** 100% at tested viewport.  
**Workaround:** Use a wider viewport.

## 25. Known Testing Limitations

- GymOS schema absent from the live dev database.
- GymOS/BullMQ queues disabled in current development configuration.
- No real WhatsApp, SMS, email, push, or money was used.
- No Manager or Staff test identity/membership existed; no direct insertion was performed.
- The active iOS Simulator was running another application, so manual GYMRide customer acceptance was not available.
- First-time slot setup blocked the created gym's bookable inventory.
- Physical-device behavior, real provider delivery, and production payment acceptance were not tested.
- No 20–30 member performance dataset could be created.

## 26. Git Integrity

**SOURCE CODE MODIFIED BY QA: YES (unexpected generated changes)**

The mandatory production builds rewrote these Next.js-generated declaration files from `.next/dev/types/...` imports to `.next/types/...` imports:

- `frontend/admin-panel/next-env.d.ts`
- `frontend/partner-panel/next-env.d.ts`

They were not manually edited and were not reverted, following the instruction to list unexpected changes without reverting. All other initial modified/untracked application files remained present. The QA report itself is an allowed artifact.

## 27. Overall QA Result

**BLOCKED**

The automated suites and the tested GYMRide owner/admin setup path pass, but GymOS is unavailable in the target runtime and the created marketplace gym cannot receive its first slot configuration. These are critical acceptance blockers for the requested real-gym onboarding scenario.

---

SOURCE CODE FIXES PERFORMED: NO  
BACKEND LOGIC CHANGED: NO  
DATABASE SCHEMA CHANGED: NO (the guarded runtime test database was recreated by its existing test runner; the business dev database schema was not changed)  
MIGRATIONS ADDED: NO  
FRONTEND DESIGN CHANGED: NO  
BUGS AUTO-FIXED: NO  
QA DATA CREATED THROUGH FRONTEND: YES (GYMRide marketplace data; GymOS blocked)  
DATABASE DIRECTLY MODIFIED FOR BUSINESS TEST DATA: NO  
EXISTING GYMRIDE PHASE 1–10 PRESERVED: YES, subject to the reported slot-settings blocker  
GYMOS PHASE 1–6 PRESERVED: YES in source; runtime acceptance BLOCKED because its migrations are unapplied
