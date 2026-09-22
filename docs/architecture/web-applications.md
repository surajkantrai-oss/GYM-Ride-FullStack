# Web applications

## Boundaries

Phase 3 contains two independently deployable Next.js App Router applications. `frontend/admin-panel` serves platform administrators on port 3001. `frontend/partner-panel` serves gym owners and managers on port 3002. They share types, validation, session primitives, and visual building blocks but have separate entry points, navigation, authorization policy, and release artifacts.

Both applications call the Phase 2 NestJS API directly through `@gymride/api-client`. The base URL is supplied by `NEXT_PUBLIC_API_BASE_URL`; application code contains no environment-specific production endpoint.

## Authentication and browser storage

The access token exists only in JavaScript memory. The rotated refresh token is stored in namespaced `sessionStorage`, allowing restoration after a same-tab reload while ensuring a closed tab does not leave a persistent session. Tokens are never written to `localStorage` or URLs.

This is a pragmatic direct-API design, not an XSS boundary: successful script injection could still read `sessionStorage`. The applications therefore render React text normally, do not use `dangerouslySetInnerHTML`, and keep dependencies constrained. A later BFF deployment may place the web refresh credential in a Secure, SameSite, HTTP-only cookie while the existing bearer-token endpoints remain available for mobile clients.

On startup, the provider attempts one refresh and then loads `/users/me`. Until both steps complete, protected content shows a neutral loading state. The Admin application accepts `ADMIN` and `SUPER_ADMIN`; Partner accepts `GYM_OWNER`, `GYM_MANAGER`, plus administrator roles. A mismatched role clears the local session and produces an access-denied state.

## API client and refresh concurrency

Every request receives a generated `x-request-id`, normalized `ApiError`, JSON headers when needed, and the current bearer token. A 401 triggers one refresh attempt and one replay. Concurrent failures share the same in-flight refresh promise, preventing refresh-token rotation races. Refresh failure clears both credentials and redirects protected pages to login.

## Data and forms

TanStack Query owns server state and invalidation. Query keys are scoped by role, resource, filters, and pagination. Search and pagination live in the URL so directory views are repeatable and browser navigation works normally. React Hook Form and shared Zod schemas validate OTP, gym, branch, reason, and profile forms. The operating-hours editor adds domain validation for closing-before-opening and overlapping split shifts before making a replacement request.

No production screen uses fabricated dashboard data. Loading, failure, and empty states are explicit; mutations report through an accessible toast region and consequential transitions require confirmation.

## Route map

Admin: `/login`, `/dashboard`, `/gyms`, `/gyms/pending`, `/gyms/[gymId]`, `/profile`.

Partner: `/login`, `/dashboard`, `/gyms`, `/gyms/new`, `/gyms/[gymId]`, `/gyms/[gymId]/edit`, branch list/create/detail/edit, branch amenities, branch operating hours, and `/profile`.

## Deferred scope

Plans, slots, bookings, payments, wallets, settlements, mobile screens, check-ins, reviews, notifications, Flex, recommendations, AI, and Azure deployment are intentionally not part of Phase 3.
