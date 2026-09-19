# #655 — fix round 1 — 完整记录发票、账单及对应应收应付

**Branch** `impl/655-invoice-bill` · **Worktree** `C:\Users\zhant\Desktop\clara-wt\655` · **Rig** PG 55705 / `clara_655`.
**Round entered at** `bdf8b46a` (10 commits) · **HEAD** `067f84a1` — 15 commits on the branch, 5 in this round.
Twelve findings: spec `fix_then_accept(2)`, standards `fix_then_accept(2)`, adversarial `fix_then_accept(8)`.
**Nine applied · one deliberately left (measured, not silent) · two ratification-requested.**
All evidence **local**; **hosted evidence pending**.

```
067f84a1 docs: the module READMEs and the successor contract carry the fix round's measurements
96226229 fix(runtime): the wire half of the validation stops answering four shape failures with one token
40bc89f8 fix(db,runtime,web): one refusal names one thing, money renders as money, and the direction noun is a word
e4ae650d test(db): drive the two undriven refusal tokens, un-vacuum the race and parity cells, and say what the belts really do
cd27b06e fix(db): a raced pair under one intent key can no longer be answered somebody else's invoice
```

## How the migration was re-applied at all (read this before the evidence)

0225 is unmerged and mine, and the rig already carries it. Its prestate section pins the **pre-image**
`sha256(prosrc)` of six governed bodies which `clara_655` no longer holds — they are post-image now — so
`pnpm db:migrate` cannot re-apply the edited file, and a from-scratch chain is forbidden on this cluster
(RIG.md: migration 0154 pins the cluster-wide `clara%` role count). Each edited body was therefore
re-applied **from the file's own text**: extracted between its `create function` line and its terminating
dollar tag, `create` turned into `create or replace` (which preserves owner and ACL), executed under
`set role clara_fn_owner`, the role 0225 itself sets at line 269. Nothing was retyped.

Then it was **proved rather than asserted**: a checker re-derives every function body from 0225's text and
compares `sha256(body)` against `sha256(prosrc)` on the rig — **all 13 of 0225's function bodies match the
file byte for byte**. The ledger row's checksum was re-pointed at the edited file, so `pnpm db:migrate`
reports `0 new migration(s) applied · 220 total` instead of drift on a file nobody has diverged from.

The one `comment on function` statement whose text changed (`_assert_trade_invoice_basis`, which lists the
ladder) was re-applied the same way, so `pg_description` agrees with the file too.

**And the ledger must be re-pointed after EVERY edit, which is worth knowing before someone reads a red.**
`migrate.mjs` refuses to run at all on checksum drift, and `rig-helpers.mjs`'s `ensureReady` calls it — so a
0225 edit made after a resync turns `operation-census.test.mjs` into **8 red cells whose error is the drift
message, not a census finding**. That is exactly what happened once here; the resync made it 10/10 again.
The final numbers below are all from runs taken with the ledger in sync.

**What this does NOT prove, stated plainly:** that the edited 0225 applies cleanly **from scratch**, tail
census and all. That needs a database below frontier 220, which this cluster may not build. **Unverified —
the integrator's first from-scratch apply is the test.**

## Finding by finding

### Applied (red first, then green)

**ADV-655-1 · blocker · a raced pair was answered about somebody else's invoice.**
*Did:* added step 8b to `clara.admit_trade_invoice_work` — after the `on conflict (work_id) do nothing`
insert, re-read the surviving row's `particulars` and raise `intent_payload_conflict` when it is not what
this caller sent. The idiom is `_admit_accounting_work_core`'s own concurrent-race re-read
(`0194:1239-1256`). *Red first:* `p655.replay.race` grew a divergent arm — two parties, two references, one
key, one basis — and failed on the unguarded door with **"exactly ONE of a divergent pair is answered —
2 !== 1"**: both callers left as SUCCESS, exactly as the review measured. *Green:* the loser leaves CLR10
`intent_payload_conflict` with `field:"particulars"`, and the cell now also asserts that the answered
caller's `counterparty_id`, `kind` and `due_date_source` are the ones the surviving row holds, and that the
stored reference belongs to the same submission as the stored party — never a blend. `0225` step 8b;
`packages/db/tests/trade-invoice.test.mjs` `p655.replay.race`. Commit `cd27b06e`.

**ADV-655-3 · the two cells that could not fail.** *Did:* the race half is above. The parity half now asserts
the due date **against the rule by name** — `2026-04-30` on a fixture whose document date is 27 days
earlier — and states that `2026-04-03` (document + terms) is *not* what is written, with a second assertion
that the two anchors genuinely differ on this fixture so the first cannot be vacuous. The lane-to-lane
equality survives as its own, separately scoped claim. `p655.parity.source_vs_direct`. Commit `e4ae650d`.

**ADV-655-4 · two ladder tokens nobody drove.** *Did:* new cell `p655.authority.cited_and_inactive` drives
both through `refusesTi`, so the "wrote nothing" half is proved too: a real verified document
(`ingestDocument`) is cited by a trade invoice that posts, then cited again ⇒ CLR13 `source_already_posted`
naming **both** the document and the entry that already holds it; an archived client ⇒ CLR10
`client_inactive`. The cell failed its first run for a fixture reason (`documents_sha256_check` — the sha
must be 64 hex), which is what a cell actually reaching the database looks like. This closes an evidence
gap; it is not a defect fix, because the door already raised both. Commit `e4ae650d`.

**ADV-655-5 · an unreachable belt that read as the reason.** *Did:* kept the belt, relabelled it. 0225 step 6
now states the measurement: step 2's re-badge of `clara._assert_journal_basis` answers first and carries
that predicate's own `field`/`constraint` keys, which step 6's raise does not build, so nothing reaches
step 6 with `v_dr <> v_cr`. It is kept deliberately — it is the only balance law this door owns, and a belt
that never fires is cheap where a hole is not. `p655.polarity.matrix(e3)` now pins **which arm answered**
(`detail.constraint === "balanced"`, `detail.field === "lines"`), so a change that makes step 6 the
answerer reds. Commit `e4ae650d`.

**ADV-655-7 · LADDER 3T claimed a rank the code does not express.** *Did:* rewrote the comment to say what
the code does — 3T is tested before `e.coding_kind` is read at all, so it sits above *all* the coding_kind
ladders, not only above LADDER 5's default. Today the two readings cannot diverge, because no entry carries
both a coding_kind and a trade invoice (this lane pins `coding_kind IS NULL`, cell
`p655.rig.coding_kind_untouched`; the coding lane writes no `trade_invoices` row). #665's cutover produces
the entry that carries both and must decide explicitly. *Not* narrowed to `e.coding_kind is null` in code,
deliberately: that would deepen a widening of this shared classifier which is itself awaiting ratification
(F1). Commit `e4ae650d`.

**ADV-655-8 · `tin` is advertised and resolves nothing.** *Did:* made the contract honest rather than
changing behaviour. The tool schema's own `.describe()` and 0225's resolver header now state the resolution
keys in order — id, then registration number, then normalised name or live alias — and say that a TIN-only
payload leaves as `party_unresolved`. Adding a TIN arm is a real improvement **and** a real precedence
question (which wins when registration and TIN disagree; whether a cross-client identifier — `0215:1157-1164`
reads `tin` only as an identity WATCH — may resolve inside one client's books), so it is a follow-up, named
in 655-final.md. Commit `40bc89f8`.

**F2 · one token named four different failures.** *Did:* split the ladder.
`clara._assert_trade_invoice_basis` now raises `invalid_particulars` (a payload that is not an object),
`invalid_currency` (not MYR) and `invalid_tax_facts` (tax facts that are not an object) beside
`invalid_kind` (the kind, and only the kind) — **eighteen** tokens: the fourteen DECISIONS.md:50 fixes plus
these four. The runtime's wire half (`toDbTradeInvoice`) names the same four, because its own contract is
that "a browser cannot tell the two halves of one validation apart" and leaving it conflated would have made
it the private vocabulary it forbids; an unusable document number is `invalid_particulars` there, since
inventing a token the database never raises breaks the same contract from the other side. *Red first:*
`p655.polarity.matrix(d2)` asked for the three tokens and got `invalid_kind`; the runtime census cell asked
for eighteen names and got fifteen; `route.shape` got `invalid_kind` three times. `en.json` gained the three
sentences and `trade-invoice-form.test.tsx`'s banner loop renders each. Commits `40bc89f8`, `96226229`.

**S1 · money rendered as raw sen.** *Did:* `<Money cents={…} />` (`components/journals/money.tsx`, the N9
render path) for the outstanding — a posted RM 1,060.00 bill read **"Outstanding: 106000"**. *Red first:* the
new `work-detail.test.tsx` cell `655 AC5/AC12` failed on "the outstanding renders in ringgit". It also caught
my own first draft asserting a literal `"RM 1,060.00"`, which never matches: next-intl's narrowSymbol output
separates the symbol with U+202F — the same vacuity `journal-entries-table.test.tsx:105-111` had to learn
once. The walk asserts it in the browser too, plus `not.toContainText("106000")`. Commit `40bc89f8`.

**S2 · the stated total was never rendered.** *Did:* it renders beside the two dates, through `<Money>`,
using the already-authored and until now dead `TradeInvoice.link.total`. It matters most in the `admitted`
state, where the journal-lines table does not exist yet and the invoice's amount was visible nowhere on the
page. Same cell, same walk leg. Commit `40bc89f8`.

### A defect this round found on its own

**`TradeInvoice.link.domain.*` did not exist.** `work-detail.tsx`'s `tti` is scoped to `TradeInvoice.link`
and the block asks it for `domain.ap`; that key lived under `TradeInvoice.domain`. next-intl raised
`MISSING_MESSAGE` and **C08.5's direction-aware noun rendered as its own key path** — while the first cut's
report claimed the walk showed "Supplier bill / Alpha Supplies / AP", which no walk leg ever read. The key
exists now ("Payable" / "Receivable"), the unit cell asserts the word **and** that no raw message key leaks
into the page, and walk leg 2 reads it in the browser. 655-final.md's C08.5 row is corrected. Commit
`40bc89f8`.

### Deliberately left (measured, not silent)

**ADV-655-6 · the same bill number can be recorded twice.** Left, with the reason named. "Duplicate" on this
lane means a replayed INTENT — what AC4 and the brief's cell 13 ask for, proved four ways. A
same-document-number probe is a new refusal/advisory surface the brief does not grant, and the reviewer's own
analysis rules out the cheap version: a unique on `(client_id, counterparty_id, reference)` would be wrong,
because `reference` is nullable and two suppliers legitimately reuse numbers. **Instead of silence, the
branch measures it:** new cell `p655.duplicate.same_reference_is_NOT_probed` posts one bill number under two
intent keys and asserts TWO trade invoices, TWO AP open items and 212000 sen of payable for one RM 1,060.00
bill. A later ticket that adds the probe reds that cell. Named as a residual and filed as a follow-up in
655-final.md. Commit `e4ae650d`.

### Ratification requested (applying them would change what the brief specifies)

**F1 · 0225 recuts THREE bodies, not one.** DECISIONS.md:78 / D11 and brief-655.md:13 bind #655 to recut
exactly `clara._record_journal_entry_core`, with `_subledger_classify_entry` named among the five bodies to
be pinned byte-identical. The branch also recuts `_subledger_classify_entry` (LADDER 3T) and
`_tf_subledger_item_belt`, and substitutes `_tf_subledger_entry_belt` into the non-regression pin set. The
implementer measured the necessity and disclosed it (migration header MEASUREMENT 2; the final report's
"Scope deviation" and Assumption 1), and the reviewer confirmed the widening is technically sound —
`x37-wave-c-a-subledger` and `fixed-asset-acquisition` are green — **but sound is not authorised.** Nothing
in this round narrows or widens it further, and ADV-655-7 was deliberately answered with a comment rather
than a code gate for exactly that reason. **The orchestrator must either rewrite D11 / §1's row and the
brief's "EXACTLY ONE BODY" line to match what shipped, or direct a follow-up that unwinds the two extra
recuts.** Not DECISIONS-compliant until one of those happens.

**ADV-655-2 · the counterparty-terms due date anchors on the POSTING date, not the document date.**
`clara._trade_invoice_due` derives `posting_date + payment_terms_days`. Payment terms conventionally run
from the document, and the document date is exactly what this ticket added — so a 2026-03-04 bill posted
2026-03-31 with 30-day terms is stored due **2026-04-30**, 27 days later than 2026-04-03, in an append-only
row with zero admitted updates, and copied into `open_items.due_date`, which is what `ap_aging` renders as
overdue. **But brief-655.md's section 4 cell 11 prescribes `posting_date + 30` verbatim**, D12c leaves the
anchor unstated while pointing at the legacy producer `0040:6010-6015`, and the coding lane is explicitly
left untouched. Changing it changes what the brief specifies, so it is a ruling, not a hunk. *What this
round did instead:* made the number impossible to miss — `p655.parity.source_vs_direct` pins `2026-04-30`
by name on a fixture where the two anchors differ by 27 days, so a ruling either way is a one-line change
that reds a cell rather than a silent drift. **If the orchestrator rules for the document anchor**, the
change is one expression in `_trade_invoice_due`, that cell's constant, and a stated divergence from the
coding lane whenever `document_date <> posting_date`.

## Commands and counts (this round)

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** |
| `pnpm lint` (worktree root) | **exit 0** |
| `node --test --test-concurrency=1 $GATES tests/trade-invoice.test.mjs` (41 gate flags) | **28 pass · 0 fail · 0 skip** (26 before; +`p655.authority.cited_and_inactive`, +`p655.duplicate.same_reference_is_NOT_probed`) |
| `node --test tests/trade-invoice-unit.test.mjs` (runtime) | **23 pass · 0 fail** (22 before; +`route.shape`) |
| `… --test components/accounting/trade-invoice-form.test.tsx` | **13 pass · 0 fail** |
| `… --test components/work/work-detail.test.tsx --test-name-pattern "655 AC5"` | **1 pass · 0 fail** (red twice before the fix) |
| whole `apps/web` suite, `node scripts/run-tests.mjs` | **4180 tests / 135 suites · 4177 pass · 1 fail · 2 skip**, run twice with identical counts; only the second run's output was captured in full, so the failing test is named from THAT run — see below |
| that file alone, `lib/clara/use-clara-thread-stop.test.ts` | **25 pass · 0 fail** |
| `pnpm --filter @clara/web e2e trade-invoice` (3340 / 3341 / 3342) | **12 passed (52.3s)**, with the new leg-2 assertions |
| rig↔file congruence over 0225's 13 function bodies | **13 OK · 0 drift** |
| `pnpm db:migrate` | **0 new migration(s) applied · 220 total** |
| `operation-census.test.mjs` | **10 pass · 0 fail** |
| `x37-wave-c-a-subledger.test.mjs` | **39 pass · 0 fail** |
| `fixed-asset-acquisition.test.mjs` | **21 pass · 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 296 frozen files, 53 use-workflow modules frozen+registered** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK — reader ⊇ emittable; no new part kind** |
| World leg, `node tests/trade-invoice-e2e.mjs` on `clara_655` | **PASS — all 5 legs** (admit→run→commit→ONE AP item; lost ack; typed 409 from the particulars comparison; `exit_after_commit`+respawn ⇒ ONE of everything; the due-date basis end to end) |
| `rig-isolation.test.mjs` (no reset flags) | 19 pass · **1 fail (T10b)** · 1 skip — **#866**, a Workflow World is bootstrapped on `clara_655`; the brief predicts it and says to report it, not fix it |

**The one whole-suite red is not this branch's.** `lib/clara/use-clara-thread-stop.test.ts` — "630 a stop the
door says had ALREADY FINISHED does not re-attach" — fails `3 !== 0` on a byte count under whole-suite
contention and passes **25/25 alone**. (The first whole-suite run produced the same counts but its output was tailed, so which test failed there is **unverified**; the second run's full log names this one.) `git diff --name-only origin/main..HEAD` does not contain that file,
and `lib/clara/*` is #642's, which brief-655.md forbids this lane to open. Same family as the known
`thread-live-clarify.test.tsx` whole-suite load flake (WORK-ORDER rule 9), on a different file. Reported,
not fixed.

**One rig incident, so the numbers are readable.** Running the World leg, the census suites, the whole web
suite and the Playwright build at once wedged the Windows↔WSL forwarding for port 55705: the server was
healthy (`psql` inside WSL answered instantly, 6 connections) while every Windows-side handshake timed out
against four CLOSE_WAIT/FIN_WAIT2 socket pairs left by the killed processes. `pg_ctlcluster 17 rig655
restart` cleared it. No data was touched, no reset flag was ever set, and the suites above were re-run
serially afterwards, and the World leg then passed all five legs. It is a host-contention fact,
not a finding about the code, and the reason every number in the table comes from a serial re-run.

## What changed in 655-final.md

The AC5 and AC12 rows (money is rendered and asserted), the **C08.5 row — its first-cut evidence was wrong**,
the battery count 26 → 28, the e2e count and its new assertions, the successor contract (eighteen tokens;
the race guarantee that a `replayed:true` answer describes the row its `invoice_id` names), Assumption 2
(four shape tokens, not one fifteenth), two new residuals (the duplicate-number gap; the anchor under
ratification) and two new follow-ups (the duplicate probe with an owner; resolve-by-TIN or stop carrying it).

## Still true, and still unverified

- **Hosted evidence pending** — everything above is local.
- **A from-scratch apply of the edited 0225 is unverified**, for the reason in the second section.
- **AC4's park half and a commit-window cancel are still not driven on this lane** — the first cut's named
  residual; the shared World harness carries two scripted models and widening it was not granted.

---

## Fix round 2

**Round entered at** `067f84a1` (15 commits) · **HEAD** `0911f7b8` — 16 commits, **1 in this round**.
Driven by `DECISIONS.md` §6.2 (post-review ratifications, 2026-09-19 15:10): **§6.2.0 R-A**, **§6.2.1**'s
`#655` rows and **§6.2.2**'s work list, plus `655-recheck-1.json`'s two open items.
All evidence **local**; **hosted evidence pending**.

```
0911f7b8 fix(db,runtime,web): agreed payment terms run from the document date, not from the day it was keyed in
```

### R-A — the counterparty-terms due date anchors on the DOCUMENT date

**Finding** (recheck-1 `ADV-655-2`, ruled at `DECISIONS.md` §6.2.0 R-A and listed in §6.2.2): the terms
fallback derived `posting_date + payment_terms_days`. R-A **overrules** it: 账期从单据日起算 — "30 days net"
is thirty days after the invoice, so the day a bookkeeper keys it in must not move the money's due date.
A 2026-03-04 bill posted 2026-03-31 under 30-day terms is due **2026-04-03**, not 2026-04-30; the old
anchor handed the client 27 days of float and told `ap_aging` an already-overdue bill was current, in an
append-only row with zero admitted updates.

**What I did.** One expression in `clara._trade_invoice_due` (`0225:1010-1024`): the terms arm now adds the
terms to `coalesce(document_date, posting_date)`. Its doc block and a new `comment on function` state the
ruling, the accounting reason, and one measured honesty — **the posting arm is a belt, not a path**: this
door *requires* a document date (`_assert_trade_invoice_basis` raises `invalid_due_date` /
`field:"document_date"` / `constraint:"required"` before anything durable), so the right arm of that
`coalesce` is unreachable from `clara.admit_trade_invoice_work` today. It is written anyway because the
function is `immutable` and a later lane may admit an undated document. The door's `not_before_document`
belt gained a comment saying why a *derived* date can no longer reach it (`payment_terms_days` is CHECKed
1..365, so `document_date + terms` is always strictly later).

**Evidence — the function itself, measured on the rig after the re-apply:**

```
select clara._trade_invoice_due('{"document_date":"2026-03-04"}', '{"posting_date":"2026-03-31"}', 30)
  => {"due_date":"2026-04-03","due_date_source":"counterparty_terms"}
select clara._trade_invoice_due('{}',                              '{"posting_date":"2026-03-31"}', 30)
  => {"due_date":"2026-04-30","due_date_source":"counterparty_terms"}   -- the belt, with no document date
```

**Evidence — the cells, red first.** Against the *unchanged* database the battery ran **29 tests · 27 pass ·
2 fail**, both failing `expected '2026-04-03' / actual '2026-04-30'`:

* `p655.due.terms_fallback` — retitled to `document_date + 30` and now asserting `2026-04-03` on both the
  `trade_invoices` row and the `open_items` row.
* **NEW cell `p655.due.anchor_document_date`** — the sibling §6.2.2 asks for. It drives ONE bill down BOTH
  lanes on a fixture where the anchors are 27 days apart (document 2026-03-04, posted 2026-03-31, agreed
  terms 30 days) and asserts each number **by name**: `2026-04-03` on the Work lane, `2026-04-30` on the
  legacy coding/upload lane (`0040:6010-6015`, left untouched this wave — R-A calls it that lane's own
  defect and gives it to **#665**'s cutover). It also asserts the two items still agree on domain, kind,
  signed cents and item date, so the divergence is the anchor and nothing else, and it opens with
  `assert.notEqual(TERMS_FROM_DOCUMENT, TERMS_FROM_POSTING)` so neither half can be vacuous.

**Evidence — the parity cell no longer depends on the anchor.** `p655.parity.source_vs_direct`'s Work-lane
fixture now dates the document on the day it posts (`documentDate: TI_DATE.posting`), so both lanes derive
`2026-04-30` and the cell says what it means — the same economic facts produce the same domain, sign,
amount, item date, kind and due date. It asserts the fixture's own premise (the stored `document_date` IS
`TI_DATE.posting`), so the coincidence is stated rather than assumed.

**Evidence — the rest of the lane tells the same story.** The World leg's leg 5 (`trade-invoice-e2e.mjs`)
now expects `2026-04-03` in the 202 body *and* on `clara.open_items.due_date`; the Playwright mock
(`trade-invoice-mock.mjs`) answers the date `clara.get_trade_invoice` would really give for its own
`document_date: "2026-03-04"` fixture (it was internally impossible before), and the walk reads it in the
browser; `trade-invoice-form.test.tsx`'s mocked 202 does the same. Prose: `CONTEXT.md`'s **Due-date basis**
term (the anchor in the definition, the posting date named in its `_Avoid_`), `packages/db/README.md` (a
new paragraph with both numbers and #665's ownership), `packages/db/tests/README.md`,
`packages/runtime/README.md`, `apps/web/README.md`, the v21 tool schema's own `.describe()` text in
`packages/runtime/lib/trade-invoice-basis.ts` (the contract the successor cut will carry),
`apps/web/lib/work/trade-invoice.ts`, and the two user-facing `en.json` sentences
(`TradeInvoice.dueDate.description`, `TradeInvoice.dueBasis.counterparty_terms`).

### How the EDITED 0225 was re-applied — route (2), the #635 precedent

**The problem.** 0225 is unmerged and already applied on `clara_655`; `scripts/migrate.mjs` refuses an
applied file whose checksum drifted. Fix round 1 solved this by re-applying each body from the file's text
and re-pointing the ledger row — which left "does the edited file apply end to end" **unverified**. This
round did not repeat that.

**Route (1) was measured and REJECTED, not assumed away.** A from-scratch chain on a new database of this
cluster would red at `0154_binding_proposal_pr_1.sql:3788`, which asserts
`(select count(*) from pg_roles where rolname like 'clara%') = 14`. Measured on this cluster: **18**
(`clara_agent_read_login, clara_agent_ro, clara_auth_wall, clara_auth_wall_login, clara_authenticated,
clara_fn_owner, clara_freeform_login, clara_freeform_ro, clara_runtime, clara_runtime_login,
clara_stripe_webhook, clara_stripe_webhook_login, clara_wake_bank, clara_wake_bank_login,
clara_wake_filing, clara_wake_interactive, clara_wake_proactive, clara_wake_write_login`) — roles are
cluster-wide, so 0154 cannot pass a second chain here. **No `clara_655b` was created.**

**Route (2), executed in ONE transaction.** The three bodies 0225 recuts were taken by
`pg_get_functiondef` off the disjoint rig **55709 / `clara_659`** (frontier 220, newest
`0231_firm_portfolio_pack`; the posting/subledger family is untouched there), **each verified against
0225's own pin before it was used**; every object 0225 creates was dropped; the `0225_trade_invoices` row
was deleted from `clara.schema_migrations`; and the restored bodies were re-hashed **inside the same
transaction** before commit. `CLARA_RIG_ALLOW_RESET` was never set; no other worktree or cluster was
touched.

| Body | post-image before the unwind (fix round 1) | pre-image restored from `clara_659` | 0225's own pin | after the re-apply |
|---|---|---|---|---|
| `clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)` | `c4396f6c…62bb` | `bc245246…38b3` | `bc245246…38b3` ✔ | `c4396f6c…62bb` (identical) |
| `clara._subledger_classify_entry(uuid)` | `58c99427…3606` | `9443605d…a0f1` | `9443605d…a0f1` ✔ | `58c99427…3606` (identical) |
| `clara._tf_subledger_item_belt()` | `e665ef03…5127` | `ba7fe9c1…eba6` | `ba7fe9c1…eba6` ✔ | `e665ef03…5127` (identical) |

The five non-regression pins never moved at any point, on either rig:
`_admit_accounting_work_core` `10b89677…2612` · `_subledger_on_approve` `6e37c601…ccfd` ·
`_validate_entry_lines` `37b03159…3d71` · `_approve_entry_core` `d5ab4afc…c637` ·
`_tf_subledger_entry_belt` `a648d6f5…ad49`. Post-unwind censuses, measured before commit: **0** `clara`
functions named `*trade_invoice*` remained, and the `clara.open_items` writer set was back to
`{_subledger_on_approve}` — 0225's own prestate probe.

**Then `node scripts/migrate.mjs` applied the EDITED file end to end:**

```
[notice] #655 prestate: clean -- no trade-invoice surface exists, both purpose CHECKs carry their 0194
         three values, the three recut targets and five non-regression bodies are at their MEASURED
         pre-image shas, the subledger-hook census is the measured six and the open_items writer census
         is the pinned one.
[notice] #655 tail OK (1/6) … (2/6) … (3/6) … (4/6) … (5/6) … (6/6)
applied 0225_trade_invoices · backend pid 224883
migrate: 1 new migration(s) applied · 220 total · target 127.0.0.1:55705/clara_655
```

A second `migrate.mjs` then reports **`0 new migration(s) applied · 220 total`** — the ledger holds the
edited file's own checksum because the runner wrote it, not because anyone re-pointed it. The only body
whose text changed is `clara._trade_invoice_due` (post-image `9572580f…289b`); the three recut bodies came
back byte-identical, which is the strongest available statement that R-A changed the due date and nothing
else. **Still unverified, but narrowed:** a 0001→0225 chain from scratch. What is now verified is a
re-apply onto a rig re-based to frontier **219** with the three real pre-images in place — the
integrator's situation minus the 219 earlier files.

### §6.2.1 — the report's "ONE body" claim rewritten to the ratified THREE

**Finding** (§6.2.2: *"the report's 'ONE body' line rewritten to the ratified three"*; recheck-1's single
blocking item, F1).

**What I did.** In `reports/655-final.md`: the section heading **"…and one SCOPE DEVIATION"** is now
**"…and the RATIFIED recut set"**, and the paragraph that opened *"Scope deviation — 0225 recuts THREE
bodies, not one … The orchestrator should confirm this widening"* now opens **"RATIFIED SCOPE — 0225 recuts
THREE bodies, not one (DECISIONS §6.2.1, 2026-09-19)"** and closes by quoting the ruling: D11 now reads
*"recut the posting core once, narrowly, plus the two subledger arms that make a trade-invoice item
lawful"*, and nobody else in the wave touches that family (SYNTHESIS §0.1). It then names the three
explicitly — `clara._record_journal_entry_core` (the sixth copy), `clara._subledger_classify_entry`
(LADDER 3T), `clara._tf_subledger_item_belt` (the second lawful source) — and corrects a live confusion:
**`clara._tf_subledger_entry_belt` is NOT recut**; it is the fourth body in 0225's prestate pin list,
pinned byte-identical precisely because LADDER 3T is what keeps its ARM 1 tied. Assumption 1 ("the two
extra recuts … Orchestrator confirms") is struck through and marked **RESOLVED**.

### recheck-1's two open items, closed

| recheck-1 item | Status now |
|---|---|
| **F1** — "0225 recuts THREE governed bodies instead of the ONE … still open, not ratified by this session's rulings … escalate; the single blocking item" | **CLOSED by `DECISIONS.md` §6.2.1**, which ratifies all three as shipped and rewrites D11. The report states the ruling and its citation. recheck-1's separate observation — that only two of `_subledger_classify_entry`'s six callers have regression suites reachable from this branch — is a **coverage fact, not an open deviation**; both of those suites are re-run green *after* the re-apply (`x37-wave-c-a-subledger` 39/39, `fixed-asset-acquisition` 21/21), and the remaining four callers (`_approve_opening_entry`, `approve_wrong_client_correction`, `finalize_close`, `reopen_fiscal_year`) stay unverified by anyone on this branch — said plainly rather than implied. |
| **ADV-655-2** — "the counterparty-terms due-date fallback anchors on posting_date … open, but the shipped behaviour is brief-compliant as written … orchestrator should rule on the anchor" | **CLOSED by §6.2.0 R-A**, ruled the other way, and implemented above. The brief's section-4 cell-11 `posting_date + 30` wording is superseded by R-A; the report says so, and the pinned cell that made the old number impossible to miss is now two cells that make the *ruling* and the *legacy divergence* impossible to miss. |

### Commands and counts (this round)

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **exit 0** |
| `pnpm lint` (worktree root) | **exit 0** |
| `node --test --test-concurrency=1 $GATES tests/trade-invoice.test.mjs` (**41** gate flags, cwd `packages/db`) — **before** the migration edit | **29 tests · 27 pass · 2 fail · 0 skip** — `p655.due.terms_fallback` and `p655.due.anchor_document_date`, both `expected '2026-04-03' / actual '2026-04-30'` |
| the same command **after** the unwind + re-apply | **29 pass · 0 fail · 0 skip** |
| `node scripts/migrate.mjs` (cwd `packages/db`) after the unwind | **1 new migration(s) applied · 220 total**, `#655 prestate: clean` + all six `#655 tail OK` |
| `node scripts/migrate.mjs` again | **0 new migration(s) applied · 220 total** |
| `x37-wave-c-a-subledger.test.mjs` | **39 pass · 0 fail** |
| `fixed-asset-acquisition.test.mjs` | **21 pass · 0 fail** |
| `operation-census.test.mjs` | **10 pass · 0 fail** |
| `rig-isolation.test.mjs` (no reset flags) | 19 pass · **1 fail (T10b)** · 1 skip — **#866**, the pre-existing red the brief predicts and says to report, not fix |
| `node --test tests/trade-invoice-unit.test.mjs` (cwd `packages/runtime`) | **23 pass · 0 fail** |
| World leg, `node tests/trade-invoice-e2e.mjs` on `clara_655` (cwd `packages/runtime`) | **PASS — all 5 legs**, leg 5 now reading `2026-04-03` in the 202 body and on the open item |
| `node --import ./test/bootstrap.mjs --import tsx --test components/accounting/trade-invoice-form.test.tsx` | **13 pass · 0 fail** |
| whole `apps/web` suite, `node scripts/run-tests.mjs` | **4180 tests / 135 suites · 4178 pass · 0 fail · 2 skip (64.5s), exit 0** — fix round 1's named `use-clara-thread-stop` whole-suite flake did **not** reproduce |
| `pnpm --filter @clara/web e2e trade-invoice` (3340 / 3341 / 3342) | **12 passed (21.6s)** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 296 frozen files verified, 53 use-workflow modules frozen+registered, 3 retired entries** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK — reader ⊇ emittable**; no new part kind |

### What changed in 655-final.md

Header (HEAD `0911f7b8`, 16 commits) and the commit list; the **AC6**, **AC7** and **AC10** rows (the
document-date anchor, the named divergence, the battery at **29**); the scope section's heading and its
paragraph (the ratified three, and `_tf_subledger_entry_belt` as a pin and not a recut); **Assumption 1**
struck through as resolved; the residual *"the due-date ANCHOR is ratification-requested"* replaced by the
settled ruling and the two cells that carry it; the successor-contract `due_date_source` line (the
database's answer counts the terms from the document date); **Docs updated**; **follow-up 5** rewritten —
the two lanes are now *known* to disagree on exactly one fact, which #665's cutover must retire; and the
whole **Commands and counts** table re-measured for this round.

### Still true, and still unverified

- **Hosted evidence pending** — everything above is local.
- **A 0001→0225 chain from scratch is still unverified**, for the 0154 role-census reason above. Narrowed:
  the edited file now demonstrably applies, prestate and tail, onto a rig at frontier 219.
- **AC4's park half and a commit-window cancel are still not driven on this lane** — the first cut's named
  residual, unchanged.
- **`_subledger_classify_entry`'s four other callers** (`_approve_opening_entry`,
  `approve_wrong_client_correction`, `finalize_close`, `reopen_fiscal_year`) have no regression suite
  reachable from this branch. LADDER 3T only fires when `clara.trade_invoices` names the entry, but that is
  an argument, not a measurement.
