# API guidelines

- Public endpoints are URI-versioned under `/api/v1`; Swagger is served at `/api/docs` outside versioning.
- JSON uses `camelCase`. Resource names are nouns. UTC timestamps use ISO 8601.
- Success responses return the resource directly. Collections use `{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0 } }`.
- Errors use `{ "success": false, "error": { "code", "message", "details?" }, "timestamp", "path", "requestId" }`. Internal stacks, SQL, infrastructure names, credentials, and secrets are never returned.
- DTOs are transformed and validated. Unknown properties are rejected. Use conventional HTTP status codes.
- Every response exposes `x-request-id`; clients may supply one with at most 128 characters. Structured logs include it but redact authorization, cookies, passwords, OTPs, and tokens.
- Phase 2 adds bearer authentication and server-side role, permission, ownership, and branch-assignment checks.
- Mutations that can be retried—especially booking and financial operations—will accept idempotency keys and store atomic outcomes.
- Monetary values use integer minor units (for example ₹199.00 as `19900` paise), or database decimals where a domain requires them; never use JavaScript floating point for money.
- Pagination defaults and maximums must be server-controlled. Stable cursor pagination is preferred for high-change datasets.
