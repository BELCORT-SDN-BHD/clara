# Wave 3, lane 08, ticket #990 — the per-line source citation, built now

Branch `riders/w3-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Commits on this branch since base (in order; #857 is
this lane's prior ticket, landed and reported separately — `wave3-lane08-ticket857.md`):

- `448d9a128` `feat(db): #857 AC2 - a table CHECK proves field_path grammar at every writer`
- `b368302db` `test(db): #857 prove the field_path CHECK end-to-end, register its gate`
- `ce28b58bb` `feat(db): #990 bank_statement_lines carries an optional source citation, OCR/witness lane only`
- `993f6d695` `feat(web): #990 citation.ts — the three-state source-citation decision`
- `1b9cfd105` `feat(web): #990 the Matching tab states a line's source citation, never a blank`
- `ee77f2069` `test(web): #990 review 0291's dynamic-SQL splice for the P4 scope-view census`

## Resume note: an earlier implementer of THIS ticket

An earlier implementer of #990 was cut off by a usage limit before any commit, leaving 12
uncommitted files: the migration, its db test + gate, `lib/bank/citation.ts` + its unit test, the
`BankLineMatchingContext.line.citation_page` wire wiring + its unit test, `CONTEXT.md`,
`packages/db/README.md`, `packages/db/package.json`'s gate registration, `apps/web/test/manifest.txt`,
and a `matching-section.tsx` header comment promising a `srcCitation` row that did not yet exist in
the JSX. I read every uncommitted diff before touching anything, checked
`clara.schema_migrations` (0291 was already **applied**, `applied_at 2026-09-20T16:02:02.118Z`),
and re-hashed the migration file on disk against the ledger's stored checksum — byte-identical
(`45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3`), so nothing had drifted since
that apply. Judged on their merits: the migration, the db test battery, `citation.ts` and the wire
type change were complete, correct and independently green (verified below) — I kept them
unchanged. The two things NOT done were the actual UI wiring the header comment promised
(`srcCitation` in the detail pane, the matching `citationPage`/`citationLaneNone`/
`citationNotRecorded` message keys, and the outcome block's own row) and this report; I built those
test-first and wrote this report.

## Status: PARTIAL (corrected in the fix round — SPEC-L08-02)

This report first read "done". It is corrected to PARTIAL. What ships is the RECEIVING half: the
column, the persist core's willingness to carry a citation through when a payload states one, the
read door's `citation_page`, and the two surfaces that render it. **No live producer can state a
citation**, so AC1 and the citation-PRESENT half of AC3 are unreachable on the live lane today, and
the visible outcome on EVERY real machine-lane statement line is the sentence "No source citation
was recorded for this line."

Proved, not argued: `packages/runtime/workflows/statementFacts.v3.prompts.mjs`'s `lineShape`
(lines 151-157) declares exactly five keys — `entry_date`, `value_date`, `description`,
`amount_cents`, `running_balance_cents` — with no page or region, and `toWriterLines()` (lines
349-362) REBUILDS every line as a fresh object of six named keys, so even a model that volunteered
a page could not get it into `p_payload.readers.reader1.lines[i]`. Both files are frozen
(`grep statementFacts frozen-workflows.json`), so the work order's frozen-body rule is what blocks
the producer half; the "Successor contract" section below carries the edit that closes it.

Cell 990.a's citation comes from the test's OWN fixture (`landCitedWitnessStatement` builds
`reader1Lines` with `{ page, region }` by hand), which proves the DOOR accepts and attributes a
citation — a real and load-bearing claim — but is not evidence that any production path produces
one. The owner should rule on shipping that face knowingly rather than discover it in the product.

### Original status note

Verified still live on this branch before building: `gh issue view 990 --comments` — the newest
text is the owner's ruling comment dated 2026-09-20 ("Build the per-line source citation now... A
bank line a person is asked to match should be able to say where it was read from... Nothing dark:
the surface states the absence instead of quietly leaving a blank"), unopposed by any later
comment; the Agent Brief beneath it is the spec of record for the Key interfaces/AC list below.

## The seams tested at

- **The persist core's atomic insert** — `clara._persist_statement_core_v2`'s own write into
  `clara.bank_statement_lines`, driven through the REAL door
  (`clara.persist_statement_facts_v2`, the live `statementFacts_v3` workflow's own call), never a
  raw fixture insert.
- **The wrong-lane refusal** — the same core called directly as root (`coreV2Direct`), because
  `persist_statement_facts_v2` always calls it with `ingest_mode='witness'` and cannot reach the
  structured-lane refusal branch itself.
- **The read side** — `clara.get_bank_line_matching_context`, the Matching tab's own detail-pane
  door.
- **The wire-to-face seam** — `toBankLineMatchingContext` (raw JSON → `BankLineMatchingContext`),
  driven with literal wire-shaped fixtures, never an already-normalised object.
- **The rendered face** — `MatchingSection`'s detail pane and `MatchingOutcome`'s persistent
  block, both mounted for real (`renderComponent`) against a mocked `get_bank_line_matching_context`
  response, asserting on rendered text.
- **The pure decision** — `citationState`/`citationLabel`, unit-tested in isolation from both
  surfaces that consume it.

## Acceptance criteria, with evidence

| # | Criterion | Evidence |
|---|---|---|
| AC1 | A line ingested through the OCR lane persists with a page/region citation attributable to a stored extraction | **PARTIAL — the door half only (SPEC-L08-02).** No live producer can state a citation (frozen `lineShape`/`toWriterLines`, see Status), so no line ingested through the real OCR lane carries one today. What IS proved: `bank-statement-line-citation.test.mjs` cell **990.a** — 3 lines land, every `citation_extraction_id` equals `result.reader1_extraction_id` (the SAME row the transaction just banked reader1's read into, never a caller-supplied value), each line's own page/region survives distinctly (not shared/blurred). PASS. |
| AC2 | A CSV/hand-keyed line persists with no citation; no read/match/tie-out path treats the absence as an error | Cell **990.b** — a witness statement with no per-line citation persists cleanly, all three columns NULL on every row, `result.status === "done"`. The CSV/structured and hand-keyed lanes go through the untouched ancestor `clara._persist_statement_core` and never reach the column at all (migration tail assertion 5, PASS: the ancestor's `prosrc` carries no `citation_*` reference). The full bank/match batteries below (135 tests) confirm no downstream path chokes on a NULL citation. |
| AC3 | A person sees the citation when present, an explicit sentence when not, never a blank control | `apps/web/lib/bank/citation.test.ts` (4 tests) pins the 3-state decision (`present`/`lane_none`/`not_recorded`) from the message catalogue, never a hardcoded string. `matching-section.test.tsx` `[990]` (3 new tests) prove the detail pane's `srcCitation` row renders "Page 5 of the source document", "This line's intake lane keeps no page or region citation." and "No source citation was recorded for this line." for the three states respectively. `matching-outcome.test.tsx` `p990.web.outcome-citation` proves the SAME sentences render in the persistent outcome block, through the SAME `citationLabel` call — the two surfaces cannot drift apart. |
| AC4 | Matching, tie-out and reconciliation are unchanged; the bank batteries pass unchanged | `bank-line-existing-booking.test.mjs`, `f-a1-statements{,-2,-3}.test.mjs`, `f-a2-statement-activation.test.mjs`, `f-a3-pr1c-egress-bank-matching.test.mjs`, `f-a3-pr3-chatturn-v14-bank-parity.test.mjs`, `x38-wave-c-b-bank.test.mjs` — **102/102 pass**. `x38-wave-c-b-match.test.mjs` — **33/33 pass**. `apps/web`'s whole unit suite — **4853/4855 pass, 2 skipped** (unrelated known live-provider skips), 0 fail. The `bank-match-walk.spec.ts` e2e walk (mocked-PostgREST, real browser) — **6/6 legs pass**, including the axe accessibility scan. |
| AC5 | The column/persist recut ship as ONE new migration at the next free number; no applied migration edited | `0291_bank_statement_line_citation.sql`, the number reserved for this ticket. `git log` on this branch touches no other migration file; `0290` (applied by #857, this lane's prior ticket) is untouched — confirmed by its own re-read at prestate (its sha is not touched by this file at all) and by the fact this migration's own diff contains no edit to any `02xx` file but `0291`. |

Both cells' `after()` vacuity control (`EXPECTED_CELLS = 5`) confirms exactly 5 cells ran, matching
the 5-cell battery (990.a–990.e), plus the standalone `META` cell — 6 tests total, 0 skipped, on a
focused invocation (`CLARA_ALLOW_MISSING_BANK_STATEMENT_LINE_CITATION` unset, so a chain missing
the columns would hard-fail rather than silently skip).

**Ticket staleness, named so a later reader does not re-discover it** (carried from the migration's
own header, re-verified): the Agent Brief describes "the OCR lane" as running "two readers under
two engine ids" — 0038's ORIGINAL design. The LIVE lane
(`statementFacts_v3` → `persist_statement_facts_v2` → `_persist_statement_core_v2`) has since moved
to the witness pair (two engine KINDS sharing one engine_id, 0098 §3.7/§3.9). "The OCR lane"
everywhere in this report and in the shipped code means `ingest_mode IN ('ocr','witness')` — the
core's own `v_two` flag — which is what the function actually gates its two-reader ladder on; the
ticket's ASK stands unchanged despite the brief being stale on the mechanism.

## Migration

`packages/db/migrations/0291_bank_statement_line_citation.sql` — file sha256
`45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3` (matches
`clara.schema_migrations.checksum` on `clara_l08` exactly; no drift since the prior implementer's
apply).

**Prestate pins, MEASURED on `clara_l08`** (this lane's #857/0290 touches `clara.document_regions`,
not the statement lane, so nothing upstream of this file could have recut these three bodies):

- `clara._stmt_lines_norm(jsonb)` — `sha256(prosrc)` = `a7f9a65876a8178b1522918a48267fb0a47eeb9db799a08919784d5972e8b17a` (neighbour, pinned on BOTH first-apply and redo; never recut by this file).
- `clara._persist_statement_core_v2(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)` — `sha256(prosrc)` = `6f694ac0de0272bb3d7c64856387b7e9420bc7ad5757e1f755f2ea0b17d1db86` (pre-splice; pinned on first-apply only, per the wave-3 bimodal-pin rule).
- `clara.get_bank_line_matching_context(uuid)` — `sha256(prosrc)` = `765025f1c658cc5defb257816abc398388616bb82343c699655cbd5079eb29fe` (pre-splice; pinned on first-apply only).

**Change.** `clara.bank_statement_lines` gains three nullable columns —
`citation_extraction_id uuid` (FK into `clara.document_extractions`), `citation_page int`
(1-based), `citation_region jsonb` (opaque locator) — all-or-nothing by CHECK, plus a page-positivity
CHECK and a region-is-object CHECK. `clara._persist_statement_core_v2` is spliced on TWO anchors
(the reader2-wrong-lane guard, which gains a sibling citation-shape guard; the atomic INSERT, which
gains a LEFT JOIN back onto reader1's raw payload by `line_no`) and `clara.get_bank_line_matching_context`
on ONE (the line `jsonb_build_object`'s closing tuple gains `citation_page`). Full design rationale
(why direct columns and not a `document_regions` row, why the payload is read raw rather than
through the normalizer, why no `packages/runtime` file changes) is in the migration's own header
and in `packages/db/README.md`'s `## 0291 —` section.

**First-apply branch, proven for real, not simulated.** 0291 was applied via an ordinary
`pnpm db:migrate` (not a redo) before I resumed this ticket — `clara.schema_migrations.applied_at`
= `2026-09-20T16:02:02.118Z` — so the prestate's first-apply branch, both splices and the tail all
ran for real against the actual pre-image bodies, not a rolled-back simulation. I did not need the
wave-3 addendum's "prove the first-apply branch inside a rolled-back transaction" recipe, because
the genuine first apply already exercised it and its own tail NOTICEs (`bslc splice(core): OK`,
`bslc splice(ctx): OK`, `bslc tail: OK`) are the proof.

**Redo branch, proven for real, THIS session.** Ran `CLARA_MIGRATION_REDO=0291_bank_statement_line_citation
node scripts/migrate.mjs` against `clara_l08` (378 rows on `bank_statement_lines` at that point, from
the bank/match batteries run earlier in this session — a populated table, not an empty one):
`bslc prestate: clean (redo=t)`, both splices logged
`SKIPPED -- redo (#957): ... already carries this file's own citation splice (proved in the
prestate)` rather than re-searching for a first-apply anchor that no longer exists, and the tail
passed — `redone 0291_bank_statement_line_citation · new checksum
45235f2dab6652a3faa15abff761ea953993ecf4636fcbfcab8ad2a6637505b3` (checksum unchanged, since the
file itself was not edited between runs — this redo exercises the bimodal pin's SKIP branch, not a
fix-round edit). Re-ran the ticket's own 6-cell battery immediately after: still 6/6 green. The
ledger's final checksum matches the committed file byte for byte.

Applied with `pnpm db:migrate` originally, **269 total migrations after** (267 base + 0290 + 0291).
CORRECTED in the fix round (SR-1): this line originally read "291 total migrations after" — 291 is
0291's migration NUMBER, not a COUNT, and the two were conflated. Re-measured on clara_l08:
`select count(*), max(version) from clara.schema_migrations` -> `269 | 0291_bank_statement_line_citation`. `CLARA_MIGRATION_REDO` was
unset again afterward; no lingering env state.

## Docs

- `packages/db/README.md` — new `## 0291 —` section (house per-migration convention, appended after
  `## 0290`), written by the earlier implementer, kept as-is (reviewed, accurate against the shipped
  code).
- `CONTEXT.md` — "Statement line" term updated: the citation is now named as an optional per-line
  fact, with its own `_Avoid_` entries (treating an absent CSV/hand-keyed citation as a defect;
  assuming every machine-lane line carries one today). Kept as-is from the earlier implementer,
  reviewed, accurate.
- `apps/web/messages/en.json` — five new keys: `srcCitation`, `citationPage`, `citationLaneNone`,
  `citationNotRecorded` (the detail pane's label and the three-state sentence), `outcomeCitation`
  (the outcome block's own label, reusing the same three sentences).

## Gates, with counts

- **New/touched db test file, standalone and with the FULL gate chain preloaded**:
  `bank-statement-line-citation.test.mjs` — 6/6 pass both ways (the `not_ok` run against a stale,
  wrong `$GATES` list — see "Anything unverified" — was a rig-hygiene accident, not a test defect;
  re-run against the correct list is what is reported here).
- **`operation-census.test.mjs`** (this ticket recuts two existing functions via
  `pg_get_functiondef`, though it creates no NEW function): 10/10 pass (opcen.1–opcen.10), full
  gate chain, `opcen.1` (no unwaived hard finding) confirms the splice introduced no GRANT/attribution
  regression.
- **`rig-isolation.test.mjs`**: 23 tests — **22 pass**, 1 skipped (T19, the destructive poison-role
  drill — correctly skipped, `CLARA_RIG_ALLOW_RESET` never set), 0 fail, full gate chain.
  CORRECTED in the fix round (SR-2): this line originally read "32 pass", which was this file's 22
  added to `operation-census.test.mjs`'s 10 and mislabelled as one file's own count. Re-measured on
  clara_l08 with the full gate chain: `# tests 23 / # pass 22 / # fail 0 / # skipped 1`, matching
  #857's own independently-verified figure for the same untouched file.
- **The bank/match batteries** (AC4's own evidence, listed above): 102 + 33 = 135/135 pass.
- **`apps/web/lib/bank/citation.test.ts` + `matching-context-types.test.ts`**: 10/10 pass.
- **`apps/web/components/bank/matching-section.test.tsx`**: 6/6 pass (3 pre-existing + 3 new
  `[990]` cells).
- **`apps/web/components/bank/matching-outcome.test.tsx`**: 6/6 pass (5 pre-existing + 1 new
  `p990.web.outcome-citation` cell).
- **`apps/web/tests/firm-scope-db-pins.test.ts`**: 22/22 pass (11 + 3 + 5 + 3 across its three
  describe blocks) — required a new `REVIEWED_DYNAMIC_SQL_BARRIERS` entry for 0291's two
  `pg_get_functiondef` splices; without it this file (and therefore the whole-suite run) reds with
  `unmodelled: unreviewed dynamic-SQL barrier at 0291_bank_statement_line_citation.sql`.
- **The WHOLE `apps/web` unit suite once** (`node scripts/run-tests.mjs`): 4855 tests, **4853 pass, 0
  fail**, 2 skipped (unrelated: `CLARA_LIVE_SUPABASE_AUTH_URL`/`ANON_KEY` not configured, a known,
  pre-existing skip in `entry/password-recovery-live.test.ts`-family tests).
- **`bank-match-walk.spec.ts`** (the one e2e walk touching the Matching tab), on this lane's
  triple (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3570 CLARA_E2E_NEXT_PORT=3571
  CLARA_E2E_RUNTIME_PORT=3572`): **6/6 legs pass**, axe scan included.
- **`pnpm typecheck`** (root): exit 0 (`apps/web`, `packages/runtime` both "Done").
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, wave-3 addendum rule): exit 0 across
  `packages/db`, `apps/web`, `packages/runtime`, `packages/reporting-render` — including
  `check-message-keys` (4313 static `t("…")` keys all resolve, including the 5 new ones) and
  `check-test-manifest` (503 files, `citation.test.ts` present exactly once, alphabetical).
- `packages/runtime` was not touched — no `check-frozen-workflows.mjs` /
  `check-parts-parity.mjs` owed (confirmed anyway: no runtime file appears in any commit on this
  branch for #990).

## Successor contract

This ticket ships the plumbing (the column, the persist core's willingness to carry a citation
through) but not the actual model-side ask for one — every module on the live statement-witness
path (`statementFacts.v2.{dispatch,behavior,impl,prompts}`, `statementFacts.v3.{behavior,header,
impl,prompts}`) is a FROZEN workflow body or a module in its frozen closure
(`node scripts/check-frozen-workflows.mjs` shows no manifest diff on this branch — confirmed, no
runtime file touched). What a future, unfrozen change needs:

- **No new door.** The SAME `clara.persist_statement_facts_v2(p_task uuid, p_payload jsonb)` call
  0291 already accepts a citation through — argument order unchanged. The successor widens only
  what `statementFacts_v3`'s own builder puts INTO `p_payload.readers.reader1.lines[i]`.
- **Payload shape (not a new zod TOP-level input, a widened line shape)**: each `reader1` line
  gains two optional keys, `page: z.number().int().min(1).optional()` and
  `region: z.record(z.unknown()).optional()` (an opaque locator, matching 0291's "checked as an
  object, not as a schema" posture) — BOTH present or BOTH absent, mirroring the table CHECK and
  the persist core's own guard.
- **Refusal mapping — already live, inherited for free.** A malformed per-line shape (page without
  region or vice versa, or a non-positive page) raises CLR10 with `{"reason":"chain_broken"}`; a
  citation supplied on a lane with no second reader raises CLR10 with `{"reason":"internal"}`. Both
  are proven by this ticket's own cells 990.c/990.d. A future producer needs no new refusal
  handling.
- **Part kind: none.** This is a plain jsonb payload field on an existing SECURITY DEFINER
  function call, not a Work/chat part — no room, door or prompt registration beyond the prompt
  stanza below.
- **The actual unfrozen work — the prompt stanza.** `statementFacts.v2.dispatch.mjs`'s own
  `readStatementWitnessCitationRegions(client, ocrExtractionId)` (lines ~166–192) already returns
  every region in reading order — `{idx, page, text_content}`, numbered by
  `clara.witness_citation_regions`'s own ordinal — and its header states in so many words this
  numbering is "reused here purely as a reading substrate for the TEXT channel... no citation is
  asked back". The successor adds ONE instruction to `statementFacts.v3.prompts.mjs`'s vision-
  channel prompt: for each statement line reported, name the `idx` of the region (from that
  numbered list) it was read from. `statementFacts.v3.behavior.mjs`'s response mapper then resolves
  that `idx` back to `{page, region}` via the SAME `clara.witness_citation_regions` /
  `document_regions.locator` join `readStatementWitnessCitationRegions` already performs, and
  attaches it to the matching `reader1.lines[i]` entry before the payload reaches
  `persist_statement_facts_v2`. No new SQL and no new migration are needed — 0291 already accepts
  exactly this shape.

## Follow-ups worth filing

- **File the producer half as its own ticket, blocked on the wave-4 `chatTurn_v22`/`claraWork_v6`
  cut** (SPEC-L08-02's required fix). Title it so the residual is not lost: "A bank statement line
  read by the witness pair states the page it came from". Its whole content is the "Successor
  contract" section above. Until it lands, #990's surfaces render "No source citation was recorded
  for this line." on every machine-lane line — which is the correct, nothing-dark face for the
  state the estate is actually in, not a defect.
- Otherwise none new. The ticket's own "out of scope" (OCR region-detection accuracy, backfilling citations
  onto already-ingested statements, extending citations to any other document-lines relation,
  changing how matching selects/scores candidates) is respected untouched — confirmed by the bank
  match battery (33/33) showing candidate selection/scoring is byte-unchanged.
- The successor contract above (the prompt-stanza edit to populate a real citation) is worth its
  own ticket once a frozen-workflow unfreeze window opens; nothing currently blocks on it.

## Anything unverified

- Mid-session, a `--import` gate list I had cached in `/tmp/gates.txt` (a Git-Bash path shared by
  Windows user, not per-worktree) was silently overwritten by what looks like a concurrent lane's
  own run on the same host, and briefly pointed at a stale/foreign gate list
  (`vendor-binding-write-doors-revoked-preintegration-gate.mjs`, a file that does not exist in this
  worktree) — `operation-census`/`rig-isolation` failed to even start against it. Recomputed the
  gate list fresh into this session's own scratchpad directory
  (isolated per-session, not shared) and re-ran everything reported above against the correct list;
  all counts in this report are from those re-runs. Flagging this as a rig hazard for later lanes:
  **do not cache a `$GATES` list under `/tmp` on this host** — it is not worktree-isolated the way
  the scratchpad directory is.
- `packages/db/README.md` and `CONTEXT.md`'s prose were written by the earlier implementer and
  reviewed by me for accuracy against the shipped code (all specific claims re-checked against the
  live migration file and the passing test battery), but the prose itself was not re-drafted.
