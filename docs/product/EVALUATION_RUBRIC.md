# Clara — Evaluation Rubric (the product-level acceptance constitution)

*How any claim of "done" is judged, at every altitude — a PR, a wave acceptance, a ceremony, a deploy.
This is the constitution; each wave's acceptance matrix is its instantiation (§5). Product law is
`docs/product/PRD.md`; the decision trail for every law cited here is `docs/adr/`. Nothing below is
new: each line restates a standing law with its source.*

**For verifier agents:** every criterion is addressable by ID (`DF-n`, `EV-n`, `IN-n`, `VD-n`, `IT-n`,
`SG-n`) and is written to be evaluated on its own. Cite the ID when you apply it.

**The three laws minted 2026-08-06** — recorded in `AGENTS.md`'s working protocol and the `docs/adr/`
digest — are the spine of §1–§3: (1) a judgement-logic change gets an independent review pass
before merge, ratified as the standing floor by **ADR-061**; (2) **absence is not evidence, and a
derived state is not evidence**; (3) **spelling is not identity**.

---

## 1. DEFAULT-FAIL — the governing principle

- **DF-1 — Unverified is incomplete, not "probably fine."** A claim with no verification attached is
  graded FAIL. The burden sits on the claim, never on the reader to disprove it.
- **DF-2 — Absence is not evidence** (law 2). "No error appeared", "nothing showed up", "the query
  came back empty" discharge nothing. Every absence falls to the fail-closed branch of its own
  criterion.
- **DF-3 — A derived state is not evidence** (law 2). A conclusion inferred from a neighbouring
  outcome is not a reading of the thing itself. *Exhibit: the v54 belt gap — a deploy's completion was
  taken as the deploy's content, and the belt had never shipped. It minted the positive-read deploy
  law: a ceremony closes only on a positive read that the running release carries the intended commit.*
- **DF-4 — Spelling is not identity** (law 3). A guard, test, or audit that matches a NAME matches a
  projection of the thing, not the thing; prove an identifier IS its import before trusting it.
  *Exhibit: a `like '%re_admitted%'` audit yielded five false positives at the ADR-066 acceptance —
  the law turned on the measuring instrument itself.*
- **DF-5 — "A wall that never refused anything is not a wall that held — it is a wall that was never
  asked"** (ADR-066, verbatim). A refusal criterion counting zero on the live corpus is recorded
  **UNPROVEN IN THE FIELD**, never silently credited, and the run states which it was: never
  triggered, or never asked.
- **DF-6 — A refusal battery alone never discharges a section** (ADR-066). Every section carries
  **right-answer** criteria — *the mechanism produces the CORRECT figure or label on the target
  corpus* — beside its refusal criteria. Ninety-six green synthetic cells once sat beside a reader
  that failed both real documents it existed to fix.

## 2. EVIDENCE GRADES — what a read must be to count

**Positive grades — these count:**

- **EV-1 — A positive read with its instrument named.** What was read, by which query / command /
  `file:line`, at what moment. An unnamed instrument is an ungraded claim.
- **EV-2 — Counts before and after**, taken with the same instrument on both sides.
- **EV-3 — Receipts and identifiers** actually observed: row id, entry id, receipt, sha256, migration
  number, running release version.
- **EV-4 — Re-derivation against pinned inputs.** An independent path reproduces the value from
  DB-owned source facts and approved versioned constants — the E-R4 standard (**ADR-065**): the
  evaluator ORIGINATES the value, and a model numeral is never an evaluator input.
- **EV-5 — Measured at run time, never inherited.** A criterion citing a count cites the count IT
  measured, with its query, at the moment it ran — including counts quoted from this project's own
  earlier documents (ADR-066).

**Never evidence — these are refused:**

- **EV-6 — "The code looks right."** Reading is not running.
- **EV-7 — An unrun backstop.** A test, guard, or fallback that exists but did not execute is scenery.
- **EV-8 — A green that cannot fail.** If no realisable input turns the check red, its pass carries no
  information; prove the check CAN fail before crediting it.
- **EV-9 — Anything absent or derived** (DF-2/DF-3), including a deploy inferred from a command that
  exited zero rather than read off the running release.

**Outcome vocabulary — never conflated** (ruled by precedent, `wave-7a-acceptance-h2.md`):

| token | means |
|---|---|
| **SEEN** | a read actually observed the receipt / row / byte. The only positive class. |
| **NOT SEEN (structural reason)** | the read ran; the thing did not occur; the run states the MEASURED reason. |
| **NOT REACHABLE** | no honest path from this lane reaches it. |
| **NOT CAPTURED** | reachable, but blocked by an external resource (an owner gate, a missing document). |
| **NOT PROVEN** | attempted, inconclusive. |

## 3. INDEPENDENT EVALUATION — who may grade

- **IN-1 — Generator ≠ evaluator.** Work verified only by the lane that produced it is NOT discharged
  (**ADR-061**, law 1).
- **IN-2 — Judgement logic gets an independent pass before merge** — the standing floor, not the
  ceiling (**ADR-061**). *Judgement logic = code deciding whether something happened, is allowed, or
  succeeded: a guard, a disambiguation, a refusal branch.*
- **IN-3 — Review intensity is UNIFORM.** The full ladder applies to every substantive change;
  tiering it by blast radius was proposed and **DECLINED** (**ADR-061**). Assurance is a standing
  posture, not a per-case calculation.
- **IN-4 — Contract-blind batteries never read the implementation.** A lane that has seen the code
  grades the code's intentions rather than its behaviour.
- **IN-5 — A different angle, not merely a different reader.** An independent verifier queries a
  DIFFERENT table or instrument than the one that produced the claim, and when prediction and
  measurement diverge it re-derives the gap instead of editing the prediction away.
- **IN-6 — Every review lane carries an explicit model override**, and cross-model gating is used
  where the ladder calls for it.

## 4. VERDICT VOCABULARY

- **VD-1** — A review returns exactly one of **CLEAN** or **NOT-CLEAN**. There is no "clean with notes".
- **VD-2** — Findings are severity-graded **BL** (blocker), **MJ** (major — fixed or explicitly
  ruled), **MN** (minor — fixed, or the decision not to is recorded).
- **VD-3** — Any open **BL** ⇒ the verdict is NOT-CLEAN.
- **VD-4 — Accept → fix → RE-VERIFY.** A fix never inherits its predecessor's review; the finding is
  re-checked with fresh probes after the fix lands.
- **VD-5 — Review the fixer.** That re-check belongs to the original reviewer or an equally
  independent lane — never the lane that wrote the fix. *Exhibit: the ADR-061 #193 loop — review HOLD
  → blockers fixed by a separate lane → original reviewer re-reviewed CLEAR.*
- **VD-6 — Merge on CLEAN only**, with green CI, through a PR; `main` is never pushed directly.
- **VD-7 — A gate catch is two facts, recorded separately** (ADR-066): a PASS of the gate, and a FAIL
  of the mechanism it caught.

## 5. INSTANTIATION — how a wave uses this rubric

- **IT-1** — Each wave mints a **falsifiable acceptance matrix BEFORE its build**, so no run can grade
  itself after the fact (the E-R9 discipline; exemplar
  `docs/plan/active/wave-e-acceptance-matrix.md`).
- **IT-2** — Every cell carries all seven fields: **ruling → precondition → action → exact DB/artifact
  assertion → negative case → implementation owner (lane) → independent verifier.** A cell with a
  blank assertion is not a cell.
- **IT-3 — Verifier handles** name the independence each cell obeys: **V-DB** (contract-blind DB read
  lane, different model from the builder) · **V-RT** (contract-blind runtime/artifact lane — reads
  bytes and hashes, not code comments) · **V-CI** (a committed, re-runnable cell; a rejected predicate
  stays executable) · **V-OWNER**.
- **IT-4 — V-OWNER cells are the owner's own act**, reserved for human professional judgement —
  attestations, wording verification, a professional label. **An agent can never satisfy one**: the
  acceptance-layer sibling of PRD §6.9, where the agent never satisfies a human sign-off.
- **IT-5 — RECORD cells state honest boundaries.** Where a cell's action is `record` rather than an
  execution, the precondition becomes the load-bearing field and is spelled out in a sentence, never
  left blank. A boundary honestly recorded is a discharge; a boundary quietly omitted is a defect.
- **IT-6 — Precedence.** Where a matrix and its wave contract disagree, the contract wins; where
  either collides with `docs/product/PRD.md` §6, the PRD's LAW wins (§6.15).

## 6. THE SHIPPING GATES

- **SG-1 — F3, complete the whole accounting job** (`docs/product/PRD.md` §6.4, LAW). A workflow
  **fails** if it posts or codes GL lines while leaving any required AR/AP, fixed-asset,
  reconciliation, reporting, or knowledge state stale; side-effects complete in the **same audited
  transaction** as the GL write, or the exception is explicitly surfaced. **This is a shipping gate,
  tested in Phase 5** — not an aspiration, and no wave may declare itself complete around it.
- **SG-2 — The agent-native surface test** (`docs/product/PRD.md` §5a): remove the chat rail, and the
  workbench must still show what Clara did, why, with what evidence, and offer every Clara action as
  an object-level verb.
- **SG-3 — Nothing here relaxes for testing convenience.** ADR-060's pre-beta authority
  (widened by ADR-0075) is **DATA-scoped only**; the product's mechanisms, the engineering
  gates, and these criteria stay at full force — mechanisms NEVER move, the operative clause
  on any collision.
- **SG-4 — Accessibility is a shipping gate** (Q7): `apps/web/scripts/check-token-contrast.mjs`
  proves token-level OKLCH contrast, `apps/web/test/a11yRules.ts` runs the WCAG-mapped rule engine,
  and `apps/web/test/keyboardWalk.ts` walks the approve/review/close journeys. **OWED per 裁-13:**
  the WCAG 2.2 target-size gate joins `a11yRules.ts` in the P6 polish wave.
