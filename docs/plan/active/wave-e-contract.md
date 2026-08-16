# Wave E contract — periods + statements + the reporting engine (E-R1..E-R14)

> **RATIFIED 2026-08-08 (ADR-065).** Grilled with the owner in Chinese over one session
> (session 43d6f6cf / ab50edaf), recommendations attached to every question, every ruling
> confirmed explicitly; the live grill record is the session transcript + the working draft
> (`~/.clara-tools/wave-e-grill-rulings-draft.md`, superseded by this document). Evidence
> dossiers of record: `docs/plan/research/wave-e/q4-computed-figures-evidence-2026-08-08.md`
> (the law-amendment debate) and `fs-template-design-codex-2026-08-08.md` (the template/
> chart architecture). **Never re-grill a ruling here; supersede by a new ADR only.**
> Satisfies 7A-R10 (the grill opened only after §7-A closed at ADR-064).

---

## E-R1 — Boundary

Five candidate classes were put to the owner; ruled:

1. **IN CONTRACT (acceptance-bearing):** periods + statements core + the five named debts —
   WD-R11 closing stock · the segment-aware FA tie · the WD-R6 depreciation close gate ·
   MPERS presentation wording · the client-facts trio (E-R12).
2. **IN CONTRACT, FIRST STRIKE:** the F6–F9 fix batch (tasks #31–34) as one batch, full
   Law-1 ladder. F6 merges with the ADR-062 extraction-recovery door (ONE item). The F7 fix
   unblocks the held KONG CHENG pair (RS rows 1+12); F6 unblocks Gate P's four waiting
   manual bills.
3. **DESIGN-ONLY in E:** the settlement-corroboration door — shape ratified at E-R13,
   build rides Wave F.
4. **RULED AND RECORDED, NOT BUILT:** the third-reader roadmap (#25) and the four
   NOT-REACHABLE controls (details below, "Roadmap registrations").
5. **NOT IN E AT ALL:** the owner's UX-debt list — ALL of it goes to Wave G (E-R10; the
   proposed E-side painkiller lane was explicitly declined).

## E-R2 — Close gates: the three-drawer model

Reconciles PRD journey-7's "pre-close gates" (rated "structural" by the rebuild plan's Wave-E
line) with ARCHITECTURE §0 "close-readiness is visibility-first" via fail-closed +
attested human override:

- **Drawer 1 — ABSOLUTE (no override, nobody):** the serialized close lock (advisory lock
  per client; no writer escapes into the FY mid-close) · continuity math (P&L→retained
  earnings roll; opening(n+1) = closing(n); tie asserted) · the reverse/re-open ordering
  guard (no reversing FY(n) under a live FY(n+1) close) · **the DB-owned control tie-outs
  at the close boundary** (AR control = Σ open items · AP control · the FA register tie,
  including its segment-aware Wave-E rebuild · **the bank reconciliation IDENTITY** —
  book balance = statement balance ± the recorded open items, the tie-out PRD §4 item 8
  makes a close gate) — these
  are arithmetic identities the DB owns by construction, so a mismatch is a DEFECT, not a
  judgement item: no attestation path exists, and an UNKNOWN/ERROR tie state — or a
  non-zero unexplained identity difference — fails closed exactly like a mismatch.
- **Drawer 2 — DEFAULT-REFUSE, PER-ITEM ATTESTED OVERRIDE** (who/why/when written into the
  close receipt, permanent). All five named checks live here:
  1. depreciation not run through FY end — **this is the WD-R6 answer: the advisory
     upgrades to default-refuse-attestable, NOT absolute**;
  2. goods-trading client missing a closing-stock entry (the WD-R11 completeness check);
  3. unapproved drafts dated in-period;
  4. open bank-reconciliation items;
  5. uncoded documents.
- **Drawer 3 — ADVISORY ONLY** (readiness panel, never blocks): soft signals.

*(Tie-out enumeration completed at review round 3; the assignments follow the ruled
drawer principles — arithmetic-wrong is drawer 1, professional-judgement is drawer 2.
Drawer 2's "open bank-reconciliation items" means the evidence-dependent states —
unmatched statement lines, missing statements — never the DB-owned tie identities,
which live in drawer 1. PRD journey-7's "tie-outs clean" is thereby a gate, not prose.)*

Rationale of record: all-hard ⇒ one stubborn unmatched RM50 statement item makes a client
permanently unclosable and users route around the system; all-soft ⇒ decoration. The
middle drawer is audit working-paper practice (exceptions allowed, partner-signed,
filed). (Round 4, precision + disclosure: the rulings draft's rationale read "RM50 recon
diff"; reworded here to "unmatched statement item" because an arithmetic difference in a
DB-owned identity is drawer 1. The ruled drawer PRINCIPLE is unchanged — only the example
is disambiguated. What is attestable is the EXISTENCE of unmatched/evidence-dependent
items — never an arithmetic difference in a DB-owned identity.)

## E-R3 — Locking granularity

- **The ANNUAL close is the only true lock**; the three drawers mount on it.
- **Months never lock.** A month gets a SNAPSHOT: run the readiness checks, mint the
  management-accounts artifact (timestamped, durable, reproducible). Books stay open.
- **Staleness labels:** any audited mutation whose effect intersects an already-
  snapshotted period — posting, reversal, allocation, correction, closing-stock
  adjustment, anything that moves a number the snapshot presented — marks the artifact
  STALE **in the same audited transaction** (Invariant-4 discipline: no asynchronous
  window in which a stale report reads as current). Artifact bytes stay immutable;
  staleness is a separate append-only assessment row. Change is free, silent change is
  impossible.
- **FY windows are DATE RANGES, not "12 months"** (first FY up to 18 months under CA 2016
  is native; `fy_end_month/day` nullable-default-12/31 handling is part of the build).
- No month-lock is built and no slot is reserved; a future month lock is a lock on a
  shorter range (small later migration IF a real client need appears). A lock lives in the
  DB, never in agent discipline — "the agent promises not to post into May" is not a lock.

## E-R4 — THE LAW AMENDMENT (PRD invariant 1 reworded)

> **"The DB owns every AUTHORITATIVE number. The LLM may propose or independently check a
> calculation, but no model-generated numeral enters a durable report unless a versioned
> deterministic evaluator reproduces it from DB-owned inputs."**

Supersedes the blunter "the agent never computes a figure" phrasing. Ratified on a
three-lane evidence dossier (Anthropic docs · OpenAI docs + arithmetic benchmarks · a
Codex gpt-5.6 adversarial debate) — see the research file. Key evidence pins, stated at
their own confidence: the cited benchmarks show NONZERO digit-level arithmetic errors at
every tested scale, with wrong answers that look plausible rather than near-miss (no
Clara-specific production error rate exists — none was claimed); both vendors provide and
steer toward code-execution tools for precision-sensitive math (neither states a blanket
in-context ban; Anthropic's own line is threshold-based); the prediction that SEMANTIC
errors (period/definition/population/sign/stock-vs-flow) will dominate and correlate is
the Codex position paper's engineering judgment, ADOPTED as a design premise; CA 2016
s.245 seven-year explainability + MIA due care. The PRD §6 and CLAUDE.md texts are
amended in the same PR as ADR-065. Narration uses placeholder substitution — the model
never retypes figures into prose or charts.

**Binding interpretation (round-3 cross-model review; closes the lawyer holes without
touching the ratified sentence):**
- **"Authoritative"** = every product-presented or persisted quantitative or assurance
  claim. Transient UI is NOT an escape hatch — "product-presented" reaches it directly.
- **The ratified sentence is a PERMISSION grant** (proposing and checking are lawful),
  not a relaxation. The retained, stricter operational law — PRD §4 item 14 ("never
  model-computed"), PRD §8's exclusion table ("Model-computed numbers in any artifact"),
  ARCHITECTURE §6's render boundary — **GOVERNS wherever the two could diverge.** The
  asymmetry is deliberate.
- **"Reproduces … from DB-owned inputs" means ORIGINATES:** the evaluator computes the
  value from source facts and approved, versioned constants. A model numeral is never an
  evaluator input; matching or echoing a model-produced numeral that was previously
  stored is NOT reproduction.
- **A model check emits a discrepancy signal only** — never a figure that anything
  downstream may render.

## E-R5 — The typed metric algebra ("乐高厨房")

*(Architecture-of-record: `docs/plan/research/wave-e/q4-computed-figures-evidence-2026-08-08.md`, Lane 3 §5 — the ratified Codex verdict; this section binds, that file details.)*

- A closed set of typed calculation primitives (`measure`, `sum`, `average`, `lag`,
  `subtract`, `divide`, `days_in_period`, `percent_change`, …), each deterministic in the
  DB; exact-decimal evaluation; money stays `bigint` cents.
- Every intermediate value is TYPED and SCOPED (currency/days/ratio; point-in-time vs
  flow; period; entity; basis). **Incompatible compositions are rejected mechanically**
  (closing-balance ÷ annual-flow does not assemble; the validator names the fix).
- **The catalog = approved, named, versioned, effective-dated definitions IN the algebra**
  (gross margin, growth, current/quick ratio, debtor/creditor days, stock turnover,
  gearing, expense ratios, …) — not hand-written per-metric SQL functions.
- The LLM may freely COMPOSE catalog items and AUTHOR novel definitions as formula trees;
  a novel definition is a DRAFT until human approval, then becomes a firm-approved
  reusable definition. Statutory/externally-issued outputs are restricted to canonical or
  firm-approved definitions; one-off management analysis may be looser but is labelled.
- The validator proves syntax/types/scope/cost/provenance completeness; it does NOT claim
  a novel definition is professionally appropriate — that is the human approval.
- **Per-cell provenance is mandatory.** Every evaluated cell records: definition version /
  normalized formula hash · periods · account-set + presentation-map versions · input
  values and entry/document references · books watermark · evaluator version · exact
  result and displayed rounding · the model proposal · the human approval · supersession
  links. This is the record that answers "where did this 12.3% come from" seven years
  later — the mechanism the E-R4 amendment rests on.
- **Edge policies are defined explicitly, never left to the evaluator's discretion:**
  division-by-zero, negative denominators, missing data, sign normalization, and rounding
  each get a named, versioned policy.
- **Definition lifecycle (the state matrix, completed at review round 3):**
  `draft` — executable for preview; may render ONLY into non-statutory management
  artifacts and ONLY under the mandatory "uncertified" watermark; never statutory →
  `firm_approved` — human approval bound to the exact content hash/revision; reusable;
  statutory-eligible alongside `canonical` — · `canonical` (product-curated, MASB/
  textbook definitions) · `superseded` / `rejected` (immutable history, never deleted).
  Composing already-approved metrics ad hoc is composition, not a new definition;
  SAVING a composition mints a new `draft`. Approval/publication ride named audited
  functions under the standing role floors and PRD §2's segregation model; direct DML
  stays revoked (invariant 10).

## E-R6 — The dormant correction guards POWER ON

When the close model is born, `_correction_period_state` (0007's permanent stub) goes
live: corrections to entries in a CLOSED period must route through the formal
reverse/re-open path. The three dormant guard branches (0007/0009/0027) activate as
designed; their activation is a named acceptance item (the sandbox battery must exercise
them deliberately).

## E-R7 — Full scope, ONE campaign

The whole ruled scope ships in Wave E as one campaign ("一口气全做"): periods + close ·
FS pack + reporting engine + algebra + catalog · the LLM ad-hoc authoring lane. No
deferral valve. Build lanes run in parallel; acceptance receipts land in natural
dependency order (statements cannot be accepted before a close model exists — dependency,
not slicing). Bug posture accepted with eyes open; containment = fail-closed +
draft-until-approved + the full ADR-061 uniform ladder per judgement PR.

## E-R8 — Report design/format is user sovereignty

Management reports: layout, grouping, comparatives, language, branding fully
user-directed; the LLM designs layouts on request; layouts persist as registered
templates. Two fixed floors: every cell's figure comes from the DB/algebra, and every
render is a durable reproducible artifact. Statutory packs: structure is prescribed —
the product never blocks a custom cut, it strips the compliance claim honestly
(PRD §4 item 14 — the honest-FS law), and the claim cannot be smuggled back via
filename/cover/metadata.

## E-R9 — Acceptance corpus map

| Machine | First strike | Notes |
|---|---|---|
| Full synthetic battery | Sandbox (RPA) | close → reopen → guard activation → abuse drills |
| Closing stock (WD-R11) | **Sandbox synthetic goods-trader fixture ONLY** | no real goods-trading client exists; **NAMED DEBT:** the first real goods-trading client's onboarding carries the real acceptance |
| First REAL close | **BEE FY2025** | the drawer-2 depreciation gate's first real firing pulls the 11-period catch-up approval through (draft `3c05ab82`); **the close-time FA continuity roll** (FY2025 closing NBV → FY2026 opening; the rolling posture's task #72) fires for real in the same act — this does **NOT** discharge WD-R14's *opening* carry-down deferral, which still needs a client that owned assets at opening (the backlog's measured reason, `PROGRESS.md`). **TRUED 2026-08-16:** `3c05ab82` is already `approved` (the E-R9 live-fire), and the BEE FY2025 close itself — this row's remaining machinery — defers WHOLESALE to the Wave-G reset+rebuild per the owner's 2026-08-16 ruling (`PROGRESS.md` Next 2); the row's acceptance content is unchanged, only its WHEN moved |
| MPERS company-format FS, real corpus | **RPR historical FY** | Sdn Bhd, 9 real months to the sen; strike-off companies legitimately prepare historical accounts |
| Snapshot + staleness witness | **RS** | 19 approved real invoices; snapshot a month, post into it, watch the label |
| Sole-prop FS format | BEE | convention-labelled, never MPERS-claimed (E-R14) |

**Acceptance discipline (added at review round 3):** this table names the CORPUS, not the
oracle. Before each acceptance runs, the build mints a falsifiable acceptance matrix —
ruling → precondition → action → exact DB/artifact assertion (refusal tokens, receipts,
hashes) → negative case → implementation owner → independent verifier — at the
`wave-7a-acceptance-h1/h2.md` evidence grade. Coverage must include role/RLS boundaries,
concurrency, idempotency, the evaluator edge policies, number-injection attempts, reopen
ordering, guard-activation (E-R6), and byte-reproduction of sealed artifacts.

## E-R10 — The UX-debt register (recorded here; ALL of it → Wave G)

The owner's restated list (no prior durable record existed): ① no userflow at all — no
signin/signup, no firm-setup journey; the dashboard is disconnected modules, "basically
nonexistent" as a coherent surface; ② no raw-document click-through behind entries/drafts;
③ hand-minted 60-minute JWTs (`mint_session_jwt.mjs`). This register is Wave G's opening
backlog; Wave E ships none of it (ruled; the painkiller lane declined). **Claims module**
(expense claims) is NOT UX debt: the accounting class (employee paid-on-behalf, kin to the
D-b staff-advance register) registers to **Wave F**; the submission/approval surface to
**Wave G**.

## E-R11 — The three keys + configurable authorization

- **Key ① prepare** (checks, lists, recon, chores): bookkeeper+.
- **Key ② close + sign drawer-2 attestations** (one key — the hands that sign the FS):
  owner/partner level by default.
- **Key ③ reopen:** owner/partner level; stated reason + named correction target + reopen
  receipt + the ordering guard.
- **Firm-configurable authorization list** for keys ②③ — the two are SEPARATELY
  grantable capabilities; only the firm owner grants/revokes membership, and every
  grant/revoke is itself an audited act; factory default = owner/partner only. **The
  agent holds ZERO keys structurally** — the verbs do not exist for the agent's DB role;
  list membership cannot change that.
- **Segregation of duties — PRD §2's existing hard gate governs the close itself:**
  year-end close is on the high-stakes lane, so where the firm has ≥2 eligible humans
  the closer must be a DIFFERENT human from the last human editor/preparer; a solo firm
  records the explicit self-approval attestation (PRD's solo branch). Preparing (key ①),
  attesting exceptions + closing (key ②), and reopening (key ③) are distinct
  capabilities in the DB, so the separation is checkable, not prose.

## E-R12 — The client-facts trio

1. **F-1 time-travel guard: REFUSE outright, no override.** An allocation whose effective
   date predates its target item's date is refused at `allocate_payment`/
   `allocate_receipt`. Money-before-bill economics is already served by the advances
   machinery. (RPR's two documented historical scars stand and self-heal at
   as-of ≥ 2026-08-01.)
2. **entity_type surfacing:** context-pack key + coding/drafting prompts carry it (the
   BEE sole-prop/EQUITY lesson made structural).
3. **MSIC capture door:** a named audited entry door (who/basis/when), then the three
   parked codes enter through it (RPR 68109 · RS 82110 · BEE 74101), discharging the
   ADR-062 sanctioned-lane debt.

## E-R13 — The settlement-corroboration door (design of record; build = Wave F)

- **Mechanical layer (unattended):** a settlement corroborates a tax-silent invoice ONLY
  on same-resolved-counterparty + exact-to-the-sen amount + exactly ONE open candidate.
  Zero tolerance. Corroboration buys THE settled draft's unattended-post eligibility
  only — all nine controls still run; floor economics + the anti-circular law untouched;
  no new autopost class is created. A late settlement whose invoice sits in a CLOSED FY
  is HELD and surfaced on the exception panel; entering the closed year takes the formal
  reopen path (E-R6 / key ③) — a drawer-2 attestation never posts into a closed year.
  *(Round 3: the rulings draft's looser "drawer-2 surfacing" phrasing is resolved toward
  E-R6's ruled reopen path, which governs corrections into a closed period.)*
- **Supersession registered NOW, activated only at the F build:** this door, when built,
  NARROWS 7A-R3's blanket "tax-silent never autoposts" to "never WITHOUT settlement
  corroboration". The Wave-F build ADR executes that narrowing and must define a COMPLETE
  alternate control-4 branch — control 4 today requires explicit net AND tax plus a
  second document-internal numeric anchor, and a tax-silent document fails BOTH halves,
  so the branch must supply: (a) **positive, effective-dated tax-status evidence** that
  the document is lawfully tax-silent (e.g. a non-SST-registrant status row — never
  absence-read-as-zero), standing in for the explicit-tax identity, AND (b) the
  bank-external settlement anchor standing in for the second numeric anchor, plus the
  post-time state/predicate that carries both, plus negative tests for ambiguity and
  race shapes. Until that ADR lands, 7A-R3 stands whole and no tax-silent document posts
  unattended.
- **Agentic layer (attended):** ambiguity (partial payments, combo settlements, multiple
  candidates) routes to an agent-built SUGGESTION card carrying evidence + client-KB
  reasoning; the human's one-click approve IS the human witness; posting walks the normal
  attested path. The model may never be the independent witness for its own draft.
- **Roadmap:** approved suggestions are votes; a recurring combo pattern may LATER earn
  its own unattended envelope (floor + controls + anti-circular) — the next earned class
  after F. Direction recorded, nothing built.

## E-R14 — The FS golden template + style/chart regime

**Golden wording source:** MASB official, dual-version effective-dated — MPERS(2016) for
periods beginning before 2027-01-01; MPERS(2025) (issued 2025-10-10, based on IFRS for
SMEs 3rd ed.) for periods beginning on/after 2027-01-01, with the 2016 text withdrawn at
that same boundary — live 2025/26 clients stay on MPERS(2016) wording. The wording tables are BORN two-versioned (the tax-table pattern). MASB's own
illustrative FS (`MPERS_2025_BC_IE.pdf`) is the primary illustrative-source CANDIDATE (standard-setter provenance; existence confirmed by metadata only) — automated
extraction failed on it (the encoding is unverified; only the failure was observed):
**a manual pull + HUMAN verification is REQUIRED before any wording enters the policy
tables** (absence-is-not-evidence applies).
KPMG's free illustrative FS is the cross-check; the MIA paid illustrative book is
deferred-until-needed (ask the owner then). **Sole-prop format: no authoritative source
was FOUND in this search** — treated as UNRESOLVED, not proven-absent; the build's
golden-source step includes a positive primary check (LHDN / MIA / ROBA materials)
before the convention label is finalized. Interim: practitioner convention (P&L + SoFP +
capital-account movement), honestly labelled convention-based, never MPERS-claimed.

**The six-layer template model** (full design: the Codex research file): statutory
authority profile (curator-only, never firm/LLM-editable) → verified locale packs →
firm house style (owner-sovereign; LLM drafts, human publishes) → the registered firm
template (immutable binding = the firm's legitimate "golden variant") → report-instance
overrides → management templates (free). Claim behavior is a per-instance assessment
(`eligible` / `stripped` / `not_applicable` / `failed`): `stripped` never blocks
generation; the label comes from versioned claim-policy rows; the product's own claim
wording is "presentation-profile checks passed", never a legal certification — issue
remains a professional human act, and the attestation binds the exact sealed artifact
hash.

**Charts:** closed typed AST specs; no inline values, SQL, JS, or user-authored formulas;
every plotted series resolves to approved metric versions evaluated in the DB against a
pinned snapshot and PERSISTED before rendering; the renderer maps points to pixels only;
named axis policies (no arbitrary clipping); every chart carries an accessible same-source
data table; firm-specific metrics enter via the E-R5 approval lane.

**Seven-year reproducibility:** a sealed artifact pins spec/profile/wording/style/chart
versions + books snapshot + dataset hash + evaluator versions + renderer image digest +
font/asset hashes + pre-sign PDF hash. The SIGNED original is retained and retrieved,
never regenerated; the pre-sign bytes are reproducible byte-exactly. Reporting evaluators
get workflow-style immutability (`_vN`, never CREATE OR REPLACE a referenced body — the
freeze-lint family extends to them). Rendering runs in a dedicated offline worker (not
Pages/dashboard); the recipe joins the DR battery.

---

## Roadmap registrations (ruled, recorded, NOT built in E)

- **Third reader (#25):** an LLM may join extraction as an ADDITIONAL independent witness —
  never the sole one; coordinates stay with the layout reader; model+version recorded per
  read. Scheduled into Wave F planning.
- **Four NOT-REACHABLE controls** (`polarity_unverified` · `direction_unproven` ·
  `buyer_mismatch` · `customer_unresolved`): accepted as defense-in-depth; no dedicated
  fixtures/harnesses. When a real feature later opens a door (bulk import, counterparty
  merge, landscape change), that control's live-fire test is written into THAT feature's
  acceptance.
- **Suggestion-earned combo settlement:** post-F candidate earned class (E-R13).
- **Month lock:** build only on a real client need (E-R3).
- **Real closing-stock acceptance:** rides the first real goods-trading client (E-R9).
- **MIA illustrative purchase:** only if free golden sources prove thin (E-R14).
- **FX-lite (ADR-062's prioritization question):** passed through the E grill UNRULED —
  not silently dropped; it is an explicit Wave-F planning decision (purchase-side foreign
  bills over effective-dated BNM rate tables, DB-computed conversion citing the rate row).

## Standing laws that bind this wave (cited, not restated)

ADR-061 uniform review intensity + the three evidence laws (2026-08-06) · migration
numbers claim at merge · the ceremony/deploy laws (statement_timeout in-session ·
positive deploy reads · `--lock-deployed`) · workflow immutability (Appendix A) — now
explicitly extended to reporting evaluators (E-R14) · Malaysian accounting/tax facts live
in effective-dated policy tables, never prose · the enrichment trap (RS's 10 name-only
customers are NEVER enriched with registrations) · canary `daba7f2e` never answered · B2
witness `d023b48c` never approved.

## Derived implementation notes (recorded so the never-re-grill banner does not harden them into rulings)

Four items in this contract were not separately ruled in the grill; each is a faithful
derivation from standing law or the ratified design records, and a builder may adjust
their mechanics without re-opening a ruling: the `fy_end_month/day` nullable-default
handling (E-R3; the columns and coalesce defaults are 0041's) · the money-stays-
`bigint`-cents restatement (E-R5; PRD invariant 6) · partial payments named in the
agentic layer's trigger set (E-R13; the ruled principle is "ambiguity routes to
suggestions", of which a partial payment is one shape) · the freeze-lint extension to
reporting evaluators (E-R14; the ratified requirement is evaluator immutability — the
lint is the natural enforcement instrument, mirroring Appendix A).
