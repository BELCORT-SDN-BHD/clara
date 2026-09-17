Landed on `impl/650-client-home-work` via five commits: `cfa1c710` (0214 — `clara.get_client_work_pack`), `8b248ebd` (the attention band + href builder), `a948fb8b` (browser walk + docs), `fed8b566` (round-1 review fix), `e9deacae` (round-2 review fix).

Migration 0214 ships `clara.get_client_work_pack(p_client, p_preview)`, an RLS-enforced (`relrowsecurity`/`relforcerowsecurity` on `accounting_work`/`operation_receipts`), non-SECURITY-DEFINER read floored at bookkeeper. Needs-you keeps the shipped viewer-floored `counts.work_questions`. `active` = runnable/executing children only (`status in ('queued','running')`) — **not** widened to include `stopping` (ratified, R3 below). "Retrying" is a row label on preview rows (`attempts>1`), never a population count. Recent success = a committed operation receipt within the seven MYT calendar dates ending today; a `completed` Work with no committed receipt drives `coverage='partial'`. Facets may overlap and are never summed. The watermark is `computed_at` + per-facet coverage (the Work lane emits no domain events), refreshed by a 30s while-visible re-read (documented extension of C77.12's `WORK_STALE_AFTER_MS`), on scope change, and on visible return; cleared immediately on client/access change. Readiness is a label + "measured by #677" note inside the existing `ClientCloseSummary`. Owns the client-home layout.

Local evidence across the final cut and two review rounds: DB battery 13/13; `operation-census`+`rig-isolation` 30/31 (1 skip by design); whole `apps/web` unit suite 3,760/3,762 (2 skips, live-provider auth); Playwright `home-board-walk` 9/9 on first solo run both rounds; typecheck/lint/frozen-workflows/parts-parity all exit 0. `responsive-shell-walk` never hit 24/24 in one run on this host, but every one of its 24 assertions passed in at least one of four solo runs and no failure touched the attention band, reflow, target-size or axe — judged host contention (93-100% CPU measured, six sibling lanes live), not a regression. Two review rounds closed every finding; recheck-2 confirms zero open items, zero new blockers. Hosted evidence pending.

| Row | State | Evidence |
|---|---|---|
| AC1 (needs-you / active / retrying) | Done | `p650.pack.active_distinct`; "RETRYING is a row label" cell |
| AC2 (overlap, no total, batch/period) | Done | `p650.pack.no_sum`; 95/5 batch stated-not-built (#636, no parent/child columns exist); period axis closed by seam 11 (`p650.pack.no_period_axis`) |
| AC3 (drilldown) | Done; recent-success leg **partial by name** | `workAttentionHref` + list-parser cells; browser `home.facets.drilldown`; divergence pinned by `p650.pack.recent_success_drilldown`, disclosed via `recentSuccessListBasis` / `recentSuccessListUndated` (round 2) |
| AC4 (watermark/refresh) | Done; "refresh after commits" clause **partial by name** | `computed_at` + coverage; cells 3/4/5/8/9/10; no event-bus subscription exists for the Work lane |
| AC5 (a11y/responsive/state legs) | Done | `home.facets.responsive` / `.states` / `.delayed` / `.drilldown` |
| AC6 (DB battery / Workflow) | Done at DB; Workflow N/A | 12 DB cells under least-privileged roles; no Workflow invoked, no World e2e owed |
| UI-23 (redesign preserve) | Done | 4 pinned preserve cells + 5 pre-existing `home-board-walk` legs green |

**Review summary.** STANDARDS and SPEC each raised one note (`attempt` faked ordinals with `=2`/`=3` instead of `selectordinal`, wrong past n=20) — fixed round 1. Adversarial raised blocker 650-B1 (recent-success tile and its drilldown list dated by different instants — receipt vs. admission), shoulds 650-S1 (drilldown proof used a hard-coded empty page) and 650-S2 (README index-attribution error), and notes 650-N1–N4 (stale reviewer cluster; `stopping` Work carries no tile; needs-you chip's inherited active-client false negative; a viewer offered a link into a bookkeeper-floored list) — all applied or named round 1. Recheck-1 raised two more findings mislabeled `severity:blocker` but self-described should/note (650-R1: module README still asserted the unqualified drilldown claim; 650-R2: the new disclosure overstated on the windowless defensive arm) — both fixed round 2. Recheck-2: R1/R2 closed, zero open, zero new blockers.

**Ratifications applied** (DECISIONS §3.1, R3): "active facet = queued/running only; `stopping` Work carries no tile" — matches brief-650 line 8 verbatim; residual named on the surface and in the report.

**Residuals / follow-ups:**
- `home-board-mock.mjs` answers `get_client_work_pack` for every client id (declared debt in the ownership census, not scoped by `p_client`).
- `needs-you-counts.tsx:7-10`'s comment says "EIGHT counts" while nine chips render.
- Client Documents workbench still stays "running" until reload (pre-existing, needs its own ticket).
- `use-review-queue.ts:166` drops the review-queue envelope's `watermark`.
- `clara.list_accounting_work` needs a receipt-dated window to link what posted (not just started) in a period — a 0189 recut, its own ticket.
- Needs-you chip's active-client guard (inherited from #629) false-negatives on onboarding/archived clients.
- D13 activity-kind misfiling (shared, six tickets); `_assert_journal_basis`'s `nonzero_total` arm structurally unreachable (shared with #652/#653); lane-mock private body-reader hazard (shared cross-ticket).

**Successor contract:** none owed. Read-only board — admits no Work, calls no tool, ships no `packages/runtime` file. No `db-live-gates/action.yml` row, no World e2e leg (WAVE-DIGEST §4).

**Integration evidence:** <INTEGRATION_PLACEHOLDER>
