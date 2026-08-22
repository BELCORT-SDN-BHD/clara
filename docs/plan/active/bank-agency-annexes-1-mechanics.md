# F-A3 — bank agency: ANNEXES 1 · mechanics

> Companion to `bank-agency-design.md` **v2** (§3), `bank-agency-annexes-3-build.md` (**O** build ·
> **J** the D1 list · **L** predictions · **P** questions · **Q** risks) and `bank-agency-survey.md`.
> **A** the verbs and their columns · **B** the full ladder, its tokens and its declared
> non-members · **C** locks and concurrency · **D** the clock. **E** (egress), **F** (the drawer-2
> gate repair) and **G** (the read surface) moved to `bank-agency-annexes-4-surfaces.md` at v2 when
> the fold took this file to its line ceiling — same authority, new home.
>
> **v2, 2026-08-22 — gate 1 folded (record: `bank-agency-gate-record.md`).**
>
> Every SQL sketch here is a **shape**, not a file: the build authors against the LIVE prosrc read
> at the rig (survey F7/§4), and where a shape asserts something about the live estate it carries a
> PREDICTION id from `bank-agency-annexes-2-record.md` Annex L. **The gate minted a corollary:** a
> body described here as "already ctx-shaped" is only ctx-shaped **for the keys it actually
> unpacks** — the shape must cite the unpack line, not the signature (blocker B1).

---

## Annex A · The verbs, the receipt, the carriers

### A.1 · The wake siblings (signatures)

All are `language plpgsql security definer set search_path = clara, pg_temp`, granted to
**`clara_wake_bank` and nothing else**, each with an allowlist row for kind `bank_agent` (and, at
PR-3 under OQ-6, `interactive_client`). Each body is the `0078:96-107` wrapper: resolve
`wake_context()` → refuse CLR03 without a credential → `assert_wake_allowed(w.wake_kind, '<name>')`
→ refuse blank op key / rationale / model with the typed CLR10 detail → delegate to the ungranted
core with `(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind, …)`. **No wrapper carries
DML** — the property `0078`'s own header calls out, and the property the census in Annex H checks.

```
clara.wake_match_bank_line(p_client uuid, p_lines jsonb, p_entries jsonb,
    p_adjustments jsonb, p_ack_period_exceptions boolean,
    p_rationale text, p_model jsonb, p_inputs_digest text, p_op_key text) returns jsonb
clara.wake_unmatch_bank_match(p_client, p_match uuid, p_reason text,
    p_rationale, p_model, p_inputs_digest, p_op_key) returns jsonb
clara.wake_settle_from_bank_line(p_client, p_line uuid, p_counterparty uuid,
    p_allocations jsonb, p_memo text, p_posting_date date, p_charge_cents bigint,
    p_charge_account text, p_adjustments jsonb, p_control_account text,
    p_rationale, p_model, p_inputs_digest, p_op_key) returns jsonb
clara.wake_complete_bank_reconciliation(p_statement uuid, p_ack_outstanding uuid[],
    p_rationale, p_model, p_inputs_digest, p_op_key) returns jsonb
clara.wake_void_bank_reconciliation(p_recon uuid, p_reason text, …) returns jsonb
clara.wake_resolve_bank_line_exception(p_exception uuid, p_disposition text, p_note text,
    p_counterpart_line uuid, …) returns jsonb
clara.wake_resolve_and_book_bank_line(p_client, p_exception uuid, …) returns jsonb
clara.wake_propose_bank_line_exception(p_line uuid, p_kind text, p_reason text,
    p_evidence_document uuid, …) returns jsonb        -- writes a PROPOSAL, never an exception
clara.wake_propose_identifier_promotion(p_client, p_counterparty uuid,          -- NEW at v2 (B5)
    p_identifier_kind text, p_identifier_value text, p_times_seen int,
    …) returns jsonb                                  -- writes a PROPOSAL, never a key
clara.wake_add_bank_account(p_client, p_proposal_id uuid, p_institution,        -- v2: proposal-anchored
    p_account_number text, p_coa_account_code text, …) returns jsonb
clara.wake_upsert_account(p_client, p_code text, p_name text, p_type text, …) returns jsonb
clara.wake_void_bank_statement(p_statement uuid, p_reason text, …) returns jsonb
clara.wake_get_bank_pack(p_client, p_bank_account uuid, p_op_key text) returns jsonb   -- Annex G
```

**`p_attestation` is absent from every settle sibling on purpose.** The human composite takes one to
satisfy CLR05's self-approval arm; the agent takes her own arm (`approval_arm='agent_unattended'`,
F-A2 §3.3.1) and **writes no attestation**, because an attestation asserts a judgement a human made.

**`p_witness_pin` is GONE and `p_proposal_id` replaces it (v2, gate material M3).** v1 invented a
`p_witness_pin jsonb` and anchored §3.10's wall (2) on "a printed identifier read identically by
both witness channels **on a filed statement**" — **structurally unreachable for a new account**:
`bank_statements.bank_account_id` is `not null` with `fk_bank_statements_account` (`0038:401`), so a
statement naming an unregistered account never becomes a statement — it becomes a
`clara.bank_account_proposals` row, written by the router/persist path on an `account_unregistered`
refusal, whose `header jsonb` (`0038:849-856`, `:877-917`) **carries the full corroborated header**.
The agent core therefore reads the two-channel agreement from that snapshot, and the sibling takes
the proposal id — mirroring `add_bank_account`'s own seventh argument (`0038:2595-2603`), which
already locks the proposal `FOR UPDATE` and fills every blank field from it (`:2642-2672`). **The
wall lives in `_agent_add_bank_account_core` ONLY**; `_add_bank_account_core` stays semantically
identical for the human ctx (H.1's differential cell + the RED-first cell "a human
`add_bank_account` with no proposal still succeeds").

### A.2 · The cores and the delegates

| agent core (ungranted, NEW) | delegate it calls | delegate's provenance | PR |
|---|---|---|---|
| `_agent_match_bank_line_core` | `_match_bank_line_core(p_ctx,…)` | **extracted** from `match_bank_line/6` (survey §4) | 1a + 1b¹ |
| `_agent_unmatch_bank_match_core` | `_unmatch_bank_match_core(p_ctx,…)` | extracted from `0038:5125` | 1a + 1b² |
| `_agent_settle_from_bank_line_core` | **`_settle_from_bank_line_core`** | **CoR REQUIRED — P-2 RETRACTED (B1)**, `0044:1706` | 1b |
| `_agent_complete_bank_reconciliation_core` | `_complete_bank_reconciliation_core(p_ctx,…)` | extracted from `0040:1587` | 1a + 1b³ |
| `_agent_void_bank_reconciliation_core` | `_void_bank_reconciliation_core` | extracted from `0040:2057` | 1a |
| `_agent_resolve_bank_line_exception_core` | `_resolve_bank_line_exception_core` | extracted from `0040:3372` | 1a |
| `_agent_resolve_and_book_core` | `_resolve_and_book_bank_line_core` | extracted from `0044:3106` | 1a |
| `_agent_add_bank_account_core` | `_add_bank_account_core` | extracted from `0038:2595`; the proposal wall is in the AGENT core only | 1a |
| `_agent_upsert_account_core` | `_upsert_account_core` | extracted from `0009:1460` (three-CoR lineage) | 1a |
| `_agent_void_bank_statement_core` | `_void_bank_statement_core` | extracted from `0038:2211` | 1a |
| `_agent_propose_line_exception_core` | — | new writer over `bank_agent_proposals` | 1b |
| `_agent_propose_identifier_promotion_core` | — | **NEW at v2 (B5)** — second writer over `bank_agent_proposals` | 1b |

¹ the ctx-derived `origin` literal · ² the CLR16 `detail.reason` · ³ the M11 waiver hook. **Nine
pure extractions in PR-1a; the three marked cores are re-CoR'd in PR-1b once they are live.**

**The extraction contract, one sentence, and it is the whole safety argument:** the public human verb
keeps its name, arity, ACL, owner and floor, and becomes `c := _human_ctx(role_rank('<floor>'));
return clara._<verb>_core(jsonb_build_object('actor',c.actor,'firm',c.firm,…), …);` — the
`0044:2209-2224` idiom, verbatim in shape, so **the human lane's behaviour is byte-identical by
construction** and the battery proves it with a differential cell (Annex H, H.1). **Scope, stated
because the gate found the ambiguity (nit N3):** "byte-identical" is a claim about the HUMAN
caller's observable output, not a claim that the shared delegate's SQL text is un-parameterised. The
delegate serves two ctx-builders, and exactly **two** literals are parameterised — `origin` in
`_match_bank_line_core` (`0038:4074-4076`) and in `_settle_from_bank_line_core` (`0044:2091-2094`) —
each defaulting to today's live value when `p_ctx->>'is_agent'` is absent, each covered by a
differential cell (register **A25**).

### A.2b · The settle limb — the four bodies P-2 hid (blocker B1)

v1 declared the whole settlement half CoR-free on P-2 ("`_settle_from_bank_line_core` is already
ctx-shaped, `0044:1706`"). **At the bytes it unpacks `actor` and `firm` and nothing else**
(`0044:1722`), and rebuilds shallow sub-ctxs for each callee: `jsonb_build_object('actor','firm')`
at `:1908` for `_bank_match_adjustment_entry`, and
`jsonb_build_object('actor','firm','receipt_preheld',false)` at `:1927` and `:1946` for the two
allocate cores. Both allocate cores then re-derive `c` the same impoverished way (`:1051`, `:1367`)
— so a richer ctx is discarded **twice**. Four defects follow, and all four are on the PR-1b list:

| # | body | defect at the bytes | the recut |
|---|---|---|---|
| 1 | `_allocate_receipt_core` (`0044:1034`) | `maker_actor, last_human_editor` both `c.actor` (`:1296-1299`, `coding_kind='customer_receipt'`); `_approve_entry_core` called with a fresh 3-key ctx (`:1324-1335`); `is_high_stakes` ⇒ `v_status:='draft'` (`:1324`) | NULL `last_human_editor` on the agent arm · thread `is_agent`/`on_behalf_of`/`wake_kind`/post-receipt id into the approve call · write the F-A2 `entry_post_receipts` row in-transaction · an explicit **agent arm that posts LIVE** past `is_high_stakes` (D28) |
| 2 | `_allocate_payment_core` (`0044:1353`) | the AP twin: `:1580-1583` (`'supplier_payment'`), `:1608` | the same four |
| 3 | `_settle_from_bank_line_core` (`0044:1706`) | unpacks actor/firm only (`:1722`); rebuilds sub-ctxs (`:1908`, `:1927`, `:1946`); `v_match_status := case when v_status='approved' then 'live' else 'pending' end` (`~:1975`); `origin := case when p_via_rule is null then 'human' else 'rule' end` (`:2091-2094`) | thread `p_ctx` THROUGH to all three callees · derive `origin` from the ctx · the agent arm can never land `'pending'` |
| 4 | `_bank_match_adjustment_entry` (`0038:3713`) | v1's finding F2, unchanged: `:3738-3740` stamps both actors, `:3766-3769` self-approves `receipt_preheld=true` | ctx-aware identity + the F-A2 receipt write |

**`is_high_stakes` is not an amount test** (`0009:1513-1518`: opening balance ∨ year end ∨
tax-affecting ∨ `flags ? 'amount_override'` ∨ Σdebits ≥ the firm threshold), which is why the agent
arm must be explicit rather than "below threshold, therefore fine". **Restated P-2 (now P-2′):** *the
settle core DOES need a CoR; the rig replay confirms WHICH of the three ctx hops is load-bearing.*

### A.3 · `clara.bank_agent_receipts` (design §3.4)

```
id                 uuid primary key default gen_random_uuid()
firm_id, client_id uuid not null
act_kind           text not null check (act_kind in
                     ('match','unmatch','settle','reconcile_complete','reconcile_void',
                      'exception_resolve','exception_propose','statement_void',
                      'bank_account_add','account_upsert',
                      'identifier_promotion_propose'))            -- v2, blocker B5
outcome            text not null check (outcome in ('admitted','refused'))   -- v2, material M6
subject_id         uuid not null   -- ADMITTED: match_id / recon_id / exception_id / …
                                   -- REFUSED (no row exists yet): the candidate group's ANCHOR LINE id
retry_after        timestamptz     -- v2: stamped by the parking rungs M3/M4/M6; the clock's
                                   -- `retry_later` reason reads it (design 3.6). NULL otherwise.
acting_actor       uuid not null references clara.users(id)      -- clara.agent_user_id()
on_behalf_of       uuid references clara.users(id)               -- NULL on the clocked lane
via_wake_kind      text not null check (via_wake_kind in ('bank_agent','interactive_client'))
wake_task_id       uuid                                          -- the triggering agent_tasks row
model_snapshot     jsonb not null check (jsonb_typeof(model_snapshot)='object'
                     and btrim(coalesce(model_snapshot->>'provider','')) <> ''
                     and btrim(coalesce(model_snapshot->>'model','')) <> ''
                     and btrim(coalesce(model_snapshot->>'version','')) <> '')
rationale          text not null check (btrim(rationale) <> '' and length(rationale) <= 4000)
inputs_digest      text not null check (btrim(inputs_digest) <> '')   -- the pack sha (§3.8)
gate_verdicts      jsonb not null check (jsonb_typeof(gate_verdicts)='object')
approval_arm       text not null                                  -- 'agent_unattended'
op_key             text not null
created_at         timestamptz not null default now()
constraint uq_bank_agent_receipts_op_key unique (op_key)              -- v2: replay idempotency
-- v2: OUTCOME-SCOPED, not flat. At most ONE admitted act per subject; refusals accumulate.
create unique index uq_bank_agent_receipts_admitted
  on clara.bank_agent_receipts (act_kind, subject_id) where outcome = 'admitted';
```

Append-only via `_tf_append_only` + a no-truncate trigger (the `0011:1084-1086` idiom); **no role
holds DML**. **The default in each `coalesce` is `''` — two apostrophes** (the F-A2 R-3 lesson: four
apostrophes made the model-name wall always pass).

**Why the uniqueness key changed (material M6).** v1's flat `unique (act_kind, subject_id)` is
incompatible with the clock the same design builds: a candidate refused by M3 on wake cycle 1 is
re-offered by Annex D's `retry_later` reason on cycle 2, and the second visit — whether it refuses
again or finally admits — would violate the constraint at commit. Either every refusal receipt was
silently not written (contradicting B.2 point 4 and H.3's "the vector is durable and readable from
`bank_agent_receipts`"), or the lane's own headline mechanism aborts. F-A2 solved the equivalent by
splitting outcomes into two homes (`entry_post_receipts` for posts, `op_receipts` for refusals);
**F-A3 keeps ONE home and scopes the constraint instead**, because F-A2's post receipt binds a POST
to an ENTRY (one entry, one post) while this table binds a JUDGEMENT ACT to a subject, and a
judgement act legitimately recurs. The two deferred receipt walls (below) read the **admitted**
index, so a pile of refusals can never satisfy them.

**The two deferred receipt walls.** `t_bank_match_agent_receipt` on `clara.bank_matches`
(`after insert or update … deferrable initially deferred … when (new.origin = 'agent')`) and
`t_bank_recon_agent_receipt` on `clara.bank_reconciliations` (`when (new.status='complete')`,
agent-actor arm). **ARM-0 first**: an unresolvable acting actor refuses CLR08; the arm is declared,
not assumed unreachable (law 31). Then: require **exactly one ADMITTED** `bank_agent_receipts` row
for the subject. *Both are new constraint triggers on live tables — ACCESS EXCLUSIVE, on the D1
list (PR-1b, DDL 5).*

### A.4 · `clara.bank_agent_proposals` (design §3.5)

```
id             uuid primary key default gen_random_uuid()
firm_id, client_id uuid not null
kind           text not null check (kind in ('line_exception','identifier_promotion'))
subject_id     uuid not null                      -- line_id | counterparty_id
payload        jsonb not null                     -- typed per kind; CHECKed per kind
rationale      text not null check (btrim(rationale) <> '')
receipt_id     uuid not null references clara.bank_agent_receipts(id)
status         text not null default 'open' check (status in ('open','accepted'))   -- v2: B4
decided_by     uuid references clara.users(id)
decided_at     timestamptz
decision_note  text
created_at     timestamptz not null default now()
constraint ck_bap_terminal check (
  (status = 'open' and decided_by is null and decided_at is null)
  or (status <> 'open' and decided_by is not null and decided_at is not null))
```

**Human SELECT-only, FORCE RLS, zero machine grants** — the `0040` tail-7(1) posture, so the new
table joins the same census rather than becoming its exception.

**Who writes `accepted` — the three-way contradiction the gate found, and how it closes (blocker
B4).** v1 said the flip was "a side effect of the owner's own act" performed by `except_bank_line`,
while Annex J said that verb is *"never touched by this item, in any PR"* and §1's TA-P1 rider (plus
Annex Q's non-goal *"no `except_bank_line` widening, ever"*) forbids changing it. The live verb
(`0040:3222-3294`, five args) writes `bank_line_exceptions`, audit and an event, and knows nothing of
any proposal — **so as v1 was written, `ck_bap_terminal`'s columns had no writer and H.6's cell
could not go green.** The flip is now written by:

```
t_bank_agent_proposal_accept   AFTER INSERT ON clara.bank_line_exceptions   FOR EACH ROW
  -- resolves the OPEN 'line_exception' proposal for new.line_id, if one exists:
  --   status='accepted', decided_by = the inserting actor, decided_at = now()
  -- no proposal for the line => no-op. Never touches clara.bank_line_exceptions.
```

**It is judgement logic** (it decides whether a proposal was accepted) and takes review law 1's
independent pass; it is a **new trigger on a live table** — ACCESS EXCLUSIVE, PR-1b DDL 5. The
owner's one click stays `except_bank_line` verbatim, so **no `accept_*` verb exists** (A3-M-propose)
and the verb's floor, arity, ACL and semantics are byte-untouched — Annex J's exclusion line is
corrected to say exactly that rather than the bare "never touched".

**`declined` and `stale` are DROPPED from v1's CHECK.** No verb writes them, and law 31 forbids
listing a state nothing can produce. The owner who does not want a proposal simply does not click;
the queue does not OFFER an open proposal whose line is no longer eligible (a read-side filter over
the line's live match/exception state, Annex G). The CHECK is extend-only if a decline door is ever
built. **`identifier_promotion` proposals** flip `accepted` from the confirm door instead (§3.9 /
OQ-8) — and where the payer is not a client of the firm the door reports
`promotion_target_unavailable` and the row stays OPEN.

---

## Annex B · The ladder in full

### B.1 · Tier A — raise (CLR\*)

`no credential → CLR03` · `kind not allowlisted → CLR03` · `blank op_key|rationale|model → CLR10`
with `detail.reason='invalid_request'` and the offending `class` · `client not in firm → CLR11` ·
`purpose_unconsented → CLR10` (the `bank_matching` consent, Annex E in `bank-agency-annexes-4-surfaces.md`) · `bank_agency_held → CLR10` ·
**the locks (Annex C)** · `statement not live → CLR10 wrong_period` (`0038:4019-4026`) ·
`line/entry tenancy → CLR11`. **Everything that costs no durable state refuses BEFORE
`_reserve_op`**, so a bad request burns no op key (`0038:2126-2140`'s discipline).

### B.2 · Tier B — the fifteen admission rungs (M14/M15 added at v2, material M5)

Design §3.3 carries the table. Four properties bind every consumer:

1. **All rungs are evaluated always.** The receipt carries the full vector; admission requires an
   EMPTY vector. (F-A2 **D7** — at zero corroboration a first-fail-wins ladder returns one value for
   the whole corpus and tells you nothing.)
2. **The vector is three-valued.** `pass` / `fail` / **`not_evaluable`** — an absent input is
   `not_evaluable`, never `pass` (law 68). M3, M4 and M5 are the sharp cases: with no learned-payer
   context and no printed identifier, M4 reports `not_evaluable` and **the vector is non-empty**, so
   the match does not proceed unattended.
3. **No consumer may test `vector[r] = 'fail'`** — every consumer tests for `'pass'` and treats
   everything else, including an unknown future value or a missing key, as non-admitting (F-A2
   **D26**, restated as design law here).
4. **A failing vector COMMITS** a receipt + a `bank.match_refused` event; nothing is raised.

### B.3 · M11 — the duplicate-payment wall, in mechanism

For each `id ∈ p_ack_outstanding` the DB resolves the outstanding side to its
`(counterparty_id, abs(amount_cents), item_date)` and asks:

```
exists (select 1 from <posted, unreversed entries of this client>
         where counterparty is not distinct from <cp>            -- ARM-0: NULL cp ⇒ its own arm
           and abs(amount_cents) = <cents>                       -- exact, to the sen
           and posting_date between <item_date> - interval '<W> days'
                                and <item_date> + interval '<W> days'
           and <that entry is itself unmatched or outstanding>)
```

`W` is a **named constant beside `c_stale_days`**, not a literal at the site (`0040:1594-1596`'s own
discipline), and its first value is **35 days** — one banking cycle either side. A hit makes the item
**unwaivable unattended**: the reconciliation refuses `stale_waiver_duplicate_risk` with the item and
its twin named, and raises the question. **ARM-0 is explicit**: a NULL counterparty on either side is
its own FIRST arm and is treated as a hit (strictest branch), never as "no match" — the
`is not distinct from` discipline law 68 mints.

*Non-goal, stated: this is not a duplicate DETECTOR for the books at large; it is a wall on one
waiver.*

### B.4 · Tier C — the `(errcode, reason)` pairs

Only PAIRS; no wildcards, no errcode-only members; unknown re-raises (F-A2 **D6**). The bank estate
is unusually well-typed already, which is why this set is cheap:

| pair | site | today |
|---|---|---|
| `(CLR10, already_matched)` | `0038:4046-4050`, `:4085-4090`, `:4138-4152` | typed |
| `(CLR10, wrong_account)` | `0038:4033-4036`, `:4124-4128` | typed |
| `(CLR10, wrong_period)` | `0038:4019-4026` | typed |
| `(CLR10, amount_beyond_tolerance)` | `0038:4058-4066` | typed |
| `(CLR10, reversed_entry)` / `(CLR10, reversal_mirror)` | `0038:4103-4118` | typed |
| `(CLR10, line_excepted)` | `0040` S4.4a splice | typed |
| `(CLR10, recon_*)` — the nine reconciliation reasons | `0040:1540-1570` header, raises `:1780-1940` | typed |
| `(CLR10, orphaned_reservation_draft)` | `0038:7712-7716` | typed |
| `(CLR10, bank_account_unmapped)` | `0038:4055-4057` | typed |
| `(CLR10, adjustment_account_invalid)` | `0038:3730-3735` | typed |
| `(CLR11, tenancy_incongruent)` | `0038:3446-3450` | typed |
| `(CLR16, <draft anchor moved>)` | `0038:5186-5189` | **bare — PR-1b adds `detail.reason`** |
| `(CLR10, adjustment_key_collision)` / `(approve_key_collision)` | `0038:3966-3976` | typed |

Three sites are bare and PR-1b types them (the CLR16 above, plus the two `_human_ctx` CLR04 arms the
agent lane can never reach — declared, not converted).

### B.5 · Which F-A2 rungs bind a bank-born entry — the closed list (finding F3)

**Members** (they read the entry, not the invoice fact state): **B5** `amount_conflict` · **B6**
`human_override_present` · **B9** `open_question_blocks` · **B14** `generic_control_leg` · **B15**
`generic_on_directional_document`. **Non-members, each with its ground** (law 31 — an unaskable wall
listed as a wall is a lie): **B1** `settlement_kind_human` is **narrowed by A3-M-WCA-R6** for
bank-born settlements and remains live for every other origin · **B2/B3/B4/B7/B8** read
`invoice_facts`/`entry_evidence`/`invoice.total`, none of which a bank-born entry has or can have
(`0009:462-466`; survey F3), so listing them would refuse 100% of bank posts — the GB-2 shape ·
**B10/B11** are the supplier/sales leg-shape floors and are inert **because the bank lane sets
`customer_receipt` (`0044:1299`), `supplier_payment` (`0044:1583`) or NULL (`0038:3739`) — never
`supplier_bill` or `sales_invoice`**, and `_assert_supplier_bill_shape_at` (`0016:3817`) gates every
check behind `coding_kind='supplier_bill'`. *(v1's ground — "a `coding_kind` the bank lane never
sets" — was FALSE at the bytes, nit **N2**. The conclusion survives; the reason did not, and the
false reason would have argued away B1's narrowing and H.4's two-settlement-shape-floors cell, which
is exactly the cell law 31 says this item owes.)* **The bank lane's substitute anchor is M2 (the
exact-zero group tie, re-asserted by the deferred belt `0038:3249`) plus M12 (the statement's own
corroboration verdict).**

**B1's narrowing, stated precisely.** For an entry whose settlement is **born from a bank line**
(`_settle_from_bank_line_core`'s own path, which owns the line in the same transaction), B1 does not
refuse. For every other origin — a chat-lane or sweep-lane settlement with no bank line — **B1 stands
unchanged**. The discriminator is structural (the settle core's `fn` namespace and the line member
written in the same transaction), not a flag the caller passes.

---

## Annex C · Locks and concurrency

**The order is the DELEGATE'S OWN order.** The R-L2/D40 lesson is that inventing an order for the
agent lane deadlocks ABBA against a concurrent human act taking the estate's order. Verbatim from
the bodies:

- `match_bank_line`: op receipt → **all** adjustment sub-keys (`0038:3954-3976`) → `journal_entries`
  `FOR UPDATE ORDER BY id` (`0038:3990-3991`) → advisory `203005004` (client, `:3993`) →
  `bank_statement_lines FOR UPDATE ORDER BY id` + `bank_statements FOR SHARE` (`:3996-4002`) →
  member writes → adjustment entries through the core.
- `complete_bank_reconciliation`: op receipt → `203005004` → `203005006` (per-account chain) → lines
  `FOR SHARE` → the statement row `FOR SHARE` → the account row (`0040:1571-1580`, `:1650-1665`).
- `except_bank_line` / `resolve_bank_line_exception`: `203005004` → `203005006` → the line row(s)
  `FOR UPDATE` **in id order** (`0040:3260-3263`, `:3424-3432`).
- `unmatch_bank_match`: the draft entry row `FOR UPDATE` **before** the advisory rung (`0038:5168-5173`).

**The agent core takes NO lock of its own** and adds no rung: it reserves, reads the pack (a separate,
earlier transaction), then calls the delegate, which takes the estate's rungs. **The reconciler herd
is real** — two lane slots against a per-client advisory rung means a clocked run and a chat run on
the same client **queue**, they do not race; the battery has the two-session cell.

**The extraction MOVES the estate's only instrument for this order — and PR-1a must move the pins
with it (material M2).** Five live assertions read the lock rungs off the PUBLIC prosrc, and
`fnSource` concatenates same-named overloads only (`a21-helpers.mjs:609-615`), so a thin delegate
cannot mask the loss: `x38-wave-c-b-match.test.mjs:1483-1487` (`match_bank_line`: `order by je.id
for update` → `pg_advisory_xact_lock(203005004` → `order by l.id for update`) · `:1542-1546`
(`void_bank_statement`, 004 → 006) · `:1525` (`settleOverloads.rows.length === 2` — an EXACT overload
count the `/13` drop breaks) · `x38-wave-c-b-bank.test.mjs:2073`/`:2082` (`void_bank_statement`
acquires 203005006 directly) · `x40-wave-c-c-tieout.test.mjs:3053-3072`
(`complete_bank_reconciliation`, `void_bank_reconciliation`, `resolve_bank_line_exception`).
**Disposition, per site: MOVE the pin to the extracted core and ADD the wrapper pin** — "the public
body acquires NOTHING and calls the core" — the precedent already sitting in the same file at
`x38-match:1496-1538`, written when `0042` factored the settle body. **Never delete a pin**: Annex C's
"the order is the DELEGATE'S OWN order" would become an unmeasured claim and the ABBA deadlock the
R-L2/D40 lesson cost would be re-introducible in silence. `:1525`'s count changes to **one** with the
`/13` drop **in PR-3**, and stays an exact count, never a `>=`. Apply-time twins to re-derive on any
re-apply: `0044:5393-5401`, `0057:1790-1815`. Census row **C17**; cells in H.1.

**Idempotency.** The wake op key is `sha(task_id ‖ verb ‖ canonical inputs)`, deterministic so a
replayed WDK step reuses the reservation (`0078:135-146`); the inner keys are the estate's derived
`:adj:N` / `:approve` / `:settle` sub-keys, **derived, never minted**.

---

## Annex D · The clock (design §3.6)

> **D.0 · THE EXECUTION HALF DOES NOT EXIST, AND A11 IS RETRACTED (gate blocker B2 · gate G1).**
> v1 asserted "the estate's own spine does the rest … **no new `agent_tasks.kind`, no new relay
> path**". At the bytes a `kind='wake'` `agent_task` is a **HELD PROJECTION**: it must be created
> `'held'` (`0011:1230` raises *"a wake task is created held"*); the LIVE transition matrix
> `_tf_agent_task_update` (`0011:1271`, CoR of `0006:444`) admits `old.kind='wake'` ⇒
> `old.status='held' and new.status='cancelled'` — **no running, no completed, no failed**;
> `0006:443` says the same in prose; `wakes_outbox` is *"the uniform HELD projection"* (`0006:214`)
> with the identical guard (`:570-581`); `drain.mjs:77-90` is its ONLY writer and inserts
> `(origin_intent_id,kind,status) values ($1,'wake','held')`; nothing in `packages/runtime` reads
> `wakes_outbox`; and `reconciler.mjs:184-189` states outright that a wake task *"can never reach
> `cancel_requested` … always created 'held'"*. **So the belt would append `bank.agent_due`, the
> relay would mint a held row, and the run would stop there forever** — one stranded row per cadence
> tick per client — while design §3.3's Tier-D clause ("settles the task `failed`") raises CLR13.
> Autodraft needed its own kind, insert arm (`0011:1231-1240`), transition arms (`0011:1272-1276`)
> and the kind CHECK swap (`0011:637-639`) for exactly this reason. **The mechanism is gate G1
> (Annex O.1), it is CROSS-ITEM with F-A4/F-A5, and this lane bakes no `agent_tasks.kind` until it
> is ruled.** Everything below D.0 is the DUE-PREDICATE half, which stands unchanged.

**`clara.bank_agent_run_due(p_client uuid) returns jsonb`** — STABLE, ungranted-except-runtime, the
`depreciation_run_due` idiom (`reconciler-fa.mjs:51-135`, and its "ANOMALOUS SHAPE, LOUD" rule: an
unexpected shape is a loud failure, never a silent skip). It answers with a **named reason**, and the
belt does exactly one thing per reason:

| reason | when | belt's act |
|---|---|---|
| `unmatched_lines` | a live statement has lines in no live/pending group and under no open exception (`list_unmatched_lines`' own predicate) | append `bank.agent_due` |
| `reconcilable` | every line of a live statement is settled or excepted and no complete reconciliation exists | append `bank.agent_due` |
| `retry_later` | a live line whose **newest** `bank_agent_receipts` row is `outcome='refused'` with `retry_after <= now()` and no later `admitted` row for that line (v2: the parking rungs M3/M4/M6 stamp `retry_after` from the named constant `c_bank_retry_hours`) | append `bank.agent_due` |
| `chase_statement` | an active registered account has no non-void statement covering a month that ended > N days ago | **record a notification only** |
| `purpose_unconsented` / `held` / `nothing_due` | — | **nothing** |

**Data gating is the predicate, not the prompt.** `chase_statement` can never produce a
reconciliation, because the belt's only act on that reason is a notification (per-client mutable —
TA-P5's "per-client mute"). **Twelve statements at FY end** are handled by the estate: the
continuity refusals (`chain_broken`, `continuity_mismatch`, `0098:853-855`) force chain order, and
`recon_period_gap` / `recon_prior_missing` (`0040:1548-1556`) force the reconciliations to follow.

**The wake kind `bank_agent`.** `ck_wake_credentials_kind_0011` gains the name;
`ck_wake_credentials_client_0011` gains the disjunct `or (wake_kind='bank_agent' and client_id is not
null)` with the existing disjuncts **byte-identical**; `mint_wake_credential` gains **both** the
early-gate name (`0011:1163-1165`) and a per-kind arm beside autodraft's (`0011:1178-1186`) —
firm-congruent active client required, `on_behalf_of` **forbidden** on the clocked lane (autodraft's
own shape, and what makes the NULL director structural rather than inferred). **Extending an
enumeration is not weakening it** — the three existing kinds keep byte-identical semantics, no
existing credential gains anything, and PR-1b says so against C-3's record (P-7).

**The allowlist is exact.** `bank_agent` holds **exactly** the rows in Annex A.1 plus
`wake_open_question` and `wake_get_bank_pack` — the closed-world cell (Annex H) asserts the count, so
a second posting verb cannot quietly join this kind.

**The hold — and the relation v1 never specified (gate blocker B3).** v1 named the verb and the
Tier-A rung `bank_agency_held` and gave the hold **no table, no columns, no RLS posture and no
census row**, so both readers read a relation no PR created.

```
clara.bank_agency_holds
  client_id  uuid primary key
  firm_id    uuid not null
  on_hold    boolean not null default false
  reason     text not null check (btrim(reason) <> '')
  set_by     uuid not null references clara.users(id)
  set_at     timestamptz not null default now()
  constraint fk_bank_agency_holds_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id)
```

**FORCE RLS, human SELECT-only, ZERO machine grants** — the `0040` tail-7(1) posture, so it joins the
zero-grant census (C5/C17) rather than becoming its exception; every transition is audited by the
verb. It is the THIRD new table, which is what makes Annex J's "three new tables" true.
`clara.set_bank_agency_hold(p_client uuid, p_on boolean, p_reason text, p_op_key text)` — **human**,
bookkeeper floor, audited, `clara_authenticated`-only — is its only writer. Read as a Tier-A rung and
by the due predicate, so a held client produces **no event at all** rather than an event that
refuses. It is **a brake on a running lane, not a per-firm capability dial** (ADR-0072② / TA-P1's
default-on rider).
