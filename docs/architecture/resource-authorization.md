# Resource authorization

Authentication answers who the user is. `UserRole` answers which platform capabilities they may attempt. `GymMembership` and ownership answer which concrete records they may access.

`GYM_OWNER` does not mean owner of every gym. Owner routes derive `ownerId` from the authenticated identity and compare it server-side. `GYM_MANAGER` requires an active gym-wide or branch assignment. Staff is modeled but intentionally receives no Phase 2 management endpoints.

Private lookups return 404 for inaccessible gyms and branches, preventing attackers from distinguishing another owner's identifier from a nonexistent one. Admin and super-admin bypass resource membership only on explicitly admin-capable operations. Client-supplied `ownerId`, gym IDs, and branch IDs are never accepted as authorization evidence.
