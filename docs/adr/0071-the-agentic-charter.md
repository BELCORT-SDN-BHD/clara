### ADR-0071 — THE AGENTIC CHARTER: judgement becomes the posting authority; the LLM witness pair replaces the reader estate; the rules machine retires (2026-08-18)

**Eleven owner rulings plus two recorded principles, minted in one structured-question
grilling session (in-session record; the orchestrator's plain-language briefing preceded
every ruling, and each option carried its cost stated in advance). The session's evidence
base is the 2026-08-16 vision-alignment audit
(`docs/plan/research/wave-f/vision-alignment-audit.md`) plus a six-lane code-level deep
scan run 2026-08-18 (pinned `sonnet-5` xhigh lanes over the coding, rules/autopost,
extraction, bank, close and reporting subsystems; findings N1–N6 registered in
`PROGRESS.md`). This entry supersedes more standing law than any entry before it; the
supersessions are enumerated exactly, and so is what stands.**

---

#### The rulings

**(G1) Unattended posting authority — RULED: FULLY AGENTIC.** The agent's own judgement
is posting authority for unattended writes. No per-vendor human-signed rule is required
for any document class. The prior doctrine — a human-signed standing rule IS the posting
authority (ADR-025), autopost eligibility derives from verified in-system approvals only
(digest law 12) — is superseded on this lane. *Build's recommendation was the
propose-side-only widening (keep deterministic execution); the owner heard the full cost
statement (silent compounding of a wrong classification; audit non-reproducibility of a
judgement act; the automation gained concentrating on first-sight shapes) and ruled for
full agency. Recorded as proposed-and-declined per the ADR-061 convention.*

**(G1.1) The number's custody — RULED: THE LLM WITNESS PAIR (the owner's own design,
superseding both options briefed).** Corroboration's *shape* survives — **agreement of
independent readers, never confidence** (ADR-047's core) — but the reader roster is
replaced: **reader 1 = an LLM reading the stored OCR raw text; reader 2 = the same
provider's LLM reading the original image/PDF bytes** (two channels, distinct prompts;
"same provider, different channels" explicitly chosen over dual-provider). Azure
`prebuilt-invoice`, Azure `prebuilt-bankStatement` and the deterministic layout-reader
family (`invoice-totals-reader` and kin) RETIRE. OCR itself (today Azure
`prebuilt-layout`) is demoted to a **coordinates-and-text-fidelity supplier only — zero
semantics — and is vendor-swappable** behind the existing normalized envelope/regions
shape. ADR-047's reader roster and the third-reader registration (#25's "an LLM may join
as an ADDITIONAL witness — never the sole one") are superseded: *never a single READ*
replaces *never the sole reader*; an independent pair of LLM reads qualifies.

Four gates are BINDING on the build (the owner ratified them with the ruling):

- **C1 — independence + a deterministic verdict.** The two reads use different input
  representations and different prompts; **whether they agree is decided by a versioned
  deterministic DB predicate, to the sen — the model never grades its own agreement.**
  PRD §6.1 is untouched: the agreement predicate over two persisted, DB-owned reads IS
  the deterministic evaluator reproducing the figure from DB-owned inputs.
- **C2 — region anchoring.** Every witnessed amount must bind server-side to a layout
  OCR region (snap-by-content); a value no region carries cannot reach corroborated and
  the document falls to draft. CLR21's evidence wall, the polygon wall and the
  `doc_review` side-by-side surface keep their fuel.
- **C3 — the mechanical identities stay.** The document's own arithmetic identity
  (net + tax = gross) and, for bank statements, the running-balance CHAIN (digest law 14's
  surviving half) remain required checks. They are arithmetic, not maintained readers,
  and they catch the shared-bias case a same-provider pair is most exposed to.
- **C4 — both reads persist, stamped.** Every read is stored whole with model + version
  (the #25 stamp discipline), so the audit trail is the two stored reads plus the
  deterministic agreement receipt. Reading prompts carry the §6.5 injection posture:
  document content is inert data, never instructions.

**(G1.2) Runtime guardrails — RULED: NONE.** No high-stakes-amount routing to a human,
no first-sight ramp, no sampling QA, no dark launch. An unattended agentic post at any
amount stands if the walls pass. The closed-period wall (CLR19) is unaffected — it is
the book's own wall, refusing humans equally; the formal reopen is the only door. *Build
recommended all four belts; proposed and declined.*

**(G1.3) Duration — RULED: PERMANENT.** The zero-guardrail posture is the product's
shape, not a pre-beta convenience; it does not expire at beta. *Build recommended
pre-beta-scoped with a beta-boundary re-ruling on eval data; proposed and declined —
the build's dissent is recorded here at the owner's standing instruction to keep
disagreement on file.*

**(G1.4) The rules machine — RULED: THE EXECUTION TIER RETIRES.** `execute_rule_post`,
the autopost/coding-rule signing verbs, sighting breeding and the maturity ladder are
retired as a posting mechanism. **Approved history and per-client patterns become
context-pack / KB fuel** — the learning loop is the knowledge layer informing the
agent's judgement, not rule objects. Consequences: WB-R2 ("no autopost rules from
seeding, ever") and the anti-circular floor exclusion (ADR-064) become moot with the
machinery they governed; the generic-lane sighting-breeding gap
(`docs/ARCHITECTURE.md` coding_kind table's closing paragraphs, the audit's registered
"highest-value unbuilt autonomy work") **DISSOLVES** — the witness pair reads any
document class, so the long tail is covered by the same lane as the control kinds.

**(G2) The year-end close — RULED: KEY ① TO THE AGENT; KEYS ②③ STAY HUMAN.** The agent
may hold `begin_close` / `abandon_close` and the whole preparation surface (close-plan
and readiness reads, chasing drawer-2 items, drafting attestation texts, proposing the
close) — E-R11's key ① becomes agent-holdable, with the freeze-timing judgement that
begin_close carries. **Keys ② (attest exceptions + finalize — the hands that sign the
FS) and ③ (reopen) remain owner/partner human acts; B3's segregation wall stands
unchanged.** The reopen flow's downstream (the ends_on-dated mirror, the superseded
receipt, the successor-FY opening re-tie through `supersede_opening_item` under CLR41,
the superseded-not-deleted pack) was briefed and stands as built.

**(G3) Bank reconciliation — RULED: MATCHING AND ADJUSTMENTS FULLY AGENTIC; THE RED PEN
STAYS HUMAN.** The agent matches statement lines to entries unattended (N×M groups,
zero-tolerance tie, parity and exclusivity walls unchanged — a wrong grouping cannot
bind) and books reconciliation adjustments (charges, interest) under G1's regime.
`except_bank_line` — excluding a line from reconciliation — **remains a human act at
owner floor**; the agent may propose an exception with its reason. The bank schema's
machine-asserted zero-agent-grant law (0038 §ACL, 0040's catalog-probe tail) is
superseded for the new wake verbs; the tail assertions are re-cut to the new roster.
Edge shapes briefed and accepted: split settlements (one line, many invoices), partial
payments (open item carries the remainder), loans-not-settlements (classification with
a no-open-items structural backstop), same-amount ambiguity fails closed to an open
question whose answer lands in the client KB.

**(G4) Reporting — RULED: THE TWO-TIER SPLIT, WITH DEFINITION SELF-APPROVAL.** A free
**analysis sandbox** (the agent computes and draws ad-hoc analyses/charts over the books,
watermarked non-authoritative, structurally unreachable from the seal chain) plus the
formal side where **the agent may promote her own metric-definition drafts to
`firm_approved`** — E-R5/E-R18's distinct-human-approver requirement is superseded.
`canonical` definitions remain migration-only; statutory wording remains owner-signed
data (#43's ceremony posture unchanged); the claim gate stays mechanical. The
open→evaluate→seal→render chain gains an agent lane (the OBO evaluator closure named by
0077's own refusal payload), so the agent can produce a formal pack end to end. Tax
reporting confirmed in scope on the existing plan (SST-02 + the draft computation in
Wave F; **e-filing to LHDN stays a human act** — PRD §4.12/§8 unchanged).

**(G5) Generic-lane breeding design — DISSOLVED** by G1.1 + G1.4 (see above). No
employee/claim identity concept is needed; digest law 19 (no employee counterparty)
stands untouched.

**(G7) The eval harness — RULED: NOT BUILT.** The vision audit's recommendation three
is DECLINED. Quality's only checkpoint is the Wave-G corpus's owner-supplied golden-bar
tie-out. Consequence accepted on the record: per-class accuracy, witness-pair
correlated-failure rate and ask-when-unsure recall will have no instrument; the
monthly harness-ablation backlog item stays blocked on a benchmark that now will not
exist. *Build recommended the minimal three-number instrument riding the corpus;
proposed and declined — dissent recorded.*

**(G8) Cost posture — RULED: METER, NEVER CAP.** Per-call usage is metered and monthly
per-firm spend is visible; **no budget ever pauses automation.** PRD §8's interim
guardrail clause is narrowed from "metering/budgets/concurrency" to metering (+ the
existing concurrency floors, which are engine-protective, not spend-protective).

**(G6) Wave F — RULED: TWO PARALLEL TRACKS, WAVE G UNMOVED.** Track A (the agentic
core: witness-pair extraction → agentic posting → bank/close/reporting/filing agency)
and Track B (the tax engine per the practice map) run in parallel;
`docs/plan/active/wave-f-contract.md` is the contract of record. **The retirement of
the old lanes (autoDraft/rule-post execution, the Azure semantic readers) is a Wave-F
COMPLETION CONDITION — two architectures never enter Wave G**, and the corpus E2E
tests the new one only.

**(G9) The internet lane — RULED: TWO TIERS.** Tier 1, *facts that enter numbers*
(BNM FX rates, SST rates/thresholds, statutory tables): scheduled fetches from named
official sources into **effective-dated policy tables** (digest law 16's pattern —
a used rate is a versioned table row, identical for every client that day, never an
afternoon's webpage). Tier 2, *reasoning support*: an **open web read/search tool** —
no domain whitelist — under three disciplines: fetched content is inert data
(§6.5, already worded to cover it); any web-derived basis is cited in the
receipt/KB (URL + accessed date + quote); prompts prefer official Malaysian sources
(gov.my / BNM / LHDN / RMCD / MASB / MIA) for rules questions as a preference, not a
wall. The structural bound making the open tier safe was briefed: provenance binding
means a web page can never be a posting's source document, and amounts pass the
witness pair — the web can sway judgement, never mint money. ARCHITECTURE §4.1's "no
web tools" sentence is superseded accordingly.

**(P-FX) Forex principle — RECORDED (build rides the FX wave, MYR-only stands).**
Initial recognition at the BNM rate for the transaction date (from the Tier-1
effective-dated table); settlement truth is the bank statement's actual converted
amount, the difference posting as realized FX gain/loss; FYE retranslation of open
monetary balances at the BNM closing rate. Digest law 18 (multi-currency ruled OUT;
non-MYR fails closed until its own post-G wave) is unchanged; this principle seeds
that wave and the FX-lite sitting decision.

**(P-TAX) The tax split — RECORDED.** Statutory rates, thresholds and form arithmetic
live in effective-dated tables and deterministic evaluators (law 16; the calculator).
Tax *judgement and paperwork* — service-group classification, SST-02 drafting and
anomaly narration, add-back judgement in the draft computation, deadline chasing — is
the agent's, at full product force, prepared for human review and human e-filing.

---

#### Supersessions (exact)

- **ADR-015 (write authorization):** "agent-never-signs is the ABSENCE of an entry
  point" is superseded — wake-wrapped posting/matching entry points now exist for the
  agent. The *lane-split-by-GRANT* principle itself STANDS and is the mechanism of the
  new grants. Digest law 2's invariant (d) is amended: the agent's *read* path stays
  structurally read-only; a wake-scoped, allowlisted agentic *write* lane exists.
- **ADR-025 + digest law 5 + law 12:** the human-signed-rule posting authority, the
  "no unbounded/agent-initiated auto-approve" scope and rule-derived autopost
  eligibility are superseded by G1/G1.4. §4.95's nine-control OCR-sales envelope
  retires with the rule lane.
- **Digest law 4 (maker/checker) + WCA-R7, agentic lane only:** unattended agentic
  writes are not routed to a human checker at any amount (G1.2). The HUMAN lane's
  maker/checker, the solo-firm attestation and CLR05 stand unchanged. PRD §2's "the
  agent can never satisfy a human sign-off" narrows to the surviving human acts: close
  keys ②③, `except_bank_line`, opening-seed approval, statutory wording, `canonical`
  definitions, capability grants, e-filing.
- **Digest law 8 (wiki informs, never decides), judgement half:** on the agentic lane
  the knowledge layer now lawfully informs the judgement that IS the authority; the
  bit-identity guarantee is superseded there. The mechanical half stands: no DB
  gate/bound/floor function reads wiki.
- **ADR-047 (reader roster) + the #25 registration:** superseded by G1.1 as stated.
  "Agreement, not confidence" and the refusal-on-disagreement posture STAND.
- **Digest law 13's roster wording + law 14's reader half:** the pair is the LLM
  witness pair; the bank CHAIN requirement stands (C3). `request_reextraction`'s
  human-only invocation is untouched tonight (F-A1 may revisit at its own design).
- **WB-R2 + ADR-064's anti-circular exclusion:** moot with the rules machine (G1.4).
- **E-R5 / E-R18 (distinct approver for metric definitions):** superseded (G4);
  `canonical`-by-migration and E-R14's wording governance stand.
- **E-R11 key ①:** agent-holdable (G2); keys ②③ and B3 stand.
- **The bank zero-agent-grant law (0038/0040) :** superseded for the new verbs (G3);
  the tail probes re-cut, not deleted.
- **PRD §8 budgets clause:** narrowed to metering-only (G8).
- **ARCHITECTURE §4.1 "No shell/psql/file/web tools":** the web read tool exists under
  G9's disciplines; the rest of the sentence stands.
- **Vision-audit recommendations:** ① interview model layer ADOPTED (Wave F);
  ② audited freeform read ADOPTED (Wave F); ③ eval harness DECLINED (G7).

#### What stands (named, so silence is not read as supersession)

PRD §6.1 in full (the DB owns every authoritative number; the witness-pair agreement
predicate, the close math and the reporting evaluator are its instruments) · invariants
(a) client attribution ≥0.95, (b) provenance binding, (c) wake-kind allowlists ·
balance trigger, reverse-not-delete, append-only history, RLS + EXECUTE-only ·
idempotency keys + durable runs · close keys ②③, B3 segregation, CLR41 opening tie,
CLR19 closed-period wall · statutory wording owner-signed, `canonical` by migration,
the claim gate and numeral wall · `except_bank_line` human · e-filing human · law 16
(effective-dated tax facts; now also the FX table's pattern) · law 18 (MYR-only until
the FX wave) · law 19 (no employee counterparty) · law 21 (the WD-R5/R8
calendar-poster doctrine — **NOT REACHED tonight**; the FA/recurring belts keep their
admin-signed authority + first-fires-draft ramp unless separately ruled) · law 59
(the RS enrichment trap) · the pinned ids · the frozen prior build and spike schemas ·
review law (ADR-061 uniform ladder) and the docs-only lane (ADR-0069).

#### Not reached (honest boundary — open for their own sittings)

R1 (`closing_transfer`/SST, task #17 Fix A) · the Wave-G corpus decisions OD-1..OD-11
+ P-1..P-3 (the corpus doc's step-4 "standing rules earn autopost" wording now needs a
G1-alignment amendment at that sitting) · CI economics overhaul · FX-lite build timing
· `request_reextraction` invocation · the calendar-belt doctrine above.

#### Consequences

Wave F is re-scoped by `docs/plan/active/wave-f-contract.md` (two tracks; the
retirement completion condition). The Wave-E θ/0057 grant walk-backs reverse per their
own headers (a one-line grant + roster pin each) now that shipped agent-lane consumers
are chartered. PROGRESS.md carries the N1–N6 deep-scan findings and the dispositions
above. The digest is re-trued against this entry.
