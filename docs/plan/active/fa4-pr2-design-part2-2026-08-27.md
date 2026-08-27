# F-A4 PR-2a — design part 2 (build envelope · rulings · acceptance)

*Part 2 of the design of record. Part 1 —
`docs/plan/active/fa4-pr2-design-2026-08-27.md` — carries the ruling, the scope, the verb
census and the item designs (§§0-8); this file carries the build envelope from §9 on. Split at
the estate's own design-doc convention (`close-key-1`, `sandbox-export` and
`tax-computation` all run design + part 2) after the 2026-08-27 review fold pushed part 1 past
the 500-line gate. Section numbers are CONTINUOUS across the two files: a cite of "§13 item 4"
resolves here and nowhere else.*

**Annexes A-G** are in `docs/plan/active/fa4-pr2-annexes-2026-08-27.md`.

---

## 9 · The migration's section plan and the D1 ceremony note

Authored **UNNUMBERED**; the number is claimed at merge (`.claude/rules/db-migrations.md`). One
file, sections in apply order:

| § | contents | D1? |
|---|---|---|
| §0 | prestate — the live prosrc sha for `propose_adjustment_template`, its ACL/secdef/config triple, the absence of every object this file creates, and the `close_prep` `wake_engine_sources` row read **positively** as `enabled = false` | — |
| §A | `clara.document_service_periods` + trigger + indexes + RLS/policies + comments | no |
| §B | the door and its core (§4.2) | no |
| §C | `clara.prepayment_schedule_v1` + the single-member `evaluator_versions` registration | no |
| §D | **the extraction** — the core, then the door as a thin delegate | **YES** |
| §E | `agent_act_receipts.subject_kind` CHECK swap (extend) | no |
| §F | wrapper 13's agent core + the wrapper + allowlist row 13 + the one grant | no |
| §G | the two policy mirrors (§7) | no |
| §H | `_agent_close_proposal_core` CoR — B11b + the truthful `settle_reason` | declared |
| §H2 | **F4** — `_agent_mint_month_snapshot_core` CoR, the month-scoped receipt op key (§6.3a) | rides §H's slot |
| §I | the catalog-comment truings (Annex B.4, B.5) | no |
| §TAIL | the strengthened index/policy assertions, the closed ungranted set, the thirteen-count flips, the frozen-schema check (constraint 15) | — |

`set local statement_timeout` near the top, precautionary rather than load-bearing (no backfill,
no bulk scan).

### The D1 window

**One body is genuinely live: `clara.propose_adjustment_template`**, installed since 0045 and hot
— every template proposal on the estate goes through it. PostgreSQL runs an in-flight PL/pgSQL
call to completion on the body it *started* with, so a call spanning the migration runs the old
body; that is the whole reason for the window. It takes the standard quiesce from the `docs/ops/`
ceremony family and the CA-pinned bridge of `docs/ops/dsn-bridge.md`, and **runs from merged
`main`, never from a branch.**

**The other two bodies are declared and provably idle.** `_agent_close_proposal_core` (§H) and
`_agent_mint_month_snapshot_core` (§H2) are each reachable only through their own wrapper under a
`close_prep` credential, and the `close_prep` `wake_engine_sources` row ships `enabled = false` —
F-A4's outstanding INSERT-and-flip follow-up, recorded in `PROGRESS.md`'s F-A4 and G1 lane rows.
The prestate reads that flag **positively** and refuses to apply if it is true: absence of traffic
is not evidence (review law 2), a read of the disabled flag is. **One idle-slot argument covers
both**, which is the whole reason F4 is cheaper to fix here than to carry.

**The live frontier makes this cheaper than it looks.** Live is 131/`0136`; `0137` (D1 inventory
empty, by its own §SS0) and `0138` (additive, by its own header line 2) are merged but **not yet
ceremonied**. If PR-2a merges before that deploy, the chain 0137→0138→PR-2a lands in one combined
window — the W4 precedent, nine migrations through one D1 window
(`docs/plan/completed/wave-f-w4-ceremony-asrun.md`) — and §H's body is created and replaced inside
a single deploy, with no moment at which an old one could be in flight. **Whichever order the
deploy takes, the prestate proves the posture rather than assuming it.**

---

## 10 · The battery — **Annex A**: thirty-five walls, each with its cell and its mutant (every one of them, after review finding F7), plus the fixtures they need that do not exist today.

---

## 11 · NON-GOALS — stated so a builder does not helpfully widen

1. **`clara.finalize_close`, `clara.reopen_fiscal_year`, `clara.attest_close_exception` and
   `clara.settle_close_proposal` are UNTOUCHED.** They are law 71's four reserved human acts, and
   the HIGH-1 ruling turns on exactly that list.
2. **`clara.sign_adjustment_template` is UNTOUCHED** — no core, no wrapper, no grant, no argument.
   R6: signing stays a human act at its ADMIN floor.
3. **No floor moves anywhere.** The only new privilege is EXECUTE on wrapper 13 to
   `clara_wake_interactive`. Nothing is revoked to make a test pass.
4. **F-A4 writes no journal line** (D-11). The template is `proposed`; posting stays with the
   existing `run_adjustment_occurrence` belt (0045:5301) after a human signature.
5. **No new posting machinery, no prepayment subledger.**
6. **`persist_invoice_facts`' closed field-path taxonomy is NOT extended here**, and no runtime
   extraction adapter changes (Annex C).
7. **No `close_attestations.from_proposal_id` column** — Annex B.5's recommendation, carried to
   PR-3 with its attack written out.
8. **`clara._close_subject_client` is not recut** (§6.3); **no new event type and no new human
   door** (§6.2).
9. **The runtime half is not in this PR** — `close_prep_due` as a seventh leader belt,
   `closePrep.v1` as a new WDK export, the task-bound mint in `pools.mjs`. See §13 item 1.
10. **`clara.withdraw_close_proposal_item` does NOT ship here** — the named retraction act §8
    sketches, carried to PR-2b/PR-3 with its shape written out. Until it lands, a proposal that
    must lose a drafted pair is withdrawn by a human through `clara.settle_close_proposal`.
11. **B13 arm 1 stays parked by name**, carried forward from 0138:104-111; it needs a real FA
    register with a period stranded in an earlier fiscal year, and it fails closed.
12. **F1/F2 are NOT designed around.** The evaluator's `period_lines` contract and its input list
    (§5) stay exactly as written until the owner rules on the amortisation convention and the
    target-account source. Pre-rung (a)'s predicate and cell W35's final shape are parameterized
    on that ruling and named as such — a build lane must not resolve either by choosing.

---

## 12 · The named follow-up — **Annex C**: the OCR half of the service period, its four steps, and the three reasons it is not in PR-2a.

---

## 13 · The five collisions — surfaced, and RESOLVED by the conductor (2026-08-27)

Each was surfaced rather than guessed; each carries its resolution here so the build lane finds
the ruling and not the question.

1. **NAMING — RESOLVED.** *"PR-2" named two trains:* close-key-1-design.md:477 defined PR-2 as the
   **runtime** PR (`close_prep_due` as a leader belt · `closePrep.v1` · the `pools.mjs` mint),
   while the dispatch brief called this DB work PR-2. A later citation of "F-A4 PR-2" would
   quietly mean different work — the failure `.claude/rules/handoffs.md` was minted for.
   **Ruling: PR-2a is this DB train, PR-2b is the runtime train.** close-key-1-design.md:477 is
   trued in this same PR (a design doc's own forward pointer, in scope). **This file keeps its
   `fa4-pr2-*` filenames** under the index's path-stability convention; the *train* is PR-2a
   everywhere in the prose.
2. **`PROGRESS.md`:102/:113 — RESOLVED, NOT MINE.** The F-A4 lane row calls PR-1c the
   `statutory_deadlines` DDL while 0138 shipped as the close agent limb, no such relation exists
   in `packages/db/migrations/`, F-T2 is recorded blocked on it, and the row's status cell still
   omits 0138. **The conductor owns this**: the re-label and the stale status cell land in the
   PROGRESS-truing PR. **This branch does not touch `PROGRESS.md`.**
3. **THE SERVICE-PERIOD DOOR IS HUMAN-ONLY — CONFIRMED AS LAW.** On hard-constraint-2 grounds: a
   model-derived period is not an anchored fact, and OCR's `financial_date` precedent (0026:916)
   does **not** transfer, because that value anchors to a stored region with a locator and a
   confidence. **Annex C's OCR-anchored route is the sanctioned automation path** — its own train,
   its own ladder. The interim cost is accepted and will be stated to the owner: **a human keys
   the period through the bookkeeper door before Clara can draft.**
4. **THE FY-CROSSING RULE — CONFIRMED.** Annex B.2's *"a term crossing more than one FY without a
   stated end"* can never fire once the carrier makes `period_end` mandatory. The reading used in
   §5 stands: **refuse when the term runs past the entry's FY and the client has no OPENED
   successor year.** Conductor's added note: under the R6/HIGH-1 frame **the clocked lane may
   lawfully clear this blocker itself** through `wake_open_fiscal_year` — so the refusal is a
   **self-healable state**, not a dead end, and Annex A carries the two-phase cell (**W31**) that
   proves the integration rather than assuming it.
5. **MED-8's latitude — NOW RULED (2026-08-27), superseding the "carried" disposition.** The
   review supplied the fact that settled it: under a merely-non-empty-new-pairs arm (2), a
   rotation across overlapping subsets burns live proposals whenever the complement is non-empty
   — the same churn in a different shape. **Arm (2) is STRICT SUPERSET (incoming ⊋ live).** The
   legitimate correction-that-drops-a-pair gets a separate NAMED act rather than a silent
   supersede; my judgement, stated in §8, is that it does not ship in PR-2a, and it is carried by
   name with its shape sketched. The canonical-coverage alternative is not taken.

**And the scope cut is ratified, not merely proposed.** §0's subtraction — **one core extraction,
not two**, because an extracted `sign_adjustment_template` core has no agent consumer under R6 and
would be a permanent dead member — is **CONDUCTOR-RATIFIED (2026-08-27)**. A build lane reading
the dispatch brief's original §1a must not "restore" the sign extraction.

---

## 14 · Acceptance

1. Full estate suite green on an **instance-unique** throwaway rig (torn down after) with a
   differential-control baseline, plus `pnpm lint`, `pnpm typecheck`, `pnpm build`.
2. **Deploy-onto-existing at the TRUE merge frontier** — the on-disk chain including 0137 and
   0138, then this file at its claimed number; prestate holds, tail passes.
3. Every prestate pin re-derived by **rig replay** against `pg_get_functiondef` — never from this
   document's line cites, never from a migration's file text.
4. Every cell in Annex A green, and **every mutant re-run after the fix**.
5. The three flip-counts move together: allowlist 12→13, rig-meta's wake roster 12→13, the
   parked-absence census inverted to presence. A positive read of the `close_prep`
   `wake_engine_sources` row at `enabled = false` is recorded in the tail notice.
6. The fix diff goes back to the **same** reviewers for the targeted verification rung — the fix
   round is judgement logic (review law 1).
