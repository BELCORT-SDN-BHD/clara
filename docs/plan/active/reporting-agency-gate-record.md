# F-A5 PR-0 — the gate record

> **RENAMED AT LANDING, 2026-08-22 → `reporting-agency-gate-record.md`** (integrator act; the reason
> is in `reporting-agency-survey.md`'s banner). Cross-references spell the landed names.
>
> **The gate ran 2026-08-22** against design **v1** (`reporting-agency-design.md` + the two annexes +
> the survey — 1,273 lines). Two lenses, both fresh-context, every finding re-verified at the
> bytes by an independent verifier that did not author the design: the **bytes lens** (the estate
> and the buildability of every limb — 10 findings) and the **rulings lens** (fidelity to the
> 2026-08-22 Track-A sitting — 3 findings).
>
> **Verdict: the seams hold; three blockers, seven materials and one nit bind the build; the
> sandbox export path is SEVERED.** Two findings were REFUTED and are registered in §6 so nobody
> re-raises them. Every finding names its fold target; **the fold is v2's change log (Annex F) and
> this file is its spec.**
>
> Standing caveat unchanged: migration-source reads are predictions about the live catalog, and
> PR-1's rig replay confirms the decisive bodies. What this gate re-read at the bytes is cited
> below with the line numbers it actually saw.

---

## 1 · What was attacked and HELD

The bytes lens re-derived roughly **forty** of the design set's `file:line` claims and the great
majority stood exactly — including every hard one:

- **The extraction seam** — wrapper → ungranted core → thin human delegate. `open_report_run`
  `0070:210`/`:216`, `assess_report_claim` `0070:279`/`:287`, `seal_report_dataset`
  `0070:437`/`:449`, `_seal_report_artifact_core` `0071:121` and its nine-line delegate
  `0071:450-460`, `approve_report_for_issue` `0072:49`/`:55`/`:88-92`/`:95-108`. **Ships as
  designed** (the artifact core's *contents* change — blocker 2 — but the seam does not).
- **The freeze arguments.** `_tf_metric_definition_lifecycle_v1` `0059:26`; the fifteen-member
  producer roster `0058:483`; `verify_evaluator_freeze` looping every row regardless of `deployed`.
  **A lineage sweep confirmed every cite is the LAST definition of its body** — all 26 bodies the
  set names were grepped for `create [or replace] function`, and the one live `create or replace`
  in the estate (`approve_metric_definition`, `0084:113`) is cited correctly.
- **The issue wall's own bytes** — `report_runs` `0065:378`/`:379`/`:384`/`:398-404`,
  `_has_capability`'s two arms `0056:1114-1125`, `wake_context` `0011:1133` with its standing
  re-read, `audit_log` `0002:276-288`, `freeform_read_log` `0002:308-315`,
  `ck_cpv_four_ruled_states` `0066:81-84`, the renderer facts of S6/S7.
- **P6 is better than the design claimed.** `_tf_report_run_lifecycle` (`0066:413-425`) freezes by
  subtracting a mutable whitelist, so the two new columns are immutable-after-INSERT **for free** —
  no trigger recut, and the prediction is stronger than stated.
- **The fixture is buildable in the real order.** `reporting_periods` are minted by `0057`'s
  fiscal-year trigger path, so the acceptance fixture can be built; the rig is not blocked on an
  empty registry to *construct* a run (only real-books acceptance needs the owner's mint — OQ-4).
- **The censuses C1 / C3 / C4 / C5 / C7 / C8 survive as claimed** — no wrapper DML, no epsilon verb
  re-granted, no new table SELECT for `clara_agent_ro`, appended closure rows only. The roster that
  broke was the design's own wrapper count (material 5), not a census of the estate.
- **The rulings lens found the set unusually rulings-literate.** TA-P4 (receipts on `audit_log.args`
  + a new relation, without touching the frozen `_audit` signature), TA-P5 (the self-run design
  cell, data gating, hold switch, derived idempotency key), TA-P6 (the issue-wall re-arm — judged
  *rigorous*), TA-P9, TA-P10's mechanism half, TA-P11 and TA-P14 are all faithfully implemented and
  carried through an honest prediction ledger. **No blocker-class finding on the rulings lens**, and
  no wrong number, unlawful act or vacuous cell in the sampled battery.
- **Forced cells that are genuinely non-vacuous:** B.3 (the human-lane before/after replay), B.4's
  differential, B.5's negative control (`prepared_by_agent=false` lets Alice issue as `two_person`),
  B.8's extracted-text assertion, B.9's four-byte-streams cell. These are the model the new cells
  in §2 follow.

---

## 2 · Blockers — the build may not start until each is folded

### GB-1 · The evaluate leg had no lawful entrypoint, so the OBO chain had no middle

**The finding.** §3.2 rested the whole closure on *"a NEW orchestrator … calls
`clara.evaluate_metric_v1`, the same frozen entrypoint the human pack calls."* But
`evaluate_metric_v1`'s **first executable statement** is
`c := clara._human_ctx(clara.role_rank('bookkeeper'))` (`0059:112`), `_human_ctx` reads
`jwt_sub()`/`jwt_firm()` and raises CLR04 on absence (`0004:299-309`), and the verb is **ordinal 0**
of the same frozen closure that holds `evaluate_fs_pack_v1` at ordinal 9 (`0059:246`) — so it can
neither be called from the wake lane nor recut. η says exactly this in its own words at
`0077:369-375`. **The survey's S2 checked the wrong body**: it proved the PACK verb is an
orchestrator and never read the entrypoint's first line, and the design's own battery undercounted
B.2's red points at three when the truth is five.

**The fold (design §3.2, F5-D3/F5-D4, B.2, B.4, survey S2).** Re-cut on the estate's own working
precedent: `_agent_evaluate_fs_pack_core` resolves the deployed `evaluate_metric` v1 closure row
itself (`0077:160-164`), mints its own `metric_evaluation_contexts` + `_periods` rows, and calls the
frozen **`_metric_eval_node_v1`** (`0077:222-226`) — the idiom `_eta_request_report_preview_core`
already runs in production. Cells stamp the same `evaluator_version_id`, so the single-version
checks at `0070:323-326` (assess) and `0070:502-505` (seal) pass on a mixed-lane run. The design now
**names the agent core as a SECOND cell-writing entrance** (TA-P11's review surface) rather than
implying it reuses the human door. B.2's red-point count is corrected to five; B.4 gains a negative
control — a wake credential calling `evaluate_metric_v1` directly still raises CLR04.

### GB-2 · `report_artifacts.directed_by` / `prepared_by_agent` had no writer

**The finding.** §3.3 adds the identity pair to `report_artifacts` and ARM 1 compares
`art.directed_by` — but the estate's **only** `insert into clara.report_artifacts` is at
`0071:432`, inside `_seal_report_artifact_core`, which §3.1 (`:91`, "no CoR at all") and §4
(`:402-403`, "untouched") both declare off the D1 list. The row would land with
`prepared_by_agent = false` and `directed_by = null` — a durable record saying a human prepared it —
and ARM 1's artifact-side arm could never fire. **This is the exact S5 shape the section exists to
close, re-created inside it.** The same omission left `wake_seal_report_artifact`'s receipt with
nowhere lawful to be written: the core predates `report_agent_receipts` and the wrapper may carry no
DML, so either "no receipt, no act" was false for this verb or the forced B.1 catalog cell went red.

**The fold (design §3.1/§3.3/§4, F5-D23, B.5, C.8, P15).** `clara._seal_report_artifact_core` joins
the **D1 list as #6**: extended to `(p_firm, p_actor, p_obo, p_wake_kind, …)`, writing
`directed_by`/`prepared_by_agent` in the INSERT at `0071:432-435`, writing the F-A5 receipt, and
auditing with the pair at `0071:438`. `clara.seal_report_artifact`'s public signature is
**unchanged** — the nine-line human delegate at `0071:450-460` passes NULLs, as does the zeta
worker's ungranted call site. Battery B.5 forces the artifact-side arm **separately** from the
run-side one. New census **C.8** makes the class mechanical: for every column an identity wall
READS, a live-catalog test names its writer, and a wall column with no writer fails.

### GB-3 · The definition-approval maker/checker wall was removed, not re-aimed

**The finding.** §3.5 exempted `_agent_approve_metric_definition_core` from **all four** of `0084`'s
arms (`:229-234`, *"does not re-implement 0084's arms"*) on the strength of TA-P5's rider — which
exempts self-run report packs from **ARM 0, orphan adoption, only**. Standing law 69 says the
opposite in terms: *"maker/checker measures the DIRECTING human … the same arms extend to any later
act that mints-and-approves in one call"* (`docs/adr/README.md:420-424`), and `0084:13-16` names the
hole in its own words: *"a human directs the agent to draft, then approves it. That is
self-approval wearing a costume."* The gap is **reachable in PR-2, not hypothetically**: §3.1
registers `wake_approve_metric_definition` as `('interactive', …)` now, so an ordinary chat turn
reaches it — Alice proposes on the human lane, asks Clara to approve, the lifecycle arm sees
`approved_by = agent_user_id()` plus a rationale, and the draft reaches `firm_approved` with no
distinct checker and no attestation. The approved formula then produces cells the claim gate no
longer marks uncertified. §3.5 is also internally inconsistent: it marks `subject_author='human'`
for the far less consequential *reject*, and marks nothing for *approve*.

**The fold (design §3.5, F5-D24, F5-D16 corrected, A.2, B.6, OQ-5).** The wall is **re-aimed, not
re-imposed**. With `v_maker` = the draft's human proposer or (for an agent draft) its
`proposal_evidence.on_behalf_of` director re-read for standing, and `v_checker` = the approval
wake's `on_behalf_of`: **ARM 0′** orphan/departed maker → adoption with the attestation, *except
inside a self-run pack* (TA-P5's rider at its stated width); **ARM 1′** `eligible >= 2` and
`v_checker is not distinct from v_maker` → refuse `definition_directed_self_approval`; **ARM 2′**
`eligible = 1` and the same collision → the directing human's `p_self_approval_attestation` text is
required and recorded; **fall-through** — a different accountable human, or no director at all →
approved with `approval_arm='agent_self_approval'`, no attestation. **TA-P1 C is not narrowed:
Clara's own undirected drafts still self-approve.** What the wall refuses is a HUMAN using Clara as
his own checker. B.6 forces it in both polarities plus the solo arm. `0084`'s body is not recut.

---

## 3 · Materials — each folds into v2

**GM-1 · The D1 body list was five and is nine.** §4's enumeration missed the artifact core (GB-2),
both template publishers (GM-4) and the render enqueue (GM-3). **Fold:** §4's table re-derived at
nine with a reason per row; E-P10 re-cut from "five" to "nine, and the recount is the number §4
prints"; the shared-body collision check re-derived at nine against F-A2's ten-body list
(`f-a2-annexes-1-estate.md` §B.9) — **intersection empty**, and still disjoint from
`finalize_close`.

**GM-2 · `ck_rr_issue_mode` does not exist.** §4's DDL 2 ordered a drop+add of a named constraint
that appears nowhere in the repo: `0065:384` is `issue_mode text check (issue_mode in (...))`, an
**anonymous inline column check**, unlike its named siblings `ck_rr_issue_paired` (`:398`) and
`ck_rr_solo_attested` (`:403`). The migration would have errored inside a D1 window — the worst
place to discover an unstated dependency on PostgreSQL's generated name. **Fold:** §4 DDL 2 now
drops the generated name (expected `report_runs_issue_mode_check`, **read from `pg_constraint` at
PR-0**, prediction **P13**) and adds a NAMED replacement so the next extension has a handle;
F5-D10 corrected in place. *(Annex D's F5-D10 had cited `0065:384` correctly all along — the defect
was confined to §4's table, which is exactly the artifact meant to hand a correct object name to
whoever writes the migration.)*

**GM-3 · Two audit rows on this lane carried NULL `via_wake_kind`, one misattributing Clara's act
to a human.** §3.4 claimed *"`via_wake_kind` is never NULL on this lane"*, but
`_seal_report_artifact_core` audits `(null, null)` at `0071:438` and `enqueue_render_job` audits
`(r.firm_id, r.requested_by, null, null, …)` at `0080:352` — and after §3.3's repair
`requested_by` is the DIRECTING HUMAN, so the log would read "Alice enqueued a render" for a render
Clara enqueued inside Clara's transaction. That is the S5 identity class re-created in the audit
trail, in a body the design chose not to touch. *(The same defect class was already ruled once in
this sitting's own agenda — A4-M5, "via_wake_kind no longer hardcoded NULL".)* **Fold:** the
artifact seal is fixed by GB-2; `clara.enqueue_render_job` (`0080:254`) is **extracted** to
`_enqueue_render_job_core(firm, actor, obo, wake_kind, …)` as **D1 #9**, the public name staying the
delegate the leader's sweep (`0080:369`) calls, with `prepared_by_agent`-aware attribution so the
belt cannot re-create S5 either. §3.4's claim is narrowed to *"every audit row written by an F-A5
core"*, with the leader's sweep enumerated as the one legitimate NULL (F5-D27).

**GM-4 · The two template publishers were specified as NEW cores, duplicating live judgement.**
`0069:261-266` states the estate's rule for exactly this case, for the sibling verb, verbatim:
*"Every check below stays in the core and nothing agent-specific is added to it, so there is ONE
piece of drafting judgement rather than eta re-deriving it."* The judgement at risk is real:
`publish_chart_template_version` (`0069:214`) runs `_validate_chart_spec_semantics_v1` (`:224`), the
effective-window overlap/reversal refusal (`:236-239`), the supersede of the current published
version (`:241-242`) and the content-hash derivation (`:243`); `publish_report_template_version`
(`0069:109`) carries the statutory/management floor branch at `:121`. C.4's one-architecture census
is scoped to arithmetic over cells and would not have watched them drift. **Fold:** both are
**extracted** to `(firm, actor, obo, wake_kind)` cores with thin human delegates — **D1 #7 and #8**
(F5-D26). Extraction removes the drift surface, so C.4 needs no widening.

**GM-5 · The wrapper roster was enumerated as eighteen and counted as sixteen.** Annex A.1 headed
"The sixteen wrappers" over 14 single-verb rows + a four-reader row = **18**, while §3.1's table
listed 12 + 4 = 16, silently dropping `wake_assess_report_claim` (a standalone granted human verb at
`0070:279`, not merely an internal step) and `wake_export_sandbox_view` — **the law-28 egress
surface**. Census C.2 was written as *"the sixteen new wrappers have exactly one grantee each"*, so
two granted verbs sat outside the census that exists to prove the grant roster. This is the design's
own GM-9 lesson applied to itself. **Fold:** A.1 is the enumeration and every downstream count reads
it; §3.1's table regains `wake_assess_report_claim`; **C.2 is written against the NAME LIST in both
directions** — a catalog verb A.1 does not name fails, and an A.1 verb the catalog lacks fails too,
because a roster that can only find extras cannot find omissions (F5-D30). Post-severance the count
is **seventeen new + one repointed = eighteen granted**.

**GM-6 · The "inert until the ceremony" safety property had no mechanism.** §3.5/§5 leaned on the
`evaluate_fs_pack_agent` row being born undeployed, but **nothing in the computation path read that
row**: `evaluate_metric_v1`'s `and deployed` lookup (`0059:112`, repeated at `0077:160-161`) names a
DIFFERENT row, `_tf_evaluator_deploy_once` (`0060:93-100`) governs only the transition, and
`assert_wake_allowed` (`0004:114-120`) checks only the allowlist. The estate has already shipped this
exact pattern once — `0100`'s resolver repoint calls its new evaluator unconditionally, deployed flag
notwithstanding. So PR-2's grants alone would have made the chain live, which is the half-live state
§5 says the ceremony prevents. **Fold:** `_agent_evaluate_fs_pack_core` resolves its **own** row
(`evaluator_name='evaluate_fs_pack_agent' and version=1 and firm_id is null and deployed`) and raises
CLR10 `evaluator_undeployed` when absent, in `0077:161-164`'s shape; a forced B.2 twin calls the verb
**before** the ceremony and observes the refusal (F5-D28).

**GM-7 · The sandbox export core cannot be built in the order it is written.** Three defects, all in
§3.6/§3.6.2: `p_view` occurs **exactly once** in the entire four-file set (`design:263`) with no
table, shape, owner or lifecycle anywhere; the core records "the content sha256" in step 3 and hands
the render out in step 4, into a row the same sentence declares **append-only** — and this estate's
append-only idiom blocks UPDATE as well as DELETE (`0003:490`, `0005:280-298`), while the estate's
real order passes the hash IN as a parameter (`0071:121-124`); and the recipient-coverage check
derives the exported client set from preview cells alone, blind to the narrative-aggregate half of
the same export — **worse than blind**, because `clara.freeform_read_log` (`0002:308-315`) has no
`client_id` column at all, so a client entering through an aggregate is structurally unrecoverable
from the table the check would read. **Fold: severance (§4 below).**

**GM-8 (rulings) · Drift consent was refused to Clara, narrower than TA-P1 C.** §3.1 hard-refused
`p_accept_drift` (`render_drift_consent_human`) and §7 named "no drift-consent verb" a non-goal,
citing F5-OQ-10 and law 70. But TA-P1's ruling of record names **render-drift consent** among the
acts passing to Clara (`docs/adr/0074-the-track-a-sitting.md:33`), and the Wave-F contract spells it
under the heading *"Verbs that become the agent's (TA-P1 C)"*: *"render re-queue **including drift
consent**"* (`wave-f-contract.md:214`). Law 70's digest text (`README.md:425-428`) is a **descriptive
mechanism clause** — *"a human requeue … RE-DERIVES pinned inputs recording both digests (drift
consented via `p_accept_drift`)"* — not a forward reservation in law 74's "stays human" form, and
ADR-0074 records no carve-out for it. Annex D had no "drift" row, so the deviation was undisclosed.
**Fold: widened to the ruling** — `p_accept_drift` passes through `wake_requeue_render_job` with its
own model/rationale/receipt binding (TA-P4); the refusal token is retired; A.4's human-act row is
re-cut to say drift consent is no longer a reserved human act; §7's non-goal is retired (F5-D25).
**No dissent is recorded, because the design lane had none — it had a mis-citation.**

---

## 4 · The width ruling

**F-A5 stays in the train; PR-0 FAILS at v1; the sandbox export path is SEVERED.** Both lenses
converge on the shape and neither asked for the item to leave.

1. **The chain half stays** (§3.1-§3.5, §3.7-§3.10). GB-1, GB-2, GB-3 and the materials are all
   **bounded re-cuts with a known-correct shape already in the estate** — η's node-level idiom,
   `0071`'s core+delegate, `0084`'s arms, `0069`'s WRAPPER+CORE rule. The survey behind them was
   judged the best-grounded of the Track-A set. v2 is this document's fold list; PR-1 may start when
   v2 lands and the digest is re-signed.
2. **The sandbox export path LEAVES** — `wake_export_sandbox_view` + `_sandbox_export_core`,
   `clara.sandbox_exports`, the recipient-coverage check, the second render entrance, the
   `sandbox_watermark` rows, and OQ-3. It is a **different maturity** (GM-7: an undefined object, an
   unexecutable step order, a half-blind wall) **and it is the law-28 egress surface**, so it does
   not ride the same gate as the OBO closure. It gets its own design pass, its own named cross-model
   adversarial pass, and its own PRs; PR-1..PR-6 carry no dependency on it. **TA-P10 C-prime is not
   narrowed** — it is handed to a design that can build it, and R7 records the risk that a severed
   item never gets scheduled.
   **Orchestrator ruling 2026-08-22 (R-L15): the severance is ACCEPTED as SEQUENCING, and R7 is
   answered by registration** — the severed item is registered as lane **F-A5b "sandbox export"**
   in `PROGRESS.md`, with its own PR-0 carrying the law-28 cross-model pass, OQ-1/OQ-2's
   `sandbox_watermark` trio and OQ-3's recipient-scope model. F-A5 proper keeps the sealed lane's
   `artifact_watermark` trio. Default on the wording stands: no row seeded, the literals stay,
   R-N1 registered. **This is explicitly NOT a narrowing of TA-P10 C-prime.**
3. **The severance is scoped to what is unbuildable, and no wider.** `clara.watermark_policy_versions`
   (§3.6.1) **STAYS in F-A5**: it is buildable, it was not among GM-7's defects, and the sealed lane
   needs it in PR-4 to retire S7's three hardcoded literals (`layout.mjs:178-186`) — severing it
   would strand a registered defect (R-N1) behind an item with no schedule. The table is built once,
   here, with `policy_key='artifact_watermark'`; the severed item adds `sandbox_watermark` **rows**,
   not DDL. The **narrative-authority wall** stays too, in the receipt schema, for the same reason:
   it is buildable and it guards more than the sandbox. *(The bytes lens's severance list named
   §3.6.1 by section grouping; this ruling narrows it on the buildability criterion and records the
   difference rather than burying it.)*
4. **One D1 window, taken independently, ordered — not merged.** The rulings lens confirmed F-A5's
   window is disjoint from F-A2's ten-body PR-1 list and from the `finalize_close` surface, and the
   re-derivation at nine bodies (GM-1) leaves that true. The one real cross-item dependency is
   **sequencing, not a shared body**: F-A5's PR-5 self-run allowlist rows land **after** F-A4's
   `clara.wake_credentials` wake-kind CHECK swap, which is itself **extend-only after F-A2's D34
   swap**.

**The revised train:** PR-0 (this gate — FAILED, v2 folded) → PR-1 (DB, one D1 window, nine bodies)
→ PR-2 (grants + census) → **evaluator deploy-flip ceremony** → PR-3 (first real seal + drill +
minimal doors) → PR-4 (renderer: `artifact_watermark`, then N3) → PR-5 (self-run packs, behind
F-A4's clock) → PR-6 (acceptance) → **the sandbox export item, on its own gate.**

---

## 5 · Nits — folded without argument

Three load-bearing cites drift to neighbouring or wrong lines; a builder opening the first would
find an unrelated trigger function, which is cheap now and expensive inside a D1 window:

- the seal's single-evaluator-version check, cited `0070:78-82` at `design:127-128` and in the
  survey's S2 — that range is the `dataset_point_provenance_mismatch` raise inside
  `_tf_report_dataset_point_provenance`. **The real walls are `0070:323-326` (assess) and
  `0070:502-505` (seal).**
- `report_preview_deferred`, cited `0077:386` (annexes-1) → **`0077:390`**.
- `draft_watermarked`, cited `0077:387` (survey) → **`0077:392`**.

**The fourth cite in that finding is NOT drifted and is deliberately left alone.**
`layout.mjs:178-186` (`design:298`, `survey:210`) is already byte-accurate as a **block range** — it
brackets the two-function block containing all four literals. The finding's own proposed correction
(`:177-179` plus `:182`) is itself wrong on both halves; applying it would have replaced a correct
citation with an incorrect one. Recorded because it is a live example of the class: *a re-derivation
is evidence only when it is itself re-derived.*

---

## 6 · Refuted register — recorded so nobody re-raises them

**RF-1 · "House style is reserved to humans against TA-P1 C's ruled answer." REFUTED.** The
finding's load-bearing premise — that no standing law reserves house style — is false at the bytes.
**ADR-065 / E-R14** (ratified 2026-08-08, before the sitting) sets the six-layer template model with
*"firm house style (**owner-sovereign**; LLM drafts, human publishes)"*
(`docs/adr/0065-wave-e-contract-and-invariant-1-amendment.md:44`, restated
`wave-e-contract.md:306`). ADR-0074's own exhaustive **"Supersessions, narrowings and amendments
(exact)"** section (`:386-411`) names every law TA-P1..TA-P14 touched and **does not name E-R14**.
The sitting's own R-C human-act roster for F-A5 (`track-a-sitting-3.md:271-275`) lists publishing
firm house style as a human act in the same bullet where three siblings are explicitly tagged
*"TA-P1 C 已下放"* — a deliberate, legible distinction. And `wave-f-contract.md:211-212`, updated the
same day, reads: *"statutory templates and house style stay human — they go effective outside the
firm."* The design's Annex D row F5-D1 already cited **E-R14**. **Residual nit accepted:** §3.1's
bare *"owner floor (F5-OQ-4)"* was terser than ideal, so v2 re-grounds the citation on E-R14 +
ADR-0074:386-411 + R-C (F5-D31). The reservation stands.

**RF-2 · "The survey's banner over-states the gate by naming TA-P7 alongside TA-P1." REFUTED.**
The claim was a survey-vs-design *mismatch*, and there is none: `design.md:21-24` carries the same
sentence the survey does — *"TA-P1 (open register) and TA-P7 (attribution) are constitutional
amendments pending the owner's digest re-sign … no F-A5 PR may merge before the digest is
re-signed."* Both files name both rulings; the finding read only the "Binds under" list and the §5
one-liner. Applying its fix would have made two consistent files inconsistent. *(A narrower
observation would have survived — TA-P7's substance is never operationalised in F-A5's mechanics,
only asserted in the banners — but that is not the claim, and F-A5 does not attribute clients.)*

---

## 7 · Owner items — not decided by this gate

Each is recorded with the **fail-closed default the design proceeds on** while it waits.

1. **OQ-5 (new) — the solo-firm channel for GB-3's ARM 2′ attestation.** Annex G carries it in full.
   *Default:* the directing human's `p_self_approval_attestation` text is required on the wake call
   and recorded on the receipt; without it the approval refuses. **Escalated because** it is the one
   point where a standing law (69) adds friction to an act TA-P1 C devolved, and the owner rules
   toward maximum autonomy — a wider exemption would be a narrowing of law 69 and therefore his.
   **Orchestrator ruling 2026-08-22 (R-L14): RULED — no new owner ruling is needed; the
   fail-closed default IS the answer.** It is exactly TA-P6 A's "solo self-attestation arm"
   expressed on the agent lane: the DIRECTING human supplies the attestation words in the chat
   turn, the receipt records them, and absence refuses
   `agent_self_approval_attestation_required`. **Law 69 is NOT narrowed** — the attestation is
   still given by the human who approves. Clara's own undirected drafts are unaffected.
2. **OQ-1 / OQ-2 — the watermark wording and whether both policy keys ride one signing.** *Default:*
   no row seeded, the three literals stay, R-N1 stays registered. F-A5 needs only
   `artifact_watermark`; `sandbox_watermark` rides the severed item.
3. **OQ-3 — the recipient scope model. MOVED** with the severed sandbox item; recorded in Annex G so
   the question is not lost in the move.
4. **OQ-4 — which real books carry acceptance.** *Default:* a full synthetic round labelled per
   ADR-048 with the deferral recorded. The owner must mint a `reporting_period` on a real client for
   the real-books arm; the registry is empty today.
5. **P12's standing exposure** (carried from v1, not re-decided): nothing structural forbids
   inserting a `firm_capability_grants` row for the agent, so the key-2 gate that keeps
   `approve_report_for_issue` out of Clara's reach is only as strong as "zero such rows exist." The
   pre-quiesce read counts them; if one exists, the gate needs its own wall.

**Cross-item SEQUENCING obligations — stated, owned elsewhere, not decided here.**

- **F-A4's B13 oracle admission.** `_assert_due_read_ctx` admits a JWT **or** `clara_runtime` only.
  The fix is an **ungranted core extracted below the admission**, which F-A4's own §7 / D-14 must
  explicitly reverse (or name a different oracle) — **SATISFIED by close-key-1 D-26 as written
  (orchestrator ruling 2026-08-22 (R-L11): an additive ungranted `_adjustment_run_due_core`
  extracted BELOW the admission at `0045:5525`; the live oracle keeps its admission, and §7's
  non-goal narrows to "no change to what the oracles ANSWER").** F-A5 consumes nothing from it
  today; if the self-run pack's data gate ever reads through that oracle, PR-5 inherits the
  dependency.
- **Track-B task #17 Fix A is claimed by both F-A4 and Track B — name ONE owner.**
  **RULED 2026-08-22 (R-L9/GM-7): the owner is F-A4 PR-1b.** *Recommendation as written:* **F-A4's
  `finalize_close` window carries Fix A and Track B's battery rides it.**
  F-A5's obligation is only to stay off that window, which §4's re-derived nine-body list confirms.
- **The clock execution path is F-A4's, shared with F-A3 and F-A5.** A `kind='wake'` `agent_task` is
  born **held**, with `held -> cancelled` its only other legal transition. F-A5 §3.7 registers a
  consumer and neither restates nor varies it; PR-5 does not land until it exists.
- **`chatTurn._vN` chains are claimed by F-A2's PR-2 first.** F-A5's chat parity ships as the next
  unclaimed `_vN` **at its merge time** — v1's hardcoded `v14` is a train-order guess, not a design
  fact (law 40: new export + registry repoint, never an in-place edit).
- **`wake_credentials` CHECK pairs are extend-only after D34.** F-A5 adds allowlist **rows** only;
  the kind/client CHECK swap belongs to F-A4 and must extend, never weaken, the enumeration F-A2's
  D34 established.
- **The evaluate leg's lawful entrypoint carries an η dependency, stated honestly.** F-A5 reuses
  `_eta_request_report_preview_core`'s idiom (`0077:160-164` + `:222-226`) over the frozen
  `_metric_eval_node_v1`. That node is a shared surface: if η ever re-cuts how it mints
  `metric_evaluation_contexts`, F-A5's core must move with it. P14 puts the premise on the rig.
- **F-A6's receipt must not be FORGEABLE by the payload, and the read role's privilege set over
  every other table does not move.** *(Orchestrator ruling 2026-08-22 (R-L16): this obligation was
  written as "F-A6's receipt writers must NOT be granted to the read role" — unmeetable under the
  SECURITY INVOKER shape F-A6 needs, since its SQL must execute as `clara_freeform_ro`. Re-worded
  to its ruled intent; the DEFINER-outer + `SET LOCAL ROLE` alternative was REJECTED as a worse
  failure class.)* F-A6's default SHIPS with the grant plus a **one-arm/one-settle** shape, so a
  payload that calls the settle or arm verb itself aborts the transaction and a read with no settled
  receipt cannot COMMIT. **F-A5's obligation is unchanged:** C.3/C.4 still assert that
  `clara_agent_ro`'s privilege set does not move, and F-A5 still refuses to consume a read that
  left no receipt.

---

## 8 · What PR-0's and PR-1's rig replay must confirm (the gate's own obligations)

Beyond Annex E's carried predictions, this gate adds five and re-cuts one:

1. **P13 (new)** — read `pg_constraint` for `clara.report_runs` and **print the constraint names**.
   The migration drops the name the read returns; no file guesses it. (GM-2.)
2. **P14 (new)** — call `_metric_eval_node_v1` under a wake credential through a throwaway definer
   core and record the errcode. **If it carries its own `_human_ctx`, the evaluate leg has no lawful
   entrypoint at all and §3.2 is re-cut again, in writing.** (GB-1.)
3. **P15 (new)** — a caller census for `_seal_report_artifact_core` (repo-wide **and** live catalog),
   then a replay of the human seal across the signature change. (GB-2.)
4. **P10 (re-cut)** — the D1 body list is **nine**; the PR-1 replay recounts the CoR'd bodies and
   **the recount is the number §4 prints**, not a number §4 asserts. (GM-1.)
5. **The lineage tips of all nine D1 bodies**, re-derived by rig replay at their live definitions —
   never by name-grep, and never against a design's own cite. The bodies: `0070:210`, `0070:279`,
   `0070:437`, `0072:49`, `0059:26`, `0071:121`, `0069:109`, `0069:214`, `0080:254`.
6. **Both polarities of the two re-aimed walls**, observed on the rig before PR-1 is called done —
   ARM 1's artifact-side arm (GB-2) and ARM 1′/2′ of the definition approval (GB-3). A wall seen
   only refusing is not yet a wall; a wall seen only admitting is not one at all.
