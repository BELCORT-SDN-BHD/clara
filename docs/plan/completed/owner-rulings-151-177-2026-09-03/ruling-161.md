# 裁-161 — OD-12: PURGE BOTH — every test auth user in `auth.users` AND every object in Storage — at FS-11, after the backup + restore-proof and the reset, before the walk. (Owner ruled AGAINST the "leave Storage" half.)

**Ruled 2026-09-03 ≈20:4x MYT (owner, AskUserQuestion), verbatim:** 「都清，沒有real user now ， all test user and 資料now」.

**Owner's ground (recorded as stated).** No real user exists; every account and every uploaded byte
is test data — constraint 14 (ADR-0075) makes it resettable.

**Recommendation partly declined (dissent filed on the Storage half):** purge the test auth users,
LEAVE the Storage objects. Consequence stated once: the Storage delete is an irreversible act on a
vendor surface with no repo runbook; done once, at the worst hour.

**The sharpened execution (the owner's choice, made safe):**
1. **Order inside FS-11:** step 2 backup → step 2b/OD-14 restore-proof → step 4 reset (`DROP SCHEMA
   clara CASCADE`) → **NEW step 4b: the auth purge + the Storage purge** → step 5 migrate … → step 13
   the walk. Never before the restore-proof.
2. **Auth purge:** delete ALL rows in `auth.users` for the project (dashboard: Authentication → Users;
   or the Management/Admin API under the owner's key). The owner's own login is re-created by the
   self-serve walk (裁-159), so the walk address may be the owner's normal address. Record the
   count before and `0` after.
3. **Storage purge:** delete the OBJECTS in every bucket (`firm-docs` and any sibling) — **never the
   bucket itself, never its policies** (bucket RLS/policies are a mechanism under test; constraint
   14's operative clause). Record the object count before and `0` after — DR probe `4.10`'s
   baseline is then zero, not an orphan count.
4. **Actor:** [O] — the owner in the Supabase dashboard, OR the lead via the Management API with a
   token passed env-to-env (never printed) under this ruling; the as-run names which.
5. Storage bytes are NOT in the Postgres dump (`docs/ops/DR-full-drill.md:149-157`); the purge is
   accepted as unrecoverable test data on the record.

**Record.** Ledger `-09-03` (with the dissent line) + digest row at the final truing; FS-11 prep D-3
carries it; the Wave-G checklist gains the 4b line at the final truing.
