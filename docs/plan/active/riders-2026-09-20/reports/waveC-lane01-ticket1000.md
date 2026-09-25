# Wave C · lane 01 · ticket #1000 — `read_client_financial_pack`, and the split that made one entrance possible

**Branch** `riders/wC-lane01`, cut from `main` at `6da02a8de` (the integrated wave-4 head, PR #1053).
**Worktree** `C:\Users\zhant\Desktop\clara-wt\635`. **Database** `clara_l01` at `127.0.0.1:55741`,
309 files / `0318_knowledge_fye_pair_applicability` when I started, **310 files / `0320_client_financial_pack_wake_read`** now.
**Status: DONE.**

The ticket is live on this branch: `gh api repos/BELCORT-SDN-BHD/clara/issues/1000` → OPEN,
labels `enhancement` + `ready-for-agent`, **`comments: 0`**, so the Agent Brief in the body is the
newest and only contract and no owner ruling amends it. Nothing on `main` satisfied it: the read's
only callers were the web client home and its tests, `chatTurn_v21`'s roster carries no such tool,
and `p660.pack.no_agent_reach` pinned the model lane's ZERO reach by name.

**Ticket before me in this lane:** #985 (`3c935af20` … `ae88f8ef2`), read first, along with
`reports/waveC-lane01-ticket985.md`. It minted the whole `chatTurn.v22.*` file set and the five
registry edits; this ticket edits those same new files and mints nothing of its own on that side.
`claraWork` is still pinned at `claraWork_v5` and `statementFacts` at `statementFacts_v3` — #1000
needed no claraWork change, so **`claraWork_v6` is still unminted and its sixth
`CLARA_WORK_BUNDLE_V6_BANNER` import and `console.log` line in `plugins/startWorld.ts` is still
owed, in the SAME commit as the claraWork registry repoint** (R2, the last cut's one real defect).

## Commits (`git log 6da02a8de..HEAD`, mine are the top four)

| commit | what |
|---|---|
| `1d2d6d238` | `feat(db): #1000 one body, two entrances` — migration `0320`, the first cell, and the two censuses that pin the body by name |
| `ed304cc29` | `test(db): #1000 the model lane's own battery` — ten cells at the new door, and the vacuity control |
| `6e6c1c912` | `feat(runtime): #1000 read_client_financial_pack` — the tool, its refusal mapping and its prompt stanza |
| `4b732e915` | `test(runtime): #1000 the tool against a real database, plus the docs the change owes` |

## The seams I tested at (written down before the first cell, work-order rule 4)

The brief's Key interfaces name three, and I added no cell at a seam it does not give me:

1. **The read's signature and envelope, unchanged** — `clara.get_client_financial_pack(p_client,
   p_as_of, p_month)`. Driven as the client home drives it (`humanQuery` → the door), and its
   behaviour is #660's own 36-cell battery, which this change had to leave green.
2. **The model lane's entrance** — `clara.wake_get_client_financial_pack(p_client, p_as_of,
   p_month)`, driven on the READ role under a real `interactive` wake credential, exactly as
   `withReadWakeScoped` drives it.
3. **The tool as the model meets it** — `readClientFinancialPackInputSchema`, `buildToolsV22`,
   `runReadClientFinancialPack` and the exported pure mapper `clientFinancialPackRefusal`, plus
   `CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE` in the prompt.

Two seams I deliberately did NOT test at: the browser's client home (`apps/web` is byte-untouched
by this whole lane — the ticket's own "Out of scope: Client-home UI changes"), and the pack's
ARITHMETIC (that is #660's battery's subject; my job was to prove the arithmetic did not move, and
I prove that by hash rather than by re-deriving it).

## The design decision this ticket turned on, and the four routes I measured

The brief's Key-interfaces line says the remedy is "a wake wrapper, its grant and its allowlist
row". The wrapper alone does not work, and finding out why is most of this ticket. Measured on
`clara_l01`, not recalled:

1. **Grant the read to `clara_agent_ro`.** The read resolved its caller inline from
   `clara.jwt_sub()`, which reads the `request.jwt.claims` GUC; the chat lane's pooled credentials
   set none. The grant buys a door that answers CLR04 `no authenticated actor` on every call —
   "not a capability" (`reports/wave4-lane04-ticket939.md`). And 0232's tail asserts the model
   lane holds nothing on it, which the ticket's own AC6 requires to stay true.
2. **A wake wrapper that sets `request.jwt.claims` from the credential's `on_behalf_of`.**
   REFUSED, and the estate refused it first, in words:
   `0082_wave_e_zeta_render_jobs_part4.sql:14-17` — "Setting request.jwt.claims from a production
   function to borrow a human's identity is impersonation; in this repo that idiom appears ONLY
   inside migration probes (0011:99, 0019:1778), never on a production path, and it is not being
   introduced here." That header then rules between the two remaining options.
3. **A second, machine-side copy of the computation.** Refused by the same header ("DUPLICATION IS
   REFUSED — a second copy of a gate is a second place to forget it"), by #660's own "one fact,
   one definition", and by the ticket's own "the pack stays the single definition of these
   numbers".
4. **A SECURITY INVOKER wrapper, so the estate's own `p_*_agent` RLS policies scope it.** Closed
   by measurement: of the nine relations the pack reads, `clara.cash_account_set_versions` and
   `clara.cash_account_set_members` carry NO agent policy at all, and
   `clara.opening_seed_registry`, `clara.onboarding_plans` and `clara.onboarding_plan_items` carry
   an agent policy with no table SELECT grant behind it. Making it work costs five table grants
   and two policies for `clara_agent_ro` — a widening of the model lane's RELATION reach that
   AC6 forbids.

Two more measurements made the answer inevitable:

* `set_config('role', …)` inside a SECURITY DEFINER body is refused outright by PostgreSQL —
  driven on this rig: `42501 cannot set parameter "role" within security-definer function`. So
  "become the human for one statement" is not available to any wrapper.
* `clara.clients` is FORCE ROW LEVEL SECURITY **and** its `p_clients_owner` policy is
  `TO clara_fn_owner USING (true)`. Driven: a throwaway definer function owned by `clara_fn_owner`
  counted **506 of 506** clients where `clara_agent_ro` counted 0. So any definer path needs an
  EXPLICIT firm predicate; RLS cannot carry the tenancy for it.

**So 0082's remaining option is the one taken: SPLIT.** The computation moves into ONE ungranted
core; the human door keeps its signature, defaults, return type, envelope, refusal codes and ACL
and becomes that core's VIEWER-floored delegate; and the model lane gets its own audited door.
That is 0004:749-750's `_*_core` containment idiom, and it is the shape the cut plan's OWN cited
precedent already has (`clara.wake_create_account_set` → `clara._agent_create_account_set_core`).

**On the ticket's "Out of scope: Recutting the read's body".** I read that as "do not change what
the read computes or answers", and the change honours it to the byte: the signature, the envelope,
every coverage word and every refusal code are unchanged, and §TAIL proves the arithmetic did not
move by reversing the three edits and hashing. What DID change is where the body lives and how the
caller is resolved — which is precisely what the same brief's Key-interfaces line asks for and
what the estate's own law prescribes for this situation. If the orchestrator reads that
out-of-scope line more literally, the honest alternative is to DEFER #1000 as class C was
deferred; there is no third option that ships a working tool.

## Acceptance criteria, each with its evidence

**AC1 — "The tool returns, for a client and either MTD or a named month, the same envelope the
pack returns for those inputs, computing no figure of its own."** DONE, proved at two seams.
* At the DOOR: `p1000.wake.same_envelope` (`packages/db/tests/client-financial-pack-wake-read.test.mjs`)
  posts a real RM 1,000 sale, publishes a cash set, reads the same client and month as a human and
  through an `interactive` credential on `clara_agent_ro`, and asserts `period`, `coverage_floor`,
  `series`, `excluded_by_design` and all four figure groups are deepEqual once `computed_at` and
  `source_watermark` — the two keys that are SAMPLED per call — are removed. PASS.
* At the TOOL: `1000.db: the REAL tool, through a REAL credential, answers the client home's OWN
  envelope for the same inputs` (`packages/runtime/tests/chat-turn-v22-financial-pack-db.test.mjs`)
  drives `runReadClientFinancialPack` with `globalThis.__claraPools` filled with exactly what
  `lib/pools.mjs` does, and asserts the same deepEqual plus the independent figure (100000 cents)
  and all ten envelope fields. PASS.
* "Computing no figure of its own" is also pinned structurally: `v22.pack: the envelope travels
  WHOLE — key for key, NULL for NULL, and nothing is re-derived` asserts `out.pack` is deepEqual to
  the door's object, with a NULL cash figure beside a real profit so a tidy-up would show.

**AC2 — "An unauthenticated, non-member or role-insufficient caller, and a malformed month or
as-of, reach the model as the read's own typed refusals."** DONE, and the first half is answered
one layer EARLIER than the ticket assumed, which is worth stating plainly.
* The DATE refusals are the read's own and travel verbatim: `p1000.wake.typed_refusals` drives
  `month_not_first_day`, `as_of_in_future`, `as_of_outside_month` and `invalid_client` at the door
  and asserts the errcode and `detail.reason` for each; `v22.pack: the READ'S OWN CLR10s reach the
  model…` asserts the tool carries the code, the reason and the WHOLE detail bag under `details`;
  and `1000.db: the read's own CLR10 travels from the real door to the model` drives one of them
  end to end against real Postgres. PASS.
* The AUTHORITY refusals: on this lane a non-member or below-bookkeeper person is refused by
  `clara.mint_wake_credential` with CLR10 and #630's typed `authority_lost` **before the read is
  reached at all**, so there is no read refusal to carry. The tool answers CLR04 with that same
  reason word and a sentence naming the floor — the chat lane's own authority code, the door's own
  reason. This is the ONE code the mapper translates and its docblock says so. Driven end to end
  by `1000.db: a viewer's turn cannot read the money band at all`, which first shows the SAME
  viewer reading the client home's own pack (the read's floor really is VIEWER) and then shows the
  tool refusing them CLR04 `authority_lost`, with a bookkeeper+ control that succeeds.
* "Unauthenticated" cannot arise on this lane: a chat turn exists only inside a session bound to a
  real `createdBy`. The credential-level refusals that stand in for it (absent, expired, revoked,
  wrong kind, no `on_behalf_of`) are `p1000.wake.no_credential`, `p1000.wake.kind_not_allowlisted`
  and `p1000.wake.needs_a_named_person` at the door, and `v22.pack: the wake ceremony's refusals…`
  at the tool.

**AC3 — "A client with no published cash set yields the unknown/`cash_set_unpublished` envelope,
not a refusal and not zero."** DONE, at both seams: `p1000.wake.unknown_cash_set_is_not_zero` (the
door) and `1000.db: a client with no published cash set answers unknown + NULL +
cash_set_unpublished through the tool` (the real tool, real database). Both also assert the PROFIT
half is unaffected — the client home's own property. PASS.

**AC4 — "A client outside the caller's scope and an invented client id produce identical
results."** DONE. `p1000.wake.no_oracle` reads firm B's REAL client and an invented uuid through
firm A's credential and asserts both answer the read's own `client_not_visible` DATA envelope
(never a raised refusal, never a figure) AND that the two answers are deepEqual once the
per-call keys and `client_id` — the caller's own argument coming back — are removed.
`1000.db: another firm's real client and a uuid that names nothing are INDISTINGUISHABLE through
the tool` drives the same thing through the REAL tool, with a control proving the same credential
DOES return this firm's own figures. PASS.

**AC5 — "The tool ships in a new frozen chat workflow version; no pinned version is edited."**
DONE. It lands in `chatTurn.v22.tools.ts` and `chatTurn.v22.prompt.ts`, the files #985 minted this
wave; `chatTurn.v21.*` and every earlier body are byte-untouched (`git diff 6da02a8de..HEAD`
touches no `chatTurn.v1..v21` source file). `frozen-workflows.json`: `--compare-base 6da02a8de`
reports **322 existing entries retaining the same hash and deployed flag, 6 additions, 0
mutations**; the six are #985's five v22 files plus `lib/opening-parse.mjs`, and my change
rehashed two of them (`.tools.ts`, `.prompt.ts`), which is legal because they are not deploy-locked
yet — locking belongs to the release ceremony (§2.4).

**AC6 — "The new entrance grants the model lane no more than the human door already grants."**
DONE, and it grants strictly LESS.
* The whole machine-side delta is ONE `grant execute` and ONE allowlist row. No relation grant, no
  policy, no role. Asserted in §TAIL role by role and driven by `p1000.wake.grant_is_one_role`:
  `clara_agent_ro` reads it; `clara_runtime`, `clara_authenticated` and `clara_wake_interactive`
  are refused 42501 on the door, and all four are refused 42501 on the core.
* 0232's posture is RE-MEASURED rather than transcribed (the cut plan's own "Watch"): §TAIL
  asserts `clara_runtime`, `clara_agent_ro` and every `clara_wake_*` role hold NOTHING on all
  three #660 doors, and `p660.pack.no_agent_reach` still passes unchanged.
* The FLOOR is higher on the machine lane, not lower: the read's own floor is VIEWER;
  `clara.mint_wake_credential` refuses a below-bookkeeper `on_behalf_of` outright and
  `clara.wake_context` re-validates that standing on EVERY use. Driven both ways by
  `p1000.wake.floor_is_the_credential` (a viewer's OBO mint refused CLR10; a revoked credential
  going inert mid-conversation) and by `1000.db: a viewer's turn…`.

## Out of scope, honoured

* "Recutting the read's body, envelope or refusal codes" — see the design section. No figure,
  coverage word, envelope key or refusal code changed, and §TAIL proves it by hash.
* "Any write path onto cash account sets from the model lane" — `publish_client_cash_account_set`
  is byte-untouched, still `clara_authenticated`-only and admin-floored, pinned unconditionally in
  the prestate and re-asserted in the tail. The model lane gained no write anywhere.
* "Client-home UI changes" — `apps/web` is byte-untouched by this ticket and by the whole lane.

## Migration

**`packages/db/migrations/0320_client_financial_pack_wake_read.sql`** — 1,355 lines, of which ~720
are #660's own body carried into the core. It creates TWO functions, replaces ONE, writes ONE row.

**What it installs**

| object | posture | ACL |
|---|---|---|
| `clara._client_financial_pack_core(uuid,uuid,date,date)` | STABLE SECURITY DEFINER, `search_path`, `plan_cache_mode=force_custom_plan` | **nobody** (public revoked; every `clara%` role but its owner asserted refused) |
| `clara.get_client_financial_pack(uuid,date,date)` | recut: STABLE SECURITY **DEFINER** (was INVOKER), same signature/defaults/return type | `clara_authenticated` (unchanged) |
| `clara.wake_get_client_financial_pack(uuid,date,date)` | STABLE SECURITY DEFINER | `clara_agent_ro` **only** |
| `clara.wake_fn_allowlist` | one row | `('interactive','wake_get_client_financial_pack')` |

**The three anchored edits, and the proof they are the only ones.** The core is 0232's body with
(A) the `c record` declaration removed, (B) the inline JWT floor replaced by a comment naming the
two doors that now carry it, and (C) the visibility test gaining `and cl.firm_id = p_firm`. §TAIL
REVERSES all three on the LIVE core and requires the result to hash to the pinned pre-image —
0318's own idiom. A digit changed anywhere in the arithmetic reds the migration instead of
shipping. (It did red once, on my first assembly, for a doubled leading newline; that is what the
check is for.)

**Prestate pins, all MEASURED LIVE on `clara_l01` after #985 (which added no migration), never
copied from an earlier header.** The integrator reads this list to find a pin another lane recuts.

*Bimodal, the ONE body this file recuts* — it admits its measured live sha (FIRST APPLY) or a body
already carrying this file's `#1000` attribution (REDO), and anything else refuses BY NAME:

| signature | sha256(prosrc) |
|---|---|
| `clara.get_client_financial_pack(uuid,date,date)` | `c846768d0d114a3bf38d90a437bdd65731f4a3cbc64a7ecd3edc72cb6b788f1e` |

*Unconditional neighbours (11):*

| signature | sha256(prosrc) |
|---|---|
| `clara.wake_context()` | `fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d` |
| `clara.assert_wake_allowed(text,text)` | `1c88b7e09e60e3384ee5a2cff36db7ba242f3397f0213b488388f7f827306e3b` |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara.jwt_sub()` | `c4051473a0619987796d2aa7a64817536ac21d161f0fd827b6912ca8ce1aa243` |
| `clara.jwt_firm()` | `43338e8393c961c9f3d06fb0929479cfcc33ff91c67f8575478a790b6fab0a45` |
| `clara.actor_role_rank()` | `9b011800f23ff8a774285845902892af53350f58778a967abd69773d91eb699d` |
| `clara.propose_client_cash_accounts(uuid)` | `c2d04e73e08bbb33fd591413fa243d4cda58ab6b4da07fd41c4e9de29012d261` |
| `clara.publish_client_cash_account_set(uuid,jsonb,date,text)` | `b84c152869c4148339e67b0d26907ccec62564c182008ac3e25adf6feaf8e750` |
| `clara.book_today()` | `6fa61590d86dec3d4d8ced82e617344da6aa282777d7e6c31ca70aa48cce97e3` |
| `clara._book_today()` | `7cf4dce633284fd955e575da49a24377f20f10ad0621ef5134b8dd7cb3d5c26e` |

**House shape, item by item.** Header (the four routes, the two measurements, what it does not do,
the floor per lane); §0 prestate (premise, the bimodal pin with its mode named, partial-birth in
BOTH directions, the eleven neighbours); `set role clara_fn_owner`; §A the core; §B the human
door; §C the wake wrapper; `reset role`; §D ACL + allowlist; §TAIL, nine numbered proofs including
two DRIVEN ones (the door refuses CLR03 with no credential; `clara_agent_ro` is refused 42501 on
the core inside a rolled-back role change). Gate module
`tests/client-financial-pack-wake-read-preintegration-gate.mjs` on the stable stem
`client_financial_pack_wake_read$`; the gate-chain entry is added to `packages/db/package.json` in
MIGRATION ORDER (immediately after `schedule-term-correction-preintegration-gate.mjs`); the
rig-meta cohort is `CLIENT_FINANCIAL_PACK_WAKE_0320_COHORT` with its `cohortFailures` call, and
`wake_get_client_financial_pack` is added to `ALLOWED[clara_agent_ro]` — the first `wake_*` name
that role has ever held, which the roster's comment states and argues (a read-only role is the
narrower home for a read, and the allowlist row is the kind gate on top of the EXECUTE).

**Both apply branches were exercised on `clara_l01`, in the natural order.** FIRST APPLY through
`pnpm --filter @clara/db migrate` (`[notice] #1000 prestate: clean — mode FIRST APPLY`), and REDO
through `CLARA_MIGRATION_REDO=0320_client_financial_pack_wake_read` (`[notice] … mode REDO`, new
checksum `7e40894b8596dea09cd2af5866b32929cfd6659f65897e55598b75094b6486dd`) — so the wave-3
addendum's concern that a redo hides the first-apply branch does not apply here: I drove both, and
the tail's hash proof ran on both. **The redo was not incidental**: it is how I restored the core
after the vacuity control below, and it is recorded as such.

**No ledger drift:** a second plain `pnpm --filter @clara/db migrate` afterwards reports
`0 new migration(s) applied · 310 total`.

**Redo-safe by construction (#957):** every object is `create or replace function`; the one row is
`on conflict (wake_kind, function_name) do nothing`; the prestate names a PARTIAL birth or a
PARTIAL redo rather than completing it.

## The vacuity control, and what it found

Work-order rule 4 asks for it, and the load-bearing subject here is the ONE predicate that carries
the tenancy of both lanes. I removed `and cl.firm_id = p_firm` from the LIVE core (a `create or
replace` as `clara_fn_owner`, derived from the migration's own `$c_old$` constant so the break was
exactly the reverse of the edit), and re-ran both batteries:

* `p1000.wake.no_oracle` RED — the model lane could read another firm's money.
* **`p660.pack.cross_firm` RED too** — #660's own cell, which I had not written, catches the same
  widening on the HUMAN lane. That is the finding worth carrying: after this split the human
  lane's firm scope is no longer RLS's, it is that predicate's, and an existing cell already pins
  it. Nothing else in either battery moved.

The core was then restored through the supported redo mode, whose tail re-proved the body byte for
byte, and both batteries went green again (46/46).

## What else moved, and why

* `packages/db/tests/client-financial-pack.test.mjs` — a new `packComputeBody()` /
  `packComputeSrc()` pair answers WHICH body carries the computation on the chain under test, and
  the file's four structural cells read it. Two of them (`bank_statements` absent, `greatest(`
  absent) would have stayed GREEN against a three-line delegate — silently vacuous, which is worse
  than red — and the third (`as_of_is_book_day`'s prosrc half) went red honestly and is what
  pointed at the other two. It still runs on a `db-slice-frontiers` chain below 0320, where the
  door IS the body. No behavioural cell changed.
* `packages/db/tests/x42-s5-helpers.mjs` — arm (D)'s bare-clock roster and arm (B)'s
  `Asia/Kuala_Lumpur` duplication roster each gain a 0320 variant that swaps
  `get_client_financial_pack` for `_client_financial_pack_core`, REVERSE-GATED on 0320's stem. It
  is the shape `KL_ROSTER_0223_PREPAYMENT` already uses for 0307's identical extraction. Nothing
  was added to or removed from either ledger: exactly one body still reads the clock and spells the
  zone for this read, under a new name.
* `packages/db/tests/rig-meta.mjs` — the new cohort, the `ALLOWED` entry, and an amendment to the
  #660 block so it no longer describes a world that ended (0232 still ships no agent twin; #1000
  added a SEPARATE door, which is what 0232's header said it was deliberately not doing THEN).
* `packages/runtime/tests/chat-turn-v22-tools.test.mjs` — the roster cell (39 → **41**, and the
  added-name list is now `["read_client_financial_pack", "read_opening_source"]`) and the
  "byte for byte" prompt cell, which now asserts the added text is exactly the two exported
  stanzas in the order they were added. #985's report named both as the cells each later ticket of
  this lane edits; extended, never replaced.
* `frozen-workflows.json` — two rehashes (`chatTurn.v22.tools.ts`, `chatTurn.v22.prompt.ts`) plus
  serialization noise: `--update` re-serializes with `JSON.stringify`, which unescaped five
  `\u2014` sequences in wave-4 `agreementFacts.v1.*` notes. **No hash and no `deployed` flag
  moved** (`--compare-base` says 322 unchanged), the note STRINGS are identical, and a second
  `--update` is now a no-op — but the diff is visible and is named here rather than left to be
  found.

## Gates, with counts

| gate | result |
|---|---|
| `node --test tests/client-financial-pack-wake-read.test.mjs` (new, full gate chain) | **10/10 pass** |
| `node --test tests/client-financial-pack.test.mjs` (touched) | **36/36 pass** — #660's own battery, the regression proof for the split |
| the ten db files I touched or that consume what I touched, with the FULL 126-gate chain, plus `operation-census.test.mjs` and `rig-isolation.test.mjs` (no reset flags) | **102 tests, 101 pass, 0 fail, 1 skipped** |
| `node --test tests/chat-turn-v22-financial-pack.test.mjs` (new) | **12/12 pass** |
| `node --test tests/chat-turn-v22-financial-pack-db.test.mjs` (new, PG env → `clara_l01`) | **5/5 pass** |
| `node --test tests/chat-turn-v22-tools.test.mjs` (touched) | **18/18 pass** |
| §4.2 version gates (`registry-view`, `p6-1-parts-parity`, `p6-1-chatturn-v16`, `local-db-gate-drivers-census`, `built-bundle-gate`, `rollback-preflight`, `runtime-contracts`) | **119 tests, 97 pass, 0 fail, 22 skipped** |
| `pnpm --filter @clara/runtime build` | OK (nitro, `.output/server/index.mjs`) |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites |
| `node scripts/check-workflow-bundle.mjs` | OK — 14 pinned classes, chatTurn pinned at v22 with its step directive, engine stamp and `freeform_result` emitter, 58 superseded bodies still shipping (46 checks) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — reader ⊇ emittable; **no new wire kind**, so no `chatTurn.v22.parts.ts`, no `DEFAULT_DECLARERS` entry and no exemption-ledger row moved |
| `node scripts/check-frozen-workflows.mjs` | OK — 328 frozen files, 58 `"use workflow"` modules all frozen+registered |
| `node scripts/check-frozen-workflows.mjs --compare-base 6da02a8de` | OK — **322 unchanged, 6 additions, 0 mutations** |
| `node scripts/check-frozen-workflows.selftest.mjs` / `.registration.selftest.mjs` | OK / OK |
| **whole runtime suite** (`node --test --test-concurrency=1 "tests/**/*.test.mjs"`, PG env → `clara_l01`) | **3010 tests, 2965 pass, 2 fail, 43 skipped, 300.6 s** — and BOTH failures are RIG.md's named Windows-only reds, reported as such and NOT "fixed": `scanner rejects EICAR…` (#693, Defender eats the fixture) and `(#806) this host's OWN probe: pg_dump/psql are on PATH here` (no `pg_dump` on this PATH). The other named reds (`rollback-preflight 637.pf: B3`, `wake-engine M1`, `relay-runner`) were GREEN in this run. |
| **version-cutover e2e** (§4.3) | **ALL PASS.** `PGDATABASE=clara_rt_test` + matching DSN, `RELAY_TEST_MODE=1`, against a TEMPLATE COPY of `clara_l01` (`create database clara_rt_test template clara_l01`, then `pnpm --filter @clara/runtime exec bootstrap` for the WDK world) — never a second from-scratch chain, because 0154 pins a cluster-global role count. It printed `RESUME v7: completed on v7 body (name-invariant)`, `RESUME v8: completed`, the #708 scoped-inventory legs, and `static guards: registry repoint (-> chatTurn_v22) + v7 retention + frozen v7/chatTurn.v22.ts hash-locks`. The clone was DROPPED and the lane database re-measured: **0 world schemas, 310 migrations, max `0320`** — so `rig-isolation` T10b stays green on `clara_l01` (#866), re-run afterwards: 22 pass / 1 skip / 0 fail. |
| `pnpm typecheck` (root, 3 projects) | **exit 0** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root, the runner's own shape) | **exit 0** — it caught one real thing first (an unused constant in a new test file), which is why the addendum asks for it |
| `apps/web` unit suite / browser walks | **NOT RUN, and correctly**: this ticket and this whole lane touch no file under `apps/web` (`git diff --stat 6da02a8de..HEAD`). The web parts census (§2.6) is a no-op because no wire kind was added, and was run as such. |
| `apps/web/tests/firm-scope-db-pins.test.ts` (§4.8 — the web pins corpus is in scope whenever a migration file changes) | **22/22 pass**. No corpus entry is owed: 0320 contains **no dynamic SQL at all** (the core's body is written out statically, never spliced from `pg_get_functiondef`). |
| **whole `packages/db` suite** (`pnpm --filter @clara/db test`, the full 126-gate chain, PG env → `clara_l01`) | **5804 tests, 5708 pass, 1 fail, 95 skipped, 1070 s.** Run because this ticket recuts a LIVE human door and edits two shared census modules (`rig-meta.mjs`, `x42-s5-helpers.mjs`), so the per-file scope the work order sets was not enough evidence. The ONE failure is pre-existing and is proved so below. |

### The one db-suite failure, and why it is not this ticket's

`p647.events.taxonomy` (`packages/db/tests/counterparty-identity.test.mjs:606`) reds on
`the active taxonomy still routes EVERY catalog row`, naming three orphan event types
`rig.g1round7a.uncov.mufx7sz0 / mufz9ja9 / mufzg1s1`.

Measured, not argued:

* Those rows are planted by **`packages/runtime/tests/wake-engine.test.mjs:864`**, whose own
  comment says the row "is NEVER deleted afterward" and that the literal was deliberately moved
  into the reserved `rig.%` namespace because "EVERY db-side full-coverage census … relies on
  [it] to tolerate exactly this residue on a SHARED estate DB". Three exist because I ran the
  whole runtime suite against `clara_l01` three times.
* Four db-side censuses carry the exclusion the house law (AB-7) asks for —
  `rig-events-structure.test.mjs:227`, `s6-tasks.test.mjs:94`, `wave-a-shape.test.mjs:183`,
  `rig-docs-events.test.mjs §3.7` — all spelled `where … name not like 'rig.%'`.
  **`p647.events.taxonomy` is the fifth such census and carries no such exclusion**
  (`grep "not like 'rig" packages/db/tests/counterparty-identity.test.mjs` → nothing).
* Run with the house exclusion added, the same anti-join returns **zero rows** on this database;
  without it, exactly those three. So the residue is the whole of the finding.
* Neither file is touched by this lane (`git diff --name-only 6da02a8de..HEAD` names neither), and
  0320 touches no event type, no taxonomy and no trigger routing at all.

The rows cannot simply be swept: `clara.domain_events.event_type` is FK-bound to
`clara.event_types(name)` and the same runtime test appends an event of that type, so the catalog
row is pinned by an append-only event. **Follow-up 5 below.**

## Docs, in the same commits

* `packages/runtime/README.md` — the 2026-09-25 cut section gains `read_client_financial_pack`:
  what it carries, what it refuses to do, and the **deploy order its coupled migration makes
  non-optional** (0320 before the image, or the tool answers `42883` as an internal fault on every
  call).
* `packages/db/README.md` — a 0320 section in the house shape: the four routes and why three are
  closed, the firm predicate that is now the whole tenancy wall (with the 506-of-506 measurement),
  the reverse-substitution proof, the floor each lane carries, and the redo-safety statement.
* `CONTEXT.md` — **nothing, deliberately.** #1000 introduces no new accounting vocabulary: "Cash
  account set", "Book cash", "Period profit", "Source watermark" and "Definition version" are all
  already there and all unchanged by this ticket. Adding a term for a wrapper would be technical
  vocabulary in a file whose header scopes it to accounting and product words.

## Successor contract

**None is owed.** This ticket edits the NEW `chatTurn.v22.*` files directly rather than asking a
frozen body for anything, and it needed no `claraWork` change. Recorded here in the successor
shape anyway, because the roster-application worker (step 5) will re-read it:

* **name** `read_client_financial_pack`
* **zod input** `z.object({ client_id: z.string().uuid(), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict()`
* **door call** `clara.wake_get_client_financial_pack(p_client => $1::uuid, p_as_of => $2::date, p_month => $3::date)`, named arguments, on `readScoped` (the `interactive` OBO mint + the read pool). Never the human door, never the core.
* **refusal mapping** `clientFinancialPackRefusal(error)` — the door's code and reason verbatim with the whole detail bag under `details`; fixed sentences for `invalid_client`, `month_not_first_day`, `as_of_in_future`, `as_of_outside_month`, `wake_credential_unavailable`, `wake_authority_absent`, `authority_lost`, `credential_client_pin`; an unknown reason is NAMED rather than described; a non-CLR error is a fault in this lane's own words. ONE translation, documented: the mint's CLR10 `authority_lost` becomes CLR04 `authority_lost`.
* **part kind** none new — the envelope rides the generic `tool_result` part `toTypedParts_v10` already promotes, so `apps/web/lib/parts/types.ts`, `catalog.test.tsx`'s count and `check-parts-parity.mjs` are all untouched.
* **prompt stanza** `CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE`, appended after #985's; `SYSTEM_PROMPT_V22 = v21 + OPENING_SOURCE_CHAT_GUIDANCE + CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE`.

**What the tickets behind me in this lane inherit**

1. **`claraWork_v6` is still unminted**, so its sixth `CLARA_WORK_BUNDLE_V6_BANNER` import and
   `console.log` line in `plugins/startWorld.ts` is still owed in the SAME commit as the claraWork
   registry repoint (R2). `workflowPins.claraWork` is still `claraWork_v5` and `statementFacts`
   still `statementFacts_v3` at this HEAD.
2. **The roster cell now counts 41** (`v22.roster: v22 is v21's tool set plus EXACTLY
   read_opening_source and read_client_financial_pack`). Each later ticket edits that one cell.
3. **The prompt cell now asserts TWO stanzas** and their order; extend the list, never replace it.
4. **`0321` is #1030's** and the cut phase's overflow block starts at `0323` (R7): a fix round that
   needs another migration asks the orchestrator rather than taking "the next free number".
5. **R5, stated by hand because no gate states it:** this ticket's zod adds `.strict()` and
   `.regex()`, both of which `z.toJSONSchema` DOES see (`additionalProperties:false`, `pattern`),
   and adds no `.superRefine` or other refinement invisible to the bundle digest.

## Follow-ups worth filing

1. **`apps/web/lib/clara/toolLabel.ts`'s `CHAT_TOOL_TOKENS` is now three cuts behind** — it
   carries neither of v21's two tools nor either of v22's, so the transcript shows the raw token as
   its own label. An unknown token is explicitly NOT a defect there, which is why two cuts have
   left it; four missing labels is now a real, small polish item for whichever ticket next touches
   `apps/web`, together with the `Clara.tools.*` message keys. (#985 filed the same item at three.)
2. **A World walk for `read_client_financial_pack`.** §4.5 assigns `chat-turn-v22-e2e.mjs` to the
   roster-application step of this lane and it is not mine to mint. What this ticket proves instead
   is stronger than a mock — the REAL tool through the REAL credential against real Postgres — and
   the gap that remains is specifically "a MODEL reaches this tool inside a running engine".
   §4.5's trap 3 applies to it: the client id must reach the model through the prompt, never out of
   band, and this tool's identifier IS in the prompt stanza.
3. **The two-firm membership property, inherited not introduced.** `clara.jwt_firm()` answers ONE
   row (`limit 1`, no ordering), so a person with active memberships in two firms resolves to
   whichever it returns — the SAME property 0232's RLS predicate had, because that predicate was
   `firm_id = clara.jwt_firm()`. This ticket neither widened nor narrowed it; it is named because
   the firm now arrives as an argument, which makes it easier to see.
4. **`p647.events.taxonomy` is the one full-coverage census of five that omits the reserved
   `rig.%` exclusion** (`packages/db/tests/counterparty-identity.test.mjs:626-630`). It reds on any
   database where the runtime suite has run before the db suite — which is every lane database, by
   RIG.md's own design, and was the shape CI itself hit before the two packages were given separate
   databases. The fix is the one line its four siblings already carry. Not taken here: it is
   outside #1000 and the work order forbids widening a ticket. Evidence is in "The one db-suite
   failure" above.
5. **`docs/ARCHITECTURE.md` pin drift (R8)** — `:171`, `:183`, `:207`, `:445` still say
   "chatTurn → chatTurn_v19, claraWork → claraWork_v3". Per `AGENTS.md` rule 4 a blueprint edit
   belongs to a wayfinder session, so it is recorded here and handed to the orchestrator rather
   than edited inside a lane. Unchanged by this ticket; repeated from #985's report because it is
   still true.

## Anything unverified

* **Hosted.** Nothing hosted: no deploy, no hosted read, no `--lock-deployed` (correctly — §2.4:
  locking belongs to the release ceremony, after the image is live). The **deploy order 0320
  introduces is the thing to carry into the runbook**: on the chat lane a missing function is a
  typed refusal and the turn survives, so this tool degrades to an internal fault rather than
  killing a turn — but the figures simply stop being available, which is not a state to ship.
* **The two-build cutover drill (§4.4)** is the integrator's, on a fresh cluster, and was not run
  here.
* **The from-scratch chain proof** is the integrator's. What I can say is that only `0232` and
  `0320` define `clara.get_client_financial_pack` anywhere in the migration tree (grepped), so the
  pre-image `0320`'s prestate pins is the one a from-scratch chain produces.
* **The partial-birth branches** of the prestate (one of the two new functions present without the
  other) are guards and were not driven; both real modes (FIRST APPLY, REDO) were.
* **`claraWork` and `statementFacts`** are other tickets' and other lanes'; this report speaks only
  for `chatTurn_v22` and migration `0320` at this HEAD.
* **The Windows-only reds** named in RIG.md are reported as such, never "fixed" (see the
  whole-suite line).
* **A mid-task status request** did not arrive; if one had, work-order rule (j) says it is the
  orchestrator's to answer and this line would name it.
