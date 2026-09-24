# GYMRide UI/UX Redesign

## Scope and constraints

This redesign covers the Admin Portal, Partner Portal, and customer mobile app through Phase 10. It changes presentation and interaction hierarchy only. Backend code, database schema, migrations, API contracts, authentication, payments, booking, check-in, Flex, and recommendations remain unchanged.

## Screen inventory and treatment

### Admin Portal

| Route | Current function | Redesign treatment |
| --- | --- | --- |
| `/login` | OTP authentication | Split editorial brand panel and focused secure form |
| `/dashboard` | Gym status summary | Clear page action, responsive KPI cards, operational focus panel |
| `/gyms`, `/gyms/pending` | Gym inventory/moderation | Dense filters, readable data tables/cards, semantic statuses |
| `/gyms/[gymId]` | Gym review/detail | Two-column detail hierarchy, reason and audit treatments |
| `/bookings`, `/bookings/[bookingId]` | Booking operations | Scannable status, filters, immutable detail grouping |
| `/reviews` | Review moderation | Compact filters, moderation states, safe confirm dialog |
| `/finance` | Payments/refunds/ledger/settlements | KPI-first finance workspace, tab group, detail surfaces |
| `/flex` | Flex administration | Policy/member/reimbursement information hierarchy |
| `/profile` | Admin identity | Focused account detail card |

### Partner Portal

| Route | Current function | Redesign treatment |
| --- | --- | --- |
| `/login` | OTP authentication | Shared branded secure login experience |
| `/dashboard` | Gym/branch summary | KPI cards and prominent next-best action |
| `/gyms` and nested routes | Gym, branch, plan, amenity, hours and slot management | Consistent headers, forms, cards, breadcrumbs, states |
| `/bookings`, `/bookings/[bookingId]` | Authorized booking view | Search/filter toolbar and structured booking detail |
| `/check-ins` | Staff verification | Clear credential input and outcome states |
| `/reviews` | Read-only customer feedback | Filterable review cards and aggregate hierarchy |
| `/notifications` | Partner inbox | Read/unread clarity and resilient empty/error states |
| `/finance` | Earnings and settlements | Summary metrics, transaction tables, auditable details |
| `/flex` | Flex operations | Membership/use/reimbursement visibility without new controls |
| `/profile` | Partner identity | Focused account detail and role context |

### Customer mobile

| Screen | Current function | Redesign treatment |
| --- | --- | --- |
| Login | OTP sign-in | Warm onboarding typography, accessible inputs, strong primary CTA |
| Home | Nearby, recommendations, bookings, discovery | Welcome badge, stronger sections, content cards, clearer action priority |
| Explore | Search/location/filtering | Touch-friendly filters, consistent results and empty states |
| Gym / Plan / Slots | Gym-to-plan discovery | Editorial detail hierarchy, price and availability emphasis |
| Review booking / Payment | Reservation confirmation and checkout | Summary-first content and explicit server-verification messaging |
| Bookings / Booking detail | Booking history and status | Semantic badges, compact workout cards, prioritized next action |
| Check-in | QR/OTP credential | Elevated credential surface, timer and fallback clarity |
| Review submission / Gym reviews | Rating and public feedback | Structured rating, fields, reviewer cards, pagination hierarchy |
| Notifications | In-app center | Read-state hierarchy, empty/error/loading consistency |
| Flex | Eligibility and Flex booking | Membership status and coverage explanation hierarchy |
| Preferences | Recommendation preferences | Accessible grouped fields and save state |
| Profile | Identity, push preferences, logout | Grouped profile and notification settings with destructive hierarchy |

## UX audit fixes

- Replaced undifferentiated portal navigation with active route feedback and recognizable icon marks.
- Added desktop context/account header and a usable small-screen bottom rail.
- Increased input and touch target sizes and strengthened keyboard focus visibility.
- Unified inconsistent status colors and made them readable without relying on color alone.
- Reduced visual weight of secondary mobile actions so the next step is easier to identify.
- Standardized loading, empty, and error surfaces across platforms.
- Improved table scanability, card grouping, responsive layouts, dialogs, and toast feedback.
- Added reduced-motion support and retained semantic labels/roles.

## Approved-reference replication pass

The follow-up implementation compared the running product directly against approved Concept 04 and Concept 05 references. It replaced the remaining demo-like compositions with compact icon KPIs, real-data status visualization, image-led Partner portfolio cards, Admin table thumbnails, friendly mobile filter chips, image-led gym results, a photographic Home hero, structured Gym Details sections, real booking tabs, a profile identity card with switches, and a premium Flex membership card. Recommendation score remains unchanged internally but is visually secondary to human-readable reason labels.

## Responsive behavior

Portal layouts use a persistent rail on desktop and a horizontally scrollable bottom navigation on small screens. Grids collapse to a single column, action headers stack, forms collapse, and wide tables remain safely scrollable. Mobile screens use native safe areas, flexible scrolling, and platform navigation bars.

## Validation approach

Validation covers lint, typecheck, standard tests, PostgreSQL runtime tests, portal builds, mobile bundle/native builds, and visual checks of authenticated and unauthenticated states. Development data comes only from existing APIs and seed data.
