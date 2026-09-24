# Wave 4 · lane 07 · ticket #877 — a Tier-A-complete autodraft fixture

**Branch** `riders/w4-lane07` · **base** `cd2925391` · **worktree** `C:\Users\zhant\Desktop\clara-wt\657`
· **database** `clara_l07` @ 127.0.0.1:55747 (frontier `0295_wave4_chart_rows`, 289 files)

**Status: DONE.** No migration (none needed; none written — verified live, see *Migration* below).

## Commits (this ticket)

| sha | message |
|---|---|
| `49bfad419` | `test(runtime): #877 a Tier-A-complete fixture reaches admitted, by name` |

Tickets before mine on this branch (`#1041` five commits `aaf2cf21b..574d86e66`, `#1035` five commits
`f16566816..447ebacb7`, `#1033` one commit `6a8314aac`) were read (`git log --oneline cd2925391..HEAD`)
and left untouched.

## The ticket was still live

Verified with `gh issue view 877 --json title,number,state,labels,body,comments`: the Agent Brief
(the sole comment, `belcorttao`, 2026-09-17) is unedited and is the newest word on the ticket; no
owner ruling comment postdates it. The brief's own qualification — a Tier-A-complete, lane-`ready`,
genuinely admitted fixture already exists at the **database-battery** level
(`primeReadyFiling`/`readyFiling`, `packages/db/tests/wave-a-fixtures.mjs:311,383`), but no fixture
drives an admitted task through the **real automatic intake chain** — was re-checked against the
live `intake-admission-e2e.mjs` (arm c reaches the admission door and is refused `tier_a_fails`,
never `admitted`) and against this database's own live `clara._coding_lane_core`/
`clara.admit_autodraft_task` bodies (read via `pg_proc.prosrc`, not the migration files — see
*Migration* below, several of these functions were re-cut by splice-style CoRs in migrations well
past the ones a `create or replace function` grep alone would find). The gap the brief names was
still open; nothing between `main a296765c` and this branch's base had closed it.

## The seams I tested at (written before the first cell)

The brief names two doors and reads them unchanged; I tested at exactly those, plus the two real
precondition-setting doors a Tier-A-complete fixture needs and does not yet have in this file:

1. `clara.admit_autodraft_task` — the admission door, read back by its own durable idempotency
   receipt (`clara.op_receipts`, `fn='admit_autodraft_task'`), never re-invoked.
2. `clara._coding_lane_core` — the lane predicate, read directly as a precondition sanity check
   (never re-derived, never asserted as the claim itself).
3. `clara.draft_entry` / `clara.approve_entry` (+ `clara.record_client_resolution`,
   `clara.upsert_account`) — the real doors that birth a name-only vendor counterparty already in the
   client's books, exactly the precondition `primeReadyFiling` reads for and this fixture must also
   hold, driven fresh through the estate's own doors rather than duplicated as a DB-battery seed.
4. `clara.grant_client_egress` — the LEGACY, purpose-blind coding-lane consent
   `_coding_lane_core`'s `no_consent` reads; distinct from the file's existing
   `ensureClassifyConsent` (the TYPED `document_processing` purpose grant, which only gates
   classification).
5. The upload → `structured_parse` → `local_facts` chain and `clara.agent_tasks` /
   `clara.autodraft_attempts` (the "catalogue") — both already-proven seams from arm (c), reused
   unchanged.

No cell was written at a seam the brief does not give: the admission door, the lane predicate and
the corroboration rule are read, never edited (confirmed no diff to any `packages/db` file — see
*Migration*).

## What I built, in one paragraph

`packages/runtime/tests/intake-admission-e2e.mjs` gains an eighth leg. It births a name-only vendor
counterparty ("GENUINE ADMIT SDN BHD") through a real manual (non-document) `draft_entry` +
`approve_entry`, grants the client's legacy `client_egress_consents` row, then uploads a real
MyInvois UBL invoice whose facts satisfy the **structured Tier-A** arm (migration 0023 §A) that arm
(c)'s own fixture omits: explicit `InvoiceTypeCode` `01`, a stated net (`TaxExclusiveAmount`
1000.00) and tax (`TaxAmount` 60.00) that tie to the gross (`TaxInclusiveAmount` 1060.00), and a
`cac:TaxSubtotal` whose own `TaxAmount` sums to the header tax total. Filed the same way the browser
files it (`fileToClient`, the one human act after the bytes land — leg 1(c)'s own claim, unchanged),
the same automatic chain — `structured_parse` → `local_facts` `done` →
`document.invoice_facts_completed` → the autodraft consumer calling `clara.admit_autodraft_task` for
that filing, inside a sweep run it opens itself — now reads `_coding_lane_core` as `ready` and the
door answers `admitted`.

**The one non-obvious finding, load-bearing for how AC1 is asserted:** `clara.admit_autodraft_task`'s
own success path writes **no** `clara.sweep_run_items` row. That table's `outcome` column — what
arm (c) reads, and what leg 1(c)'s comment calls "the door's verdict, printed verbatim" — is written
only later, when the minted task **settles** (`drafted`/`posted`/`skipped_lane`/`noop_existing`/
`refused_attempts`/`refused_concurrency`; its CHECK-constrained enum has no `admitted` member at
all, measured on `clara_l07`). A first cut of this leg asserted on `sweep_run_items.outcome` and
watched it read `refused_attempts` — the settle door's answer (this file's shared, deliberately
minimal mock model produces no tool call, so the real `autoDraft_v10` workflow settles the task
`failed` with CLR21 `coding_incomplete`), not the admission door's. The fix: AC1 is read off
`clara.admit_autodraft_task`'s own **durable idempotency receipt**
(`clara.op_receipts`, keyed `autodraft:<filing>:sweep`, the `_reserve_op`/`_finish_op` pattern this
estate already uses everywhere for idempotent replay) — the exact JSONB the door itself returned,
still `{"outcome":"admitted", "task_id": …}` after the later settle, because nothing re-attempts
admission for this filing within the leg's own run (no catch-up pass is triggered; see the
concurrency note below).

**A second finding, environmental rather than about the door.** This file's shared mock classifier
marks every uploaded document `invoice`, so several of legs 1–7's own documents reach
`document.invoice_facts_completed`/`_failed` and each opens its own sweep run
(`admitDocument`, `lib/autodraft.mjs`). A sweep run closes only on `clara.reconcile_sweep_runs()`,
which the live consumer otherwise runs every `CLARA_AUTODRAFT_CATCHUP_SECONDS` (default 300s) — far
longer than this file's own run — so those already-complete runs sat `open` and exhausted the firm's
`max_concurrent_sweeps` budget, refusing leg 8's own admission `refused_concurrency`. The fix calls
`clara.reconcile_sweep_runs()` directly before leg 8's upload — reading the estate's own idle-cleanup
door (the same one `queue-drain.mjs` and the consumer's own catch-up pass already call), not a
widened gate and not a lane reason seeded around (`refused_concurrency` is a resource-scheduling
refusal, not one of `_coding_lane_core`'s own preconditions).

## Acceptance criteria, each with its evidence

### AC1 — a new leg asserts the outcome is `admitted` by name

- `clara.op_receipts` row for `fn='admit_autodraft_task'`, `op_key='autodraft:<filing>:sweep'`,
  asserted `result.outcome === "admitted"` and `result.task_id` equal to the catalogue's own task id.
- **Measured, full-file run** (`node tests/intake-admission-e2e.mjs` against a disposable clone —
  see *Gates*): `[leg 8] PASS — #877: a Tier-A-complete, fully resolved fixture reached 'admitted' on
  its own (filing 21440067-9c2d-4949-83bb-4c1c986c0955, task 3326b11e-8a77-47f7-8e92-af6df716b5e2)`.
  Reproduced on two independent full 8-leg runs after the receipt-source fix above.
- **Vacuity control, run against the post-run database** (SQL, no code changed — the *subject* being
  probed is the fixture's own precondition state, never the door or the lane predicate, per scope):
  `_coding_lane_core(client, filing)` on this exact filing answers `{lane:"ready", reasons:[]}`.
  Revoking the SAME legacy consent this leg grants (`update client_egress_consents set
  revoked_at=now(), revoked_by=…, revoke_reason=…`, inside a transaction) flips it to
  `{lane:"needs_review", reasons:["no_consent"]}`; rolling back restores `{lane:"ready", reasons:[]}`
  byte for byte. A second probe: `clara._resolve_counterparty(client, {kind:'vendor',
  new:{name:'NEVER BIRTHED SDN BHD'}})` (a name with no pre-existing counterparty) answers
  `{"decision":"birth", …}`, while the SAME call for the fixture's real vendor name
  (`GENUINE ADMIT SDN BHD`) against the SAME client answers `{"decision":"name_match_unregistered",
  "counterparty_id": …}` — proving the birth step, not luck, is why the document's vendor resolves.

### AC2 — the minted task is read back from the catalogue and tied to the document's live filing

- `select t.id, t.kind, t.status, t.client_id, aa.filing_id from clara.autodraft_attempts aa join
  clara.agent_tasks t on t.id = aa.task_id where aa.filing_id = $1`, polled until non-null (this
  *is* the wait for "the consumer calls admit_autodraft_task, on its own"). Asserted
  `kind = "autodraft"`, `client_id` = the fixture's own client, `filing_id` = the document's live
  (`retired_at is null`) filing — not merely "a" filing.
- Same measured run as AC1: the log line above names both the filing id and the task id read back
  here, and `admissionReceipt.result.task_id === mintedTask.id` is asserted directly.

### AC3 — no human act and no recovery door appears in the leg

- `fileToClient` (the two-step `record_client_resolution` → `file_document` the browser's own queue
  performs, `apps/web/lib/documents/useUploadQueue.ts` → `doors.ts`) is the one human act after the
  bytes land — identical in kind to leg 1(c)'s own established claim, unchanged.
- The file's existing, unmodified `AUTOMATIC_LANE` static source assertion (top of the file, proven
  by every leg) already covers leg 8: it reads `lib/intake.mjs`, `lib/intake-lanes.mjs`,
  `lib/intake-recovery.mjs`, `lib/autodraft.mjs`, `lib/facts-gate.mjs`, `src/intakeRoutes.ts` and
  asserts none of them names `request_autodraft`, so the SAME automatic lane that produces leg 8's
  `admitted` outcome is, structurally, the one the file already proved carries zero recovery-door
  calls. No new call to `request_autodraft` (or any other recovery door) exists in leg 8's own code —
  confirmed by re-reading the diff (`git diff packages/runtime/tests/intake-admission-e2e.mjs`).
  The PRECONDITION SETUP (account creation, the birth entry, the consent grant) is explicitly labeled
  in the file's own header comment as the client's **pre-existing state**, not "the leg" — the same
  distinction `primeReadyFiling`/`readyFiling` draw for their own DB-battery preconditions.

### AC4 — the reached-and-skipped leg still passes and its residual sentence is corrected

- Leg 1(c) (arm c) is **byte-unchanged** in code and still passes in the same run:
  `[leg 1] PASS — control refused firm_narrow_consent_inactive; consented chain classified as
  'invoice'; admit_autodraft_task reached on its own for filing … with outcome 'skipped_lane'
  ({"clr":"CLR29","lane":"needs_you","reason":"lane_changed","reasons":["tier_a_fails",
  "direction_unresolved","vendor_unresolved","no_consent"]}); zero request_autodraft in the automatic
  lane`. Its residual claim — the door is reached, the coding lane refuses — still holds exactly,
  measured on `clara_l07` (the four reasons named above), reproducing what the brief's own "Current
  behavior" section already stated.
- The residual sentence, in two places, is corrected (not merely reworded): the stale "measured on
  clara_633" claim is replaced with the live measurement and a pointer to leg 8 in
  `packages/runtime/tests/intake-admission-e2e.mjs` (the header comment, "THE RESIDUAL, NAMED — AND
  #877's CORRECTION") and in `packages/runtime/README.md`'s own walkthrough of the file ("Residual,
  named — and #877's correction").

### AC5 — any lane reason unreachable through the automatic chain is named as a residual, not seeded around

- Leg 8's own header comment (`intake-admission-e2e.mjs`) names, explicitly, what it does not
  attempt and why: the sales-direction lane (`customer_ambiguous`, the `_sales_lane_active` gate —
  this fixture is a purchase-direction bill by construction), the F1 vendor-registration-binding arms
  (`vendor_bound`, `binding_ambiguous`, reached only via `clara._resolve_vendor_binding` when a
  proposal's `_resolve_counterparty` call itself hits `CLR23`, migrations 0028/0030 — not reachable
  here because the fixture's own counterparty resolves cleanly), and the amount/multi-document hard
  refusals (`high_stakes`, `multi_doc`, `near_duplicate`) — each pointed at its existing DB-battery
  owner (`packages/db/tests/wave-a-*.test.mjs`) rather than synthesized here.

## Gates, with counts

| gate | command | result |
|---|---|---|
| test file touched | `node tests/intake-admission-e2e.mjs` (standalone driver, not `node --test`; run per its own header instructions) | **4 full runs** against a disposable clone during development (2 red while diagnosing the concurrency/receipt-source issues above, 2 clean **8/8 legs PASS**) |
| frozen workflows | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen / 55 `use workflow` / 3 retired (unchanged — no workflow file touched) |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| typecheck | `pnpm typecheck` (repo root) | **exit 0** — `apps/web` and `packages/runtime` both `Done` |
| lint | `pnpm lint` (repo root) | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0**, including `packages/runtime lint$ eslint .` → `Done`, no findings |

No `packages/db/tests` file was touched (no SQL function added), so no db gate chain, no
`operation-census`, no `rig-isolation`. No `apps/web` file was touched, so no web unit suite and no
browser walk.

**How the file was run.** `intake-admission-e2e.mjs`'s own `assertLocalDbGate` pattern is
`rt_test|intake_ci|\d{3}` (`DB_NAME_SHAPE.RT_TEST|INTAKE_CI|PER_TICKET`) — it does **not** admit the
`clara_l<NN>` per-lane shape (confirmed by reading `packages/runtime/tests/local-db-gate.mjs`; it is
one of the "seven others" RIG.md's wave-2 addendum names). Per that addendum's own recipe: I cloned
the lane's own `clara_l07` to `clara_877` on my own cluster (`CREATE DATABASE clara_877 TEMPLATE
clara_l07`, no open connection to the source), bootstrapped the WDK World schema on the clone
(`node node_modules/@workflow/world-postgres/bin/setup.js` with `WORKFLOW_POSTGRES_URL` pointed at
it — `clara_l07` itself carries no `workflow` schema at all, confirmed, since no ticket before mine
in this lane booted a full World against it), ran the file against the clone, and **dropped the
clone** afterward. `clara_l07` was read (several `pg_proc.prosrc` probes, see *Migration*) but never
written.

## Migration

**None.** Verified needed — not merely assumed — before building: every interface the brief names
"unchanged" (`clara.admit_autodraft_task`, `clara._coding_lane_core`) plus every interface leg 8
newly calls (`clara._invoice_fact_state_at`, `clara._resolve_counterparty`,
`clara._document_direction`/`_direction_from_extraction`, `clara._tax_breakdown_cents`,
`clara.grant_client_egress`, `clara.draft_entry`/`_draft_entry_core`,
`clara.record_client_resolution`, `clara.approve_entry`/`_approve_entry_core`,
`clara.upsert_account`, `clara.reconcile_sweep_runs`) was read **live** off `clara_l07`'s own
`pg_proc.prosrc` (not the migration files — several of these bodies are re-cut by splice-style
change-of-record migrations that do not match a `create or replace function …` grep, e.g.
`_coding_lane_core` last shows as a full rewrite at migration `0015` but is 13,584 bytes live versus
roughly a third of that at `0015`, patched by at least ten later migrations through `0217`). No
function signature or body differs from what the fixture needs; no schema or function change was
written, so no prestate pins and no rig-meta cohort. `packages/db` is untouched by this ticket.

## Docs, in the same commit

- `packages/runtime/README.md` — the `### tests/intake-admission-e2e.mjs (#633)` section: "Seven
  legs" → "Eight legs", the "Residual, named" paragraph rewritten to name #877's correction and leg
  8's own preconditions, and the `sweep_run_items.outcome`-vs-`op_receipts` distinction stated for
  whoever reads this section next.
- `CONTEXT.md` — untouched. No new domain vocabulary was coined (`op_receipts`, `sweep_run_items`,
  "the coding lane" are pre-existing estate/internal terms this ticket reads, not names it mints).

## Successor contract

**None.** This ticket touches no workflow body, no frozen closure, no door signature, no part kind
and no prompt stanza — `node scripts/check-frozen-workflows.mjs` shows no manifest diff (312/55/3,
identical to before this ticket). Nothing a frozen chat or Work tool would need changed.

## Unverified

- **The file's own closing `waitForQueueDrain()` step timed out in my ad hoc verification runs**
  against the `clara_877` clone, on state **unrelated to this ticket and to leg 8**: `clara.agent_tasks`
  rows with `kind='wake', status='held'`, tied to firms `rig_muei1d59_…_firmA`/`firmB` created
  **2026-09-23T19:31:43** — well before any work on this ticket — traced to undrained
  `clara.wake_intents` rows that the runtime's wake-drain phase (`lib/drain.mjs`) processes into a
  `held` task the moment any full server boots against the database; nothing in this rig can carry
  them further (`render`/`sandbox` dispatch is Fly-credential-gated and "unwired" here, falling back
  to a scheduled wake that never runs locally). I confirmed these are pre-existing by querying
  `clara_l07` directly (not my clone) and finding the same 3 stray rows, and confirmed they are
  unrelated to `intake-admission-e2e.mjs`'s own fixtures (`buildFirm` mints `rly_…`-prefixed firms
  every run; the stray ones are `rig_…`-prefixed, a different fixture family). Cancelling their
  `agent_tasks` rows on the clone did not stop the underlying "due" wake condition from re-creating
  new `held` rows for the same two firms at the next boot, confirming the root cause is upstream of
  anything `intake-admission-e2e.mjs` or #877 touches. I did not modify `clara_l07` and did not
  chase this further — CI's own `db-live-gates` job builds this file's database fresh in the same
  job (per this file's own README section), so this residue is a property of the shared, reused lane
  cluster carrying other tickets' own test exhaust, not of the code this ticket ships. **Whoever
  integrates this wave should expect the SAME timeout if re-running `intake-admission-e2e.mjs`
  directly against `clara_l07` (or a clone of it) without first draining or clearing that pre-existing
  wake state** — orthogonal to every acceptance criterion above, all of which pass before that final
  step is ever reached.
- **The minted task's own downstream autodraft workflow was not driven to a business `drafted`/
  `posted` outcome** — explicitly out of scope ("The semantic invoice-facts lane's routing" and the
  autodraft lane's own posting behaviour). It settles `failed` (CLR21 `coding_incomplete`) because
  this file's one shared, deliberately minimal mock model (`ONE model for BOTH lanes`, used by every
  leg) issues no tool call; AC1–AC3 concern **admission**, not posting, and are unaffected.

## Follow-ups worth filing

1. **`clara_l07` (this lane's shared database) carries pre-existing, undrained `wake_intents`/`held`
   wake-task residue from earlier tickets' own test sessions**, which any full-file run of
   `intake-admission-e2e.mjs` (or any other driver whose last step calls `queue-drain.mjs`) against it
   or a clone of it will surface as a `waitForQueueDrain` timeout unrelated to the driver's own claim.
   Worth a lane-level cleanup pass (drain or delete the stray `rig_muei1d59_…` firms' wake state)
   before the next full-file verification run in this lane, or before integration.
2. **`clara.sweep_run_items.outcome` has no `admitted` member and is written only at settle time**,
   which is a real trap for a future reader of `admit_autodraft_task`'s own call sites: a naive
   "read the sweep item to see what admission decided" (arm (c)'s own idiom, correct for a *refused*
   admission, since a `skipped_lane`/`refused_*` outcome DOES write its item eagerly) silently reads
   the wrong fact for a genuinely `admitted` filing whose task later settles. Worth a one-line note on
   `admit_autodraft_task`'s own header, or a comment beside the mint pipeline's own missing
   `sweep_run_items` insert, since this ticket is the first fixture to observe the asymmetry.
