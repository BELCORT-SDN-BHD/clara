# Wave 3 · Lane 06 · Ticket #986 — make a re-read opening document re-parsable

Branch: `riders/w3-lane06`. Base: `ffe63a0dd084e99b84c1368119845be273c421ce` (integrated wave-2 head).
Commits (this ticket — `git log ffe63a0dd08..HEAD`, newest first, the three below mine are #919/#936):

```
c9de7580a feat(web): #986 the re-read conflict stops being a dead end
cbc95e73b feat(runtime): #986 the way forward from source_reread_since_parse
951a56a8f feat(db): #986 a re-read opening document becomes re-parsable
```

Status: **done**.

## The ticket, and what the rig actually showed

#656 built the opening-ledger-source flow and filed this as a residual (R4 / F4): a tie document
read a second time makes the re-parse refuse `source_reread_since_parse`, and "nothing brings the
targets onto the new reading". Two things the brief did not say, both **measured on this rig before
a line was written**:

1. **It is worse than a dead end — the basis is bricked.** `clara.approve_opening_seed` (0017)
   re-runs `clara._assert_opening_target_fact` over every target of a tied basis, and
   `clara._assert_opening_extraction_ref` refuses a citation whose extraction carries
   `superseded_by`. So after a re-read the APPROVAL refuses CLR31 `extraction_not_accepted` as
   well. The basis can be neither re-parsed nor approved; the only escape was to cancel it and
   start another, discarding every drafted opening item. Driven, not asserted, in
   `p986.reread.approve_end_to_end`.
2. **A fresh op key is NOT the fix.** Handing `record_opening_targets_parsed` a random key after a
   re-read SUCCEEDS and leaves the old targets standing beside the new ones — a second reading
   mints new region ids, `line_key` is `r:<region_id>`, and `uq_opening_tb_targets_key` is on
   (seed_id, line_key). A three-line trial balance would carry six targets and tie to nothing.
   (`packages/db/tests/opening-ledger-source.test.mjs`'s `p656.tie.stale_extraction` already
   records the succeeding half of this, with a fresh `opk()` key.) That is why the remedy has to
   RETIRE the superseded set, and it is the reason the ticket's "load-bearing idempotency shape"
   sentence is literally true.

The brief's own ruling decided the shape: "the `source_reread_since_parse` conflict **keeps firing
for the same condition**, but stops being a dead end once the remedy exists". So the parse door and
its pinned `(seed, document)` key do not move, and the remedy is a **separate door with its own key
that carries the new extraction** — the first of the two options the brief offers.

Re-pointing (the second option) was considered and rejected: a re-read is an OCR pass and is not
guaranteed to yield the same rows in the same order, so "re-point target *i* at region *i*" is an
identity this estate cannot honestly assert. Retire-and-replace claims nothing of the kind — every
target afterwards was re-derived row by row from the reading the document now stands on, each one
re-proved by `clara._assert_opening_target_fact` against its own stored region.

## Seams tested (written before the first cell, work-order rule 4)

1. `clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)` — the new DB door, driven
   only through `roleQuery(ROLES.runtime, …)`, never a raw insert.
2. `clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)` — unchanged; driven to prove AC3.
3. `clara.approve_opening_seed(…)` — the real approval ceremony, driven end to end for AC4.
4. `clara.opening_target_refreshes` — the receipt relation, read back through `humanQuery` on the
   same firm-scoped SELECT policy the browser's own read rides.
5. `refreshOpeningTargets(client, {seedId, firmId, reassert})` + `openingRefreshOpKey` — the runtime
   route core, on real `clara_runtime` connections against real Postgres.
6. `refreshOpeningSource(seedId)` — the web wire (its own proxy path, its typed outcome table).
7. `OpeningParseAction` / `OpeningParseOutcomeBanner` — the rendered behaviour.
8. `apps/web/e2e/opening-ledger-source-walk.spec.ts` — the real browser on this lane's triple.

No cell tests a seam the brief does not give. The one structural cell that is not behaviour
(`p986.reread.no_regression`'s sha pin on the parse door) is this repo's own documented standard for
a pinned body, and it is named as such where it stands.

## Acceptance criteria, with evidence

**AC1 — "A document re-read after its opening basis's targets were already parsed can have those
targets brought up to date through a named door, without abandoning the basis and starting a new
one."**

- Done. `clara.refresh_opening_targets_from_reread` (migration `0286_opening_source_reread.sql`),
  reached from the browser through `POST /api/opening/refresh-targets`
  (`packages/runtime/src/openingRoutes.ts`) and the named control **"Refresh from the new reading"**
  on the opening tab.
- `packages/db/tests/opening-source-reread.test.mjs`, `p986.reread.refresh` (PASS): real producer
  pass one → parse → real producer pass two (`documents.authoritative_extraction_id` moves, asserted)
  → the parse door still refuses CLR10 → the refresh door returns
  `targets_retired = 3`, `targets_recorded = 3`, `from_extraction_id = first`, `to_extraction_id = second`.
- `packages/runtime/tests/wave-b-opening-parse.test.mjs`, "ticket 986 RE-READ REMEDY" (PASS): the
  same journey through the REAL route core on a real `clara_runtime` connection, with both OCR
  passes run through `normalizeAzureLayout` + `clara.persist_document_extraction`.
- Not a new basis: `p986.reread.approve_end_to_end` asserts
  `count(*) from opening_seed_registry where client_id = … and state <> 'cancelled'` is **1** from
  start to finish.

**AC2 — "The prior parse's targets are never left silently stale beside unread new content: they
are retired and replaced, or explicitly re-pointed, and the basis's state shows which."**

- Done, by retire-and-replace. `p986.reread.refresh` asserts the basis carries exactly 3 targets
  afterwards (never 6) and that **every one** cites the new extraction.
- The basis's state shows it: `clara.opening_target_refreshes` carries one row per refresh with
  `from_extraction_id`, `to_extraction_id`, `retired_count`, `recorded_count` and the retired rows
  **verbatim** in `retired_targets` (a CHECK ties `jsonb_array_length(retired_targets) = retired_count`).
  Read back in the cell through `humanQuery` as `clara_authenticated` — the same road
  `apps/web/lib/registers/opening.ts` reads `opening_tb_targets` by.
- `p986.reread.refresh_walls` drives a THIRD reading and asserts the receipt chain reads back as
  `[(first→second), (second→third)]`: which reading the basis stood on, in order.
- Retired is not erased: `p986.roles.runtime_only` proves the receipt is append-only at the storage
  layer (CLR08 from `clara._tf_append_only` on UPDATE and on DELETE, even as superuser).

**AC3 — "Parsing the exact same extraction twice with no re-read between attempts still refuses
exactly as today (no regression to the anti-double-parse guarantee)."**

- Done, and proved two ways.
  - Behaviourally: `p986.reread.no_regression` (PASS) parses twice under the pinned key
    `openingparse:<seed>:<document>` with no re-read between and asserts the second call returns the
    ORIGINAL receipt byte-identically (`assert.deepEqual`) and writes no second set of targets.
  - Structurally: the same cell asserts
    `sha256(prosrc)` of `clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)` is
    `f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1` — the value 0286's prestate
    AND tail both pin. A cell that only drove the behaviour could not tell "unchanged" from
    "changed compatibly".
- The runtime half did not move either: `openingOpKey` is byte-identical and its pin cell still
  passes; the #656 RE-READ cell keeps its assertions byte for byte (only its closing comment, which
  described the residual as standing, was rewritten to what is now true).
- The new door cannot be used to get round the key: `p986.reread.no_regression` drives it on a
  basis nobody re-read and gets CLR31 `no_reread_to_refresh`, with nothing recorded and no receipt
  written. Same refusal at the runtime seam: "ticket 986 the refresh is not a second parse".

**AC4 — "A basis previously stuck in this state can reach approval end to end, proved over the real
parse-and-approve door, not raw inserts."**

- Done. `p986.reread.approve_end_to_end` (PASS): parse → three opening items drafted through
  `clara.draft_opening_item` → the document re-read → `clara.approve_opening_seed` refuses CLR31
  `extraction_not_accepted` (the stuck state, DRIVEN) → the refresh door → `clara.get_opening_dryrun`
  shows every delta at 0 and `obe_net_cents = 0` → `clara.approve_opening_seed` succeeds with the
  SAME entry revisions the first reading drafted.
- After it: registry `state = 'finalized'`, `opening_seed_approvals = 3`,
  approved opening `journal_entries = 3`, live bases for the client = 1.
- Every step is a real audited door on a real Postgres; the only `rootQuery` uses are fixture
  arrangement and reading counts/pointers no door returns, each labelled at its site.

**Out of scope, honoured**: the once-per-extraction guarantee for the non-re-read case is untouched
(AC3); no UI redesign beyond showing the refreshed target state (one banner branch + one button);
#985's chat tool is not built — its re-measurement is written out under "Successor contract".

## Gates, with counts

- `packages/db/tests/opening-source-reread.test.mjs` — **5/5 PASS**, full gate chain (174
  `--import ./tests/*-preintegration-gate.mjs` flags from `packages/db/package.json`, now including
  this ticket's own `opening-source-reread-preintegration-gate.mjs`, added last in migration order).
- `packages/db/tests/operation-census.test.mjs` — **10/10 PASS**, full gate chain. (0286 adds one
  SQL function, so the census requires it be attributed in `rig-meta.mjs`'s `ALLOWED` — done via the
  new `OPENING_SOURCE_REREAD_0286_RUNTIME_FNS` / `_COHORT`, spread into `ALLOWED[clara_runtime]` and
  given its own bimodal `cohortFailures()` call.)
- `packages/db/tests/rig-isolation.test.mjs` — **22/23 PASS, 1 skipped** (T19, destructive, skipped
  by design per RIG.md — never run with `CLARA_RIG_ALLOW_RESET`). T17 (the per-role grant matrix)
  passed, confirming the cohort registration is byte-correct. Never run with the reset flags.
- `packages/db/tests/opening-ledger-source.test.mjs` (#656's own battery, the neighbour) — **12
  cells, 0 pass, 12 SKIPPED**. This is a PRE-EXISTING rig condition and not caused by this ticket;
  see "Follow-ups" — it is the most important thing in this report.
- `packages/runtime/tests/wave-b-opening-parse.test.mjs` — **20/20 PASS** (17 pre-existing + 3 new),
  DB-backed against `clara_l06` with `WORKFLOW_POSTGRES_URL` set. The 17 pre-existing cells are the
  proof that extracting `readOpeningParseSubject` out of `parseOpeningTargets` moved no branch.
- `node scripts/check-frozen-workflows.mjs` — **OK**, 312 frozen files, no manifest diff.
- `node packages/runtime/scripts/check-parts-parity.mjs` — **OK**, reader ⊇ emittable unchanged.
- `pnpm typecheck` (repo root) — clean (`apps/web` Done, `packages/runtime` Done).
- `CI=true GITHUB_ACTIONS=true pnpm lint` (repo root, as the runner sees it) — **exit 0**. One fix
  round: five `#986` ticket references inside STRING literals in
  `apps/web/components/registers/opening-parse-action.test.tsx` tripped the raw-colour selector
  (#994 — it cannot tell `#986` from a hex literal); reworded to "ticket 986", never weakening the
  rule. The same reword was applied to the e2e spec's title for consistency.
- `apps/web` whole unit suite (`node scripts/run-tests.mjs`) — **4870 tests, 4868 pass, 0 fail,
  2 skipped** (the same two pre-existing skips lane 06's #936 report records).
- `apps/web` e2e, `opening-ledger-source` spec, on this lane's own Playwright triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552`) — **8/8 PASS** (7 pre-existing + 1 new), including an axe pass on
  both the conflict face and the refreshed face.

No Windows-only known red was hit by this ticket's own cells.

## Migration

`packages/db/migrations/0286_opening_source_reread.sql` — gate stem `opening_source_reread$`,
checksum after the one redo `76ab15e9ec9130e3a03ade18e3f5e36cc898d984f0c74c384f6058d64d0607ea`.

It adds exactly two things and recuts nothing:

- `clara.opening_target_refreshes` — append-only, RLS enabled AND forced, four policies (owner ALL;
  human/agent SELECT firm-scoped; runtime SELECT), SELECT granted to `clara_authenticated` and
  `clara_runtime` only, two triggers (`clara._tf_append_only`, `clara._tf_no_truncate`), one index.
- `clara.refresh_opening_targets_from_reread(uuid,jsonb,uuid,uuid,text)` — SECURITY DEFINER,
  `clara_fn_owner`, `search_path=clara, pg_temp`, EXECUTE granted to `clara_runtime` **alone**
  (asserted false for PUBLIC, `clara_authenticated` and `clara_agent_ro` in the tail).

**Why a receipt relation and not a `state` column on `clara.opening_tb_targets`** (the brief asks
for the estate's existing supersede-chain convention where one fits; `clara.opening_items` carries
`state`/`superseded_by_item`/`supersedes_item_id` and was the first candidate). Measured: nine
bodies sum or scan `opening_tb_targets` with **no state predicate** —
`clara._opening_seed_deltas`, `clara._assert_opening_tie`, `clara.get_opening_dryrun`,
`clara.approve_opening_seed`'s two target sweeps, `0056`'s close-model read and `0239`'s three
`opening_balance_work` reads — plus the browser's own `getRows("opening_tb_targets")`. A retired
state on that table would make every one of them silently wrong until each was recut, in the one
lane whose whole point is that a stale figure must never stand quietly beside a fresh one. The live
target set stays exactly "the rows in the table", which is what all nine already believe.

### Prestate pins — MEASURED ON `clara_l06` after #936 (0284) and #919 (0285), before applying

Every one is re-hashed in the tail against the same value. The first is the load-bearing shape the
ticket names; that pair is AC3 as an executable assertion.

| signature | sha256(prosrc) |
|---|---|
| `clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)` | `f3ffd4b07b33756f7f04f9a18d22d3092b1f84eca4d061d7609c2c235b0671c1` |
| `clara._assert_opening_target_fact(uuid,uuid,jsonb,text,bigint,bigint)` | `b4c505b418f8bc676048b0da3cded0f9565a547487a7ce8a5a9ad5b16d3c0305` |
| `clara._assert_opening_extraction_ref(uuid,uuid,jsonb)` | `a8b48e14895295e1dcd22d9245d4b96f0f12538daecc22bf0b2cc4332e67fae0` |
| `clara._opening_region_fact(uuid,uuid)` | `c61cc978650fbbf6fbe3b92af90f538daff0aa3e6a9ff91873ad427706853610` |
| `clara._active_document_filing(uuid,text,uuid,boolean)` | `8d75cb02cfeaa4b739b598c81f084342b3389a6625f5d0eee76659bfe9bab7d7` |
| `clara._record_onboarding_contributor(uuid,uuid)` | `cc9acdf5d07dc9fe528f727d3bae794c3acf6686717a6491e62e73a066676719` |
| `clara._reserve_op(uuid,text,text,bytea)` | `8816acb44d8c14980d21d8cdf19dc249f876f4bb49b39ca99b1f6fb915fe64b4` |
| `clara._finish_op(uuid,text,text,jsonb)` | `c2beaa13c9c24ccce516f19552328b7d50272e5caedc8a9913cfd67af743d13e` |
| `clara._hash(jsonb)` | `421483aadaa5989455a40f9c429dac3885dcd4b99056f0f2b66038ad54152547` |
| `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` | `000c730cd29d6544b014ecb0635fc30d9a238f23cdbd8d224ae8f4331086e2f1` |
| `clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)` | `6735ef453153450286fe7fd2c5a645c164c14b0fcc127c9f16954b16f63fbada` |
| `clara._assert_opening_tie(uuid)` | `afa141b3bf2c5f7dd04a0a73dfe21221405fe18d3d94b72d197f5d8eb07cca30` |
| `clara._opening_seed_deltas(uuid,boolean)` | `be1d4c7da3fab86f24fc89884cf679aa4191363279e17b4a78f6cee4fb7edead` |
| `clara.get_opening_dryrun(uuid)` | `328c0eda12c0d1aa42633a04f4df5801f89f2f3db8f36e564f377a2296dd8372` |

Structural prestate (catalog facts, no data-dependent branch anywhere): `clara.opening_tb_targets`
and `clara.opening_seed_registry` exist; `uq_opening_tb_targets_extraction_fact_0017` (a partial
unique INDEX, read from `pg_index`) and `uq_opening_tb_targets_key` (a CONSTRAINT, read from
`pg_constraint`) are both present; `clara.documents.authoritative_extraction_id` exists.

### Redo, and the first-apply branch

- Applied clean on the first run (`applied 0286_opening_source_reread · 270 total · target
  127.0.0.1:55746/clara_l06`), then **redone once** with `CLARA_MIGRATION_REDO=0286_opening_source_reread`
  after `p986.reread.refresh_walls` found a real ordering defect in the door (below). The redo
  printed `redone 0286_opening_source_reread · new checksum 76ab15e9…`.
- **Both branches were therefore exercised on this rig**: the first apply created the relation, its
  index, its four policies and its two triggers from nothing; the redo re-ran the file over its own
  live effects (`create table if not exists` skipped, `drop policy if exists` + `create policy`
  replaced, `create or replace function`/`trigger` replaced) and the tail passed in both. There is
  no marker-tolerant or bimodal pin in this file to hide a sha branch from a redo — every pin is a
  single exact value, and the prestate asserts nothing about this file's own additions being absent.
- No backfill and no data-dependent branch exists in the prestate or the tail, so the wave-3
  addendum's "enter the branch once with real rows" note has nothing to bite on here. Stated rather
  than silently skipped.
- Recorded in `packages/db/README.md`: a redo that also changed the TABLE's own definition would
  need the table dropped first, because `create table if not exists` skips an existing relation.
  The redo used here changed only the function body.

### The defect the tests drove out

`p986.reread.refresh_walls` failed on its first run: a **retried** refresh (same key, same reading)
raised `no_reread_to_refresh` instead of replaying its receipt, because that guard ran BEFORE
`clara._reserve_op` — and a successful refresh makes the guard false, since the stale targets it
names are the ones the door has just retired. Fixed by moving the reservation ahead of it: everything
above `_reserve_op` is now a FRONT-DOOR wall (the basis, its lifecycle, the tie document, its filing,
which reading the document stands on) — exactly the set `record_opening_targets_parsed` checks before
ITS reservation, so a replay is honoured only while those hold — and a refusal below still rolls the
reservation back with the transaction, so a later legitimate refresh may reuse the key. The reason
is written into the migration beside the code and into `packages/db/README.md`.

## Docs

- `packages/db/README.md` — new `## 0286 — a re-read opening document becomes re-parsable (#986,
  riders wave 3, lane 06)` section (the convention every recent migration section follows): the dead
  end and the two measurements, why a fresh op key is not the fix, what the file adds, why a receipt
  relation rather than a state column, the reservation-ordering lesson, the migration triad, and the
  redo-safety claim with its one caveat.
- `packages/runtime/README.md` — the "Named residual … still a dead end" paragraph is replaced by
  what is now true, plus a new `### The re-read remedy (#986)` subsection naming the route, the key,
  the shared read half and the `no_reread_to_refresh` wall.
- `apps/web/README.md` — a new paragraph in the #656 section: the one refusal on this lane that
  carries an act, both numbers on the 202, and why no other refusal offers the button.
- `CONTEXT.md` — new **Opening source refresh** term with its `_Avoid_` pair, beside Opening basis /
  Opening source / Opening target.
- `packages/runtime/lib/opening-parse.mjs` — the CLR10 arm's "NAMED RESIDUAL … DEAD END" comment is
  replaced by what is now true (the refusal is unchanged; it now has somewhere to go).

## Successor contract (for the shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4)

Nothing frozen was edited. #985 (`read_opening_source` as a chat tool) is the ticket that will need
this, and its own brief says to re-measure its "read again since last parse" mapping once #986
ships. Here is what to cut.

- **Tool name**: `refresh_opening_source` — a SECOND tool beside #985's `read_opening_source`, not a
  flag on it. Reading again and refreshing are different acts with different keys, different receipts
  and different news; a model that could pass `{force: true}` to the read would be able to retire a
  basis's targets by accident.
- **Zod input** (strict, no passthrough):
  `z.object({ client_id: z.string().uuid(), seed_id: z.string().uuid() }).strict()`.
  No amount, no account code, **no document id and no extraction id** — the tied document and the
  authoritative reading are both resolved server-side, exactly as #985's brief rules for the read.
- **Door call, with argument order**: never the SQL door directly — call the route core
  `refreshOpeningTargets(client, { seedId, firmId, reassert })` from
  `packages/runtime/lib/opening-parse.mjs` on a `clara_runtime` connection, with the same
  `reassert` guard the HTTP route supplies. That core mints
  `openingRefreshOpKey(seedId, documentId, extractionId)` = `openingreread:<seed>:<document>:<extraction>`
  and calls
  `clara.refresh_opening_targets_from_reread(p_seed, p_lines, p_document, p_extraction, p_op_key)`
  in that order.
- **Refusal mapping**, verbatim, never replaced by a generic message:
  | answer | shape |
  |---|---|
  | 202 | `{status:'refreshed', lines:n, retired:n}` — report BOTH numbers |
  | 409 | `{status:'refused', code:'CLR31', reason:'no_reread_to_refresh'}` — nothing to refresh; somebody already did |
  | 409 | `{status:'refused', code:'CLR31', reason:'stale_extraction_version'}` — the reading moved again mid-act |
  | 409 | `{status:'refused', code:'CLR31', reason:'refresh_extraction_mixed'}` — a payload citing two readings (unreachable from the core, which reads one) |
  | 409 | `{status:'conflict', reason:'registry_not_open'}` |
  | 409 | `{status:'refused', code:'CLR31'|'CLR02'|'CLR28', reason}` — tie mismatch / unfiled tie / consent |
  | 422 | `{status:'unparseable', reason, …}` — the same family the read has, counts and failing region ids included |
  | 404 | masked not-found |
- **Part kind**: **none new**. It rides the existing typed receipt part #985 reuses; `check-parts-parity`
  is green with the emittable set unchanged, and a new wire kind here would be a widening nobody asked
  for.
- **Prompt stanza** (the one sentence that must exist, because it is the thing a model will otherwise
  get wrong): *"If reading an opening source refuses because the document was read again, do not retry
  the read — it will refuse again, on purpose. Use `refresh_opening_source` instead: it brings the
  basis's lines onto the newest reading and retires the ones the earlier reading left. Report the two
  figures it returns and never a figure you inferred."*
- **#985's re-measurement**: its "read again since last parse" mapping is UNCHANGED — the read still
  answers `409 {status:'conflict', reason:'source_reread_since_parse'}` — but the guidance beside it
  must now name the refresh tool rather than describe a dead end.

## Follow-ups worth filing

- **(Highest value) #656's whole database battery has been silently skipping since 0245.**
  `packages/db/tests/opening-ledger-source.test.mjs` pins `PUBLISHED_REGISTRY_VERSION = 2` as its
  premise probe, and `0245_invoice_line_items_accepted_limitation.sql` (#782) raised
  `clara.document_capabilities.registry_version` from 2 to 3 over all 240 rows. Measured on
  `clara_l06` right now: `min = 3, distinct = 1, rows = 240`. Consequence, measured: all **12** cells
  of that battery report `# SKIP rig not ready` under the full gate chain, including
  `p656.tie.approve_rebinds` and `p656.seed.replay` — two of the cells that guard exactly the
  behaviour #986 stands on. This predates this branch (0245 landed before the wave-2 head this lane
  was cut from) and is NOT this ticket's to fix under work-order rule 5, but a whole battery that
  greens by skipping is the quiet pass this estate exists to prevent. The fix is one line (make the
  probe read `>= 2`, or re-pin it to the live version and keep it moving with the registry).
  My own battery does not share the defect: its premise is a CATALOG probe (the door and the relation),
  not a registry number, which is why all 5 of its cells actually ran.
- **No OBO/human twin for the refresh door.** It is `clara_runtime`-only, exactly like
  `record_opening_targets_parsed`, and that is deliberate. If a future ticket wants a human door for
  it, it needs its own `_human_ctx`-floored verb; a grant widening would put a browser on the
  document-primary write path, which `p656.tie.parsed_writer_only` exists to forbid.
- **The standalone runtime e2e leg was not extended.**
  `packages/runtime/tests/opening-ledger-source-e2e.mjs` (not a `node --test` file) runs producer →
  persist → parse core → writer → approval in ONE file. The refresh chain is proved across two files
  instead — real producer → real persist → real refresh core → real door
  (`wave-b-opening-parse.test.mjs`) and real refresh door → real approval
  (`opening-source-reread.test.mjs`) — with the same real components on the same rig. A future ticket
  may want the single-file version.
- **`from_extraction_id` is the newest retired target's reading.** Every writer in the estate records
  a basis's document targets from one reading at a time, so the retired set is homogeneous in
  practice; the receipt does not depend on that, because `retired_targets` carries each retired row's
  own `extraction_ref` verbatim. The scalar is a convenience pointer and the migration header says so.
  If a future writer ever mixes readings on one basis, that contract is the line to revisit.

## Anything unverified

- **A true from-scratch chain (0001 → 0286) on a disposable cluster was not run by this ticket** —
  RIG.md and the wave-3 addendum assign that proof to the integrator. What this lane has is: the
  267-file from-scratch chain that built `clara_l06`, plus 0284, 0285 and this file applied cleanly
  on top, plus a redo of this file that re-ran its prestate and tail over its own live effects.
- **The runtime route itself (`POST /api/opening/refresh-targets`) is proved at the CORE seam, not
  over HTTP.** That is this lane's existing standard — `parse-targets` has no HTTP-level cell either,
  and `opening-ledger-source-e2e.mjs`'s header states it drives the route core deliberately. The
  browser leg exercises the PATH (`/api/runtime/opening/refresh-targets`) against a Playwright route
  handler, so the two ends of the wire are each proved and their meeting point is the one-line
  `router.post(...)` registration.
- **The e2e browser leg uses the mock runtime**, as every cell in that spec does: it proves the
  journey and the surface's handling of each answer, not that Postgres would raise that refusal —
  which is what the DB battery is for.
- **`refresh_extraction_mixed` is unreachable from the runtime core** (which reads the regions of
  exactly one extraction) and is driven only from the DB battery, where a hand-built mixed payload
  reaches the door. It is a wall against a future caller, not a live branch.
