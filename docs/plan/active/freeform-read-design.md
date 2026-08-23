# F-A6 — the audited freeform read: DESIGN v2

> **Design doc of record for Wave-F Track-A item F-A6** (`docs/plan/active/wave-f-contract.md`
> §F-A6, lines 228-260 — the live block including the `[TA-2026-08-22]` scope amendment).
> **v2, 2026-08-22 — gate 2 folded (record: `freeform-read-gate-record.md`).** Binds under the
> **2026-08-22 Track-A sitting**:
> **TA-P9 A** (the read boundary), **TA-P4 A** (receipts), **TA-P10 C′** (a free-query aggregate is
> narrative), **TA-P1 C** (the open register — with its rider: *new authority ships as wake SIBLING
> verbs, never a rewrite of a live human body*), TA-P3 A (egress purposes), TA-P13 A (one metering
> ledger), TA-P14 A (done means the loop is walkable). Digest laws: **2 · 3 · 22 · 28 · 31 · 34 ·
> 36 · 68 · 71-76**. Every build PR takes the uniform ADR-061 ladder; **every rung of §5 is
> judgement logic** (review law 1), and **law 28's cross-model adversarial pass on the injection
> surface is a NAMED pre-merge obligation the contract itself imposes** — not a review option.
>
> **Two rulings were CONSTITUTIONAL AMENDMENTS pending the owner's digest sign-off** (TA-P1's open register;
> TA-P7's attribution-is-judgement); this design is written under them, and **that PREREQUISITE IS SATISFIED —
> 2026-08-22, the owner RATIFIED laws 78-81 + the rider R-TA-P1-walls**, so the build is unblocked on this
> axis. TA-P1 C is what makes "default-on, no per-firm signature gate" (TA-P9 A(4)) lawful here.
>
> **Companions.** `freeform-read-survey.md` — the estate at the bytes (findings **F1-F7**, censuses
> **C1-C11**, predictions **P-1..P-9**) · `freeform-read-annexes-1-mechanics.md` (**A** the
> enumerated surface · **B** the RLS arms · **C** the receipt columns · **D** the token vocabulary ·
> **E** the ops recipe **+ E.2 the censuses that move**, §4) · `freeform-read-annexes-2-record.md`
> (**F** battery · **G** decisions · **H** change log · **I** predictions · **J** the owner
> questions, risks and non-goals, §8/§9) ·
> **`freeform-read-gate-record.md` — the PR-0 gate record: what held, the four blockers and six
> materials this version folds, the width ruling, the refuted register, the owner items.** Where a
> companion and this file disagree, **this file is the design of record**, the companion the bug.
>
> **Method inherited from F-A2:** an unsettleable claim is a **PREDICTION the rig replay must
> confirm**, never an assertion · **line numbers come from the instrument that prints them** (the
> gate re-derived every one — GM-6) · **a body's live tip is found by CoR lineage.**

## 1 · The ruled shape (fixed, not designable)

- **A parameterised SELECT on a structurally read-only role, with a per-read receipt** — audit
  recommendation ②, **shape fixed by ADR-0071**, re-confirmed *already ruled* at the sitting
  (F-A6-OQ-3 rejected as re-litigation; `ARCHITECTURE.md:87-90`, the contract and the `query_text`
  column all repeat it). **NOT a restricted DSL, and not an NL-to-SQL compiler with a rewriter.**
- **TA-P9 A(1)** — a **client-bound session's** free read is scoped to that client **server-side**;
  a **cross-client** read from inside a client session is a **NAMED, receipted action**, answered
  rather than refused (**v1 defers this — §3.2, D-22, dissent recorded**). **HOME chat (no client
  pin) is firm-wide by design.** Never cross-firm (invariant (c), untouched).
- **TA-P9 A(2)/(3)/(4)** — the readable surface is **ENUMERATED and printed as an audit line**
  (law 34) on a **NEW role**, never `clara_agent_ro`'s accumulated grants (survey F3/F6: the new
  role is not hygiene, it is the mechanism) · **`interactive` wake only** at first, the allowlist
  being keyed on function name and structurally unable to see a bare SELECT (survey F4) · **no
  per-asker RBAC tiering** and **no per-firm signature gate** (TA-P1 C: capabilities default-on).
- **TA-P4 A** — **read and receipt in ONE transaction; no receipt, no read.** `firm_id`,
  `query_text`, `purpose` NOT NULL; purpose/actor **mechanically bound to the triggering chat turn**
  (model text is an annotation, never the only evidence); a **bookkeeper+ human read surface** over
  the receipt table.
- **TA-P10 C′** — a free-query aggregate is **NARRATIVE**: it may be said, charted, exported under
  the watermark, and **cited as a reasoning input in a receipt (query text included)** — and it may
  **never** become an authoritative number in a durable artifact (a posting amount, a formal report
  cell, a knowledge-base fact). Those come only from TA-P2's three origins.

## 2 · The estate as-found — the seven findings that bind §3 (survey §2)

**F1** the receipt table's columns are all nullable and carry no client, actor, turn, outcome or
result shape — the ruling is not expressible in the shipped table (`0002:308-315`) · **F2** nobody
can read it: RLS forced, owner policy + a runtime INSERT policy, **no human read policy** *and no
table `GRANT SELECT`* (`0002:482-493,525-526`; `0002:536` grants `clara_authenticated` four tables
and this is not one — the gate's GM-5) · **F3** the accumulated agent surface is **30 tables of
202**, too wide in kind and too narrow in coverage, never reviewed for free SQL · **F4** isolation
is **firm-only**; the client-pin collapse (`0011:3921-3941`) takes a `p_client` argument a bare
SELECT cannot pass · **F5** an `interactive` credential **cannot carry a client pin**
(`0011:625-628`, `:1181-1186`); F-A2's `interactive_client` (D34) is the carrier and is not merged
yet · **F6** `clara_runtime` reads the wiki cohort **cross-firm** (`0017:1443-1446`),
`clara_fn_owner` sees everything, and `clara_agent_ro`'s permissive policies would **OR past** any
receipt gate — all three disqualified as the executing principal · **F7** the read pool's
transactions are **read-only at session level** (`pools.mjs:136-142`), so the receipt cannot be
written there; `0002:91-95` names the successor: *"the eventual dedicated freeform-read LOGIN
role."*

## 3 · The design

### 3.1 The principals — one new group role, one new login (D-1)

```
clara_freeform_ro       NOLOGIN group. SELECT on the ENUMERATED relations (Annex A.1) and nothing
                        else; EXECUTE on exactly SEVEN functions (Annex A.2, re-derived in the
                        fold — D-21); ZERO DML anywhere.
clara_freeform_login    LOGIN shell, member of clara_freeform_ro ALONE (inherit false, set true) —
                        the 0006:59-79 idiom, the fourth login. NOLOGIN until the operator ceremony.
```

The freeform SQL executes **as `clara_freeform_ro`**, so the wall is the GRANT and the policy, not a
string check — `ARCHITECTURE.md:87-90`'s claim, made true for the first time. RLS policies being
role-pinned, every policy here is **purely additive** (P-6, both directions).

**Three alternatives refused, each on a byte (D-2).** *(a) Reuse `clara_agent_ro`* — its `p_*_agent`
policies are permissive and would OR past the receipt gate (F6), and it drags the accumulated 30 in.
*(b) A SECURITY DEFINER that executes the SQL* — as owner it runs under `clara_fn_owner`'s
constant-true policies (`0002:491`); `SET LOCAL ROLE` down checks membership against the **session**
user (P-5), so it either fails or needs the session to hold the role already — and a payload that
escapes the switch is then `clara_fn_owner` (§3.2 re-weighs this after GB-1). *(c) A definer OWNED
by the scope role* — **forbidden by T18** (`rig-meta.mjs:1062-1074`).

### 3.2 The verbs — ONE wake verb, one body, two DEFINER receipt writers (D-19, D-20)

```
verb      clara.wake_freeform_read(p_sql text, p_purpose text, p_task uuid, p_op_key text,
                                   p_row_cap int)  returns jsonb
          SECURITY INVOKER; granted to clara_freeform_ro and nothing else; allowlist rows per
          read wake kind; holds the whole ladder and opens the cursor, so the SQL runs with the
          CALLER's privileges. ONE body — there is no shared core and NO p_scope argument in v1.
arm       clara._freeform_arm(p_sql text, p_purpose text, p_task uuid, p_op_key text)
          SECURITY DEFINER owned by clara_fn_owner, search_path pinned (T18-clean); granted to
          clara_freeform_ro. INSERTs the ARMED receipt, arms the txn-local capability, refuses a
          SECOND arm in one transaction (CLR10 double_arm).
settle    clara._freeform_settle(p_outcome text, p_rows int, p_bytes bigint, p_relations text[],
                                 p_ms int, p_rung jsonb)   -- NO read id argument
          SECURITY DEFINER (same posture); the ONE permitted UPDATE, on the receipt THIS
          transaction armed. Refuses a second settle (CLR10 double_settle).
surface   clara.list_freeform_reads(p_client uuid default null, p_limit int default 100)
          SECURITY DEFINER, bookkeeper+ floor — the 0002:517-520 audit_log idiom. TA-P4 A's
          human read surface (granted to clara_authenticated ONLY).
```

**The cross-client sibling verb is SEVERED to F-A6 v2 (D-22, the width ruling).** With it go
`p_scope`, the shared core it was the only reason for, the third allowlist row and the
`cross_client` receipt arm — leaving ONE verb and ONE body, R-3's text-identity belt at its
strongest. **This is NARROWER than TA-P9 A(2) ("answered, not refused") for a client-pinned session
and is recorded as dissent, not glossed** (gate record, owner items). HOME chat is unaffected: it is
firm-wide by design, which is the cross-client answer wherever no client is pinned.

**Why `_freeform_arm` / `_freeform_settle` are GRANTED, and what buys the property a revoke would
not (D-20; gate blocker GB-1).** The 0077/0078 idiom puts the DML in an *ungranted* core; that shape
is **not buildable here** — the execution principal must be the CALLER (§3.1), so the verb is
SECURITY INVOKER, and an INVOKER body's callees are privilege-checked against the caller. The grant
is forced, so the model's composed SQL, running as that same role, **can name both writers**. The
forgery is closed structurally instead:

- `_freeform_settle` takes **no read id**. It settles the row *this transaction* armed, read from
  the txn-local arm state — there is no argument through which a payload can name another read.
- **One arm and one settle per transaction, enforced in the DEFINER bodies.** A payload calling
  either RAISES (`CLR10 double_arm` / `double_settle`) — and no `CLR*` is in Tier C's pair set, so
  it re-raises and the transaction aborts. A forged receipt therefore **cannot COMMIT**: the only
  call that would write it is the call that destroys the transaction it would have committed in,
  taking the read with it. Law 28 question (vii) is answered NO by construction, not by a grant.
- The residual is honest and named: a payload *can* make its own lawful read fail this way. That is
  a denial of the model's own read, not a lie in the audit record.
- **The alternatives are recorded, not hidden** (gate record, owner items): a DEFINER outer verb
  `SET LOCAL ROLE`-ing down would keep both writers ungranted but buys a worse failure mode (a
  payload escaping the switch runs as `clara_fn_owner`) on P-5's session-membership behaviour; the
  runtime-side path (P-7) loses text identity. **Fail-closed default: the INVOKER shape above.**

**The payload's function surface is part of the wall (D-20).** A bare SELECT may call any function
the role may execute (survey §3.3), PUBLIC-executable ones included. `set_config('role', …)` fails
(role-setting checks the SESSION user, `clara_freeform_login`, a member of `clara_freeform_ro`
alone), but `set_config('statement_timeout'|'search_path', …, false)` does not — and a non-local
`set_config` **outlives the transaction on a pooled backend**. So the read deadline is a **plpgsql
clock check in the fetch loop**, not a payload-settable GUC, and `withFreeformRead` **resets session
state on release** with a cell proving the next checkout clean (R-9, P-19).

**No live body is CoR'd.** `mint_wake_credential`, `wake_context`, `assert_wake_allowed` and
`_agent_read_admitted` are read, never rewritten — TA-P1 C's rider satisfied literally, which is
also what keeps this item off the D1 list (§6).

**The runtime's `0002:542` INSERT grant on `freeform_read_log` is REVOKED**, with its RLS insert
policy dropped, so the receipt has **exactly two writer bodies and no third** — `_freeform_arm`
(the one INSERT) and `_freeform_settle` (the one permitted UPDATE, §3.6). No role other than
`clara_fn_owner` holds INSERT or UPDATE on the table. This is the converse wall TA-P4 needs and does
not name: *no read without a receipt* is worth little if a receipt can be minted by something that
did not read.

### 3.3 The execution wall — a cursor, not a parser (D-3), and the order it runs in (D-18)

The verb composes exactly one text and **opens the cursor FIRST**:

```sql
open v_cur for execute
  format('select to_jsonb(t) from (%s) t', p_sql);   -- 1. the single-statement wall
                                                     -- 2. THEN explain, on proven-single text
                                                     -- 3. THEN fetch, batch by batch
```

**The order is a wall, and v1 had it backwards (gate blocker GB-3).** v1 ran the census
`explain (format json)` on the composed text *before* the cursor opened — and plpgsql's plain
`EXECUTE` is `SPI_execute`, which runs a multi-statement string **in full**, so F.3's own injection
payloads would have executed their stacked statements at the one step with no single-statement
guarantee. Inverted: `OPEN … FOR EXECUTE` refuses a multi-query plan at PREPARE, before any part of
the string runs (P-4, P-16); everything downstream, the EXPLAIN included, then operates on text
Postgres has certified as ONE statement. Opening the portal produces no rows and runs no volatile
function — those happen at FETCH, after the census (P-16 proves both halves).

Four walls fall out of Postgres itself, none of them a lexical filter:

1. **One statement, always.** `OPEN … FOR EXECUTE` refuses a multi-query plan; the classic
   `) t; drop …; select * from (` escape is refused at plan time, not run time (P-4).
2. **SELECT/VALUES only, and no data-modifying CTE** — a cursor query may not contain one, so no
   `INSERT`/`UPDATE`/`DELETE`/utility statement rides the parameter.
3. **The derived-table wrapping** makes any `SET`/`RESET`/`COMMIT` a syntax error rather than a
   statement — the role-escape class dies here, before the grant wall. **Its function-call twin
   does not** (`select set_config('role', …)`) — that one dies on session-user membership, §3.2.
4. **Fetch, don't slurp.** Rows are fetched in batches to the row cap; the byte ceiling and the
   **deadline are measured in the loop as they accumulate** (`clock_timestamp()`, not a payload-
   settable GUC — §3.2), so a `cross join` bomb refuses with rows already counted instead of
   returning a gigabyte.

**Plus a relation census from Postgres's own parser — a CATALOG wall, and the design says so
(D-24, GM-2).** With the cursor open, the verb runs `explain (format json)` on the certified text
and walks the plan for relation names, refusing anything outside Annex A.1. **v1 overstated its
reach.** For a relation the role holds no SELECT on, `EXPLAIN` raises `42501` at planning — no plan
to walk, so the refusal is `(42501, relation_denied)` and `relations_read` is **NULL, not empty**
(law 68). The census's non-vacuous reach is therefore exactly what no GRANT can withhold:
**PUBLIC-readable catalog relations** (`pg_proc.prosrc` carries every wall's own source; `pg_class`;
`pg_stat_statements`, if ever installed, other sessions' query text). That class alone justifies it
— nothing else refuses `select prosrc from pg_proc` — and it fills `relations_read[]` on every
plan-bearing path. Cost: one extra parse+plan per read.

**Where the statement is executed, and why it is not the runtime.** Putting the `EXECUTE` in the DB
costs a **second entry in the wiki dynamic-SQL allowlist** (§4) — the gate is fail-closed on any
persistent `EXECUTE` not reconstructible from literals, and a parameter never is. The alternative
(the runtime sends the SQL over the extended protocol, P-7) buys a protocol-level single-statement
guarantee but **loses text identity** — the receipt would name text the DB never saw. Text identity
wins, the cursor already supplies the wall, and the lint entry is paid deliberately.

### 3.4 Scope compilation — RLS, and the receipt as the capability (D-4)

**"Compiled server-side" means compiled by the planner, not by a string rewriter.** Each enumerated
relation gains ONE policy pinned to the new role:

```sql
create policy p_<t>_freeform on clara.<t> for select to clara_freeform_ro
  using (firm_id = clara.wake_firm()
         and (clara._freeform_scope_client() is null
              or client_id = clara._freeform_scope_client())
         and clara._freeform_admitted());
```

- **`clara._freeform_scope_client()`** (STABLE definer) returns the compiled pin: the credential's
  `client_id` when it is `interactive_client`, **NULL** for HOME (and, in v2, for the sibling). The
  pin comes from the credential — **never from a tool argument** — which is the whole of TA-P9 A(1).
- **`clara._freeform_admitted()`** (STABLE definer, no arguments, so evaluated once per statement)
  is true only when this transaction holds an armed receipt whose scope matches. **That is what
  makes "no receipt, no read" structural rather than procedural:** un-armed, every enumerated
  relation returns **zero rows**, whatever statement is issued, through the verb or not.
- The three shape arms (S-1 firm+client · S-2 firm-only · S-3 global reference) are in Annex B, with
  **S-2 excluded from v1** — `document_extractions`/`document_regions` carry no `client_id`
  (survey §3.5), so under a client pin they would leak sibling clients' OCR text. **Named cost, in
  the contract's own words (D-28, OQ-E):** the contract says *"XLSX/DOCX content (values-only today,
  `monetary_cents: null`) becomes reachable by AI-assisted read here"* (`wave-f-contract.md:263-265`)
  — and it is **not**, through this door, in v1: structured-parse output lands in exactly those two
  tables. It stays reachable through the existing typed door (`read_document` →
  `clara.get_document_extract`, `0011:3232-3260`); v2's shape is the EXISTS join to
  `document_filings`. OQ-E puts the deferral in front of the owner instead of leaving the reader to
  connect "OCR text or regions" to "XLSX/DOCX" through `PROGRESS.md`.

**What "no receipt, no read" does and does not guarantee.** No row of an enumerated relation can be
read in a transaction that has not armed a receipt naming a purpose, an actor, a scope and a SQL
text. It does **not** structurally guarantee the executed text is byte-identical to the recorded one
— one body passes one variable to both and F.4 forces it (R-3, now stronger: v1 had two verbs and a
shared core, v2 has one body).

### 3.5 The gate ladder — four tiers, typed tokens, the F-A2 idiom

**Tier A — authority and shape. RAISE (CLR\*).** No wake credential → `CLR03` ·
`assert_wake_allowed(kind, verb)` called **unconditionally**, so `autodraft`/`proactive` cannot
free-read (TA-P9 A(3); the `_agent_read_admitted` bypass at `0011:3931-3932` is deliberately NOT
reused) → `CLR03` · blank or oversize `p_sql`, blank `p_purpose`, blank `p_op_key` → `CLR10` ·
`p_task` absent, of another firm, or not a live task of this session → `CLR10`/`CLR11` (this is
TA-P4's mechanical binding: the purpose is bound to a real turn, and the model's sentence is an
annotation beside it) · a second arm or settle in one transaction → `CLR10 double_arm` /
`double_settle` (§3.2) · a cross-client comparison from a client-pinned session → `CLR10
cross_client_unavailable`, the message NAMING the deferred action rather than implying the read is
forbidden (D-22's honest half) · **the scope assert (D-23):** an `interactive_client` credential
whose compiled pin is NULL → `CLR10 scope_unpinned` — **unbuildable today** (D34 makes
`interactive_client` ⇒ client NOT NULL and a CHECK binds every writer), so a **declared-unreachable
assert, never a forced cell**: a rung whose only fixture is dropping the wall it rides on is law
31's "never asked" in a costume.

**Tier B — admission. TYPED RECEIPT, no raise; the transaction COMMITS so the reason is durable.**
Every rung is evaluated, the receipt carries the full three-valued vector (`pass` / `fail` /
**`not_evaluable`**, law 68 — an absent input can never read as a pass), and only an empty failing
vector reads. Rungs and tokens: Annex D.1 — `statement_shape` · `relation_not_enumerated` ·
`plan_cost_ceiling` · `result_row_cap` · `result_byte_cap`. **`scope_unpinned` left Tier B in the
fold** (D-23): the scope is decided at arm time from the credential, so it is an assert above the
ladder, not a rung the ladder can evaluate. **`statement_shape` is evaluated by ATTEMPTING the
cursor open** and catching the SQLSTATE — it is a Tier-B token produced through a Tier-C-shaped
mechanism, and Tier C must therefore carry its pair or the receipt is lost (GM-1).

**Tier C — conversion, on `(sqlstate, reason)` PAIRS ONLY, no wildcards** (F-A2's D6 lesson: a
wildcard classifier swallows the one wall that mattered). **`(42P11, statement_shape)`** — the
cursor's own *"cannot open multi-query plan as cursor"*, the pair v1 was missing, without which the
single most audit-worthy event (an attempted injection) re-raised and left no receipt at all ·
`(42501, relation_denied)` · `(42501, function_denied)` · `(42P01, unknown_relation)` ·
`(42601, malformed_statement)` — the derived-table trap turns `set role` / `reset role` / a bare
`insert` into a SYNTAX error, so those payloads land here and not on `statement_shape` ·
`(57014, read_timeout)` · `(0A000, feature_not_permitted)` — the data-modifying CTE. Anything else
**re-raises** and settles the task, never a receipt that lies about the reason. **P-18 pins the
exact SQLSTATE of every F.3 payload on the pinned PG 17 image** — the pair set is a prediction until
it does.

**Tier D — what cannot be converted.** Connection death, FATAL, an OOM kill: the DB-side receipt is
lost with the transaction, and the **runtime's task record is the honest home** (Annex D.2). Stated
rather than papered over: a read that dies with its backend leaves no DB receipt, and the design
does not pretend otherwise.

**The consumer contract, as a design law (F-A2's D26, adopted verbatim in shape):** no consumer may
test `vector[r] = 'fail'`; every consumer tests for `'pass'` and treats everything else — including
an unknown future value or a missing key — as non-admitting.

### 3.6 The receipt, and the human who reads it (TA-P4)

`clara.freeform_read_log` is ALTERed in place (zero rows predicted, P-1): `firm_id` /
`query_text` / `purpose` set NOT NULL, and it gains `client_scope uuid`, `scope text` (`client` /
`firm` — **`cross_client` is NOT in v1's enumeration and v2 EXTENDS it**, the D34 extend-never-
weaken precedent), `acting_actor`, `on_behalf_of`, `via_wake_kind`, `task_id`, `op_key`, `verb`,
`settled_at`, `outcome`, `refusal_reason`, `rung_vector jsonb`, `relations_read text[]`,
`row_count`, `byte_count`, `duration_ms`, `model_snapshot jsonb` — full column list and CHECKs in
Annex C. `outcome` is its **own** domain (`ok` / `refused` / `error`), because `audit_log`'s is
closed to `'ok'` by CHECK (`0002:285`) and records committed successes only.

**ONE row, two phases — the fold of gate blocker GB-4 (D-17).** v1 called `_freeform_arm` "the only
writer" *and* had `_freeform_settle` "append the completion row", on a table with no link column,
NOT NULL `outcome`/`rung_vector` unknowable at arm time, a generic append-only trigger refusing
every UPDATE, and a cell demanding exactly one row per read. No builder could satisfy all five.

- **ARM inserts** the row with the facts that exist before the read (firm, credential, actor,
  on_behalf_of, wake kind, task, op key, verb, scope, pin, `query_text`, `purpose`), outcome half
  and `settled_at` NULL. **SETTLE performs the ONE permitted UPDATE** (`settled_at`, `outcome`,
  `refusal_reason`, `rung_vector`, `relations_read`, `row_count`, `byte_count`, `duration_ms`).
- A **purpose-built** trigger — not the generic `_tf_append_only`, whose CLR08 raise is
  unconditional (`0003:428-435`) — permits exactly that transition on an unsettled row and refuses
  every other UPDATE, every DELETE and TRUNCATE; and a **DEFERRABLE INITIALLY DEFERRED** constraint
  trigger aborts at COMMIT any transaction leaving a receipt unsettled. "No receipt, no read" gains
  its twin: **no read commits without a SETTLED receipt** (P-17, P-20, both directions).
- So F.4's "exactly one receipt row per committed read" is now TRUE, and Annex C's "row_count /
  byte_count are NULL on a Tier-A raise" is DELETED — a Tier-A raise aborts, leaving no row.

`clara.list_freeform_reads` is the bookkeeper+ read surface, granted to `clara_authenticated` alone,
with the `0002:517-520` floor (`coalesce(clara.actor_role_rank(), -1) >= role_rank('bookkeeper')`,
ARM-0 first). **`audit_log`'s precedent is copied in FULL (D-26, gate material GM-5):** that table
carries a policy *and* a table `GRANT SELECT` (`0002:536`); v1 copied only the policy half — and
Postgres checks table privilege before RLS, so the floor would have been dead code no battery cell
could see, every F.10 cell having routed through the definer. PR-1 ships the grant with the policy
and F.10 forces the raw path (viewer → zero, bookkeeper → own firm, firm B → zero). Annex C's "two
new policies" is **one**: the owner policy exists already (`0002:482-493`). **PR-3 ships a crude
dashboard page** — TA-P14 clause 2 + TA-P4 A(4): the door may be ugly, never absent. It shows, per
read: when, who asked, which client, the purpose, the SQL, the outcome, the relations touched and
the row count.

### 3.7 The narrative wall (TA-P10 C′), made mechanical

Three moves, none of them a prompt instruction (hard constraint 2 — enforcement is structural):

1. The tool result is stamped `"authority": "narrative"`, `"claim_eligible": false`, and carries the
   `read_id`; the model is told, but the label is not what enforces anything.
2. **The wall is the GRANT; the id namespace is a SHAPE fact, not a wall (D-27, GM-4).** The verb
   holds no grant that could write anything — that is what refuses an evidence write, and F.7 now
   forces exactly that: an evidence or knowledge-fact write attempted *through the freeform verb*
   refuses `(42501, function_denied)`, twinned with the same write succeeding on its own lane. v1's
   cell instead asserted `entry_evidence` refuses a `freeform_read` id — but that table has no
   citation slot and its ids are uuids against a bigint receipt id (`0009:883-905`), so the cell
   proved a type mismatch and banked it as a wall.
3. **A rationale MAY cite it** — TA-P10 C′ says so — as `{kind:'freeform_read', read_id,
   query_text}`, so the query text travels with the number; F.7's second cell forces the other half,
   that the same citation is REJECTED wherever an authoritative number is sourced (TA-P2's three
   origins). **Residual R-8:** `client_facts.basis_kind` is a closed four-value CHECK
   (`0055:395-396`), so a human can still launder an aggregate under `owner_instruction` — a human
   mislabel, detectable in the receipt, never a door the model can open.

### 3.8 HOME, the client pin, and the cross-client action

| session | credential | scope compiled | verb |
|---|---|---|---|
| HOME chat (no client pin) | `interactive` | firm-wide | `wake_freeform_read` |
| client-bound chat | `interactive_client` (F-A2 D34) | that client | `wake_freeform_read` |
| client-bound chat, deliberate comparison | `interactive_client` | — | **v2** (`CLR10 cross_client_unavailable`, the action NAMED in the message) |
| any unattended lane (`autodraft`, `proactive`) | — | **no allowlist row** | refused CLR03 |

**Exactly two allowlist rows in v1** — `('interactive','wake_freeform_read')` and
`('interactive_client','wake_freeform_read')` — a closed-world cell asserting the count in both
directions (F.2), and **v2 EXTENDS the roster with its sibling's row** rather than re-cutting it.
The runtime mints `interactive_client` **for the freeform call path alone**, exactly as F-A2's R-1
mints it for `wake_open_question` alone; every other tool in the turn keeps its plain `interactive`
credential, so the C-3 census hazard (`coding_lane` at `0011:1570` has no is-not-null guard on
`w.client_id`) is not reopened. See OQ-A. **The mint is where the scope actually lives (D-23):**
because a client-bound session that fell back to plain `interactive` would look to the DB like a
lawful HOME read, the wall is a runtime census — `withFreeformRead` mints `interactive_client`
whenever `ToolCtx.clientId` is non-null, forced both ways — plus the detective control that PR-4
publishes the count of `scope='firm'` reads issued from client-bound sessions (expected: zero).

## 4 · The walls, censuses and gates that must move

**Annex E.2** carries the list, re-derived in the fold: C1 (role count 7 → 9) · C4 (the fourth
login, both directions) · C5 (`appRoles`) · C7 (the wiki gate's SECOND entry, justified by the ACL —
the refusal a wiki payload actually takes is `(42501, relation_denied)`, GM-2) · C11 (the
grant-matrix cohorts **and** the `ALLOWED` ROLE-KEY the census iterates) · **C3 is UNCHANGED** —
F-A6 creates no new table (v1 claimed it did, contradicting its own §7 and F.12: GM-6) · C10
unchanged, a positive argument for the new role.

## 5 · Judgement logic (review law 1)

Every rung of §3.5, the scope compilation in §3.4, the relation census in §3.3 and the floor in §3.6
decide *whether a read is allowed and what it may see* — all of it is judgement logic, and all of it
takes the independent pass. **Law 28's cross-model adversarial pass is separate and mandatory**, and
its brief is the injection surface specifically: given a hostile SQL string, can it (i) leave the
enumerated relations, (ii) leave the client scope, (iii) leave the firm, (iv) run more than one
statement, (v) write anything, (vi) read without leaving a receipt, or (vii) make the receipt lie.

## 6 · The D1 surface

**No D1 write-quiesce window is required, and the reason is structural: F-A6 CoRs no live body** —
new objects, 35 role-pinned policies, an ALTER on an empty table, one revoke of an unused grant.
Both gate lenses re-derived this and agreed. The real cost is **35 brief ACCESS EXCLUSIVE locks**
(`CREATE POLICY`, one per table, hot ones included): apply from merged `main` in a low-traffic
window under an explicit `lock_timeout` with bounded retry, so a blocked statement fails fast rather
than queueing behind — and ahead of — the posting lane (Annex E, P-15). **F-A6 is cleanly severable
from F-A4/F-A5's shared `finalize_close` window** — it touches no body they touch. If PR-1 lands in
an F-A2 ceremony's train it rides that window for free; **the lead rules the train** (D29).

## 7 · Build sequence

1. **PR-0 (gate, zero code) — RUN. Its record is `freeform-read-gate-record.md` and this version is
   the fold.** Four blockers and six materials bound; the width was ruled; **the law-28 cross-model
   adversarial pass has NOT yet been run and must now run against THIS shape** — the injection
   surface's execution order (D-18) and its granted-function set (D-20/D-21) both changed, so a pass
   run against v1 would have been run against a body nobody will build. The rig replay answers
   **P-1..P-20**. **TRUED 2026-08-23 — it ran** (`freeform-read-law28-review.md`), folded into §0.1c.
2. **PR-1 (DB).** The two roles; the enumerated grants (35 relations, **7** functions); the
   policies; the `freeform_read_log` ALTER + the settle-once and must-settle triggers + the human
   grant and policy; **ONE verb** plus `_freeform_arm` / `_freeform_settle` /
   `_freeform_scope_client` / `_freeform_admitted`; **two** allowlist rows; the revoke of
   `0002:542`; the census extensions (C1/C4/C5/C11 — **not** C3); the law-34 audit line printed by
   the migration tail itself.
3. **PR-1b (DB, no ceremony).** `clara.list_freeform_reads` + its floor.
4. **PR-2 (runtime).** The fourth pool + login wiring (`LOGIN_NAMES`, `assertProductionPoolConfig`,
   `withFreeformRead` opening the txn, binding the wake secret txn-locally, calling the verb,
   committing, **and resetting session state on release** — R-9); a new `chatTurn_vN` **numbered at
   MERGE time, not here** (tip is `chatTurn_v12`, `registry.ts:46`; F-A2's PR-2 claims `_v13` first
   — obligation 4 below) plus a **new frozen `chatTurn.v10.infra` `_vN`** minting
   `interactive_client` for the freeform call path ALONE; the tool definition with its caps. **The
   refusal mapping rides that new frozen `_vN`'s own code** — `chatTurn.v10.errors.ts` is frozen and
   is NOT edited; the denied/unknown/not-enumerated family keeps `readToolRefusalMessage`'s shared
   string BY DESIGN (Annex D.2's oracle discipline), and only `read_timeout` / `malformed_statement`
   get their own branches. New `_vN` exports + a registry repoint, never an edit; bundle-grep after.
5. **PR-3 (dashboard).** The receipt page (crude, present) — TA-P14 clause 2 + TA-P4 A(4).
6. **PR-4 (acceptance, zero code).** Live on **ROME PUBLIC ADVISORY** first, then a BELCORT client
   (constraints 12 and 13 throughout); the enumerated list published as the law-34 audit line; the
   measured refusal populations published; `PROGRESS.md` trued.
7. **v2 (its own item).** The cross-client sibling verb + its allowlist row + the `scope`/`verb`
   CHECK EXTENSIONS + S-2's EXISTS-join arm (OQ-E), each extend-never-weaken.

**Human acts this item manufactures** (TA-P14 clause 2 applies to each): the
`clara_freeform_login` LOGIN + password ceremony and the fourth DSN
(`CLARA_FREEFORM_DATABASE_URL`) — password-bearing, therefore the owner's; the law-28 adversarial
pass is a named pre-merge obligation; and if TA-P3's purpose list lands first, naming this read's
purpose in it.

## 8 · Dependencies, and the owner questions I could not settle

**Hard dependency — F-A2 PR-1's `interactive_client`.** Without it there is no client-pinned
interactive credential (F5) and the client-scoped arm has no carrier; a client-bound session
silently reading firm-wide is the exact failure TA-P9 A(1) rules against. **Fail-closed default:
build against F-A2 PR-1; if the train splits, ship HOME-only and hold the client pin.**

**Five owner questions, each with a recommendation and the fail-closed default the build proceeds on
under the standing delegation — full text, grounds and escalation triggers in Annex J.** **OQ-A**
who mints `interactive_client` for the freeform call (recommend: this call path mints its own, an
ADDITION to F-A2's R-1; default if declined: HOME-only) · **OQ-B** the metric catalog and the
close/period tables (recommend: close/period/bank yes, metric catalog no — F-A5 rules its own read
surface; default: A.1 as written) · **OQ-C** the cap numbers (5 000 rows / 1 MiB / 5 s / a
rig-calibrated plan ceiling; default: those) · **OQ-D** is this a new TA-P3 egress class (recommend:
no, an existing class widened; default: that reading + R-5) · **OQ-E, opened by the fold (D-28)**
the contract's XLSX/DOCX clause, which v1's S-2 exclusion does not satisfy — **this one escalates**:
the owner should see the deferral rather than infer it from "no OCR text or regions".

**Cross-item SEQUENCING obligations — named, not decided here.** (1) **F-A4's B13 oracle
admission**: `_assert_due_read_ctx` admits a JWT session or `clara_runtime` only; the fix is an
ungranted core extracted BELOW the admission, which F-A4's §7 / D-14 must explicitly reverse (or
name a different oracle). F-A6's default is fail-closed and unaffected: **no enumerated relation's
policy and no F-A6 body calls it**, and F-A6 must not be cited as sanctioning a widening of it.
(2) **Task #17 Fix A has ONE owner** — recommended: F-A4's `finalize_close` window carries Fix A and
Track B's battery rides it; F-A6 touches no shared body and claims nothing. (3) **The clock
execution path** (a `kind='wake'` `agent_task` born HELD, `held→cancelled` only — shared with
F-A3/F-A5): F-A6's receipt binds `task_id` to an **interactive chat turn's** task, TA-P9 A(3) keeps
unattended lanes out, and any later clock-driven free read is its own named ruling (R-6).
(4) **`chatTurn` `_vN` chains are claimed by F-A2's PR-2 first** — F-A6's runtime PR numbers after
it, at merge. (5) **`wake_credentials` CHECK pairs are EXTEND-ONLY after D34** — F-A6 adds no wake
kind and consumes `interactive_client`; if v2 ever needs one, both CHECKs and both mint gates
extend, never re-cut. (6) **The F-A5 evaluate leg must name a lawful entrypoint** (an agent
orchestrator calling the frozen `evaluate_metric_v1` under the OBO closure); until it does, the
`0058`/`0059` metric catalog stays OUT of A.1 (OQ-B) and **the free read must not become the
back door to the evaluator** — the eta is F-A5's, not F-A6's, and is stated as unknown here.
(7) **The receipt writers' grant** is the one obligation this design cannot satisfy as stated — see
§3.2/D-20 and the gate record's owner items.

## 9 · Registered risks and named non-goals

**Annex J** carries both, re-cut in the fold: **R-1** the enumerated list is a moving wall · **R-2**
the plan census is a second parse **and a catalog-only wall** (re-stated, GM-2) · **R-3** text
identity is a body invariant — stronger in v2, one verb and one body · **R-4** the fourth pool's
connections and password ceremony · **R-5** egress posture inherited · **R-6** `interactive` only ·
**R-7** law 31, walls with a zero population · **R-8** the `basis_kind` mislabel residual (new,
GM-4) · **R-9** payload-set session state on a pooled backend (new, D-20). **Non-goals** unchanged
except that the **cross-client sibling verb is now a named v2 deliverable, not a v1 non-goal**, and
the OCR/regions exclusion is restated in the contract's own XLSX/DOCX words (D-28).
