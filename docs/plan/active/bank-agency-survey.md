# F-A3 — bank agency: the ESTATE SURVEY (as-found) · v2

> **The estate survey of record for Wave-F Track-A item F-A3** (`docs/plan/active/wave-f-contract.md`
> §F-A3). Companion to `bank-agency-design.md` (**v2**) and its four annex files. Written to the F-A2
> discipline (`f-a2-annexes-1-estate.md` Annex A): **every claim carries a file:line, every
> unsettleable claim is carried as a PREDICTION for rig replay**, and **a body's live tip is found
> by CoR lineage, never by the migration that created it** (the GM-1 lesson — it bites twice here,
> §4).
>
> **Instruments used.** The codebase graph (`codebase-memory-mcp`, project
> `C-Users-zhant-Desktop-clara-rebuild`) for the runtime/dashboard surface; `grep -inE` over every
> file in `packages/db/migrations` for the DB surface; direct `sed -n` reads for every cited body.
> **Line numbers are FILE line numbers** (the instrument that prints them is `grep -n`/`sed -n`
> over the checked-in migration text at `main@cfa0710`). Where a live body was installed by a
> **dynamic splice**, the file line is the SPLICE's line and the design says so — the live text is
> only readable from `pg_get_functiondef`, i.e. **at the rig** (§4, §6).
>
> **v2, 2026-08-22 — gate 1 folded (record: `bank-agency-gate-record.md`).** The gate's bytes lens
> re-derived every claim below at its cited line and confirmed the citation hygiene, with **three
> cite drifts** (trued in place, nit N1) and **one missed finding of blocker class — F13, §2** —
> which is why **P-2 is retracted** and the settle half of the lane is now on the D1 list. **The
> method corollary it minted:** a body is "already ctx-shaped" only for the keys it actually
> UNPACKS — cite the unpack line, never the signature.

---

## 1 · The estate map — what F-A3 touches, at the bytes

### 1.1 The relations (all FORCE RLS, human SELECT-only, zero machine grants)

| relation | born | notes |
|---|---|---|
| `clara.bank_accounts`, `bank_account_proposals`, `bank_institutions` | `0038` | the registry; `coa_account_code` is the account↔GL binding |
| `clara.bank_statements`, `bank_statement_lines` | `0038` | statement 1:1 a FILED document; lines append-only, never updated (`0038:2211`'s header) |
| `clara.bank_matches` | `0038:605-645` | `status ∈ (pending,live,unmatched)` (`:610`) · **`origin ∈ (human,rule)` (`:611`)** · `matched_via_rule_id` · `draft_entry_id` · `pending_ancillaries` (`:630`) |
| `clara.bank_match_line_members`, `bank_match_entry_members` | `0038` | the N×M group; `line_id` **is** line-keyed (written at `0038:4083-4090`); `posting_date_exception` rides the entry member (`0038:4172-4174`) |
| `clara.bank_reconciliations` | `0040` | born only COMPLETE (`0040:1943-1975`); `snapshot` carries `acknowledged_outstanding` (`0040:1941`) |
| `clara.bank_line_exceptions` | `0040` | `unique(line_id) where status='open'`; dispositions `matched_booking` / `bank_corrective_line` / `written_off_adjustment` (`0040:3382-3386`) |
| `clara.bank_rules` | `0040` | the rules machine's row store — **retires as WRITES, survives as history** (TA-P11) |
| `clara.open_questions` | `0011:796-836` | `scope_kind ∈ (document,vendor,client)` (`:800`) · `origin` CHECK re-cut at `0016:202-204` to six values · `opener_kind ∈ (human,wake)` (`:809`) |
| `clara.client_facts` | `0055:386-420` | the audited fact door; `record_client_fact` is asserted **never** wake-allowlisted (`0055:895-897`) |

### 1.2 The verbs, by floor (live human lane)

**Bookkeeper floor** (`clara._human_ctx(clara.role_rank('bookkeeper'))`, `0004:299-310`):
`enter_bank_statement` (`0038:2109`, ctx at `:2116`) · `void_bank_statement` (`0038:2211`) ·
`add_bank_account` (`0038:2595`) · `deactivate_bank_account` (`0038:2810`) ·
`reactivate_bank_account` (`0038:2869`) · `remap_bank_account_coa` (`0038:2938`) ·
`match_bank_line` (`0038:3817`, ctx at `:3834`) · `settle_from_bank_line` (`0044:2209`/`2226`, ctx at
`:2216`/`:2233`) · `complete_pending_match` (`0038:4811`) · `unmatch_bank_match` (`0038:5125`, ctx at
`:5133`) · `complete_bank_reconciliation` (`0040:1587`, ctx at `:1607`) ·
`void_bank_reconciliation` (`0040:2057`) · `accept_bank_rule_suggestion` (`0044:4710`, ctx at `:4719`) ·
every read (`0038:7875-8054`, `0040:4099-4790`).

**Owner floor**: `except_bank_line` (`0040:3222`, ctx at `:3230`) ·
`resolve_bank_line_exception` (`0040:3372`, ctx at `:3381`) · `resolve_and_book_bank_line`
(`0044:3106`, body-enforced floor per `rig-meta.mjs:616`).

**Runtime-only**: `persist_statement_facts` (`0038:1888`) and its F-A1 successor
`persist_statement_facts_v2` (`0098:688`); `fail_statement_facts` (`0038:2046`).

### 1.3 The walls (triggers and belts)

`_tf_bank_match_group_tie` (`0038:3249`) — the zero-tolerance group identity, re-queried BY ID ·
`_tf_bank_match_entry_exhaustion` (`0038:3362`) — per-side capacity ·
`_tf_bank_match_congruence` (`0038:3438`; **the origin arm at `:3455-3461`**) ·
`_tf_bank_statement_belt` (`0038:2327`) · `_tf_bank_statement_void_belt` (`0038:3588`) ·
`_tf_je_bank_match_reversal_belt` (`0038:3636`) · **`_tf_je_bank_pending_orphan_belt`
(`0038:7704-7727`, trigger at `:7720-7726`)** — F-A2's named forward obligation to this item ·
`_tf_bank_recon_belt` (`0040:2177`) · `_tf_bank_settled_authority_belt` (`0040:2452`) ·
`_tf_bank_line_exception_transition` (`0040:525`, re-cut `0044:4300`) ·
`_tf_bank_matches_resolution_exception_immutable` (`0044:402`).

### 1.4 The runtime and the dashboard

- **Ingest** is already on the witness pair: `statementFacts_v2` + `persist_statement_facts_v2`,
  purpose re-keyed `statement_extraction` → `witness_extraction`
  (`0102`, spec `f-a2-statement-activation-spec.md` §0-§2). **Nothing in F-A3 re-opens it.**
- **The clock-shaped belts already exist** — `packages/runtime/lib/leader.mjs:152-210` carries six
  cadence gates (`autopostReconcileDue`, `sstReconcileDue`, `lintReconcileDue`,
  `depreciationRunDue`, `adjustmentRunDue`, `renderEnqueueDue`), each leader-guarded. The
  **due-predicate idiom** is `packages/runtime/lib/reconciler-fa.mjs:51-135`: feature-detect the
  exact signature, iterate active clients, ask a DB-side `*_run_due(client)` predicate, call the
  verb with a derived op key.
- **Wake credentials** are minted by `clara_runtime` from `packages/runtime/lib/pools.mjs:303-335`
  (`mintWakeCredential` / `mintWakeCredentialObo`), secret never crossing a WDK step boundary.
- **/bank** is `apps/dashboard/app/bank/` — `BankWorkbench.tsx`, `MatchingWorkspace.tsx`,
  `MatchLinesPanel.tsx`, `StatementDetail.tsx`, `ReconciliationPanel.tsx`, `SettleLinePanel.tsx`,
  `AddBankAccountPanel.tsx`, `ExceptionBookingFields.tsx`, plus
  `apps/dashboard/app/shared/bankApi.ts` and `apps/dashboard/app/shared/reconApi.ts`.
- **The four bank-rule surfaces** TA-P11 retires: `apps/dashboard/app/bank/RuleCandidatesCard.tsx`
  (mounted `BankWorkbench.tsx:23,125`) ·
  `apps/dashboard/app/shared/cards/BankRuleProposalCard.tsx` · the **coding chip** in
  `StatementDetail.tsx:209` (+ its rationale at `:331-337`) · the chat part type
  `bank_rule_proposal` (`chat/partCatalog.ts:129-131`, `shared/parts.ts:98-99,164`).

---

## 2 · The EIGHT findings that bind the design (F13 added at v2)

**F1 · The agent cannot see a bank line at all — there is nothing to "widen", only something to
build.** Every bank relation holds ZERO privilege for `clara_agent_ro`, `clara_runtime`,
`clara_wake_interactive`, `clara_wake_proactive` (asserted at `0038:9368-9527` and re-asserted per
test at `x38-wave-c-b-bank.test.mjs:2132-2158`; `0040:7853-7876` and
`x40-wave-c-c-tieout.test.mjs:3197-3218`), and every bank verb is `_human_ctx`-floored (§1.2). The
existing typed agent reads (`get_context_pack`, `get_document_extract`, `coding_lane`,
`get_draft_review`, `list_unassigned_documents`) carry **no bank content whatsoever**. *Consequence:*
the read authority is a NEW receipted DEFINER verb, not a grant — which is exactly what keeps the
zero-table-grant assertions true **verbatim** rather than "re-cut".

**F2 · `_bank_match_adjustment_entry` writes `last_human_editor = the acting actor` and then calls
`_approve_entry_core` itself.** Bytes: the draft insert at `0038:3738-3740` sets
`maker_actor, last_human_editor` both to `v_actor := (p_ctx->>'actor')::uuid` (`0038:3720`); the
approve is `0038:3766-3769` with `receipt_preheld=true`. Under an agent ctx this (a) records a human
editor who does not exist, (b) makes the entry permanently un-postable by F-A2's **A8**
(`maker_actor = agent AND last_human_editor is null`, `f-a2-annexes-3-record.md` E.3), and (c) —
decisively — an agent-identity draft→approved transition with **no `entry_post_receipts` row ABORTS
at COMMIT** under F-A2's `t_je_agent_post_receipt` (`is_agent` ⇒ exactly one receipt row, E.3). *So
every agent bank match that carries an adjustment aborts unless this body becomes ctx-aware and mints
the F-A2 receipt inside the match transaction.* This is the hard dependency on F-A2's 8th
`_approve_entry_core` body made concrete.

**F3 · The invoice-shaped anchor rungs are structurally unsatisfiable by a bank-born entry.**
`provenance_tier='verified'` is granted by `_write_entry_evidence` **only** when the fact state is
corroborated ∧ `field_path='invoice.total'` ∧ the region's cents equal `total_cents`
(`0009:462-466`) — R-L4/D42 pinned that as F-A2's B7 input. The bank estate contains **no
`entry_evidence`, no `document_regions`, no `field_path` at all**: a census of `field_path|region_id|
document_regions` over `0038` returns zero hits, and over `0098` zero hits. A bank match adjustment
is inserted with **no `document_id`** (`0038:3738-3740`). *Consequence:* F-A2's B3/B4/B7/B8 can never
pass on the bank lane; the bank anchor is (i) the **group tie** — an exact zero identity computed
from DB-owned inputs (`0038:4058-4066`, re-asserted by the deferred belt `0038:3249`) — and (ii) the
statement's own corroboration ladder (`readers_disagree → header_unreadable → non_myr_statement →
duplicate_period → chain_broken → continuity_mismatch`, pinned in order at `0098:853-855`). The
design must say which rungs are NOT members and why (law 31), rather than importing a ladder that
would refuse 100% of bank posts — the GB-2 shape, one wave later.

**F4 · B1 is the only live wall keeping settlements off the agent lane, and the two settlement shape
floors have never been asked anything.** The named half raises
`settlement_not_autopostable` only when `checked_via_rule_id is not null` (`0037:1818-1830`); the
durable half `ck_je_settlement_not_rule_checked` says the same thing as a CHECK (`0037:519-522`).
**The agent passes no rule id**, so both are silent on her — F-A2's B1 rung is the wall, and
`A3-M-WCA-R6` narrows it. Behind it sit two deferred floors, `t_je_customer_receipt_shape` and
`t_je_supplier_payment_shape` (`0037:674-686`), whose refusal population on the agent lane is **zero
by construction**. Lifting B1 for bank-born settlements asks them their first real question — law 31
says that is a question to open, not a wall to bank.

**F5 · The drawer-2 bank gate measures from statements, and its stated boundary is false at the
bytes.** `_close_gate_bank_items` (`0056:1335-1380`) enumerates (a) open exceptions and (b) statement
GAPS — and the gap census's universe is `select distinct s.bank_account_id from clara.bank_statements`
(`0056:1355-1358`), so **an account with no statements contributes no gap** and **a client with no
registered accounts contributes nothing at all**. It then declares: *"unmatched-but-unexcepted LINES
are not enumerated here (the match linkage is not line-keyed in the live schema)"* and stamps
`'unmatched_lines_basis','exceptions_and_gaps_v1'` (`0056:1370-1378`). **The linkage IS line-keyed**
(`bank_match_line_members.line_id`, written `0038:4083-4090`) and `list_unmatched_lines`
(`0040:4099-4123`) already computes exactly that set — its predicate is
`not exists (… group_status in ('pending','live'))` ∧ no open/corrective exception. Its own sibling
`bank_recon_close_state` enumerates **from the REGISTRY and says why** (`0056:970-975`: *"an active
account with NO statements loaded is a question this gate must ASK"*). TA-P14 / A3-OQ-12 gives this
gate's **measurement origin** to F-A3; drawer-1's P-3 registry-vs-ledger census stays F-T4.

**F6 · The "bank rules machine" is three different kinds of object, and one of them is not a table.**
`clara._bank_rule_sightings` (`0040:3144-3170`) is a **STABLE read function over live statement
lines**, not a sighting table (the invoice-side `clara.rule_sightings` table is F-A2's breeding
estate, a different thing with a similar name — *spelling is not identity*, law 27(3)). Its helpers
`_bank_desc_word_match` (`0040:3030`) and `_bank_rule_regex_escape` (`0040:3002`) are **shared with
`_bank_line_class_hint`** (`0040:3177-3200`), which feeds `list_unmatched_lines` (`0040:4110`) and is
explicitly *"ADVISORY, INFORMATIONAL-ONLY … NEVER authoritative"*. A retirement that follows the NAME
`%bank_rule%` deletes a live, non-authority read out from under the human's own unmatched-lines list.

**F7 · Two live verbs exist only to carry a rule id — and the live `match_bank_line` body is not any
migration's text.** The 7-arg `match_bank_line` is installed as a raise-only STUB at `0040:5401-5412`
and re-bodied by the S4.4b splice (`0040:5413-5480+`) from the 6-arg body, which was itself patched
in place by S4.4a (`0040:5340-5385`, inserting the `line_excepted` re-check). The 13-arg
`settle_from_bank_line` (`0044:2226-2241`) is the same story on the settle side. Both exist for
`p_via_rule` and both die with the machine. *Consequence:* **the live 6-arg body's line numbers do
not exist in any file** — PR-1a reads it with `pg_get_functiondef` at the rig and pins a prosrc sha
(the GM-1/live-tip lesson, and the F-A1 pre-quiesce sha tripwire).

**F13 · F2 IS NOT ONE BODY — IT IS FOUR, AND THE FOURTH HIDES BEHIND A "NO CoR" CLAIM.** *(Found by
the design gate, 2026-08-22, blocker B1; v1 missed it and shipped P-2 on the strength of a
signature.)* `_settle_from_bank_line_core` (`0044:1706`) unpacks **only** `actor` and `firm` from
`p_ctx` — `select (p_ctx->>'actor')::uuid as actor, (p_ctx->>'firm')::uuid as firm into c;`
(`:1722`) — and then builds FRESH shallow sub-ctxs for each callee:
`jsonb_build_object('actor','firm')` at `:1908` (the adjustment writer) and
`jsonb_build_object('actor','firm','receipt_preheld',false)` at `:1927` and `:1946` (the two allocate
cores). Both allocate cores re-derive `c` the same impoverished way (`:1051`, `:1367`), so an agent
identity is discarded **twice**. Each then stamps `maker_actor, last_human_editor` to `c.actor`
(`:1296-1299` `'customer_receipt'`; `:1580-1583` `'supplier_payment'`), calls `_approve_entry_core`
with a three-key ctx (`:1324-1335`, `:1608`), and branches to a DRAFT when
`clara.is_high_stakes(v_entry)` — which is **not an amount test alone** (`0009:1513-1518`: opening
balance ∨ year end ∨ tax-affecting ∨ `flags ? 'amount_override'` ∨ Σdebits ≥ the firm threshold).
The settle core then turns that into `v_match_status := case when v_status='approved' then 'live'
else 'pending' end` (`~:1975`) and writes `origin := case when p_via_rule is null then 'human' else
'rule' end` (`:2091-2094`). *Consequence:* an agent settlement (a) records a human editor who does
not exist, (b) writes no `entry_post_receipts` row and therefore ABORTS at COMMIT under F-A2's
`t_je_agent_post_receipt`, (c) stamps `origin='human'` so the new deferred receipt wall never fires,
and (d) mints exactly the pending reservation design §3.2 says the agent lane never mints. **Three
bodies join the D1 list** and **P-2 becomes P-2′** (§6).

### Five further findings, recorded because each would cost a round

- **F8 · `0040`'s "no wake allowlist row" census reads a GENERATED MIRROR column.** `0040:7925-7928`
  queries `w.fn_name like '%bank_reconciliation%' or … '%bank_line%' or … '%bank_rule%'`; the table's
  real columns are `(wake_kind, function_name)` (`0002:247-251`). It is not dead: `0007:1098-1099`
  adds `fn_name text generated always as (function_name) stored`. It is a **LIKE-pattern** census, so
  it would match `wake_match_bank_line` — but it runs **only inside `0040`'s own apply**, so a fresh
  ladder is unaffected. **PREDICTION P-3 (§6)** settles whether any CI leg re-applies `0040` onto a
  database that already carries F-A3's rows.
- **F9 · `list_bank_match_candidates` hardcodes `'high_stakes', false`** (**`0038:8025`** — v1 cited
  `:8021`, which is the `entry_id`/`posting_date` line; trued at v2, nit N1) — a field that
  always lies, on the very read a matching UI (and any future pack) would trust.
- **F10 · The ambiguity carrier does not admit a new wake kind today.** `wake_open_question`
  (`0011:1984-2007`) refuses unless `w.wake_kind='autodraft'` **and** `w.client_id = p_client`
  (`:1987-1990`). F-A2's **D34** re-keys that test onto the CLIENT PIN (`f-a2-annexes-1-estate.md`
  B.9 row 10), which is what lets a new client-pinned kind raise questions with **no further body
  change**. If D34 were ever re-severed, F-A3 carries that re-key itself.
- **F11 · `bank_matches.origin` is a two-value closed world** (`0038:611`) with a congruence arm that
  only knows `'rule'` (`0038:3455-3461`, *"'human' is the only origin any writer in this wave
  produces"*). An agent-created group needs a third value — an ACCESS EXCLUSIVE constraint swap plus
  a congruence arm, D34's precedent shape.
- **F12 · The 60-day stale floor is a body constant.** `c_stale_days constant int := 60`
  (`0040:1596`), declared *"an ENGINEERING DEFAULT, owner-adjustable later"*, and the challenge it
  raises is `recon_outstanding_stale` over three enumerated side classes (`0040:1884-1915`). R-E
  leaves the NUMBER open and asks F-A3's battery to measure the real stop frequency.

---

## 3 · The closed-world censuses that break (and how each must be re-cut)

**Rule for every row: EXTEND, never weaken; a disappearance needs an explicit disposition** (the
F-A2 D17/B.2 discipline).

| # | census | at | what F-A3 does to it |
|---|---|---|---|
| C1 | `BANK_0038_HUMAN_FNS` / `_RUNTIME_FNS` / `_READ_FNS` / `_UNGRANTED_FNS` + `BANK_0038_COHORT` | `packages/db/tests/rig-meta.mjs:411-433` | **extend** with the new wake wrappers (granted to the bank wake role only) and the new ungranted cores; **no name leaves** |
| C2 | `TIEOUT_0040_HUMAN_FNS` / `_READ_FNS` / `_UNGRANTED_FNS` + `TIEOUT_0040_COHORT` | `rig-meta.mjs:444-470` | **extend** as C1, **and** carry the three retiring rule verbs' disposition (`propose/sign/retire_bank_rule` leave the HUMAN set — a cohort **disappearance**, which fails by design until dispositioned) |
| C3 | `AF2_0044_HUMAN_FNS` / `_UNGRANTED_FNS`; `ADJ_0045_PRODUCER_GRANT_FNS` | `rig-meta.mjs:634-660`, `:701` | `accept_bank_rule_suggestion` retires → the 0045 producer-grant row is a **disappearance** needing its own disposition |
| C4 | x38.ai — "every Part-A bank writer is `clara_authenticated`-ONLY with zero wake-allowlist entries" | `x38-wave-c-b-bank.test.mjs:2038-2061` | **stays true verbatim** (the human names keep zero rows) and **gains** the positive twin: each new wake sibling holds EXACTLY its own allowlist rows |
| C5 | x38.al / x40.aq — bank relations: zero machine table privilege | `x38…:2132-2158`, `x40…:3197-3218` | **stays true verbatim AND the role list EXTENDS** with `clara_wake_bank` and the three new tables (v2, material M4 — "verbatim" alone is the WEAKENING direction for a newly minted role: neither test iterates it, so an accidental grant to it would pass both) |
| C6 | x40.aq — "ZERO wake_fn_allowlist entries name any of the eight new C-c verbs or the A7 verifier" | `x40…:3233-3234` | **stays true verbatim AND the role list extends** for the eight human names; the new wake names are a **separate positive assertion** |
| C7 | `0040` tail 7 (2)(3) — the exact-signature ACL sweep incl. the two rule arities | `0040:7820-7838`, `:7886-7905` | the two rule arities are DROPPED at retirement → the sweep's own list is history; the successor assertion lives in the rig, not in a re-applied migration |
| C8 | `0040` tail 7 (4) — the LIKE-pattern wake-allowlist census | `0040:7922-7930` | **not re-run on a fresh ladder** (F8); PREDICTION P-3 |
| C9 | `ck_wake_credentials_kind_0011` / `ck_wake_credentials_client_0011` | `0011:622-628` | **extend both** with the new bank wake kind (client NOT NULL), three existing disjuncts byte-identical — D34's shape |
| C10 | `mint_wake_credential`'s early kind gate + per-kind arms | `0011:1163-1165`, `:1178-1186` | **extend both** (GB-3's lesson: extending one leaves the credential unmintable) |
| C11 | `clara.agent_tasks.kind` CHECK | `0006:142` → re-cut **`0011:637-639`** (`chat_turn,wake,autodraft`) — *v1 cited `:634-635`, which is `ck_firm_limits_max_concurrent_sweeps` on a DIFFERENT table; trued at v2, nit N1* | **CONDITIONAL ON GATE G1, not "untouched"** (v2, blocker B2). A `kind='wake'` task is a HELD PROJECTION with no consumer (`0011:1230`, `:1271`; `0006:214`, `:443`, `:570-581`; `drain.mjs:77-90`; `reconciler.mjs:184-189`), so the v1 condition ("*if* the clock rides `kind='wake'` through the spine") is FALSE as the estate stands. If G1 rules a new kind, this CHECK swaps **and** both `_tf_agent_task_insert`/`_tf_agent_task_update` are D1 recuts (the autodraft precedent: insert arm `0011:1231-1240`, transition arms `:1272-1276`) |
| C12 | the three egress-purpose CHECKs + the doc-sha CHECK + four purpose verbs + `prepare_egress_dispatch` | `0090:691-704`, `:758`, `:818`, `:890`, `:952`, `:1091` | **extend all seven** with `bank_matching`; the doc-sha CHECK gains its own conjunct (**null**, the `wiki_synthesis` arm's shape) — `0090`'s own comment already anticipates *"a fourth purpose inherits nothing by accident"* |
| C13 | `GOVERNED_EGRESS_PURPOSES` | `packages/runtime/lib/egress.mjs:232-300` | **extend** with a `bank_matching` entry naming where the consent question is actually asked |
| C14 | `open_questions.scope_kind` / `origin` / `ck_open_questions_scope` | `0011:800`, `0016:202-204`, `0011:823-829` | **extend** with the bank-line scope + origin (design §3.5); `_open_question_blocks` (`0012:87-108`) gains its disposition **explicitly**, because a client-scoped question blocks the whole client |
| C15 | the dashboard binding census | `apps/dashboard/app/shared/dbSeamCensus.bindings.ts:44,133,136,233,273,274,278` | rows for `list_bank_rule_candidates` / `list_bank_rules` retire; new rows for the agent surfaces |
| C16 | `WB_AUTHORITY_FNS` (no authority fn reads wiki/patterns) | F-A2 §3.6 / D.4 | **extend** with F-A3's new authority verbs — law 8's mechanical half |
| **C17** | **NEW at v2 (material M2) — the prosrc / overload pins on the extracted PUBLIC bodies. SIX sites, corrected 2026-08-23 by the PR-1a lane's census (P-16 was wrong at five)** | `x38-wave-c-b-match.test.mjs:1483-1487`, `:1525`, `:1542-1546` · `x38-wave-c-b-bank.test.mjs:2073`, `:2082` · `x40-wave-c-c-tieout.test.mjs:3053-3072` · **`x42-r8-seam.test.mjs:406-412`** (the sixth — the AF-2 composite's `_hash(jsonb_build_object(…))` `'ack'` pin, read by proname; after the extraction the public body computes no hash at all, so it goes RED); the reader at five of the six is `fnSource` (`a21-helpers.mjs:609-615`, which concatenates same-named overloads only) | **MOVE each lock-order pin to the extracted core and ADD the "the public body acquires NOTHING" pin** — the `0042` precedent already in the same file at `x38-match:1496-1538`. Never delete a pin. **Every wrapper pin is PER-OID, and that is load-bearing rather than stylistic:** `fnSource("match_bank_line")` concatenates the /6 and /7 overloads and PR-1a extracts /6 ONLY, so a name-keyed pin stays GREEN off the still-fat rule arity while measuring nothing about the live human path — measured, not theorised (`:1483` did exactly that on the first cut). `:1525`'s exact overload count goes 2 → 1 with the `/13` drop **in PR-3**, and stays exact. Apply-time twins to re-derive on any re-apply: `0044:5393-5401`, `0057:1790-1815` |
| **C18** | **NEW at v2 (material M4) — every role-keyed closed world** | `x38-wave-c-b-bank.test.mjs:2044`, `:2135` · `x40-wave-c-c-tieout.test.mjs:3200` · `wave-b/wb-w-pack.test.mjs:269-275` (the inverse wiki scan's grantee list) · **`rig-helpers.mjs:42-49`'s `ROLES` map — the single site every other census reads from** | **EXTEND all five with `clara_wake_bank`.** Without it a later accidental grant to the new role passes x38.al, x40.aq and the inverse wiki scan alike. *(`wave-a-grants.test.mjs:24`'s `ALL_ROLES` was cited by the gate and is NOT a member — it is a Wave-A grant matrix over `WA_GRANTS`, no bank relation in it.)* |

---

## 4 · Live tips, CoR lineage, and the D1 surface as-found

**Two bodies in this estate are not readable from any file.** `match_bank_line/6` (created
`0038:3817`, patched in place by `0040` S4.4a at `:5340-5385`) and `match_bank_line/7` (stub
`0040:5401`, re-bodied by S4.4b). Add `settle_from_bank_line`'s two wrappers, which were **re-created
as CoRs** at `0044:2209`/`:2226` over the `0040:5565` bodies. **Every line number this survey gives
for those bodies is a FILE line; PR-1a re-derives the live text by `pg_get_functiondef` and pins a
prosrc sha before the window opens** (the F-A1 pre-quiesce sha tripwire).

| body | created | live tip (by lineage) | F-A3 disposition |
|---|---|---|---|
| `match_bank_line/6` | `0038:3817` | `0038` body **as patched** by `0040:5340-5385` | **core extraction** → `_match_bank_line_core(p_ctx,…)`; public name left a thin delegate (the D41 idiom) |
| `match_bank_line/7` | `0040:5401` (stub) + S4.4b | same file | **DROP** (rule arity) |
| `settle_from_bank_line/12`,`/13` | `0038:4316` → `0040:5565` → `0044:2209`,`:2226` | `0044` | `/12` **untouched**; `/13` **DROP**; ~~the core is already ctx-shaped — no CoR~~ **the core `_settle_from_bank_line_core` (`0044:1706`) NEEDS A CoR — F13/P-2′, PR-1b** |
| `_allocate_receipt_core` | `0044:1034` | `0044` | **CoR — F13** (identity, the F-A2 receipt, the LIVE arm past `is_high_stakes`) |
| `_allocate_payment_core` | `0044:1353` | `0044` | **CoR — F13** (the AP twin) |
| `_approve_entry_core` | `0006` → … → `0053` splice B (**8th**) → F-A2's **9th** | F-A2's merged output | **CoR — the TENTH generation, CONDITIONAL on P-14**; authored against F-A2's merged prosrc, sha-pinned |
| the four `0090` egress purpose verbs + `prepare_egress_dispatch` | `0090:758`, `:818`, `:890`, `:952`, `:1007` | `0090` | **CoR ×5 — PR-1c** (absent from v1's list entirely; blocker B3) |
| `unmatch_bank_match` | `0038:5125` | `0038` | **core extraction** |
| `complete_bank_reconciliation` | `0040:1587` | `0040` | **core extraction** |
| `void_bank_reconciliation` | `0040:2057` | `0040` | **core extraction** |
| `resolve_bank_line_exception` | `0040:3372` | `0040` | **core extraction** |
| `resolve_and_book_bank_line` | `0044:3106` | `0044` | **core extraction** |
| `void_bank_statement` | `0038:2211` | `0038` | **core extraction** |
| `add_bank_account` | `0038:2595` | `0038` | **core extraction** |
| `upsert_account` | `0004:367` → `0005:642` → `0009:1460` | `0009` | **core extraction** (three-CoR lineage — the live tip is `0009`, not `0004`) |
| `_bank_match_adjustment_entry` | `0038:3713` | `0038` | **CoR** — F2's identity fix |
| `_tf_bank_match_congruence` | `0038:3438` | `0038` | **CoR** — the third `origin` arm |
| `_bank_rule_sightings`, `propose/sign/retire_bank_rule`, `accept_bank_rule_suggestion`, `list_bank_rule_candidates`, `list_bank_rules`, `list_bank_line_suggestions`, `_wdb_suggestion_rule_hit`, `_wdb_suggestion_lines` | `0040`/`0044` | — | **DROP** (TA-P11); `_bank_desc_word_match` / `_bank_rule_regex_escape` **KEPT** (F6) |

**`enter_bank_statement` is deliberately absent from that table** — design §3.2 records why the
agent's statement-entry authority is exercised through the live witness pipeline rather than a second
entrance.

---

## 5 · Walls with zero population (law 31: what has never been asked)

1. `t_je_customer_receipt_shape` / `t_je_supplier_payment_shape` (`0037:674-686`) — never asked on an
   agent lane, because B1 refuses first (F4).
2. `_tf_je_bank_pending_orphan_belt` (`0038:7704`) — reachable only from a cancelled pending
   reservation, which only the human settle path can create today.
3. `(CLR10, settlement_not_autopostable)` (`0037:1829`) and `ck_je_settlement_not_rule_checked`
   (`0037:519-522`) — keyed on an input the agent never supplies (F4).
4. `_tf_bank_match_congruence`'s rule arm (`0038:3455-3461`) — only `origin='rule'` can trip it.
5. `recon_outstanding_stale` (`0040:1884-1915`) — its live refusal count on real books is **unknown**;
   R-E asks F-A3's battery to measure it (PREDICTION P-5).
6. `_close_gate_bank_items`'s fail arm (`0056:1372-1376`) — with zero registered accounts and zero
   exceptions it has never returned `fail` on the real books (F5; PREDICTION P-4).

---

## 6 · PREDICTIONS the rig replay must confirm or correct

**The authoritative list is `bank-agency-annexes-3-build.md` Annex L (P-1…P-17).** Three of this
survey's ten were re-cut at v2 and are restated here so nobody works from the stale wording:

| id | prediction | how it is settled |
|---|---|---|
| **P-1** | The live `match_bank_line/6` prosrc contains the S4.4a `line_excepted` block **exactly once** and no `p_via_rule` reference | `pg_get_functiondef` at the rig; pin the sha |
| **P-2′** | **RE-CUT (F13/B1).** ~~`_settle_from_bank_line_core` needs no CoR — its `p_ctx` already carries actor/firm/receipt_preheld/fn/exception_declaration.~~ **It DOES need one: the body unpacks actor and firm ONLY (`0044:1722`).** The rig confirms WHICH of the three ctx hops is load-bearing — the settle core's unpack, the sub-ctx rebuild (`:1927`/`:1946`), or each allocate core's re-derivation (`:1051`/`:1367`) | rig: call it with an agent ctx behind a wake wrapper and read the ctx back inside each callee |
| **P-3** | No CI leg re-applies `0040` onto a database that already holds F-A3's wake rows (so F8's LIKE census cannot fire) | read `ci.yml`'s deploy-onto-existing + upgrade-drill legs at build time |
| **P-4′** | **RE-WORDED (M1).** The gate returns `pass` for every live client today; after the repair **every client with bank-class COA movement and no registered account flips to `fail` via arm 4**, and ≥1 registered-but-gapped client flips via arm 1 or 2 | rolled-back read-only live read, the F-A2 G-11 shape |
| **P-5** | The 60-day challenge population on the live books is **non-zero** at the first agent reconciliation | measured in the battery's live cell; the number rides to the owner (R-E) |
| **P-6** | The bank estate contains **zero** `entry_evidence` rows (F3) | one query at the rig; if non-zero, F3's rung analysis is re-opened |
| **P-7** | Extending `ck_wake_credentials_kind_0011` / `_client_0011` validates trivially over existing rows | the D34 rig proof, repeated for the new kind |
| **P-8′** | **RE-CUT (B2) so it CAN FAIL.** ~~The relay mints a `wake` task from the event with no new `agent_tasks.kind`.~~ **A `bank.agent_due` event ends in a run that reaches `completed` and leaves a `bank_agent_receipts` row.** Under today's bytes this is FALSE; gate G1's ruling is what makes it settleable. *(v1's wording — "watch the intent + task appear" — passes while the lane never runs.)* | rig: append the event and follow it to a completed run, not to a row |
| **P-9** | `_bank_desc_word_match` / `_bank_rule_regex_escape` have callers OUTSIDE the rules machine (`_bank_line_class_hint`) and must survive the drop | catalog + prosrc census at the rig, before the drop file is authored |
| **P-10** | No second amount-bearing evidence path exists on the bank shapes (the D42 review obligation, restated for this lane) | catalog census of `_write_entry_evidence` call sites |

**P-11′…P-17** (the re-derived D1 count · the tier census · the receipt trigger on both the adjustment
and the settle path · whether a TENTH `_approve_entry_core` body is needed at all · the
no-wake-consumer census · the completeness of the prosrc-pin set · the one-group-per-login law) are
in Annex L.

---

## 7 · What this survey did NOT establish (named, not left to be discovered)

- **The live text of the two spliced bodies** (§4) — deliberately deferred to the rig.
- **The exact `pg_trigger.tgdeferrable` census** for the bank triggers — F-A2's D5 rule applies here
  verbatim: **tier membership is derived by rig replay, never from a hand list.** The design's tier
  table is a PREDICTION until PR-1b replays it.
- **The live population** of every wall in §5 — measured, not assumed (law 27(2)).
- **The `0044` composite's park branch** (`_wdb_*` family, `0044:2447-2900`) beyond its interface:
  F-A3's design treats it as a live human path it must not disturb, and the battery proves that
  rather than the survey asserting it.
- **NEW at v2, recorded honestly:** the survey did NOT establish **`0044`'s allocate cores at all**
  — `_allocate_receipt_core` and `_allocate_payment_core` are not named anywhere in v1, which is how
  F13 escaped a survey whose own method (direct `sed -n` reads, every claim file:line'd) was fully
  capable of catching it; it caught the identical pattern one body over, as F2. **The correction is
  method, not diligence:** a "no CoR" disposition must cite the body's UNPACK, and a `p_ctx` claim
  must be traced one frame further into every callee the body builds a ctx for.
