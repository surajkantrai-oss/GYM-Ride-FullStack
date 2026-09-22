# Gym lifecycle

```text
GYM_OWNER:  DRAFT ──submit──> PENDING_APPROVAL
            REJECTED ─submit─> PENDING_APPROVAL

ADMIN:      PENDING_APPROVAL ─approve─> APPROVED
            PENDING_APPROVAL ─reject──> REJECTED
            APPROVED ─suspend─────────> SUSPENDED
            SUSPENDED ─reactivate─────> APPROVED
```

Owner edits are allowed only in `DRAFT` and `REJECTED`. Owners cannot approve themselves or remove suspensions. Submission requires at least one branch and operating hours for every branch. Rejection and suspension require a reason. Every transition is validated and committed atomically with an immutable audit record.

Only approved gyms with active branches appear in public discovery. Gym and branch records use status changes instead of destructive deletion so later bookings and payments can retain history.
