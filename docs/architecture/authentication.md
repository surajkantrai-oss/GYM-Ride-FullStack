# Authentication and session architecture

## OTP login

```text
Client -> POST /auth/otp/request -> normalize E.164 phone
       -> Redis cooldown/window limits -> cryptographic 6-digit OTP
       -> HMAC challenge in Redis (5-minute TTL) -> provider delivery

Client -> POST /auth/otp/verify -> atomic Redis Lua verification
       -> consume challenge -> find/create CUSTOMER -> create refresh session
       <- short-lived access token + rotating refresh token
```

Redis stores an HMAC, attempt counter, and TTL—not the raw OTP. Verification is atomic, so concurrent requests cannot replay the same challenge. Defaults are five attempts, a 45-second resend cooldown, and five requests per phone per hour; all values are configurable. Development returns `developmentOtp` only when `NODE_ENV=development`. Other environments fail closed until a real `OtpProvider` is configured; no OTP is logged.

Access JWTs contain only `sub`, `roles`, `sessionId`, `tokenType`, and standard JWT timestamps. They expire after 15 minutes by default. Refresh JWTs expire after 30 days; only their SHA-256 digest is persisted. Every refresh atomically replaces the digest. Reuse of a rotated token revokes the session. Logout revokes one session; logout-all revokes all user sessions.

Web clients should keep access tokens in memory and use a hardened server/BFF or secure cookie strategy appropriate to their architecture. React Native should use platform Keychain/Keystore-backed secure storage. Neither client should use unprotected local storage for refresh tokens.

Global `UserRole` grants platform capability. `GymMembership` limits managers and staff to a gym or branch. A role never implies access to every resource.
