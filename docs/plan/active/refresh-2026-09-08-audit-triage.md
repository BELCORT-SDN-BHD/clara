# Clara refresh audit triage — 2026-09-08

## Purpose and evidence boundary

This is the duplicate-prevention and status map for the 2026-09-08 refresh. It does not re-approve the withdrawn Clara v2 charter and it does not treat a closed GitHub issue as proof of a fix or deployment.

The later [216-item register](refresh-2026-09-08-audit-register.md), checked 2026-09-09,
now accounts for every historical ID from the four appendices, separate known-issue extras,
current-source corrections and named validation obligations. It supersedes this note's
initial inventory coverage, without claiming all findings are fixed or verified on the host.

Evidence read for this pass:

- local `main` at `68ab432308e1bfe87871565c207f8f4ac1e89101`;
- the full desktop disposition `Clara 三份报告处置清单 2026-09-06.md` and all four discoverable appendices under `Clara 报告处置 2026-09-06 附录`;
- current `docs/PRD.md`, `docs/ARCHITECTURE.md`, issue-tracker instructions, package manifests and selected current source;
- GitHub Issues through `gh`, first before the new chart was created and again after issues #597–#605 were created;
- codebase-memory project `C-Users-zhant-Desktop-clara-rebuild`, then direct source reads for every conclusion below that depends on a cited file.

The index snapshot contained 27,674 nodes and 163,261 edges. Its coverage report recorded 185 partially parsed files and one skipped file. It also reported `metadata_changed` for the cited paths, so graph results were used for orientation only. The SQL claims below come from direct source reads inside the flagged ranges. This pass did not inspect production, rerun browser journeys, or replay the full 216-row historical register. Historical totals and hosted assertions remain historical until separately re-measured.

The pre-existing working-tree changes in `.codex/config.toml` and `apps/web/README.md` were not touched.

## Issue-tracking inventory

Immediately before the new chart was created, `gh issue list --state open --limit 1000` returned exactly **0 open issues**. The repository had exactly **26 issue records returned**, all closed. This included:

- #541, the authenticated E2E audit umbrella, closed on 2026-09-08 even though its last disposition comment said it should stay open;
- #573, titled `[SUPERSEDED] Wayfinder map: Clara v2 refresh — agent platform · journal-entry-first flows · UI/UX redesign`;
- #574–#596, the closed grilling, research and prototype children of #573.

Every issue in #573–#596 carries the owner's 2026-09-08 supersession statement: the map was withdrawn, its history remains reference material, and none of its resolutions is a live decision. Those issues are valuable evidence sources, especially #581–#584 and prototypes #594–#596, but must not be copied into acceptance criteria without current ratification.

The snapshot immediately after charting returned exactly **9 open issues**. This is a snapshot, not a live count; subsequent resolutions belong to the tracker:

| Issue | Live role | Duplicate-prevention rule |
|---|---|---|
| #597 | canonical refresh map | All refresh decisions and dependency links belong here. |
| #598 | current accounting engine, task and chat baseline | Owns present-state source tracing; do not open separate “explain current engine” tickets. |
| #599 | agent loop, Workflow and KB research | Owns official-version and external-research questions. |
| #600 | UI pattern and component research | Owns Mobbin/shadcn/Base UI pattern research. |
| #601 | accounting-work autonomy, lifecycle and interaction contract | Owns upload/chat/direct/schedule convergence, resume/reset/archive/cancel/questions and firm/client command scope. |
| #602 | journal entries, business objects and deterministic checks | Owns which ceremonies are redundant versus which accounting, evidence and period checks remain. |
| #603 | client knowledge, identity and agent context | Owns vendor/customer binding and alias consolidation decisions. |
| #604 | navigation, page responsibility and component contract | Owns the reopened frontend architecture, components, responsive behaviour, motion and accessible flows. |
| #605 | old audit/backlog re-adjudication | Owns conversion of validated findings into implementation tickets. |

There is now one live `wayfinder:map` (#597). The five standard triage labels and the wayfinder labels already exist. No additional map or general audit umbrella should be created.

## Source-of-truth gap at the audit baseline

The baseline commit tracked only five files under `docs/`: `PRD.md`, `ARCHITECTURE.md` and the three agent documents. It had no tracked state-persistence document or historical `docs/plan` tree, although PRD linked to a missing state page. That was a historical documentation gap. PRD and Architecture now own the enduring product and technical blueprints; GitHub specs and implementation issues own delivery contracts, dependencies and status. Old backlogs are evidence inputs, not current truth by default.

## Status re-adjudication

The statuses below are deliberately scoped. Anything not named is **not yet checked**, even if the 2026-09-06 disposition assigned it a status.

### VERIFIED FIXED LOCALLY

- The cross-kind alias collision behind H-17 has a current local fix. `0176_counterparty_alias_kind_scope.sql` adds a derived immutable `kind` to `counterparty_aliases`, a congruence foreign key, and a `(client_id, kind, alias_normalized)` live unique. This verifies the local migration shape; it does not prove the current hosted frontier.
- The current web has explicit client-switch containment. `ClientScopeProvider` activates the client epoch synchronously and keys the subtree by `clientId`; the Clara rail mount is also keyed by client/firm altitude. This is useful architecture to retain through a redesign because it protects against cross-client stale state.
- Several formerly absent surfaces are still present in local source, including the OTP confirmation route, build-info routes, the document page overlay, typed Clara part renderers, and the firm/client dashboards. Their presence supports the earlier local-fix disposition, but their current browser behaviour was not rerun here.

### HOSTED VERIFIED

No finding is promoted to current **HOSTED VERIFIED** by this pass. The 2026-09-06 report's runtime v75, web Worker `90c1a5d0`, DB frontier `0176`, 48-minute log window and production browser evidence remain dated evidence against old source baseline `fc39c361`. Current local HEAD is `68ab4323`, and no current deploy identity was read.

The parent refresh session supplied two current, read-only hosted observations. They are evidence of visible state, not root-cause diagnoses or successful journeys:

- A client Documents list showed a bank-statement row as `done`. Its detail showed OCR and classification complete, while `statement_facts v1` showed `Extraction failed · engine_error`; the page exposed raw extracted text without named statement fields and still offered `Request autodraft`. This is a new status/affordance coherence finding for #598/#604. It does not by itself prove the failure's cause.
- Reports mixed the formal archive, unavailable sandbox, freeform-read logs, snapshots, render queue, seeding and wiki material on one surface, while exposing internal table, role and migration names. This is current hosted evidence for the Reports information-architecture and copy problem owned by #602/#604.

### STILL VALID

- **Classify/OCR ordering race (old Q-00 / H-04 / CB-011), verified at baseline HEAD.** The latest `_enqueue_invoice_facts_core` in `0123_f_a7_gamma_egress.sql:1125-1129` chooses the `classify` lane when a PDF/image has no kind; `:1474-1509` can enqueue without a completed extraction prerequisite. The latest claim body in `0090_f_a1_walls.sql:328-462` supplies no OCR prerequisite either. `packages/runtime/lib/classify.mjs:101-127` reads only `done` OCR/structured extractions and can return an empty string; `:154-160` classifies that value. This now has the bounded implementation ticket [等待成功提取后再分类文件](https://github.com/BELCORT-SDN-BHD/clara/issues/606); its live fix/test/deployment status belongs to that ticket, not this baseline snapshot. The old 0016 citation alone was insufficient to establish the latest body.
- **Interview answers do not become canonical client state (H-21 / CB-009 / CB-030).** The live `commit_client_onboarding` body in `0017_wave_b.sql:2751-2840` validates the plan, changes client/plan state and emits events, but does not promote SSM/TIN, FYE, entity/MSIC, SST or bank answers. A separate audited `record_client_fact` door exists in `0055_client_facts_trio.sql`, confirming the data model exists while the projection remains missing. The fixed interview inventory is still current, and `sst_no` at `interview.v2.questions.ts:84` has no applicability predicate.
- **DPA/egress reads are not wired into the web.** Migration `0174` defines `get_own_dpa_signature()` and `client_egress_state(uuid)`, but a direct search found no production caller in `apps/web` or `packages/runtime`. The migration header names intended consumers; comments are not call sites. The old “DB half exists, web half missing” conclusion still holds, while the final consent model belongs to #601/#603.
- **The human high-stakes maker/checker branch remains; unattended posting has a different boundary.** The latest approval core is the ninth body recut by `0106_f_a2_posting_core.sql:1381-1505`, not the untouched 0037 definition. The human CLR05 branches are preserved, while `and not coalesce(v_is_agent,false)` excludes agent calls from that maker/checker branch. Current unattended posting supplies `is_agent:true` and `approval_arm:'agent_unattended'` after its separate evidence/current-books/own-draft admission checks (`0106:866-965,1268-1329`). A generic claim that agents still require the old human checker is wrong. The refresh still must decide the human ceremony and unify automation authority; the withdrawn ruling is not current acceptance.
- **Current chat remains the custom v17 loop.** The registry points to `chatTurn_v17`; it uses a hand-written 12-segment `createHook` park loop and `streamText`, while the web parses custom SSE in `apps/web/lib/clara/stream.ts`. Runtime has `ai@7.0.77`, Workflow 4.8.4 and `@workflow/world-postgres@4.3.4`; it does not have `@ai-sdk/workflow`. Web does not depend on `@ai-sdk/react`. This makes the engine simplification question real, but does not choose the replacement.
- **Chat archive is only half wired.** `0174` provides `archive_chat_session`; `ClaraThreadMenu.tsx` explicitly says it does not call the door. Export/download is likewise absent from the v17 tool surface. Both depend on the lifecycle/tool decisions in #601/#599 rather than being copied as isolated UI chores.
- **No required browser E2E step was found in the current `.github` tree.** Runtime/DB E2E actions exist, and the local web has Playwright walks, but the current CI search found no Playwright/browser job. The old browser-gate concern remains valid and should attach to the acceptance plan after #604 defines the journeys.
- **The reporting substrate exists, but a usable management template is still not represented in repository seeds.** Report doors, reads, renderer and artifact routes exist; the two current seed files do not publish a management template. Hosted template rows were not checked.

### STALE / WRONG

- All “current” deploy identities and line anchors in the 2026-09-06 disposition are stale as current claims. They are still legitimate historical evidence.
- #541's last comment says the umbrella stays open, while the issue is closed. Its closure is tracker state only and cannot close the listed defects.
- #573's agent, IA, component and binding resolutions are explicitly superseded. Treating them as accepted requirements would be wrong.
- Old state-page references, archived `docs/plan/*` decisions and the handover were stale as current repository documents at the audit baseline because those files were absent. Retain their historical evidence without treating the missing pages as current authority.
- The old report's broad counts such as “66 fixed and serving” must not be repeated as a present count. This pass sampled high-impact claims and did not re-evaluate every row.

### PRODUCT DECISIONS AT INITIAL CHARTING — historical snapshot

The following bullets describe what was unresolved when this evidence inventory was first written. They are not the current decision frontier; the reconciliation below records the subsequently accepted direction.

- **Agent engine and tool architecture:** retain the custom loop, adopt a compatible AI SDK/Workflow agent, or use another managed shape; versioned replay and parked-run migration remain acceptance-critical. #598 supplies the baseline and #599 the official research before a decision is recorded.
- **Frontend architecture and components:** current source has 30 page files, 8 route files, 273 non-test component TSX files, 147 component test TSX files, 15 `components/ui` primitives and 13 non-test `components/common` TSX files. Current navigation is five firm destinations plus Admin children and nine client tabs, including Tax, with a docked Clara rail. These are checked inventory facts, not the desired design. #600 and #604 own the new information architecture and component contracts; old “fixed UI” items should become regression constraints where still relevant.
- **Vendor/customer bindings and identity:** the current product has a separate `/admin/vendor-bindings` client picker plus propose/sign/revoke ceremony, while registers expose customer/vendor counterparties, aliases and statements, and `0176` makes aliases kind-scoped. Whether to remove the manual binding surface, merge identity into the KB, or retain deterministic references is unresolved and belongs to #603. Deleting the UI before defining migration and reference integrity would be premature.
- **Accounting safety ceremonies:** high-stakes checks, onboarding checker rules, binding signatures, reconciliation completion and close/period locks must be separated into redundant ceremony versus real invariant in #602. The owner has newly confirmed that authorised work may complete reconciliation and lock the period automatically. Unresolved receipts must remain pending and produce an explicit question; they must not be posted to a default suspense account. These confirmations narrow #601/#602 but do not by themselves specify every refusal and receipt.
- **Work presentation:** the owner has confirmed a Linear-style Work list/detail model with inline answers. #604 still owns the complete page/component contract and #601 owns question concurrency and lifecycle.

### Reconciliation after the accepted work, accounting, Knowledge and navigation decisions

This is a requirements reconciliation against the accepted refresh direction, not a new source audit or deployment check. It does not reclassify unexamined rows of the historical register as fixed.

| Earlier concern or proposed remedy | Current disposition and implementation consequence |
|---|---|
| Add an opt-in auto-post mode or make ordinary uploads request autodraft first | Superseded as a product remedy. Default autonomous execution and attributed-upload intake are accepted in [确定 Accounting Work 的自动执行、生命周期与交互契约](https://github.com/BELCORT-SDN-BHD/clara/issues/601#issuecomment-5581778992). Preserve source and authority checks, but implement the common automatic intake path and honest processing states. |
| Preserve default human maker/checker or extra attestation for ordinary posting | Superseded by [确定分录、业务对象与确定性校验的边界](https://github.com/BELCORT-SDN-BHD/clara/issues/602#issuecomment-5582778719). Remove that redundant ceremony in its implementation slice while keeping current permissions, monetary and period constraints, coupled business records, and explicit human acceptance of close evidence exceptions. |
| Repair the separate mandatory vendor/customer binding ceremony as the future workflow | Superseded by [确定客户知识、身份与 agent context 的维护契约](https://github.com/BELCORT-SDN-BHD/clara/issues/603#issuecomment-5583365852). Knowledge owns sourced identity and aliases; manual pre-registration is not an execution prerequisite. Stable references, separate AR/AP roles and safe rename/merge history remain necessary migration constraints. |
| Fix onboarding answers only as an interview display problem | Still a real data-flow gap, with broader accepted meaning: explicit facts must reach the same governed client Knowledge used by execution. Resumable onboarding and dependent questions use the common Work contract; an answer stored only in a chat or plan is insufficient. |
| Implement archive as the full chat reset/history remedy | Incomplete under the accepted lifecycle. The refresh includes new/switch/archive/restore and actual deletion of ordinary text while preserving minimal necessary work basis, books and confirmed Knowledge. Work cancellation remains separate. |
| Keep the nine-tab client shell, mixed Reports engine panels or one-text-box workflow as the target | Superseded by [确定整体导航、页面职责与 shadcn 组件契约](https://github.com/BELCORT-SDN-BHD/clara/issues/604#issuecomment-5583995499). Rebuild against Work detail/in-place questions, typed Documents, grouped Accounting, Knowledge and report outputs. Retain scope containment and other still-valid regressions from the current surfaces. |
| Choose the final SDK migration from package/import success | Still unresolved in [验证统一 Clara agent harness 与持久化执行的实施路线](https://github.com/BELCORT-SDN-BHD/clara/issues/607). The later [local process-restart proof](refresh-2026-09-08-agent-harness-validation.md) verifies persisted hooks/SSE and trusted synthetic-state rereads, and current Clara already has a reusable answer-admission gate. Atomic authority-through-commit, delivery crash/lease windows, cancellation and version cutover still need proof. No production runtime route is adopted. |
| Copy dashboard template values, visual hierarchy or animation wholesale | Not accepted. [确定首页财务指标、聚合口径与数据新鲜度](https://github.com/BELCORT-SDN-BHD/clara/issues/608) has resolved the metric contract; the owner selected A Home plus B Work in [比较并确定 Clara 页面的视觉、响应式和动效方案](https://github.com/BELCORT-SDN-BHD/clara/issues/609). The local native-component prototype has bounded checks, not full production acceptance. The [34-journey interaction contract](refresh-2026-09-08-frontend-interaction-contract.md) and source-specific contracts now govern detailed frontend slicing. |

The remaining full-register adjudication and implementation cuts belong to [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605). Its final dependency sequence follows the live map, replacing the initial sequence at the end of this historical inventory. Concrete slices must retain their own source verification and local/hosted acceptance; accepted product intent alone closes no defect.

### OWNER / EXTERNAL

- The repository still seeds a conspicuous legal-review DPA placeholder in `0158_checkout_gate_c1_dpa.sql`. Final DPA and Terms bytes remain lawyer/owner inputs. Engineering can build placeholder rejection, version/hash and receipt gates, but cannot supply legal text.
- Stripe/Supabase/Resend settings, production deploy identity, PITR purchase and restore evidence require account access or hosted operations. None was checked here.

## Recommended dependency order and ticket cutting

The active map already has the right non-duplicative structure. #598, #599, #600 and the factual portions of #605 can advance independently. Product acceptance should flow as:

1. #601 defines work lifecycle, client attribution, questions and autonomy.
2. #602 defines accounting/business-object invariants and the permitted automatic completion boundaries.
3. #603 defines KB and identity/binding ownership.
4. #604 turns those contracts into navigation, page and component acceptance.
5. #605 cuts implementation issues with explicit dependencies and separate local versus hosted evidence.

One implementation issue can be cut early after #598 confirms the full dispatch path: fix the classify/OCR race so classification waits for a successful OCR/structured extraction or is retried from the extraction-complete event, with a deterministic out-of-order test. The high-stakes wall, consent surface, chat archive/export, vendor-binding removal, onboarding fact projection and management report surface should wait for their owning decisions so an old ruling is not silently rebuilt.

The next dependency for the map is therefore the **current-state engine trace in #598 plus owner acceptance in #601–#603**. Once those settle, #604 can specify the frontend against real accounting work and #605 can turn the audit register into concrete, non-overlapping implementation tickets.
