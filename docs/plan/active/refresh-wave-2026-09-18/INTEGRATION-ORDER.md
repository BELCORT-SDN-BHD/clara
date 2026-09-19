# Integration order — wave 2026-09-18 (for the integration worker; the orchestrator reviews every step)

Runs ONLY after every lane has passed its recheck (`reports/<n>-recheck-1.json` verdict `accept`, or the orchestrator
has ratified what was deliberately left). Shape copied from `../refresh-wave-2026-09-15/reports/integration-merge.md`,
`integration-rebase.md` and `successors-final.md` — read all three first.

## 0. Rig for integration — BUILT 2026-09-19 15:30 by the orchestrator
- `origin/main` re-fetched at 15:28: still `abcc5030` (0 commits ahead of the base) — no rebase, no renumber; 0225–0233 are free.
- Worktree `C:\Users\zhant\Desktop\clara-wt\int` on `integration/wave-2026-09-18` at `abcc5030`; deps installed (see `scratchpad/rig/int.install.log`).
- Clusters online: `rigint` 127.0.0.1:**55720** db `clara_int` (db-estate chain + batteries), `rigrt` 127.0.0.1:**55721** db `clara_rt` (runtime unit suite + World legs). Both fresh (0 `clara%` roles before the chain — verify before migrating). Playwright triple for integration walks: https://127.0.0.1:3400 / 3401 / 3402.

### 0.1 (original plan)
- Worktree `C:\Users\zhant\Desktop\clara-wt\int` on branch `integration/wave-2026-09-18` from **current `origin/main`**
  (re-fetch first: if `origin/main` moved past `abcc5030`, note every commit it gained and every file both sides touched;
  the wave's migration numbers 0225–0233 must still be free — if not, renumber ONCE here with re-measured pins, and
  record it as 2026-09-15 §3.4 did).
- A FRESH PG17 cluster `rigint` on port **55720**, db `clara_int`, created with `mkrig.sh` (never a cluster that has
  seen a clara chain: 0154 pins the cluster-wide `clara%` role count), plus a second fresh cluster `rigrt` on **55721**
  for the runtime World legs (they fight the db-estate suite over `packages/runtime/.output` and T10b, #866).
- Node 22 via the pnpm PATH; `CI=true pnpm install --frozen-lockfile --prefer-offline` after the lockfile step below.

## 1. Merge order (git merge, never rebase; every reviewed SHA stays reachable)
No-migration branch first, then migration order: `impl/642-chat-stream-admission` → `impl/655-invoice-bill` (0225) →
`impl/657-bank-existing-booking` (0226) → `impl/651-assets-depreciation` (0227) → `impl/656-opening-ledger` (0228) →
`impl/636-work-batch` (0229) → `impl/658-knowledge-retrieval` (0230) → `impl/659-firm-home` (0231) →
`impl/660-dashboard-cash-profit` (0232) → `impl/635-firm-commercial-settings` (0233).

## 2. Conflict rules (DECISIONS §3, §6, §6.1)
- Shared registration files: **union at the sorted position** — `apps/web/test/manifest.txt` (sorted whole file),
  `apps/web/messages/en.json` (strict duplicate-key parser, never `JSON.parse`), `apps/web/e2e/e2e-fixture-ownership.test.ts`
  (`LANE_MOCKS` ASCII-sorted; `SHARED_RPC_VERBS` unions per verb), `packages/db/tests/rig-meta.mjs` (cohorts in
  MIGRATION order; the `];` hazard), `packages/db/package.json` gate chain (MIGRATION order after
  `preview-invite-preintegration-gate.mjs`), `.github/actions/db-live-gates/action.yml` (each ticket's stated step
  order; no dangling `\`), `CONTEXT.md` (both term groups; the ratified terms of §3.1; one entry per term).
- `apps/web/e2e/serve-built.mjs`: **dispatch order is SEMANTIC** (§6.1 #657) — bank-match above home-board's
  `EMPTY_RPCS` arm; every lane's own header comment states where it must sit; verify the order after the union.
- Owned files take the owner's version with the other side's one-liner grafted (DECISIONS §3): `work-detail.tsx`
  (#658 owner; #655 one link block; #636 one row), `client-workspace-overview.tsx` (#660), `useUploadQueue.ts` (#642
  owner; #636's transport field), `journals/api.ts` (#655 owner; #656 one field + badge), `home-board-walk.spec.ts` +
  `home-board-mock.mjs` (both append; #902's `debt` row untouched), `lib/navigation/tree.ts` (one line each),
  `lib/firm/needs-you.ts` (no new kind — refuse any), `client-register-list.tsx` (#659).
- `apps/web/package.json` + `pnpm-lock.yaml`: take each branch's `package.json` additions (recharts from #660;
  `@shadcn/react` from #642 if D6 step 2 landed; combobox/popover deps from #657 if any), then regenerate the lockfile
  ONCE: `pnpm install --lockfile-only`, then the frozen install. Never hand-merge the lockfile.
- `frozen-workflows.json`: take `origin/main`'s file verbatim, finish the code merge, then
  `node scripts/check-frozen-workflows.mjs --update` locally (never under `CI=true`); `--compare-base origin/main` must
  report additions only (the retired section byte-identical).
- `docs/PRD.md` / `docs/ARCHITECTURE.md`: `git diff --name-only origin/main -- docs/` must be EMPTY except the wave
  folder; if a branch edited a blueprint, revert that hunk and record it in the integration report.

## 3. Gates after the ten merges (all LOCAL; hosted evidence: none)
1. From-scratch chain 0001→0233 on `rigint` (measure `clara%` roles = 0 before); `pnpm db:seed`.
2. `pnpm typecheck`, `pnpm lint` (incl. freeze lint against `origin/main`, dead-citation check, message keys, manifest).
3. db estate suite (`pnpm --filter @clara/db test`) on `rigint` — every wave cohort present, zero frontier skips for
   the nine new batteries; `operation-census.test.mjs`, `rig-isolation.test.mjs` (no reset flags).
4. runtime unit suite on `rigrt` (`packages/runtime`: `pnpm test`), then every registered World leg incl. the new ones
   (`.github/actions/db-live-gates/action.yml` order) and the two-build cutover leg; `check-parts-parity.mjs`.
5. Whole `apps/web` unit suite; then the browser suite (`pnpm --filter @clara/web e2e`) — ONE lane at a time on the
   host (contention flakes, #864/#869); every new walk plus the shell-migration and firm-navigation walks.
6. Write `reports/integration-merge.md` in the 2026-09-15 shape (merge table, conflict resolutions file by file, gate
   counts with commands), then STOP for the orchestrator's review before §4.

## 4. The successor cut (ONE commit after §3 is green; DECISIONS §1)
- `chatTurn_v21` (five files copied from v20's shape): tools `start_trade_invoice_work` (#655 stanza,
  `lib/trade-invoice-basis.ts`), `run_depreciation_period_for_client` (#651 stanza, `lib/depreciation-run.ts`), and
  #658's bounded knowledge preload (conditional — drop to contract-only if it destabilises v21 and say so). Engine stamp
  `llm-openai:<modelId>:chatturn-v21`. Part kinds: only what a cut stanza needs and no existing kind carries; register
  the reader in `apps/web` in the same commit (parity hold).
- `claraWork_v5` (six files): #658's step + two tools + `knowledge_read_failed` terminal + drift replan +
  `lib/capability-registry-v2.mjs`; riders #847 (`lib/work-trace-bounds.mjs` stanza from #658's report) and #882(a)
  (one errors row); the bundle digest covers each tool's JSON schema and declared dependencies (ARCHITECTURE:435-445).
- `registry.ts`: import/export both, repoint the two pins, keep every prior version exported and in `workflowBodies`.
- Re-run §3 steps 2, 4 (all World legs + two-build cutover + parts parity) and the chat/Work browser walks; write
  `reports/successors-final.md`; the cut is reviewed with the three lenses like a ticket.

## 5. PR
- Push `integration/wave-2026-09-18`; open the PR against `main` titled "Wave 2026-09-18: #635 #636 #642 #651 #655 #656
  #657 #658 #659 #660 (migrations 0225–0233; chatTurn_v21 / claraWork_v5)" with the base commit pinned in the body,
  the ten tickets, the gate counts, the blueprint-drift list and the follow-ups; end with the attribution lines.
- `ci` must be green (lint incl. gitleaks, build, db-estate, db-live-gates, storage). Merge only when green.
- After merge: delivery comments on the ten tickets, follow-up issues filed (`needs-triage` + proposed state), PROGRESS.md
  updated, `frozen-workflows.json --lock-deployed` only at the hosted release ceremony, which waits for the owner's go.
