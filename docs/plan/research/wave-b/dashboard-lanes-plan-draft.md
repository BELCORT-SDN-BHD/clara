# Wave-B dashboard lanes — plan DRAFT v0.2 (for the Socratic debate; NOT ratified)

v0.2 folds the research digest's adoptions (`dashboard-research-digest.md`): the K5
checklist-attestation ceremony, the plan as an addressable page, the interview state
chip + Activity-thread rendering, layered-disclosure citation chips.

Scope source: design part 3 "Runtime/dashboard consumers" dashboard bullet + P14/P15/P18/
L5 + the v25 memo's route contract + `docs/design/DIRECTION.md` (the agent-native
acceptance test governs every surface; accounting-correctness > contracts > look).
House seams (as-built): PostgREST rpc via `apps/dashboard/app/shared/wire.ts` as
`clara_authenticated` (fresh op_key per write; the UI computes NO figure); typed mappers
in `reviewTypes/reviewCardTypes` (null-defaulted degrade); `QueueRowView` switches on
`row_kind`; `useCard` hydration discipline; BatchApprove = N independent calls,
per-row outcomes.

## Lane D1 — queue + lint findings (P18/L5)

- Mapper: `toReviewQueue` gains `finding_id` (null-defaulted) + `counts.lint_findings`
  + the envelope `lint { stale_evaluator }`; a pre-0017 envelope degrades to null
  (the watch_id precedent).
- `QueueRowView`: `row_kind='lint_finding'` branch — title from dedupe-kind vocabulary,
  severity chip (shape+label, never hue-only), section per rank (critical → needs_you).
- `QueueDetail`: lint branch hydrating `LintFindingCard` on `get_lint_finding`
  (useCard; NO envelope-regex wart) — kind, severity, DB-computed figures/deltas
  (sen-exact, rendered verbatim), episode lifecycle, prior-episode link.
- Verbs: `resolve_lint_finding(p_finding, p_conclusion, p_note, p_op_key)` — typed
  conclusion picker (corrected / accepted_revision / false_positive /
  superseded_by_edit), note, bookkeeper+ floor surfaced.
- A gated lint tile (counts.lint_findings > 0) on the queue header.
- THE MISSING GATE (0016 wart): a queue-kind PARITY TEST — every row_kind the DB can
  emit has a QueueRowView branch + a QueueDetail branch + a fixture; unknown-kind
  renders the explicit degrade row, and the test enumerates the DB CHECK vocabulary
  against the rendered set.

## Lane D2 — onboarding + the interview surfaces (O3/O4/O5, FORK-8, P19)

- Client lifecycle: `begin_client_onboarding` verb (admin+); client pickers BADGE
  `onboarding` (never filter — the takeover upload must target them); `status` chip.
- The client-interview panel (drives the v25 runtime routes, NOT chat):
  POST `/api/interview/client/start` {clientId, planId} (202/200 existing:true);
  live prompts from the run readable (`interview_prompt` chunks: parkIndex/seg/phase/
  question) with GET `/api/interview/state` as the resume/refresh snapshot;
  answer/cancel POSTs (409 not_pending = already-delivered ⇒ refresh state);
  echo-back is workflow-side — the panel renders question → answer → the echoed
  confirmation ask as one thread; park = a visible "waiting (parked, resumable)" state,
  kill/reload-safe by construction.
- The firm-interview surface (pre-firm principal): same panel, `scope=firm`; the COMMIT
  handshake: the commit park surfaces the stable op_key → the dashboard calls
  `create_firm(name, admission_token, op_key)` via PostgREST (the token lives ONLY in
  the dashboard form → PostgREST; never the runtime) → POST the {firm_id, plan_id}
  receipt as the answer (snake accepted verbatim).
- Plan-as-document view (P14/P19, DIRECTION §4.4): the plan card — items grouped
  must_ask/capture/todo, answered/pending/deferred states, required_for_commit flags,
  the revisions record (intended-vs-actual), the 'still to capture' checklist (B-12);
  `resolve_onboarding_plan_item` as the workbench verb (bookkeeper+).
- Commit ceremony: `commit_client_onboarding(client, plan, expected_revision, op_key)`
  (admin+) with the stale-plan (CLR06) refusal surfaced as re-review; the dry-run gate
  rendered BEFORE commit (see D3's deltas card); the temp-admin note for
  owner+bookkeeper firms (the open ruling) surfaced honestly in the refusal path.
- Agent-native acceptance: every interview outcome is also visible workbench state
  (the plan object) with object-level verbs — remove the panel and the plan view still
  tells the whole story.

## Lane D3 — the carry-down workbench (K1–K12; Gate K's operating surface)

- Seed lifecycle: `create_opening_seed` (bookkeeper+; tie-document picker filtered to
  verified `opening_balance_doc`/`management_account` filings; the keyed-in FALLBACK
  lane visibly attributed) · `cancel_opening_seed` · `reopen_opening_seed` (B-12).
- Targets: `record_opening_target` (keyed lane, per-line entry attribution);
  parsed-lane rows read-only (runtime-written).
- OB item drafting: `draft_opening_item` per K3 kind (gl_balance lines editor with the
  control/OBE/RE refusal surfaced; ar/ap per-item forms with counterparty + SST facts
  (WB-R11) + WB-R12 bank items; equity_net balance-sheet-sign input; the obe_plug one
  item) · `seed_fixed_asset` (FORK-7 refusal → the plan todo, shown) — every figure
  DB-validated, UI computes nothing.
- The dry-run card: `get_opening_dryrun` — per-line computed-vs-document deltas
  (sen-exact, DB-authored), OBE net, unmapped labels, missing must-asks. This card is
  ALSO D2's pre-commit gate render.
- The K5 approve ceremony (ONE serializable txn): a POSITIVE-ACKNOWLEDGMENT CHECKLIST
  above the approve action (research adoption 1 — the high-stakes-approval pattern):
  (a) the tie document + per-line sen deltas reviewed (the dry-run card embedded),
  (b) maker≠checker identity surfaced (or the solo attestation typed out), (c) blast
  radius stated (N entries post at as_of), (d) the correction path named (supersede) —
  each acknowledged before `approve_opening_seed(p_seed, p_expected_plan_revision,
  p_tie_document_sha256, p_entry_revisions MAP, p_attestation, p_op_key)` enables;
  40001 → retry SAME op_key (wire-level); the ONE-transaction framing explicit (this is
  NOT the tick-list). `supersede_opening_item` + `approve_opening_correction` as object
  verbs on a finalized seed.
- Serializable-rpc RESOLVED (PostgREST docs, references/transactions.md: "can be
  modified ... for a specific function call by setting default_transaction_isolation"):
  the WB-R18 ceremony applies `alter function clara.approve_opening_seed(...) set
  default_transaction_isolation = 'serializable'` (+ approve_opening_correction) as a
  ceremony SQL artifact beside the storage policies, and the post-ceremony probe calls
  the fn with a stale revision expecting `revision_mismatch` (NOT `not_serializable`) —
  proving the level took. Caveat probed at ceremony: Supabase's PostgREST must hoist
  default_transaction_isolation (db-hoisted-tx-settings default includes it). The
  40001 retry-same-op_key stays wire-level in `openingApi.ts`.

## Lane D4 — the seeding tick-list ceremony (S1–S5, WB-R2)

- Prior-GL intake path: upload rides the existing document pipeline; a SPREADSHEET
  prior-GL never reaches classify — the staff stamps `set_document_kind='prior_gl'`
  (the existing kind-stamp verb surface widened to the new kind).
- The batch view: `seeding_batches` + proposals grouped by kind
  (vendor_account_rule / counterparty_birth / wiki_fact), evidence ON the proposal
  (occurrence count, date span, prior-GL line cites) rendered as the professional's
  decision context; `refused` rows (control_account) visible, never tickable.
- The tick ceremony = the BatchApprove interaction precedent: N INDEPENDENT
  `tick_seeding_proposal` calls (fresh op_key each; per-row outcomes; one refusal never
  poisons the batch; CLR27 duplicate_live surfaced per-row) — visually and verbally
  DISTINCT from D3's one-transaction approval (the two ceremonies must never blur);
  `decline_seeding_proposal` + `complete_seeding_batch` verbs; unticked stays proposed.
- Reads RESOLVED (verified against 0017 lines 1427-1447 + 5114-5122): seeding_batches /
  seeding_proposals (and ALL the Wave-B tables incl. onboarding_plans/_items/_revisions,
  opening_* and lint_findings) carry `clara_authenticated` SELECT grants + firm-scoped
  RLS (`firm_id = jwt_firm()`) — the dashboard reads them DIRECTLY as PostgREST table
  reads. No read-fn gap; no 0018 need for D4.

## Cross-cutting

- NO new ClaraPart members this wave (interpretation to debate): the interview renders
  on its OWN typed stream (interview_owner/prompt/terminal) in the onboarding surface —
  chat v7 emits no new part types as built; the design's "plan/interview parts emitted
  only from v7" pin therefore binds a FUTURE part addition, not this wave. If the debate
  overturns this, parts land atomically (catalog + branches + fixtures) per the pin.
- Fixtures + tests per lane: mapper degrade tests (pre-0017 envelope), card fixtures,
  the parity test (D1), route-client tests against recorded shapes; `pnpm typecheck` +
  dashboard build + the existing dashboard test suite stay green.
- Wire additions live in `reviewApi.ts`/`reviewCardTypes.ts` siblings
  (`onboardingApi.ts`, `openingApi.ts`, `seedingApi.ts`, `interviewApi.ts` — the
  runtime-route client with the JWT bearer).

## Open questions FOR THE DEBATE (Socratic targets)

1. ~~The serializable-rpc mechanism~~ RESOLVED — fn-scoped proconfig (ceremony ALTER
   pair + post-ceremony probe); challenge the residual risk if you see one.
2. Interview UX shape: one-question-at-a-time thread (as built runtime-side) vs a
   sectioned form with agent assist — does industry evidence argue for a hybrid
   (form-visible progress + conversational capture)? The runtime contract fixes
   question-at-a-time delivery; the PANEL may still render section progress.
3. ~~The seeding read surface~~ RESOLVED — direct PostgREST table reads under firm RLS.
4. ~~Plan view shape~~ RESOLVED by research adoption 2: an addressable PAGE
   `/clients/[id]/plan` (URL-as-truth; the plan-as-artifact industry convergence);
   the queue detail links to it. Interview panel gains the explicit state chip
   (awaiting_you / parked / cancelled / complete) + section progress (adoption 3).
5. Sequencing: D1 (smallest, unblocks queue parity) → D4 → D2/D3 parallel? D2 and D3
   share the dry-run card + plan card (D3 owns the dry-run card; D2 consumes).
6. The commit-lane temp-admin UX: surface-only this wave (the ruling is open) — is a
   guided "temporary admin ceremony" flow acceptable to ship, or strictly a refusal
   message + docs link until the owner rules?
