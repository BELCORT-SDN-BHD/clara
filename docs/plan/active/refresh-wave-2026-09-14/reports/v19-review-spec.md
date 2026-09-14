# chatTurn_v19 — SPEC review

Worktree `clara-wt/v19` @ `fbd77ea4`, branch `impl/v19-chat-turn`, base `integration/wave-2`. Diff
vs base: 35 files, +3324/-49. `node --test tests/chat-turn-v19-tools.test.mjs` on `rigv19`
(55455/`clara_v19`) re-run live: **17/17 pass**, matching the report.

## (a) Roster / spec requirements — table

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | `start_periodic_adjustment_work`: name, schema, builders, 9-arg admit verb, chat-lane args, result mapping, frozen manifest, must-not-mint-bundle | **PRESENT** | `chatTurn.v19.tools.ts:249-262` calls `admit_periodic_adjustment_work($1..$9)` in exactly the order 643-final.md:72 specifies; `p_basis_origin='clara_interpreted'` (`:258`), `p_source_refs=[{kind:'chat_task',task_id,session_id}]` (`:247`, session read off the task row `:204-208`), `p_intent_key=stableOpKey(ctx.taskId, TOOL, input)` (`:241`). Result mapping (`:275-294`) is field-for-field identical to `runStartJournalWork` (`chatTurn.v18.tools.ts:186-205`). `frozen-workflows.json` gained the 6 new v19 files + `periodic-adjustment-basis.ts`, none `deployed:true` |
| 2 | `remember_client_information`: wraps `capture_knowledge_for`, source-kind enum limited, refusal detail passthrough | **PRESENT** | `chatTurn.v19.tools.ts:130` `CHAT_KNOWLEDGE_SOURCE_KINDS = ["user_statement","model_inference"]` only — matches #644's own boundary ("imported verified labels or model inference remain supplied/unverified data"); `runRememberClientInformation:297-376` folds `answer.detail` verbatim into the refusal |
| 3 | Knowledge context step: `readKnowledgePack(sql,{clientId,purpose,firmId})`, firm-bound machine lane, `unavailable` honesty, `knowledge_version` echo | **PRESENT** | `chatTurn.v19.impl.ts:129-153` `loadKnowledgeContextStepV19` passes `firmId` through; `knowledge.mjs:61-62` `PACK_SQL` calls `get_knowledge_pack(p_client=>$1,p_purpose=>$2,p_firm=>$3)` — matches 644-fixround-2.md's measured signature exactly; `unavailable` never collapses to empty (`knowledge.mjs:118-186`, `chatTurn.v19.prompt.ts:189-236` renders "Client knowledge unavailable: … not a client with nothing recorded"); `knowledge_version` carried as TEXT through the whole chain (`impl.ts:149`, `prompt.ts:212`) |
| 4 | Parts parity: `chatTurn.v19.parts.ts` in closure list, `work_accepted` purpose widened by reference not re-declared, web reader/catalog/`KnowledgeCards.tsx`/`en.json`/manifest | **PRESENT** | `check-parts-parity.mjs` diff adds the file to `DEFAULT_DECLARERS`; `chatTurn.v19.parts.ts:87-88` widens via `Omit<WorkAcceptedPart,"purpose"> & {...}` (not a second declaration); `apps/web/lib/parts/types.ts` +`KnowledgeReceiptPart`, union now 31; `catalog.ts` +`knowledge_receipt` fixtures incl. an empty-`client_id` reachability case; `KnowledgeCards.tsx` new; `manifest.txt` +1 |
| 5 | Registry repoint v18→v19, manifest, bundle-gate version string, no digest pin to extend | **PRESENT** | `registry.ts` diff: `chatTurn: chatTurn_v19`, `workflowPins.chatTurn: "chatTurn_v19"`, v18 still exported (policy c); `p6-1-chatturn-v16.test.mjs` literal `v18`→`v19` (commit `50606ecf`) is the only touched pin — no claraWork file appears anywhere in the diff, confirming the v2 bundle digest is untouched |
| 6 | Census waiver honestly re-assessed, not retired | **PRESENT, correctly framed** | `operation-census-waivers.mjs` diff adds a dated re-review: measured both ways (present→10/10, deleted→live `opcen.1` red on `chatTurn.impl.ts:112`), rejects narrowing the census scope to enqueued bodies on 3 named grounds, states the actual follow-up needed (a ruling that `chatTurn_v1` may stop being exported) |
| 7 | Docs (ARCHITECTURE §4/§5/§7/§10/§11, CONTEXT, PRD) | **PRESENT** | `CONTEXT.md` +*Knowledge pack* entry (with an explicit `_Avoid_: … a pack presented as authority to post`); `ARCHITECTURE.md`/`PRD.md` diffs present and hosted status marked pending |

`#721` shape (`brief-643.md:8`, "the form and (later) the chat lane ask BEFORE admission"): confirmed — `runStartPeriodicAdjustmentWork` calls `localAdjustmentRefusal(input)` (`chatTurn.v19.tools.ts:237-238`) before any DB call, and every refusal names the field via `adjustment.<key>` (`periodic-adjustment-basis.ts:159-291`), e.g. `adjustment.advance_account_code` / `adjustment.liability_account_code`.

`#796` (`advance_account_code`): present in `payrollObligationInputSchema` (`periodic-adjustment-basis.ts:123-131`), emitted into `p_adjustment` at `:343` as a "0194 particular"; `advance_cents` is a derivation-only input, never emitted (`:340-342`, mirrors `settled_cents`'s own rule) and drives the advance credit leg in `basisFromAdjustment` (`:417-424`). Local refusals mirror 0194's `advance_leg`/`distinct`/`liability_leg` (`:261-289`). `frozen-workflows.json` + `parts-parity-exemptions.mjs` both correctly re-fingerprint the touched spread rather than silently widening it.

## (b) Scope creep

None found. The one addition beyond the roster's four items — the World e2e leg in `.github/actions/db-live-gates/action.yml` (`node tests/chat-turn-v19-e2e.mjs`, inserted after the Work-lane legs, before #637's world guard) — is explicitly anticipated by HANDOFF.md ("World e2e leg wired before #637's world-guard test") and is verification infrastructure, not product surface. The census-waiver commit (`fbd77ea4`) touches only the waiver's own comment/reason strings.

## (c) Implemented but wrong

None found. Every load-bearing claim in `reports/v19-final.md` was checked against source and either measured directly (test run) or matched line-for-line against the cited spec text; no daylight found between claim and code.

**Checks specifically requested, results:**
- Chat-lane admit arguments: exact match, see item 1.
- Local pre-admission refusal names the missing field: confirmed, `adjustment.<field>` vocabulary.
- `advance_account_code` present, emitted as 0194 particular: confirmed.
- `remember_client_information` source kinds limited to what a chat can claim: confirmed (`user_statement`, `model_inference` only).
- Pack step's `unavailable` face: confirmed honest, never collapses to "nothing recorded."
- `knowledge_version` echo: confirmed, carried as string end-to-end.
- Result mapping identical to `runStartJournalWork`: confirmed field-for-field.
- No new claraWork bundle: confirmed — no claraWork file touched; e2e (`chat-turn-v19-e2e.mjs:356-361`) measures `done.work.bundle.digest` equals the process's own logged v2 digest AND scans the run's model prompt for `adjustment_basis`/`particulars_source`/etc. and finds none.
- Census-waiver outcome: confirmed honestly stated (not retired, reasoned why, names the real follow-up).
- Worker's named-not-fixed item: confirmed as a **#643 web gap, not a v19 defect**. `derivedLines` lives in `apps/web/lib/work/periodic-adjustment.ts:338-380` (imported into `periodic-adjustment-form.tsx:93,106,256`, not defined there as the task's phrasing implied) — it derives an expense leg, a liability leg and an optional payment leg, but never an advance leg, while the form (`periodic-adjustment-form.tsx:674-676`) does offer an `advanceAccountCode` control. Picking that control with a nonzero implied advance therefore reaches 0194's `advance_leg` refusal only at admission. This is unrelated to any v19 file; v19's own tool (`chatTurn.v19.tools.ts`) has no such gap since `localAdjustmentRefusal` catches it locally before admission.

## Closing line

**No BLOCKER, no SHOULD.** chatTurn_v19 wires exactly what the roster specified, argument-for-argument and field-for-field, with every honesty requirement (`#603`'s unavailable-vs-empty distinction, `#721`'s ask-before-admission, `#796`'s advance pair, the census re-review) implemented as documented and independently verified rather than merely asserted.
