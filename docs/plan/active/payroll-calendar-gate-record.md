# F-T2 · PR-0 — the gate record

> **The gate ran 2026-08-23** against design **v1** (`payroll-calendar-design.md` + the survey and
> the annexes), Track-B's payroll-deadline-calendar design set. Six independent lenses read the
> set — **accounting** (×5), **security** (×5), **build** (×5), **law** (×1) and **live-truth**
> (×1) — each finding then re-attacked by an independent verifier that did not raise it.
>
> **Verdict: the seams hold — R-L22's seeded-table architecture, the `proactive`/speak-never-act
> wall, and the documents→JV untouched-list all survived attack — but the applicability layer and
> the coverage predicate carried eleven real defects, three of them blockers.** Three blockers and
> four materials are **owner-reserved**: they require an owner ruling on product shape, not a
> mechanical correction, and are recorded as open cards below rather than resolved unilaterally.
> The other eleven distinct corrections are folded into **v2**
> (`payroll-calendar-design.md`, `payroll-calendar-annexes.md`, `payroll-calendar-survey.md`).
>
> **Counts: 3 blockers · 19 materials · 5 nits CONFIRMED · 6 REFUTED** (refuted claims are
> recorded here by count only — the raw gate transcript's itemized refutation text was not
> carried into this fold pass's data feed; pull the transcript directly if the particulars are
> needed). Every CONFIRMED finding's `verify_grounds` was independently re-derived by this fold
> lane against every cited repo file before its disposition below was decided — none was folded
> or reserved on the finding's own say-so.

---

## 1 · What was attacked and HELD

- **R-L22's one-fact-one-path architecture holds.** `clara.statutory_deadlines` as F-A4's seeded,
  versioned table with F-T2 contributing rows and a consumer only — no carrier, no oracle, no
  second clock — was attacked on every angle (D-01) and stands unchanged.
- **The speak-never-act wall is real, only mis-tested.** `proactive` is allowlisted for exactly
  one function and granted nowhere else (P-13/P-14 hold); the gate's one finding here (**M16**) is
  that the design's own battery cell named the wrong mechanism, not that the wall is weak.
- **The documents→JV untouched list is honest.** No finding disturbed §3.9's claim that F-T2
  wraps, recuts or re-grants none of the coding-lane bodies.
- **Nine of the nine seed rows' due arithmetic is sound** — battery cells 7/8/9/9b were not
  contested, and the weekend two-date shape (R-L24) is architecturally right even where one
  finding (**M10**, owner-reserved) questions its statutory direction for three regulators.

---

## 2 · Per-index dispositions

Indices are 0-based into the raw gate's `confirmed[]` array for the FT2 set (24 items: 3
blocker, 19 material, 2 nit); three more nits sit in a separate `nits[]` array, listed at the
end. Label = severity initial + index (e.g. `M2`), matching the gate record's own convention.

| index | headline | disposition |
|---|---|---|
| **M0** | Annex C's P-15 predicted `client_fact_keys` holds two members at the frontier; it holds four (`0056:1233`, `0062:172` already merged) | **FOLDED** — design §2, annexes P-15 corrected to four members |
| **B1** | `documents.financial_date` has no production writer for `payroll_summary`; `covered` is permanently unreachable | **OWNER-RESERVED** — card below |
| **M2** | `undated_count` carries no period bound; one undated filing silences every later period's `missing` forever | **FOLDED** — D-20, `filed_at`-bounded per period |
| **M3** | The "period" PCB/EPF/SOCSO/EIS all key on is never defined, and the four obligations anchor on three different months | **OWNER-RESERVED** — card below |
| **M5** | CP58 asserts an unconditional apply verdict with no fact for whether the client pays agent/dealer/distributor incentives | **OWNER-RESERVED** — card below (with M21) |
| **M6** | The entity-type applicability matrix diverges from its own cited source: wrongly includes `society`, cannot express `badan amanah` | **FOLDED** — D-21 |
| **M7** | `payroll.cp8d_route` is minted but gates nothing; Form E + C.P.8D is one collapsed column | **FOLDED** — D-22 |
| **M8** | No carrier for a levy-exemption PERIOD; an HRD Corp-exempt client is chased for a levy it may not owe | **FOLDED** — ungraded claim dropped from the append-only seed row, registered as **R-7** |
| **M9** | `effective_due` is absent from the notice payload; the notice and `/calendar` can show different dates for one obligation | **FOLDED** — D-24 |
| **M10** | The weekend `unverified` roll-back for LHDN/PERKESO/HRD Corp never searched the Interpretation Acts' computation-of-time provision | **OWNER-RESERVED** — card below, feeds **OQ-7** |
| **M11 / M18 / M19 / M20** | Four lenses (accounting/security/law/build), one defect: PR-1's DDL gate names F-A4/PR-1b; R-L22 assigns the DDL to PR-1c | **FOLDED as ONE correction** — D-25, applied at every cite |
| **B12** | `wake_open_question` has no callable door under either identity the producer's rung B2 can hold | **OWNER-RESERVED** — card below |
| **M13** | Rung B2's applicability read has no door — `client_facts`' RLS admits only `clara_authenticated`, not `clara_runtime` | **FOLDED** — D-23, `clara.payroll_applicability` named |
| **B14** | The coverage verdict's `covered` arm is unreachable on the real estate; cell 4's "dated sibling" is constructible only via a rig-only fixture | **OWNER-RESERVED** — card below (same root as B1) |
| **M15** | `covered` trusts an LLM's `document_kind` classification with no human attestation and no registered risk | **FOLDED** — registered as **R-8** |
| **M16** | Battery cell 1 names `assert_wake_allowed` as the refusing mechanism; the call dies at the GRANT before that body runs | **FOLDED** — D-26 |
| **M21** | Same CP58 defect as M5, corroborated from the build lens | **OWNER-RESERVED** — folded into the same card as M5 below |
| **M22** | The entity-type matrix is non-exhaustive: `entity_type = 'other'` matches no defined row | **FOLDED** — D-21 (same table as M6) |
| **M23** | §6's acceptance claims a real-books round is reachable via ROME PROPERTIES' payroll JVs; the predicate anchors on documents, and ROME PROPERTIES' payroll documents are ruled excluded from ingestion | **FOLDED** — D-27 |
| **nit** (idx4) | The mechanics annex/battery carry eight obligation codes, omitting `form_cp8d_praisi` | **FOLDED** — A.1/A.2/cell 7 corrected to nine |
| **nit** (idx17) | §2's binding table and P-15 both say `client_fact_keys` has two members today | **FOLDED** — same correction as M0 |
| **nit** (contract cite) | Design and survey cite the F-T2 contract item at `wave-f-contract.md:405`; the item is at `:424` | **FOLDED** — both cites corrected |
| **nit** (Tier-1 stale) | "Tier-1 closes at three tables" is stale; R-L25 reopened it for two more (F-T3's) | **FOLDED** — design §2/§7, annexes OQ-8, survey F-P9/§4 corrected |
| **nit** (cell 5 self-reference) | Battery cell 5 asserts a property of rows the same producer wrote — a convention, not a structural wall | **FOLDED** — cell 5 annotated as a checked convention, matching §3.5's own honesty |

---

## 3 · Folded corrections — decision register

Full grounds for each are in `payroll-calendar-annexes.md` Annex B, decisions **D-20** through
**D-27**, plus risks **R-6/R-7/R-8** in `payroll-calendar-design.md` §7. Not repeated here in
full; one line each:

- **D-20** — `payroll_period_coverage`'s `undated_count` bound by `document_filings.filed_at` to
  the period being evaluated (**M2**).
- **D-21** — the applicability matrix made total over the live 8-member `entity_type` enum;
  `society` and `other` route to `not_evaluable` rather than a wrong or undefined verdict
  (**M6/M22**).
- **D-22** — `payroll.cp8d_route` threaded into the matrix: it selects between `form_e_cp8d` and
  `form_cp8d_praisi` wherever Form E + C.P.8D applies (**M7**).
- **D-23** — `clara.payroll_applicability(p_client uuid)` named as a second new SECURITY DEFINER
  read, closing rung B2's missing door (**M13**).
- **D-24** — `effective_due`/`holiday_rule`/`working_day_basis` added to the notice payload;
  `weekend_label` (undefined anywhere in v1) dropped (**M9**).
- **D-25** — PR-1's blocking gate corrected from F-A4/PR-1b to F-A4/PR-1c everywhere the design
  set misstated it — one correction, applied at all four cites (**M11/M18/M19/M20**).
- **D-26** — battery cell 1 corrected to assert the grant matrix / `42501`, not
  `assert_wake_allowed`, matching the estate's own T17 idiom (**M16**).
- **D-27** — §6's acceptance claim withdrawn: no real-books round is reachable for the coverage
  predicate today; PR-4 is labelled synthetic per ADR-048 (**M23**).
- **R-7** (risk, no decision needed) — the ungraded HRD Corp exemption-period claim dropped from
  the permanent `hrdc_class` seed description; the gap registered instead (**M8**).
- **R-8** (risk, no decision needed) — the LLM-classification trust surface on `covered`
  registered; §5's review-law-1 pass on `payroll_period_coverage` must cover it (**M15**).
- `client_fact_keys`' stale two-member count corrected to four at the frontier throughout
  (**M0**, nit idx17).

---

## 4 · Owner items

None of these blocks PR-0's closure; each needs the owner's ruling before the PR it gates merges.
The design proceeds on the stated fail-closed default in the meantime.

| # | the question, in one line | fail-closed default the design proceeds on | needed before |
|---|---|---|---|
| **OC-1** | **B1/B14 — the coverage predicate's `covered` arm is structurally unreachable.** No production writer ever sets `documents.financial_date` on a `payroll_summary`; every filer gets a permanent `not_evaluable` chase with a "date the document" remedy that has no door. Repair needs either a new document-dating human authority (contradicting §3.9's "mints no new authority") or a re-anchored predicate (rewrites §3.3, D-06, R-4, battery cell 4, §6) — a design-shape change, not a build detail. | **`not_evaluable` ships as designed**; every complying client sees a monthly `payroll.document_undated` notice with an unbuildable remedy until ruled. | PR-2 (the coverage predicate's judgement logic) |
| **OC-2** | **M3 — the statutory "period" PCB/EPF/SOCSO/EIS all key on is undefined**, and the four obligations anchor on three different months (PCB: deduction month; EPF: wage month; SOCSO/EIS: payment month) against one shared `day_of_month_following` rule. | **The single undefined period key ships**; an arrears-payroll client can see a statutory date computed one month early. | PR-1 (the seed migration; the period-basis column, if ruled, is additive to A.1) |
| **OC-3** | **M5/M21 — CP58 ships an unconditional "applies" verdict for every company**, with no fact for whether the client pays agent, dealer or distributor incentives — the design's own OQ-4 already names this cost and took neither of its two honest exits. | **CP58 applies unconditionally, as OQ-4 provisionally adopted it** — every company client (the majority of BELCORT's book) gets the annual chase regardless of whether it owes the obligation. | PR-2 (the chase producer) |
| **OC-4** | **M10 — the `unverified` weekend roll-back for LHDN, PERKESO and HRD Corp never searched the Interpretation Acts 1948/1967 s.54 computation-of-time provision**, which on its face rolls FORWARD, not back, for exactly the instruments §1.7's "closed" UNVERIFIED list enumerates. Feeds **OQ-7**. | **The conservative roll-back (preceding Friday) ships** — it fails safe (early, never late) regardless of which direction s.54 ultimately rules. | PR-1 (the `holiday_rule` seed values) and OQ-7's answer |
| **OC-5** | **B12 — `wake_open_question` has no callable door for the producer.** Neither `clara_runtime` (no grant) nor a `proactive` credential (not allowlisted, and the body's own PIN BLOCKER refuses anything but `autodraft`) can open rung B2's one question; the repair touches wake machinery §3.9 lists as untouched. | **Rung B2 cannot run as designed** — R-1's only mitigation (the fail-closed applicability question) has no implementation until ruled. | PR-2 (the chase producer) |
| **OC-6** | *(carried, unchanged from v1)* **OQ-1 through OQ-8** — staff allowances, the Form E grace month, CP21/22 family, CP58 (folds into OC-3), the payroll-JV account-role convention, the HRD Corp 15th-vs-last-day conflict, the weekend rule/BELCORT practice (folds into OC-4), and a fourth Tier-1 rate table. Full text: `payroll-calendar-annexes.md` Annex D. | Per-question defaults stated in Annex D. | As stated per question |
| **OC-7** | **Whether the eleven folded corrections (§3 above) themselves need a second independent read** before PR-1 opens, given three of them (D-21, D-23, D-25) touch judgement logic under review law 1. | **This fold stands as PR-0's own correction pass**; a second cross-model read is recommended, not required, before PR-1. | PR-1 |

**Owner ruling 2026-08-23 (the sitting) — OC-1 through OC-5 (B1/B14, M3, M5/M21, M10, B12) are
ALL RULED.** Each card's text above stands as written; these are the dispositions.

- **OC-1 (B1/B14) → RULED: the coverage predicate RE-ANCHORS on the payroll JV recognition fact
  (the books), not on a filed `payroll_summary` document.** `documents.financial_date` stays
  undated by design — `covered` becomes reachable off the ledger's own recognition event instead
  of off a document-dating authority §3.9 was right to refuse minting. §3.3/D-06/R-4/battery
  cell 4/§6 re-cut to the JV anchor. **PR-2's coverage predicate unblocks.** Also REGISTERED —
  `PROGRESS.md` Backlog: payroll document ingestion as a first-class product capability (its own
  purpose class + sensitivity walls) — owner decision, future scope.
- **OC-2 (M3) → RULED: F-A4's clock spine OWNS period generation.** The four obligations'
  per-regulator period definitions (PCB deduction month, EPF wage month, SOCSO/EIS payment
  month) live as DATA in the `statutory_deadlines` rows F-T2 contributes, not as a second
  period-generation mechanism — one architecture, one clock. **PR-1's seed migration unblocks.**
- **OC-3 (M5/M21) → RULED: mint a `pays_agent_incentives` client fact.** The onboarding
  interview asks it; Clara records the answer with provenance; CP58's matrix gates the verdict
  on it. **Unanswered → the CP58 row shows `unknown`, never a verdict** — OQ-4's provisional
  "applies unconditionally" default retires in favour of the fact-gated read. **PR-2's chase
  producer unblocks.**
- **OC-4 (M10) → RULED: the LEGAL due date follows the Interpretation Acts' forward roll**, plus
  R-L24's per-regulator holiday rules; `effective_due` — the earlier INTERNAL working target —
  is a second, distinctly labelled field. **Both dates display, distinctly labelled**; neither is
  silently dropped. Feeds OQ-7's answer. **PR-1's `holiday_rule` seed values unblock.**
- **OC-5 (B12) → RULED (already standing): routes through F-A7's registered
  `wake_open_question` widening.** F-T2 CONSUMES the door F-A7 mints; it does not build its own.
  **PR-2's rung B2 unblocks** once F-A7's widening lands.

---

## 5 · Refuted register

**Six claims raised against v1 were REFUTED** by the independent verifier pass; the raw gate
data feed carried only the count (`refuted_count: 6`) for the FT2 set, not the itemized claim
text, design cites or refutation grounds. **Not reconstructed here** — the raw gate transcript
(the source this fold worked from, held at
`C:/Users/zhant/AppData/Local/Temp/claude/C--Users-zhant-Desktop-clara-rebuild/d2f9dd42-4fd2-4c34-9a84-02e75ad7dd54/tasks/w1qxe2ug1.output`,
`.result[1]`) does not carry a `refuted[]` array for any of the six sets it holds, so nothing here
would be fold-lane-verified rather than merely copied. If the six refuted claims' particulars are
needed, they must be pulled from wherever the gate's own working transcript (not its structured
JSON result) was captured, or the PR-0 gate re-run with a `refuted[]` array requested in its
output shape.

---

## 6 · Version

This record is v1. The design set it gates moved **v1 → v2 (gate-folded 2026-08-23)** —
`payroll-calendar-design.md`, `payroll-calendar-annexes.md` (Annex F v2 entry), and
`payroll-calendar-survey.md` (nit corrections, no version marker of its own). PR-1 opens against
v2, not v1.
