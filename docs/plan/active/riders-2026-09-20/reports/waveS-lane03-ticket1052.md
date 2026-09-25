# Riders sweep wave · lane 03 · ticket #1052 — the #931 label arm, under the owner's two conditions

**Branch** `riders/wS-lane03` in `C:\Users\zhant\Desktop\clara-wt\656`, base `7bc5a710f`.
**Database** `clara_l06` on `127.0.0.1:55746` (chain 310 files / `0339` at start, 311 files / `0340`
at end). **Playwright triple** 3550 / 3551 / 3552.
**Status: DONE.** The ticket was live on this branch and is now built, tested and documented.

| commit | what |
|---|---|
| `681c26081` | `fix(db): #1052 the claimant-label arm matches on lower(btrim(person_label))` — migration `0340`, its gate module, the gate-chain entry, both cells, the README section |
| `6eaa28bcc` | `feat(web): #1052 the allocation editor names the enrolment an advance came from` — the shared editor's optional `sourceEnrolment` reader, the claim form's answer, five cells (one new test file, in the manifest), one `en.json` key, the `apps/web/README.md` section |

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. No mid-task status request arrived.

---

## 1 · The seams I tested at

Written down before the first cell, from the brief's own "Key interfaces" ("the ownership predicate
in `clara.staff_expense_claim_allocations`'s validator (0301), the claim form's chooser and the
allocation editor (`apps/web`), cell `p931.claimant.samelabel`"):

- **`clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)`** — the public
  door. Both database cells drive it through the battery's own wrapper as the real actors; neither
  reaches into the validator.
- **`clara._assert_claim_basis(uuid,jsonb,boolean)`** — the brief's first named interface. It is an
  internal body, so it is asserted where this estate's documented standard asks for a structural
  cell (the migration's prestate pins and its tail) **and** driven directly in the tail's own probe,
  because the label arm lives in the world half and a migration tail cannot reach it through the
  door.
- **`StaffAdvanceAllocationsEditor`** (`components/registers/staff-advance-allocations-editor.tsx`)
  — the brief's "allocation editor", a real exported component with two callers. Three cells.
- **`StaffExpenseClaimFormView`** (`components/accounting/staff-expense-claim-form.tsx`) — the
  brief's "claim form's chooser", mounted. Two cells.
- Not a seam and not touched: the runtime's wire schema, the chat lane's basis builder, and the
  claim form's candidate FILTER (see §3, AC2).

## 2 · Was the ticket still live? Yes, on both halves, and one half was already done elsewhere

`gh issue view 1052 --comments`: **zero comments**, so the body's Agent Brief is the whole contract;
the owner's ruling it implements is the 2026-09-24 comment on #931, read in full.

Measured on `clara_l06` at chain 0001..0339 before writing anything:

| the ruling's condition | where it was, live | evidence |
|---|---|---|
| "surrounding whitespace" normalised | **ALREADY DONE, at the enrolment door, not at the wall.** Both doors that write a label store `nullif(btrim(coalesce(…,'')),'')` — `clara.enrol_staff_advance_account` (0043:1980) and 0221's auto-enrolment inside the claim door (0221:1149) — so no stored label carries padding | cell `p1052.label.case` drives the real door with `"  farah BINTI idris  "` and reads `farah BINTI idris` back off `clara.staff_advance_accounts` |
| "case" normalised | **NOWHERE.** 0301:753 / 0301:791, carried forward by 0339 at its lines 519 and 557, compared `btrim(person_label)` on both sides | cell `p1052.label.case` red with `CLR10 — that advance was not issued to this claimant` before the recut |
| "the allocation editor shows … the enrolment it came from" | **NOWHERE.** The editor rendered only the caller's own option label, and the claim form's label is `issue_date — outstanding` with no enrolment in it at all | the three editor cells red before the change (the third correctly green: it pins the unchanged caller) |

**A correction to the ticket's framing, with evidence.** The ticket says the whitespace half is a
defect. It is not, and I could not reproduce one: whitespace is normalised at enrolment, so the
`btrim` at the wall is defensive for a row that predates those doors. I kept `btrim` there and made
the tail's probe plant exactly such a row (`"  ali  "`, inserted directly) so the defensive branch
is exercised rather than assumed. The live defect was the case half alone.

## 3 · Acceptance criteria, each with its evidence

**AC1 — "A cell proves `Ali` / ` ali ` match and `Ali B` / `Ali` do not."**

- `p1052.label.case` (`packages/db/tests/staff-expense-claim-allocations.test.mjs` §10) — 1190 is
  enrolled to `Farah binti Idris`; 1191 is enrolled **through the real admin door** to
  `"  farah BINTI idris  "` (padding and a different case, the ruling's two normalisations and
  nothing else). The cell first pins what the doors stored (`Farah binti Idris` and
  `farah BINTI idris`), then admits a 60,500-sen claim allocating 40,000 to the claimant's own
  advance and 20,500 to the advance held under the other enrolment, and reads the confirmed list
  back through `clara.get_staff_expense_claim`. **PASS.** It was **red first**, against the
  unmodified branch, with `CLR10 — that advance was not issued to this claimant`.
- `p1052.label.distinct` — 1191 enrolled to `Farah binti Idris B`, a different person whose label
  merely starts with the claimant's. Refused `CLR10` / `advance_allocation_mismatch` /
  `not_this_claimant` at `claim.advance_allocations[2].advance_id`, naming that advance, and
  `refusesAlloc` proves no journal row, no committed receipt and no claim row were written.
  **PASS.** (This is a non-regression pin; its vacuity control is §6.)
- The migration's tail drives both arms again at apply time against hand-built rows (`T.2`, `T.2b`),
  so a chain that applies 0340 without ever running the battery still proves them.

**AC2 — "A web unit cell proves a label-matched advance renders its source enrolment in the chooser
and in the confirmed list; a directly enrolled one does not carry the extra line."**

- `components/registers/staff-advance-allocations-editor.test.tsx` (new file, in
  `apps/web/test/manifest.txt` at its sorted position), three cells:
  - **the chooser** — two candidates, the claimant's own (`e-own`, 1190) and one held under the
    client's second live enrolment (`e-second`, 1191, `farah BINTI idris`). The label-matched
    option reads `2026-02-01 — 30000 outstanding — held under farah BINTI idris's enrolment on
    1191`; the directly enrolled one reads `2026-02-01 — 40000 outstanding`, byte for byte what it
    read before. **PASS**, red first.
  - **the confirmed list** — two confirmed rows, one on each advance. Exactly ONE carries
    `data-testid="allocation-source-enrolment"`, and its text is the source enrolment. **PASS**,
    red first (`0 !== 1`).
  - **the other caller** — with no `sourceEnrolment` prop (the register's own
    `BookApplicationDialog`), no line is invented and the option text is the caller's own,
    unchanged. **PASS**, and correctly green before the change: it pins what must not move.
- `components/accounting/staff-expense-claim-form.test.tsx`, two cells at the mounted form:
  - an advance offered today that was issued under an **earlier enrolment generation** of the
    claimant's own account (1190 retired and re-enrolled after a name correction) names that
    enrolment in the chooser and, once chosen, on its confirmed row; choosing the claimant's own
    advance takes the line away again. **PASS**, red first
    (`the advance from the earlier enrolment names it: 2026-02-01 — RM 300.00 outstanding`).
  - with the enrolment register unread (`loadEnrolments` → `null`), no option claims a provenance
    the form could not check. **PASS** (correctly green before the change; it pins the conservative
    direction).

  **The scope boundary, stated rather than hidden.** The claim form's candidate FILTER
  (`staff-expense-claim-form.tsx`, the `advanceCandidates` memo) still narrows
  `staff_advance_summary` to `account_code === draft.claimantAccountCode`, so an advance on a
  **second enrolled account** of the same person does not reach the claim form's chooser yet. That
  filter is **#1066's own filed defect**, in its own words ("the form's own chooser never shows
  candidates from that second account"), and widening it also needs the per-allocation
  `accountCode` on the wire (`toClaimWire` sends `{advanceId, amountCents}` only, and
  `clara._claim_allocations` then defaults each allocation's account to the claim head's) and a
  split `derivedLines` preview (it credits one leg at `settlementAccountCode(draft)` today, while
  the door derives one leg per account). None of those three is in #1052's brief, and
  `SWEEP-PLAN.md` puts #1066 next in this lane for exactly them. So AC2's subject — the editor, and
  the claim form's reader that feeds it — is built and driven here at the seams the brief names,
  and #1066 rides on it. **This is the one judgement call in the ticket; §10 records the reading I
  rejected and why.**

**AC3 — "Existing #931 cells stay green; `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0."**

- The whole `staff-expense-claim-allocations` battery, full gate chain: **19 tests, 19 pass, 0 fail,
  0 skipped** — the thirteen #931 cells (including `p931.claimant.samelabel`, whose byte-equal
  labels still match), the four #1067 cells and my two.
- The neighbour battery `staff-expense-claim.test.mjs`: **24 pass, 0 fail**.
- The whole `apps/web` unit suite: **5178 tests, 5176 pass, 0 fail, 2 skipped**.
- `CI=true GITHUB_ACTIONS=true pnpm lint` **exit 0**, and plain `pnpm lint` **exit 0**.

**Out of scope, respected.** The staff master (#1049) is untouched; it was re-parented to the
mainline by the owner's ruling of 2026-09-25 and is not in this lane.

## 4 · The change

**Database.** One statement: `create or replace function clara._assert_claim_basis(uuid,jsonb,boolean)`
— 0339's body **byte for byte** plus `lower()` on both sides of the label comparison. Proved
mechanically, not asserted: the transform script applied exactly three anchored hunks to 0339's
extracted function block and `diff` reports exactly those three (`363c363,370` the comment plus
`select lower(btrim(sa.person_label)) into v_claim_label`; `396a404,410` the comment; `401c415`
`and lower(btrim(sa2.person_label)) = v_claim_label`). Nothing else moved.

The claimant's side is lowered once, where `v_claim_label` is read, so the loop compares two
already-normalised strings and there is exactly one place either side can drift. `btrim` stays for a
row that predates the trimming doors. Not a substring, not `like`, not a similarity, not `unaccent`,
not a collation change, not `citext`.

**What it widens, plainly:** two different people of one client labelled `Ali` and `ali` were two
claimants to this wall and are now one, exactly as two labelled `Ali` and `Ali` already were. That
is the ruling's own trade. The change only ever ADMITS an allocation the ruling calls lawful; it
never widens whose books a claim may reach (every arm still sits inside one client, and the
per-advance cap, the claimant floor and the `sa2.active` requirement are untouched — the tail drives
all three).

**Web.** `StaffAdvanceAllocationsEditor` takes one optional reader,
`sourceEnrolment?: (candidate) => string | null`. When it answers, the editor appends the sentence
to that candidate's chooser option (visible BEFORE the choice) and renders it again as its own line
beside the confirmed row (visible AFTER it) — a `<select>` only ever shows the chosen option's text,
and the preparer confirms a LIST and reads it back as a list. A caller that passes nothing renders
exactly what it rendered before. The CALLER writes the sentence, because only the caller knows what
the subject is: a claim has a claimant enrolment, the register's book-application dialog has none.

The claim form answers it by comparing **enrolments, never account codes**, resolving the claimant's
own live enrolment the way `clara._claim_resolve_claimant` resolves it (the stated enrolment, or the
live enrolment on the account dedicated to them), and returning `null` when the register is unread.

## 5 · Migration

**`packages/db/migrations/0340_staff_expense_claim_label_case.sql`** (957 lines, the reserved
number, the only migration this ticket needed).

Post-image of the recut body: `d1dff7654eda906324b534d723511ba9d4fd5b091f994a84200680c3fb164ffd`.
Ledger checksum: `e126366438db70dbf0cbb52a605d819de73b2b11da51871199726bafc001ca88`.

### Prestate pins — every one measured live on `clara_l06` at chain 0001..0339

**Recut** (skipped on the REDO branch, checked on first apply):

| signature | sha256(prosrc) |
|---|---|
| `clara._assert_claim_basis(uuid,jsonb,boolean)` | `5c55fc8d860bc74c4fd721a81442b4ea19ed66240ef3d20386efd53e2a2cd294` |

That is **0339's post-image, not 0301's** — #1067 landed earlier in this same lane and recut this
validator. The prestate additionally requires `#1067 (0339` to be present in the live body, on both
branches, so a chain that reached this file without 0339 is told which predecessor is missing.

**Non-regression**, pinned in the prestate **and** re-measured in the tail (`T.3`), checked on both
branches:

| signature | sha256(prosrc) |
|---|---|
| `clara.enrol_staff_advance_account(uuid,text,text,boolean,text,text)` | `6db2120df4ffa29cfda6cc282323cb633df6036dfdb76d47b7270a6e6adbf477` |
| `clara._claim_allocations(jsonb)` | `c303577a5c35d9f7c788edc4acded82fa64e7db414d4ee10a61a979ffa34b737` |
| `clara._claim_settlement_account(jsonb)` | `49819cebb6b43dc99ba28adcbf90345227870d3ffdadae7edb42b26faee360ce` |
| `clara._claim_basis_canonical(jsonb)` | `42439eb94a7e2bcc5d8e7f1ba1cb88c01c234f0f9e6a9af694ef525cee8b2b5c` |
| `clara._claim_journal_basis(jsonb)` | `78de12f565d332db3a16d98a37c5cb98cacda392f3daff3a7b4666c1319b5cf9` |
| `clara.admit_staff_expense_claim_work(uuid,uuid,text,jsonb,text,jsonb,text)` | `8ca64d40ff92d6dbc61f53d13269c5a80de39e892bedf5c6da54fd7827089ed2` |
| `clara._tf_adv_claim_application_birth()` | `ab8efc36688a911f78c783b2e18845812771f880179df7709f830cc92effaee0` |
| `clara._claim_resolve_claimant(uuid,uuid,jsonb,text)` | `5ce41a7b5fb900e28111d82676d6b4f31d05e543c6bf19cc49fa1b6cd418404c` |
| `clara._claim_item_total(jsonb)` | `72db918d4d259a3effebd24f9593bd6e1038eb0797a1fb1bc4b0cc10b06cbb8c` |
| `clara._adv_over_application(uuid,bigint,date,bigint,date)` | `b4e9188bc59d0f151bf7ad9854356970662e02e4d9f2c94e7e9eaf54d8ad8769` |
| `clara._adv_enrolment_at(uuid,text,timestamptz)` | `54ae3c5dfec46e55c18eb9db72b94b2b4ab38f953fcf65481eb0e762ce93ebfe` |

`clara.enrol_staff_advance_account` is new to this list relative to #1067's and is pinned
deliberately: the ruling's WHITESPACE half lives in its own `btrim`, so a change there would move
half of what this file is accountable for without touching this file.

**For the integrator:** `clara._assert_claim_basis` is the body #1067 recut before me and the body
#1049 would have retired the label arm from; #1049 is now mainline, so after 0340 the next lane
ticket that needs this family (#1066 needs none — it is web-only) must re-derive against
`d1dff765…`. No other lane in the wave is planned to touch this family (`SWEEP-PLAN.md` shared-file
table). The ten claim-family pins above are byte-identical to #1067's list, so a lane that moves one
of them collides with both tickets.

### Tail assertions (driven, not described)

`T.1` owner / `SECURITY DEFINER` / pinned `search_path` / no PUBLIC EXECUTE. `T.1c`/`T.1d`/`T.1e`
this file's, 0339's and 0301's markers all present, so the recut is its predecessor's body plus two
calls and not a rewrite of either. `T.1f`/`T.1g` the comparison read off the live body: normalised
on both sides, and the case-sensitive form gone (a structural assertion, labelled as such in the
file).

`T.2` is the **driven** probe. The label arm lives in the world half, which needs a client, a chart,
live enrolments and advances, so the tail hand-builds them (every NOT NULL column, CHECK and foreign
key measured on the rig first) and unwinds them in a `CLR99` sub-transaction — the
0018/0019/0020/0146/0260/0302 idiom. Five arms, all driven through
`clara._assert_claim_basis(…, true)`:

- **(a)** claimant `Ali` on 1190, advance under enrolment `"  ali  "` on 1191 → **admitted**. The
  padded row is inserted directly on purpose: it is the one shape the real doors can no longer
  produce, so the wall's own `btrim` is exercised rather than assumed.
- **(b)** the same claim against an advance under `Ali B` on 1192 → refused
  `advance_allocation_mismatch` / `not_this_claimant` at `claim.advance_allocations[2].advance_id`,
  read out of `pg_exception_detail`.
- **(c)** an empty `advance_allocations` array → still refused `at_least_one` at
  `claim.advance_allocations`, so **#1067's rule is proved present by behaviour**, not only by its
  marker.
- **(d)** an advance this client does not hold → still `not_this_client`.
- **(e)** the matching enrolment RETIRED → still refused; the detail's reason is read and accepted
  as either `advance_not_enrolled` (the earlier per-allocation enrolment wall answers first, because
  1191 then carries no live enrolment at all) or `advance_allocation_mismatch`. Both are refusals
  and the cell reads which, rather than assuming.

`T.3` the eleven pins re-measured after the recut. `T.4` the **data-dependent count, always
evaluated and never branched on**: ordered pairs of live enrolments of one client that were two
claimants to the old wall and are one to the new one — `2` at first apply on this lane database (the
pair my own red-run cell had left), `8` after the battery had run again. Nothing is written either
way; the wall is asked per claim and there is no backfill.

### Apply, redo and the first-apply branch

- **First apply** through `pnpm --filter @clara/db migrate`: `#1052 prestate: clean (FIRST apply)`,
  `#1052 tail T.4: 2 ordered pair(s) …`, `#1052 tail OK: …`,
  `applied 0340_staff_expense_claim_label_case`, ledger `311 total`. It applied cleanly on the first
  attempt.
- **REDO (#957) exercised on both branches**, and recorded here because I used it:
  `CLARA_MIGRATION_REDO=0340_staff_expense_claim_label_case` with 0339's body restored took the sha
  branch (`clean (FIRST apply)`), and a redo over this file's own post-image took the marker branch
  (`clean (REDO apply)`). A third redo followed one wording edit to the prestate (the notice claimed
  the 0339 post-image on the REDO branch, where the sha is not asked; the `#1067` marker check also
  moved out of the `if not v_redo` block so it holds on both branches). Ledger checksum after that
  edit: `e126366438db70dbf0cbb52a605d819de73b2b11da51871199726bafc001ca88`, and a plain `migrate`
  afterwards reports `0 new migration(s) applied · 311 total` with no drift.
- **The first-apply branch re-proved by hand** (wave-3 addendum) after that edit: inside one
  transaction that was rolled back, 0339's own `set role … create or replace … reset role` block was
  re-run (live sha read back as `5c55fc8d…` exactly), then the prestate block run **verbatim** →
  `clean (FIRST apply)`, then `rollback`; the live body afterwards is `d1dff765…` again.
- **No `rig-meta.mjs` cohort**, deliberately and by precedent: the file mints no new name (no table,
  no new function, no grant), exactly like 0303, 0304, 0309, 0310, 0311, 0315, 0316, 0318 and 0339.
  `SWEEP-PLAN.md`'s rule is "one cohort entry per migration that mints a new name".

### Frontier and gate chain

- Stem `staff_expense_claim_label_case$` (distinct from `staff_expense_claim_allocations$` and
  `staff_expense_claim_empty_allocation$`; no regex matches another's version string).
- New module `packages/db/tests/staff-expense-claim-label-case-preintegration-gate.mjs` setting
  `CLARA_ALLOW_MISSING_SEC_LABEL_CASE=1`, mirroring the 0339 sibling.
- Gate-chain entry appended to `packages/db/package.json`'s `test` script at its **migration-order**
  position, immediately after `staff-expense-claim-empty-allocation` (0339) and immediately before
  the glob — a one-token hunk in a shared file. The chain is now **127** gates.
- The cells use the two-frontier idiom `if (await gateAlloc(t) || await gateLabel(t)) return;`, so a
  database carrying 0301 but not 0340 skips loudly under a sweep and fails loudly under a focused
  run.

## 6 · The vacuity control

`p1052.label.case` was genuinely red-first in the TDD sense (written, run against the unmodified
branch with the frontier gate temporarily lifted, seen red, then the minimal code). The gate line was
restored byte for byte immediately afterwards. `p1052.label.distinct` is a non-regression pin written
after, so it needs the control:

With 0339's body put back on `clara_l06` byte for byte (live sha read back as `5c55fc8d…`) and the
ledger untouched:

| cell | against the pre-image subject |
|---|---|
| `p1052.label.case` | **FAIL** — `that advance was not issued to this claimant` (`CLR10`) |
| `p1052.label.distinct` | **PASS**, correctly — it pins behaviour the change must not move |

`2 tests, 1 pass, 1 fail`. The subject was then restored through the supported redo mode and both are
green again.

The three editor cells and the two form cells each ran red before their implementation, except the
two that pin what must not move (the no-prop caller, and the unread-register arm), which were green
before and after and are labelled as such above.

## 7 · Gates, with counts

Run from `C:\Users\zhant\Desktop\clara-wt\656`, `PGPORT=55746 PGDATABASE=clara_l06`, Node 22,
Playwright triple 3550/3551/3552.

| gate | command | result |
|---|---|---|
| the db test file I touched, FULL gate chain (127 `--import`) | `node --test --test-concurrency=1 $GATES tests/staff-expense-claim-allocations.test.mjs` | **19 tests, 19 pass, 0 fail, 0 skipped** |
| the same file FOCUSED (no gates — the acceptance shape) | `node --test --test-concurrency=1 tests/…-allocations.test.mjs` | **19 pass, 0 fail, 0 skipped** |
| neighbour battery the recut validator serves | `… $GATES tests/staff-expense-claim.test.mjs` | **24 pass, 0 fail, 0 skipped** |
| operation census | `… $GATES tests/operation-census.test.mjs` | **10 pass, 0 fail, 0 skipped** |
| rig isolation (no reset flags) | `… $GATES tests/rig-isolation.test.mjs` | **23 tests, 22 pass, 0 fail, 1 skipped** — T19 `poison-role`, `SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1`, which the rig forbids |
| web migration-pins corpus (sweep rule d: a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` | **22 pass, 0 fail** — no corpus edit needed: 0340 contains no dynamic SQL, so it needs no reviewed barrier entry, and the corpus reads the directory rather than pinning a file count |
| the two web test files I touched, alone | `node --import ./test/bootstrap.mjs --import tsx --test components/registers/staff-advance-allocations-editor.test.tsx` / `… components/accounting/staff-expense-claim-form.test.tsx` | **3 pass, 0 fail** and **17 pass, 0 fail** |
| the WHOLE web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **5178 tests, 5176 pass, 0 fail, 2 skipped**, exit 0 |
| browser walk — the claim form | `pnpm --filter @clara/web e2e staff-expense-claim-walk` | **14 passed** (42.2 s) |
| browser walk — the register that shares the editor | `pnpm --filter @clara/web e2e staff-advances-register-walk` | **4 passed** (14.3 s) |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | **OK — 322 frozen file(s), no manifest diff** |
| typecheck | `pnpm typecheck` | `apps/web` Done, `packages/runtime` Done, exit 0 |
| lint | `pnpm lint` | exit 0 |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 |
| migration drift | `pnpm --filter @clara/db migrate` | `0 new migration(s) applied · 311 total`, no drift |

`packages/runtime` source was not touched, so its unit files and the parts-parity check are not in
scope; the freeze lint was run anyway and is clean. No known Windows-only red was hit.

## 8 · Successor contract

**None is owed.** Checked rather than assumed, because the wave asks for the check:

- The refusal vocabulary does not move. `not_this_claimant` keeps its reason
  (`advance_allocation_mismatch`), its field and its position; the change only makes the arm admit
  more, and an admission carries no new word.
- **Nothing else in the estate compares two person labels.** `grep -rn "person_label|personLabel"`
  over `packages/runtime/src`, `packages/runtime/lib`, `packages/runtime/workflows`, `apps/web/lib`
  and `apps/web/components` returns only reads, writes and type declarations — the four runtime
  sites are the wire re-spelling (`workRoutes.ts:414,472`) and the chat basis builder's own
  presence/trim of the claimant's own label (`staff-expense-claim-basis.ts:75,285-286,377`), none of
  which compares one label with another. `clara._assert_claim_basis` is the only comparison in the
  database too (`grep -n person_label packages/db/migrations/*.sql`: 0221 and 0301/0339 write or
  read it; only the wall compares). So there is no mirrored predicate to keep in step and no frozen
  body that would need the new rule.
- The editor's new prop is additive and optional; the register's frozen-free caller
  (`BookApplicationDialog`) is unchanged and pinned green by its own cell.

## 9 · Docs

- `packages/db/README.md` — a new `## 0340` section only (no existing section edited): the ruling,
  what was live and how it was measured, the change and what it widens, the driven tail, both redo
  branches, the first-apply proof and the vacuity control with both shas.
- `apps/web/README.md` — a new `## #1052` section only: the one optional prop, why the line is not
  merely a suffix inside the `<select>`, why the claim form compares enrolments rather than account
  codes, and what is deliberately left to #1066.
- No `CONTEXT.md` change: the ticket coins no domain term. "Source enrolment" is descriptive prose
  for `staff_advance_accounts`, which `CONTEXT.md` already carries, and `SWEEP-PLAN.md` puts a
  `CONTEXT.md` edit in this lane only if #1049 stays (it did not).
- `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched, as the work order requires.

## 10 · The judgement call, and the reading I rejected

**The question.** AC2 says "a label-matched advance renders its source enrolment **in the
chooser**". The claim form's chooser cannot contain a label-matched advance today, because its
candidate filter narrows to the claimant's own account code. So either #1052 widens that filter, or
its positive cell is driven at the editor's seam instead of at the form's.

**What I did, and why.** I drove it at the **editor**, and left the filter alone.

- `SWEEP-PLAN.md` L3 names the filter as #1066's own site, by the same construction it uses for its
  neighbours ("#1068 is a different file (`…staff-expense-claim.ts:283-284` …)").
- #1066's brief claims that defect in its own words and makes it AC1.
- Widening the filter alone would offer a control that the door then refuses `not_this_client`,
  because `toClaimWire` sends no per-allocation `accountCode` and `clara._claim_allocations`
  defaults each allocation's account to the claim head's. Offering a refusal is worse than the
  status quo and would breach "beta, nothing dark" in the direction the ruling cares about.
- Carrying the account code through as well would also need `ClaimAllocationDraft` (a persisted
  draft shape, with its own restore validator) and `derivedLines` to split per account — three
  changes the brief never mentions and that are exactly #1066's AC1.

**What this means for #1066.** Nothing of its scope is taken. It widens the filter, adds the
per-allocation account code to the wire and splits the preview, and it gets the display for free by
passing the reader that already exists. Its AC2 (a label-mismatch refusal that reads as a labelling
issue rather than a flat ownership refusal) is untouched by me — though note that #1052 removes the
most common cause of that false refusal, so #1066's implementer should re-derive how often it can
still happen before building a new message.

**If the orchestrator reads AC2 the other way**, the missing piece is small and named: widen
`advanceCandidates` by the door's own arm (b) (same normalised label, another live enrolment of the
client), then the three derived-value sites above. I did not build it because it is #1066's.

## 11 · Follow-ups worth filing

1. **`lower()` is collation-dependent, and this estate has never said which collation a person label
   is compared under.** Measured: the lane database is `C.UTF-8` / provider `c`, where
   `lower('Ünal') = 'ünal'`; hosted and Gate A's second pass run `en_US.UTF-8`. For ASCII and for
   ordinary Latin-1 names the two agree, but the wall's answer for a label is now a property of the
   database's locale, which no test pins. Worth one small ticket: either pin the comparison to a
   deterministic collation (`lower(btrim(x) collate "C")` would be WRONG — it would stop folding
   accented capitals — so the honest option is an explicit ICU or `en_US` collation), or record the
   dependency in `CONTEXT.md` and let the staff master (#1049) make it moot.
2. **The claim form offers advances the door will refuse.** An advance issued under a RETIRED
   generation of the claimant's own account code is in the chooser today (the filter is by code) and
   is refused by the wall (`sa2.active`). After this ticket the preparer at least sees which
   enrolment it came from, but the candidate itself is still offered. Filter it out, or say beside
   it that it cannot be discharged by this claimant. Adjacent to #1066 but not in its brief.
3. **`clara._claim_allocations`'s silent fall-through** is still there (carried over from #1067's
   report, follow-up 2) and is what makes the per-allocation `accountCode` necessary before a
   cross-account allocation can be submitted from the browser. Worth naming in #1066's brief.

## 12 · Anything unverified

- **A from-scratch 0001→0340 chain was not run here**, by the rig's own rule (a second from-scratch
  chain on a lane cluster needs the #867 recipe; 0154 pins the cluster-wide role count). The
  integrator's disposable-cluster run is the proof. What I can state is that the prestate's
  first-apply branch passes against the real 0339 pre-image (§5) and that the tail passes on both
  branches.
- **The tail's `T.4` count is informational, not a wall.** It reports how many live enrolment pairs
  the normalisation unifies; on hosted it will be whatever real firms have typed, and this file does
  not act on it. A hosted apply should have that number read and, if it is non-zero, the pairs
  looked at — two genuinely different people labelled `Ali` and `ali` on one client would become one
  claimant to this wall. That is the ruling's accepted trade, but nobody has looked at hosted data
  for it.
- **Not run under WSL as `runner`**: I added no `packages/runtime` test file, so the addendum's Linux
  re-run does not apply. The db cells reach no spool and no filesystem path; the web cells are
  DOM-only.
- **`en.json` was checked for duplicate keys with an independent line scanner** (not `JSON.parse`):
  0 duplicates across 7069 keys, and the file was not re-serialized — the edit is one inserted line.
