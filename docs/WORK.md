# Clara — Work

The active effort is [Clara refresh：统一 accounting work、agent／KB 与工作台体验](https://github.com/BELCORT-SDN-BHD/clara/issues/597).
GitHub owns decision status, dependencies, claims and implementation tickets. This page points to
that state and its evidence; it is not a second backlog.

## Current phase — 2026-09-09

Wayfinder decision convergence is complete; the next phase is /to-spec. The [runtime route is resolved](https://github.com/BELCORT-SDN-BHD/clara/issues/607#issuecomment-5588548302):
a new frozen successor uses Node 22, Workflow 4 and AI SDK ToolLoopAgent with one versioned Clara
harness. The native WorkflowAgent comparison, benefits, exact dependency costs and remaining
production gates are in the [route audit](plan/active/refresh-2026-09-08-runtime-route-audit.md).

The owner resolved the last original-prompt scope question:
[明确定期扣款的记账与支付边界](https://github.com/BELCORT-SDN-BHD/clara/issues/611#issuecomment-5588831144).
This refresh includes bookkeeping/settlement of observed debits and explicitly authorised
recurring accounting plans. Actual bank payment initiation and mandate management remain future
scope. No unanswered product choice remains in the Wayfinder decision frontier.

The audit classification input is ready for synthesis: the
[216-item register](plan/active/refresh-2026-09-08-audit-register.md) and
[nested obligation recovery](plan/active/refresh-2026-09-08-audit-nested-obligations.md)
retain initial dispositions, current-source corrections, explicit duplicates, future-scope items
and actionable discovery/validation. They do not claim all defects are verified or fixed.

Use the [phase handoff](plan/active/refresh-2026-09-08-phase-handoff.md)
to run /to-spec, then /to-tickets and /implement. No formal spec or full implementation-ticket
graph has been published. [重判旧 audit 与 backlog，切出可验证实现切片](https://github.com/BELCORT-SDN-BHD/clara/issues/605)
stays open through concrete issue creation; closing it first is not a circular prerequisite
for spec synthesis. The overall map includes implementation and remains open through delivery.

A same-machine fresh session must read full GitHub bodies/comments and the local evidence.
Reviewed snapshots and executable prototypes are on local, unpushed research branches; a new
clone cannot recover those branches from GitHub issue links alone. The map's latest snapshot
comment identifies the exact retained commits.

## Accepted direction and coverage

- [Accounting Work](https://github.com/BELCORT-SDN-BHD/clara/issues/601#issuecomment-5581778992):
  default autonomous execution, persistent Work/questions, shared entry points, batch isolation,
  separate conversation/Work lifecycles and readiness-based scheduled close.
- [Complete accounting operations](https://github.com/BELCORT-SDN-BHD/clara/issues/602#issuecomment-5582778719):
  Journal effects and related business state, manual/agent parity, correction impact and actual
  authority/invariants. A journal alone is not every operation's complete outcome.
- [Unified Knowledge](https://github.com/BELCORT-SDN-BHD/clara/issues/603#issuecomment-5583365852):
  sourced facts/identity/aliases, client-scoped defaults, advisory experience, correction and
  relevant retrieval; knowledge never grants execution authority.
- [Navigation and components](https://github.com/BELCORT-SDN-BHD/clara/issues/604#issuecomment-5583995499),
  [dashboard data](https://github.com/BELCORT-SDN-BHD/clara/issues/608#issuecomment-5585923205),
  [all frontend journeys](https://github.com/BELCORT-SDN-BHD/clara/issues/610#issuecomment-5587196374)
  and [A Home + B Work](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5587677017):
  a detailed rebuild of every in-scope journey, object action and state. The four-surface prototype
  is evidence of the selected direction, not the entire frontend deliverable.

The [original-prompt coverage audit](plan/active/refresh-2026-09-08-original-prompt-coverage.md)
maps 59 request areas, 34 frontend journey families and explicit component/helper follow-ups.
It incorporates the prior Claude reports and named Mobbin references and corrects the initial
scope comment's stale counts. The [64-component disposition](plan/active/refresh-2026-09-08-component-contract-research.md)
separates research, isolated prototype use, production installation and remaining acceptance.
The [Copilot follow-up](plan/active/refresh-2026-09-08-copilot-motion-research.md) adds bounded
first-party motion and chart evidence without claiming the entire vendor animation system.

## Source of truth and evidence

[PRD](PRD.md) owns accepted product intent and is updated when a decision settles.
[Architecture](ARCHITECTURE.md) describes current implementation and is updated with the
affected implementation change. [CONTEXT](../CONTEXT.md) owns domain terms.
The [product contract draft](plan/active/refresh-2026-09-08-product-spec.md) is formal-spec input,
not the published /to-spec output or evidence that the target is deployed.

The [backend evidence](plan/active/refresh-2026-09-08-backend-evidence.md) and
[prior-report reconciliation](plan/active/refresh-2026-09-08-prior-research-reconciliation.md)
distinguish current source from old reports. The withdrawn Clara v2 map and the desktop
2026-09-06 disposition are historical inputs; their issue closures are not repair evidence.

The [runtime boundary rig](plan/active/refresh-2026-09-08-runtime-boundary-proof.md) proves
bounded synthetic PostgreSQL/process-kill replay and transaction ordering. The
[native comparator](plan/active/prototypes/native-workflowagent-v1/README.md) proves its separate
Workflow test-world cases. Real business doors, delivery, full cutover and hosted behavior
remain explicit implementation gates. The [visual evidence](plan/active/refresh-2026-09-08-visual-decision.md)
records bounded keyboard/focus/reflow/reduced-motion checks and remaining integration work.

[等待成功提取后再分类文件，修复 OCR／classify 竞态](https://github.com/BELCORT-SDN-BHD/clara/issues/606)
can proceed independently. Its [local candidate evidence](plan/active/refresh-2026-09-08-ocr-fix-validation.md)
does not establish a deployed migration or full hosted intake acceptance.

Every implementation ticket must name its trigger, resulting behavior, coupled accounting
state, recovery path and checks. Preserve the difference between source inspection, local
tests, deployed versions and observed hosted journeys.
