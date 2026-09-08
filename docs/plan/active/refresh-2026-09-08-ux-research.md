# Clara refresh — UI evidence and candidate interaction contracts

Date: 2026-09-08. Canonical effort: [Clara refresh](https://github.com/BELCORT-SDN-BHD/clara/issues/597). This is research evidence and a proposal, not a completed redesign or a claim of exhaustive flow coverage.

Status clarification after the owner exchanges: candidate/remaining language below describes this research snapshot. Work lifecycle, conversation deletion, Knowledge and navigation now follow their accepted resolutions and the [current product contract](refresh-2026-09-08-product-spec.md); they are not reopened by the older proposal text. The selected direction is A dashboard plus B Work. [补齐全量前端用户流、交互状态与 Mobbin 对照](https://github.com/BELCORT-SDN-BHD/clara/issues/610) owns whole-product detail coverage beyond these bounded reference sequences; 73 inspected core static frames and a full component catalog disposition do not establish that every Clara journey has been designed, built or tested.

## What was inspected

- Current PRD and Architecture, graph-discovered frontend symbols, direct source for DocumentsWorkbench, NeedsYouRow, ClaraThreadMenu, ClaraThreadView, TurnProgress, InterruptionsPanel and threadStore. Coverage metadata reported changed file metadata; direct source was used. `globals.css` has a recorded partial-parse range at line 23; its actual token declarations were read directly.
- Authenticated existing Clara browser tab, read-only: Reports, Documents, and one bank-statement detail. No upload, chat message, accounting mutation, retry, permission change or report request was performed. These are observations of one existing client, not a full hosted acceptance run or a reproduction of the underlying extraction failure.
- Mobbin returned preview images, which were visually inspected. Counts below state the actual viewed positions, not the entire flow. Static images do not establish animations, response timing or backend behaviour.
- `pnpm dlx shadcn@latest info --json`, official component catalog/docs, and shadcn MCP searches. No component installation or source overwrite.

## Mobbin evidence

| Reference | Viewed coverage | Useful observation / candidate application |
| --- | --- | --- |
| [Linear onboarding](https://mobbin.com/flows/64ae582c-747c-4c77-8629-812abcbef186) | 1, 7, 13, 19, 25 of 25 | Focused admission steps, workspace creation, then entry into usable product navigation. Client accounting onboarding will require a richer evidence/answer flow; copying this form sequence does not settle that contract. |
| [Linear inviting team members](https://mobbin.com/flows/44413772-2ae1-4a33-85e7-df96010438b9) | 1, 3, 5 of 5 | Member list remains the destination; a compact invitation dialog creates visible invited rows. Good firm-member pattern. |
| [Linear Pulse](https://mobbin.com/screens/71a0482d-226d-44bf-aac0-1abc44a7c40b) | One screen | Readable updates with status changes and replies. Useful for Activity summaries, distinct from the actionable work inbox. |
| [Linear project updates](https://mobbin.com/screens/ed6163fd-12f3-4aad-a6ed-62707cb7c21e) | One screen | Narrative updates alongside object properties and milestones. Candidate for a close-work detail, using real readiness data. |
| [Linear creating a view](https://mobbin.com/flows/23c119ec-b9fc-4934-ab4a-107934dd858c) | 1, 5, 8 of 8 | Filtered status-grouped lists with saved view metadata. Fits firm portfolio work and a Needs-you filter. |
| [v0 home](https://mobbin.com/flows/d765f61d-a628-4981-821c-bfe77446a3f4) | 1–3 of 3 | A clear composition entry point, recent conversations and projects; this alone does not show execution. |
| [v0 creating a chat](https://mobbin.com/flows/e317900d-075f-429c-9fc1-c89916af38e7) | 1, 4, 7, 10 of 10 | Attachments appear in composition; chat sits beside the working artifact; artifact can occupy the full area. |
| [v0 creating a website](https://mobbin.com/flows/8ccf8326-7eef-4a52-b998-5e0aecd356c8) | 1, 5, 9 of 9 | Conversation and generated result have separate persistent visual roles. Clara's result is a current accounting object, not generated HTML. |
| [v0 workspace settings](https://mobbin.com/screens/97933ff4-306e-4020-944d-f6ff25263338) | One screen | Settings navigation groups account and workspace concerns; controls explain their effects in place. |
| [Vercel overview with an empty Active Branches section](https://mobbin.com/screens/71889386-ec08-4bcf-851d-3c431af4db45) and [project overview](https://mobbin.com/screens/c7fc1aa9-5a08-4993-a979-66c3e729527c) | Two initial screens; complete 6-frame overview sequence in supplement | Stable left navigation, scoped project context, a current-result summary and compact supporting metrics. The first screen is not an empty project: only its Active Branches section is empty. Candidate shell hierarchy, not a financial dashboard specification. |
| [Copilot Money categories](https://mobbin.com/screens/cca95442-6e70-485b-8d1a-2ee035ad7348) and [dashboard](https://mobbin.com/screens/9942286b-57ec-4c81-b9ae-92858b6f91ad) | Two iOS screens | Primary number + context, category-level comparisons and review items. Borrow financial hierarchy; do not assume consumer budget categories or carousel density suit a desktop accounting firm. No animation evidence was obtained. |
| [Midday document matching](https://mobbin.com/screens/0a3f3121-04f7-4599-a3c0-cd86ca8f0923) | One screen, returned from a broader accounting query | Source list next to a readable receipt and matching control. Particularly relevant to evidence-first Documents and Bank. |
| [Mercury transactions](https://mobbin.com/screens/8f14ee3c-6f62-4bf8-951a-7ce663c0233b) | One screen, returned from a broader accounting query | Compact cash movement summary above a dense, filterable transaction table with attachment/account fields. |

The accounting query did not return Ramp. No Ramp-specific conclusion is claimed. The [flow supplement](refresh-2026-09-08-ux-flow-supplement.md) records subsequent completion of the core Linear/v0/Vercel/Copilot static sequences and the exact remaining samples. Actual motion behaviour, detailed Clara asset/GL layouts and responsive variants remain design and verification work.

## Current UI: observed and sourced gaps

| Before / current evidence | Proposed after | Why |
| --- | --- | --- |
| Reports displays formal archives, sandbox limitations, query logs, snapshots, render queue, seeding and wiki pages. The visible text includes internal SQL-role/table names and migration numbers. Observed in the hosted page. | Reports presents available report outputs and requests; Work holds preparation/render progress; Activity holds operational history; Knowledge owns wiki content. | Each page should answer a user's accounting question and show a usable next step. Backend inventory is not a product information architecture. |
| A bank statement appears `done` in the document list and `extraction: done` in detail while its `statement_facts` task is visibly failed with `engine_error`. The same detail offers Request autodraft and has no named fields. Hosted read-only observation. | Distinguish custody/OCR/facts/accounting outcome; the primary status communicates incomplete or failed processing and a supported recovery. Actions depend on document capability and actual state. | A completed OCR stage does not prove a document's accounting work succeeded. The failure's root cause and whether a successor rerun already exists were not diagnosed. |
| DocumentsWorkbench divides upload/list/detail into columns, then adds coding tasks below (`apps/web/components/documents/documents-workbench.tsx:81`). Document administration competes with primary evidence. | Filterable document list with a spacious source-and-facts detail; source/type-specific outcome links; infrequent management verbs in a named menu or sheet. | Keep evidence legible and make the normal task obvious. A right-click menu may supplement visible actions, never be the sole discoverable access. |
| New/switch conversation exists; archive is a NotBuiltNote (`apps/web/components/clara/ClaraThreadMenu.tsx:75`, `:123`). | New conversation resets conversation context and work remains reachable independently. A discoverable history/archive control is an additional design proposal. | The owner confirmed reset and preservation. Archive and physical transcript-deletion behaviour remain distinct choices, not implied approvals. |
| Current thread folds live clarifications but renders settled messages (`apps/web/components/clara/ClaraThreadView.tsx:136`, `:312`); TurnProgress explicitly adds no provisional assistant text (`TurnProgress.tsx:13`). | Stream answer text and typed tool/work status; rehydrate authoritative action outcomes after reconnect. | A streaming draft answer is a presentation state; a posting success still follows a server receipt. Native streaming does not require pretending an uncommitted financial action succeeded. |
| Journals contains firm-wide interruption cards with an inline textarea (`apps/web/components/journals/interruptions-panel.tsx:86`, `:165`). Needs-you frequently links to a different owning tab (`apps/web/components/firm/needs-you-row.tsx:185`). | Work owns the question; Needs you is an attention view; work detail, source object and rail can render/answer that same question. | Answering should resolve one persisted request, independent of where it is shown. Client context and stale/concurrent answers need a shared backend contract. |

## Recommended interaction model

The owner has confirmed a filterable Work list, detail and in-place questions. Candidate arrangement:

1. Firm scope shows portfolio Work / Needs you / Activity and Clients. Client scope filters the same work model and exposes accounting objects.
2. Work detail shows intended outcome, current status, input evidence, created/changed objects and concise explanation. Questions are typed forms when structured data is required; free conversation remains available for explanations and unanticipated information.
3. Chat can initiate or discuss work. A message links to the work object; a new chat does not cancel the job. The work detail remains usable with the rail closed.
4. Documents are input/evidence views. Journals show financial effects. Bank handles movements, allocation and reconciliation. Registers own asset/open-item/configuration details. These are connected views of one accounting process, not duplicate queues requiring users to restart work.
5. Close is a period job with actual readiness checks, exceptions and resulting reports. Report types belong to selecting outputs rather than defining what close itself means. Q16/Q17 superseded the earlier full-auto opt-in premise: normal autonomous execution may finalise reconciliation/lock when the accepted readiness and authority conditions hold. Scheduled close starts only from an authorised plan; a due date is a trigger, not readiness proof. The resolved Work/accounting decisions own these conditions.

No arbitrary gallery or carousel is needed for the operational work queue. Cards can contain a result, question or dashboard summary inside this layout.

## Component and token evidence

Repository baseline `68ab432308e1bfe87871565c207f8f4ac1e89101`, inspected 2026-09-08: manifests/lockfile pin Next.js 16.3.3, Tailwind 4.3.3, Base UI 1.7.0, shadcn 4.19.0 and Lucide 1.34.0. CLI inspection that day confirmed `base-nova`, `@/` aliases and `app/globals.css`; `shadcn@latest` is a mutable discovery command, not the version authority. Installed UI files returned by CLI: badge, button, card, command, dialog, dropdown-menu, input-group, input, label, select, separator, sheet, table, tabs, textarea (15). This is not the full upstream catalog.

CLI preset resolution reports fallback font/theme values. Actual CSS is decisive: `globals.css:26` uses Source Sans and `:28` Source Serif; `:112` begins explicit radius tokens. Do not replace these with the CLI's fallback Geist/neutral preset. Existing semantic surface, text, status, chart and sidebar tokens remain the design inputs.

| User task | Candidate components | Behaviour contract |
| --- | --- | --- |
| Clara conversation | Message, Bubble, MessageScroller, Marker, Attachment; typed result/question renderers | Streaming and reconnect; readable current tool status; user controls auto-scroll; pending text distinct from committed receipts. |
| Clarification and onboarding | Questionnaire, Field/FieldGroup, Select/Combobox, checkbox/radio options, date controls | Stable question/field identity and validation, save/resume, source context, correction handling; do not force every explanation into a multiple-choice box. |
| Document/transaction intake | Attachment in chat, contextual upload/drop area in workbench | One ingestion pipeline with client attribution, per-file progress/failure, deduplication and work links; Attachment is not the whole backend upload service. |
| Work and accounting lists | Table/data-table composition, filters, badges, pagination; Sheet or Resizable detail | Dense sortable/filterable rows, keyboard access, selection and stale-state handling. |
| Secondary actions | DropdownMenu, ContextMenu, Dialog/Sheet | Primary action stays visible; dangerous or rare edits have the appropriate explicit form. |
| Status | Marker/Badge, inline status, Progress where total is defined, Alert for actionable exceptional conditions | Do not show a persistent Alert for every ordinary background start; never invent a completion percentage. |
| Financial dashboard | Chart plus visible numeric values and supporting Table | Defined measure/period/currency/source/freshness; keyboard-readable values and no unbacked charts. |
| Settings and navigation | Sidebar, Breadcrumb, Tabs, Field, ButtonGroup | Firm/client scope remains explicit; account/member/billing/preferences and automation policies are grouped by user responsibility. |

Official sources: [component catalog](https://ui.shadcn.com/docs/components), [CLI](https://ui.shadcn.com/docs/cli), [Questionnaire](https://ui.shadcn.com/docs/components/base/questionnaire), [Message](https://ui.shadcn.com/docs/components/base/message), [Attachment](https://ui.shadcn.com/docs/components/base/attachment), [MessageScroller](https://ui.shadcn.com/docs/components/base/message-scroller), [Data Table guide](https://ui.shadcn.com/docs/components/base/data-table), [AI Elements Confirmation](https://elements.ai-sdk.dev/components/confirmation).

Tooling discrepancy: the CLI docs command returned no links for message/message-scroller/attachment and said data-table is not a registry component; the official pages exist. MCP search found message/message-scroller but no questionnaire, while CLI docs resolved questionnaire. This is discovery/registry skew, not proof a component is unavailable. Verify each selected component with the app's CLI/style and official docs before installation. Data Table is a composition guide, not a promise that `add data-table` works.

Motion proposal follows the user's requested Emil skill and existing tokens: fast local state feedback, no decorative animation for repeated keyboard work, preserve focus through overlays, reduced-motion alternatives and no animation that conceals a changed financial value. Timing/easing decisions still need an actual prototype; Mobbin screenshots did not validate them.

## Remaining work

- Core static flow inspection is complete to the bounded coverage stated in the supplement; no motion or final Clara layout is claimed from it.
- Specify work state, question identity, answer versioning, cancel/partial-completion semantics and client attribution before implementing shared renderers.
- Verify field-level document schemas and account/register actions against the backend evidence report.
- Produce and compare concrete desktop/responsive prototypes after the backend and user-flow decisions are accepted.
- Convert approved component choices to installation/diff work; no mass `add --all` or preset overwrite is implied by researching all components.
