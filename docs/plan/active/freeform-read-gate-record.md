# F-A6 PR-0 — the gate record

> **The gate ran 2026-08-22** against design **v1** (`freeform-read-design.md`, the survey and the
> two annexes — 1 166 lines). Two lenses, per the F-A2 model: a **bytes lens** (every migration,
> runtime and test citation re-derived at the bytes, fourteen findings) and a **rulings lens** (every
> TA-P ruling the sitting's member tables attach to F-A6, two findings). **Every finding was
> adversarially verified by an independent verifier**, and the verifier's re-graded severity governs
> — one material was raised to blocker, four findings were REFUTED.
>
> **Verdict: the estate reading holds and the ruling translation holds; the MECHANISM layer does
> not. Four blockers and six materials bind the build; the width is severed.** Every finding below
> names its fold target; **the fold is v2's change-log entry (Annex H) and this file is its spec.**
>
> **The law-28 cross-model adversarial pass has NOT been run and must not be run against v1.** Both
> the injection surface's execution ORDER (GB-3) and its granted-function SET (GB-1/GB-2) changed in
> the fold, so a pass run now would have been run against a body nobody will build. It runs against
> v2, before PR-1 merges — the contract imposes it, this record does not waive it.
>
> Standing caveat unchanged: migration-source reads are predictions about the live catalog; PR-1's
> rig replay confirms them (§7).

## 1 · What was attacked and HELD

- **The estate reading, at the bytes.** F1-F7 all re-derived and confirmed: `0002:308-315`'s
  all-nullable receipt, `0002:525-526`/`:542` as the runtime's sole INSERT path, no human read
  policy, `0004:762`'s agent-only `shares_my_firm_wake`, `0011:625-628`'s closed credential CHECK,
  `0017:1424-1426`'s live wiki decision, `0011:1154`'s ungranted `wake_context`, and pools.mjs's
  session-level read-only belt. The **35-relation count is exact and all 35 individually carry both
  `firm_id` and `client_id`**, with `clients` / `users` / `firms` / `sst_threshold_schedule`
  correctly split into their own arms. **Ships as designed.**
- **The censuses.** er9's hard-equal role count 7 at `:443-458` with derived close-verb coverage;
  the single `DYNAMIC_SQL_ALLOWLIST` entry at `wiki-lint-checks.mjs:101-124`;
  `delta-catalog-phase.mjs:402`'s `appRoles`; the login-shell loops at
  `rig-runtime-catalog.test.mjs:67-130`; T18 at `rig-meta.mjs:1062-1074`. All real, all correctly
  classified except C3 and C11's role-key layer (GM-6).
- **The live lineage tips**, found by CoR lineage rather than by creating migration:
  `wake_firm`'s last CoR IS `0011:1199`; `assert_wake_allowed`'s tip IS `0004:114`.
- **P-14's premise** — nothing reads `freeform_read_log` today except the three `GOVERNED_TABLES`
  rosters, so the revoke of `0002:542` breaks nothing.
- **The D1 claim, on the repo's own trigger** — no live body is CoR'd, so the honest cost really is
  35 ACCESS EXCLUSIVE `CREATE POLICY` locks and no write-quiesce window. **Both lenses agreed
  independently**, and F-A6 is **cleanly severable** from F-A4/F-A5's shared `finalize_close`
  window: it touches no body they touch.
- **The ruling translation, ruling by ruling.** The client boundary is compiled server-side by RLS
  (not a string rewriter, TA-P9 A(1)); the enumerated surface is a NEW role with a printed law-34
  audit line, not `clara_agent_ro`'s accumulated grants (A(2)); `assert_wake_allowed` is called
  unconditionally so unattended lanes cannot free-read (A(3)); no RBAC tier, no signature gate
  (A(4) / TA-P1 C); receipt-and-read atomicity is enforced **structurally** by the
  `_freeform_admitted()` RLS conjunct — *stronger* than TA-P4's own DEFINER-wrapper wording, and
  said as such rather than presented as compliance; the narrative wall is mechanical, not a prompt
  instruction (TA-P10 C′); the two pending constitutional amendments are correctly named as
  build-blocking. **F-A6-OQ-3 (bare SQL vs a DSL) is correctly treated as already-ruled and is not
  reopened.** No ruling was implemented either narrower or wider — *until the fold's own width
  severance, §4.*
- **The battery's discipline.** The strongest part of the v1 packet: contract-blind cells, negative
  twins, law-31 non-vacuity as a stated bar. Every battery failure the gate found is a failure of
  the design the battery was testing, not of the battery's method.

## 2 · Blockers — the build may not start until each is folded

**GB-1 · The two DEFINER receipt writers are granted to the role that executes the model's SQL, so
a payload can forge the audit record.** *(bytes lens #1, CONFIRMED blocker.)* `annexes-1:58,65-66`
put `_freeform_arm` and `_freeform_settle` inside "the EXECUTE list for `clara_freeform_ro`", and
`design:114-118` grants them explicitly — while `design:129` claims they are "callable by exactly
one role and by nothing a human lane can reach". The composed `p_sql` **executes as that exact
role** (`design:145-148`), the transaction is read-write (the receipt must commit), and the tool
result already hands the model its own `read_id` (`design:267-268`). Turn-2 payload:
`select clara._freeform_settle(<read_id>, 'ok', 0, 0, '{}'::text[], 1)` — a plain SELECT naming no
relation, so no §3.3 wall and no plan-census rung fires, and the DEFINER appends a completion row
claiming a prior read returned zero rows. Law 28's own question **(vii) "make the receipt lie" is
answered YES**. Nothing in the battery covered it: F.1 only proved the grant exists, F.3's payloads
were all literal-DML tricks, F.6 tested functions *outside* A.2.
**Fold (D-20, design §3.2):** the finding's proposed revoke is **not buildable** — a SECURITY
INVOKER caller privilege-checks its callees against the caller, so an ungranted writer could not be
called at all. The property is bought structurally instead: `_freeform_settle` **loses its read-id
argument** and settles only what this transaction armed; **one arm and one settle per transaction**,
enforced in the DEFINER bodies; any second call raises a `CLR*` that no Tier-C pair matches, so it
re-raises and the transaction aborts. A forged receipt can only exist in a transaction that dies
before COMMIT. New forcing cells F.3(i)-(j) run exactly those two payloads. **The cross-item
obligation "the F-A6 receipt writers must NOT be granted to the read role" is therefore ESCALATED,
not silently overridden** — see §6.

**GB-2 · `_freeform_read_core` is called ungranted in one place, granted in two others, and takes
`p_scope` — so the client boundary was an argument after all.** *(bytes lens #7, material →
**re-graded BLOCKER** by the verifier.)* `design:113` says "core … ungranted"; `design:127` says
"the wrapper and its shared core are SECURITY INVOKER and both are granted"; `annexes-1:64` lists it
among the granted ten. F.2's closed-world cell derives the EXECUTE set from the catalog and
`deepEqual`s it to A.2 — so **the battery would have cemented the granted reading into the
migration**. Under it, any holder of `clara_freeform_ro` — including the model's own payload —
could call `select clara._freeform_read_core(…, 'cross_client')` and skip the sibling verb's
allowlist row entirely, defeating exactly the separation D-8 (`record:144`) claims: *"cross-client
becomes a grant-and-allowlist fact rather than an argument the model can set."*
**Fold (D-19/D-21, design §3.2, annexes-1 A.2):** **one verb, one body** — the core is folded into
`wake_freeform_read` and `p_scope` ceases to exist in v1 (the sibling that was its only reason is
severed, §4). A.2 is **re-derived from ten to seven**: minus the sibling verb, minus the core, minus
`wake_client()` (uncalled by any Annex-B policy arm or invoker-layer body — the pin is compiled by
`_freeform_scope_client()`, and the DEFINER arm needs no grant). F.2 gains a cell that **no
`_freeform_read_core` exists**.

**GB-3 · The relation census executes the injection payload one wall too early.** *(bytes lens #2,
CONFIRMED blocker.)* `design:164-166`: *"Before the cursor opens, the core runs `explain (format
json)` on the same composed text"* — but plpgsql's plain `EXECUTE` is `SPI_execute`, which **runs a
multi-statement string in full** (verified against the PostgreSQL docs by the verifier). The
design's own single-statement guarantee is a property of `OPEN … FOR EXECUTE` and of nothing else
(`design:151-154`; `annexes-1:217` even names "the cursor **or** the EXPLAIN" as two distinct
execution sites). So F.3(a)'s own payload composes to `explain … select 1) t; drop table
clara.journal_lines; select * from (select 1) t` and **all three statements run**. The GRANT wall
blunts the worst outcomes today (the role owns nothing, holds zero DML), but everything needing no
privilege executes — `pg_sleep(600)`, `create temp table`, and, with GB-1, the settle forgery. Law
28's question **(iv) "run more than one statement" is answered YES** under the stated ordering.
**Fold (D-18, design §3.3):** the order is inverted. **The cursor opens FIRST** — refusing a
multi-query plan at PREPARE, before any part of the string runs — and the EXPLAIN then operates on
text Postgres has already certified as one statement; the FETCH comes last, after the census passes.
**P-16** proves both halves on the pinned image (no part of a refused multi-statement string
executes; opening a portal produces no rows and runs no volatile function before the first fetch).

**GB-4 · The arm→settle receipt is a two-row record the table cannot hold.** *(bytes lens #3,
CONFIRMED blocker.)* Five requirements that cannot all be true: `design:115` and `:137` call
`_freeform_arm` the ONLY writer while `:118` has `_freeform_settle` "append the completion row";
Annex C (`annexes-1:136-176`) has **no parent/read-id/phase column**; `outcome` (`:159`) and
`rung_vector` (`:161`) are NOT NULL yet unknowable at arm time, when `_freeform_admitted()` must
already be true; `_tf_append_only` (`:178`; the generic body at `0003:428-435` raises CLR08
unconditionally) forbids the settle UPDATE; and F.4 (`record:49-50`) demands exactly one row per
read. A builder given this resolves it by whichever reading is cheapest — most likely by dropping
the NOT NULLs, which is the F1 defect the design exists to fix.
**Fold (D-17, design §3.6, annexes-1 Annex C):** ONE row, TWO phases. Arm INSERTs the pre-read
facts and leaves the settle half NULL behind a `settled_at` discriminator; settle performs the ONE
permitted UPDATE; a **purpose-built** `_tf_freeform_settle_once` trigger permits exactly that
transition and refuses every other UPDATE, DELETE and TRUNCATE; a **DEFERRABLE INITIALLY DEFERRED**
constraint trigger aborts at COMMIT any transaction leaving a receipt unsettled — so "no receipt, no
read" gains its twin, *no read commits without a settled receipt*. `ck_freeform_refusal` is
re-expressed phase-aware; `annexes-1:190-192` ("row_count and byte_count are NULL on a Tier-A
raise") is DELETED — a Tier-A raise aborts, leaving no row to describe. P-17 and P-20 measure both
triggers, both directions.

## 3 · Materials — each folds into v2

**GM-1 · `statement_shape` can never produce the receipt Tier B promises.** *(bytes #4.)* Tier C's
pair table (`design:230-234`) has no `42P11`, which is what the cursor raises on a multi-query
string (*"cannot open multi-query plan as cursor"* — the survey's own P-4 quotes the message). Per
§3.5's own rule an unmapped raise **re-raises**, so the receipt for an attempted injection is lost —
for the single most audit-worthy event. Worse, F.3 demands `statement_shape` from all eight
payloads, while the design's own §3.3 says the derived-table trap makes `set role` / `reset role` /
a bare `insert` **syntax errors** (`42601 → malformed_statement`) and a data-modifying CTE `0A000`.
PR-4's "measured population per token" would have reported `statement_shape = 0` forever — banked as
"never asked" when it is in fact "never recordable". **Fold (D-25):** `(42P11, statement_shape)`
added; F.3 re-cut per payload to the token each actually produces, each cell also asserting a
committed receipt; **P-18** pins every SQLSTATE on the pinned PG 17 image before the law-28 pass.

**GM-2 · The plan census is a catalog-only wall, and three cells assert an order it cannot
produce.** *(bytes #5; the verifier reproduced it on a throwaway cluster — `explain` on an ungranted
table raises `42501` inside `aclcheck_error`, with no plan produced.)* So for every relation outside
the 35, the GRANT fires first: `relation_not_enumerated` is unreachable, `relations_read` cannot be
populated, and C7 (`design:306-308`), F.6(a) (`record:69-70`) and half of F.8 assert an ordering
that cannot happen. Only PUBLIC-readable catalog relations (F.6(b)'s `pg_proc`) can force B2
non-vacuously. **Fold (D-24):** §3.3 and R-2 re-stated — the census is the wall over PUBLIC-readable
catalog relations, which is justification enough (`pg_proc.prosrc` carries every wall's own source);
`relations_read` is **NULL, not empty**, on a plan-less refusal (law 68); C7 and F.6(a) re-cut to
`(42501, relation_denied)`; F.8's "existing-but-unenumerated" arm re-aimed at `pg_class`, with the
ungranted case as a third arm sharing the same model-facing string.

**GM-3 · Rung B6 has no buildable fixture, and does not cover the risk it is named for.**
*(bytes #8.)* B6 needs an `interactive_client` credential with a NULL pin — a row F-A2's D34 CHECK
forbids **every** writer from creating, so the only way to build the cell is to drop the wall B6
rides on. And the failure B6 is described as catching (a client-bound session that fell back to
plain `interactive`) is **invisible to the DB**: it sees a lawful HOME credential and writes a clean
`scope='firm'` receipt. **Fold (D-23, the F-A2 GM-3 precedent — cut on correctness, not severed for
width):** B6 leaves Tier B and survives as a Tier-A **declared-unreachable assert**, published as
such in PR-4 rather than banked as a green; the real wall becomes the runtime mint census
(`withFreeformRead` mints `interactive_client` whenever `ToolCtx.clientId` is non-null, forced both
ways) plus a detective control — PR-4 publishes the count of `scope='firm'` reads issued from
client-bound sessions, expected zero. F.5's ARM-0 cell is re-aimed at the pin conjunct's shape
(a `coalesce(pin, client_id)` mutation must go RED).

**GM-4 · F.7's narrative-wall cells are vacuous.** *(bytes #11.)* `clara.entry_evidence`
(`0009:883-905`) has no citation slot at all and its identifiers are uuids against a bigint receipt
id, so "an `entry_evidence` write citing a `freeform_read` id refuses" proves a type mismatch, not a
wall — under the file's own law-31 bar. The knowledge-fact twin is weak the same way
(`client_facts.basis_kind` is a closed four-value CHECK, `0055:395-396`). **Fold (D-27):** F.7(a)
becomes the GRANT cell — an evidence or knowledge write attempted *through the freeform verb*
refuses `(42501, function_denied)`, twinned with the same write succeeding on its own lane; F.7(b)
becomes the citation cell — the rationale form is accepted, and rejected where an authoritative
number is sourced. §3.7 states the id-namespace fact as a fact. **R-8** names the surviving
residual: a human can still mislabel an aggregate under an existing `basis_kind`.

**GM-5 · The bookkeeper+ read policy is inert as specified.** *(bytes #12.)* Annex C adds a
`for select to clara_authenticated` policy but no table `GRANT SELECT`, and after PR-1 revokes
`0002:542` the table has **zero** non-owner privileges. Postgres checks table privilege before RLS,
so a bookkeeper's raw `select` takes `42501` — the design's own P-6 names this wall generically —
while every F.10 cell routes through the SECURITY DEFINER surface and passes regardless. The floor
would have shipped dead and untestable. **Fold (D-26):** `audit_log`'s precedent is copied in full
(grant at `0002:536` *and* policy at `:517-520`); F.10 gains raw-table arms (viewer → zero,
bookkeeper → own firm, firm B → zero). Also trued: "the two new policies" is **one** — the owner
policy already exists from the `0002:482-493` loop.

**GM-6 · A cite batch, one internal contradiction, and one census layer.** *(bytes #14, CONFIRMED
nit — folded here because two of its three parts are load-bearing.)* The sharpest cite:
**`0011:3927-3929` is the credential-null CLR03 arm, not the `interactive`/`proactive` allowlist
bypass, which is `0011:3931-3932`** — and D-9's whole TA-P9 A(3) argument rests on that bypass, with
the wrong cite repeated in three places (`design:217`, `record:145`, `survey:84,275`). Also trued:
`0002:483-494` → `:482-493` and `0002:492` → `:491`; `0002:553-560` → `:553-559`; `0011:1165-1167` →
`:1164`; `pools.mjs:126-140` → `:136-142`, `:283-292` → `:291-293`, `:325-333` → `:326-334`;
`chatTurn.v10.infra.ts:39` → `:40`; and the contract anchor (below). **The contradiction:**
`design:309` said the three `GOVERNED_TABLES` rosters "gain the new objects" while §7 and F.12 both
say F-A6 creates no table — **C3 is UNCHANGED**. **The census layer:** `rig-meta.mjs`'s `ALLOWED`
map (`:811`, iterated at `:1024`) is keyed by ROLE, so **a role absent as a key is never probed by
the exact-EXECUTE census at all** — both new roles must be added as keys, or C11's coverage claim is
empty for them. All folded into Annex E.2 and F.12.

## 4 · The width ruling

**v1's width was defensible but front-loaded in the wrong place.** The genuinely hard, genuinely
F-A6 part is small: one role and one login, the enumerated grant set, the receipt-as-capability RLS
conjunct, and the execution wall. **The small hard core ships first.**

1. **The cross-client sibling verb is SEVERED to v2** — and with it `p_scope`, the shared core, the
   third allowlist row, the `cross_client` scope value and its cells. It carried the most
   speculative machinery for the least proven demand, it is the limb GB-2's contradiction lived in,
   and it cannot work at all until F-A2's `interactive_client` merges. **This is NARROWER than
   TA-P9 A(2) ("a cross-client read is a NAMED, receipted action — answered, not refused") for a
   client-pinned session. The narrowing is recorded as DISSENT and is an owner item (§6).** v1
   refuses with `CLR10 cross_client_unavailable` and the model-facing message NAMES the deferred
   action — a battery cell forces the naming, because refusing mutely would be a second narrowing.
   HOME chat is untouched: firm-wide by design is the cross-client answer wherever no client is
   pinned.
2. **DECLINED — the crude dashboard page (PR-3).** The bytes lens called it optional weight. It is
   not: **TA-P4 A(4)** rules a human read surface at the `audit_log` bookkeeper+ floor ("today not
   even the owner can read that table") and **TA-P14 clause 2** rules the minimal door for every
   human act — ugly is allowed, absent is not. Cutting it would be wider-than-ruled in the one
   direction this gate may not take.
3. **DECLINED — the plan census.** Re-scoped by GM-2 rather than cut: it is the only wall in the
   design that refuses `select prosrc from pg_proc`, i.e. the source of every other wall.
4. **DECLINED — the fourth pool.** Survey F7 makes it unavoidable: the existing read pool sets
   `default_transaction_read_only` at session level, so the receipt cannot be written there. Its
   password ceremony stays an **owner act** (password-bearing), and R-4 keeps the unmeasured
   connection ceiling visible (P-8).
5. **No D1 write-quiesce window, and no train claim.** F-A6 CoRs no live body; the cost is 35 brief
   ACCESS EXCLUSIVE `CREATE POLICY` locks under `lock_timeout` with bounded retry (P-15). It is
   cleanly severable from F-A4/F-A5's shared `finalize_close` window. Whether PR-1 rides an F-A2
   ceremony's train is **the lead's call, not this design's** (the D29 precedent) — v1 was right to
   refuse to self-assert it, and the fold does not change that.
6. **Too NARROW in one place, and the fold does not paper over it:** the contract's XLSX/DOCX clause
   (`wave-f-contract.md:257-259`). See OQ-E in §6.

**The revised train:** PR-0 (this gate — DONE, law-28 pass still outstanding) → PR-1 (DB: two roles,
35 relations + 7 functions, the policies, the receipt ALTER + three triggers + the human grant and
policy, ONE verb + arm/settle/scope/admitted, TWO allowlist rows, the `0002:542` revoke, C1/C4/C5/C11
— not C3, the printed audit line) → PR-1b (`list_freeform_reads`) → PR-2 (runtime: fourth pool, the
tool, a `chatTurn_vN` numbered at merge, a new frozen infra `_vN`, the session reset) → PR-3 (crude
dashboard) → PR-4 (acceptance) → **then v2** (the sibling verb, the CHECK extensions, S-2's
EXISTS-join arm).

## 5 · Nits — folded without argument

The contract anchor `§F-A6, lines 100-106` is stale in all four documents (`design:4`,
`survey:4,32`, `record:161`): the live block is **`wave-f-contract.md:228-260`** and 100-106 sits
inside §F-A3 (*rulings lens #2, CONFIRMED*) · the S-2 exclusion now names **XLSX/DOCX
structured-parse content** in the contract's own words, not only "OCR text or regions" (*bytes #10 /
rulings #1, refuted as packaged — this is the nit that survived*) · `design:113`'s "ungranted" vs
`:127`'s "both are granted" resolved by D-19 · `scope_redundant` deleted with the severed sibling ·
Annex C's "two new policies" → one · Annex D.2 gains the statement that every pair is a prediction
until P-18 prints it · design §4 moved to Annex E.2 and §8's OQ block + §9 to Annex J so every file
stays under 500 lines with the annex map current.

## 6 · Owner items — not decided by the fold

1. **The cross-client severance is narrower than TA-P9 A(2)** (§4.1). *Fail-closed default the
   design proceeds on:* v1 refuses with `cross_client_unavailable` and names the deferred action;
   v2 ships the sibling verb. *The owner's call:* whether a client-pinned session may wait for v2 to
   compare across clients, given the ruling said "answered, not refused". **Dissent on file:** the
   orchestrator's grounds are buildability (GB-2 lived in this limb) and the `interactive_client`
   dependency, not a disagreement with the ruling.
   **Orchestrator ruling 2026-08-22 (R-L17): ACCEPTED as SEQUENCING, not as a narrowing of
   TA-P9 A(2)** — the verb cannot function until F-A2's `interactive_client` merges, so the severed
   half is REGISTERED as lane **F-A6 v2 "cross-client named read"** (PROGRESS.md lanes). v1's
   `cross_client_unavailable` refusal must NAME the deferred action and the battery cell forcing
   that naming stays. HOME chat unaffected. Item 1 stays on the owner's list as a visibility item.
2. **GB-1 collides with a standing cross-item obligation** — *"the F-A6 receipt writers must NOT be
   granted to the read role; a separate ungranted DEFINER path the wrapper reaches."* The fold
   establishes that an ungranted writer is **unreachable from a SECURITY INVOKER caller**, so the
   obligation cannot be met in the INVOKER shape. *Fail-closed default:* the grant plus the
   one-arm/one-settle structure (D-20). *The alternatives, priced:* (a) a DEFINER outer verb that
   `SET LOCAL ROLE`s down — keeps both writers ungranted, but a payload escaping the switch runs as
   `clara_fn_owner`, and it rests on P-5's session-membership behaviour; (b) the runtime executes
   the SQL over the extended protocol (P-7) — loses text identity, which is the receipt's whole
   point. ~~**Owner/lead ruling wanted before PR-1.**~~
   **Orchestrator ruling 2026-08-22 (R-L16): RULED — the fail-closed default SHIPS.** The
   obligation as worded is UNMEETABLE under the SECURITY INVOKER shape F-A6 needs, so it is
   RE-WORDED at its two homes (F-A4's Annex E.3 line via the close-key-1 gate record's cross-item
   list, and F-A5's C.3/C.4 line) to its INTENT: *the receipt must not be FORGEABLE by the payload,
   and the read role's privilege set over every other table does not move.* F-A6 ships **grant +
   one-arm/one-settle** (no read-id argument; any second call aborts the txn; settle-once trigger
   plus a deferred must-settle trigger). **Three battery cells are REQUIRED:** (i) a payload that
   calls the settle verb itself ABORTS the transaction — no receipt, no result; (ii) a payload that
   calls the arm verb aborts; (iii) a read with no settled receipt cannot COMMIT. **Alternative (a)
   is REJECTED** — a payload escaping the role switch would run as `clara_fn_owner`, a worse failure
   class than a forged receipt.
3. **OQ-E — the contract's XLSX/DOCX clause.** `wave-f-contract.md:257-259` says structured-parse
   content *"becomes reachable by AI-assisted read here"*; v1's S-2 exclusion means it is not.
   *Fail-closed default:* excluded in v1, `read_document` → `get_document_extract` named as the
   surviving door, the EXISTS join to `document_filings` deferred to v2. The owner should see the
   deferral rather than infer it.
   **Orchestrator ruling 2026-08-22 (R-L18): the default is ACCEPTED** — `document_extractions` and
   `document_regions` carry no `client_id`, so a client pin would leak a sibling's document body;
   `get_document_extract` stays the door. Because this DEVIATES from the contract as written, a
   dated `[TA-2026-08-22]` note was added under `wave-f-contract.md`'s XLSX/DOCX clause naming the
   deferral to F-A6 v2. **This stays an owner-VISIBILITY item — shown, not inferred.**
4. **OQ-A remains the lead's** — whether F-A2's R-1 ("`interactive_client` minted for
   `wake_open_question` ALONE") is closed to additions. *Fail-closed default if declined:*
   HOME-only, no client pin.
5. ~~**The two constitutional amendments** (TA-P1 C's open register, TA-P7 C's attribution) are
   **build-blocking** until the owner's digest sign-off.~~ **SATISFIED 2026-08-22 — the owner RATIFIED
   laws 78-81 + the rider R-TA-P1-walls.** Restated because TA-P1 C is what makes "default-on, no
   per-firm signature gate" lawful for this verb, and that authority now stands. F-A6's own remaining
   pre-merge obligation is unchanged: the law-28 cross-model pass on the read surface.

**Cross-item SEQUENCING obligations — named, owned, not decided here** (design §8 carries the same
list): **(a) F-A4's B13 oracle admission** — `_assert_due_read_ctx` admits a JWT session or
`clara_runtime` only, and the fix is an ungranted core extracted BELOW the admission, which F-A4's
§7 / D-14 must explicitly reverse or replace with a different oracle — **SATISFIED by close-key-1
D-26 as written (orchestrator ruling 2026-08-22 (R-L11): the additive ungranted
`_adjustment_run_due_core` sits BELOW the admission at `0045:5525`, the live oracle keeps its
admission, and §7's non-goal narrows to "no change to what the oracles ANSWER")**; **F-A6 is
unaffected and must
not be cited as sanctioning a widening** — no enumerated relation's policy and no F-A6 body calls
it. **(b) Task #17 Fix A has ONE owner** — recommended: F-A4's `finalize_close` window carries Fix A
and Track B's battery rides it; F-A6 touches no shared body and claims nothing. **(c) The clock
execution path** (a `kind='wake'` `agent_task` born HELD, `held→cancelled` only, shared with
F-A3/F-A5): F-A6 binds `task_id` to an interactive chat turn only; a clocked free read is its own
named ruling (R-6). **(d) `chatTurn` `_vN` chains are F-A2 PR-2's first** — tip is `chatTurn_v12`
(`registry.ts:46`), F-A2 claims `_v13`, F-A6 numbers at merge. **(e) `wake_credentials` CHECK pairs
are extend-only after D34** — F-A6 adds no wake kind; v2 extends, never re-cuts. **(f) F-A5's
evaluate leg must name a lawful entrypoint** (an agent orchestrator calling the frozen
`evaluate_metric_v1` under the OBO closure); **its eta is unknown to this item**, so the metric
catalog stays out of A.1 (OQ-B) and the free read must not become the evaluator's back door.

## 7 · Refuted register — recorded so nobody re-raises them

- **"Tier A cannot execute from a SECURITY INVOKER core"** (bytes #6). REFUTED: Tier A's
  `wake_context()` / `assert_wake_allowed()` calls live in `_freeform_arm`, a SECURITY DEFINER owned
  by `clara_fn_owner` — an owner has implicit EXECUTE on its own functions, and every existing call
  site of both helpers in the estate (`0005:1100`, `0009:1442`, `0011:1565/3927`, `0015:2504/2805`,
  `0016:911`; `0078`'s two wrappers) sits inside a definer. A.2's closure is irrelevant to them. The
  prose slip it rode on (`design:113` vs `:127`) is real and is folded as GB-2.
- **"PR-2 must edit the frozen `chatTurn.v10.errors.ts`"** (bytes #9). REFUTED: three of the four
  named tokens are **Tier B** — typed receipt, no raise — so they never reach `safeRead`'s catch at
  all; and for `relation_not_enumerated` the shared generic string is the *designed* oracle
  behaviour (`annexes-1:228-231`), not a defect. A new frozen infra `_vN` carries its own mapping
  code without touching the frozen errors module. The narrow real point (the Tier-C non-oracle
  tokens want their own branches; the `chatTurn` version number must be claimed at merge) is folded
  into §7's PR-2 line.
- **"The design silently drops the contract's XLSX/DOCX clause"** (bytes #10 and rulings #1, the
  rulings lens's only material). REFUTED: the deviation is carried in four places
  (`design:203-205`, `:421`, `annexes-1:48`, `record:146`/D-10) with its ground and its cost, and
  the capability survives through the live typed door `get_document_extract`
  (`0011:3232-3260`). What survived is the traceability nit — the design never used the contract's
  own words — folded as D-28/OQ-E.
- **"The contract anchor mis-cite hides two unanswered clauses"** (bytes #13). REFUTED as packaged:
  the DEFINER-vs-INVOKER inversion is argued **twice in the main body** (`design:93-101` D-2 and
  `:124-130`, which says outright *"the divergence is stated rather than glossed"*), not buried in
  an "Annex B:118-122" that does not exist. The pointer fix itself is real and is folded as a nit.
- Recorded for completeness: the rulings lens found **no** ruling implemented narrower or wider than
  ruled in v1 — every narrowing in the current design was introduced by this fold's width ruling and
  is on the owner-items list.

## 8 · What PR-1's rig replay must confirm

The design's own P-1..P-15, plus the five the fold added — **P-16** (a refused multi-statement
`OPEN … FOR EXECUTE` executes no part of the string; a portal produces nothing before FETCH: the
whole of D-18) · **P-17** (the deferred must-settle trigger fires at COMMIT, both directions,
including across a SAVEPOINT rollback) · **P-18** (the exact SQLSTATE of each F.3 payload on the
pinned PG 17 image — the Tier-C pair table is a prediction until it runs, and it must run **before**
the law-28 pass) · **P-19** (a payload's non-local `set_config` outlives the transaction on the same
backend; a payload-set `statement_timeout` reaches the next FETCH) · **P-20** (the settle-once
trigger's permitted transition and its four refusals). Plus the two the fold re-aimed: **P-11** now
grounds D-24 (EXPLAIN fails 42501 rather than returning a partial plan) and **P-14** is unchanged.
