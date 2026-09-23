# Wave 3, Lane 05, Ticket #909 — the plan-overlap advisory gains a sibling-plan arm

Branch: `riders/w3-lane05` (worktree `C:\Users\zhant\Desktop\clara-wt\655`).
Base: `ffe63a0dd084e99b84c1368119845be273c421ce`.
Commits on this branch (`ffe63a0dd08..HEAD`):

```
9f2320187 feat(db): #909 the plan-overlap advisory gains a sibling-plan arm
4fe3873fa feat(db): #908 the shared plan-schedule validator gains the accrual entrance's yield wall
```

Only `9f2320187` is this ticket's; `4fe3873fa` (#908) was already landed before I started, per the
work order's "one implementer per ticket" rule.

## Ticket status: DONE

`gh issue view 909 --comments` was read before building. The live Agent Brief (re-scoped by the
2026-09-18 owner ruling on #788, recorded in the same thread) is exactly:

> `_plan_overlap_warning` gains a sibling-plan arm returning the same axis-and-message shape,
> naming every other live plan of the client whose basis lines intersect; the three plan-creating
> doors and their web forms render the widened warning unchanged. Still advisory.

Verified still live on this branch before building: `clara._plan_overlap_warning`
(`packages/db/migrations/0193_accounting_plans.sql:1155`) had not been recut by #908 (0280 recuts
`_assert_plan_schedule`, a different function, pinned as non-regression by 0280's own tail) and
still carried only the 0045 template arm; measured its live sha on this lane's database
(`f550d0b393f97f4124f14ecf9759bacfac9b002e4eea9bcce60ebacac829a074`) before writing anything.

## Seams tested

- `clara.create_accounting_plan` (0193/0223/0250) — the shared door, driven directly for all three
  plan kinds (`recurring_journal`, `reversing_journal`, `amortisation_schedule`).
- `clara.revise_accounting_plan` (0193) — the shared door's other caller.
- `clara.create_accrual_adjustment` (0222) — an OUTER door, driven once for real (not merely
  reasoned about) to prove a door genuinely surfaces the widened warning, per the wave-3
  addendum's "a door's behaviour is asserted only after it was driven" rule.
- `clara._plan_overlap_warning` itself, via `pg_proc.prosrc`, for the tail-posture re-proof.

Not independently driven: `clara.create_prepayment_schedule` (0223). It calls
`clara.create_accounting_plan` directly with `p_kind => 'amortisation_schedule'`
(0223:1282, its own comment: "THE PLAN. Through 0193's OWN door") — the exact same code path my
`p909.cross-kind` cell already drives directly. I judged a second, heavier drive (which needs a
posted prepayment, a document, a service period and an evaluator-version row) not to add real
coverage over that structural fact plus the direct test, matching #908's own precedent (which also
did not independently drive `create_prepayment_schedule`). Flagged under "Unverified" below rather
than asserted as covered.

## Acceptance criteria

1. **"A cell proves two overlapping plans on one account warn each other."**
   Evidence: `tests/plan-overlap-sibling-arm.test.mjs`, cell `p909.mutual` — PASS. Plan A is
   created (no warning, no sibling yet); Plan B is created on the same client sharing an account
   with A and its `overlap_warning` names A (`kind: 'accounting_plan_overlap'`, `plan_id` equal to
   A's id, `accounts` including the shared code). Plan A is then revised (through
   `revise_accounting_plan`, the shared function's *other* caller) and its own new
   `overlap_warning` now names B — proving the arm looks both ways, not merely "whichever plan was
   created last". Also covered from a different angle by `p909.cross-kind` (three plan KINDS —
   recurring/reversing/amortisation — warning about each other cumulatively, matching the ticket's
   own "an accrual plan and an amortisation plan on the same account" example) and
   `p909.accrual-door` (the real `create_accrual_adjustment` door's own answer names a pre-existing
   sibling plan).

2. **"A cell proves non-overlapping account sets warn about nothing."**
   Evidence: cell `p909.no-overlap` — PASS. A plan on entirely disjoint, fictional account codes
   (`9100`/`9200`) warns `null` even on a client that already carries an overlapping sibling
   (`clara._assert_journal_basis` does not validate account existence against `coa_accounts`, so
   fictional codes are a legitimate, minimal way to prove disjointness — verified by reading that
   function's full body, `packages/db/migrations/0178_accounting_work_journal_successor.sql:693`).
   A second client sharing the SAME account codes as the first client's plans also warns `null`
   (cross-client isolation, `p_client` scoping).

3. **"The existing template-arm cells stay green."**
   Evidence: `packages/db/tests/accounting-plans.test.mjs` run in full — **20/20 pass**, including
   `p640.schedule.overlap` (line 340), UNEDITED by this ticket, still asserting
   `kind === "adjustment_template_overlap"` and the exact pre-existing per-item shape. Also re-ran
   `accrual-adjustments.test.mjs` (21/21), `prepayment-schedule.test.mjs` (18/18),
   `accounting-plan-occurrences.test.mjs` (16/16) and #908's own `plan-schedule-yield-wall.test.mjs`
   (6/6) — all green, combined **61/61** — to prove the recut function has no effect beyond its own
   stated widening.

4. **"From-scratch apply."**
   Evidence: this migration applied cleanly at 268→269 migrations on the lane database
   (`clara_l05`), with its bimodal prestate correctly identifying this as a genuine FRESH APPLY
   (`raise notice '#909 prestate: clean -- ... measured pre-0281 pre-image ...'`) rather than a
   redo. I additionally exercised the REDO branch for real: `CLARA_MIGRATION_REDO=
   0281_plan_overlap_sibling_arm pnpm db:migrate`, which correctly took the "own prior output"
   branch and converged to the same functional body (new checksum
   `dcee43aa4e9290c0fc76defa5ec13d0fc45e467eb0589f7f5a0cf8ab0ca61fc1`). Per RIG.md, "lanes never
   need" a true from-scratch chain (0001→N on a disposable cluster) — that is the integrator's own
   proof, not this lane's.

## Migration

`packages/db/migrations/0281_plan_overlap_sibling_arm.sql` (reserved number, used; house shape
followed: header, prestate, `§A` recut, `§T` tail).

**Prestate pins**, all MEASURED on this lane's rig (`clara_l05`, 127.0.0.1:55745) at 268 migrations
(`0001→0280`), moments before applying, via a throwaway node script against `pg_proc` (never
transcribed from an older migration's header):

| function | sha256(prosrc) |
|---|---|
| `clara._plan_overlap_warning(uuid,jsonb)` | `f550d0b393f97f4124f14ecf9759bacfac9b002e4eea9bcce60ebacac829a074` (the post-0193 body — unmoved through 0222, 0223, 0250 and 0280, none of which recut it) |
| `clara.create_accounting_plan(...)` (non-regression) | `84b67058244bfe795245ee224733bd0b09940331b1cf75f4cb6654d84e88d6c4` |
| `clara.revise_accounting_plan(...)` (non-regression) | `87c9f1e9bcf493493dd805585ade921b679afda97a62daa18334ef61258f431f` |
| `clara._accrual_plan_core(...)` (non-regression) | `b3bd10065ed7a117ff3a324eff7ebebfcd06adaac38300fc9d77b99ef1759da8` |

The prestate is bimodal/redo-tolerant (recognises either the measured pre-image or its own prior
output by token) per the wave-3 addendum; **both branches were genuinely exercised** (fresh apply,
then a real `CLARA_MIGRATION_REDO`), not merely reasoned about.

**Change.** `clara._plan_overlap_warning` (same 2-argument signature, unchanged) gains a second
`UNION ALL` arm scanning `clara.accounting_plans` joined to its live (`superseded_at is null`)
`clara.accounting_plan_revisions` row, for every OTHER `active`/`paused` plan of the same client
whose basis lines intersect the basis being evaluated. Both arms merge into the one `templates`
list already rendered by the three plan-creating doors and their web forms (none of which branch on
`kind`, so none needed a code change). Self-exclusion is by basis identity
(`r.basis is distinct from p_basis`), since every caller already writes the row a call is FOR
before reaching this function; the accepted limitation (two independent, byte-identical bases would
hide each other) is stated in the migration's own header, not hidden.

**Tail** re-reads: both arms present by token, the three callers byte-for-byte unmoved, and the
full posture (owner `clara_fn_owner`, `SECURITY DEFINER`, `search_path=clara, pg_temp`, `STABLE`
volatility, owner-only ACL `{clara_fn_owner=X/clara_fn_owner}`) unmoved.

**Vacuity control** (house convention for a cell/migration whose whole deliverable is provable
behaviour): reverted the live function to the exact pre-#909 body via a throwaway script, re-ran
`plan-overlap-sibling-arm.test.mjs` — **6 of 7 cells failed** (`p909.mutual`, `p909.cross-kind`,
`p909.status`, `p909.combined-with-template`, `p909.accrual-door`, `p909.tail`); the 7th
(`p909.no-overlap`) is a negative case both the old and new bodies correctly satisfy and passed
under both, as expected. Restored the new body byte-for-byte from the migration's own `§A`, re-ran
the whole battery green (27/27 including the pre-existing `accounting-plans.test.mjs`), then
performed the real `CLARA_MIGRATION_REDO` described above.

## Gates, with counts

- **Test files added**: `packages/db/tests/plan-overlap-sibling-arm.test.mjs` (7 cells) — run with
  the full gate chain (`node --test --test-concurrency=1 $GATES tests/plan-overlap-sibling-arm.test.mjs`,
  `$GATES` = the exact `--import ./tests/*-preintegration-gate.mjs` list from `package.json`'s own
  `test` script, now including this file's own new gate) — **7/7 pass**.
  `packages/db/tests/plan-overlap-sibling-arm-preintegration-gate.mjs` is the gate module itself
  (not a test file).
- **Re-run for regression** (not required by the ticket, run anyway given the shared function):
  `accounting-plans.test.mjs` 20/20, `accrual-adjustments.test.mjs` 21/21,
  `prepayment-schedule.test.mjs` 18/18, `accounting-plan-occurrences.test.mjs` 16/16,
  `plan-schedule-yield-wall.test.mjs` (#908's own) 6/6 — combined with mine, **88/88 pass**.
- **`operation-census.test.mjs` / `rig-isolation.test.mjs`**: NOT run. Work-order rule 8 asks for
  these "if you added SQL functions"; this ticket recuts one EXISTING function and mints none,
  grants nothing new (ACL stays owner-only, identical to before), matching #908's own precedent
  (its README section: "No rig-meta cohort: 0280 mints no new function"). Documented here rather
  than silently skipped.
- **`pnpm typecheck`**: PASS, exit 0 (`apps/web` and `packages/runtime`; `packages/db` carries no
  typecheck script).
- **`pnpm lint`**: PASS, exit 0 (repo-wide, all three lint-bearing workspaces).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (wave-3 addendum's own rule): PASS, exit 0.
- **`apps/web` whole unit suite / browser walks**: not run — this ticket touches no file under
  `apps/web`.
- **`packages/runtime`** gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`): not run —
  this ticket touches no file under `packages/runtime`.

## Docs

- `packages/db/README.md`: new `## 0281 — the plan-overlap advisory gains a sibling-plan arm (#909)`
  section (context, what changed, self-exclusion rationale, prestate/tail pins, vacuity/redo
  evidence, explicit out-of-scope list), in the same commit as the migration.
- `packages/db/package.json`: the new gate-chain import added at the end of the `test` script, in
  migration order (after 0280's own entry).
- `CONTEXT.md`: not touched. The original 0045-template arm (0193) added no CONTEXT.md entry either
  — overlap-warning behaviour is documented in the migration's own header and in
  `packages/db/README.md`, matching that precedent; #929 ("blueprint and vocabulary") is the ticket
  that owns any domain-vocabulary decision once the 0045 lane closes.

## Successor contract

None. #909 adds no door, no wire shape, and touches no frozen chat or Work tool surface — the three
existing plan-creating doors are unchanged (pinned byte-for-byte in the migration's own
prestate/tail) and already reachable exactly as before. Nothing here is something a `chatTurn`/
`claraWork` tool would need spelled out.

## Follow-ups worth filing

- `clara.create_prepayment_schedule` (the third outer plan-creating door) was not independently
  driven in this ticket's own battery (see "Seams tested" above). It is structurally proven to
  reach the same code path via a direct code citation plus a same-path test through
  `create_accounting_plan`, but a future review pass could add one real drive of it for full
  door-level symmetry with `create_accrual_adjustment`.
- The transitional `kind` naming (`'adjustment_template_overlap'` winning over
  `'accounting_plan_overlap'` when both arms match at once) is explicitly owned by #929
  ("blueprint and vocabulary", which drops the template arm entirely) — no new ticket needed, just
  flagging that #929's implementer should read this migration's header before recutting the same
  function again.

## Unverified

- The "hosted census the same day found ZERO rows in `clara.adjustment_templates`" fact, cited in
  this migration's header and in the README section as part of the rationale for the `kind`
  precedence choice, is the OWNER'S OWN #788 ruling comment (quoted verbatim from
  `gh issue view 788 --comments`), not something I independently re-measured on hosted from this
  lane rig. Stated here as attributed, not re-verified.
- A true from-scratch migration chain (`0001→0281` on a disposable cluster) was not run from this
  lane, per RIG.md ("the integrator runs the from-scratch proof on a disposable cluster. Lanes
  never need it"). What I proved instead: a genuine fresh-apply on this already-268-migration rig,
  plus a genuine redo — see "Acceptance criteria" #4 above.
- `clara.create_prepayment_schedule`'s own door was not driven directly (see "Follow-ups").
