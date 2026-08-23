# F-T4 · The fix queue — the design doc of record

**v2 · 2026-08-23 · gate-folded** (Track-B PR-0: 6 blockers + 10 materials confirmed and folded
here; full record `fix-queue-gate-record.md`). Design set 2 of 3. Reads on `fix-queue-survey.md`
(findings **F1-F33**); read by `fix-queue-annexes.md` (mechanics · censuses · predictions ·
decision register · owner questions — **Annex D.3** carries the fold's change log, **D-13..D-25**
carry each fold's ground). **PR-1 (item F) is SEVERED from this gate by owner ruling (§1, D-25)
and is building now.** **OQ-9 (item C, the claims convention) is RULED 2026-08-23** — option
(A) via a close-time scan and draft, `fix-queue-gate-record.md` M4 addendum; item C unblocks.

**The laws this design is written under.** Numbers are the DB's, reproduced by a versioned
deterministic evaluator (constraint 2 / PRD §6) — no item here mints a numeral. Walls are proved
**behaviourally**: the proof of a wall is a cell that makes it REFUSE, never a substring match on
source text. Absence is not evidence — every "not found" falls to a fail-closed branch, and
three-valued evaluation (pass / fail / **not_evaluable**) is used wherever the honest answer is
"the world did not tell me". Forced cells assert their precondition or exit by a **named** skip.
Frozen workflow bodies are never edited — a behavioural change ships as a new `_vN` with a registry
repoint (constraint 9), and **no version number is named here**: the build lane reads the live
registry at authoring time and takes the next free one.

---

## 1 · The shape — five PRs, one owner ruling, and what is deliberately NOT built

| PR | scope | DB? | D1? | depends on |
|---|---|---|---|---|
| **PR-1** | item **F** — the ceremony DSN bridge, in-repo | no | no | **SEVERED — own gate (D-25)** |
| **PR-2** | item **B** — N5, the remedy field reaches the coding lane | new table only | no | nothing |
| **PR-3** | item **D** — the 401/403 split | CHECK swap (live object) + 1 CoR + 3 writer-clamp CoRs + 4 frozen `_vN` catch modules | **yes** | nothing |
| **PR-4** | item **A** — P-3, drawer 1's zero census | 1 CoR + 1 fact key | **yes** | **F-A3** (§2.1) |
| **PR-5** | item **E** — the two missing F8 cells | tests only | no | nothing |
| — | item **C** — the claims convention | **owner ruling, then Wave G** | — | OQ-1/OQ-2/**OQ-9** |

**PR-1 first, and it no longer waits on this gate — gate-folded (D-25).** Every remaining Wave-F
and Wave-G ceremony walks the DSN bridge (F20-F22), and it has already degraded to CA-unpinned TLS
against the live pooler twice. This gate found the joint six-set queue's own sequencing put Track
A's imminent ceremony windows (W1-W4, and plausibly W5, on the joint gate's own 14-21 day estimate)
ahead of PR-1 clearing it (M17). **The owner severed PR-1 from the Track-B joint PR-0 gate and
owner sitting on 2026-08-23; it ships as its own PR, gated only by its own selftest (§6, D-24) and
the uniform ADR-061 ladder, building now.** It still touches no DB and no product code.

**Deliberately not built:** a second registry-vs-ledger predicate (F-A3 owns the body); a
`fix`-sentence backfill across ten applied migrations' raise sites (priced and declined, D-4); a
repair of F8's door on a retiring host lane (D-2); the claims module itself — item C designs a
**convention**, not a register. **PR-3 and PR-4 each open a D1 write-quiesce window**; they may
share one if they merge together (§9), but neither may be folded into F-A4's `finalize_close`
window, which carries three other lines already (`wave-f-contract.md`, sequencing correction 2).

---

## 2 · Item A — P-3, drawer 1's registry-vs-ledger zero census

### 2.1 The predicate: one body, one owner, and F-T4 is the consumer

F-A3 owns the registry-vs-ledger predicate (`bank-agency-annexes-3-build.md:119-121`, obligation
6). **This design calls it and does not write it** — with one stated exception: *whichever item
lands first writes it*, so if PR-4 merges before F-A3's arm 4, PR-4 authors the body **to the
contract below** and F-A3 calls it. Either way there is one body. The contract, stated so both
lanes can build against it:

```
clara._bank_registry_ledger_state(p_client uuid, p_as_of date) returns jsonb
  -- { state: 'clear' | 'gap' | 'not_evaluable', accounts: [...], basis: <literal> }
```

`state` is **three-valued and fail-closed**; `accounts` enumerates the offending COA accounts with
their DB-computed positions (read through `clara.trial_balance_as_of`, never recomputed — constraint
2); `basis` is a versioned literal so a reader can tell which generation answered. **Security
posture, gate-folded (D-19):** whoever authors the body first writes it `security definer`, owner
`clara_fn_owner`, `set search_path = clara, pg_temp`, `revoke all … from public`, and performs the
explicit `clients.firm_id = c.firm` check `bank_recon_close_state` performs (`0056:2027-2033`) —
`trial_balance_as_of` is bare `security invoker` with no caller-side firm check
(`0017_wave_b.sql:3572-3574`), and a bare `p_client uuid` carries no firm/actor context of its own.

### 2.2 The circularity, and why the predicate may not key on `is_bank_account` alone

**F3 is the finding that shapes this item, and it binds F-A3's arm 4 identically.**
`coa_accounts.is_bank_account` is written only by `add_bank_account` and its remap sibling
(`0038:2731`, `0038:2987`) — it is *minted by registration*. On a client with zero
`bank_accounts` rows, zero COA accounts carry the flag, so a predicate of the shape "a flagged
account with movement and no registering row" returns **the empty set on exactly the population it
exists to catch**. Three arms, evaluated in order:

- **(a) the deactivated / remapped case — MEASURED, gate-folded (D-15).** `is_bank_account` alone
  cannot tell an orphan from a retired binding: `0038:2532-2535` says the flag survives
  deactivation, and `remap_bank_account_coa` (`0038:2979-2988`) sets the flag on the NEW coa code
  and leaves the OLD one flagged with no `bank_accounts` row at all. So arm (a) fires ONLY when
  BOTH hold: (i) no `bank_accounts` row of **any status** (active or inactive) currently or ever
  bound to this coa code — checked against the code's own history AND, via the remap audit payload
  (`0038:2990-2993`), any code it was remapped FROM; (ii) `clara.trial_balance_as_of` shows movement
  on the account that no covering period's reconciliation (current OR the historical binding's)
  accounts for. A clean deactivation or remap with no uncovered movement reads `clear`; a genuine
  orphan, or uncovered movement on a retired code, reads `gap`.
- **(b) the zero-registry case — `not_evaluable`, never `clear`.** If the client has **no**
  `bank_accounts` rows at all, the chart cannot answer the question and the predicate says so.
  Absence of a flagged account is not evidence of a bankless client.
- **(c) no name or code heuristic, ever.** An account titled "MAYBANK CURRENT" is a projection of
  the thing (review law 3); the predicate reads structure and declared facts only.

### 2.3 The door — a missing INPUT through the audited fact door, not an attestation

Drawer 1 is absolute and gains **no** attestation path (F4). What arm (b) needs is not an
override, it is **the fact nobody ever recorded**. The estate already has that door and an exact
precedent: `trade_nature` (`0056:1233-1239`), whose own description says *"ABSENT means the
closing-stock gate reads UNKNOWN and refuses attestably — an unknown trade nature is not evidence
of a service business."* This design clones it.

**New `client_fact_keys` row** (append-only, extend-only, code-populated):

| field | value |
|---|---|
| `fact_key` | `banking_arrangement` |
| `validated_against` | `enum:BANKING_ARRANGEMENT_V1` |
| `allowed_values` | `["has_accounts","no_accounts"]` |
| description | the registry's completeness as a *declared* fact — ABSENT means drawer 1 reads `unknown`; `no_accounts` is a positive declaration with who/basis/when; `has_accounts` asserts the registry is populated, so **zero rows under `has_accounts` is a contradiction, not a pass** |

Written through the existing `clara.record_client_fact(p_client, p_fact_key, p_fact_value,
p_basis, p_basis_kind, p_source_document_id, p_op_key)` (`0055:499-501`) at its **admin+** floor
(`:510`) with basis capture. **No new verb, no new grant, no new role.** Each of the three states
does work:

| registry rows | `banking_arrangement` | verdict |
|---|---|---|
| 0 | *absent* | `not_evaluable` → drawer 1 `unknown`, reason `bank_registry_undeclared` |
| 0 | `no_accounts` | `clear` — the question is answered, the loop runs over nothing, `tie` stands |
| 0 | `has_accounts` | `gap`, reason `bank_registry_contradicted` — a declared registry that is empty |
| ≥1 | any / absent | arm (a) decides, on ITS OWN measured check (D-15) — the declared fact does not override a measured gap |

### 2.4 The call site — fold into the worst-wins aggregation, never an early return

`clara.bank_recon_close_state(uuid,uuid)` (`0056:959`) is CoR'd with **one** addition. The
predicate is called once before the loop; the loop and its per-account shape are **byte-unchanged**;
the verdict is folded into the existing worst-wins aggregation (`0056:1019-1022`) *after* the loop,
and the predicate's own JSON is attached under a new `registry` key on the returned object:

```
if v_reg->>'state' in ('gap','not_evaluable') then v_state := 'unknown'; end if;
… return jsonb_build_object('state', v_state, …, 'registry', v_reg);
```

**Early-returning on the gap was considered and rejected:** it would suppress the per-account
array a human reader needs, and it would let a registry gap mask a real mismatch. Folding keeps
both. `v_state`'s `'tie'` initialiser at `:962` is left in place — the branch above is what makes
the empty-registry case unable to reach it.

### 2.5 The retroactive consequence, taken deliberately

`clara.verify_close(uuid)` (`0056:2529`) re-probes the four drawer-1 identities from scratch
against a **sealed** receipt (`:2544-2548`). After this change, **every historical close whose
account population lands `gap` under the redesigned arm (a) or (b) re-verifies as `unknown`** —
with D-15's fix, that is genuine orphans and uncovered-movement retirements, not every client who
ever cleanly deactivated or remapped an account. That narrower population is still taken, not
hidden:

- **It is the honest answer.** `verify_close` interrogates; saying "this identity cannot be
  re-established today" is true, and a receipt that silently re-verified on a vacuous `tie` was
  telling the reader nothing.
- **The remedy is a human act with a record, not a code carve-out.** Recording
  `banking_arrangement = no_accounts` with a basis makes the re-verification green again.
- **A date-scoped carve-out is refused.** Scoping the new branch to runs after a date is a dated
  tripwire pinned on ceremony state — the class this estate has already paid for.

The measured population rides to the owner as **PREDICTION P-10** (§Annex): how many sealed
receipts flip, per client, published before and after.

---

## 3 · Item B — N5, the remedy reaches the coding lane

### 3.1 The problem is two-sided, and the naive fix is refused

The coding lane's raises carry no `fix` and its mapper has no slot for one (F6-F8). The obvious
"backfill" — add a `fix` sentence to every coding-lane raise — means CoR'ing raise sites across
`0009`, `0011`, `0015`, `0016`, `0022`, `0028`, `0029`, `0035`, `0036`, `0037`. **Declined (D-4):**
it is a very large D1 surface for prose, and it puts the remedy text in ten places at once — the
same "two rosters that can disagree" defect `0057:1400-1404` exists to prevent.

### 3.2 The design — one governed remedy table, and the dashboard stops being the authority

Today the remedy a human reads is **hardcoded in the frontend**: `reviewCopy.ts:8-16`
(`CLR21_COPY`) / `:39-44` (`CLR05_COPY`), rendered at `JeReviewCard.tsx:369`. The agent, who has no
frontend, sees nothing. The fix moves that authority into the DB, once:

**`clara.refusal_remedies(errcode text, reason text, subsystem text, direction text, remedy text,
basis text, primary key (errcode, reason, subsystem, direction))`** — **gate-folded key (D-16,
D-17):** `(errcode, reason)` alone collides — `CLR05`/`distinct_checker`/`self_attestation` is
independently raised and independently rendered by `CommitGate.tsx`, `openingModel.ts`'s
`refusalHint()`, and the Wave-E reporting/close-reopen band (`0059`/`0072`/`0084`/`0085`), and
`CLR21`/`vendor_malformed` needs a **direction**-sensitive remedy (`reviewCopy.ts`'s
`clr21Copy(reason, direction)` swaps "vendor" for "customer" on a sales filing — the un-keyed
table would render the purchase wording on a customer invoice). `subsystem` names the consuming
lane (`je_review` for item B's own rows; a NULL/`'*'` row is a catch-all fallback only where no
lane collision exists); `direction` is `'purchase' | 'sales' | NULL` (NULL = direction-neutral).
**Code-populated, not firm-configurable**, on the `close_gate_checks` posture (`0056:369-378`):
append-only trigger, no-truncate trigger, RLS forced. **Grant, gate-folded (D-18):** the coding
lanes this item exists to serve (`autoDraft`, `chatTurn`) never connect as `clara_authenticated` —
they connect as `clara_agent_ro` / `clara_wake_interactive` (`packages/runtime/lib/pools.mjs`).
The table therefore mirrors the estate's own agent-catalog pattern (`0059:12`/`0060:372`, a
dedicated `p_..._agent_catalog` policy + `grant select … to clara_agent_ro`), IN ADDITION TO the
existing human-dashboard policy for `clara_authenticated`. Seeded from the existing frontend copy
so **no wording is invented** and the change is a move, not a rewrite.

**Resolution order in the mapper, fail-closed (widened for the new key, D-16/D-17):**

1. `(err.code, reason, subsystem, direction)` present → that remedy.
2. `(err.code, reason, subsystem, NULL)` present (direction-neutral row for this lane) → that remedy.
3. otherwise → **no remedy at all.** An unknown `(code, reason)` for this lane shows the refusal
   with no advice — never a different lane's or a different direction's row. The table wins only
   within the caller's own subsystem/direction.

### 3.3 The oracle objection is answered structurally, not by promise

`chatTurn.v10.errors.ts:72` says the mapper parses the detail *"without leaking raw text"* — that
is a deliberate hardening and this design must not undo it. **It does not:** the coding lane's
mapper still never reads `detail.fix`, never reads `sqlerrm`, and never reads a row value. It
reads a **closed, code-populated table keyed by a token it already trusts**. The authoring lane
keeps its own inline-`fix` path (`chatTurn.v11.tools.ts:80-109`) untouched — two vocabularies, two
mappers, exactly as `:76-79` insists.

### 3.4 The consumer chain

`refusalFromDbError` gains an optional `fix` on its output, and `RefusalPart` gains `fix?: string`.
Both mappers are frozen (`frozen-workflows.json:249`, `:294`), so this ships as new `_vN` error
modules for **`autoDraft`** and **`chatTurn`** plus their registry repoints.
**`chatTurn`'s next version is a shared surface** — F-A2 PR-2 already claims one and F-A3's parity
takes another (`bank-agency-annexes-3-build.md:112-115`). The build lane reads the live registry,
takes the next free number, and tells the conductor before authoring. Wire side:
`apps/dashboard/app/shared/parts.ts:153` gains the field, both `PgrestError` mirrors
(`shared/wire.ts:60-69`, `chat/api.ts:232`) gain it, `chat/parts.tsx:212-220` renders it, and
`JeReviewCard.tsx:369` prefers the DB remedy over `clr21Copy(...)`, keeping the hardcoded lookup
only as a fallback until the table's coverage is proven — then deleting it in the same PR that
proves it. **Gate-folded (D-16):** `JeReviewCard.tsx:370`, a SECOND render site
(`CLR05_COPY[clr.reason]`) the v1 wire list omitted, gains the same DB-remedy-first treatment, and
the call passes `direction` (`directionOf(r?.coding_kind ?? null)`, already computed at `:242`) and
`subsystem: 'je_review'` into the lookup.

### 3.5 What proves it

Three behavioural cells, one of them differential and one a wall:
(1) a real CLR21 refusal renders the DB-owned remedy on the coding card;
(2) **differential** — a refusal whose `reason` has no row renders the refusal **with no remedy**,
not a stale or nearest-match one (fail-closed on the unknown);
(3) **the oracle wall** — force a raise whose `message`/`sqlerrm` carries a unique marker string
and assert the marker is **absent** from the rendered part. A wall proved by refusal, not by
grepping the mapper.

---

## 4 · Item D — the 401/403 retryable auth-code split

### 4.1 One classifier, extracted to a non-frozen lib

A new **packages/runtime/lib/engine-status.mjs** exporting
`classifyEngineHttpStatus(status) -> code`, adopted by all three adapters (F9):

| status | code | note |
|---|---|---|
| `>= 500` | `engine_error` | unchanged |
| `401`, `403` | **`engine_auth`** | the new code |
| `404` | `engine_unavailable` | the statement lane's existing carve-out, now shared |
| everything else | `bad_type` | unchanged, and narrower than today |

`egress.mjs` is a library and adopts it directly. The two workflow adapters
(`invoiceFacts.v1.azure.mjs`, `statementFacts.v1.engine.mjs`) are checked against
`frozen-workflows.json` at authoring time; a frozen one takes a new `_vN`. **The live-adapter
census is PREDICTION P-11** — the F-A1 cutover left the Azure invoice engine as a tombstone, so
that adapter may need no change at all.

### 4.2 The DB code, extended not replaced

**Gate-folded (D-13): the live object is `ck_processing_task_error_code_f_a1`, not
`ck_processing_task_error_code_0038`.** `_0038` was retired inside `0090_f_a1_walls.sql:1518-1519`
and re-cut again (still widened, not renamed) by `0097_f_a1_cutover.sql:352-361`, which added a
29th literal, `wait_exhausted` — `0090:179-181`'s "re-pinned" cite is a PRESTATE probe for 0090's
OWN drop, not evidence the `_0038` name survives it. `ck_processing_task_error_code_f_a1` (live
text, 29 values, `0097:352-361`) is dropped and re-added with `engine_auth` appended as the 30th.
**Shared surface** — the live text is re-read with `pg_get_constraintdef` first, and a prestate
probe aborts loudly if any of the 29 predecessor values is missing (extend-only). It does **not**
join the NEVER-CLAIMED allowlist (`0038:7288-7292`): an auth failure happens on a CLAIMED task, so
the existing `workflow_run_id` arm already admits it.

### 4.3 The narrowing that makes this safe: retryable **at the doors**, not automatically

A 401 is retryable in principle, but the `ocr` lane **is** capped — `0051:910-914`: "the lane's
summed `attempt_count` must be under 3 — the ONLY cap an ingest lane has" (**D-6's ground
corrected, D-20**: the prior text read this citation backwards). Runtime retry is separately
bounded (`documentIngest.behavior_v2.mjs` `MAX_RETRIES=3` ⇒ 4 total attempts). Even so,
**`engine_auth` is admitted at ONE human door, gate-folded (D-14):**

- `clara.finalize_document_intake`'s adopted-branch list (`0051:1286`) gains it — CoR'd inside a
  D1 window, prosrc-SHA prestate pin, tail self-proof.
- **`clara.request_reextraction(uuid,text,text)` needs NO CoR.** Its `failed_retry` door
  (`0051:552-561`) is status-only — it admits ANY `status='failed'` task on the lane already,
  unconditionally, regardless of `error_code` — so `engine_auth` reaches it for free. (This also
  means `corrupt`/`encrypted` are already re-admissible there today, a pre-existing gap outside
  item D's scope — R-5.)

**The runtime `RETRYABLE` sets are left alone, but they are not the only frozen surface — gate-
folded (D-22, D-23).** Each terminal writer downstream of the classifier independently clamps to a
closed literal list, so `engine_auth` must clear TWO more gates before it ever reaches a door:

- **The four catch-side allowlists** (`documentIngest.behavior_v2.mjs:122-127`,
  `invoiceFacts.v1.behavior.mjs:26-31`, `statementFacts.v1.behavior.mjs:~76-109`,
  `statementFacts.v2.behavior.mjs:~111-136`) map any code outside their own set to `'internal'` —
  a code `finalize_document_intake`'s door refuses unconditionally (`0051:1245-1249`). All four are
  frozen (`frozen-workflows.json`); each needs a new `_vN` export + registry repoint (D-22).
- **The three facts-lane terminal writers** (`clara.fail_invoice_facts` `0009:2168-2170`,
  `clara.fail_statement_facts` `0038:2063-2071`, `clara.fail_witness_facts` `0097:397-401`) each
  hardcode their own literal list and clamp anything else to `'engine_error'` — a code that never
  reaches `finalize_document_intake`'s admission check at all. Each is a live SECURITY DEFINER body
  needing its own CoR to admit `engine_auth`, inside PR-3's D1 window (D-23).

Automatic retry under a new `ocr` attempt cap stays deferred, priced in D-6.

### 4.4 What this does NOT do — the seven documents stay stuck

Gate P's seven are already written `bad_type` (F13); a code change does not re-classify terminal
rows. **The split stops the eighth; it does not unstick the seven.** The honest remedy for those
remains the owner re-export ADR-0066 names. A one-time audited reclassification door was
considered and is **not** recommended — it would make `bad_type` re-admissible by human assertion,
which is precisely the "unreadable bytes re-bought forever" hazard `0051:1231-1244` exists to
prevent. It goes to the owner as **OQ-4** rather than being decided here.

### 4.5 What proves it

A forced cell that drives a stubbed 401 through the adapter and asserts the task lands
`engine_auth`, not `bad_type`, on all three facts lanes (D-22/D-23's four modules + three writers,
not just the ocr path); a **differential** cell that drives a 500 and a 400 through the same path
and asserts `engine_error` / `bad_type` respectively; a door cell proving `finalize_document_intake`
admits it; and a **wall** cell proving `corrupt`/`encrypted` are still refused there — extend-
never-weaken, proved by refusal. `request_reextraction` gets a REGRESSION cell, not a wall cell
(D-14): its unconditional `failed_retry` admission is unchanged, not newly widened.

---

## 5 · Item E — F8's single-use door and the two `0034` inherits

**The recommended answer is coverage, not repair (D-2).** `PROGRESS.md:266-267` says F-A2 replaces
F8's host lane; a CoR of `clara.admit_autodraft_task` inside a D1 window, on a body that is
retiring, buys a fix that dies with it. PR-5 therefore:

1. **adds the two cells nothing pins today** (F18) to
   `packages/db/tests/x34-autodraft-retry-door.test.mjs` — one asserting the op-receipt's state
   after a re-admission that is **refused** downstream, one asserting `sales_backfill_batches`
   slot consumption on that same refused path. Both are forced cells: each asserts its precondition
   (a settled receipt exists; a slot is free) or exits by a named skip. **No body is touched, no D1
   window opens, and the two inherits stop being merely recorded.**
2. **carries the ordering inherit forward as a named obligation on F-A2's replacement lane**,
   written into the annexes' cross-item notes (**X-3**), so the successor does not inherit it
   silently the way `0053` inherited it from `0034`.

If the owner wants the repair now (**OQ-5**), the shape is: move the settled-op-receipt delete to
**after** the lane/consent/budget checks, and reserve the sales-backfill slot at the same point —
one live-body CoR, one D1 window, on `clara.admit_autodraft_task`
(`0034_autodraft_retry_door.sql:134`). Priced, not recommended.

---

## 6 · Item F — the ceremony DSN bridge, in-repo

Four artefacts, no product code, no DB:

1. **ops/tls/pooler-ca.crt** — the pooler's CA chain, committed. *A CA public certificate is a
   trust anchor, not a credential*; hard constraint 4 governs DSNs and secrets, and this design
   keeps the DSN env-only, off disk and off argv throughout.
2. **scripts/ops/dsn-pipe.mjs** — reads the DSN on **stdin**, never from argv and never from a
   file; appends `sslmode=verify-full`; sets `PGSSLROOTCERT` to (1) and `NODE_EXTRA_CA_CERTS` for
   the Node client; spawns the given command with the DSN in the **child env only**. It is the
   `wave-e-delta-ceremony-asrun.md:74-79` recipe, made durable.
3. **scripts/ops/dsn-pipe.selftest.mjs** — the **both-directions** TLS proof, because a probe that
   cannot say NO has a meaningless YES: connect **with** the CA and succeed; connect **without**
   it and be **refused**. It also reads the committed certificate's `notAfter` and fails when
   fewer than 30 days remain — a monotonic direction, never a pinned date, so it cannot rot into a
   dated tripwire. **Gate-folded (D-24):** the TLS pair proves nothing about the property hard
   constraint 4 actually turns on — that the DSN never reaches argv or disk. Two more cells, same
   file: an **argv-rejection** cell asserting the tool refuses (or ignores) a DSN passed as a
   process argument rather than on stdin; a **child-env-only** cell asserting the spawned child's
   env carries the DSN and no temp file on disk ever does. Building now, same lane as (2).
4. **docs/ops/dsn-bridge.md**, plus a one-line TLS step added to each of the five runbooks that
   today carry only the argv rule (`wave-b-0019-ceremony-runbook.md:83`,
   `wave-b-0021-ceremony-runbook.md:71-72`, `wave-b-ceremony-runbook.md:45`,
   `runtime-hard-restart.md:26-28`, `DR.md:376`), and a harness-menu row so the next reader finds
   it from `AGENTS.md` without knowing it exists.

**One prediction the build must settle (P-12):** whether `check-leaks.mjs` / gitleaks flag a
`-----BEGIN CERTIFICATE-----` block. If they do, the allowance is narrow, path-scoped and
justified in the gate's own comment — never a widened pattern.

---

## 7 · Items G/H/I — sketches; PROGRESS homes all three at F-A2

Offered so the analysis is not lost. **This lane claims none of them** (D-1); F-A2 adopts, or the
orchestrator re-homes them and `PROGRESS.md` records it.

- **G · the wiki CoR-comment gate.** Mirror the sibling that already solved it: re-mask the block
  itself inside `parseCoRPatches` before the CREATE test — `const masked = maskComments(block)`,
  exactly `censusReadOffsets`' fix (`scripts/wiki-lint-checks.mjs:913-919`), whose comment even
  explains why length preservation keeps the offsets aligned. Add a selftest fixture whose CoR
  block *quotes* a create-function phrase in a comment and must pass. **Judgement logic — its own
  independent review pass.** The wording workaround retires with it.
- **H · `0057` §11's writer-roster successor.** The roster's defect is that it is a temp table
  (F24), so the successor is a **standing** cell, not a longer list: a battery test that derives
  the books-writer set from `pg_proc` at every rig run and diffs it against a committed roster,
  failing on an **unrostered** writer. Extend-never-weaken: the committed roster may gain names,
  never lose them, and a removal needs its own recorded reason.
- **I · `0007`'s firm-limits pseudo-upsert.** The trigger cannot know which columns the caller
  named, so no trigger-level repair is honest. Replace it with a real verb —
  `clara.set_firm_document_limits(p_firm, p_limits jsonb, p_op_key)` doing a genuine
  `insert … on conflict (firm_id) do update set` over **only the keys present in `p_limits`** —
  and recut the trigger to **refuse** a bare INSERT against an existing row rather than emulate
  one. A live-body CoR and a D1 window; `llm_witness_concurrency` becomes settable through a door
  for the first time.

---

## 8 · Item C — the claims accounting class: the convention

**Scope.** The contract asks for *"the account-convention design (E-R10 — the generic lane posts it
unattended now; only the convention needs ruling)"* (`wave-f-contract.md:411-412`). This section
therefore states the standard, the three cases, the options and a recommendation — and **decides
nothing**. The submission/approval surface is Wave G (`wave-e-contract.md:221-222`).

### 8.1 The standard, fetched 2026-08-23 from primary sources

**MPERS (2016) is the standard in force** — MASB's own notice on the acceptance page says the third
edition (MPERS 2025) applies only to periods beginning on or after 1 January 2027.
Source: [MASB MPERS landing page](https://www.masb.org.my/pages.php?id=614) →
[MPERSDec2016_website.pdf](https://www.masb.org.my/pdf/MPERSDec2016_website.pdf), fetched
2026-08-23. Paragraph references below are to that file.

- **Recognition — §2.15(b), §2.20, §2.27, §2.36, §2.39.** A liability is a present obligation from a
  past event whose settlement is expected to require an outflow; it is recognised when the
  obligation exists, outflow is probable and the amount is reliably measurable; and §2.36 puts the
  statements on the **accrual basis** — recognition follows the definition, not the cash. *Applied
  to a claim:* once an employee has incurred a cost on the entity's behalf and the claim is
  approved, the liability exists. **This application is our inference; §2 never says
  "reimbursement".**
- **§28 Employee Benefits — MPERS IS SILENT, and that silence is the finding.** §28.1 scopes
  employee benefits to *"consideration given by an entity in exchange for service rendered"*.
  A full-text search of MPERS for `reimburs*` finds it **only** in §21 (reimbursement assets) and
  §28.28 (a defined-benefit reimbursement right) — **never** for an employee's out-of-pocket
  expense claim. So the common reading *"a reimbursement is not an employee benefit"* is a
  reasonable inference from §28.1's own words and **is not a quotable MPERS statement.** Recorded
  as an inference so nothing downstream cites it as text.
- **§22 Liabilities and Equity — no sole-proprietor section exists.** §22.17 reduces equity for
  distributions to holders of equity instruments; §22.19 makes transactions with owners **in their
  capacity as owners** equity transactions, not P&L. §4.13 is the only place MPERS contemplates an
  entity without share capital (*"such as a partnership or trust"*), and only for disclosure. The
  drawings/capital mechanics are therefore §22.19 + §4.13 **by analogy**, not a named provision.
- **§33 Related Party Disclosures — a director's claim is squarely in scope, and this one is not
  inference.** §33.2(a)(i) makes a director key management personnel and so a related party;
  §33.6-33.7 require KMP **compensation** (employee benefits per §28) disclosed in total;
  **§33.8(c)** gives as an example of a related-party transaction a person who controls the entity
  incurring expenses directly that would otherwise be borne by the entity; **§33.12(i)** lists
  settlement of liabilities on behalf of the entity; and §33.9 requires outstanding balances
  disclosed. A director's expense claim is a §33 transaction **and** its year-end balance is
  separately disclosable — distinct from the §33.7 compensation total.
- **MIA — NOT FOUND at official source.** The current By-Laws (On Professional Ethics, Conduct and
  Practice), [updated Jan 2026, effective 15 December 2026](https://mia.org.my/by-laws/), were
  full-text searched for `reimburs`, `expense claim`, `supporting document`, `source document`:
  the only `reimburs*` hits concern reimbursing an inducement's cost (an independence topic).
  **No MIA by-law, circular, technical release or FAQ on expense-claim documentation exists** as
  far as MIA's own published materials show. Stated as an absence, not filled with a secondary
  source.
- **Companies Act 2016 s.245 — the record-keeping obligation.** SSM's consolidated text
  ([Act 777 as at 1.8.2022](https://www.ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016_Akta%20777_BI%20(1.8.2022).pdf)):
  s.245(1) records sufficient to **explain the transactions** and permit true-and-fair statements;
  **s.245(2) entries within 60 days** of the transaction; **s.245(3) retention for 7 years**;
  s.245(9) a fine up to **RM500,000** and/or 3 years' imprisonment. **The receipt behind a claim is
  part of the statutory record**, not optional supporting colour.
- **LHDN — the tax side does NOT follow the accounting side, and this is the load-bearing one.**
  Public Ruling **5/2019 "Perquisites From Employment"** (19 November 2019),
  [PR_05_2019.pdf](http://lampiran1.hasil.gov.my/pdf/pdfam/PR_05_2019.pdf): **§3.7 defines
  "reimbursement" as a sub-species of perquisite** — an expense incurred by the employee and
  subsequently reimbursed; **§6.3** makes any personal pecuniary liability of the employee settled
  or reimbursed by the employer a **taxable perquisite** under ITA s.13(1)(a); §7.2.1 exempts a
  travelling allowance to RM6,000/year with records kept **7 years**; §3.2 defines "Document" to
  include invoices, vouchers and receipts. **NOT FOUND:** any public ruling stating the
  reimbursement-vs-perquisite distinction as one general principle — only these category-specific
  rules. So *"is this a reimbursement or a perquisite?"* has **no mechanical answer** in the
  published law.

### 8.2 The three cases are legally distinct, and two of them are not choices

| case | treatment | why it is not a preference |
|---|---|---|
| **employee** claim | expense (or asset) at approval, credit a **non-`payable`-class** "amount owing to employee" liability | WC-R10 (`wave-c-contract.md:56`) + digest law 19; MPERS §2.27/§2.36 fixes the timing |
| **director** claim | credit **`420-D01` "Amount owing to director — current"** (or `472-DIR`), **never** the employee account | MPERS §33.8(c)/§33.12(i) make it a related-party transaction and §33.9 makes the balance separately disclosable — merging it into a staff account **destroys a required disclosure** |
| **sole proprietor** (BEE) | **EQUITY** — credit `100-CAP`; drawings to `160-DRW`. Never a payable, never a claim | digest law 19 + hard constraint 13; MPERS §22.19 (owners in their capacity as owners); `coaTemplate.ts:249` — *"the proprietor cannot be his own director or his own debtor, and money he puts in or takes out is capital"* |

**Netting is refused as a default.** The chart's own director note states the rule
(`coaTemplate.ts:263`): *"Directional. Never net against 420-D01 without a legally enforceable
right of set-off."* The same binds an employee holding both an advance (receivable) and a claim
(payable): presented gross unless a set-off right is recorded.

**Split boundary (2026-08-23, the 500-line ceiling): §8.3 onward, incl. §9-§10 and the
2026-08-23 OQ-9 ruling, continues in `fix-queue-design-part2.md`.** Section numbers unchanged.
