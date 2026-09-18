# Clara client visual comparison

Throwaway, human-in-the-loop UI prototype for comparing three structures for the Clara client home, Work detail, Documents review, and a journal table. Every name, amount, date, status, and document is synthetic. The prototype does not call Clara APIs, Supabase, or a model, and it keeps interaction state only in browser memory.

## Run

From this isolated worktree:

```powershell
pnpm --filter @clara/web prototype:clara-visual
```

Open `http://127.0.0.1:8767/money-input-harness/clara-visual?variant=A`. Change the query to `A`, `B`, or `C`, or use the fixed prototype control. The A, B, and C buttons are ordinary keyboard-focusable controls; the page does not reserve global arrow keys.

The command opts into the repository's local harness and starts Next in development mode on loopback. The page and its pre-auth proxy pass-through both require development mode and the explicit harness flag; the page returns 404 in production. The runner uses webpack to keep this throwaway route independent of the production build path.

## What differs

- **A — selected continuous grid:** work-first overview in one bordered field, thin separators, a restrained translucent sticky scope header, a prominent dynamic needs-you count, four accounting metrics, three sourced charts, measured month-close readiness, and recent journals. Its Work surface uses B's master/detail workroom.
- **B — workroom:** calm solid surfaces with a dense master/detail layout. Work, document queue, and accounting views keep selection beside the active detail.
- **C — briefing:** a concise work briefing with one prominent current action and expandable business details below it.

The variants share one synthetic fixture: 青禾贸易有限公司, August 2026, MYR; four Work items; an in-progress three-document batch; completed equipment acquisition with depreciation still waiting; one close task; a Maju Industrial source document with identified information; a balanced two-line purchase-cost/AP suggestion; six months of labeled income, expense, and continuous-ledger cash balances; and due-date buckets whose AR and AP amounts tie to the headline balances.

Shared interactions demonstrate that a question stays with its Work item, an answer advances that same item and updates the needs-you count, selecting a home row opens its Work detail, Work tabs expose results, sources, and activity without losing the pending question, a new Clara conversation leaves Work state intact, and narrow navigation and Clara context use focus-managed, Escape-dismissible sheets. Reloading resets all state.

## Component seam

The comparison uses the repository's existing Button, Card, DropdownMenu, Input, Select, Separator, Sheet, Table, and Tabs. This revision adds the shadcn Base UI Breadcrumb, Chart, Collapsible, Sidebar, Skeleton, and Tooltip files plus Recharts 3.8.0. Each component was dry-run and reviewed individually; existing shared components were not overwritten. The generated Sidebar was bounded to memory-only state and an unmounted closed mobile Sheet for this local prototype.

The Clara rail also exercises six shadcn AI component files: Attachment, Bubble, Marker, Message, MessageScroller, and Questionnaire. It uses `ai` 7.0.93, `@ai-sdk/react` 4.0.96, `@shadcn/helpers` 0.2.0, and `@shadcn/react` 0.3.1. A local `createChat` fixture emits bounded synthetic message deltas in memory, including a stoppable response and a structured supplier question. It has no API endpoint, model call, hosted data, or persistence. Confirming the known entity updates the shared Work state; choosing “暂时无法确认” leaves the Work question pending.

Drawer, Empty, Menubar, Spinner, Toast, and unrelated primitives are not installed for this comparison. No flow here needs a drawer distinct from the existing focus-managed Sheets, a product-wide menu bar, an indefinite spinner, or a toast that could hide Work-question state.

## Scope limits

This is an interaction and visual comparison, not a production implementation or accounting authority. Home, Work, Documents, and the journal view are the only active surfaces. Other accepted navigation labels remain visible for information architecture context but are disabled. Upload, journal creation, search, and message sending are also disabled because the prototype has no backend. Amounts and accounting states are illustrative and do not represent a real client.

The native chat's complete screen-reader transcript and announcement contract was not verified here. A production adapter must keep the transcript log distinct from independent live status and structured-card announcements, then verify that behavior with assistive technology; use of native primitives alone does not establish that acceptance.

The final bounded review adds an explicit wide-dock close action, preserves that dock's in-memory transcript when hidden, and returns focus to its opener. Narrow Sheet closure and wide/narrow layout changes can still remount this synthetic chat; production conversation persistence must be independent of those components. Status messages are intentionally static here: Shimmer is not installed. Full native browser zoom, text-only scaling and screen-reader listening remain production acceptance.

## Manual verification

Checked in an isolated headless Chromium instance against the running loopback server:

- The selected A route returned HTTP 200 at 1440 × 1000 and 390 × 844 with three rendered Recharts SVGs and no page or console errors.
- A narrow pass opened and dismissed the native client Sidebar and Clara Sheet, then changed variants without an invisible overlay blocking input; the page had no horizontal overflow.
- A's needs-you action opened the Work surface; answering Q-UP-002 changed WORK-2409 to processing and reduced the count from two to one. The month-close readiness action opened WORK-2412.
- Native Work tabs preserve the active Work and question while switching among results, sources, and activity.
- The native Clara flow streamed the identity question, synchronized its structured answer into the same Work, and kept that answer visible in 工作依据 after starting a new chat. The “暂时无法确认” path retained the pending Work.
- `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed.

Closing review also verified cross-surface entry focus, same-page Work selection semantics, manual keyboard Tabs activation, stopping a reply without cancelling Work, wide-dock close/reopen with the same transcript, and keyboard jump-to-latest. With reduced motion enabled, the latest-message control has no CSS transition; normal motion uses the existing panel token. Reflow checks at 320, 390 and 720 CSS pixels showed no page-wide horizontal overflow; 720 × 500 is a reflow probe, not native browser-zoom evidence. Focused ESLint and TypeScript passed after the TSX changes. The selected A dashboard + B Work decision can now be carried into spec; all production journeys and integration checks remain assigned to implementation.

## Captures

| Variant | Desktop | Narrow |
|---|---|---|
| A | [variant-A-desktop.png](variant-A-desktop.png) | [variant-A-narrow.png](variant-A-narrow.png) |
| B (earlier comparison capture; current route uses the shared native shell) | [variant-B-desktop.png](variant-B-desktop.png) | [variant-B-narrow.png](variant-B-narrow.png) |
| C (earlier comparison capture; current route uses the shared native shell) | [variant-C-desktop.png](variant-C-desktop.png) | [variant-C-narrow.png](variant-C-narrow.png) |
