# Wave A — the daily loop: design contract

*Status: **v1.1 (dual-review fold, owner-ratified)** · 2026-07-21. v1.0 was reviewed by the
dual design ladder — native lane FLAWED (13 findings) + Codex xhigh FLAWED (24 findings) —
and a 10-probe empirical battery on a fresh throwaway (10/10 claims SUPPORTED). ALL findings
are folded here; the owner ratified deltas WA-D1..D5. Evidence:
`docs/plan/research/wave-a/`. Companion: `wave-a-migration-0011-design.md` v1.1. This is the
contract of record; as-built amendments will follow the Slice-5/6 pattern.*

Wave A per `REBUILD-PLAN.md`: coding with intrinsic side-effects (composites + counterparty
aliases), the review queue (List model), `doc_review` side-by-side evidence, confidence-ladder
lanes (DB-gated), the auto-draft sweep with human acknowledgement floors, KB Layer-2, diffs.

---

## §0 Owner rulings

### §0.1 Grill rulings (2026-07-21, playback-ratified)

| # | Ruling |
|---|---|
| WA-R1 | **AP-only.** No `code_and_open_ar` this wave (defers to the sales-invoice wave, post-AB-3). Wave A deepens the AP floor: counterparty aliases + rename/merge governance. Open-item subledger (due dates/allocation/aging) stays Wave C per S6-D2. |
| WA-R2 | **Full multi-client product.** The owner declares the consent/C6 material handled, confirmed and VALID (2026-07-21) — supersedes the S6-R1 RPR-only operating constraint. Wave A ships the per-client consent/egress registry as a product surface. |
| WA-R3 | **Three-lane ladder, DB-gated, qualitative labels.** READY → swept; NEEDS REVIEW → human-initiated (or one-click draft); NEEDS YOU → open-question/clarify. Signed KB rules widen READY (as narrowed by WA-D4). No percentage ever reaches a user (S6-R5 stands). |
| WA-R4 | **Event-driven sweep** — a new independent spine consumer admits READY bills minutes after facts complete; catch-up pass; hard token-budget reserve (WA-D2) so the sweep can never fail-close interactive work. |
| WA-R5 | **Passive + receipt acknowledgement floor.** Swept drafts land in the queue badged AUTO; opening the batch view records an audited bookkeeper+ "seen" against the FINALIZED sweep-run receipt. Drafts never expire; they age visibly. |
| WA-R6 | **One cross-client firm queue.** Sections by lane; grouped client→vendor; membership = open drafts + uncoded active filings + open questions + coding tasks; subsumes the notification-inbox role (AB-5); `doc_review` is the split-view detail pane. |
| WA-R7 | **Routine-only batch approve** (bounded reopen of the S6 §11 deferral): summary card with per-row legs + opt-out; confirm fires N individual audited approvals. High-stakes rows excluded — enforced in the DB (WA-D5), not only the UI. |
| WA-R8 | **doc_review degrades honestly:** a field with no captured region shows "no captured region — verify against the document"; approval stays allowed; no silent unhighlighted claims. Per-leg cites jump to their specific (backup) page. |
| WA-R9 | **Dual-source, sticky rules.** Auto-proposed after 3 congruent approvals + directly authored; human-signed before live; human pins never silently decay (conflicts surface as questions); the dead candidate tier is DELETED. |
| WA-R10 | **Scoped open questions.** Scope ∈ {document, vendor, client}; in-scope bills demote out of READY and their drafts refuse approval until resolved; inline resolve-at-review. |
| WA-R11 | **Document-baseline diffs, DB-computed.** doc↔entry diff generalizes the amount-exception surface; every delta is a DB-owned figure. Legs diff walks persisted revision history (which 0011 must CREATE — WA-D-fold, §7). |
| WA-R12 | **Gross-to-expense stands for SST-bearing supplier bills** (the PRD-compliant input-SST treatment). Output-tax side stays Wave F. |

### §0.2 Review deltas (2026-07-21, dual-review fold, owner-ratified)

| # | Delta |
|---|---|
| WA-D1 | **Egress lane-carve.** Per-client consent CANNOT gate OCR — a document has no client until a human files it (probe P2: `clara.documents` carries no client column; the only path is `document_filings`, absent pre-filing). OCR is gated by the firm-level baseline (the global kill-switch); per-client consent gates the **invoice_facts** lane; a shared document requires EVERY active filing's client to hold live consent; consent + kill-switch are re-verified immediately before EVERY external call, including running/replayed paths — a revocation can never be outrun by a replay. The consent check is **definer-internal** to the claim function; the runtime passes only the kill-switch boolean. |
| WA-D2 | **The sweep runs the coding model.** `autoDraft_v1` invokes the coding model per admitted READY bill (drafts only) under a NEW **reserve-first** token admission (probe P10: the existing admission is chat_turn-only and read-then-act — no sweep budget primitive exists today): reserve worst-case before drafting, settle/refund after, concurrent-sweep cap. |
| WA-D3 | **Merge = identity-equivalence.** Posted lines are NEVER rewritten (probe/immutability law): merge sets an immutable `counterparties.merged_into` pointer + retires the merged row; resolvers and read surfaces canonicalize through it; signed rules are retired-and-reissued, never edited; sightings history is never rewritten (threshold computation canonicalizes). The v1.0 registration-conflict override is DELETED: two vendors with differing non-null registrations can never be merged. |
| WA-D4 | **Rule scope narrowed.** A signed rule resolves ACCOUNT-CHOICE uncertainty only. It never waives the duplicate-bill, amount-exception, currency, consent, high-stakes, attribution, or open-question predicates. |
| WA-D5 | **High-stakes agent-draft attestation.** Approving a high-stakes agent-made draft (`last_human_editor IS NULL` — probe P6 proved the existing gate skips entirely) requires the approver's recorded attestation. Batch approve calls a dedicated `approve_routine_entry` entry point that structurally refuses `is_high_stakes` rows — WA-R7's exclusion is DB-enforced defense-in-depth. |

**Supersessions:** WA-R2 supersedes S6-R1's RPR-only constraint; WA-R7 boundedly reopens the
§11 batch-approve deferral; WA-R9 closes the candidate-tier question as *delete*; WA-D5
extends the CLR05 attestation law to human-editorless high-stakes drafts. `CLAUDE.md` and the
memory state file are updated by this PR.

## §1 Scope

**IN:** AB-3 `engine_kind` pin (migration 0011 head); `counterparty_aliases` + alias writers +
identity-equivalence merge; the per-client egress registry with the WA-D1 lane-carve; the
DB-gated lane function; the auto-draft sweep (consumer + admission protocol + `autoDraft_v1`
frozen workflow + reserve-first budget + run receipts); the firm review queue +
`approve_routine_entry` batch; `doc_review`; KB Layer-2 (`coding_rules` + transactional
sightings + `open_questions` with the serialized CLR26 gate); the revision-snapshot table +
two diff read fns; the WA-D5 attestation extension; facts-capture fix
(`captured_invoice_id`); ClaraPart union unification + the new card set; error-map extensions
(§10).

**OUT (unchanged deferrals):** AR composite + sales invoices + MyInvois parsing; open-item AP
subledger (Wave C); standing rules / bounded auto-POSTING; SST engine (Wave F); bank flows
(Wave C); multi-currency; the proactive wake inbox beyond the queue (Wave G).

## §2 The confidence ladder (DB-gated lanes)

**WA-L1 (lane authority).** The lane is computed by `clara.coding_lane` — a **firm-scoped
SECURITY DEFINER** read (probes P1/P8: an INVOKER fn cannot call the ungranted helpers nor
read fn-fronted tables; DEFINER with explicit scoping is the only lawful shape). It carries
the CLR03-on-null-`wake_firm` guard on the agent lane, is **client-pinned** on the agent lane
(the wake credential's client — the C-11 floor; a cross-client probe returns the single
not-found shape), jwt_firm-scoped on the human lane, and is oracle-safe. Never
model-asserted, never UI-derived.

**Lane predicates** (DB-computed signals only):

- **READY** (sweep-admissible), ALL of: active filing, no open draft, no unreversed approved
  entry; `_resolve_counterparty` (via the DEFINER lane fn's internal call) resolves to an
  EXISTING counterparty non-ambiguously (no birth — kills the mass-CLR23 class);
  Tier-A corroboration holds; no amount exception; no near-duplicate; not high-stakes; MYR;
  no unresolved open question in scope (§6); live client consent (§8). A live signed rule
  for (client, counterparty) badges RULE-backed and satisfies ONLY the account-choice
  dimension (WA-D4) — every other predicate still binds.
- **NEEDS REVIEW**: lawful to draft but ≥1 READY condition fails. Not swept; coded via chat
  or the queue's one-click "draft it" (the same admission path, origin `one_click`).
- **NEEDS YOU**: no lawful draft — ambiguity, non-MYR, multi-doc bundle, or an in-scope open
  question. Surfaces as a clarify/open-question row.

**WA-L2 (qualitative surface).** Labels are READY / NEEDS REVIEW / NEEDS YOU as shaped bands
(colour+shape+label; never a digit in the DOM). 0.95 is the single internal canon (the old
0.97 handbook constant is dead).

**WA-L3 (signal hygiene).** Facts-lane completeness is not a lane input until the
`captured_invoice_id` fix is measured ≥16/17 on the eval corpus. Near-duplicate detection
stays the 0009 inline computation.

**WA-L8 (lane read is advisory; the writer is the gate).** The lane fn takes no locks; the
recheck at admission is best-effort. Correctness lives in the audited writers: the filing row
lock + `uq_journal_entries_one_open_draft_filing` + the `double_coded` no-op (probe P9 proved
both orders serialize deadlock-free on the filing lock), the CLR26 serialized question gate
(§6), and the approve-time predicates. `autoDraft_v1` maps BOTH `double_coded` reasons to a
success-shaped settle.

## §3 The auto-draft sweep

**WA-L4 (drafts only).** The sweep produces DRAFTS through the existing `wake_draft_entry`
ceiling. No approve variant exists or is added. An acknowledgement is not an approval.

1. **Trigger.** A new independent spine consumer `autodraft` (matcher-pattern: own
   checkpoint, dead-letter lane, WARN-only `/ready` health) subscribes to
   `document.invoice_facts_completed`/`_failed`. The event carries NO client (probe P4) — the
   consumer resolves document → active filing(s) → client itself; a multi-filing document
   yields one admission per filing. A catch-up pass (interval) re-evaluates
   `list_uncoded_filings` for stragglers AND reconciles/finalizes stale sweep runs (§3.5).
   No taxonomy repoint (companion §12: additive-insert into the ACTIVE version — probe P7).
2. **Admission protocol (races closed).** The consumer NEVER runs a model (matcher
   contract). It calls the definer writer `admit_autodraft_task(filing, origin)` which:
   re-evaluates the lane; enforces the **filing-keyed active-attempt registry** (partial
   unique: one autodraft task per filing in a non-terminal state) so event delivery, catch-up,
   retry, and one-click can never mint competing tasks or double-spend the model; carries
   **durable attempt counters** (2 failures park the filing to NEEDS REVIEW with the refusal
   recorded — survives consumer restarts); and reserves budget (WA-D2, §3.4). Origins
   `sweep` and `one_click` have distinct op-key namespaces (`autodraft:<filing>:<origin>`)
   with deterministic keys — a redelivered event replays to the stored receipt (op-key args
   are the admission facts, never model output, so replay hashes match).
3. **Execution lane.** The admitted task is a NEW `agent_tasks` kind `autodraft` with its own
   insert-trigger branch, status machine, and NO chat session (companion §4 — probe P3
   proved the existing machinery rejects every shortcut). `autoDraft_v1` (new frozen
   registry export) runs the coding model (WA-D2), perceives via the client-pinned read
   tools under the new `autodraft` wake_kind (allowlist enumerated in companion §13), and
   drafts via `draft_journal_entry` → `wake_draft_entry`. One bill per task by construction
   (`uq_coding_attempts_task`).
4. **Token budget (WA-L5, reserve-first).** `begin_autodraft_task` reserves a worst-case
   token estimate under the existing per-firm advisory budget lock BEFORE the model runs;
   settle-at-actual with refund on completion/failure; refuses (CLR29 `refused_budget`) when
   reservation would take firm spend past `firm_limits.sweep_budget_share` (default 0.60) ×
   the daily limit; a concurrent-sweep-run cap bounds overshoot; NULL-limit and day-rollover
   semantics follow the existing `firm_usage_daily` conventions. Interactive work always
   retains headroom; un-admitted READY bills wait for the next window.
5. **Receipts + ack (WA-R5, atomic lifecycle).** The consumer PRE-CREATES a `sweep_runs` row
   (state `open`, expected items); each admission/draft writes its `sweep_run_items` row
   (unique (run_id, filing_id)) in the drafting settle path; the run FINALIZES (counts +
   token totals fixed) only when every expected item is terminal — the catch-up pass
   reconciles committed drafts after a crash and finalizes stale runs. `acknowledge_sweep_run`
   accepts only a FINALIZED run, enforces the bookkeeper+ role floor in-fn against live
   membership, and refuses any agent/wake identity. Idempotent per (run, actor).

**WA-L6 (honest volume).** The queue shows N auto-drafted · N need review · N need you as DB
counts from one snapshot (§4); a dead consumer surfaces as a staleness badge, never a live
progress bar.

## §4 The review queue + batch approve

**Read model.** `clara.list_review_queue` — firm-scoped DEFINER (human lane only), RLS +
live-membership semantics, returning rows AND counts from the SAME snapshot with an as-of
watermark (the max domain_events seq surfaced), one TOTAL ordering tuple
(section_rank, client, vendor group, created_at, id) and a validated keyset cursor — no
duplicates/skips under concurrent writes. Membership: open drafts, uncoded active filings
(with lane), open questions, open coding tasks. Row payloads carry typed identifiers only.

**Presentation (DIRECTION List model, binding):** always-on filter; scope dropdown;
URL-as-truth; virtualization; render-immediately; the five screen states; split-view
row↔`doc_review`; trust accessories (AUTO/RULE badge, lane band, amount, period, evidence
dot); confidence never numeric. The queue subsumes the AB-5 inbox role.

**Batch approve (WA-R7 + WA-D5).** The selection model excludes high-stakes rows AND the
batch fires N calls to **`approve_routine_entry`** — a narrowing entry point that structurally
refuses `is_high_stakes` entries (probe P6 proved `approve_entry` alone cannot re-refuse
them), then delegates to the unchanged approval core per item with its own revision token and
fresh op_key. Per-row outcomes render honestly; one refusal never poisons the batch.
`approve_entry` (per-item) additionally gains the WA-D5 attestation requirement for
high-stakes entries with `last_human_editor IS NULL`. Duplicate-bill approve checks are
serialized by a deterministic per-(client, counterparty, invoice_id) advisory lock taken
before the EXISTS check (companion §14) — two concurrent approvals of exact duplicates can
no longer both commit.

## §5 doc_review (the split-view evidence surface)

The queue's detail pane renders the document (PDF/image via the private-bucket signed read
path — the HUMAN sees bytes; the S6-R11 agent boundary is unchanged) beside the entry:
per-leg evidence chips resolve to region polygons, page-jumping to backup pages. The
derivation panel renders the DB-computed doc↔entry diff (§7) — the UI never sums.

**WA-L7 (honest degradation, WA-R8).** A field with no captured region renders "no captured
region — verify against the document"; approval remains allowed. No unhighlighted claim
renders as if cited. Document text is inert data everywhere.

## §6 KB Layer-2 (typed rules + open questions)

**The two-layer law stands.** A rule may elevate ONLY the account-choice dimension of a
bill's lane (WA-D4); no rule, page, or question lowers an approval gate or authorizes a
write.

**`coding_rules`** (companion §7). Client-scoped `vendor_account` rules keyed to the REAL
CoA key (composite (client_id, account_code) — `coa_accounts` has no id column); account
must exist + be postable at signing AND is re-verified at application. Lifecycle
proposed → live | declined; live → retired; going live requires a human signature
(bookkeeper+, audited). Pinned rules never auto-retire — a contradicting approval opens a
vendor-scoped conflict question. **Sightings are transactional:** `approve_entry` writes
per-(vendor→account) sighting rows for each distinct debit account IN the approval
transaction (grain unique (client, counterparty, account_code, entry_id) — split bills
record every mapping), reversal excludes the entry from threshold counts, and the
≥3-distinct-eligible-entries threshold crossing opens the rule-proposal question in the same
transaction — never an async consumer (PRD invariants 4/13). **Rule application is
deterministic and proven:** `_draft_entry_core` resolves the live rule by (client, resolved
counterparty) under lock in the draft transaction, persists a full immutable fired-decision
snapshot (complete rule content + whether the drafted account MATCHES the rule), and "per
your rule" renders only on a proven match. The model never selects the rule.

**`open_questions`** (companion §8). Durable must-ask objects with scope ∈ {document,
vendor, client}. **Split entry points** (the ADR-015 lane law — one shared human+agent
writer is the proven-impossible shape): `open_question` (human lane, bookkeeper+) and
`wake_open_question` (agent lane, allowlisted, exact scope pinned to the wake's client) over
an ungranted core. Resolve/dismiss are human-only (bookkeeper+). **The CLR26 gate is
serialized, not check-then-act:** question writers and `approve_entry` share a documented
lock protocol (document scope → the filing lock; vendor scope → a deterministic
per-(client, counterparty) advisory lock; client scope → per-client advisory lock), both
orders rig-proved with deadlock bounds. In-scope open questions demote lanes via the shared
DEFINER predicate `_open_question_blocks` (canonicalizes counterparty through `merged_into`,
so a question on a merged vendor still gates the survivor). Clarify promotion is one-way and
audited; resolution can spawn a rule proposal.

## §7 Diffs (read-only, DB-computed)

**New state is required and specified** (Codex 12: `revise_entry` deletes and reinserts
lines — no history exists to walk): `journal_entry_revisions`, an append-only per-revision
snapshot (entry header, complete ordered legs, actor, reason, fired-rule snapshot ref,
evidence refs, revision token) written in the SAME transaction by draft creation
(revision 0), every `revise_entry`, and every facts-driven rotation. Then:

- **`get_entry_diff`** — the revision walk over that table (firm-scoped DEFINER, granted
  authenticated + agent_ro client-pinned). Renders in drawer history, receipts, edit-sheet
  preview.
- **`get_doc_entry_diff`** — per corroborated field: document-side value + region vs
  entry-side value, delta computed in SQL; honest no-region marker rows (WA-R8). The
  amount-exception flow is unchanged — this is its read surface. Divergences render with
  the §9 framing (document-vs-GL divergence is evidence FOR document-grounded coding).

## §8 The per-client egress registry (WA-R2 + WA-D1)

`client_egress_consents` (companion §10): per-client consent rows citing a REAL ingested
consent-evidence document; grant/revoke are OWNER-floor human acts. **Lane-carve (WA-D1):**
the OCR lane (pre-attribution by construction) is gated by the global kill-switch baseline;
the invoice_facts lane requires a live consent row for the document's client, evaluated
**definer-internally** in the claim function (the runtime passes only the kill-switch
boolean and holds no consent read); a multi-filing document requires EVERY active filing's
client consented or facts egress refuses (typed, CLR28). **Last-boundary recheck:** the
kill-switch + consent are re-verified in the claim/lease immediately before every external
call including running/replayed branches — the egress lease is consent-bound and a
revocation mid-pipeline (or across a kill/replay) yields zero post-revocation dispatch
(rig-proved). Revocation also demotes affected filings out of READY. Deploy ordering
(companion §10): migration → consent rows seeded → the image carrying the new gate; the gate
fails CLOSED in between.

## §9 Cards + dashboard integration

New ClaraPart types behind the parity + reachability gate, identifier-only payloads with
hydration on mount and after every action: `doc_review`, `diff`, `sweep_receipt`,
`kb_rule_proposal`, `open_question`, plus the batch-approve summary surface. The ClaraPart
union unification lands FIRST as the enabling refactor. Terminal states render inert;
refusals render verbatim; no raw HTML; safe-integer cents; fresh op_key per human action.

## §10 Error map (per-layer, enumerated)

New codes: **CLR26** open-question block (DETAIL: question id + scope) · **CLR27** rule law
(role floor, pinned-retire without conflict path, malformed content, duplicate live rule) ·
**CLR28** consent/egress law (no live consent; kill-switch; multi-filing partial consent;
consent-evidence mismatch) · **CLR29** sweep law (refused_budget, refused_attempts,
lane_changed — runtime-visible, never user-blocking). Per-layer table (companion §13a):
every new native constraint mapped — `coding_rules` one-live 23505→CLR27;
`client_egress_consents` one-live 23505→CLR28; `counterparty_aliases` unique 23505→CLR23;
autodraft active-attempt unique→CLR29 no-op; revisions/sightings composite-FK breaches→
not-found collapse; merge collisions→typed CLR23 outcomes (retired target, live-rule
conflict → retire-and-reissue, alias dedupe); `approve_routine_entry` high-stakes→CLR05
variant; WA-D5 missing attestation→CLR05. Multiple-gate precedence is defined in the
companion table. All four SQL-null variants of every new required input refuse identically
(AB-7); all text[] appends use `array_append` (AB-20).

## §11 Invariants preserved + verification plan

**Unchanged and load-bearing:** the four structural invariants; no auto-approve ever;
qualitative uncertainty; registration-dominant matching + fingerprint congruence (aliases
are name-lane CANDIDATES; merges never cross differing registrations — WA-D3); document
truth; books-version freshness; op_key idempotency; workflow immutability (`autoDraft_v1`
new frozen export; `chatTurn_v3` untouched); C-1 on every recreated function (exact old/new
signatures + caller lists published at build interface-pins); reverse-not-delete + posted-
line immutability (the merge design exists BECAUSE of it); money as bigint cents; the
agent→UI channel read-only.

**Evidence already banked (design stage):** the 10-probe battery
(`docs/plan/research/wave-a/design-probes.md`) — helper ACLs + invoker 42501 + the
cross-firm oracle; the pre-filing no-client proof; the autodraft trigger/status rejections;
the NULL-client event payload; merge collision mechanics; the vacuous high-stakes gate on
agent drafts (live-approved RM15k by one bookkeeper — the WA-D5 motivation); taxonomy
additive-insert; fn-fronted invoker/definer proof; the facts-vs-draft filing-lock
serialization both orders deadlock-free; the read-then-act budget + chat-only admission.

**Build-stage gates (contract-blind rig lane as usual; the Codex probe list 1–28 in
`design-review-codex.md` is folded into the battery):** lane-fn matrix incl. cross-client/
cross-firm/demoted-member oracle probes; the full admission-race set (event × catch-up ×
retry × one-click → one task, one model charge, one draft, one item); kill/restart at every
sweep boundary incl. post-claim pre-dispatch consent revocation (zero post-revocation
egress); reserve-first budget under concurrency + rollover; the global-switch × consent ×
document-state × task-state egress matrix counting actual outbound calls; merge under real
immutability triggers with every collision class + both-order merge-vs-draft/approve/sign
schedules; duplicate-bill concurrent approvals (at most one commits); CLR26 both orders on
all three scopes; batch with forged selections (DB refuses independent of UI); revision-walk
reconstruction across multi-step revise + facts rotation + restart; sightings
abort/replay/reversal semantics; rule sign/retire races with fired-snapshot truth; queue
pagination under concurrent mutation; 0011 fresh-vs-upgrade parity dumps + migration-runner
duplicate refusal + two independent bootstraps; AB-3 collision probe + login-direct ACL
preservation; the full CLR mapping sweep with no raw SQLSTATE leakage; the second-run
ledger (companion §15) executed, not reasoned. Eval seed: the 17-bill replay THROUGH the
sweep path (READY subset drafts equivalently; correct lanes for the rest) + new negative
fixtures (duplicate, non-MYR, vendor conflict, question block, forged exception).

## §12 Out-of-scope confirmations

No AR writers, no MyInvois parsing (AB-3 pin ships first), no auto-posting, no
bank/settlement flows, no SST engine work, no multi-currency, no FA register, no wiki
Layer-1 (Wave B). The S4-V2 canary (`daba7f2e`, due 2026-08-02) remains armed and untouched.
