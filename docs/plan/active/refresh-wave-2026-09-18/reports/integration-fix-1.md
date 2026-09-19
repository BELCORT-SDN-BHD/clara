# Wave 2026-09-18 integration fix round 1 — the four §6.3 rulings, applied

Worktree `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/wave-2026-09-18`.
**In:** `2f60ff29`. **Out:** `d8473f5d`. Four commits, each red first, each `fix(integration): …`.
Nothing pushed, no PR, no migration edited, no impl worktree or cluster touched.

| # | commit | ruling closed |
|---|---|---|
| 1 | `ca7491a9` | §6.3 row 1 — #655 `t_je_open_item_birth` has no tier |
| 2 | `e9a30794` | §6.3 row 2 — #636's belt leaks its probe error |
| 3 | `32cc1c8a` | §6.3 row 3 — #651's new tab breaks #639's keyboard cell |
| 4 | `d8473f5d` | §6.3 row 4 — the four S5.25 rosters need 7 (B) and 13 (D) names |

Rigs: `rigint` 55720 / `clara_int` (chain 0001…0233, 228 rows, frontier
`0233_firm_commercial_settings`) for db; `rigrt` 55721 / `clara_rt` for runtime; the web walk on
the `3400 / 3401 / 3402` triple. `CLARA_RIG_ALLOW_RESET` never set; no from-scratch chain re-run.

---

## 1 · #655 — a failed open-item birth is a Tier-D ABORT (`ca7491a9`)

**The red.** `packages/db/tests/f-a2-tier-d.test.mjs:47`, cell `f-a2.c5.census`:

```
c5.census: no UNPINNED trigger sits on clara.journal_entries.
Extra: t_je_open_item_birth — an unpinned constraint trigger has no tier,
which means nobody decided whether it aborts or converts
  actual: [ 't_je_open_item_birth' ]   expected: []
```

Measured before the fix: **8 pass / 1 fail** (`node --test --test-concurrency=1 <49 gate flags>
tests/f-a2-tier-d.test.mjs`, cwd `packages/db`, `PGPORT=55720 PGDATABASE=clara_int`).

**The ruling.** Tier = **ABORT**. Register it in §D.1's table as an aborting deferred constraint
trigger and add `p655.birth.abort_is_atomic` proving a forced birth failure leaves no entry, no
receipt and no `trade_invoices` status row.

**What I did.**

1. `TRADE_INVOICE_JE_TRIGGER` added to `packages/db/tests/f-a2-post-fixtures.mjs`, pushed by
   `jeTriggerPins()` behind `version ~ 'trade_invoices$'` — gated on 0225's own stem like every
   pin beside it, so a `db-slice-frontiers` leg pinned below 0225 does not report it missing.
   Tier string: *"D — the lane-agnostic open-item birth; ABORTS (CLR10
   counterparty_kind_mismatch, wrong_control_domain, invalid_total), all raised at COMMIT."*
   The three reasons are deliberately kept **out** of `TIER_D_TOKENS` for the reason #638's two
   are: that set is the six-token BELT vocabulary `f-a2-ladder-3`'s `c3.D-vocab` pins.
2. New cell `f-a2.c5.trade-invoice-birth` measures the LIVE body (`_tf_je_open_item_birth`) for
   the raise and the three reasons, so the tier prose is a measurement rather than a claim — the
   same half `c5.wave-births` is for the 2026-09-15 triggers.
3. New cell `p655.birth.abort_is_atomic` in `packages/db/tests/trade-invoice.test.mjs`.

**Forcing the failure, and why it needed an owner-level fixture.** The ruling allowed *"the way
the battery's own fixtures can … or a labelled owner-level fixture if no door reaches it."*
**No door reaches it.** Seven walls, each read in source and numbered in the fixture's own header:

| # | wall | where |
|---|---|---|
| 1 | admission refuses a party whose `kind` contradicts the invoice kind | `0225:895-899` (driven by `p655.polarity.matrix(b)`) |
| 2 | admission refuses a control leg of the opposite class | `0225:706-717` (`matrix(b2)`) |
| 3 | admission ties the control leg's SIGNED amount to the stated total | `0225:739-741` (`matrix(e2)`) — this is what closes the birth's `invalid_total` arm |
| 4 | the commit door re-asks the control-leg class (`0225:1757-1772`), behind a basis-digest wall that refuses any basis but the admitted one | `0225:1684-1689` |
| 5 | `clara.trade_invoices` is append-only | `0225:411-419` (`p655.appendonly`) |
| 6 | `clara.merge_counterparties` refuses a CROSS-KIND merge outright | `0015:2274-2280` |
| 7 | `_tf_counterparty_update_0011` admits only name/merge columns on UPDATE, no DELETE | `0011:940-956` — so `kind` is immutable through every role including root |

That is *the point of* the tier ruling rather than an argument against it: a tier states what
happens the day a door is loosened. So the cell makes that world from outside the doors, with one
labelled fixture, `forceCounterpartyKind`: a root transaction that sets `session_replication_role`
**transaction-locally** (`set_config(…, is_local => true)`) — no DDL, therefore no
`ALTER TABLE … DISABLE TRIGGER` and no ACCESS EXCLUSIVE lock a parallel test file could slip
through; `withActor`'s own `finally` rolls back and `RESET ALL`s the pooled client regardless.

The cell then asserts the abort is the BIRTH trigger's and not `_tf_open_items_validate`'s — the
latter raises the same reason token but builds a detail with no `invoice_id`, `domain` or
`counterparty_kind` keys, and the cell asserts all three.

**Not vacuous, proven.** With the fixture suppressed the post SUCCEEDS and the cell fails:
`p655.birth.abort_is_atomic: the open item cannot be born, so the posting aborts at COMMIT:
expected SQLSTATE CLR10 but the call SUCCEEDED (no error)`.

**Evidence.** `f-a2-tier-d` **10/10** (was 9 with 1 failing); trade-invoice battery **30/30**
(was 29). Both with the 49 gate flags, cwd `packages/db`, `PGPORT=55720 PGDATABASE=clara_int`.

---

## 2 · #636 — the intake-batch belt contains its own probe failure (`e9a30794`)

**The red.** `packages/runtime/tests/reconcile-belt-isolation-unit.test.mjs:337`, cell 13:

```
both contained THEMSELVES — nothing escaped to the assembly wrapper
  actual: [ 'intake batch cancellations' ]   expected: []
```

Measured before the fix: **21 pass / 1 fail** (`node --test
tests/reconcile-belt-isolation-unit.test.mjs`, cwd `packages/runtime`, rigrt 55721).

**The ruling.** Contain it like the FA and ADJ belts: `batchOk:false` with the probe reason, the
sweep behind it completes, the cell's law stands (22/22 again).

**What I did.** `packages/runtime/lib/reconciler-batches.mjs`'s `to_regprocedure` feature probe
was unguarded, so its throw reached `reconciler.mjs`'s `belt()` wrapper — the assembly-level
report reserved for a belt that could *not* contain its own failure. The fix is
`reconciler-fa.mjs:74-89` **cloned, not reinvented**: wrap the probe, re-throw a
`TaxonomyHaltError` (or `err.halt`) so a halt still reaches the leader through the catch, log the
cause under the belt's own name, return `{ batchCancelOk: false, batchCancelDormant: false, … }`.

`batchCancelDormant:false` is the half that carries the meaning, and it is the FA belt's own
stated law: a catalog read that THREW is a connection or session problem, not a missing 0229, and
answering `dormant:true` would claim the surface is absent on the strength of a read that never
landed — parking a daily belt for 24 hours on a failed read.

**Measured in both places, not only green.** The belt's own battery gains
`p636.runtime.belt_probe_unreadable` in the shape of the FA/ADJ probe cells beside it (ok:false,
dormant:false, cause logged); its sibling `belt_dormant` already pins the other half, that a
genuinely absent 0229 is still a clean `ok:true` no-op. And the assembly cell now NAMES the third
belt (`assert.equal(swept.batchCancelOk, false)`) instead of only reporting that nothing escaped,
so a future regression returning an empty shape could not pass it.

**Not vacuous, proven.** With `lib/reconciler-batches.mjs` reverted (`git stash push`), both cells
go red — 34 pass / 2 fail across the two files — and nothing else moves.

**Evidence.** `reconcile-belt-isolation-unit` **22/22** alone; `intake-batch-unit` **14/14** alone
(was 13); **36/36** together.

---

## 3 · #651 — the keyboard cell follows the five-tab strip (`32cc1c8a`)

**The red.** `apps/web/e2e/fixed-asset-acquisition-walk.spec.ts:296` —
`expect(getByRole('tab', { name: 'Schedule' })).toBeFocused()` resolved 14× to the tab with
"unexpected value inactive". Reproduced alone at **7 passed / 1 failed** by the merge worker; the
same walk is **8 passed** after this fix.

**The ruling.** #651's five-tab order STANDS. Re-point the cell to ArrowRight → *Policy &
effective revisions* → ArrowRight → *Schedule* → End → *History*, and say in its comment that the
cell asserts keyboard navigation, not a business order.

**What I did.** Exactly that, and the comment now says it outright: the labels are the strip's
order only so the walk has something exact to expect, and a ticket that inserts a tab re-points
this cell rather than arguing with it. The traversal is also WHOLE again — four ArrowRights cover
all five tabs and `End` still lands on the last, which is the roving-tabindex contract itself.

**And reading the cell found the same gap twice.** Both axe loops below it named four labels, so
*Policy & effective revisions* was the one panel in `fixed-asset-detail.tsx` with **no structural
a11y coverage anywhere** — not in the walk's axe scan and not in
`fixed-asset-detail.test.tsx`'s `detail.a11y`. A tab nobody scans is an unscanned surface, which
is the same defect class as an unwalked one (#651 added the panel and taught only its own lane's
cells). Both loops now name all four non-default tabs. The walk's existing `test.slow()` carries
the budget for the fifth scan; the run came in at 17.9 s for the whole spec.

**Evidence.** `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3400 CLARA_E2E_NEXT_PORT=3401
CLARA_E2E_RUNTIME_PORT=3402 pnpm --filter @clara/web e2e fixed-asset-acquisition-walk` →
**8 passed (17.9 s)**, exit 0.

---

## 4 · The four S5.25 census cells — thirteen names, by §6.3's rule (`d8473f5d`)

**The reds.** `node --test --test-concurrency=1 <49 gate flags> tests/x42b2-r7-s5-census.test.mjs
tests/x42b2-s5c-clock.test.mjs tests/x42b2-r7-s5-clock.test.mjs` → **2 pass / 4 fail**:
`x42.r7.s5.census.4b`, `x42.r7.s5c.5`, `x42.s5c.5`, `x42.s5c.6`.

**The method.** Each arm's OWN detector run over the live `clara_int` catalog (0001…0233) and
diffed against its roster — never read off the migration files:

* arm (B): `like '%asia/kuala_lumpur%'` over comment-stripped `prosrc || pg_get_functiondef`;
* arm (D): `~* S5_25_BARE_TOKEN_RE` over the same widened source, `_book_today` exempted by name.

Both diffs: **7 extra / 0 missing** (B) and **13 extra / 0 missing** (D) before the fix, **0/0 in
both directions** after. **Additions only**; no name was removed from any roster.

Registered as four stem-gated cohorts per arm — `intake_batches$`, `knowledge_retrieval$`,
`firm_portfolio_pack$`, `client_financial_pack$` — never number-gated, and each stem verified to
match exactly one applied version.

### 4.1 · The per-name table

| name | lane [mig] | what it reads the clock for | arm | class | action |
|---|---|---|---|---|---|
| `cancel_intake_batch` | #636 [0229] | `cancel_requested_at`, `cancelled_at`, `updated_at` stamps | D | stamp (instant) | registered |
| `set_intake_batch_member_dependency` | #636 [0229] | `updated_at` stamp | D | stamp | registered |
| `sweep_intake_batch_cancellations` | #636 [0229] | `cancelled_at`, `updated_at` stamps | D | stamp | registered |
| `_tf_intake_batch_member_intake_stamp` | #636 [0229] | `updated_at` stamp | D | stamp | registered |
| `_tf_intake_batch_member_work_stamp` | #636 [0229] | `updated_at` stamp | D | stamp | registered |
| `get_intake_batch` | #636 [0229] | one `now()` sample → `computed_at` and nothing else; the zone is spelled once as the UTC-day quota's `resets_at_local` **timezone NAME** (`'window','utc_day','resets_at_local','08:00'`) | B+D | computed_at + CLASS 1 (zone as a name) | registered |
| `list_work_knowledge_reads_for_record` | #658 [0230] | `'computed_at', now()` | D | computed_at | registered |
| `retrieve_knowledge` | #658 [0230] | default `as_of` deciding which knowledge REVISION is in effect (`effective_from <= v_as_of and effective_to >= v_as_of`) | B+D | CLASS 2 — 0220's family | registered |
| `record_work_knowledge_read` | #658 [0230] | the same default `as_of`, also STORED on the read row as that read's provenance | B+D | CLASS 2 — 0220's family | registered |
| `get_firm_portfolio_pack` | #659 [0231] | one `now()` sample → `computed_at` plus a seven-MYT-day window (`v_today - 6` … `v_today + 1`) and the envelope's `to_date` | B+D | CLASS 2 — `get_client_work_pack`'s shape verbatim | registered |
| `publish_client_cash_account_set` | #660 [0232] | the LAST fallback of `effective_from` in `coalesce(p_effective_from, v_books, v_today)` | B+D | CLASS 2 — configuration lifetime | registered |
| `get_client_financial_pack` | #660 [0232] | `computed_at`; and `v_today` → the default `v_as_of := least(v_month_end, v_today)`, the `as_of_in_future` wall, and `v_start := date_trunc('month', v_today)` | B+D | **MONEY as-of** | registered + **ESCALATED → RULED (§6.4 row 1): re-pointed, now a CONSUMER of the house derivation** |
| `propose_client_cash_accounts` | #660 [0232] | `computed_at`; and `v_today` bounding `je.posting_date <= v_today` on a real per-account balance, echoed as the envelope's `as_of` | B+D | **MONEY as-of** | registered + **ESCALATED → RULED (§6.4 row 1): re-pointed, now a CONSUMER of the house derivation** |

### 4.2 · The five migrations that add NOTHING, named rather than omitted

A silent absence cannot be told from a missed census, so each was checked:

* **0225** (#655) — five clock reads, none new: two are column DEFAULTs
  (`trade_invoices.created_at`, `trade_invoice_status.recorded_at`, which live in `pg_attrdef`,
  not in any `prosrc`), the other three are inside `clara._record_journal_entry_core`, recut here
  but on arm (D)'s roster since 0178.
* **0226** (#657), **0228** (#656), **0233** (#635) — no clock token in any body they create.
* **0227** (#651) — spells the MYT zone three times and `now()` five, and mints no name: the zone
  appears in an apply-time backfill UPDATE (`0227:348`) and in two `comment on` strings
  (`0227:368`, `0227:1231`), neither of which reaches `prosrc` or `pg_get_functiondef`; every
  `now()` is inside `clara.sign_depreciation_authority`, recut here and already rostered.

### 4.3 · ESCALATED to the orchestrator — two names, one question — **RULED, AND FIXED**

**Status: closed by DECISIONS §6.4 row 1 (2026-09-19 20:50), applied in fix round 2.** The
escalation below is kept verbatim as the record of what was asked and why; the ruling and the
outcome follow it.

`clara.get_client_financial_pack` and `clara.propose_client_cash_accounts` derive an **as-of** from
the session clock by their own expression, and that as-of reaches ledger rows:

* the pack's `v_as_of` selects the actuals it reports, and `v_today` is the wall that refuses a
  future as-of (`as_of_in_future`) and the anchor of the month it defaults to;
* the proposal sums `journal_lines` joined to approved `journal_entries` with
  `je.posting_date <= v_today`, and echoes that date as the envelope's `as_of`.

"As-of" is named explicitly in §6.3's money-date enumeration, so the rule says re-point both at
`clara._book_today()` and register them as consumers. **That re-point is a migration edit of
`0232_client_financial_pack.sql`, already applied on every rig this wave measured**, so §6.3's own
escape applied verbatim — *"if that needs a migration edit STOP and report instead"*. Fix round 1
did not touch the migration. Both names were registered so the ratchet stayed exact and
additions-only, and `KL_ROSTER_0232_CLIENT_FINANCIAL`'s block carried the finding in the file where
the next reader would meet it.

**The counter-argument the orchestrator needed**, because this is a real trade and not a
formality: both bodies take ONE `now()` sample and build `computed_at` from the same sample, while
`clara._book_today()` samples `statement_timestamp()` **per statement**. Re-pointing them lets a
pack that straddles MYT midnight report an as-of and a `computed_at` from two different days —
which is exactly the argument `KL_ROSTER_0046` records for `preview_ocr_sales_evidence` and
`KL_ROSTER_0214_WORK_PACK` records for `get_client_work_pack`. Three ways out were offered:

1. **Leave them.** Pin both CLASS 2 beside `get_client_work_pack`, on the "one sampled instant"
   argument, and say so in `0232`'s own header.
2. **Re-point in a NEW migration** (0234+), never an edit of 0232.
3. **Give the authority an as-of-at-an-instant form** — `clara._book_today(timestamptz)`.

Nothing else in the thirteen was ambiguous enough to escalate:
`publish_client_cash_account_set` was the only near miss, and it resolves cleanly — `v_today` is
reached only when the caller stated no date **and** `v_books` is null, where `v_books` is
`least(min(finalized opening_seed.as_of), min(approved journal_entries.posting_date))`. A client
with any money always takes the books' own date, and a stated date later than it is refused by name
(`first_version_after_books_start`). The clock can therefore only ever date the first
cash-account-set version of a client with no books at all — a configuration lifetime, not a
posting, a due date or an accounting period.

#### 4.3.1 · The ruling, and what fix round 2 did with it

**DECISIONS §6.4 row 1 chose none of the three verbatim and ruled a fourth:** re-point both at the
house book-day derivation **as an edit of 0232 applied on a FRESH cluster** — recreate `rigint`
with `mkrig.sh` so 0154's cluster-wide role census is honest, re-run the whole chain 0001→0233,
and re-prove the #660 battery, these four census cells, `operation-census` and `rig-isolation`.
`computed_at = now()` stays a sampling read. The counter-argument was weighed, not missed: *"a money
date must be the book day regardless."*

**What the fix actually had to be, and why it is not a one-line `clara._book_today()` call.**
Measured on the red chain before the edit:

* `clara._book_today()` has PUBLIC revoked and `proacl = {clara_fn_owner=X/clara_fn_owner}` — no
  application role holds EXECUTE, and `x42.s5c.1`
  (`packages/db/tests/x42b0-s5c-clock.test.mjs:234-239`) pins that closed ACL as a house law by
  asserting `clara_authenticated` is refused `42501` on it. Widening it is not available.
* both #660 reads are **SECURITY INVOKER** — they run as their caller so 0003's firm-scoped RLS is
  the wall — so neither can call the authority directly.
* a catalog-wide probe returned **zero SECURITY INVOKER callers** of `clara._book_today()`: every
  one of its callers is a SECURITY DEFINER body. These two reads are the first INVOKER bodies in
  the estate that need a money date at all.

So 0232 now installs **`clara.book_today()`** — a one-line `language sql stable security definer`
delegate whose whole body is `select clara._book_today()`, `search_path` pinned, PUBLIC revoked,
EXECUTE to `clara_authenticated` and to no model lane. That is 0042 S5.20's own remedy for its own
problem, in its own words for `clara._fa_today()`: *a DELEGATE, not a second copy* — so exactly one
body in the estate still COMPUTES the house date. A SQL SECURITY DEFINER function is never inlined,
so the definer hop is real. Both reads now assign `v_today := clara.book_today();` and nothing else
moved: `computed_at` is still `now()`, the envelopes still publish `'timezone','Asia/Kuala_Lumpur'`,
and `publish_client_cash_account_set` was left exactly as §4.1 classified it.

**Both names are therefore reclassified in both rosters from CLASS 2 / ESCALATED to CONSUMER of
the house derivation — additions only, no name removed.** They STAY on both arms' rosters, and
that is the point rather than an oversight: arm (B) detects the ZONE STRING, which both still carry
as the `timezone` key their envelopes publish, and arm (D) detects a BARE CLOCK TOKEN, which both
still read for `computed_at`. Re-measured on the fresh from-scratch chain after the fix: **0 extra /
0 missing on both arms**, so the ratchet is unmoved. The delegate adds no name to either arm — it
reads no clock and spells no zone, and `_book_today` is exempt by name on arm (D).

The evidence, the red, the fresh-cluster proof and every count are in
[`integration-fix-2.md`](integration-fix-2.md). The behavioural and provenance proof is the new
cell `p660.pack.as_of_is_book_day`.

---

## 5 · Verification after all four

All run from the integration worktree at `d8473f5d`, after all four commits.

| gate | result |
|---|---|
| `pnpm typecheck` | **exit 0** — apps/web and packages/runtime both `Done` |
| `pnpm lint` | **exit 0** — every workspace project, including `apps/web`'s own guard self-tests |
| `x42b2-r7-s5-census` + `x42b2-s5c-clock` + `x42b2-r7-s5-clock` | **6 / 6** (was 2 pass / 4 fail) |
| `f-a2-tier-d` | **10 / 10** (was 9 with 1 failing) |
| trade-invoice battery | **30 / 30** (was 29) |
| the four db files together, 49 gate flags | **46 tests · 46 pass · 0 fail · 0 skip** |
| `reconcile-belt-isolation-unit` | **22 / 22** |
| `intake-batch-unit` | **14 / 14** (was 13) |
| both runtime files together | **36 / 36** |
| `fixed-asset-acquisition-walk` alone, 3400/3401/3402 | **8 passed (17.9 s)**, exit 0 |
| whole `apps/web` unit suite | **4628 tests · 135 suites · 4626 pass · 0 fail · 2 skip · 71.1 s**, exit 0 — the same shape integration-merge §3.6 measured (the 2 skips are the env-gated `live-provider-auth` cells; the `use-clara-thread-stop` flake did not fire) |

---

## 6 · What was NOT done, and what is left standing

1. **No migration was edited**, and the one place §6.3's rule pointed at one (§4.3) is escalated
   rather than worked around. The ledger checksum on `clara_int` is untouched; no from-scratch
   chain was re-run and `CLARA_RIG_ALLOW_RESET` was never set.
2. **Nothing pushed, no PR.** The branch is four commits ahead of `2f60ff29`.
3. **The successor cut is still not in this branch** — integration-merge §7.1 stands verbatim.
   `chatTurn` is pinned at v20, `claraWork` at v4, `frozen-workflows.json` unchanged.
4. **The named Windows reds of integration-merge §6 rows 8–14 were not re-run and are not
   claimed**: #693 EICAR, the `pg_dump`/`psql` PATH probe, and the five whole-suite flakes
   (ready MAJOR-1, relay-runner, wake-engine, wave-b-lint-belt, documents-viewer polygon). None of
   the four fixes touches their code.
5. **The World e2e legs were not re-run.** Fix 2 changes `lib/reconciler-batches.mjs`, which
   `intake-batch-e2e` exercises; the change is a probe-failure catch on a path that leg never
   takes (its surface is present), and its unit battery covers both branches — but this is stated
   as an argument, not as evidence. If the orchestrator wants the leg re-measured it is leg 3 of
   §3.5, on `rigint3`'s `clara_intake_ci`.
6. **Follow-up the fixes surfaced**: `f-a2-tier-d`'s §D.1 table now carries five wave-born birth
   triggers whose tier prose is measured by three different cells (`c5.wave-births`,
   `c5.trade-invoice-birth`) with no shared instrument. One measured-tier helper taking
   `{ tgname, raises, reasons }` would retire the copy-paste before a sixth lane adds a seventh.
