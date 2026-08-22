# F-A6 annexes 1 — the enumerated surface, the arms, the receipt, the vocabulary

> Companion to `freeform-read-design.md` (**v2, 2026-08-22 — gate 2 folded (record:
> `freeform-read-gate-record.md`)**). **A** the enumerated surface (the law-34 audit line) ·
> **B** the RLS arms · **C** the receipt columns · **D** the refusal vocabulary · **E** the ops
> recipe **+ E.2 the censuses that move** (folded out of design §4). Sibling:
> `freeform-read-annexes-2-record.md` (**F** battery · **G** decision register · **H** change log ·
> **I** predictions · **J** owner questions, risks, non-goals). Estate: `freeform-read-survey.md`.
>
> **Standing caveat, inherited from F-A2.** Every list below is a **proposal measured from
> migration source**; the migration's own tail prints the list it actually installed, and the PR-4
> record publishes that printed line — not this file. Where the two differ, the printed line is the
> truth and this annex is the bug.

---

## Annex A · The enumerated surface

### A.1 · Relations — the readable list (law 34: enumerated, printed, addition = a review event)

**35 relations, in eleven bands** (counted from the table below, not asserted). Each is granted `SELECT` to `clara_freeform_ro` and carries
exactly one `p_<t>_freeform` policy in the arm named. Nothing else in the 202-table schema is
readable, by grant or by policy.

| band | relations | arm |
|---|---|---|
| the books | `journal_entries` · `journal_lines` · `coa_accounts` · `journal_entry_revisions` | S-1 |
| documents as filed | `documents` · `document_filings` | S-1 |
| evidence + identity | `entry_evidence` · `counterparties` · `counterparty_aliases` | S-1 |
| the subledger | `open_items` · `open_item_allocations` | S-1 |
| bank | `bank_accounts` · `bank_statements` · `bank_statement_lines` · `bank_matches` · `bank_match_line_members` · `bank_match_entry_members` · `bank_reconciliations` · `bank_line_exceptions` | S-1 |
| assets + advances | `fixed_assets` · `fa_depreciation` · `staff_advances` · `staff_advance_applications` | S-1 |
| period + close | `fiscal_years` · `close_runs` · `period_snapshots` · `reporting_periods` · `compliance_watches` | S-1 |
| work in flight | `open_questions` · `coding_tasks` · `notifications` | S-1 |
| the client itself | `clients` | **S-1c** |
| identity | `users` · `firms` | S-4 |
| policy reference | `sst_threshold_schedule` | S-3 |

**`clients` is its own arm and the reason is a silent-bug class**: it has no `client_id` column
(survey §3.5), so the pin must compare `id`, not `client_id`. Written as S-1 it would be scoped by a
column that does not exist (a migration error) or — worse, if someone "fixes" it by dropping the
conjunct — return every client in the firm from inside a client-pinned session. F.5 forces both
directions.

**Excluded in v1, each with its ground** (the exclusion list is part of the audit line):

| excluded | ground |
|---|---|
| the seven wiki relations | `0017:1424-1426` is a live decision: *"no table SELECT grant is given to clara_agent_ro; wiki reaches the agent only through the FORK-6-gated context pack"*. F-A6 does not reverse it, and the wiki dynamic-SQL gate's waiver (design §4 / E.2's C7) rests on this exclusion — the refusal a wiki payload actually takes being `(42501, relation_denied)`, GM-2 |
| `document_extractions` · `document_regions` | firm-scoped only; under a client pin they would expose a sibling client's OCR **and structured-parse (XLSX/DOCX, `monetary_cents: null`)** content (survey §3.5, shape S-2). This is the contract's `:257-259` clause, named as a deviation in design §3.4 / D-28 / OQ-E; `read_document` → `get_document_extract` remains the door, and the v2 shape is the EXISTS join to `document_filings` |
| `domain_events` | event payloads are a redaction question of their own; typed history reads exist. A named v2 candidate |
| the `0058`/`0059` metric catalog (nine tables) | F-A5 owns the formal reporting surface and should rule its own read (design OQ-B) |
| `audit_log` · `op_receipts` · `freeform_read_log` | the audit spine is read by humans through its own floors, never by the model composing SQL over it; a model that can read the receipt table can read every other firm-mate's query text |
| `wake_credentials` · `wake_fn_allowlist` · `firm_admissions` | the authority spine. `wake_credentials` holds secret hashes |
| `chat_sessions` · `chat_messages` · `agent_tasks` · `task_usage` · `trace_spans` | the runtime's own state; `chat_messages` would let one turn read another user's private session |
| `firm_memberships` | a firm-roster read is `users` + a typed reader's job; the membership table is the maker/checker substrate |
| `llm_usage_events` · `firm_usage_daily` | metering is F-A9's surface (TA-P13 A) |
| everything else (≈130 relations) | not asked for; addition is a review event by law 34's own terms |

### A.2 · Functions — the EXECUTE list for `clara_freeform_ro` (exactly SEVEN, re-derived in the fold)

| function | why the role needs it |
|---|---|
| `clara.wake_freeform_read(text,text,uuid,text,int)` | the ONE verb — HOME and client-pinned alike |
| `clara._freeform_arm(text,text,uuid,text)` | DEFINER; INSERTs the armed receipt, arms the capability |
| `clara._freeform_settle(text,int,bigint,text[],int,jsonb)` | DEFINER; the ONE permitted settle UPDATE |
| `clara._freeform_scope_client()` | STABLE; the compiled pin, read by every policy |
| `clara._freeform_admitted()` | STABLE; the receipt-armed conjunct, read by every policy |
| `clara.wake_firm()` | the firm conjunct (`0011:1199-1205`), read by every policy |
| `clara.shares_my_firm_wake(uuid)` | the `users` arm's firm conjunct (`0004:762` grants it to `clara_agent_ro` only today — PR-1 adds this role) |

**Why the count moved from ten to seven (D-21, gate blockers GB-1/GB-2).** `wake_freeform_read_
cross_client` is severed to v2 (D-22). `_freeform_read_core` is **gone as an object**: v1 called it
"ungranted" in the design, listed it in this table as granted, and gave it a `p_scope text`
argument — three statements that could not all be true, and under the granted reading the model
could have called the core directly with `p_scope => 'cross_client'`. With one verb there is nothing
to share, so the core is folded into the verb body. `wake_client()` is dropped: **nothing in the
invoker layer or in any Annex-B policy arm calls it** — the pin is compiled by
`_freeform_scope_client()`, and `_freeform_arm` is a DEFINER that needs no grant to read the
credential. Both DEFINER writers stay granted because a SECURITY INVOKER caller forces it (design
§3.2); what makes them unforgeable is the one-arm/one-settle structure, not the grant. **The
migration's printed line is the truth and this table is the bug** (standing caveat) — if the build
finds a policy arm that genuinely needs `wake_client()`, the printed count is eight and this row
comes back as an extension, never as a silent difference.

**And nothing else — that is the point.** `get_context_pack`, `trial_balance`, `coding_lane` and the
rest of the typed surface (survey §3.3) are granted to `clara_agent_ro`, **not** to this role, so a
composed `select clara.get_context_pack('<another client>')` refuses `42501` → Tier C
`function_denied`. F.6 forces it on a live signature.

**PUBLIC's implicit EXECUTE is the residual** (survey §3.4): a function whose `proacl` is NULL is
executable by this role too — `set_config` among them, which is why design §3.2 treats the payload's
function surface as part of the wall. PR-1's tail re-asserts `wave-a-grants.test.mjs:63-70`'s census
**by count, printed** (P-2) and adds a role-specific arm: `has_function_privilege('clara_freeform_ro',
oid,'EXECUTE')` is true for exactly the seven above and false for every other function in `clara`.

---

## Annex B · The RLS arms

```sql
-- S-1  firm + client (the bulk)
using (firm_id = clara.wake_firm()
       and (clara._freeform_scope_client() is null
            or client_id = clara._freeform_scope_client())
       and clara._freeform_admitted())

-- S-1c clients — the pin compares id, not client_id
using (firm_id = clara.wake_firm()
       and (clara._freeform_scope_client() is null
            or id = clara._freeform_scope_client())
       and clara._freeform_admitted())

-- S-3  global reference (no firm column, or a nullable one)
using ((firm_id is null or firm_id = clara.wake_firm())     -- omit the disjunct where no column
       and clara._freeform_admitted())

-- S-4  identity
--   users: the 0002:499-500 idiom, resolved against the caller's OWN firm internally
using (clara.shares_my_firm_wake(id) and clara._freeform_admitted())
--   firms:
using (id = clara.wake_firm() and clara._freeform_admitted())
```

**Why `_freeform_admitted()` is safe to put in a policy.** It takes no arguments and is STABLE, so
it is a per-statement constant expression, not a per-row call; it reads a txn-local GUC set by
`_freeform_arm` and verifies that the transaction holds a matching receipt row. **P-6 must prove the
per-statement claim on the pinned image** (an accidental per-row call over `journal_lines` would be
a performance wall, not a security one — but it must be measured, not assumed).

**Why the conjunct is what makes TA-P4 structural.** Without it, "no receipt, no read" is a property
of one function body. With it, every enumerated relation returns **zero rows** in any transaction
that has not armed a receipt — whatever statement is issued, by whatever code path, through the verb
or not. That is the strongest reading of the ruling's *"写不出收据就不准跑"*, and it is stronger than
the DEFINER wrapper the ruling's parenthetical named. **The DEFINER wrapper is still there** — it is
`_freeform_arm`, and it is the thing that cannot be skipped.

**`shares_my_firm_wake(id)` is granted to `clara_agent_ro` only today** (`0004:762`), and the
`users` arm cannot be written without it. **D-16 stands as a decision and is re-derived in the
fold: keep `users`, grant the function — it is one of the SEVEN** (A.2). The alternative was to drop
`users` and hold the list one shorter; refused, because *"who asked this?"* is a question the free
read is expected to answer, and a name join is cheaper than a typed reader per question. The choice
is printed rather than rounded: PR-1's audit line prints both counts (relations, functions) and the
gate re-derives them from the catalog.

---

## Annex C · `clara.freeform_read_log` after the ALTER

```
-- kept from 0002:308-315
id             bigint generated always as identity primary key
firm_id        uuid        not null          -- WAS nullable (TA-P4 A)
credential_id  uuid        not null          -- WAS nullable; the wake credential in force
query_text     text        not null check (btrim(query_text) <> ''
                                    and length(query_text) <= 20000)   -- WAS nullable
purpose        text        not null check (btrim(purpose) <> ''
                                    and length(purpose) <= 500)        -- WAS nullable
at             timestamptz not null default now()
-- added, ARM phase (set by _freeform_arm, never nullable)
verb           text        not null check (verb in ('wake_freeform_read'))   -- v2 EXTENDS (D34 idiom)
scope          text        not null check (scope in ('client','firm'))       -- v2 adds 'cross_client'
client_scope   uuid                          -- NULL iff scope <> 'client'; never false-by-inference
acting_actor   uuid        not null references clara.users(id)   -- clara.agent_user_id()
on_behalf_of   uuid        references clara.users(id)            -- the ASKING human, from the OBO
                                                                 -- credential; NULL only where no
                                                                 -- director exists (law 68)
via_wake_kind  text        not null check (via_wake_kind in ('interactive','interactive_client'))
task_id        uuid        not null          -- the chat turn's agent_tasks row: TA-P4's mechanical
                                             -- binding of who/why to the triggering act
op_key         text        not null
model_snapshot jsonb       check (model_snapshot is null or (jsonb_typeof(model_snapshot)='object'
                             and btrim(coalesce(model_snapshot->>'provider','')) <> ''
                             and btrim(coalesce(model_snapshot->>'model','')) <> ''
                             and btrim(coalesce(model_snapshot->>'version','')) <> ''))
-- added, SETTLE phase (NULL while armed; written by the ONE permitted UPDATE)
settled_at     timestamptz                   -- the phase discriminator
outcome        text        check (outcome in ('ok','refused','error'))
refusal_reason text                          -- a token from Annex D; NULL iff outcome='ok'
rung_vector    jsonb       check (rung_vector is null or jsonb_typeof(rung_vector)='object')
relations_read text[]                        -- from the plan census; NULL where no plan existed
row_count      int         check (row_count is null or row_count >= 0)
byte_count     bigint      check (byte_count is null or byte_count >= 0)
duration_ms    int         check (duration_ms is null or duration_ms >= 0)
constraint ck_freeform_scope_client check (
  (scope = 'client' and client_scope is not null)
  or (scope <> 'client' and client_scope is null))
constraint ck_freeform_settled check (          -- phase-aware: every settle column together
  (settled_at is null and outcome is null and rung_vector is null
   and refusal_reason is null and row_count is null and byte_count is null)
  or (settled_at is not null and outcome is not null and rung_vector is not null
      and ((outcome = 'ok' and refusal_reason is null)
           or (outcome <> 'ok' and nullif(btrim(refusal_reason),'') is not null))))
```

**The phase model is the fold of gate blocker GB-4 (design §3.6, D-17).** v1 declared `outcome` and
`rung_vector` NOT NULL, gave `_freeform_settle` a `p_read_id` and had it "append the completion
row", and attached the generic `_tf_append_only` — four requirements no builder could satisfy at
once, because none of the settle values exist when `_freeform_admitted()` must already be true.
Now: ARM inserts, SETTLE updates once, and the phase is a column.

Triggers and grants:

- **`_tf_freeform_settle_once`** (purpose-built, **not** `0003:428-435`'s unconditional
  `_tf_append_only`): an UPDATE is permitted only when `OLD.settled_at is null`,
  `NEW.settled_at is not null`, and no arm-phase column changed; every other UPDATE and every
  DELETE raise `CLR08`; TRUNCATE is refused as elsewhere in the estate (P-20 forces both arms).
- **`_tf_freeform_must_settle`** — a **DEFERRABLE INITIALLY DEFERRED** constraint trigger raising at
  COMMIT on any row still unsettled, so no read commits behind an unfinished receipt (P-17).
- An index on `(firm_id, at desc)` and one on `(client_scope, at desc)`; **the drop of
  `p_freeform_read_log_runtime` and the revoke of `0002:542`** (design §3.2).
- **ONE new policy, not two** — the constant-true owner policy already exists from the
  `0002:482-493` loop. The new one is `for select to clara_authenticated` carrying the bookkeeper+
  floor exactly as `p_audit_log_human` does (`0002:517-520`), ARM-0 first:
  `coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper')` — **and with it the table
  `grant select on clara.freeform_read_log to clara_authenticated`**, which v1 omitted, leaving the
  floor unreachable behind a `42501` (GM-5; `audit_log`'s precedent is grant *and* policy,
  `0002:536`).

**The model-name CHECK is written with TWO apostrophes.** F-A2's R-3 lost this exact wall to a
four-apostrophe typo (`coalesce(x,'''')`), which made the conjunct read *"the model name, defaulted
to the two-character string `''`, is not empty"* and always pass. F.9 forces it.

**A Tier-A raise leaves NO row at all** — it aborts the transaction, receipt included, and the
runtime's task record is the honest home (design §3.5 Tier D). v1's sentence here described a row
with NULL counters "on a Tier-A raise"; that row cannot exist and the sentence is deleted. On a
COMMITTED row `row_count`/`byte_count` are non-null whenever `outcome='ok'`, and NULL there is a
defect the read surface must show rather than hide.

---

## Annex D · The vocabulary

### D.1 · Tier B — the admission rungs (typed receipt, the transaction commits)

| rung | what it tests | token |
|---|---|---|
| B1 | the composed text OPENED as a single-statement cursor — evaluated by attempting the open and catching `42P11`, the first step in the body (design §3.3, D-18) | `statement_shape` |
| B2 | every relation the plan names is in A.1 — **non-vacuous only for PUBLIC-readable catalog relations**; anything ungranted refuses one wall earlier at `(42501, relation_denied)` (D-24) | `relation_not_enumerated` |
| B3 | the plan's estimated cost / row estimate is under the ceiling | `plan_cost_ceiling` |
| B4 | the fetched row count is under the cap | `result_row_cap` |
| B5 | the accumulated result bytes are under the cap | `result_byte_cap` |

**B6 `scope_unpinned` LEFT this table in the fold (D-23, gate material GM-3).** Its only fixture
would be an `interactive_client` credential with a NULL `client_id` — a row F-A2's D34 CHECK forbids
every writer from creating, so forcing the rung meant dropping the wall it rides on. It survives as
a **Tier-A declared-unreachable assert** (design §3.5), and the failure it was named for — a
client-bound session that fell back to plain `interactive` — is invisible to the DB by construction
and is walled in the runtime mint census instead (design §3.8).

Each rung is `pass` / `fail` / **`not_evaluable`**; only an empty failing vector reads. A rung whose
input is absent is `not_evaluable`, never `pass` — B2 with no plan (the EXPLAIN refused) is the
sharpest instance, reported distinctly rather than collapsed into B1, with `relations_read` NULL.

### D.2 · Tier C — conversion, on `(sqlstate, reason)` PAIRS ONLY

| pair | site | meaning |
|---|---|---|
| **`(42P11, statement_shape)`** | the cursor OPEN | *"cannot open multi-query plan as cursor"* — the pair v1 omitted, without which every injection attempt re-raised and left NO receipt (GM-1) |
| `(42501, relation_denied)` | the EXPLAIN (usually) or the cursor | a relation outside the grant — and, for everything but PUBLIC catalog relations, the wall that fires INSTEAD of B2 |
| `(42501, function_denied)` | the cursor | a function outside A.2 (`get_context_pack`, a writer, anything) |
| `(42P01, unknown_relation)` | the cursor | a name that does not exist — never distinguished from "not enumerated" **in the message to the model** (an oracle) but recorded distinctly in the receipt |
| `(42601, malformed_statement)` | the cursor | the model wrote broken SQL — **and the derived-table trap's own output**: `set role` / `reset role` / a bare `insert` become SYNTAX errors, so those payloads land here, never on `statement_shape` (GM-1) |
| `(57014, read_timeout)` | the fetch | `statement_timeout` |
| `(0A000, feature_not_permitted)` | the cursor | e.g. a data-modifying CTE |

**No wildcards and no sqlstate-only members** — F-A2's D6: a `(CLR25, *)` classifier once swallowed
a money wall. Anything unmatched **re-raises**; the task settles `failed` with the raw
`(sqlstate, reason)` recorded by the runtime, never a receipt that names the wrong reason.

**Oracle discipline.** The message returned to the MODEL is one string for the whole
denied/unknown/not-enumerated family (`safeRead`'s existing shape,
`chatTurn.v10.errors.ts` `readToolRefusalMessage`), so a probing prompt cannot use refusal text to
learn whether a relation or a row exists. The RECEIPT records the exact pair. F.8 forces both halves.

**Every pair is a PREDICTION until P-18 prints it.** The exact SQLSTATE of each F.3 payload is
measured on the pinned PG 17 image at PR-0/PR-1; where a measurement disagrees with this table, the
measurement wins and the pair set is re-cut before the law-28 pass re-runs.

### D.3 · Tier A raises

`CLR03` no credential · `CLR03` wake kind not allowlisted for the verb · `CLR10` blank/oversize
`p_sql`, blank `p_purpose`, blank `p_op_key`, `double_arm`, **`double_settle`**,
**`cross_client_unavailable`** (the v2-deferred action, NAMED in the message) ·
**`scope_unpinned`** (declared unreachable, D-23) · `CLR10`/`CLR11` `p_task` absent, foreign-firm,
or not live. **`scope_redundant` is GONE** — it existed only for the severed sibling verb.

---

## Annex E · The ops recipe, and the censuses that move

### E.1 · The apply

**The fourth login.** `clara_freeform_login` is created NOLOGIN by PR-1 (the `0006:59-79` idiom);
the operator enables LOGIN + a password **out of band** and supplies
`CLARA_FREEFORM_DATABASE_URL`. `assertProductionPoolConfig` (`pools.mjs:100-110`) gains it as a
fourth fail-closed member — **so the ceremony precedes the image**: a world that boots without the
DSN must refuse to start, exactly as the Slice-6 write floor does. Pool max 2 (budget 19 → 21,
against a ceiling P-8 must measure).

**The apply.** From merged `main`, in a low-traffic window, under an explicit `lock_timeout` with a
bounded retry: `CREATE POLICY` takes ACCESS EXCLUSIVE on each of the 35 relations, several of them
hot. A blocked statement must fail fast rather than queue ahead of the posting lane. **No D1
write-quiesce is required — no live body is CoR'd** (design §6). Standing hazards that still apply
if this rides an F-A2 ceremony window: the DSN bridge and the 110 s quiesce, `fly.exe`'s non-zero
exit after a successful non-tty `ssh -C`, the post-restart zombie-pooler sweep, `PG*` vars (never
`DATABASE_URL`) for rig runs, and the reconciler herd against two lane slots.

**The audit line.** The migration's own tail prints, as one notice: the count and the sorted list of
enumerated relations (**35**); the count and sorted list of enumerated functions (**7**, A.2); the
count of allowlist rows for the verb (**2**); and the difference against `clara_agent_ro`'s
accumulated SELECT set (P-3). PR-4 publishes that printed text verbatim — law 34's *"printed as an
audit line"* means printed by the thing that installed it, not retyped by a document.

### E.2 · The censuses that move (folded out of design §4, re-derived at the gate)

| # | census | instrument | what PR-1 must do |
|---|---|---|---|
| C1 | non-sanctioned `clara_` role count, hard-equal **7** | `er9-gates-boundaries.test.mjs:443-458` | → **9**; the same derived cell then proves both new roles hold zero EXECUTE on every close verb |
| C4 | login-shell audit + the "must NOT set role ⟨other⟩" loops | `rig-runtime-catalog.test.mjs:67-130`, `rig-runtime-helpers.mjs:268`, `rig-runtime-meta.mjs:161` | add `clara_freeform_login → clara_freeform_ro`; every existing login gains the negative arm — extend-never-weaken, both directions |
| C5 | `appRoles` hand-list in the delta writer-reachability census | `delta-catalog-phase.mjs:402` | add the new role, and say so in the PR (a role invented later escapes silently) |
| C7 | wiki dynamic-SQL gate, **one** allowlist entry today | `scripts/wiki-lint-checks.mjs:101-124` | a **SECOND** entry, justified by the ACL not the text: `clara_freeform_ro` holds no SELECT on any of the seven wiki relations, upholding `0017:1424-1426`. **The refusal a wiki payload actually takes is `(42501, relation_denied)`** — v1 said `relation_not_enumerated` then `42501`, which the mechanism cannot produce (GM-2) |
| C11 | strict role→function grant-matrix cohorts **and the `ALLOWED` role-KEY it iterates** | `rig-meta.mjs:900-916`, `ALLOWED` at `:811` iterated at `:1024` | add the new verbs' cohort **and both new roles as KEYS** — a role absent as a key is never probed by the exact-EXECUTE census at all (GM-6) |
| C3 | `GOVERNED_TABLES` ×3 | `rig-meta.mjs:925`, `rig-runtime-helpers.mjs:81`, `rig-docs-helpers.mjs:166` | **UNCHANGED.** F-A6 creates no new table — it ALTERs the existing `freeform_read_log`. v1's design §4 claimed these rosters "gain the new objects", contradicting its own §7 and F.12 (GM-6) |
| C10 | WCA-R1 zero-agent-grant tails | `0040:4947-4950` + the `0038` twin | unchanged — F-A6 grants `clara_agent_ro` nothing, a positive argument for the new role |
