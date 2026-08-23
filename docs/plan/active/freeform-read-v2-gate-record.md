# F-A6 v2 PR-0 — the gate record

> **The gate ran 2026-08-23** against design **v1** (`freeform-read-v2-design.md`, `-survey.md`,
> `-annexes.md`), as F-A6 v2's slice of a shared six-set Track-B PR-0 run (**FT1, FT2, FT3, FT4,
> FA5b, FA6v2** — each set gated independently, each folding on its own branch; this record covers
> **FA6v2 only**). Five lenses per set (live-truth, accounting, security, law, build), refute-style
> adversarial verification per finding. **FA6v2: 20 raw findings → 20 deduped (18 to verify, 2
> nits).** Of the 18 verified: **14 CONFIRMED (2 blockers, 12 materials), 4 REFUTED.**
>
> **Verdict: one blocker and nine materials FOLD into DESIGN v2 (this record, `docs/plan/active/`).
> One blocker and three materials stay OWNER-RESERVED — four owner cards, §5, none resolved by this
> fold.** The two confirmed nits are recorded (§4) but **not folded in this pass** — they are outside
> the fold-only work order this record executes; cheap, and should not survive to PR-1 authoring
> unaddressed.
>
> **This record does not carry the individual REFUTED claims.** The raw gate output handed to this
> fold lane carries `refuted_count: 4` with no per-claim text or grounds — only the confirmed
> findings and the two nits were retained. Recording a count with no claim behind it is not evidence
> of what was refuted or why (review law 2); if the four refutations are needed verbatim, they must
> be pulled from the original gate-run agent output, not reconstructed here.
>
> **Fold hard-prerequisite and deferral, both kept intact by this fold:** F-A6 v2's hard
> prerequisites (`F-A2 PR-1 merged`, `F-A6 v1 PR-1..PR-4 merged`) are unchanged, and R-L18's
> XLSX/DOCX deferral (`wave-f-contract.md:263-265`) is unchanged — this fold corrects citations and
> closes mechanism gaps inside the severed lane's own design; it does not touch what the lane depends
> on or what it was ruled to carry.

---

## 1 · Blockers

**B4-FOLD · The cross-client arm state was forgeable via a direct `set_config`, with no mechanism
binding what the policies see to the list the arm validated.** *(security lens, CONFIRMED blocker.)*
The design's only proof that a payload could not widen the armed scope was an absence — "there is no
other writer of the state" — not a mechanism. A lawfully-armed session's own payload could
`set_config` the txn-local GUC `_freeform_scope_clients()` read, widening every policy's
`client_id = any(...)` to a forged set while the receipt kept recording the narrower, originally-armed
one — a scope breach and a receipt understatement (§3.7 attack 6) in one move, unexercised by any
Annex B cell.
**Fold (design §3.1/§3.3, Annex C-14, Annex B5.6):** the cross-client scope is now bound to the SAME
verified receipt row `_freeform_admitted()` already authenticates — the estate's own hash/liveness
idiom (`0011_daily_loop.sql:3243-3247`, `wake_context()`: the boundary is the match, not the GUC's
unreachability), re-proven on the new surface. The role holds zero DML on `freeform_read_log`, so a
payload cannot fabricate a row and a forged pointer can at best re-select its own transaction's
already-armed row. B5.6 forces the refusal: a direct `set_config` attempt to widen `{A,B}` to
`{A,B,C}` still reads only `{A,B}`, both in the policies and in the receipt.

**B0-RESERVED · The seven-value `engine_kind` world was never put to the owner, and S-2e/S-2r admit
all seven unconditionally — including the law-72 LLM witness-pair kinds.** *(live-truth lens,
CONFIRMED blocker.)* **STAYS OPEN — owner card 1, §5. Not resolved by this fold.** See §5 for the
full disposition; the design text is untouched on this point.

---

## 2 · Materials — folded (9)

**M1-FOLD · `get_document_extract`'s citation pointed at a superseded pre-F-A1 body.** *(live-truth
lens.)* Design §3.4 Decision 2 and survey Y6 cited `0011:3263-3269` for the `unassigned` disjunct;
the function was recut twice more (`0054`, then the live `0090_f_a1_walls.sql:1558-1684`, disjunct at
`:1587-1593`, byte-identical content). The derived conclusion (drop the disjunct) still held — this
was a citation-currency defect, not a wrong decision.
**Fold:** design §3.4, survey Y6 both retarget to the live `0090` location and explain the lineage.

**M3-FOLD · Currency-blindness: no MYR guard for cross-client `monetary_cents` reads.**
*(accounting lens.)* `document_regions.monetary_cents` carries no currency of its own; MYR-ness is a
sibling row, and the estate makes non-MYR a terminal `CLR21` refusal at every POSTING door — but
`monetary_cents` persists un-normalized and un-refused at extraction time, so a cross-client
`sum(monetary_cents)` could silently mix currencies. Verify_grounds additionally surfaced two sibling
semantic traps on the same surface (extraction-version multiplicity, multi-filing double-count).
**Fold:** design §3.4 gains a named "payload SEMANTICS ≠ payload SCOPE" hazard covering all three;
Annex B3.8 forces the currency differential cell.

**M5-FOLD · `documents.client_id` was DROPPED, not "frozen at ingest" — the citation and its
consequences were both wrong.** *(security lens.)* `0007_document_pipeline.sql:1102-1106` drops the
column entirely; the identity trigger was recut in the same migration. v1's A.1 assignment of arm S-1
to `documents` (scoped by `client_id`) therefore cannot apply as DDL at all (`42703`) — the real
routed fact is "v1's PR-1 cannot apply as documented," not "v1 ships a leak." Two prior instances of
this exact mistake are already on record in this repo (`0055_client_facts_trio.sql:546-548`,
`0091_f_a1_identity_helper.sql:86-88`).
**Fold:** design §2/§3.4, survey Y5/U3, annexes A.1 item 11/C-8/R-4 all retargeted; the proposed
mechanism (re-cut onto the filings join) is unchanged — only the premise and the routed fact changed.

**M7-FOLD · §3.7's law-28 brief tested only hostile SQL, never hostile CONTENT.** *(security lens.)*
v2 is the first design to put verbatim third-party OCR text and JSON envelopes in front of a session
that also, for the first time, holds cross-client naming authority — a content-borne injection vector
against the naming authority itself, untested by any of the six original questions.
**Fold:** design §3.7 gains item 7, naming the vector and pointing at PRD §6 invariant 5 (standing
law) and a named PR-2 obligation to apply it to this tool's results. Annex R-8 tracks it.

**M8-FOLD · Normalisation ran AFTER the cardinality rung — an all-duplicate `p_clients` died on a
bare receipt CHECK instead of the ladder's named refusal.** *(security lens.)* `{A,A}` has raw
cardinality 2 (passes rung 1), normalizes to `{A}`, and trips the receipt's bare `cardinality >= 2`
CHECK — an untyped `23514` with no `CLR*` token, unconverted by Tier C, uncovered by any battery cell.
**Fold:** design §3.1 now normalises (dedupe + sort) FIRST, before any rung evaluates. Annex B1.10
forces the case.

**M9-FOLD · Refusing an archived client from the named door inverted A.2's "strictly narrower than
HOME" claim, and B1.3's fixture named a status value the schema has never had.** *(security lens.)*
"Compare A against archived B" would be refused from the named cross-client door while succeeding,
unnamed, from firm-wide HOME — pushing the user to the WIDER surface to do the NARROWER, named thing.
`clients.status`'s CHECK has only ever admitted `active`/`archived`/`onboarding` — never
`removed`/`inactive`, the values B1.3's fixture named.
**Fold:** design §3.1 rung 2 now carries no status conjunct at all — a named cross-client read admits
a client of any status, matching HOME. Annex B1.3 corrected to a real status value and the (now
positive) expected outcome; A.2's "strictly narrower" claim now holds without exception; Annex C-13
records the decision.

**M11-FOLD · No explicit NULL-array arm — `p_clients := NULL` also slipped past every typed rung.**
*(build lens.)* `cardinality(NULL::uuid[])` is NULL, not `< 2`, so rung 1's IF never fired; per-element
rungs vacuously passed over zero unnested rows. Same failure class and same fix as M8.
**Fold:** covered by the same §3.1 normalise-first correction (NULL normalises to the empty array,
caught by the same rung-1 test). Annex B1.9 forces the NULL case by name.

**M12-FOLD · The "no D1 write-quiesce window" cost accounting omitted that `CLR10`'s retirement is
itself a CoR to an already-merged live body.** *(build lens.)* Retiring `CLR10
cross_client_unavailable` means editing (`CREATE OR REPLACE`) whichever body already carries the
ladder at PR-1 time — `wake_freeform_read` or `_freeform_core`, either way a body v2's own §6 hard
prerequisite guarantees is ALREADY MERGED and actively called. That is a D1-class edit regardless of
whether request B (the core extraction) is taken; the design's "no D1 if request B is taken" framing
undercounted the schedule.
**Fold:** design §6/§7 rewritten — a D1 write-quiesce window is needed for PR-1 on this one item
alone, unconditionally. Annex A.1 item 14 and a new risk R-9 carry the correction.

**M13-FOLD · The ≥100k-region performance acceptance gate named no fixture-generation mechanism —
vacuous-green risk.** *(build lens.)* No bulk/scale seed mechanism exists anywhere in `packages/db/`
for `document_regions`; the ordinary pristine-rig seed inserts zero rows into that table. B3.7 and
F.3 item 8 committed to a measured ≥100k-row number with no named owner, lane or file to produce the
rows.
**Fold:** survey Q-2, Annex B3.7/D/F.1 R-3/F.3 item 8 all now name the mechanism — a
`generate_series`-based bulk-insert helper, owned by PR-1, extending
`packages/db/tests/rig-docs-fixtures.mjs`'s existing single-row `seedRegion`, run as a dedicated
scale-measurement pass separate from the ordinary estate suite.

---

## 3 · Materials — owner-reserved (3)

**M2-RESERVED · Both arms of owner question Q3 are unimplementable as printed — the "both" default
ships all seven `engine_kind`s, and the "`structured_parse` only" fallback has no relation-level
mechanism to enforce it.** *(accounting lens.)* **STAYS OPEN — owner card 2, §5.**

**M6-RESERVED · v2 is the first lane to put raw client document bodies (including identity documents)
in front of the model, and drops TA-P3 A (egress purposes) from its binding list without reopening
the question.** *(security lens.)* **STAYS OPEN — owner card 3, §5.**

**M10-RESERVED · §6 lists only two hard prerequisites, silently assuming F-A2's OQ-A (whether R-1's
`interactive_client`-minting restriction extends to this call path) resolves in v2's favour.**
*(law lens.)* **STAYS OPEN — owner card 4, §5.**

---

## 4 · Nits — confirmed, recorded, NOT folded in this pass

Both are real and cheap; neither is in this fold's work order (indices outside the fold-only list),
so the design text is untouched. Flagged so they do not survive silently to PR-1 authoring.

- **Annex B3.3 names a cross-client pin of ONE element** (`{A}`) for the multi-filing acceptance
  cell — but §3.1 rung 1 refuses any `p_clients` of cardinality < 2 by construction (`M8`/`M11`'s own
  fold sharpens this refusal further). The cell as written is unrunnable; it should read `{A,B}` or
  name the client-pinned twin explicitly.
- **The refile-mechanism citation is one generation stale.** Design §3.4 Decision 1 and survey Y5
  cite `0009:2521-2530` for the retire-then-insert refile path; the live body is
  `0027_filings_lock_order.sql:320-329`. The behavioural claim survives (0027 still retires-then-
  inserts, so `retired_at is null` remains the correct conjunct) — only the citation is stale.

---

## 5 · Owner cards — four, none resolved by this fold

**Card 1 (B0) — Does the freeform cross-client surface admit all seven live `engine_kind`s, or only
some?** The live constraint (`0090_f_a1_walls.sql:236-238`) is a seven-value world:
`ocr`, `structured_parse`, `invoice_facts`, `doc_classify`, `statement_facts`, and the two F-A1
witness-pair kinds `llm_text_facts`/`llm_vision_facts`. S-2e/S-2r as designed carry no `engine_kind`
predicate at all, so all seven are admitted the moment the arms ship — including the witness kinds,
which the estate already treats as a distinct, more sensitive class elsewhere (excluded from the
AB-3 attribution matcher's allowlist; their whole-document envelope excluded from `get_document_extract`'s
character budget). None of the five non-OCR/structured-parse kinds is named anywhere in the v2 design
set. *Recommendation:* admit only `ocr` and `structured_parse` (the two kinds the contract clause and
R-L18's deferral actually contemplate) and add an explicit `engine_kind` predicate to S-2e/S-2r;
route the other five kinds through their own typed doors, unreachable from the free-SQL surface, until
a separate design earns them access. *Fail-closed default if undecided:* the narrower reading —
`ocr`/`structured_parse` only, enforced by an explicit predicate, not the current unconditional
admission.

**Card 2 (M2) — Given Card 1's answer, what actually enforces it?** `engine_kind` is a ROW VALUE on
`document_extractions`/`document_regions`, not a relation — the grant that makes S-2e/S-2r reachable
is relation-level (`SELECT` on the two tables). Neither of the design's own stated Q3 answers is
buildable as printed: "both" ships all seven regardless of intent, and "`structured_parse` only" (the
stated fail-closed default) names an exclusion mechanism (the v1 relation-exclusion list) that cannot
express a row-value filter. *Recommendation:* whatever Card 1 decides, it must land as an explicit
`engine_kind = any(...)` (or equivalent) conjunct inside S-2e/S-2r's own `USING` clause — not as an
entry on the relation-exclusion list, which cannot express it. *Fail-closed default if undecided:* no
`document_extractions`/`document_regions` grant ships until the predicate is designed — i.e., v2's
document-surface widening (R-L18's deferral) stays deferred past this PR-1 rather than shipping
unconditionally-admitted.

**Card 3 (M6) — What is the PDPA/consent purpose basis for putting raw document bodies (including
identity documents) in front of the model?** v2 is the first freeform-read design to admit
`document_extractions.text_content`/`document_regions.text_content` — verbatim OCR of client-supplied
files, potentially including a director's IC or passport page — to the model's context via a bare
`select`. TA-P3 A (egress purposes) is dropped from v2's binding list without comment, and the words
"egress"/"consent"/"purpose-class" appear nowhere in the three v2 files. The contemporaneous
(2026-08-22) TA-P3 apparatus for the SAME underlying content (`wave-f-contract.md:306-311`) requires a
**closed admissible-document list**, **explicitly REFUSES IC and passport**, and gates the whole class
behind the **C6 prerequisite** (DPA/disclosure/PDPA cross-border basis) — none of which is
cross-referenced here. *Recommendation:* reopen v1's OQ-D (was this an "existing class widened," and
does that reading still hold for document bodies specifically) as a new v2 owner question; at minimum,
add TA-P3 A back to the binding list and require the same closed-list/IC-passport-refusal discipline
TA-P3 A already imposes elsewhere on this content. *Fail-closed default if undecided:* document bodies
stay excluded from the freeform surface (i.e., Card 1/Card 2's admission decision defaults to
excluding this content entirely, not merely narrowing `engine_kind`) until the purpose basis is
settled.

**Card 4 (M10) — Does F-A2's R-1 (`interactive_client` minted for `wake_open_question` ALONE) extend
to this lane's call path?** v2's entire client-pinned cross-client mechanism (the pin-inclusion rung,
`_freeform_scope_clients()`'s client branch, decision C-3, and four battery cells) rests on the
premise that an `interactive_client` credential can be minted for a general freeform-read session.
F-A2's own live design text still restricts the mint to `wake_open_question` alone (R-1); whether that
enumeration is closed to additions is explicitly OQ-A, already on the OWNER's list from the
F-A6 v1 gate record (`freeform-read-gate-record.md` §6 item 4) — but v2's own §6 hard-prerequisites
list names only the DB-level CHECK/mint-gate work (Y1/U2), not this separate, call-site-level
restriction. If OQ-A is declined, F-A6 v1's own stated fail-closed default is "HOME-only, no client
pin" — which would leave v2's entire client-pinned apparatus (§3.1 rung 4, §3.3, C-3, battery cells
B1.5/B1.6/B2.2/B2.3, F.3 acceptance items 1-2) referencing a credential state that never arises in
production. *Recommendation:* the lead resolves OQ-A (already pending from the v1 gate) before v2's
PR-1 is authored, not merely before it is scheduled. *Fail-closed default if undecided:* v2's
client-pinned pin-inclusion apparatus does not ship in PR-1; the sibling verb ships HOME-only-callable
until OQ-A resolves.

**Owner ruling 2026-08-23 (the sitting) — Cards 1-4 (B0, M2, M6, M10/OQ-A) are ALL RULED.** Each
card's text above stands as written; these are the dispositions.

- **Card 1 (B0) + Card 2 (M2) → RULED TOGETHER: ALL SEVEN live `engine_kind` values are admitted**
  to the v2 read surface — `ocr`, `structured_parse`, `invoice_facts`, `doc_classify`,
  `statement_facts`, `llm_text_facts`, `llm_vision_facts` — wider than Card 1's own narrower
  recommendation. **Every row carries its `engine_kind` as a visible provenance label**, so a
  reader always sees which engine produced what is on screen. **The hostile-content adversarial
  pass (law 28) stays a MANDATORY PR-2 gate** — admitting the full set does not relax it; if
  anything it widens the pass's own surface. Card 2's enforcement answer is adopted as written:
  **the row-level predicate admits the full closed set as an explicit `engine_kind = any(...)`
  conjunct inside S-2e/S-2r's own `USING` clause** (never the relation-exclusion list, which
  cannot express a row-value filter) — **extend-only with the CHECK**, so a future eighth kind
  needs its own ruling before it is reachable. **PR-1's document-surface widening unblocks.**
- **Card 3 (M6) → RULED: v2 re-binds to a named typed egress purpose, mechanically checked at
  dispatch** — v1's apparatus (the closed-purpose-world CHECK plus the dispatch-time bind),
  reused with zero new invention, discharges the missing-purpose-basis gap Card 3 found. **Identity
  documents are NOT excluded — owner-ruled**, contrary to TA-P3 A's closed-list/IC-passport-
  refusal discipline elsewhere on this content class. **The conductor's dissent is on file**:
  recommended IC/passport exclusion, matching TA-P3 A's treatment of the same underlying content;
  declined by the owner as operational friction; revisit path = a future ticket. **PR-1's
  document-body admission unblocks** on the named-purpose bind landing.
- **Card 4 (M10/OQ-A) → RULED-BY-LEAD: already ruled by the conductor under the owner's standing
  delegation (mechanism/sequencing only; no law touched) — not a new decision at this sitting,
  formalized here.** **R-1 EXTENDS**: `interactive_client` may be minted beyond
  `wake_open_question` alone; **the receipt-bound arm state is the wall** that keeps the widening
  safe (every mint stays tied to a receipted act, never a bare session). v2's client-pinned
  pin-inclusion apparatus (§3.1 rung 4, §3.3, C-3, battery cells B1.5/B1.6/B2.2/B2.3, F.3
  acceptance items 1-2) **ships as designed** — the HOME-only fail-closed default does not apply.
  **PR-1's client-pinned mechanism unblocks.**

---

## 6 · Refuted register — a recorded gap, not a list

Four findings were REFUTED by the gate's adversarial verification pass. **This fold lane's working
set (the raw gate-run JSON handed to it) carries only the count (`refuted_count: 4`), not the
individual claims, citations or refutation grounds.** Per review law 2 (absence is not evidence),
this record does not reconstruct or guess at what they were — doing so would fabricate evidence this
lane never saw. **If the four refutations are needed for the permanent record, pull them from the
original gate-run agent's output** (the same run that produced the 14 confirmed findings and the 2
nits folded/recorded above); this gap should be closed there, not papered over here.

---

## 7 · What this fold did NOT touch

- **The two hard prerequisites** (`F-A2 PR-1 merged`, `F-A6 v1 PR-1..PR-4 merged`, design §6) — kept
  verbatim.
- **R-L18's XLSX/DOCX deferral** (`wave-f-contract.md:263-265`) — kept verbatim; Card 1/Card 2 above
  bear on WHICH `engine_kind`s ship inside that deferral, not on whether it stands.
- **Annex E's five existing owner questions (Q1-Q5)** — untouched; the four cards in §5 above are
  recorded in THIS gate record, not folded into Annex E, precisely because they are owner-reserved and
  this fold does not resolve them.
- **The two confirmed nits (§4)** — recorded, not folded; outside this pass's fold-only work order.
