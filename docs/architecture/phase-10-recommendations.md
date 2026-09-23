# Phase 10 — Deterministic Recommendation Engine

Phase 10 answers “which valid branches are most relevant for this authenticated customer now?” without AI, embeddings, sensitive profiling, paid placement, or arbitrary customer identifiers.

## Architecture and hard filters

`RecommendationCandidateService` generates a bounded set of valid branches in PostgreSQL. `RecommendationPolicy` scores them. `RecommendationService` loads optional preferences and active Flex context, ranks deterministically, applies light brand diversity, and returns public fields plus controlled reason codes.

Candidates require an `APPROVED` gym, `ACTIVE` branch, and active branch-linked plan. Explicit city, PostGIS radius, amenities, plan type, and `flexOnly` are SQL hard filters. Candidate retrieval is capped at 200 and uses batched SQL aggregates. Location uses `ST_DWithin` and `ST_Distance`; without GPS the selected city, then active Flex primary city, is used. With none, platform-wide cold start remains available.

## Score and weights

The score is an integer from 0–100. Central weights in `recommendation.policy.ts` sum to 100:

| Signal | Weight | Normalization |
| --- | ---: | --- |
| Distance | 25 | Linear decay from 100 to 0 at the radius; neutral 50 without GPS |
| Rating | 15 | Bayesian confidence toward 4.0, using `count / (count + 10)` |
| Amenities | 10 | Requested/preferred match ratio; neutral 50 without preferences |
| Price fit | 10 | 100 inside the range, proportional decay outside |
| Slot availability | 15 | 100 for a capacity-backed slot in the desired ±2-hour window |
| History | 10 | 40 for discovery; completed-visit affinity starts at 60 and caps at 80 |
| Flex | 10 | 100 for eligible active entitlement; neutral 50 for non-subscribers |
| Time compatibility | 5 | 100 open, 0 closed, neutral 50 without desired time |

Example with actual weights: distance 90, rating 85, amenities 100, availability 80, price 70, history 50, Flex 100, time 100 gives `(90×25 + 85×15 + 100×10 + 80×15 + 70×10 + 50×10 + 100×10 + 100×5) / 100 = 84.25`, returned as **84**.

Ties use distance then branch UUID. Diversity prevents three consecutive branches of one gym when an alternative exists, without introducing invalid candidates.

## Signals and reasons

Ratings use published reviews only. Popularity is completed bookings over 30 days. History uses completed visits and is bounded to retain discovery. Price uses active plans, never financial-account data. Availability checks slot status, capacity, and occupied bookings. Desired-time opening uses branch timezone and operating hours.

Reason codes are `NEAR_YOU`, `HIGHLY_RATED`, `MATCHES_AMENITIES`, `FITS_BUDGET`, `AVAILABLE_AT_PREFERRED_TIME`, `FLEX_ELIGIBLE`, `PREVIOUSLY_VISITED`, and `POPULAR_WITH_CUSTOMERS`. Mobile maps these to controlled copy.

## Preferences, privacy, Flex, and caching

`CustomerGymPreference` stores only amenity codes, plan type, workout hour, radius, and price band. JWT identity is authoritative. Explicit filters override stored preferences and history. DTO and database constraints bound all values; unknown amenities and inverted budgets are rejected. The recommendation endpoint is limited to 30 requests/minute.

No health, body, card/bank, passive location trail, message, or cross-customer data is used. Impressions are not persisted because existing booking events provide outcomes without extra tracking.

Flex boosting requires an unexpired active subscription, active period, remaining total entitlement, selected-city match, and enabled participation. `flexOnly` is a hard filter. Results are not cached initially, so preference, review, Flex, status, plan, and slot changes apply on the next request.

## API, mobile, and fallback

- `GET /api/v1/recommendations/gyms`
- `GET /api/v1/users/me/gym-preferences`
- `PATCH /api/v1/users/me/gym-preferences`

Home shows real recommendations. Explore retains normal discovery and adds recommendations using its explicit context. Preferences are optional. Recommendation failure does not disable discovery.

## Query plan and validation

A representative PostgreSQL/PostGIS `EXPLAIN ANALYZE` used `gym_branches_location_gist_idx`; the isolated fixture returned 10 branches in 11.938 ms. This confirms index selection and bounded shape, not production latency. Phase 10 also adds `reviews(gym_id, status, created_at)`.

Unit tests cover score signals, determinism, reasons, and mobile contracts. Runtime tests cover PostGIS distance, filters, inactive entities, cold start, ratings, Flex, and preferences. Phase 11 may consume the structured candidates/scores/reasons, but Phase 10 makes no AI calls.
