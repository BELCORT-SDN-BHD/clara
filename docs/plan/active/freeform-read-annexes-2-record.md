# F-A6 annexes 2 — battery, decision register, change log, predictions, owner questions

> Companion to `freeform-read-design.md` (**v2, 2026-08-22 — gate 2 folded (record:
> `freeform-read-gate-record.md`)**). **F** the battery · **G** the decision register · **H** the
> change log · **I** the consolidated predictions · **J** the owner questions, registered risks and
> named non-goals (folded out of design §8/§9). Sibling:
> `freeform-read-annexes-1-mechanics.md` (**A-E**). Estate: `freeform-read-survey.md`.
>
> **▣ marks a CONTRACT-BLIND cell** — written against the published behaviour, never against the
> migration source, so it can go RED against a wrong implementation of this very design.
> **Law 31 governs the whole battery:** a wall that never refused anything is not a wall that held,
> it is a wall that was never asked. Every rung below is forced NON-VACUOUSLY, and each forcing cell
> has a **negative twin** proving the rung — not something else — was the reason.

---

## Annex F · The battery

**F.1 · The verbs and their authority.** No wake credential → CLR03 ▣ · a credential whose wake kind
holds no allowlist row **for this verb** → CLR03 ▣ · **an `autodraft` credential ATTEMPTING the call
is refused** ▣ *(the F-A2 lesson: a cell that reads the allowlist roster proves the row is absent,
not that the door is shut — the cell must make the call)* · a `proactive` credential likewise ▣ ·
blank `p_sql` / blank `p_purpose` / blank `p_op_key` → CLR10 with the typed detail ▣ · `p_task` from
another firm → CLR11 ▣ · `p_task` that is not a live task → CLR10 ▣ · a second `_freeform_arm` in one
transaction → CLR10 `double_arm` ▣ · **a second `_freeform_settle` → CLR10 `double_settle`** ▣ ·
a cross-client comparison from a client-pinned session → CLR10 `cross_client_unavailable`, **and the
model-facing message NAMES the deferred v2 action** ▣ *(D-22: refusing is the narrowing; refusing
mutely would be a second one)* · the verb body carries **no DML** (catalog cell) ▣ ·
**`_freeform_arm` and `_freeform_settle` are executable by `clara_freeform_ro` and by NO other
non-owner role** ▣ *(the grant is forced by the INVOKER chain — D-20 — so this cell records the
posture; the forgery cells are F.3(i)-(k))*.

**F.2 · The closed worlds.** `wake_fn_allowlist` holds **exactly two** rows for the verb, and the
cell asserts the count **and** the membership ▣ · `autodraft` and `proactive` hold **zero** rows ▣ ·
`clara_freeform_ro` holds SELECT on **exactly** the A.1 relations — the cell derives the grant set
from `information_schema.role_table_grants` and `deepEqual`s it ▣ · `clara_freeform_ro` holds
EXECUTE on **exactly** the **SEVEN** A.2 functions, derived from `has_function_privilege` over every
function in `clara` ▣ *(the count is the fold's re-derivation, D-21 — and this cell is why the list
had to be re-derived rather than left ambiguous: it CEMENTS whatever the annex says, so a wrong
annex ships a wrong grant)* · **no `clara._freeform_read_core` exists** (v1's third function is
folded into the verb) ▣ · **the migration's printed audit line is non-empty and matches the derived
sets** ▣ *(a printed line nobody compares is decoration)*.

**F.3 · The execution wall (design §3.3), each payload against the token it ACTUALLY produces.**
v1 demanded `statement_shape` from all eight; by the design's own mechanics most of them are syntax
errors and none of them had a Tier-C pair, so every cell would have gone red or lost its receipt
(GM-1). Re-cut, each submitted through the real verb, each with a twin that must SUCCEED:
(a) `select 1) t; drop table clara.journal_lines; select * from (select 1` → **`statement_shape`
(42P11)** ▣ · (b) two plain statements separated by `;` → `statement_shape` ▣ · (c) `reset role;
select 1` → **`malformed_statement` (42601)**, the derived-table trap ▣ · (d) `set role
clara_agent_ro; select 1` → `malformed_statement` ▣ · (e) a data-modifying CTE (`with x as
(insert … returning *) select * from x`) → **`feature_not_permitted` (0A000)** ▣ · (f) `insert into
clara.journal_lines …` → `malformed_statement` ▣ · (g) a `--` comment terminating the wrapper's own
suffix → `malformed_statement` ▣ · (h) a dollar-quoted payload carrying a second statement →
`statement_shape` ▣. **Each cell also asserts a COMMITTED receipt naming that token** — the point of
the missing pair was that an injection attempt left no record at all.

**F.3 continued — the payload's function surface (D-20, the fold's own cells).**
(i) `select clara._freeform_settle('ok',0,0,'{}'::text[],1,'{}'::jsonb)` inside the payload:
the transaction **ABORTS** and **no receipt row and no result rows commit** ▣, with the twin that
the same read without the payload commits one settled receipt ▣ *(law 28 question (vii), forced —
this is the cell the whole GB-1 fold exists for)* · (j) `select clara._freeform_arm(…)` inside the
payload → `double_arm`, transaction aborts, nothing commits ▣ · (k) `select
set_config('statement_timeout','0',false)` and `select set_config('search_path','public',false)`
inside the payload: the read's own deadline still fires ▣ **and the NEXT checkout of the freeform
pool sees clean session state** ▣ *(R-9; the runtime-side half of the cell)* · (l) `select
set_config('role','clara_agent_ro',false)` refuses — session-user membership, not a lexical filter
▣. **Twins that must PASS**: a plain aggregate, a join across three enumerated relations, a
non-data-modifying CTE, a `values` list ▣.

**F.4 · Receipt atomicity and text identity (TA-P4).** **The gating cell:** with the capability
un-armed, a direct `select count(*) from clara.journal_entries` on a `clara_freeform_ro` session
returns **zero rows** — not an error, zero rows ▣, and the same statement after a lawful arm returns
the real count ▣ *(the pair is what proves the RLS conjunct is load-bearing rather than decorative)*
· every committed read has exactly **one** receipt row — **armed then settled, `settled_at` non-null
at commit** — and the row's `query_text` is **byte-identical** to the text the cell submitted ▣ ·
**a transaction that arms and commits WITHOUT settling is refused at COMMIT by the deferred
constraint trigger** ▣ *(the D-17 cell; P-17)* · a read whose transaction aborts leaves **no**
receipt row and the runtime's task record carries the failure ▣ · a Tier-B refusal **commits** its
receipt with `outcome='refused'` and the failing token ▣ · `_freeform_arm` called twice refuses
(F.1) so one transaction can never carry two texts against one read ▣ · **the runtime census**:
`withFreeformRead` is the only call site of the freeform pool in `packages/runtime` ▣ **and it mints
`interactive_client` whenever `ToolCtx.clientId` is non-null, forced BOTH ways** ▣ *(D-23 — the wall
that actually catches the silent-widening failure B6 could not see)*.

**F.5 · Scope (TA-P9 A(1)).** A client-pinned session reading `journal_entries` sees **only** that
client's rows, with a sibling client's rows present in the fixture ▣ · the same session's read of
`clients` returns **one** row — the `id`-vs-`client_id` arm, which goes RED against an S-1 copy-paste
▣ · a HOME (`interactive`, no pin) session sees every client of the firm ▣ · a cross-client
comparison from a client-pinned session refuses `cross_client_unavailable` and the client pin still
holds for the rest of the transaction ▣ *(v1's cell asserted the severed sibling verb's success —
re-cut with the severance, D-22)* · **no session of firm A can see a row of firm B** through any
verb, arm or payload ▣ *(invariant (c); the cell runs the whole F.3 payload set from a firm-A
session against firm-B fixtures)* · **the ARM-0 scope cell, re-aimed (D-23):** the pin conjunct is
written as `(_freeform_scope_client() is null or client_id = _freeform_scope_client())` and a
mutation test proves a `coalesce(pin, client_id)` form goes RED ▣ — v1's cell instead required an
`interactive_client` credential with a NULL pin, a row D34's CHECK forbids anyone to create, so it
could only have been built by dropping the wall it tested.

**F.6 · The two independent walls on the readable set,** re-cut to the order the mechanism actually
produces (GM-2) ▣: (a) a payload naming `clara.wiki_pages` refuses **`(42501, relation_denied)`** —
the GRANT fires at EXPLAIN's planning step, before any plan exists, so `relations_read` is NULL and
`relation_not_enumerated` is NOT reachable for it; the negative twin is the same payload against an
enumerated relation succeeding ▣ *(v1 asserted `relation_not_enumerated` "and then 42501" — an
ordering the mechanism cannot produce)* · (b) a payload naming `pg_proc` (a PUBLIC-readable catalog
relation **no grant can withhold**) refuses `relation_not_enumerated` at the plan census and would
otherwise SUCCEED ▣ *(the ONLY non-vacuous B2 cell, and the whole justification for the census
existing — D-24)* ·
(c) `select clara.get_context_pack('<sibling client>','probe')` refuses `(42501, function_denied)` ▣
· (d) `select clara.approve_entry(…)` refuses ▣ · (e) `select clara.wake_firm()` **succeeds** (it is
enumerated) ▣.

**F.7 · The narrative wall (TA-P10 C′), re-cut to cells that ask something (GM-4).** (a) **the
GRANT cell**: an `entry_evidence` write and a knowledge-fact write attempted **through the freeform
verb** each refuse `(42501, function_denied)` ▣, twinned with the same write SUCCEEDING on its own
lane ▣ *(so the refusal is provably the grant)* · (b) **the citation cell**: a posting rationale
**may** carry `{kind:'freeform_read', read_id, query_text}` and the receipt stores it ▣, while the
same citation offered where an authoritative number is sourced is REJECTED ▣ *(TA-P2's three
origins)* · (c) the tool result carries `authority='narrative'` and `claim_eligible=false` at the
top level ▣ *(flattened, not nested — the F-A2 D24 lesson)*. **v1's (a)/(b) are deleted**: they
asserted that `entry_evidence` refuses a `freeform_read` id, but that table has no citation slot and
its ids are uuids against a bigint receipt id — a type mismatch banked as a wall.

**F.8 · Oracle discipline, on pairs the mechanism can produce (GM-2).** A payload naming a relation
that does not exist (`clara.nope`) and one naming an existing-but-unenumerated **PUBLIC-readable
catalog** relation (`pg_class`) return the **same** string to the model ▣, while the receipts record
`unknown_relation` and `relation_not_enumerated` respectively ▣ *(the ungranted-relation case is a
third arm: same model-facing string, receipt records `relation_denied`)* ▣ · a payload probing for a
row that does not exist and one blocked by scope are likewise indistinguishable to the model ▣.

**F.9 · The receipt's own CHECKs.** A blank `model_snapshot.model` **refuses the insert** ▣ *(the
F-A2 R-3 cell: this goes GREEN against a four-apostrophe default and must not)* · `scope='client'`
with a NULL `client_scope` refuses ▣ and `scope='firm'` with a non-NULL one refuses ▣ ·
`outcome='ok'` with a refusal reason refuses ▣ and `outcome='refused'` with none refuses ▣ ·
**the settle-once trigger, both arms (D-17, P-20):** the ONE settle UPDATE on an unsettled row
SUCCEEDS ▣, a second settle refuses ▣, an UPDATE of `query_text` (or any arm-phase column) refuses
▣, a DELETE refuses ▣, a TRUNCATE refuses ▣ · **no role other than `clara_fn_owner` holds INSERT or
UPDATE** — and the `0002:542` runtime grant is gone ▣.

**F.10 · The human read surface — BOTH doors, because v1 only had one (GM-5).** Through
`list_freeform_reads`: a `viewer` sees **zero** rows ▣ · a `bookkeeper` sees their firm's reads ▣ ·
an `owner` the same set ▣ · a member of firm B sees **zero** of firm A's ▣ · the surface renders the
SQL text, the asker, the client scope and the outcome ▣ · **ARM-0**: a caller with no active
membership (NULL rank) sees zero by the first arm, never by inference ▣. **Through the RAW table**
(the cell v1 lacked, which is why its dead policy could not have been detected): a `bookkeeper`'s
`select * from clara.freeform_read_log` returns their firm's rows ▣, a `viewer`'s returns zero ▣,
and firm B's returns zero of firm A's ▣ — the grant and the policy both proven live.

**F.11 · The caps, each forced non-vacuously.** A query returning cap+1 rows refuses
`result_row_cap` **and commits a receipt naming the count it reached** ▣ · a query whose rows exceed
the byte ceiling refuses `result_byte_cap` ▣ · a deliberately slow query refuses `read_timeout` with
a committed receipt ▣ *(the cell that proves 57014 is catchable here — P-12)*, **and its twin: the
same slow query with the payload having set `statement_timeout` to 0 still refuses, because the
deadline is the plpgsql clock check, not the GUC** ▣ *(D-20/R-9)* · a query whose plan cost exceeds
the ceiling refuses `plan_cost_ceiling` **after the cursor opens and before any row is fetched**,
with `relations_read` populated from the plan ▣ *(the D-18 order)* · a cap-1-row query
**succeeds** ▣.

**F.12 · The estate censuses (survey §4).** The non-sanctioned `clara_` role census reads **9** and
names both new roles ▣ · both new roles hold **zero** EXECUTE on every close verb (the same derived
cell, free coverage) ▣ · `clara_freeform_login` can `set role clara_freeform_ro` and **cannot** set
role into any of the other six groups ▣ · the three existing logins **cannot** set role into
`clara_freeform_ro` ▣ · bare `clara_freeform_login` (INHERIT FALSE) reads nothing ▣ · T18 definer
hygiene stays clean — every new DEFINER pins `search_path` and is owned by `clara_fn_owner` ▣ ·
PUBLIC holds zero EXECUTE, asserted **by printed count** ▣ · `GOVERNED_TABLES` ×3 still derive clean
**and are UNCHANGED — F-A6 adds no table** ▣ *(the design text that said they "gain the new objects"
was the error, GM-6)* · **both new roles appear as KEYS in `rig-meta.mjs`'s `ALLOWED` grant matrix**
▣ *(a role that is not a key is never probed by the exact-EXECUTE census at all — E.2/C11)* · the
wiki dynamic-SQL gate passes with **exactly two** allowlist entries and the new one's justification
text present ▣.

**F.13 · The vector.** Every rung is evaluated even after the first failure ▣ · a rung whose input is
absent reports `not_evaluable`, never `pass` ▣ *(the ARM-0 shape)* · an empty failing vector is the
only thing that reads ▣ · a doctored vector carrying an **unknown** value does not admit ▣ *(the
consumer-contract cell — it fails against any consumer written to test for `'fail'`)* · the vector is
readable from the receipt for both a refusal and a success ▣.

**F.14 · Acceptance (law 29, TA-P14).** Live on **ROME PUBLIC ADVISORY** first, then one BELCORT
client (constraints 12 and 13 throughout) · the printed audit line published verbatim in the PR-4
record · **four numbers over a fixed question set**: reads attempted, reads answered, reads refused
by token, and rows returned — with **the denominator stated every time** · one real client-pinned
read and one real HOME read, receipted, shown in the human surface *(the cross-client read moves to
v2's acceptance with its verb — D-22)* · **the count of `scope='firm'` reads issued from
client-bound sessions, expected ZERO** (D-23's detective control) · the F.4 gating pair re-run
against the live database (read-only, rolled back) · **the measured population of each refusal token
published**, including the zero ones, so law 31's "never asked" walls are visible as such rather
than banked — `scope_unpinned` among them, published as *declared unreachable*, not as a green.

---

## Annex G · Decision register

| id | decision | status |
|---|---|---|
| **D-1** | **A NEW group role + a NEW login** (`clara_freeform_ro` / `clara_freeform_login`), the fourth pool. TA-P9 A(2) ruled the new role; survey F6 makes it the mechanism (a receipt-gated policy added for `clara_agent_ro` would be OR'd past by its existing permissive policies) and F7 makes the new login unavoidable (the read pool's transactions are read-only at session level, so the receipt cannot be written there). | ruled here, on the ruling + two findings |
| **D-2** | **The SQL executes as the CALLER, not as a definer.** Three alternatives refused at the bytes: `clara_agent_ro` (F6), a definer running as `clara_fn_owner` (constant-true owner policies), and a definer owned by the scope role (**T18**, `rig-meta.mjs:1062-1074`). `SET LOCAL ROLE` inside a definer is refused on P-5. | derived |
| **D-3** | **`OPEN … FOR EXECUTE` is the single-statement wall**, not a lexical filter — Postgres's own cursor rules forbid multi-query plans, non-SELECT statements and data-modifying CTEs. The derived-table wrapping turns every utility statement into a syntax error. | derived; P-4 confirms |
| **D-4** | **Scope is compiled by the PLANNER (RLS), never by a string rewriter** — a rewriter is the DSL ADR-0071 refused. The pin comes from the credential, never from a tool argument. | derived from TA-P9 A(1) |
| **D-5** | **The receipt is the capability**: `_freeform_admitted()` is a conjunct in every freeform policy, so an un-armed transaction reads **zero rows** from every enumerated relation. This is **stronger** than TA-P4's named DEFINER wrapper and is stated as such rather than presented as compliance. | derived from TA-P4 A(3) |
| **D-6** | **The runtime's `0002:542` INSERT grant is REVOKED and its policy dropped** — one writer, `_freeform_arm`. The converse wall TA-P4 does not name: a receipt that something other than the reader can mint is not evidence. | derived |
| **D-7** | **A plan census beside the grant census.** `explain (format json)` supplies `relations_read[]` and reaches PUBLIC-readable catalog relations no grant can withhold. Cost: one extra parse+plan (R-2). | derived; F.6(b) is its justification cell |
| **D-8** | **Cross-client is a SIBLING VERB, not a flag** — TA-P1 C's rider applied literally; "cross-client" is a grant-and-allowlist fact, never an argument the model can set. **Re-grounded in the fold:** v1 also gave the shared core a `p_scope text` argument and (in one of three contradictory places) granted it, so the model could have set the very thing D-8 says it cannot. v2 removes the argument by removing the core; the sibling arrives in v2 as a verb, exactly as this row says. | derived from TA-P1 C; re-grounded by GB-2 |
| **D-9** | **`assert_wake_allowed` is called UNCONDITIONALLY**, deliberately not reusing `_agent_read_admitted`'s `interactive`/`proactive` bypass — **`0011:3931-3932`** (the fold's cite true: `:3927-3929` is the credential-null CLR03 arm, not the bypass, and the wrong cite was repeated in three load-bearing places). That bypass is why the allowlist cannot reach today's typed reads; the new verb does not inherit it. | derived from TA-P9 A(3); cite trued (GM-6) |
| **D-10** | **The enumerated list is 35 relations + SEVEN functions** (re-derived, D-21), with an explicit exclusion table carrying a ground per line (Annex A). Wiki stays out on `0017:1424-1426`; extractions/regions — **OCR *and* XLSX/DOCX structured-parse content, in the contract's own words** — stay out on the S-2 client-scope gap (D-28, OQ-E); the metric catalog stays out for F-A5 to rule. | proposed; OQ-B + OQ-E |
| **D-11** | **No D1 write-quiesce** — no live body is CoR'd; the cost is 35 brief ACCESS EXCLUSIVE `CREATE POLICY` locks, applied under `lock_timeout` with a bounded retry. | derived; the lead rules the train |
| **D-12** | **No new part type.** The SQL is already visible in the `tool_call` chip; charts and exports are F-A5. `PART_CATALOG` is untouched. | derived; named non-goal |
| **D-13** | **The freeform call path mints its own short-TTL `interactive_client`**, leaving every other tool in the turn on plain `interactive` — an addition to F-A2's R-1 enumeration, not a weakening, so the C-3 hazard (`coding_lane`, `0011:1570`) is not reopened. | **OQ-A — proceeding on the recommendation under the standing delegation** |
| **D-14** | **Caps: 5 000 rows / 1 MiB / 5 s / a rig-calibrated plan ceiling** — engineering values, tuned once after the acceptance corpus (the A3-M-60day precedent). | OQ-C; fail-closed default adopted |
| **D-15** | **The free read is not a new egress class** — it widens the data reachable by the chat turn's existing class; the receipt keys a purpose string now so TA-P3's list can adopt it later. Recorded as R-5, not as a clearance. | OQ-D; fail-closed default adopted |
| **D-16** | **`users` stays in the enumerated list and `clara.shares_my_firm_wake(uuid)` is granted to the new role** (`0004:762` grants it to `clara_agent_ro` alone today). The alternative — drop `users` — was refused: *"who asked this?"* is a question the free read is expected to answer. The COUNT it justified moved with D-21; the decision itself stands. | derived; count re-derived in the fold |

### Folded at the PR-0 gate (record: `freeform-read-gate-record.md`)

| id | decision | status |
|---|---|---|
| **D-17** | **The receipt is ONE row with TWO phases** — arm INSERTs, settle performs the ONE permitted UPDATE, a purpose-built settle-once trigger replaces the generic `_tf_append_only`, and a DEFERRABLE INITIALLY DEFERRED trigger aborts at COMMIT any transaction leaving a receipt unsettled. v1's shape (NOT NULL outcome/rung at arm, "appends the completion row", no link column, one-row cell) was unbuildable in every combination. | folds **GB-4** |
| **D-18** | **The cursor OPENS FIRST; the plan census runs on the certified text.** v1 ran `explain` through a plain plpgsql `EXECUTE` *before* the single-statement wall — and `SPI_execute` runs a multi-statement string in full, so the design's own injection payloads would have executed their stacked statements one wall too early. | folds **GB-3** |
| **D-19** | **ONE verb, ONE body.** `_freeform_read_core` is folded into `wake_freeform_read`; no `p_scope` argument. NOTE-3 TRUE (independent review): the BUILT body departs from this decision's "no shared core" clause — §0.1b(7)'s v2-readiness adoption extracts `clara._freeform_core`, called from `_freeform_arm` alone, so the invariant that survives is ONE caller, not ONE undivided body. This kills v1's three-way granted/ungranted contradiction at the root and strengthens R-3 (one body, one variable, one caller). | folds **GB-2** |
| **D-20** | **The two DEFINER receipt writers stay EXECUTE-granted — a SECURITY INVOKER caller forces it — and the forgery is closed structurally instead:** settle takes no read id and settles only what THIS transaction armed; one arm and one settle per transaction; any second call raises, so a forged receipt can only exist in a transaction that aborts. The payload's function surface (`set_config` family) is walled by session-user membership, a plpgsql deadline and a pool reset. | folds **GB-1**; the "must not be granted" obligation is **ESCALATED** — see the gate record's owner items |
| **D-21** | **A.2 re-derived from ten to SEVEN** — the sibling verb severed, the core folded, `wake_client()` dropped as uncalled by any policy arm or invoker-layer body. The printed migration line is the truth; this annex is the bug if they differ. | derived from D-19/D-20/D-22 |
| **D-22** | **The cross-client sibling verb is SEVERED to F-A6 v2** (with `p_scope`, the third allowlist row, the `cross_client` scope value and its cells). v1 refuses the action with `CLR10 cross_client_unavailable` and NAMES it. **This is NARROWER than TA-P9 A(2) for a client-pinned session.** | **DISSENT RECORDED — owner item.** Grounds: the limb carried the most speculative machinery for the least proven demand, and depends on `interactive_client` besides |
| **D-23** | **B6 `scope_unpinned` is CUT as a rung and re-aimed as a declared-unreachable Tier-A assert;** the failure it was named for is caught by the runtime mint census plus a PR-4 detective count. Its only fixture required dropping F-A2's D34 CHECK. | folds **GM-3** (the F-A2 GM-3 precedent: cut on correctness, not severed for width) |
| **D-24** | **The plan census is a CATALOG-relation wall**, not a general one: for anything ungranted the GRANT fires first at EXPLAIN planning, so `relation_not_enumerated` is reachable only for PUBLIC-readable catalog relations and `relations_read` is NULL on plan-less refusals. C7, F.6(a) and F.8 re-cut accordingly. | folds **GM-2** |
| **D-25** | **Tier C gains `(42P11, statement_shape)`** and F.3 is re-cut per payload to the token each actually produces. Without the pair, an attempted injection re-raised and left no receipt — the single most audit-worthy event, unrecordable. | folds **GM-1** |
| **D-26** | **The human door copies `audit_log` in FULL** — table `GRANT SELECT` *and* the bookkeeper+ policy, with a raw-table battery arm. One new policy, not two. | folds **GM-5** |
| **D-27** | **F.7 re-cut to the GRANT cell and the citation cell**; the entry-evidence door is a SHAPE fact, stated as such, never banked as a wall. R-8 names the `basis_kind` mislabel residual. | folds **GM-4** |
| **D-28** | **The contract's XLSX/DOCX clause is answered explicitly, in its own words** — v1's S-2 exclusion keeps that content out of the free read, `read_document` remains the door, v2 carries the EXISTS join. | **OQ-E, escalated** (a contract clause the design does not satisfy) |

---

## Annex H · Change log

### v1 → v2 (2026-08-22) — the PR-0 gate, folded (record: `freeform-read-gate-record.md`)

Two lenses ran against v1 (bytes and rulings), every finding adversarially verified by an
independent verifier. **Four blockers and six materials bound; six findings were REFUTED and are
registered in the gate record so nobody re-raises them.** The folds, by decision row:

- **GB-1 → D-20** the two DEFINER receipt writers were EXECUTE-granted to the same role the model's
  SQL runs as, so a payload could have forged the completion row — law 28's own question (vii),
  answered YES. The grant turns out to be forced by the INVOKER chain, so the property is bought
  structurally: no read-id argument, one arm and one settle, any second call aborts the transaction.
  *(The "must not be granted" cross-item obligation is ESCALATED, not silently overridden.)*
- **GB-3 → D-18** the relation census ran BEFORE the single-statement wall, through a plain plpgsql
  `EXECUTE`, which runs a multi-statement string in full. Order inverted.
- **GB-4 → D-17** the arm→settle receipt had no buildable shape. One row, two phases, three
  triggers.
- **GB-2 (verifier-regraded from material) → D-19/D-21** the shared core was called ungranted,
  listed as granted and given a `p_scope` argument. Core folded into the verb; A.2 re-derived
  ten → **seven**.
- **GM-1 → D-25** `(42P11, statement_shape)` added; F.3 re-cut per payload · **GM-2 → D-24** the plan
  census re-scoped to catalog relations; C7/F.6(a)/F.8 re-cut · **GM-3 → D-23** B6 cut and re-aimed ·
  **GM-4 → D-27** F.7's vacuous cells replaced · **GM-5 → D-26** the human read policy was inert
  without a table grant · **GM-6** the cite batch (`0011:3931-3932`, `0002:482-493`/`:491`,
  `0002:553-559`, `0011:1164`, `pools.mjs:136-142`/`:291-293`/`:326-334`,
  `chatTurn.v10.infra.ts:40`, the contract's `:228-260`), plus the C3 contradiction and C11's
  ROLE-key extension.
- **Width (D-22):** the cross-client sibling verb severed to v2 — **narrower than TA-P9 A(2),
  dissent recorded**. The bytes lens's other severance proposals were DECLINED and the grounds are
  in the gate record: the crude dashboard page (TA-P14 c2 + TA-P4 A(4) require the door), the plan
  census (the only wall over `pg_proc.prosrc`), the fourth pool (survey F7 makes it unavoidable).
- **Structure:** design §4 moved to Annex E.2 and §8's OQ block + §9 to Annex J, to keep every file
  under 500 lines with the annex map current.

### v1 (2026-08-22) — the design of record opens

Written against `main` at `cfa0710` under the 2026-08-22 Track-A sitting. Sources read at the bytes:
the contract §F-A6 (cited then as lines 100-106; the live block is **228-260**, trued at the gate),
`ARCHITECTURE.md:87-90,143`, the sitting rulings TA-P1/P3/P4/
P9/P10/P13/P14 and the agenda's member tables for each, the ADR digest (laws 2 · 3 · 28 · 31 · 34 ·
36 · 68 · 71-76), F-A2's design of record and its three annexes as the discipline model, and the
migration/runtime/dashboard estate recorded in `freeform-read-survey.md`.

**Three things this version deliberately does NOT do.** It does not settle the four owner questions
(design §8) beyond a recommendation and a fail-closed default — under the standing delegation the
build proceeds on the recommendation unless a law or a ruling would change. It does not assert any
Postgres behaviour it could not read in this repo — nine such claims are carried as predictions
(Annex I) and the PR-0 gate is the instrument. And it did not start: **the build waited on the
owner's digest sign-off of the two constitutional amendments** (TA-P1 C's open register; TA-P7 C's
attribution-is-judgement), because TA-P1 C is what makes "default-on, no per-firm signature gate"
lawful for this verb. **PREREQUISITE SATISFIED 2026-08-22 — the owner RATIFIED laws 78-81 + the
rider R-TA-P1-walls; the build is unblocked on this axis.**

---

## Annex I · The predictions the PR-0 rig replay must answer

**P-1 … P-9** are stated in `freeform-read-survey.md` §5 (zero rows in `freeform_read_log` · the
PUBLIC-EXECUTE census by catalog · the 30-table accumulated surface · the cursor's multi-statement
refusal · `SET ROLE` inside a definer checking the session user · role-pinned policies neither
widening nor bypassing · node-pg's extended protocol · the Supavisor ceiling · the
`_agent_read_admitted` allowlist bypass). This annex adds the ones the DESIGN introduces:

- **P-10** `_freeform_admitted()`, declared STABLE with no arguments, is evaluated **once per
  statement** and not once per row, on the pinned PG 17 image — measured over a
  `journal_lines`-sized relation, not assumed from the volatility class.
- **P-11** `explain (format json)` names **every** relation a query touches, including those inside
  sub-selects, CTEs and set operations, in a walkable position — and a query the role may not read
  fails EXPLAIN at 42501 rather than returning a partial plan.
- **P-12** `57014` (statement_timeout) raised inside `fetch` **is catchable** by a plpgsql exception
  handler, so the timeout can commit a typed receipt instead of aborting; and `lock_timeout` behaves
  the same way. If either is false, `read_timeout` moves from Tier B to Tier D and the receipt for a
  timed-out read is lost — a material change to the audit claim, not a detail.
- **P-13** a txn-local GUC set by `_freeform_arm` (a SECURITY DEFINER) is visible to the RLS policy
  expressions evaluated later in the same transaction, and is **gone** at COMMIT/ROLLBACK — proven
  in both directions, including across a `SAVEPOINT` rollback inside the same transaction.
- **P-14** revoking `insert on clara.freeform_read_log from clara_runtime` and dropping
  `p_freeform_read_log_runtime` breaks **nothing**: no runtime code path and no test asserts either
  (the repo search finds only the three `GOVERNED_TABLES` rosters). Measured against the full estate
  suite, not against a grep.
- **P-15** a `CREATE POLICY` on `journal_lines` under a live posting lane completes inside the
  `lock_timeout` on the ceremony host, or fails fast and retries — measured on the rig with a
  concurrent writer, so the §6 claim is a measurement rather than a hope.

**Added by the fold (design v2):**

- **P-16** `OPEN … FOR EXECUTE` on a multi-statement string refuses at PREPARE **without executing
  any part of it** (the stacked `drop`/`create temp`/function-call statements leave no trace), and
  opening a portal produces no rows and runs no volatile function before the first FETCH. Both
  halves, on the pinned PG 17 image — D-18's whole ordering rests on them.
- **P-17** a DEFERRABLE INITIALLY DEFERRED constraint trigger fires at COMMIT and aborts a
  transaction that leaves a receipt unsettled — proven in both directions (settled commits;
  unsettled aborts), including after a SAVEPOINT rollback.
- **P-18** the exact SQLSTATE of each F.3(a)-(h) payload, printed, not assumed — the Tier-C pair set
  (Annex D.2) is a prediction until this runs, and any disagreement re-cuts the table before the
  law-28 pass.
- **P-19** a `set_config(…, false)` issued from inside the payload **outlives the transaction on the
  same backend** (so `withFreeformRead` must reset on release), and a payload-set `statement_timeout`
  cannot extend the current statement but does affect the next FETCH — the reason the deadline is a
  plpgsql clock check (R-9, D-20).
- **P-20** the settle-once trigger permits exactly the unsettled→settled transition and refuses
  every other UPDATE (including an arm-phase column change inside a lawful settle), every DELETE and
  TRUNCATE — all arms measured, not asserted.

---

## Annex J · The owner questions, the registered risks, the named non-goals

*(Folded out of design §8/§9 at v2 so every file stays under 500 lines. The design carries the
one-line index; the full text is here. Under the standing delegation the build proceeds on each
recommendation unless a law or a ruling would change — the two escalations say so explicitly.)*

**OQ-A — who mints `interactive_client` for the freeform call?** *Recommendation:* the freeform call
path mints its own short-TTL `interactive_client`, leaving every other tool in the turn on plain
`interactive` — an **addition** to F-A2's R-1 enumeration (one call path becomes two), not a
weakening, stated in the PR against R-1's record. *Fail-closed default if the lead declines:*
HOME-only, no client pin. *Escalate only if:* the lead reads R-1 as closed to additions — an F-A2
ruling, not this design's.

**OQ-B — does the enumerated list include the metric catalog and the close/period tables?**
*Recommendation:* yes for close/period/fiscal-year and the bank estate (they are what "ask anything
about the books" means), no for the metric catalog in v1 — F-A5 owns the formal reporting surface
and should rule its own read, and until F-A5 names a lawful evaluate entrypoint the free read must
not become the back door to `evaluate_metric_v1`. *Fail-closed default:* Annex A.1 as written;
additions are a review event by law 34's own terms.

**OQ-C — the result cap numbers.** *Recommendation:* 5 000 rows / 1 MiB / 5 s / a rig-calibrated
plan-cost ceiling, tuned once after the acceptance corpus. *Fail-closed default:* those numbers.
Engineering values, not law (the A3-M-60day precedent: build with a number, measure, tune once).

**OQ-D — is the free read a NEW egress class under TA-P3 A?** *Recommendation:* no — it widens the
data reachable by an **existing** class (the chat turn already sends journal entries to the model
through typed readers); the receipt records a purpose string, so the rows are keyed when TA-P3's
purpose list lands. *Fail-closed default:* that reading, plus R-5 — F-A6 must not be cited as
sanctioning the chat lane's currently ungoverned egress.

**OQ-E (opened by the fold, D-28) — the contract's XLSX/DOCX clause.** The live contract block
(`wave-f-contract.md:263-265`, re-derived against `origin/main` at 6807b39 — the design's
first cut said `:257-259`, which was true of the pre-amendment file) says structured-parse content *"becomes reachable by AI-assisted read
here"*; v1's S-2 exclusion means it is not, through this door. *Recommendation:* hold the exclusion
in v1 — a client pin cannot be compiled on a table with no `client_id`, and the alternative leaks a
sibling client's document body — and build the EXISTS-join arm to `document_filings` in v2.
*Fail-closed default:* excluded, with `read_document` → `get_document_extract` named as the
surviving door. **Escalated:** this is a contract clause the design does not satisfy; the owner
should see the deferral rather than infer it from the words "OCR text or regions".

### Registered risks

- **R-1 — the enumerated list is a moving wall.** Every new table means a code change and a re-run
  of the adversarial pass before "ask anything" can answer about it. That is the ruling's intent
  (TA-P9 A(2)) and its honest cost: the free read is briefly blind to new estate.
- **R-2 — the plan census is a second parse, and a CATALOG-only wall** (re-stated at the fold,
  D-24). Two parses per read; for anything ungranted `EXPLAIN` fails 42501 at planning, so the
  refusal arrives one wall earlier than a reader expects and `relations_read` is NULL. Both facts
  must be visible in the receipt rather than smoothed over in prose.
- **R-3 — text identity is a body invariant, not a structural one** (design §3.4). Belt: ONE body,
  one variable, one forcing cell (F.4) plus the runtime census that `withFreeformRead` is the only
  caller of the freeform pool. NOTE-3 TRUE (independent review): the built body DOES factor a
  shared core out, `clara._freeform_core` (§0.1b(7), v2-readiness) — "no shared core" no longer
  holds; the invariant is that it has exactly ONE caller (`_freeform_arm`), not that it is absent.
  If either belt is dropped the receipt can describe a read that did not happen — the audit
  control's worst failure.
  **S-1 residual (independent review, this PR; wording CORRECTED + one primitive ADDED, narrow
  re-review round) — R-3 DOES NOT CLOSE outside the verb.** `_freeform_arm`/`_freeform_settle` are
  GRANTED directly to `clara_freeform_ro` (forced by the INVOKER chain, D-20/§0.2), so anyone who
  can authenticate as `clara_freeform_login` can call either DIRECTLY, skipping
  `wake_freeform_read`'s own cursor/census/fetch sequence entirely, and arm and settle a receipt
  describing a read the walls above never ran. CORRECTED: arm and settle must be the SAME
  transaction — `_freeform_settle` keys on `arm_txid = pg_current_xact_id_if_assigned()` with no
  read-id argument, so a settle call in a later transaction matches no row and no-ops; "its own
  separate transaction" (an earlier cut of this note) was wrong. A second, narrower primitive,
  measured this round: a payload can call `_freeform_settle` from INSIDE its own composed SQL at
  FETCH, which settles the row `_freeform_arm` already armed and collides with the verb's own
  single settle call — `double_settle`, whole transaction aborts. Net effect is DENIAL, not
  forgery: the payload can make its own read leave no receipt (Tier-D family) but cannot describe
  a read that did not happen through this path. D-20's one-arm/one-settle-per-transaction forgery
  closure holds against a payload riding inside the verb's own composed SQL for BOTH primitives;
  it does NOT hold against a caller that never enters the verb at all. **NAMED OBLIGATION FOR
  PR-2**: `withFreeformRead` must call ONLY `wake_freeform_read`, never
  `_freeform_arm`/`_freeform_settle` directly, on every code path — a runtime-wiring discipline
  the DB layer cannot itself enforce (the grant is structural, not a string check). Full text:
  the migration body, right before `v_composed := format(...)`.
- **R-4 — a fourth pool costs connections and a password ceremony.** +2 against a budget of 19 whose
  ceiling is unmeasured (P-8), and a new fail-closed DSN in `assertProductionPoolConfig`: a world
  that boots without it must refuse to start, so the ceremony precedes the image.
- **R-5 — egress posture inherited, not fixed** (OQ-D).
- **R-6 — `interactive` only means the unattended lanes get nothing here**; TA-P9 A(3) makes a later
  widening its own named ruling, and the clock-driven lanes (F-A3/F-A4/F-A5's `kind='wake'` tasks)
  are explicitly not carriers for this verb.
- **R-7 — a wall never asked is not a wall (law 31).** Several rungs have a zero population today.
  The battery forces every one non-vacuously **except `scope_unpinned`, which is published as
  DECLARED UNREACHABLE** (D-23) rather than banked as a green.
- **R-8 — the `basis_kind` mislabel residual** (new at the fold, GM-4). `client_facts.basis_kind` is
  a closed four-value CHECK (`0055:395-396`), so a human can still record a freeform aggregate under
  `owner_instruction`. A human mislabel, detectable through the receipt and the rationale citation —
  never a door the model can open.
- **R-9 — payload-set session state on a pooled backend** (new at the fold, D-20). A non-local
  `set_config` from inside the payload outlives the transaction; `withFreeformRead` resets on
  release **with `DISCARD ALL`, not `reset all`** (S-4/H-5, independent review: `reset all` does
  not release a session advisory lock a payload took on a well-known firm-derived key — an
  advisory lock is not GUC state), the read deadline is a plpgsql clock check rather than a GUC
  (H-4: a session-level `statement_timeout` set by the pool BEFORE the call is the wall that
  actually bounds a single stalled FETCH — a `SET LOCAL` inside the verb cannot, PG arms the
  statement timer once at the top-level statement's start), and F.3(k) forces both.

### Named non-goals

No chart or table part type (`PART_CATALOG` untouched — the SQL is already visible in the
`tool_call` chip; charts are **F-A5**) · no export, no watermark, no claim-policy row (all **F-A5**,
TA-P10's other half) · no second metering ledger (**TA-P13 A / F-A9**) · no per-asker RBAC tier and
no per-firm signature gate (TA-P9 A(4), TA-P1 C) · no natural-language-to-SQL rewriter, no
restricted DSL (ADR-0071 fixed the shape) · no widening of `clara_agent_ro` · no change to any live
wake body · no wiki relations in the enumerated list (`0017:1424-1426` stands) · no OCR text,
regions or XLSX/DOCX structured-parse content in v1 (S-2's client-scope gap — D-28/OQ-E, and the
contract clause it defers). **The cross-client sibling verb is NOT a non-goal — it is a named v2
deliverable** (D-22).
