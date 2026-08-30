# F-T3 PR-9 — the `tax_prep` wake: design (裁-44, 2026-08-30, replay-measured at `0155`)

> **The ruling this executes.** **裁-44 (2026-08-30): TAX IS AGENTIC, on the same shape as the
> close.** After a close seals, Clara drafts R1–R10 and the CP204 estimate **unasked**, every
> rung carrying its statutory citation and her own explanation; the draft is pushed as a **tax
> draft card** to the needs-you inbox; she **PROPOSES** each account's treatment and **a human
> signs** (裁-38, unmoved); the source is the **fourth clock switch** opened at the G1 rollout
> ceremony (裁-40 as amended), **after this body is built and reviewed**. The computation layer
> is untouched and 裁-33's draft-only wall is unmoved.
>
> **What the ruling settled and what it left to this design.** It settled the **posture** —
> who starts the work, what she drafts, where the card lands, who signs. It did **not** settle
> the DB carrier, the credential kind, the receipt home, or the card's mechanism; the owner was
> not asked those and should not be. §2 decides the carrier with a measured argument; §3-§6
> decide the rest; anything that genuinely needs a ruling is a card in
> `tax-prep-gate-record.md`, not a decision taken here.
>
> **Two files, one design of record.** This file carries §1-§6; **`tax-prep-wake-annexes.md`
> carries §7 failure isolation · §8 the battery · §9 what is NOT built · §10 the build work
> order · §11 sequencing and the ceremony.** The split happened at authoring to keep each file
> inside the 500-line harness budget; nothing was dropped in the move.
>
> **Measured ground.** Throwaway `postgres:17` (`ft3design-rig`, port 33701, credential minted
> per-run and env-only, never argv, never a file), `0001` → `0155`, **150 files, all green**,
> read through `pg_get_constraintdef` / `pg_proc.prosrc` / real row counts — never from
> migration file text. Rig destroyed at the close of the lane. Companions:
> `tax-computation-pr2-design.md` (the computation half) · `g1-wake-engine-design.md` (the
> engine) · `close-key-1-design.md` (the shape being copied).

---

## 1 · What already exists, measured — the shape `tax_prep` copies

The engine is **built and merged** (`0133_g1_wake_engine.sql`), and the `close_prep` body is
**built and merged** (`closePrep.v1`, #437). `tax_prep` is the fourth source and the second
`direct_queue` one. Measured at `0155`:

| Surface | State |
|---|---|
| `clara.wake_engine_sources` | **2 rows, both `enabled=false`**: `bank_agent`/`wake_outbox`/`wake`/`bankAgent`/`bank`; `close_prep`/`direct_queue`/`close_prep`/`closePrep`/`runtime` |
| `clara.wake_fn_allowlist` | 7 kinds — `interactive` 33 · `interactive_client` 15 · `bank_agent` 14 · **`close_prep` 13** · `filing` 9 · `autodraft` 7 · `proactive` 1 |
| `clara.close_prep_due()` | live, prosrc sha `418bc3b5…`, 2 438 chars |
| `clara._close_wake_ctx(text,text,uuid,text)` | live, prosrc sha `de4d9c2a…` — the wrapper skeleton |
| `clara._agent_close_receipt(...)` | live, prosrc sha `bc008ddc…` — the one receipt writer |
| `clara._settle_wake_task(uuid,text,text)` | live, prosrc sha `11445f81…` |
| `clara.mint_wake_credential_for_task(text,uuid,uuid,uuid,interval)` | live, prosrc sha `4eeb01ab…` |
| `clara.wake_engine_task_dead_letters` | live: `consumer, task_id, firm_id, reason, attempt_count, status, created_at, resolved_at` |
| `packages/runtime/lib/wake-engine.mjs` · `reconciler-wake.mjs` | built; `startWakeEngineLoop` wired at `packages/runtime/plugins/startWorld.ts:24` |

**And one thing that does NOT exist: the producer.** `packages/runtime/lib/leader.mjs` carries
six `*Due(lastRunMs, nowMs)` predicates — `autopostReconcileDue`, `sstReconcileDue`,
`lintReconcileDue`, `depreciationRunDue`, `adjustmentRunDue`, `renderEnqueueDue` — and **none
of them is `closePrepDue`**. Nothing in the estate mints an `agent_tasks(kind='close_prep')`
row today. That is G1 PR-2's content ("the producers"), it is in flight, and **`tax_prep`'s own
producer rides the same seam** — one more pure predicate beside the six and one more call in
`startLeaderLoop`'s cycle body. §3.6.

---

## 2 · The carrier — `direct_queue`, and the measured argument for it

裁-44 says "built like `close_prep`", which is the **direct_queue** carrier. The engine offers
exactly two carriers and a third is forbidden, so this is a real fork. It is decided here on
measurement, not on the ruling's wording, so that the reasons survive the sentence.

**The `wake_outbox` alternative, priced honestly.** A `wake_outbox` source rides
`task_kind='wake'` — a value `ck_wes_task_kind_wake_owned` **already admits** — so it needs
*neither* of §3's two `task_kind` widenings. It is genuinely the cheaper DDL. It is still wrong,
for four measured reasons:

1. **The seal is not a routable event today.** `close.finalized` **is** a registered event type
   ("A fiscal year was closed (receipt minted)") and `clara.finalize_close` **is** its only
   emitter (measured: exactly one body in the whole catalog names the string). But its
   `trigger_taxonomy` decision at the **active** version (v2) is **`ignore`**, with the row's
   own note: *"the receipt row is the record; no router wake."* An `ignore` event mints no
   `wake_intent`, so no held `agent_tasks(kind='wake')` row is ever born. Riding it means either
   **flipping** that decision — a change to the one event every close in the estate emits, on a
   surface whose own note says the opposite — or registering a **new** `tax.prep_due` event,
   which then needs a leader belt to emit it anyway. The second is strictly more machinery for
   the same behaviour: predicate + emitter + event registration + taxonomy row + the drain hop,
   versus predicate + emitter.
2. **The honest trigger is a STATE, not a moment.** An event-carried wake fires **once**. This
   lane's expected outcome is a **refusal**: 13 of 13 treatment codes are unsigned, `fixed_assets`
   carries no `ca_class`, `client_tax_attributes` does not exist yet, and the vocabulary has 24
   named ways to decline. A one-shot wake that refuses on the night of the seal and is never
   re-asked leaves the draft permanently undone the moment the tax agent signs a code the next
   morning. `close_prep_due()`'s shape — re-ask until a run exists or a hold is set — is the
   correct posture for a lane whose inputs arrive **after** its trigger.
3. **Failure isolation.** A distinct `task_kind` gives `tax_prep` its own claim stream, its own
   `max_attempts`, and its own rows in `wake_engine_task_dead_letters`. Sharing `kind='wake'`
   with `bank_agent` and (later) `filing` puts them in one claim ledger — and this lane is the
   one most likely to poison, because it is the one whose evaluator can be undeployed
   (annexes §11).
4. **The estate designed for this exact extension, in the open.** `ck_wes_task_kind_wake_owned`'s
   own comment: *"EXTEND-ONLY: a future migration that registers a genuinely new direct_queue
   kind widens this CHECK explicitly, in the open, rather than the column silently accepting
   anything a plain INSERT supplies."* Widening it is the designed act, not a workaround.

**Decision: `direct_queue`, `task_kind = 'tax_prep'`, `source_key = 'tax_prep'`,
`wake_kind = 'tax_prep'`, `workflow_export = 'taxPrep'`.** This agrees with 裁-44; no ruling is
disturbed, and the reasons are now measured rather than inherited.

---

## 3 · The DB surface — five extend-only widenings, one registry row, one oracle

### 3.1 · The five closed sets `tax_prep` joins, each measured at its live text

| CHECK | Live text, measured at `0155` | Delta |
|---|---|---|
| `ck_agent_tasks_kind_0011` | `kind = ANY (ARRAY['chat_turn','wake','autodraft','close_prep'])` | **+ `'tax_prep'`** |
| `ck_wes_task_kind_wake_owned` | `task_kind = ANY (ARRAY['wake','close_prep'])` | **+ `'tax_prep'`** |
| `ck_wake_credentials_kind_0011` | `wake_kind = ANY (ARRAY['interactive','proactive','autodraft','interactive_client','close_prep','bank_agent','filing'])` | **+ `'tax_prep'`** |
| `ck_wake_credentials_client_0011` | six arms; `close_prep`/`bank_agent`/`autodraft`/`interactive_client` require a client, `interactive`/`proactive`/`filing` require none | **+ a seventh arm: `tax_prep` requires a client** |
| `ck_llm_usage_events_call_kind` | nine values, **none of them `bank_agent`, `close_prep` or `tax_prep`** | **+ `'tax_prep'`** — §3.5 |

Every one is drop-and-re-add of a named CHECK with a **prestate assertion on its exact live
text**, aborting CLR10 if it has drifted. That is the estate's own idiom (`0106`, `0120`, `0133`
each did it) and it is what stops a silent widening onto a roster somebody else already moved.
The tail asserts each set moved by **exactly one value** and that **every pre-existing value
survives** — a lost value is the failure mode `0120`'s own tail guards against by name.

### 3.2 · `mint_wake_credential` — the two arms, and the trap `0133` already paid for

`clara.mint_wake_credential(text,uuid,uuid,interval,uuid)` (live prosrc sha `7422e9d9…`,
4 542 chars) has **two** gates, and the design set must not claim one:

- **The EARLY kind gate**, a bare `not in (…)` list. `0133`'s own comment records that the G1
  design "claimed close_prep was already admitted here; this branch's rig replay shows it was
  **NOT** — extending only the per-kind arm below would leave every close_prep mint refused
  `bad wake_kind`, exactly the hidden failure mode GB-3 named for `interactive_client`,
  discoverable only at apply time."
- **The per-kind chain**, `elsif p_wake_kind = '…'`.

**PR-9 extends BOTH**, and its tail proves both by a real mint probe, not by reading the source.
The `tax_prep` arm is **byte-identical in shape to the `bank_agent`/`close_prep` arms**: a
firm-congruent **active** client is required and `on_behalf_of` is **FORBIDDEN** — there is no
directing human on a clocked lane, and the NULL is structural, never inferred (law 68).

The credential is minted **task-bound**, through `clara.mint_wake_credential_for_task(...)`
(live sha `4eeb01ab…`) — never the plain door — so `clara._wake_task_id()` resolves inside the
wrapper and the receipt's `wake_task_id` is mechanical rather than caller-asserted.

### 3.3 · The wrapper skeleton — F-T3's own ctx, not a D1 on F-A4's

`clara._close_wake_ctx(p_verb, p_subject_kind, p_subject_id, p_op_key)` is the shape: resolve
`wake_context()` → refuse CLR03 `no_wake_credential` → `assert_wake_allowed(kind, verb)` →
**the client pin** (`_close_subject_client` resolves the subject to a client; a mismatch is
CLR03 `wake_client_pin_mismatch`) → `_wake_task_id()` or CLR03 `wake_task_unbound` → the op_key
must equal the **derived** key for `(task, verb, subject)` or CLR10 `op_key_not_derived` →
firm congruence or CLR11.

**`_close_subject_client` cannot serve tax.** Measured: it dispatches on the seven close
subject kinds (`client · fiscal_year · close_run · close_receipt · journal_entry · snapshot ·
adjustment_template`). A treatment proposal's subject is a **chart-of-accounts account**; a
computation's subject is a **client and a YA**. Neither resolves.

**So PR-9 mints `clara._tax_subject_client` and `clara._tax_wake_ctx`, copying the shape
verbatim, and replaces NO F-A4 body.** Duplicating ~40 lines is the right trade against a D1
window on another lane's live judgement body — and it keeps the two lanes' pins independent, so
a later close-lane recut cannot silently move the tax lane's wall. **ARM-0 holds in the copy:
an unknown subject kind and an unresolvable id BOTH return NULL, and the pin then refuses.**

### 3.4 · The receipt — reuse `agent_act_receipts`, extend-only, and add no registry row

`clara.agent_act_receipts` is F-A4's carrier and its own table comment says it is *"deliberately
GENERIC (D-05) so F-A5/F-A6/F-A8 adopt it rather than each minting their own."* Measured, none
of them did — `clara.agent_receipt_surfaces` holds **9 rows**, and each names a per-lane table
(`entry_post_receipts` · `bank_agent_receipts` · `agent_act_receipts` · `report_agent_receipts`
· `freeform_read_log` · `agent_filing_receipts` · `onboarding_agent_receipts` ·
`web_fetch_receipts` · `binding_agent_receipts`).

**F-T3 reuses `agent_act_receipts` anyway**, for three measured reasons: the table's stated
purpose invites exactly this; receipt-table proliferation is already a named non-blocking
concern (G1 annexes §F); and reuse means **no new `agent_receipt_surfaces` row**, avoiding the
coupled-pair registration obligation `0154`'s tail calls *"the half-registration the estate's
coverage census refuses."* The cost, stated: F-A4's close-domain table becomes the home of tax
judgement acts too, and `list_agent_act_receipts`' bookkeeper floor now governs both.

Two extend-only CHECK widenings follow, on top of §3.1's five:

- `agent_act_receipts_act_kind_check` — live: nine close values. **+ `'propose_tax_treatment'`,
  `'run_tax_computation'`.**
- `ck_aar_subject_kind` — live: `client · fiscal_year · close_run · close_receipt ·
  journal_entry · snapshot · adjustment_template`. **+ `'coa_account'`** (a treatment's subject).
  A computation's subject is `'client'`, which already exists.

`uq_aar` needs no change: `(firm_id, act_kind, subject_kind, subject_id, op_key, verdict,
rung_digest)` already distinguishes a tax act from every close act.

### 3.5 · `call_kind` — **F-T3 takes its own, and does NOT ride 裁-49's car**

裁-49 rules that `ck_llm_usage_events_call_kind` gains **`bank_agent` and `close_prep`**
(extend-only), both riding G1 PR-2's DB migration, so the two lanes stop borrowing
`unattended_posting`. Measured, the borrowing is real and documented in the code:
`packages/runtime/workflows/closePrep.v1.usage.ts:36` sets
`CLOSE_PREP_CALL_KIND = "unattended_posting"`, with a header comment naming the closed nine-value
roster as the reason.

**`tax_prep` is a third value and 裁-49 does not name it. Decision: it lands in PR-9's own
migration, not in G1 PR-2.** The order asked this lane to decide and say; the reasons:

- G1 PR-2 is in flight **now**. Adding `tax_prep` there is a forward reference to a wake kind
  that does not exist yet and whose name F-T3 has not frozen — and G1 PR-2's tail would then
  assert a roster carrying a value no producer can ever emit.
- PR-9 must widen **five** closed sets anyway (§3.1). Keeping all of them in one file lets one
  reviewer read one coherent story — *here is every closed set `tax_prep` joins, and here is the
  tail proving each moved by exactly one value* — instead of six-of-seven in one lane's file and
  the seventh in another's. Splitting one out is the half-registration shape the estate refuses.
- `call_kind` is **descriptive metadata and never authority-bearing** (`0110`'s own comment), so
  a second extension costs a one-line CHECK swap and nothing else.

**Consequence to carry to the lead:** G1 PR-2's tail census will pin the roster at eleven values
and F-T3 PR-9 makes it twelve. That is correct and expected; G1 PR-2 must not phrase its tail as
"the roster is now final."

### 3.6 · The due oracle — `clara.tax_prep_due()`

Shaped on `close_prep_due()` (live sha `418bc3b5…`), which returns
`(firm_id, client_id, fiscal_year_id, ends_on, reason)` and whose stated law is *"EVERY DATE IS
COMPUTED HERE. The belt asks and mints; the belt computes nothing."* — the F11 rule that the
runtime must never compute a period, because a period is a figure. `tax_prep_due()` returns
`(firm_id, client_id, fiscal_year_id, ya, reason)` and answers **"a year is sealed and nobody
has drafted its tax"**, never "the tax inputs are ready". Readiness is what the draft run
discovers, and its refusals are the answer.

The predicate, each rung with its reason:

1. `clara.clients.status = 'active'`.
2. An **active close receipt** exists for the fiscal year: `close_receipts` with
   `kind='close'` and `status='active'` — the same row R1 reads, so the clock and the ladder
   admit exactly the same years. *(`uq_cr_one_active_close`, measured, makes it one row per FY.)*
3. The **BOOK clock**, `clara._book_today()`, never `current_date` — the x42 clock law binds a
   new body too.
4. **No live hold** on `(client, 'tax_prep')` — §3.7.
5. **No draft already made** for this `(client, ya)`.
6. **The cadence idempotency**: no `tax_prep` credential minted for this client inside the
   window. `close_prep_due` keys this on the **client**, not the fiscal year, and says why:
   `wake_credentials` carries a client but no fiscal year, so a client-keyed window is the
   honest key rather than a join to a column that does not exist. **The same is true here**, and
   the same key is used.
7. The `reason` string, so the card can **say** why without deriving it.

**The cadence is the open question.** `close_prep_due` re-asks **daily**. Daily is right for a
close (the work is genuinely due). For tax, the statutory deadline is months away and the
expected outcome on day one is a refusal — so daily re-asking bills a model call per client per
night for months. **Recommendation: weekly, tightening to daily inside the filing window.**
That is a per-firm cost the owner is entitled to decide → **OQ-B** in the gate record.
**Fail-closed default: weekly**, which cannot be worse than a missed draft that the next week
catches, and cannot silently spend.

### 3.7 · The hold — widen `close_prep_holds.purpose`, do not mint a table

Measured: `clara.close_prep_holds (id, firm_id, client_id, purpose, held_by, reason, held_at,
released_by, released_at, release_reason)` with `close_prep_holds_purpose_check CHECK (purpose =
'close_prep')`, and the reader `clara._close_prep_hold_active(uuid, text)` — **which already
takes a purpose parameter.** A single-valued CHECK behind a reader parameterised on that value
is a table built for a second purpose and never given one.

**Decision: widen the CHECK to `purpose in ('close_prep','tax_prep')`.** The name is a wart;
renaming a live table with a live reader, a live writer pair (`hold_close_prep` sha `fd8d11cc…`,
`release_close_prep` sha `52a6894c…`) and a live `close_prep_due` caller is strictly worse than
the wart. PR-9 adds `hold_tax_prep` / `release_tax_prep` as **thin siblings on the same table** —
widening the two existing doors' signatures instead would be a D1 replacement of two live human
doors for no behavioural gain.

### 3.8 · The registry row, and what is decoration

```
insert into clara.wake_engine_sources
  (source_key, carrier, event_type, task_kind, wake_kind, workflow_export, login_pool,
   max_attempts, enabled)
values
  ('tax_prep', 'direct_queue', null, 'tax_prep', 'tax_prep', 'taxPrep', 'write', 5, false);
```

`enabled = false` at ship is forced by `ck_wes_enabled_audit` (an enabled row requires
`enabled_by` + `enabled_at`, which only `set_wake_source_enabled` supplies) and is 裁-40's
posture regardless.

**`login_pool` is DECORATION, and a reviewer must know it.** Measured:
`packages/runtime/lib/wake-engine.mjs` reads `login_pool` into `source.loginPool` at **line 169
and uses it nowhere else** — `grep loginPool` over that file returns exactly that one line. The
pool a run actually uses is chosen inside the workflow's own infra module
(`closePrep.v1.infra.ts:177-183`: `pools().withWriteWakeScoped(secret, fn)`). So the column
documents intent and enforces nothing, and 裁-49's "true `close_prep`'s `login_pool` to the
write pool" is a **documentation correction**, not a behaviour change. `taxPrep.v1.infra.ts`
must independently use the **write** pool.

### 3.9 · The allowlist rows, and the role

Measured: `close_prep`'s 13 wake verbs are executable by exactly
**`clara_fn_owner, clara_wake_interactive`** — there is no `clara_wake_close` role, and the
write pool connects as `clara_wake_write_login` and `SET ROLE`s to `clara_wake_interactive`
(`packages/runtime/lib/pools.mjs:71`). **`tax_prep` follows: `clara_wake_interactive` execute,
write pool, no new role.**

The narrow wall is therefore **the allowlist, not the role** — `clara_wake_interactive` can
already reach 33 `interactive` verbs. `clara.assert_wake_allowed(wake_kind, function_name)`
(live sha `1c88b7e0…`) is a plain two-column lookup, so a `tax_prep` credential can call only
what a `tax_prep` allowlist row names. PR-9 seeds exactly the verbs the body needs and **no
more**:

| Verb | Owner | Purpose |
|---|---|---|
| `wake_propose_tax_treatment` | PR-4 | propose a `code` for an account (no numeral) |
| `wake_run_tax_computation` | PR-6 | run the ladder, materialise the cells |
| `wake_get_tax_readiness` | PR-9 | read: what is missing for this `(client, ya)` |
| `wake_list_tax_drafts` | PR-9 | read: what she has already drafted |
| `wake_propose_tax_draft` | PR-9 | mint / supersede the draft card carrier (§6) |

**Five rows, and the battery proves the negative**: a `tax_prep` credential calling
`finalize_close`, `approve_tax_treatment`, `sign_tax_treatment_code` or any egress verb is
refused by `assert_wake_allowed`. That is proven **positively, by enumerating the allowlist**,
never by the absence of a row — absence is not evidence.

**PR-4's and PR-6's allowlist rows are therefore `tax_prep` rows, not `autodraft` rows.** The
v1.3 design set's §3.1 assigned the two client-scoped writes to `autodraft` on the reasoning that
no new kind was needed. That reasoning was correct **for a lane with no engine source**; once
裁-44 mints a source, an `autodraft` credential would be minted by the autodraft consumer, not
by this workflow, and the two would share a claim stream. **This file supersedes that assignment
and PR-4/PR-6 must be built against it.** Flagged to the lead as a delta to the design of record.

---

## 4 · The wake body — `taxPrep.v1`, a new frozen workflow class

A **new frozen class**, so `pnpm freeze:update` runs once (constraint 9: a new `_vN` of an
existing class must pass freeze-lint on its own; only a brand-new class re-baselines). Files
mirror `closePrep.v1`'s split so the two read the same:

`taxPrep.v1.ts` (the entry) · `.impl.ts` (the three steps) · `.infra.ts` (pools, claim, settle)
· `.prompt.ts` · `.reads.ts` · `.tools.ts` · `.usage.ts`.

**No backticks in any comment above the `"use workflow"` directive.** The WDK blanks template
literals with a naive regex before looking for the directive, so a stray backtick can pair with
one below and blank the directive itself — the build then succeeds and the workflow is simply
**absent** from the registry. `autoDraft.v9.ts` hit exactly that. **The bundle grep after build
is mandatory**, not advisory.

### 4.1 · The three steps, and the wall that comes first

1. **`claimTaxTaskStep(taskId)` — the CAS-and-bind, first and unconditionally.** Nothing
   consequential — no credential mint, no wrapper call — happens before this run has proven its
   own task still says `'running'` and belongs to it. `assertRealRunId(workflowRunId)` throws on
   an empty run id, because a NULL run id makes the claim predicate's first disjunct true for
   **every** unbound row, so two runs would both "hold" the same task. The throw lands **before**
   `holds` is set, so nothing settles and the reconciler recovers the row.
   - An **UNBOUND** refusal is a clean no-op exit (`stood_down:<reason>`) — a cancel landed, or a
     crash-recovery re-enqueue started a second run. **Nothing is settled**: a settle here would
     either overwrite a recorded cancel or race the run that legitimately holds the task.
   - A **BOUND** refusal owes a terminal state: the CAS succeeded and only then did the task turn
     out to carry no client. Settle `failed`/`internal`.
2. **`runTaxPrepModelStep(ctx, modelId)` — one model pass over the five wrappers.**
   `providerOptions: { openai: { parallelToolCalls: false } }` asks for one tool call at a time;
   the **wall** is local serialisation in `.tools.ts`. `stopWhen: [isStepCount(BUDGET),
   () => rec.cancelledAs !== null]` — a cancel **ends** the pass rather than merely refusing the
   next act. The WDK writable is drained even though nothing subscribes, or the writer's lock
   leaks for the rest of the step.
3. **`settleTaxTaskStep(taskId, outcome, errorCode)`** — one verb, `clara._settle_wake_task`
   (live sha `11445f81…`), which is already generic over every kind the registry names
   (`kind in (select task_kind from clara.wake_engine_sources)`), so **widening
   `ck_wes_task_kind_wake_owned` in §3.1 is what makes it settle `tax_prep` too — no settlement
   code changes.** A `direct_queue` task has no outbox row to cascade to.

**Every exit path ends in a settle, except the unbound stand-down.** The engine already moved
the task `queued → running` and **committed** before `start()` was called, so the books already
say a run is in flight; a run that walks away without settling leaves the stranded row
`_settle_wake_task` exists to cure.

### 4.2 · The classify decision — judgement logic, extracted and drivable

`classifyTaxOutcome(rec, text)` is a **pure** function, so a cell can drive it directly. It was
previously reachable only through a model call on the close lane, i.e. not reachable by any test
at all — that is why it is extracted here at birth. The precedence, and each arm's reason:

| Order | Condition | Outcome | Why |
|---|---|---|---|
| 1 | `streamFault && !cancelled` | `refused/internal` | the pass was **cut off**; whatever it had left is undone and unknown. Settling green on a truncated pass is the silent-green class |
| 2 | `cancelledAs !== null` | `cancelled` | a cancelled task outranks every verdict, admitted acts included — the acts keep their own receipts; this decides only what the TASK says |
| 3 | `acts > 0` | `drafted{acts, refusals}` | a partial success is still a success: the acts landed with durable receipts |
| 4 | `reads > 0 && acts === 0 && infraFaults > 0` | `refused/internal` | reads fine, every write blocked by **our** fault. **The asymmetry decides it**: a false failure costs one wasted retry; a false success costs a tax draft that silently never gets prepared, invisibly, with nobody looking |
| 5 | `writeAttempts > 0` | `refused/` `internal` if `infraFaults` else `model_error` | writes attempted, **none admitted**, is a failed night. On this lane a typed DB refusal does **not** throw — the wrapper cores RETURN `{status:'refused'}` — so without this arm a wholly-refused run takes the `nothing_due` branch and settles **completed** |
| 6 | `reads > 0` | `nothing_due` | read and lawfully found nothing due — a correct outcome |
| 7 | otherwise | `refused/` `internal` if `infraFaults` else `model_error` | never read anything: the run cannot say it looked (review law 2). **It must not blame the model for our bugs** — a pool fault, a mint failure or a driver error is `internal` |

**Arm 5 is the one this lane most needs and the one most likely to be dropped**, because
`tax_prep`'s expected first-run outcome *is* a wholly-refused night: 13 unsigned codes, no
`ca_class`, no `client_tax_attributes`. Without it, F-T3's launch week reports green nights with
nothing on the record.

**The act count is a read of the BOOKS, never of the model.** The record counts only replies the
database itself marked admitted. The model's closing text is prose for a human and is never
evidence of what happened — constraint 2 in its narrowest form.

---

## 5 · What she drafts, and the citation obligation 裁-44 adds

裁-44: *"Every rung carries its statutory citation and her own explanation of why the rung reads
the way it does, so a professional reviews reasoning, not just a number."*

The **citation** half is structural and already built: every add-back line's treatment resolves
to a `tax_treatment_codes` row, which carries `statutory_ref` (NOT NULL, non-blank — measured)
and `authority_id → tax_authorities` (NOT NULL). A dataset point whose treatment resolves to
**zero** authorities is `citation_missing`, `cell_status='refused'` — seeded in `0152`. **The
citation is bound once, to the code, by the signer — not re-picked per run by a model**, which
is the failure class the survey found in the prior research: a depreciation add-back cannot cite
the wrong paragraph on Tuesday and the right one on Wednesday.

The **explanation** half is Clara's prose, and it has exactly one home: `proposal_basis` on
`tax_account_treatments` (PR-4) and `rationale` on the receipt (`agent_act_receipts.rationale
NOT NULL`, non-blank, ≤4000 chars — measured). **Neither is a numeral and neither is a citation**,
so the severance is untouched: she narrates, the code cites, the DB computes.

---

## 6 · The tax-draft card — the needs-you inbox, without a CoR on `list_review_queue`

裁-44 puts the card **in the needs-you inbox**. Measured, that page has **two** feeds, and the
choice between them is the whole cost of this section.

- **Feed 1 — `clara.list_review_queue(jsonb,jsonb,integer)`**, an **18 666-char** body carrying
  **nine** `row_kind` values: `draft` · `uncoded_filing` · `coding_task` · `compliance_watch` ·
  `lint_finding` · `open_question` · `fixed_asset_incomplete` · `staff_advance_incomplete` ·
  `seeding_proposal` (the ninth, `0146`). Adding a tenth is a `CREATE OR REPLACE` on a shared
  18k-char body with many consumers — a real D1, a real review cost, and a real chance of
  disturbing nine other card families.
- **Feed 2 — the additive surfaces panel.** `apps/web/app/(firm)/needs-you/page.tsx` renders
  `NeedsYouInbox`, which renders **`NeedsYouGaps`** (`apps/web/lib/firm/needs-you-gaps.ts`)
  reading the two surfaces `0137` added — firm-level questions and identifier-promotion
  proposals — **directly, not through `list_review_queue`**.

**Measured and decisive: `list_review_queue` reads neither `close_proposals` nor
`agent_act_receipts`.** So F-A4's own close-proposal card — the closest sibling, and the one
裁-44 says tax is "built like" — is **not** in the review queue either. It has its own carrier
and its own reader, and P6 owes its rendering.

**Decision: the tax-draft card rides Feed 2.** PR-9 ships `clara.tax_computation_drafts` (the
durable carrier) and `clara.list_tax_drafts(p_scope, p_cursor, p_limit)` (the reader, bookkeeper
floor, firm-scoped), and P6 renders it in the gaps panel beside the close-proposal card. This
satisfies 裁-44 exactly — the card **is** in the needs-you inbox — while touching neither
`list_review_queue` nor the frontend's `REVIEW_QUEUE_ROW_KINDS` array
(`apps/web/lib/firm/needs-you.ts:92-96`). A tenth `row_kind` remains available later, as a P6
consolidation, and nothing here forecloses it.

**The carrier, `clara.tax_computation_drafts`** — shaped on `close_proposals` (measured), which
is the right precedent because it holds exactly this: a model's proposal, its staleness binding,
and its human settlement.

```
id · firm_id · client_id · ya                       -- the subject
state        text default 'open' check (state in ('open','adopted','withdrawn','superseded'))
proposed_by  uuid not null references clara.users(id)   -- agent_user_id() on this lane
bound_digests jsonb not null                        -- {input_key: digest} — THE STALENESS TARGET
rungs        jsonb not null                         -- [{rung, line_key, cell_id, status, reason,
                                                    --   treatment_code, authority_id}]
narrative    text not null check (btrim(narrative) <> '')   -- her explanation (§5)
model_name · model_version · rationale  not null
settled_by · settled_at · settle_reason
constraint ck_tcd_settle_paired  check ((settled_by is null) = (settled_at is null))
constraint ck_tcd_state_settled  check ((state = 'open') = (settled_at is null))
constraint fk_tcd_client foreign key (client_id, firm_id) references clara.clients (id, firm_id)
-- ONE LIVE DRAFT PER (client, ya) — the uq_close_proposal_live idiom
create unique index uq_tax_draft_live on clara.tax_computation_drafts (client_id, ya)
  where state = 'open';
```

**`rungs` carries `cell_id` values, never numerals.** The figures live in `metric_cells`, written
by PR-6's run wrapper from the frozen evaluator's rowset. The card **reads** them through the
cell; it does not store a copy that could drift from the evaluator that made it. That is hard
constraint 2 applied to a card: **the card is a pointer, not a number.**

**`bound_digests` is the staleness target**, exactly as on `close_proposals` where
`attest_close_exception` tests it against a fresh measurement taken in the same transaction. A
moved input — a code signed, a `ca_class` set, a carryforward keyed — **invalidates the draft**.
Its settle door re-measures and refuses an adoption whose basis has moved.

**The typed `parts[]` contract for P6.** The transcript wire is a live 18-member typed union in
`apps/web` with a compile-time coverage guard and a hydrate-never-trust rule
(`docs/design/PRODUCT_DESIGN.md`: *text-to-hydration, never text-to-code*; the card lifecycle
**re-derives authoritative status on hydrate**). The tax draft card is the **nineteenth member**:
the model selects the registered card id and its **subject ids** — `(client_id, ya, draft_id)` —
and the client hydrates every rung, status and figure from `list_tax_drafts` + the cells at
render time. **The model never emits a rung's number into a part.** P6 owes the member, its
coverage-guard entry, and its i18n namespace; PR-9 owes the read surface it hydrates from.

---

**Continue at `tax-prep-wake-annexes.md`** — §7 failure isolation and observability · §8 the
sixteen-cell battery · §9 what is explicitly NOT built and why · §10 the PR-9 build work order
(prestate, body, tail, the two-body D1 inventory, the frontend homes) · §11 sequencing and the
**fifth ceremony act** 裁-40 does not yet have.
