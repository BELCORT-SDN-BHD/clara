# F-T4 · The fix queue — annexes

**v2 · 2026-08-23 · gate-folded.** Design set 3 of 3. Mechanics (batteries · censuses ·
predictions), the decision register (**D-13..D-25** are this fold's), the cross-item notes and the
owner questions (**OQ-9** is new) for `fix-queue-design.md`, read against `fix-queue-survey.md`'s
findings **F1-F33**. Full gate record: `fix-queue-gate-record.md`.

---

## Annex A · Mechanics

### A.1 The batteries, cell by cell

**Discipline for every cell below.** A wall is proved by a cell that makes it **REFUSE**, never by
a substring match on source text. A forced cell **asserts its precondition** or exits through a
**named, counted** `skipHere`/`t.skip` — never `noteLane`+return, never a `.catch(()=>…)` that
swallows a premise, never a `?? wire.x` that hides a durable read, never an OR between two walls.
Fixtures THROW on construction failure. Differential cells are preferred to self-referential ones:
where a cell could assert against the thing it just wrote, it asserts against a **sibling that
must differ** instead.

#### PR-4 · item A (P-3, drawer 1's zero census)

| cell | shape | what it proves |
|---|---|---|
| **ft4.a** | client with **zero** `bank_accounts` and **no** `banking_arrangement` fact → evaluate the close gates | drawer 1 reads `unknown` with reason `bank_registry_undeclared`, **and `finalize_close` raises `CLR41 drawer1_state_unknown`** — the wall refuses, which is the proof (F1/F4) |
| **ft4.b** | **differential on ft4.a**: same client, one fact `no_accounts` recorded through the REAL `record_client_fact` door with a basis | the gate reads `tie` and the close proceeds. One input changed, one verdict changed — the door works and it is the only thing that opened it |
| **ft4.c** | zero rows, fact `has_accounts` | `gap` / `bank_registry_contradicted` → drawer 1 `unknown`. A declared registry that is empty is a contradiction, not a pass |
| **ft4.d** | **gate-folded (D-15).** one registered account, flag set, account **deactivated**, **zero uncovered movement** in the FY | arm (a) reads `clear` — a clean deactivation with nothing outstanding is not a gap. **Forced:** asserts `is_bank_account` survived the deactivation (`0038:2532-2535`) or exits by the named skip `ft4.d : flag-not-retained` |
| **ft4.d2** | **differential on ft4.d** — same client/account/history, but **uncovered movement** in the FY (no reconciliation, current or historical, accounts for it) | arm (a) reads `gap` — the measured check, not the flag alone, is what fires |
| **ft4.d3** | **differential on ft4.d, the remap case** — account remapped to a new COA code (`remap_bank_account_coa`), old code carries the flag with zero movement | reads `clear` — the old code's history (via the remap audit payload) rescues it, not just the new code's active binding |
| **ft4.d4** | **positive control preserved** — a COA account with the flag and NO `bank_accounts` row of any status ever bound to it or any superseded code (the true orphan) | still reads `gap` — the redesigned arm (a) still catches the population it exists to catch |
| **ft4.e** | **positive control** — a normally registered, reconciled client | still `tie`, and the `accounts` array is byte-shaped as before the change. Proves the new branch did not blanket-fail (a read that cannot say YES is as useless as one that cannot say NO) |
| **ft4.f** | `clara.verify_close` on a **sealed** receipt for a bankless client, then again after the fact is recorded | `unknown` then `tie` — the retroactivity of F4 proved in **both** directions, and the human remedy proved to work |

#### PR-2 · item B (N5)

| cell | shape | what it proves |
|---|---|---|
| **ft4.g** | drive a real CLR21 refusal through the coding lane | the DB-owned remedy reaches the rendered refusal part |
| **ft4.h** | **differential** — a refusal whose `reason` has **no** `refusal_remedies` row | the part renders **no remedy at all**. Fail-closed on the unknown; never a nearest match, never a stale string |
| **ft4.i** | **the oracle wall** — force a raise whose `message`/`sqlerrm` carries a unique marker token | the marker is **absent** from the rendered part. This is the cell that proves §3.3's claim rather than asserting it |
| **ft4.j** | census — every key in `reviewCopy.ts`'s `CLR21_COPY`/`CLR05_COPY`, **keyed on `(errcode, reason, subsystem='je_review', direction)` — gate-folded (D-16, D-17)** | has a `refusal_remedies` row with **identical** text. The seed is a MOVE, not a rewrite; extend-never-weaken on both sides. Domain is `je_review`'s rows only — it neither asserts nor forbids rows for `CommitGate`/`openingModel`/Wave-E's independent `(CLR05, distinct_checker/self_attestation)` renderers, which keep their own copy untouched |
| **ft4.j2** | **gate-folded (D-16), differential** — a sales-direction (`coding_kind='sales_invoice'`) filing refused `vendor_malformed` | renders the CUSTOMER-noun remedy (`refusal_remedies` row keyed `direction='sales'`), never the purchase-wording row; the un-keyed table's would-be collision is the wall this cell proves refused |

#### PR-3 · item D (the 401/403 split)

| cell | shape | what it proves |
|---|---|---|
| **ft4.k / ft4.l** | stubbed vendor **401** / **403** through the `invoice_facts` adapter, **through the CoR'd `fail_invoice_facts` writer (D-23)**, past `invoiceFacts.v1.behavior.mjs`'s new `_vN` (D-22) | the task lands `error_code='engine_auth'`, not `bad_type` and not `internal` |
| **ft4.k2 / ft4.l2** | **gate-folded (D-22, D-23), same shape, `statement_facts` and `llm_witness` lanes** — 401/403 through `fail_statement_facts` and `fail_witness_facts`, past the `statementFacts.v1`/`.v2`/`witnessFacts.v2` `_vN` catch modules | same: lands `engine_auth` on all three lanes, not just `ocr` |
| **ft4.m** | **differential** — stubbed **500** and **400** on the same path | `engine_error` and `bad_type` respectively. The new arm did not swallow its neighbours |
| **ft4.n** | an `engine_auth` task offered to `finalize_document_intake`'s adopted branch | admitted |
| **ft4.o** | **gate-folded (D-14) — REGRESSION, not a door proof.** an `engine_auth` task, and separately a `corrupt`/`encrypted` task, offered to `request_reextraction`'s `failed_retry` door | BOTH admitted, unconditionally, exactly as before this item — `request_reextraction` gates on task `status` only, never `error_code`; this cell proves the door is UNCHANGED, not that it newly admits `engine_auth` |
| **ft4.p** | **the wall, scope-corrected (D-14)** — `corrupt` and `encrypted` offered to `finalize_document_intake`'s door only | still **refused**, `reason='not_retryable'`. Extend-never-weaken, proved by refusal (`0051:1231-1244`). **Not** asserted of `request_reextraction` — see ft4.o and R-5 |
| **ft4.q** | prestate probe on the CHECK swap, **against `ck_processing_task_error_code_f_a1`'s live 29-value text (D-13)** | every one of the 29 pre-`engine_auth` values is still admitted **and** an unlisted value is still rejected — both directions, so a widened predicate cannot pass as an extended one |

#### PR-5 · item E, and PR-1 · item F

- **ft4.r** — a re-admission **refused** downstream by the lane/consent/budget gates: assert the
  settled op-receipt's state afterwards. **Forced:** asserts a settled receipt existed before the
  call, or exits by the named skip `ft4.r : no-settled-receipt`.
- **ft4.s** — the same refused path: assert `sales_backfill_batches` slot consumption.
  **Forced:** asserts a free slot existed, or exits by `ft4.s : no-free-slot`.
- **PR-1's battery is the selftest at scripts/ops/dsn-pipe.selftest.mjs**, both-directions on TLS:
  connect **with** the committed CA and succeed; connect **without** it and be **refused**; read
  the certificate's `notAfter` and fail under 30 days remaining. A probe that cannot say NO has a
  meaningless YES — the refusal half is the load-bearing half.
- **ft4.t / ft4.u — gate-folded (D-24), building now (PR-1 severed, D-25).** `ft4.t`: invoke
  **scripts/ops/dsn-pipe.mjs** with the DSN passed as a process argument (not stdin) and assert it is
  refused or ignored — never connected with. `ft4.u`: assert the spawned child's environment carries the DSN
  and that no temp file anywhere under the run's working tree ever contains it. Neither cell
  existed in v1; the TLS pair alone proved nothing about hard constraint 4's actual property.

### A.2 The ten closed-world censuses (survey §8)

Extend-never-weaken. None may be narrowed to make a fix fit; a removal needs its own reason.

| # | census | site | item |
|---|---|---|---|
| C1 | **gate-folded (D-13).** `ck_processing_task_error_code_f_a1`'s 29 values (was: `_0038`'s 26 — retired name, undercounted) | `0097:352-361` (live); `_0038`'s original 26 at `0038:7279-7286`, retired `0090:1518-1519` | D |
| C2 | **gate-folded (D-21), widened 3 → 6.** the SIX `RETRYABLE` sets (one ratified set, duplicated by design — each carries a "copied VERBATIM from X" comment naming the others) | `documentIngest.behavior_v2.mjs:132` · `invoiceFacts.v1.behavior.mjs:24` · `statementFacts.v1.behavior.mjs:64` · `statementFacts.v2.behavior.mjs:105` · `witnessFacts.v1.behavior.mjs:96` · `witnessFacts.v2.behavior.mjs:117` | D |
| C3 | `finalize_document_intake`'s four-name retryable list — **gate-folded (D-14): the SOLE such list on this surface**, `request_reextraction` has none | `0051:1286` | D |
| C4 | the NEVER-CLAIMED allowlist (`budget`/`attempt_cap`/`skipped_kind`) | `0038:7288-7292` | D |
| C11 | **new, gate-folded (D-22, D-23).** the four frozen catch-side allowlists (clamp to `internal`) and the three facts-writer clamps (clamp to `engine_error`) — the surfaces `engine_auth` must ALSO clear | `documentIngest.behavior_v2.mjs:122-127` · `invoiceFacts.v1.behavior.mjs:26-31` · `statementFacts.v1.behavior.mjs:~76-109` · `statementFacts.v2.behavior.mjs:~111-136` · `0009:2168-2170` (`fail_invoice_facts`) · `0038:2063-2071` (`fail_statement_facts`) · `0097:397-401` (`fail_witness_facts`) | D |
| C5 | `close_gate_checks`' 13 rows and `_evaluate_one_gate`'s `case` | `0056:391-405`, `:1435-1447` | A |
| C6 | `client_fact_keys` — 4 rows today | `0055:370-381` · `0056:1233-1239` · `0062:172-183` | A |
| C7 | `verify_close`'s four-identity strict probe array | `0056:2544-2548` | A |
| C8 | `staff_advance_applications.kind`'s four values | `0043:544-545` | C |
| C9 | `frozen-workflows.json`'s entry set | `:249`, `:294`, `:624` and siblings | B, D |
| C10 | `_x57_roster`'s hand list | `0057:1414-1480` | H (F-A2's) |

### A.3 The twelve predictions the rig replay must settle

A correction is a design amendment, not a bug. **P-3 and P-6 can each invalidate a design.**

| id | prediction |
|---|---|
| **P-1** | the live `clara.bank_recon_close_state(uuid,uuid)` prosrc still carries the `v_state text := 'tie'` initialiser and the registry-origin loop unchanged since `0056` — pin the sha |
| **P-2** | `clara.verify_close(uuid)`'s strict array still names exactly the four drawer-1 identities, `bank_recon_close_state` among them |
| **P-3** | across the live estate, **zero** `coa_accounts` rows carry `is_bank_account = true` for any client with **zero** `bank_accounts` rows — F3's circularity, measured in data, both directions. **If false, arm (b) is narrower than designed and arm (a) is wider** |
| **P-4** | **gate-folded (D-13), corrected object.** the live `ck_processing_task_error_code_f_a1` text equals `0097:352-361` verbatim (`pg_get_constraintdef`), 29 values including `wait_exhausted` — the extension is additive against the REAL live predecessor, not the retired `_0038` name/26-value list |
| **P-5** | **gate-folded (D-14) — SETTLED, not a prediction.** Re-derived directly against source, not merely predicted: `clara.finalize_document_intake`'s live body carries the four-name retryable list at exactly one site (`0051:1286`); `clara.request_reextraction`'s `failed_retry` door (`0051:552-561`) carries NO error-code list at all — one list, not two. Rig replay confirms rather than settles this |
| **P-6** | an **agent-lane** approval (no `checked_via_rule_id`) still writes a `rule_sightings` row and can still trip the 3-sighting `vendor_account` proposal. **If true, item C needs a wall before any unattended claim posts** (F28) |
| **P-7** | the live Gate-P population is still seven `ocr`/`failed`/`bad_type` tasks with NULL `document_kind`, and each newest task's vendor error text is consistent with a 401/403 — measured, never assumed |
| **P-8** | `x34-autodraft-retry-door.test.mjs` contains no cell asserting op-receipt state after a **refused** re-admission, nor slot consumption on one — F18's census, re-run |
| **P-9** | no live COA in the estate carries an "amount owing to employee" account under any spelling — F31's gap on real charts, not on the template |
| **P-10** | the count of sealed `close_receipts` whose `verify_close` flips to `unknown` under PR-4, **per client** — published before and after (§2.5). The number rides to the owner |
| **P-11** | which of the three Azure adapters is still live post-cutover, and which are frozen — the F-A1 cutover left the invoice engine a tombstone, so that adapter may need no change |
| **P-12** | whether `check-leaks.mjs` / gitleaks flag a `-----BEGIN CERTIFICATE-----` block. If so, the allowance is narrow, path-scoped and justified in the gate's own comment — never a widened pattern |

---

## Annex B · The decision register

Each row is a call this design made, its ground, and what it costs.

| id | decision | ground | cost accepted |
|---|---|---|---|
| **D-1** | **Items G, H and I stay F-A2's.** F-T4 designs a fix for each and claims none. Item **F** is F-T4's **by elimination** | `PROGRESS.md:335` sends four tooling items to *"the F-A2 / F-T4 fix queues"* without splitting; the Known-issues rows for G/H/I each end **"re-homed to the F-A2 fix queue"** (`:365`, `:401`, `:422-423`) and F's does not (`:335-339`). PROGRESS is the state authority (constraint 8) | if the orchestrator wants them here it is a re-home, and PROGRESS records it — **OQ-6** |
| **D-2** | **Item E gets coverage, not repair.** Two cells, no body, no D1 | `PROGRESS.md:266-267` — F-A2 *"replaces F8's host lane"*. A D1 CoR on a retiring body buys a fix that dies with it | the ordering inherit stays live until F-A2 lands; carried as **X-3** so the successor does not inherit it silently — **OQ-5** |
| **D-3** | **P-3's door is a client FACT, not an attestation.** Drawer 1 gains no attestation path | the exact `trade_nature` precedent (`0056:1233-1239`): a missing INPUT supplied through the existing audited door, never an override of an absolute gate | one more thing a firm must record before closing a bankless client — with who/basis/when, which is the point |
| **D-4** | **The producer-side `fix` backfill across ten applied migrations is DECLINED.** A governed `refusal_remedies` table instead | a very large D1 surface for prose, and it would put the remedy text in ten places — the "two rosters that can disagree" defect `0057:1400-1404` exists to prevent | new raises must remember the table; the census cell **ft4.j** is what keeps it honest |
| **D-5** | **The coding mapper still never reads `detail.fix`.** It reads the table by `(code, reason)` | `chatTurn.v10.errors.ts:72` — *"without leaking raw text"* is a deliberate hardening, and a backfill that forwards free text would undo it | a raise cannot ship a bespoke one-off remedy inline on the coding lane; it must add a row |
| **D-6** | **`engine_auth` is retryable at ONE human door only** (`finalize_document_intake` — D-14 drops `request_reextraction` from item D's scope entirely), never in the runtime `RETRYABLE` sets | **gate-folded (D-20): ground corrected.** The prior ground ("no attempt cap") was false at its own citation — `0051:910-914` states the `ocr` lane's summed `attempt_count` IS capped at 3, "the ONLY cap an ingest lane has," and the runtime step retry budget independently bounds it to 4 total attempts (`documentIngest.behavior_v2.mjs` `MAX_RETRIES=3`). The narrowing decision itself stands on its own merits — a human gate, not an unbounded-spend hazard — recorded honestly this time | a transient 401 still needs a human to re-open it; the automatic path with a new `ocr` cap is deferred, priced |
| **D-7** | **The P-3 verdict FOLDS into the worst-wins aggregation; it never early-returns** | an early return would suppress the per-account array a reader needs and would let a registry gap mask a real mismatch | one extra key (`registry`) on the returned object; `measured_digest` changes for every client, which is expected and stated |
| **D-8** | **No date-scoped carve-out for the `verify_close` flip** | scoping the branch to runs after a date is a dated tripwire pinned on ceremony state — the class this estate has already paid for | historical receipts for bankless clients re-verify `unknown` until the fact is recorded (**P-10**, **OQ-3**) |
| **D-9** | **Claims: employee → one non-payable control account (Option 1); director → `420-D01` MANDATORY; sole proprietor → EQUITY MANDATORY; netting OFF by default** | MPERS §33.8(c)/§33.12(i)/§33.9 make the director case a disclosure requirement, not a preference; digest law 19 + hard constraint 13 + MPERS §22.19 fix the proprietor case; `coaTemplate.ts:263` forbids netting without an enforceable set-off right | no per-person subledger until Wave G's register — **OQ-1**, **OQ-2** |
| **D-10** | **One predicate, and this design writes the CONTRACT, not a second body** | `bank-agency-annexes-3-build.md:119-121`, obligation 6 — one owner, two call sites | if PR-4 merges first it authors the body to §2.1's contract and F-A3 calls it; either order, one body |
| **D-11** | **PR-1 (the DSN bridge) ships first and alone** | every remaining ceremony walks it; it has degraded to CA-unpinned TLS twice (F22); it touches no DB and no product code | none — nothing gates it |
| **D-12** | **The pooler CA certificate is committed to the repo** | a CA public certificate is a trust anchor, not a credential; hard constraint 4 governs DSNs and secrets, and the DSN stays env-only, off disk and off argv | the gates may need a narrow path-scoped allowance (**P-12**), and the certificate needs rotation — handled by the selftest's monotonic expiry check, not a pinned date |

**The gate fold, 2026-08-23 — D-13..D-25 (`fix-queue-gate-record.md`).**

| id | decision | ground | cost accepted |
|---|---|---|---|
| **D-13** | **§4.2's CHECK swap targets `ck_processing_task_error_code_f_a1` (29 values), not the retired `ck_processing_task_error_code_0038` (26 values)** | `_0038` was dropped inside `0090_f_a1_walls.sql:1518-1519` and re-cut widened (not renamed) by `0097_f_a1_cutover.sql:352-361`, adding `wait_exhausted` as a 29th literal; the design's own "re-pinned" cite (`0090:179-181`) is a prestate probe for 0090's OWN drop, not evidence `_0038` survives it | none — a name/count correction against the same live surface; C1/P-4/ft4.q all re-cited |
| **D-14** | **`clara.request_reextraction(uuid,text,text)` needs NO CoR for item D; §4.3's "two human doors" framing is one door** | its `failed_retry` door (`0051:552-561`) is status-only — admits any `status='failed'` task on the lane unconditionally, regardless of `error_code` — so `engine_auth` reaches it for free; there is no error-code list there to extend (P-5 re-derived, not merely predicted) | PR-3's D1 surface shrinks by one CoR; the pre-existing `corrupt`/`encrypted` admissibility through this door is a real gap, but outside item D's scope — **R-5** |
| **D-15** | **Item A arm (a) is redesigned to a MEASURED check** — no `bank_accounts` row of any status (current or, via the remap audit trail, superseded) bound to the code, AND uncovered movement in the FY | `is_bank_account` alone cannot distinguish a genuine orphan from a legitimately deactivated (`0038:2532-2535`) or remapped (`0038:2979-2988`) account — the durable-flag-only predicate fired on every clean deactivation/remap, permanently blocking `finalize_close` (CLR41) with no remedy `banking_arrangement` could rescue | more predicate complexity (a historical/superseded-code lookup); §2.5's retroactive population narrows correspondingly — re-measure for **P-10** |
| **D-16** | **`clara.refusal_remedies` gains a `direction` key member** | `reviewCopy.ts`'s `clr21Copy(reason, direction)` swaps "vendor" for "customer" on a sales filing; an un-keyed table would render purchase wording on a customer invoice at the card gating an accounting approval | the seed must carry direction-neutral AND direction-sensitive rows; ft4.j/ft4.j2 re-cut |
| **D-17** | **`clara.refusal_remedies` gains a `subsystem` key member** | `(CLR05, distinct_checker)`/`(CLR05, self_attestation)` are independently raised and independently rendered by `CommitGate.tsx`, `openingModel.ts`'s `refusalHint()`, and the Wave-E reporting/close-reopen band (`0059`/`0072`/`0084`/`0085`) — a bare `(errcode, reason)` key would let a future consumer render the coding lane's JE-specific copy on a report or close-reopen decision | the seed is scoped to `subsystem='je_review'` only; other lanes keep their own hardcoded copy untouched for now, unclaimed by this design |
| **D-18** | **`clara.refusal_remedies`' grant/policy adds `clara_agent_ro`**, mirroring `0059:12`/`0060:372`, alongside the existing `clara_authenticated` policy | the coding lanes (`autoDraft`, `chatTurn`) connect via `clara_agent_ro`/`clara_wake_interactive` (`packages/runtime/lib/pools.mjs`), never `clara_authenticated` — a v1 grant to `clara_authenticated` only would make N5's stated purpose (the remedy reaching the agent) undeliverable | one more grant + policy pair; no new role, no new verb |
| **D-19** | **§2.1's shared predicate contract states its security posture explicitly**: `security definer`, owner `clara_fn_owner`, `set search_path = clara, pg_temp`, `revoke all … from public`, and an explicit `clients.firm_id = c.firm` check | `trial_balance_as_of` (the read path §2.1 names) is bare `security invoker` with no caller-side firm check (`0017_wave_b.sql:3572-3574`); the sibling this predicate plugs into, `bank_recon_close_state`, pins all of this explicitly (`0056:1029`, `:2027-2033`) — a shared cross-lane contract (D-10) that omits it lets whichever lane authors first ship an RLS-free, PUBLIC-executable trial-balance reader | one more clause on a not-yet-written contract; costs nothing to state now |
| **D-20** | **D-6's stated ground is corrected** (see D-6, above) | the original ground was false at its own citation | none — the narrowing decision itself is unchanged and correctly grounded now |
| **D-21** | **Census C2 widens from three `RETRYABLE` sets to all six** | `grep -rn "const RETRYABLE" packages/runtime` finds six, not three; the two the v1 census omitted (`statementFacts.v1`/`.v2`) sit directly in item D's own blast radius (§4.1 names `statementFacts.v1.engine.mjs` as an adapter it changes) | a wider closed-world census; no behavioural change |
| **D-22** | **The four frozen catch-side allowlists need new `_vN` exports + registry repoints** for `engine_auth` to survive past them (they clamp any unrecognised code to `internal`, which `finalize_document_intake`'s door refuses permanently) | `documentIngest.behavior_v2.mjs`, `invoiceFacts.v1.behavior.mjs`, `statementFacts.v1.behavior.mjs`, `statementFacts.v2.behavior.mjs` are all frozen (`frozen-workflows.json`) and none admits `engine_auth` today; §4.3's "no frozen behaviour module needs a new version" was wrong | four new runtime files + repoints, priced into PR-3; not a DB D1 cost |
| **D-23** | **The three facts-lane terminal writers need their own CoR** to admit `engine_auth` (they independently clamp any unrecognised reason to `engine_error` before the value ever reaches a door) | `clara.fail_invoice_facts` (`0009:2168-2170`), `clara.fail_statement_facts` (`0038:2063-2071`), `clara.fail_witness_facts` (`0097:397-401`) each hardcode their own literal list; §4.2's "The DB code, extended not replaced" named only the CHECK, not these three live SECURITY DEFINER bodies | three more CoR'd bodies inside PR-3's D1 window — a materially larger quiesce than §9 v1 published |
| **D-24** | **PR-1's selftest battery gains an argv-rejection cell and a child-env-only/no-disk cell** | the TLS with/without-CA pair proves only the TLS wall; it proves nothing about the argv-never/disk-never property hard constraint 4 actually turns on, and the design's own law (`§0`: "the proof of a wall is a cell that makes it REFUSE") was unmet on this point | two more selftest cells; being implemented now by the severed PR-1 lane (D-25) |
| **D-25** | **PR-1 (item F) is SEVERED from the Track-B joint PR-0 gate and owner sitting** | **owner ruling, 2026-08-23.** The joint six-set gate's own sequencing put Track A's imminent ceremony windows (W1-W4 inside T0+25h; W5's ≥96h buffer is still short of the joint gate's own 14-21 day estimate) ahead of PR-1 clearing a gate shared with three multi-week tax-engine designs, risking a third CA-unpinned-TLS ceremony exactly as F21/F22 already recorded twice | PR-1 ships as its own PR, gated only by its own selftest (D-24) and the uniform ADR-061 ladder — not by this gate or the owner sitting on items A/B/C/D/E |

---

## Annex C · Owner questions

**Eight, plus one gate-folded (OQ-9).** Each states the collision, the options, the cost of each,
and a recommendation. Nothing below is decided by this lane.

**OQ-1 · The employee expense-claim convention.** WC-R10 already rules *no counterparty kind* and
*a non-`payable`-class liability credit* (`wave-c-contract.md:56`, digest law 19). What is unruled
is the shape. **(A)** one client-level control account, "Amount owing to employee — expense
claims", credited at approval; person-level detail waits for Wave G's register. **(B)** clone the
D-b advance register: one per-person account carrying both directions, net. **(C)** hybrid — two
directional per-person accounts plus an explicit application verb. *Costs:* (A) "who is owed what"
is a journal-line read until Wave G; (B) the account flips between asset and liability across the
year, which collides with the set-off rule the chart itself states (`coaTemplate.ts:263`), and
`staff_advance_applications.advance_id` is `NOT NULL` so a pure out-of-pocket claim has no row
without widening the register; (C) two accounts per person in a chart that has neither.
**Recommendation: (A)**, with Wave G building the register properly rather than overloading the
advance account and inheriting a set-off problem.

**OQ-2 · The sole proprietor's personally-paid business expense — which equity account?** Law 19
and hard constraint 13 settle that it is EQUITY, never a payable and never a claim; MPERS §22.19
agrees (owners in their capacity as owners). What is open is **`100-CAP`** (what the proprietor
contributed) versus the **accumulated-equity** account (`coaTemplate.ts:701`). The template
deliberately refuses a strict capital/current split and says Form B's financial particulars are
served by the three accounts **together**. *Cost either way is presentational, not statutory.*
**Recommendation: `100-CAP`** — a personally-funded business cost is a contribution — recorded as
the convention so the agent never chooses per-transaction.

**OQ-3 · The retroactive `verify_close` flip.** After PR-4, every sealed close of a client with no
registered accounts re-verifies as `unknown` until `banking_arrangement` is recorded (§2.5,
**P-10**). **(A)** accept it and let firms record the fact as they meet it. **(B)** hold PR-4 until
the fact is backfilled for every affected client, so nothing ever flips. *Costs:* (A) a reader may
meet an `unknown` on a receipt that read clean yesterday; (B) delays a real fix behind a data
chore on live books. **Recommendation: (A)** — the `unknown` is true, and the remedy is one audited
human act. The measured population is published before merge either way.

**OQ-4 · Gate P's seven documents.** The split stops the eighth; it does **not** unstick the seven,
which already carry `bad_type` (§4.4). **(A)** the owner re-export ADR-0066 names. **(B)** a
one-time audited door that re-classifies those seven by uuid. *Costs:* (A) manual work on seven
documents; (B) makes `bad_type` re-admissible by human assertion, which is exactly the
"unreadable bytes re-bought forever" hazard `0051:1231-1244` exists to prevent — and a door built
once is a door that exists. **Recommendation: (A).**

**OQ-5 · Item E — repair now, or cover now and repair at F-A2?** **(A)** PR-5's two cells only
(D-2). **(B)** additionally CoR `clara.admit_autodraft_task` inside a D1 window to move the
op-receipt delete after the refusal checks. *Costs:* (A) the ordering inherit stays live until
F-A2's lane replaces it; (B) a D1 window and a live-body CoR on a body that is retiring.
**Recommendation: (A)**, with **X-3** making the obligation explicit on the successor.

**OQ-6 · Items G, H and I — confirm the home.** `PROGRESS.md` homes all three at F-A2 in terms
(D-1) and this order named them to F-T4. **(A)** they stay F-A2's; F-T4's §7 sketches are handed
over. **(B)** re-home to F-T4, and `PROGRESS.md` records the move. *Cost of getting this wrong is
the double-claim class the F-A4/Track-B collision already cost a gate round.* **Recommendation:
(A)** — none of the three is Track-B work, and the analysis travels either way.

**OQ-7 · What does the agent do with a claim she cannot classify?** PR 5/2019 §3.7/§6.3 make
"reimbursement" a sub-species of *perquisite*, and there is **no** public ruling stating the
reimbursement-vs-perquisite line as a general principle (F33). Under law 71 she posts unattended.
**(A)** refuse to post and open an `open_questions` row naming the missing fact. **(B)** post to
the claims liability and flag for review. *Costs:* (A) a human touches more claims; (B) a
misclassified perquisite lands in the books and in the payroll/BIK reporting downstream of it.
**Recommendation: (A)** — accounting-correctness outranks throughput (hard constraint 1), and
WC-R10 already says this judgement is one Clara must never make silently. A claim with **no filed
document** is refused outright regardless: CA 2016 s.245(1)/(3) makes the receipt part of the
statutory record.

**OQ-9 · Item C's employee-claim convention needs an explicit year-end cut-off rule — owner-
reserved, gate-folded, not decided by this lane.** §8.2/§8.3 recognise the employee claim's
liability **at approval**, citing MPERS §2.27/§2.36 (accrual) for the timing — but approval is
evidence of the obligation, not the obligating event; the obligating event is the employee
incurring the cost on the entity's behalf, and §2.36 argues for accrual AT the cost, not at
whenever someone later approves it. No cut-off rule exists anywhere in the F-T4 set (grepped,
zero hits), and no `close_gate_checks` gate would ever surface the misstatement (`_close_gate_uncoded`
keys on `document_id`, not `posting_date`, so a December cost approved and posted in January
passes uncaught). **(A)** add an explicit cut-off clause to §8.2/§8.3 — accrue at FY-end for a
cost incurred on the entity's behalf, approval or not, superseding "§2.27/§2.36 fixes the timing"
with the corrected reading. **(B)** ship §8.2/§8.3 as drafted (approval-triggered) and accept the
cut-off risk as a known limitation until Wave G's register lands. *Costs:* (A) the convention
needs one more clause and a coding-lane rule to test posting-vs-incurred dates, which does not
exist yet; (B) a cost incurred before year-end and approved after understates the period's
expenses and the related liability, with both drawers reading green. **Recommendation: (A)** —
hard constraint 1 (accounting-correctness precedence) and the absence of any gate that would ever
catch (B)'s failure mode make the fail-closed default the cut-off rule, not the approval trigger;
until the owner rules, **item C's employee row does not ship** (R-4's ADR/chart-notes ratification
waits on this card, same as OQ-1/OQ-2/OQ-7).

**OQ-8 · The landscape-refresh autonomy class — does it stay parked?** `0053:116-119` records it
unbuilt and unruled: *"a sweep-side 'counterparty landscape refreshed, re-offer this filing'
behaviour is a genuinely different AUTONOMY CLASS — the machine deciding to redo work a human
rejected — and needs its own owner ruling before anything is built."* Law 71 has since made the
agent the posting authority, which arguably answers it — but **arguably is not a ruling**, and this
lane will not read one into law 71. **Recommendation: rule it at F-A2's sitting**, where the
replacement lane is designed, not here.

---

## Annex D · Cross-item notes, risks, and the change log

### D.1 Cross-item notes (each is owed to another lane, in writing)

- **X-1 → F-A3.** The `is_bank_account` circularity (F3) binds **arm 4 identically**.
  `bank-agency-design.md:459-462` words arm 4 as *"a client whose chart carries a bank-class COA
  account with movement but NO registered `bank_accounts` row"* — on the `is_bank_account` reading
  that is **vacuous on a zero-registry client**, which is the exact population material M1 says
  arm 4 exists to un-green. §2.2's three arms are offered as the shared shape (arm (a) now the
  D-15 measured redesign, not the durable-flag-only read), and §2.1 states the predicate contract,
  **security posture pinned (D-19)**, so either lane can land it first.
- **X-2 → F-A2.** Two things. (1) **P-6** — does the agent-lane approval still write a
  `rule_sightings` row? The carve-out keys on `checked_via_rule_id is null`
  (`0037:2030-2033`), not on humanness, and `x37.w` proves the breeding is live with the note
  *"The human signature gate remains the only defense"* — a gate law 71 removed from the path.
  (2) the N5 mapper `_vN` chain touches `chatTurn`'s version sequence, already claimed by F-A2
  PR-2.
- **X-3 → F-A2.** Carry `0034`'s **ordering inherit** forward as a named obligation on the
  replacement lane: the settled op-receipt must not be deleted before the checks that may refuse.
  `0053` inherited it from `0034` silently once (`0053:150-159`); the successor must not inherit it
  a third time.
- **X-4 → the conductor.** Shared surfaces this design names, before any authoring:
  `ck_processing_task_error_code_f_a1` (extend — corrected object, D-13), `client_fact_keys`
  (extend), `chatTurn`/`autoDraft` `_vN` + `registry.ts` (repoint), `documentIngest.behavior_v2` /
  `invoiceFacts.v1.behavior` / `statementFacts.v1.behavior` / `statementFacts.v2.behavior` `_vN` +
  `registry.ts` (repoint, D-22), and `packages/db/tests/x34-*.test.mjs` (append cells). Merge
  order is the conductor's to set.

### D.2 Registered risks

- **R-1 · PR-4 flips live clients red.** Same class as F-A3's P-4′ and accepted on the same
  ground: a vacuous green is worse than an honest red. The measured population (P-10) is published
  per client **before** merge, not discovered after.
- **R-2 · The remedy table can drift from the raises it describes.** Mitigated by ft4.j (a census,
  both directions) and by D-5 (the table is the only source, so there is nothing to drift *from*).
- **R-3 · The committed CA expires.** Mitigated by the selftest's monotonic expiry check — a
  direction, never a pinned date, so it cannot rot into the dated-tripwire class.
- **R-4 · Item C ships no code and could be forgotten.** Its output is a ruling that binds Wave G's
  register. If OQ-1/OQ-2/OQ-7/**OQ-9** are answered and nothing records them, the convention is
  lost — so the ruling lands in `docs/adr/` and in the chart template's notes, not only here.
- **R-5 · gate-folded (D-14).** `clara.request_reextraction`'s `failed_retry` door already admits
  ANY terminally-failed task on the lane unconditionally, regardless of `error_code` — including
  `corrupt`/`encrypted`, which `finalize_document_intake`'s door refuses permanently
  (`0051:1231-1244`). This is a PRE-EXISTING gap, not introduced or worsened by item D, and out of
  its scope. Not mitigated here; recorded so a future item can close it (a status-only door that
  ignores WHY the prior attempt failed is a real hole for a permanently-unreadable document,
  independent of the 401/403 split).

### D.3 Change log

- **v2 (2026-08-23) — gate-folded.** Track-B PR-0: 19 confirmed findings against this set (6
  blockers, 10 materials, 3 nits); 14 folded (**D-13..D-25**, this table), 1 nit-severity finding
  left out of scope (the `p_as_of` ambiguity, index 3 of the raw gate), 2 held open as owner cards
  (**OQ-9** — item C's cut-off rule; **M17's severance** — RULED, D-25, PR-1 out of this gate as of
  2026-08-23). Net: item A's arm (a) redesigned to a measured check (D-15); item D's CHECK/CoR
  retargeted to the live `_f_a1` object and `request_reextraction` dropped from its D1 surface
  (D-13, D-14), while the four frozen catch modules and three facts-writers it actually needs to
  clear are added (D-22, D-23); item B's key gains `direction`/`subsystem` and its grant is
  corrected (D-16..D-18); §2.1's predicate contract states a security posture (D-19); D-6's ground
  is corrected (D-20); census C2 widens 3→6 (D-21); PR-1's battery gains the argv/disk proof it was
  missing (D-24), consistent with its severance. Full record: `fix-queue-gate-record.md`.
- **v1 (2026-08-23)** — first issue. Ten queue items surveyed (F1-F33), two excluded by ownership
  (task #17 Fix A → F-A4 PR-1b; the registry-vs-ledger predicate body → F-A3), three surveyed but
  homed at F-A2 by `PROGRESS.md` (D-1). Five PRs, twelve decisions, twelve predictions, eight owner
  questions. **No rig ran** — every body-level claim is a prediction, and the design says so where
  it matters. MPERS / CA 2016 / LHDN citations fetched from primary sources on 2026-08-23, with
  four **NOT FOUND** absences recorded as findings rather than filled from secondary sources.
