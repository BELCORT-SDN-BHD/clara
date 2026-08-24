# F-T4 · The fix queue — the gate record

> **The gate ran 2026-08-23** as part of the joint Track-B PR-0 gate over six design sets
> (FT1/FT2/FT3/FT4/FA5b/FA6v2) — one lens-scoped review per set plus per-finding adversarial
> verify (`verify_grounds` re-derives every claim against current `main`, independent of the
> finding's own citations). **FT4 alone: 26 raw findings → 24 independently verified (19
> CONFIRMED, 5 REFUTED) + 2 unverified nits, plus 3 of the 19 confirmed came in at nit severity —
> 5 nits total. Of the 19 confirmed: 6 blockers, 10 materials.** 14 are folded into
> `fix-queue-design.md`/`fix-queue-annexes.md` **v2** below; 2 materials are owner-reserved cards
> (one ruled same-day, one still open); the 5 nits (3 confirmed + 2 separate) are recorded but not
> folded — out of this pass's scope. **Every claim below was independently re-derived at file:line
> against the live repo, not accepted on the finding's own say-so** (review laws 2/3).
>
> **This file is the spec for v1 → v2; the fold is already applied** — every "Fold:" line below
> names exactly what changed in the design/annexes and the decision id (`D-13`..`D-25`) that
> carries the full ground. Standing caveat unchanged: no rig has run against this set; every
> body-level claim, folded or not, is confirmed by direct source read, not by rig replay — PR-3
> and PR-4's own D1 prestate probes are where the corrected objects get proved live.

---

## 1 · Blockers — 6 confirmed, 6 folded

**B0 · The CHECK-constraint swap targets a retired name.** *(live-truth.)* §4.2 named
`ck_processing_task_error_code_0038` as the object PR-3 drops and re-adds. That name was retired
inside `0090_f_a1_walls.sql:1518-1519` and the live object is `ck_processing_task_error_code_f_a1`
(re-cut wider, not renamed, by `0097_f_a1_cutover.sql:352-361`, which added a 29th literal,
`wait_exhausted`). Authored to the letter of v1, PR-3's migration issues `drop constraint
ck_processing_task_error_code_0038` against an object that does not exist — Postgres rejects it
outright, and prediction P-4 as stated is false, not merely unsettled.
**Fold (D-13):** §4.2, §9, Annex A.2 C1, Annex A.3 P-4, Annex A.1 ft4.q all re-cited to the live
object and its 29-value text.

**B1 · `request_reextraction`'s admission is status-only, not error-code-listed.** *(live-truth.)*
§4.3 claimed engine_auth is "admitted at the two human doors": `finalize_document_intake`'s
adopted-branch list AND `request_reextraction`'s "own list." `request_reextraction`'s live
`failed_retry` door (`0051:552-561`) has no `error_code` predicate at all — it already admits any
`status='failed'` task on the lane unconditionally. There is no list there for PR-3 to extend; a
CoR authored against this premise targets a mechanism that does not exist.
**Fold (D-14):** `request_reextraction` dropped from PR-3's D1 surface entirely (§9); §4.3
corrected to one door; battery cell ft4.o reframed as a regression proof, not a door proof; ft4.p
rescoped to `finalize_document_intake` only. The pre-existing corollary (corrupt/encrypted already
admissible through this door today) is out of item D's scope, recorded as **R-5**.

**B2 · The durable `is_bank_account` flag is not a live pointer — item A arm (a)'s predicate is a
false positive on every legitimate deactivation or remap.** *(accounting.)* `0038:2532-2535`: the
flag survives deactivation by design; `remap_bank_account_coa` (`0038:2979-2988`) sets it on the
new COA code and leaves the old one flagged with no `bank_accounts` row at all. Arm (a) as
specified ("no ACTIVE row ⇒ gap") fires on that population forever, folding to drawer 1 `unknown`
with **no remedy** — `banking_arrangement` is explicitly forbidden from overriding it (§2.3 row 4)
— so every client who ever cleanly closed or switched a bank account becomes permanently
unclosable, and every one of their sealed receipts flips to unverified.
**Fold (D-15):** arm (a) redesigned to a MEASURED check — fires only when NO `bank_accounts` row
of any status (current or, via the remap audit trail, superseded) has ever bound the code, AND
trial-balance movement is uncovered by any reconciliation. §2.2, §2.3's verdict table, §2.5's
retroactive-population framing, and battery ft4.d (split into ft4.d/d2/d3/d4) all corrected.

**B8 · Same durable-flag defect, confirmed independently from the security lens, on the CLR41
wall.** *(security.)* Re-derivation from a second, independent lens converges exactly on B2's
mechanism and consequence (drawer 1 absolute, no attestation path, `finalize_close` raises CLR41
with no remedy for this arm specifically). **Fold: same as B2 — D-15.** No separate design change;
recorded as a second, convergent confirmation.

**B9 · The frozen catch-side allowlists clamp `engine_auth` to `internal` — §4.3's "no frozen
module needs a new version" is wrong.** *(security.)* All four runtime catch-side classifiers
downstream of the adapters (`documentIngest.behavior_v2.mjs`, `invoiceFacts.v1.behavior.mjs`,
`statementFacts.v1.behavior.mjs`, `statementFacts.v2.behavior.mjs`) map any code outside their own
closed set to `'internal'` — a code `finalize_document_intake`'s door refuses **permanently**
(`0051:1245-1249`, its own documented dead end). Built as designed, `engine_auth` never survives
past the first frozen module it touches; the eighth 401 lands worse off than the seven `bad_type`
documents item D exists to help.
**Fold (D-22):** all four modules need a new `_vN` export + registry repoint to admit
`engine_auth`; §4.3, §9, Annex A.1 (ft4.k2/l2), Annex A.2 (new census C11) all updated; priced into
PR-3's scope as a runtime cost, not a DB D1 cost.

**B10 · §4.2 treats one CHECK as the whole DB surface for the new code — three facts-lane writers
independently clamp to `engine_error` first.** *(security.)* `clara.fail_invoice_facts`
(`0009:2168-2170`), `clara.fail_statement_facts` (`0038:2063-2071`), and `clara.fail_witness_facts`
(`0097:397-401`) each hardcode their own literal allowlist and coerce anything unrecognised to
`'engine_error'` — before the value the CHECK swap widens for is ever written. Even with B9's
frozen modules fixed, `engine_auth` handed to any facts lane's writer is silently rewritten to
"transient engine fault," moving R3's original complaint rather than fixing it.
**Fold (D-23):** all three writers need their own CoR to admit `engine_auth`, inside PR-3's D1
window — three more live SECURITY DEFINER bodies than §9 v1 published. §4.2, §4.3, §9, Annex A.1
(ft4.k2/l2), Annex A.2 (C11) updated.

---

## 2 · Materials — 10 confirmed, 8 folded, 2 owner-reserved

**M7 · `refusal_remedies`' key has no direction dimension.** *(accounting.)* `reviewCopy.ts`'s
`clr21Copy(reason, direction)` swaps "vendor" for "customer" on a sales filing; the DB table as
specified (`primary key (errcode, reason)`) has no way to carry that, and battery cell ft4.j is
keyed on the purchase-wording copy only, so it would go GREEN on exactly the wrong wording and
never see the loss. Built as designed, a sales filing refused `vendor_malformed` renders "fix the
vendor" on a customer invoice at the card gating an accounting approval.
**Fold (D-16):** `direction` added to the PK; resolution order widened (subsystem/direction match,
then subsystem/direction-neutral, then no remedy); `JeReviewCard.tsx:370`'s second render site
(the v1 wire list's omission) added to §3.4 with the direction/subsystem call wired through; new
differential cell ft4.j2.

**M11 · The grant path excludes the coding lanes item B exists to serve.** *(security.)* §3.2
grants `clara.refusal_remedies` to `clara_authenticated` only. `autoDraft`/`chatTurn` never connect
as that role — they connect via `clara_agent_ro`/`clara_wake_interactive`
(`packages/runtime/lib/pools.mjs`). With FORCE RLS and no agent-role policy, the mapper's read from
the agent lane raises `permission denied` or silently returns zero rows — N5's stated purpose (the
remedy reaching the unattended lane) is undelivered for its primary audience.
**Fold (D-18):** grant/policy widened to also cover `clara_agent_ro`, mirroring the estate's own
`0059:12`/`0060:372` agent-catalog pattern.

**M12 · The shared predicate contract states no security posture.** *(security.)* §2.1's
`clara._bank_registry_ledger_state(p_client uuid, p_as_of date)` contract — the artifact D-10 says
whichever lane lands first authors — names only the signature and return shape. Its cited read
path, `trial_balance_as_of`, is bare `security invoker` with no caller-side firm check
(`0017_wave_b.sql:3572-3574`); the sibling it plugs into, `bank_recon_close_state`, pins
`security definer` + `revoke all … from public` + an explicit firm check explicitly
(`0056:1029`, `:2027-2033`). A body authored to the bare contract would be a PUBLIC-executable,
RLS-free trial-balance reader keyed on a bare client uuid.
**Fold (D-19):** §2.1 states the required posture explicitly — `security definer`, owner
`clara_fn_owner`, pinned `search_path`, `revoke all … from public`, and the `clients.firm_id =
c.firm` check — so either lane (F-T4's PR-4 or F-A3's arm 4) builds it correctly regardless of
which lands first.

**M13 · D-6's stated ground is false at its own citation.** *(security.)* D-6 justified narrowing
`engine_auth`'s admission to the two human doors on the ground that "the `ocr` lane has no attempt
cap," citing `0051:910-914` — which reads the opposite: "CAPPED... the ONLY cap an ingest lane
has." The narrowing decision itself is not challenged; only its stated reason is refuted.
**Fold (D-20):** D-6's ground corrected in the decision register and in §4.3; the true ground (a
real 3-attempt lane cap plus a 4-attempt runtime retry budget) stated instead.

**M14 · Census C2 is short three of six `RETRYABLE` sets, including the one item D is editing.**
*(security.)* C2 named three `RETRYABLE` sets as the closed world; `grep -rn "const RETRYABLE"
packages/runtime` finds six, one ratified set duplicated by design (each carries a "copied
VERBATIM from X" comment). The two most consequential omissions, `statementFacts.v1`/`.v2`, sit
directly in item D's own blast radius — §4.1 names `statementFacts.v1.engine.mjs` as an adapter it
changes.
**Fold (D-21):** census C2 widened to all six sites.

**M15 · PR-1's proof battery proves the TLS wall in both directions and proves nothing about the
property hard constraint 4 actually turns on.** *(build.)* The selftest as designed connects with
the CA and succeeds, connects without it and refuses, and checks cert expiry — but no cell asserts
the DSN is ever rejected from argv or that it never touches disk. The design's own law ("the proof
of a wall is a cell that makes it REFUSE") is unmet on exactly the property this tool exists to
protect. **Build-affecting: the fold below is already being implemented by the severed PR-1 build
lane (D-25) as of this gate.**
**Fold (D-24):** two new selftest cells specified — an argv-rejection cell, a child-env-only/
no-disk cell — in §6 and Annex A.1's PR-1 battery description.

**M16 · The "two human doors" admission claim is wrong.** *(law.)* Same underlying mechanism as
B1, confirmed independently from the law lens against fix-queue-survey.md F12's and Annex P-5's
"two lists, not one" characterization: `request_reextraction` has never had, and does not now
have, an error-code-keyed admission list at any point in its lineage (0026 → 0040 → 0051 → 0097 →
0099). **Fold: same as B1 — D-14.** P-5 corrected from an open prediction to a settled,
re-derived fact.

**M18 · `refusal_remedies` needs a subsystem discriminant or the design must justify its
absence.** *(build.)* `(CLR05, distinct_checker)`/`(CLR05, self_attestation)` are independently
raised AND independently rendered — with domain-specific copy — by at least four live call sites
beyond the coding lane: `CommitGate.tsx` (client-plan-commit governance), `openingModel.ts`'s
`refusalHint()` (four render sites: opening ceremony, item form, targets, seed workbench), and the
Wave-E reporting/close-reopen band (`0059`/`0072`/`0084`/`0085`). D-4's own rationale (avoiding
"two rosters that can disagree") makes future reuse of this table for one of those refusals likely
without a fix — and the JE-specific "high-stakes entry" sentence would then render on a report or
close-reopen decision.
**Fold (D-17):** `subsystem` added to the PK, seed scoped to `subsystem='je_review'` only; the
other lanes' existing copy is explicitly left unclaimed by this design, not silently exposed to
collision.

**M4 · The employee-claim recognition-timing convention — OWNER-RESERVED, not folded.**
*(accounting.)* §8.2/§8.3 recognise an employee claim's liability at APPROVAL, citing MPERS
§2.27/§2.36 (accrual) for the timing. Approval is evidence of the obligation, not the obligating
event — the obligating event is the employee incurring the cost on the entity's behalf — and no
cut-off rule exists anywhere in the design; no `close_gate_checks` gate would ever surface the
resulting misstatement (`_close_gate_uncoded` keys on `document_id`, not `posting_date`).
**Disposition: recorded as `fix-queue-annexes.md` Annex C, OQ-9.** Options stated (A: add an
explicit FY-end cut-off clause; B: ship as drafted and accept the risk), with a recommendation
**(A)** and a stated **fail-closed default: item C's employee row does not ship** until the owner
rules — matching OQ-1/OQ-2/OQ-7's own treatment. This is an MPERS policy call, not a build defect;
this lane does not decide it.

**Owner ruling 2026-08-23 (the sitting) — M4/OQ-9 is RULED: option (A), realized as a close-time
scan and draft, not a build-time cut-off clause.** Recognition stays at APPROVAL operationally —
§8.2/§8.3 post unchanged, item C's employee row SHIPS. **At close, Clara scans claims with
in-FY incur dates approved post-FYE and DRAFTS the accrual for human approval** — the ratified
TA-P6 split (judgement accruals draft, never auto-post) supplies the mechanism, so no new
build-time cut-off clause is needed in the posting path itself; the correction lands as a
close-time proposal instead. **Widening trigger REGISTERED: after the first real closes provide
data, revisit auto-post for deterministic-dated claims** (the 60-day-waiver pattern) — a
Backlog-weight follow-up, not a build blocker. Item C's employee row unblocks; the fail-closed
"does not ship until ruled" default is DISCHARGED.

**M17 · PR-1's urgency is not matched by an actual fast path — RULED, severance approved.**
*(build.)* §1's "PR-1 first... nothing gates it" is contradicted by the design's own sequencing:
PR-1 (item F) rides the SAME joint Track-B PR-0 gate + owner sitting as three multi-week
tax-engine designs, while Track A's imminent ceremony windows (W1-W4, inside T0+25h; W5's ≥96h
buffer still short of the joint gate's own 14-21 day estimate) would run on the pre-existing
session-local DSN recipe the design itself says has already degraded to CA-unpinned TLS twice.
**Disposition: RULED by the owner, 2026-08-23 — PR-1 is SEVERED from this joint gate and is
building now**, standalone, on its own selftest gate (M15/D-24) and the uniform ADR-061 ladder.
**Fold (D-25):** §1's table and "PR-1 first" paragraph rewritten to state the severance and its
ground; Annex B gains D-25 as the ruling of record; header/changelog of both design.md and
annexes.md mark PR-1 as out of this gate going forward.

---

## 3 · Nits — 5 total, recorded, not folded (out of this pass's scope)

**From the 19 confirmed (3 nit-severity, downgraded on verify):**
- The `p_as_of` date parameter on §2.1's contract is unstated by name (though every consumer in
  the estate uses `v_fy.ends_on`, so no wrong-date build is actually forced) — a one-clause
  contract omission, not a forced error.
- The director row's `420-D01`/`472-DIR` "or" carries no MPERS 4.5 twelve-month discriminant — but
  §8 "decides nothing" and ships no code, so nothing posts wrong today.
- `fix-queue-survey.md` F31's from-director account codes (`160-D01`/`160-D02`) are invented — the
  `160-*` range is EQUITY, not a receivable — but §8.2's actual output uses the correct
  `250-DIR`/`350-D01` codes; the error is contained to the survey's own citation.

**From the gate's separate lightweight nits list (unverified by adversarial re-check, recorded as
reported):**
- D-1's `PROGRESS.md` line citations have drifted (content unchanged, offsets stale — the file
  gained bullets earlier in it since the citations were taken).
- §3.2's `close_gate_checks`-posture enumeration omits the `p_cgc_owner`-equivalent policy that
  posture actually carries alongside the human read policy — under FORCE RLS, `clara.refusal_
  remedies` as literally enumerated has no policy admitting `clara_fn_owner`, so the migration's
  own seed INSERT would see/write nothing. **Flagged for the PR-2 build lane's attention** — cheap
  to catch at rig time, and adjacent to this gate's own D-18 grant fix, but not in the fold list
  this pass was scoped to, so left unfolded here.

None of the five change the design's shape; all are citation/completeness fixes a future pass (or
the rig's own first run) catches cheaply.

---

## 4 · Refuted — 5

Five findings against this set were independently re-derived and found **not to hold** at the
adversarial-verify stage. The gate's raw output preserves only the count for this set (5), not
the individual claims or grounds — no further detail is available to record here.

---

## 5 · What changed, in one place

| index | id | severity | lens | disposition |
|---|---|---|---|---|
| 0 | B0 | blocker | live-truth | folded — D-13 |
| 1 | B1 | blocker | live-truth | folded — D-14 |
| 2 | B2 | blocker | accounting | folded — D-15 |
| 3 | — | nit | accounting | not folded (out of scope) |
| 4 | M4 | material | accounting | **RULED 2026-08-23 — option (A), close-time scan+draft — OQ-9** |
| 5 | — | nit | accounting | not folded (out of scope) |
| 6 | — | nit | accounting | not folded (out of scope) |
| 7 | M7 | material | accounting | folded — D-16 |
| 8 | B8 | blocker | security | folded — D-15 (= B2) |
| 9 | B9 | blocker | security | folded — D-22 |
| 10 | B10 | blocker | security | folded — D-23 |
| 11 | M11 | material | security | folded — D-18 |
| 12 | M12 | material | security | folded — D-19 |
| 13 | M13 | material | security | folded — D-20 |
| 14 | M14 | material | security | folded — D-21 |
| 15 | M15 | material | build | folded — D-24 (build in flight) |
| 16 | M16 | material | law | folded — D-14 (= B1) |
| 17 | M17 | material | build | **RULED — severed, D-25** |
| 18 | M18 | material | build | folded — D-17 |

Full ground for every `D-13`..`D-25` id: `fix-queue-annexes.md` Annex B. Full corrected design
text: `fix-queue-design.md` v2, §§2.1-2.5, 3.2, 3.4, 4.2-4.3, 6, 9, 10. Owner card of record:
`fix-queue-annexes.md` Annex C, OQ-9.
