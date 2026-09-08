# Component contract research — UI ticket 600

**Checked:** 2026-09-08
**Scope:** `apps/web` shell, chat, documents, Needs you, preferences, and the current shadcn Base registry. This is research only; no component, preset, or production UI was changed.

## Verified local baseline

- `apps/web/components.json` selects shadcn `base-nova`, Base UI, CSS variables, Lucide, and `@/*` aliases. Its `registries` object is empty.
- `pnpm dlx shadcn@latest info --json` reports Next.js 16.3.3 App Router, React Server Components, TypeScript, Tailwind v4, and `app/globals.css`. The repo uses pnpm 10.33.0; the app pins shadcn 4.19.0 and `@base-ui/react` 1.7.0.
- Fifteen shadcn components are installed: Badge, Button, Card, Command, Dialog, Dropdown Menu, Input Group, Input, Label, Select, Separator, Sheet, Table, Tabs, and Textarea.
- The actual theme authority is `apps/web/app/globals.css`, not the fallback preset reported by `shadcn info`: Source Sans/Source Serif font bridges; canvas/shell/surface/ink, brand/accent/Clara and semantic success/warning/error/info colors; chart and sidebar mappings; 0.5rem base radius; density and motion tokens. Generated components must retain these mappings.
- Repository-index coverage was checked for the cited shell, chat, document, Needs you, settings, config, and CSS files. The index marked them metadata-changed and partially parsed `globals.css`; direct source reads supplied the facts below.

## Current shell and route facts

The firm shell has a persistent 224px sidebar at `lg` and a mobile Sheet containing the same navigation. `PageShell` supplies `gap-6 p-4 lg:p-8`. The Clara rail is 320px, docked at `lg`, an overlay below `lg`, closes on narrow initial load, and implements Escape/focus handling. Firm links are Home, Needs you, Clients, Activity, and Admin. A client workspace adds real route links for home, journals, documents, bank, close, tax, reports, registers, and knowledge; below `lg` they scroll in one row and at `lg` they wrap. These should remain links with `aria-current`, rather than Tabs, because they navigate URLs.

The filesystem route inventory contains `/needs-you`, `/clients/[clientId]/documents`, the other client object routes above, `/admin/settings`, `/clara/[threadId]`, and `/clients/[clientId]/clara/[threadId]`. It contains no `/work` route. Documents currently use a workbench with list/upload/task content plus a constrained `lg:max-w-md` detail aside. Needs you is a cross-client queue with limited inline actions and links to the owning client tab. Clara has a hand-built transcript, streaming/reconnect state, typed cards, attachment control, and an accessible log. Settings is currently a small panel under `/admin/settings`.

## Current vendor and CLI findings

The official [component catalog](https://ui.shadcn.com/docs/components) currently includes every requested family: Attachment, Bubble, Chart, Dialog, Dropdown Menu, Empty, Field, Message, Message Scroller, Questionnaire, Sheet, Sidebar, and Toast. It also lists Marker and the controls needed for preferences. The [CLI reference](https://ui.shadcn.com/docs/cli) documents `info`, `docs`, `search`, `add --dry-run`, `--view`, and `--diff`.

`shadcn docs` returned official Base pages for Questionnaire, Field, Empty, Dropdown Menu, Sheet/Dialog, Chart, Sidebar, and Toast. It returned no links for Message, Message Scroller, Bubble, or Attachment even though their official pages and catalog entries exist; use the catalog/direct pages for those components.

This worker could not discover the shadcn MCP lane. A root-task check did: `get_project_registries` returned `@shadcn`, and `list_items_in_registries` returned 61 UI items, including Attachment, Bubble, Marker, Message, and Message Scroller. That result omitted Questionnaire and the Base Toast and listed Sonner; its add-command text was malformed as `[object Promise]`. This is MCP/app-context skew, not evidence that the app config changed. Prefer the app-aware Base CLI's generated code for installation and API decisions.

A combined dry run for Message, Message Scroller, Bubble, Attachment, Questionnaire, Field, Empty, Chart, Sidebar, and Toast resolved 19 files: 13 creates and six overwrites (Button, Label, Separator, Card, Input, and Sheet). It proposed `cn`, `@shadcn/react`, and Recharts 3.8.0 in addition to the existing Base package. Generated Toast imports Base UI toast, creates a toast manager, and uses `render` composition; it is not Sonner. Generated files also imported `cn` from `"cn"`, while local code uses `@/lib/utils`, so each candidate needs `--view`/`--diff` review before adding.

`shadcn search @shadcn --limit 500 --json` failed because `components.json` has no configured registries, although `shadcn info` synthesized an `@shadcn` URL. This CLI/config mismatch remains unresolved and is not a reason to add a registry blindly.

## Proposed component contract

Selection rule: use a primitive where its built-in interaction, semantics, or state model removes custom behavior; keep existing routed navigation and domain-specific typed cards; add components by task rather than importing the catalog wholesale.

The full official catalog was dispositioned by category:

| Catalog category | Components considered | Selection rationale |
|---|---|---|
| Shell and route navigation | Breadcrumb, Navigation Menu, Menubar, Sidebar, Tabs, Pagination, Separator, Resizable, Scroll Area | Keep Link navigation; use Breadcrumb/Pagination/Scroll Area where the task requires them. Sidebar is one possible full-shell migration. Defer Navigation Menu, Menubar, and Resizable until a demonstrated interaction requires them; Tabs stay in-page. |
| Actions, disclosure, overlays | Button, Button Group, Dropdown Menu, Context Menu, Command, Popover, Hover Card, Tooltip, Collapsible, Accordion, Dialog, Alert Dialog, Sheet, Drawer | Use visible Button actions, Dropdown Menu for secondary actions, Command for search/selection, and Dialog/Sheet under the contracts below. Context Menu, Drawer, Hover Card, Button Group, Collapsible, and Accordion add no current task capability; adopt only with an explicit trigger. Alert Dialog is reserved for consequential destruction. |
| Fields and bounded workflows | Field, Label, Input, Input Group, Textarea, Native Select, Select, Combobox, Checkbox, Radio Group, Switch, Slider, Toggle, Toggle Group, Input OTP, Calendar, Date Picker, Questionnaire | Select controls by value and validation semantics. Use Questionnaire only for multi-step bounded input. Input OTP, Slider, Calendar, and Date Picker have no accepted Clara requirement yet; do not add them speculatively. |
| Data, content, and state | Table, Data Table, Card, Item, Badge, Alert, Empty, Skeleton, Spinner, Progress, Chart, Typography, Kbd, Aspect Ratio, Carousel | Use list/table/card/status components and Chart as described below. Progress is appropriate only when progress is measurable. Kbd, Aspect Ratio, and Carousel do not solve a current ticket-600 task; use existing typography tokens rather than adding a showcase layer. |
| Conversation and files | Avatar, Attachment, Message, Bubble, Message Scroller, Marker | Select this family for Clara transcript/file/citation behavior while retaining domain-specific typed cards and explicit accessibility. |
| Feedback and direction | Toast, Direction | Use the generated Base Toast for brief completion feedback. Direction is unnecessary until bidirectional layout is a product requirement. |

| Product task | Component contract | Status and boundary |
|---|---|---|
| Firm/client navigation | Keep the current Link navigation and mobile Sheet. Consider Sidebar only as one coherent shell refactor; use Breadcrumb for location where needed. | Sheet is installed; Sidebar and Breadcrumb are available but uninstalled. The accepted future groups are **Accounting**, **Work**, and **Reports**; current routes do not implement that information architecture. |
| Working-first client home | Card/Item for Needs you, running, and recently done; Badge for state; concise Table/list and Chart only for a defined financial series. | Card, Badge, Table are installed. Chart is available, uninstalled, and adds Recharts. Every metric needs source, period, currency/unit, and freshness; provide a readable table fallback. |
| Work list and detail | Table plus the Data Table composition for actual sorting/filtering; Input/Select, Dropdown Menu, Badge, Pagination, Empty, and Skeleton for list states. Use a routed page for durable detail; Sheet can hold supplemental mobile detail or filters. | Core table/filter primitives and Sheet are installed; Pagination, Empty, Skeleton are not. A Work route/domain contract must be added before UI composition. Data Table is a guide/composition, not a single registry primitive. |
| Needs you / requested input | Use Questionnaire for a bounded multi-step choice/freeform sequence. Use Field/FieldGroup and the appropriate Radio Group, Checkbox, Select/Combobox, or Textarea for a single persistent request. | Questionnaire and Field are available and dry-run-resolvable but uninstalled. Questionnaire owns local progress, navigation, and validation; the page/domain owns request identity/version, persistence, cancellation, transport, and branching. |
| Documents and uploads | Attachment represents a file and its idle/uploading/processing/error/done state in upload or chat contexts. Keep the PDF page/overlay viewer domain-specific and move persistent document detail toward the planned wider detail route. | Attachment is available and uninstalled. It does not replace document ingestion jobs, PDF rendering, or document metadata/detail. |
| Clara transcript | Message Scroller provider/viewport/content/item for anchoring, auto-scroll and jump-to-latest; Message + Avatar/Content/Bubble/Footer and MessageGroup for conversational rows; Attachment and Marker for files/citations. Keep typed question/result cards as domain siblings with explicit semantics. | All are in the official catalog and uninstalled. Migrate only after preserving reconnect/streaming, keyboard/log behavior, anchoring, focus, and narrow-panel tests; avoid nested live regions. |
| Menus and overlays | Dropdown Menu for secondary row actions; Dialog for focused forms/decisions; Sheet for supporting panels/filters. Keep the primary action visible. Use Alert Dialog only for a consequential destructive decision. | Dropdown Menu, Dialog, and Sheet are installed. Base UI triggers use `render`, not Radix `asChild`; every Dialog/Sheet needs an accessible title. |
| Empty, status, feedback | Empty for first-use/no-result states; Skeleton/Spinner for loading; inline Alert or field error for actionable failure; Toast for brief completed background feedback. | Empty, Skeleton, Spinner, Alert, and Toast are uninstalled. Base Toast has its own manager/Toaster API and must not be implemented from Sonner examples. Color cannot be the only status cue. |
| Preferences | Field/FieldGroup with Switch, Checkbox, Radio Group, Select, or Toggle Group according to value type; Tabs only for in-page settings panels. | Tabs/Select are installed; the rest are available and uninstalled. Preferences may tune display, notifications, or current-client behavior; do not introduce new approval gates that weaken the agreed agentic default. |

The accepted product inputs for the implementation contract are a working-first client home (Needs you, running, recently done, plus a concise financial summary) and navigation grouped as Accounting, Work execution, and Reports outputs. They are requirements for the future surface, not descriptions of the current route tree.

## Implementation verification still required

Before any add, run `pnpm dlx shadcn@latest add <component> --dry-run`, then `--view` or `--diff` one component at a time. Review all overwrites, normalize generated utility imports to the repo convention, and keep `globals.css` and font tokens intact. Validate the exact Base API from the app-aware generated code rather than copying Radix or MCP-listed Sonner examples. For shell/chat changes, verify desktop and narrow widths, keyboard focus/Escape, screen-reader names/log behavior, streamed-message anchoring, and reconnect behavior. For Chart, verify a concrete data contract before accepting Recharts. Resolve the empty-registry CLI search discrepancy before relying on search output; treat MCP inventory as discovery evidence, not the app installation contract.

## Primary references

- [shadcn component catalog](https://ui.shadcn.com/docs/components), [CLI](https://ui.shadcn.com/docs/cli), [Questionnaire](https://ui.shadcn.com/docs/components/base/questionnaire), [Message](https://ui.shadcn.com/docs/components/base/message), [Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller), [Attachment](https://ui.shadcn.com/docs/components/base/attachment) — accessed 2026-09-08.
- Local authority: `apps/web/components.json`, `apps/web/package.json`, `apps/web/app/globals.css`, route layouts/pages, `components/layout/*`, `components/clara/*`, `components/documents/*`, `components/needs-you/*`, and `components/settings/*` — read 2026-09-08.
- Product context: `docs/plan/active/refresh-2026-09-08-ux-research.md` and section 6 of `docs/plan/active/refresh-2026-09-08-product-spec.md`.
