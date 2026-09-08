# Clara refresh phase handoff

**Updated:** 2026-09-09 (MYT). **Current phase:** /to-spec completed; /to-tickets is next.

## Current authority and tracker state

The formal build contract is [Clara refresh spec：统一自主会计、持久 Work、Client Knowledge 与完整 UIUX](https://github.com/BELCORT-SDN-BHD/clara/issues/612), labelled `ready-for-agent`. It contains 111 user stories, implementation decisions, testing decisions, scope boundaries and links to six acceptance-appendix comments. The local [formal-spec file](refresh-2026-09-09-formal-spec.md) mirrors its body; GitHub owns later acceptance discussion/status.

The owner explicitly accepted the original /to-spec test-seam check: user input → Accounting Work → complete business outcome, plus real database/Workflow races, restart, authority/cancel, all 34 frontend journeys, keyboard/narrow/recovery, Knowledge and financial results. The original Matt skill process was followed; no skill was modified to skip this check.

Wayfinder decision convergence is complete. All twelve decision/research/prototype children are closed. The final [direct-debit scope decision](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144) includes observed-debit bookkeeping/settlement and explicitly authorised recurring accounting plans; actual bank payment initiation and mandates remain future scope.

The overall [Clara refresh：统一 accounting work、agent／KB 与工作台体验](https://github.com/BELCORT-SDN-BHD/clara/issues/597) remains open because its destination includes implementation and verification. The formal spec is its native sub-issue, not a new Wayfinder decision ticket.

[重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605) remains open for concrete implementation-ticket mapping. Its decision blockers are closed; do not require its closure before decomposition. [等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606) remains an existing independent implementation item with a separate local candidate, not deployed proof.

## Required spec appendices

Read all comments linked from the formal body, not only its title or summary:

- [A.1 — historical audit](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589270292) and [A.2 — continued](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589270908): all 216 unique historical IDs plus known-issue extras, initial disposition and required next action.
- [B — nested obligations](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589271633): 157 primary plus four adjacent leaves, 161 total including explicitly retained duplicate anchors.
- [C — complete frontend recipes](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589272141): all 34 journeys and shared interaction/recovery acceptance.
- [D — component dispositions](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589272729): full component/AI helper choices, provenance and evidence limits.
- [E — journey/story mapping](https://github.com/BELCORT-SDN-BHD/clara/issues/612#issuecomment-5589273361): all 34 journeys mapped to the formal stories and the owner's test-seam acceptance.

These are publication snapshots, not competing live backlogs. Current formal decisions supersede explicitly dated provisional status. Historical source paths remain locators, not instructions to recreate deleted modules. Each retained or discovery obligation needs a ticket/acceptance owner or explicit current-scope disposition; no row disappears by silence.

## Next phase: /to-tickets

1. Read the original `to-tickets` skill in full, the complete formal issue body and comments, live dependencies, PRD, Architecture, CONTEXT and applicable ADRs.
2. Split into narrow, demoable vertical slices spanning necessary schema/operation/runtime/read/UI/verification boundaries. Use existing seams; retain coupled accounting invariants. Missing legacy executors for accepted operations become implementation work.
3. Map all retained audit and nested obligations, the 34 journeys and cross-cutting acceptance. Keep explicit duplicates distinct from merely related grant/revoke or add/retire cases. Reuse the existing OCR/classification item instead of duplicating it.
4. Review the concrete slice boundaries and true blockers with the owner as the original skill requires. This is a review of the actual decomposition, not another interview about settled agentic/product/visual decisions.
5. Publish the approved implementation issues with `ready-for-agent` and minimal native GitHub dependency edges. Complete the cross-phase audit/slicing issue when its mapping/publication work is actually done.
6. Implement each unblocked, self-contained issue in an appropriate fresh context, following original `implement`, `tdd` and `code-review` instructions and repository rules. Update the affected SOT and evidence with the change.

No full implementation graph has been published by /to-spec. No production change was deployed.

## Sources of truth

| Source | Ownership |
|---|---|
| PRD | Enduring product blueprint: vision, users, problems, behavior, core journeys, scope and completion conditions. Update after accepted product decisions. |
| Architecture | Enduring technical blueprint: stack and reasons, system boundaries, responsibilities, dependencies, data flows and trade-offs. Distinguish current implementation from explicitly accepted target architecture. |
| CONTEXT / ADRs | Shared domain vocabulary and applicable recorded decisions. |
| Formal GitHub spec and appendices | Dated delivery contract, build acceptance and retained obligations. Later accepted contracts may supersede its delivery scope. |
| Implementation issues | Concrete slice scope, blockers, status and local/hosted evidence. |
| Dated evidence / prototypes | Source findings and bounded experiments with explicit limitations. |

Accepted Wayfinder or spec decisions update PRD and Architecture before ticket decomposition. Implementation updates the architecture's current-state claims with verified evidence; accepting a target does not mean it has shipped. Later decisions update these enduring blueprints without rewriting what an older investigation or prototype actually proved.

The earlier [v0.1 product-contract draft](refresh-2026-09-08-product-spec.md) is historical synthesis input; it is superseded for build acceptance by the published formal spec. The [original-prompt coverage](refresh-2026-09-08-original-prompt-coverage.md) retains 126 traceable rows; the categories are not an implementation completion percentage.

## Runtime and visual evidence to retain

The [runtime route](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302) selects the first frozen successor on Node22 / Workflow4 / ToolLoopAgent7.0.77. Native WorkflowAgent v1 supports Workflow4 and has finer checkpoints; its older exact AI dependency and maintenance costs are documented. Real-Clara operations/roles, answer delivery, coarse-segment partial-stream recovery, full frozen-manifest cutover/rollback and hosted rollout remain implementation acceptance.

The [visual decision](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5587677017) selects A Home + B Work. Full product, keyboard/narrow/zoom/assistive-technology/recovery acceptance still applies; static Mobbin frames and synthetic prototypes do not establish it.

Publication and separately preserved prototype branches:

| Purpose | Branch / location | Evidence limit |
|---|---|---|
| Reviewed SOT, research and formal spec | Versioned repository files, published through `codex/research-ui-contract`; exact merge and checks in the map's publication checkpoint | Includes reviewed documents, retained evidence artifacts and tracked skill restoration; unrelated main runtime/config candidate is excluded. |
| A+B visual prototype | `codex/prototype-clara-visual` at `8f72de0dd39fca702eb0c9cacd8fab5de8982223`, sibling `clara-rebuild-prototype-clara-visual` | Synthetic data/local interactions; no production API/persistence proof. |
| Durable-agent proof | `codex/research-agent-harness` at `2d34cd3ef5bdd84e86ffba9e3c23cd596acf7960`, sibling `clara-rebuild-agent-harness` | Real PG/process restart and synthetic business-state ordering; not real Clara RLS or two deployments. |
| Accounting Work prototype | `codex/prototype-accounting-work` at `4121d9edcc783f254574b545d03c014b1bcaf58d`, sibling `clara-rebuild-prototype-accounting-work` | Throwaway synthetic interaction model. |

The formal build contract and acceptance appendices are readable from GitHub. Research documents and the retained artifacts in this repository travel with its publication. The separate executable visual and agent-runtime prototype branches remain local: a new clone cannot fetch their unpushed hashes. Transfer/publish those prototype branches before relying on their full experiments elsewhere. Same-machine work can read the existing directories immediately. Original dated evidence describes what was observed at the time; later publication does not upgrade that evidence into production verification.

## Matt skill setup

[Setup verification and restoration](refresh-2026-09-09-matt-setup-check.md) records the official fixed source and checks. The tracker is GitHub via `gh`, using native sub-issues/dependencies, five default triage labels and single-context domain docs. Both Matt skill copies are restored to upstream; review is `/code-review`. Custom orchestration remains a separately owned project skill. Do not patch upstream skills to encode Clara-specific product requirements.

Recommended continuation:

> Run /to-tickets for the published Clara refresh spec. Read its full body and six acceptance appendices, current repository SOT and live GitHub state. Preserve accepted decisions, map every retained obligation, propose concrete vertical slices and native blockers, complete the original skill's split review, then publish the implementation graph. Distinguish current source, local proof and hosted acceptance.
