# Wave F sprint — handoff (written 2026-08-23 ~12:00 MYT, at the owner's pause)

> Written for a reader with no session, no transcript and no task board — only this repo
> (`.claude/rules/handoffs.md`). `PROGRESS.md` stays the state authority; this file is the dated
> bridge into it. Every resume step below names a file, a branch or a command.

## 1 · Where the estate stands

- `origin/main` = `6807b39` (#295). **Migration frontier `0102`; next free number `0103`; no
  `UNNUMBERED_*` on main.** No Wave-F code PR has merged yet — T0 (F-A2 PR-1 merged) is not reached.
- Merged today (docs-only): #284 Track-A v2 design sets + legal pack · #285/#286 ratification
  residue + law 77 · #287 invariant-(a) product text · #288 **ADR-0075** (test-data authority widened;
  constraints 12-14 re-scoped) · #289 split pass + D17 · #290 CI runners 3-4 · #291 harness truing
  (auto-merge armed, CI re-running at the time of writing) · #292 Codex frontend handoff · #294
  worktree lesson · #295 F-T3 design v1.
- Open PRs: **#293** dependency bump (ai 7.0.77 · workflow 4.8.4 · world-postgres 4.3.4 · openai
  4.0.46; independently reviewed MERGEABLE; auto-merge armed, needs `gh pr update-branch 293` after
  #291 lands, then the ADR-0073 sweep `gh workflow run ci.yml`) · **#296** F-A5b + F-A6 v2 designs ·
  **#297** F-T4 design — both green, held for a batch merge after #291. Queued for the landing lane
  (open as docs PRs from their branches): track-b/ft3-taxcomp-trues (18c48a6), `track-b/ft2-payroll-
  design` (f7a010c), track-b/ft1-sst-design (3ec00df).
- Constitution: digest laws 78-82 RATIFIED 2026-08-22/23 (+ rider R-TA-P1-walls on law 78). The only
  ratification follow-up left: the `AGENTS.md` home for invariant (a) — decided (b), no duplicate.

## 2 · The build lanes — branch, content, what is next (resume by BRANCH, never by lane id)

Every lane works in its own git worktree on a throwaway Postgres (PG* vars; port in brackets); all of
them passed the rig replay of the live bodies they touch and were authoring at the pause. Common
rules lived in the session scratchpad wave0-common.md — the durable copy of its content is §5 below.

| Branch | Item / PR | Base | Rig | State at pause · next |
|---|---|---|---|---|
| f-a2/pr-1 (worktree agent-a9f6854…; HEAD 8092826 + round-5 commits) | F-A2 PR-1 (three migrations `UNNUMBERED_f_a2_{posting_core,posting_grants,posted_chain}.sql` + 18-file battery) | main | 56xx | Round 5 of the Codex cross-model review in progress: B1 kind-from-spelling → R-L21 (digit⇒ssm; letter⇒ambiguous, testable only with both kinds held); B2 `unreadable` class; B3 birth lock 203005004 in §E; B4 annex true + D44; B5 lock-race cells forced; H1 `wake_draft_entry` pin joins the D1 list; 22 false-green cells forced; three D34 proofs (mint `interactive_client`; DROP+ADD validates; stale skip reasons); "agent path writes no rule sightings" cell. **Next:** pristine-rig estate → settle → lighter re-review → conductor claims 0103-0105 → PR → CI → merge = **T0** → ceremony window **W1**. |
| f-a2/pr-1b | F-A2 PR-1b (UNNUMBERED_f_a2_pack_splice.sql, the `get_context_pack` fifth splice; read body, no D1) | f-a2/pr-1 | 55411 | C.10 battery rewrite (the `pack()` helper re-pointed to the real agent lane; same-firm foil; no OR-on-null). `pack_schema_version` NOT bumped (8 test pins + frontier-window cost); `delta-context-pack-residual.test.mjs:44` re-keyed to fail, not skip. |
| f-a2/pr-2 | F-A2 PR-2 runtime (autoDraft_v9, chatTurn_v13 + chatTurn.v13.infra.ts, pools `interactive_client`, registry repoints, allowlist rows, chat usage rows via F-A9's reshaped writer, 8-step cap as a named bound) | f-a2/pr-1 | 55412 | chatTurn v13 infra (mint surface + pinned-kind path). Merges after PR-1b and F-A9/PR-1A. |
| f-a3/pr-1a | F-A3 PR-1a nine extractions (sha-pinned, byte-parity cells; x42-r8 seam pin moves to the core; per-OID wrapper pins) | main | 55511 | Doc trues + two dated annex obligations for PR-1b (public-call hazard; X-1 vacuous arm 4). |
| f-a4/pr-1a | F-A4 PR-1a window A (`_measure_one_gate`, `_evaluate_one_gate`, `undated_documents` row + `_close_gate_undated`, `_gate_outstanding_items` branch, `_close_dry_run_core`; C15 13→14) | main | 55611 | Dry-run cell; settle. `statutory_deadlines` DDL is **PR-1c's**. |
| f-a5/pr-1 | F-A5 PR-1 nine bodies (P14 HOLDS; R-L23 tail-append on `_seal_report_artifact_core`, core DB-derives artifact identity; S9 enqueue line; issue-segregation repair; `evaluate_fs_pack_agent v1` undeployed; `watermark_policy_versions` DDL, no rows; C6 census) | main | 55711 | Fix derivation #6's regex reversal; finish; **states that `clara._hash` (55 call sites) becomes frozen at merge**; decide per member on `clara.evaluate_*` naming. |
| f-a6/pr-1 (HEAD 115119f) | F-A6 PR-1 (roles, 35 policies, 7 grants, `wake_freeform_read` + `_freeform_{arm,settle,scope_clients,admitted}` + ungranted `_freeform_core`; settle-once + deferred must-settle triggers; plan census with `explain verbose`) | f-a2/pr-1 | 55811 | Battery + censuses + doc trues; roster cells as closed-world roster maps (tests/fixtures/wake-allowlist-roster.mjs). P-12 is FALSE (57014 untrappable → Tier D). Law-28 adversarial review pending (Codex refused the prompt; a native lane substitutes). |
| f-a7/pr-1-pi | F-A7 PR-1 pi — **train position 2**: `agent_receipt_contract` (19 cols, `scope` last), `agent_receipt_surfaces`, seven typed empty shims, `agent_receipts_visible` (two closed arms + bookkeeper floor), conformance checker, pg_depend census, firm questions, name-family predicate, promotion card. No wake wrappers (beta's). | main | 55911 | Annexes §I.5, rebase, pristine estate, ACL-census cell (+ grant-one twin) → DONE → conductor claims **0103**, opens the PR. |
| f-a8/pr-1 (HEAD 62fd6b4) | F-A8 PR-1 Tier-1 DB | main | 56011 | **HOLDING for design v3** (design/fa8-v3, fold in progress: 11 law-28 walls, `evaluate_policy_source_value_v1` registered, `trigger_kind` omitted, CLR04/`_wake_cred_full` corrections, R-L26 projection `NULL firm_id, 'platform' scope`). Only fixtures committed; an all-skip battery is deliberately uncommitted. |
| f-a9/pr-0 | F-A9 PR-0 chat token-cap hotfix (`begin_chat_turn` CoR; 429 copy + `reset_utc` nulled in `chatRoutes.ts`; dashboard renders the DB message alone) | main | 56111 | db + runtime suites running; then push, **open its own PR**. |
| f-a9/pr-1a (stem UNNUMBERED_f_a9_llm_usage_reshape.sql) | F-A9 PR-1A ledger reshape (+5 cols, nullable firm/document/task, 4th FK `fk_llm_usage_events_firm`, sibling writer `record_agent_usage_event`, seeded price rows for gpt-5.6-terra/sol incl. snapshot stamps, `llm_usage_events_priced` **security_invoker**, `get_llm_usage_summary` with a platform bucket, explicit `scope` column + CHECK, scope-aware human policy) | main | 56112 | Closing the FK hole; estate; DONE → conductor pins its post-shape sha for F-A7/rho. |
| design/fa8-v3 | F-A8 design v3 (docs) | main | — | In progress; when pushed, tell the f-a8/pr-1 lane "v3 landed". |
| track-b/ft1-sst-design · `ft2-payroll-design` · `ft3-taxcomp-trues` · `ft4-fixqueue-design` · design/fa5b-and-fa6v2 | Track B + severed designs v1 | main | — | Docs PRs → then ONE PR-0 gate workflow over the six sets (lens-scoped reviewers + per-finding verify) → owner sitting → fold → build lanes. |

Not yet opened (Tier B, open when WSL memory allows — `.wslconfig` now has `memory=24GB`, effective on
the next WSL restart; restart only with no live rigs/CI jobs): F-A3 PR-1b ×3 (`_approve_entry_core`
gen 10, `bank_agent` kind, X-1's surviving arm, the three public-call repoints), F-A3 PR-1c egress,
F-A4 PR-1b ×2 (window B; task #17 Fix A; TA-P4 receipt cols; TA-P6 segregation), F-A4 PR-1c
(additive; **carries `statutory_deadlines` DDL per R-L22**), F-A5 PR-2, F-A6 PR-1b, F-A7 gamma, F-A7
alpha ×2, F-A9 PR-1C. The DAG with the full 58-position merge train and five ceremony windows was
the session file wave-f-dag.md; its merge order is reproduced in the conductor's ledger (`merge-
train.md`) — both session-local; the train order of record is: pi → F-A4/PR-1a → F-A9/PR-0 →
**F-A2/PR-1 [W1]** → F-A2/PR-1b → F-A9/PR-1A → F-A2/PR-2 → F-A5/PR-1,2 [C-flip] → F-A8/PR-1,2 →
F-A6/PR-1,1b,2,3 → F-A8/PR-3 → F-A4/PR-1b,1c,2,3 → F-A2/PR-3 → F-A3/PR-1a,1b,1c → F-A7 gamma, alpha,
beta **[W2]** → the rest; acceptance PRs last, each behind its item's ceremony (law 29 order).

## 3 · Rulings minted in this sprint (the durable record is the ADRs/gate records; these are the pointers)

Owner: SST deferral = **GL-carried** — key this ruling on the SUBSTANCE, never a letter: the orchestrator's card lettered GL-carried (a) and F-T1's Annex D lettered it (b); it covers the WHOLE payment-basis path, not only the s.11(2) edge (two accounts `sst_output_deferred` / payable; F-T1's PR CoRs
`_assert_sales_invoice_shape_at` after F-A2 PR-1 merges; B4-sales moves as a new generation in that PR) ·
training-share toggle OFF · Q1 numbers law A · Q2 apps/web in-repo + crude doors kept · Q3 narrow
test-data reading (ADR-0075) · Q4 Cloudflare Workers/OpenNext + invite-only + no-PII email · Q5 metering
gate 6 keep/7 remove · Q6 invariant-(a) home (b) · D17 prices developer-seeded · law 77 ratified.
Orchestrator (standing delegation): R-L19 seeded prices (PR-1E dropped) · R-L20 B8 not_evaluable on
zero citations, OCR-only refused at B3/B7 · R-L21 identifier kind = sound half only · R-L22 ONE
`statutory_deadlines` table, DDL F-A4/PR-1c · R-L23 seal-core tail-append · R-L24 deadline conflicts →
earlier date, per-regulator holiday rule · R-L25 Tier-1 re-opens for tax bands + CA rates (seeded) ·
R-L26 receipt surface: closed arms `((scope='firm' and firm_id=jwt_firm()) or (scope='platform' and
firm_id is null))`, `scope` column 19 last, arity derived from the contract · F-A7 pi = additive half only
(wake wrappers to beta) · `wake_open_question` widening owned by F-A7 · receipt shims stay DEFAULT +
UNGRANTED, the ACL census is the wall · `llm_usage_events` explicit `scope` + `security_invoker` priced view.

## 4 · Owner sitting — the open cards (ask one per turn, 大白话)

F-T1: DG-variations reading · synthetic-only positive path (no test client is SST-registered) · dual-
registrant GL split timing · invoice-date proxy for the missing service-performed date · unallocated-
credit closure scope · P.U.(A) 174/2025 unreachable (refuse B2B for the five new groups or infer) · the
self-billed e-invoice collision with `PROGRESS.md`'s UNSCHEDULED · NIL/per-item threshold grain · who
signs the law reading. F-T2: weekend rule by firm practice (15 Nov 2026 is a Sunday) · HRD conflict ·
PRD §4.96's staff allowances / self-billed / WHT with no contract home · CP21/22 family, CP58, Form E
grace · payroll-JV account convention. F-T3: acceptance oracle (one hand-worked YA) · who signs
treatment codes (named licensed tax agent) · annual law true-up owner. F-T4: claims accounting
convention (employee control account; 420-D01 directors; EQUITY sole prop; netting). F-A5b: the
sandbox watermark wording (the lane ships DARK until signed). F-A6 v2: admitting `ocr` bodies. F-A8 v3:
closed taxonomy vs free-text research under a TA-P3 purpose. Plus the items in ADR-0074's deferred
list. Heads-up for the owner as an employer: PERKESO LINDUNG 24 JAM opt-out closes 31 Aug 2026.

## 5 · Standing rules learned this sprint (the durable lessons; details in the memory file)

`pnpm db:migrate` skips `UNNUMBERED_*` files — rig runs use a numbered copy (scratch dir via
`CLARA_MIGRATIONS_DIR`, or on disk for the WHOLE rig session; edit = checksum drift → `db:reset`) ·
underscore-only stems · relaxing a `firm_id` NOT NULL hides rows under the 144 `jwt_firm()` policies —
explicit `scope` column, never NULL-inference · an owner-run plain view over an RLS+FORCE table leaks
cross-tenant — `security_invoker` when the base table is app-granted, ungranted inner views + an ACL
census when it is not · the evaluator freeze bites at MERGE over every registered row (no `deployed`
filter; rows can never be deleted — one registration attempt per rig) · roster cells are closed-world
maps keyed by migration stem, never bare counts · a forced cell asserts or `skipHere`s, never
`noteLane`+return · every git-active lane in its own worktree, no exception · the required check `ci` is
absent from `gh pr checks` until it starts · a grep of main answers "not on main yet", never "does not
exist" · Codex's cyber filter refuses attack-worded design reviews — phrase as control reviews or use a
native fresh-context lane · never pass a prompt with backticks inline to `codex exec`.

## 5b · Lane MODEL policy (owner directive 2026-08-23 — the sprint's first run got this wrong)

Every lane in the first run was dispatched `claude-opus-5`. That was an orchestrator error: it
burned the weekly budget in a night and bought nothing on the mechanical lanes. The policy for the
restart, at equal quality:

| Work | Model | Why |
|---|---|---|
| DB migration + battery authoring, rig replays, doc trues, the conductor, landing/PR mechanics | **claude-sonnet-5, effort xhigh** | Mechanical against a written design; the design already carries the judgement |
| Executable implementation, debugging, contract-blind test batteries, the cross-model review leg | **Codex `gpt-5.6-sol`, effort xhigh**, direct `codex exec` (the companion queue stalls) | Objectively testable work; a second vendor's eyes where review law 1 wants them |
| Evaluator semantics, accounting/tax judgement, security design review (law 28), a design fold that re-cuts a ruling, any lane whose failure is a wrong number | **claude-opus-5, effort xhigh** | Judgement-dominant; this is what the escalation is for |
| Orchestrator | Fable (this session) | Plans, rules, synthesizes; does not build |

Every dispatch pins `model` explicitly (hard constraint 5) — omission silently inherits Fable.
Codex refuses attack-worded security prompts under its cyber filter: phrase law-28 passes as control
reviews of our own product, and substitute a native fresh-context lane when it still refuses.

## 6 · Resume path (commands)

**Step 1 is DONE — do not redo it.** Every PR that was open at the pause has merged: the four Track-B /
severed design sets, this handoff, the harness audit and its truings, the dependency bump, and the
session-artifact landing. `origin/main` carries them all and the ADR-0073 sweep was dispatched after the
bump. The PR queue was empty at the close. Start at step 2.

2. Read `PROGRESS.md`, `docs/adr/README.md` §11-§12, this file, then the branch list in §2: for each
   branch, `git log --oneline origin/<branch> -5` and the item's design/gate record tell you the step.
   **Every build branch in §2 is pushed and intact**; none of them merged, so every lane resumes where
   its table row says, not from scratch.
3. Re-open lanes per branch (one worktree each; **explicit `model` per §5b — sonnet for the mechanical
   lanes, Codex for testable implementation and the cross-model leg, opus only where judgement
   dominates**), give each its rig port from §2 and the rules in `wave-f-lane-brief.md`; the conductor's
   duties (shared-surface ledger, numbering at merge, PR mechanics) are re-minted from §2's train order.
   **First lane to settle is F-A2/PR-1's integrator — its merge is T0 and opens ceremony window W1.**
4. Restart WSL at a quiet point (no live rigs, no CI job) to take `memory=24GB`, then open Tier B.
5. Owner sitting on §4; then the Track-B PR-0 gate workflow over the six design sets.
6. **Two small items the pause added, neither blocking:** the `/ready` storage write probe (Known issues,
   measured 2026-08-23 — recommended before the frontend merge), and the standing rule that an unruled
   OQ gets a Backlog line the day its gate record lands.
