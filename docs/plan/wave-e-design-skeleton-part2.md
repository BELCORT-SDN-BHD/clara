# WAVE E — DESIGN SKELETON v1 · **PART 2** (§2.7–§6)

> **CONTINUATION of `wave-e-design-skeleton.md` — one document in two files** (the repo's
> 500-line file discipline; the `wave-d-b-asbuilt.md`/`-part2.md` split precedent). Part 1 carries
> §0 (verification ledger + the three corrections) · §1 (campaign frame, lanes, ceremony) ·
> §2.1–§2.6 (period spine, gates, drawers, continuity). **This file carries §2.7–§2.11 (receipts,
> reopen, E-R6 activation, keys, snapshots) · §3 (the E-R12 trio) · §4 (lane θ) · §5 (E-b/E-c
> pointers) · §6 (open questions + decisions).** Section numbers are continuous across the two
> files; a citation like "skeleton §2.9" resolves here. All of Part 1's status banners, markers
> and evidence discipline apply unchanged: the contract wins; EXISTS claims carry file:line reads
> taken 2026-08-09; migration numbers claim at MERGE.

### 2.7 The close receipt family — mirroring the 0040 triad

*(Standing architectural decision, per the campaign frame: close receipts mirror the 0040
bank-recon triad.)*

**`clara.close_receipts`** — immutable output row:

```
id uuid pk · firm_id · client_id · fiscal_year_id · close_run_id
prior_close_receipt_id uuid references clara.close_receipts(id)   -- the chain link
kind text check (kind in ('close','reopen'))
status text not null default 'active' check (status in ('active','superseded'))
closed_by uuid not null references clara.users(id) · closed_at timestamptz not null default now()
segregation_mode text check (segregation_mode in ('two_person','solo_self_attested'))
last_preparer_actor uuid · self_attestation text
pl_net_cents bigint not null · retained_earnings_account text not null
closing_tb_digest text not null · gate_digest text not null · books_watermark text not null
close_entry_id uuid references clara.journal_entries(id)
snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object')
```

- **Money is `bigint` cents** everywhere (PRD invariant 6, restated at E-R5).
- **`snapshot`** carries the full enumerable evidence: every gate result + its measured payload,
  every attestation (who/why/when), the per-account closing TB, the per-asset FA continuity roll,
  the AR/AP tie terms, and the bank-recon receipt ids consumed. The 0040 posture applies: the DDL
  demands *some* object payload; **enumeration completeness is the belt's job**, asserted by a
  trigger, not by a CHECK (`0040:290-296`).
- **Immutability:** two triggers mirroring `_tf_bank_reconciliation_transition` (`0040:351`,
  whole-row-minus-lifecycle-columns compare) and `_tf_bank_reconciliation_no_delete` (`0040:379`).
  The only permitted transition is `active` → `superseded`, and only by `reopen_fiscal_year`.
- **`clara.verify_close(p_receipt uuid) returns jsonb`** — recomputes every identity **from scratch**
  and diffs recomputed-vs-stored, never re-deriving from the snapshot it is checking
  (`verify_bank_reconciliation`'s discipline, `0040:4537-4644`). Split: a **STRICT half** (the four
  drawer-1 identities + the RE roll + the opening tie) that fails `verified`, and an
  **INFORMATIONAL half** (drawer-3 counts, enumeration drift) that is reported and never fails.
  This is the seven-year answer to "was this year really closed clean".

### 2.8 The reopen path *(key ③ — ruled, E-R11)*

`clara.reopen_fiscal_year(p_fy, p_reason, p_correction_target jsonb, p_op_key)` requires all four:

1. **Key ③** (§2.10) — else `CLR04 capability_missing`.
2. **A stated reason** — non-empty after `btrim`, minimum length enforced; else `CLR10`.
3. **A named correction target** — `p_correction_target` must resolve to real rows in **this**
   client (entry ids / a document id / a gate `check_key`), validated by existence, not accepted as
   free text; else `CLR10 reopen_target_missing`. A reopen whose target is prose is a reopen nobody
   can audit.
4. **The ordering guard** — refuse if **any later FY of the same client** is `closing` or `closed`
   (`CLR41 reopen_ordering_violation`). This is ARCHITECTURE §3.6's GAP5-3 fix stated as a
   predicate: you cannot reverse FY(n) under a live FY(n+1) close.

Effects, in one transaction under `203005007`: the current receipt goes `active` → `superseded`; a
`kind='reopen'` receipt is chained to it via `prior_close_receipt_id`; `fiscal_years.status` becomes
`reopened`; the closing entry is **reversed, never deleted** through `clara.reverse_entry`
(`0009:1697-1748`) — the audited verb, not a hand-written unwind (PRD invariant 8).

**A reopened FY re-closes through the same path** (`begin_close` → gates → `finalize_close`), so the
second receipt chains onto the reopen receipt and the whole history is walkable.

### 2.9 E-R6 activation — rewriting ONLY the stub body

*(ruled — E-R6.)* The activation is **one function body**: `clara._correction_period_state`
(`0007:2420-2424`). Given §0.3's correction, the new body must keep `'no_period_model'` as the
**PERMIT** token:

```sql
create or replace function clara._correction_period_state(p_entry uuid) returns text
  language sql stable security definer set search_path = clara, pg_temp as $$
  -- The returned string is a PROTOCOL token, not a description. Its spelling is FROZEN by the
  -- live guard in clara.approve_wrong_client_correction, which refuses on <> 'no_period_model'.
  -- Honest state for every other consumer: clara.correction_period_state(p_entry).
  select case
    when fy.id is null                     then 'no_period_model'   -- outside any FY: permitted
    when fy.status in ('open','reopened')  then 'no_period_model'   -- permitted
    else fy.status                                                   -- 'closing' | 'closed': REFUSE
  end
  from clara.journal_entries je
  left join clara.fiscal_years fy
    on fy.client_id = je.client_id and je.posting_date between fy.starts_on and fy.ends_on
  where je.id = p_entry;
$$;
```

- **The missing-entry case is preserved exactly.** The original returned NULL for an unknown entry
  (`where exists(...)` yields zero rows); so does this (`from journal_entries where id = p_entry`).
  `NULL <> 'no_period_model'` is NULL ⇒ the `exists(...)` guard does not fire — identical behaviour,
  and the acceptance battery asserts it.
- **The honest twin.** `clara.correction_period_state(p_entry)` returns
  `open|closing|closed|reopened|none` for panels, new writers and the trigger. The dishonest-looking
  sentinel is confined to one adapter whose comment states the constraint.
- **Alternative considered and declined** *(builder choice, with its reason on the record):* recut
  the live guard to compare against a new honest sentinel. Declined — that is a recut of an audited
  writer body (three more judgement-logic surfaces under Law 1, a wider D1 window) bought for a
  naming gain. If a reviewer prefers the honest sentinel, it is a contained change; the mechanism
  does not depend on the choice.

**The review-provable claim, stated as the assertion that proves it.** The migration's tail must,
in the same transaction:

1. read `md5(prosrc)` of `clara.approve_wrong_client_correction` in a **prestate** probe **before**
   any DDL, and re-read it at the tail — equal, or RAISE. (A prestate/tail pair measured inside the
   migration proves the migration did not touch it; a claim that "we did not edit it" proves nothing.)
2. positively assert the live `prosrc` still contains the exact literal
   `clara._correction_period_state(i.entry_id)<>'no_period_model'`.
3. enumerate, from `pg_proc` and not from file text, **every** function whose body references
   `_correction_period_state`, and assert the set equals exactly `{approve_wrong_client_correction}`.
   A fourth caller appearing is a finding, not a surprise to discover later — 0042's own rule for
   roster assertions (`0042:5536`).

**Acceptance obligation (E-R6, named):** the sandbox battery must exercise the guard deliberately —
force a correction against an entry inside a `closed` FY, observe `CLR19 'correction touches a
closed period'` verbatim, and observe the same correction SUCCEED against an `open` FY. A guard that
never refused is a guard that was never asked (ADR-066).

### 2.10 E-R11 — the three keys, as DB objects

*(ruled — E-R11: keys ②③ separately grantable, firm-owner-only grant/revoke, every grant an audited
act, factory default owner/partner, the agent structurally key-less.)*

**`clara.firm_capability_grants`** — the table that does not exist today (§0.1):

```
id uuid pk · firm_id uuid not null references clara.firms(id)
user_id uuid not null references clara.users(id)
capability text not null check (capability in ('close_and_attest','reopen'))
granted_by uuid not null references clara.users(id) · granted_at timestamptz not null default now()
revoked_by uuid · revoked_at timestamptz · reason text
unique index uq_capability_active (firm_id, user_id, capability) where revoked_at is null
```

Append-only in spirit: a revoke stamps `revoked_at`; rows are never deleted, so the history of who
could sign when is permanent.

- **Writers:** `clara.grant_firm_capability(p_user, p_capability, p_reason, p_op_key)` /
  `clara.revoke_firm_capability(...)`. Floor: the caller's **active membership role must be
  `'owner'`** — not merely `role_rank >= 3`, but the literal role, read from
  `clara.firm_memberships` (`0002:211-219`). Each rides `_reserve_op` / `_audit` / `_finish_op`.
- **Resolver:** `clara._has_capability(p_firm, p_user, p_capability) returns boolean` — true iff an
  active grant exists **or** the user's active membership role is `'owner'` (the factory default).
  Key ① (prepare) is the existing `role_rank('bookkeeper')` floor and needs no new object.
  *(builder choice: the factory default is `owner` only; `admin` must be granted explicitly.
  Rationale — E-R11 makes the firm owner the sole grantor, and defaulting the whole admin tier in
  would make the list decorative for the largest senior role. Flagged for the orchestrator as
  adjustable in one predicate.)*
- **Refusal:** `CLR04` + `reason='capability_missing'` + the capability named in `detail`.

**Segregation of duties** *(ruled — E-R11 defers to PRD §2's existing hard gate).* `finalize_close`
mirrors the live maker/checker mechanics rather than inventing a parallel one:

- `clara.eligible_checker_count(c.firm) >= 2` (`0004:81`, used at `0004:542`) ⇒ the closer must
  differ from the FY's **last human preparer**, computed as the `checker_actor` of the
  most-recently-approved entry with `posting_date` inside the FY. Equal ⇒ `CLR41
  close_segregation_violation`.
- `< 2` eligible humans ⇒ the solo branch: `p_self_attestation` is required non-empty and is stored
  on the receipt as `self_attestation` with `segregation_mode='solo_self_attested'` — the shape
  `journal_entries.self_approval_attestation` already uses (`0003:118`). Missing ⇒ `CLR41
  close_self_attestation_required`.

**The grant matrix — mirroring 0004's, with the agent row EMPTY.**

| Role | New EXECUTE grants |
|---|---|
| `clara_authenticated` | `open_fiscal_year`, `propose_fiscal_year`, `begin_close`, `attest_close_exception`, `finalize_close`, `abandon_close`, `reopen_fiscal_year`, `grant_firm_capability`, `revoke_firm_capability`, `record_client_fact`, `mint_month_snapshot`, and every close READ |
| `clara_agent_ro` | **the READS only** — `get_close_readiness`, `list_fiscal_years`, `verify_close`, `get_close_plan`, `snapshot_state`. **Zero close/approve-class verbs.** |
| `clara_wake_interactive` / `clara_wake_proactive` | **nothing** |
| `clara_runtime` | **nothing in E-a** *(builder choice — month snapshots are human-initiated in E; scheduling is Wave G, and a runtime grant added "for later" is a grant nobody reviewed for its actual use)* |
| everyone else | nothing — the file opens with the standing `revoke execute on all functions in schema clara from public` posture (`0004:752-753`) |

The internal helpers (`_has_capability`, `_tf_period_wall`, `_close_*`) stay **ungranted**, per
`0004:748-750`'s stated rule. The structural consequence is the one CLAUDE.md names: a `select
clara.finalize_close(...)` under the agent role fails with `42501` **before the body runs**. The
migration's tail asserts this positively — for every new function, `has_function_privilege
('clara_agent_ro', oid, 'EXECUTE')` must be **false** for the writer set, not merely absent from the
grant statements.

### 2.11 Month snapshots + staleness *(lane γ — ruled, E-R3)*

**Months never lock.** A month gets an artifact; books stay open.

- **`clara.period_snapshots`** — `id · firm_id · client_id · period_start · period_end · kind
  ('management_accounts') · minted_by · minted_at · books_watermark text not null · dataset_sha256
  text not null · payload jsonb not null`. **Bytes immutable**: an update trigger permits no change
  to `payload`, `dataset_sha256` or the range (the `0040:351` compare shape); no delete.
- **`clara.snapshot_assessments`** — **append-only**: `id · snapshot_id · assessment
  ('current','stale') · reason · caused_by_entry_id · caused_by_table text · assessed_at ·
  assessed_by`. Current state is the latest row, read through `clara.snapshot_state(p_snapshot)`.
  *"Artifact bytes stay immutable; staleness is a separate append-only assessment row. Change is
  free, silent change is impossible."* (E-R3.)

**The mechanism: a trigger, in the same transaction, by construction** *(builder choice).* An
`after insert or update` row trigger on `clara.journal_entries` inserts a `stale` assessment for
every not-yet-stale snapshot of that client whose `[period_start, period_end]` contains the entry's
`posting_date`, whenever the mutation moves a presented number (status reaching `approved`,
`reversed_by` being stamped, `posting_date` changing). Sibling triggers cover `clara.open_items` and
the FA register rows the management pack presents. Because the trigger is part of the mutating
statement, there is **no asynchronous window** — Invariant-4 discipline, satisfied structurally
rather than by remembering to call a marker function.

**The writer set — a REVIEW instrument, not the mechanism.** E-R3 names the class ("posting,
reversal, allocation, correction, closing-stock adjustment, anything that moves a number the
snapshot presented"). The completeness list below exists so a reviewer can check each named writer's
effect path against the trigger; it is deliberately **not** the enforcement, because enumeration is
exactly the thing this repo has proven it gets wrong (§2.5).

| # | Writer | Effect path | Covered by |
|---|---|---|---|
| 1 | `approve_entry` (`0004:542` CoR chain) | status → approved | JE trigger |
| 2 | `reverse_entry` (`0009:1697-1748`) | mints the mirror **and** stamps `reversed_by` on the original | JE trigger, both branches |
| 3 | `allocate_receipt` / `allocate_payment` (`0044:1642-1674`) | book entries | JE trigger |
| 4 | the composite bank paths (`_settle_from_bank_line_core`, `resolve_and_book_bank_line`; cores called at `0044:1927`, `:1946`) | book entries | JE trigger |
| 5 | recurring-adjustment occurrences + auto-reversals (0045, `auto_reversal_of`) | book entries | JE trigger |
| 6 | the depreciation belt (0041/0042 authorities) | book entries | JE trigger |
| 7 | the closing-stock adjustment (WD-R11) | books an entry | JE trigger |
| 8 | `approve_wrong_client_correction` (live body `0027:196…`) | reverses and re-books **across two clients** | JE trigger, fires per row, so both clients' snapshots are marked |
| 9 | the opening machinery (`approve_opening_seed` `0017:3825`, `supersede_opening_item` `0017:4047`) | books opening entries | JE trigger |
| 10 | `finalize_close` (§2.6) | the closing entry | JE trigger (and correctly: a close makes every prior month's pack stale) |
| 11 | subledger amendments that move an aging bucket without a JE | `clara.open_items` | `open_items` trigger |
| 12 | FA register particulars/enrolment changes | register rows | FA trigger |

**The honest boundary, stated rather than papered over:** a management pack can present a fact that
none of these three tables owns (a counterparty rename, a chart relabel). Those do not mint a
staleness row. They are caught only by **`clara.verify_snapshot(p_snapshot)`**, which recomputes the
dataset and diffs its `dataset_sha256` against the stored one. That is a real limit, and it belongs
in the acceptance matrix as a named negative case, not in a footnote.

**RS is the witness** (E-R9): snapshot a month, post into it, watch the label. Note for the matrix
author — E-R9's "19 approved real invoices" is **stale** as of ADR-066 (the KONG CHENG 2512 leg
approved, entry `f6da5aff`); verify the live count before citing it.

---

## 3. E-R12 — the client-facts trio *(lane α)*

### 3.1 F-1 — VERIFY FIRST. The wall is already built; the lane's work is proof, not code

**Verdict: E-R12(1) is DISCHARGED BY EXISTING CODE on `allocate_payment` / `allocate_receipt`.** The
build item is a caller census, a NOT-NULL re-read, a negative battery, one genuinely open
sub-question, and a ratification record — **not a second guard.** Writing one would duplicate a live
refusal and create two predicates that can drift.

The reads that establish it (each a quote, not a paraphrase):

1. **The predicate exists on both sides, byte-identical** —
   `0044_wave_d_b3_af2_composite.sql:1266-1272` (receipt) and `:1557-1563` (payment):
   `if i.item_date is not null and p_posting_date < i.item_date then raise exception … using
   errcode='CLR10', detail=jsonb_build_object('reason','allocation_to_unborn_item', …)`.
2. **`p_posting_date` IS the allocation's effective date — stated by the code, not inferred.** The
   wall's own comment (`0044:1260-1265`, and verbatim again at `:1551-1556`) reads: *"the buckets
   are item_date-driven while **this allocation is effective-dated at the settlement's posting
   date**."* E-R12's phrase "an allocation whose effective date predates its target item's date" and
   the live predicate `p_posting_date < i.item_date` are therefore **the same test**, not two tests
   that happen to agree.
3. **The public wrappers forward it unchanged.** `clara.allocate_receipt` (`0044:1642-1657`) and
   `clara.allocate_payment` (`0044:1659-1674`) take `p_posting_date` as their third argument and
   pass it positionally into the `_core` with no transformation.
4. **The C-c finding this ruling came from names the same mechanism** — PROJECTLOG.md's C-c
   acceptance findings: *"(F-1) an allocation whose effective_date predates its target item's
   `item_date` breaks the interim-as-of Σbuckets=control tie silently — RULED at E-R12 (ADR-065):
   REFUSE outright, no override; the guard builds in Wave E"*, with RPR's two scars at as-of
   2025-08-31 and 2025-09-30, self-healing at as-of ≥ 2026-08-01. **Those scars are stored data
   that predates the wall (0041), not evidence of a live gap** — the wall operates at call time and
   never retro-touches rows.

**What the lane must actually build.**

| Item | Why it is not optional |
|---|---|
| **A positive caller census, from the live catalog** | the wall lives in `_allocate_*_core`, so any caller of the core inherits it. Enumerate every caller from `pg_proc.prosrc` (not file text) and assert the set — 0044 already maintains a name-pinned census at `:5425-5426` and `:5500-5501`; extend it rather than start a new one. |
| **Re-read `open_items.item_date NOT NULL`** (`0037:738`) as a build-time assertion | the predicate short-circuits on NULL. Today the column forbids NULL; if that is ever relaxed the wall opens **silently**. Assert the constraint, do not assume it. |
| **`clara.apply_open_items` (`0037:3225`) must be VERIFIED, not inherited** | the wall's comment claims it is "act-dated and structurally immune to this defect". **A comment is not a mechanism.** Read the body and either prove it cannot open an as-of window where Σbuckets ≠ control, or give it its own guard. **This is the one genuinely open F-1 sub-question.** |
| **A negative battery** | (a) one day before `item_date` ⇒ `CLR10` / `allocation_to_unborn_item`, message and reason quoted verbatim; (b) **same day ⇒ PASS** (the boundary is `<`, not `<=`); (c) through each public wrapper **and** through the composite preheld path (`0044:1927`, `:1946`); (d) under `clara_agent_ro` ⇒ `42501` before the body runs. |
| **A field read, not only a battery** | ADR-066's lesson: a zero-count refusal head is a question to open, never a wall to bank. Attempt a genuine RPR-shaped allocation at an as-of **before** 2026-08-01 and record the refusal. A refusal is the PASS. |
| **A ratification record** | one section in `wave-e-acceptance-matrix.md` stating that E-R12(1) was discharged by verification, citing these lines — so no future session re-builds it. |

### 3.2 `entity_type` + MSIC — ONE capture door, one facts table

**The door's shape: a facts table, not columns on `clara.clients`** *(builder choice — a column
carries the value but not the who/basis/when ADR-062 requires verbatim, and each future client fact
would then need its own column plus its own door; a facts table makes the door generic and keeps
`clara.clients` a registry rather than a fact store).*

```
clara.client_facts
  id uuid pk · firm_id · client_id
  fact_key text not null            -- 'entity_type' | 'msic' | … (validated against a catalog)
  fact_value jsonb not null
  basis text not null               -- WHO/BASIS/WHEN: the free-text justification (non-empty)
  basis_kind text not null check (basis_kind in
    ('owner_instruction','document','registry_lookup','interview_carryover'))
  source_document_id uuid           -- required when basis_kind = 'document'
  validated_against text not null   -- e.g. 'enum:ENTITY_TYPES_V2' | 'format_only'
  recorded_by uuid not null references clara.users(id) · recorded_at timestamptz not null default now()
  superseded_by uuid references clara.client_facts(id) · superseded_at timestamptz
  unique index uq_client_fact_live (client_id, fact_key) where superseded_at is null
```

**`clara.record_client_fact(p_client, p_fact_key, p_fact_value, p_basis, p_basis_kind,
p_source_document_id, p_op_key)`** — the named audited door E-R12(3) requires.

- Floor `role_rank('admin')` *(builder choice — a client fact drives coding and statutory
  presentation; above bookkeeper, below a signing key).* Client-in-firm check ⇒ `CLR11`.
- `p_basis` empty ⇒ `CLR10 fact_basis_missing`. Unknown key ⇒ `CLR10 fact_key_unknown`. Value
  failing the key's catalog rule ⇒ `CLR10 fact_value_invalid`.
- **Supersession, never update** — a new row stamps `superseded_by/superseded_at` on the prior. The
  reverse-not-delete culture, applied to reference data.
- `_reserve_op` → `_audit` → `_finish_op`, exactly as every sanctioned mutator does
  (`0044:1337-1342` is the canonical `_audit` payload shape).
- **Key catalog** `clara.client_fact_keys` (code-populated): `entity_type` validates against the
  interview's own enum — `["sdn_bhd","bhd","sole_prop","partnership","llp","society","cooperative",
  "other"]` (`packages/runtime/workflows/interview.v2.frameworks.ts:50-52`) — and `msic` validates
  **format only** (5 digits). **No MSIC registry table exists** in any migration (searched
  case-insensitively across all 53); the row therefore records `validated_against='format_only'` and
  the product never claims the code was checked against an official list. Honest state beats a
  quiet implication.
- **Why the door and not the interview path:** `clara.commit_client_onboarding`
  (`0017_wave_b.sql:2777-2779`) refuses with `CLR10` once `cl.status <> 'onboarding'`, and no verb
  re-opens an active client — the exact wall ADR-062 names.

**Why one door serves both facts:** `entity_type` and `msic` differ only in their catalog rule.
Two doors would mean two audit shapes for the same act.

**Backfill.** `entity_type` is `requiredForCommit: true` on the client interview
(`packages/runtime/workflows/interview.v2.questions.ts:77`), so every committed client plan carries
an answer. The lane backfills `client_facts` from the latest **committed** plan's answered/resolved
item with `basis_kind='interview_carryover'` and `basis` naming the plan id — a real provenance, not
a synthesized one. MSIC is the sparse fact; the three parked codes enter through the door itself.

**The three parked codes** (E-R12(3)): **RPR 68109 · RS 82110 · BEE 74101**, each with
`basis_kind='owner_instruction'` and a `basis` citing the owner's instruction and date, recorded in
the ceremony/acceptance step and quoted verbatim in the acceptance record. *Note for reviewers: the
ENRICHMENT TRAP does not reach this. It forbids enriching RS's name-only **customers** with
registrations or TINs; an MSIC code is the **client's own** industry classification and touches no
counterparty row.*

### 3.3 The context-pack splice — PATCHED, NOT REBUILT

The pack is built entirely in `clara.get_context_pack(uuid, text)`; the runtime passes the whole
object through unfiltered (`packages/runtime/workflows/autoDraft.v7.tools.ts:437-449`), so
**surfacing `entity_type` needs no runtime edit at all.**

The live client-object literal is 0036's msic-augmented string; the exact splice text is
`0036_wave_c0_deferred_belts.sql:1554-1566`, and 0036's own header states the law —
**"PATCHED, NOT REBUILT"** (`0036:1511-1516`): harvest via `pg_get_functiondef`, `replace()`, never
retype, because 0017/0018/0019 each rewrote the live body and a from-file rebuild would silently
revert them.

Lane α's splice, mirroring 0036's own prestate discipline:

1. Prestate: harvest the live definition; assert the 0036 msic anchor appears **exactly once**
   (0036 counts it with `(length(v_def)-length(replace(v_def,v_anchor,'')))/length(v_anchor)<>1` —
   reuse that idiom); assert `'entity_type'` is not already present.
2. Replace the client object so it carries **both** keys, and so **both** read
   `coalesce(<live client_facts row>, <latest committed plan item>)` — the captured fact wins,
   the interview answer is the fallback. *(builder choice — an MSIC door that writes a table the
   pack does not read would be a door onto a wall; and coalescing avoids recutting
   `commit_client_onboarding`, an audited writer, purely to keep two stores in step.)*
3. Post-assert both keys installed, or RAISE. `SECURITY DEFINER` survives `CREATE OR REPLACE`; the
   definer-owned body already reads `onboarding_plan*` without extra grants (`0036:1504-1509`), and
   `client_facts` is definer-readable on the same basis.

---

## 4. Lane θ — the CLOSE half of plan-as-document, plumbing grade

DIRECTION.md §4 item 4 names it: the onboarding half is built (`/clients/plan`); **the CLOSE half
rides Wave E**. DIRECTION.md:19 requires it be "a first-class, versioned DB object (the
intended-vs-actual audit record)".

**It already is one** — that is the point of §2.2's shape. The *intended* is
`clara.close_gate_checks` (the catalog); the *actual* is `close_gate_results` + `close_attestations`
+ the receipt. Lane θ therefore ships a **read and three surfaces**, not a new persistence model:

- **`clara.get_close_plan(p_fiscal_year_id) returns jsonb`** — the typed plan document: every
  applicable check with its drawer, its intended assertion, its measured state, its attestation (or
  its absence), and the receipt once finalized. Granted to `clara_authenticated` and
  `clara_agent_ro` (read).
- **`/close`** — the plan-as-document view + the readiness panel. Every gate row renders **shape +
  label, never hue-only and never a raw digit** (DIRECTION §3's a11y floor). Drawer-3 signals are
  visibly non-blocking. The attest action is an object-level verb on the row, so the surface passes
  DIRECTION §1's agent-native test: remove the chat rail and the workbench still shows what
  happened, why, with what evidence.
- **`/reports`** — a sibling of `/rules` (`apps/dashboard/app/rules/page.tsx`): pasted-JWT dev auth
  in `sessionStorage` under the shared `clara_dev_jwt` key, PostgREST `rpc()` reads, no design
  system, no animation. Sealed-artifact links and a snapshot list. **The UI computes no cents** —
  the `/rules` panel's own standing comment.
- Any new card registers in the catalog with exactly one authoritative emit path and re-derives its
  authoritative status on hydrate (DIRECTION §1/§3; the parity extractor test is a build gate).

**Out of scope, explicitly (E-R10):** sign-in/sign-up, firm setup, raw-document click-through, the
JWT story, and every other item on the UX-debt register. All of it is Wave G. The E-side painkiller
lane was proposed and **declined**.

---

## 5. E-b / E-c — pointers only

**E-b (lanes δ, ε, ζ) — `wave-e-design-reporting.md`.** The typed metric algebra (E-R5), the
approved/versioned/effective-dated catalog, the six-layer FS template model, claim assessment, the
chart AST regime and the sealed-artifact registry (E-R14). Two standing decisions bind it from here:
**the algebra evaluator IS a reporting evaluator for immutability purposes** — versioned `_vN` DB
functions, frozen by extending the freeze-lint family (the conservative resolution of the algebra
research's open question on evaluator versioning); and **wording tables follow the 0016
`sst_threshold_schedule` idiom** as the certified precedent for effective-dated policy text. The
render worker is a new package mirroring `packages/backup`'s separate-Fly-app batch shape (a
short-lived DSN, no standing pool, offline at render time) — which also keeps it off the Supavisor
standing budget (35/60 at the ADR-066 close). E-a's dependency on E-b is one-way and narrow: the
close receipt pins evaluator versions and a dataset hash, nothing more.

**E-c (lane η) — `wave-e-design-reporting.md`.** The LLM ad-hoc authoring lane: the model composes
catalog items freely and authors novel definitions as formula trees; a novel definition is a
`draft` until human approval (E-R5's lifecycle matrix), approval and publication ride named audited
functions under the standing role floors and PRD §2's segregation model, and direct DML stays
revoked. E-a touches it only through E-R4's law, which is absolute on both sides of the boundary: a
model may propose or check, and no model numeral enters a durable report unless a versioned
deterministic evaluator **originates** it from DB-owned inputs.

**Tax computation is NOT in Wave E.** PRD §8's exclusion stands (`docs/prd/PRD.md:184`); nothing in
the FS-pack or reporting scope folds a draft tax computation in by another name.

---

## 6. Open questions — for the orchestrator, not the owner

The contract already rules every owner-facing question in this scope. Three items were put to the
orchestrator; two are now DECIDED, one stays open for lane α's first read:

1. **`clara.apply_open_items` (`0037:3225`) — verified or guarded? STILL OPEN.** §3.1's one
   genuinely open F-1 sub-question. It is a body read, not a grill; whoever takes lane α returns the
   verdict with the line numbers, and the answer changes lane α's size from "tests only" to "tests +
   one guard". The design review's verification lane should attempt the read first.
2. **The E-R11 factory default — DECIDED (orchestrator, 2026-08-09): `owner` only, as §2.10
   designs it.** Reasoning of record: "partner" has no structural representation in the role model
   (`viewer|bookkeeper|admin|owner`), so an explicit audited grant IS the honest mechanism for a
   partner who is not the firm owner — defaulting the whole `admin` tier in would make the list
   decorative for the largest senior role, and signing authority fails closed. Adjustable in one
   `_has_capability` predicate if the owner ever asks.
3. **Lane α's early ride — DECIDED (orchestrator, 2026-08-09): α rides an early ceremony.**
   §1.1's argument stands (no audited-writer body recut, no D1 exposure, an ADR-062 debt
   discharged, the three parked codes land without waiting on the campaign), strengthened by §3.1's
   verdict shrinking α to verification + battery + door. Full ADR-061 ladder on the PR regardless;
   the ceremony runs the standing recipe.

**Known risk carried forward, not resolved here:** the closed-period trigger (§2.5) is the widest
new surface in E-a — it sits on the hottest table in the schema and refuses writes the runtime has
never seen refused. Its inertness at deploy (§1.1) contains the deploy risk; its correctness is
Law-1 judgement logic and gets the full independent pass. The acceptance matrix must include a
concurrency cell: two sessions racing `begin_close` against a posting, under `203005007`.

---

*v1 ends. §1 and §2 are proposals at implementable precision, not decisions; §0's three corrections
are reads and should be treated as findings against the grounding pass. The contract governs
throughout.*
