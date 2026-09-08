# Copilot Money chart and motion research

Checked: 2026-09-09 (MYT). This is a bounded reference study for Clara's refresh. It records public first-party behavior and documentation; it is neither a Copilot product audit nor evidence about Clara's current implementation.

## Evidence boundary

Three evidence levels are kept separate:

1. **Observed live** — behavior sampled in a browser on Copilot's current public marketing site.
2. **Observed video frames** — states visible in Copilot's first-party Web App Walkthrough embedded in its Help Center. Video frames can show a state change, but sparse sampling cannot establish the product's exact easing or duration.
3. **Vendor described** — interactions stated in Copilot's Help Center. These are useful product facts, but were not independently exercised in an authenticated account.

The earlier Mobbin pass remains **static-frame evidence**: all 3/3 frames in the documented Copilot Dashboard flow were inspected, but still images cannot prove motion. See [UX flow supplement](refresh-2026-09-08-ux-flow-supplement.md#copilot-money-dashboard-complete-bounded-sequence).

No account was created, no authenticated financial data was opened, and no remote media was downloaded.

## Sources

| Source | Evidence used |
|---|---|
| [Copilot Money public site](https://www.copilot.money/) | Live marketing-page layout and motion sampling; financial-card presentation |
| [Copilot Money for Web](https://help.copilot.money/en/articles/11780342-copilot-money-for-web) | Current Web feature description and the embedded first-party [Web App Walkthrough](https://www.youtube.com/watch?v=vLIsgqrF_y8) |
| [Dashboard Tab Overview](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview) | Monthly-spending graph semantics, To Review, upcoming items, and period comparison |
| [Accounts Tab Overview](https://help.copilot.money/en/articles/6213732-accounts-tab-overview) | Net-worth range control, exact-point hover/touch, combined/split series, and downstream range linkage |
| [Cash Flow Tab Overview](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview) | Income/spending/net-income chart types, exact-value interaction, drill-down, periods, and comparison encoding |
| [Transactions Tab Overview](https://help.copilot.money/en/articles/9554412-transactions-tab-overview) | Detail editing, filtering, recurring/split actions, and record-level navigation context |

## What was actually observed

### Live public site

The hero uses a strong numeric/product hierarchy and tilted category chips around the headline. In a one-second settled sample, the sampled chip's position and rotation did not change. This does not support describing the hero as continuously floating.

The clearest motion evidence came from the **Transactions to review** product card. While the card remained visible and without a user action, its synthetic rows changed from one five-transaction set to another. The card boundary, section heading, `View all`, day label, and `Mark as reviewed` action stayed fixed. High-frequency computed-style sampling caught the changed row wrappers in temporary non-identity horizontal translate/scale transforms, followed by `transform: none` when settled. Sampled transaction text remained fully opaque; no rolling amount digits were observed. This is evidence for a local change transition inside stable context, not for periodically replacing real financial records.

At a settled page state, the browser reported no active Web Animations API/CSS animations. Four top-navigation links declared a 0.4-second colour transition. That is a snapshot of active/declarative browser state, not a source-code inventory of every breakpoint, interaction, or animation.

Scrolling kept the site navigation visible while product sections moved through the document. Sampled headings did not show an independent opacity or transform transition. The scroll movement itself is excluded because browser and automation behavior can affect it.

### First-party Web App Walkthrough

Bounded samples from approximately 00:25–01:25 showed a stable dark application shell with a left account/navigation rail and a dashboard grid. The dashboard combined a monthly-spending line, net-worth line, transactions to review, top categories, and upcoming items. Later frames showed a selected transaction row, a persistent selection/review action region, and a right-side transaction detail surface; the video then moved to a fuller transaction-list state while retaining row/detail context.

Those frames support continuity of shell and record context during drill-in. They do **not** establish whether the detail surface fades, slides, morphs, or mounts instantly in the shipped application, because the exact transition was not captured frame by frame. The same limitation applies to chart drawing and range-change transitions.

## What Copilot documents about chart presentation

These points are vendor-described unless the preceding section says they were observed:

- The Dashboard graph puts one decision-relevant value above the chart, uses a dotted ideal-spending line against a solid actual-spending line, and makes the latest point express current progress. The vendor explains the exclusions that affect the measure rather than treating the chart as self-explanatory.
- Net worth has an explicit timeframe. Hover on Mac/Web, or tap-and-hold on iOS/iPad, exposes exact date points. Changing the timeframe also changes the per-account balance-change figures below the chart. Users can combine assets and debt or split them into separate values and lines.
- Cash Flow separates net income, spending, and income. Spending is a stacked bar by category; a dotted line can show the comparable previous period. Hover reveals exact values and comparison data, while activation drills into category or transaction detail. The Help Center states the date-range boundaries and exclusions.
- Dashboard summaries route to their underlying surfaces: an unreviewed transaction can be edited directly, `View all` opens Transactions, and the month comparison leads to Cash Flow. The Web app also documents arrow-key list navigation and single-key review/category actions.

The presentation pattern is stronger than copying any individual consumer-finance chart: show one named measure and basis, keep comparison encoding consistent, reveal exact values on interaction, and connect the summary to the records that produce it.

## Bounded motion philosophy

The following is an **inference** from the observed public behavior, video states, and documented interactions rather than a published Copilot design manifesto:

1. **Keep orientation stable.** Navigation, card boundaries, headings, and primary actions remain anchors while a row, selection, or detail changes.
2. **Animate the changed object.** The public transaction demo moves changed rows locally instead of transitioning the entire page. Motion communicates replacement and continuity.
3. **Let interaction disclose precision.** Charts first show a trend; hover, touch, or activation supplies exact dates, values, comparisons, and drill-down.
4. **Tie one scope control to all dependent figures.** A selected timeframe changes both the chart and related account deltas, reducing contradictory periods.
5. **Keep motion subordinate to financial reading.** In the sampled card, labels and amounts did not fade or roll while the surrounding row layout changed.

The marketing card's automatic cycling is appropriate for demonstrating synthetic examples. It would be misleading on an accountant's live ledger because values could appear to change without a period, source, refresh event, or user action.

## Recommendations for Clara

These recommendations refine the already selected Clara A-dashboard/B-Work direction; they do not reopen it.

| Clara surface | Apply | Avoid | Acceptance implication |
|---|---|---|---|
| Home financial charts | Keep card/header/period stable; reveal the focused series point and exact MYR amount on hover and keyboard focus; let activation open the supporting report or records | Automatic cycling of real ledger amounts, chart redraw for decoration, rolling counters | Every chart names client, period/as-of date, basis/source freshness, and partial/stale state; an accessible value table carries the same points |
| Period or comparison change | Update all dependent totals, series, labels, and source dates as one state transition; use a restrained local highlight only where values changed | Leaving headline metrics on one period while chart axes or downstream deltas use another | One selected period token drives the visible dataset; focus remains on the control or moves deliberately to the refreshed heading |
| Work list/detail | Retain the list, selected Work, and current question while detail/result content updates locally | Whole-page transitions that hide which Work changed; animated completion claims without a receipt | Selection, answer, cancellation, and completion each expose a stable state and receipt/evidence route |
| Data arrival or correction | Preserve the old value until a sourced replacement is admitted, then mark the affected value/row briefly and textually | Fading an amount to ambiguity or implying that motion itself proves freshness | Old/new provenance and effective version remain inspectable; stale or partial results remain labelled |
| Reduced motion | Replace translation/scale with immediate state change or a non-spatial emphasis while preserving focus, tooltip content, and status text | Removing information or disabling the control when motion is reduced | Verify `prefers-reduced-motion` for chart focus, Work selection, panels, and async state changes |

Use Copilot's exact-value and drill-down pattern, adapted to accountant measures: book cash, AR, AP, income/expense, readiness requirements, and receipt-backed Work. Do not copy its consumer budget line, net-worth semantics, referral progress, bright category palette, or automatic example rotation as Clara accounting behavior.

## Remaining limits

- The authenticated Copilot Web app was not exercised. Help Center descriptions therefore remain vendor claims, and the official video remains recorded-demo evidence.
- The live observation covered one desktop viewport and bounded scroll/settled samples. Mobile gestures, alternate breakpoints, offline/loading/error states, and assistive technology were not tested.
- No reliable timing/easing value was established for the transaction-row change, panel entry, chart drawing, chart hover, or range change. Only the declared 0.4-second navigation colour transition was directly available in the sampled computed style.
- Copilot's response to `prefers-reduced-motion` was not verified.
- Mobbin contributes three complete static frames for the cited Dashboard flow, not animation evidence and not coverage of all current Copilot screens.
- The marketing site's synthetic transaction swap proves a presentation technique, not production refresh, review, persistence, or accounting semantics.

This closes the narrow evidence gap that previously treated Copilot motion as wholly unobserved. It does not establish a complete Copilot animation system. Clara implementation still needs its own runnable acceptance for exact chart data, focus/keyboard behavior, reduced motion, stale/partial states, source linkage, and receipt-backed Work transitions.
