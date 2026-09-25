# waveS · lane L8 · #1136 — agent-granted read twins for the payroll and agreement reads

**Branch** `riders/wS-lane08` in `C:\Users\zhant\Desktop\clara-wt\635`, cut from `main` at
**`061a6992b`** (the merged and RELEASED riders cut phase). Database `clara_l01` on
`127.0.0.1:55741`, **312 files / `0323_trade_invoice_probe_self_exclusion`** when I started,
**313 files / `0352_agent_read_twins_payroll_agreement`** now.

**Status: DONE** — the DATABASE HALF, which is the whole of this lane's ruled scope. The three chat
tools themselves are NOT built (the `chatTurn_v22` body is frozen and deployed); they are written
below under **Successor contract for the next chatTurn cut**, for the orchestrator to re-parent to
the mainline's next cut.

## Commits (`git log --oneline 061a6992b..HEAD`)

| commit | what |
|---|---|
| `a1e7e4341` | `feat(db): #1136 agent-granted read twins for the payroll settlement and review-queue reads` — the migration, the first cell, the gate module, the gate-chain entry, the rig-meta cohort, the README section |
| `964ac11bd` | `test(db): #1136 the two blocked-posting rows travel to the model lane verbatim` |
| `93289386e` | `test(db): #1136 the ceremony, the tenant wall, the grant and the read-only lane` |
| `11031a393` | `test(db): #1136 the two guards that pin the queue body follow it into the core` |
| `45eccd158` | `refactor(db): #1136 install both cores as plain SQL, not dynamic SQL` |

Eight files, +2323 / −6. Working tree clean. Nothing pushed, no PR, no GitHub write.

## The seams I tested at (work order rule 4, written before the first cell)

- **S1** `clara.wake_get_payroll_settlement_candidates(p_client uuid)` — the model lane's door onto
  #947's granted read.
- **S2** `clara.wake_list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit integer)` — the model
  lane's door onto the review queue, which is where BOTH #946's `payroll_posting_blocked` row and
  #948's `agreement_posting_blocked` row live.
- **S3** the two HUMAN doors, `clara.get_payroll_settlement_candidates(uuid)` and
  `clara.list_review_queue(jsonb,jsonb,integer)` — same signature, same ACL, same answers after the
  split. Their own batteries are this change's real regression proof and run unchanged.
- **S4** the ACL and the wake-kind allowlist — driven role by role, never read off the catalog.

## What was built, and why it is two doors for three tools

CUT-PLAN.md §1.4 deferred three wave-4 successor contracts because their doors are
`clara_authenticated`-only and a chat tool carries no JWT (`packages/runtime/lib/pools.mjs`: the
read pool logs in as `clara_agent_read_login` and SET ROLEs to `clara_agent_ro`). Two of the three
read the SAME door:

| tool | what it reads | the door it needed |
|---|---|---|
| `read_payroll_posting_state` (#946) | the `payroll_posting_blocked` row and its `question_text` | `clara.list_review_queue` |
| `read_agreement_terms` (#948) | the banked terms **and** the posting verdict | `clara.get_document_extract` (**already** `clara_agent_ro`) + `clara.list_review_queue` |
| `read_payroll_settlement_state` (#947) | the unsettled runs and their candidate bank lines | `clara.get_payroll_settlement_candidates` |

So the delta is **two** wake doors, not three. A third door projecting
`clara._agreement_posting_verdict` for the chat lane would have been a second copy of a sentence
whose whole point is that it cannot drift — 0299's own header says it in words (`0299:2600`): the
poster acts on the verdict and the queue DERIVES its row from it, "so the decision the lane took
and the sentence a person reads are the same body and cannot drift". `clara._agreement_posting_verdict(uuid)`
is still granted to nobody, before and after, and the tail proves it role by role.

The shape is #1000's [0320], from the cut phase that merged immediately before this wave: one
ungranted `_*_core(p_firm, …)`, one thin human wrapper, one audited wake wrapper, one
`clara.wake_fn_allowlist` row per kind. The three closed alternatives (grant the read; a wake
wrapper that sets `request.jwt.claims`; a second machine-side copy) are each closed by a ruling the
estate already made, cited in the migration's header —
`0082_wave_e_zeta_render_jobs_part4.sql:14-17` for the impersonation refusal and the
duplication refusal, `0154:2058` for "one fact gets ONE definition".

## Migration

**`packages/db/migrations/0352_agent_read_twins_payroll_agreement.sql`** — 1,434 lines, of which
~880 are the two embedded core bodies. Reserved number used exactly once; no other migration file
touched.

Six objects, two rows, no table, no column, no chart row, no event type, no role:

| § | object |
|---|---|
| §A | `clara._payroll_settlement_candidates_core(uuid,uuid)` — ungranted, #947's own body |
| §B | `clara.get_payroll_settlement_candidates(uuid)` — recut as a BOOKKEEPER-floored delegate |
| §C | `clara.wake_get_payroll_settlement_candidates(uuid)` — EXECUTE to `clara_agent_ro` |
| §D | `clara._list_review_queue_core(uuid,jsonb,jsonb,integer)` — ungranted, the queue's own body |
| §E | `clara.list_review_queue(jsonb,jsonb,integer)` — recut as a VIEWER-floored delegate |
| §F | `clara.wake_list_review_queue(jsonb,jsonb,integer)` — EXECUTE to `clara_agent_ro` |
| §G | two `clara.wake_fn_allowlist` rows, both `interactive` |

Ten `clara.__t1136_*` helper functions (anchor, replacement, forward, reverse, pre-image recovery
per read) are created in §-1 and DROPPED in §Z, so §0 and §TAIL cannot drift apart and nothing
outside the migration can ever call them.

### Prestate pins — every signature, with its sha (integrator: this is the list to diff against
other lanes' recuts)

**The two bodies this file recuts** (measured live on `clara_l01` at 312 files / `0323`):

| signature | pinned sha256(prosrc) |
|---|---|
| `clara.get_payroll_settlement_candidates(uuid)` | `09de64492afaa5f2876c9d51078de55f29fccb946b1bf1fd868403734e4e65e4` |
| `clara.list_review_queue(jsonb,jsonb,integer)` | `d5456eccb945decd9f61bba6194543d0528ee5f052776d6fdc20cf9fa0226b6b` |

**The two derived bodies §A and §D embed**, pinned on BOTH sides of the apply (§0 derives them from
the live pre-image and refuses unless the sha matches; §TAIL re-reads the committed body and pins
the same value):

| signature | pinned sha256(prosrc) |
|---|---|
| `clara._payroll_settlement_candidates_core(uuid,uuid)` | `a00342aa0fb9ec7c09b13404f8e92b5f19a28366bd65a75ece8be32af7e8bafb` |
| `clara._list_review_queue_core(uuid,jsonb,jsonb,integer)` | `5eae4caaf6a17eb4441c2079b31b71674b541334264fa5c01cd4544645542591` |

**Eight unconditional neighbour pins** — the four this file calls and the four it relies on:

| signature | pinned sha256(prosrc) |
|---|---|
| `clara.wake_context()` | `fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d` |
| `clara.assert_wake_allowed(text,text)` | `1c88b7e09e60e3384ee5a2cff36db7ba242f3397f0213b488388f7f827306e3b` |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara._payroll_posting_verdict(uuid)` | `23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0` |
| `clara._agreement_posting_verdict(uuid)` | `ddd38816bc22037bd5b5c4f1b56b3bbaf1aba581871bd38b12b8918a63607168` |
| `clara._payroll_net_pay_unsettled(uuid)` | `e95d5beb42cd546b2fdb3d29ec285e334e258b83085c62f192bbb388a30f100e` |
| `clara._payroll_settlement_bank_candidates(uuid,bigint,date,integer)` | `ef61f841cd48f22b24a3e24b9fbe6c74365ab348d59df43a439ea94ef65977f3` |

**Post-image shas** (for a later lane that pins them): `list_review_queue`
`a76f8a575c1567d6b3577b9b3de0cb43e22d90fc9097a391da474aae1d844e48`;
`get_payroll_settlement_candidates` `d4772fe649fa63eda451e7f630ebbb90d8032dbea249e356be49d8832f4f3453`;
`wake_list_review_queue` `d64a09aca1129337448e9f60565fee75e2ea8e13fc1e3f9a5c7ed629fc01ee40`;
`wake_get_payroll_settlement_candidates` `fb37de4fa35348511cba2fa0dc996ac94d15e22d283b8384f2aa0045ca05328b`.

### Both branches of the bimodal prestate were DRIVEN on this rig

The prestate is bimodal by construction: it recovers its pre-image from the human door on a fresh
apply and by REVERSING the committed core on a redo. `CLARA_MIGRATION_REDO` only ever takes the
redo branch, so the fresh branch was driven separately.

- **REDO** — `CLARA_MIGRATION_REDO=0352_agent_read_twins_payroll_agreement pnpm --filter @clara/db migrate`,
  three times (twice while the file was still being shaped, once after the final prose edit):
  `[notice] … mode REDO … redone … new checksum edc54daad33b86132ab29ec89e19a743790def5342df35b5e96fd96876b67258`.
- **FIRST APPLY** — driven twice. Once for real: the file's original apply reported
  `[notice] … mode FRESH …`. And once against the FINAL file text, inside one transaction that was
  rolled back: the two pre-images were restored (recovered by reversing the committed cores, not
  typed by hand — the restored bodies hashed to `09de6449…` and `d5456ecc…` exactly), the four
  objects and the two allowlist rows were removed, the file was run verbatim, both notices printed
  (`mode FRESH`, `tail: OK`), and the transaction rolled back. Afterwards the catalog reads exactly
  the six expected shas, zero `clara.__t1136*` leftovers, ledger 313 / `0352`, and a plain
  `pnpm --filter @clara/db migrate` reports `0 new migration(s) applied · 313 total`.
  Script: `<scratchpad>/wS-l08-1136/first-apply.mjs` (not committed).
- **No data-dependent branch was left unentered.** §TAIL's behavioural probe drives both cores: the
  queue core answers an empty envelope for a firm that owns nothing, and the settlement core raises
  0298's own `CLR11 client not in your firm` for a client that firm does not own. The row-kind
  census in §0 walks all sixteen kinds present in the pre-image, not a remembered list.

## Acceptance criteria, each with its evidence

Ticket #1136's Agent Brief (body, no comments, `ready-for-agent`, verified live on
2026-09-25 via `gh api repos/BELCORT-SDN-BHD/clara/issues/1136`).

### AC1 — "One migration per twin (or one for the three), each tenant-walled and refused to every other role; cells prove the twin and the human door agree row for row."

**Done.** One migration for both doors (the number reserved for this ticket).

| claim | evidence |
|---|---|
| row-for-row agreement, settlement | `p1136.settlement.same_rows` — a real payroll run driven end to end through the #945/#946 lane (file → route → claim → `clara.persist_payroll_facts`), a real bank statement with an exact-amount line, then `assert.deepEqual(machineRows, humanRows)` on the WHOLE answer. This read samples nothing per call, so there is no key that may legitimately differ. |
| row-for-row agreement, queue (#946's row) | `p1136.queue.payroll_blocked_row_travels` — a client with no payroll chart, so the run is blocked on account 6000; `assert.deepEqual(machineEnv, humanEnv)` on the whole envelope (watermark, counts, sweep, compliance, lint, rows, next_cursor), then the row's `section`/`lane`/`client_id`/`period` and `question_text === humanRow.question_text`. |
| row-for-row agreement, queue (#948's row) | `p1136.queue.agreement_blocked_row_travels` — a real agreement contract driven through the #948 lane (`clara.persist_agreement_facts` with #948's own worked hire-purchase example), the same whole-envelope `deepEqual`, and `row.question_text === clara._agreement_posting_verdict(doc).sentence`. |
| tenant-walled | `p1136.wake.tenant_wall` — through firm A's credential, firm B's REAL client and an invented uuid answer identically on both doors (`CLR10 queue scope is malformed` / `CLR11 client not in your firm`, same message), the bookkeeper's own door answers the same way, and an UNSCOPED model-lane read returns firm A's rows and zero rows of any firm-B client. |
| refused to every other role | `p1136.acl.two_doors_one_role` — `clara_agent_ro` is driven successfully on both doors; `clara_runtime`, `clara_authenticated` and `clara_wake_interactive` each get 42501 on both; all four roles get 42501 on both CORES; the two HUMAN doors get 42501 from `clara_agent_ro`, `clara_runtime` and `clara_wake_interactive` (0011:4210-4213's own assertion, still literally true); and `clara.settle_payroll_net_pay` is 42501 from `clara_agent_ro`. §TAIL asserts the same over seven machine roles from the catalog side. |
| no act | `p1136.wake.read_only` — both doors answer inside a READ ONLY transaction (proven read-only by a `create temporary table` that 25006s inside a savepoint first), and `clara.domain_events` / `clara.operation_receipts` counts are identical before and after. |

### AC2 — "The three tools cut into the next `chatTurn` version with their walks."

**Deliberately NOT done, by the lane ruling.** `chatTurn_v22`, `claraWork_v6` and `statementFacts_v4`
are frozen and deployed; the manifest entries are LOCKED. Nothing in
`packages/runtime/workflows/` was touched. The three tools are delivered below as successor
contracts, exactly as waves 2 to 4 did, for the orchestrator to re-parent to the mainline's next
cut. `FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` → **OK, 347 / 60 / 3**.

The **amendment of `reports/wave4-lane01-fix.md` §8** is carried into the
`read_payroll_settlement_state` contract text below, in its refusal mapping AND in its prompt
stanza: `clara.settle_payroll_net_pay` returns `status ∈ {'settled','awaiting_checker'}` and a
caller that reads success from the absence of an error will tell a person a settlement landed when
it is a draft waiting for a second pair of eyes.

### AC3 — "From-scratch chain green; `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0."

- **Lint**: `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=061a6992b pnpm lint` → **exit 0**.
  (`FREEZE_BASE_REF` is the wave-2 addendum's substitution for `origin/main`; see *Base artefact*
  below.)
- **From-scratch chain**: NOT run here. The work order assigns it to the integrator on a disposable
  cluster, and a second chain on a lane cluster is forbidden (0154 pins a cluster-wide role count).
  This file mints no role and no table, so it adds nothing the chain has not already seen; the
  FIRST-APPLY branch was proven separately, above.

## Gates, with counts

Every db run uses the FULL gate chain (the 129 `--import ./tests/*-preintegration-gate.mjs` flags
in `packages/db/package.json`, which now includes this lane's own), `--test-concurrency=1`, on
`PGPORT=55741 / clara_l01`.

| gate | result |
|---|---|
| `tests/agent-read-twins-payroll-agreement.test.mjs` (new, full gate chain) | **10/10 pass** |
| the three lanes whose doors this file recut — `payroll-settlement`, `payroll-summary-posting`, `agreement-contract-acquisition` + this file | **148 pass / 0 fail / 1 skipped** (with `firm-portfolio-pack`, `wave-b/wb-g-tail`, `operation-census`, `rig-isolation`) |
| the other 22 batteries that read either door (`wave-a-queue`, `a21-read-surfaces`, `tenancy-rent-plan`, `accrual-bill-conflict`, `accrual-revenue-side`, `depreciation-authority-pending-rowkind`, `ninth-rowkind-seeding-proposal`, `seeding-lane-retired`, `work-question-reads`, `client-work-pack`, `compliance-watch-disposition`, `document-intake-noncoding`, `dba-coding-lane-classification`, `firm-setup`, `work-source-correction-rederivation`, `x41b0-surface`, `x41b2-surface`, `x36c0-wave-c0-belts`, `wave-b/wb-l-conflict`, `wave-b/wb-l-lint`, `wave-b/wb-o-routing`, `wave-b/wb-r1-followon`) | **262 tests · 246 pass · 0 fail · 16 skipped** (the 16 are pre-existing frontier skips, identical before my change) |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` (no reset flags, ever) | **33 tests · 32 pass · 0 fail · 1 skipped** |
| `pnpm typecheck` | **Done** (apps/web + packages/runtime, no errors) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=061a6992b pnpm lint` | **exit 0** |
| `FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` | **OK — 347 / 60 / 3** |
| whole web unit suite (`node scripts/run-tests.mjs` from `apps/web`) | **5173 tests · 5171 pass · 0 fail · 2 skipped**, exit 0 |
| `apps/web` browser walks | none touched, none run |

The web suite was run even though the final diff touches NO file under `apps/web`: the corpus
barrier entry added in `a1e7e4341` was removed again in `45eccd158` when the dynamic SQL it
described went away, so `apps/web/tests/firm-scope-db-pins.corpus.ts` is byte-identical to base.
`tests/firm-scope-db-pins.test.ts` alone: **22/22**, both before and after the removal.

### Vacuity controls (each break was applied to the LIVE catalog and then undone byte for byte)

1. **The frontier gate.** The first run of the new test file, before 0352 existed, failed LOUDLY
   with the file's own message (`no migration matching /agent_read_twins_payroll_agreement$/ …
   this is a FOCUSED run and must fail loudly rather than skip`) rather than skipping.
2. **The tenant wall.** `cl.firm_id = p_firm` → `cl.firm_id = cl.firm_id` in the settlement core,
   and `w.firm_id` → `null::uuid` in `clara.wake_list_review_queue`, reinstalled on the live
   catalog: **6 of the 10 cells went red**, including
   `p1136.wake.tenant_wall — firm B's client: expected SQLSTATE CLR11 but the call SUCCEEDED`.
   Both bodies were restored from a pre-break dump (`identical to the dump`, sha-compared) and a
   `CLARA_MIGRATION_REDO` then re-proved both pins; 10/10 again.
   Script: `<scratchpad>/wS-l08-1136/vacuity.mjs` (not committed).
3. **The rig-meta roster.** Removing `...AGENT_READ_TWINS_0352_AGENT_FNS` from the `agentRo` set
   turned `operation-census` and `rig-isolation` red with the exact right messages
   (`granted to clara_agent_ro but no cohort in packages/db/tests/rig-meta.mjs ALLOWED … claims the
   name`, and `T17 grant matrix: clara_agent_ro EXECUTE clara.wake_list_review_queue: expected
   false, got true`). Restored from a byte copy; green again.
4. **The embedded bodies.** While the cores were being moved from dynamic SQL to plain SQL, §TAIL's
   new check (0) caught a one-byte difference on its own — a stray trailing newline before the
   closing dollar tag — and named it (`was committed at sha 5b83b789… but §0 derived a00342aa…`).
   That is the check doing its job before any human noticed.

## Docs, in the same commits

- **`packages/db/README.md`** — a new `## 0352` section (its own section only; no existing section
  touched): why the three tools were blocked, why two doors serve three tools, the split, the
  two-sided pin, what the machine side bought, the floors, and the redo note.
- **`packages/db/tests/rig-meta.mjs`** — a `#1136 [0352]` cohort block: the two agent-granted
  names, the two ungranted cores, the bimodal `cohortFailures` guard, and the `agentRo` roster
  entry with the reason it is a READ role rather than a `clara_wake_*` one.
- **`packages/db/package.json`** — one gate-chain token at the end (migration order: after
  `trade-invoice-probe-self-exclusion`, 0323).
- **`CONTEXT.md`** — not edited. This ticket mints no domain vocabulary: "wake wrapper",
  "ungranted core" and "settlement candidate row" are all already in the estate's language.
- **`docs/PRD.md` / `docs/ARCHITECTURE.md`** — not edited (work order rule 5).

### Two neighbour guards that pin the queue's body, brought forward (`11031a393`)

0352 is the first generation of `clara.list_review_queue` that is a SPLIT rather than a splice, so
two existing guards needed the same generational treatment every earlier recut got. Neither is
weakened:

- `firm-portfolio-pack.test.mjs` `p659.portfolio.no_recut` gains a generation gated on this lane's
  own stable stem and now pins **both halves** — the thin delegate
  (`a76f8a57…`) and `clara._list_review_queue_core` (`5eae4caa…`) — so a later edit to the body is
  still a red there rather than an unwatched change.
- `wave-b/wb-g-tail.test.mjs` `G5(b)` greps its three content-of-record markers (`lint_finding`,
  `finding_id`, the `status='active'` guard) from wherever the computation actually is, which is
  the claim it has always been making.

## Successor contract for the next chatTurn cut

Not built. Three tools, for the `chatTurn` version that follows `v22`. All three are READS: each
emits `freeform_result`, which is already declared and already emittable
(`chatTurn.v16.prompt.ts:187`), so **no new part kind and no `check-parts-parity.mjs` entry**. None
of them mints a `work_accepted` or asks a `work_question`.

All three run inside `readScoped` (`chatTurn.v13.infra.ts:76`), which mints a plain `interactive`
credential OBO the initiating human and runs it on the `clara_agent_ro` read pool — which is
exactly the one wake kind 0352 allowlisted for both new doors.

### 1 · `read_payroll_posting_state` (#946)

```ts
export const readPayrollPostingStateInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose payroll summary this is"),
  document_id: z.string().uuid().describe("the payroll summary to report the posting state of"),
}).strict();
```

**Door call, with argument order** — the ONLY change from #946's contract is the door name; the
argument order, the scan and the projection are that contract's own:

```ts
// clara.wake_list_review_queue(p_scope jsonb, p_cursor jsonb, p_limit integer) — argument order as written.
const queue = await callDoor("clara.wake_list_review_queue", [{ client_id: input.client_id }, null, 200]);
const blocked = queue.rows.find(
  (r) => r.row_kind === "payroll_posting_blocked" && r.document_id === input.document_id,
);
// blocked?.question_text is the DATABASE'S OWN sentence. Report it; never reword it.
// blocked?.entry_id is non-null only for a DUPLICATE refusal — the entry to point the person at.

// When there is no blocked row, the run either posted or was never read:
// clara.get_document_state(p_document uuid, p_client uuid) — already granted to clara_agent_ro.
const state = await callDoor("clara.get_document_state", [input.document_id, input.client_id]);
```

**Refusal mapping**

| SQLSTATE / shape | tool refusal | what the person is told |
|---|---|---|
| `CLR03` (no credential / kind not allowlisted / no `on_behalf_of`) | `not_permitted` | "I cannot read your firm's inbox in this conversation." Never name the client. |
| `CLR10` (`queue scope is malformed`) | `client_not_found` | "I cannot find that client under your firm." **This is also the answer for another firm's real client — that is deliberate, and a tool must not distinguish them.** |
| no `payroll_posting_blocked` row AND an approved entry on the filing | NOT a refusal | report the entry: its date, its memo and its total. The run posted. |
| no `payroll_posting_blocked` row AND no entry | `payroll_not_read` | "That payroll summary has not been read yet." Name the task's own status from `clara.get_document_state`, never a guess. |
| a `payroll_posting_blocked` row | NOT a refusal | report `question_text` VERBATIM, and for a duplicate also name `entry_id`. Never invent a remedy the sentence does not name. |

**Part kind:** `freeform_result`.

**Prompt stanza** (verbatim; #946's own, unchanged — the door beneath it changed, the words did not):

```
WHY A PAYROLL RUN DID NOT POST. A payroll summary that has been read posts itself when every
condition holds: both readings of the page agree, every arithmetic check passes, the payslip's own
month is established, that month's fiscal year is open, every account resolves in this client's own
chart, and no payroll entry for that client and month is already posted. When one fails, nothing is
posted and a row appears under Needs you. Call read_payroll_posting_state and report the sentence it
returns VERBATIM — it is the database's own words for the condition that failed, and rewording it
would put a reason on screen that nobody decided. You never offer to post it anyway: there is no
such door, by design, because nothing in this lane is posted on a guess. If the block is a
DUPLICATE, name the entry it points at and say plainly that the person decides whether this payslip
is a correction or a re-upload — you do not decide that. If the block is a missing account, name the
account code and say that adding it to the client's chart and re-filing the payslip is what clears
it. If the month could not be established, say what the page printed and ask which month the run
covers; never assume one from the upload date.
```

### 2 · `read_payroll_settlement_state` (#947)

```ts
export const readPayrollSettlementStateInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose payroll runs these are"),
  document_id: z.string().uuid().optional()
    .describe("narrow to the one payroll summary's own posted entry, if named; omitted reports every unsettled run for this client"),
}).strict();
```

**Door call, with argument order**

```ts
// clara.wake_get_payroll_settlement_candidates(p_client uuid) — argument order as written.
const runs = await callDoor("clara.wake_get_payroll_settlement_candidates", [input.client_id]);
// runs: [{entry_id, document_id, filing_id, posting_date, period_month, net_pay_cents,
//         unsettled_cents, candidates: [{line_id, statement_id, bank_account_id,
//         bank_account_display, entry_date, value_date, description, amount_cents,
//         date_delta_days, class_hint}]}]
const scoped = input.document_id ? runs.filter((r) => r.document_id === input.document_id) : runs;
```

**Refusal mapping**

| SQLSTATE / shape | tool refusal | what the person is told |
|---|---|---|
| `CLR03` | `not_permitted` | "I cannot read this client's payroll in this conversation." |
| `CLR11` (`client not in your firm`) | `client_not_found` | "I cannot find that client under your firm." **Another firm's real client answers identically.** |
| `document_id` named, no matching run | NOT a refusal | this run's net pay is either already settled or not yet posted — never guess which; point at `read_payroll_posting_state` for the posting half. |
| `runs` is `[]` | NOT a refusal | "No payroll run is waiting on its bank payment." (the panel's own empty-state sentence, reused verbatim) |
| one or more runs | NOT a refusal | for each: the month (`period_month`), the amount (`unsettled_cents`), and EVERY candidate's own date/description/amount — never picking one, even when exactly one is offered (#947 AC4's own law, carried into conversation). |

**The `wave4-lane01-fix.md` §8 amendment, carried.** If a later cut ever gives the chat lane a
settlement ACT — this ticket deliberately does not, and 0352's tail asserts
`clara.settle_payroll_net_pay` is 42501 from every machine role — then
`clara.settle_payroll_net_pay(uuid,uuid,uuid,text)` returns `status ∈ {'settled','awaiting_checker'}`,
and on `awaiting_checker` returns `match_id: null`, `reason: 'high_stakes_needs_checker'` and
`eligible_checker_count`. **A caller that reads success from the absence of an error, or from
`entry_id` alone, will tell a person a settlement landed when it is a draft waiting for a second
pair of eyes.** (Verified live on `clara_l01` in `clara._settle_payroll_net_pay_core`'s body.)
Also additive on the wire and relevant to the tenancy sibling: `clara.get_rent_settlement_candidates`
gains `candidate_window_days`.

**Part kind:** `freeform_result`. **No accept-via-chat tool is proposed**, per #947's own report.

**Prompt stanza** (verbatim, with the amendment's sentence added at the end):

```
WHETHER A PAYROLL RUN'S NET PAY HAS LEFT THE BANK. A payroll run that has POSTED (see
read_payroll_posting_state for that half) still owes its net pay until the bank shows the payment
left. Call read_payroll_settlement_state and report EXACTLY what it returns: the month, the amount
still owed, and every candidate bank line offered for it — never picking one for the person, even
when only one candidate exists. The database never chooses; neither do you. If no run is waiting,
say so in the tool's own words. You never accept a candidate through this conversation — there is
no such door, by design: acceptance happens on the bank surface or in Needs you, where a person can
see every candidate side by side before deciding. If asked to accept one, say plainly where that
decision is made and point at it; you do not make it for them. And if a person tells you they have
just settled one, never confirm it landed from the absence of an error: a high-stakes settlement
comes back awaiting_checker, which is a draft waiting for a second pair of eyes, not a payment.
```

### 3 · `read_agreement_terms` (#948)

```ts
export const readAgreementTermsInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose agreement this is"),
  document_id: z.string().uuid().describe("the filed agreement contract to read"),
}).strict();
```

> `client_id` is ADDED to #948's original input. It is not a widening: both doors this tool calls
> take a client (the queue as its scope, `clara.get_document_extract` as its second argument), and
> a tool that had only a document id would have to discover the client first — which is the
> existence oracle the tenant wall exists to prevent.

**Door call, with argument order**

```ts
// The TERMS: clara.get_document_extract(p_document uuid, p_client uuid, p_limit integer)
// — ALREADY granted to clara_agent_ro (0011's own grant); this ticket did not touch it.
const extract = await callDoor("clara.get_document_extract", [input.document_id, input.client_id, 200]);

// The POSTING VERDICT: never clara._agreement_posting_verdict, which is granted to NOBODY and
// must not be called from a tool. It is read the way a person reads it — as the queue's row:
const queue = await callDoor("clara.wake_list_review_queue", [{ client_id: input.client_id }, null, 200]);
const blocked = queue.rows.find(
  (r) => r.row_kind === "agreement_posting_blocked" && r.document_id === input.document_id,
);
// blocked?.question_text IS the gate's own sentence. Report it; never compose your own.
```

**Refusal mapping**

| SQLSTATE / shape | tool refusal | what the person is told |
|---|---|---|
| `CLR03` | `not_permitted` | "I cannot read this client's documents in this conversation." |
| `CLR10` (`queue scope is malformed`) | `client_not_found` | "I cannot find that client under your firm." Another firm's real client answers identically. |
| `CLR16` | `not_found` | the document is not an agreement contract, or is not filed. |
| no `agreement_posting_blocked` row AND a banked pair | NOT a refusal | the acquisition posted — answer from the entry. |
| no banked pair | `not_read_yet` | "That agreement has not been read yet." |
| an `agreement_posting_blocked` row | NOT a refusal | report `question_text` VERBATIM. A TENANCY gets a row too and it is not an error: it was read, it will never post, and the sentence says so. |

**Part kind:** `freeform_result`.

**Prompt stanza** (verbatim, #948's own):

```
When someone asks what an agreement says, read the terms the lane banked and quote them as the page
printed them. Eleven terms are recorded — what the agreement calls itself, the financier, the
signing date, what was acquired, the cash price, the deposit or trade-in, the amount financed, the
total charges, the total payable, the term and the instalment — and a term the page did not print
is recorded as *not printed*, which is not zero. Never add two of them together and never say what
kind of agreement it is from anything but the agreement_class the record carries: a deterministic
evaluator decided that from the words the page uses for itself. If the acquisition did not post,
the queue row carries the one sentence saying why; give that sentence, do not compose your own.
```

### What the cut must NOT do

- Do not add a tool that calls `clara._agreement_posting_verdict` or `clara._payroll_posting_verdict`.
  Both are granted to nobody on purpose; the sentence reaches the chat lane through the queue row,
  which is the same body a person reads.
- Do not add a settle, confirm or post tool for either family. `clara.settle_payroll_net_pay` is
  `clara_authenticated`-only and 0352's tail asserts it stayed that way.
- Do not allowlist `interactive_client` for either new door. Neither read needs a client pin, and
  an unpinned credential is the narrower buy because the scope arrives as an argument the core
  walls against the firm. Both doors carry the pin arm anyway, dormant, so a later file that does
  allowlist a pinned kind does not have to remember to add a wall.

## Base artefact the integrator should expect (not a defect of this lane)

A bare `pnpm lint` on this branch reports **35 `UNLOCKED-VS-BASE` freeze violations**. They are
entirely a consequence of the base: `origin/main` is `3bf6aa94d`, which is AHEAD of this lane's base
`061a6992b` and carries `204b7c199 chore(runtime): lock the 35 deployed frozen-workflow entries
after the cut release (step 11a at 061a6992b)`. `git diff 061a6992b..HEAD -- frozen-workflows.json`
is **empty** — this lane changed no manifest entry. Against the wave base the check is clean:
`FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` → `OK — 347 / 60 / 3`. The
violations disappear the moment the branch is merged onto a main that carries the lock commit.

## Follow-ups worth filing

1. **`clara.list_review_queue` now has a twelfth generation, and every future splice must splice
   the CORE.** A lane that reaches for `pg_get_functiondef('clara.list_review_queue(...)')` and
   splices an arm into it will silently install its arm in the thin delegate, where the delegate's
   two-statement body has no CTE to splice into — the splice will fail loudly rather than corrupt
   anything, but the error will point at the wrong object. Worth a one-line note in
   `packages/db/README.md`'s migration guidance, or a `comment on` the delegate saying "splice the
   core". The delegate's comment already names the core; the README section does too.
2. **`read_agreement_terms` gained a `client_id` input.** #948's contract had only `document_id`.
   Whoever cuts the tool should check the chat surface can always supply a client — in a
   client-pinned session it is `ctx.clientId`, but a firm-level session would have to ask. If that
   is awkward, the narrower alternative is a `clara.wake_get_document_client(p_document)` that
   answers CLR11 for a document outside the credential's firm — a new door, not a successor
   contract, and it is one more existence surface, so I did not propose it.
3. **Nothing tells a person their conversation read their inbox.** These are reads and they write
   no receipt by design (proven by `p1136.wake.read_only`). That matches every other agent read in
   the estate, but the queue is a firm-wide surface rather than one client's figures, so it is
   worth an owner look at whether a firm should be able to see that Clara read its Needs-you list.
4. **The dormant client-pin arms have no cell.** Both wake doors carry the `interactive_client`
   pin wall, and neither is driven, because no pinned kind is allowlisted for either door. The
   first ticket that allowlists one owes the cell.

## Anything unverified

- **No real model has driven either tool.** The database half is driven end to end on a real rig
  through real doors, but the three tools do not exist and no provider call touched these doors.
- **The from-scratch chain** (0001 → 0352 on a fresh cluster) was not run here; the work order
  assigns it to the integrator on a disposable cluster. The FIRST-APPLY branch of the bimodal
  prestate WAS proven, inside a rolled-back transaction, against the final file text.
- **Hosted was not read.** §0's neighbour pins would fail loudly BY NAME on a hosted body at a
  different shape rather than silently, but I did not measure hosted.
- **`clara._list_review_queue_core`'s 23 firm predicates are asserted structurally, not one by one
  behaviourally.** §0 proves the count moved one-for-one and that no `c.firm` survives; the
  BEHAVIOURAL proof that the wall holds is `p1136.wake.tenant_wall`'s unscoped read (zero firm-B
  rows) plus the 22 neighbour batteries that read the queue as humans. A predicate on a row kind
  that no fixture produces on this rig would not be caught by a cell — it would be caught by the
  reversal hash, which is why the reversal exists.
- **`clara_freeform_ro` is in §TAIL's machine-role roster but has no behavioural cell.** The
  catalog assertion covers it; no test drives a freeform login against these doors.
- **The 16 skipped tests** in the 22-battery run are pre-existing frontier skips (the same count
  before and after this change); I did not investigate each one.
