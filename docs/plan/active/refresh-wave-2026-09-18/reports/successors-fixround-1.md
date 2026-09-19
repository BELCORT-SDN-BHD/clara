# The successor cut — fix round 1 (`chatTurn_v21`, `claraWork_v5`)

Worktree `C:\Users\zhant\Desktop\clara-wt\int`, branch `integration/wave-2026-09-18`, base
`origin/main` = `abcc5030`. Round opened at **`a666da12`** (the cut's own report commit).

Verdicts in: spec **accept** (3 findings), standards **fix_then_accept** (2), adversarial
**fix_then_accept** (12) — **17 findings, one of them a blocker**.

**Applied: 15. Deliberately left: 2. Ratification requested: 1.**

Commits, oldest first:

```
c4136de8 fix(runtime): the knowledge block NAMES its records, prints the lane's own view, and the drift row stops landing on the settle's seq
4c110b89 fix(runtime): a missing migration answers `internal`, as three headers already claimed — the guard that promised it could never fire
d97df49b fix(runtime): say where an inspection read's record actually lives, and give the drift read its own capability id
7417029d fix(runtime): the floor sentence names the panel a bookkeeper can open, #651's stanza is in the prompt verbatim, and the digest's blind spot is written down
0008849c test(runtime): the whole-suite reds this fix round created — four duplicate cell names, a registry census of two, and a call-site census reading one emitted file
```

Every finding below is red-first where a cell could hold it: the cell was written against the
delivered code, run and seen to FAIL, and only then was the code changed. Where the finding is a
claim rather than a behaviour, the fix is the claim and the cell is what pins it.

---

## The blocker

### ADV-S-1 — the block named no record, so three tools were unreachable · **APPLIED**

`renderRetrievedKnowledge`'s line was `- [tier] key = value (trust: X)` and nothing else.
`read_knowledge_source`, `read_knowledge_history` (both new) and `ask_knowledge_conflict` (v4's,
still on v5's roster) each require a `record_id` uuid, and `ask_knowledge_conflict` requires
`scope_kind` and `applies_when` PER ROW — none of which the model could have learnt anywhere but
this block. v4's renderer printed the id deliberately ("a run that could see a conflict but not
address it could only describe the problem"); the repoint dropped it while three sentences the model
reads promised it would be there.

Measured before the fix, in the int worktree: a 55-record pack rendered `- [core] k_000 = "v0"
(trust: asserted)`, `has record_id? false`, `in force? false`, `applies_when? false`.

- `lib/knowledge-retrieval.mjs` — `recordLine` carries `record_id` again, plus the `in force` /
  firm-scope / `applies_when` / `source` marks v19 and v4 both printed, each with the reason v19 and
  v4 gave for it.
- Cells: **kr.19** (every printed line names its record, and the marks the conflict tool needs are
  there — driven through `knowledgeConflictRowSchema` itself), **v5.knowledge** (two rows under one
  key: which one is `in force` is the conflict tool's whole subject).
- **World leg**: `chat-turn-v21-e2e` supplied the record id out of band (`CLARA_V21_RECORD_ID`), so
  it could not have caught this — a tool whose only identifier is absent from the prompt still
  "worked" because the harness knew the id. The serve harness now reports `THE BLOCK NAMES THE
  RECORD <id>` when the RUN's own prompt names it, and the leg asserts that before it asserts the
  tool answered. Re-run green: **CHAT TURN V21 E2E: PASS (5 legs)**.

---

## Applied — the rest

### ADV-S-3 — the drift row landed on the settle's seq, and the settle was dropped · **APPLIED**

`readKnowledgeDriftStepV5(..., segmentTraceBase(segment + 1))` with `segment = budgets.segments - 1`
is `segmentTraceBase(4)` = `3 + 4*4` = 19 = `SETTLE_TRACE_SEQ`. The run then leaves the loop and
settles, and `clara.record_work_execution_trace` ends `on conflict (work_id, run_id, seq) do
nothing`; both writers swallow the answer, so the settle's row — outcome, refusal, receipt — was
silently replaced by a drift row. The cell that should have caught it named the property in its own
comment and then asserted `segmentTraceBase(B.segments - 1) + 3 < SETTLE_TRACE_SEQ`, one segment
short of the row the body can write.

Red first: the widened census cell (`i <= B.segments`) failed on the delivered body.

The drift is now taken only when `segment + 1 < budgets.segments`, which is also the honest reading
of the act — a resume that cannot re-enter a segment has nothing to re-plan with, so a read whose
news nobody can act on is not worth a row, a round trip, or a replan charged against it.

### ADV-S-5 — the block DID shrink at the repoint, and the durable row over-reported it · **APPLIED**

Three claims, all corrected:

(a) `CLIENT_BASIS_LIMIT = 60` was justified as "v19's own record cap, so the block does not shrink at
the repoint", while `renderRetrievedKnowledge` printed `records.slice(0, 40)` and clipped values at
200 characters — v19 printed 60 at 300. The print caps are now the LANE's ask, and `chatTurn_v21`
derives both from v19's exported constants BY IMPORT, so the claim is structural rather than
remembered. Cell **kr.20** drives both lanes over one pack.

(b) 0230 caps only the REMAINDER at `p_limit` — core and requested are unbounded — so the print cap
is the one place a CORE row can be dropped. The block now says how many of the unprinted records
were core.

(c) `records_shown` and `truncated` described the DOOR's answer, so a run shown 40 of 55 records left
a `clara.work_knowledge_reads` row (and a Work result) saying 55 shown, not truncated, status `ok`.
`renderedView` derives both from what the block PRINTED, `faceStatusOf` takes that truncation as its
second argument (still the ONE mapping), and both lanes pass it. Cell **kr.21**.

### ADV-S-9 — a Home turn was told a read failed when none was attempted · **APPLIED**

`no_client` shared the generic failure sentence, so a conversation with no client read "the read did
not succeed (no_client) … Do NOT tell anybody that this client has no recorded knowledge" — about a
client that does not exist. It has its own sentence now. Cells: **kr.22**, and `v21.basis: a HOME
turn is told there is no client`; the four estate-failure reasons keep #603's sentence.

### ADV-S-6 — the guard that made a missing migration answer `internal` could never fire · **APPLIED**

Both v21 mappers opened `if (refused.ok === true) return internal`, and `authoringRefusal` returns
`{ok:false, …}` on every path (`chatTurn.v11.tools.ts:109`). Measured: `authoringRefusal(42883)` →
`{"ok":false,"code":"42883", "message":"function clara.admit_trade_invoice_work(…) does not
exist"}`. Three operator-facing headers said the tool answers `internal`.

Classification is now the SQLSTATE (`/^CLR\d{2}$/`, the same test `lib/knowledge-retrieval.mjs:95-97`
uses); the `ok` test stays one line above it, labelled as the type-level narrowing it is. Both
mappers are exported so the decision can be driven without a database (cell **v21.refusals**), and
the three headers — `chatTurn.v21.ts` and `registry.ts` twice — now say what actually reaches the
model, including what the deployed predecessors do.

### ADV-S-2 — the inspection reads' `reason` is collected and kept nowhere in `clara` · **APPLIED (claims) + RATIFICATION REQUESTED (the row)**

`input.reason` is no argument of either door, is not written to `clara.work_knowledge_reads`
(`recordWorkKnowledgeRead` has exactly one call site, in `loadWorkKnowledgeStepV5`), reaches no trace
row and mints no part. Three places claimed otherwise, including the schema's `.describe()`, which
told the MODEL "Recorded with the read".

Both obvious repairs were measured and neither is free:

- a `clara.work_knowledge_reads` row per inspection read would be read back as the run's whole
  read-set by `clara._work_knowledge_drift_core` (0230:812, `order by read_at desc, seq desc limit
  1`), narrowing the drift comparison to that one record's key — a regression in the signal #658
  exists to give;
- `clara.work_execution_traces` has NO free payload column BY DESIGN (0195's layer 1: "a relation
  with nowhere to put a transcript cannot leak one however this module is called"), so it can record
  THAT a read happened and never the reason the model gave.

Dropping `reason` was refused by the contract: SUCCESSORS-ORDER §2.2 fixes the schema's two members.

So the claims are corrected everywhere they were made — the segment's trace comment, the tool
header, the prompt module and the model-facing `.describe()` — and the durable per-read row is filed
below as a ratification request. The v2 registry entry also now states what answers the egress
question it raises: the record reaches the model inside a segment whose dispatch is already
authorised, the same arrangement `accounting_work.retrieve_knowledge` names. Cell **v5.reads**.

**The digest moved with the corrected `.describe()`** — `b9f25a81…1cc17114` →
`fe641982…2bedc698`, canonical 22,375 → 22,429 bytes. That is §2's coverage claim paying out on its
first real edit, measured rather than asserted.

### ADV-S-10 — the drift read borrowed the preload's capability id · **APPLIED**

`readKnowledgeDriftStepV5` wrote `accounting_work.retrieve_knowledge` while calling
`clara.work_knowledge_drift_for`, a door that entry's scope does not name — so a resumed run wrote
two `tool_call` rows one id cannot tell apart, and `work-egress-e2e`'s new "find the row BY
CAPABILITY" discipline (introduced in `956ae8bb` to replace "the only `tool_call` in the run") could
not have worked on such a run. `accounting_work.read_knowledge_drift` is now its own v2 entry, with
its own scope and its own reason for being model-bound (the moved key NAMES reach the model in the
resume note). v2 has never shipped and no row carries `clara-capability-registry/v2` yet, so this is
part of v2's first cut rather than a change to a deployed registry — the registry's own bump rule is
restated beside it for the day that stops being true.

The leg's suffix assertion stopped pinning exactly one row ahead of the segment (which its own
comment two lines above said it was deliberately not doing) and now asserts every row ahead of the
segment is a knowledge read. Re-run green: **WORK EGRESS E2E: PASS (3 legs)**.

### ADV-S-12 — two comments that contradicted their own code · **APPLIED**

(a) `read_seq` is documented as "the seq this attempt's facts actually landed on" and answered the
last seq TRIED when four divergent replays exhausted the bound (and when the first write failed
outright). It answers `null` in both cases now; the type says so.
(b) `runKnowledgeRead`'s header said it "NEVER SETS A TERMINAL" nine lines above the budget arm that
sets one. It now names the one terminal it can set and whose it is.

### ADV-S-4 — the bundle digest cannot see a zod refinement · **APPLIED**

Measured, in a cell rather than in prose: `z.toJSONSchema` renders structure and erases
`.refine`/`.superRefine` entirely, so the two schemas — one with the rule, one without — hash the
same text while accepting DIFFERENT inputs. The roster carries exactly one such rule,
`ask_question.fields[]` ("`options` is required for `choice` and forbidden for everything else"),
which is #791's own example of a schema changing under an unchanged name.

Three cells now stand where the digest cannot: the limit as a measurement, a census of which roster
schemas carry an unrepresentable check (a new one must be declared there), and the rule's behaviour
driven directly so a relaxation reds. The bundle header's general sentence and `successors-final.md`
§2 both now name what the digest covers and what it still cannot see.

### ADV-S-8 — the floor sentence pointed a bookkeeper at a SQL verb · **APPLIED**

`floorSentence` ended "A bookkeeper can still run an earlier month by hand through
`clara.run_depreciation_manual`", and the model is instructed to pass that on. The human surface
exists: `apps/web/components/registers/fa-depreciation-runs-panel.tsx` drives `runDepreciationManual`
(`apps/web/lib/registers/depreciation.ts:161-175`) from the client's Fixed assets register, headed
"Depreciation runs" with a "Run depreciation" action. The sentence names the panel FIRST and keeps
the verb beside it — the wave digest's #651 stanza says the map "points the person at the human
door", so the name stays; what changes is that a person can now act on the sentence. Both cells
assert the human path and the order.

### ADV-S-11 — what the intent key actually guarantees · **APPLIED**

`stableOpKey(ctx.taskId, TOOL, input)` makes a REPLAYED CALL idempotent. It does not make a
RE-SAMPLED segment idempotent: `runModelSegmentStepV21` is a `"use step"` whose `checkpointStep` runs
after it returns, so a crash between the door's commit and the checkpoint re-executes the model, and
a re-worded `memo` mints a different key. The carrier's stanza now says exactly that, names the
narrower property the World leg measures (the two-call control inside ONE turn), and leaves a
turn-stable ordinal to a successor rather than widening a sentence.

### SP-3 — #651's prompt stanza was conveyed, not folded in · **APPLIED**

The contract calls three sentences the successor's prompt stanza "verbatim"; v21 expanded all three
ideas into prose and the exact string appeared nowhere. `DEPRECIATION_PROMPT_STANZA` is now an
exported constant (a stanza that lives only in a comment cannot be imported and cannot be asserted)
and `DEPRECIATION_CHAT_GUIDANCE` folds it in by import. The cell holds the string rather than a
paraphrase of it.

### SP-1 — three refusal rows belong to a door this lane never calls · **APPLIED (labelled)**

`authority_already_live`, `authority_ref_invalid` and `authority_ref_unresolved` are raised by
`clara.sign_depreciation_authority` (0227:1164-1209), not by `run_depreciation_period_for`. They
stay — this module is the lane's one sentence map for 0227's authority vocabulary, and a signing
surface reaching for it should find a sentence already reviewed — and the header now says so, the way
#655's file states that its own count is descriptive. An unreachable row cannot misfire:
`refusalSentence` falls through to the door's own message.

### S1 / S2 — two evidence cells in `successors-final.md` that did not reproduce · **APPLIED**

S1: the row read "58 pass" for the four pin files; re-measured at this head it is **65** (7 + 17 + 25
+ 16). S2: the parity row cited `claraWork.v5.impl.ts:822`, the standards lens measured `:856`, and
after this round's edits it is `:887` — a line number is not what that census pins, so the row now
names the FILE. Both corrected in place in `successors-final.md`, with the finding ids.

### The suite-level consequences this round created · **APPLIED**

Found by running the whole runtime suite rather than the touched files — the 2026-09-15 lesson,
again:

- four cells this round added took names `knowledge-retrieval.test.mjs` already used (kr.14–kr.17);
  renumbered kr.19–kr.22;
- `kr.17`/`kr.18` asserted registry v2 adds exactly TWO entries; it adds three now, and they say
  which;
- `f-a6.pr2.bundle.s1-call-sites` read `.output/server/index.mjs` alone, and nitro moved
  `lib/freeform-read.mjs` into `_chunks/pools.mjs` when `lib/` gained a second importer — the census
  went blind while the code was unchanged, and its own positive control is what caught it. It reads
  every file the build emits now.

---

## Deliberately left

### ADV-S-7 — `operation_in_flight` is not a refusal this door can raise · **LEFT, with the measurement**

The finding says `start_trade_invoice_work` lacks the in-flight arm its sibling has, because 0225
raises CLR13 `operation_in_flight` when the intent key is held by a call still running. That raise
is at `0225_trade_invoices.sql:1680`, inside **`clara.record_journal_entry`** — the WORK lane's
posting door — reached through `clara._reserve_op`. `clara.admit_trade_invoice_work` calls
`_reserve_op` nowhere (grep over the function body: 0 hits); its idempotency is the unique
`(firm_id, client_id, intent_key)` on `clara.accounting_work`, and `_admit_accounting_work_core`
catches `unique_violation` explicitly (0194:1239-1256) to answer either a REPLAY of the same basis or
the typed `intent_payload_conflict` — "never as a raw 23505 the runtime cannot classify". Both of
those tokens are already in the eighteen-token map.

So there is no unmapped concurrency answer to add a sentence for. The lens's evidence was a grep for
`"reason":"[a-z_]*"` over the whole migration file rather than over this door's own raise ladder.
Adding the token would put a sentence in front of a refusal this tool cannot produce, which is the
opposite of what the map is for. (ADV-S-6's fix does change the neighbourhood: a bare 23505, if one
ever escaped the core's handler, now answers `internal` with this lane's sentence rather than
Postgres's text.)

### SP-2 — `pack_firm_required` in `READ_KNOWLEDGE_REFUSALS` · **LEFT, and named here as the finding asked**

The map carries a third key beyond the stanza's two. It is a real CLR10 that 0230 raises when the
firm argument is missing, it is inert in this lane because `ctx.firmId` comes from the Work row, and
the code says so at the row itself. The finding offered "drop it, or name the addition explicitly in
the successor report the way #655's F2 addition was named" — this is that naming. A row describing
the runtime's own mistake is worth a reviewed sentence rather than the door's raw text, for the same
reason SP-1's three rows are.

---

## Ratification requested

### A durable row per inspection read (from ADV-S-2)

`accounting_work.inspect_knowledge_source` is registered `modelBound: true` and is recorded on zero
rows, and the `reason` the model must state reaches no relation in `clara`. Neither existing
relation can take it without a migration:

- `clara.work_knowledge_reads` would need to tell a PRELOAD from an inspection read, because
  `clara._work_knowledge_drift_core` takes the latest row's `keys` as the run's whole read-set
  (0230:812). A `read_kind` column (or a sibling relation) plus a drift-core predicate is the shape.
- `clara.work_execution_traces` can carry the ACT but never the reason — it has no free payload
  column by design, and 0195 §7B gives every remaining column a grammar precisely so it cannot grow
  one.

This is a migration-scale decision about what the estate records, which a fix round should not mint
on its own. What this cut does instead is state the truth everywhere the claim was made. If the
answer is "the reason need not be durable", the honest follow-up is the opposite edit: drop `reason`
from the schema — which needs SUCCESSORS-ORDER §2.2's two-member contract re-opened, so that is a
ratification too.

---

## Evidence

| command | result |
|---|---|
| `pnpm typecheck` | **exit 0** — `packages/runtime: Done`, `apps/web: Done` |
| `pnpm lint` | **exit 0** — freeze-lint + self-tests, the sibling checkers, eslint in all four workspaces |
| `node scripts/check-frozen-workflows.mjs --update` | re-baselined **312** frozen files |
| `… --compare-base origin/main` | **exit 0** — `296 existing entr(ies) retain the same hash and deployed flag; 16 addition(s); 3 recorded retirement(s)` — additions only, unchanged from the cut |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **exit 0** — the same six emittable kinds, no new kind |
| `pnpm --filter @clara/runtime build` | **exit 0** — `.output/server/index.mjs` 10.9 MB |
| `node --test tests/{knowledge-retrieval,chat-turn-v21-tools,clara-work-v5,p6-1-parts-parity}.test.mjs` | **23 + 26 + 38 + 22 = 109 pass / 0 fail** |
| `node --test tests/{registry-view,work-bundle,clara-work-v4,chat-turn-v20-tools}.test.mjs` | **65 pass / 0 fail** (S1's correction, re-measured) |
| `node --test tests/{f-a6-pr2-fixround-unit,f-a6-pr2-freeform-unit}.test.mjs` | **38 pass / 0 fail** |
| whole runtime suite (`node --test "tests/**/*.test.mjs"`, `clara_rt` 55721) | **2837 tests · 2814 pass · 7 fail · 16 skip · ~40 s** — the named baseline and nothing else, see below |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **4628 tests · 4626 pass · 0 fail · 2 skip · 71.9 s · exit 0** |
| World legs re-run | below |

### The runtime suite's seven reds, each checked alone

The suite is what caught three of this round's own misses (the duplicate cell names, the registry
census of two, the call-site census reading one emitted file) — the 2026-09-15 lesson, paid again.
Its remaining reds are the wave's named baseline:

| red | alone | verdict |
|---|---|---|
| `intake-unit` — scanner rejects EICAR / encrypted PDF / XML entity expansion | **red alone** (16/17) | **#693**, named in RIG.md as one of two reds to ignore and never "fix" |
| `pg-tools-fixture` — `(#806)` pg_dump/psql on PATH | red alone | there is no `pg_dump` on this Windows host; PostgreSQL lives in WSL. DECISIONS §6.3's row |
| `rollback-preflight` — `637.pf: B3` | red alone | shared-database contamination, the same cell and cause the 2026-09-15 cut recorded |
| `classify-consumer` — `#617 classifyHealth` | **GREEN ALONE (8/8)** | the whole-suite load flake |
| `ready` — two `/ready` cells | **GREEN ALONE (24/24)** | same |
| `wake-engine` — `#1(a)` | **GREEN ALONE (32/32)** | the flake DECISIONS §6.3 names |

Not one of the four green-alone files imports a v21 or v5 module.

### The World legs this round touched

Run against `clara_wave_b_ci` on `rigint3` (127.0.0.1:55722, migration frontier 0233), against the
image rebuilt at this round's head. **The build matters and it is why the first pass of the v21 leg
red**: these legs spawn `.output/server`, so a leg run against a stale build measures the previous
cut, not this one.

| leg | result |
|---|---|
| `chat-turn-v21-e2e` | **PASS (5 legs)** — including the new probe that the RUN's own prompt NAMES the record before the tool is asked for it |
| `work-egress-e2e` | **PASS (3 legs)** — the trace-order assertion now tolerates a drift row |
| `work-knowledge-e2e` (#658) | **PASS** (exit 0) |
| `work-journal-e2e` (#623) | **PASS** |
| `chat-turn-v20-e2e` | **PASS (4 legs)** — the PREDECESSOR closure on this image: a successor edit that broke a predecessor’s lane reds here rather than in the v21 leg |
| `work-question-e2e` (#629) | **FAILED in the battery, PASSED ALONE TWICE** — see below |

`work-question-e2e` leg 3 (a crash between the lease and the resume) timed out waiting for the Work
to settle, at 64 s of a budget built from lease waits. Run ALONE it passes, twice in a row
(`WORK QUESTION E2E: ALL LEGS PASSED`, exit 0 both times). The leg spawns and SIGKILLs engines and
waits out real lease expiries on `clara_wave_b_ci`, a shared throwaway database whose stranded runs
a fresh engine's reconciler also dispatches (the log carries their `autodraft registry not active`
errors) — the same class as `intake-admission-e2e` in the cut's own §7.1.1, and on the same kind of
contended host. The path this round changed in that lane is the drift read on a resume, and leg 3
resumes at segment 1 of 4, so the guard added for ADV-S-3 does not apply to it; what changed on that
path is one capability-id string.

**The browser walks (§7.3) were NOT re-run, and here is why that is not a gap:** no file under
`apps/web` changed this round (`git diff --name-only a666da12..HEAD | grep -c "^apps/web"` = **0**;
28 files in all — 22 under `packages/runtime`, `frozen-workflows.json`, and five reports), and the walks do not drive this
closure at all: `apps/web/e2e/serve-built.mjs:1230` starts the app with
`CLARA_RUNTIME_URL = mockRuntime.origin`, a stand-in runtime, precisely so the walk exercises the
proxy rather than the engine. The `apps/web` unit suite, which is what covers the changed surface's
readers, is green above.

