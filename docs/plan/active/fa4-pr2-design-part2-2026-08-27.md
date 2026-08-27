# F-A4 PR-2a — design part 2 (build envelope · rulings · acceptance)

*Part 2 of the design of record. Part 1 —
`docs/plan/active/fa4-pr2-design-2026-08-27.md` — carries the ruling, the scope, the verb
census and the wrapper-13 item designs (§§0-6); this file carries the debt batch and the build
envelope from §7 on. Split at
the estate's own design-doc convention (`close-key-1`, `sandbox-export` and
`tax-computation` all run design + part 2) after the 2026-08-27 review fold pushed part 1 past
the 500-line gate. Section numbers are CONTINUOUS across the two files: a cite of "§13 item 4"
resolves here and nowhere else.*

**Annex A** (the battery) is `docs/plan/active/fa4-pr2-battery-2026-08-27.md`; **annexes B-H** are
`docs/plan/active/fa4-pr2-annexes-2026-08-27.md`.

---

## 7 · Item 6 — residual 1, the bookkeeper conjunct mirrored

**The measured defect** (fix order, Post-re-verification follow-up 1): a firm *viewer* reads
`model_name` / `model_version` / `rationale` / `narrative` straight off `clara.close_proposals`
— the same data class FIX-6 walled off on `agent_act_receipts`. `p_cp_human` (0138:558-559) and
`p_cph_human` (0138:625-626) both check `firm_id = clara.jwt_firm()` and nothing else.

**The consumer census was run before choosing the wall — Annex B.0b carries it row by row.** Its
result: the two definer doors (`attest_close_exception`'s `p_from_proposal` arm,
`settle_close_proposal`) read under the owner policy and are unaffected; the `apps/web` close
panel deliberately reads **nothing** (it renders an honest not-built note); every rig read goes
through `rootQuery` and bypasses RLS.

**No legitimate consumer breaks.** Both policies gain
`and clara.actor_role_rank() >= clara.role_rank('bookkeeper')`, spelled identically to 0138:427
so the close-limb tables read as one rule.

`close_prep_holds` carries a weaker data class than the other two (a human's hold reason, not a
model's rationale). It is walled anyway, and the reason is stated in-migration: the brake's own
doors are bookkeeper-floored (`hold_close_prep` 0138:1573, `release_close_prep` 0138:1608), so a
record readable below the floor of the act that wrote it is an inconsistency waiting for someone
else to find.

---

## 8 · Item 7 — MED-8, the supersede churn

*(Residuals 2/3/4/5/6 — census strengthening and the catalog-comment truings — are Annex B. The
bytes-level reading behind the finding below is **Annex D**.)*

**The defect.** `_agent_close_proposal_core` builds `v_bound` over the keys the *agent chose*
(0138:2251-2277), and B11 refuses only on an exact jsonb match (0138:2292-2297) — so a fresh task
drafting a strict **subset** of a live proposal's keys skips B11 and stamps that proposal
`superseded` with the fixed literal *"superseded by a fresh proposal on a moved gate vector"*
(0138:2308-2312). **A false sentence on a durable record**: nothing moved. A reviewer about to
adopt a proposal finds it superseded for a reason that did not happen.

**The guard** — a new rung evaluated where B11 is, in the form the conductor ruled on 2026-08-27
after the review supplied the missing churn fact:

> **B11b — `close_proposal_no_state_change`.** An incoming proposal may supersede a live one only
> if at least one holds: **(1) a moved digest** — some `check_key` present in both binds a
> different digest; or **(2) STRICT SUPERSET** — the incoming drafted key set is a proper
> superset of the live one (incoming ⊋ live). Neither ⇒ typed refusal naming the live proposal's
> id, and the live proposal stays `open`.

**Arm (2) was "at least one new pair"; the review killed that reading.** Under a
merely-non-empty-new-pairs test, an incoming set that adds one pair *and drops three* still
supersedes — so a rotation across overlapping subsets burns live proposals one after another
whenever the complement is non-empty, which is the same churn B11b exists to stop, wearing a
different shape. **Strict superset is the only arm that cannot lose coverage**: it admits growth
and refuses trade.

**That leaves one legitimate act with no door: the correction that DROPS a pair** — the agent
drafted an attestation it should not have, and the honest successor covers less. Strict superset
refuses it, correctly, because a silent supersede is exactly the wrong way to perform a
retraction. **My judgement, stated as the design asks: it does NOT ship in PR-2a**, and here is
the sketch it is carried by, so PR-2b or PR-3 inherits a shape rather than a gap:

> **`clara.withdraw_close_proposal_item(p_proposal uuid, p_check_key text, p_item_key text,
> p_reason text, p_op_key text)`** — a NAMED act, not a side effect of proposing. It is the
> agent's own retraction, so it is a wake verb with a receipt (`act_kind` extends by one), it
> refuses on a settled proposal, and it records the dropped pair and the reason on the durable
> record rather than letting a successor's silence imply it. The reason PR-2a does not carry it:
> it is a fourteenth wrapper with its own allowlist row, grant, ladder and battery — a second
> verb's worth of surface inside a PR whose window is already sized for one body, and the
> estate's own D-24 severance law says that is how a train stops being reviewable.

Until it ships, the retraction path is the human one that already exists:
`clara.settle_close_proposal(..., 'withdrawn')` (0138:1671ff), after which the agent's next wake
proposes cleanly against no live row. **That is a real path, not a hand-wave** — it is the
reviewer-facing door Annex I.1 designed, and the cost is one human click.

**Why not pure canonical coverage**, and why `settle_reason` stops being a literal: Annex D.
The alternative reading is recorded at §13 item 5, now closed by this ruling.

---

## 9 · The migration's section plan and the D1 ceremony note

Authored **UNNUMBERED**; the number is claimed at merge (`.claude/rules/db-migrations.md`). One
file, sections in apply order:

| § | contents | D1? |
|---|---|---|
| §0 | prestate — the live prosrc sha for `propose_adjustment_template`, its ACL/secdef/config triple, the absence of every object this file creates, and the `close_prep` `wake_engine_sources` row read **positively** as `enabled = false` | — |
| §A | `clara.document_service_periods` + trigger + indexes + RLS/policies + comments | no |
| §A2 | **F1** — `adjustment_templates.schedule` + `clara._adj_canon_schedule` + `clara._adj_period_lines` (§5.2), all additive | no |
| §B | the door and its core (§4.2) | no |
| §C | `clara.prepayment_schedule_v1` + the single-member `evaluator_versions` registration | no |
| §D | **the extraction** — the core, then the door as a thin delegate, now also carrying `p_schedule` | **YES** |
| §D2 | **F1** — `clara._adj_template_hash` at eight arguments, null-stable (§5.2) | **YES** |
| §D3 | **F1** — `clara._adj_run_occurrence_core` and `clara._adj_on_approve` resolve per-period lines (§5.2) | **YES** |
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

**FOUR bodies are genuinely live, re-derived after F1's ruling (§5.2)** — up from one, and the
design states the increase rather than letting the ceremony discover it:
`clara.propose_adjustment_template` (hot: every template proposal) · `clara._adj_template_hash`
(one caller) · **`clara._adj_run_occurrence_core` (the daily unattended adjustment belt)** ·
**`clara._adj_on_approve` (every approve of an occurrence)**. PostgreSQL runs an in-flight
PL/pgSQL call to completion on the body it *started* with, so a call spanning the migration runs
the old body; that is the whole reason for the window. Standard quiesce from the `docs/ops/`
ceremony family, the CA-pinned bridge of `docs/ops/dsn-bridge.md`, and **from merged `main`,
never a branch.**

**What bounds the widened radius is null-stability, and it is proven before the window opens.**
Every one of the four behaves byte-identically when `schedule is null` — which is every row in the
estate on the day this applies — so the ceremony's risk is the CoR mechanics, not a behaviour
change. Cells W36/W37 are the proof, and they run on the rig before the ceremony, not after.
**It is still ONE window:** these four are one layer (the adjustment carrier and its two readers),
which is exactly what D-24's severance law asks a window to be.

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

## 10 · The battery — **Annex A**: forty walls, each with its own cell AND mutant, plus the fixtures they need that do not exist today and the armed-skip statement.

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
12. **No day-count pro-rata in v1** — F1's ruled convention is whole-calendar-month straight-line.
    Pro-rata is a SECOND ruled policy, per-client-selectable and still deterministic; §5.2's shape
    is chosen so it lands as an evaluator `_v2` with no carrier change, no CoR and no window.
13. **`clara._adj_canon_lines` is NOT touched** (§5.2) — the schedule is a sibling structure, so
    `lines` keeps its present meaning for every body outside this train that reads it.

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

### 13.1 · The two CRITICAL findings — OWNER-RULED (Tao, 2026-08-27, in-session)

The design review raised two CRITICAL input-contract findings and both went to the owner rather
than being designed around. Both are now ruled, and the design is built on the rulings (§5.0,
§5.2, §5.3); this section is the record with attribution.

**F1 — the carrier could not carry unequal per-period amounts.** Both available readings posted
wrong books: the remainder never charged, or `n × total`. **RULED — OPTION A: extend the
CARRIER**, chosen by the owner for the one-signature experience (the human signs once, and the
whole schedule is what they signed). **Convention ruled with it: whole-CALENDAR-month
straight-line** — schedule starts at the service-start month, `n` = the term's months, equal
amounts with the remainder in the FINAL period, **no day-count pro-rata in v1**. *Extension path,
recorded so it is not rediscovered:* pro-rata is a **second ruled policy, per-client-selectable
and still deterministic**. The design's own choice under this ruling — **per-occurrence schedule
lines in a sibling column, not a final-occurrence override** — is made in §5.2 with its reasoning,
and its whole point is that the ruled extension lands as an evaluator `_v2` with no second window.
**Consequence for F3:** pre-rung (a)'s P-align/P-carry fork **DISSOLVES** — monthly is
calendar-month at the bytes (0045:1881-1884), so the ruled convention makes alignment true by
construction, and the rung is reclassified from an ordinary-input refusal to a self-check (§6.2a).

**F2 — no DB-owned source for the amortisation TARGET account.** **RULED: Clara JUDGES it.** The
owner overruled the conductor's human-keys recommendation, correctly: this is the same
agent-codes / human-approves pattern the estate already runs in `autoDraft` coding, not OQ-4's
fact class. Three walls, all load-bearing and all in §5.3: deterministic validation · the
judgement receipted with its basis through the law-79 machinery · **visible and CHANGEABLE at the
admin sign door**, with `content_hash` freezing at signature. `prepayment_target_underivable` is
the no-plausible-account arm, never the default path. **The service-period TERM is unchanged** —
human-keyed interim, OQ-4 stands, Annex C's OCR-anchored route is the automation train.

**The maxim both rulings turn on, recorded where a builder will meet it (§5.0): *facts get
anchored, judgements get receipted.*** It is the line that explains why §4's carrier and §5.3's
account — superficially both "something Clara needs that the DB does not have" — are designed as
opposites.

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
