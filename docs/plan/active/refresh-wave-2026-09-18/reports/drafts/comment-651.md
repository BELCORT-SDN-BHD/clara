Landed on `main` via merge commit `ede1df83` (PR #954, "Wave 2026-09-18"), branch `impl/651-assets-depreciation`, migration `packages/db/migrations/0227_depreciation_history.sql`. The fix round (`2aa00f24`/`1abf48db`/`9d96ad45`) answered all three reviews and is folded into the numbers below. **All evidence below is LOCAL; hosted evidence pending — this ticket stays open until the hosted release.**

**AC / historical rows**

| Row | State | Evidence |
|---|---|---|
| AC1 classification | Done | `0227` §A/§D (`change_class`/`change_reason`, one-directional CHECK); `p651.class.required/.policy_refused/.error_refused/.prior_untouched/.completion_refused`; walk leg 3; `fa-row-actions.test.tsx` |
| AC2 locked-period wall | Done; accepted-treatment move-clause **descoped (D9, authority)** | `_fa_assert_period_open` spliced into the poster; `p651.period.closed_refused/.closed_belt_skips/.blocked_draft_recovery`; walk leg 2 (refused, no run row) |
| AC3 re-read at commit | Verify-only; 2 holes closed by fix round | `p651.class.prior_untouched`, `p651.period.blocked_draft_recovery`; ADV-651-1 (retire-unsigned raw-23514) and ADV-651-6 (write-once wall) both CONFIRMED in `651-recheck-1.json` |
| AC4 four groupings | Done; shared-question half named residual | fifth `revisions` tab + `?tab=`; `fa-revision-timeline`/`fa-charge-ledger`/`fa-detail-tab-url`/`fa-runs-panel`; walk leg 3; residual: blocked-draft has no Needs-you row |
| AC5 instruction/window/preview/OBO/Clara | Done except (ii) **descoped (D7/I1, authority)** and (iv) **contract-only** | `sign_depreciation_authority` recut; `p651.authority.*` (ref_resolves/floor/floor_sequencing/floor_frozen/retire_unsigned); `p651.preview.matches_run/.grants`; `p651.obo.run_for/.manual_still_human`; (iv) = `chatTurn_v21` stanza, tool not yet wired |
| AC6 states/a11y/zoom/keyboard | Done | Playwright `depreciation-walk` 4/4; `fixed-asset-acquisition-walk` re-pointed to 5 tabs, **8/8** post-integration-fix (axe gap on new tab closed); `fa-run-preview.test.tsx` |
| AC7 production doors, real roles, Workflow | Done | 19 cells via `humanQuery`; **no Workflow invoked** — `reconciler-fa.mjs:59-61`; `reconcile-fa.test.mjs` 1/1 on `clara_runtime` |
| C86.2 | Verify-only, re-derived | pins re-measured off `pg_proc.prosrc` on `clara_651`; `p651.obo.run_for` asserts all 3 writer variants identical |

**Rulings.** D7: depreciation stays out of the plan-lane scheduler, ratified. D8: `authority_from` freezes at signing month, no silent backfill. D9: closed period refuses on the running door; "move charge to next open period" left to the owner. D10: only *estimate* implemented; policy/error refuse naming **#680** (corrected from an erroneous #676) plus **#679**'s lock law. §6.1: MYT-zone backfill approved verbatim; M1's contingency arm never entered (moot). §6.2.1: 0227's extra recuts (`retire_depreciation_authority`, second `_tf_fa_authority_transition` splice) **ratified**; the instruction-ladder narrowing **not applied** (cross-lane, follow-up); `completeFixedAssetParticulars`/`disposeFixedAsset` keep their own op key (follow-up). §6.3 row 3: #651's 5-tab order stands; #639's keyboard cell re-pointed, not #651's tab.

**Integration + successor cut.** Confirmed 0227 mints **no** new S5.25 clock/duplication census names (§4.2) and applies end-to-end from clean 0224 on two fresh clusters, closing ADV-651-3. Integration fix `32cc1c8a` re-pointed `fixed-asset-acquisition-walk.spec.ts` to the 5-tab order and closed an axe-coverage gap on the new "Policy & effective revisions" tab (7→8 passed). `chatTurn_v21` now carries `run_depreciation_period_for_client` (door `clara.run_depreciation_period_for($1,$2,$3,$4)`, `clara_runtime`-only, CLR03 `client_not_in_conversation` provenance wall); no part kind (three existing kinds each refused by name) and the tool is deliberately **out of `hasCodingIntent_v21`**.

**Named residuals (to be filed).** x41.s4 rig-timing false positive (fixture row predates migration). Fold `preview_depreciation_run`'s duplicated aggregation with `_fa_run_period_core`. Blocked depreciation queue has no Needs-you row. Cross-lane instruction-ladder narrowing (FA + plan). `completeFixedAssetParticulars`/`disposeFixedAsset` still mint their own op key. `get_depreciation_authority` never surfaces a retired authority's reason/author. Fold the two completion-wall bodies.

**Blueprint drift (#683).** PRD.md:109 lists depreciation as delivered while classification/locked-period law were gaps in it. ARCHITECTURE §5.D's plan-lane law is unmet-before-0227 and unmentioned for depreciation. ARCHITECTURE:183/:293 pin `chatTurn→v19`/`claraWork→v3`; live registry is now v21/v5. `fa.keys`' "exactly nine keys" prose is stale — the frozen set is a strict subset of the DB's admitted set.

**Verify locally.**
```
cd packages/db && node --test --import ./tests/depreciation-history-preintegration-gate.mjs tests/depreciation-history.test.mjs   # 19/19
cd packages/runtime && node --test tests/depreciation-run-unit.test.mjs tests/reconcile-fa-unit.test.mjs tests/reconcile-fa.test.mjs   # 26/26
cd apps/web && pnpm --filter @clara/web e2e depreciation-walk && pnpm --filter @clara/web e2e fixed-asset-acquisition-walk   # 4/4, 8/8
pnpm typecheck && pnpm lint   # exit 0 / exit 0
```

**Integration evidence:** merge commit `ede1df83` (PR #954); db estate battery `depreciation-history` **19/0/0** on `rigint`, chain 0001→0233 (228 migrations, 2 clusters); `apps/web` unit suite 4168/4166/0 fail/2 skip.
