# F-T4 · The fix queue — the estate survey (as-found)

**v1 · 2026-08-23 · Track B lane F-T4 · design set 1 of 3** (survey · design · annexes). The
as-found state of every item the Wave-F contract and `PROGRESS.md` put in the F-T4 fix queue, at
the bytes. It **states what IS and designs nothing** — the fixes are `fix-queue-design.md`, the
mechanics and owner questions `fix-queue-annexes.md`.

**Method, and its limits.** Every claim carries a `file:line` read in this worktree at
`origin/main` = `1f33268`. **No rig was provisioned for this lane** (the order is survey +
design, no code), so no live body was re-derived by `pg_get_functiondef`. Three of the ten
items name a live body that has been **spliced across generations** — `0051` is explicitly a
harvest-and-splice migration (`0051_extraction_recovery_door.sql:46`, *"a `create or replace`
re-typed from 0026's text would…"*) — so **every body-level claim below is carried as a
PREDICTION for the build lane's rig replay** (§9), never as settled fact. Migration text is not
the live body; that is the standing law, and this survey obeys it by not pretending otherwise.

**Ownership, stated before anything else.** Two things the contract names near F-T4 are **NOT
this lane's**, and are excluded entirely rather than surveyed:

- **task #17 `closing_transfer` Fix A** — owned by **F-A4 PR-1b**
  (`wave-f-contract.md:414-419`; `close-key-1-design.md` holds the `finalize_close` D1 window
  Fix A's two writer bodies need). Track B's 13-cell battery rides F-A4 PR-1b. Not here.
- **the registry-vs-ledger PREDICATE body** — owned by **F-A3**
  (`wave-f-contract.md:420-422`; `bank-agency-annexes-3-build.md:119-121`, obligation 6: *"One
  predicate, one owner, two call sites"*). F-T4 owns **drawer-1's census, as a CONSUMER** of
  that predicate. This survey therefore surveys the drawer-1 call site and the predicate's
  *inputs*, and designs no second predicate.

---

## 0 · The queue, and who owns each row

| # | item | source of record | home |
|---|---|---|---|
| **A** | **P-3** — drawer 1's registry-vs-ledger zero census | `wave-f-contract.md:410` · `wave-g-e2e-corpus-design.md:386-391` · `PROGRESS.md:248-249` | **F-T4** (consumer) |
| **B** | **N5** — the `fix`-field backfill to the coding lane's refusal mapper | `wave-f-contract.md:410-411` · `PROGRESS.md:81` · `roadmap.md:36` | **F-T4** |
| **C** | **E-R10** — the claims accounting class's account convention | `wave-f-contract.md:411-412` · `wave-e-contract.md:219-222` · `PROGRESS.md:296` | **F-T4** (convention only) |
| **D** | the **401/403 retryable auth-code split** | `PROGRESS.md:266` · `docs/adr/0066-the-f6-f9-fix-batch-closed.md:11,19` | **F-T4** |
| **E** | **F8's single-use door + the two `0034` inherits** | `PROGRESS.md:266-267` · `docs/plan/completed/wave-e-f6f9-acceptance.md:262-263` | **F-T4** by this order; PROGRESS says *"re-examine at F-A2"* — see D-2 |
| **F** | the **ceremony DSN bridge, in-repo** | `PROGRESS.md:335-339` | **F-T4** by elimination — see D-1 |
| **G** | the **wiki CoR-comment gate** | `PROGRESS.md:359-365` | **F-A2** (PROGRESS says so in terms) |
| **H** | **`0057` §11's writer-roster successor** | `PROGRESS.md:397-401` | **F-A2** (PROGRESS says so in terms) |
| **I** | **`0007`'s firm-limits pseudo-upsert** | `PROGRESS.md:420-423` | **F-A2** (PROGRESS says so in terms) |

**The G/H/I finding is the first thing this survey produced.** `PROGRESS.md:335` sends *four*
tooling follow-ups to *"the F-A2 / F-T4 fix queues"* without splitting them, but the Known-issues
rows for three of them each end with an explicit **"re-homed to the F-A2 fix queue"**
(`:365`, `:401`, `:422-423`). Only item **F** carries no such sentence — so F is F-T4's by
elimination, and it is also the one PROGRESS calls *"the highest-value item here: every
remaining Wave-F/G ceremony walks it"* (`:338-339`). G/H/I are surveyed in §6 at one finding
each so nothing is silently dropped, and `fix-queue-design.md` §7 offers each a minimal fix
**marked as F-A2's to adopt or re-home** — this lane claims none of them (decision **D-1**).

**The landscape-refresh autonomy class travels with E but is NOT in this order's scope** —
it is an unruled autonomy question (`0053_autodraft_readmit_after_withdrawal.sql:116-119`),
not a fix. It is carried to the owner as **OQ-8**, unbuilt.

---

## 1 · Item A — P-3, drawer 1's registry-vs-ledger zero census

### F1 — the loop over an empty registry never executes, and the initialiser is `'tie'`

`clara.bank_recon_close_state(p_client, p_fiscal_year_id)` declares
`v_state text := 'tie'` (`0056_wave_e_close_model.sql:962`) and then iterates
`for r in select … from clara.bank_accounts ba where ba.client_id = p_client and (ba.active or
exists (…statements…))` (`:989-993`). **Zero registry rows ⇒ zero iterations ⇒ the initialiser
is returned unmodified**, with `accounts: '[]'` (`:1025-1027`). There is no zero-census branch
anywhere between `:962` and the return. The gate answers **`tie`** for a client that may hold a
real bank balance in the GL and has simply never had an account registered.

**F2 · the class was closed one level down and left open one level up.** The same function's
comment (`:969-975`) says it enumerates *"from the ACCOUNT REGISTRY, never from statements … an
active account with NO statements loaded is a question this gate must ASK — from statements alone
it is never enumerated and the gate answers 'tie' without ever being asked (the ADR-066 lesson)."*
That repair is real and correct. **An empty registry is the same unasked question one level up** —
P-3 is exactly that observation (`wave-g-e2e-corpus-design.md:386-391`).

### F3 — the "bank-class COA account" the predicate must key on is MINTED BY REGISTRATION

This is the finding that shapes the whole item, and it applies to **F-A3's arm 4 as well**.
The only structural marker for "this COA account is a bank account" is
`clara.coa_accounts.is_bank_account`, added at `0038_wave_c_b_bank.sql:252`. Its **only two
writers in the estate** are inside `add_bank_account` and its remap sibling
(`0038:2731`, `0038:2987`) — both of which run *because an account was registered*. There is no
`account_class` value for bank (`0009_coding_floor.sql:763-766` → `0015_ar_myinvois_rules.sql:199-200`
admit only `payable` / `receivable`), no template flag, and no other writer.

**Consequence, stated plainly:** on a client with **zero** `bank_accounts` rows, **zero** COA
accounts carry `is_bank_account = true`. A predicate of the shape *"a bank-class COA account
with movement and no registering row"* returns the empty set on precisely the population it
exists to catch. `bank-agency-design.md:459-462` words arm 4 as *"a client whose chart carries a
bank-class COA account with movement but NO registered `bank_accounts` row"* — on the
`is_bank_account` reading that arm is **vacuous by the same circularity**. This is a
cross-item finding and is carried to F-A3 as such (annexes, **X-1**).

### F4 — drawer 1 is absolute, and the third caller makes the change retroactive

`bank_recon_identity` is registered **drawer 1** (`0056:395`), and `finalize_close` raises
`CLR41 drawer1_state_unknown` on `unknown`/`error` with **no attestation path for anybody**
(`0056:2069-2073`; the catalog comment at `:391` says so in terms). Turning the empty-registry case
into `unknown` therefore **hard-blocks the close of a genuinely bankless client** unless a door is
designed with it. And the function has **three** call sites, not two: `_evaluate_one_gate` for
`bank_recon_identity` (drawer 1, `0056:1438`), for `bank_recon_informational` (drawer 3 → coerced
to `advisory` at `:1452`, harmless), and **`clara.verify_close(p_receipt)`'s strict re-probe**
(`0056:2529`, list at `:2544-2548`), which recomputes the four drawer-1 identities from scratch
**against an already-sealed receipt** — so a body change makes every historical close of a bankless
client re-verify as `unknown`. A real cost, not a bug; the design must state which way it is taken.

**F5 · no live consumer outside the close model.** `bank_recon_close_state` has **no** caller in
`packages/runtime`, `apps/`, or any other migration; the only non-`0056` hits are three read-only
lines in `packages/db/tests/x56-rest-e.test.mjs:10,82,124`. Blast radius: the close model plus that
battery.

---

## 2 · Item B — N5, the `fix`-field backfill

### F6 — the item is TWO-SIDED, and neither side exists on the coding lane

`fix` is a DB refusal-detail key carrying a remedy sentence a reader can act on, e.g.
`0059_wave_e_delta_metrics_behavior.sql:66` — `detail=jsonb_build_object('reason','unknown_field',
'fix','correct the malformed registered JSON shape','cause',sqlerrm)`. **It is a Wave-E
convention and it never reached the coding lane, on either side:**

- **Producer side.** `'fix'` appears in **15** migration files, **82** occurrences, all in the
  `0058`–`0084` reporting / metrics / render / authoring band (top three:
  `0068` ×24, `0071` ×13, `0070` ×12). The **coding lane's own CLR21/CLR10 raises carry none** —
  checked directly across `0009`, `0011`, `0015`, `0016`, `0022`, `0028`, `0029`, `0035`, `0036`,
  `0037`. Representative: `0037_wave_c_a_subledger.sql:1936` —
  `using errcode='CLR21',detail='{"reason":"amount_conflict"}'`; and
  `0022_extraction_slice_x1.sql:771` — `detail='{"reason":"sst_account_missing"}'`.
  Estate totals for scale: **472** structured `detail = jsonb_build_object(…)` raise sites across
  **60** files that name a `'reason'`.
- **Consumer side.** The mapper reads `reason` and nothing else, by type.

### F7 — the coding lane's mapper, named exactly, and the reason it drops `fix`

The mapper is `refusalFromDbError` + its private `reasonFromDetail`, in two live files:

- `packages/runtime/workflows/chatTurn.v10.errors.ts:72-81` — reused unmodified by
  `chatTurn.v11.tools.ts:30` and `chatTurn.v12.tools.ts:41,47`, i.e. the **live** `chatTurn`
  (`registry.ts:46`). Body: `const parsed = JSON.parse(detail) as { reason?: unknown }; return
  typeof parsed.reason === "string" ? parsed.reason : undefined;`
- `packages/runtime/workflows/autoDraft.v8.errors.ts:62-70`, used at `:120,127,133` — the live
  **unattended** coder/sweep (`registry.ts:70`).

The emitted type has **no slot** for a remedy: `RefusalPart = { type:"refusal"; code:string;
reason?:string; message:string }` (`autoDraft.v8.prompt.ts:257`; the wire mirror is
`apps/dashboard/app/shared/parts.ts:153`). Eight older `chatTurn` error modules (v2 through v9)
and seven older `autoDraft` ones (v1 through v7) carry the identical helper.

**The drop is deliberate, and its stated reason must be answered, not ignored.**
`chatTurn.v10.errors.ts:72` reads *"Parse the CLR21 `{ "reason": <token> }` DETAIL payload
**without leaking raw text**"* — the coding mapper is oracle-hardened on purpose. A backfill that
simply forwards `detail` would undo that. The **authoring** lane already answered the same
question the other way and says so: `chatTurn.v11.tools.ts:76-79` — *"Deliberately NOT routed
through v10's `refusalFromDbError`: that mapper is the CODING lane's taxonomy and feeds the
review-card UI… **The named reason and the fix are the database's own words, passed through.**"*
That is the precedent: `authoringRefusal` (`:80-109`) captures
`const fix = typeof detail.fix === "string" ? detail.fix : null` (`:83`) into a first-class
`AuthoringResult.fix` (`:35-48`).

### F8 — three more consumer sites drop it, and the human today reads a HARDCODED remedy

- `packages/runtime/lib/opening-parse.mjs:152-158` (`claraReason`) → the opening-seed HTTP
  envelope `{ status, reason }` (`:166-178`).
- `packages/runtime/lib/wiki-projection.mjs:144-146` → dead-letter receipt rows (`:803`).
- `packages/runtime/workflows/statementFacts.v1.behavior.mjs:89-96` → the task's durable
  `error_code` (`:98-109`).
- The dashboard carries **two** duplicate mirrors: `apps/dashboard/app/shared/wire.ts:79-99`
  (`parseReasonToken` → `PgrestError`, `:60-69`, no `fix`) and a sealed Slice-4 copy at
  `apps/dashboard/app/chat/api.ts:232-268`, which feeds the account-coding review card
  `JeReviewCard.tsx:122`. **What the human actually reads as the remedy is a hand-maintained
  lookup, not the database's sentence:** `JeReviewCard.tsx:369` renders
  `clr21Copy(clr.reason, direction)` out of `apps/dashboard/app/chat/reviewCopy.ts:8-16`
  (`CLR21_COPY`) / `:39-44` (`CLR05_COPY`). Terminal render:
  `apps/dashboard/app/chat/parts.tsx:212-220` — it *cannot* show `fix`; the field is not on the
  type.

The runtime HTTP routes (`src/chatRoutes.ts:29,153`, `src/documentRoutes.ts:40-113`) never touch
`.detail` at all, and `packages/db/lib`/`scripts` are producer-side only — neither is a drop site.

### F8b — the coverage census, both directions

The **only** test anywhere asserting a `fix` value reaching a consumer is
`packages/runtime/tests/wave-e-eta-chatturn-v11.test.mjs:24-45` (`:28` `assert.equal(r.fix,
"supply the key")`, `:31` a captured `fix` is not repeated in `details`, `:45` a structured
`fix`) — and it exercises **`authoringRefusal`**, not coding. The `packages/db` phase files
(`delta-*`, `epsilon-*`, `eta-behaviour-phase.mjs:224`) assert `fix` on the **raw DB error**,
proving only that the producer emits it. **No test asserts `fix` reaching
`refusalFromDbError`'s output, `PgrestError`, `ClaraPart`'s refusal variant, or the rendered
card.** The coding-lane drop is entirely uncovered.

### F8c — both mappers are frozen

`packages/runtime/workflows/autoDraft.v8.errors.ts` (`frozen-workflows.json:249`) and
`chatTurn.v10.errors.ts` (`:294`) are registered frozen. Hard constraint 9 applies: a behavioural
change ships as a new `_vN` export with a registry repoint, never an edit in place.

---

## 3 · Item D — the 401/403 retryable auth-code split

**F9 · one conjunct, copied three times, with no shared helper.** The Azure Document Intelligence
submit path collapses every non-202 status below 500 onto a single terminal code. The conjunct is
**`response.status >= 500 ? "engine_error" : "bad_type"`** and it appears **three times,
independently**: `packages/runtime/lib/egress.mjs:74-76` (the `ocr` adapter, `analyzeLayoutReal`);
`packages/runtime/workflows/invoiceFacts.v1.azure.mjs:179-181` (byte-identical); and
`statementFacts.v1.engine.mjs:126-131` (carves 404 → `engine_unavailable` at `:126-128`, then the
same bucket at `:130`). `>= 500` is the **only** discriminant — 400, **401**, **403**, 409 all
land in `bad_type`. 429 alone is handled upstream by a `Retry-After` loop (`egress.mjs:69-72`).

**F10 · `bad_type` is in no lane's retryable set, so a credential rejection is terminal.**
`const RETRYABLE = new Set(["engine_error","timeout","engine_lost","storage_error"])` appears at
`documentIngest.behavior_v2.mjs:132`, `invoiceFacts.v1.behavior.mjs:24` and
`witnessFacts.v2.behavior.mjs:117`; `bad_type` is in none. A task written `failed`/`bad_type` is
never reclaimed — `clara.claim_document_processing_task` only claims `status='queued'`
(`0090_f_a1_walls.sql:391`), under `ck_processing_task_terminal`
(`0007_document_pipeline.sql:175-176`).

### F11 — the row cannot tell a 401 from a 403, or either from a bad file

`document_processing_tasks` has **no** `sqlstate` and **no** vendor-status column; `error_code`
is a CHECK-constrained vocabulary. The **live** constraint is
`ck_processing_task_error_code_0038` (`0038_wave_c_b_bank.sql:7279-7286`; its shape is
prestate-pinned again at `0090_f_a1_walls.sql:179-181`), admitting 26 values of which the
generic ones are `engine_error, timeout, engine_lost, storage_error, corrupt, encrypted,
bad_type, limit, budget, attempt_cap, internal, skipped_kind`. **The HTTP status is discarded at
the adapter boundary** — downstream, a 401 and a corrupt PDF are the same row.
`0051_extraction_recovery_door.sql:1011-1014` records this exactly: *"(R3) A CREDENTIAL
REJECTION IS INDISTINGUISHABLE FROM A BAD FILE at the error_code layer… Splitting 401/403 out of
`bad_type` into a retryable auth code is registered, not built."*

**F12 · both recovery doors refuse by NAME, from a hardcoded list.**
`clara.finalize_document_intake`'s adopted-branch recovery mint refuses anything outside
`('engine_error','timeout','engine_lost','storage_error')` with `reason='not_retryable'`
(`0051:1286-1287`; its five conditions at `:1225-1244` state the set was *"copied rather than
reinvented"* from `documentIngest.behavior_v2.mjs`). `clara.request_reextraction(uuid,text,text)`
is the manual door, and `0051`'s prestate block (`:293-334`) pins its live body by marker and
INSERT count — i.e. its text is **spliced** (`:46`, `:809`). So the split is a **four-surface**
change: the adapters, the CHECK domain, the runtime retryable sets, and both doors' name lists.
Nothing is repairable in one place.

### F13 — the measured population, and why the split is one of only two remedies

`docs/adr/0066-the-f6-f9-fix-batch-closed.md:11`: *"the §2 live read **corrected the register**:
**Gate P's waiting population is SEVEN documents, not four**, every one with a newest `ocr` task
`failed`/`bad_type` and `document_kind` NULL, so **the door refuses by design on both halves**
and the honest remedy is an owner **re-export** or the **Wave-F 401/403 auth-code split**."
The antecedent is `0051:968-974`, which names the 2026-08-06 outage as the exact shape.

### F14 — the LLM witness path has the same hole by a different route

`packages/runtime/workflows/witnessFacts.v2.services.mjs` and its v1 sibling call the AI SDK's
`generateObject` and inspect **no** HTTP status; an unclassified throw yields no `.code`, so
`classifyWitnessFailure`
(`witnessFacts.v2.behavior.mjs:156-160,449-454`) falls to `"internal"`, which is likewise not in
`RETRYABLE` — deliberately (*"fail closed on the unknown"*, `:117`). **A provider 401 on the
witness lane is already terminal**, by the catch-all rather than a named code. The `bad_type`
occurrences there are a **local** pre-egress media-type refusal
(`witnessFacts.v2.behavior.mjs:369-374`), not a vendor status — do not conflate them.

**F15 · the frozen-workflow consequence.**
`packages/runtime/workflows/documentIngest.behavior_v2.mjs` is registered in
`frozen-workflows.json:624`. Changing its `RETRYABLE` set is a **frozen-body edit** and is
forbidden: it ships as a new `_vN` behavior module with a registry repoint
(`registry.ts:22-23,47`), per hard constraint 9 and freeze-lint.

---

## 4 · Item E — F8's single-use door and the two `0034` inherits

**F16 · what F8 is, and what "single-use" means.** F8 is
`packages/db/migrations/0053_autodraft_readmit_after_withdrawal.sql`, whose head (`:121-125`)
reads **"THE DOOR IS SINGLE-USE PER WITHDRAWAL — A RECORDED DECISION, NOT A RESIDUAL BUG … ONE
UNATTENDED RETRY PER WITHDRAWAL; A NO-OP RETRY SPENDS IT; THE ATTENDED DOORS ARE THE
REMAINDER."** Host verb: `clara.admit_autodraft_task(uuid,text,uuid,text,bigint)`
(`0034_autodraft_retry_door.sql:134`); runtime consumer: the sweep lane
`packages/runtime/lib/autodraft.mjs`, outcome token `re_admitted_after_withdrawal` (`:52-57`),
enqueued by `admissionNeedsStart` (`:61-65`). Both production call sites pin `origin='sweep'`
(`autodraft.mjs:97`, `:262`+), so automation can never reach the `one_click` door (`0053:80-103`,
*"A WITHDRAWAL IS STICKY AGAINST AUTOMATION"*). **The residual is not that the door is
single-use** — that is ruled — but that *a no-op retry spends it*: a re-admission refused
downstream by the lane/consent/budget gates has already consumed the withdrawal's one door.

**F17 · the two `0034` inherits, named exactly.** `0053:150-159`, verbatim: *"The refund/reset
block below is a VERBATIM copy of 0034's supersede branch, and it inherits two of that branch's
properties unchanged… **ORDERING:** the settled op-receipt is deleted BEFORE the lane/budget
checks that may then refuse the re-admission, so a re-admission that is subsequently refused has
already removed the prior receipt… **SALES BACKFILL SLOT:** a re-admission that reaches the sales
branch consumes a `sales_backfill_batches` slot exactly as a fresh admission does."*
**Inherit 1 (ordering)** is the mechanism behind F16's residual — the caller loses its
idempotency receipt on a path that then refuses; `0034`'s `x34.f` cell pins the *token*
accounting across it (`packages/db/tests/x34-autodraft-retry-door.test.mjs:618`), and **the
receipt's disappearance is the part nothing pins.** **Inherit 2 (slot)** spends a scarce
`sales_backfill_batches` slot on a re-admission that may never draft.

**F18 · the battery that exists, and the cells that do not.** That same file holds `0034`'s
`x34.a`–`x34.f` (`:367,425,477,517,588,618`) and F8's `x34.g`–`x34.p`
(`:708,777,797,828,879,914,957`, …), including `x34.k` (`:879`) *"THE ORIGIN GATE: the unattended
SWEEP never re-admits a withdrawn filing; the same state re-admits for a human one_click"*.
**No cell asserts the post-refusal receipt state, nor slot consumption on a refused
re-admission** — the two inherits are recorded, not covered.

**F19 · the host lane is being replaced underneath the residual.** `PROGRESS.md:266-267` puts the
re-examination at **F-A2**, *"which replaces F8's host lane"* — F-A2's unattended coder supersedes
`admit_autodraft_task` + `packages/runtime/lib/autodraft.mjs`. A fix against today's body may repair
a body that is retiring. That is decision **D-2**, and it is why the design's answer here is
deliberately small.

---

## 5 · Item F — the ceremony DSN bridge belongs in-repo

**F20 · the tooling never existed in the repo, at all.** No `dsn-pipe*` file, no `.crt`/`.pem`,
no CA-pinning plumbing anywhere in the tree; `git log --all --diff-filter=A` finds no `dsn-pipe`
add, so it was never committed and later deleted — **it was always session-local.** The entire
in-repo TLS surface is `packages/db/lib/pg.mjs:117-118`, which forwards a URL's `sslmode` to
`PGSSLMODE` and nothing else. `NODE_EXTRA_CA_CERTS` appears in **no** code path.

**F21 · the recipe survives only as history; the runbooks that will drive the next ceremony do
not carry it.** The working recipe is at `docs/plan/completed/wave-e-delta-ceremony-asrun.md:74-79`
— a **dsn-pipe.mjs** spawning the runner with the DSN in child env only, plus *"`sslmode=verify-full`
with the pooler's CA chain pinned (`NODE_EXTRA_CA_CERTS`), proven in both directions (verifies
with the CA; refuses without)"* — repeated at `wave-e-theta-epsilon-ceremony-asrun.md:29-30`,
`wave-e-final-ceremony-asrun.md:17`, `b3-reopen-ceremony-asrun.md:15`,
`masb-wording-ceremony-asrun.md:13-14`. Every **forward-looking** `docs/ops/` runbook carries only
the argv rule: `wave-b-0019-ceremony-runbook.md:83`, `wave-b-0021-ceremony-runbook.md:71-72`,
`wave-b-ceremony-runbook.md:45`, `runtime-hard-restart.md:26-28`, `DR.md:376`. **None of the five
mentions `sslmode`, a CA file, or a bridge.**

**F22 · the failure has already happened twice, recorded as a deviation both times.**
`f-a1-pr1-ceremony-asrun.md:15-20,72-78` (2026-08-19): *"the prior ceremonies' **dsn-pipe.mjs** was
session-local and GONE — the handoffs-rule failure shape, now a named harness gap… the apply ran
`sslmode=no-verify` (encrypted, CA-unpinned)… **Harness fix owed**: commit the pooler CA + an
in-repo `dsn-pipe` successor."* Again the next day at `f-a1-pr3-ceremony-asrun.md:13-19`.
**Two consecutive live-production applies ran CA-unpinned TLS against the pooler.** The
structurally identical hazard is registered separately for `0084`'s tooling at `C:\ct\`
(`PROGRESS.md:344-346`). *Scope note:* committing a **CA certificate** is not committing a
credential — a CA public certificate is a trust anchor, and hard constraint 4 is about DSNs and
secrets; the design keeps the DSN env-only and never on disk or argv.

---

## 6 · Items G/H/I — surveyed at one finding each; PROGRESS homes all three at F-A2

Not dropped, not claimed. `fix-queue-design.md` §7 sketches each fix, **marked F-A2's to adopt**.

**F23 · the wiki CoR-comment gate reads a block's own comments un-masked.**
`parseCoRPatches` (`scripts/wiki-lint-checks.mjs:960-980`) slices `masked` out of the *file-level*
`maskComments(sql)` (`:961`), and `maskComments` (`:335-360`) **skips** dollar-quoted spans
without masking their interior (`:341`). A `--` comment inside a `do $tag$ … $tag$` block
therefore reaches `CREATE_FN_RE` (`:628`) intact, so a create-function phrase merely *quoted* in
prose flips `createsAFunction` (`:978`) and reds the gate. The sibling `censusReadOffsets` fixes
exactly this by re-masking its own block and says why (`:913-919`); `parseCoRPatches` does not.
Today's mitigation is a **wording rule** — never quote a recut statement in a CoR comment
(`PROGRESS.md:363-365`). Judgement logic; its own reviewed PR.

**F24 · `0057` §11's writer roster is a transaction-local temp table, checked once.**
`create temp table _x57_roster(…) on commit drop`
(`0057_wave_e_registry_snapshots.sql:1412-1413`), hand-populated at `:1414-1480` with
`regprocedure` identities, consumed only by S11.2 (`:1542-1560`) and S11.2b (`:1563-1630`) inside
`0057`'s own transaction, then dropped; `_x57_roster` appears in no other migration. **The census
fires once, at apply, and never again** — while `0096` rotated the writer estate and `0098` added
`_persist_statement_core_v2` (`PROGRESS.md:399-401`), so the guarded population grew and the
roster did not.

**F25 · `0007`'s firm-limits upsert is a column-hardcoded BEFORE-INSERT trigger.**
`clara._tf_firm_document_limits_upsert` (`0007_document_pipeline.sql:545-556`) `UPDATE`s exactly
`docs_per_day`, `pages_per_day`, `ocr_concurrency` (`:548-550`) from `NEW` — which Postgres has
already filled with table **defaults** for every column the caller omitted — so a partial-column
INSERT against an existing firm row **silently resets the unnamed limits to their defaults**.
`0090_f_a1_walls.sql:287-295` records the defect verbatim and adds `llm_witness_concurrency`
(`:298-299`), invisible to the trigger and settable only by direct `UPDATE`
(`f-a1-cutover.test.mjs:127-128`, `f-a1-walls.test.mjs:110-111`). Two live cells already ride the
reset path: `x38-wave-c-b-bank.test.mjs:1496-1497`, `:1606`.

---

## 7 · Item C — the claims accounting class (E-R10)

### F26 — the convention is already HALF-RULED, and the ruling is narrow

`docs/plan/completed/wave-c-contract.md:56`, **WC-R10**, verbatim: *"**No `employee`
counterparty kind.** Staff claims ride the generic lane, crediting a **non-`payable`-class**
'amount due to employee / director' liability by GL account convention."* It is a standing law —
digest **19** (`docs/adr/README.md:213-215`): *"No employee counterparty kind, ever. Staff
advances ride the B-lite register; a sole proprietor is NOT an employee — his account is
EQUITY."* **What is ruled: no counterparty kind; a non-payable-class liability credit.
What is NOT ruled: which accounts, the director split, and whether an out-of-pocket claim rides
the advance register or a new one.** That gap is this item.

**F27 · the fail-safe WC-R10 relies on is real, at the bytes.** A `supplier_bill` entry requires a
**payable-class credit** or it is refused CLR23 (`0009_coding_floor.sql:492-499`), so a claim
credited to a non-payable liability cannot masquerade as a supplier bill and **never enters AP
aging** — asserted live at `packages/db/tests/x37-wave-c-a-subledger.test.mjs:1974` (*"a staff
claim mints no ap item"*), against `EMPP = "271-C37"`, that test's *"amount due to employee —
LIABILITY, NON-payable-class (WC-R10)"* (`:123`).

### F28 — the rule-breeding vector WC-R10 warned about is PROVEN LIVE, and law 71 changes who trips it

WC-R10's reason (ii) was that an employee registered as a vendor would, after three sightings,
breed an autopost rule binding a **natural person** to an expense account. Not a hypothetical:
`x37.w` is a standing evidence pin — `x37-wave-c-a-subledger.test.mjs:1951` *"three employee claims
STILL breed a vendor_account proposal (the section 5.3 debt's live witness)"*, asserting at `:1986`
that the proposal binds `CLAIMX`, with the note at `:1987`: *"The human signature gate remains the
only defense."* The breeding carve-out discriminates on **`checked_via_rule_id is null`**, not on humanness
(`0037_wave_c_a_subledger.sql:2030-2033`). **An agent approval with no rule id satisfies that
predicate.** Under law 71 (`docs/adr/README.md:409-417`) the agent posts unattended — so the
"human signature gate" that WC-R10 leaned on is no longer in the path unless F-A2 puts something
else there. Whether F-A2's coder still writes sightings is **F-A2's fact to state**, not this
survey's to assume; it is carried as prediction **P-6** and cross-item note **X-2**.

**F29 · an out-of-pocket claim has no home; `kind='claim'` presupposes an advance.**
`clara.staff_advance_applications` (`0043_wave_d_b1_staff_advances.sql:535-557`) already carries
`kind in ('payroll_deduction','bank_return','claim','correction')` (`:544-545`) — but
`advance_id uuid not null` (`:539`), FK'd to `clara.staff_advances` (`:552-554`). **An application
is an application *against an advance*.** E-R10's case is the other direction — *"employee
paid-on-behalf"* (`wave-e-contract.md:219-222`), no advance row exists, and today that has no
register.

**F30 · the person model exists and needs no counterparty.** `clara.staff_advance_accounts`
(`0043:335-363`) is the enrolment: `person_label` (`:339`), a mandatory non-blank
`enrolment_attestation` (`:340`), an active-XOR-retired CHECK (`:355-359`), and a **per-person
`account_code` FK into `clara.coa_accounts`** (`:338`, `:351-352`). Law 19 holds structurally — the
person is a COA account plus a label, never a counterparty. **This is the shape a claims register
would clone**, with one substantive difference: an advance makes the employee a **debtor**, a claim
makes them a **creditor**.

**F31 · the chart has the director account and the sole-prop pair, and NOT the employee one.**
`apps/dashboard/app/shared/coaTemplate.ts` carries `420-D01 "Amount owing to director — current"`
(liability, MPERS *"Trade and other payables — related party"*, `:272`), `472-DIR` (`:273`), the
from-director side `160-D01`/`160-D02` (`:253-263`, whose note names **MPERS Section 33** and
**CA 2016 s.249(4)**, and forbids netting without a legally enforceable right of set-off), and for
a sole proprietorship `100-CAP`/`160-DRW` under the block note (`:249`) *"the proprietor cannot be
his own director or his own debtor, and money he puts in or takes out is capital."* There is **no**
"amount owing to employee" account and **no** staff-advance account — the advance register binds
whatever client account the enrolment names. So the convention has a director answer, an equity
answer, and **no employee answer**.

**F32 · the document class is already recognised, and nothing consumes it.**
`packages/runtime/lib/classify-llm.mjs:73` teaches the classifier *"`claim_form`: an employee
expense-reimbursement claim — claimant, itemized expenses, a claim total."* The kind is produced;
no register, verb or gate reads it.

### F33 — what the standard actually says, fetched 2026-08-23, gaps included

Full citations with URLs are `fix-queue-design.md` §8.1; the survey records only what the
**as-found** picture owes to them, and the four **absences**, because an absence is the finding.

- **MPERS (2016) is in force** (the 2025 third edition applies from 1 Jan 2027) and it **never
  mentions an employee expense reimbursement**: a full-text search for `reimburs*` hits only §21
  and §28.28. So *"a claim is not an employee benefit"* is an **inference** from §28.1's scope
  wording, not a quotable rule. Anything durable must say so.
- **MPERS §33 is the one place the standard is explicit**, and it binds the director case:
  §33.2(a)(i) (a director is a related party), **§33.8(c)** (a controller incurring expenses the
  entity would otherwise bear), **§33.12(i)** (settlement of liabilities on the entity's behalf),
  §33.9 (outstanding balances disclosed) — separate from the §33.6-33.7 compensation total.
- **MPERS has no sole-proprietor section.** §22.19 (owners in their capacity as owners) and §4.13
  (an entity without share capital) are the nearest provisions, and both by analogy.
- **CA 2016 s.245** makes the receipt part of the statutory record: sufficient to explain the
  transaction (s.245(1)), entered within **60 days** (s.245(2)), retained **7 years** (s.245(3)),
  penalty to **RM500,000** and/or 3 years (s.245(9)).
- **LHDN PR 5/2019 cuts the other way from the accounting reading** — §3.7 defines
  "reimbursement" as a *sub-species of perquisite*, and §6.3 makes an employee's own pecuniary
  liability settled by the employer a taxable perquisite. **NOT FOUND:** any public ruling stating
  the reimbursement-vs-perquisite line as one general principle. WC-R10's *"a professional
  judgement Clara must never make silently"* is therefore load-bearing law, not caution.
- **NOT FOUND at official source:** any MIA by-law, circular, technical release or FAQ on
  expense-claim documentation (the Jan-2026 By-Laws were searched; the only `reimburs*` hits
  concern inducements).

---

## 8 · Closed-world censuses this queue will break

**Ten, C1–C10, each with its site and owning item — the table is `fix-queue-annexes.md` §A.2.**
Extend-never-weaken applies to every one; none may be narrowed to make a fix fit.

---

## 9 · Predictions the rig replay must settle

**Nine, P-1…P-9 — the table is `fix-queue-annexes.md` §A.3.** Each is a claim this survey could
**not** settle from checked-in bytes; a correction is a design amendment, not a bug. The two that
would change a design if they fail: **P-3** (the `is_bank_account` circularity, measured in data
both directions) and **P-6** (whether an agent-lane approval still breeds a `vendor_account`
proposal under law 71).

## 10 · What this survey deliberately does NOT cover

- **task #17 Fix A** and the **registry-vs-ledger predicate body** — other lanes own both (§0).
- **The landscape-refresh autonomy class** — an unruled autonomy question, not a fix; carried as
  **OQ-8**, unbuilt (`0053:116-119`).
- **The claims submission/approval SURFACE** — Wave G (`wave-e-contract.md:221-222`). This item is
  the account convention only.
- **Any live body's actual text.** No rig ran; §9 is the honest boundary.
- **The `0084`/`C:\ct\` custody item** — the same *class* as item F, but its own unscheduled row
  (`PROGRESS.md:344-346`) and not in this order.
