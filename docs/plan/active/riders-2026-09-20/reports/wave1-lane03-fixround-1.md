# Wave 1 — Lane 03 fix round 1

Branch `riders/w1-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, DB `clara_l03` @
`127.0.0.1:55743`. Head going in: `6219a61c` (unchanged from the review). Head coming out:
**`efdea055`**.

New commits (on top of `6219a61c`):

- `e985085a` — `fix(db): #845 fix round 1 — non-delegating spy, widened reset( predicate, CI-leg gap named`
- `1ea21b05` — `fix(db): #844 fix round 1 — renumber the colliding os.15 cell to os.19`
- `efdea055` — `fix(db): #884 fix round 1 — assert the refusal's account code on DETAIL, not detail-or-message`

Source: `docs/plan/active/riders-2026-09-20/reports/wave1-lane03-review-spec.json`
(`verdict: accept-with-fixes`). All five findings addressed; none refuted, none deferred.

## L03-S1 (ticket #845, major) — FIXED

**Claim.** The acceptance-2 "non-delegating" spy in `reset-gate-routing.test.mjs` actually
delegated to the real `scripts/reset.mjs` export it wrapped
(`const wrapped = async (...args) => { spy.entered += 1; return realReset(...args); };`), while
both the code comment and the report called it non-delegating. With both destructive flags set
and `PGDATABASE=clara_631`, a future regression in `guardedReset`/`assertResetTargetDisposable`
that failed to throw would let this auditor cell itself perform the real `DROP SCHEMA`.

**Fix.** `wrapped` no longer calls `realReset` at all — `const wrapped = async () => { spy.entered
+= 1; };` — matching `rig-reset-guard.test.mjs`'s own spy shape for T19 exactly. `realReset` is
still fetched and type-checked (`assert.equal(typeof realReset, "function", ...)`) to keep proving
the spy stands in for the *actual* module every one of the 14 drills imports; it is just never
invoked.

**Evidence.**
- File: `packages/db/tests/reset-gate-routing.test.mjs`, acceptance-2 cell.
- Re-run: `reset-gate-routing.test.mjs` 5/5 pass (command below), including the fixed acceptance-2
  cell.
- Command: `PGHOST=127.0.0.1 PGPORT=55743 PGUSER=postgres PGDATABASE=clara_l03
  CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1 node --test --test-concurrency=1 $GATES
  tests/reset-gate-routing.test.mjs` from `packages/db` (`$GATES` = the `--import
  ./tests/*-preintegration-gate.mjs` list from `package.json`'s `test` script, per RIG.md).
- Commit: `e985085a`.

## L03-S2 (ticket #845, major) — FIXED

**Claim.** Acceptance-1's regression guard matched only `^\s*await reset\(` (multiline), so
`const r = await reset({ log: () => {} });`, `return reset({ log: () => {} });` and `await  reset(
...)` (extra space) all walked past it undetected — verified by the reviewer running the file's own
regex against those three shapes. The criterion asks for "a grep for `reset(` finds no unwrapped
call", not one hand-picked spelling.

**Fix.** Added `stripCommentsAndStrings()` (blanks out `/* */`, `//`, and string/template literal
bodies) and replaced the line-anchored regex with `UNWRAPPED_RESET_CALL_RE =
/(?<![A-Za-z0-9_$.])reset\s*\(/` run against the stripped source. This matches any `reset(` call
token not part of a longer identifier (so `guardedReset(` — capital `R`, case-sensitive — never
matches) and not the `{ reset }`/`{ reset: alias }` import destructure (no `(` immediately after
`reset` there at all).

**Non-vacuity, measured on the live rig, each case reverted byte-for-byte immediately after:**

| case | x42-split-upgrade-kit.mjs line 106 rewritten to | acceptance-1 result |
|---|---|---|
| original vacuity control | `await reset({ log: () => {} });` (pre-fix, byte-for-byte) | RED |
| adversarial 1 | `const r = await reset({ log: () => {} });` | RED |
| adversarial 2 | `return reset({ log: () => {} });` | RED |
| adversarial 3 | `await  reset({ log: () => {} });` (extra space) | RED |
| restored | `await guardedReset(reset, { log: () => {} });` | GREEN (`git status --porcelain` clean after) |

Also confirmed zero false positives: ran the new predicate against all 14 real gated files
(including the `s6-upgrade.test.mjs` / `rig-docs-upgrade.test.mjs` prose comments that literally
say `reset()` — e.g. "own multiple reset()+migrate()" — which the naive substring search would
have false-flagged before comment-stripping) — zero offenders, matching the suite's own re-run
(5/5 pass).

**Evidence.**
- File: `packages/db/tests/reset-gate-routing.test.mjs`.
- Commit: `e985085a`.
- The five-case table above was run interactively against the live rig (`clara_l03`) and is not
  itself a committed test; the committed vacuity-control paragraph in the file's header comment
  (lines ~41–47) documents the same claim for a future reader.

## L03-S3 (ticket #845, major) — FIXED

**Claim.** Acceptance-3 was reported as "CI's job", but
`checkout-convergence-upgrade.test.mjs`, `rig-runtime-upgrade.test.mjs` and
`wave-a-upgrade.test.mjs` have no CI leg anywhere in `.github/` — confirmed again this round
(`grep -rln 'checkout-convergence-upgrade\|rig-runtime-upgrade\|wave-a-upgrade' .github/` → no
hits). Their only run recipe is each file's own header, and those headers named non-disposable
database names (`clara_0186_upgrade`, `clara_waveA_upgrade`) that the new `guardedReset` now
refuses. `wave-b/wb-0020-upgrade.test.mjs` DOES have a CI leg
(`.github/actions/closed-wave-upgrade-drills/action.yml`, which creates `clara_wb20_upgrade_ci`),
but its own in-file "Locally:" recipe still said `clara_wb20_upgrade` — also now refused.

**Fix.**
- `checkout-convergence-upgrade.test.mjs`: header recipe `PGDATABASE=clara_0186_upgrade` →
  `clara_0186_upgrade_ci`, plus a one-paragraph note on why (no CI leg; run only against a
  throwaway DB).
- `wave-a-upgrade.test.mjs`: `PGDATABASE=clara_waveA_upgrade` → `clara_waveA_upgrade_ci`, same
  note.
- `wave-b/wb-0020-upgrade.test.mjs`: `Locally: PGDATABASE=clara_wb20_upgrade` →
  `clara_wb20_upgrade_ci`, matching the name CI itself already creates.
- `rig-runtime-upgrade.test.mjs`: had **no** documented recipe at all — added one
  (`PGDATABASE=clara_runtime_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 node
  --test packages/db/tests/rig-runtime-upgrade.test.mjs`) plus the same note.
- `packages/db/tests/README.md`'s `#845` section rewritten to name exactly which 11 of 14 files CI
  covers (`closed-wave-upgrade-drills/action.yml`: hrd-a-recut-guard, hrd-b-upgrade-kit,
  rig-docs-upgrade, rig-events-upgrade, s6-upgrade, wave-b/wb-0020-upgrade,
  x37/x40/x41-upgrade; `frontier-leg/action.yml`: x42-split-upgrade-kit; T19 runs in the ordinary
  battery) and to say plainly that the other 3 have no CI leg — a gap this ticket did not close,
  filed as a follow-up rather than claimed as coverage.

**Verification, without ever setting `CLARA_RIG_ALLOW_RESET` (forbidden on this rig per
RIG.md):**
- `assertResetTargetDisposable`'s `EPHEMERAL_DB` regex tested directly against the four new names
  — all 4 match (`clara_0186_upgrade_ci`, `clara_waveA_upgrade_ci`, `clara_wb20_upgrade_ci`,
  `clara_runtime_upgrade_ci` → `true`); the 3 old names it replaces do not (`false`).
- All four touched files re-run on `clara_l03` without the flag: each still reaches its existing
  skip gate cleanly (no import-time crash from the header comment edit) —
  `checkout-convergence-upgrade.test.mjs` 0 pass/1 skip, `wave-a-upgrade.test.mjs` 0 pass/4 skip,
  `rig-runtime-upgrade.test.mjs` 0 pass/1 skip, `wave-b/wb-0020-upgrade.test.mjs` 0 pass/4 skip.

**What only CI can run** (unchanged by this fix round, stated explicitly per the ticket's own
instruction): the destructive body of all 14 files — the actual `0001→frontier` replay-then-drop
under `CLARA_RIG_ALLOW_RESET=1`. This rig must never set that flag (RIG.md), so nothing above
proves the *destructive path* runs correctly for any of the 14, only that (a) the routing through
`guardedReset` is structurally proven (L03-S1/S2, plus the pre-existing cells 3/4), and (b) the
recipe a human or CI would now use for each file resolves to a name the guard actually admits. The
3-file CI-coverage gap (checkout-convergence-upgrade, rig-runtime-upgrade, wave-a-upgrade) remains
open and is not this ticket's to close — recorded as a follow-up below.

**Evidence.**
- Files: `packages/db/tests/checkout-convergence-upgrade.test.mjs`,
  `packages/db/tests/wave-a-upgrade.test.mjs`, `packages/db/tests/rig-runtime-upgrade.test.mjs`,
  `packages/db/tests/wave-b/wb-0020-upgrade.test.mjs`, `packages/db/tests/README.md`.
- `.github/actions/closed-wave-upgrade-drills/action.yml:108-126` (wb-0020's real CI leg + the name
  it creates), `.github/actions/frontier-leg/action.yml:252-253` (x42's CI leg).
- Commit: `e985085a`.

## L03-S4 (ticket #844, minor) — FIXED

**Claim.** The new arm-1 id-tie-break cell was named `os.15`, but the file's own section-7 series
already runs `os.15` (applicant's-name resolution, line 927) through `os.18` — two tests answering
to the same label, ambiguous for any future citation.

**Fix.** Renumbered the new cell (and its fixture tag, `{ tag: "os15" }` → `{ tag: "os19" }`, and
the two in-body `"#844 os.15 superseded..."` strings) to **`os.19`** — the next actually-free
integer id in the file, not `os.17` as the review's required-fix example suggested (`os.17` is
also already taken, by the "unresolvable shapes" cell at line 999 — confirmed by `grep -noE
"os\.[0-9]+" operator-support.test.mjs | sort -t. -k2 -n -u`, which lists `os.01`…`os.18`
contiguously with no gap). README's `#844` section retitled to `os.19` with a one-line note
explaining the renumbering.

**Evidence.**
- File: `packages/db/tests/operator-support.test.mjs`.
- Re-run: `operator-support.test.mjs` 20/20 pass (same count as before — a rename, not a cell added
  or removed; `EXPECTED_CELLS` stays 19).
- Commit: `1ea21b05`.

## L03-S5 (ticket #884, minor) — FIXED

**Claim.** `p639.birth.opening_excluded` asserted the account code against
`` `${err.detail ?? ""} ${err.message ?? ""}` `` combined, so it would still pass if `account_code`
were dropped from the structured DETAIL while the account code stayed interpolated into the prose
message — the criterion asks for the account code "on the detail".

**Fix.** Parse `err.detail` as JSON (migration 0041 sets `detail =
jsonb_build_object('reason', ..., 'account_code', r.account_code, ...)::text`) and assert
`detail.account_code === COST` directly.

**Non-vacuity, measured, not just argued.** Confirmed the exact shape of `err.detail` first (a
throwaway `console.error(JSON.stringify(err.detail))` inserted into the cell, run, then removed
before the real fix): `{"role": "cost", "reason": "fa_k_gl_balance_on_enrolled", "entry_id":
"...", "account_code": "200-D41"}` — confirming it is valid, parseable JSON with the field the
fix relies on.

Then reproduced the exact regression the criterion protects against, via a throwaway `DO $$ ...
$$` block issued against `clara_l03` (touching no migration-owned object, no persisted schema
change — a standalone script, deleted immediately after, never committed) that raises the
identical errcode/message text but **omits** `account_code` from the DETAIL jsonb while keeping it
in the interpolated message:

```
code: CLR40
detail: {"role": "cost", "reason": "fa_k_gl_balance_on_enrolled", "entry_id": "..."}
message: account 200-D41 is enrolled for the fixed-asset register; carry it down as an itemised
  fixed_asset opening item, not as a gl_balance leg
OLD (blob.includes(COST)) would pass: true   <- the exact false-green the finding describes
NEW (JSON.parse(detail).account_code === COST) would pass: false   <- correctly catches it
```

This is the direct, measured proof that the old assertion was vacuous against this regression and
the new one is not.

**Evidence.**
- File: `packages/db/tests/fixed-asset-acquisition.test.mjs`, `p639.birth.opening_excluded`.
- Re-run: `fixed-asset-acquisition.test.mjs` 23/23 pass (same count — an assertion tightened, not a
  cell added).
- Commit: `efdea055`.

## Gates re-run on the final head (`efdea055`)

All from `packages/db`, `PGHOST=127.0.0.1 PGPORT=55743 PGUSER=postgres PGDATABASE=clara_l03
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`, `$GATES` = the exact `--import
./tests/*-preintegration-gate.mjs` list from `packages/db/package.json`'s `test` script:

| gate | result |
|---|---|
| `tests/reset-gate-routing.test.mjs` | 5 tests, 5 pass, 0 fail, 0 skip |
| `tests/operator-support.test.mjs` | 20 tests, 20 pass, 0 fail, 0 skip |
| `tests/fixed-asset-acquisition.test.mjs` | 23 tests, 23 pass, 0 fail, 0 skip |
| `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs` (no reset flags) | 31 tests, 30 pass, 0 fail, 1 skip (T19's own gate) |
| `node scripts/check-frozen-workflows.mjs` (worktree root) | exit 0 — 312 frozen files verified, no manifest diff, 55 "use workflow" modules frozen+registered |
| `pnpm lint` (worktree root) | exit 0 |
| `pnpm typecheck` (worktree root) | exit 0 (apps/web + packages/runtime) |

Never ran, per the ticket's own instruction and RIG.md: any of the 14 reset()-gated drills with
`CLARA_RIG_ALLOW_RESET=1` on this rig. The 4 files whose header recipes changed
(`checkout-convergence-upgrade`, `wave-a-upgrade`, `rig-runtime-upgrade`,
`wave-b/wb-0020-upgrade`) were each re-run WITHOUT the flag to confirm they still reach their skip
gate cleanly with no import-time crash (see L03-S3 evidence above); their destructive bodies
remain unrun here by design.

## Docs updated

`packages/db/tests/README.md`'s `#845` and `#844` sections, in the same commits as the code they
describe (rule 9). No `CONTEXT.md` change — no new vocabulary introduced.

## Successor contracts / follow-ups worth filing

- **CI-coverage gap for 3 upgrade drills.** `checkout-convergence-upgrade.test.mjs`,
  `rig-runtime-upgrade.test.mjs` and `wave-a-upgrade.test.mjs` have never run their destructive
  path anywhere but a worker's own machine — no `.github/` leg exists for any of the three. This
  fix round made their manual recipes runnable again under the new guard; it did not add CI
  coverage, which is out of scope for a wave-1 lane fix round (no CI workflow authoring was part
  of #845's brief). Worth a ticket of its own.

## Unverified / left for the reader

- The `EPHEMERAL_DB` regex check for the 4 new/updated database names was run directly against
  the shared `lib/guard.mjs` export (not re-derived), which is correct but means this report
  trusts that module's current text; it was not re-read line-by-line this round (it was read in
  full during the original #845 build, per the review's own citation).
- No new migration, no `PRD.md`/`ARCHITECTURE.md` edit, no shared-file touch, nothing pushed —
  `git status` confirmed clean at each commit boundary; not re-stated per-finding above to avoid
  repetition.
