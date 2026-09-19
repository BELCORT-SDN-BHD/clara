# #635 — firm settings shows the firm's real legal, commercial and usage state

**Branch** `impl/635-firm-commercial-settings` · **worktree** `C:\Users\zhant\Desktop\clara-wt\635` · rig PG 55701 / `clara_635`.

```
a9d2d964 fix(db): #635 0233's name-resolution census read the wrong body
6053b9db fix(web): #635 a usage answer carries its month, an unreadable read is not an empty one, and an absent plan is not a failure
436adaae fix(web): #635 the accept control is gated on the caller's own acceptance, not the firm's
34b9a32f test(web): #635 the bookkeeper walk leg asserted the wrong legal face
3ebfadca docs: #635 CONTEXT terms and the three module READMEs for the firm commercial slice
7451ad33 feat(web): #635 /settings/firm reads the firm's legal, commercial and usage state
3e4cece3 feat(db,web): #635 migration 0233, the four-name rig-meta cohort, and the en.json replacement
57a13686 test(db): #635 red-first battery for the firm legal/commercial/usage reads
```
42 files, +6342/−8 across eight commits. Base `abcc5030`. Nothing pushed, no PR, no commit to main.

**FIX ROUND 1 (three top commits) — twelve review findings answered, eleven applied red-first, one
deliberately left, none needing ratification.** Details and per-finding evidence:
[`635-fixround-1.md`](635-fixround-1.md). What changed in the claims below is marked †.

## Per acceptance criterion / historical row

| Row | Verdict | Evidence |
|---|---|---|
| **AC1** rank-shaped routing + one membership lifecycle | **verify-only (routing/roster) + done (commercial half)** | `tree.ts` and `components/admin/*` untouched (`git diff --name-only`); no second roster and no seat count added — `p635.web.rank_shaping`, walk legs (1)(4) |
| **AC2** versioned attributable legal; plan/payment/invoice/usage with source, range, freshness | **done** | migration `0233`; `p635.db.legal_standing_*` (8), `commercial_*` (5), `usage_*` (8); `lib/firm/usage-csv.test.ts`; walk legs (1)(2)(3)(6)(7) |
| **AC3** absence/failure/empty explained, never synthetic controls or invented pricing | **done †** | SURFACE cells: `p635.web.no_numeral_when_unruled`, `p635.web.no_billing_control`, `p635.web.commercial_absent_named_zero` and walk leg (1) — they render the explanation and the support route, which is the property AC3 names. `p635.db.commercial_invoices_constant` is the DOOR CONSTANT's regression pin, not behavioural evidence (it asserts two literals the door writes inline). † Three absences that used to read as failures now read as themselves: `p635.web.commercial_no_current_plan` (no `is_current` plan row), `p635.reads.usage_not_a_table` (an unreadable usage payload is a failure with a retry, never "No model calls in this period."), `p635.web.usage_dropped_rows` (a table missing rows says so). The hub's one blanket sentence replaced by three honest ones (`Settings.unbuiltNote`) |
| **AC4** rank separation; role loss removes protected data immediately | **done, both holes closed** | `p635.db.usage_base_floor_added` (the recut: viewer+bookkeeper now CLR04, admin+owner still answered); `p635.web.revocation_clears` + walk leg (8); `firm_document_limits` residual named below. † The accept control is gated on `can_accept_for_firm` AND on the caller's own outstanding acceptance, so an owner in a split-acceptance firm still gets the remedy (`p635.web.legal_split_acceptance`) |
| **AC5** plan present/absent, provider failure, immutable legal history, usage range/download, old admin redirects, keyboard/focus, narrow Settings | **partial: redirects verify-only (CLOSED by #614), rest done** | `p635.db.accept_replay`; walk legs (7)(9); keyboard/focus/320px/200% **re-measured on the new page**, not inherited |
| **AC6** the eight states, exact money/date, 320px, 200%, SR names, stable URL/Back, preserved drafts | **done †** | `firm-settings-a11y.test.tsx` (axe-zero at viewer/bookkeeper/admin/owner), walk legs (2)(6)(9). † Focus RETURN is now asserted against the trigger element itself rather than "not `<body>`"; the period change reverts the usage table to its loading face instead of showing the previous month's rows under the new window (`p635.web.usage_period_change`); money carries one sign, not two (`p635.format.money_negative_sub_unit`). **There is no draft on this page** — the only input is a confirmation dialog, so "preserved drafts" has nothing to preserve; stated rather than silently omitted |
| **AC7** production-facing reads under real least-privileged roles and current migrations | **done** | 24-cell battery, every assertion through `humanQuery` personas incl. a minted admin via `addMember`. **No Workflow leg — that is a finding, not an omission**: this journey invokes no Workflow at all |
| **CB-AE2E-012 / H-18 / H-19** manual lane-enable panel | **descoped (authority)** — `0195:35-37` replaced UI-28/29 outright. The only contribution is the third recovery path (`ARCHITECTURE:393-403`), which this ticket builds as the accept dialog |
| **C-01 / C-56** pricing is an owner decision | **descoped (authority)** — rendered as the fact it is; `p635.web.no_numeral_when_unruled` is a regex over the whole rendered card |
| **C-02** recover the metering/billing requirement | **done (the surface)** — reader is `llm_usage_events` via `get_llm_usage_summary`, never `firm_usage_daily`; four-relation census below |
| **C-09 / C77.8** webhook assertions | **verify-only, outside this boundary** — preserved, owned by `packages/runtime/src/stripeRoutes.ts`; the firm card shows a payment RECORD, never an event state |
| **F-02** opt-in switch | **descoped (authority)** — nothing to restore |
| **C55.21** monthly usage dashboard · discovery | **done, and the discovery result IS the recut** — nobody was floored; this ticket floors the door itself (`p635.db.usage_base_floor_added` + `usage_base_firm_wall_intact`) |
| **C83.10** duplicate of C55.21 | **verify-only** — folded, no separate work |
| **C81.5** Supavisor headroom · discovery | **descoped (authority)** — pool capacity is a release/ops measurement. The two per-firm caps this page DOES render are `firm_document_limits` (4 numbers) and — deliberately NOT rendered — `firm_limits.max_concurrent_runs`; ops follow-up filed below |
| **C88.2** retirement census of `firm_usage_daily` / `task_usage` · discovery | **verify-only — "do not drop here"** | census below |

## The four-relation / retirement census (C-02, C88.2)

Measured by grep over `packages/db/migrations/`:
- **`llm_usage_events`** — the reader this card uses, through `get_llm_usage_summary` → `llm_usage_events_priced` (`pg_get_viewdef` read on the rig, cell `p635.measure.priced_view`). Human SELECT policy `(scope='firm' and firm_id=jwt_firm()) or scope='platform'` (0110:355-358).
- **`llm_price_table`** — USD by CHECK (0110:497), 5 rows on the rig (`p635.measure.price_rows`), no app grant.
- **`firm_usage_daily` / `task_usage`** — writers: `settle_chat_turn` (0006:1048-1058) plus the autodraft reserve/refund family (0011:2539-2567, :2670-2676, 0031:232-266, 0034:277-395, 0036:955-960, :1302-1304, :1393). Readers: the 0006:970 budget gate was removed by 0105:40-52, leaving in-body reads and test-only helpers. **Do not drop here** — and this card reads `llm_usage_events`, so the eventual drop gains no new blocker from #635.

## Tests added

| File | What it proves |
|---|---|
| `packages/db/tests/firm-commercial-settings.test.mjs` (24 cells) | the three doors' shapes, floors and ACLs; the recut in both directions; the standing predicate against 0195's own basis |
| `packages/db/tests/firm-commercial-settings-fixtures.mjs` | fixtures; every `rootQuery` labelled at its site |
| `packages/db/tests/firm-commercial-settings-preintegration-gate.mjs` | the sweep escape; a focused run without it fails loudly |
| `apps/web/lib/firm/commercial-reads.test.ts` (12) | door-name constants; decoders drop an unreadable row AND count it; a non-table usage payload is a failure, not an empty period; an absent current plan is an absence, a half-readable one still drops the payload |
| `apps/web/lib/firm/commercial-format.test.ts` (4) † **new in fix round 1** | integer-cent money in the door's own currency, ONE sign on a negative, the unruled-price refusal, the UTC frame |
| `apps/web/lib/firm/usage-csv.test.ts` (7) | provenance header (firm, exact UTC window, currency), quoting/escaping, no reordering, unpriced count in the file, and † the count of rows the file is MISSING |
| `apps/web/lib/firm/usage-period.test.ts` (8) | URL round-trip, leap/short months, visible fallback, the UTC frame |
| `apps/web/components/firm-admin/legal-standing-card.test.tsx` (12) | the seven faces; † the accept trigger present **iff** the caller may accept AND has an outstanding current version, including the split-acceptance state; † the named owner hint names the most recent acceptance, asserted as a whole sentence |
| `apps/web/components/firm-admin/accept-legal-dialog.test.tsx` (6) | op key held across a retry; `bodySha256` byte-identical on the captured call; stale → re-read, never resubmit; draft has no control |
| `apps/web/components/firm-admin/commercial-state-card.test.tsx` (8) | no numeral while unruled; a ruled plan shows a figure with no code change; named zero; no Manage-billing at any rank; a CLR04 clears the figures; † no current plan is a named absence and the rest of the card still reads |
| `apps/web/components/firm-admin/ai-usage-card.test.tsx` (13) | buckets never summed; unpriced surfaces; currency label; URL round-trip; CSV absent on empty; a CLR04 clears the rows; † an answer for another month is not rendered at all, and dropped rows reach both the screen and the file |
| `apps/web/components/firm-admin/firm-settings-panel.test.tsx` (5) | composition from exactly three reads; the focus-driven revocation; denied ≠ failed; † a period change never leaves the previous month's rows under the new window |
| `apps/web/components/firm-admin/firm-settings-a11y.test.tsx` (6) | axe-zero at four ranks with both legacy cards; rank shaping; keyboard |
| `apps/web/e2e/firm-commercial-walk.spec.ts` (8 tests, ten legs) | the browser walk |
| extended: `lib/firm/capabilities.test.ts`, `firm-admin-pages-a11y.test.tsx`, `checkout-gate-c3.test.mjs` (`c3.53`), `f-a9-pr-1b.test.mjs` (gate 7) | the four censuses this slice moves |

## Commands and counts

All from the worktree unless stated; rig env per RIG.md (`PGPORT=55701`, `PGDATABASE=clara_635`), never `CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP`.

| Command | Result |
|---|---|
| `pnpm typecheck` | **green** (`packages/runtime` Done, `apps/web` Done) — re-run after fix round 1 |
| `pnpm lint` | **green** (eslint + token-contrast + test-manifest + message-keys + ui-add guard, all PASS) — re-run after fix round 1 |
| `node scripts/run-tests.mjs` (apps/web, whole suite) | before fix round 1: **4199 tests · 4197 pass · 0 fail · 2 skipped · 135 suites · 124s**, and again at 102s. † **After fix round 1: 4216 tests · 4214 pass · 0 fail · 2 skipped · 135 suites · 91s.** The 2 skips are `tests/live-provider-auth.test.ts`'s env-gated cells (`CLARA_LIVE_SUPABASE_AUTH_URL` not configured) — re-identified by running that file alone (2 tests, 0 pass, 0 fail, 2 skipped), not inherited from the earlier run. `thread-live-clarify.test.tsx`'s known whole-suite load flake did **not** arise |
| `node --test --test-concurrency=1 tests/firm-commercial-settings.test.mjs` — **focused, gate UNSET, BEFORE 0233** | **24 fail · 0 pass · 0 skip** — the premise check fails loudly rather than skipping. This is the red-first evidence, taken before a line of SQL was written (commit `57a13686`) |
| `node --test --test-concurrency=1 tests/firm-commercial-settings.test.mjs` — **focused, gate UNSET, AFTER 0233** | **24 pass · 0 fail · 0 skip** |
| same battery + `operation-census` + `rig-isolation`, with all **41** `--import …-preintegration-gate.mjs` flags from `package.json` | **55 tests · 54 pass · 0 fail · 1 skipped** — the skip is `rig-isolation` T19 (`destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1`), which this rig must never set. #866's T10b did **not** arise: no Workflow World was bootstrapped on this database |
| † after fix round 1, on a rig rolled back to pre-0233 and re-migrated: the battery + `operation-census` + `rig-isolation` + `f-a9-usage-reshape` + `f-a9-pr-1b` + `checkout-gate-c3` | **162 tests · 161 pass · 0 fail · 1 skipped** (62s); the skip is the same T19 |
| the recut's blast radius, with the 41 gates: `f-a9-usage-reshape` + `f-a9-pr-1b` + `checkout-gate-c3` + `checkout-gate-c1` + `checkout-gate-c2` + `checkout-gate-c6` + `legal-acceptance` + `firm-document-limits` | **174 tests · 174 pass · 0 fail · 0 skipped**. Before the two census widenings, the three-file subset (`f-a9-usage-reshape` + `f-a9-pr-1b` + `checkout-gate-c3`) ran **107 tests · 105 pass · 2 fail** — exactly the two predicted reds (`c3.53`'s money-store roster and gate 7's `pages_per_day` roster), each then widened with the reason beside the name |
| `pnpm db:migrate` | `1 new migration applied · 220 total`, prestate and tail notices both OK. † Re-run in fix round 1 after restoring the rig to a genuine pre-0233 state (the `get_llm_usage_summary` pre-image restored from `0110:706-754` and verified to hash to 0233's own pin `51621dea…` with its ACL unchanged, the three new doors dropped, the ledger row removed): the EDITED file applied end to end — `#635 prestate: clean`, `#635 tail: OK`, `1 new migration applied · 220 total` |
| `e2e/e2e-fixture-ownership.test.ts` + `tests/sql-oracle.test.ts` + `tests/firm-scope-surfaces.test.ts` + `tests/firm-scope-fourth-entrance.test.ts` + `tests/parity-holes.test.ts` | **106 tests · 106 pass · 0 fail** — no `LANE_MOCKS` / `LANE_DECLARATIONS` / `SHARED_RPC_VERBS` edit was needed, and no new route entered the firm-scope censuses |
| `lib/firm/capabilities.test.ts` | **10 pass · 0 fail** (the floor census walks the new row; the cited line was re-read off the finished file). † The fix-round tail edit added 8 lines BELOW the cited floor statement, so the capabilities line pin is unaffected — re-verified by the cell itself |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 296 frozen files verified, 53 `"use workflow"` modules all frozen+registered, 3 retired entries |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable at this commit |
| `pnpm --filter @clara/web e2e firm-commercial-walk firm-navigation-walk shell-migration-walk` (triple `3300/3301/3302`) | **first run: 49 tests · 48 passed · 1 failed**, the failure in a #635 walk cell that asserted the MASKED legal face for a bookkeeper — the door masks the attribution triple BELOW bookkeeper, so rank 1 reads the name. The cell was wrong, not the component (fixed at `34b9a32f`). **`firm-navigation-walk` and `shell-migration-walk` were green on that first run**, including `firm-navigation-walk`'s axe-zero at `/settings/firm` for owner AND bookkeeper with both legacy sentences, and `shell-migration-walk`'s `<h1>` "Firm settings" pin. Re-run of `firm-commercial-walk` after the fix: **8 passed (31.8s)**, all ten legs |
| † the same three specs re-run after fix round 1 | **49 passed (1.2m) · 0 failed**, exit 0 — the same 49 as before the fix round: `firm-commercial-walk`'s 8 tests / ten legs, plus `firm-navigation-walk` and `shell-migration-walk`'s 41. The bookkeeper leg, the axe-zero legs and the `<h1>` pin are unchanged; the focus-return leg now compares `document.activeElement` to the trigger handle rather than asserting it is not `<body>` |

## Docs updated

- `CONTEXT.md` — three terms in the house `term / _Avoid_` shape: **Firm legal standing** (the wave-ratified term), **Billing plan**, **Model usage summary**.
- `packages/db/README.md` — new §"0233 — the firm's own legal, commercial and model-usage state (#635)": the three doors with floors, the recut and its subtraction proof, the two census widenings, the `firm_document_limits` non-goal.
- `packages/db/tests/README.md` — new § for the battery: cell prefix `p635.db.`, why it mints its own firms, why the legal shelf is **not** restored.
- `apps/web/README.md` — new §"`/settings/firm` — the firm's commercial destination (#635)": why accepting in-app is the only remedy for a withdrawn egress authority, what the page deliberately does not offer, the focus-driven revocation and its residual, the UTC window.
- † Fix round 1 extended two of those: `apps/web/README.md`'s `/settings/firm` section now states
  the accept control's real gate, the month-stamped usage answer and the
  unreadable-is-not-empty rule; `packages/db/README.md`'s 0233 section records that §C's
  name-resolution census read the wrong body and what the fix measures.
- **Never touched**: `docs/PRD.md`, `docs/ARCHITECTURE.md`.

## Blueprint drift (for #683 — not edited, reported)

1. `PRD:126`'s shared-AI-usage clause now has a real surface (`/settings/firm`'s model-usage card); the PRD still reads as though it does not.
2. ARCHITECTURE has **no §10**, while `0195:21` and `0186:7` both cite one; the content those cite lives in §5.E (`:358-372`).
3. ARCHITECTURE §7's accepted-but-unimplemented table carries **no commercial row** at all, so the plan/payment/invoice posture this ticket implements has no blueprint entry to move.
4. `ARCHITECTURE:372`'s "no export route, by absence" is stated about `work_execution_traces` only; this ticket's client-side usage CSV makes the ambiguity worth naming — it is not a route, but a reader could take that sentence as covering every export.

## Successor contract

**No cut needed.** This journey invokes no Workflow and needs no Work-lane or chat-lane tool: it is three governed reads plus one already-built governed write (`clara.accept_legal_document`, 0185:684, untouched). No runtime module, no registry edit, no part kind, no `WORK_ACCEPTED_PURPOSES` widening, no frozen byte. Evidence: `node scripts/check-frozen-workflows.mjs` → **OK, 296 frozen files verified, 53 "use workflow" modules all frozen+registered, 3 retired entries**; `node packages/runtime/scripts/check-parts-parity.mjs` → **OK, reader ⊇ emittable**. `packages/runtime` has no diff at all.

## Assumptions made

1. **`get_firm_commercial_state`'s `capacity` returns NULLs when the firm has no `firm_document_limits` row** rather than the table's column defaults. Measured: the rig holds **zero** rows in that relation, and the enforcing doors coalesce to their own fallbacks (`0090:422-436`), so publishing 100/1000/2/2 as "this firm's caps" would be the door inventing a number nobody stored. The card renders a named zero instead.
2. **The legal shelf is not restored after `p635.db.legal_standing_new_version` publishes a successor.** 0185 makes that irreversible in both directions (`t_legal_documents_append_only` blocks DELETE; `_tf_legal_documents_transition` at 0185:299-302 allows only draft→published and published→superseded). `checkout-gate-c1.test.mjs:393` and `checkout-gate-c3.test.mjs:266` already move it the same way, so the estate already reads the current published version from the catalog.
3. **The revocation cells live in a new `firm-settings-panel.test.tsx`**, not in the two card files the brief named, because the reads and the focus listener live in the panel (one door answer feeds three cards; three cards each calling the same door would be three answers free to disagree). The card files carry the other half — that a `denied` view renders nothing of a previous payload.
4. **`FirmSettingsPanel` splits into a URL wrapper and an exported `FirmSettingsPanelView`**, the `SettingsHub`/`SettingsHubView` shape, because `useSearchParams`/`useRouter` need a real Next router the `node --test` harness does not provide.
5. **`f-a9-pr-1b.test.mjs`'s gate-7 `pages_per_day` roster was widened too** — one census beyond the brief's risk list, because `get_firm_commercial_state` reads that column. Classified in writing as a READER, not a live usage gate; gate 6's KEPT family is unchanged.
6. **The support route is `mailto:support@clarabook.my`.** No support address exists anywhere in the repo to copy; if the owner has a different one, it is a one-line change in `components/firm-admin/commercial-state-card.tsx`.
7. **`p635.db.usage_buckets_separate` asserts the platform bucket's PRESENCE, not an absolute count** — a `scope='platform'` row carries no firm (0110:355-358), so every firm sees every platform row and an absolute count would couple the cell to the rest of the cluster.

## Follow-ups worth filing

1. **`clara.firm_document_limits` has no human writer at all.** `0196:36-40` records this and names #635 in its header; #635 renders the four numbers and deliberately offers no control, because an editor needs a governed write door, a receipt and an audit row — a relation-touching migration. File it as its own ticket, and decide at the same time whether the operator console or the firm owner is the writer.
2. **Supavisor / pool headroom is not a settings figure (C81.5).** Answering it needs a load run against a real stack, not a card. Recommend a separate ops ticket that measures pool capacity and concurrency at release time; `firm_limits.max_concurrent_runs` is the other per-firm cap and is deliberately not rendered here.
3. **Out-of-repo consumers of `clara.get_llm_usage_summary`.** Measured: **zero** callers in `apps/web` + `packages/runtime` (grep, 2026-09-19 — the only matches are comments in files this ticket added). The hosted estate could in principle hold one; §7.4 #16 was ruled "proceed", so the question goes to the owner in the wave report rather than deferring the recut. An under-ranked caller moves from a successful read (own firm) or CLR11 (another firm) to CLR04.
4. **0233 hard-pins three bodies it does not change (integration note, adversarial A7).** The
   prestate AND the tail both pin `sha256(prosrc)` for `clara.get_current_legal_documents()`,
   `clara.accept_legal_document(text,integer,text,text)` and
   `clara._accounting_work_egress_live(uuid,uuid)`. Fail-closed is the intent and no change is
   wanted; the cost is a cross-ticket coupling. Any LATER ticket that legitimately recuts one of
   those three at a migration number BELOW 0233 must re-measure 0233's constants in the same
   commit, or 0233 refuses to apply on a from-scratch chain with a message that blames drift
   rather than naming the recutting file. Verified for this wave: no file 0225–0232 recuts any of
   the three (DECISIONS §2.1's recut sets). Unverified beyond this wave.
5. **`Settings.unbuiltNote`'s replacement is a collision-prone hunk.** It landed in one early commit (`3e4cece3`) with the pinning a11y cell moved in the same change. The integrator's merge should take #635's value on that one key and every other lane's additions beside it.

## Unverified

- **Hosted evidence pending.** Everything above is local, on the #635 rig (PG 17.11, 220 migrations after 0233).
- **Admin rank is not walked in the browser.** `e2e/serve-built.mjs:553-577` derives the persona from the email prefix and has no rank-2 one; adding one would edit a CORE arm nine lanes share. Admin is proven in the DB battery (`p635.db.commercial_admin_only`, `p635.db.usage_wrapper_admin_only`) and in the unit cells instead. Named residual.
- **The revocation layer is focus-driven.** A tab never refocused and never navigated keeps its last payload; that arm has no test because it has no trigger. Named residual.
- **The support `mailto:` address is unverified** — no support address exists anywhere in the repo to copy (assumption 6).
- **`clara.llm_usage_events_priced` was READ, not changed** (`p635.measure.priced_view` captured its `pg_get_viewdef` and its ACL before the migration); neither the wrapper nor the recut references it outside the carried-verbatim body.
- **The two `apps/web` whole-suite skips** are `tests/live-provider-auth.test.ts`'s env-gated cells
  (`CLARA_LIVE_SUPABASE_AUTH_URL` not configured), re-identified in fix round 1 by running that file
  on its own rather than read out of a truncated log.
- **The pre-0233 rollback and re-apply in fix round 1 touched only the #635 rig** (`clara_635` on
  127.0.0.1:55701): the three doors 0233 creates were dropped, `get_llm_usage_summary` was restored
  to the body `0110:706-754` creates, and the one ledger row was removed. No reset flag was set, no
  schema was dropped, and no from-scratch chain was run. The rig now carries 220 migrations again.
