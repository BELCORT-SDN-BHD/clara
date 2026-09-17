// Workflow registry — names the NEWEST version of each workflow class.
//
// The versioning law lives in docs/ARCHITECTURE.md §10, anchor
// #workflow-versioning-and-rollback (which also carries the supersession pointer for the
// "ARCHITECTURE Appendix A" the frozen bodies cite and can never be edited to re-cite).
// Policy (b): enqueue sites import from HERE so they always target
// the newest version. When a behavioural change is needed, add
// closeExample.v2.ts and repoint the entry below; keep the old export until
// zero non-terminal runs reference it (never rename/delete an export with
// in-flight runs — a rename strands parked runs, policy (c)).

import { closeExampleV1 } from "./closeExample.v1.js";
import { chatTurn_v2 } from "./chatTurn.v2.js";
import { chatTurn_v3 } from "./chatTurn.v3.js";
import { chatTurn_v4 } from "./chatTurn.v4.js";
import { chatTurn_v5 } from "./chatTurn.v5.js";
import { chatTurn_v6 } from "./chatTurn.v6.js";
import { chatTurn_v7 } from "./chatTurn.v7.js";
import { chatTurn_v8 } from "./chatTurn.v8.js";
import { chatTurn_v9 } from "./chatTurn.v9.js";
import { chatTurn_v10 } from "./chatTurn.v10.js";
import { chatTurn_v11 } from "./chatTurn.v11.js";
import { chatTurn_v12 } from "./chatTurn.v12.js";
import { chatTurn_v13 } from "./chatTurn.v13.js";
import { chatTurn_v14 } from "./chatTurn.v14.js";
import { chatTurn_v15 } from "./chatTurn.v15.js";
import { chatTurn_v16 } from "./chatTurn.v16.js";
import { chatTurn_v17 } from "./chatTurn.v17.js";
import { chatTurn_v18 } from "./chatTurn.v18.js";
import { chatTurn_v19 } from "./chatTurn.v19.js";
import { chatTurn_v20 } from "./chatTurn.v20.js";
import { claraWork_v1 } from "./claraWork.v1.js";
import { claraWork_v2 } from "./claraWork.v2.js";
import { claraWork_v3 } from "./claraWork.v3.js";
import { claraWork_v4 } from "./claraWork.v4.js";
import { documentIngest_v1 } from "./documentIngest.v1.js";
import { documentIngest_v2 } from "./documentIngest.v2.js";
import { invoiceFacts_v1 } from "./invoiceFacts.v1.js";
import { statementFacts_v1 } from "./statementFacts.v1.js";
import { statementFacts_v2 } from "./statementFacts.v2.js";
import { statementFacts_v3 } from "./statementFacts.v3.js";
import { witnessFacts_v1 } from "./witnessFacts.v1.js";
import { witnessFacts_v2 } from "./witnessFacts.v2.js";
import { witnessFacts_v3 } from "./witnessFacts.v3.js";
import { autoDraft_v1 } from "./autoDraft.v1.js";
import { autoDraft_v2 } from "./autoDraft.v2.js";
import { autoDraft_v3 } from "./autoDraft.v3.js";
import { autoDraft_v4 } from "./autoDraft.v4.js";
import { autoDraft_v5 } from "./autoDraft.v5.js";
import { autoDraft_v6 } from "./autoDraft.v6.js";
import { autoDraft_v7 } from "./autoDraft.v7.js";
import { autoDraft_v8 } from "./autoDraft.v8.js";
import { autoDraft_v9 } from "./autoDraft.v9.js";
import { autoDraft_v10 } from "./autoDraft.v10.js";
import { firmInterview_v1 } from "./firmInterview.v1.js";
import { firmInterview_v2 } from "./firmInterview.v2.js";
import { firmInterview_v3 } from "./firmInterview.v3.js";
import { clientOnboarding_v1 } from "./clientOnboarding.v1.js";
import { clientOnboarding_v2 } from "./clientOnboarding.v2.js";
import { clientOnboarding_v3 } from "./clientOnboarding.v3.js";
import { clientOnboarding_v4 } from "./clientOnboarding.v4.js";
import { clientOnboarding_v5 } from "./clientOnboarding.v5.js";
import { bankAgent_v1 } from "./bankAgent.v1.js";
import { closePrep_v1 } from "./closePrep.v1.js";

export const workflows = {
  closeExample: closeExampleV1,
  // F-A6 PR-2 (THE AUDITED FREEFORM READ, ADR-0074): REPOINTED v14 -> v15. v14's own repoint
  // note (v13 -> v14, OQ-6 bank chat parity) is preserved near the bottom of this file, with
  // F-A6's deploy-order note beside it. v15 adds ONE tool and changes nothing else; its DB half
  // (migration 0131 + the 0136 basis fix) is ALREADY MERGED AND CEREMONIED, so unlike F-A2's
  // pairing there is no migration riding with this image — what DOES ride with it is the
  // `clara_freeform_login` LOGIN + password ceremony and the CLARA_FREEFORM_DATABASE_URL secret,
  // which are a HARD PRECONDITION of the image booting at all (assertProductionPoolConfig is
  // fail-closed on that DSN — packages/runtime/lib/freeform-read.mjs states why).
  //
  // P6-1 (Q8's FOUR-CARD WIRE BUMP, 裁-9): REPOINTED v15 -> v16. v16 widens the transcript
  // union by four kinds and emits ONE of them (`freeform_result`, off an admitted
  // `read_books_freeform`); the other three have producers in other lanes, walled there by
  // grant and by wake-kind allowlist (chatTurn.v16.prompt.ts's header names each wall).
  // THE DATABASE NEEDS NO COUPLED MIGRATION, ceremony or new secret: all four hydrate surfaces
  // are already live, and v15's `CLARA_FREEFORM_DATABASE_URL` precondition is unchanged. But the
  // DEPLOY IS HELD on reader parity: apps/web must first declare every kind v16 can emit. The
  // The CI `build` job runs `check-parts-parity.mjs` and refuses while that reader trails the declarer.
  // A rollback to v15 still requires the standing parked-run preflight; it then stops minting the
  // new card without changing the database.
  //
  // FS-7 ECHELON-1 (裁-77's REPORT CHAT OPENER): REPOINTED v16 -> v17. v17 adds exactly THREE
  // narrative report tools — `open_report_run`, `assess_report_claim`, `seal_report_dataset` —
  // over the already-shipped F-A5 wake wrappers. It adds no wire kind: the wrappers' jsonb is
  // narrated in prose, v16 remains the newest part declarer, and the C-19 book-act terminal set
  // is byte-carried. The close-prep wrappers are deliberately absent: their task-bound
  // credential wall cannot be crossed by a chat-originated mint.
  // THE DEPLOY ORDER OWES NOTHING EITHER DIRECTION. Migration 0116 already grants and allowlists
  // all three report wrappers for an interactive credential, so no migration, ceremony, reader
  // change or new secret rides with this image. v16 stays frozen, built and exported for parked
  // runs and rollback policy (c).
  //
  // #623 (THE FIRST PERSISTENT CLARA SUCCESSOR): REPOINTED v17 -> v18. v18 adds exactly ONE tool
  // (`start_journal_work`) and exactly ONE wire kind (`work_accepted`), and joins that kind to
  // the C-19 book-act terminal set. Everything else is byte-carried from v17 by import.
  //
  // THE DEPLOY ORDER IS OWED IN ONE DIRECTION AND IT IS NOT OPTIONAL: MIGRATION 0178 MUST BE
  // LIVE ON THE DATABASE BEFORE THIS IMAGE ADMITS ANY WORK. `start_journal_work` calls
  // `clara.admit_journal_work`, and `claraWork_v1` below calls `clara.claim_work_run`,
  // `clara.wake_record_journal_entry` and `clara.settle_work_run` — none of which exists before
  // 0178. Against a pre-0178 database every one of those raises `undefined_function` (42883).
  // The failure is CONTAINED (the chat tool returns a typed refusal; the Work run settles
  // `failed` with a named invariant and posts nothing), so a wrong order corrupts nothing — it
  // just makes Clara refuse the thing it offered to do. Deploy 0178 first. The REVERSE order is
  // free: 0178 against a v17 image adds tables and verbs that nothing calls.
  //
  // THE READER PARITY HOLD APPLIES TOO, exactly as it did for v16: apps/web must declare
  // `work_accepted` (and claraWork_v1's `work_status` / `work_result`) before this image can
  // merge — the CI `build` job runs `check-parts-parity.mjs` and refuses while the reader trails
  // the declarers. A rollback to v17 requires the standing parked-run preflight; it then stops
  // minting the new card and stops admitting new Work, without changing the database. Work rows
  // already admitted keep their queued tasks, and a v17 image carries no `claraWork` export to
  // run them — so a rollback PARKS the lane rather than losing it, and that is the honest
  // description to put in a runbook, not "rollback is free".
  //
  // #643 + #644 (THE SHARED SUCCESSOR): REPOINTED v18 -> v19. v19 adds exactly TWO tools
  // (`start_periodic_adjustment_work`, `remember_client_information`), exactly ONE wire kind
  // (`knowledge_receipt`), and one new STEP — the honest knowledge-pack context read that renders
  // an unreadable pack as "unavailable" instead of as a client with nothing recorded (#603).
  // Everything else is byte-carried from v18 by import, including v10's own frozen context step.
  // ONE successor rather than two because both tickets shipped their non-frozen halves ready for
  // it and a frozen version is expensive to mint twice.
  //
  // THE DEPLOY ORDER IS OWED IN ONE DIRECTION: MIGRATIONS 0192 AND 0194 MUST BE LIVE BEFORE THIS
  // IMAGE SERVES A TURN. `start_periodic_adjustment_work` calls
  // `clara.admit_periodic_adjustment_work` (0194); `remember_client_information` calls
  // `clara.capture_knowledge_for` and the context step calls `clara.get_knowledge_pack` (both
  // 0192). Against a database without them each raises `undefined_function` (42883). Two of the
  // three failures are CONTAINED by a typed tool refusal and the third by construction —
  // `readKnowledgePack` classifies it `read_failed` and the block says the knowledge could not be
  // read — so a wrong order corrupts nothing; it makes Clara refuse what it just offered. The
  // REVERSE order is FREE: 0192 and 0194 against a v18 image add tables and verbs nothing calls.
  //
  // THE READER PARITY HOLD APPLIES AGAIN: apps/web must declare `knowledge_receipt` before this
  // image can merge — the CI `build` job runs `check-parts-parity.mjs` and refuses while the
  // reader trails the declarers. A rollback to v18 stops offering the two tools and stops reading
  // the knowledge pack, without changing the database; Work and knowledge records already written
  // keep their own durable surfaces. That is the honest runbook line, not "rollback is free".
  //
  // #638 + #652 (THE WAVE 2026-09-15 SHARED SUCCESSOR): REPOINTED v19 -> v20. v20 adds exactly TWO
  // tools (`start_staff_expense_claim_work`, `start_accrual_work`), ZERO wire kinds and ZERO steps.
  // Both new tools mint the `work_accepted` card v18 already declared, because both admit
  // `journal_entry`-purpose Work: a staff expense claim rides the existing purpose (migration
  // 0206's own amendment — a fourth `accounting_work.purpose` cannot post without recutting the
  // posting core), and an accrual occurrence is admitted by `clara._plan_admit_occurrence` through
  // `clara.admit_journal_work` with `adjustment_basis` NULL (0193). `WORK_ACCEPTED_PURPOSES` is
  // therefore UNWIDENED and `apps/web` needs no reader change at all — the first chat repoint in
  // this estate that owes no parity work.
  //
  // WHAT THE WAVE ASKED FOR AND THIS IMAGE DOES NOT CARRY, recorded here because a reader will look
  // for it: #653's `start_prepayment_schedule_work` and #647's `record_counterparty_alias`. Each
  // needs a door this lane cannot reach — `clara.create_prepayment_schedule` is `_human_ctx`-fronted
  // and granted to `clara_authenticated` alone (0208 §D.1), and `clara.add_counterparty_alias` has
  // no OBO twin at all (DECISIONS D11) — and a workflow cut does not write migrations. Both
  // contracts stay in their non-frozen modules, which are deliberately NOT imported by this closure.
  //
  // THE DEPLOY ORDER IS OWED IN ONE DIRECTION: MIGRATIONS 0206 AND 0207 MUST BE LIVE BEFORE THIS
  // IMAGE SERVES A TURN, on top of v19's 0192/0194. Against a database without them each new tool's
  // door raises `undefined_function` (42883), which `authoringRefusal` does not read as a governed
  // refusal, so the tool answers `internal` and the turn continues: CONTAINED, corrupting nothing,
  // and it makes Clara refuse what it just offered. The REVERSE order is FREE: 0206 and 0207 against
  // a v19 image add relations and verbs that nothing calls.
  //
  // ROLLBACK TO v19 stops offering the two tools and changes no database state; claims and accruals
  // already admitted keep their own surfaces and their queued Work runs under the unchanged
  // claraWork pin. The standing parked-run preflight still applies.
  chatTurn: chatTurn_v20,
  // #623 — A NEW CLASS, never a repoint. `accounting_work` tasks are dispatched here by
  // src/workRoutes.ts's post-commit enqueue and by the reconciler's own `accounting_work`
  // re-enqueue arm (lib/reconciler-work.mjs); both resolve the body through THIS object, which
  // is what the freeze-lint enqueue-provenance check requires. Nothing mints an
  // `accounting_work` task before 0178 widens the kind CHECK, so this key is inert against a
  // pre-0178 database rather than dangerous.
  //
  // #629 (SHARED WORK QUESTIONS): REPOINTED v1 -> v2. v2 adds exactly ONE wire kind
  // (`work_question`) and changes exactly ONE tool's input schema (`ask_question` gains a REASON
  // and one to six TYPED FIELDS); the recording tool, the chart read, the budgets and every
  // accounting boundary are v1's, reached by import. v1 stays frozen, built and EXPORTED below.
  //
  // THE DEPLOY ORDER IS OWED IN ONE DIRECTION AND IT IS NOT OPTIONAL: MIGRATION 0180 MUST BE LIVE
  // BEFORE THIS IMAGE RUNS ANY WORK. `claraWork_v2` calls `clara.open_work_question` and
  // `clara.work_authority_snapshot`, neither of which exists before 0180; against a pre-0180
  // database the park raises `undefined_function` (42883), which the classifier reads as an
  // invariant and the run settles `failed` with nothing posted. CONTAINED, not corrupting — but it
  // makes Clara refuse the thing it offered to do, so deploy 0180 first. The REVERSE order is
  // free: 0180 against a v1 image adds columns and verbs that nothing calls, and v1's own
  // `clara.open_interruption` park is untouched by it.
  //
  // THE READER PARITY HOLD APPLIES, exactly as it did for chatTurn v16 and v18: apps/web must
  // declare `work_question` before this image can merge — the CI `build` job runs
  // `check-parts-parity.mjs` and refuses while the reader trails the declarer.
  //
  // ROLLBACK TO v1 IS THE STANDING PARKED-RUN PREFLIGHT AND THEN A REPOINT. A v1 image cannot
  // consume a v2 hook payload's extra fields — it ignores them, which is safe — but it also cannot
  // OPEN a work question, so a rolled-back image parks new Work on a bare clarify that the new web
  // surfaces will not offer a form for. Work already parked on a v2 question stays answerable
  // (the door and the read doors are the database's, not the image's) and its run resumes under
  // whichever image is live. That is the honest runbook line, not "rollback is free".
  //
  // #631 (MODEL EGRESS OBEYS CURRENT PURPOSE AUTHORISATION): REPOINTED v2 -> v3. v3 adds NO tool
  // and NO wire kind. What it adds is a GATE and a RECORD: every segment prepares and CONSUMES a
  // single-use `accounting_work` egress authorisation immediately before `agent.generate` (the
  // wiki lane's own two-phase shape), and every step writes a redacted row to
  // `clara.work_execution_traces`. It also carries `client_id` on the `work_status` part (#738)
  // and three error-roster pairs (#737). v1 and v2 stay frozen, built and EXPORTED below.
  //
  // THE DEPLOY ORDER IS OWED IN ONE DIRECTION AND IT IS NOT OPTIONAL: MIGRATION 0195 MUST BE LIVE
  // BEFORE THIS IMAGE RUNS ANY WORK. `claraWork_v3` calls `clara.prepare_work_egress_dispatch` and
  // `clara.record_work_execution_trace`, neither of which exists before 0195. Against a pre-0195
  // database the DISPATCH raises `undefined_function` (42883) — which this closure treats as a
  // refusal, not an assumption of consent — so every Work would settle `refused` with
  // `egress_not_authorized` and post nothing. CONTAINED, not corrupting, but it makes Clara refuse
  // the thing it offered to do. Deploy 0195 first. The REVERSE order is NOT free in the usual
  // sense: 0195 against a v2 image makes the POSTING CORE demand a consumed authorisation that a
  // v2 run never prepares, so every v2 Work settles refused. The two halves of #631 ship together.
  //
  // THE READER PARITY HOLD APPLIES, and #631 moves the DECLARER SET rather than adding to it:
  // `claraWork.v3.parts.ts` replaces `claraWork.v1.parts.ts` in
  // `packages/runtime/scripts/check-parts-parity.mjs`, because `work_status` gains a field and a
  // discriminant may be declared in exactly one scanned file. The v3 shape is a strict SUPERSET of
  // v1's, so a reader transcribed from it reads a parked v1 run's parts correctly, with
  // `client_id` absent — which is why the reader declares that field optional and says so.
  //
  // ROLLBACK TO v2 IS THE STANDING PARKED-RUN PREFLIGHT AND THEN A REPOINT — AND IT IS NOT FREE
  // WHILE 0195 IS LIVE, for the reason above. The honest runbook line is: roll the image back only
  // together with a migration that relaxes the posting core's egress arm, or accept that the Work
  // lane refuses until the image rolls forward again. Work already parked on a v2 question stays
  // answerable (the doors are the database's, not the image's).
  //
  // #654 + #652 + #639 (THE WAVE 2026-09-15 SHARED SUCCESSOR): REPOINTED v3 -> v4. v4 adds NO wire
  // kind — `claraWork.v3.parts.ts` stays the declarer and `check-parts-parity.mjs` needs no new
  // file in its set. What it adds is a READ, two QUESTIONS and one POST-COMMIT ACT:
  //   · the client's governed knowledge, read once before the segment loop through the non-frozen
  //     `lib/knowledge-conflicts.mjs`, rendered into the opening message as DATA and never allowed
  //     to stop a run by failing; its `knowledge_version` rides into every `model_call` trace row's
  //     `observed` object (#654 stanza (a); `knowledge_version` was already in `work-trace.mjs`'s
  //     closed vocabulary, so the trace itself is unchanged);
  //   · `answer_accrual_term` (#652) and `ask_knowledge_conflict` (#654) — both EXECUTE-LESS, both
  //     parking through the same `clara.open_work_question` machinery `ask_question` uses, neither
  //     able to write anything. The roster goes from three names to five and the bundle id moves to
  //     `clara-work-tools/v4` accordingly;
  //   · #639's dependent fixed-asset particulars question, opened by the WORKFLOW after a commit
  //     whose entry birthed a register row with no method or in-service date, and applied through
  //     `clara.complete_fixed_asset_particulars_for` (`clara_runtime`-only, 0201 §E). It posts NO
  //     second journal; 0201's tail T.9 asserts the door's body names no `journal_entries` row.
  //
  // WHAT IS NOT CARRIED: #653's `read_prepayment_source`. Measured on the merged chain — every
  // prepayment read is `clara_authenticated`-only (0208 §D.1) and `clara.prepayment_schedules` and
  // `clara.document_service_periods` carry no select for any machine role — so the tool could only
  // return a grant refusal. The frozen prompt's "no source document" sentence is therefore UNCHANGED
  // from v3's, and #653's claraWork contract stays open.
  //
  // THE DEPLOY ORDER IS OWED IN ONE DIRECTION: 0192 (the knowledge pack) and 0201 (the particulars
  // door) must be live before this image runs any Work, on top of v3's own 0195. Against a database
  // without 0192 the knowledge read renders "unavailable" and the run carries on; without 0201 the
  // particulars discovery read finds nothing and no question is ever opened. Both are contained by
  // construction — the wrong order costs a capability and corrupts nothing.
  //
  // ROLLBACK TO v3 IS THE STANDING PARKED-RUN PREFLIGHT AND THEN A REPOINT, and it is not free while
  // 0195 is live for the reason v3's own note gives. A Work parked on one of v4's two new questions
  // stays ANSWERABLE under a v3 image (the doors and the read doors are the database's), but the
  // resumed v3 run has no tool call to match the answer to and will settle without using it — so a
  // rollback should drain v4's parked questions first, not only its runs.
  claraWork: claraWork_v4,
  documentIngest: documentIngest_v2,
  invoiceFacts: invoiceFacts_v1,
  // F-A2 WINDOW B (the statement ACTIVATION): REPOINTED. PR-4 shipped statementFacts_v2 built,
  // frozen and deliberately UNPOINTED because `statement_facts` is a LIVE lane — the registry
  // key IS the routing, so a repoint takes live traffic the moment the image deploys. The three
  // conditions that note named are now met: the persist verb (0098), PR-3's merge, and the
  // router/consent arm (the F-A2 Window-B migration, 0102). THIS LINE IS THE LAST STEP, and it
  // lands inside the SAME quiesce window as that migration, with the machine held stopped
  // between them — a witness-stamped task claimed by the OLD v1 image has NO DB-side guard (the
  // mirror gap does: v2 WAITS on an Azure-stamped task rather than egressing).
  // H-02/H-03/H-05: REPOINTED v2 -> v3 (period band derived from a printed statement date with
  // a STATED basis; printed institution name resolved to the bank roster code; a failed persist
  // settles its task instead of stranding it 'running'). UNLIKE the v1->v2 repoint above this
  // one carries NO coupled migration and NO deploy-order obligation: v3 sends the same wire
  // vocabulary to the same unchanged verb under v2's own engine snapshot and services bundle,
  // so a v3 task's DB-stamped engine_id matches this image the moment this line deploys, and a
  // rollback to v2 is fail-closed for free. statementFacts_v2 stays exported and frozen.
  statementFacts: statementFacts_v3,
  // F-A2 openers ①②: REPOINTED v1 -> v2. Unlike PR-4's statementFacts hold-back, this repoint is
  // the intended act — `llm_witness` tasks are minted by a router literal this window's DB
  // migration moves to `:v2` in the same ceremony, and the frozen behaviour WAITS (never
  // egresses) while the two halves disagree. witnessFacts_v1 stays exported and frozen.
  //
  // THE TWO REPOINTS ABOVE ARE INDEPENDENT, and the pairing is worth stating because they look
  // alike: each lane's frozen body compares the TASK's own engine stamp against ITS OWN image
  // snapshot before any egress and WAITS on disagreement. `llm_witness` pairs witnessFacts_v2
  // with the `:v2` invoice literal (0099); `statement_facts` pairs statementFacts_v2 with the
  // `:stmt-witness-v1` statement literal (0102). Neither guard can see the other's lane, so a
  // half-deployed window stalls the affected lane only — it never crosses.
  // debt/prompts-v3: REPOINTED v2 -> v3, the NEXT-ROUND QUEUE fold (five fixes banked out of the
  // 2026-08-21 F-A2 openers re-measure + the owner's 2026-08-24 discount-no-net ruling; full fold
  // in witnessFacts.v3.prompts.mjs's header). UNLIKE the v1->v2 repoint above, this one adds NO
  // answer key and widens NO wire schema, so it carries NO coupled DB migration and NO
  // deploy-order obligation — witnessFacts.v3.impl.ts reuses v2's own injected engine snapshot
  // unchanged (still `:v2`), so a v3 task's DB-stamped engine_id matches this image's snapshot
  // the moment this registry entry deploys. witnessFacts_v2 stays exported and frozen (policy
  // (c)) — the `llm_witness` lane's parks are the deployment-window kind, so a run still resuming
  // into the frozen v2 body at cutover time is the expected case, not a corner one.
  witnessFacts: witnessFacts_v3,
  // H-17: REPOINTED v9 -> v10. The unattended coder mapped three different counterparty-identity
  // uniques onto one untokened, question-shaped CLR23 and called every OTHER unique violation
  // double_coded, which is success-shaped. v10 replaces that substring test with an exact,
  // closed constraint-name map (autoDraft.v10.uniques.ts). NO COUPLED MIGRATION AND NO DEPLOY
  // ORDER IN EITHER DIRECTION: v10 sends the same wire vocabulary to the same unchanged verbs
  // and only re-reads an error this closure was already catching, so a v10 image against a
  // pre-migration database and a v9 image against a post-migration one both behave. The
  // kind-scoped alias unique that ships beside it is an independent DB-side fix — it changes
  // which collisions can HAPPEN, never how this closure reads one. autoDraft_v9 stays exported
  // and frozen (policy (c)).
  autoDraft: autoDraft_v10,
  firmInterview: firmInterview_v3,
  // 裁-21 PR-c: REPOINTED v3 -> v4. The ONLY difference is the question inventory
  // (CLIENT_SEGMENTS_V3 = V2 with `coa_seed` swapped): 裁-23 Q9's re-wording, D-13 item 4's
  // widened answer vocabulary, and the second plan item that finally CONSUMES coa_seed_decision.
  // Driver, persistence and v3's arm-before-announce fix are carried unchanged.
  // DEPLOY ORDER: none owed in either direction. v4 calls no new database verb — it writes one
  // extra plan item — and PR-b's clara.coa_chart_state accepts the LEGACY answer value, so a v3
  // image against a post-PR-b database and a v4 image against a pre-PR-b one both behave.
  //
  // #649 (THE WAVE 2026-09-15 CUT): REPOINTED v4 -> v5. THREE differences, all of them #649's own
  // successor contract, which DECISIONS §1.1 forbade the implementation branch from cutting:
  //   1. the inventory is `CLIENT_SEGMENTS_V4` — `sst_no` gated behind
  //      `sst_regime !== 'not_registered'` (H-52: the interview stops asking a client that has just
  //      said it is not registered for its registration number), and a new `fye_day` segment
  //      immediately after `fye` (D7: ASK the day, never derive it; `required_for_commit` stays
  //      FALSE because the commit gate is a live ceremony and moving it is a product decision
  //      nobody ruled). Every other segment is v3's SAME OBJECT REFERENCE;
  //   2. a known-facts PRE-READ of `clara.get_knowledge_pack` before the segment loop, so a fact the
  //      firm already recorded is an ABSENT question rather than an unanswered one — admitted only
  //      when the segment's OWN validator accepts the recorded value;
  //   3. "known, confirm": a recorded fact the validator REFUSES is shown inside the question rather
  //      than silently skipped. Writing the correction back is NOT built — that is
  //      `capture_knowledge`'s act under a named human's authority, and a workflow step carries no
  //      authenticated actor.
  //
  // DEPLOY ORDER: none owed in either direction. The one new read is `clara.get_knowledge_pack`
  // (0192), already granted to `clara_runtime` and live since the chatTurn_v19 image; against a
  // database without it the fold yields no known facts and the interview asks every question, which
  // is exactly v4's behaviour. `interviewRoutes.ts` needs no edit — the input shape is v4's.
  clientOnboarding: clientOnboarding_v5,
  // GATE G1's TWO WAKE BODIES — NEW CLASSES, never repoints. These two keys are what
  // clara.wake_engine_sources' own `workflow_export` column already names: migration 0133 §G
  // seeded ('bank_agent', ..., workflow_export 'bankAgent', ...) and ('close_prep', ...,
  // workflow_export 'closePrep', ...), BOTH enabled=false. The engine resolves a source's body
  // by bracket-indexing `workflowsByName` with that column's value (startWorld.ts), so the
  // registry KEY is the binding — there is no second table to update and no migration owed for
  // the wiring itself.
  //
  // WHAT CHANGES THE DAY THIS DEPLOYS: nothing at runtime. Both sources stay enabled=false, so
  // the engine never claims for them and never calls start() on either export. What DOES change
  // is that startWorld.ts's own note — "no bankAgent/closePrep export exists yet ... an enabled
  // row naming an export the registry does not carry would throw at start()" — becomes
  // false-to-fact: the exports now exist, so the owner's flip at the G1 rollout ceremony
  // dispatches a real body instead of dead-lettering.
  bankAgent: bankAgent_v1,
  closePrep: closePrep_v1,
} as const;

// Gate G1 (opus/Codex review, MUST D): a loosely-typed VIEW of the SAME `workflows` object above
// — NOT a copy, NOT a second source of truth, and now PROVABLY so — for the wake engine's dynamic
// dispatch, where `clara.wake_engine_sources.workflow_export` names a registry KEY at RUNTIME (a
// plain string column), which no single overload of workflow/api's `start()` can type statically.
// Every static enqueue site keeps using `workflows` unchanged; this export exists ONLY so a
// runtime-string-keyed lookup type-checks without an inline cast at the call site (an inline cast
// there would strip past the bracket access under the freeze-lint enqueue-provenance checker's own
// TS-cast-stripping rule and read as untraceable — see packages/runtime/plugins/startWorld.ts's own
// comment).
//
// `Object.freeze` is the mechanical guarantee an unchecked mutable alias lacked: it freezes AND
// returns the SAME object `workflows` already is (never a copy), so `workflowsByName === workflows`
// is a true statement at runtime, not merely by construction — asserted directly by
// tests/registry-view.test.mjs, which imports this file via the SAME tsx/esm/api register()
// idiom f-a1-pr3a-consumers.test.mjs / f-a2-pr2-post.test.mjs / f-a2-statement-activation.
// test.mjs already establish as this suite's own precedent for reaching a .ts workflow module
// directly (M8(a), opus R2 + Codex review: an earlier draft of this comment claimed that test
// could never run and deleted it — FALSE, caught by an independent review, not by this build's
// own re-check; the claim's own grep only matched static `.mjs` imports and never searched for
// this dynamic-import idiom). The runtime property is ALSO proven by (a) TypeScript's own type
// system — this declaration's annotation only type-checks because `Object.freeze(workflows)`'s
// inferred type IS assignable to it, which typecheck proves every PR, and (b) the
// REGISTRY-VIEW-INTEGRITY static check below, wired into freeze-lint and run on every PR — the
// runtime test is not a replacement for either, it is the third, independent leg. Because freeze operates on the
// shared object, `workflows` itself becomes runtime-immutable too (harmless: nothing ever
// reassigns its own properties) — so `workflowsByName.someKey = maliciousFn` THROWS (ES modules
// are always strict mode) rather than silently succeeding. scripts/check-frozen-workflows.mjs's own
// REGISTRY-VIEW-INTEGRITY check (capability (f)) parses this declaration structurally and rejects
// anything BUT `Object.freeze(workflows)` on the right-hand side, and rejects a second view export.
// NOTE J (opus/Codex review) — TRIED, REVERTED: narrowing the VALUE type to the per-class union
// `(typeof workflows)[keyof typeof workflows]` broke typecheck at the real call site
// (startWorld.ts) — a union of DIFFERENT workflow classes' input types is not callable with a
// dynamically-picked argument (a `{taskId}` input does not satisfy every arm of the union
// simultaneously; TypeScript overload resolution needs the argument to satisfy ALL arms, not
// just the one actually selected at runtime — inherent to a Record<string,...>'s dynamic-key
// dispatch, not a lint gap). More fundamentally, the note's own claim does not hold: what would
// catch a typo'd class name is narrowing the KEY type to `keyof typeof workflows`, never the
// VALUE type — and the key here MUST stay `string` (a DB-driven `workflow_export` column value,
// never known at compile time), so no value-type narrowing can add that protection. SHOULD I's
// actual fix (a bounded re-enqueue attempt cap, reconciler-wake.mjs) is what closes this gap —
// not a type change. `any` stays; the eslint-disable stays too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the comment above (NOTE J).
export const workflowsByName: Readonly<Record<string, (input: any) => Promise<unknown>>> = Object.freeze(workflows);

// Slice 6 repointed `chatTurn:` v1→v2, then v2→v3 (the GATE-3 live find: v2's
// park-resume re-sent collected stream output as an assistant INPUT message,
// which fails model-input validation after a WDK replay — v3 sanitizes the park
// message to text + the clarify tool-call only). Wave A2 repointed v3→v4 (the §9
// live find: v3's frozen draft tool was supplier-bill-only — it hardcoded
// coding_kind 'supplier_bill' — while the 0015 DB floor already enforced the
// sales/CN shapes; v4 passes the model's coding_kind through). The v1/v2/v3
// bodies stay frozen + built and their exports reachable so no parked run is
// ever stranded (policy (c)); new admissions target v4; the engine resumes old
// runs by run id. Wave A2 then repointed v4→v5 (the §9 Gate-B live find: no chat
// version could send a NULL coding_kind, so the generic voucher lane the DB has
// always accepted was undraftable via chat; v5 adds "journal_entry"->NULL). Wave A2.1
// repointed v5→v6 (PROMPT-only: the SST registration-watch surfacing framing + the
// purchase 3-leg visibility-split guidance + direction-first vocabulary; the draft
// schema/steps are byte-identical to v5) and autoDraft v1→v2 (the same purchase 3-leg
// guidance + an sst_registration_watch awareness note for the unattended sweep). Wave B
// (v25, WB-R18 ceremony) repointed v6→v7 and autoDraft v2→v3: v7/v3 fetch the pack with
// the 'wiki_coding' purpose + the txn-local clara.pack_consumer='v25' GUC (FORK-6/AMB-1/
// AMB-2 — the 0017 pack v4 wiki block renders ONLY under both), pin the tool's purpose to
// a z.literal, and carry the WB-R6(4) wiki framing + citation-visible-reasoning prompt
// law; the frozen v1–v6/v1–v2 closures stay wiki-dark by construction. Wave B also added
// the two durable interview classes (FORK-8): firmInterview_v1 + clientOnboarding_v1
// (hook-per-question parks, P19 plan-checkpoint persistence). Post-Wave-B repointed BOTH
// interview classes v1→v2 (interview_v2, F1+F2): v1's registration validator anchored on a
// leading digit and refused a state-prefixed ROB number outright — a sole-proprietor client
// could not be onboarded at all — and its framework question offered only MPERS/MFRS, which is
// a Sdn Bhd's choice presented as everyone's (no approved standard is imposed on an LLP or a
// ROBA-registered business). v2 accepts every printed registration form and asks two
// entity-type-aware axes (framework + accounting basis) over a config table. The v1 bodies stay
// frozen, built and EXPORTED so no parked run is stranded (policy (c)) — this class's parks are
// the ≥48h kind, so a live run on v1 is the expected case, not a corner one; the engine resumes
// them by run id. Post-Wave-B also repointed documentIngest v1→v2 (ledger task #28): v1's
// behavior closure destroyed its local task sidecar (spool.mjs's task-<id>.json — the ONLY
// place carrying storageKey/sha256/mime/format for a retry, plus the failure code for
// diagnosis) on EVERY failed attempt, before the step-retry it invites by throwing ever runs —
// the retry then finds nothing and fails with a generic "no durable runtime metadata" error,
// burying the real diagnosis. v2 never removes the sidecar on failure; it records the failure
// code onto it instead (full rationale in documentIngest.behavior_v2.mjs). Post-Wave-B also
// repointed autoDraft v3→v4 (ledger #44 / GH #42): the first production one-click autodraft
// run died in its model step — a bad admission-time model-id default (config, migration
// 0033_autodraft_model_default) COMPOUNDED by a real swallow: v3's model step piped every
// fullStream part through uninspected, so a genuine vendor rejection could surface only as
// ai@7's generic NoOutputGeneratedError, and its own top-level catch settled every failure
// with a fixed "sweep draft failed" regardless of cause. v4 captures the stream's own error
// part and forwards the real caught error into the settle record (full rationale in
// autoDraft.v4.impl.ts / autoDraft.v4.ts). Post-Wave-B ALSO repointed autoDraft v4->v5
// (ledger #46, owner ruling 2026-07-29 — THE SST-ZERO PRECEDENT): task
// 7b389b4f-86af-4c72-ac17-07f1084eccb9 (IV-00743) settled CLR21 coding_incomplete on its
// second attempt — the model correctly read the bill's stated-but-ZERO "SST Amt @ 6%: 0.00"
// line and correctly refused to draft, because no chart-of-accounts account carried the
// sst_purchase_cost special type this pre-v5 rule required for ANY stated tax figure,
// zero or not. The owner ruled on the client's OWN precedent: the client's four
// previously-approved EZSEC entries (all printing the identical "SST Amt @ 6%: 0.00" line)
// are ALL two-leg — a stated-but-zero tax documents "no tax charged", not a visibility
// split. v5 narrows the three-leg sst_purchase_cost split to a STATED NONZERO tax; a
// stated ZERO or absent tax takes the two-leg shape (full finding + ruling in
// autoDraft.v5.prompt.ts's own header). IV-00743 stays parked — its two real, distinct
// failures predate this rule and remain the control's honest record; this fix targets
// FRESH filings under the same recurring-vendor family. The SAME ceremony ALSO repointed
// chatTurn v7->v8 (the owner-approved closing batch, 2026-07-29) — THREE functional
// changes: (#46a, the diagnostic twin) chatTurn.v8.impl.ts's consumeChatTurnModelResult
// ports the ledger #44 stream-error-capture pattern (duplicated, cross-referenced — a
// versioned workflow must never couple its shape to another workflow FAMILY's frozen
// file), tagging a genuine caught stream error onto the thrown message so it survives
// into the run's own workflow_stream_chunks / the WDK step-failure record instead of
// being swallowed into ai@7's generic NoOutputGeneratedError. clara.agent_tasks.
// error_code carries a CHECK constraint (0006_runtime_core.sql:153) that does NOT admit
// the tag's own code — a Codex confirmation pass on this PR caught a first draft
// forwarding it verbatim, which would have violated the CHECK and left the task stuck
// non-terminal. error_code therefore settles 'model_error' in EVERY case, tagged or
// not — the SAME value v7 always wrote; it does not differentiate a stream error from
// any other failure. The diagnostic value #46a adds lives entirely in the tagged
// MESSAGE, never this column; (#46b, RULED: propagate) chatTurn adopts the SAME SST-zero precedent
// as autoDraft_v5 — a STATED NONZERO tax keeps the three-leg sst_purchase_cost split, a
// STATED ZERO or absent tax takes the two-leg shape — with the human-in-loop context
// noted (chatTurn is attended; the fix removes friction at the source rather than
// relying on review alone); (#35, bind-existing counterparty) the draft tool's prompt +
// schema guidance now prefers an existing counterparty_id (discoverable via
// list_journal_entries/get_journal_entry) over proposing a new name when the vendor is
// already established — the DB write floor already accepted `{existing_id}`
// unconditionally (Slot B consumes it; the four EZSEC approvals used it via the
// runway's driver), so this is prompt/schema-describe() guidance only; the wrapper
// (runDraftJournalEntry) is byte-unchanged and the DB-side reconciliation walls stay
// the enforcement. Drop a re-export only once zero non-terminal runs of that version
// remain. Wave C-b ADDS a brand-new class, `statementFacts: statementFacts_v1` — nothing is
// repointed and no existing body is touched. One workflow serves BOTH statement lanes
// (`statement_facts` pdf/image, two independent readers behind a typed governed-egress
// dispatch; `statement_parse` csv/ofx, one deterministic in-process parse where THE CHAIN
// IS THE SECOND READER, WC-R7), branching on the claimed task's own lane — the
// documentIngest ocr/structured_parse precedent. It opens the `bank_statement` ->
// `skipped_kind` dead end 0026 left behind. DEPLOY ORDER IS BINDING (design part2 §5): this
// runtime image ships FIRST, then migration 0038, then the consent ceremony — which is also
// (F-A1 PR-2 ADDS a second brand-new class, `witnessFacts: witnessFacts_v1`, on the same terms:
// nothing repointed, no existing body touched. It serves the new `llm_witness` lane — two model
// channels over ONE document, each its own memoized step, one atomic persist. Its tasks are NOT
// minted yet: `_enqueue_invoice_facts_core`'s llm_witness gate is deliberately inert at this
// frontier and `enqueueForLane` does not name the lane, so this image lands and is verified live
// BEFORE PR-3's router recut flips it on — the positive-read law, design §6. Its PROMPTS are
// inside the frozen closure by decision M8, so a prompt tweak is a witnessFacts.v2.)
//
// (F-A1 PR-4 ADDS `statementFacts_v2` — the bank-statement witness pair — AND DELIBERATELY DOES
// NOT POINT `statementFacts:` AT IT. This is the one place PR-4 differs from PR-2's posture, and
// the difference is forced: `llm_witness` was an INERT lane nothing minted, but `statement_facts`
// is minted TODAY, so the registry key IS the routing and a repoint takes live traffic the moment
// the image deploys. Until the (deferred) router arm re-aims the statement engine literal from
// `azure-di:prebuilt-bankStatement.us:2024-11-30` to the witness snapshot
// `llm-openai:{model}:stmt-witness-v1`, every live statement task would reach v2 stamped with the
// AZURE literal — and v2's pre-egress provenance guard (assertStatementEngineStamp) correctly
// WAITS on that mismatch rather than egressing under a false receipt. Those waits would sit in
// the SHARED ocr concurrency window (statement_facts is not M10-windowed), so they would starve
// intake OCR as well as themselves until the per-document attempt cap ended them. So the repoint
// is the LAST step of the cutover: DB persist verb -> PR-3 merge -> the router/consent arm ->
// THEN this key moves to statementFacts_v2. The engine literal in that router arm and the
// snapshot in statementFacts.v2.services.mjs must STRING-EQUAL each other; that pairing carries
// its own battery cell in the follow-up piece.)
//
// (F-A2 WINDOW B — THE ACTIVATION — IS THAT FOLLOW-UP, AND IT HAS NOW LANDED: the ordered
// preconditions above are all met, so `statementFacts:` above is repointed to statementFacts_v2.
// The router arm re-aims the statement engine literal to `llm-openai:{model}:stmt-witness-v1`
// and re-keys the statement typed-consent lookup to `witness_extraction`; the lane stays
// `statement_facts` (0098's own LANE DECISION). The migration and this repoint land inside ONE
// D1 quiesce window with the runtime machine held STOPPED between them: v2 guards the
// router-arm-AFTER-repoint direction by WAITING on an Azure-stamped task, but nothing guards the
// reverse — a witness-stamped task claimed by the still-Azure-shaped v1 body — so that gap is
// closed procedurally, by never letting a claim happen in between. The engine-literal pairing
// carries its battery cell, f-a2.activation-engine-literal, which reads BOTH sides independently
// and compares.)
//
// why `enqueueForLane` (lib/reconciler-documents.mjs) became an explicit allowlist in the
// same change, so a migration-before-runtime window can never route a bank statement into a
// consentless generic OCR run. GH #152 repointed BOTH interview classes v2->v3 (the park/hook
// INVERSION): v1 and v2 announced a park via streamPromptStep BEFORE arming its hook with
// createHook. WDK registers a hook only at suspension, so those two lines landed in two
// DIFFERENT suspensions and every park was briefly VISIBLE-BUT-UNARMED; an answer POSTed in that
// window raised HookNotFoundError, which the answer route maps to 409 not_pending — a status
// documented as "already delivered" — so a real answer was silently DROPPED (the dashboard's
// useInterviewRun follows that contract; the human just retyped, which is why it went unnoticed
// in production and surfaced first as a CI flake). Measured on the durable record: 44/44 parks
// armed 1.4–55.6ms AFTER they were announced. v3 swaps the two lines to the chatTurn.v8 shape
// (arm, then announce) — within a suspension the engine creates hooks before it dispatches any
// step, so the window is closed by construction. The v1 AND v2 bodies stay frozen, built and
// EXPORTED so no parked run is stranded (policy (c)) — this class's parks are the ≥48h kind, so
// a live run on an older body is the expected case, not a corner one.
//
// §7-A THE UNATTENDED SALES DRAFTER (wave-7a-contract.md, ADR-063) repointed autoDraft v5->v6
// and chatTurn v8->v9 (PR-RUNTIME, one of four review/merge units; ships alongside PR-DB's
// `_coding_lane_core` direction-contract recut + floor drop/recreate + the 6-arity
// settle_autodraft_task overload, applied under the 7A-R1 continuous quiesce ceremony — v6/v9
// must be DEPLOYED and VERIFIED LIVE before the DB migration's activation flag ever flips, so
// the sales draft path is never open against a registry pin that still hardcodes
// "supplier_bill"). autoDraft v6 stops being purchase-only: the draft schema gains coding_kind
// (menu EXACTLY supplier_bill | sales_invoice | sales_credit_note — 7A-R7, no journal_entry in
// the unattended lane), `vendor` generalises to `counterparty` (the SAME match-before-create
// union, widened to name either party), and the runtime tool — never the model — derives the
// authoritative counterparty kind from coding_kind (the DB draft writer stays the one authority
// layer; the model's own optional kind is never trusted, even when it agrees). The
// DB-authoritative TRI-STATE direction contract (7A-R2: sales | purchase | unresolved, bound at
// admission, revalidated in the writer) makes the model's coding_kind a checked PROPOSAL, never
// routing authority. Three new refusal tokens join autoDraft.v6.errors.ts
// (tax_leg_missing/type_polarity_mismatch as CLR21, sst_account_missing as CLR10 —
// 0036:828/1642-1659, 0016:1986-2013), and the generic messages become direction-neutral. The
// settle call moves to the 6-arity settle_autodraft_task overload, carrying the workflow's own
// engine run id (getWorkflowMetadata().workflowRunId) as the required 6th argument — skeleton
// §2d's corrected identity: autodraft_attempts.run_id is the admission-time SWEEP uuid, not the
// engine run id the 0036 caller-run-identity check actually needs. chatTurn v9 carries ONE
// prompt-only reinforcement (severable per skeleton §2f, riding this wave): a sentence appended
// to the supplier-bill paragraph makes explicit that a client-issued document is never coded
// there even if it superficially resembles a bill — it is sales_invoice, crediting income —
// complementing 7A-R4's DB-layer floor-purity fix (`_ocr_sales_floor`'s authority terms now
// require coding_kind='sales_invoice', closing the generic-JE provenance hole). The v5/v8
// bodies stay frozen, built and EXPORTED so no parked run is stranded (policy (c)).
//
// WAVE E / THE F6–F9 FIX BATCH repointed autoDraft v6->v7 and chatTurn v9->v10 (H1
// ACCEPTANCE FINDING F9, ADR-064 §3). §7-A's H1 run measured the drafting model
// mis-transcribing ONE hex group of a 36-character region UUID (…-4c6d-… for the true
// …-4fce-…) on row 19 / filing e1034202, recurring across INDEPENDENT attempts — a fresh
// autodraft supersede AND a separate chat-lane attempt on the same document, which is why
// BOTH families bump. Every other cited region matched exactly, and the same document
// drafted cleanly first try through the hand door with the corrected id
// (wave-7a-acceptance-h1.md:773-790). The DB evidence wall
// (clara._write_entry_evidence) refused CLR21 evidence_invalid every time and was RIGHT
// each time: provenance binding held, and its plain id-equality contract is UNTOUCHED by
// this wave. The defect was upstream — asking a model to reproduce an opaque 36-char
// identifier it was shown once inside a large JSON array. v7/v10 stop asking: the draft
// tool's `evidence[]` element becomes `{ region_idx, quote, field_path? }` (region_id is
// GONE from the toolface — a field the model cannot supply is a field it cannot
// mis-transcribe), and each wrapper's `resolveEvidenceRegions` maps that index back to a
// region_id BY THE `idx` FIELD — never by array position — off the regions it already
// fetches server-side. The `idx` itself is the DB's own per-region ordinal, added
// additively by migration 0054_region_ordinal to clara.get_document_extract — WHICH MUST BE
// APPLIED BEFORE THIS IMAGE GOES LIVE: with no idx published, v7/v10 resolve nothing and
// every document-bound draft refuses (fail-closed, but a full stop on drafting; 0054's own
// header states the order as binding).
//
// THE FIX ROUND (the cross-model review's CRITICAL — Codex #1 + the native reviewer's
// Finding 1, both CONFIRMED, the second MEASURED on a rig). Resolving an index against the
// wrapper's OWN fresh fetch is not enough: an index is RELATIVE. An extraction landing
// between the model's read_document call and its draft call renumbers every ordinal
// ('invoice_facts' sorts before 'ocr', so a facts pass completing renumbers everything), and
// the measured consequence was idx 2 resolving to a DIFFERENT extraction's region carrying
// the same text — which the untouched wall ACCEPTED, recording field_path 'invoice.total',
// the very label the corroboration bound and the supplier-bill shape check select on. A
// stale UUID always named the region it was read from; a stale INDEX can name another. So
// v7/v10 bind resolution to the SNAPSHOT: read_document records a rev of the (idx -> region
// id) mapping it showed, per document, in the tool-set closure; the draft wrapper refuses
// unless the fresh fetch still carries that rev, and refuses outright if this run never read
// THAT document (reading A never licenses citing B — the property the DB wall's document
// join gave v9 for free and an index does not). `field_path` also becomes REQUIRED and is
// cross-checked against the resolved region, so the recorded label is DB-sourced end to end.
// STALENESS IS CLASSIFIED AS A SYSTEM CONDITION, never `evidence_invalid` and never
// question-shaped — a durable human question reading "the extraction moved" is noise, and an
// evidence-blame receipt for a race is a false receipt; each is retryable in-run. A genuine
// mislabel inside a snapshot the model DID read keeps `evidence_invalid`. A duplicate idx
// refuses rather than taking the first (array order must never regain authority).
//
// ROUND 3 (the cross-model re-verify DISCHARGED the snapshot binding by execution, and found
// the RETRY LEG broken — the mechanism the classification above invites). autoDraft's outcome
// reducer returned on the FIRST draft_journal_entry result, but the AI SDK flattens every
// step of the model loop into one `content` array — so `[transient refusal, successful
// draft]` reduced to `refused` and the run settled FAILED while the successful DB write
// already stood. The reducer now takes precedence-then-recency (drafted > noop_existing >
// refused > none), which is what aligning with `stoppedOnSuccessfulDraft`'s own stop
// condition actually means, since two draft calls can land in ONE step. THE DEFECT IS
// PRE-EXISTING: autoDraft.v6.prompt.ts carries the same body byte-identically. What v7
// changed is its REACHABILITY, by inviting the retry — so the correction ships in the v7/v10
// closures and the frozen v6/v9 bodies are not touched. chatTurn was checked and has no
// mirror: toTypedParts_v10 is a MAP, not a reducer, so a retry sequence keeps both parts.
// ONE RESIDUAL IS ACCEPTED AND NAMED, not silently absorbed: a transient the model does NOT
// recover from in-run still settles failed, consumes a durable attempt, and parks the filing
// at the cap — and NO path unparks one (measured across the whole live catalog;
// autoDraft.v7.errors.ts carries the four writers and why each excludes 'parked'). The chat
// and hand doors do not consult that registry, so a parked filing stays codable by a human.
//
// The v6/v9 bodies stay frozen, built and EXPORTED so no parked run is stranded (policy (c)).
//
// WAVE E LANE eta (E-c, THE AD-HOC AUTHORING LANE; design part2 section 11) repointed chatTurn
// v10->v11. v11 is ADDITIVE: five authoring tools (list_metric_catalog, compose_metric_preview,
// save_metric_definition_draft, draft_report_spec, request_report_preview) and one appended prompt
// paragraph. The coding lane is untouched — the draft tool, the evidence-index snapshot binding,
// the clarify park ordering and the C-19 terminal invariant are v10's bodies, reached by IMPORT
// rather than by copy, so they cannot drift; the authoring tools neither stop the model loop nor
// set coding intent. Each WRITING tool reaches the database through exactly one clara.wake_*
// wrapper granted EXECUTE to clara_wake_interactive alone, with an interactive-only
// clara.wake_fn_allowlist row; the evaluator, the catalog writers and epsilon's report verbs stay
// ungranted to every wake role (the eta wake-wrappers migration pair proves the posture in its
// own tail). list_metric_catalog needs no wrapper and gets none — it is an
// RLS-scoped SELECT. Nothing in this lane can approve, issue or sign: saving a composition mints a
// DRAFT definition version (ruled — E-R5), and the render request is pinned to a watermarked draft
// kind. THE DEPLOY ORDER IS BINDING: the eta migration must be applied BEFORE this image goes
// live, or every authoring tool refuses on a missing wrapper (fail-closed, but a full stop on
// authoring). The v10 body stays frozen, built and EXPORTED so no parked run is stranded (policy
// (c)) — chatTurn parks are the human-answer kind, so a live run on v10 is the expected case.
//
// F-A1 PR-3a repointed `chatTurn:` v11->v12 and `autoDraft:` v7->v8 (the consumer
// re-versioning design §3.8 / Annex B row M7 requires: F-A1 PR-1's witness-pair regime,
// `llm_text_facts`/`llm_vision_facts` beside legacy `invoice_facts`, was invisible to both
// coding-lane toolfaces — a witness-only document's facts were dropped outright by the old
// `engine_kind === 'invoice_facts'` filter, and a cross-regime `Math.max(version_n)` could
// silently prefer a stale legacy generation over a fresher witness pair, since version_n is a
// PER-LANE counter). v8/v12 widen the fact-selection to both regimes, resolve the cross-regime
// winner by `extracted_at` alone (a clock tie prefers witness, design §3.3), and correct the
// stale `engine_confidence >= 0.95` mirror the real DB gate excluded structurally since 0023 —
// scoped to the legacy regime alone, so a legacy document's friendly read stays byte-identical
// and a witness document (whose fact regions carry engine_confidence NULL by design, §3.4)
// is no longer silently zeroed out. See autoDraft.v8.tools.ts / chatTurn.v12.tools.ts for the
// full statement. The v7/v11 bodies stay frozen, built and EXPORTED so no parked run is
// stranded (policy (c)).
//
// F-A1 PR-4 (design §3.7) ADDS `statementFacts_v2` — the bank-statement TEXT+VISION WITNESS
// PAIR, replacing v1's single Azure prebuilt-bankStatement read on the `statement_facts` lane;
// `statement_parse` (csv/ofx) is carried over BEHAVIOURALLY UNCHANGED, reached by IMPORTING v1's
// own claim+process steps rather than copying them (statementFacts.v2.impl.ts). It does NOT
// repoint `statementFacts:` — see the deferred-repoint note above, near the `workflows` object,
// for why `statement_facts` being a LIVE (not inert) lane forces that repoint to wait on the DB
// persist verb, PR-3's merge and the router/consent arm, in that order.
// F-A2 WINDOW B: `statementFacts:` now points at statementFacts_v2 (see the entry in the
// `workflows` object). statementFacts_v1 stays frozen, built and EXPORTED so no parked run is
// stranded (policy (c)) — and it is not merely a legacy pointer here: statementFacts_v2 REACHES
// v1's own claim+process steps by IMPORT for the `statement_parse` (csv/ofx) lane, which is
// carried over behaviourally unchanged. Only the `statement_facts` pdf/image lane moves onto the
// witness pair. Drop this re-export only once zero non-terminal statementFacts_v1 runs remain.
//
// F-A2 OPENERS ①② repointed `witnessFacts:` v1->v2 — the first repoint this class has taken, and
// it is a PROMPT-CLOSURE change, which for this class is a body change by decision M8. Two
// payloads ride one version: (②) the type_code question stops asking for a PRINTED MyInvois code
// — which real Malaysian paper invoices never carry, so both channels honestly answered
// `not_printed` and the evaluator's M12 conjunct could never pass, measured 0/33 on the live
// corpus — and asks the model to CLASSIFY the document instead, with the carve-out from the
// verbatim rule named and confined to that one field; (①) the nil-tax arm's evidence: a new
// asked-and-answered `invoice.sst_registration` (party-blind, never belt-required, never CITED —
// the writer's citation allowlist is deliberately unwidened) plus the `witness.coverage` receipt
// carrying the OCR generation the text channel actually read, whether its region block was
// truncated, and which fields the read DOWNGRADED. v2 also mints its own services bundle
// (`llm-openai:{model}:v2`) under its OWN global slot, injected additively in startWorld.ts, so a
// straggler v1 run cannot stamp `:v2` provenance onto a v1-prompt read. THE DEPLOY ORDER IS
// DB-FIRST, RUNTIME-SECOND — the opposite of PR-3's cutover rule: this image sends an answer key
// a pre-widened `clara._witness_answers_ok` refuses with CLR10, which would wedge the invoice
// lane. Rollback is fail-closed for free (a v1 envelope simply carries no SST answer and no
// receipt, so the arm never fires). The v1 body stays frozen, built and EXPORTED (policy (c)).
//
// H-02/H-03/H-05 ADD `statementFacts_v3` and repoint `statementFacts:` at it. statementFacts_v2
// stops being the pointer and must stay EXPORTED — policy (c). Its parks are the ordinary kind
// (a persist that raised used to leave its run retrying against a task nobody had settled), so
// a run resuming into the frozen v2 body after the cutover is the expected case, and it must
// find its own body and the SAME `__claraStatementWitnessServices` bundle v3 reads.
export { statementFacts_v1 };
export { statementFacts_v2 };
export { statementFacts_v3 };
// F-A2 openers ①②: witnessFacts_v1 stops being the `witnessFacts:` pointer and must stay
// EXPORTED — policy (c). The `llm_witness` lane's parks are the deployment-window kind (the
// behaviour WAITS on an engine-stamp mismatch rather than failing), so a run still resuming into
// the frozen v1 body at cutover time is the expected case, not a corner one; the engine resumes
// it by run id and it must find its own body and its own `:v1` services bundle.
export { witnessFacts_v1 };
// debt/prompts-v3: witnessFacts_v2 stops being the `witnessFacts:` pointer and must stay EXPORTED
// — policy (c). It reads its own dedicated `:v2` services bundle (`__claraWitnessFactsServicesV2`)
// unchanged, and v3 reuses that SAME bundle (witnessFacts.v3.impl.ts's header) rather than
// replacing it, so v2's own straggler runs and v3's fresh ones are served correctly side by side.
export { witnessFacts_v2 };
export { firmInterview_v1 };
export { firmInterview_v2 };
export { clientOnboarding_v1 };
export { clientOnboarding_v2 };
// 裁-21 PR-c: clientOnboarding_v3 stops being the `clientOnboarding:` pointer and must stay
// EXPORTED — policy (c). The parks in this class are the >=48h kind (that is the whole point of
// the durable interview), so a run still resuming into v3's body at cutover is the EXPECTED case,
// not a corner one: the engine resumes it by run id and it must find its own body, and its own
// CLIENT_SEGMENTS_V2 inventory, unchanged.
export { clientOnboarding_v3 };
// F-A2 — THE AGENTIC POSTING LANE (PR-2, the runtime half) repointed `chatTurn:` v12->v13 and
// `autoDraft:` v8->v9. Design: docs/plan/active/f-a2-agentic-posting-design.md §3/§5, its four
// annexes, and the PR-0 gate record. Owner rulings OQ-1/OQ-4/OQ-6 and D34-D37; orchestrator
// rulings D38-D43.
//
// WHAT CHANGES, IN ONE PARAGRAPH. v8 drafted and stopped; a human approved every entry. v9 keeps
// that first act byte-for-byte and adds a second: after a successful draft the agent may POST
// the entry under her own identity through `clara.wake_post_entry` — a granted wake wrapper over
// an ungranted core whose thirteen-rung ladder, four tiers and posting receipt are the SOLE
// authority on whether the post is lawful. v9 also opens the unattended lane to the GENERIC
// document class (`journal_entry`, superseding 7A-R7 / ADR-063's "no journal_entry in the
// unattended lane" scoping stated further down this file — said in those words because a live
// ruling is being overturned, not drifted past; D18 widens DOCUMENT CLASS and nothing else).
// v13 is the same post verb on the attended lane (chat parity, D34), plus the fail-closed half
// the contract requires: a typed OPEN QUESTION, reached through the new `interactive_client`
// wake kind that PR-1 adds as an EXTENSION of the kind enumeration — never the client-CHECK
// weakening C-3 reversed — and minted for the `wake_open_question` call ALONE (R-1).
//
// THE DEPLOY ORDER, AND IT IS THE OPPOSITE OF THE STATEMENT-ACTIVATION ONE ABOVE. Those two
// repoints had to be the LAST step of their ceremony because the lane's ROUTER moved with them.
// These two are the reverse: PR-1's migration must be applied FIRST, and the image may deploy
// only after. The reason is asymmetric failure, not preference — a v9/v13 image against a
// pre-PR-1 database calls a `clara.wake_post_entry` that does not exist and every post attempt
// fails loudly with 42883, while a post-PR-1 database under the old v8/v12 image simply never
// posts (the verb sits there uncalled, and the whole `posted` chain is behaviourally inert until
// something emits the outcome). One of those is a visibly broken lane; the other is the status
// quo. So: PR-1's D1 window closes, THEN this image ships.
//
// v8 AND v12 STAY FROZEN, BUILT AND EXPORTED so no parked run is stranded (policy (c)) — both
// gained an explicit `export` below, which they had not needed while they were the pinned
// versions. v13 joins them here for the same reason at F-A3 PR-3's own repoint (v13 -> v14,
// OQ-6 bank chat parity, owner ruling 2026-08-25): it is no longer the pinned version, so it
// needs the explicit export a directly-importing consumer (and the rollback preflight,
// packages/runtime/README.md) relies on.
export { chatTurn_v2 };
export { chatTurn_v3 };
export { chatTurn_v4 };
export { chatTurn_v5 };
export { chatTurn_v6 };
export { chatTurn_v7 };
export { chatTurn_v8 };
export { chatTurn_v9 };
export { chatTurn_v10 };
export { chatTurn_v11 };
export { chatTurn_v12 };
export { chatTurn_v13 };
// F-A6 PR-2 — THE AUDITED FREEFORM READ (the runtime half) repointed `chatTurn:` v14 -> v15.
// Design: docs/plan/active/freeform-read-design.md v2 §7 item 4; ruling ADR-0074; the DB half is
// migration 0131 (merged + ceremonied 2026-08-26) plus 0136's basis fix.
//
// WHAT CHANGES, IN ONE PARAGRAPH. v15 is v14 plus ONE tool: `read_books_freeform`, a single
// read-only SELECT the model composes and the DATABASE runs — as `clara_freeform_ro`, a role
// holding SELECT on exactly 35 enumerated relations, EXECUTE on seven functions and zero DML
// anywhere, under 35 role-pinned RLS policies every one of which carries a `_freeform_admitted()`
// conjunct. No receipt, no read: un-armed, all 35 relations return zero rows. The runtime adds no
// wall of its own — it mints the credential (client-pinned whenever the session is), binds the
// read to the triggering turn, calls the ONE verb, and carries the verdict.
//
// THE DEPLOY ORDER, AND IT IS NOT F-A2's. No migration rides with this image; 0131 is already
// live. What rides with it is a CEREMONY: `clara_freeform_login` is created NOLOGIN, and the
// operator must grant it LOGIN + a password and set `CLARA_FREEFORM_DATABASE_URL` BEFORE this
// image boots. `assertProductionPoolConfig` is fail-closed on that DSN (the Slice-6 write floor's
// posture, deliberately not Gate G1's lazy bank one — packages/runtime/lib/freeform-read.mjs
// carries the reasoning), so a world booted without it refuses to start rather than serving a
// chat whose newest tool silently 42883s.
//
// v14 STAYS FROZEN, BUILT AND EXPORTED so no parked run is stranded (policy (c)) — chat parks are
// the human-answer kind, so a live run still resuming into v14's body at cutover is the expected
// case, not a corner one.
export { chatTurn_v14 };
// P6-1 — Q8's FOUR-CARD WIRE BUMP (the runtime half) repointed `chatTurn:` v15 -> v16. Rulings:
// Q8 (mohe-grill-rulings-2026-08-27.md:62-72) at 裁-9's tier (c) depth; order
// docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md §P6-1.
//
// WHAT CHANGES, IN ONE PARAGRAPH. v16 is v15 plus FOUR part kinds on the wire —
// `agent_receipt`, `firm_question`, `close_proposal`, `freeform_result` — declared in ONE file
// (chatTurn.v16.parts.ts) because apps/web is their reader and the runtime is their declarer.
// Exactly one of the four has an emitter in this closure: an ADMITTED `read_books_freeform`
// now promotes a `freeform_result` addressing its own receipt row, which is the card v15's own
// header deferred to P6. The other three are declarations whose producers sit in the filing and
// close lanes, refused to a chat credential by `clara_wake_filing`'s grant (0126:2103) and by
// the `close_prep`-only allowlist row (0138:2531) respectively, and whose read surface —
// `agent_receipts_visible` — is granted to the HUMAN session alone (0103:1030, with 0103's tail
// asserting no agent role holds it). No tool is added, removed or renamed; no prompt word
// changes; the C-19 terminal set, the park/hook ordering and the step budget are byte-carried.
//
// THERE IS NO COUPLED DEPLOY ORDER, WHICH IS WORTH SAYING BECAUSE EVERY REPOINT ABOVE HAS ONE.
// No migration rides with this image and no ceremony precedes it: the four hydrate surfaces are
// already live and already granted, and v15's `CLARA_FREEFORM_DATABASE_URL` boot precondition
// is unchanged (v16 reaches the freeform read through v15's own tool set, by import). A v16
// image against today's database mints a card whose read exists; a rollback to v15 simply stops
// minting it. v15 STAYS FROZEN, BUILT AND EXPORTED so no parked run is stranded (policy (c)) —
// chat parks are the human-answer kind, so a live run still resuming into v15's body at cutover
// is the expected case, not a corner one.
export { chatTurn_v15 };
// The PINNED version is reachable through `workflows.chatTurn`, so this export is not what makes
// v16 dispatchable. It exists because the ROLLBACK PREFLIGHT (packages/runtime/README.md) asks a
// target image whether it still exports every version holding non-terminal runs, and an answer
// that has to special-case "except the current pin" is an answer somebody gets wrong at 2am.
// v15 carried its own export while it was the pin for the same reason.
export { chatTurn_v16 };
// FS-7 ECHELON-1 — THE REPORT CHAT OPENER repointed `chatTurn:` v16 -> v17. Exactly three
// report-domain tools are added, and no part kind or database object moves. The F-A5 grants and
// interactive allowlist rows have been live since migration 0116, so this image has no coupled
// deploy dependency. v16 remains exported by policy (c); the pinned v17 body is exported too so
// the rollback preflight can use the same uniform census for every version.
export { chatTurn_v17 };
// #623 repointed `chatTurn:` v17 -> v18. v17 remains exported by policy (c) — it is the rollback
// target and the body any run parked at cutover resumes into — and the pinned v18 body is
// exported too so the rollback preflight can use the same uniform census for every version.
export { chatTurn_v18 };
// #643 + #644 repointed `chatTurn:` v18 -> v19. v18 remains exported by policy (c) — it is the
// rollback target and the body any run parked on a v18 clarify hook resumes into at cutover — and
// the pinned v19 body is exported too so the rollback preflight can use the same uniform census
// for every version.
export { chatTurn_v19 };
export { chatTurn_v20 };
// #629 repointed `claraWork:` v1 -> v2. v1 remains exported by policy (c) — it is the rollback
// target and the body any Work parked on a v1 clarify hook resumes into at cutover — and the
// pinned v2 body is exported too so the rollback preflight can use the same uniform census for
// every version.
export { claraWork_v1 };
export { claraWork_v2 };
// #631 repointed `claraWork:` v2 -> v3. v2 remains exported by policy (c) — it is the rollback
// target and the body any Work parked on a v2 question hook resumes into at cutover — and the
// pinned v3 body is exported too so the rollback preflight can use the same uniform census for
// every version.
export { claraWork_v3 };
export { claraWork_v4 };
export { documentIngest_v1 };
export { autoDraft_v1 };
export { autoDraft_v2 };
export { autoDraft_v3 };
export { autoDraft_v4 };
export { autoDraft_v5 };
export { autoDraft_v6 };
export { autoDraft_v7 };
export { autoDraft_v8 };
export { autoDraft_v9 };
export { autoDraft_v10 };
// #637 — THE EIGHT PINNED-BUT-UNEXPORTED BODIES, exported now for the same reason every
// superseded body above is: `workflowBodies` below is this image's answer to "which bodies can
// this process actually run", and the rollback preflight, the boot line and `/api/build-info`
// all read it. A body that is dispatched through `workflows` but carries no own export was
// invisible to `scripts/check-workflow-bundle.mjs`'s resumability rule and could not be named
// as an OWN export here — so a preflight would have read a perfectly runnable `bankAgent_v1`
// run as stranded. These are the CURRENT pins of their classes, so nothing about the freeze
// policy changes: they are already required to ship by the bundle gate's pin check, and this
// only makes the roster uniform.
export { closeExampleV1 };
export { documentIngest_v2 };
export { invoiceFacts_v1 };
export { witnessFacts_v3 };
export { firmInterview_v3 };
export { clientOnboarding_v4 };
export { clientOnboarding_v5 };
export { bankAgent_v1 };
export { closePrep_v1 };

export const workflowNames: string[] = Object.keys(workflows);

// #637 (C88.8 / C-70) — PROVENANCE, as data. `workflowNames` above answers "which CLASSES",
// which was never the question a cutover or a rollback asks. These two answer the two that
// matter, and they are read by three surfaces that must never disagree: the ONE boot line in
// plugins/startWorld.ts, `/api/build-info`'s `bodies`/`pins`, and the rollback preflight
// (packages/runtime/lib/rollback-preflight.mjs), whose whole job is to compare a target image's
// carried bodies against the bodies live runs are parked on.
//
// THEY ARE STRINGS, DELIBERATELY, AND THAT IS THE WHOLE SAFETY ARGUMENT. A second export
// carrying FUNCTION references would be a second dynamic-dispatch view of the registry, and the
// enqueue-provenance law (scripts/freeze-lint-checks.mjs capability (e)) trusts ANY identifier
// imported from this file by name alone — which is only sound because exactly one such view
// (`workflowsByName`) exists and is provably `workflows` itself. Inert string data adds nothing
// to that trust surface; freeze-lint's REGISTRY-VIEW-INTEGRITY check enforces the shape
// structurally (`Object.freeze` over a literal of string literals, nothing else), and
// scripts/check-frozen-workflows.selftest.mjs positive-controls both the good and the bad shape.
//
// THEY ARE HAND-WRITTEN, because a module cannot enumerate its own exports without
// `import * as self`, which the closed-world census rejects on sight. The guard against drift is
// tests/registry-view.test.mjs, which reads the REAL module namespace and fails if this roster
// misses a body the file exports, if a pin is absent from the roster, or if a pin names a
// different function from the one `workflows` dispatches. A successor version therefore needs
// exactly FIVE edits in this file and no edit anywhere else, and registry-view.test.mjs reds on
// each one left out: its `import { x_vN } from "./x.vN.js"` line, the `workflows.<className>`
// dispatch entry repointed to it, its own `export { x_vN }` line, its entry in `workflowBodies`
// below, and its `workflowPins.<className>` entry.
export const workflowBodies: readonly string[] = Object.freeze([
  "closeExampleV1",
  "chatTurn_v2",
  "chatTurn_v3",
  "chatTurn_v4",
  "chatTurn_v5",
  "chatTurn_v6",
  "chatTurn_v7",
  "chatTurn_v8",
  "chatTurn_v9",
  "chatTurn_v10",
  "chatTurn_v11",
  "chatTurn_v12",
  "chatTurn_v13",
  "chatTurn_v14",
  "chatTurn_v15",
  "chatTurn_v16",
  "chatTurn_v17",
  "chatTurn_v18",
  "chatTurn_v19",
  "chatTurn_v20",
  "claraWork_v1",
  "claraWork_v2",
  "claraWork_v3",
  "claraWork_v4",
  "documentIngest_v1",
  "documentIngest_v2",
  "invoiceFacts_v1",
  "statementFacts_v1",
  "statementFacts_v2",
  "statementFacts_v3",
  "witnessFacts_v1",
  "witnessFacts_v2",
  "witnessFacts_v3",
  "autoDraft_v1",
  "autoDraft_v2",
  "autoDraft_v3",
  "autoDraft_v4",
  "autoDraft_v5",
  "autoDraft_v6",
  "autoDraft_v7",
  "autoDraft_v8",
  "autoDraft_v9",
  "autoDraft_v10",
  "firmInterview_v1",
  "firmInterview_v2",
  "firmInterview_v3",
  "clientOnboarding_v1",
  "clientOnboarding_v2",
  "clientOnboarding_v3",
  "clientOnboarding_v4",
  "clientOnboarding_v5",
  "bankAgent_v1",
  "closePrep_v1",
]);

/** Which body each class DISPATCHES to, as the identifier name — the `workflows` object above
 *  read as provenance rather than as a call table. A parked run whose body is not this class's
 *  pin is a run on a RETAINED body: legal, expected at a cutover, and exactly what a rollback
 *  preflight has to enumerate. */
export const workflowPins: Readonly<Record<string, string>> = Object.freeze({
  closeExample: "closeExampleV1",
  chatTurn: "chatTurn_v20",
  claraWork: "claraWork_v4",
  documentIngest: "documentIngest_v2",
  invoiceFacts: "invoiceFacts_v1",
  statementFacts: "statementFacts_v3",
  witnessFacts: "witnessFacts_v3",
  autoDraft: "autoDraft_v10",
  firmInterview: "firmInterview_v3",
  clientOnboarding: "clientOnboarding_v5",
  bankAgent: "bankAgent_v1",
  closePrep: "closePrep_v1",
});
