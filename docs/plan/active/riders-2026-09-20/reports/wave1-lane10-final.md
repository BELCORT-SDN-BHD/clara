# Riders wave 1 — lane 10 final report (#981, #980)

**Branch** `riders/w1-lane10` · **worktree** `C:\Users\zhant\Desktop\clara-wt\660` · cut from
`dd3f8f1d`. `origin/main` has since moved to `e7f0a10a` (two docs-only commits, #1008 as-run +
grill + PROGRESS); they touch no file this lane touched.

```
1b219f03 test(runtime): #980 the harness's ask_question shape, and the trade invoice's park and cancel
14b67ddf fix(runtime): #981 the refusal carrier, measured over the real HTTP wire
eb542765 feat(runtime,web): #981 one structured-detail carrier, and the folds it retires
ba4071de test(runtime,web): #981 the generic structured-detail carrier, red first
```

14 files, +1049 / −205. Working tree clean. Nothing pushed, no PR, no GitHub write.

---

## #981 — one generic structured-detail passthrough — **DONE**

**Still live on main before building.** Verified, not assumed: `packages/runtime/src/workRoutes.ts`
carried the three-reason constraint fold (`reason === "invalid_basis" || … || "invalid_claim"`) and
a bespoke `party_ambiguous` catch inside the trade-invoice route that re-parsed the raised detail
and built `{error, field, reason, detail:{candidates}}` of its own. Both cited `lib/wire.ts`
"discarding every detail key but `reason`" — false since #629 added `parseRefusalDetail`, and never
applicable to these bodies anyway (`apps/web/lib/work/api.ts` parses this JSON itself).

| AC | Verdict | Evidence |
|---|---|---|
| A field-scoped constraint-token refusal is still readable by every existing `reason`-keyed caller exactly as today | done | `981.route: the carrier is ADDITIVE — every key a current reader reads still carries its value` drives `LEGACY_BODIES`, the twelve 400/409 bodies this map built before the change, each beside the error that raises it: every promoted key equals its old value AND the key set is exactly the old one plus `detail`. `981.route: the three constraint folds are the only typing left…` pins all three tokens. That cell was GREEN before the implementation as well as after — it is the compatibility guard, not a new claim |
| The trade-invoice ambiguous-party list still renders inline exactly as today, read through the generic carrier | done | `981.route: party_ambiguous rides the SHARED responder, candidates and all` (same `error`/`field`/`reason`, `detail.candidates` verbatim); `981.web: the trade invoice's candidates are the SAME carrier, typed once`; browser walk `e2e/trade-invoice-walk.spec.ts` 12 passed (1.2m) on the lane triple, which includes the inline candidate choice |
| A refusal carrying a structured detail key not seen before reaches a web caller with no new route-layer fold | done | `981.route: a detail key never seen before reaches the wire with NO new fold` (`clarified_by` is named nowhere in `workRoutes.ts`; `max`/`length` are NUMBERS, which `detailField` could never have read) and `981.web: a detail key this file has never heard of reaches the caller` |
| The three constraint folds and the trade-invoice candidate fold are gone or reduced to the minimum typing layered on the carrier | done | The trade-invoice fold is **gone**: `sendAdmissionError(res, err, "trade invoice admission", { fieldDefaults: TRADE_INVOICE_FIELD_DEFAULTS })`. What is left is one row of DATA (`party_ambiguous → "invoice.counterparty"`), because the door raises that refusal with no `field` at all (0225:961-963, measured). The three constraint folds are reduced to the named set `CONSTRAINT_FOLD_REASONS` with the true rationale |

**Deliberately left.** The folds could not be *removed*: AC1 requires `reason` to stay the
constraint token and "changing any refusal's `reason` token vocabulary" is out of scope. They also
fold **by name, never by presence** — `invalid_adjustment`, `stale_basis` and
`adjustment_lines_mismatch` carry a `constraint` too and have always ridden back under their own
names; a generic "fold whenever a constraint exists" would have moved three vocabularies silently.
Pinned by the second half of the fold cell. 403 and 404 carry **no** carrier: a 404 here answers
both "no such Work" and "a Work that is not this firm's", and a typed reason on it would loosen an
access answer (standing ruling). Pinned by `981.route: 403 and 404 stay OPAQUE`.

**Note for the reviewer — the file header's own claim was already wrong.** `workRoutes.ts`'s WIRE
FIELD PATHS note says `invalid_adjustment` "folds to its `constraint` exactly as `invalid_basis`
does". The code never did that, before or after this change. I did not move the token (out of
scope); the discrepancy is now pinned by a cell rather than left to be discovered again.

---

## #980 — the trade invoice's park arm and a commit-window cancel — **DONE**

**Still live on main before building.** Verified: `tests/work-journal-serve.mjs` carried exactly
`post` and `narrate`; `grep -n cancel tests/trade-invoice-e2e.mjs` found none.

| AC | Verdict | Evidence |
|---|---|---|
| The shared harness supports a clarifying-question shape alongside `post` and `narrate` | done | `CLARA_WORK_TEST_SCRIPT=ask_question` in `packages/runtime/tests/work-journal-serve.mjs`: ask once, park, resume only on a `tool-result` for `ask_question`. Input-driven, never a call counter |
| A trade-invoice test drives a replay landing while the Work is parked, converging to one outcome once answered | done | `tests/trade-invoice-e2e.mjs` **leg 6**: `[ti-e2e] 6 OK — parked on a question, replayed into the window, answered, ONE of everything`. It pins `awaiting_input`, the `["admitted"]` ledger and zero entries while parked; the parked replay as `replayed:true` on the same Work + invoice with no second task, no second invoice and NO re-asked question; then `completed` with 1 entry / 1 receipt / 1 invoice / 1 open item / `["admitted","posted"]`; then a FURTHER replay after the answer still naming the same Work |
| A trade-invoice test drives an explicit commit-window cancel, Work cancelled with no journal effect | done | **leg 7**: `[ti-e2e] 7 OK — cancelled inside the commit window; no journal effect (ledger: ["admitted"])`. `running` inside the hold → cancel 200 `{cancelled:true,status:"stopping"}` → `stopping` over the real route → terminal `cancelled` with `error.reason === "cancelled"` → 0 entries, 0 receipts, 0 open items, no `posted` status row. The invoice ROW survives (born in the admission transaction; a cancel is not a retraction) |
| Every existing `post`/`narrate` World test still passes unchanged | done, measured | `tests/work-journal-e2e.mjs` — the estate's ONLY `narrate` driver — **all 8 legs green in 41s**, its leg 4 being the `narrate` one. `post` is covered by trade-invoice legs 1–5 and work-journal legs 1,2,3,5,6,7,8 |

**Design choice worth flagging.** Leg 7 spawns `tests/work-cancel-serve.mjs` **unchanged** rather
than copying its gate-file hold into the shared harness. The ticket said "reusing the cancel idiom
another lane's test already has"; borrowing the whole bootstrap is the literal reading and leaves
the shared harness widened by exactly the one shape AC1 asks for. `spawnServe` gained an optional
second argument for it, and `childEnv` now deletes `CLARA_WORK_CANCEL_GATE`/`_HELD` so an inherited
gate cannot hold another leg's model.

**Vacuity controls** (this ticket's whole deliverable is tests). Each restored byte-for-byte and
the sha256 compared afterwards:

| # | Broken subject | Result |
|---|---|---|
| A | the harness's `ask_question` arm disabled | leg 6 reds: `the run never asked a question` (114s) |
| B | the cancel POST replaced by a stub that issues nothing | leg 7 reds: `the Work terminalises CANCELLED (got completed / null)` (62s) |
| C | the parked replay given a FRESH intent key | leg 6 reds: `the parked replay is a REPLAY, not a second admission` (29s) |

---

## Gates, with counts

| Gate | Result |
|---|---|
| `node --test tests/work-routes-unit.test.mjs` | 28 tests, **28 pass / 0 fail** (8 new) |
| `node --test` work-routes-unit + staff-expense-claim-unit + periodic-adjustment-unit + trade-invoice-unit | 79 tests, **79 pass / 0 fail / 0 skip** |
| `node --test tests/work-journal-db.test.mjs` (PGPORT 55750, clara_l10) | 23 tests, **23 pass / 0 fail / 0 skip** |
| `node --import ./test/bootstrap.mjs --import tsx --test lib/work/api.test.ts` | 26 tests, **26 pass / 0 fail** (5 new) |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | 4637 tests, 135 suites, **4635 pass / 0 fail / 2 skip**, 90.7s |
| `pnpm --filter @clara/web e2e trade-invoice-walk` (APP_ORIGIN 3590 / 3591 / 3592) | **12 passed**, 1.2m |
| `node tests/trade-invoice-e2e.mjs` | **all 7 legs green**, 33s (final run on the committed bytes) |
| `node tests/work-journal-e2e.mjs` | **all 8 legs green**, 41s |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, **no manifest diff**, 55 `use workflow` modules all frozen+registered |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |

Rig notes: the runtime had to be built once (`pnpm --filter @clara/runtime build`) and the Workflow
World bootstrapped once on `clara_l10` (`pnpm --filter @clara/runtime exec bootstrap`) before any
World leg could run. Per RIG.md that makes `rig-isolation.test.mjs` T10b red on this database
afterwards (#866) — this lane ran no `packages/db` test, so nothing was masked by it. No known
Windows-only red was hit. Nothing was "fixed" that was not this lane's.

## Two gate widenings, stated plainly

`tests/trade-invoice-e2e.mjs` and `tests/work-journal-e2e.mjs` both hard-gated `PGDATABASE` (and,
in the second file, a second parsed-DSN regex that disagreed with the first) to a fixed list that
does not include the riders wave's per-lane `clara_l<NN>`. Neither file could be run at all on a
lane rig. Both now admit `l\d{2}` beside what they already took; still loopback-only, still a
parsed-DSN equality check against the PG env, still fail-closed. **Every other lane spawning a
World e2e will hit the same wall** — `periodic-adjustment-e2e.mjs`, `staff-expense-claim-e2e.mjs`,
`accrual-e2e.mjs`, `plan-occurrence-e2e.mjs`, `prepayment-occurrence-e2e.mjs`,
`fixed-asset-acquisition-e2e.mjs`, `work-egress-e2e.mjs`, `work-cancel-e2e.mjs` and
`work-question-e2e.mjs` all carry the same fixed list. Worth one integration hunk rather than ten.

## Docs updated

- `packages/runtime/README.md` — two new sections: "#981 — one structured-detail carrier…" and
  "#980 — the shared World harness's third script, and the trade-invoice lane's park and cancel".
- `apps/web/README.md` — "#981 — the durable-Work refusal carrier, read once".
- The stale `lib/wire.ts` rationale is gone from `workRoutes.ts`, `trade-invoice-form.tsx` and four
  test comments (`work-routes-unit.test.mjs`, `work-journal-db.test.mjs`, and the three
  `trade-invoice-form*.test.tsx` fixtures).
- **No `CONTEXT.md` entry.** A carrier on an HTTP refusal body is wire mechanics, not the shared
  accounting/product vocabulary that file holds. Said so rather than adding a term to a file nine
  lanes are editing.

## Successor contracts

None. Neither ticket needed a chat-lane or Work-lane tool, and no frozen body or frozen closure was
touched (`check-frozen-workflows.mjs` shows no manifest diff).

## Follow-ups worth filing

1. **`workRoutes.ts`'s header claims a fold the code does not perform.** The WIRE FIELD PATHS note
   says `invalid_adjustment` "folds to its `constraint` exactly as `invalid_basis` does". It never
   has. Either the note is wrong or the periodic-adjustment lane's browser has been reading
   `reason:"invalid_adjustment"` where the note promised `present`/`integer_cents`/`iso_date` — and
   `apps/web/lib/work/journal-basis.ts`'s mapper was written against the note. Changing the token is
   out of #981's scope by its own "Out of scope" line; deciding which half is wrong is a ticket.
2. **The per-lane database gate belongs in one place.** Eleven standalone World e2es each carry
   their own `ALLOWED_DB` literal, and `work-journal-e2e.mjs` carries two that had already drifted
   apart. One shared `tests/local-db-gate.mjs` would make a new rig shape a one-line change instead
   of eleven, without loosening anything.
3. **Two World e2es still repeat the retired wire.ts rationale in comments** —
   `periodic-adjustment-e2e.mjs:546` and `work-journal-e2e.mjs:559`'s neighbourhood (the second was
   corrected here; the first was not). Left alone deliberately: editing a comment in a heavy World
   e2e obliges a full run of it under rule 8, and it buys nothing this wave.

## Unverified

- **Hosted evidence: none.** Everything above is local, on the lane rig (PGPORT 55750, `clara_l10`,
  Playwright 3590/3591/3592).
- The other nine World e2es that spawn the shared harness (`accrual`, `plan-occurrence`,
  `prepayment-occurrence`, `fixed-asset-acquisition`, `work-egress`, `periodic-adjustment`,
  `staff-expense-claim`, `intake-*`) were **not** run: they are gated to databases this rig does not
  have, and the runtime suite is the orchestrator's/CI's job by the base work order's rule 3. AC4 is
  measured on the one file that drives `narrate` and on `post` through two files; the rest rests on
  the branch guard (`SCRIPT === "ask_question"`, a value no existing caller sets) and on `narrate`
  returning before it.
- `packages/db` was not touched, so no db battery, `operation-census.test.mjs` or
  `rig-isolation.test.mjs` run is claimed.
