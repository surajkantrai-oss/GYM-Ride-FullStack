# GYMRide — Phase 1–10 End-to-End QA / UAT Report

- **Audit date:** 2026-09-24 (IST, Asia/Kolkata)
- **Auditor role:** QA Engineer + Admin user + Gym Partner + Customer
- **Mode:** Read-only on source code. Test data was created only through the Admin, Partner and Mobile UIs and the same public REST API those UIs call. The database was queried read-only to verify results.
- **Environment:** local dev (`NODE_ENV=development`, development OTP provider, development payment provider)

---

## 1. Executive Summary

**Overall result: CONDITIONAL / NOT LAUNCH-READY.** The core engine is solid. Booking, payment, ledger, capacity, idempotency, RBAC and ownership isolation all behaved correctly under adversarial tests.

Several **business-flow defects** stop a real new partner from getting to "live and bookable" without help:

1. **A brand-new Partner cannot be onboarded.** OTP login only ever creates a `CUSTOMER`. No UI or API grants `GYM_OWNER`, so the only partner is the seeded `+919876543211`. (P0 for launch)
2. **An approved gym is invisible to customers.** New branches stay `DRAFT` after admin approval. Neither the partner nor the admin UI says the partner must still click "Activate" on each branch. (P1)
3. **Past time slots are offered as bookable** in the mobile app. The server correctly rejects them, but only with a generic error. (P2)
4. **Expired reservations are never marked `EXPIRED`.** Capacity is released correctly, but they stay `PAYMENT_PENDING` forever in every UI. (P2)
5. **Duplicate branch name returns HTTP 500.** (P2)
6. **The Admin "Simulate development capture" button** relies on `window.confirm()`; see §15. (P3 / note)

**Central question:** *Can a completely new gym be created through the Partner/Admin UI, approved by Admin, and then appear and work in the mobile app without DB inserts?*
**Answer: YES, with caveats.** It works end to end once the partner separately activates each branch (an undiscoverable step). It needs an already-provisioned partner account, because a *brand-new partner* cannot be created.

| Surface | Tested | How |
|---|---|---|
| Admin Panel (http://localhost:3001) | Yes | In-app browser (login, dashboard, gym review, approve, reject, finance, payments, bookings, pending queue) plus API |
| Partner Panel (http://localhost:3002) | Yes | In-app browser (login, create gym, branch, amenities, hours, slot settings, submit, activate, bookings, check-ins, finance, dashboard, responsiveness) plus API |
| Mobile app (Expo, iPhone 17 Pro Max simulator) | Yes | Simulator (restart, session restore, logout, OTP login, location, discovery, gym detail, branch switch, plan, slot, reserve, payment, bookings list and detail) |
| Backend API | Yes | Negative, security, concurrency and idempotency tests |
| Database | Read-only | Relationship, ledger and consistency queries |

---

## 2. Repository Integrity

| | Before QA | After QA |
|---|---|---|
| Branch | `main` | `main` |
| HEAD | `aae80892938ad8e154324d917cbcdefb0cecad4f` | `aae80892938ad8e154324d917cbcdefb0cecad4f` |
| Staged changes | none (0 lines) | none (0 lines) |
| `git diff` sha1 | `beba652152158f24a4f22ad373a7132b0f3139da` | __AFTER_DIFF__ |
| `git status --short` | 19 modified and 5 untracked paths, all **pre-existing** (UI work in admin, partner, mobile and web-ui) | identical, plus this report file |

The pre-existing working-tree changes were present before QA started. They were not touched, staged or committed.

```
SOURCE CODE MODIFIED BY QA: NO
Only file added by QA: GYMRIDE_PHASE_1_10_END_TO_END_QA_REPORT.md
(Helper scripts and API tokens were kept in the session scratchpad, outside the repo.)
```

---

## 3. Environment Status

| Service | Status | Evidence |
|---|---|---|
| PostgreSQL/PostGIS | UP | `/health` → `database: up`; `spatial_ref_sys` present; nearby queries work |
| Redis | UP | `/health` → `redis: up`; OTP, cooldown and lock scripts work |
| Backend (NestJS, :3000) | UP | `GET /api/v1/health` 200; Swagger `/api/docs` 200 (133 routes) |
| Admin (Next.js, :3001) | UP | 307 → /login, then renders |
| Partner (Next.js, :3002) | UP | 307 → /login, then renders |
| Mobile (Expo, :8081) | UP | Metro 200; `com.gymride.customer` running on the iPhone 17 Pro Max simulator |

Infrastructure notes (not application bugs):
- The backend, Metro and Next dev servers run in other terminals, so their stdout was not accessible. Console review used the browser console, simulator logs and HTTP responses.
- Keyboard automation of the Simulator (osascript) is blocked by macOS permissions, so clearing text fields used long-press → Select All.

---

## 4. Test Data Created

All records are prefixed with **QA**. Partner = `+919876543211` (the only GYM_OWNER; see GR-QA-001). Admin = `+919876543210`.

| Entity | Name | Created through | Final status |
|---|---|---|---|
| Gym A | QA IronCore Fitness Bhopal (`3f178857…`) | **Partner UI** | APPROVED (then suspended and reactivated) |
| Gym B (validation) | `QA <script>alert(1)</script> & Co. ñ 💪` | Partner API | DRAFT (stored and rendered escaped: safe) |
| Gym B2 (duplicate) | QA IronCore Fitness Bhopal (second copy) | Partner API | DRAFT: duplicate gym names allowed |
| Gym B3 | QA x | Partner API | DRAFT |
| Gym C (draft/incomplete) | QA Urban Strength Club | Partner API | DRAFT (submit blocked with clear "missing" list) |
| Gym D | QA Elevate Fitness Arena | Partner API + **Admin UI reject** | REJECTED (rejected, resubmitted, rejected again) |
| Gym E | QA Titan Gym Indrapuri | Partner API + Admin API approve | APPROVED |
| Branch | QA IronCore MP Nagar (cap 2, 60-min, window 14 d, min adv 30) | **Partner UI** | ACTIVE (activated via UI) |
| Branch | QA IronCore Arera Colony (cap 5) | Partner API | ACTIVE |
| Branch | QA IronCore Kolar Road (cap 1, Sunday closed) | Partner API | ACTIVE |
| Branch | QA late (added *after* submission, no hours) | Partner API | ACTIVE (see GR-QA-007) |
| Branch | QA Urban Strength Bittan Market | Partner API | DRAFT |
| Branch | QA Elevate Habibganj | Partner API | ACTIVE (under a REJECTED gym) |
| Branch | QA Titan Indrapuri Sector A (min adv 0) / QA Titan Ayodhya Bypass | Partner API | ACTIVE |
| Amenities | MP Nagar: 8 via **Partner UI**; Arera: 3; Kolar: 2; Titan: 2; Elevate: 2 | UI / API | Persisted |
| Operating hours | MP Nagar Mon–Fri 06–23, Sat 07–22, Sun 08–20 via **Partner UI** | UI | Persisted and matches DB |
| Plans | QA Day Pass ₹299 (MP Nagar + Arera), QA Monthly Pro ₹2,499 (all 3), QA Quarterly Strength ₹6,499 (MP Nagar), QA Annual Elite ₹19,999 (MP Nagar + Kolar) | Partner API | ACTIVE |
| Plans | QA Inactive Weekend Pass ₹199 | Partner API | INACTIVE |
| Plans | QA Draft Student Pass ₹999, QA Day Pass (duplicate) | Partner API | DRAFT |
| Plans | QA Elevate Day ₹199, QA Titan Day ₹149, QA Titan Monthly ₹999 | Partner API | DRAFT / ACTIVE / ACTIVE |
| Customers | +919900000101 (C1), …102 (C2), …103, …104 (C4, profile set), …105 | OTP login | ACTIVE CUSTOMER |
| Bookings | 13 QA bookings (see §8 and §12) | Mobile UI (1) + API | CONFIRMED / CANCELLED / REFUNDED / PAYMENT_PENDING / CHECKED_IN / … |
| Refunds | 2 refunds on the Quarterly payment (partial ₹1,000 + remaining ₹5,499) | Admin API | SUCCESS, so booking is REFUNDED |
| Settlements | Titan (₹126.65 net), processed then **reversed**; IronCore (₹2,378.30 net) processed | Admin API | REVERSED / PAID |

Not creatable: a second or third partner (GR-QA-001), plan ARCHIVED status (no transition exists), and per-hour slot capacity (config is per branch only).

---

## 5. Admin Test Results

| # | Scenario | Result | Notes |
|---|---|---|---|
| A1 | Admin OTP login (UI) | PASS | Dev OTP shown; lands on dashboard |
| A2 | Partner phone on Admin login | PASS | "This account does not have access to this console." |
| A3 | Admin session opening a Partner URL | PASS | Redirected to Partner login (per-app sessions) |
| A4 | Dashboard KPIs match DB | PASS | 11 total / 3 awaiting / 3 approved / 5 draft matched exactly at the time |
| A5 | Gym review page shows partner data | PASS | Name, description, every branch, address, amenities, hours per weekday, owner phone, plans with price, branch count and status, audit trail. Slot config is **not** shown (gap) |
| A6 | Approve gym (UI) | PASS | Status → APPROVED; audit GYM_APPROVED |
| A7 | Concurrent approve ×3 (API) | PASS | 1× 201, 2× 409 INVALID_GYM_STATUS_TRANSITION; a single audit row |
| A8 | Approve a DRAFT gym | PASS | 409 |
| A9 | Reject: reason < 10 chars | PASS (server) / FAIL (UI) | Server rejects, but the UI **concatenated** the rejected text with the next attempt, so the stored reason was `"Bad addrAddress verification incomplete…"` (GR-QA-012) |
| A10 | Reject with reason (UI) | PASS | REJECTED; reason visible to partner |
| A11 | Re-reject after resubmission | PASS | Audit trail shows both cycles |
| A12 | Audit trail actor label | FAIL | Partner's GYM_SUBMITTED shown as "· Administrator" (GR-QA-015) |
| A13 | Suspend without reason / with reason | PASS | 400 / SUSPENDED; public detail becomes 404 |
| A14 | Reactivate | PASS | APPROVED; public detail 200 again |
| A15 | Pending review queue | PASS | Empty state "No gyms found" shown when empty |
| A16 | Admin Bookings list | PASS | All QA bookings with slot times in local time. Customer column shows a UUID fragment when the user has no name (GR-QA-020) |
| A17 | Admin Finance overview | PASS | Totals render in INR |
| A18 | Admin Finance → Payments → Simulate capture (UI) | BLOCKED (tool) | Button uses `window.confirm`, which this automated browser auto-dismisses. Verified via the same admin API instead. Payment detail renders **raw JSON** (GR-QA-019) |
| A19 | Refund / settlement UI | NOT TESTED in UI | Executed via the admin API the UI calls (see §12) |
| A20 | Reviews moderation | see §7 / §12 (post-completion) | |

## 6. Partner Test Results

| # | Scenario | Result | Notes |
|---|---|---|---|
| P1 | Partner OTP login (UI) | PASS | |
| P2 | Customer phone on Partner login | PASS (access) / FAIL (side effect) | Access denied correctly, but the OTP verify **creates a CUSTOMER account** for any phone that attempts partner login (GR-QA-016) |
| P3 | "Use another number" | FAIL | The previous OTP or phone value leaks into the next input field (GR-QA-011) |
| P4 | New partner self-registration / onboarding | **FAIL / NOT IMPLEMENTED** | GR-QA-001 |
| P5 | OTP invalid / attempt lock / resend cooldown / rate limit | PASS | 400 INVALID_OTP; locked after 5 attempts (429); 45 s cooldown; 429 rate limit |
| P6 | Create gym (UI) empty name | PASS | Native "required" blocks submit |
| P7 | Create gym (UI) valid | PASS | DRAFT, redirected to the gym page |
| P8 | Gym validation (API): 1 char, 161 chars, 5001-char description, mass-assign `ownerId`/`status` | PASS | 400 with field details; whitelist rejects extra props |
| P9 | Special characters / script tag in gym name | PASS | Stored verbatim, rendered escaped everywhere (no XSS) |
| P10 | Duplicate gym name | FAIL (P3) | Allowed: two "QA IronCore Fitness Bhopal" gyms under the same owner (GR-QA-018) |
| P11 | Submit with no branch (UI) | PASS | Clear "Complete these requirements: Add at least one branch" |
| P12 | Submit with branch but no hours | PASS | 422 `missing: [branch_operating_hours]` |
| P13 | Create branch (UI): bad email / lat 100 / phone 12345 | PARTIAL | Email: native check. Lat: raw Zod text "Too big: expected number to be <=90". Phone: server 400 but UI says only "Request validation failed" with **no field named** (GR-QA-013) |
| P14 | Branch inputs have no accessible labels | FAIL (P3) | All textboxes unlabeled in the a11y tree (GR-QA-021) |
| P15 | Duplicate branch name | **FAIL (P2)** | **HTTP 500 INTERNAL_ERROR** (GR-QA-005) |
| P16 | Branch bad timezone "IST" / short address | PASS | 400 |
| P17 | Amenities select 8 + save (UI) | PASS | DB `branch_amenities` = 8; shown in Admin and Mobile |
| P18 | Amenity catalog | NOTE | No Wi-Fi, Strength Training or Functional Training, yet the mobile filter shows a **Wi-Fi** chip (GR-QA-017) |
| P19 | Operating hours: close before open (UI) | PASS | "Fix the schedule before saving: MONDAY 1 closes before it opens." |
| P20 | Operating hours: split shift, closed day, save (UI) | PASS | Matches DB exactly |
| P21 | Slot settings: invalid (duration 10, capacity 0) | FAIL (P2) | Browser min/max blocked some; the failed save path showed **no validation message**. GET `/slot-config` for an unconfigured branch returns **200 with an empty body** (GR-QA-009) |
| P22 | Slot settings: valid save (UI) | PASS (data) / FAIL (feedback) | Config saved and 241 slots materialized for 14 days within hours. UI still shows "Configure slots first" and no success toast (GR-QA-010) |
| P23 | Kolar Sunday closed | PASS | 0 slots on Sunday |
| P24 | Plans: 0, negative, float, USD, empty name, no branch, foreign branch | PASS | 400/422 with specific messages |
| P25 | Duplicate plan name | FAIL (P3) | Allowed (GR-QA-018) |
| P26 | Plan lifecycle DRAFT→ACTIVE→INACTIVE; invalid transitions | PASS | DRAFT→INACTIVE and ACTIVE→ACTIVE give 409. Error code `PLAN_INACTIVE` is misleading for these (P3) |
| P27 | ARCHIVED plan status | NOT IMPLEMENTED | Enum exists; no endpoint or UI transitions to it |
| P28 | Edit an ACTIVE plan's price | PASS (allowed) | Price change applies immediately; existing bookings keep their snapshot `priceMinor` |
| P29 | Submit for review (UI, double-click) | PASS | One transition. The UI hides actions after submit |
| P30 | Resubmit a PENDING gym | PASS | 409 |
| P31 | Edit gym while PENDING | PASS | 409 GYM_NOT_EDITABLE |
| P32 | Add/edit branches, hours, plans while PENDING | **FAIL (P2)** | All allowed: the partner can change content under review, e.g. set MP Nagar Monday to closed, or add "QA late" with no hours. Those changes went live on approval unreviewed (GR-QA-007) |
| P33 | Branch activation after approval | **FAIL (P1)** | Not prompted; gym invisible until each branch is activated manually (GR-QA-002) |
| P34 | Activate branch without hours / under a REJECTED gym | FAIL (P2) | Both allowed (GR-QA-007) |
| P35 | Partner sees rejection + reason, edits, resubmits | PASS | |
| P36 | Partner bookings (UI) | PASS | Per-gym selector; statuses and amounts correct. API requires `gymId` (403 without it) |
| P37 | Partner dashboard | PARTIAL | Gym and branch counts correct. **No bookings, check-ins or revenue KPIs** despite Phase 5–9 features (GR-QA-022) |
| P38 | Partner finance (UI) | FAIL (UX, P2) | Requires pasting a raw **gym UUID** (GR-QA-014). The API numbers themselves are correct (§12) |
| P39 | Partner check-in page | PASS (UI renders) | QR is **paste-token only**, no camera scanning ("later UX enhancement") |
| P40 | Partner notifications for approval / rejection / suspension | **FAIL (P2)** | None generated; the only partner notification was SETTLEMENT_PAID (GR-QA-008) |
| P41 | Responsiveness 768 px | PASS | Bottom nav; table fits |
| P42 | Responsiveness 390 px | FAIL (P3) | Page width 655 px, horizontal overflow of the filter row and table (GR-QA-023) |

## 7. Mobile Test Results (iPhone 17 Pro Max simulator)

| # | Scenario | Result | Notes |
|---|---|---|---|
| M1 | App restart with a stored session | PASS | Session restored (SecureStore) |
| M2 | Logout | PASS | Returns to phone entry |
| M3 | OTP login, invalid OTP, resend cooldown | PASS | "That code is not valid. Please try again."; "Resend in 44s" |
| M4 | Greeting | FAIL (P3) | "GOOD MORNING, ATHLETE" shown at 1:12–1:34 PM (GR-QA-024) |
| M5 | Location allowed (Bhopal) | PASS | "Near me" lists QA IronCore MP Nagar at 0.0 km |
| M6 | Location denied | PASS | "Location unavailable. City search remains available in Explore." No crash |
| M7 | Location outside coverage (San Francisco) | PASS | Empty nearby, no crash |
| M8 | **Newly approved gym visible** | **PASS** (after branch activation) | Name, description, 4 branches, addresses and amenities match Partner and Admin exactly |
| M9 | Gym cards (Home, Explore, Recommended) | **FAIL (P2)** | Card is ~1,100 pt tall with a stretched image column; the text is off-screen and the "Recommended for you" card looks blank (GR-QA-004) |
| M10 | Search field autocorrect | FAIL (P3) | "IronCore" autocorrected to "Iron ore" (GR-QA-025) |
| M11 | Branch switch → plans | PASS | MP Nagar: 4 plans; Arera: Day + Monthly; Kolar: Monthly + Annual. Exactly the branch assignments; DRAFT and INACTIVE plans hidden |
| M12 | Operating hours on mobile | FAIL (P2) | Only "7 operating days · Asia/Kolkata". **Actual opening times are never shown** (GR-QA-006) |
| M13 | Plan screen | PASS | Correct gym, branch, price and type; "1 day validity" |
| M14 | Slot date entry | FAIL (P3) | Free-text **YYYY-MM-DD** field, no date picker; fast typing dropped characters (GR-QA-026) |
| M15 | **Past slots offered** | **FAIL (P2)** | At 1:27 PM, 6:00 AM onward shown as "5 places available / Select slot". Reserve fails with a generic "Availability or status changed" (GR-QA-003) |
| M16 | Reserve valid slot (UI) | PASS | Booking 115780db… PAYMENT_PENDING, 10-minute countdown |
| M17 | Dev payment → refresh | PASS | "Your workout is confirmed" · Payment SUCCESS |
| M18 | Bookings list and detail | PASS | Upcoming shows Confirmed and Payment Pending with correct price, branch and slot time "24 Sep 2026 at 2:00 PM" |
| M19 | Expired reservation shown as "Payment pending" | FAIL (P2) | See GR-QA-003b |
| M20 | Notification badge | PASS | 8, then 11: matches the API unread count |
| M21 | Profile | PASS | Name, email and notification toggles render; server validates length and email |
| M22 | Reviews empty state | PASS / P3 | Copy says "Try another date, search, or filter." on a reviews list |
| M23 | QR / OTP check-in, completion, review on mobile | __M23__ |

## 8. End-to-End Flow Results

| Flow | Result | Notes |
|---|---|---|
| New partner onboarding | **FAIL** | No path to GYM_OWNER (GR-QA-001) |
| Partner creates gym | PASS | UI |
| Partner adds branch, amenities, hours, slots | PASS | UI, with UX defects |
| Partner creates plans | PASS | |
| Partner submits gym | PASS | UI |
| Admin receives gym | PASS | Dashboard and detail |
| Admin rejects → partner fixes → resubmits | PASS | |
| Admin approves gym | PASS | UI |
| **Mobile discovers gym** | **FAIL → PASS** | Invisible until the partner activates each branch (GR-QA-002) |
| Customer selects branch, plan, slot | PASS | Past slots wrongly offered (GR-QA-003) |
| Customer books | PASS | UI and API |
| Payment | PASS | Dev provider; signature enforced; idempotent |
| QR check-in | PASS | Mobile shows the window 1:45–2:30 PM and generates a QR (180 s countdown). Regenerate invalidates the old token; tampered → 400; customer calling verify → 403; 3 concurrent verifies → 1×CHECKED_IN, 2×409; reuse → 409; QR after check-in → 409; too early → 409 CHECK_IN_TOO_EARLY; membership (no slot) → 409 |
| OTP check-in | PASS | Partner UI 'Fallback OTP' → 'Check-in verified · Qa Customer Four · CHECKED IN'. Wrong OTP → 400; OTP from another booking → 400; reuse → 400; resend inside 30 s → 429 |
| Completion | __COMPLETE__ |
| No-show | __NOSHOW__ |
| Cancellation (payment pending) | PASS | Capacity released |
| Cancellation (confirmed) | NOT IMPLEMENTED | "Only payment-pending bookings can be cancelled in Phase 4" |
| Refund (partial + full) | PASS | Ledger reversal entries correct |
| Settlement → reversal | PASS | Partner summary updates |
| Reviews | __REVIEW__ |
| Notifications (customer) | PASS | BOOKING_CREATED / CONFIRMED / CANCELLED, PAYMENT_CONFIRMED, REFUND_COMPLETED |
| Notifications (partner, gym lifecycle) | FAIL | GR-QA-008 |

## 9. Cross-System Data Validation (Partner → DB → Admin → Mobile)

| Entity | Partner | DB | Admin | Mobile | Match |
|---|---|---|---|---|---|
| Gym name and description | ✓ | ✓ | ✓ | ✓ | ✓ |
| Branch address and coordinates | ✓ | ✓ (numeric, PostGIS distance 0 m / 1,978 m) | ✓ | ✓ (address, km) | ✓ |
| Amenities (MP Nagar, 8) | ✓ | 8 rows | ✓ | 8 chips | ✓ |
| Hours (MP Nagar) | ✓ | `06:00–23:00`… | ✓ per weekday | **only "7 operating days"** | ✗ display gap |
| Hours (Kolar, Sunday closed) | ✓ | is_closed=t | "SUNDAY: Closed" | "6 operating days" | ✓ (count only) |
| Plans and prices | ✓ | paise | ₹ | ₹ | ✓ (₹299 / 2,499 / 6,499 / 19,999) |
| Branch–plan assignment | ✓ | plan_branches | branch counts | per-branch lists | ✓ |
| Slot capacity | 2 | 2 | not shown | "5 places" (Arera cap 5) | ✓ |
| Booking time | 2:00 pm | 08:30Z | 2:00:00 pm | 2:00 PM | ✓ (IST consistent) |
| Payment status | — | SUCCESS | SUCCESS | SUCCESS | ✓ |
| Finance summary | Partner API = Admin API (gross ₹9,297, commission ₹419.70, refunds ₹6,499, net ₹2,378.30) | ledger | ✓ | — | ✓ |
| Stale-cache | Partner edits visible on next fetch in Admin and Mobile; no caching layer observed | | | | ✓ |

Timezone: every surface rendered IST consistently. The API returns UTC ISO, and the Admin payments table shows raw UTC ISO strings (P3).

## 10. Bugs

### P0

**GR-QA-001: A new partner cannot be onboarded (no path to the GYM_OWNER role)**
- Area: Backend / Partner · Affected user: Partner · Reproducibility: Always
- Steps: 1) Open the Partner Panel with a new phone number. 2) Complete the OTP.
- Expected: A self-signup or admin-invite flow creates a partner account.
- Actual: `verifyOtp` upserts the user with the CUSTOMER role only, and the panel says "This account does not have access to this console." No admin endpoint or UI assigns roles. Only `DEV_SEED_OWNER_PHONE` holds GYM_OWNER.
- Evidence: `user_roles`: only `+919876543211` is GYM_OWNER; Swagger has no role or invite route.
- Impact: The platform cannot acquire gyms without manual DB work. Also blocks the "Partner A vs Partner B" tests.
- Suspected area: `auth.service.ts verifyOtp`; missing admin partner-management module.

### P1

**GR-QA-002: An approved gym is not discoverable; branches stay DRAFT with no prompt to activate**
- Area: Partner / Admin / Mobile · Reproducibility: Always
- Steps: Create gym + branch + hours + slots + plan → submit → admin approves → search on mobile.
- Expected: The approved gym appears, or the partner is told to activate branches.
- Actual: `/gyms?search=IronCore` → `[]`, `/gyms/{id}` → 404 GYM_NOT_FOUND, nearby `[]`. Public queries require `branch.status=ACTIVE`. The Partner gym page shows "APPROVED" with every branch "DRAFT" and no guidance, and the Admin detail shows DRAFT branches without a warning. After a manual "Activate" per branch, the gym appears.
- Impact: Every newly approved gym silently stays invisible. It is the main launch funnel.
- Suspected area: approval workflow (`admin approve`), partner gym detail page, `public-gyms.service.ts`.

### P2

**GR-QA-003: Past and in-progress slots are listed as available**
- Area: Backend / Mobile · Always
- Steps: At 13:27 IST, open Slots for today.
- Actual: `/branches/{id}/availability?date=today` returns 06:00+ slots with `status: AVAILABLE, available: 5`. Mobile shows "Select slot". Reserve → 409 BOOKING_WINDOW_CLOSED, shown as "Availability or status changed. Refresh and try again."
- Expected: Past slots and slots inside `minimumAdvanceMinutes` are hidden or disabled.
- Suspected area: `slots.service` availability query (no `start_at > now() + minAdvance` filter).

**GR-QA-003b: Expired reservations never transition to EXPIRED**
- Steps: Create a booking and don't pay for 10 minutes.
- Actual: DB `status=PAYMENT_PENDING`, `reservation_expires_at < now()`. Payment is correctly blocked (409 RESERVATION_EXPIRED) and capacity is released, but Mobile "Upcoming", Partner and Admin all show "PAYMENT PENDING" indefinitely. 2 such rows at audit time.
- Suspected area: expiry sweeper (`BOOKING_QUEUE_ENABLED=false`) or lazy status sync on read.

**GR-QA-004: Mobile gym cards render ~1,100 pt tall; text is hidden and "Recommended" looks empty**
- Area: Mobile (Home Nearby, Explore results, Recommended) · Always
- Evidence: Screenshots show an image column stretched full-height with the title vertically centred far below the fold. The Recommended card shows only an image and a blank area.
- Suspected area: `components/ui.tsx` / `gym-visuals.ts` card styles (uncommitted working-tree changes).

**GR-QA-005: Duplicate branch name → HTTP 500**
- `POST /partner/gyms/{id}/branches` with an existing name → `500 INTERNAL_ERROR "An unexpected error occurred"`. Expected 409 with a clear message. The partner UI would show a generic error.
- Suspected area: unhandled Prisma P2002 in `branches.service`.

**GR-QA-006: Mobile never shows actual operating hours** (only the count of operating days).

**GR-QA-007: Content under review, or not ready, can go live unreviewed**
- While PENDING_APPROVAL the partner can add branches, change hours and edit plans (gym PATCH is locked, children are not). A branch with no hours ("QA late") and a branch of a REJECTED gym ("QA Elevate Habibganj") can both be set ACTIVE. "QA late" appears on mobile with no hours and no slots.

**GR-QA-008: No partner notification for gym approved, rejected or suspended.**

**GR-QA-009: Slot settings: failed save shows no validation error; GET slot-config returns 200 with an empty body** (clients calling `.json()` fail).

**GR-QA-010: Slot settings: successful save gives no feedback, and the preview still says "Configure slots first".**

**GR-QA-012: Admin reject dialog keeps the previously rejected text**, so the final reason stored was "Bad addrAddress verification incomplete…".

**GR-QA-013: Partner forms show generic "Request validation failed" or raw Zod messages instead of field-level errors.**

**GR-QA-014: Partner Finance requires pasting a raw gym UUID** instead of a gym picker (the Bookings page has one).

**GR-QA-016: Any phone attempting Partner or Admin login gets a CUSTOMER account created** (user enumeration and account pollution; 12 users now vs 7 at start, including +919900000103 created only by a failed partner login).

### P3

- **GR-QA-011** "Use another number" leaks the previous OTP or phone into the next field (Partner and Admin login).
- **GR-QA-015** Audit trail labels the partner's GYM_SUBMITTED as "Administrator"; admin API returns `actor.firstName=null`.
- **GR-QA-017** Mobile filter offers "Wi-Fi", which is not in the amenity catalog. The catalog also lacks Strength Training and Functional Training.
- **GR-QA-018** Duplicate gym names and duplicate plan names are allowed within one owner.
- **GR-QA-019** Admin payment detail dumps raw JSON; the payments table shows raw UTC ISO timestamps.
- **GR-QA-020** Admin and Partner booking tables show "Customer" or a UUID fragment instead of name or phone.
- **GR-QA-021** Partner branch form inputs have no accessible labels.
- **GR-QA-022** Partner dashboard lacks bookings, check-in and revenue KPIs.
- **GR-QA-023** Partner web at 390 px width overflows horizontally.
- **GR-QA-024** Mobile greeting "Good morning" in the afternoon.
- **GR-QA-025** Search input has autocorrect enabled.
- **GR-QA-026** Slot date is a free-text YYYY-MM-DD field.
- **GR-QA-027** Plan transition errors reuse the `PLAN_INACTIVE` code for DRAFT→INACTIVE and ACTIVE→ACTIVE.
- **GR-QA-028** Reviews empty state copy says "Try another date, search, or filter."

## 11. Security / RBAC Findings

| Test | Result |
|---|---|
| Customer → `/admin/*` (gyms, finance, bookings, reviews, flex) | 403 ✓ |
| Customer → `/partner/*`, create gym | 403 ✓ |
| Partner → `/admin/*` | 403 ✓ |
| Partner → admin refunds / settlements / payment simulate | 403 ✓ |
| Partner → partner finance `refunds` / `ledger` resources | 403 "restricted to admins" ✓ |
| Partner A → gym owned by another user (Phase 8 Emulator Gym): GET/PATCH gym, branches, slot-config, hours, amenities, availability, plans, deactivate plan, create plan/branch, finance, bookings, flex participation | all 404/403 ✓ (no leakage) |
| Customer C2 → C1's booking: read / pay / QR | 404 ✓ |
| Customer → admin payment simulate | 403 ✓ |
| Mass assignment (`ownerId`, `status` on gym; `roles` on profile) | 400 "property should not exist" ✓ |
| Invalid / tampered JWT | 401 ✓ |
| Payment verify with forged signature | 400 INVALID_PAYMENT_SIGNATURE ✓ |
| Unsigned payment webhook (development and razorpay) | 400 ✓ |
| XSS in gym name | escaped in Admin, Partner and Mobile ✓ |
| OTP brute force | locked after 5 attempts; per-phone and per-IP rate limit ✓ |
| Account creation side effect on failed console login | ✗ GR-QA-016 |
| Separate second partner account | BLOCKED (GR-QA-001); ownership was tested against an existing gym with a different owner |

## 12. Financial Validation

Commission = **15 %** (e.g. ₹299 → commission ₹44.85, gym earning ₹254.15).

| Check | Result |
|---|---|
| Payment init idempotent (2 calls → same payment id) | PASS |
| Concurrent simulate ×3 | PASS: one capture, one ledger set (3 entries per payment, balanced) |
| Booking CONFIRMED only after capture | PASS |
| Capacity: 4 concurrent on a capacity-2 slot | PASS: 2 created, 2 SLOT_FULL; availability 0 |
| Same Idempotency-Key replay | PASS: same booking returned |
| Refund > captured amount / 0 / negative | PASS: 409 / 400 / 400 |
| Partial refund ₹1,000, then replay with same key | PASS: idempotent; different amount with the same key → 409 IDEMPOTENCY_KEY_CONFLICT |
| Refund remainder ₹5,499 → booking REFUNDED; further refund blocked | PASS |
| Refund of a settled earning | PASS: blocked "controlled settlement reversal is required first" |
| Ledger per refund | PASS: provider_clearing −, gym_payable −85%, platform_revenue −15% |
| Settlement: open period rejected; empty period rejected | PASS |
| Settlement process ×3 concurrent | PASS: all return PAID, single payout |
| Settlement reversal, then reverse again | PASS / 409 |
| Partner summary vs Admin summary (IronCore, Titan) | **IDENTICAL** |
| Reconciliation report | PASS: `findings: []` |
| Ledger append-only | PASS: reversal adds `SETTLEMENT_REVERSAL +12,665`; no updates observed |
| Customer cancellation of a CONFIRMED booking / customer refund request | NOT IMPLEMENTED (Phase 4 rule) |
| Failed payment | NOT TESTABLE via UI; the dev provider has no "fail" simulation. Forged signature and unsigned webhook both rejected |

IronCore totals: gross ₹9,297 (299 + 2,499 + 6,499); commission ₹419.70; refunds ₹6,499; net ₹2,378.30, settled PAID. Titan: ₹149 gross, ₹22.35 commission, ₹126.65 net, settled and then reversed (pending ₹126.65 again).

## 13. Mobile UX Findings
Oversized cards (GR-QA-004), no opening hours (006), past slots selectable (003), stale "Payment pending" (003b), text date entry (026), autocorrect on search (025), morning greeting (024), Wi-Fi chip (017), generic empty-state copy (028). The booking-list cards don't show the slot time (the detail screen does). The branch list includes an empty-hours branch ("QA late").

## 14. Web UX Findings
No activation guidance after approval (002), generic or raw validation text (013), no slot-save feedback (010), reject reason concatenation (012), OTP/phone field leakage (011), UUID-only finance filter (014), raw JSON payment detail (019), customer shown as UUID (020), unlabeled inputs (021), 390 px overflow (023), audit actor label (015), partner dashboard without operational KPIs (022). Admin review does not show slot configuration.

## 15. Console / Runtime Errors
- Browser console (Admin/Partner): only HMR and DevTools info. No uncaught exceptions observed.
- `window.confirm` dialogs (Admin simulate capture, Partner submit/activate). The automated browser auto-dismisses `confirm()`; for real users it's a native dialog. Noted as a UX and automation limitation, not a defect.
- Backend: one **500** (duplicate branch, GR-QA-005). All other errors returned structured `{code,message,details,requestId}`.
- Mobile: a Metro reload was accidentally triggered by keystrokes sent to the dev client (tester artifact). No red-box errors seen.
- Backend and Metro stdout were not accessible (servers run in other sessions).

## 16. Untested / Blocked Scenarios

| Scenario | Status | Reason |
|---|---|---|
| 3 partners, Partner A vs Partner B | BLOCKED | GR-QA-001: no way to create partners. Ownership was tested against an existing gym owned by another user |
| Expired OTP (5-min TTL) | NOT TESTED | "OTP expired or not requested" path verified with an unrequested phone; did not wait for the TTL |
| Access-token expiry (15 min) | PASS (indirect) | Refresh-token rotation used throughout; reuse-detection code reviewed, not attacked |
| Real payment failure / cancel / retry | NOT TESTABLE | Dev provider has no failure simulation; Razorpay not configured |
| Customer-initiated cancel of a paid booking / refund request | NOT IMPLEMENTED | Server rule: only PAYMENT_PENDING can be cancelled |
| Plan ARCHIVED | NOT IMPLEMENTED | No transition |
| Per-hour slot capacity, disabled individual slot | NOT IMPLEMENTED in UI | Branch-level capacity plus availability exceptions only |
| Push notifications to a device | NOT TESTABLE | Simulator without push credentials; in-app notifications verified |
| Network-offline behaviour on mobile | NOT TESTED | |
| Orientation change | NOT TESTED | |
| Flex subscription flows (Phase 9) | NOT TESTED in depth | Out of the central lifecycle; endpoints exist |
| Backend/Metro log review | BLOCKED | Server processes run in other terminals |

## 17. Final Launch Readiness Matrix

__MATRIX__
