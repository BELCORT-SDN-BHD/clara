# Wave 2 · Lane 06 · Ticket #894 — DONE (harden `uq_onboarding_plans_one_open_firm`'s predicate)

Branch: `riders/w2-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\656`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`
was empty at start (first ticket in the lane; database `clara_l06` still at 229 files /
`0234_legal_enforcement_mode`) and now shows one commit:

```
4d23d3c5 fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

`git status` in the worktree is clean after the commit.

## Ticket

#894 "Harden `uq_onboarding_plans_one_open_firm`'s predicate" — Agent Brief (comment
`2026-09-17T17:00:49Z`, `65fde7f3`), re-verified live on this branch before building (the index,
`clara.claim_paid_firm`'s replay arm at 0186:1555-1557, and 0218 §0.6's own residual all still read
exactly as the brief describes). Summary: make "a firm holds exactly one firm-scope onboarding
plan for life" an index predicate, so the claim door's read becomes structurally single-row without
being recut. Client-scope plans and how a firm-scope plan is created/closed are explicitly out of
scope.

## Seams tested at

- **The catalog itself** — `pg_index` / `pg_get_indexdef` for the index's committed identity;
  `pg_proc.prosrc` for `clara.claim_paid_firm`'s byte-identity.
- **A raw INSERT into `clara.onboarding_plans`** — the exact surface the widened predicate governs;
  proven for a second OPEN plan and, new to this ticket, a second plan over an already-CLOSED
  (cancelled) first one.
- **`clara.claim_paid_firm` end to end** through the real checkout doors
  (`clara.open_checkout_intent`, the Stripe applier, `clara.claim_paid_firm` itself) — the public
  door the ticket's whole justification rests on, never its internals.

## Migration

`packages/db/migrations/0255_onboarding_plan_firm_uniqueness.sql` — applied cleanly to `clara_l06`
via `pnpm db:migrate` on top of the lane's already-migrated 0001–0234 chain (230 files total after
apply; the full from-scratch proof through 0255 is the integrator's, per RIG.md). Prestate/tail
notices from the real apply:

```
[notice] #894 prestate: clean -- clara.onboarding_plans carries firm_id/scope_kind/state;
  uq_onboarding_plans_one_open_firm is live at its pinned pre-image and
  uq_onboarding_plans_one_firm is not yet taken; uq_onboarding_plans_one_open (0017) is untouched
  at (firm_id, client_id); exactly one function body (clara._create_firm_core) inserts a
  firm-scope plan; clara.claim_paid_firm is at its pinned pre-image; and no firm holds more than
  one firm-scope plan in any state.
[notice] #894 tail: OK -- uq_onboarding_plans_one_open_firm is gone; uq_onboarding_plans_one_firm
  is a partial UNIQUE index on clara.onboarding_plans(firm_id) where scope_kind='firm' alone, with
  no state term in its predicate, ... clara.claim_paid_firm is byte-identical to its pinned
  pre-image ... clara._create_firm_core is still the one and only writer of a firm-scope plan row.
applied 0255_onboarding_plan_firm_uniqueness · backend pid 356220
migrate: 1 new migration(s) applied · 230 total · target 127.0.0.1:55746/clara_l06
```

**Prestate pins, measured on `clara_l06` at frontier 0234, PostgreSQL 17.11, moments before
applying:**

- `clara.claim_paid_firm(uuid,text)` `sha256(prosrc)`:
  `7ac34d66a04f47e9e6647a78ca41763ec8f87595449ac80d14f9b454aa5029d7`
- Old index's live `pg_get_indexdef`:
  `CREATE UNIQUE INDEX uq_onboarding_plans_one_open_firm ON clara.onboarding_plans USING btree
  (firm_id) WHERE ((state = 'open'::text) AND (scope_kind = 'firm'::text))`

Both are hardcoded constants in the migration's prestate/tail `DO` blocks (`v_pin_claim`,
`v_pin_old_def`), re-measured and asserted equal at apply time — not transcribed from memory.

No redo was needed: the file applied cleanly on the first attempt, so `CLARA_MIGRATION_REDO` was
never used.

**Rename, not a same-name widen.** `uq_onboarding_plans_one_open_firm` → `uq_onboarding_plans_one_firm`,
predicate narrowed from `state='open' and scope_kind='firm'` to `scope_kind='firm'` alone —
documented as a deliberate choice in the migration's own header (the old name's `_one_open_`
segment would misdescribe the new any-state invariant). Every live reference to the old name was
updated in the same commit (below).

## Acceptance criteria

- **[x] AC1 — the prestate block measures, and refuses to apply unless, no firm holds more than
  one firm-scope plan in any state.** Evidence: migration §0.7 (`packages/db/migrations/
  0255_onboarding_plan_firm_uniqueness.sql`), grouping `clara.onboarding_plans` by `firm_id` over
  `scope_kind='firm'` with **no** state filter, `raise exception ... errcode='CLR10'` on a
  violation. Proven live by the successful apply's own `#894 prestate: clean` notice above (the
  wall ran, found zero violations, and let the file proceed) — re-running the exception path
  itself would require corrupting this database's real data, which no lane may do (RIG.md: never a
  second from-scratch chain, never a reset).
- **[x] AC2 — a cell proves a second firm-scope plan for the same firm is refused, including when
  the first is closed.** Test: `p894.plans.any_state a second firm-scope plan for the same firm is
  refused in ANY state, including when the first is CLOSED` in
  `packages/db/tests/onboarding-plan-firm-uniqueness.test.mjs` — **PASS**. It plants a firm-scope
  plan already `state='cancelled'` (satisfying `ck_onboarding_plans_terminal`), then a second
  firm-scope insert for the same firm gets `23505` naming `uq_onboarding_plans_one_firm`; a
  CLIENT-scope plan on the same firm is admitted, untouched by this index.
- **[x] AC3 — a cell proves the claim door's replay arm still answers the original receipt.** Test:
  `p894.claim.replay clara.claim_paid_firm's replay arm still answers the ORIGINAL receipt under
  the widened index` — **PASS**. Drives a real registration through `liveCheckout` → a paid Stripe
  webhook (`deliver`) → `claimPaidFirm` (first claim mints a firm) → `claimPaidFirm` again (the
  `v_req.firm_id is not null` replay arm at 0186:1555-1557) and asserts the SAME `firm_id`/`plan_id`
  come back with `replay:true`, plus exactly one firm-scope plan row exists for that firm.
- **[x] AC4 — the migration applies from scratch and its tail re-reads the committed index
  definition.** Applied cleanly (see apply log above) on top of the lane's from-scratch chain;
  tail §2 re-reads `pg_get_indexdef` off `pg_index` (not the file's own DDL text) and asserts the
  exact committed string, plus that no `state` token survives anywhere in the predicate. Re-proven
  outside the migration by test `p894.index.identity the committed index carries the new name and
  the widened predicate; the old name is gone` — **PASS**: old name gone
  (`to_regclass` null), new definition equals
  `CREATE UNIQUE INDEX uq_onboarding_plans_one_firm ON clara.onboarding_plans USING btree (firm_id)
  WHERE (scope_kind = 'firm'::text)` byte for byte, and the untouched 0017 client-scope sibling
  still reads `(firm_id, client_id)`.

What was deliberately left: no rig-meta.mjs cohort entry for this migration. Precedent checked —
`promotion-dup-open-wall` (0148/0153), the other index-only structural-wall migration in this
tree, has no `rig-meta.mjs` entry either (`grep`-confirmed zero hits for its index names there);
`rig-meta.mjs` cohorts track the function/table PUBLIC-operation census, which this file does not
touch (no new function, no new table, no new grant — one index, dropped and replaced).

## Gates

- **`packages/db/tests/onboarding-plan-firm-uniqueness.test.mjs`** (new, 3 cells): focused run
  before the migration was applied → all 3 failed loudly for the right reason (`the #894
  onboarding-plan-firm-uniqueness lane is required for a focused run`, from the file's own gate,
  since `onboarding_plan_firm_uniqueness$` matched no `clara.schema_migrations` row yet). After
  applying 0255: focused run → **3/3 pass**. With the full 51-entry preintegration-gate chain
  (`node --test --test-concurrency=1 $GATES tests/onboarding-plan-firm-uniqueness.test.mjs
  tests/firm-setup.test.mjs`) → still **3/3 pass** (part of a combined 20/20).
- **`packages/db/tests/firm-setup.test.mjs`** (touched: cohort probe + `p648.plans.one_open` →
  `p648.plans.one_firm`): focused, no gates → **17/17 pass**. With the full gate chain (combined
  with the file above) → **20/20 pass, 0 fail**.
- **`packages/db/tests/checkout-convergence.test.mjs`** (not touched, but the heaviest existing
  consumer of `claim_paid_firm`, including two of its own replay/recovery cells cc.35/cc.36):
  focused run → **36/36 pass**, no regression from the rename/widen.
- **`packages/db/tests/operation-census.test.mjs`** and **`rig-isolation.test.mjs`**: this ticket
  added no SQL function, so these were not a required gate — run anyway, with the full gate chain,
  for extra assurance. `operation-census.test.mjs` → **10/10 pass**. `rig-isolation.test.mjs` →
  **32/33 pass, 1 skip** (`T19 poison-role`, the one destructive cell, correctly SKIPped because
  `CLARA_RIG_ALLOW_RESET` is unset — RIG.md: never set it), **0 fail**.
- **`pnpm --filter @clara/db lint`** (`eslint .`) → clean, no findings.
- **`pnpm lint`** (repo-wide) → exit 0, all packages' lint/self-test batteries pass (apps/web's
  token-contrast, manifest, message-key and ui-add-guard self-tests all green; not touched by this
  ticket but confirmed non-regressed).
- **`pnpm typecheck`** (repo-wide) → **fails, but for a reason unrelated to #894 and pre-existing
  on the base commit**: `apps/web/components/documents/document-kind-dialog.tsx(95,22): error
  TS2552: Cannot find name 'DOCUMENT_KINDS'` (+ one downstream implicit-`any`). `git status`
  throughout this session shows zero files touched under `apps/web`; this lane's `git log
  23cfad947b..HEAD` was empty before my one commit, all seven of whose files are under
  `packages/db`. `packages/runtime typecheck` (the other TS project) reports `Done`. This is a
  base-branch defect, reported as such rather than fixed (out of this ticket's scope, work-order
  rule 5) — worth a follow-up ticket for whoever touches that dialog next, or for the integrator.
  `packages/db` carries no `typecheck` script (plain JS), so this gate is structurally
  inapplicable to this ticket's own files either way.
- `apps/web` unit suite / e2e walks: not run — this ticket touches no file under `apps/web`.
  `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`): not run — this
  ticket touches no file under `packages/runtime`.

## Docs

- `packages/db/README.md` — the "Firm setup (0218, journey A5)" section's closing paragraph now
  describes 0218's index as historical and adds a new paragraph naming #894/0255, the new index,
  its widened predicate, and that `claim_paid_firm` and the 0017 sibling are untouched.
- `packages/db/tests/README.md` — the `firm-setup.test.mjs` paragraph now names the renamed index
  and points at the new file's cell for the any-state regression; a new "Onboarding plan firm
  uniqueness (#894, `0255_onboarding_plan_firm_uniqueness.sql`)" section describes the new test
  file's frontier gate and its three cells.
- `CONTEXT.md` — not touched: no new domain term is introduced (this hardens an existing
  invariant; "Onboarding plan" is already defined there and its firm-scope-uniqueness fact was not
  previously stated there to begin with, so there is nothing stale to correct).

## Successor contract

None. `clara.claim_paid_firm` is a checkout/registration-claiming door, not a frozen chat or Work
tool body or closure module, and this file does not touch it (pinned unchanged, pre- and
post-image). Nothing here is a surface a frozen chat or Work tool would need.

## Unverified

- Whether any hosted/production database has ever accumulated a real firm with more than one
  firm-scope plan in a non-open state — the prestate's own any-state duplicate check is the
  authoritative answer for THIS database (`clara_l06`, zero violations, evidenced above); I have
  no access to hosted catalog state from this lane and make no claim about it beyond what the
  migration itself would refuse to apply over.
- The pre-existing `apps/web` typecheck failure's root cause and history (whether it predates the
  wave-2 base commit or was introduced by a wave-1 lane's merge) — flagged as evidence
  (file:line, error text, and the confirmation that no file of mine touches `apps/web`), not
  diagnosed further, since it is out of this ticket's scope.
