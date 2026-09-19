# #657 — fix round 1 · review findings applied

**Branch** `impl/657-bank-existing-booking` · worktree `C:\Users\zhant\Desktop\clara-wt\657` · rig PG **55707** / `clara_657`.
Fix round opened at `7aa96d25`. Local evidence only. **Hosted evidence pending.**

Seventeen findings across three lenses (spec 2 · standards 6 · adversarial 9). Two pairs are the
same defect seen twice (SP1 ≡ A1, SP2 ≡ A2), so there are **fifteen distinct defects**.
**Thirteen fixes applied**, covering fifteen finding ids; **one half-finding deliberately left**;
**one finding is its own author's verified-clean record and needed no action**. **One ratification
is requested — it rides on an applied fix, not instead of one.**

## Commits

```
43cba443 fix(db,web): #657 keep the wiki-dynamic-SQL lint honest, and assert the outcome's op key end to end
e370e08f fix(db): #657 the basis describes the candidates it claims to, the tail pins the thirteen post-images, and 0129's direct caller moves to the typed contract
5a1f3dc4 fix(web): #657 the op key renews when the world it decided about moves, and the outcome names it
7aa96d25 fix(db,web): #657 conform 0226 to the SQL-function census, and make the walk order-independent   <- fix round opened here
```

## Finding → what I did → evidence

### SP1 + A1 · blocker · the op key did not renew after an unmatch — APPLIED

Both lenses measured the same thing on `clara_657`: `match → unmatch → resubmit the identical
selection` is an ordinary re-decision, and a key that is a pure function of
`{client, lines, entries, cents, ack}` cannot tell it from a lost-response retry. `_reserve_op`
(`0004:46-60`) keys on `(firm, fn, op_key)` and knows nothing about whether the match its stored
result describes is still live, so the second submission replayed the dead match's receipt and
the face rendered a persistent "no new cash entry was created" block naming a match the database
had recorded as `unmatched`, beside a line that never left the unmatched report.

**What I did.** The intent tuple now carries each selected entry's **world generation** —
`<count>:<newest match_id>:<newest status>` off the `match_history` the recut
`list_bank_match_candidates` already puts on the wire (0226 §3), read with the new
`entryGeneration()` in `lib/bank/match-opkey.ts`. An unmatch flips that newest row from `live` to
`unmatched`, so the re-decision hashes differently, while a lost response, a reload, a re-render
and a dismissed refusal write nothing and leave it byte-identical. It is **key material only**:
`matchBankLine` builds `p_entries` as the door's exact two fields, because `_reserve_op` re-hashes
the real arguments and would refuse a key whose request hash disagreed — and the new cell asserts
the wire body's key set, so a later hand cannot smuggle the generation into the call.

**Red first, twice.** (1) `lib/bank/match-opkey.test.ts` cells 4 and 5 were written first and
failed with the generation plumbed through but **not** canonicalised — `# pass 3 # fail 2`, the
failure being two equal keys. Folding `gen` into `canonicalMatchIntent` turned them green
(`# tests 5 # pass 5 # fail 0`). (2) The DB premise this rests on is pinned by a new cell,
`p657.db.rematch-needs-a-new-key`: match, unmatch (status `unmatched`, line back on
`list_unmatched_lines`), replay the SAME key → byte-identical receipt, zero live matches, line
STILL on the report; then re-decide under a RENEWED key → a NEW `match_id` and the line gone. It
asserts **current** database behaviour deliberately: it is a pin, so a future change to
`_reserve_op`'s replay semantics re-opens the face's clause instead of silently keeping it.

**Its residual, written into the module and not hidden.** The generation is only as fresh as the
read it came from. A concurrent unmatch between this surface's last candidate read and the submit
still reaches the replay. The surface re-reads candidates and context after EVERY act and on
every `?line=` change, which is a mitigation, not a proof; a proof would have to live in the
door, and #657 opens `_match_bank_line_core` for its receipt payload only.

### SP2 + A2 · major · `candidate_basis` described more entries than it claimed — APPLIED

The basis subselect filtered on firm / client / approved / not-reversed / touches-the-COA and
**not** on remaining capacity, so it was one row per approved bank-touching entry — a strictly
larger set than the candidates it says it describes, with no bound but the client's whole booking
history on that COA. Nothing failed, because `matching-candidates.tsx` looks rows up BY the
candidate list's own entry ids: the surplus was computed, hashed into the pack, sent and dropped.

**What I did.** Migration 0226 §5's basis is restructured: the side capacities are computed ONCE
per entry in an inner select (they were typed twice, once per arm of `amount_exact`'s CASE) and
the outer select filters `where r.debit_remaining_cents > 0 or r.credit_remaining_cents > 0`,
exactly as §3's `) t where …` does. The file header §B and the function comment now state that
population instead of implying it.

**Red first.** `p657.db.matching-context` gained a set-equality assertion —
`candidate_basis.map(entry_id).sort()` deep-equals `list_bank_match_candidates(...)`'s — plus a
seeded, fully-spent entry. Before the recut it failed with exactly one surplus id
(`+ '6bb88c84-…'` against the expected single-element array). After: green.

### S1 · blocker · a pre-existing caller still used the old `text` contract — APPLIED

0226 DROP+CREATEs `clara._agent_verify_inputs_digest` with a `uuid` third parameter.
`packages/db/tests/f-a3-pr3-doors.test.mjs`'s `c2.task-binding` cell — the only direct caller
outside the thirteen re-patched cores, named in no brief — still passed a colon-joined op_key and
was rejected by Postgres at the bind layer.

**What I did.** The cell passes the task itself, as a real `randomUUID()`, and casts `$3::uuid`.
The uuid matters twice: `_bank_op_key_task` is uuid-regex guarded, so the old `c2ta-1a2b3c4d`
field-2 shape would have bound through the **null-task fallback** this cell exists to bypass.

**Evidence.** The pre-fix call shape, run directly on the rig:
`22P02 invalid input syntax for type uuid: "bank-add_bank_account:c2ta-b3206fed:0:{}"`.
After: `ok 1 - f-a3pr3.c2.task-binding … # pass 1 # fail 0 # skipped 0`, and the whole
`f-a3-pr3-doors.test.mjs` file green in the suite run below.

### A3 · major · `p657.db.capacity-race`'s capacity assertion never ran — APPLIED

`const row = cands.find(…); if (row) { … }` could not be true: the entry is fully spent by the
end of the cell and the recut read excludes zero-capacity candidates, so the cell's third stated
claim was carried by nothing.

**What I did.** The capacity is read off the ledger — booked debit on the bank COA minus
pending/live consumption — with no guard: `booked = 90_000`, `booked - consumed >= 0`,
`booked - consumed = 0`. The exclusion that used to hide the assertion is now asserted beside it
("a fully-spent entry is absent from `list_bank_match_candidates`"). Green in the gated run.

### A4 · minor · tail item 9's heading claimed three things it did not measure — APPLIED

The block is now titled **"EVERY bank.% EVENT TYPE STILL CARRIES A TAXONOMY DECISION"**, which is
what it measures, with a note saying where D14's three negatives actually live (honoured by
construction: this file creates no table, registers no event type and never names
`accounting_work`) and why claiming otherwise in a tail heading is the class of unbacked claim
AGENTS.md forbids.

### A5 · minor · the tail pointed at evidence that did not exist — APPLIED

The tail said the thirteen post-image shas were asserted by `p657.db.digest-census`; that cell
asserts a substring anchor and no sha at all, so the brief's "assert every post-image sha in the
tail" was unmet.

**What I did.** The thirteen shas are pinned in the tail as a `v_posts` array, each MEASURED off
`pg_proc.prosrc` on `clara_657` (`74275dcf…`, `b24efc35…`, `a3c69597…`, `d735c1d7…`,
`cc9fcafc…`, `6f83c76a…`, `3bbf947f…`, `bad39b0a…`, `504a6ba1…`, `35a3494d…`, `59f6bad2…`,
`6b7e8ce9…`, `87c359a6…`) and compared in a loop that raises CLR10 on any mismatch. Risk 6's
sentence is executable now instead of prose in a report. The tail passed on re-application with
all thirteen pins live (`#657 tail: OK …`).

### A6 · minor · the outcome block did not name the operation key — APPLIED

**What I did, and what I did NOT do.** I did not add `op_key` to `_finish_op`'s payload: that
would have meant re-running §6's substring-anchored CoR against an already-patched body on a rig
that cannot re-run the migration. `matchBankLine` returns the key it sent, and
`matching-outcome.tsx` renders it as **Operation key** — labelled as the client's key, with a
comment saying `_finish_op` carries none. It is still the key `_reserve_op` stored the receipt
under, so a human can quote it (AC10's half of "the operation I already ran").

**Red first.** The new `matching-outcome.test.tsx` cell run against `HEAD`'s component:
`not ok 5 … # pass 4 # fail 1`. Against the new one: `# pass 5 # fail 0`. Walk leg 3 now compares
the rendered key with the key observed on the real request, so the face cannot display a key the
app did not send.

### A7 · note · three orderings had no tiebreak — APPLIED

The basis aggregate gained `, b.entry_id` after `posting_date desc`. The line's `group_status`
and `match_id` were two independent `limit 1` subselects with no `order by`, which could name
DIFFERENT matches if a second pending/live member ever existed; they are one `select … into` with
an explicit order now, so the payload cannot contradict itself.

### S2 · major · `packages/db/README.md` described the reverted first cut — APPLIED

The paragraph described the dynamic extract-and-splice that was **reverted** (the SQL-function
census refuses a dynamic statement it cannot resolve to one definition). It now describes what
shipped: the projection typed identically in BOTH bodies between `/* P657-CAND-BEGIN */`
sentinels, with the tail's whitespace-normalised equality check and `p657.db.pack-parity` as what
keeps them honest, and **"a future change edits BOTH bodies by hand"** in place of the old "edits
the public read only". The reverted cut is recorded with its reason so nobody re-attempts it.

### S3 · major · the report claimed `InputGroup` was used — APPLIED

It is not used anywhere in the diff, in `components/bank/*`, or in the brief's own cited
precedent (`work-question-form.tsx:70`). The AC13 row in `657-final.md` now reads
**Table/Field/Alert** and names InputGroup as a second measured residual with that reason. I did
not retro-fit an `InputGroup` wrapper: `MoneyInput` renders the plain `Input` primitive, and
re-plumbing a shared money control is a wider change than an evidence-accuracy finding asks for.

### S4 · minor · the axe-scan count was wrong — APPLIED

`bank-match-walk.spec.ts` has **6** `expectAccessible()` calls (lines 62, 134, 182, 211, 224, 243
after this round's edits), **2** of them inside leg 6. The AC14 row now states both numbers; the
earlier "4" matched neither.

### S5 · minor · `CONTEXT.md` read "to the sen" — APPLIED

`CONTEXT.md:568` now reads "to the cent". `grep -c "to the sen," CONTEXT.md` → `0`.

### S6 · note · the battery header said NINE cells — APPLIED

It says **ELEVEN** and rosters them all, including the new `rematch-needs-a-new-key`.
`packages/db/tests/README.md` moved from "Ten cells"/"The other nine" to "Eleven cells"/"The other
ten" in the same commit.

### Not a review finding, found while fixing one — a lint classification flipped by a COMMENT

Adding the words `pg_get_functiondef` to a **comment** in 0226's tail made
`scripts/check-wiki-dynamic-sql.mjs` fail the file: it classified the assertion-only tail as a
change-of-record patch with an unresolved EXECUTE target. Measured cause:
`maskComments` in `scripts/wiki-lint-checks.mjs` desynchronises earlier in this file and stops
masking comments from **line 203** onward, so comment prose is scanned as if it were SQL. I
reworded the comment rather than weaken the lint, and filed the masker as a follow-up below.

## Deliberately left

**A8 (note) · performance — the basis half APPLIED, the `list_bank_statements` half LEFT.**
Closing A2 bounds the basis to the offerable candidate set, which was A8's second and larger
half. The first half — `get_bank_line_matching_context` calls
`clara.list_bank_statements(client, account)`, which computes every statement's header, lineage
and `tie`, then keeps one — is left **on the brief's own non-goal**: *"no second GL-cash reader on
your side"*, and §5's instruction that the `tie` comes VERBATIM out of `list_bank_statements`.
Selecting the statement's aggregates directly would re-derive `gl_balance_cents` in a second
place, which is exactly what #657 is forbidden to do while two cash expressions already exist
unruled across #657 and #660 (final report, open question 5). The reviewer measured the cost as
**3381 bytes, sub-second on a 15-entry client** and wrote "nothing is broken today". This is a
shape to fix when the cash-expression question is ruled, not a defect to route around by copying
the expression. `_bank_op_key_task`'s `IMMUTABLE` + `SET search_path` inlining note is cosmetic by
the reviewer's own words and is left with it.

**A9 (note) · verified-clean, no change asked for.** Its author recorded four hunted-and-clean
targets (cross-firm scoping of the new read, argument order under one key, dispatch order above
the `EMPTY_RPCS` arm, the task binding on live rows) so the next reviewer does not re-spend the
budget. Nothing was changed. Its dispatch-order measurement still holds after this round:
`apps/web/e2e/serve-built.mjs` is untouched here.

## Ratification requested

**The renewal rule's second clause (rides on SP1/A1, which is applied).** Brief §3 web item 5
writes the renewal rule *verbatim* and enumerates what renews the key: "the set of selected line
ids, the set of selected entry ids, or a typed cents value; it renews on nothing else". An
unmatch is on neither list, and D15 says the key is derived from the intent tuple
`{client, sorted line ids, sorted entry ids, cents, ack flag}` — the tuple `_reserve_op` hashes.
Folding a world generation in **widens that tuple beyond what the brief specifies**.

I applied it rather than parking it, because the alternative is shipping a face that tells a human
a match landed while the unmatched line sits in front of them, and because the amendment keeps
D15's actual principle: the key still renews on a property of the **data**, never on a component's
lifecycle, and there is still no state to reset. The orchestrator should ratify (or reject) this
one sentence, now written in `lib/bank/match-opkey.ts`'s header and in `apps/web/README.md`:

> The key renews only on an intentional human act that changes WHAT is being submitted — the set
> of selected line ids, the set of selected entry ids, or a typed cents value — **OR on a change
> to the WORLD the submission is deciding about: a selected entry's own match history moving on
> (a match landing on it, or an existing one being unmatched)**. It renews on nothing else.

A rejection has a cost worth stating: without the clause, `unmatch → rematch` is unreachable on
this surface without a browser reload, and #671 lands resolve-then-match on this same chassis.

**D15 amendment ratified — DECISIONS §6.2.1** (the key also folds each selected entry's
match-history generation). See Fix round 2 below.

## Rig note the integrator must not miss

0226 is **unmerged**, so it was edited in place. It cannot be re-applied on an already-migrated
rig (its prestate pins are pre-images, and it refuses if its two new names already exist), so the
two changed objects — `clara.get_bank_line_matching_context(uuid)` and its `comment on function` —
were re-applied to `clara_657` as `create or replace` under `set local role clara_fn_owner`, and
the whole tail `do` block was re-run and passed. `clara.schema_migrations`' 0226 checksum was
updated to the new file checksum, and the same value replaces the pin in
`apps/web/tests/firm-scope-db-pins.corpus.ts`:

```
c17609ce6307ec8ef5e5bf0e83d43e245866cb2d13cb00076a298cc90ba8128a   (before this round)
55b6e27952393d9a5327c1ae4ced980494facfffe93623765de232c342511b50   (now: file, ledger and corpus pin agree)
```

`node packages/db/scripts/migrate.mjs` then reports **"0 new migration(s) applied · 220 total"**,
i.e. the runner's history-integrity check accepts the edited file against the ledger, and
`p657.db.acl` re-proves owner / SECURITY DEFINER / `search_path` / ACL on every touched body.
**A fresh chain is the real proof and has NOT been run here** — a from-scratch chain on this
cluster is forbidden by the brief (0154 pins the cluster-wide `clara%` role count). CI's
deploy-onto-existing check is where that lands.

## Verification re-run

Everything below was run AFTER the last fix-round commit, on the assigned rig.

| What | Command | Result |
|---|---|---|
| typecheck | `pnpm typecheck` (worktree root) | **green**, exit 0 |
| lint | `pnpm lint` (worktree root) | **green**, exit 0 — including `check-frozen-workflows` and the wiki-dynamic-SQL gate this round first broke and then satisfied |
| #657 battery, gated | `node --test --test-concurrency=1` + the 41 `--import …-preintegration-gate.mjs` flags copied from `packages/db/package.json`, on `tests/bank-line-existing-booking.test.mjs` | **11 tests · 11 pass · 0 fail · 0 skipped** (was ten cells; `rematch-needs-a-new-key` is the eleventh) |
| the suites this round touched | `node --test --test-concurrency=1 tests/operation-census.test.mjs tests/rig-isolation.test.mjs tests/x38-wave-c-b-match.test.mjs tests/f-a3-pr3-chatturn-v14-bank-parity.test.mjs tests/f-a3-pr3-doors.test.mjs` (no reset flags) | **89 tests · 88 pass · 0 fail · 1 skipped** — the skip is the destructive reset cell, correctly gated on `CLARA_RIG_ALLOW_RESET`, which is unset |
| runtime, inherited | `node --test tests/g1-wake-bank-e2e.test.mjs` from `packages/runtime` with the PG env | **1/1, 0 skipped** — a real `bank_agent` credential still admitted through the real wrapper stack against the recut cores |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader superset of emittable; a no-op, which is the evidence for "no successor" |
| web unit, whole suite | `node scripts/run-tests.mjs` from `apps/web` | **4160 tests · 4157 pass · 1 fail · 2 skipped** (135 suites). The failure is `lib/clara/use-clara-thread-stop.test.ts:1004` — flaky in isolation too (1 failure in 4 isolated re-runs on recheck), pre-existing and untouched by this branch — the known whole-suite load flake in a lane #657 does not touch, and the same lane the standards reviewer saw fail. See Fix round 2 below |
| this round's own web cells | `node --import ./test/bootstrap.mjs --import tsx --test lib/bank/match-opkey.test.ts components/bank/matching-outcome.test.tsx` | **5/5** and **5/5**, each red first against the pre-fix code |
| browser walk | `pnpm --filter @clara/web e2e bank-match` with the assigned triple (3360 / 3361 / 3362) | **6 passed (22.8s)** |
| migration ledger | `node packages/db/scripts/migrate.mjs` | **0 new migration(s) applied · 220 total** |

Still **unverified**, unchanged from the final report: everything hosted; the whole browser suite
beyond `bank-match`; the db estate suite and the runtime suite in full; and a FROM-SCRATCH chain
through the edited 0226 (see the rig note above).

## Follow-ups this round adds

1. **`maskComments` desynchronises and stops masking comments.** In
   `scripts/wiki-lint-checks.mjs`, `maskComments` scans `'` and `$` at top level before `--`, so
   one unbalanced quote or dollar token earlier in a file leaves every later comment unmasked.
   Measured on `packages/db/migrations/0226_bank_match_evidence.sql`: the first unmasked comment
   line is **:203**, and everything after it is scanned as SQL. The consequence is not cosmetic —
   `check-wiki-dynamic-sql.mjs` is FAIL-CLOSED, so prose in a comment can classify an
   assertion-only `do` block as a change-of-record patch with an unresolved target, and
   (the direction that actually matters) a comment could also supply a token that makes a real
   patch look benign. Worth a selftest case with an apostrophe in a comment.
2. **A fresh-chain proof for an edited unmerged migration.** There is no supported way to
   re-apply one migration on a rig, so a fix round on an unmerged migration has to hand-apply its
   delta and repair the ledger by hand (as this one did). A `--redo <version>` mode on
   `migrate.mjs`, gated behind the destructive flag, would make that a measured operation instead
   of a careful one.

## Fix round 2

Two report-text corrections, made against ratifications recorded after this fix round closed
(`DECISIONS.md` §6.2.1, §6.2.2). **No branch change** — nothing in `impl/657-bank-existing-booking`
moved; both items are evidence-accuracy edits to this report file, made in the main checkout, not
the worktree.

### Finding 1 · the isolation-stability claim overstated a flake as clean

**Finding.** This report's verification table said `lib/clara/use-clara-thread-stop.test.ts`
"passes **25/25 in isolation**", offered as proof the whole-suite failure was purely a load
artifact. `reports/657-recheck-1.json`'s `observations` array records the recheck agent re-running
that file in isolation four times and getting **3 clean passes and 1 failure** (same assertion,
`:1021`, `4 !== 0`) — so the file is flaky in isolation too, just less often than under whole-suite
load. `DECISIONS.md` §6.2.2's fix-round-2 table names this directly for #657: *"NF-2 — soften the
'fully green' claim to name the known `use-clara-thread-stop` flake"* (the row is written against
#660 there but the same sentence appears as this ticket's own line: *"fix-round report: the
isolation-stability claim softened (flaky, 1 in 4 isolated runs)"*).

**What I did.** Reworded the verification-table cell (see the `web unit, whole suite` row above)
from "passes 25/25 in isolation" to "flaky in isolation too (1 failure in 4 isolated re-runs on
recheck), pre-existing and untouched by this branch". I did not claim the failure as something I
personally reproduced at that rate — the "on recheck" qualifier attributes the 1-in-4 count to the
specific measurement in `657-recheck-1.json`, which is the checkable source for that number.

**My own evidence, additional to the recheck's.** I re-ran the same file in isolation four more
times, today, on this rig, before touching this report:

```
cd C:\Users\zhant\Desktop\clara-wt\657\apps\web
node --import ./test/bootstrap.mjs --import tsx --test lib/clara/use-clara-thread-stop.test.ts
```

Results: run 1 → `# tests 25 # pass 25 # fail 0`; run 2 → `# tests 25 # pass 25 # fail 0`; run 3 →
`# tests 25 # pass 25 # fail 0`; run 4 → `# tests 25 # pass 25 # fail 0`. **4/4 pass, 0 failures**
in my four runs — which does not contradict the recheck's 1-in-4 figure, it is consistent with a
flake: an intermittent failure need not reproduce in every independent batch of four. I did not
soften the report's wording to "usually passes" or otherwise average the two batches into a rosier
number; the report cites the recheck's own measured count because that is the run in which the
failure was caught and the assertion line (`:1021`) identified, and appends this batch as a second,
independent data point rather than replacing the first. `git log -- apps/web/lib/clara/use-clara-thread-stop.test.ts`
on this branch shows no commit from `impl/657-bank-existing-booking` touches the file (last
changes are pre-#657, consistent with `657-recheck-1.json`'s own git-log check), so the flake is
pre-existing and untouched by this branch, as stated.

### Finding 2 · the D15 amendment's ratification status was left open in this report

**Finding.** The "Ratification requested" section above asked the orchestrator to rule on the
renewal rule's second clause (folding a selected entry's match-history generation into the op-key
intent tuple) and left it as a pending request. `DECISIONS.md` §6.2.1's ratification table now
records, for #657: *"op-key renewal rule gains the selected entries' match-history generation
(data, not lifecycle); `get_bank_line_matching_context` builds the tie through
`list_bank_statements`"* — **ratified** — *"D15 is amended to 'one decision one key: a hash of
{client, sorted line ids, sorted entry ids, cents, ack flag, each selected entry's match-history
generation}'"*. Leaving the report reading as an open request after the ruling landed would
misstate the ticket's current authority.

**What I did.** Added the line "**D15 amendment ratified — DECISIONS §6.2.1** (the key also folds
each selected entry's match-history generation)" immediately after the ratification-request
paragraph, pointing back to this section for the source text.

**Evidence.** `docs/plan/active/refresh-wave-2026-09-18/DECISIONS.md` §6.2.1, the `#657` row
(text quoted above, verbatim from the file as read for this fix round). No code or test changed
for this finding — it is a status update to a request this same report already made, not a new
claim about behaviour.

### Commands run this round, with counts

| Command | Result |
|---|---|
| `node --import ./test/bootstrap.mjs --import tsx --test lib/clara/use-clara-thread-stop.test.ts` (×4, isolated) | 4 runs × `# tests 25 # pass 25 # fail 0 # skipped 0` — 0/4 failures observed in this batch |
| `git status` (worktree) | clean, `HEAD` unchanged at `43cba4438f36d9a85ee10c594c03b42a2d0a5921` |
| `git log --oneline origin/main..HEAD` (worktree) | unchanged from the seven commits already on the branch — no new commit this round |
| `git log -- apps/web/lib/clara/use-clara-thread-stop.test.ts` (worktree) | no commit from this branch touches the file |

No worktree file changed. This section documents a report-only correction; the branch, its
commits and its test counts are exactly as fix round 1 and the recheck left them.
