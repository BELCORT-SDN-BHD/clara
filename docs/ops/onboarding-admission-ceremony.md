# The onboarding admission ceremony (temp-admin commit lane)

> **Ruling WB-R22 (ADR-037, 2026-07-24).** This is the ruled commit lane for client
> onboarding when no standing non-contributor admin exists — the commonest small-firm
> shape (owner + one bookkeeper). The dashboard's F15 refusal card links here.
> Widened self-attestation is REJECTED; the future target is a scoped
> review-attestation capability (reviewer ≠ activator, zero standing privilege).

## When you land here

The plan page's commit gate refused with one of:

- **`distinct_checker` (CLR05)** — you contributed to this onboarding (opened it or
  substantively answered plan items), so you cannot also approve it. A DIFFERENT,
  non-contributing admin must commit.
- **admin floor (CLR04)** — the would-be checker is a bookkeeper; committing an
  onboarding (it seeds opening balances — money) requires admin authority.

Both refusals are the maker-checker invariant working, not a bug.

## The cleanliness precondition (read this first)

The person you elevate must be a **substantive NON-contributor to THIS client's
onboarding**: they did not open it and did not answer plan items for it.
**ANY substantive contributor is disqualified** — promoting a contributor to admin
does not help; the CLR05 contributor exclusion still refuses them
(probed: `wb-r2.test.mjs` [R2-F4]).

- Owner opened + bookkeeper stayed clean → **elevate the bookkeeper** (two-person lane).
- Owner opened + bookkeeper answered → **a third human is required.** Plan the next
  onboarding so the intended checker stays clean.

## The ceremony (all four steps are audited, op-keyed governed fns)

1. **Verify cleanliness** — confirm the candidate neither opened the plan nor answered
   any of its items (the plan page's contributor record; when in doubt, ask them).
2. **Elevate:** `select clara.add_member(p_firm, p_user, 'admin', p_op_key)` — run as
   the firm owner (authenticated lane). Record why in the op note if prompted.
3. **Commit:** the elevated checker signs in, opens `/clients/plan?client_id=…`,
   reviews the **intended-vs-actual deltas card**, and runs the commit
   (the distinct-checker ceremony — dry-run first if offered, then commit).
4. **Revert IMMEDIATELY:** `select clara.remove_member(p_membership, p_op_key)` —
   the elevation must not outlive the ceremony. A lint watch on admin grants not
   reverted within 24h is a recorded follow-on (ADR-037); until it ships, the revert
   is on you.

There is no dashboard member-management surface yet — steps 2 and 4 are owner-run
governed RPCs (PostgREST authenticated lane), exactly as the DB battery probes them.

## Never

- Never skip step 4 — a standing admin who only exists for ceremonies is standing
  privilege, the thing this lane is designed to avoid.
- Never work around a CLR05/CLR04 refusal any other way (no self-attestation
  widening, no direct row edits — the refusals are structural and correct).
- Never elevate someone who contributed — it will refuse anyway, and attempting it
  pollutes the audit trail with a failed ceremony.

## References

- Ruling record: `docs/plan/research/wave-b/ruling-batch-adr-037.md` (WB-R22).
- Contract annotation: `docs/plan/wave-b-contract.md` §6.
- The probed lawful flow: `packages/db/tests/wave-b/wb-r2.test.mjs` ([R2-F4]).
- Governed verbs: `clara.add_member` / `clara.remove_member`
  (`packages/db/migrations/0004_governed_fns.sql:400,457`, patched 0005).
