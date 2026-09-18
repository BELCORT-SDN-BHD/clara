# shadcn registry → Clara surface mapping

Research for [#583](https://github.com/BELCORT-SDN-BHD/clara/issues/583) (map: [#573](https://github.com/BELCORT-SDN-BHD/clara/issues/573)). Read-only research; no product decision is made here — the map issue's open questions (dashboard aggregations, management-template content, etc.) stay open.

## Method and a load-bearing caveat about the MCP tools

Primary sources used, in order of trust:

1. **Direct registry fetch** — `curl https://ui.shadcn.com/r/styles/base-nova/<name>.json`, the exact URL template `apps/web/components.json`'s registries resolve to once `style: "base-nova"` is substituted in (confirmed via `npx shadcn@latest info --json -c apps/web`, run 2026-09-08). This is the ground truth for "does base-nova ship this item, and what does it import."
2. `mcp__shadcn__get_add_command_for_items` — confirmed correct and package-manager-aware (returns `pnpm dlx shadcn@latest add …`, matching this repo's `packageManager: pnpm@10.33.0`).
3. `mcp__shadcn__list_items_in_registries` / `view_items_in_registries` — used only to enumerate the catalog (names, `registry:ui` count). **Not trusted for base-nova compatibility or dependency data.**
4. Local repo source (`apps/web/components/ui/*.tsx`, `components.json`, `globals.css`, route tree) — read directly.
5. `gh release view` against `shadcn-ui/ui` and `mui/base-ui` for changelogs. WebFetch against `elements.ai-sdk.dev` and `registry.ai-sdk.dev` for AI Elements.

**The caveat:** `mcp__shadcn__view_items_in_registries` does **not** resolve this project's configured style. Called with `registries: ["@shadcn"]` against items this project renders through Base UI, it returned `"Dependencies: cn, radix-ui"` for `button`, `badge`, `dialog`, `sheet`, `dropdown-menu`, `tabs`, `accordion`, `alert-dialog`, `avatar`, `checkbox`, `select`, `switch`, `slider`, `tooltip`, `popover`, `separator`, `toggle`, `toggle-group`, `progress`, `scroll-area`, `menubar` and more — i.e. it defaulted to the classic Radix-based registry item, not `base-nova`. Fetching the same items directly from `https://ui.shadcn.com/r/styles/base-nova/<name>.json` shows every one of them importing from `@base-ui/react/*` with **zero** `radix-ui` in `dependencies`. Example, `button`:

```json
// mcp__shadcn__view_items_in_registries(["@shadcn/button"]) said:
"Dependencies: cn, radix-ui"

// curl https://ui.shadcn.com/r/styles/base-nova/button.json says:
"dependencies": ["cn"],
"files": [{ "content": "import { Button as ButtonPrimitive } from \"@base-ui/react/button\"\n..." }]
```
The MCP server most likely resolves against a default/new-york-v4 style because its own process cwd doesn't see `apps/web/components.json` (a monorepo-root problem — `npx shadcn@latest info` itself refuses to run from the repo root with `"error": "monorepo_root"` and needs `-c apps/web`). **Every base-nova/Base-UI claim below is sourced from the direct registry fetch, not the MCP's dependency listing.** `get_add_command_for_items` was still fine to use for the `add` command text itself, since that's just `pnpm dlx shadcn@latest add @shadcn/<name>[...]` regardless of style resolution — confirmed by testing it against `@shadcn/message`, `@shadcn/chart`, `@shadcn/sidebar`.

All 61 `registry:ui` items were fetched from `https://ui.shadcn.com/r/styles/base-nova/<name>.json`; **all 61 returned HTTP 200 with real `base-nova` file content** (script + raw output kept in this session's scratchpad, not committed). The one partial exception is `form` — see below.

---

## 1. Every `registry:ui` item in `@shadcn` today

`mcp__shadcn__list_items_in_registries({registries:["@shadcn"], limit:0})` returned 471 items across all types; **61** are `registry:ui`, matching the ticket's count exactly, including all 20 named items (`message`, `message-scroller`, `attachment`, `bubble`, `marker`, `field`, `empty`, `progress`, `input-otp`, `chart`, `carousel`, `drawer`, `menubar`, `sidebar`, `item`, `kbd`, `spinner`, `combobox`, `native-select`, `direction`, plus `button-group` and `input-group`).

"base-nova compat" = does `GET /r/styles/base-nova/<name>.json` return real file content. All say **yes** except `form`.

| item | one-line purpose | primitive / 3rd-party dep (base-nova) | base-nova compat | `add` command |
|---|---|---|---|---|
| accordion | Expand/collapse stacked panels, one-at-a-time or multi | `@base-ui/react/accordion` | Yes | `pnpm dlx shadcn@latest add @shadcn/accordion` |
| alert | Static inline callout (info/warning/destructive banner) | none (plain div + cva) | Yes | `pnpm dlx shadcn@latest add @shadcn/alert` |
| alert-dialog | Modal that blocks until an explicit confirm/cancel | `@base-ui/react/alert-dialog`; regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/alert-dialog` |
| aspect-ratio | Constrain a child to a W:H ratio | Base UI `AspectRatio` primitive (no name pinned in dep list, `cn` only) | Yes | `pnpm dlx shadcn@latest add @shadcn/aspect-ratio` |
| avatar | User/entity image with fallback | `@base-ui/react/avatar` | Yes | `pnpm dlx shadcn@latest add @shadcn/avatar` |
| badge | Small status/count pill | none — `@base-ui/react/merge-props` + `use-render` (`useRender`) pattern, cva | Yes | `pnpm dlx shadcn@latest add @shadcn/badge` |
| breadcrumb | Hierarchical path nav | none — `mergeProps`/`useRender` pattern | Yes | `pnpm dlx shadcn@latest add @shadcn/breadcrumb` |
| button | Primary action control | `@base-ui/react/button` | Yes | `pnpm dlx shadcn@latest add @shadcn/button` |
| button-group | Visually fuse adjacent buttons/inputs | none — `mergeProps`/`useRender`; regDep `separator` | Yes | `pnpm dlx shadcn@latest add @shadcn/button-group` |
| calendar | Date grid picker | `react-day-picker@latest`, `date-fns`; regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/calendar` |
| card | Bordered content surface (header/content/footer) | none | Yes | `pnpm dlx shadcn@latest add @shadcn/card` |
| carousel | Swipeable/paged item strip | `embla-carousel-react`; regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/carousel` |
| chart | Chart wrapper (theming + tooltip + legend) around a chart lib | **Recharts** `recharts@3.8.0`; regDep `card` | Yes | `pnpm dlx shadcn@latest add @shadcn/chart` |
| checkbox | Binary toggle, form-bindable | `@base-ui/react/checkbox` | Yes | `pnpm dlx shadcn@latest add @shadcn/checkbox` |
| collapsible | Bare show/hide primitive (no chrome) | `@base-ui/react/collapsible` | Yes | `pnpm dlx shadcn@latest add @shadcn/collapsible` |
| combobox | Searchable single/multi-select with a text filter | `@base-ui/react` (`Combobox`); regDep `button`, `input-group` | Yes | `pnpm dlx shadcn@latest add @shadcn/combobox` |
| command | ⌘K-style fuzzy command palette | `cmdk`; regDep `dialog`, `input-group` | Yes | `pnpm dlx shadcn@latest add @shadcn/command` |
| context-menu | Right-click menu | `@base-ui/react/context-menu` | Yes | `pnpm dlx shadcn@latest add @shadcn/context-menu` |
| dialog | Centered modal | `@base-ui/react/dialog`; regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/dialog` |
| drawer | Bottom/side sheet with swipe-to-dismiss | `@base-ui/react/drawer` (**not** `vaul` — see note) | Yes | `pnpm dlx shadcn@latest add @shadcn/drawer` |
| dropdown-menu | Trigger-anchored action menu | `@base-ui/react/menu` | Yes | `pnpm dlx shadcn@latest add @shadcn/dropdown-menu` |
| empty | Empty-state placeholder (icon/title/description/actions) | none | Yes | `pnpm dlx shadcn@latest add @shadcn/empty` |
| field | Form-field layout primitive: label + control + description/error, `FieldGroup`/`FieldSet`/`FieldLegend` | none; regDep `label`, `separator` | Yes | `pnpm dlx shadcn@latest add @shadcn/field` |
| form | React Hook Form + Zod binding layer over `field` | — | **No file for base-nova** (see below) | n/a |
| hover-card | Rich content on hover (preview card) | `@base-ui/react/preview-card` | Yes | `pnpm dlx shadcn@latest add @shadcn/hover-card` |
| input | Single-line text input | `@base-ui/react/input` | Yes | `pnpm dlx shadcn@latest add @shadcn/input` |
| input-group | Compose an input with leading/trailing addons/buttons/text | none; regDep `button`, `input`, `textarea` | Yes | `pnpm dlx shadcn@latest add @shadcn/input-group` |
| input-otp | Segmented one-time-passcode input | `input-otp` (Guilherme Rodz's lib) | Yes | `pnpm dlx shadcn@latest add @shadcn/input-otp` |
| item | Generic list-row primitive (icon/media + title/description + actions), the base under `sidebar`/lists | none — `mergeProps`/`useRender`; regDep `separator` | Yes | `pnpm dlx shadcn@latest add @shadcn/item` |
| label | Accessible `<label>` for a control | none | Yes | `pnpm dlx shadcn@latest add @shadcn/label` |
| menubar | App-menu-bar (File/Edit-style), keyboard-navigable | `@base-ui/react/menu` + `@base-ui/react/menubar`; regDep `dropdown-menu` | Yes | `pnpm dlx shadcn@latest add @shadcn/menubar` |
| navigation-menu | Top-nav with flyout panels | `@base-ui/react/navigation-menu` | Yes | `pnpm dlx shadcn@latest add @shadcn/navigation-menu` |
| pagination | Page-number/prev-next nav | none; regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/pagination` |
| popover | Click-triggered floating panel | `@base-ui/react/popover` | Yes | `pnpm dlx shadcn@latest add @shadcn/popover` |
| progress | Determinate progress bar | `@base-ui/react/progress` | Yes | `pnpm dlx shadcn@latest add @shadcn/progress` |
| radio-group | Single-select radio set | `@base-ui/react/radio` + `@base-ui/react/radio-group` | Yes | `pnpm dlx shadcn@latest add @shadcn/radio-group` |
| resizable | Drag-resizable split panes | `react-resizable-panels@^4` | Yes | `pnpm dlx shadcn@latest add @shadcn/resizable` |
| scroll-area | Custom-styled scroll container | `@base-ui/react/scroll-area` | Yes | `pnpm dlx shadcn@latest add @shadcn/scroll-area` |
| select | Listbox-style select (not a native `<select>`) | `@base-ui/react/select` | Yes | `pnpm dlx shadcn@latest add @shadcn/select` |
| separator | Visual/semantic divider line | `@base-ui/react/separator` | Yes | `pnpm dlx shadcn@latest add @shadcn/separator` |
| sheet | Edge-anchored modal panel | `@base-ui/react/dialog` (same primitive as `dialog`, different placement); regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/sheet` |
| sidebar | App-shell side nav (collapsible, resizable, mobile sheet) | none directly; regDep `button`,`input`,`separator`,`sheet`,`skeleton`,`tooltip`,`use-mobile` hook | Yes | `pnpm dlx shadcn@latest add @shadcn/sidebar` |
| skeleton | Loading placeholder block | none | Yes | `pnpm dlx shadcn@latest add @shadcn/skeleton` |
| slider | Draggable range/value control | `@base-ui/react/slider` | Yes | `pnpm dlx shadcn@latest add @shadcn/slider` |
| sonner | Toast notification host | **`sonner`**, `next-themes` | Yes | `pnpm dlx shadcn@latest add @shadcn/sonner` |
| spinner | Indeterminate loading icon | none (wraps an icon) | Yes | `pnpm dlx shadcn@latest add @shadcn/spinner` |
| switch | On/off toggle | `@base-ui/react/switch` | Yes | `pnpm dlx shadcn@latest add @shadcn/switch` |
| table | Semantic `<table>` primitives | none | Yes | `pnpm dlx shadcn@latest add @shadcn/table` |
| tabs | Tabbed panel switcher | `@base-ui/react/tabs` | Yes | `pnpm dlx shadcn@latest add @shadcn/tabs` |
| textarea | Multi-line text input | none (plain `<textarea>`) | Yes | `pnpm dlx shadcn@latest add @shadcn/textarea` |
| toggle | Single pressable on/off button | `@base-ui/react/toggle` | Yes | `pnpm dlx shadcn@latest add @shadcn/toggle` |
| toggle-group | Set of mutually-exclusive/multi toggle buttons | `@base-ui/react/toggle` + `@base-ui/react/toggle-group`; regDep `toggle` | Yes | `pnpm dlx shadcn@latest add @shadcn/toggle-group` |
| tooltip | Hover/focus label | `@base-ui/react/tooltip` | Yes | `pnpm dlx shadcn@latest add @shadcn/tooltip` |
| kbd | Styled `<kbd>` for keyboard shortcuts | none | Yes | `pnpm dlx shadcn@latest add @shadcn/kbd` |
| native-select | House wrapper around the real `<select>` element | none | Yes | `pnpm dlx shadcn@latest add @shadcn/native-select` |
| direction | RTL/LTR context provider (re-export) | `@base-ui/react/direction-provider` | Yes | `pnpm dlx shadcn@latest add @shadcn/direction` |
| attachment | File/media attachment chip with lifecycle states | none — `mergeProps`/`useRender`; regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/attachment` |
| bubble | Chat message bubble surface (fill + tail-less rounded block) | none — `mergeProps`/`useRender` | Yes | `pnpm dlx shadcn@latest add @shadcn/bubble` |
| marker | Inline system note / divider / label in a message stream | none — `mergeProps`/`useRender` | Yes | `pnpm dlx shadcn@latest add @shadcn/marker` |
| message | Chat message row layout (avatar + align start/end + group) | none | Yes | `pnpm dlx shadcn@latest add @shadcn/message` |
| message-scroller | Auto-following/anchored scroll container for a message list, with a jump-to-latest button | **`@shadcn/react`** (first-party runtime pkg, `message-scroller` export); regDep `button` | Yes | `pnpm dlx shadcn@latest add @shadcn/message-scroller` |

Sources for every "Yes/No" and dependency: `curl -s https://ui.shadcn.com/r/styles/base-nova/<name>.json` for all 61 names, run 2026-09-08. `form`:

```json
// GET https://ui.shadcn.com/r/styles/base-nova/form.json  →  200 OK, but:
{ "$schema": "https://ui.shadcn.com/schema/registry-item.json", "name": "form", "type": "registry:ui" }
```
No `files` key at all — the endpoint resolves (200, not 404) but ships zero source for `base-nova`. `form` is the react-hook-form + Zod resolver binding that only exists for the Radix-based styles; `pnpm dlx shadcn@latest add @shadcn/form` in this project would either no-op or error, not silently install a Radix-flavored file (the CLI is style-aware). **This is the one real base-nova gap in the registry.** It matters for the onboarding questionnaire (Q3): don't reach for `form`, compose `field` + native `<form>`/server actions or a Base-UI-friendly form lib instead (see §3).

`message-scroller`'s `@shadcn/react` dependency is a real, versioned first-party npm package (not a typo) — GitHub releases confirm `@shadcn/react@0.3.0` (2026-08-05) and `@shadcn/react@0.3.1` (2026-08-31, alongside `shadcn@4.19.1`) on `shadcn-ui/ui`. It ships the headless `MessageScroller.Provider/Root/Viewport/Content/Item/Button` primitives that `registry/base-nova/ui/message-scroller.tsx` re-exports styled (`useMessageScroller`, `useMessageScrollerScrollable`, `useMessageScrollerVisibility` hooks included). None of `recharts`, `embla-carousel-react`, `vaul`, `sonner`, `next-themes`, `input-otp`, `react-resizable-panels`, `react-day-picker`, `date-fns`, `@shadcn/react` are currently in `apps/web/package.json` (checked directly) — adopting `chart`, `carousel`, `sonner`, `input-otp`, `resizable`, `calendar`, or `message-scroller` each pulls a new runtime dependency. `drawer` does **not** need `vaul` in this project — base-nova's `drawer.tsx` imports `@base-ui/react/drawer` directly, unlike the Radix-style registry drawer which wraps `vaul`.

---

## 2. Clara surface → registry item mapping

Clara's target IA (per map issue #573 decisions) is mostly **not built yet** — `apps/web/app/(full)/` only has `clara/[threadId]` today; the v1 surfaces this replaces live under `apps/web/app/(firm)/clients/[clientId]/{bank,close,documents,journals,registers,reports,tax}/page.tsx`, each a thin server wrapper around a `*-workbench` client component. The mapping below is therefore prescriptive (what v2 should reach for), grounded against what v1 already hand-rolls where that exists.

| Surface | Registry items | Notes / current v1 evidence |
|---|---|---|
| **Work list + detail pane** (Linear-style, issue #579) | `sidebar` (left nav shell), `item` (list rows — `ItemGroup role="list"`, `ItemSeparator`), `resizable` (list/detail split), `scroll-area`, `badge` (status), `kbd` (⌘K hints), `command` (jump-to / quick actions) | No v1 equivalent exists; this is new IA. `item`'s `ItemGroup` already renders `role="list"` — reuse for the Work list rows rather than a bespoke `<ul>`. |
| **Document detail** (per-kind, issue #579/#580 adjacent) | `sheet` or `drawer` for the panel shell (already CLI-vendored: `apps/web/components/ui/sheet.tsx`), `menubar` or `dropdown-menu` for the kind-specific action menu, `field` for metadata display, `tabs` (already vendored, `components/ui/tabs.tsx`) for kind sub-views, `progress` for pipeline stage (`attachment`'s own `state` prop — `idle\|uploading\|processing\|error\|done` — already models a 5-stage pipeline better than a bare `Progress` bar for a single document's ingest state) | `apps/web/app/(firm)/clients/[clientId]/documents/page.tsx` exists today; check its workbench component before building the v2 detail pane to see what already renders. |
| **Journals** | `table` (hand-written, has an a11y fix — see §5), `combobox` (account/counterparty picker — replaces a plain `select` for a searchable, larger list), `field` (compose-JE form layout), `alert-dialog` (posted-entry reversal confirmation — "reverse-not-delete" per `journals/page.tsx`'s own comment) | `apps/web/app/(firm)/clients/[clientId]/journals/page.tsx:1` → `JournalsWorkbench`; comment cites "law 6: reverse-not-delete — there is no delete verb", which is exactly `alert-dialog`'s job (a blocking confirm before an irreversible-looking action). |
| **Registers** | `table` via `components/common/data-table-card.tsx` (already the house pattern — Card + Table + `enter-content` motion class), `combobox`/`native-select` for filters | `data-table-card.tsx:12-16` documents this was extracted from 6 hand-rolled tables; new register views should use it, not a bespoke `<table>`. |
| **Bank matching** | `table`, `checkbox` (row select for multi-line match), `toggle-group` (match-mode switch: e.g. 1:1 / split / suggest) | `apps/web/app/(firm)/clients/[clientId]/bank/page.tsx` exists; check its workbench for the current match-selection UI before assuming `checkbox` isn't already there in some form. |
| **Close** | `progress` (checklist completion), `alert` (blocking-item callouts), `checkbox` (per-item done state), `item` (the checklist rows themselves — title + description + trailing checkbox/badge, which is exactly `Item`'s shape) | `apps/web/app/(firm)/clients/[clientId]/close/page.tsx` exists. |
| **Reports** | `chart` (Recharts wrapper — see §4), `card` (report tiles/sections), `empty` (no-data / "management template not yet decided" states — map issue lists this as unresolved) | `apps/web/components/firm/firm-home/firm-home-board.tsx:37` already has a comment: *"`--chart-1…5` existing in the token file is not a licence to invent one"* — i.e. the team has already decided not to render charts without a real DB-owned aggregation. `chart` is ready to adopt the moment that data exists; it is not blocked on UI. |
| **Onboarding questionnaire** (issue #580) | `field` (`FieldSet`/`FieldLegend`/`Field`/`FieldGroup`), `radio-group`, `checkbox`, `select` or `combobox`, `input-otp` (only if a verification-code step is ever needed — MYR/SST onboarding has no obvious use today), `progress` (multi-step indicator) | v1 already has a hand-rolled precursor: `apps/web/components/clara/OnboardingBeginCard.tsx`, `OnboardingChecklistCard.tsx`, `OnboardingItemRow.tsx`, `InterviewRunCard.tsx`. See §3 for the composition proposal — none of these registry items include a "questionnaire" item because there isn't one. |
| **Chat rail** (issue #579, "inline thread") | `message` (row+align), `message-scroller` (autoscroll/anchor/jump-to-latest), `attachment` (file chips with lifecycle state), `bubble` (message surface), `marker` (system notes/dividers), `spinner` (tool-call in-flight), `kbd` (composer shortcuts) | v1's chat rail is **entirely hand-rolled**: `apps/web/components/clara/ClaraMessageBubble.tsx`, `ClaraRail.tsx`, `ClaraThreadView.tsx`, `PartRenderer.tsx`/`PartSlot.tsx`, `ComposerAttachmentControl.tsx`. No `ScrollArea`/`use-stick-to-bottom`/any scroll-anchor library was found anywhere under `components/clara` or `components/parts` (grep, zero hits) — `message-scroller` is a straight capability upgrade, not a like-for-like swap. See §2b for the AI Elements comparison before committing to this set. |
| **Notifications** | `sonner` (toast host + `next-themes`) | Not installed; `sonner` is the shadcn skill's own stated rule for Base UI projects ("Toast follows the project base... Use `toast` from the `toast` component for Base UI projects" — but the registry list above has no separate `toast` item; the shadcn skill's own table also lists `sonner` under Base UI feedback, so treat that skill-doc line as the aspirational rule and `sonner` as what the registry actually ships for both bases today). |
| **States** (empty/skeleton/spinner) | `empty`, `skeleton`, `spinner` | None of the 15 current `components/ui/*.tsx` files implement these; genuinely new adoption, no migration risk. |

### 2b. AI Elements vs shadcn's native chat primitives

Fetched `elements.ai-sdk.dev` (redirects from `ai-sdk.dev/elements/overview`) and the underlying registry at `registry.ai-sdk.dev/<name>.json` directly.

- AI Elements ships `Message`/`MessageContent`/`MessageAvatar` (registry type `registry:component`, not `registry:ui`) as **hand-rolled `<div>`s**, not built on shadcn's new `message`/`bubble` primitives — confirmed by reading `registry.ai-sdk.dev/message.json`: it imports `Button`, `ButtonGroup`, `Tooltip` from `@/components/ui/*`, `Streamdown` for markdown rendering, and `UIMessage`/`FileUIPart` types straight from the `ai` package. It is typed against `useChat`'s message shape; shadcn's own `message`/`bubble` are pure presentation with no `ai`-package dependency.
- AI Elements' `Conversation` (the scroll container) depends on `use-stick-to-bottom` (a third-party npm lib), **not** `@shadcn/react`'s `message-scroller`. Same job — stick-to-bottom autoscroll + a jump button — two different implementations, neither aware of the other.
- AI Elements has **no standalone `attachment`/`attachments` component** — both names 404 against its registry. File-attachment display lives inline inside `Message` (a `PaperclipIcon` chip) and inside `PromptInput` (composer-side). shadcn's own `attachment` (idle/uploading/processing/error/done states, media+content layout) is the more complete, dedicated primitive for this.
- Compatibility risk: AI Elements' `reasoning.tsx` (`registry.ai-sdk.dev/reasoning.json`) depends directly on `@radix-ui/react-use-controllable-state` — a raw Radix package import, not mediated through shadcn's own `collapsible`. In a base-nova (Base UI) project this either needs `@radix-ui/react-use-controllable-state` installed as a stray dependency or a patch to swap it for Base UI's own controllable-state hook. Not fatal, but not a clean drop-in either. `prompt-input.tsx`'s registry deps (`button`, `command`, `dropdown-menu`, `hover-card`, `input-group`, `select`) are all base-nova-clean.

**Recommendation:** prefer shadcn's own `message` / `bubble` / `marker` / `attachment` / `message-scroller` for the base chat-rail chrome — they're first-party to the same base-nova style pipeline this project already vendors `dropdown-menu`/`sheet`/`tabs` from, with no stray Radix import risk. Reach into AI Elements selectively, only for the richer pieces shadcn's own registry doesn't have an equivalent for — `Reasoning`/`ChainOfThought` (model step-by-step display), `Tool` (function-call status with expandable args/result, registry deps `badge`, `collapsible`, plus its own `code-block`), `Sources`/`InlineCitation`, `PromptInput` (composer with model-picker/attach affordances) — and audit each import for the stray-Radix issue above before adopting.

---

## 3. What should "questionnaire" be composed from

No registry item is named `questionnaire` — searched `list_items_in_registries`/`search_items_in_registries` for "questionnaire", "survey", "wizard", "stepper": zero matches in `@shadcn`. Compose it from `field` + choice controls + `progress`, following the exact pattern shadcn's own `field-choice-card`/`field-radio`/`field-group` examples already demonstrate (fetchable via `get_item_examples_from_registries`), adapted to Clara's "typed questionnaire card" shape from issue #580 (LLM-driven interview whose answers write canonical facts).

v1 precursor to build from, not around: `apps/web/components/clara/OnboardingBeginCard.tsx`, `OnboardingChecklistCard.tsx`, `OnboardingItemRow.tsx`, `InterviewRunCard.tsx` already implement a hand-rolled card-based interview flow inside the chat rail. The v2 questionnaire is this pattern's typed-parts evolution, not a green-field build.

Composition:

```tsx
// components/clara/parts/QuestionnaireCard.tsx — sketch only, not implemented here.
import {
  FieldSet, FieldLegend, FieldGroup, Field, FieldLabel, FieldDescription, FieldError,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"; // not yet vendored
import { Checkbox } from "@/components/ui/checkbox";                      // not yet vendored
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";                      // not yet vendored
import { Button } from "@/components/ui/button";
import { Bubble } from "@/components/ui/bubble";                          // chat-surface wrapper

// One typed questionnaire "part" (a UIMessage part kind, per the map issue's
// chat-parts decision), rendered inline in the thread like any other part.
type QuestionnaireField =
  | { kind: "single-select"; id: string; label: string; options: { value: string; label: string }[] }
  | { kind: "multi-select";  id: string; label: string; options: { value: string; label: string }[] }
  | { kind: "choice";        id: string; label: string; options: { value: string; label: string; description?: string }[] };

function QuestionnaireCard({
  title, fields, step, totalSteps, onSubmit,
}: {
  title: string;
  fields: QuestionnaireField[];
  step: number;
  totalSteps: number;
  onSubmit: (answers: Record<string, string | string[]>) => void;
}) {
  return (
    <Bubble variant="secondary" className="max-w-full">
      <FieldSet>
        <FieldLegend>{title}</FieldLegend>
        <Progress value={(step / totalSteps) * 100} aria-label={`Step ${step} of ${totalSteps}`} />
        <FieldGroup>
          {fields.map((f) => (
            <Field key={f.id} data-invalid={undefined}>
              <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
              {f.kind === "single-select" && (
                <RadioGroup id={f.id} name={f.id}>
                  {f.options.map((o) => (
                    <div key={o.value} className="flex items-center gap-2">
                      <RadioGroupItem value={o.value} id={`${f.id}-${o.value}`} />
                      <FieldLabel htmlFor={`${f.id}-${o.value}`}>{o.label}</FieldLabel>
                    </div>
                  ))}
                </RadioGroup>
              )}
              {f.kind === "multi-select" && f.options.map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <Checkbox id={`${f.id}-${o.value}`} name={f.id} value={o.value} />
                  <FieldLabel htmlFor={`${f.id}-${o.value}`}>{o.label}</FieldLabel>
                </div>
              ))}
              {f.kind === "choice" && (
                <Select name={f.id}>
                  <SelectTrigger id={f.id}><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      <Button type="submit" size="sm">Continue</Button>
    </Bubble>
  );
}
```

Why not `form`: base-nova ships no file for it (§1) — it's the react-hook-form + Zod resolver binding, Radix-styles-only. `field` alone (label/control/description/error layout, `data-invalid`/`aria-invalid` wiring per the shadcn skill's own forms rule) plus a plain controlled-component submit handler is base-nova-native and sufficient for a typed-answer questionnaire card whose state is "the LLM's running fact draft," not a classic client-side form with Zod validation. If client-side schema validation on answers is wanted later, reach for `zod` directly against the answer object on submit rather than pulling in `react-hook-form` + the missing `form` binding.

`input-otp` is in the registry but has no obvious Clara use today (no verification-code step in the decided onboarding flow) — leave unmapped, and pointed out only because the ticket explicitly names it.

---

## 4. `chart`: library, token consumption, dataviz fit

**Library:** Recharts, pinned `recharts@3.8.0` in `base-nova/chart.json`'s `dependencies`. Not installed in `apps/web/package.json` today (checked directly) — adopting `chart` is a new ~dependency, not already-paid-for.

**Token consumption mechanism** (read from the full fetched `chart.tsx`, `apps/web/../scratchpad/chart-base-nova.tsx`):
- `ChartContainer` takes a `config: ChartConfig` where each series key maps to `{ label, icon, color }` (or a per-theme `{ light, dark }` pair).
- `ChartStyle` (an inline child) walks `config`, and for every key with a `color`/`theme` entry emits a literal `<style>` tag: `` [data-chart=<id>] { --color-<key>: <value>; } `` scoped to that specific chart instance's `data-chart` attribute — i.e. it does **not** read `--chart-1..5` directly; the *config* passed by the call site decides what CSS value backs `--color-<key>`, and that value is typically written as `"var(--chart-1)"` etc. by the caller. The token only enters the picture if the call site's `ChartConfig` says so.
- The dark/light split is baked in (`THEMES = { light: "", dark: ".dark" }`), but `apps/web/AGENTS.md`'s house rule is light-theme-only, no `dark:` (already enforced by hand edits stripping `dark:` from `dropdown-menu.tsx` and `tabs.tsx` — see §5) — so a Clara adoption of `chart` should ignore/strip the `.dark` branch the same way those two files did, rather than carrying dead dark-mode CSS.

**Current token state** (`apps/web/app/globals.css:322-326`, read directly):
```css
/* Ordered categorical palette; labels remain mandatory. */
--chart-1: var(--brand-accent);
--chart-2: var(--clara);
--chart-3: var(--warning);
--chart-4: var(--success);
--chart-5: var(--error);
```
Confirmed unused beyond this declaration and the one exposed CSS-variable mapping (`--color-chart-1..5: var(--chart-1..5)` at `globals.css:81-85`) — a repo-wide grep for `chart-1`/`chart-2`/…/`ChartContainer`/`recharts` outside `globals.css` returns exactly one hit, a comment in `apps/web/components/firm/firm-home/firm-home-board.tsx:37`: *"`--chart-1…5` existing in the token file is not a licence to invent one."* This matches the map issue's own "Not yet specified" list: *"Dashboard 需要哪些 DB-owned 聚合（chart 要有数据来源；今天一个都没有）"* — the team has already, deliberately, held off on wiring any chart until a real aggregation exists. `chart`'s adoption is therefore blocked on data, not on this research.

**Dataviz fit — categorical vs sequential:** the token comment ("Ordered categorical palette; labels remain mandatory") already states the intended use correctly for a **categorical** encoding (distinct report line-items, account categories, etc.) — up to 5 named series, each getting a fixed hue, with the caveat that color can't be the only differentiator (a legend / direct label is required, which is a real accessibility constraint worth keeping). The five values chosen are **semantic-status colors reused as chart hues** (`--warning`, `--success`, `--error`, plus `--brand-accent`/`--clara`) — fine for a genuinely categorical series set with no status meaning (e.g. "revenue by service line"), but a real hazard the moment a chart's categories *could* be read as good/bad (e.g. a variance chart, an aging bucket chart) — a viewer will read the red slice as "the bad one" whether or not that's the intended semantics. For **sequential** data (a single metric across an ordered scale — e.g. AR aging buckets 0-30/31-60/61-90/90+, or a heatmap of close-task staleness) these 5 discrete hand-picked hues are the wrong tool entirely; that needs one hue ramped by lightness/saturation, which none of the current 5 chart tokens are designed to do — a sequential ramp would need new tokens, not a reuse of `--chart-1..5`. Recommendation when `chart` is actually adopted: keep `--chart-1..5` for true categorical series, add a dedicated sequential ramp (e.g. `--chart-seq-1..N` off a single hue) before building any aging/heatmap/staleness visualization, and never let `--warning`/`--error` back a chart series whose categories aren't actually good/bad.

---

## 5. Which hand-written `components/ui` files should be replaced by CLI-vendored base-nova output

`apps/web/components/ui/` has **15** files. Per the ticket's framing, `dropdown-menu.tsx`, `sheet.tsx`, `tabs.tsx` (3) are CLI-vendored; the remaining **12** — `badge`, `button`, `card`, `command`, `dialog`, `input-group`, `input`, `label`, `select`, `separator`, `table`, `textarea` — are hand-written (the ticket text says "11"; the directory actually has 12 hand-written files including `table.tsx`, which the ticket's own list omits — confirmed by `ls apps/web/components/ui`, 15 entries total, 3 carry an explicit "PROVENANCE — vendored" header comment and 12 don't).

Call-site counts (`grep -rl 'components/ui/<name>"' apps/web/app apps/web/components`, files, not occurrences):

| file | call sites | verdict | why |
|---|---|---|---|
| `button.tsx` | 105 | **Do not blind-replace** | Carries owner-ruled, cited customizations a plain `add --overwrite` would erase: an explicit `transition-[color,background-color,…]` property list (P3 motion polish, replacing the CLI's `transition-all`) tied to a `motion-fast` token; a `ring-offset-2 ring-offset-background` addition over the CLI's plain ring, ruled by "mohe-grill-rulings-2026-08-30.md 裁-64③" to fix a real contrast collision (ring color == primary fill color); a rewritten `destructive` variant with the override ring removed, ruled by R3/裁-1 ("ALL focus indicators unify on the shadcn ring"). The base-nova registry's `button.tsx` has none of this — it uses plain `transition-all` and a 50%-alpha ring with no offset. |
| `badge.tsx` | 40 | **Do not blind-replace** | Same `transition-all`→explicit-property/`motion-fast` treatment as `button.tsx`, same file-level comment pointing at it. |
| `card.tsx` | 34 | **Safe to re-vendor / low risk** | No comment-documented deviation found in the file; local version differs from base-nova's mainly in a `size="sm"` variant and a `ring-1 ring-foreground/10` treatment. Diff before overwriting, but this one carries no owner-ruling citations. |
| `dialog.tsx` | 21 | **Do not blind-replace** | The most heavily customized file found: i18n (`next-intl` `Common.close`, replacing a hardcoded English string), and "H-30 — THE HEIGHT CEILING" — a documented, tested fix (`scrollBody` prop + `DialogBody`) for a real bug where a tall dialog overflows both the top and bottom of the viewport simultaneously because the popup is `fixed ... -translate-y-1/2` with no scrolling ancestor. Base-nova's stock `dialog.tsx` has neither the i18n hook nor the height-ceiling fix. |
| `select.tsx` | 2 | **Do not blind-replace without diff** | House-specific class tuning throughout (contrast-tuned tokens, `min-w-36`, `alignItemWithTrigger` defaulted `true`); low call-site count makes a careful diff cheap regardless. |
| `separator.tsx` | 0 (unused directly; consumed by other `ui/*` files) | **Safe to re-vendor** | 8-line file, essentially identical to base-nova's version already (both just re-style `@base-ui/react/separator`). |
| `table.tsx` | 35 | **Do not replace — deliberate, tested a11y fix** | The file's own docstring: *"PROVENANCE — a DELIBERATE deviation from the shadcn CLI output, recorded here because the next `shadcn add table` would otherwise quietly undo it."* The CLI ships the scroll container as a bare non-focusable `<div>`; this file adds `tabIndex={0}` plus a conditional `role="region"` + accessible name, fixing an axe `scrollable-region-focusable` (SERIOUS) violation on every read-only table in the product. A regression test (`table-scroll-region.test.tsx`) already guards this. **Never run `add table --overwrite` here.** |
| `textarea.tsx` | 37 | **Safe to re-vendor** | Plain, no documented deviation; near-identical to base-nova's stock file. |
| `input.tsx` | 60 | **Safe to re-vendor** | Plain, no documented deviation; matches base-nova's stock shape (`@base-ui/react/input`, one class string). |
| `label.tsx` | 49 | **Safe to re-vendor** | Plain, no documented deviation. |
| `input-group.tsx` | 1 (direct; also consumed inside `command.tsx`) | **Diff before replacing** | Substantial custom class logic (block-start/block-end padding variants, `in-data-[slot=combobox-content]` focus-ring suppression) — looks intentional but carries no citation comment; treat as "diff, don't blind-overwrite" rather than "definitely safe." |
| `command.tsx` | 1 | **Do not blind-replace** | Carries a long, cited P6-3/裁-2 contrast-fix comment on `CommandInput`'s wrapper (`border-input` vs `border-input/30`, measured contrast ratios, and an explicit note that the fix is only verifiable in a browser test because Tailwind's `/30` resolves via `color-mix()`) plus an `e2e/a11y-finish-walk.spec.ts` regression guard cited by name. |

Files that **are** CLI-vendored (`dropdown-menu.tsx`, `sheet.tsx`, `tabs.tsx`) are not pristine either — each carries its own small, documented hand-edit on top of a real `shadcn add` (verified: each file's header cites the literal CLI invocation, e.g. `node node_modules/shadcn/dist/index.js add sheet`, and `git diff package.json pnpm-lock.yaml` was empty after each add). The edits: strip `dark:` classes (house rule: light-theme-only), route the dismiss control's "Close" string through `next-intl`, and in `tabs.tsx`'s case recut the focus ring from the CLI's `ring-ring/50` to the house's `ring-ring/70` (WCAG 2.2 SC 1.4.11 floor, per ruling "裁-1"). **The lesson generalizes: nothing in this file tree should be `add --overwrite`d without a diff, including the ones already "vendored."** The house's own vendoring discipline (documented per-file, one hand-edit list, checked `git diff` on lockfiles) is the right process to repeat for `card`/`separator`/`textarea`/`input`/`label`, and the wrong one to skip for `button`/`badge`/`dialog`/`table`/`command`/`select`/`input-group`.

---

## 6. Upgrade notes

### shadcn CLI 4.19.0 → 4.21.0 (installed: 4.19.0; latest: 4.21.0)

Releases (`gh release view shadcn@<ver> -R shadcn-ui/ui`), in order:

| version | date | change |
|---|---|---|
| 4.19.1 | 2026-08-31 | Patch only — package metadata (website URL). No functional change. |
| 4.20.0 | 2026-09-02 | **New opt-in command**: `npx shadcn migrate cn` — replaces `clsx` + `tailwind-merge` (+ `cnfast`) with a new `cn` package, Tailwind v4 projects only. |
| 4.20.1 | 2026-09-02 | Patch to `migrate cn` (preserves leading comments in the migrated file). |
| 4.21.0 | 2026-09-04 | **Breaking for future `add`s in this project**: `shadcn init` now installs the `cn` package and generates `export { cn } from "cn"` in `lib/utils`; *"Registry components now import `cn` from the `cn` package."* Confirmed directly — every `base-nova` file fetched in this research (`button.tsx`, `badge.tsx`, `dialog.tsx`, `chart.tsx`, all 61) imports `import { cn } from "cn"`, not `from "@/lib/utils"`. |

**Concrete risk:** `apps/web/lib/utils.ts` still defines `cn` the old way (`clsx` + `tailwind-merge`, checked directly) — the `cn` package is **not** in `apps/web/package.json`. The CLI's alias-rewriting normally repoints a registry file's `@/lib/utils` import to the project's real utils path, but since 4.21 the registry source itself imports the literal `cn` package rather than an aliased utils path — untested here whether the installed 4.19.0 CLI (which predates this change) or a future `shadcn@latest` invocation (which would pick up 4.21) rewrites that import back to `@/lib/utils`, or installs `cn` as a new dependency, or leaves a dangling import. **Before any future `shadcn add`, run it with `--dry-run` first** and check whether the emitted file imports `cn` from the package or from `@/lib/utils`; if the former and the project doesn't want the new `cn` package, the import needs a manual fix after every add, or the project should deliberately run `migrate cn` first to adopt the new package everywhere at once (out of scope for this research — a product/build decision, not a research one).

No other breaking changes surfaced in the 4.19→4.21 diff (no removed items, no renamed commands beyond the new `migrate` subcommand).

### `@base-ui/react` 1.7.0 → 1.8.0 (installed: 1.7.0, per `apps/web/package.json`; latest: 1.8.0, `mui/base-ui` GitHub releases)

`gh release view v1.8.0 -R mui/base-ui` is a large cross-component bugfix release (contributor list: atomiks, michaldudak, and others), no breaking-change section. Relevant to Clara's actually-used or actually-proposed primitives:

- **Dialog / Alert Dialog / Popover**: "Ignore outside clicks from presses that began before open" — fixes a real class of bug (a press that opens a popover incorrectly also registering as the outside-click that closes it). Directly relevant to `dialog.tsx`'s and any future `popover`/`combobox` adoption.
- **Field**: multiple fixes — custom validity ownership/validation lifecycle, controlled-value sync, stale/duplicated control IDs, "validate once on Enter inside a Form," neutral validity while async validation is in flight. All relevant to the proposed questionnaire composition in §3, which leans on `field`.
- **Select / Combobox / Autocomplete**: "Anchor multiple selection to the first selected item with a linear lookup," "Allow opening and browsing the popup while `readOnly`," "Hide group labels and scrollbars from the accessibility tree," "Fix record item label lookup reading from `Object.prototype`." Relevant to `combobox` (Journals account picker, §2) and any future `select` work.
- **Tabs**: "Prevent update loops from unstable refs," "Consider 3D transforms when positioning the indicator" — directly touches the already-vendored `components/ui/tabs.tsx`.
- **Drawer**: three swipe/dismissal fixes — relevant if `drawer` is adopted for Document detail (§2).
- **Menu / Menubar**: "Play the enter transition for an initially open submenu," "Fix menubar accessibility tree to satisfy `aria-required-children`" — relevant to `dropdown-menu.tsx` (vendored) and any future `menubar` adoption.
- **Toast**: "Allow functional toast updates derived from the current toast" — relevant if the project ever adopts Base UI's own `toast` component (the shadcn skill's stated rule for Base UI projects) rather than `sonner`; today the registry only ships `sonner`, no separate `toast` item.

No API removals or renames spotted in the 1.7→1.8 changelog. This reads as a safe minor-version bump; the honest caveat is that this changelog is the whole `base-ui` monorepo's release, not a diff scoped to only the primitives Clara uses, so treat "no breaking changes found" as "none found in the parts skimmed," not an exhaustive audit of all ~40 components' behavior.

---

## Appendix: raw data

The full base-nova registry fetch (all 61 items' `dependencies`, `registryDependencies`, file paths, and first-import-lines) was captured to a local script/JSON in this session's scratchpad during research and is not committed here; every fact pulled from it is quoted or tabulated above. Re-run if needed: `curl -s https://ui.shadcn.com/r/styles/base-nova/<name>.json` per item name from §1's table, or the full list in one line:

```
accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button button-group calendar card
carousel chart checkbox collapsible combobox command context-menu dialog drawer dropdown-menu empty
field form hover-card input input-group input-otp item label menubar navigation-menu pagination popover
progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner spinner
switch table tabs textarea toggle toggle-group tooltip kbd native-select direction attachment bubble
marker message message-scroller
```
