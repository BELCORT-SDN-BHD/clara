# Wave A — the daily loop: design contract

*Status: **v1.0 DRAFT (pre-review)** · 2026-07-21 · owner-grilled and ratified (WA-R1..R12,
playback confirmed). Companion: `wave-a-migration-0011-design.md`. Review evidence will land in
`docs/plan/research/wave-a/`. This document becomes the contract of record when the design PR
merges; as-built amendments will follow the Slice-5/6 pattern.*

Wave A per `REBUILD-PLAN.md`: coding with intrinsic side-effects (composites + counterparty
aliases), the review queue (List model), `doc_review` side-by-side evidence, confidence-ladder
lanes (DB-gated), the auto-draft sweep with human acknowledgement floors, KB Layer-2, diffs.

---

## §0 Owner rulings (2026-07-21, grilled + playback-ratified)

| # | Ruling |
|---|---|
| WA-R1 | **AP-only.** No `code_and_open_ar` this wave (defers to the sales-invoice wave, post-AB-3). Wave A deepens the AP floor: counterparty aliases + rename/merge governance. Open-item subledger (due dates/allocation/aging) stays Wave C per S6-D2. |
| WA-R2 | **Full multi-client product.** The owner declares the consent/C6 material handled, confirmed and VALID (2026-07-21) — this **supersedes** the S6-R1 RPR-only operating constraint. Wave A ships the per-client consent/egress registry as a product surface and designs the loop for many clients. |
| WA-R3 | **Three-lane ladder, DB-gated, qualitative labels.** READY → swept; NEEDS REVIEW → human-initiated (or one-click draft); NEEDS YOU → open-question/clarify. Signed KB rules widen READY. No percentage ever reaches a user (S6-R5 stands). |
| WA-R4 | **Event-driven sweep** — a new independent spine consumer drafts READY bills minutes after facts complete; catch-up pass; hard token-budget reserve so the sweep can never fail-close interactive work. |
| WA-R5 | **Passive + receipt acknowledgement floor.** Swept drafts land in the queue badged AUTO; opening the sweep batch view records an audited bookkeeper+ "seen" against the sweep-run receipt. Drafts never expire; they age visibly. |
| WA-R6 | **One cross-client firm queue.** Sections by lane; grouped client→vendor; membership = open drafts + uncoded active filings + open questions + coding tasks; subsumes the notification-inbox role (AB-5); `doc_review` is the split-view detail pane. |
| WA-R7 | **Routine-only batch approve** (bounded reopen of the S6 §11 deferral): summary card with per-row legs + opt-out; confirm fires N individual audited approvals (own revision token + op_key each). High-stakes rows excluded — always per-item. |
| WA-R8 | **doc_review degrades honestly:** a field with no captured region renders "no captured region — verify against the document"; approval stays allowed; no silent unhighlighted claims. Per-leg cites jump to their specific (backup) page. |
| WA-R9 | **Dual-source, sticky rules.** Auto-proposed after 3 congruent approvals + directly authored; human-signed before live; human pins never silently decay (a contradiction surfaces as a conflict question); the old build's dead "candidate tier" is DELETED, not restored. |
| WA-R10 | **Scoped open questions.** Each carries scope ∈ {document, vendor, client}; in-scope bills demote out of READY and their drafts refuse approval until resolved; inline resolve-at-review. |
| WA-R11 | **Document-baseline diffs, DB-computed.** doc↔entry diff generalizes the amount-exception surface to every corroborated field; every delta is a DB-owned figure. Legs diff walks persisted revision history. Renders in drawer history, receipts, edit-sheet preview, and the doc_review pane. |
| WA-R12 | **Gross-to-expense stands for SST-bearing supplier bills** — already the PRD-compliant input-SST treatment (invariant 12). Output-tax side stays Wave F. |

**Supersessions this ruling set makes, stated explicitly:** WA-R2 supersedes the S6-R1
RPR-only constraint (the C6 gate is declared satisfied by the owner); WA-R7 boundedly reopens
the §11 batch-approve deferral; WA-R9 closes the salvage-manifest candidate-tier open decision
as *delete*. Everything else extends standing law without change. `CLAUDE.md` "Where we are"
and the memory state file are updated by this PR to match.

## §1 Scope

**IN:** AB-3 `engine_kind` pin (first item, migration 0011 head); `counterparty_aliases` +
governed rename/merge; the per-client egress registry; the DB-gated lane function; the
auto-draft sweep (consumer + `autoDraft_v1` frozen workflow + receipts + ack); the firm review
queue + routine-only batch approve; `doc_review` (region-overlay split view); KB Layer-2
(`coding_rules` + `open_questions`); the two diff read fns; facts-capture lossiness fix
(`captured_invoice_id`); ClaraPart union unification + the new card set; error-map extensions
(§10).

**OUT (unchanged deferrals):** AR composite + sales invoices + MyInvois parsing (AB-3 remains
the hard pre-gate); open-item AP subledger (Wave C); standing rules / any bounded auto-POSTING
(a later automation slice; nothing in Wave A posts without a human); SST engine (Wave F);
bank/payment flows (Wave C); multi-currency (named deferral); the proactive wake inbox beyond
the queue (Wave G).

## §2 The confidence ladder (DB-gated lanes)

**WA-L1 (lane authority).** The lane is computed by a DB read function, `clara.coding_lane`
(per active filing; definition in companion §3) — never model-asserted, never UI-derived.
Runtime and dashboard render the lane; nothing outside the DB decides it. This kills the
A-5/Ggr-13 model-asserted-gate class the Gate-1 audit recorded.

**Lane predicates** (evaluated against existing DB-computed signals only):

- **READY** (sweep-eligible), ALL of: the filing is active with no open draft and no
  unreversed approved entry (`list_uncoded_filings` semantics); `_resolve_counterparty` on the
  extracted vendor facts resolves to an EXISTING counterparty with a non-ambiguous outcome (no
  birth needed — kills the mass-CLR23 class the Gate-3 eval hit on 11/17 bills); Tier-A
  machine corroboration holds (`_invoice_fact_state` verified: InvoiceTotal, ≥0.95, non-empty
  polygon, MYR, single top-level doc, no conflicts); no persisted amount exception; no
  near-duplicate hit; not high-stakes (`is_high_stakes` false on the would-be entry); no
  unresolved open question in scope (§6); the client's egress consent is valid (§8).
  A live signed `coding_rules` row for (client, counterparty) additionally *badges* the lane
  RULE-backed; a rule is not required for READY in v1 (WA-R3) — it widens READY over time by
  substituting for the near-dup/prior-history caution once signed.
- **NEEDS REVIEW**: a lawful draft exists or could be made, but ≥1 READY condition fails
  (new vendor, Tier-B model-read amount, high-stakes, near-duplicate, amount exception,
  rule conflict). Not swept. Coded via chat or the queue's one-click "draft it" (which runs
  the same `autoDraft_v1` path for exactly one filing, human-initiated).
- **NEEDS YOU**: no lawful draft is possible — ambiguity (counterparty conflict/ambiguity
  refusals, non-MYR, multi-doc bundle needing human splitting) or an open question blocks the
  scope. Surfaces as a clarify/open-question row; nothing drafts.

**WA-L2 (qualitative surface).** User-facing lane names are exactly READY / NEEDS REVIEW /
NEEDS YOU rendered as shaped bands (colour+shape+label, never hue-only, never a digit in the
DOM). Internal thresholds (the 0.95 canon) never render. The old handbook's 0.97 constant is
dead: **0.95 is the single canon**, and it gates corroboration internally only.

**WA-L3 (signal hygiene).** Facts-lane completeness is NOT a lane input until the
`captured_invoice_id` lossiness (null on 14/17 eval bills) is fixed and re-measured; the
companion carries the fix. Near-duplicate detection remains the invoker-inline computation
(0009) — no new definer leak path.

## §3 The auto-draft sweep

**WA-L4 (drafts only — restated).** The sweep produces DRAFTS through the existing
`wake_draft_entry` draft ceiling. No approve variant exists or is added; S6-R6 and the
structural 42501 agent-approve refusal are untouched. An acknowledgement is not an approval.

**Architecture (delegated decisions, owner-informed):**

1. **Trigger.** A new independent spine consumer `autodraft` (matcher-pattern: own consumer
   name, own `(consumer, firm)` checkpoint in `relay_checkpoints`, own dead-letter lane,
   WARN-only `/ready` health) subscribes to `document.invoice_facts_completed` and
   `document.invoice_facts_failed` (facts completion is what makes Tier-A determinable; a
   failed pass settles the filing into NEEDS REVIEW). All other event types are
   checkpoint-only advances. No taxonomy repoint is required — the taxonomy governs router
   wakes; an independent consumer subscribes directly (the matcher precedent). A catch-up
   sweep (reconciler-style, interval-driven) re-evaluates `list_uncoded_filings` for
   stragglers (e.g. filings whose facts completed before the consumer existed).
2. **Execution lane.** The consumer NEVER runs a model in-loop (the matcher's structural
   no-model contract). For each READY filing it projects a wake-bound intent → a held
   `agent_tasks` row (drain-pattern) of a NEW task kind `autodraft` → the runtime runs a new
   frozen workflow **`autoDraft_v1`** (registry addition via `pnpm freeze:update`; Appendix-A
   versioning binds it) which perceives via the existing read tools and calls the
   `draft_journal_entry` write path (`wake_draft_entry`, `p_coding`,
   `coding_kind='supplier_bill'`) — one task per bill, own session, never a shared chat
   session (AB-21). `_draft_entry_core`'s coding-eligibility branch widens to accept task
   kind `autodraft` alongside `chat_turn` (companion §4).
3. **Idempotency.** Deterministic op_key `autodraft:<filing_id>` per attempt-scope; the
   one-open-draft-per-filing partial unique and the double-coded refusal are treated as
   idempotent no-ops by the workflow (success-shaped settle, no dead-letter). A redelivered
   spine event yields zero new drafts. Attempt cap: a filing that fails drafting twice parks
   to NEEDS REVIEW with the refusal recorded — the sweep never hot-loops a poison bill.
4. **Ordering.** READY excludes vendor-birth cases by construction (WA-R3), so
   NEW-3/CLR23 mass refusal cannot arise from the sweep. Within a firm the consumer processes
   events in per-firm seq order (spine order); no cross-draft parallelism races one filing.
5. **Token budget (WA-L5).** The sweep runs under a per-firm reserve: before each draft the
   workflow checks metered daily spend and refuses to start once sweep spend would take total
   firm spend past a configured share of `clara.firm_limits` (default 60%; operator-tunable
   column, companion §5). Interactive work always retains headroom; a fail-closed firm is
   never the sweep's doing. Un-swept READY bills simply wait (catch-up resumes next window).
6. **Receipts + ack (WA-R5).** Each consumer cycle that drafts ≥1 bill writes a
   `sweep_runs` receipt row (firm, window, drafted/skipped/refused counts, token spend,
   per-filing outcomes as rows). The queue leads with "N auto-drafted since you last looked";
   opening the batch view records an audited `sweep_run_acks` row (bookkeeper+ enforced by
   role floor — the old build's self-satisfiable ack is explicitly killed: the acknowledging
   actor can never be an agent identity and a role floor is enforced in the writer).

**WA-L6 (honest volume).** The queue always shows the split N auto-drafted · N need review ·
N need you (DB counts, never model-asserted); a dead sweep never shows a live progress
surface (consumer health is WARN-only in `/ready` + a staleness badge on the queue).

## §4 The review queue + batch approve

**Read model.** One new DB read fn `clara.list_review_queue` (companion §6) unions, firm-wide
across the caller's authorized clients: open drafts (with lane, AUTO badge, age, high-stakes
flag, amount exception, near-dup), uncoded active filings (with lane), open questions, and
open coding tasks. Grouped client→vendor; Sections by lane; stable keyset pagination;
row payloads carry typed identifiers only (hydration law). RLS + live membership scope it;
a demoted member loses the queue instantly (stale-JWT trap).

**Presentation (DIRECTION List model, binding):** always-on fuzzy filter; scope dropdown;
URL-as-truth for tab/filter/band/scope; virtualization; render-immediately (skeleton +
streamed rows); the five screen states; split-view row↔`doc_review` detail pane; trust
accessories right-aligned (AUTO/RULE badge, lane band, amount, period, evidence dot);
confidence never numeric. The queue page subsumes the AB-5 inbox role: recode notifications
and sweep receipts are queue rows, not a second surface.

**Batch approve (WA-R7).** Selection admits routine (non-high-stakes) drafts only —
high-stakes rows are structurally excluded from the selection model AND re-refused at the DB
(approve_entry's existing per-item gates run unchanged). The summary card shows per-row legs,
vendor, amount, evidence dot, with per-row opt-out; confirm fires N individual
`approve_entry` calls, each with its own expected-revision token and fresh op_key, streamed
with per-row outcomes (partial failure renders honestly per row — one CLR23/CLR25 refusal
never poisons the batch). A batch act writes no new authority: it is UI orchestration of N
audited approvals. Live authority + maker/checker + attestation semantics are those of
`approve_entry`, untouched.

## §5 doc_review (the split-view evidence surface)

The queue's detail pane renders the actual document (PDF/image via the private-bucket signed
read path — the HUMAN sees bytes; the agent perception boundary of S6-R11 is unchanged)
beside the entry: per-leg evidence chips resolve to region polygons overlaid on the page
image, page-jumping to backup pages (the INF lesson — coding truth is frequently NOT on page
1). Region data comes from `get_document_extract` (locator {page, polygon}); the machine
total region via the existing `getMachineTotal` path. A derivation panel (multi-leg splits)
renders the DB-computed doc↔entry diff (§7) — the UI never sums anything.

**WA-L7 (honest degradation, WA-R8).** A claimed field with no captured region renders the
explicit marker "no captured region — verify against the document"; approval remains allowed
(the reviewer has the document itself). No unhighlighted claim ever renders as if cited.
Document text is inert data everywhere (injection law); overlays quote, never instruct.

## §6 KB Layer-2 (typed rules + open questions)

**The two-layer law stands:** the wiki (Layer 1, later waves) informs; the typed layer
decides — and Wave A's typed layer is `coding_rules` + `open_questions`. A rule may ELEVATE a
bill's lane (widen READY); no rule, page, or question ever lowers an approval gate, selects
an account into a posted entry without a human approval, or authorizes a write.

**`coding_rules` (companion §7).** Client-scoped, typed `vendor→account` in v1 (the only rule
type Wave A ships; the schema carries `rule_type` for later widening). Provenance-complete:
`origin` ∈ {proposed, authored}; proposing evidence = the ≥3 congruent approved
(vendor→account) sightings, each a provenance-carrying reference (entry id + document id) —
per-sighting rows with DB idempotency, never an unattributable tally (the A-9 kill). Lifecycle
`proposed → live | declined`, `live → retired`; **going live requires a human signature**
(bookkeeper+, audited actor + time). `pinned` (human-authored or explicitly pinned) rules
never auto-retire: a contradicting approval opens a vendor-scoped conflict `open_question`
instead (WA-R9). Draft-time rule application snapshots the rule id + content hash into the
draft's coding metadata (immutable fired-state, the C-14 kill) and cites it on the card ("per
your rule …" why-surface, never sr-only).

**`open_questions` (companion §8).** Durable must-ask objects: `scope_kind` ∈ {document,
vendor, client} + scope id; `origin` (clarify-park promotion, rule proposal, rule conflict,
sweep refusal, manual); `status open → resolved | dismissed`; resolver identity (bookkeeper+)
+ resolution text; optional `spawned_rule_id`. Blocking semantics (WA-R10): an open question
in scope (a) demotes affected filings out of READY (lane fn reads it) and (b) blocks
`approve_entry` for affected drafts with a new typed refusal (CLR26, §10) until resolved —
with inline resolve-at-review so the reviewer who knows the answer resolves + approves in one
sitting. Client-work-start surfacing + session recap list them; the queue's NEEDS YOU section
is their home. The existing clarify/interruption plumbing stays the transport for in-turn
asks; a clarify that parks a turn may PROMOTE to an open question object so the ask survives
the turn (one-way promotion, audited).

## §7 Diffs (read-only, DB-computed)

Two read fns (companion §9), both DB-owned figures end-to-end (renderers format only):

- **`get_entry_diff`** — legs before/after across the persisted revision history
  (agent-original → each revise → current), with actor + timestamp + reason per step.
  Renders in drawer history, on activity receipts, and as the edit-sheet preview before save.
- **`get_doc_entry_diff`** — the doc↔entry comparison: per corroborated field (total in v1;
  the schema admits later fields), the document-side value + region cite vs the entry-side
  value, with the delta computed in SQL. This generalizes the amount-exception panel; the
  existing amount-exception flow (persisted flag → CLR21 → governed override) is UNCHANGED —
  the diff is its read surface, not a second gate. Divergences render with the §9 framing:
  document-vs-GL divergence is evidence FOR document-grounded coding, labeled as such.

## §8 The per-client egress registry (WA-R2)

`client_egress_consents` (companion §10): per-client consent rows (scope of processing,
evidence reference — the signed consent/engagement clause document id, granted_by/at,
revoked_by/at). The document-egress claim gate moves from the firm-wide flag to a per-client
lookup: egress for a client's documents requires a live consent row. The firm-wide
`CLARA_DOC_EGRESS_APPROVED` secret remains as a global KILL-SWITCH override only (=0 halts
everything regardless of rows; =1 no longer grants anything by itself — rows do). Owner act
at deploy: record the existing consented clients (RPR + any newly confirmed) as rows citing
their consent evidence. Consent revocation demotes every affected filing out of READY
immediately (lane fn reads the registry) and holds new egress; already-persisted extractions
remain (they are the firm's working papers), matching the retention/legal-hold laws.

## §9 Cards + dashboard integration

New ClaraPart types, all behind the existing parity + reachability CI gate, all
identifier-only wire payloads with `get_*` hydration on mount and after every action
(the JeReviewCard hydration law is the reference): `doc_review` (the split-view pane's
part form), `diff` (legs + doc↔entry render), `sweep_receipt`, `kb_rule_proposal`
(sign/decline actions on the human lane), `open_question` (resolve/dismiss), and the
batch-approve summary (a dashboard surface, not a chat part, sharing the same hydration
discipline). **Enabling refactor first:** the runtime/dashboard ClaraPart union unification
(the §11 deferral) lands before the new types so each type is declared once — the three-place
manual wire does not survive six new parts. Terminal states render inert; refusals render
verbatim typed copy; no raw HTML; safe-integer cents; every action carries a fresh op_key on
the human PostgREST lane.

## §10 Error-map extensions (enumerated at design time — the S5 lesson)

- **CLR26 — open-question block:** approve/draft refused because an unresolved open question
  covers the scope. DETAIL carries the question id + scope kind.
- **CLR27 — rule law:** rule lifecycle refusals (signing without role floor; retiring a
  pinned rule without the conflict path; malformed rule content; duplicate live rule for the
  same (client, vendor) key).
- **CLR28 — consent/egress law:** an operation requiring egress for a client without a live
  consent row (or under the global kill-switch).
- **CLR29 — sweep law:** autodraft admission refusals (budget reserve exhausted, attempt cap
  reached, lane no longer READY at execution). Runtime-visible; never user-blocking (the
  bill just stays in its lane).
- Batch approve introduces NO new code: per-row outcomes are the existing per-item results.
- Alias operations refuse under the existing CLR23 family (alias conflict = counterparty
  law). All four SQL-null variants of every new required input refuse identically (AB-7).

## §11 Invariants preserved + verification plan

**Unchanged and load-bearing:** the four structural invariants; no auto-approve ever
(S6-R6); qualitative uncertainty (S6-R5); registration-dominant matching + fingerprint
congruence (NEW-3) — aliases feed the name lane as CANDIDATES and never merge across
differing registrations; document truth (§9 adjudication); books-version freshness on every
write; op_key idempotency on every writer; workflow immutability (`autoDraft_v1` is a new
frozen export; `chatTurn_v3` untouched); the C-1 signature-change law on every recreated
function; reverse-not-delete; money as bigint cents; the agent→UI channel read-only.

**Verification (build-stage gates, contract-blind rig lane as usual):**

1. Lane-function battery: every predicate flips the lane exactly as specified; forced cases
   for each READY condition failing singly; open-question scope demotion (all three scopes);
   consent revocation demotion; rule elevation badge.
2. Sweep battery: event-driven draft on facts completion; redelivery yields zero new drafts
   (deterministic op_key proof); double-coded/one-open-draft treated as no-op; poison-bill
   attempt cap parks; budget reserve refusal at the boundary; receipts + ack role floor
   (an agent identity acknowledging must FAIL); catch-up pass drains stragglers; kill
   mid-sweep resumes exactly-once (the Gate-3 kill-demo repeated through `autoDraft_v1`).
3. Forced-schedule races (pg_blocking_pids-proofed, per the house method): sweep draft vs
   concurrent chat draft on one filing (one wins, one no-ops); facts completion rotating
   tokens vs batch approve (CLR25 per row); alias merge vs open draft (fingerprint law
   holds); rule signing vs in-flight draft (snapshot isolation of fired rule state).
4. Batch approve: N approvals = N receipts/tokens/op_keys; partial failure renders per-row;
   high-stakes exclusion enforced in BOTH the selection model and the DB.
5. Queue read: RLS + live-revocation; keyset stability under concurrent writes; counts are
   DB counts.
6. Eval seed: re-run the 17-bill replay THROUGH the sweep path — expected: the READY subset
   drafts unattended byte-equivalently to the chat path (same legs, same evidence), the rest
   lands in the correct lanes; PLUS new negative fixtures the Gate-3 corpus lacked (a forged
   amount exception, a duplicate bill, a non-MYR bill, a vendor conflict, an open-question
   block) — the eval must exercise refusal paths this time, not only the happy path.
7. The second-run lens (DR-drill lesson) applied to every new operational piece: consumer
   restart, re-bootstrap, re-run of every ceremony/script — each executed twice in CI or the
   rig, not reasoned about.

## §12 Out-of-scope confirmations

No AR writers, no MyInvois parsing (AB-3 pin ships FIRST regardless), no auto-posting of any
kind, no bank/settlement flows, no SST engine work, no multi-currency, no FA register, no
per-part-type field schemas beyond the new cards' needs (the fail-closed catalog carries
them), no wiki Layer-1 build (Wave B). The S4-V2 canary (`daba7f2e`, due 2026-08-02) remains
armed and untouched by everything in this wave.
