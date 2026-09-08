# Efferd Dashboard 2 — Clara reference

Checked 2026-09-08. Owner supplied [Efferd dashboard blocks](https://efferd.com/blocks/dashboard) and especially likes Dashboard 2's glass-like treatment, charts, tables, typography and motion, provided they serve Clara's accounting vision.

## Observed evidence

The catalog describes 14 dashboards. The rendered [Dashboard 2 preview](https://efferd.com/view/dashboard-2) was inspected at 1300×950 with a browser screenshot, accessibility tree and computed styles. It uses a persistent grouped sidebar, compact sticky header, a contiguous bordered grid, four numerical summaries, two larger charts, a recent-invoices table, a local billing-health empty state and an activity list. Titles, explanatory subtitles and values have distinct hierarchy. This reference is synthetic demo content, not accounting data or a functioning invoice system.

The visible header computes `backdrop-filter: blur(8px)` with a translucent background. In the inspected DOM it was the only element with a non-`none` backdrop filter. The bars fade toward their baseline and the invoice preview fades lower rows; these visual effects should not be conflated with every panel being glass. The inspected resting DOM had no active CSS keyframe animation; that is not proof that the page has no JavaScript/chart animation. No timing/easing or reduced-motion claim is made from the screenshot.

## Application to Clara

- Carry the owner's preference into the visual prototype: try restrained translucency on the sticky scope header or supporting rail, using Clara's current semantic tokens and Source Sans/Source Serif.
- Keep work questions, financial amounts and table rows on consistently readable surfaces. Explore a plain-surface alternative alongside glass so contrast, scrolling and focus can be compared with the same content.
- Borrow the continuous grid, aligned headings, explicit comparison labels and the separation of summary, trend, records and activity. Use the accepted work-first home content, not this SaaS demo's active-users/conversion/signups metrics.
- Charts need period, currency/unit, measure definition, source and freshness. A subtle fill is acceptable only when it preserves the series shape, baseline and values; do not fade financial records or overdue items out of readability as a decorative preview.
- Use a clear route to all underlying records and distinguish empty, filtered-empty, unavailable and stale data. Demo links leading to `/#` do not count as a product flow.
- Judge motion through a runnable Clara prototype: response to user action, chart/selection continuity, reduced motion, keyboard behavior and performance. No component or registry was installed from Efferd during this research.

The catalog customizer displayed Radix UI/Lucide. Clara uses Base UI. Any future source reuse must be reviewed against the actual chosen variant and Clara component contracts; this visual preference does not change the foundation or overwrite its theme.

## Remaining work

Compare desktop/narrow glass and plain variants using the same accepted Work/home data. Inspect other Efferd dashboards only for a specific unmet layout or information need. Final chart measures and motion choices remain their own decisions; the owner has not approved a wholesale template import.

## Focused supplementary inspection — Dashboard 6 and 12

On the same date, the live [Dashboard 6](https://efferd.com/view/dashboard-6) and [Dashboard 12](https://efferd.com/view/dashboard-12) previews were inspected through viewport screenshots and accessibility trees, specifically for financial hierarchy and contextual actions. This is a bounded sample, not a claim to have reviewed every Efferd block or its source.

- Dashboard 6 uses a date control, aligned values, thin separators, a large trend and a secondary summary column. Its displayed date filter and chart axis did not describe the same interval in the observed demo. A large segmented revenue gauge did not make its denominator clear. Borrow the hierarchy; require coherent periods and a meaningful scale in Clara.
- Dashboard 12 uses a title-level “Ask AI” action, compact metric panels and an at-risk table with row-level follow-up actions. Clicking “Ask AI” in the observed public preview produced no navigation or dialog; this does not establish an agent interaction contract. In Clara, contextual actions must open the same real Work, question or object already represented elsewhere.
- Neither sample changes the accepted work-first home, navigation, metric decision or component foundation. Keep chart labels and rows fully readable instead of copying the demos' edge fades. The reference informs the three visual prototypes; the owner still chooses after interacting with those prototypes.
