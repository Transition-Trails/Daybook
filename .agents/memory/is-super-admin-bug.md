---
name: isSuperAdmin legacy bug
description: roles.ts isSuperAdmin() had a role==="owner" fallback that treated ALL store owners as platform super admins — a security hole that bypassed all store scoping
---

## The Rule
`isSuperAdmin` in `lib/roles.ts` must check `user.platformRole === "super_admin"` only.
The old `|| user.role === "owner"` fallback is removed.

**Why:** All store owners have `user.role = "owner"` (same as platform super admins). The fallback was originally for "backward compatibility" but made every store owner a platform super admin — bypassing all `requireStoreAccess` guards and `assertSameStore` checks. Every platform super admin already has `platformRole: "super_admin"` in the seed and in production, so the fallback was never needed.

**How to apply:** Any time you add a new `isSuperAdmin` check or see the legacy fallback re-introduced, remove the `user.role === "owner"` clause. The seed's platform admins (`u-owner`, `u-sa`) both have `platformRole: "super_admin"` — they are not affected by this change.
