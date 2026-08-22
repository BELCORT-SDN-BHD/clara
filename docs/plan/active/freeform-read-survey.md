# F-A6 — the audited freeform read: the ESTATE SURVEY

> **Companion to `freeform-read-design.md` (v2, 2026-08-22 — gate 2 folded (record:
> `freeform-read-gate-record.md`)).** The estate as-found for Wave-F Track-A item **F-A6**
> (`docs/plan/active/wave-f-contract.md` §F-A6, **lines 228-260** — the live block including the
> `[TA-2026-08-22]` amendment; v1's `100-106` was pre-amendment and landed in §F-A3), read at the
> bytes on **2026-08-22** against `main` at `cfa0710`. **The cite batch below was re-derived at the
> PR-0 gate (GM-6); where a line number moved, the trued one is in place.** Binding rulings: the 2026-08-22 Track-A sitting
> (**TA-P9 A** the read boundary · **TA-P4 A** receipts · **TA-P10 C′** the aggregate's identity ·
> **TA-P1 C** the open register and its sibling-verb rider · TA-P3 A egress · TA-P13 A metering ·
> TA-P14 A done-means-walkable). Digest laws in force here: **2** (four structural invariants) ·
> **3** (lane-split by GRANT) · **28** (cross-model adversarial review of an injection surface) ·
> **31** (a wall never asked is not a wall) · **34** (an exemption allowlist is enumerated and
> printed) · **36** (fail-closed-on-unknown) · **55/56** (the data doctrine) · **68** (ARM-0) ·
> **71-76** (the Agentic Charter).
>
> **Method, stated once.** Everything below read from migration *source* is a **PREDICTION about
> the live catalog**, never a fact — three classes defeat source reading in this estate and all
> three bit this survey: **dynamic grants** (`0038:8056-8064` revokes six functions through
> `execute format(...)`, invisible to a text census), **`create or replace` ACL inheritance**, and
> **role-level settings that apply only at LOGIN**. Line numbers come from the instrument that
> printed them (`sed -n` / `grep -n` over the working tree at `cfa0710`). Every unsettleable claim
> is carried as a numbered **PREDICTION** in §5 for the PR-0 rig replay to confirm or kill.

---

## 1 · What is promised, and what is already built

`ARCHITECTURE.md:87-90` (§3.2) is the promise, in two layers: the agent role holds *"no EXECUTE on
any volatile/SECURITY-DEFINER writer — only EXECUTE on the STABLE typed read functions + RLS-scoped
SELECT"*, and *"Where a genuinely freeform read is needed, it runs on the read-only role, is
parameterised, and is **audit-logged** (query text + actor + purpose)"*. `ARCHITECTURE.md:143`
lists it in the tool catalog as *"the audited read-only freeform tool"*. The contract repeats it
and adds the obligation: *"Judgement-logic ladder + cross-model adversarial pass (law 28 applies —
it is an injection-surface design)"* (`wave-f-contract.md:228-260`, the live §F-A6 block).

**What exists today is the RECEIPT TABLE AND NOTHING ELSE.** `clara.freeform_read_log` has stood
since `0002_foundation.sql:308-315` with a live INSERT grant (`0002:542`) and an RLS insert policy
(`0002:525-526`) — and no writer, no reader, and (predicted) no rows. One hundred migrations of
accumulated grants stand in for the design that was never made; F-A6 is that deferred decision, and
TA-P9 A is the owner's ruling on what it must be.

---

## 2 · The seven findings that bind the design

**F1 — the receipt table is a shape that cannot carry the ruling.** Every column except `at` is
NULLABLE — `firm_id`, `credential_id`, `query_text`, `purpose` (`0002:308-315`) — and there is no
`client_id`, no acting actor, no `on_behalf_of`, no `via_wake_kind`, no task/turn binding, no
outcome, no row count, no relation list, no duration. TA-P4 A requires `firm_id` / `query_text` /
`purpose` NOT NULL and the who/why/from-where **mechanically bound to the triggering chat turn**;
none of that is expressible in the shipped shape. The table is also the only governed table in the
estate whose sole DML grant is a bare `insert … to clara_runtime` with `with check (true)`
(`0002:522-526,542`) — a runtime bug could write a row for another firm and nothing would catch it.

**F2 — nobody can read the receipt.** `freeform_read_log` is RLS-enabled and FORCED in the `0002`
loop (`0002:482-493`) and carries exactly two policies: the constant-true owner policy that loop
mints (`0002:491`), and the runtime INSERT policy (`0002:525-526`). There is **no human read policy
at all** — and, the gate's GM-5, **no table `GRANT SELECT` either**: `0002:536`'s
`clara_authenticated` grant covers users / firms / firm_memberships / audit_log only. Compare
`audit_log`, which has the bookkeeper+ floor (`0002:517-520`) **and** that grant, and *still* has no
dashboard surface (`apps/dashboard/app/` has no audit route). TA-P4 A's "the receipt must be humanly
readable" is a build of BOTH halves, not a re-grant — a policy without the grant is dead code.

**F3 — `clara_agent_ro`'s accumulated read surface is BOTH too wide in kind and too narrow in
coverage.** Measured: **30 tables of the 202** the migrations create — `0002:534-539` (users, firms,
firm_memberships) · `0003:522-525` (clients, coa_accounts, documents, client_resolutions,
journal_entries, journal_lines, fixed_assets, notifications) · `0005:406-408` (the taxonomy four +
domain_events) · the `0007` grant beside `0007:779-790` (document_filings, document_extractions,
document_regions) · the `0009` grant beside `0009:1117-1126` (counterparties, entry_evidence) · the
`0059:12` loop (nine metric-catalog tables). The audit's GAP5-5 is real, but its shape is not
"almost everything": **open_items · open_item_allocations · the whole bank estate · fiscal_years ·
close_runs · period_snapshots · fa_depreciation · staff_advances · open_questions ·
journal_entry_revisions · coding_tasks · client_facts** are all UNREADABLE by the agent role today.
Option B ("inherit the accumulated grants") therefore fails in both directions at once: every one
of the 30 was reviewed as *"a named typed function may read this table"*, never as *"a model may
compose arbitrary SQL over it"* — and the surface still cannot answer *"what does this client
owe?"*.

**F4 — the isolation those grants give is FIRM-only, and the estate already knows the fix.** Every
agent read policy in the estate is `firm_id = clara.wake_firm()` — the `0003:515` loop,
`0007:782-790`, `0009:1120-1126`, `0017:1441`, `0059:12`. Client scope is enforced **in application
code**: the chat toolface threads a `clientId` into each typed call (`chatTurn.impl.ts:63-117`;
`chatTurn.v10.infra.ts:40`, `ToolCtx = { firmId, clientId: string | null, … }`), and the DB's own
client-pin collapse lives in **`clara._agent_read_admitted(text,uuid)`** (`0011:3921-3941`) — *"if
w.client_id is not null and (p_client is null or p_client is distinct from w.client_id) then return
false"*. A bare SELECT has no `p_client` to pass, so **that collapse cannot reach it**. The same
function proves the wake-allowlist gap the agenda named: `interactive` and `proactive` SKIP
`assert_wake_allowed` outright (**`0011:3931-3932`** — `:3927-3929` is the credential-null CLR03
arm, and the mis-cite was repeated at design D-9 and P-9 until the gate trued it), and the
allowlist is keyed on `function_name`
(`0002:247-251`) — **structurally unable to see a bare SELECT**.

**F5 — the wake credential cannot carry a client pin on an interactive session, and F-A2 is already
fixing exactly that.** `ck_wake_credentials_client_0011` (`0011:625-628`) is a closed enumeration —
`autodraft` ⇒ client NOT NULL, `interactive`/`proactive` ⇒ client NULL — and `mint_wake_credential`
refuses twice over: the early kind gate (`0011:1164`) and the per-kind arm *"legacy wake kinds
do not accept a client binding"* (`0011:1181-1186`). F-A2's **D34** ships `interactive_client`
(client NOT NULL, `on_behalf_of` kept) with BOTH CHECKs and BOTH mint gates extended
(`f-a2-annexes-3-record.md`, D20/D34). **TA-P9 A's "a client-bound session compiles the client scope
server-side" has no carrier until that lands** — and R-1's narrowing ("minted for
`wake_open_question` ALONE") is the clause F-A6 must amend or route around (design §8, OQ-A).

**F6 — the executing principal decides everything, and two of the three candidates are
catastrophic.** `clara_runtime` holds SELECT on the wiki / onboarding / lint cohort under policies
written **`using (true)`** (`0017:1443-1446`) — i.e. **cross-FIRM visibility**; arbitrary SQL as
`clara_runtime` would breach invariant (c) on its first query. `clara_fn_owner` (every SECURITY
DEFINER's owner) sees everything through the constant-true owner policies (`0002:491`, `0003:513`).
And `clara_agent_ro` is disqualified for a subtler reason that turns out to be load-bearing: RLS
policies are **permissive and OR together per role**, so a receipt-gated policy added *for
`clara_agent_ro`* would simply be OR'd with the existing `p_*_agent` policies and bypassed.
**TA-P9 A's "a new role, not `clara_agent_ro`'s accumulated grants" is not hygiene — it is the
mechanism.**

**F7 — the read pool cannot write the receipt, and `0002` anticipated the role that can.** The read
pool issues `set default_transaction_read_only = on` at session level on EVERY checkout
(`pools.mjs:136-142`, `setupSql`), and `withReadWakeScoped` runs the whole read inside that
transaction and ROLLBACKs it (`pools.mjs:337-357`). TA-P4 A's "read and receipt in ONE transaction"
is therefore **impossible on the existing read pool** — a receipt INSERT there raises 25006.
`0002:91-95` says so in its own words and names the successor: the session belt *"applies only at
LOGIN, NOT under SET ROLE — so it is NOT the guarantee; the GRANTS are the wall … **Kept for the
eventual dedicated freeform-read LOGIN role**."* F-A6 is that role.

---

## 3 · Surface by surface

### 3.1 The receipt table (`clara.freeform_read_log`)

```
0002:308-315   id bigint identity pk · firm_id uuid · credential_id uuid · query_text text
               · purpose text · at timestamptz not null default now()      -- all nullable
0002:482-493   RLS enable + FORCE loop; p_freeform_read_log_owner minted at :491 (constant true)
0002:525-526   p_freeform_read_log_runtime  for insert to clara_runtime  with check (true)
0002:542       grant insert on clara.freeform_read_log to clara_runtime
```

No append-only trigger (contrast `audit_log`, whose UPDATE/DELETE/TRUNCATE walls are minted in
`0003`), no index, no FK, no CHECK. `audit_log`'s own outcome domain is **closed to one value** —
`check (outcome in ('ok'))` (`0002:285`), with the header stating it records *"COMMITTED SUCCESSES
only"* — so a refusal receipt has no home in the audit spine and needs its own column domain here.

### 3.2 Roles, logins and pools

`0002:65-88` mints six NOLOGIN group roles (`clara_fn_owner`, `clara_authenticated`,
`clara_agent_ro`, `clara_wake_interactive`, `clara_wake_proactive`, `clara_runtime`);
`0006:59-79` adds the two LOGIN shells (`clara_runtime_login` → `clara_runtime`,
`clara_agent_read_login` → `clara_agent_ro`, each `with inherit false, set true`, *"a member of
EXACTLY ONE group role and nothing else (S4-C3 — rig-asserted)"*); `0009:49-58` adds
`clara_wake_write_login` → `clara_wake_interactive`. `pools.mjs:1-40` states the three-login
contract and the budget: *"5 runtime + 5 read + 2 write + 5 engine + 2 dedicated LISTEN clients =
the §4.1 budget of 19 against the Supavisor session ceiling"*. `assertProductionPoolConfig`
(`pools.mjs:100-110`) fails closed on a missing DSN for exactly `["runtime","read","write"]`.

### 3.3 The function EXECUTE surface the agent role holds

Ten grant statements name `clara_agent_ro`; their union is the real "typed read surface":
`wake_firm()` · `wake_client()` (`0011:1203-1211`) · `shares_my_firm_wake(uuid)` ·
`current_actor_id()` · `actor_firm_id()` (`0004:760-763`) · `_agent_read_admitted(text,uuid)`
(`0011:3940-3941`) · `get_journal_entry(uuid)` · `list_journal_entries(uuid,int)` ·
`trial_balance(uuid)` (`0004:764-766`) · `get_context_pack(uuid,text)` (`0005`, re-granted `0011`) ·
`list_unassigned_documents(int)` · `get_document_extract(uuid,uuid,int)` · `get_draft_review(uuid,
uuid)` · `list_uncoded_filings(uuid)` · `get_journal_entry_for(uuid,uuid)` (`0009:1404-1412`,
re-granted `0011`) · `coding_lane(uuid,uuid)` · `list_coding_lanes(uuid)` · `get_entry_diff(uuid,
uuid)` · `get_doc_entry_diff(uuid,uuid)` (`0011`). **This matters more than the table list**: a bare
SELECT may call any function the executing role may execute, so the enumerated surface F-A6 owes law
34 is a **relation list AND a function list**. `get_context_pack` is the estate's precedent for a
GUC-gated STABLE definer read (`rig-events-structure.test.mjs:140-145` asserts `provolatile='s'` and
no PUBLIC execute).

### 3.4 PUBLIC's implicit EXECUTE — the mechanism, and why a text census lies

`0015:3535-3546` is the estate's own honest note: *"the `alter default privileges … revoke execute …
from public` set by 0011 does NOT persist a pg_default_acl row in this environment (verified …) … a
fresh clara_fn_owner function is created proacl=NULL ⟹ PUBLIC keeps the default EXECUTE"*. The
remedy is the per-migration tail `revoke execute on all functions in schema clara from public`,
present in **twelve** migrations (`0004:753` … `0020:1813`) and **absent from every migration after
0020**. A text census of the post-0020 estate flags six `0038` readers as never revoked — and all
six are in fact revoked by a **dynamic** loop at `0038:8056-8064`. So the census is answerable only
from the catalog (P-2), and `wave-a-grants.test.mjs:63-70` is the standing instrument: *"PUBLIC has
ZERO execute on every clara function"*. `0027:626-648` carries the matching ARM-0 lesson in prose:
*"a NULL proacl … must FAIL this probe, not pass it — aclexplode(NULL) returns zero rows, so the old
exists(…) form read a publicly-executable core as owner-only"*.

### 3.5 The three RLS shapes an enumerated list must cover

Measured over the candidate relations by column presence:

| shape | population | the scoping arm a freeform policy needs |
|---|---|---|
| **S-1 firm + client** | journal_entries · journal_lines · coa_accounts · documents · document_filings · entry_evidence · counterparties · counterparty_aliases · open_items · open_item_allocations · the bank cohort · fixed_assets · fa_depreciation · staff_advances (+ applications) · open_questions · client_facts · client_identifiers · client_aliases · fiscal_years · close_runs · period_snapshots · reporting_periods · compliance_watches · journal_entry_revisions · coding_tasks · notifications · domain_events | `firm_id = <firm> and (<pin> is null or client_id = <pin>)` |
| **S-2 firm only** | document_extractions · document_regions (client reachable only by join to `document_filings`) | an EXISTS join — or exclusion |
| **S-3 global reference** | sst_threshold_schedule (no `firm_id` at all); the `0059:12` metric catalog (nullable `firm_id`) | `firm_id is null or firm_id = <firm>` |

`clients` is its own arm (`firm_id` + `id`, no `client_id` column).

### 3.6 The wake spine

`wake_context()` (`0011:1130-1154`) resolves credential_id / wake_kind / firm_id / on_behalf_of /
client_id from the txn-local `clara.wake_secret` GUC and **re-validates the OBO member's bookkeeper+
standing on every use**; `wake_firm()` / `wake_client()` (`0011:1199-1211`) are the STABLE definer
projections granted to `clara_agent_ro`. `assert_wake_allowed(text,text)` (`0004:114-121`) raises
CLR03 on a missing `(wake_kind, function_name)` row; the allowlist table has **no CHECK on
`wake_kind`** (`0002:247-251`), so a new kind's rows are data, not DDL. Seeds: `0002:553-559` (five
rows) and `0011:3903-3910` (seven more, including `('interactive','wake_open_question')`).

### 3.7 The runtime path

`pools.mjs:291-293` `withRead` → `checkout(getReadPool(), setupSql("clara_agent_ro", true), …)`;
`pools.mjs:337-357` `withReadWakeScoped` binds the secret with `set_config(…, true)` *"so the secret
never enters the SQL text (no logging surface)"* and rolls back. `chatTurn.v10.infra.ts:56-60`
`readScoped` mints an **OBO** credential per call (`mintWakeCredentialObo`, `pools.mjs:326-334`), so
the asking human already reaches the DB on every chat read — the acting-identity plumbing TA-P4's
receipt needs is present. Registry tip: `registry.ts:46`, `chatTurn: chatTurn_v12`; F-A2's PR-2
ships `chatTurn_v13` plus a new frozen `chatTurn.v10.infra` `_vN`.

### 3.8 The dashboard

`apps/dashboard/app/` has seventeen routes and **no audit or receipt surface**. The chat transcript
renders only registered part types — `apps/dashboard/app/chat/partCatalog.ts:25+`, `PART_CATALOG`
(text · attachment · tool_call · clarify · clarify_closed · je_review · …) — a closed world with a
parity + reachability gate (`partCatalog.test.tsx`): *"Adding a wire part type without registering
it here fails typecheck … adding it here without a render branch in `TranscriptParts` fails the
parity test"*. A `tool_call` part already renders its `input`, so the SQL text is visible in the
transcript with **no new part type**.

### 3.9 Metering, egress, wiki

`llm_usage_events` (`0094:53-70`) carries `document_id` and `task_id` as **NOT NULL FKs** — exactly
the two TA-P13 A makes nullable behind a call-kind discriminator; F-A6 records through that one door
once it is reshaped and mints no second ledger. Typed egress consent is **closed to one purpose**:
`check (purpose in ('wiki_synthesis'))` on all three relations, asserted by `0020:1911-1921`. The
wiki cohort is deliberately **not** granted to the agent role — `0017:1424-1426`: *"no table SELECT
grant is given to clara_agent_ro; wiki reaches the agent only through the FORK-6-gated context
pack"* — a live decision F-A6 does not reverse.

---

## 4 · The closed-world censuses that break

| # | census | file:line | what breaks | direction |
|---|---|---|---|---|
| C1 | the non-sanctioned `clara_` **role count is hard-equal 7** | `er9-gates-boundaries.test.mjs:443-458` | a new group role plus a new login make it 9 | extend — and the same cell then proves both new roles hold **zero** EXECUTE on the close verbs, free coverage |
| C2 | **T18 definer hygiene** — every SECURITY DEFINER pins `search_path` **and is owned by `clara_fn_owner`** | `rig-meta.mjs:1062-1074` | forbids the obvious "definer owned by the scope role" shape (design §3.1, D-2) | unchanged — the design conforms |
| C3 | `GOVERNED_TABLES` ×3 (RLS enabled + forced roster) | `rig-meta.mjs:925`, `rig-runtime-helpers.mjs:81`, `rig-docs-helpers.mjs:166` | any NEW table must join all three — **F-A6 adds none** (it ALTERs the existing `freeform_read_log`, already on the roster) | **UNCHANGED** (trued at the gate, GM-6) |
| C4 | login-shell audit + the "**must NOT set role** ⟨other⟩" loops | `rig-runtime-catalog.test.mjs:67-130`, `rig-runtime-helpers.mjs:268`, `rig-runtime-meta.mjs:161` | a fourth login must be added, and every existing login proven unable to set role into the new group | extend, both directions |
| C5 | the `appRoles` hand-list in the delta writer-reachability census | `delta-catalog-phase.mjs:402` | a role invented later escapes it silently | extend, and say so in the PR |
| C6 | PUBLIC-zero EXECUTE over every clara function | `wave-a-grants.test.mjs:63-70` | new functions must carry explicit revokes | unchanged |
| C7 | the wiki dynamic-SQL gate — **fail-closed on any persistent `EXECUTE` whose statement is not reconstructible from literals** | `scripts/check-wiki-dynamic-sql.mjs:1-50`; allowlist `scripts/wiki-lint-checks.mjs:101-124`, **exactly ONE entry today** | the read verb's `EXECUTE` of a parameter is unprovable by construction | a **second** enumerated entry, justified by the ACL wall (design §4.4) — law 34's idiom |
| C8 | migration `0019`'s in-transaction wiki-authority prosrc scan | `0019` tail | the verb's body names no wiki relation; the dynamic text is unknowable | unchanged — the wall moves to the GRANT |
| C9 | `PART_CATALOG` parity + reachability | `apps/dashboard/app/chat/partCatalog.ts:25+` | only if F-A6 adds a part type — it does not (§3.8) | untouched; a named non-goal |
| C10 | the zero-agent-grant tails (WCA-R1) | `0040:4947-4950` and its `0038` twin | they name `clara_agent_ro`; F-A6 grants it nothing | unchanged — a positive argument for the new role |
| C11 | the strict role→function grant-matrix cohorts, **and the `ALLOWED` ROLE-KEY map they iterate** | `rig-meta.mjs:900-916`; `ALLOWED` at `:811`, iterated `Object.keys(ALLOWED)` at `:1024` | the new verb joins a new cohort — **and a role that is not a KEY in `ALLOWED` is never probed by the exact-EXECUTE census at all**, so both new roles must be added as keys or the census silently skips them | extend, both layers (GM-6) |

---

## 5 · What the survey could NOT settle — the predictions the PR-0 rig replay must answer

- **P-1** `clara.freeform_read_log` holds **zero rows** in every live and rig database, and no code
  path writes it (a repo-wide search finds only the three `GOVERNED_TABLES` rosters). If true, the
  ALTERs in design §3.2 are free; if false, the NOT NULLs need a backfill and a story.
- **P-2** **zero** clara functions hold a PUBLIC EXECUTE, and `pg_proc.proacl is null` is empty for
  the schema — a text census cannot answer this (§3.4). `wave-a-grants.test.mjs:63-70` is the
  instrument; the replay must print the count, never just the pass.
- **P-3** the accumulated `clara_agent_ro` SELECT surface is **exactly 30 tables**, and the
  enumerated F-A6 list is a deliberate set that OVERLAPS it rather than inheriting it. Print both
  sets and their difference as the law-34 audit line.
- **P-4** `OPEN … FOR EXECUTE` of a two-statement string raises (*"cannot open multi-query plan as
  cursor"*), and a data-modifying CTE inside a cursor query is refused by Postgres itself — the
  structural single-statement wall of design §3.3. Both directions, on the pinned PG 17 image.
- **P-5** `SET ROLE` inside a SECURITY DEFINER function checks membership against the **session**
  user, not the definer — the reason the role-switch shape is refused (design §3.1, D-2). Prove it
  rather than cite it.
- **P-6** a permissive policy added `to clara_freeform_ro` cannot widen any existing role's reads
  (policies are role-pinned); a table with a GRANT but no policy for that role returns **zero rows**,
  and a table with a policy but no GRANT raises **42501**. Both walls, both directions.
- **P-7** node-pg's `client.query({ text, values: [] })` uses the extended protocol and therefore
  refuses a second statement at Parse. If false, the runtime-side execution path in design §3.3
  loses a wall and the cursor becomes the only one.
- **P-8** the Supavisor session ceiling admits the +2 connections a fourth pool costs
  (`pools.mjs:1-40` names the budget of 19 but not the ceiling).
- **P-9** `_agent_read_admitted`'s allowlist bypass for `interactive`/`proactive` (`0011:3931-3932`)
  is reachable behaviour and not dead code — i.e. an `interactive` credential really does read the
  three `0009` invoker readers without an allowlist row. The design's decision to call
  `assert_wake_allowed` **unconditionally** in the new verb depends on that being the status quo it
  is deliberately departing from.
