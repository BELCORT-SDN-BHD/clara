# #656 — fix round 1

**Branch** `impl/656-opening-ledger` · worktree `C:\Users\zhant\Desktop\clara-wt\656` · rig `clara_656`
(127.0.0.1:55706) · walk triple `https://127.0.0.1:3350 / 3351 / 3352`.

Reviews worked: `656-review-spec.json` (accept, 3 findings), `656-review-standards.json` (accept, 1),
`656-review-adversarial.json` (fix_then_accept, 11). Local evidence only. **Hosted evidence pending.**

**Commits added in this round** (on top of `d94e6580`):

```
c65aea74 fix(runtime): #656 a trial balance the reader REFUSED stops looking like a document that is not one
666d77fb test(db): #656 three opening cells stop asserting something other than their names
4d40fb58 fix(web): #656 the coverage footer stops printing a zero it could never have printed otherwise
0a86d5ab fix(web,e2e): #656 the opening walk is WHOLE — and reading its assertions found three app defects
```

## Finding → what I did → evidence

### A1 · blocker · the all-or-nothing refusal was computed and discarded — APPLIED

The producer's `{status, reason, refusals}` never left `normalizeAzureLayout`: a trial balance the
reader REFUSED (does not balance; one OCR-mangled row) was byte-identical downstream to a document
that is not a trial balance at all, so both answered 422 `no_opening_tb_lines` and the face offered
its INFORMATION banner — "Key the balances instead" — over a document whose own printed figures the
machine had just found inconsistent.

RED FIRST: four cells in `packages/runtime/tests/opening-tb-produce.test.mjs` and two in
`packages/runtime/tests/wave-b-opening-parse.test.mjs`. With the three library files stashed
(`git stash push packages/runtime/lib/{egress,opening-parse,opening-tb-produce}.mjs`) the DB-backed
pair failed with `actual: 'no_opening_tb_lines'` — the defect itself, measured.

FIX (`egress.mjs`, `opening-tb-produce.mjs`, `opening-parse.mjs`): the refusal rides the extraction
ENVELOPE under `opening_tb_refusal` — the estate's own producer-marker idiom
(`envelope->>'corroboration_ineligible'`, 0009:148 / 0015:634 / 0092:215), so no new `field_path`, no
widening of `ck_document_regions_opening_fact_0017`, no migration. `readOpeningRefusal` reads it back
off the NEWEST done extraction, and only when zero lines came home, so the ordinary path costs
nothing. A refused read answers 422 with the reader's sentence VERBATIM plus `source_refusal: true`
and the failing row keys; `not_a_trial_balance` and a clean read carry no key at all. The literal is
written on both sides rather than imported, deliberately — the door must not gain an import edge into
the producer (which would freeze the producer the day a Clara tool imports the door) — and the two
literals are pinned equal by a cell.

`producer_error` is deliberately NOT carried: it is an internal fault, not a verdict about the
document, and dressing it as a refusal of the person's document is the same misattribution from the
other side. Stated in the module header and in `packages/runtime/README.md`.

EVIDENCE: `node --test tests/opening-tb-produce.test.mjs` → **17/17**;
`node --test --test-name-pattern="A1" tests/wave-b-opening-parse.test.mjs` → **2/2**, whose first cell
drives three REAL OCR passes through the REAL `clara.persist_document_extraction` and measures A
(unbalanced → "does not balance", verbatim), B (mangled row → `unparseable_amount` + failing row
keys) and C (a printed general ledger → `no_opening_tb_lines`, unchanged) as three different answers.
Face half: `components/registers/opening-parse-action.test.tsx` → **10/10** including the new cell
that asserts the warning branch renders the reason and never the keyed invitation.

### A2 · major · `p656.tie.obe_not_nil` asserted the negation of its own name — APPLIED

The cell drafted ONE item against a three-line target set, so `_assert_opening_tie`'s DELTA arm fired
first and it asserted `tie_mismatch` under a name promising `obe_not_nil`; the token this battery
claimed to own went unexercised.

FIX: the fixture now records a target PAIR whose two printed figures do not sum (the BEE trial
balance's retained-earnings line is absent) and drafts an item for EACH, so every non-OBE account
matches its target — `_opening_seed_deltas` excludes the opening-balance-equity account by
construction — the delta arm passes, the drafted entries' plug lands on OBE and the second arm fires.
The residue is asserted cent-for-cent (`BEE.shareCr - BEE.cashDr`, sign measured on the rig) and the
refusal token is asserted exactly.

EVIDENCE: `node --test … --test-name-pattern="obe_not_nil" tests/opening-ledger-source.test.mjs` →
**1/1 pass** with `assert.equal(claraReason(err), "obe_not_nil")`. Two intermediate measurements are
recorded in the cell: the first attempt (two figures that DID sum) produced `obe_net_cents = 0`,
proving the plug cancels when the targets balance.

### A3 / spec-S1 · major · six of seven browser legs were `test.fixme` — APPLIED (four app/fixture defects found, plus one spec defect)

I un-fixmed all six and ran the walk one leg at a time with `--reporter=line`. Three separate causes,
all found by reading the actual assertion and the page snapshot:

1. **A FIXTURE defect.** The workbench's combined read fetches `opening_items` with
   `seed_id=eq.<seed>` and nothing else (`lib/registers/opening.ts:44-51`), but the mock's
   empty-relation guard was `client_id`-only, so that request fell through to a 404,
   `useAsyncRead` classified it `not_found`, and the ENTIRE tied-basis surface never rendered
   (the snapshot showed "This isn't available yet." where the panel belongs). Fixed with a
   seed-scoped guard beside the client-scoped one (`mineSeed()`).
2. **AN APP defect the node cells could not see (AC5's own law).** After a successful read,
   `OpeningParseAction`'s settled outcome VANISHED: the workbench's `DataState` renders its
   LoadingState INSTEAD of children, and every `act()` flips `loading` on the reload it fires, so
   the reload that follows the read unmounted the action and took its persistent banner with it.
   Fixed with `opening-register.tsx`'s own `hasSeedsData` precedent one level down
   (`loading={!hasData && loading}`). The component cells mount the action alone, where nothing
   re-reads around it — only the browser could catch this.
3. **A LANE-STATE defect.** `serve-built.mjs` is ONE server for the whole run and nothing reset
   `state.seedCreated`, so the first cell created the basis and every later cell waited fifty
   seconds for a "Create opening seed" trigger that was gone. Fixed with the house pattern next
   door (`document-correction-walk.spec.ts`): a reset verb scoped to this lane's own client id
   (`reset_opening_ledger_source_fixture`), posted in `test.beforeEach`.

EVIDENCE: see "The walk, measured" below. `e2e/e2e-fixture-ownership.test.ts` → **18/18** after the
mock changes (the new verb is declared in `P656_RPC_VERBS`, still scoped to this lane's client).

### A4 / spec-S2 · major · `prior_gl`'s `business_operation` — RATIFICATION REQUESTED

D13.3 rules it to `supported`; the migration holds it at `stored_only` because
`document-capability-registry.test.mjs:278-284` asserts, across all 240 rows, that no row promises a
supported business operation over facts that are not supported, and nothing has ever produced a
`prior_gl.line`. The reviewer confirms the measurement and asks for the ruling to be settled BEFORE
this migration merges, because the version number it publishes is load-bearing. That is an
orchestrator call, not a worker fix: applying D13.3 literally needs either a false `typed_facts`
claim or the relaxation of a 240-row honesty law. **No code changed.** The three options are in the
adversarial report's A4 and in `656-final.md`'s Assumption 1; the measurement points at widening the
registry's four-level vocabulary as its own ticket (follow-up F6) and keeping `stored_only` + the
named `limits` gap as the honest interim.

### A5 · major · the re-read cell only existed over raw INSERTs — APPLIED

`packages/runtime/tests/wave-b-opening-parse.test.mjs` now carries `realOcrPass()`, which runs the
REAL `normalizeAzureLayout` (producer inside) over the testkit's measured geometry and settles it
through the REAL `clara.persist_document_extraction` on a real running OCR task. The RE-READ cell is
rebuilt on it: two genuine OCR passes on one document.

MEASURED ANSWER (the thing A5 said was unknown): a genuine re-OCR refuses **CLR10
`source_reread_since_parse`** — the op-key collision — not a CLR31 staleness wall. So the new arm at
`opening-parse.mjs` is live on the real path and the successor contract's
`source_reread_since_parse` mapping stands. The cell also asserts the authoritative pointer moved to
the second run and that the five targets still cite the first.

EVIDENCE: `node --test --test-name-pattern="RE-READ" tests/wave-b-opening-parse.test.mjs` → **1/1**;
whole file **17/17**.

### A6 · minor · the wiring's blast radius was under-priced — APPLIED

`_derive_opening_region_fact` RAISES CLR31 over a malformed `opening_tb.line` from inside
`persist_document_extraction`'s region loop, so a bad region costs the document its WHOLE extraction,
not "a few extra evidence rows". Two changes: the module header and `packages/runtime/README.md` now
say that; and `disagreeingOpeningRegion` re-checks the database's own monetary invariant on every
emitted element, dropping the WHOLE set if any fails — the all-or-nothing law one layer lower.
`produceOpeningTbRegions` gained a documented reader seam (`{ readCells }`, production passes
nothing) so the drop can be exercised over a reading that drifts.

EVIDENCE: two new cells in `opening-tb-produce.test.mjs` (the guard; the whole-set drop), plus a
DB-backed cell that persists a deliberately contradicting region through the REAL writer and measures
that the extraction is lost entirely — `0 rows in document_extractions` afterwards, the innocent
`pages.1.lines.0` region included.

### A7 · minor · two cells pinned a refusal with a disjunction — APPLIED

MEASURED with a deliberate probe (asserting an impossible token to print the real one): both
`p656.tie.stale_extraction` and `p656.tie.approve_rebinds` produce `extraction_not_accepted`, because
a second producer run sets `superseded_by` on the first and `_assert_opening_extraction_ref` checks
`status<>'done' or superseded_by is not null` BEFORE comparing the authoritative pointer.
`stale_extraction_version` is the OTHER wall. Both cells now assert the exact token, with the
distinction written beside them and in `packages/db/tests/README.md`.

### A8 · minor · the DB battery proves the DB over a hand-written mirror — APPLIED (as the finding's own fallback)

packages/db carries no dependency on packages/runtime, so importing the producer into
`packages/db/tests` would be a new cross-package precedent for a test helper. I took A8's stated
fallback instead: a new cell in `opening-tb-produce.test.mjs` states the emitted element shape in
full (key set, locator keys, `field_path`, the decimal-string cents, the canonical text grammar), and
`produceTbRegions`'s doc comment names it as the pin a drift would red. The real producer's bytes
still meet the real writer in two places now — the World leg and the new `realOcrPass` cells.

### A9 · note · the migration tail's §5 heading is wider than its two checks — DELIBERATELY LEFT

0228 is APPLIED on this rig, and `clara.schema_migrations` holds its sha256. ANY edit to the file —
including the one-line heading softening the finding offers — desynchronises the ledger from disk,
and `migrate()` re-verifies every applied version's checksum on every run, so the next migrate on
this rig would abort. Restoring the evidence would mean rolling the registry back and re-applying,
and the `opening_balance_doc` basis was REWRITTEN (not patched), so its pre-image is not recoverable
from the file. That is out of proportion to a note whose own suggested alternative is a comment edit.

What is true instead, and measured: the registry battery's 19 cells (0191's published invariants —
the OFX/CSV rows, `consent_evidence` unsupported everywhere, the skipped-kind rule, the 5→3 downgrade
probe, one distinct version) all pass after 0228, so a level moved on an unrelated kind would have to
survive those as well as §5's two checks. **Recommendation for the orchestrator, before this
migration is applied anywhere real**: take the digest in §0 (`md5(string_agg(...)) filter (where
document_kind not in ('prior_gl','opening_balance_doc'))` into a temp table) and re-compare it in the
tail, or soften the heading. Either is a pre-merge edit on a file that has not landed.

### A10 · note · the coverage footer rendered a constant as a measurement — APPLIED

On a wholly document-sourced basis `unmappedCount` can only ever be 0 (R5), so "Not yet mapped:
0 line(s), Dr 0.00 / Cr 0.00" was C-25's quiet pass one layer down. RED FIRST: a cell asserting the
zero is gone and the structural sentence is there (it failed on the rendered zero). FIX:
`isDocumentSourcedBasis` in `lib/registers/opening-source.ts`; the footer keeps the TERM and states
the fact; a basis carrying a KEYED row keeps the numeric count, because there it is a real state.
One new message key (`coverageUnmappedImpossible`).

EVIDENCE: `opening-target-document-panel.test.tsx` → **10/10** (two new cells: the document-sourced
statement, and the keyed basis keeping its count); `check-message-keys.mjs` green.

### A11 · note · failed refutations — NO ACTION (none required)

Recorded as negative evidence by the reviewer; nothing to apply.

### spec-S3 · note · evidence quality — NO ACTION

The reviewer's independent re-run reproduced every number. Recorded.

### standards-S1 · note · `lib/journals/types.ts` is not named in the ownership table — NO ACTION

The finding states its own disposition ("No action needed on the merits"): the field is optional and
additive and is the type companion of the ONE authorised `ENTRY_SELECT` hunk. Recorded here so the
ownership table's text can be reconciled by whoever writes the next brief.

## The walk, measured

`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3350 CLARA_E2E_NEXT_PORT=3351 CLARA_E2E_RUNTIME_PORT=3352
pnpm --filter @clara/web e2e opening-ledger-source --reporter=line --workers=1`

| run | result |
|---|---|
| first cut (implementer) | 1 passed · 6 `test.fixme`, failing assertion never read |
| fix round, legs un-fixmed | 1 failed at the panel that never mounted (the 404), then the server was lost |
| + the seed-scoped mock guard | the panel mounts; the read's own banner is gone (defect 2) |
| + `hasData`, + the lane reset | **3 passed / 4 failed** — and the four are real assertions: the missing filename and three axe contrast violations |
| + the document name, + the contrast fix | **6 passed / 1 failed** — the last is the spec's own `not.toMatch(/Ready to approve/i)` |
| + that assertion rewritten | **7 passed (21.7s)** · every leg live, none `fixme`, none skipped |

The file's own header block now records this instead of the old partial. One transient
`next build` EPERM on the wrangler registry path under host contention (three other lanes building
at once) cost one run; retried, per the known-reds note in the work order. One run was also lost to
my own mistake: I killed what I took for two stale `serve-built` processes on this lane's ports and
they were that run's own server — the ports were checked again, and freed properly, before each
later run.

## Verification after the round

| Check | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **green** (exit 0) |
| `pnpm lint` (worktree root) | **green** (exit 0) |
| `packages/db` opening + registry batteries, 41 gate flags | **31 tests · 31 pass · 0 fail · 0 skip** |
| `packages/runtime` opening + egress batteries | **84 tests · 84 pass · 0 fail · 0 skip** (`opening-tb-produce` 17, `wave-b-opening-parse` 17, `kdoc-*` 3 files, `intake-egress`, `f4-egress-release-hold`) |
| World leg `node tests/opening-ledger-source-e2e.mjs` | **PASS**, all seven stages, on real Postgres under real roles |
| `apps/web` walk | **7 passed (21.7s)** |
| `e2e/e2e-fixture-ownership.test.ts` | **18/18** |
| `check-frozen-workflows.mjs` / `check-parts-parity.mjs` | **OK / OK** (parts-parity refused an earlier conditional object spread in `egress.mjs` — rewritten as a plain assignment, which is why the envelope key is set that way) |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **4168 tests · 4165 pass · 1 fail · 2 skipped**; the failure is the known whole-suite load flake `lib/clara/use-clara-thread-stop.test.ts` cell 1845 (a file this ticket never touches), which passes **25/25 in isolation** — the same cell the pre-fix-round run hit |
| the five #656 web batteries | **32/32** (was 29; +2 coverage-footer cells, +1 refusal-face cell) |

## Deliberately left

| Finding | Why |
|---|---|
| A9 (tail heading vs its checks) | 0228 is applied on this rig and its sha is in `clara.schema_migrations`; any edit desynchronises the ledger and `migrate()` aborts on the next run, and the `opening_balance_doc` pre-image is not recoverable from the file, so a rollback/re-apply cannot be done safely for a note. Partial cover measured (registry battery 19/19 after the republication). Pre-merge recommendation written above. |
| A11, spec-S3, standards-S1 | Each finding states its own "no action" disposition; nothing to apply. |

## Ratification requested

| Finding | The question for the orchestrator |
|---|---|
| A4 / spec-S2 | D13.3 says `prior_gl.business_operation = 'supported'`; the registry's own 240-row law refuses that while `typed_facts` is not supported, and nothing produces a `prior_gl.line`. Amend D13.3 to match what shipped, or rule the four-level vocabulary itself wrong for a "read deterministically into human-ticked proposals" capability (F6) — but say so before 0228 merges, because the version it publishes is load-bearing. |
| A9 (the pre-merge edit) | Whether to take the §0/tail digest (or the heading softening) into 0228 before it is applied anywhere real — a file edit that costs this rig its applied-migration evidence if taken here. |

A4/spec-S2 ratified as shipped — DECISIONS §6.2.1 amends D13 (prior_gl stays stored_only with the truth in limits; F6 follow-up).

## Fix round 2

Report-text-only corrections, ordered by DECISIONS §6.2.2's row for #656 ("fix-round report A3
count (four app/fixture defects + one spec defect)"). No worktree file changed; no branch or code
change.

**Finding 1 — A3's section header undercounted the round's own defects.** The header read
"APPLIED (three defects found)" while the round's closing commit (`0a86d5ab`) and the walk file's
own header block both count FOUR app/fixture defects — the fixture's client-only mock guard, the
`DataState`/`hasSeedsData` unmount, the `documentName={null}` doubled sha, and the `opacity-70`
contrast failure — plus one spec defect (`not.toMatch(/Ready to approve/i)` failing on the state it
exists to require). The section's body enumerated only three items and folded the lane-state reset
in beside them, which is a distinct, fifth mechanism (server-state isolation), not one of the four
named defects.

WHAT I DID: corrected the header to "APPLIED (four app/fixture defects found, plus one spec
defect)". The body's numbered list and the "walk, measured" table were left as written — the
recheck (`656-recheck-1.json`) found the fuller, correct count already present there ("nothing is
hidden, only the summary line undercounts"), so this is the summary-line fix the recheck named,
not a rewrite of the underlying evidence.

EVIDENCE (worktree `C:\Users\zhant\Desktop\clara-wt\656`, HEAD `0a86d5ab` unchanged):
- `git log -1 --format="%B" 0a86d5ab | grep -cE '^[1-4]\.'` → **4** (the commit body's own
  numbered defects 1–4: fixture, `DataState`/AC5, `documentName` null, axe/opacity-70).
- `git log -1 --format="%B" 0a86d5ab | grep -c "was in the spec"` → **1** (the commit's own "found
  four defects and only one of them was in the spec" sentence).
- `grep -cE '^//   [1-4] ·' apps/web/e2e/opening-ledger-source-walk.spec.ts` → **4** (the walk
  file's "MEASURED STATUS" header block enumerates the same four defects, then separately states
  "the one spec defect").
- `git status --porcelain | wc -l` on the worktree → **0** (clean; this round touches no code).

**Finding 2 — the "Ratification requested" table was stale for A4/spec-S2.** The table still
framed A4/spec-S2 as an open question for the orchestrator ("Amend D13.3 … or rule the four-level
vocabulary itself wrong … but say so before 0228 merges"), but the orchestrator has since ruled on
it.

WHAT I DID: added a line under the Ratification requested table recording the ratification and
its amendment, in the words DECISIONS §6.2.2 asks this report to carry: "A4/spec-S2 ratified as
shipped — DECISIONS §6.2.1 amends D13 (prior_gl stays stored_only with the truth in limits; F6
follow-up)."

EVIDENCE: `docs/plan/active/refresh-wave-2026-09-18/DECISIONS.md` §6.2.1, the `#656` row (read
directly, main checkout): "`prior_gl.business_operation` stays `stored_only` with the truth in
`limits` (the registry census refuses `supported` over unsupported typed facts; nothing produces
`prior_gl.line`); 0228 is not edited after application (checksum ledger); whole-registry version 2
| ratified — **D13 is amended**: 'capability registry → version 2, both rows' basis/limits
corrected; `business_operation` levels as the census admits; a follow-up (F6) asks whether the
four-level vocabulary needs a "read into human-ticked proposals" level'." Matches the row DECISIONS
§6.2.2 lists for #656 ("fix-round report A3 count …") — the ratification-table line above is the
other half of that same row (the recheck's own A4 entry already read "STILL OPEN … no DECISIONS
text answers the business_operation-level question" at recheck time; §6.2.1 landed after the
recheck and answers it).

No re-run of any code battery was needed or performed: both findings are wording corrections to
this report only, and the worktree's test evidence (DB 31/31, runtime 84/84, walk 7/7,
`e2e-fixture-ownership` 18/18, typecheck/lint green, whole `apps/web` suite 4168/4166/0/2 — see
`656-recheck-1.json`) is unaffected and unchanged.
