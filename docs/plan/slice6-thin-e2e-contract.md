# Slice 6 — the thin end-to-end slice (GATE 3) · design contract v1.3

**Status:** DESIGN RATIFIED (full ladder: dual design review → dual delta re-review →
rig probes P1–P7 all SUPPORTED → owner-delegated decisions S6-D1/S6-D2 resolved by
research + cross-model debate and RATIFIED by the owner 2026-07-19; see §14).
Owner rulings S6-R1..R12 ratified 2026-07-19
(grill of record in-session; playback confirmed). Companion: `slice6-migration-0009-design.md`
(the §3 schema/writer design — same status, same normativity). Review ladder: dual design
review → owner delta ratification → build (contract-blind rig lane) → as-built dual review.

**Grounding of record:** six as-built briefs (runtime turn, DB write path, S5 surfaces,
write-floor authority, dashboard/parts, RPR corpus) in the session scratchpad
`slice6-briefs/1..6`; their file:line citations are the evidence base for every
"as-built" claim below. Where this contract contradicts a brief, the brief wins and the
contract must be amended.

---

## §0 Owner rulings (binding; do not re-litigate in review)

- **S6-R1 — RPR data status.** Rome Properties Sdn Bhd (Co. 202501005621 / 1607035V) is a
  client with owner-side control and explicit written consent (consent note signed by its
  director) to serve as testing data → tier-1-equivalent under S5-R1.
  `CLARA_DOC_EGRESS_APPROVED` may be set to `1` for the beta. Discipline rules: (i) no
  third-party-client documents are uploaded anywhere until the firm-wide egress bundle
  exists (the flag is all-or-nothing until the per-client registry — recorded residual);
  (ii) RPR payroll/EA/IC files never enter Clara (data minimization).
- **S6-R2 — GATE-3 bar.** Demo-thin, beta-real: the full REBUILD-PLAN script on live, on
  RPR's real FY2025 books, one document class, one coding flow, zero toy shortcuts.
- **S6-R3 — the class.** Supplier bills received. The pipeline stays class-agnostic;
  GATE-3 acceptance names this class only.
- **S6-R4 — coding authority.** Clara proposes the account from the client's active CoA,
  grounded in the context pack (CoA, recent entries, approval history), citing extracted
  facts. Proposals are advisory until approved; an edit rebinds approval to the editor's
  revision (the CLR06 exact-revision law). No vendor→account rules table in v1.
- **S6-R5 — the unsure path.** Draft whenever the facts allow, uncertainty stated
  qualitatively with alternatives (never a percentage); clarify-park only when no lawful
  draft is possible; no suspense-account convention.
- **S6-R6 — no auto-approval, ever.** Human approves every draft (agent-never-signs stays
  the absence of an entry point — ADR-015). Successor: **standing rules** (human-signed,
  deterministic, bounded auto-posting) — named deferral, automation slice.
- **S6-R7 — journal shape.** Gross to expense; always Cr Accounts Payable with the vendor
  as counterparty (the intrinsic-subledger floor, §5). SST-split and direct-bank coding:
  named deferrals. (RPR corpus check: no SST lines exist in the human GL — brief 6(d).)
- **S6-R8 — new vendors.** The draft CARRIES the proposed counterparty; one human approval
  births entry + vendor atomically; nothing exists if the draft dies. Match-before-create
  with SSM/registration number as the hard identifier; suspected matches stated on the card.
- **S6-R9 — the beta ledger.** RPR's real chart from its Trial Balance via a reviewed CSV,
  loaded once through audited functions. Greenfield FY2025 replay; no opening balances.
- **S6-R10 — trigger + tasks.** Coding is chat-first, human-initiated. Read-only
  uncoded-bills view. AB-9's recode carrier ships as a real durable task (§7).
  Task-per-ingest: named deferral.
- **S6-R11 — perception.** Client isolation holds in-session; the only cross-client surface
  is the firm-scoped **unassigned**-document read tool (bookkeeper+ floor via the wake
  credential, fully audited). Clara perceives stored extractions, never raw bytes; no image
  egress to the chat vendor. ≤5 attachments/turn; one document → one draft → one card
  (a draft may carry multiple debit lines — the INF split bill is ONE draft). Recorded
  note: extraction text transits the chat vendor; the future client bundle must name both
  processors.
- **S6-R12 — review + demo.** The `je_review` card per §6; approve (human lane, exact
  revision) / edit-then-approve (rebind) / discard (audited). Solo-attest routine; distinct
  checker when high-stakes-flagged. Kill-demo: the owner restarts the machine mid-flow on
  live; resume must deliver the card with exactly-once evidence. GATE-3 closes on §10.

## §0.5 Owner-delegated decisions — RESOLVED + RATIFIED (2026-07-19)

**S6-D1 (the invoice-facts pass, adopted as amended) and S6-D2 (accrual-to-AP +
the owner-approved chart augmentations, adopted as amended) live in the companion
`slice6-delegated-decisions.md` — which IS this section** (split for the 500-line
cap, the S5 §13 precedent; same normativity). Resolution process: two research
lanes + cross-model debate (evidence in `research/slice6/`), owner-ratified. Their
amendments BIND §4/§5/§9 (machine-corroborated framing; the amount-exception flow
with the CLR21 reason discriminant; the duplicate-bill and top-level-document
rules; the MyInvois next-slice gate; the AP-open-bills eval gate replacing any
nets-to-zero check; owner-adjudicated boundary divergences; system-role account
governance).

## §1 Scope (one sentence per deliverable)

1. **chatTurn_v2** (new frozen closure; v1 untouched; registry repoint) — parts-aware:
   in-turn attachment perception, firm-scoped read tools, the `draft_journal_entry` write
   tool, `je_review` typed part.
2. **The write floor** — the third login + write pool wired to the EXISTING
   `wake_draft_entry` lane (brief 4 Shape 1); no new writer grants, no new wake fn.
3. **Migration 0009** — counterparty core, revise/withdraw writers, `approve_entry` v3
   (vendor birth), coding_tasks (AB-9), read fns, invoice-facts lane (companion doc).
4. **Dashboard** — je_review card in /chat (three-place wire extension + the first
   card-catalog parity test), uncoded-bills section + coding-tasks list in /documents.
5. **RPR onboarding** — reviewed CoA CSV + operator script through audited fns; the
   replay-eval harness (§9).
6. Egress flip mechanics + live verification additions (§8).

**Out of scope (named deferrals, §11):** standing rules; task-per-ingest; SST split;
vendor→account rules table; batch approve; opening-balance onboarding; per-client egress
registry; bank/payment flows; sales invoices; the full Phase-4 card catalog;
URL-as-truth routing; ⌘K/ActionPanels.

## §2 The coding flow, end to end (the GATE-3 spine)

```
upload (chat chip or /documents) → intake transport → finalize (document row, bytes
verified) → OCR (prebuilt-layout; egress gate) → matcher (candidates/rule resolution)
→ HUMAN FILES the bill to RPR (file_document / confirm-candidate — filing stays
human-only, brief 3(b)) → [invoice-facts pass §4 if absent] → human asks Clara in chat
("code the BRIGHTPATH bill") → chatTurn_v2: perceives (read tools) → proposes →
draft_journal_entry tool → wake_draft_entry (write floor) → je_review part persisted →
turn settles normally → human on the card: approve / edit→approve / discard (PostgREST
human lane) → approved entry with filing-bound provenance + vendor born (S6-R8).
```

Law this flow inherits unchanged: admission trigger AB-12 (≤5 attachments, CLR10/11);
citability (`_active_document_filing`: ACTIVE filing + `bytes_verified_at`, CLR02, both
at draft and re-affirmed at approve); `assert_client_resolved` ≥0.95 (CLR01); freshness on
the wake lane (`p_books_version` mandatory, CLR10/CLR12 + commit-time recheck); op-receipt
replay (reserve-first, byte-identical); maker=agent-user attribution (the human approver
IS the checker — never blocked as self-approval, brief 4 edge-flags).

**Coding is an in-turn capability, not a new workflow class (D-3).** The turn ends when
the draft is proposed; approval is a later, independent human-lane act (the
answer_interruption precedent: direct PostgREST RPC + re-fetch, no runtime hop, brief
5(b)). No approval park, no new hook kind, MAX_SEGMENTS=12 stands. `agent_tasks` stays
untouched (kind CHECK unchanged); the AB-9 carrier is the NEW `coding_tasks` table (§7).

## §3 chatTurn_v2 (frozen-closure design)

New files `chatTurn.v2.ts` + companions (AB-16 pattern: infra via globalThis, never
imported), `// @frozen`, manifest appended via local `--update`; v1 files byte-untouched;
`workflows/registry.ts` repoints `chatTurn:` → `chatTurn_v2` (v1 export stays until zero
non-terminal v1 runs); enqueue sites already resolve via the registry (brief 1(c) steps 1–6).

**messageFromParts_v2:** attachment parts render into model context as a structured stub —
`[attachment: <document_id>]` + standing instruction to call `read_document`. The stub
promises ONLY agent-readable fields [N-F14 — `document_intakes_visible` (filename,
intake status) is `clara_authenticated`-only; the agent derives kind/filed state from
`get_document_extract` instead; filename joins the stub only if the agent-granted
`documents` row carries one, verified at build]. Supersedes DELTA-OWNER-2's
non-perception copy (ADR-018(3) anticipated exactly this reversal in Slice 6); the
dashboard chip copy updates accordingly.

**Read tools (all wake-scoped via `withReadWakeScoped`; `safe()` error containment):**
- Existing four client-scoped tools unchanged.
- `list_unassigned_documents()` — NEW governed fn (security invoker, RLS `wake_firm()`
  scoping, the 0007 anti-join index; ZERO new grants — brief 4(e)(1)). Firm-scoped by the
  wake credential; available even when the session has no client (v1 exposed no tools at
  all without clientId — v2 exposes the firm-scoped set + clarify).
- `read_document(document_id)` — NEW governed fn `get_document_extract` (security
  invoker; documents/filings/extractions/regions are already agent-SELECT-granted):
  returns filing state, `document_kind`/`financial_date` when set, semantic invoice facts
  when present (§4), bounded raw text (cap ~20k chars) + region ids for citation. The
  no-cross-firm-oracle law holds (RLS yields not-found, one refusal shape).
- Attribution candidates stay NOT agent-visible (no new grant): an unassigned doc's chat
  answer is "unassigned — file it first on /documents." Candidate visibility for the
  agent = deferral.

**Write tool `draft_journal_entry` (exposed only when the session is client-bound):**
input: `posting_date, memo?, lines[{account_code, debit_cents, credit_cents,
description?}], document_id, vendor: {existing_id} | {new: {name, registration_no?}},
evidence: [{region_id, quote, field_path?}] (REQUIRED for document-bound drafts —
persisted as entry_evidence in the draft transaction, DB-verified against the cited
extraction [C-9, D-F2]), uncertainty?: {note, alternatives[]}`. The wrapper (runtime, inside the frozen closure):
fetches the document row (sha256) + the authoritative resolution + a fresh pack
`books_version` server-side; runs the tier check (§4); stamps the immutable
`coding_kind='supplier_bill'` marker (the bill-shape floor keys on THIS, never on
`document_kind` — [NEW-2]); stable op_key **`code-doc:<task_id>:<document_id>`**
[C-12/NEW-7]; executes via the write pool (§5) → `wake_draft_entry`, whose recreated
signature carries the coding-attempt payload so the attempt row is written by the
core IN the draft transaction [NEW-6]. Result part: `{type:'je_review', entry_id, revision_token, client_id,
document_id, provenance_tier, uncertainty?}`. The model NEVER supplies sha256,
books_version, op_key, or the resolution id.

**Wire:** `je_review` joins the runtime `ClaraPart` union; the dashboard union, and BOTH
`applyChunk` (live) and `TranscriptParts` (persisted) gain branches (the three-place
extension, brief 5 summary 1). Unknown-part silent-drop is closed by a minimal
**card-catalog parity + reachability test in CI** (DIRECTION §3's gate, first slice where
it matters): every registered part type must have a persisted-render branch and one
reachability fixture, or the build fails.

## §4 Invoice facts — two-tier amount provenance (D-1; delta-flag for the owner)

As-built, NO structured invoice facts exist: prebuilt-layout only, positional regions,
`monetary_cents` never populated, `document_kind` never set (brief 3(a)). The LAW
("the agent never posts a figure unreviewed" — MEDIUM-18) permits model-read amounts under
human approval, but the replay eval and the deterministic-derivation aspiration want
machine-verified totals. Design:

- **A second, additive engine snapshot** `azure-di:prebuilt-invoice:2024-11-30` (the law
  stays vendor-agnostic; ADR-018(2) pins per processing task). A new
  `document_processing_tasks` lane `'invoice_facts'`, **enqueued at FILING time**
  (in-writer: `file_document`, the candidate-confirm filing path, the correction
  re-file) so facts are normally ready before anyone asks Clara to code [N-F3 — a
  coding-time enqueue can never feed the same synchronous turn]; a coding-time backstop
  enqueue covers stragglers (that turn proceeds Tier B honestly). The claim fn's
  egress-hold branch AND the concurrency cap are REPLACED to cover the new lane
  [N-F1 — as-built both are hard-coded `lane='ocr'`; without the replacement the new
  lane would egress with the flag OFF]. Reconciler release machinery unchanged.
- Its normalizer persists SEMANTIC regions (`field_path` = `invoice.vendor_name`,
  `invoice.invoice_id`, `invoice.invoice_date`, `invoice.total` …) with
  `monetary_cents` finally populated, and stamps `documents.document_kind='invoice'` +
  `financial_date` via a new runtime-lane setter (companion §5).
- **Tier A (verified):** a persisted `invoice.total` exists → the tool wrapper
  cross-checks the model's proposed line sum against it; mismatch ⇒ **CLR21** refusal
  (deterministic backstop). Card labels the amount "machine-verified total".
- **Tier B (honest default whenever facts aren't ready):** no semantic total yet (facts
  task pending/held, odd layout, engine miss) → the model's amount stands as proposed,
  the card labels it "read by Clara from the document — verify against the source".
  Tier-B citations are REAL, not decorative [C-9]: the write tool carries an evidence
  array (region ids + exact quotes) persisted as `entry_evidence` rows in the draft
  transaction, DB-verified against the cited extraction — hydration always knows
  which source text the amount came from. The backstop enqueue makes the NEXT coding
  of that doc Tier A.
- **The Tier-A equation is defined in the DB** [C-9]: after canonical rounding,
  supported MYR gross == the payable credit total == the expense debit total; the
  `invoice.total` field is distinguished from `amount_due` — deposits/credit notes/
  total-vs-due disagreement ⇒ refuse-and-clarify, never a guess.
- **Currency has ONE outcome** [C-20, supersedes v1.1's fall-to-Tier-B]: an explicit
  non-MYR currency ⇒ refuse + clarify (this ledger has no currency model; posting a
  foreign amount as MYR cents is never lawful, at either tier). Multi-currency stays
  a named deferral. S6-R5's clarify floor applies when even Tier B is impossible.
- **The evidence/approval race is closed structurally** [C-8]: drafts bind to their
  evidence (extraction + fact hash + tier); a LATER facts completion rotates the
  revision token of every open draft citing the document, and `approve_entry`
  re-verifies the evidence state in-transaction — a newly-available contradicting
  machine total refuses with CLR25 (stale evidence), never silently approves.

## §5 The write floor (D-2) + the counterparty core (D-6)

**Write floor = brief 4 Shape 1, exactly.** The DB side is complete (`wake_draft_entry` →
`_draft_entry_core`, granted to `clara_wake_interactive`, allowlisted, freshness- and
provenance-gated, draft-only ceiling). S6 adds ONLY runtime plumbing: a third login
`clara_wake_write_login`, member of `clara_wake_interactive` alone (`WITH SET TRUE,
INHERIT FALSE` — the single-membership law), a small write pool, and
`withWriteWakeScoped` (mint per attempt `on_behalf_of` the initiating member —
live bookkeeper+ revalidation, HIGH-5; txn-local `set_config(...,true)` parameterised;
`SET ROLE clara_wake_interactive`; NOT read-only; COMMIT; P4 destroy-on-error; the secret
never crosses a step boundary). NOT lawful and not done: any books-writer grant to
`clara_agent_ro`/`clara_runtime`; any wake approve/reverse variant.

**Counterparty core (0009, companion §2):** `counterparties` (firm+client-scoped, vendor
kind in v1, `name_normalized` + `registration_no` dedup keys), `journal_lines.
counterparty_id`, `journal_entries.proposed_counterparty jsonb` (the S6-R8 carrier —
nothing exists until approval), `coa_accounts.account_class` (`'payable'` designation in
v1). `approve_entry` v3 births/matches the vendor and stamps the payable line(s) inside
the writer body BEFORE the status flip (token validated first; companion §3 fixes the
trigger-interaction order). The **intrinsic-subledger floor**: a payable-class line
without `counterparty_id` at approve ⇒ **CLR23**. Match law: registration-DOMINANT per
companion §2 [C-5/NEW-3]: registration match → reuse; registration supplied but a
name-equal row carries a different registration → conflict-refusal; no registration
supplied but a registered vendor matches the name → ambiguity refusal (candidate
surfaced, human decides); name match among unregistered rows → reuse, stated on the
card; else birth. Approve compares the FULL canonical fingerprint; a changed match
landscape refuses, and the convergent next act is `revise_entry` (which refreshes the
fingerprint and rotates the token) — never a silent re-fetch [NEW-3]. Payments,
aging, statements: bank-slice deferrals.

**Human edit/discard writers (0009):** `revise_entry(p_entry, p_lines, p_vendor?,
p_expected_revision, p_op_key)` (draft-only; re-validates the §2 line laws; token rotates
→ new token returned) and `withdraw_draft(p_entry, p_reason, p_expected_revision,
p_op_key)` (the missing generic audited `draft→withdrawn`; the transition allow-set
already permits it — brief 2(e)). Both bookkeeper+ human lane. Stale token ⇒ CLR06;
non-draft ⇒ CLR22.

## §6 The je_review card + approve UX

Hydration law (DIRECTION §1): the part carries identifiers; the card re-derives
authoritative state on every render via a NEW read `get_draft_review(p_entry)`
(security invoker: entry + lines + vendor proposal/match + document link + provenance
tier + high-stakes flags + eligible-checker count). No read exists today to find a
document's draft (brief 5 summary 3) — this fn plus `list_uncoded_filings` close it.

Card contents: proposed lines (code + name + amounts); vendor line with **"new vendor"**
badge or "matched existing" note; source chip (document + filing) with cited facts —
Tier-A verified fields or Tier-B model-read quotes with region cites; the qualitative
uncertainty + alternatives; high-stakes flags loudly when set. Actions (all direct
PostgREST RPC, fresh op_key per click, re-fetch after — the house idiom): **Approve** →
`approve_entry(entry, expected_revision, attestation?, op_key)`; **Edit → approve** →
`revise_entry` then approve with the NEW token; **Discard** → `withdraw_draft` with a
reason. Approve button gates on a readiness boolean (draft status + token freshness +
checker preconditions), CorrectionWizard-style honest error surfacing. Solo-attest
routine; CLR05 distinct-checker when high-stakes-flagged and ≥2 eligible.

## §7 coding_tasks — the AB-9 realization (D-10)

New table `coding_tasks` (companion §4): `(id, firm_id, client_id?, document_id, origin
'correction'|'manual', correction_id?, status 'open'→'done'|'dismissed' [C-14/NEW-7],
opened_by/closed_by, reason, timestamps)`; firm-scoped RLS; masked view; human-lane
writers `open_coding_task`/`complete_coding_task`/`dismiss_coding_task`; `agent_tasks`
untouched. `approve_wrong_client_correction` (0009 re-creation) inserts the task row
atomically (the notification stopgap keeps emitting for inbox visibility; the task is
the authoritative carrier — preserves the AB-9 correction linkage). `complete` may
reference the replacement entry. Dashboard: a coding-tasks list beside the
uncoded-bills section (`list_uncoded_filings(p_client?)`: ACTIVE filings with no draft
and no unreversed approved entry bound to THAT filing [C-15/NEW-7]).

## §8 Egress flip + live verification additions

Flip = a `CLARA_DOC_EGRESS_APPROVED=1` secret override (fly.toml [env] stays `0` — the
world-off pattern mirrored), recorded against S6-R1 + the signed consent note. On flip
the reconciler bulk-releases `held_egress → queued` on its next cycle (brief 3(f)) — the
FIRST vendor egress ever; verify the release count matches the held population and only
RPR/synthetic docs exist. Live verification adds: one RPR bill end-to-end (intake →
OCR → matcher → human file → invoice-facts → coding → approve), the kill-demo (§10.2),
and the S4-B7 checks unchanged.

## §9 RPR onboarding + the replay eval

**Onboarding:** operator script (repo `ops/` or `packages/db/scripts/`, PR-landed)
calling audited fns only: firm (BELCORT real), client RPR, CoA from the REVIEWED CSV
(lane-6 extraction: the 15 TB accounts + the zero-balance GL accounts + `400-000 TRADE
CREDITORS` as a postable payable-class account + a rounding account absent from RPR's
chart), memberships. No hand-written rows. **Live-books discipline [N-F11]:**
deterministic op_keys (`onboard-rpr:<class>:<code>`) so the script is idempotently
re-runnable; a `--dry-run` mode printing the full plan first; sequenced strictly AFTER
world-on/ceremony completion and before the first beta bill. FY note: **year-end 31/12/2025 CONFIRMED by the owner (2026-07-19)**; the RPR
strike-off application was stated to the owner in the same exchange — the AB-4
conservative retention floor covers it; no FY/retention machinery lands in S6 [C-17].

**Eval (the GATE-3 yardstick):** the **17-file** supplier-bill manifest — FINALIZED
from document content 2026-07-19 [N-F12 CLOSED; `rpr-manifest-final.md`, to be
archived under `docs/plan/research/slice6/`]: all 17 PDFs read; every total legible
as numeral + words-in-full; all MYR; no populated SST line anywhere (validates
S6-R7); **both prior mysteries resolved as stale FILENAMES — the PDF totals match
the GL exactly** (RPA Jul–Dec really bill RM5,000 "accounting fee and payroll
services"; BRIGHTPATH BINV202510-018 really totals RM435,560.00), so full per-bill
reconciliation is the expected outcome, and any document-vs-GL divergence the flow
surfaces is a finding, not noise. Known nuances baked into adjudication: the INF
debit note is a 7-page bundle whose 3-way expense split is recoverable ONLY from its
attached backup invoices (pages 2–7) — Clara must read beyond page 1 to match the
human coding; KOK LIONG prints NO company registration on the bill face (MIA firm
no. only) — the vendor-match falls to the name lane by design; RPA's letterhead
carries an "f.k.a LW PUBLIC ADVISORY" former name (alias awareness). Then per-entry
comparison against the human GL on (expense account, amount, posting date).
Documented divergences, adjudicated in advance: (i) credit legs — Clara accrues to
AP (S6-R7), the human booked direct-to-bank; the eval binds on each bill's DEBIT
leg(s), and Clara's AP account balance must equal the sum of coded bills (no
per-bill AP exists in the human GL); (ii) superseded — the RPA/BRIGHTPATH cases
resolved above; the standing rule stays: the
DOCUMENT content is truth — any future document-vs-GL divergence the flow surfaces is
treated as a possible human-GL error, surfaced to the owner, and counts FOR
document-grounded coding; (iii) the INF bill codes as ONE draft with three debit
lines (S6-R11), and matching the human split requires reading its backup pages;
(iv) bills with no PDF in the corpus (recurring INF rent, RPA August rent, two
KOK LIONG fees) are OUT of the eval population — the eval covers the 17 files
present, not the full GL. Success bar: all 17 bills reconcile per rules (i)–(iii),
with any divergence explained on the card. Evidence lands in
`docs/plan/research/slice6/`.

## §10 GATE-3 close checklist (the demo script)

1. The REBUILD-PLAN script end-to-end on live: upload → OCR → persist-unassigned →
   assign (matcher-assisted, human-filed) → coding in chat → `je_review` → approval →
   approved entry with filing-bound provenance + vendor subledger row.
2. **Kill-demo:** the owner restarts the Fly machine after perception, before the card;
   on return the workflow resumes, the card arrives in the same session, SSE reattaches
   with full replay; ledger proof: exactly ONE draft, ONE receipt, ONE metering charge
   (op-key replay). Evidence recorded like T2-48h.
3. The §9 replay eval passed to its bar.
4. Full audit trail inspectable for any entry: events, receipts, tool history, who
   approved which revision.
5. Invariants demonstrably held: no agent write beyond the draft ceiling, no unreviewed
   figure, human approval on every draft, structural approve-lane intact
   (`select approve_entry(...)` as the agent role fails at the role level).

## §11 Named deferrals (recorded; do not build)

Standing rules (human-signed bounded auto-posting) · task-per-ingest coding · SST-split
legs · **multi-currency coding** [N-F17] · vendor→account rules table · batch approve
UX · opening-balance/TB onboarding slice · per-client egress registry · bank/payment +
receipt-matching flows · sales invoices + MyInvois parsing · agent-visible attribution
candidates · runtime/dashboard ClaraPart union unification (flagged brief 1(e)) ·
URL-as-truth · ⌘K/ActionPanels · full card catalog (Phase 4) · aging/vendor statements.

## §12 Error-code map (enumerated at design time — the S5 lesson)

Reused as-is: CLR01 resolution; CLR02 filing/citability; CLR05 distinct-checker;
CLR06 stale revision token (approve/revise/withdraw alike); CLR07 balance/rounding;
CLR08 delete-forbidden; CLR10 malformed/missing input (incl. missing books_version);
CLR11 tenant-oracle collapse (incl. attachment admission, unassigned-read not-found);
CLR12 stale books freshness; CLR13 task transitions; CLR15–20 unchanged S5 semantics.

New in Slice 6:
- **CLR21** coding-tool law: Tier-A total mismatch (proposed lines ≠ machine-verified
  total); explicit non-MYR currency (refused at EITHER tier [D-F7]); malformed vendor
  proposal; missing/invalid evidence array on a document-bound draft; write-tool
  called without a client-bound session (runtime-labeled); double-coding refusal (an
  approved unreversed entry already binds the active filing, or the one-open-draft
  unique trips).
- **CLR22** draft-lifecycle law: revise/withdraw on a non-draft; withdraw without
  reason; revise line-law violation surfaces its underlying code (CLR07/CLR10) — CLR22
  covers only the lifecycle refusals.
- **CLR23** counterparty law: payable-class line without a counterparty at approve;
  registration conflict on birth (name-equal, registrations differ); fingerprint
  mismatch at approve; the supplier-bill shape refusals (no payable credit on a
  non-reversal invoice entry; payable total ≠ supported gross) [D-F7].
- **CLR24** coding_tasks transitions (off-matrix, result-entry proof failures,
  wrong-firm collapse to not-found).
- **CLR25** stale evidence at approve (a verified machine total now contradicts the
  draft's bound evidence) [C-8].
**The map is per-layer, not per-code** [C-20]: the build ships a table
DB SQLSTATE/constraint → CLR code → runtime tool result → card behavior, naming every
caught native constraint (23505 one-open-draft → CLR21; counterparty uniques → CLR23;
composite-FK breaches → not-found collapse; CLR03/04/08 inherited semantics stated);
the structural 42501 on an agent approve attempt stays DISTINCT from business
refusals; runtime-only refusals (client-less write tool) are labeled runtime, not DB.
Every S6 writer's failure paths enumerate one of the above at authoring time; a refusal
outside this map is a build defect. Deliberate split, recorded [N-F15]: `approve_entry`
on a non-draft keeps its as-built CLR10 (frozen 0007 semantics); the NEW
revise/withdraw writers use CLR22 for the same condition — changing approve's code
would be a behavioral edit to shipped semantics for cosmetic consistency.

## §13 As-built amendments

Reserved. Populated during build per the §13/AB-N house convention (S5 precedent).

## §14 Design-review delta log

**v1.1 (native lane, 2026-07-19 — verdict SOUND-WITH-FINDINGS; full report
`.tmp/s6-design-review-native.md`, to be archived under
`docs/plan/research/slice6/`):** HIGHs all accepted and folded — N-F1 (claim fn
replaced: egress gate + concurrency cover `invoice_facts`), N-F2 (`_tf_entry_immutable`
allow-set changes for `proposed_counterparty` on draft→draft AND draft→approved),
N-F3 (facts enqueue moved to filing time; Tier B = honest default; D-1 reframed).
MEDIUMs folded: N-F4 (birth race → re-match), N-F5 (request-hash includes the vendor
arg), N-F6 (punctuation-stripping normalization), N-F7 (`get_document_extract`
session-client gate), N-F8 (rounding law inside the shared validator), N-F9
(one-open-draft law + double-code refusal), N-F10 (structural enqueue idempotency),
N-F11 (onboarding idempotency/dry-run/sequencing), N-F12 (manifest finalized from
document content), N-F14 (perception stub promises agent-readable fields only),
N-F17 (currency guard + named deferral). Noted/recorded: N-F13 (taxonomy additive
insert → VERIFY-ON-RIG probe in companion §10), N-F15 (CLR10/22 split rationale in
§12), N-F16 (parity test = persisted-branch + reachability; live-chunk branch not
required for je_review), N-F18 (the recode notification carries the coding_task id;
the inbox renders task state — one surface, two rows), N-F19 (FYE + strike-off →
owner confirmation at delta ratification).

**v1.2 (Codex xhigh lane, 2026-07-19 — verdict FLAWED, 6 CRITICAL / 13 HIGH / 1
MEDIUM, ALL twenty accepted; full cited report `.tmp/s6-design-review-codex.md`, to be
archived under `docs/plan/research/slice6/`):** C-1 signature/overload law (drop/create
+ ACL asserts; hashes cover new args; param order) · C-2 approve v3 restores the 0007
filing→entry lock order (token rotation itself validated sound) · C-3 supplier-bill
floor made structural (deferred constraint trigger on every approved-transition;
reverse/correction mirrors copy counterparty; vacuity closed) · C-4 revise stamps
`last_human_editor` (maker/checker rebind) · C-5 registration-dominant identity +
match fingerprint congruence at approve · C-6 composite tenant FKs; `merged` state
REMOVED from v1 · C-7 invoice facts get their OWN extraction row (engine_kind
extended; physical locators; no fake 'semantic' kind; no implicit "current") · C-8
evidence/approval race closed (token rotation on facts completion + in-txn re-verify
+ CLR25) · C-9 entry_evidence rows make citations real; Tier-A equation defined;
C-20's currency contradiction resolved to refuse-and-clarify · C-10 invoice-facts
metering (fresh reservation, failure/refund twin, attempt cap, status honesty) ·
C-11 client-pinned agent reads + OBO-the-initiator minting (closes the same-firm
entry oracle; bare get_journal_entry loses the agent grant) · C-12 op_key =
task-scoped + `coding_attempts` recovery (kill-demo card survives divergent replay) ·
C-13 the facts workflow is a NEW `invoiceFacts_v1` class (documentIngest v1 stays
frozen) · C-14 coding_tasks integrity (composite FKs, v1 matrix open→done|dismissed,
exact correction insertion point, task id in notification+receipt) · C-15 uncoded +
one-draft laws re-keyed to the ACTIVE FILING (shared docs + correction destinations
correct) · C-16 the CoA code domain is widened (RPR's `900-A01` codes cannot pass the
live CHECK) with display codes preserved · C-17 onboarding: no idempotent-create
assumption; augmentations (postable AP + rounding accounts) need explicit owner
sign-off · C-18 third-pool P4 precision (NOLOGIN creation, boot asserts, budget,
teardown, created_by plumbing) · C-19 part-promotion law + coding-intent terminal
invariant (card/clarify/refusal — never silent cap exhaustion) · C-20 per-layer error
map. The six Codex delta-stage probes are REQUIRED (companion §11).

**Delta round (2026-07-19):** native delta re-review = FINDINGS (8 residuals, zero
CRITICAL regressions; interactions I-1..I-3 verified CLEAN, I-4 was real) — ALL
folded: D-F1 (agent-lane CLR03 refusal on null wake_firm — silent-empty closed),
D-F2 (the tool's evidence[] input restored), D-F3 (file_document +
confirm_attribution_candidate join the Replaced list), D-F4 (draft→withdrawn
allow-set + draft-only stated procedural), D-F5 (`record_coding_attempt` concrete
writer + grant + allowlist row), D-F6 (bill-shape credit clause scoped
`reversal_of IS NULL`), D-F7 (§12 hygiene: dead merge path removed, bill-shape
refusals named, non-MYR refused at either tier), D-F8 (allowlist name-keyed wording),
D-I1 (ORDER BY id rotation + WHEN-scoped trigger). Codex delta re-review pending.
**Owner outcomes (2026-07-19):** RPR FYE = 31/12/2025 CONFIRMED. Decisions D-1
(second Azure pass) and the chart augmentations are OWNER-DELEGATED to industry
research + cross-model debate (the S5-D precedent) — resolution to be recorded here
as S6-D1/S6-D2 before the build.

**Codex delta round (2026-07-19):** 11 FOLDED / 9 PARTIAL / 8 NEW — all eight folded
as v1.3: NEW-1 (the facts↔approval serialization protocol: active filing = the single
lock point, filing-UUID→entry-id order in BOTH writers), NEW-2 (the bill-shape floor
keys on the entry's own immutable `coding_kind` marker, never on the facts-stamped
`document_kind` — Tier-B bills can no longer escape it), NEW-3 (full-fingerprint
congruence + the registered-name-without-registration ambiguity refusal + revise as
the convergent re-match act), NEW-4 (`processing_call_reservations` — the second-pass
metering has a lawful carrier + the AB-6 arithmetic stated), NEW-5 (lazy in-tool OBO
mint + one typed oracle-safe refusal), NEW-6 (the coding attempt rides inside the
recreated core signature — one call, one atomic unit, structural one-attempt keys),
NEW-7 (the four stale contract-body clauses updated to the companion's final
names/keys/matrix), NEW-8 (the six delta probes restored verbatim with their
load-bearing qualifiers).
