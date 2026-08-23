# F-A6 — law-28 adversarial pass on design v2 (native cross-model substitute)

> Run 2026-08-23 against `freeform-read-design.md` v2, both annexes, the survey and the PR-0 gate record, re-derived
> at the bytes: migrations `0001`-`0102`, `packages/db/deploy/acl-baseline.sql`,
> `packages/db/tests/wave-a-grants.test.mjs`, `packages/runtime/lib/{pools,control}.mjs`. Codex refused the prompt
> under its cyber-content filter; this is the fresh-context native substitute (the obligation is the PASS, not the
> vendor). Read-only. Postgres behaviour I could not read in this repo is written as a **PREDICTION** for the rig
> replay, in the design's own idiom.

**Headline.** The *statement*-shaped walls hold. I could not construct a payload that runs a second statement, writes through
a grant, or leaves the firm. Every escape I found leaves through the **function** door — and that door was left open by an
acceptance whose stated ground is the exact sentence F-A6 falsifies: `acl-baseline.sql:7-12` accepts the `pg_notify /
pg_advisory_* / pg_sleep / query_to_xml` residual as low-severity because *"the sanctioned agent surface is curated typed
reads, not raw SQL."* F-A6 **is** raw SQL. That one line is the review.

## VERDICT: BUILDABLE WITH THE LISTED WALLS

**Blockers: B-1, B-2, B-3.** H-1 and H-2 are each one migration column or one function body from being blockers; they are HIGH
only because a named runtime belt exists for each. Do not ship either on the belt alone — both belts are runtime discipline
standing in for a wall the design calls structural.

## BLOCKERS

### B-1 · The pg_catalog residual was accepted on a premise this feature deletes

Defeats §3.2 (*"the payload's function surface is part of the wall"*), Annex A.2's census, §5 (i)/(v).

`acl-baseline.sql:7-12` — the deployment ACL ceremony — states in its own header that it *"CANNOT close the pg_catalog
residual (pg_notify / pg_advisory_\* / pg_sleep / query_to_xml are superuser-owned — a non-superuser REVOKE there only prints
'no privileges could be revoked')"*, and that this is *"an ACCEPTED, documented gap on managed Supabase, with low practical
severity today (**the sanctioned agent surface is curated typed reads, not raw SQL**)"*. The superuser close is the commented
block at `:129-145`. Two compounding facts:

1. The baseline confines exactly five roles — `clara_agent_ro`, `clara_wake_interactive`, `clara_wake_proactive`,
   `clara_agent_read_login`, `clara_wake_write_login` (`acl-baseline.sql:41, 47, 67, 151` — four hand-maintained copies of one
   array). Neither new role is in any of them, and the file's fail-closed existence check (`:44-60`) only checks the roles it
   is told about, so the omission passes green.
2. Same omission one layer down. `0002:154-172` revokes `usage on schema public` and all privileges on `net`, `extensions`,
   `graphile_worker`, `workflow`, `vault`, `cron` from the three legacy agent roles; `0002:140` states the purpose exactly —
   *"so they cannot even NAME a surface like `net.http_post`."* The new roles inherit none of it. And `0002:142-147` concedes
   the direct revoke is partial: *"privileges are ADDITIVE … a DIRECT revoke here does NOT remove USAGE still held via a
   PUBLIC grant on `public`."*

**Payload class:** anything reachable in `pg_catalog`, `public`, `extensions`, `vault`, `net` on the live project — none
enumerated, none measured. On Supabase that is not a hypothetical schema list. **Wall:** (a) PR-1 adds both roles to `0002`'s
confinement idiom in its own migration and to all four `confined` arrays in `acl-baseline.sql`, so the VERIFY block
(`:148-176`) covers them; (b) where `:129-145` cannot run on managed Supabase, the residual is **re-accepted by the owner in
writing against THIS surface** — it may not be inherited silently, because its justifying sentence is no longer true. An owner
item, not a build call.

### B-2 · `query_to_xml` is a second execution engine, past the cursor, the census and the caps

Defeats §3.3 (all four walls and the plan census), Annex D.1 B2/B4/B5, Annex C's `relations_read` / `row_count`.
`query_to_xml(text,boolean,boolean,text)` is PUBLIC-executable and named as an unclosable residual by the repo itself
(`acl-baseline.sql:8, 143`). It takes a SQL string and runs it through SPI, inside the payload, *after* every wall §3.3
builds:

```sql
select query_to_xml('select * from clara.journal_lines', true, true, '')
```

One statement; opens as a cursor cleanly; its plan names **no relation**, so B2 sees nothing and `relations_read` is empty or
NULL; the whole relation materialises into **one row** before the row cap or the byte accumulator gets a look. RLS still holds
(SPI runs as the invoker — no firm or client escape, *holds* §5), but the receipt records `row_count = 1` and a relation list
that does not describe the read. **Law-28 (vii), "make the receipt lie", is answered YES again — by a route GB-1's fold does
not touch.** Siblings: `table_to_xml`, `query_to_xmlschema`, `cursor_to_xml`.

**Wall.** B-1's ACL close is the only complete one. Partial mechanical wall, worth having anyway: promote the plan census from
a **relation** census to a **relation + function** census — walk the EXPLAIN JSON for `Function Name` nodes and the funcids in
`Output`/`Filter`, refusing anything outside A.2, with its own token `function_not_enumerated` beside B2. Sell it as partial:
it catches `query_to_xml` and `pg_settings` (H-3), not a scalar function in a target list.

### B-3 · `cross_client_unavailable` has no producer — D-22's "honest half" cannot fire

A ruling collision; resolvable by the lead without code. Defeats §3.5 Tier A, §3.8 row 3, Annex D.3, cells F.1 and F.5 — and
orchestrator ruling **R-L17** (gate record §6 item 1), which requires that *"v1's `cross_client_unavailable` refusal must NAME
the deferred action and the battery cell forcing that naming stays."*

With ONE verb (D-19), no `p_scope` (D-21) and the pin compiled by the planner (§3.4), **nothing in the design detects a
cross-client comparison.** A client-pinned session asking to compare two clients is not refused: the RLS pin silently filters
the sibling's rows and the model receives a single-client answer to a two-client question. Under TA-P10 C′ that answer may
then be cited as a reasoning input, with the query text attached and nothing recording that the result was narrowed. That is
*worse* than the refusal D-22 promised — it is the "second narrowing" D-22 says it avoids — and it inverts hard constraint 1.
It is also the GM-3 class again: a cell whose only fixture is a mechanism that does not exist.

**Wall — pick one, in PR-1.** (a) *Structural, cheapest:* delete the token from Tier A / D.3 / F.1 / F.5 and make the tool
result state the compiled scope in the **model-facing** payload (`scope`, `client_scope`), so a narrowed answer can never read
as a complete one. No string check, no new verb. (b) *Literal to TA-P9 A(2):* move the refusal to the runtime tool layer,
where a `client` argument differing from `ToolCtx.clientId` is refusable without parsing SQL. Do not ship a token with no
producer — PR-4 would publish a zero population and law 31 would bank a wall that was never asked when the truth is it can
never be asked.

## HIGH

### H-1 · The wake secret is readable by the payload and leaves in the result rows

Defeats §3.2 (which weighs `set_config` **writes** and never `current_setting` **reads**), OQ-D / R-5's egress posture, and
hard constraint 4. `pools.mjs:350` binds the live wake-credential secret txn-locally — `select set_config('clara.wake_secret', $1, true)` — and
the comment at `:348-349` names the threat model it was built for: *"the secret never enters the SQL text (no logging
surface)"*. That threat was **logging**. F-A6 puts a hostile reader inside the same transaction, and the secret must stay
bound for the whole read because `wake_firm()` / `wake_context()` read it on every policy evaluation (`0011:1117`, `:1139`).

```sql
select current_setting('clara.wake_secret')                     -- direct
select name, setting from pg_settings where name like 'clara.%' -- enumerates the arm state too
```

It returns as ordinary result data → the model's context → the LLM provider and the durable `chat_messages` / `tool_call`
transcript. Row cap, byte cap and oracle discipline all pass it: one row, one column. **PREDICTION:** a custom placeholder GUC
set with `set_config(…, true)` is readable via `current_setting` and listed in `pg_settings` for a non-superuser on the pinned
PG 17 image.

**Wall.** `_freeform_arm` resolves `wake_context()` **once**, writes `firm_id` and the compiled pin onto the armed receipt
row, then clears the secret (`perform set_config('clara.wake_secret','',true)`) before the verb opens the cursor; the Annex B
arms read firm and pin from that row (H-2's wall, shared). This swaps `wake_firm()` / `shares_my_firm_wake()` out of A.2 for
freeform-specific readers — a membership change, not a shape change. **Firm and pin must move together** (*holds* §5).

### H-2 · The arm state is a GUC, so the "structural" receipt claim is forgeable

Defeats Annex B's central claim — *"every enumerated relation returns zero rows in any transaction that has not armed a
receipt, whatever statement is issued, by whatever code path, **through the verb or not**"* — and §3.4 / D-5.

`_freeform_admitted()` is specified twice, differently: §3.4 says "this transaction holds an armed receipt whose scope
matches"; Annex B says it "reads a txn-local GUC set by `_freeform_arm` and verifies that the transaction holds a matching
receipt row". Neither says how the row is identified — a builder resolves that cheaply, GUC-only, which is the GB-4 failure
class verbatim. R-9 / P-19 then concede the payload can promote the GUC out of the transaction:

```sql
select set_config('clara.freeform_arm', current_setting('clara.freeform_arm'), false)
```

**Mitigation, measured accurately:** `checkout()` runs `reset all` on release (`pools.mjs:211`, header `:18-21`) and destroys
the connection on any connection-level failure, so the *pooled-reuse* path is already closed — better than R-9 implies. What
is **not** closed is the claim: any freeform-role session opened outside `withFreeformRead` (a psql ceremony, the DR drill, a
second consumer, a second transaction in one checkout) reads on a forged capability, and because **no receipt row exists the
deferred must-settle trigger never fires** — law-28 (vi) answered YES for that path.

**Wall.** Add `arm_txid bigint not null` (arm phase, arm-phase-immutable under `_tf_freeform_settle_once`) and define:

```sql
exists (select 1 from clara.freeform_read_log
         where id = nullif(current_setting('clara.freeform_arm', true),'')::bigint
           and arm_txid = txid_current() and settled_at is null)
```

A stale GUC admits nothing; a GUC aimed at another row admits nothing; the pool reset becomes a belt. Source firm and pin from
the same row (H-1) so all three facts come from one trigger-protected place.

### H-3 · The plan census cannot see catalog reads that go through functions

Defeats §3.3's *justification* for the census — *"the census's non-vacuous reach is exactly what no GRANT can withhold …
`pg_proc.prosrc` carries every wall's own source … That class alone justifies it — nothing else refuses `select prosrc from
pg_proc`"* — plus D.1 B2, `relations_read`, and F.6(b), named as "the ONLY non-vacuous B2 cell". The census refuses `select
prosrc from pg_proc`; it does not refuse the same read spelled through a function, because a `Result` node names no relation
and a `Function Scan` carries `Function Name`, not `Relation Name`:

```sql
select pg_get_functiondef(to_regprocedure('clara._freeform_admitted()'))
select pg_get_viewdef('clara.some_view'::regclass), pg_get_constraintdef(oid_literal)
select * from pg_settings where name like 'clara.%'      -- Function Scan on pg_show_all_settings
```

F.6(b) stays green while the class it stands for walks around it — and `pg_settings` is H-1's second delivery route.
**PREDICTION (folds into P-11):** `explain (format json)` emits `Function Name` and no `Relation Name` for a Function Scan,
and no relation at all for a scalar-function target list.

**Wall.** The honest one: re-state R-2 a third time — the census is defence-in-depth over relation scans, catalog and DDL are
**readable** by the payload, and the confidentiality claim moves onto B-1's ACL close and H-1's secret clearing. If a
mechanical wall is wanted, take B-2's function census and accept that it is partial.

### H-4 · The read deadline is unenforceable inside a single FETCH

Defeats §3.3 wall 4 and §3.2's deliberate move off `statement_timeout` onto *"a plpgsql clock check in the fetch loop"*;
hollows F.11's timeout twin. The clock check runs **between** fetches. `pg_sleep` is PUBLIC-executable and unclosable
(`acl-baseline.sql:8, 142`).

```sql
select pg_sleep(3600)                     -- one fetch; the loop never regains control
select pg_sleep(0.05) from generate_series(1,10000000)
 where set_config('statement_timeout','0',false) is not null   -- fetch 1 disarms every later fetch
```

The first holds one of the freeform pool's **two** slots (Annex E.1) for an hour. The second is P-19's own prediction turned
into a payload. F.11's twin ("the same slow query with `statement_timeout` set to 0 still refuses") passes on a slow
*multi-row* query and never touches the single-fetch case.

**Wall.** The verb re-applies `set_config('statement_timeout', <remaining ms>, true)` **immediately before every FETCH** — a
`SET LOCAL` from the verb overrides the payload's session-level set — and keeps the plpgsql clock as the accumulating total.
Both, not either; same for `lock_timeout`. Force it with a payload that is a single `pg_sleep` longer than the cap.

### H-5 · Session-level advisory locks let the payload block the firm's writer lanes

Defeats §5 category (v) and Annex E.1's "no write-quiesce needed" posture — a self-inflicted write outage, not a migration
one. `pg_advisory_lock` and friends are PUBLIC-executable and unclosable (`acl-baseline.sql:134-141`, all commented out), and
the estate's writers take **well-known keys derived from the firm id**: `pg_advisory_xact_lock(203005001,
hashtext(p_firm::text))` at `0007:1637, 1661, 1683, 1698, 1761` and `0009:590, 619, 650, 2208`; `203005002` at `0007:2534`;
`202991617` at `0006:952`. The firm uuid is readable from the enumerated `firms` relation (A.1, arm S-4), so the key is not a
secret.

```sql
select pg_advisory_lock(203005001, hashtext('<own firm uuid>'))
```

`pg_advisory_lock` is **session**-scoped, and — the sharp part — `reset all` (`pools.mjs:211`) does **not** release advisory
locks, drop temp state or close held cursors; only `DISCARD ALL` or session end does. So the lock outlives the checkout and
blocks that firm's document-intake writers until the backend is recycled.

**Wall.** B-1's ACL close is the only real one. Cheap belt: the freeform pool releases with **`DISCARD ALL`**, not `reset all`
— a genuine strengthening of R-9 that "resets session state on release" does not currently reach. Cell: a payload takes a
session advisory lock; the next checkout finds it gone.

## MEDIUM

**M-1 · `pg_notify` amplification.** PUBLIC-executable (`acl-baseline.sql:133`, commented). *Holds:* both channels carry an
**empty** payload by design — `0005:489` (`perform pg_notify('clara_events','')  -- EMPTY payload (N1)`), `0006:856, 887` —
and every consumer is poll-backed (`control.mjs:2-4`), so a forged notify is a nudge, never control-plane injection.
*Remains:* distinct payloads are not collapsed within a transaction, so a payload queues one notification per fetched row
(bounded by the row cap) — and via B-2, millions inside one outer row. The queue is database-global; filling it fails every
COMMIT that queues a notification, i.e. the posting lane. **Wall:** B-1/B-2 + a cell bounding what a refused read can queue.

**M-2 · Both new roles sit outside every confinement roster, and no census looks.** Annex E.2's C1 (role count), C4 (login
shells), C5 (`appRoles`), C7 (wiki gate), C11 (`ALLOWED` keys) — none asserts a **schema** privilege, database TEMP, or
`rolbypassrls`; `0002:82-87` only re-normalises `nosuperuser nobypassrls` under a superuser deploy. **Wall — new census C12:**
for both new roles, `has_schema_privilege` false for `public`/`net`/`extensions`/`vault`/`cron`/`graphile_worker`/ `workflow`;
`has_database_privilege(…,'TEMP')` false; `rolsuper`/`rolbypassrls` false — from the catalog, both directions, in the derived
cell C1 already uses.

**M-3 · The EXECUTE census is schema-scoped to `clara`.** Annex A.2 asserts `has_function_privilege('clara_freeform_ro',
oid,'EXECUTE')` true for exactly seven *"and false for every other function in `clara`"*; the standing instrument has the same
scope (`wave-a-grants.test.mjs:63-70`, `where n.nspname='clara'` — correctly ARM-0'd on `aclexplode`, not a NULL-`proacl`
`exists()`). `pg_catalog`, `public`, `extensions`, `vault`, `net` go unmeasured. The blanket `revoke execute on all functions
in schema clara from public` tail also stops after `0011:4012` (`0038:8056-8064` is a dynamic loop; later migrations revoke
per function), so even clara-internal coverage rests on the catalog census, not on source. **Wall:** make it cluster-wide over
every schema the role holds USAGE on, and a hard CI gate — under F-A6 this is a security wall, not hygiene.

**M-4 · SECURITY INVOKER verbs are outside T18.** T18 (`rig-meta.mjs:1062-1074`) asserts every SECURITY **DEFINER** pins
`search_path`; `wake_freeform_read` is INVOKER (§3.2) and uncovered, and F.3(k) already fires `set_config('search_path', …,
false)` at it. No object is plantable today (`0002:178`; no CREATE reaches the payload), so this is a belt not a live hole.
**Wall:** pin `search_path` on the verb; widen T18's cell to "every function F-A6 creates, DEFINER or INVOKER".

**M-5 · The forgery abort rests on an unstated body invariant.** §3.2's argument — payload settles first, verb settles second,
`CLR10` matches no Tier-C pair, transaction dies — holds **only while every exit of the verb settles**: every Tier-B refusal,
every Tier-C conversion, every cap path. Nothing states it and F.3(i) exercises the happy path only. **Wall:** state it beside
R-3 as a body invariant; add one cell per Tier-C pair proving the abort when the payload settled first.

## LOW — recorded so nobody re-raises them

**L-1 · Statistics and error-based inference are closed by Postgres, not by this design.** `pg_stats` filters on
`has_column_privilege` **and** excludes rows where `row_security_active()` is true, so the 35 RLS-forced relations leak no MCV
histograms; and RLS quals are security quals, so a non-leakproof user qual (1/0, a cast error) evaluates *after* the policy
— error-based extraction cannot reach out-of-scope rows, and the payload cannot introduce a leakproof-marked leaker because it
cannot create functions. Both are Postgres behaviour, so both belong in Annex I as **predictions**, never assumptions.

**L-2 · Brief item (6) is moot, and would have been harmless.** Given B-3 the message never fires; and a firm-mate already
reads the firm's whole `clients` roster in HOME chat (A.1's S-1c arm), so naming the deferred action reveals nothing the asker
cannot read.

## What the design gets RIGHT that an attacker cannot beat

1. **Every policy in the estate is role-pinned.** I parsed all **177** `create policy` statements in `0001`-`0102`
   (paren-aware, to the terminating semicolon): **zero** lack a `TO` clause, the `0002:482-493` FORCE-RLS loop included (owner
   policy `:491` → `clara_fn_owner`). A `TO`-less policy applies to PUBLIC and would have OR'd straight past
   `_freeform_admitted()`. It was the first thing I looked for and it is not there — F6/D-1 and P-6's "purely additive" claim
   are sound.
2. **The classic escape extensions are absent from the schema chain.** No `dblink`, `postgres_fdw`, `file_fdw`,
   `pg_stat_statements`, `http` or `pg_net` is created anywhere in `0001`-`0102`; no `COPY` is reachable. The residual is what
   a managed platform installs *outside* the chain — B-1/M-2's point.
3. **Neither roles nor owners bypass RLS.** `0002:73` creates NOSUPERUSER NOBYPASSRLS, `:86` re-normalises under a superuser
   deploy, `:490` FORCEs RLS on every governed table.
4. **`OPEN … FOR EXECUTE` + the derived-table wrap is a real structural single-statement wall, and D-18's inversion is the
   right order.** No stacked-statement escape got through it. Every escape above goes through a *function* — a different door,
   and exactly why B-1, not §3.3, is the blocker.
5. **The firm conjunct is fail-closed under the one GUC the payload can reach.** Clearing or corrupting `clara.wake_secret`
   makes `wake_firm()` NULL, and `firm_id = NULL` is not true — zero rows, not a wider read; invariant (c) survives.
   **Corollary for H-1:** firm and pin must move together onto the armed row — split into separately-settable GUCs, this
   property becomes a client-scope escape.
6. **GB-1's one-arm/one-settle fold is sound as far as it goes** (subject to M-5): no read id, the payload's call is first and
   the verb's second, no `CLR*` is in Tier C's pair set — a forged receipt only exists in a transaction that dies. B-2 is a
   different route, not a failure of this one.
7. **The NOTIFY surface carries no payload** (`0005:489`, `0006:856,887`, `control.mjs:2-4`) — a credit the design never
   claims and should, next to R-9.
8. **The estate reading checks out at the bytes** everywhere I re-derived it: `0002:308-315`'s all-nullable receipt,
   `:482-493`'s FORCE loop, `:517-520`'s bookkeeper floor, `:536`'s `clara_authenticated` grant that omits the receipt table
   (GM-5 is real), `:542`'s runtime INSERT grant. The gate's re-derivation was honest work.

## §5's seven questions, as the design stands today

| # | question | as designed | with the listed walls |
|---|---|---|---|
| (i) | leave the enumerated relations | **YES** — B-2, H-3 | no |
| (ii) | leave the client scope | no | no |
| (iii) | leave the firm | no | no |
| (iv) | run more than one statement | **YES via SPI** — B-2 | no |
| (v) | write anything | no DML; **YES side-effects** — H-5, M-1 | no |
| (vi) | read without leaving a receipt | **YES off the pool path** — H-2 | no |
| (vii) | make the receipt lie | **YES** — B-2 | no |

One the brief did not ask and the design should own: **can the payload exfiltrate a credential?** Today **YES** — H-1.
