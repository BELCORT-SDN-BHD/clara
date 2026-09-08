# Clara visual and interaction decision

Date: 2026-09-08. Decision/prototype evidence for [比较并确定 Clara 页面的视觉、响应式和动效方案](https://github.com/BELCORT-SDN-BHD/clara/issues/609), not a production frontend delivery.

Resolved in the [visual decision record](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5587677017). The retained prototype is `codex/prototype-clara-visual` at `8f72de0dd39fca702eb0c9cacd8fab5de8982223`, under `C:/Users/zhant/Desktop/clara-rebuild-prototype-clara-visual`; it is committed locally and unpushed.

## Selected direction

The owner compared A/B/C and [selected A's dashboard with B's Work list/detail](https://github.com/BELCORT-SDN-BHD/clara/issues/609#issuecomment-5585630778). Preserve the continuous grid, restrained translucent scope header, accountant-focused summaries and charts, direct needs-you count, and a calm list/detail workroom. Source Sans/Source Serif and existing semantic color, density and motion tokens remain the basis. Long reading surfaces and financial values use clear solid backgrounds; glass is a limited shell treatment.

Documents keeps source and typed facts together, and accounting tables retain readable amounts with a separate accessible horizontal scroll region where comparison requires it. The [34-journey contract](refresh-2026-09-08-frontend-interaction-contract.md), [component disposition](refresh-2026-09-08-component-contract-research.md), and Documents/Bank contracts carry this direction into the remaining pages. Their target layouts are not implemented by the four-page prototype.

## Bounded closing review

| Before | After | Why |
|---|---|---|
| Work row selection was visual only; entering from Home removed the focused button | `aria-current` exposes the chosen row; cross-surface entry focuses the Work heading, while same-page row selection retains row focus | Keyboard and assistive navigation track the same selected Work |
| Wide Clara had no close action | An explicit close hides the dock and returns focus to “问 Clara”; reopening the wide dock retains the current in-memory transcript | Closing a surface is distinct from starting a new conversation |
| Jump-to-latest animated translation/scale under reduced motion and used separate raw durations | Uses the existing panel-motion token; reduced motion disables its CSS transition | Respect the user's motion preference without removing the scroll action |
| Two `shimmer` class names had no installed CSS rule | The prototype intentionally uses static status text | A class name is not proof of an animation or installed utility |
| Variant C implied another review after sufficient supplier information | It says Clara continues processing the purchase documents | Preserve the already accepted default-agentic execution contract |

Root independently checked the final behavior in Chromium on the local development route:

- Home's needs-you action focused the selected Work heading. Selecting another row on Work retained its button focus and moved `aria-current` to that row.
- Native Work Tabs used manual activation: arrows/Home/End moved focus; Enter/Space activated the view. The same pending question stayed visible and variant A did not change.
- Closing the wide dock removed it from visible/accessibility navigation, returned focus to its opener, and reopening retained the same 289-character synthetic transcript.
- Stopping a synthetic streamed reply ended that reply while the Work question remained pending; it did not report work cancellation.
- At 390 px, the transcript overflowed its own viewport. Scrolling up exposed the latest-message button; keyboard activation returned to the bottom. Its inactive state had `tabIndex=-1`; active had `tabIndex=0`. Under reduced motion its computed transition was `none` and animation name was `none`.
- Narrow Clara dismissed with Escape and returned focus to “问 Clara”. Client/scroll widths were 375/375 at a 390 px viewport, 305/305 at 320 px, and 705/705 at 720 px. The 720 × 500 reflow had a readable heading. This is viewport/reflow evidence, not a claim of testing native browser zoom, text-only scaling or all device/assistive combinations. A temporary CSS `zoom:2` probe did not change media-query breakpoints and was not treated as native browser-zoom evidence.
- Earlier checks retained in the prototype README cover three charts, bidirectional Work/chat answers, count updates, a new conversation retaining confirmed Work basis, and desktop/narrow overlays. Final changed TSX files passed TypeScript and focused ESLint; the scroller skin passed focused ESLint.

The native MessageScroller supplies a region/log and uses additions rather than token-by-token transcript mutations. Its [official documentation](https://ui.shadcn.com/docs/components/base/message-scroller) describes these defaults and the optional busy contract. DOM inspection is not a screen-reader listening test, and native primitives do not prove the product's announcement policy. The [AI SDK helper](https://ui.shadcn.com/docs/helpers/ai-sdk) supplies the synthetic local transport, not real model execution or durable reconnect.

## What the decision closes and what implementation still owes

The visual structure, density, source comparison, component roles and selected interaction direction are sufficiently concrete for spec synthesis. No new taste choice is needed to retain the owner's A+B selection. Prototype code stays on its isolated branch and is not promoted into the application wholesale.

The audit/slicing and subsequent implementation issues still own all 34 production journeys; source/receipt-backed states; native browser zoom and assistive-technology acceptance; arbitrary long transcripts and history loading; stable conversation state through closing/reopening narrow overlays or changing layout; one announcement owner per transition; saved history/deletion; current permissions; concurrent answers; retry/reconnect; and actual accounting effects. Narrow overlays and layout changes can remount this prototype's local chat; durable production conversation state must not rely on that component lifetime. The prototype's refresh resets memory and its inactive navigation/inputs remain explicitly disabled.

Full production verification is not a prerequisite to deciding which visual direction to implement. It is an explicit acceptance obligation for each delivered slice.
