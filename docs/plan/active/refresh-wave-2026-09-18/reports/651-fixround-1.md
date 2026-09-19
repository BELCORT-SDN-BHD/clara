# #651 — fix round 1

**Branch** `impl/651-assets-depreciation` · **worktree** `C:\Users\zhant\Desktop\clara-wt\651` · **rig** 127.0.0.1:55704 / `clara_651` · **base of this round** `93579e4c` · **HEAD** `9d96ad45` — three commits: `2aa00f24` (db), `1abf48db` (web), `9d96ad45` (the decision key dies with its dialog).

Reviews answered: `651-review-spec.json` (accept, 2 notes), `651-review-standards.json` (accept, 1 minor), `651-review-adversarial.json` (fix_then_accept, 10 findings). Thirteen findings, thirteen dispositions below, none silent:

* **Five applied RED-FIRST** — ADV-651-1, ADV-651-4, ADV-651-5, ADV-651-6, ADV-651-8: the cell written or rewritten, run, seen to fail for the right reason, fixed, seen to pass. (ADV-651-4's is the reverse shape: the cell could not fail, so its non-vacuity was proved by mutating it.)
* **One applied as a code change the batteries verify** — ADV-651-7 (a test-isolation property, not a behaviour a cell can assert about itself).
* **Seven applied as live-comment or report corrections** — ADV-651-2 (the door's own comment), ADV-651-3, ADV-651-9, ADV-651-10, S1, SPEC-651-N1, SPEC-651-N2.
* **Two sub-items deliberately left**, each with its reason below, and **two items flagged for ratification** because doing them the way they were written moves what the brief specifies.

---

## Finding → what I did → evidence

### ADV-651-1 — blocker — retiring a NEVER-SIGNED authority died on a raw 23514

**Reproduced RED through the real doors, inside the battery** (not a throwaway): new cell
`p651.authority.retire_unsigned` drives `propose_depreciation_authority` (bookkeeper) then
`retire_depreciation_authority` (admin).

```
not ok 2 - p651.authority.retire_unsigned …
  error: 'new row for relation "fa_depreciation_authorities" violates check constraint "ck_fa_authorities_window"'
  code: '23514'
```

**Applied — the reviewer's first option, the narrow recut.** `0227` gains **§B.3**: a measured splice
of `clara.retire_depreciation_authority(uuid,uuid,text,text)` that stamps
`authority_from = coalesce(au.authority_from, clara._fa_month_start(clara._fa_today()))` **in the same
UPDATE, in the same shape as the `signed_by` / `signed_at` coalesce 0041 already wrote there**
(`0041:3393-3394`). The alternative the reviewer offered — weakening `ck_fa_authorities_window` to
`… or status = 'retired'` — was **not** taken: the CHECK is given verbatim in the brief, `T.1`'s
"no non-proposed row lacks a floor" census would stop being true forever after, and the retire door
already invents a signature stamp for exactly this case, so inventing the floor beside it is the
smaller and more consistent move.

The splice carries the house apparatus: a prestate pre-image pin measured off `pg_proc.prosrc`
(`35b0facd…`), an exact-count anchor assertion, a body postcheck, a tail ACL/owner row, the name in
the single-`pg_proc`-row census, and a new `T.11` assertion that the committed body really stamps.

**GREEN** — `p651.authority.retire_unsigned` passes, and it asserts the whole recovery: the floor is
stamped, `get_depreciation_authority` returns `authority: null` (the honest "none proposed" state the
surface already renders), and a corrected cadence **can be proposed again**.

### ADV-651-6 — minor — "written once and frozen" was enforced by nothing

**Reproduced RED**: new cell `p651.authority.floor_frozen` attempts to move `authority_from` and
`authority_ref` on a LIVE authority by labelled root UPDATE and expects `authority_immutable`:

```
not ok 3 - p651.authority.floor_frozen …
  error: "expected the named refusal 'authority_immutable'; got reason='authority_transition_illegal'
           code=CLR38 — depreciation authority transition live -> live is not lawful"
```

**Applied.** `0227` gains **§B.2**, a second splice of `clara._tf_fa_authority_transition` on its own
anchor (present in 0041's original body and in §B.1's post-image alike, so the two blocks are
independent): once either sign-time column is set, any transition that moves it raises CLR38
`authority_immutable` **naming the column**. Spliced **before** the transition-legality raise, and the
postcheck and `T.11` both assert that order — otherwise a second write on an unlawful edge would be
reported as an illegal transition and the column that actually moved would never be named.

Instrument and argument are the estate's own: `accounting-plans.test.mjs:448-456` freezes
`clara.accounting_plans.authority_from` with a root UPDATE and says why — *"a frozen column nobody
tests is a promise."* `0193:476-478` is the plan lane's twin.

**GREEN**, and the cell also pins the audited half: retiring a SIGNED authority carries both values
through untouched.

### ADV-651-4 + ADV-651-5 — major/minor — `p651.authority.floor_sequencing` could not fail

**Applied.** The tautology (`assert.ok(earlier === null || reasonToken(earlier) !== null)`) is replaced
by the measurement ADV-651-5 supplied: the out-of-order pre-floor run **is admitted** (`earlierErr ===
null`), and what saves the arithmetic is that it is a **noop** — no entry, charge set byte-identical,
run rows unchanged. A later change in **either** direction now reds this cell.

**Non-vacuity proved by mutation**, not asserted: flipping the expected receipt status from `noop` to
`drafted` and re-running gives `not ok 1 … # fail 1`; the file was restored immediately after.

### ADV-651-7 — minor — a shared fixture disabled triggers across autocommitted statements

**Applied.** `packages/db/tests/fa-authority-sign-compat.mjs` gains `withTriggerOff(table, trigger, fn)`,
which runs disable → write → enable on **one connection inside one transaction** (`withActor({transaction:true})`,
the helper `asWake` already uses). `mintChatTaskRef`'s trigger-off arm and `backdateAuthorityFloor`
both go through it. `alter table … disable trigger` inside a transaction takes ACCESS EXCLUSIVE, so a
concurrent session blocks instead of writing past a disabled trigger and a killed process rolls the
disable back. Migration `0227:338-342` is the same manoeuvre inside the runner's own transaction, and
its comment already said so — the fixtures now match it. Recorded in `packages/db/tests/README.md`.

### ADV-651-8 — minor — "one decision, one key" reached exactly one door

**Applied red-first, web only** (the doors were already idempotent; only the key transport was not).
Red: `lib/registers/depreciation.test.ts` importing `authorityIntent` →
`SyntaxError: The requested module './depreciation' does not provide an export named 'authorityIntent'`.

`proposeDepreciationAuthority`, `signDepreciationAuthority`, `retireDepreciationAuthority` and
`reviseFixedAssetParticulars` now take the caller's `opKey`; `authorityIntent(act, …)` and
`reviseIntent(…)` are the intent tuples; the three ceremony dialogs and the revise dialog hold a key
through `useDepreciationDecisionKey` exactly as the run dialog already did, and each **renews it on
`onClosed`** — a closed dialog ends the decision, so a re-proposal after a retirement is a new
operation rather than a replay of the receipt the withdrawn one earned. (Three of the four dialogs
also unmount on success, but relying on that would be relying on a render condition.) **Sign is the door a person
actually meets this on**: its replay identity is `{client, authority}`, so the second key reaches 0227's
`authority_already_live` arm and refuses instead of returning the earned receipt.

GREEN: `depreciation.test.ts` + `fixed-assets.test.ts` **22 pass / 0 fail**; the FA component suite
(`components/registers/fa-*`, `fixed-asset*`, `register-refresh-siblings`) **55 pass / 0 fail**.

**Deliberately NOT widened**: `completeFixedAssetParticulars` and `disposeFixedAsset` keep #639's own
minting. The finding named four doors; those two are a pre-existing shape this branch never touched,
and widening silently is what WORK-ORDER rule 6 forbids. Follow-up filed.

### S1 (standards) — the shared-verb comments undercounted by two

**Applied.** `e2e-fixture-ownership.test.ts`'s `LANE_DECLARATIONS` comment and `serve-built.mjs`'s
dispatch comment now say **five** and name all five, and both point at `SHARED_RPC_VERBS` as the source
of truth rather than re-enumerating a set that can grow.

### ADV-651-2 — major — the resolution ladder proves provenance, not instruction

**Applied as the reviewer's second arm: the comment is softened and the residual is NAMED. The
narrowing itself is flagged for ratification.**

Measured before deciding: `0193:1500-1514` — the ladder the brief binds this door to — is
**byte-for-byte the same existence test, with the same comment**, for accounting plans. Narrowing the
FA lane alone would give a firm two different meanings for one word, and `create_accounting_plan` is
D7-forbidden ground for this ticket. So `0227` §F's header now states exactly what the ladder proves
(*provenance*: a real row of THIS client's work or chat lane — which is what rules out a Knowledge
preference, a policy or a standing rule) and exactly what it does not (`kind`, `status`, author are not
read, so a machine-born task also satisfies it), says it is the estate's position rather than this
file's, and names it a residual. The in-body comment carries a two-line version; the sign door was
re-installed on the rig with the softened text and re-verified (one `pg_proc` row, `clara_authenticated`
yes, `public` no, owner `clara_fn_owner`).

### ADV-651-3 — major — the committed 0227 has never applied end to end

**Accepted in full; it is a report correction and the final report now says it.** No code change is
possible here: this cluster may not run a from-scratch chain (brief + RIG.md), and this round has made
the situation *more* true, not less — §B.2, §B.3 and §F's re-installed body were applied to the rig as
their own blocks and the ledger checksum was repaired again
(`5ac4180c…` → `a25fbc0e…`, the runner's own CRLF-normalised recipe).

What I did instead of claiming an apply:

* **Re-ran 0227's WHOLE tail census** (`$p651_tail$`, 18,661 chars, including the new `T.11`
  assertions) against the committed catalog inside a rolled-back transaction: **green**, with its own
  summary notice. That proves the new tail SQL parses and that every claim it makes is true of the
  catalog as it stands.
* **Re-ran the prestate block** the same way: it refuses as designed
  (`CLR10 … clara._fa_assert_period_open(uuid,date) already exists`), which is the proof it parses.
* **Re-read every prestate pin against the live catalog**: ten `recut` pins read MOVED, the three
  `unmoved` pins (`get_fixed_asset`, `_fa_compute_charges`, `_fa_asset_charges`) read AT PIN, and the
  3-arg `sign_depreciation_authority` reads ABSENT — exactly the post-image picture, which is evidence
  about the catalog and **not** evidence that the file applies.

**The integrator's from-scratch `0001 → 0233` chain is this branch's gate.** §J is not apply evidence
and `220 migrations, 0 new` is not apply evidence.

### ADV-651-9 — note — x41.s4's base-state colour CAN be established

**Applied to the report (moved out of "Unverified"), and re-measured myself rather than transcribed:**

```
0227 applied_at                 2026-09-18T19:50:37.880Z
x41_b3_30228e  client born      2026-09-18T19:20:49.086Z   asset born 2026-09-18T19:20:49.192Z (77000)
x41_b3_54bf32  client born      2026-09-18T19:22:03.819Z   asset born 2026-09-18T19:22:04.028Z (77000)
```

The two oldest offending register rows are **thirty minutes older than the migration**. The
attribution to x41.b3's `reverse_entry` fixture re-firing the acquisition belt stands, and it is not
this branch's.

### ADV-651-10 — note — a mis-cited instruction is not correctable

**Accepted; the owner question is now in the final report** beside D8's. `sign_depreciation_authority`'s
replay identity excludes `p_authority_ref` on purpose, so a retry carrying a CORRECTED instruction
returns the first receipt and the wrong reference stays. The only recovery is retire → propose → sign —
**which ADV-651-1's fix has now restored for the proposed arm as well**, so the remedy exists; whether
it is the right remedy is the owner's call, not mine.

### SPEC-651-N1 — note — rig row counts are not reproducible

**Applied to the report.** Measured again this round: **541** signed rows (the migration header records
157 at authoring time, the final report 285, the review 413). The formula is unchanged and ratified, and
`status in ('live','retired') and authority_from is null` reads **0**. The final report now says a
rig-measured row count on a persistent, never-reset rig is a timestamp, not a claim; the hosted count is
a release-time read.

### SPEC-651-N2 — note — "all five" x41_b3 clients

**Applied to the report.** Measured now: **seven** `x41_b3_*` clients carry the row (five at report
time, six at review time). Same corroboration of the same mechanism; the final report no longer states a
count that a persistent rig keeps invalidating.

---

## Deliberately left

1. **ADV-651-2's narrowing of the resolution ladder** (reading `agent_tasks.kind` / a Work row's
   author). Grounded in the brief: the ladder is bound to `create_accounting_plan`'s
   (`0193:1482-1514`), which is the identical existence test; D7 forbids touching the plan lane on
   this branch; and one lane meaning something stricter than its twin is worse than an honest named
   residual. Comment softened, residual named, follow-up filed, ratification requested.
2. **ADV-651-8 for `completeFixedAssetParticulars` / `disposeFixedAsset`.** Not named by the finding,
   not touched by this branch, #639's own shape. WORK-ORDER rule 6. Follow-up filed.

## Ratification requested

1. **0227 now recuts TWO bodies the brief's RECUTS roster does not name** —
   `clara.retire_depreciation_authority` (§B.3) and a second splice of
   `clara._tf_fa_authority_transition` (§B.2). Both are repairs of damage this file would otherwise
   do (a raw 23514 on a lawful act; a "frozen" column nothing freezes), both are pinned/postchecked/
   tail-asserted like every other body in the file, and the alternative for §B.3 — weakening the
   brief's verbatim `ck_fa_authorities_window` — was rejected for the reasons above. **Applied anyway,
   because a blocker that breaks a working act is not something to leave; the orchestrator ratifies
   the roster widening or tells me to take the CHECK arm instead.**
2. **ADV-651-2's narrowing is NOT applied** and needs a cross-lane ruling (#651 + the plan lane
   together), not a unilateral tightening here.

## Commands re-run this round

| command | result |
|---|---|
| `packages/db` · `node --test --import ./tests/depreciation-history-preintegration-gate.mjs tests/depreciation-history.test.mjs` | **19 pass / 0 fail / 0 skip** |
| `packages/db` · `node --test tests/operation-census.test.mjs` | **10 pass / 0 fail** |
| `packages/db` · `node --test tests/rig-isolation.test.mjs` | **20 pass / 0 fail / 1 skip** (the destructive cell; reset flags never set) |
| `packages/db` · whole x41 family (20 files) | **105 tests · 103 pass · 1 fail · 1 skip** — the fail is `x41.s4` (pre-existing, now dated); the skip is the destructive 0041 upgrade drill |
| `packages/runtime` · `depreciation-run-unit` + `reconcile-fa-unit` + `reconcile-fa` | **26 pass / 0 fail** |
| `apps/web` · `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 pass / 0 fail** (after re-pinning 0227's reviewed dynamic-SQL barrier) |
| `apps/web` · `pnpm --filter @clara/web e2e depreciation-walk` (3330/3331/3332) | **4 passed (18.2s)**, re-run at `9d96ad45` → **4 passed (14.0s)** |
| `apps/web` · FA component + wrapper tests at `9d96ad45` (`components/registers/fa-*`, `fixed-asset*`, `register-refresh-siblings`, `lib/registers/{depreciation,fixed-assets}.test.ts`) | **77 pass / 0 fail** |
| `apps/web` · `node --import ./test/bootstrap.mjs --import tsx --test lib/registers/{depreciation,fixed-assets}.test.ts` | 22 pass / 0 fail |
| `apps/web` · `components/registers/fa-*.test.tsx components/registers/fixed-asset*.test.tsx register-refresh-siblings.test.tsx` | 55 pass / 0 fail |
| `apps/web` · `node scripts/run-tests.mjs` (whole unit suite) | **4168 · 4165 pass · 1 fail · 2 skip** — the fail is `lib/clara/use-clara-thread-stop.test.ts`, a load flake in a lane this branch never touches (`git log origin/main..HEAD -- apps/web/lib/clara/` empty; isolated re-run **25 pass / 0 fail**) |
| root · `pnpm typecheck` | **exit 0** |
| root · `pnpm lint` | **exit 0** (including `check-wiki-dynamic-sql.mjs`, which reads the two new splice blocks) |
| rig · 0227 `$p651_tail$` re-run in a rolled-back transaction | green |
| rig · 0227 `$p651_pre$` re-run in a rolled-back transaction | refuses as designed (CLR10) |

## Files touched this round

`packages/db/migrations/0227_depreciation_history.sql` (prestate roster + pin, §B header, **§B.2**,
**§B.3**, §F header + in-body comment, T.2, T.8, T.11) · `packages/db/tests/depreciation-history.test.mjs`
(2 new cells, 1 rewritten) · `packages/db/tests/depreciation-history-fixtures.mjs` (`proposeAuthority`,
`retireAuthority`, `authorityEnvelope`) · `packages/db/tests/fa-authority-sign-compat.mjs`
(`withTriggerOff`) · `packages/db/README.md` · `packages/db/tests/README.md` ·
`apps/web/lib/registers/depreciation.ts` · `apps/web/lib/registers/fixed-assets.ts` ·
`apps/web/components/registers/fa-authority-ceremony.tsx` · `apps/web/components/registers/fa-row-actions.tsx` ·
`apps/web/lib/registers/depreciation.test.ts` · `apps/web/lib/registers/fixed-assets.test.ts` ·
`apps/web/e2e/e2e-fixture-ownership.test.ts` · `apps/web/e2e/serve-built.mjs` · `apps/web/README.md` ·
`apps/web/tests/firm-scope-db-pins.corpus.ts`.

## The census this round had to re-satisfy, and the ledger it had to repair

**`apps/web/tests/firm-scope-db-pins.corpus.ts`'s reviewed dynamic-SQL barrier.** Editing 0227 moved its
pinned sha256, and that census fails closed by design — *"adding an entry is a review act."* The pin is
re-measured (`d55113b5…`) and the **reason re-reviewed**: NINE named functions across TEN splice blocks
now, because `_tf_fa_authority_transition` is spliced twice and `retire_depreciation_authority` joins the
roster; the reason still ends where it must, at *"none can emit a view definition of any kind, and the
file contains no `create view` of any spelling."* `tests/firm-scope-db-pins.test.ts` → **22 pass / 0 fail**.
This is exactly the census WORK-ORDER rule 3 warns will red on a file you never opened.

**The rig's migration ledger.** Repaired twice this round (`5ac4180c…` → `a25fbc0e…` → `d55113b5…`) because
0227 is UNMERGED and was edited after a draft apply. Every repair widens ADV-651-3, which is why that
finding's disposition is a report correction and not a claim of cleanliness: the committed file's only
real apply gate is the integrator's from-scratch chain.
