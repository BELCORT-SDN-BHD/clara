# waveK · lane LC (lane04) · #1144 — the review round, fixed

**Branch** `riders/wK-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\704`, base `ffb629d73`.
**New head** `079ff1cbaacc14aa07ec47251e89621f4fead8e0`.
**Lane database** `clara_c04` on 127.0.0.1:55742 — **337 files / `0361_reservation_release_advice`**
before and after (re-read at the end). **No migration**: this lane owes none, and
`git diff --name-only ffb629d73..HEAD -- packages/db` and `-- apps/web` are both **empty**, so
CLOSING-PLAN rule (d) is genuinely not triggered.

**Single fix worker**, `/implement-spec`: all twelve assigned findings are handled here, in vertical
slices (one cell → red for the right reason → the minimal code → green), two commits.

```
0e5968491 fix(runtime): #1144 the three reads answer what the contract says they answer
079ff1cba fix(runtime): #1144 the tenancy four get their client wall, their sentences and one honest receipt
```

**Frozen law (a) still holds after the fixes.** `node scripts/check-frozen-workflows.mjs
--compare-base ffb629d73` → **347 existing entries retain the same hash AND deployed flag; 15
additions; 3 recorded retirements.** The 15 additions still carry **no `deployed` key at all**
(measured out of `frozen-workflows.json`: 362 entries, 347 `deployed:true`, 15 unlocked — the same
fifteen paths the cut added). The manifest was re-baselined with `--update` (local only) after the
source edits, which is the documented route for an *unlocked* entry's hash.

---

## 0 · How every finding was reproduced

A probe loaded the **shipped** `chatTurn.v23.reads.ts` / `.tenancy.ts` through `tsx`, replaced
`globalThis.__claraPools` with a double that mints the same `interactive` OBO credential
(`clara.mint_wake_credential`) and runs the read pool as `clara_agent_ro` against `clara_c04`, and
ran everything inside **one transaction that was rolled back**. Nothing was written. The probe files
lived in the gitignored `.scratch/fix/` and were deleted; `git status` is clean and `.scratch/` is
empty.

Door bodies were read out of `pg_proc` on the same database rather than out of migration text.

### The measurements, once, because several findings share them

| what was measured | result |
|---|---|
| `clara._list_review_queue_core`'s tenant wall | `raise exception 'queue scope is malformed' using errcode='CLR10';` — **no `detail`**. `select count(*) from pg_proc where prosrc like '%queue_scope_malformed%'` → **0** |
| `clara.get_document_extract` | `p_document uuid, p_client uuid DEFAULT NULL, p_max_chars integer DEFAULT 20000`; body `v_budget := least(greatest(coalesce(p_max_chars,20000),0),100000)` — a CHARACTER budget over the concatenated envelopes and regions |
| the same door on a real filed agreement (`035a5a91-1dff-4898-9b8e-6bf8902b14c7`, client `3840029a-…`) | budget **200** → envelope lengths `agreement_text_facts 0, agreement_vision_facts 198, ocr 2`; budget **null** → `4814, 898, 2`; budget **20000** → `4814, 898, 2` |
| `clara.get_document_state` | returns **SQL NULL** (it does not refuse) for a document filed to another client and for a random uuid; `operation.entries` is `[{entry_id, status}]`; `byte_extraction.status` is the reading task's own status |
| `clara.journal_entries.status` | `ck_journal_entries_status`: `draft \| approved \| withdrawn` — so **`approved` is the posted state** |
| `clara._get_contract_terms_core` | returns `jsonb_build_object('document_id', …, 'client_id', v_client, 'agreement_class', …, 'terms', …, 'history', …)` — **the answer names the client** |
| `clara.wake_list_review_queue` paging (client `749654e8-…`, 3 rows) | limit 1 → 1 row + cursor, 1 row + cursor, 1 row + cursor, then **0 rows + null cursor**; limit 200 → 3 rows in one page. `next_cursor` is **non-null on the last non-empty page** |
| `clara._reserve_op` | `on conflict … do nothing`, then `return coalesce(v_result, jsonb_build_object('pending', true))` — the stored payload **verbatim** on a converged replay |
| both tenancy cores' `clara._finish_op` payloads | key by key: **no `replayed` key** in either |
| `operation_in_flight` | in **34** `pg_proc` bodies; the estate's shape is `if v_dedupe ? 'pending' then raise … CLR13, detail='{"reason":"operation_in_flight"}'` (`replace_revenue_recognition_schedule`, `skip_plan_occurrence`, `set_firm_document_limits`). **Neither tenancy core does it** — they `return v_dedupe` |

---

## 1 · Every finding, with its reproduction and its fix

### SPEC-K-L04-01 + ADV-K04-04 (major) — the `CLR10` arm never fired · **FIXED**

**Reproduced.** Driving the shipped `runReadPayrollPostingState` and `runReadAgreementTerms` with a
`ctx` pinned to a client this firm does not hold returned, from both:

```json
{"ok":false,"code":"CLR10","reason":null,"message":"queue scope is malformed","details":{}}
```

The door raises `CLR10` with no `detail`; `authoringRefusal` derives its token from `detail.reason`
alone, so a map keyed on `reason === "queue_scope_malformed"` could never be entered and the door's
internal wording reached the person.

**Fixed.** `isQueueScopeRefusal(reason, code)` in `chatTurn.v23.reads.ts` keys on the **sqlstate** as
well as the token — the shape the tenancy reads in this same cut already used (`code === "CLR11"`) —
and both maps call it. `CLR10` out of these two reads can be nothing else: the core's only other
`CLR10` arm is the malformed **cursor**, and both callers pass a cursor this module built.

**Cell** (`chat-turn-v23-tools.test.mjs`): *"a CLR10 from the queue read reaches the person as the
cut's OWN sentence"* — drives both tools through the pools double with the door's exact throw shape
(`code: "CLR10"`, **no** `detail`) and asserts the reason token and the sentence, and that the door
*was* reached (so this is a mapping defect, not a wall).

### SPEC-K-L04-02 + ADV-K04-02 (major) — `posted` for a summary nothing posted · **FIXED**

**Reproduced.** `runReadPayrollPostingState(ctx pinned to A, {client_id: A, document_id: <a document
filed to client B of the same firm>})` returned
`{"ok":true,"status":"posted","document_state":null}`; identically for
`11111111-1111-4111-8111-111111111111`. The state door answers **NULL** rather than refusing, and
the body returned `status: "posted"` without branching on it. The tool's own description tells the
model to say why a payroll summary did or did not post, so the model says it posted.

**Fixed.** #1136 §1's table has **two** rows for the no-blocked-row branch and both now ship:

* an **approved** entry on the filing is what *posted* means. `approvedEntries(documentState)` reads
  `operation.entries` and keeps only `status === "approved"`; the entries are named in the result and
  the whole `document_state` is carried beside them.
* otherwise the contract's **`payroll_not_read`** refusal — *"That payroll summary has not been read
  yet."* — with `details.reading_status` taken from `byte_extraction.status`
  (`documentReadingStatus`), which is the contract's *"name the task's own status … never a guess"*.

A document this client does not hold therefore answers **identically** to one not yet read. That is
deliberate and is written into the constant's docblock: distinguishing them would be an existence
oracle over the firm's other clients' filings.

**Cells:** *"a payroll summary with no entry is NOT answered `posted`"* (three arms: state null, state
read but nothing approved — asserting `details.reading_status === "running"` — and a `draft`-only
entry) and *"an APPROVED entry on the filing is what `posted` means, and it is named"* (plus the
blocked row still winning over both, with the database's sentence verbatim).

### SPEC-K-L04-03 (minor) — five unreachable `CLR03` sentences · **FIXED**

**Reproduced.** A `CLR03` through the shipped mapper answered *"That authoring action is not
permitted in this session."* — `authoringRefusal` replaces the message of **any** `CLR03` with the
authoring lane's literal, and every v23 map returned `null` for it. Calling a READ an authoring
action is wrong on its face.

**Fixed.** `notPermittedV23(sentence)` in `chatTurn.v23.refusals.ts`, called by all five reads:
`read_payroll_posting_state`, `read_payroll_settlement_state`, `read_agreement_terms`,
`read_tenancy_terms` and `read_rent_settlement_candidates` (the last two through
`tenancyReadRefusal`, which the revision's offer read now shares instead of keeping a second copy).
The token is `not_permitted`, the refusal table's own word, and it is named **only where the door
named none** — `governedRefusalV23`'s "the door's own token wins" law is untouched, and a cell drives
exactly that case (`detail.reason = wake_authority_absent` keeps its token and takes the sentence).

**Cells:** *"a refused READ answers the READ's own CLR03 sentence, never the authoring one"* (three
reads) and *"a refused tenancy READ answers the read's own CLR03 sentence"* (the other two).

### SPEC-K-L04-04 (minor) — the panel's empty sentence for a narrowed miss · **FIXED**

**Reproduced** through the pools double: a client with one open run, asked about a different
document, was answered `empty_sentence: "No payroll run is waiting on its bank payment."`

**Fixed.** `empty_sentence` is now computed from the door's **unfiltered** answer, and the narrowed
miss gets #1136 §2's own row: `status: "not_offered"` with `not_offered_sentence` =
`PAYROLL_RUN_NOT_OFFERED`, which says the net pay is *either* already settled *or* never posted and
points at `read_payroll_posting_state` for that half rather than guessing.

**Cell:** *"a narrowed settlement read that did not match is NOT the panel's empty state"* — the
miss, the hit, and the genuinely-empty client, all driven.

### SPEC-K-L04-05 (minor) — CLOSING-PLAN roster item 3 · **RULE TAKEN, COMMENT REFUTED**

The item has two halves and they separate cleanly.

**The RULE is taken.** `isGovernedRefusalV23` now subtracts `NEVER_SHOWN_SQLSTATE = "CLR44"`, so a
never-shown refusal becomes the calling tool's own fault sentence instead of a wiring diagnosis on
screen. That is the general rule the roster item asks a handler to be able to rely on — **`CLR44` is
never rendered, `CLR10` may be** — and it lives in **one** place rather than in each of the seven
maps, which is what this lane's own follow-up 4 asked for. Nothing behaves differently today
(`grep -rn CLR44 packages/runtime` still finds no branch outside this comment), so the change is a
wall for the next refusal of that class rather than a repair.

**The COMMENT half cannot ride this cut, and that is a measurement rather than a preference.**
`packages/runtime/lib/prepayment-schedule-basis.ts:119` still documents `invalidAuthor` as *"CLR10,
and NEVER SHOWN"*. Its only consumers are `chatTurn.v20.tools.ts`, `chatTurn.v22.tools.ts`,
`claraWork.v4.prompt.ts` and `lib/revenue-recognition-basis.ts` (grep over `packages/runtime`) —
**every one of them deploy-locked**. `chatTurn_v23` does not import it: it reaches the prepayment
tools by calling `buildToolsV22`, whose module is byte-locked and cannot be repointed at a successor
copy. A successor copy minted here would therefore be **unreachable code carrying a second copy of
`PREPAYMENT_REFUSAL`**, free to drift from the live one — strictly worse than the stale comment,
which no code reads. The escape clause ("if the cut finds the mapping already correct") indeed does
not apply; the item is **not discharged silently** — it is recorded as a successor contract in §3.1
and named here for the orchestrator's integration record.

### SPEC-K-L04-06 (minor) — the revision's extra `offer` key · **KEPT, RECORDED**

`offer` stays, and the widening is now written into `ConfirmTenancyRentPlanRevisionResult`'s own
docblock with its reason: the offer read runs **before** the act, and it is what lets the turn say
what the plan charged and what it now charges *out of the same answer the person was shown* rather
than out of the receipt alone. §7.2's other departure (`replayed`) is removed — see ADV-K04-06 — so
the shape is now `{ ok, status, plan, offer }`, and both differences from §7.2 are stated in the
module rather than left for a reviewer to find.

### ADV-K04-01 (major) — `read_tenancy_terms` read another client's tenancy · **FIXED**

**Reproduced.** `runReadTenancyTerms(ctx pinned to 3840029a-d373-49c1-a0a3-94120e792229,
{document_id: <a tenancy filed to 6588fa3c-d9ca-443c-82b3-532b39154e34>})` returned
`ok: true, status: "read"` whose `terms.client_id` was **`6588fa3c-…`** — a different client of the
same firm, inside the first client's conversation.

**Fixed.** `clientOfTerms(terms)` reads the client the terms door itself resolved from the live
filing, and the body refuses with the module's existing `not_found` sentence when `ctx.clientId` is
set and disagrees — **the same sentence a document the firm does not hold gets**, so the tool
distinguishes nothing. The refusal lands **before** the draft and proposal doors are called. The
schema keeps taking the document alone: no client **argument** was added (the module's original
ruling stands), and its docblock now records that "no client argument" is not "no client wall" —
which is the conflation the first cut made. A firm-level (unpinned) session has no pin to contradict
and is untouched.

**Cell:** *"read_tenancy_terms does NOT read another client's tenancy out of a pinned conversation"* —
the foreign client (refused, and the proposal door never reached), the same document in its own
conversation (read), and the unpinned session (read).

### ADV-K04-03 (major) — the extract asked for 200 characters · **FIXED**

**Reproduced** on the real door (numbers in §0): at 200 the `agreement_text_facts` envelope came back
**0 characters** while `SYSTEM_PROMPT_V23` instructs the model to quote eleven recorded terms *"as the
page printed them"*; `agreementBankedPair` still returned true, because it reads the `extractions[]`
metadata the budget does not touch, so nothing refused.

**Fixed.** `AGREEMENT_EXTRACT_MAX_CHARS` is now `null` — the tool states **no** budget and takes the
door's own, which survives a change to that default in a way a literal `20000` would not. The
constant's docblock carries the measurement and the origin of the mistake: #1136's contract calls the
argument `p_limit`, which is the queue read's **row** limit two lines above it.

**Cell:** *"the agreement extract asks for the DOOR'S OWN budget, not 200 characters"* — pins the
constant and pins the params the tool actually sent (`[DOC, clientId, null]`) through the double.

### ADV-K04-05 (minor) — one page of 200, `next_cursor` ignored · **FIXED**

**Reproduced** on the door (§0): at limit 1 a three-row queue returns one row and silently drops two.

**Fixed.** `findBlockedRow(c, clientId, rowKind, documentId)` replaces `reviewQueueRows`: it pages,
carries the door's `next_cursor` forward in the door's own shape, and **terminates on the short page**
rather than on a null cursor — because the core builds `next_cursor` from the last row of the page it
just returned, so it is non-null on the last non-empty page too (driven; this is the trap a
cursor-null loop would have fallen into). At `AGENT_QUEUE_MAX_PAGES = 25` (5 000 rows) it returns
`QUEUE_SCAN_INCOMPLETE`, and both callers turn that into an **internal fault** naming the limit and
telling the person where to look — *"I could not read the queue to the end"* is a different statement
from *"there is no block"*, and the first is the true one.

**Cells:** *"a blocked row past the first page is FOUND, not read as an absence"* (page one fills the
cap with unrelated rows, page two carries the block; asserts the cursor was forwarded in the door's
5-tuple shape) and *"a queue longer than the scan's ceiling REFUSES rather than concluding an
absence"* (asserts the page count stops at the ceiling).

### ADV-K04-06 (minor) — `replayed` could never be true · **FIXED**

**Reproduced** by reading both cores' `clara._finish_op` payloads key by key (no `replayed`) and
`clara._reserve_op`'s replay branch (the stored payload, verbatim). The adversarial review's own
driven pair — same task id, same input, same `confirmation_id` and `plan_id`, `replayed:false` twice
— is confirmed by that reading rather than re-driven here (no confirmation was written on
`clara_c04`).

**Fixed, in the only honest way available.** The field is **removed** from both ok results. A boolean
whose value is a constant false is worse than an absent one: it tells the model a converged replay
was a fresh act, which is the exact sentence *"I have just confirmed this plan"* that the stable op
key exists to prevent. The reasoning, the measurement and the successor contract are in the type's
docblock. This is a **deliberate departure from §7.2**, recorded here and in the module.

**And the one replay the tool CAN see is now named.** `clara._reserve_op` answers
`{"pending": true}` when the key is held by an unfinished sibling; these two cores `return v_dedupe`
at that point instead of raising `CLR13 operation_in_flight` the way the estate's other reserving
doors do, so the tool received a receipt with no `plan_id` and answered *"Nothing was recorded"* —
the opposite of the truth, since something may be being recorded at that moment.
`reservationPending()` + `reservationInFlightV23()` now answer `CLR13` / `operation_in_flight` with a
sentence, on both confirmations. `operation_in_flight` was **already** a rung of
`CONFIRM_RENT_PLAN_LADDER` with no sentence beside it; the ladder's own census cell was extended by
that one key, with the reason.

**Cells:** *"neither confirmation ships a `replayed` flag that can never be true"* and *"a reservation
still in flight is named, not reported as a lost act"* (both confirmations).

### STD-1 (minor smell) — the two-wall check six times · **FIXED**

The identical five-statement sequence stood six times across the two tool modules, with only four
sentences varying. `requireClientPinV23(ctx, inputClientId, sentences)` now lives in
`chatTurn.v23.refusals.ts` — beside the two constructors it calls, in the module whose own header
warns that *"a second copy of an envelope is how two tools in one version come to disagree about what
a refusal looks like"*. All six call sites take it; no hand-rolled copy of either constructor is left
in either module.

**Cell:** *"the two-wall client check is ONE sequence, and all six client-scoped tools take it"* —
drives the helper's three outcomes and then **censuses both modules**: exactly three
`requireClientPinV23(` calls each, and **zero** remaining `noClientRefusalV23(` /
`clientMismatchRefusalV23(` call sites.

---

## 2 · Notes that were folded in, and notes that stay

* **ADV-K04-07 / SPEC-K-L04-07 (note) — lane-own refusals wearing a door's sqlstate: TAKEN**, because
  this round adds a third such refusal and three borrowed codes would have been worse than one.
  `LANE_REFUSAL_CODE = "CLR10"` now carries `payroll_not_read`, `not_read_yet` (moved off **CLR11**)
  and, unchanged, `not_a_tenancy`. `CLR10` is the estate's *"a refusal a surface may render"* class
  since `0335`; `CLR11` was unavailable because in this same cut it is what both tenancy reads and the
  settlement read map to `not_found` / `client_not_found`, so a surface branching on the code read
  *"the reading has not finished"* as *"not in your firm"*. A cell pins it.
* **ADV-K04-08 (note) — the ladder omits the door's two `CLR04` rungs and names a `client_not_found`
  token the door never emits: NOT taken.** It is a documentation accuracy item on a constant the
  module already labels as a sentence ladder, it changes no behaviour, and re-deriving the door's
  measured rung order belongs with the review's own measurement rather than with a fix worker's
  paraphrase. Carried to §3.2 as a follow-up.
* **ADV-K04-09 / SPEC-K-L04-08 (notes) — confirmation coverage and the three unrendered `#1137`
  confirmation rows: NOT taken**, for the same reason (no behaviour, and the coverage note needs a
  fixture chain the db battery owns). §3.2.
* **SPEC-K-L04-09 (note) — the stray `.advq.mjs`: already gone.** `git status --porcelain` in the
  worktree is clean, and so is `.scratch/` (the two-build drill cleans up its own images).

---

## 3 · Successor contracts and follow-ups

### 3.1 · Successor contracts (for a cut AFTER this one)

1. **`lib/prepayment-schedule-basis.ts`'s `invalid_author` comment.** Unchanged from the ticket
   report, with the reason now measured rather than asserted: every consumer of the module is
   deploy-locked and `chatTurn_v23` reaches it only through byte-locked `chatTurn.v22.tools.ts`, so
   a successor copy would be unreachable. The next cut that RE-CUTS one of those consumers carries
   the corrected comment; the RULE it implies is already enforced here
   (`isGovernedRefusalV23` subtracts `CLR44`).
2. **A replay marker on the two tenancy confirmation cores.** `clara._confirm_tenancy_rent_plan_core`
   and `clara._confirm_tenancy_rent_plan_revision_core` should either stamp `'replayed', false` into
   their `clara._finish_op` payload (so `clara._reserve_op`'s verbatim return is distinguishable only
   by what the caller adds) or, better, follow the estate's own house shape and raise
   `CLR13 operation_in_flight` on the `v_dedupe ? 'pending'` branch **and** return the stored receipt
   with an added `replayed` key on the settled branch. Until one of those lands, no chat tool can
   tell a converged replay from a fresh act, and `chatTurn_v23` ships no field claiming otherwise.
3. **A door for the posted entry's own particulars.** #1136 §1 asks the posted branch to report "the
   entry: its date, its memo and its total". `clara.get_document_state` — the only door the contract
   names — carries `{entry_id, status}` and nothing else, so `chatTurn_v23` reports the approved
   entry **ids** and the whole state, and the model has no date, memo or total to quote. Either the
   state door's `operation.entries` gains those three fields, or the next cut takes a second granted
   read. Named rather than widened here.

### 3.2 · Follow-ups worth filing

1. **`CONFIRM_RENT_PLAN_LADDER` is a SENTENCE ladder, not the door's** (ADV-K04-08). The door raises
   `CLR04 authority_lost` and `CLR04 insufficient_role` between `client_not_found` and the core, and
   its client wall carries no typed detail at all, so the constant's `client_not_found` token is never
   produced. Worth one pass that either lists the measured rungs at their measured positions or
   renames the constant.
2. **Neither confirmation has an end-to-end leg** (ADV-K04-09). The adversarial review drove both
   against the real doors inside a rolled-back transaction and found the rank floor, the cross-client
   wall, the already-confirmed wall and the op-key convergence correct; nothing in the runtime suite
   would notice if #1150's plan-core consolidation broke the chat entrance.
3. **`AGENT_QUEUE_MAX_PAGES` is a ceiling nobody has met.** 5 000 rows is a guess sized to be
   generous; a firm that meets it gets a refusal rather than an answer. Worth either a scoped queue
   read that takes a `row_kind` (the door has no such argument today) or a measurement of the real
   distribution before the number is trusted.
4. **`ARCHITECTURE.md`'s workflow pins are still four cuts stale** — carried unchanged from the ticket
   report; a blueprint edit belongs to a wayfinder session.

---

## 4 · Gates, with counts

| gate | command | result |
|---|---|---|
| this round's unit file | `node --test tests/chat-turn-v23-tools.test.mjs` | **28 / 28 pass** (17 before, 11 added) |
| | `node --test tests/chat-turn-v23-tenancy.test.mjs` | **21 / 21 pass** (17 before, 4 added) |
| neighbours the fixes could move | `node --test tests/chat-turn-v22-tools.test.mjs tests/p6-1-parts-parity.test.mjs tests/l9-build-info.test.mjs tests/registry-view.test.mjs tests/local-db-gate-drivers-census.test.mjs tests/clara-work-v7.test.mjs` | **82 / 82 pass** |
| frozen law, verify | `node scripts/check-frozen-workflows.mjs` | **OK — 362 frozen files; 62 `use workflow` modules all frozen+registered; 3 retired recorded** |
| frozen law, base compare | `node scripts/check-frozen-workflows.mjs --compare-base ffb629d73` | **OK — 347 existing entries retain the same hash and deployed flag; 15 additions; 3 retirements** |
| frozen-lint selftest | `node scripts/check-frozen-workflows.selftest.mjs` | **OK — all cases** |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — `work_result`'s construction sites are still `claraWork.v1..v7.impl.ts` only; **no chatTurn site, no new wire kind** |
| bundle gate | `pnpm --filter @clara/runtime build` then `node scripts/check-workflow-bundle.mjs` | **OK — 14 pinned classes, 62 superseded bodies ship, chatTurn pinned at v23 (46 checks)** |
| worker paths | `node scripts/check-worker-paths.mjs` | **OK — 2 spawn sites** |
| **the two-build cutover drill** | `world-gate.mjs tests/two-build-cutover-e2e.mjs`, `clara_rt_test` @ 55710 | **ALL PASS** — claraWork v6→v7, chatTurn **v22→v23**, statementFacts v3→v4; each parked run resumed on its own body inside the successor image |
| the version-cutover e2e | `world-gate.mjs tests/version-cutover-e2e.mjs`, `clara_rt_test` @ 55710 | **ALL PASS** |
| **this cut's walk** | `world-gate.mjs tests/chat-turn-v23-e2e.mjs`, `clara_wave_b_ci` @ 55710 | **ALL PASS (14 718 ms)** — `read_tenancy_terms` still carries the door's CLR11 as `not_found`; `read_rent_settlement_candidates` still answers with its empty sentence; claraWork_v7 still serves the admitted Work |
| **the WHOLE runtime suite, once, at the end** | `pnpm --filter @clara/runtime test` on `clara_c04` | **3237 tests · 3197 pass · 2 fail · 38 skipped** |
| typecheck | `pnpm typecheck` (repo) | **exit 0** — `apps/web` and `packages/runtime` both clean |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| apps/web unit suite | — | **not owed**: `git diff --name-only ffb629d73..HEAD -- apps/web` is empty |
| `firm-scope-db-pins` corpus (rule (d)) | — | **not triggered**: no migration file changed (`-- packages/db` diff is empty) |
| db suite / operation-census / rig-isolation | — | **not owed**: no `packages/db` file changed, no SQL function added |

**The two whole-suite reds are RIG.md's named Windows-only ones, not fixed and not mine:**

1. `scanner rejects EICAR, encrypted PDF, and XML entity expansion` — #693, Defender eats the EICAR
   fixture.
2. `(#806) this host's OWN probe: pg_dump/psql are on PATH here` — no `pg_dump` on the Windows PATH.

The ticket report's third red, `ready r2`, **did not recur** in this run (3237 cells, 2 fails). It
remains the load-flake RIG.md describes; nothing in this round touches `lib/health.mjs` or
`tests/ready.test.mjs`.

**Counts moved, and here is why**, so the integrator does not read growth as drift: the suite went
from the ticket report's 3222 cells to **3237** — exactly the 15 cells this round added (11 + 4). The
two v23 unit files went 17 → 28 and 17 → 21.

---

## 5 · Anything unverified

* **No real model drove any of the seven tools.** Unchanged from the ticket report: the walk uses a
  scripted model, so what is proved is that the map reaches the doors and the doors answer.
* **The two confirmations were not driven against `clara.confirm_tenancy_rent_plan_for` by this
  round either.** The `pending` branch, the removed flag and the `CLR13` refusal are driven through
  the pools double against the receipt shapes read out of `pg_proc`; the door itself was driven by the
  adversarial review, inside a rolled-back transaction, and that measurement is cited rather than
  repeated. Follow-up 3.2.2 is the durable fix.
* **The paged scan was proved against the real door for the CURSOR ROUND TRIP and the short-page
  termination** (three rows, page size 1, on `clara_c04`) and against the pools double for the
  cap-filling and ceiling arms. No client on this rig has 200+ queue rows, so the multi-page case at
  the production page size is a constructed one.
* **`AGREEMENT_EXTRACT_MAX_CHARS = null` was measured against the door** (envelope lengths at 200, at
  null and at 20000, on a real filed agreement) but there is **no permanent db-gated cell** asserting
  the text-facts envelope is non-empty: that needs an agreement fixture with a done extraction, which
  is a chain the db battery owns. The constant's docblock carries the numbers.
* **The from-scratch chain** was not run and is not this lane's: LC applies no migration.
* **Hosted was not read.** Every door measurement is on `clara_c04` (337 / `0361`), which the rig prep
  proved equal to the sweep wave's integration chain.
* **The 38 skipped cells** are the pre-existing frontier skips; I did not investigate each one.
* **`.scratch/` is empty** and `git status --porcelain` in the worktree is clean. The probe files were
  deleted; the two-build drill removes its own scratch images.

---

## 6 · What the orchestrator owes a ruling on

Two items, both stated plainly rather than folded into the diff:

1. **SPEC-K-L04-05's comment half** stays a successor contract, with the measurement that taking it
   here would ship unreachable duplicated constants (§1, SPEC-K-L04-05). The integration record
   should accept the deferral explicitly rather than let it pass as discharged.
2. **Two deliberate departures from `waveS-lane08-fix.md` §7.2's literal return shape**, both now
   documented in the module: `offer` is **added** (kept, with its reason) and `replayed` is
   **removed** (a field the estate cannot answer). If the orchestrator prefers §7.2 byte for byte,
   the removal is the one to revisit — and the successor contract in §3.1.2 is what would make it
   truthful.
