# Wave C-b — bank design, part 3 (the acceptance round)

> **This file continues `wave-c-b-bank-design.md` + `-part2.md`** — same status, same
> authority. Part 1 carries §1–§4.6; part 2 carries §4.7–§7 with the as-built (v2.1/v2.2)
> and delta-round amendments; **this part carries the ACCEPTANCE ROUND (2026-07-31)**,
> split out by the repo's 500-line ceiling. All three files together are the C-b
> mechanism of record.

## ACCEPTANCE ROUND (2026-07-31 — PRs #154–#164 + migration `0039`)

**The FIRST real statements: nine ROME PROPERTIES Maybank months 202504–202512 through the
live lane, after Rome-synthetic green. Every item below was surfaced by a REAL statement,
never by a fixture — the synthetic corpus stayed green throughout, which is a finding about
the corpus as much as about the code. The whole round shipped WITHOUT one `_vN` recut:
`statementFacts.v1`'s SERVICES/engine/libs are process-injected and OUTSIDE the frozen
closure (the AB-16 precedent), so the deployed workflow body stayed byte-identical and the
two live retry-looping runs recovered on their next attempt.**

- **The kind-blind supersede starved reader-1 on EVERY real document (#154).** *Surfaced:*
  the first live ingest read zero regions. The 0017 authoritative-extraction trigger points
  `superseded_by` at whatever done extraction is newest REGARDLESS OF KIND, so in real
  pipeline order (intake OCR → classify verdict → human kind-stamp) the layout geometry
  always arrives already "superseded" by a `doc_classify` verdict; the bare
  `superseded_by is null` filter returned nothing for every classified document. The invoice
  lane never noticed — it reads extraction ENVELOPES, not regions. *Decision:* fix the READS
  kind-honestly now; the trigger's own kind-scoping stays an OPEN ADJUDICATION (an
  `authoritative_extraction_id` consumer census first — PROJECTLOG PART 2). *Shipped:*
  `statement-layout-reader.mjs` (`readStatementLayoutRegions` excludes an ocr row only when
  its superseder is itself `engine_kind='ocr'`), plus the same class traced into two
  untouched siblings by the PR review — `opening-parse.mjs` `SELECT_TIE_REGIONS_SQL` and
  `seeding-parse.mjs` `SELECT_PRIOR_GL_REGIONS_SQL`, both recut to "the newest done
  extraction that CARRIES the typed regions" (`opening_tb.line` / `prior_gl.line`); the
  seeding one was MASKED — its route falls back to the OCR-cells path on empty, so the
  failure mode was SILENT SUBSTITUTION of the inferior source. Cells:
  `statement-layout-supersede.test.mjs` (rig, staged against the REAL trigger). *Law:* **a
  regions reader selects by the TYPED REGIONS IT NEEDS, never by `superseded_by is null`;
  supersede is authority-of-kind, and only a later OCR read replaces a page's geometry.**
  Third sighting of the class in this codebase.

- **Real-Maybank grammar, round 1 — the header (#155).** *Surfaced:* RPR 202504 refused
  `header_unreadable` against a reader built entirely on synthetic fixtures. Three real
  shapes: (a) `.00` — Maybank prints zero with NO integer part on every endpoint of a
  zero-activity month; (b) the label/value SPLIT — `NOMBOR AKAUN` and its digits sit five
  dwibahasa regions apart, and the cleanest adjacency lives in a header TABLE's cells,
  which the `pages.*` substrate never sees; (c) NO printed period range at all — only the
  statement date. *Shipped:* `statement-grammar.mjs` normalizes the leading-dot form to
  `0.xx` (three decimals stay refused) · `statement-layout-reader.mjs` gains
  `cellScanLines` (table cells appended as header-scan pseudo-lines AFTER the page lines),
  a multi-region look-ahead in `labelled()`, and the statement-month period derivation
  (`period_derived_from_statement_date`), mirrored in reader-2. The PR review reproduced
  two defects in the first cut: a **BLOCKER** — `cellScanLines` fed TRANSACTION-table text
  to the header label scan, where `BALANCE B/F` IS an opening needle and a per-page
  subtotal IS a totals needle with no cross-reader backstop (fixed by
  `ledgerShapedTables`) — and a **MAJOR** — the slash-only account guard let dash/space
  dates through (`30-04-25` → `"300425"`), fixed by `accountToken`, which refuses anything
  that parses as a date in ANY separator and anything under eight digits. Cells:
  `statement-real-corpus-shapes.test.mjs`. *Law:* **period bounds may be DERIVED (first of
  the statement month → statement date), ABSENCE-ONLY, by each reader from its OWN date
  read, and receipted — a printed range always wins; the derivation is honest by
  construction because line dates, the DB core's re-check and month-to-month continuity
  all bind it.** And: **a look-ahead value is admitted only under a SHAPE that a date
  cannot satisfy.**

- **Real-Maybank grammar, round 2 — the columns (#156).** *Surfaced:* the first ACTIVE
  month (202506) read ZERO transaction rows and BOTH readers agreed on zero — only the
  chain refusal caught it. `readColumns` matched column synonyms by whole-cell EQUALITY,
  and the real headers are trilingual combined cells (`TARIKH MASUK / ENTRY DATE`,
  `JUMLAH URUSNIAGA 银码 TRANSACTION AMOUNT`) that no exact match ever hits. *Shipped:*
  one shared `containsSynonym` word-bounded idiom used by both column mapping and ledger
  detection; the review round then made mapping **specificity-before-position** (two
  passes — multi-word synonyms claim cells first, bare single words fill only unmapped
  keys) because x-order alone let an inverted `VALUE DATE` steal `entry_date` with no
  refusal, and made ledger detection **ROW-LOCAL** (a table is ledger-shaped iff some
  geometry-grouped row maps as a transaction header) because a table-wide word sweep let
  one stray disclaimer cell exclude the whole header table. *Law:* **trilingual combined
  cells make exact-match death the house trap — column/ledger recognition is word-bounded
  containment, specificity before position, and over-detection must always be the safe
  direction.** *Law:* **two readers agreeing on NOTHING is not corroboration — the chain
  identity is the reader that catches it (WC-R7 doing exactly the job it was ruled for).**

- **Refusal observability (#157, #161).** *Surfaced:* the DB taxonomy records the refusal
  CODE by design and drops the field-level detail; every acceptance diagnosis therefore
  cost a full live round-trip. *Shipped:* a bounded log line at the `StatementRefusal`
  constructor (detail capped at 2000 chars), then — because the process log stream proved
  lossy under sidecar noise — a machine-local NDJSON sink at
  `/tmp/statement-refusals.ndjson` (record capped at 4000 chars, guarded so diagnostics
  can never mask the refusal). *Law:* **a bounded DB taxonomy obliges an
  operator-reachable detail channel; the detail is diagnostic, never authority — nothing
  reads the sink back.**

- **Reader-2's line fork — OWNER RULING B (#158).** *Surfaced:* the typed model returned
  an empty transaction array while its own recognition was complete. *Ruling (owner,
  2026-07-31): option B* — the engine's already-ratified completion-pass doctrine extends
  from the header to the TRANSACTION LINES: typed wins wherever it spoke; an empty typed
  array completes from THIS response's own recognized regions through the same
  deterministic grammar reader-1 runs. **The LLM-structured read stays the named fallback
  seam (option A)** — when it lands it becomes the preferred reader-2 substitution and B
  demotes to last resort. *Shipped:* `statementFacts.v1.engine.mjs`
  (`responseLayoutRegions` — the response's pages+tables as intake-shaped regions) + the
  completion, receipted `lines_completed_from_content`; cells
  `statement-engine-line-completion.test.mjs`. *Law:* **the two readers keep two
  independent RECOGNITIONS and may share ONE grammar; the chain identity and the printed
  totals stay the grammar-independent floor, and every completion is receipted, never
  silent.**

- **The typed schema was per-account all along (#159) — this CORRECTS the ruling's
  premise.** *Surfaced:* a live shape probe on the machine against the real 202506 PDF
  ended the `readers_disagree` hunt: `prebuilt-bankStatement.us` puts its typed facts —
  `AccountNumber`, `BeginningBalance`, `EndingBalance`, `Transactions` — under
  `fields.Accounts[].valueObject`, NOT at the top level the normalizer read, and its
  response carries NO statement-date fields and NO tables at all. **Azure had read 5
  transaction rows all along; the zero was OUR read**, and only the label completion had
  masked it for the header. *Shipped:* the engine merges `Accounts[0].valueObject` over
  the top-level fields; extra accounts are receipted (`accounts_in_response`) and the
  registered-account identity check downstream refuses a mismatch. *Decision:* ruling B
  STANDS as law — it is the right doctrine for a genuinely-empty typed array and it stays
  as the fallback — but its stated evidence is corrected (the inline flag in part 2).
  *Law:* **PROBE THE VENDOR'S ACTUAL RESPONSE SHAPE ON A REAL DOCUMENT before ruling on
  what the vendor cannot do** — a schema-shape bug and a model incapacity present
  identically at the refusal boundary.

- **One-sided null running balances defer to the chain (#160 runtime · #162 = migration
  `0039` DB).** *Surfaced:* the probe showed the per-account typed transactions carry NO
  `Balance` field at all — a SCHEMA ABSENCE, not a failed read of the printed page. The
  old law (any null disagrees) refused every real active month on every line. *Shipped,
  both halves, in the BINDING order — runtime first:* `statement-corroboration.mjs`
  (`lineDisagreements`: the balance test fires only when BOTH readers carry safe integers
  that differ), then `0039_statement_balance_null_defers.sql` — a prosrc SPLICE of
  `_persist_statement_core`'s one line-skeleton compare block (exactly-once prestate probe
  + postcheck, statically-attributable `regprocedure` target), replacing whole-jsonb
  equality with an explicit per-row compare under `with ordinality` (aliases `sk1`/`sk2` —
  the record-`b` shadowing trap, again). Cell `x38.an` pins both directions; rig from zero
  at 0039: bank battery 43/43, match 33/33. *Law:* **`entry_date` and `amount_cents` are
  compared STRICTLY and bilaterally always — they have no independent re-derivation.
  `running_balance_cents` disagrees only when BOTH readers carry a number and the numbers
  differ; a ONE-SIDED null defers that row's balance witness to the CHAIN IDENTITY
  (WC-R7's own logic — the chain is a reader), walked again by the DB core at persist.**
  And the meta-law the round re-proved: **a two-reader rule tuned to a printed page must
  distinguish "could not read it" from "the source has no slot for it".**

- **Labelled money reads across split label/value regions (#163).** *Surfaced:* the real
  202509 five-page statement prints `ENDING BALANCE :` and its `29,660.41` SEVEN cells
  apart in a summary table, while barren copies of the same label sit on page lines —
  first-hit-wins starved the one occurrence that carries the value. *Shipped:*
  `labelledAll` returns EVERY label hit with an eight-region look-ahead; `labelledMoney`
  tries them all, admitting a look-ahead region only when its ENTIRE text is a money
  literal, so prose and dates can never be slurped; `labelled()` dedupes to `labelledAll`'s
  first hit. All dumped real months read completely and close. *Law:* **a label is a
  CANDIDATE SET, not a first hit — and a widened look-ahead window is only safe when
  paired with a STRICTER value shape.**

- **Zero-amount ceremony rows are skipped, both parsers (#164).** *Surfaced:* the real
  202512 account-closure month prints nine `0.00` settle/close rows after the balance
  drains to zero; reader-1 read 14 lines, the typed vendor read 5, and the DB's own line
  law (`amount_cents <> 0`, §4.2) would have refused the insert regardless. *Shipped:*
  `statement-layout-reader.mjs` and `statement-parse.mjs` both skip-and-count zero-amount
  rows. All four dumped real months (202504 / 202506 / 202509 / 202512) read, close, and
  tie printed totals. *Law:* **a zero-amount row is CEREMONY, not movement — every reader
  drops it skipped-and-counted, so the readers agree with each other AND with the DB's
  line law by construction, not by luck.**

**Standing sign law, RE-CONFIRMED unchanged by the real corpus (`statement-grammar.mjs`):**
under a single amount column an UNSIGNED figure is REFUSED — `applySign` returns null
without a `+`/`-`/`DR`/`CR` marker, and a debit/credit pair supplies the side instead; a
row with BOTH columns filled is unreadable. The real Maybank layout prints its markers, so
the law never had to bend; direction is never inferred from position or from prose.

**What the acceptance proved about the process, not the code:** the deploy-order law
(runtime image FIRST, then migration) held under live pressure — the null-defers pair
shipped #160 before `0039`; the reader/engine/lib layer being outside the frozen closure
is what made ten runtime behaviour PRs in one day legal (the eleventh, #162, is the 0039
DB splice riding the normal migration law); and the synthetic-first discipline is what
made every one of these findings a REFUSAL rather than a wrong number. **Nothing in this
round mis-posted money: every real-corpus gap surfaced as a named refusal code with the
statement unpersisted.**

**Live pin at the acceptance seam:** 38 migrations (frontier `0039`) · Fly `clara-runtime`
v50 · `/ready` green · four firms · typed `statement_extraction` consent ACTIVE for RPR
(real PDF evidence) and the Rome sandbox (labelled synthetic, the Gate-S precedent) · RPR:
9 statements live, chain Apr-0 → Dec-0 account closure, 13 live matches, 27/36 acceptance
items closed · sandbox: 1 synthetic account + July statement, 3 settlements, tie identity
proven. Runtime cells 949 → 962 from zero across the round.

**Named residuals the acceptance LEAVES (honest, and each one is a C-c feeder):**
- **41 unmatched RPR lines, −RM653,894.70 — the C-c working set** (the DB-wide count is 42:
  +1 deliberate synthetic fixture on the sandbox account). Their classes are already
  legible: payroll batches (`MAS PAYMENT`) · EPF / PERKESO / SOCSO / SIP-EIS / LHDN
  statutory · IWIFI transfers with no bills in the books (four lines netting exactly RM0 —
  a wash-transfer shape) · ROME PUBLIC payments · bank charges · INF ASSET rental. The
  recurring statutory shapes are the learn loop's OBVIOUS first rule candidates.
- **The ROME PUBLIC allocation question is PARKED WITH THE OWNER (non-blocking).** Which
  bills do the three payments (RM21,500 2025-08-29 · RM25,000 2025-10-02 · RM10,000
  2025-12-03) cover? Eight bills (3×RM500 + 5×RM5,000 = RM26,500) stay open pending the
  answer; **the amounts do not map uniquely, and the agent must not guess an allocation** —
  C-a's verbs are human verbs by law.
- **The per-statement tie banner shows CUMULATIVE drift by design** once prior months hold
  unmatched or unbooked lines (gl + this-statement-unmatched ≠ closing). The C-c tie-out
  receipt owns the cumulative identity; the RPR nine-month panel is its live evidence.
- **The LLM-structured reader-2 (seam A) stays UNBUILT** — a future build item with a
  refusal-biased prompt + review; ruling B holds the seat meanwhile.
- **The 0017 trigger's kind-scoped supersede stays an OPEN ADJUDICATION** (consumer census
  first); the three readers are correct under both the current and a kind-scoped trigger.
- **The refusal sink is machine-local, unrotated, diagnostic only — and ships
  umask-default:** PR #161's second commit is TITLED "0600 mode" but the merged call sets
  no mode; adding `{ mode: 0o600 }` is a recorded one-line follow-up (PROJECTLOG PART 2),
  written here so the commit title never reads as the fact.
- **The four adjacent acceptance-night findings stay open** (PROJECTLOG PART 2): the
  leader cancel path's `settle_chat_turn` misuse for autodraft tasks · `other` →
  `consent_evidence` is unreachable (needs a human-correction door) · the intake CSV probe
  refuses single-column preamble rows · `request_reextraction` is invoice-scoped, so the
  human statement re-fire door is an unobvious same-kind `set_document_kind`.
