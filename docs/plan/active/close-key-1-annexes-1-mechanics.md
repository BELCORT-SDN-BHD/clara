# F-A4 · Close key ① — annexes 1: mechanics and battery

> Annexes to `close-key-1-design.md` **v2, 2026-08-22 — gate 2 folded (record:
> `close-key-1-gate-record.md`)**. **A** the ladder and the decision tables in mechanism ·
> **B** the two new evaluators · **C** the wake-kind census with a disposition per site ·
> **D** the test battery. Estate cites resolve against `close-key-1-survey.md`.
> Sketches below are **shape, not source**: the build authors the SQL and the review reads the
> SQL, never this file. **Every `file:line` in this annex was re-resolved mechanically at v2**
> (gate GN-1 corrected eight drifted spans that v1.1's pass missed — A.6 and A.3 below).

---

## Annex A · The ladder and the decision tables

### A.1 · The wrapper skeleton (design §3.1)

Every one of the **thirteen** wrappers (gate GM-6 added `wake_mint_month_snapshot`) is this shape
and nothing more — the `0078:96-107` idiom with two additions F-A4 needs (the client-pin assertion
and the receipt triple):

```
create function clara.wake_<verb>(<subject args>, p_rationale text, p_model jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; v_task uuid;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise 'no valid wake credential' using errcode='CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_<verb>');
  -- THE CLIENT PIN. A close_prep credential is client-bound by its own CHECK; the subject must
  -- resolve to THAT client or the call is refused. This is why the reads are wrappers and not
  -- a one-line grant on get_close_plan (design D-04): a firm-scoped grant would let a
  -- client-pinned lane read every client's plan in the firm.
  if w.client_id is null or w.client_id is distinct from clara._close_subject_client(<subject>)
    then raise 'wake close authority is not pinned' using errcode='CLR03'; end if;
  if nullif(btrim(coalesce(p_op_key,'')),'') is null then raise ... errcode='CLR10'; end if;
  v_task := clara._wake_task_id();                    -- F14's sibling resolver, never an argument
  if v_task is null then raise 'wake task unbound' using errcode='CLR03'; end if;
  return clara._agent_<verb>_core(w.firm_id, clara.agent_user_id(), w.on_behalf_of, w.wake_kind,
    v_task, <subject>, p_rationale, p_model, p_op_key);
end $$;
```

- **No DML text in a wrapper body** — part 1's own reason (`0077:22-29`): a granted body
  carrying DML against a censused table breaks that census by construction.
- **`_close_subject_client(<subject>)`** is one small ungranted resolver per subject kind
  (fiscal year → its `client_id`; close run → its `client_id`; client → itself), so the pin
  assertion is written once and reviewed once.
- **`v_task`** is the mechanical binding TA-P4 (2) demands, and it is never a wrapper
  argument — a caller-supplied task id is the model asserting its own provenance.
  **SETTLED at the bytes (survey F14), not left as a prediction:** `wake_context()` returns five
  columns and no task (`0011:1133-1135`), `wake_credentials` has no task column
  (`0002:230-240`), `agent_tasks` has no credential column (`0006:138-158`). So the wrapper reads
  it from a **new ungranted `clara._wake_task_id()`** which resolves the same session secret
  against a **new nullable `wake_credentials.agent_task_id`**, written at mint by the **sibling**
  `mint_wake_credential_for_task(...)`. `wake_context()` itself is not touched (census C14):
  it is the widest-reach body in the wake estate, and TA-P1's rider is exactly about that.
  A credential with a NULL task refuses `wake_task_unbound` — **no binding, no act** (D-13).
- **`p_op_key` is DERIVED by the caller, and the derivation is stated** (gate GN-4, **D-25**):
  `encode(sha256(convert_to(v_task::text || ':' || '<verb>' || ':' || <subject_id>::text,
  'UTF8')), 'hex')`. The wrapper does not mint it (a wrapper-minted key defeats `_reserve_op`'s
  retry semantics) and does not accept a free-form one either — it **recomputes the expected key
  from `v_task` and the subject and refuses CLR10 `op_key_not_derived` on a mismatch**, so a caller
  cannot reuse yesterday's key to replay a dead outcome, and cannot mint a fresh key inside one
  task to escape the dedupe. Cell **B-11** proves both directions.

### A.2 · Lock order, and why it is the estate's and not ours

Every close verb in `0056` takes `pg_advisory_xact_lock(203005004, hashtext(client))` then
`(203005007, hashtext(client))`, in that order — `begin_close` `0056:1749-1750`, `abandon_close`
`:1970-1971`, `finalize_close` `:2039-2040`, `reopen_fiscal_year` `:2457-2458` — with the status
re-read **after** both (`:1751-1755`). `_tf_period_wall` takes the **shared** form of
`203005007` as its first act (`0056:652`), so 007 is the bottom of every path's order.

**The agent cores take exactly the same two locks in exactly the same order.** This is not a
preference: F-A2's R-L2 lesson (the delegate's own order, never a document's literal order)
says a lane that invents its own order opens an ABBA against a concurrent human act. Because
the agent lane also posts through F-A2's `wake_post_entry`, which takes the filing `FOR SHARE`
plus `203005003`/`203005004` (F-A2 §D.7), **the close-prep workflow must never hold a close
lock across a post**: it posts first, then begins the close. §3.4's ordering is therefore a
lock-safety property as well as an accounting one.

**The snapshot mint joins the same order** (wrapper 13, gate GM-6). `mint_month_snapshot` takes
`203005007`-EXCLUSIVE as its own serializer (`0057:61`), which is the BOTTOM of the close order, so
a lane that already holds `203005004` may take it — but `wake_mint_month_snapshot` is called as its
own act, never nested inside a close verb's transaction. Stated so a builder does not "helpfully"
fold the mint into the begin-close core and invent a `007 → 004` path.

### A.3 · Tier B in mechanism — the rungs that are not one-liners

- **B1 `close_prep_held`.** `clara._close_prep_hold_active(p_client uuid, p_purpose text)` reads
  `close_prep_holds` for a row with `released_at is null`. **ARM-0 first (law 68):** a NULL
  client argument is its own first branch and returns TRUE (held) — a hold check that cannot
  identify its subject must refuse, never pass.
- **B3 `drawer1_not_clean`.** Reads the dry run (§3.5) and requires every **measurable**
  drawer-1 check to be `pass`. `unknown`, `error` and `not_measurable_before_finalize` all
  refuse — `unknown` because an unevaluated identity has not passed (`0056:2073-2078`'s own
  words), `not_measurable` because absence is not evidence (law 27(2)).
- **B6 `close_run_attested`** *(re-cut at gate 2 — GM-6/GM-9, **D-20**)*. v1 read
  `close_runs.started_by = clara.agent_user_id()` and refused a human's run; TA-P1 C hands her
  *"abandoning a close including one she did not open"*, so the identity read STAYS (recorded on
  the receipt — the **column**, never a name and never `users.is_agent`; law 27(3), the pinned
  uuid IS the import, `0002:334-335`) but no longer refuses. The refusal is now the WALL:
  `exists (select 1 from clara.close_attestations a where a.close_run_id = p_run
  and a.superseded_at is null)`. **ARM-0 first:** a NULL run argument is its own branch and
  returns TRUE (attested → refuse). Cell **A-8**.
- **B7 — WITHDRAWN, number RETIRED.** v1 refused `wake_abandon_close` on a `reopened` FY because
  `abandon_close` flattens the status to `open` (`0056:1982`). At the bytes the tell survives the
  flatten: `list_fiscal_years` computes `has_active_reopen_receipt` from `close_receipts`
  (`0056:2681-2682`) *precisely because* "provenance lives in the receipt chain" (`:2678-2680`),
  and an abandon touches no receipt. The number is not reused, so no later cite silently
  re-points (law 31's dead-member discipline).
- **B12 `close_proposal_stale`.** For every `check_key` in the proposal's bound vector, the
  FRESH `measured_digest` (a dry run taken inside the same transaction) must equal the bound
  one. **Digest equality, never row identity** — the rule `finalize_close` already uses
  (`0056:2092-2100`).
- **B13 `belt_period_unrun`** *(re-cut at gate 2 — GM-3 + G1)*. Three arms, evaluated in this
  order inside the freezing transaction, none of which may RAISE:
  1. **FA due.** `clara.depreciation_run_due(p_client)` is wake-safe (`0041:3617-3630` compares a
     non-null `jwt_firm()` only, and `jwt_firm()` is null here) — refuse when
     `due = true and (period_end)::date <= v_fy.ends_on`. **"At or before the FY end", never
     "inside the FY":** the oracle delegates to `_fa_oldest_unmet_period` (`0041:1904-1958`),
     whose loop (`:1934-1943`) keeps the GLOBAL minimum, so a period stranded in an earlier year
     is pinned outside every later FY forever and v1's "inside the FY" test passes for good.
  2. **FA draft outstanding.** The oracle answers `{due:false,'period_draft_outstanding'}`
     (`0041:1918-1921`) whenever ANY depreciation draft stands, hiding a draft that CLR19 will
     refuse forever once the year freezes. B13 therefore reads the draft ITSELF with the oracle's
     own predicate copied verbatim — `je.status = 'draft' and je.flags ? 'depreciation_charges'`
     — **plus the date bound the oracle lacks**, `je.posting_date <= v_fy.ends_on` — and refuses.
     One reading of "outstanding draft", not two (TA-P11).
  3. **ADJ due — fail-closed until OQ-9 rules.** `clara.adjustment_run_due(p_client)` calls
     `clara._assert_due_read_ctx` as its FIRST act (`0045:5525`); that body admits only
     `clara_runtime` when `jwt_sub()` is null (`0042:441-451`) and otherwise raises CLR03
     (`:447`), and the wake pool is `clara_wake_write_login` → `clara_wake_interactive`
     (`pools.mjs:58`, `:373`). The call therefore sits inside its own
     `begin … exception when others then v_adj := null; end` block, and **a null/indeterminate
     answer counts as DUE**: refuse `belt_period_unrun` with `reason='adj_oracle_inevaluable'`.
     On **OQ-9(a)** the arm switches to the additive ungranted `_adjustment_run_due_core` and
     evaluates for real, on the same "at or before `ends_on`" test as arm 1.
  **ARM-0 across all three:** an answer that is not the documented `{due:boolean,…}` shape counts
  as DUE (refuse), never as clear — the belt's own `?? {}` fallback (`reconciler-fa.mjs:114-127`)
  is the concealment this rung must not inherit. F-A4 adds no FY predicate to `0041`/`0045` and
  changes no answer either oracle gives (D-14 as narrowed by D-26).
- **B14 `reopen_correction_in_flight`** *(new at gate 2 — **D-20**)*. Applies to
  `wake_begin_close` only when `v_fy.status = 'reopened'`: refuse while any
  `journal_entries` row for the client with `status = 'draft'`, `reversed_by is null` and
  `posting_date between v_fy.starts_on and v_fy.ends_on` stands. **The same population
  `_close_gate_drafts` measures** (`0056:1316`, gate `unapproved_drafts_in_period`) — read once,
  through that evaluator, so the freeze and the gate cannot disagree about "a correction is in
  flight" (TA-P11). `close_prep_due()` applies the identical predicate (Annex B.1 item 1), so the
  clock and the rung admit the same years. **ARM-0:** a NULL FY status is its own branch and
  refuses.
- **The vector.** Every Tier-B rung is evaluated on every call; the receipt stores the full
  failing set; the act proceeds only on an empty set. This is F-A2's ruled shape and it exists
  so a refusal explains everything wrong at once rather than one thing per wake.

### A.4 · The segregation decision table (design §3.9) — all eight combinations

Inputs: **H** = at least two eligible human checkers (`eligible_checker_count(firm) >= 2`);
**A** = `v_agent_prepared` (any approved FY-dated entry made by the agent with no human editor);
**S** = the closer is the same actor as `v_human_preparer`. `att` = a non-blank
`p_self_attestation`.

| # | H | A | S | outcome |
|---|---|---|---|---|
| 1 | yes | no | no | proceed · `two_person` — today's behaviour, byte-unchanged |
| 2 | yes | no | **yes** | **RAISE** CLR41 `close_segregation_violation` — today's behaviour, byte-unchanged |
| 3 | yes | **yes** | no | proceed · **`agent_prepared`** *(today: silently `two_person` — F2)* |
| 4 | yes | **yes** | **yes** | **RAISE** CLR41 `close_segregation_violation` — the human who prepared may not close, and Clara's involvement does not excuse it *(today: the raise is REACHED only if the last entry happens to be the human's; F2 makes it a coin flip)* |
| 5 | no | no | — | `att` required, else RAISE CLR41 `close_self_attestation_required` · `solo_self_attested` — byte-unchanged |
| 6 | no | **yes** | — | `att` **still** required, same raise · **`agent_prepared`** — the sole human signs, and the label says who prepared |
| 7 | — | — | `v_human_preparer is null` (no human ever touched the year) | if H: proceed · `agent_prepared`. If not H: `att` required · `agent_prepared`. **Never a raise on the distinct-checker arm** — there is no human preparer to be distinct from, and inventing one is law 68's ARM-0 failure |
| 8 | H moves 1 → 2 between two closes | any | — | nothing migrates; the next close simply measures the new count. **This is the auto-upgrade** — no dial, no backfill |

**The two invariants the table encodes.** (i) `agent_prepared` is decided by **A alone** and
outranks both other labels; (ii) the **raise** is decided by **H and S alone** and is untouched
by A — Clara's participation never excuses a human self-check, and never creates one.

**The reopen twin** (design §3.9 change 4, gate GM-5). `reopen_fiscal_year` computes the same
label from its own two-value case at `0085:344-345`. Its re-aim adds the SAME `v_agent_prepared`
probe with the SAME priority, so rows 3/4/6/7 of the table above read identically on a reopen
receipt. What does **not** move: the CLR05 arms at `0085:328-340` (`no_eligible_human`,
`attestation_required`, `distinct_checker`, `self_attestation`) — they measure the **reversal
act's** signer against the closer, a different question from who prepared the year, and TA-P6
touched neither. Cell **A-10**.

### A.5 · The NEW undated-document gate (design §3.10)

**`_close_gate_uncoded` (`0056:1381`) is UNCHANGED** — gate GM-4 moved the repair into a sibling
so the append-only catalog title at `0056:403` stays true and the dated gate's digest stays still.
The new evaluator, its catalog row and its item branch:

```
-- catalog (INSERT is lawful; only UPDATE/DELETE are trapped -- 0056:378-379)
insert into clara.close_gate_checks (check_key, drawer, title, evaluator_fn, applies_when)
  values ('undated_documents', 2, 'Filed documents carrying no financial date',
          'clara._close_gate_undated', 'always');

-- clara._close_gate_undated(p_client uuid, p_fy uuid) returns jsonb  [STABLE]
select ... into v_undated
  from clara.document_filings f
  join clara.documents d on d.id = f.document_id
 where f.client_id = p_client and f.retired_at is null
   and d.financial_date is null
   and f.filed_at::date <= v_fy.ends_on            -- THE BOUND (0007:68); see below
   and not exists (select 1 from clara.journal_entries je
          where je.document_id = f.document_id and je.client_id = p_client
            and je.status in ('draft','approved')
            and je.reversed_by is null and je.reversal_of is null);

return jsonb_build_object(
  'state', case when jsonb_array_length(v_undated) > 0 then 'unknown' else 'pass' end,
  'undated_count', ..., 'undated', v_undated);
```

- **`unknown`, never `fail`** — the gate genuinely cannot place these documents in a year, and
  drawer 2 treats `unknown` exactly like `fail` for admission (`0056:2074`) while leaving the
  per-item attested path open (OQ-3). Saying `fail` would assert a placement nobody read.
- **`_gate_outstanding_items`** (`0056:1790`) gains a `when 'undated_documents' then …` branch
  keyed by `filing_id`, exactly as the `uncoded_documents` branch is, so attestation, the
  digest-staleness rule and `get_close_readiness`'s `attested` computation (`0056:2643-2655`)
  need no change at all. **This is the one body window A shares with the finalize path.**
- **The live-coding sub-predicate is copied verbatim** from `_close_gate_uncoded`'s existing
  branch, reversal exclusions included (`0056:1398-1406`) — one reading of "coded", not two.
- **Why `f.filed_at::date <= v_fy.ends_on`.** `measured_digest` is `md5` over the whole payload
  per check_key (`0056:1466`) and `finalize_close` re-evaluates every gate in-transaction and
  raises `close_attestation_stale` on any drift (`0056:2083-2100`). Without a bound, ONE new
  undated filing anywhere in the client's history — a bank letter for a year nobody is closing —
  moves this digest and forces a professional to re-sign statements about documents that did not
  change. `filed_at` is DB-owned and non-null (`0007:68`), so the bound asserts nothing.
- **The residual, recorded not hidden:** a document filed AFTER the year end with no financial
  date is outside the population. It is surfaced as a plan-level count (a read; not in the
  payload, so not in the digest) and rides OQ-6's typed-question channel. **OQ-8** puts the
  alternative — include it, and accept cross-year re-attestation churn — to the owner.
- **Two things the repair still does NOT do:** it does not guess a date, and it does not widen
  the dated population's scope.

### A.6 · The dry-run extraction, in mechanism (design §3.5)

1. **`clara._measure_one_gate(p_check_key text, p_client uuid, p_fy uuid) returns jsonb`** —
   the `case chk.check_key … end` dispatch of **`0056:1434-1449`** and the `v_state` derivation of
   **`0056:1450-1457`**, **verbatim**, wrapped in the same `begin … exception when others then`
   block (**`0056:1433`**, **`:1458-1462`**) so a raising probe still yields `state='error'`. It
   resolves `chk` from the catalog and takes `client`/`fy` as arguments instead of reading a run.
   *(All four spans were off by one to two in v1.1 and are corrected here — gate GN-1.)*
   **The dispatch gains one arm**, `when 'undated_documents' then clara._close_gate_undated(
   p_client, p_fy)` (A.5), so the catalog's fourteenth row is measurable by both entrances.
2. **`_evaluate_one_gate` becomes:** resolve `v_run` → resolve `v_fy` → `v_measured :=
   _measure_one_gate(chk.check_key, v_run.client_id, v_fy.id)` → the **unchanged** INSERT and
   the **unchanged** return object. Nothing else moves.
3. **`_close_dry_run_core(p_client, p_fy)`** loops the catalog `order by drawer, check_key`
   (`0056:1481`'s order) calling `_measure_one_gate`, and returns
   `{check_key, drawer, state, measured, measured_digest}` per row with the digest computed the
   same way (`md5(coalesce(v_measured,'{}')::text)`, **`0056:1466`**). **It inserts nothing and
   locks nothing.**
4. **The two in-body drawer-1 checks** (`pl_retained_earnings_roll`, `opening_continuity_tie`)
   are returned by `_measure_one_gate` today as literal `pass` objects with a note
   (`0056:1441-1442`). **The dry-run core overrides them to
   `state='not_measurable_before_finalize'`** — it must, because in a dry run there is no
   finalize to compute them and reporting the literal `pass` would be the vacuous-green class
   we are here to fix. `_evaluate_one_gate`'s recorded rows keep the literal `pass` unchanged,
   because that is what the digests in existing receipts were computed over.

**Digest equivalence is the proof obligation**, not a claim: cell A-3 replays a fixture close
before and after the extraction and requires every **pre-existing** `measured_digest` to be
identical. The fourteenth row is NEW, so it has no pre-image — A-3 asserts thirteen unchanged
digests plus one added key, never "fourteen equal fourteen" (which would be vacuous).

### A.7 · The hold, and what it does NOT do

A hold **stops the agent lane**; it never blocks a human. `close_prep_holds` is read only by
`_close_prep_hold_active`, which is called only from Tier-B rung B1 of F-A4's wrappers and from
`close_prep_due()`. No human verb reads it. Releasing is a stamp, never a delete
(`0056:1078-1097`'s revoke-only idiom): the history of who paused what and why is permanent.

**Purposes are a closed world:** `('close_prep')` at v1, extended by later items that adopt the
brake. A hold row naming an unknown purpose is refused by the CHECK, so a typo cannot silently
fail to hold anything.

---

### A.8 · The entrance seam, in mechanism (design §3.1, gate G3 → D-15)

At the bytes the first statement below each verb's `_human_ctx` line is the capability gate:
`begin_close` `0056:1728` then **`:1729-1733`** (`if not clara._has_capability(c.firm, c.actor,
'close_and_attest') then raise … CLR04 'capability_missing'`), `abandon_close` `:1949` then
**`:1950-1954`**, byte-identical in shape. `_has_capability` (`0056:1114-1126`) resolves true only
on a live `firm_capability_grants` row or literal firm-`owner` membership; the only writer of that
table is the owner-only `grant_firm_capability` (`0056:1130`), the agent identity is seeded as a
bare `clara.users` row (`0002:334-335`, `:549-551`) with no membership and no grant, and
`create_firm` (`0004:318`) refuses to let the agent own a firm. **So the moved check can never be
true for her, and moving it would either darken key ① permanently or — cut the other way, silently
— delete the estate's only key-① wall for humans.**

```
clara.begin_close(p_fy, p_op_key)              -- HUMAN entrance, live signature unchanged
  c := clara._human_ctx(role_rank('bookkeeper'));                        -- 0056:1728, STAYS
  if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then raise CLR04;  -- STAYS
  return clara._begin_close_core(c.firm, c.actor, p_fy, p_op_key, ...);  -- everything from 1734
clara._agent_begin_close_core(...)             -- AGENT entrance, ungranted: Tier A then Tier B
  return clara._begin_close_core(w.firm_id, clara.agent_user_id(), p_fy, p_op_key, ...);
```

- **The shared core carries NEITHER wall** and takes `p_firm`/`p_actor` as arguments — the shape
  `_fa_run_period_core` already uses for its two entrances (`0041:3595-3597`).
- **Nothing about `_has_capability`, `firm_capability_grants` or its CHECK changes** (design §7),
  and **no capability row is seeded for the agent** — which is what keeps `OQ-A4-14`'s
  "default-on, no per-firm dial" a policy about HUMAN capabilities, not a back door.
- Cells: **A-9** (a human with the bookkeeper role but WITHOUT `close_and_attest` is still refused
  CLR04 `capability_missing` after the body-move, for both verbs) ▣ and **C-12** (the full human
  entrance is byte-equivalent: same audit row, event row, receipt and FY status).
- The same seam governs the other extractions: `_open_fiscal_year_core` starts below
  `0056:1665`'s `_human_ctx(admin)`, `_propose_fiscal_year_core` below `0056:1634`'s
  `_human_ctx(bookkeeper)`, `_mint_month_snapshot_core` below `0057:780`'s, and the three read
  cores below `0056:2535` / `:2623` / `:2670`. **`wake_snapshot_state` needs no extraction at
  all** — `clara._snapshot_state_core(uuid)` already exists ungranted at `0057:564`; the agent
  core re-expresses the firm check on `clara.actor_firm_id()` and calls it.
- **`_open_fiscal_year_core` takes the honesty label as an ARGUMENT.** Today `v_source` is computed
  in-body at `0056:1697-1700` by comparing the caller's `p_ends_on` to `propose_fiscal_year`'s
  computed end. The human entrance passes that same `case` expression verbatim (byte-equivalent);
  the agent entrance passes `'asserted_by_file'` after B8 has proven the file carries an end and
  the proposal's fallback is unused. Neither entrance lets the core guess.

## Annex B · The two new evaluators

### B.1 · `clara.close_prep_due()` — the due oracle (design §3.3)

```
returns table(firm_id uuid, client_id uuid, fiscal_year_id uuid, ends_on date, reason text)
STABLE · SECURITY DEFINER · pinned search_path · owner clara_fn_owner
grant execute to clara_runtime            -- and to NOBODY else; the wake roles never ask
```

Selection, every term positive and every date computed here (F11):

1. `fy.status = 'open'` **OR `fy.status = 'reopened'` with no correction in flight** — re-cut at
   gate 2 (**D-20** widens **D-08**). TA-P1 C gives Clara the re-freeze, so the clock may not
   refuse the year outright; what it must not do is fire while the human's correction is on the
   bench. The predicate is B14's, evaluated once through `_close_gate_drafts`' own population
   (`0056:1316`): no `journal_entries` row for the client with `status='draft'`,
   `reversed_by is null` and `posting_date between fy.starts_on and fy.ends_on`. **One reading of
   "a correction is in flight", shared by the oracle and the rung** (TA-P11); if they could
   disagree, the clock would wake her for a freeze B14 then refuses, every day.
2. `fy.ends_on <= clara._book_today()` — the book clock, never `current_date`; the x42 clock law
   applies to a new body as much as an old one.
3. `not clara._close_prep_hold_active(fy.client_id, 'close_prep')`.
4. no `close_runs` row for the FY in state `in_progress`, and no `close_receipts` row for it
   with `kind='close' and status='active'` (the year is not already closed).
5. no close-prep wake credential minted for this (client, FY) inside the cadence window — the
   idempotency that stops a herd. The window is OQ-1's open value.
6. `reason` is one of `fy_end_passed` / `retry_after_refusal`, so the notice card can say why
   without deriving it.

**The data gate lives here too** (TA-P5's "wake and look"): the oracle answers *"a year has
ended and nobody has started"*, never *"the books are ready"*. Readiness is the dry run's
answer, taken after she wakes. A client with nothing to work on wakes, looks, and chases —
which is the ruled behaviour, not a wasted wake.

### B.2 · `clara.prepayment_schedule_v1(p_client uuid, p_source_entry uuid) returns jsonb`

**A versioned deterministic evaluator** (TA-P2 A+ origin 2). IMMUTABLE-in-spirit, STABLE in
Postgres terms; its version is in its name, and a changed formula is a **new `_v2`**, never an
edit — the frozen-body discipline law 9 applies to evaluators for the same reason it applies to
workflows: a receipt cites a version.

**Inputs, all DB-owned:** the posted source entry's prepaid-asset leg (amount in cents, account
code), the term start and end derived from the bound document's facts, and the client's FY
bounds. **No model-supplied numeral enters** — the model may name which entry to amortise; it
never supplies the amount, the term or the schedule.

**Output:** `{schedule_version:'v1', period_lines:[{period_start, period_end, debit_cents,
credit_cents, account_code}], total_cents, remainder_placement:'final_period'}`.

**The rules, stated so a reviewer can re-derive them:**
- Straight line over whole months; **no day-level pro-rating** (law 20's split-month doctrine
  applies — a day-1 start gives the month to the successor, day-2+ leaves it with the
  predecessor).
- `base = total_cents / n` truncated toward zero; the **remainder lands wholly in the final
  period**, so `sum(period_lines) = total_cents` exactly. Stated, because "round each period"
  loses sen.
- **Refusals, each typed:** no derivable term → `prepayment_term_underivable` (OQ-4: never a
  12-month default) · a term crossing more than one FY without a stated end → the same · a
  source entry that is not approved, or whose prepaid leg is ambiguous → `prepayment_source_unfit`.

**Where the output goes:** the `lines` of a `proposed` → `live` `adjustment_templates` row
(`0045:1139`), signed through the existing core so `content_hash` (`:1151`) freezes it; the
existing `run_adjustment_occurrence` belt (`0045:5301`) then runs it. **F-A4 writes no
journal line of its own** — that is what keeps this one architecture.

---

## Annex C · The wake-kind census — every site, with a disposition

The new kind is **`close_prep`**: client-pinned, `on_behalf_of` always NULL. Authored against
the **post-F-A2** text (survey C9); the migration's prestate pins F-A2's `interactive_client`
form and refuses to apply if it is absent.

| site | what it says today (pre-F-A2) | disposition |
|---|---|---|
| `0011:623-624` `ck_wake_credentials_kind_0011` | `wake_kind in ('interactive','proactive','autodraft')` | **extend**: add `'close_prep'` beside F-A2's `'interactive_client'`. Existing values byte-identical |
| `0011:625-628` `ck_wake_credentials_client_0011` | three disjuncts keyed on the three kinds | **extend**: add `or (wake_kind='close_prep' and client_id is not null)`. The existing disjuncts, and F-A2's fourth, unchanged |
| `0011:1163` `mint_wake_credential`'s in-body list | **POST-F-A2:** `not in ('interactive','proactive','autodraft','interactive_client')` → CLR10. F-A2's PR-1 CoRs this body (`f-a2-annexes-1-estate.md:419` D34), so the pre-F-A2 three-kind text is NOT what F-A4 authors against | **UNCHANGED** (D-13): the live body keeps its **four**-kind list and refuses `close_prep`. The new kind's branch — a firm-congruent active client **and** a NULL `on_behalf_of`, the `autodraft` shape at `0011:1178-1186`, **plus** the task id — lives in the sibling `mint_wake_credential_for_task`, the only minter of this kind. **Any prestate pin quotes the POST-F-A2 string** (gate GM-8: v1 stated the three-kind text here and in design §3.3, contradicting the survey's own C9, and a pin on it would fail to apply) |
| `0011:638-639` `ck_agent_tasks_kind_0011` | `kind in ('chat_turn','wake','autodraft')` | **extend**: add `'close_prep'` so the clocked task is distinguishable in the queue |
| **`0011:1200-1246` `_tf_agent_task_insert`** *(gate G4, new at v2)* | a `kind` dispatch whose arms are `chat_turn` / `wake` / `autodraft` and whose **`else` raises `'unknown task kind %'` CLR10** (`0011:1241`) | **CoR — a new `close_prep` arm is REQUIRED, not optional**: without it every clocked task INSERT raises. The arm follows `autodraft`'s (`:1231-1238`) — `firm_id` and `client_id` both present against an `active` client, no `session_id`, no `origin_intent_id`, a non-blank `model_snapshot`, **`status='queued'`** |
| **`0011:1248-1285` `_tf_agent_task_update`** *(gate G4, new at v2)* | a `kind` dispatch of allowed transitions whose **`else` is `false`** (`0011:1277`) → CLR13 on every move | **CoR — a new `close_prep` arm is REQUIRED**: `queued→running/cancel_requested/cancelled`, `running→completed/failed/cancel_requested`, `cancel_requested→completed/failed/cancelled` — the `autodraft` lifecycle verbatim. **NOT the `wake` arm** (`:1271`, `held→cancelled` only), which describes a task nothing in the estate can execute: that is why the clock needs a kind of its own rather than reusing `'wake'` |
| `wake_fn_allowlist` (`0002:247`, seeded `0011:3903-3909`) | 6 `autodraft` rows + 1 `interactive` | **add** one row per F-A4 wrapper for `wake_kind='close_prep'` — **thirteen** rows. No existing row moves |
| `0011:4169-4175` in-migration count assertion | asserts 6 for `autodraft` and the total | **historical** (that migration's apply only). The live equivalent is the roster test; the new rows are asserted there |
| `0042:5394`, `0044:6363` function-name rosters | flat allowlists of granted function names | **extend** with the thirteen wrapper names |
| `rig-meta.mjs` role/grant rosters | per-migration closed sets | **add** an `F_A4_CLOSE_WAKE_FNS` block naming the thirteen wrappers and the role that holds them; `CLOSE_MODEL_0056_HUMAN_FNS` (`:81-87`) stays byte-identical |
| `x56-independent-cells.test.mjs:141-176` (A9) | ten human verbs, zero agent/wake EXECUTE | **keep, and add an inverted twin**: the thirteen wrappers hold EXECUTE for `clara_wake_interactive` and **zero** for `clara_agent_ro`, `clara_runtime`, `clara_wake_proactive` |
| `clara.close_gate_checks` seed (`0056:390-407`) — **census C15, new at v2** | 13 rows (6 drawer-1 · 5 drawer-2 · 2 drawer-3) | **extend by INSERT**: a fourteenth row, `undated_documents`, drawer 2 (A.5). Every "thirteen gates" assertion in the batteries is re-cut to fourteen with the thirteen originals still named |
| `theta-close-plan.test.mjs:254-278` (T4) | `clara_agent_ro` holds no EXECUTE on `get_close_plan` | **unchanged and re-asserted** — D-04 keeps the grant matrix as found and reaches the read through a wrapper instead |
| `wake_context()`'s five-column return (`0011:1133-1135`) | `credential_id, wake_kind, firm_id, on_behalf_of, client_id` | **UNCHANGED, and asserted so** (survey C14): the task id arrives via the sibling `_wake_task_id()`, never by widening this body |
| `mint_wake_credential(text,uuid,uuid,interval,uuid)` (`0011:1195-1197`) | the live five-arg signature, granted to `clara_runtime` | **UNCHANGED** (survey C13); `mint_wake_credential_for_task(...)` is a **sibling** with its own grant and its own allowlist-free posture |
| `clara.wake_credentials` columns (`0002:230-240`) | ten columns, no task | **extend**: one nullable `agent_task_id` (FK `agent_tasks`), NULL for every existing kind |

---

## Annex D · The battery (contract-blind cells ▣)

A cell is **contract-blind** when it probes the live catalog or a behavioural run rather than
this design's text — the discipline `0085:59-60` states for its own cells.

### D.1 · The findings, each with an inverted twin

| id | cell |
|---|---|
| A-1 ▣ | **F2 reproduced:** agent-maker last entry + two eligible humans → `finalize_close` succeeds and stamps `two_person`. Run against the **pre-migration** body; it must PASS there and FAIL after (law 32's write-it-against-the-old-artifact rule) |
| A-2 | **F2 refused:** the same fixture post-migration stamps `agent_prepared`; a second fixture where the closer IS `v_human_preparer` raises CLR41 `close_segregation_violation` |
| A-3 ▣ | **digest equivalence across the `_measure_one_gate` extraction**: a fixture close's **thirteen pre-existing** `measured_digest` values are byte-identical before and after, and the fourteenth key (`undated_documents`) is present only after — an ADDED key, never "fourteen equal fourteen", which would be vacuous (A.6) |
| A-4 ▣ | **F3 reproduced then repaired:** a live filing with `financial_date IS NULL`, `filed_at` inside the FY and no entry → **no gate mentions it** pre-migration (`uncoded_documents` reads `pass`), and post-migration the NEW `undated_documents` gate reads `unknown` with the filing as its own item while `uncoded_documents` still reads `pass` |
| A-5 | **the new gate stays attestable:** attest the undated item → `get_close_readiness` reads `attested=true`; move the undated population → that attestation reads stale and `finalize_close` raises `close_attestation_stale` |
| A-6 ▣ | **F4 held:** `begin_close`, then `approve_entry` on an FY-dated draft → CLR19 `write_into_closed_period` |
| A-7 ▣ | **the dry run arms nothing:** `wake_dry_run_close_readiness` on an open year, then an ordinary `approve_entry` on an FY-dated draft **succeeds**; `fiscal_years.status` is still `open` and `close_gate_results` gained zero rows |
| A-8 | **abandon at TA-P1 C's width (D-20):** a HUMAN-started run with no live attestation → `wake_abandon_close` **succeeds**; the same run with one live `close_attestations` row → `close_run_attested`; on a `reopened` year it succeeds, the FY flattens to `open`, and `list_fiscal_years.has_active_reopen_receipt` **still reads true** |
| A-9 ▣ | **the entrance seam holds (A.8):** post-migration, a human holding `bookkeeper` but NOT `close_and_attest` calling `begin_close` and `abandon_close` is still refused CLR04 `capability_missing`; the agent path succeeds on the same firm with no capability row anywhere for `clara.agent_user_id()` |
| A-10 | **the reopen receipt's mode (D-19):** reopen a year Clara prepared → the reopen `close_receipts` row reads `agent_prepared`, not `two_person`; the CLR05 arms (`0085:328-340`) fire exactly as before on a self-reopen and on a no-eligible-human firm |
| A-11 ▣ | **digest independence (D-18):** attest the dated `uncoded_documents` gate, then file a NEW undated document → `uncoded_documents`' `measured_digest` is **byte-identical** and the dated attestation is still live; only `undated_documents`' digest moves. Twin: a document filed AFTER `fy.ends_on` moves **neither** digest |

### D.2 · The ladder

| id | cell |
|---|---|
| B-1 ▣ | each of the thirteen wrappers with **no credential** → CLR03; with a credential of the wrong kind → the allowlist refusal |
| B-2 ▣ | **client-pin mismatch:** a `close_prep` credential pinned to client X calling with a fiscal year of client Y → CLR03, before any read |
| B-3 | **B2 receipt triple:** blank rationale · model missing its version · both → the typed `receipt_incomplete` vector, and **no** act |
| B-4 | **B1 hold:** hold set → every wrapper refuses `close_prep_held`; hold released → they proceed; **hold set mid-run** → the next write refuses while the already-committed ones stand |
| B-5 | **ARM-0:** `_close_prep_hold_active(NULL, 'close_prep')` returns TRUE (held) |
| B-6 | **B3:** a drawer-1 `unknown` and a drawer-1 `error` each refuse `drawer1_not_clean`; a clean measurable set proceeds even while the two in-body checks read `not_measurable_before_finalize` |
| B-7 | **B4/B5:** a live run on the FY → `close_already_in_progress`; an unclosed earlier FY → `close_ordering_violation` |
| B-8 | **B11/B12:** a second proposal at the same digest → `close_proposal_exists`; a proposal whose gate moved → `close_proposal_stale` |
| B-9 ▣ | **Tier C:** an agent close-lifecycle transition committed with the receipt insert suppressed → the deferred trigger raises at COMMIT; the ARM-0 branch is exercised first |
| B-10 ▣ | **zero-row per tier:** for each of Tier A / B / C, a refusal leaves `close_runs`, `close_proposals` and `journal_entries` with the row counts they had |
| B-11 | **op-key derivation (D-25):** the same verb+subject called twice inside ONE wake task returns `_reserve_op`'s stored outcome (a replay, no second act); the same verb+subject under a **new** wake task **re-measures** — set a hold, refuse, release it, and the next task's call proceeds. A hand-supplied key that is not the derivation refuses CLR10 `op_key_not_derived` |
| B-12 | **B14:** a `reopened` FY with an unapproved FY-dated draft → `wake_begin_close` refuses `reopen_correction_in_flight`, and `close_prep_due()` does **not** return the year; approve the draft → the rung passes and the oracle returns it. The two read the same population |

### D.3 · The clock, the adjustments, the doors

| id | cell |
|---|---|
| C-1 | `close_prep_due()` returns a client whose FY ended yesterday; **not** one whose FY is open-ended, **not** a `reopened` year, **not** a held client, **not** one with a live run, **not** one already closed |
| C-2 ▣ | `close_prep_due()` is executable by `clara_runtime` and by **no** other role |
| C-3 | the belt mints exactly one credential and one task per due row; a second cycle inside the cadence window mints none (idempotency) |
| C-4 | the notice event lands on both registers and the dashboard card renders from it |
| C-5 | **depreciation catch-up:** with a live signed authority → the periods run and the entries carry the same evidence as a manual run ▣; with no authority → `depreciation_authority_absent` and a typed question |
| C-6 ▣ | **prepayment evaluator determinism:** two calls on the same source entry return byte-identical `period_lines`; `sum(period_lines) = total_cents` to the sen; a source with no derivable term → `prepayment_term_underivable` |
| C-7 | **the template path:** the minted template signs, `content_hash` freezes, and `run_adjustment_occurrence` runs it — **through the existing belt, with no F-A4 code in the path** |
| C-8 | **the proposal round trip:** propose → the card renders every drafted attestation → adopt walks `attest_close_exception` per item with `authored_by='agent'`, `adopted_verbatim=true` → an edited text records `adopted_verbatim=false` |
| C-9 | **decline:** the card's decline withdraws the proposal and opens a question; the run and the year are untouched |
| C-10 ▣ | **task #17 Fix A:** the closing entry is born `closing_transfer=true`; the B3 reopen mirror likewise; the SST turnover evaluator's rolling figure excludes both |
| C-11 ▣ | **the approve-writer census is UNMOVED** — the six-name set at `x42b0-r8-tails.test.mjs:210` reads exactly as before |
| C-12 ▣ | **the human bodies are byte-equivalent across the body-move:** `begin_close` / `abandon_close` prosrc changes, but a fixture human close produces an identical audit row, event row, receipt and FY status |
| C-13 | **`fy_end_source`:** the agent path stamps `asserted_by_file`; a human path still stamps `asserted` / `default_1231`; the dashboard renders all three |
| C-14 ▣ | **the receipt read surface:** a bookkeeper sees the firm's agent-act receipts; a viewer does not; no role holds INSERT/UPDATE on `agent_act_receipts` |
| C-15 ▣ | **F13 reproduced (pre-fix behaviour, kept as a standing truth about the belts):** a late-registered asset with a prior in-service date inside a `closing` year → `depreciation_run_due` still answers `due:true` **and** `run_depreciation_period` raises CLR19. The twin cell does the same with a signed monthly template and `run_adjustment_occurrence` |
| C-16 | **B13 refuses the freeze** on that fixture (`belt_period_unrun`), and **proceeds** once the catch-up has cleared the period; the ARM-0 arm (an anomalous due-probe shape) also refuses |
| C-19 ▣ | **the positive control G1 was found by lacking** — call `clara.adjustment_run_due(client)` through a REAL `clara_wake_write_login` → `clara_wake_interactive` session (the write pool's own path, `pools.mjs:373`): pre-fix it raises **CLR03 `no valid read context`**; post-OQ-9(a) the ungranted `_adjustment_run_due_core` answers, and the live `adjustment_run_due` **still raises CLR03** on that session (the admission is unmoved for every existing caller). Twin: `depreciation_run_due` answers on the same session both before and after |
| C-20 | **B13's two unsound arms (GM-3):** (i) a period stranded in FY2024, FY2025 being frozen → `wake_begin_close` refuses `belt_period_unrun` (v1's "inside the FY" test would have passed); (ii) a standing depreciation draft dated inside the FY, oracle answering `period_draft_outstanding` → refuses, and the twin with the draft dated AFTER `ends_on` proceeds |
| C-21 ▣ | **the read cores are parity-equal:** `list_fiscal_years`, `get_close_readiness` and `verify_close` each return a byte-identical payload for a fixture human before and after their extraction — `has_active_reopen_receipt` (`0056:2681-2682`) explicitly among the compared keys (gate GM-2: the agent must not be reading a second, hand-written FY list) |
| C-22 ▣ | **the FY-open chain (G2):** `wake_open_fiscal_year` completes on a client whose file carries an FY end and stamps `fy_end_source='asserted_by_file'`; the human `open_fiscal_year` on the same fixture still stamps `asserted`/`default_1231` byte-identically; a client with no FY end on file refuses `fy_end_not_on_file` **without** reaching `propose_fiscal_year`'s `_human_ctx` |
| C-23 ▣ | **the clocked task lives (G4):** the belt inserts a `kind='close_prep'` task — it is born `queued` (not `held`), moves `queued→running→completed`, and a `wake`-kind task on the same rig still refuses anything but `held→cancelled`. `wake_mint_month_snapshot` mints a snapshot through the extracted core and the human `mint_month_snapshot` still mints an identical one |
| C-17 ▣ | **the belts are byte-untouched:** `to_regprocedure` on `depreciation_run_due(uuid)`, `adjustment_run_due(uuid)`, `run_depreciation_period(uuid,date,date,text)`, `run_adjustment_occurrence(uuid,uuid,date,date,text)` and the `prosrc` of each read exactly as at `cfa0710` |
| C-18 ▣ | **F14's binding:** a `close_prep` credential minted through the sibling carries `agent_task_id`; the receipt's `wake_task_id` equals it; a credential minted **without** a task makes every wrapper refuse `wake_task_unbound`; `wake_context()` still returns **five** columns |

### D.5 · Task #17's own battery rides F-A4 (gate GM-7, D-23)

`PROGRESS.md:181-183` records Fix A's shape as *"a 13-cell battery (T6 catches Fix B's regression
class; T2/T4/T8/T9 contract-blind)"*. **C-10 does not replace it.** PR-1b carries all thirteen
cells across, enumerated T1..T13 in the migration's battery file with their Track-B ids preserved;
where an F-A4 cell already proves one, the row says **subsumed by C-nn** rather than being dropped
(law 31's dead-member discipline applied to tests). A cell count below thirteen is a finding.

### D.4 · Acceptance (design §6)

The synthetic round runs in **ROME PUBLIC ADVISORY** and every artifact it produces is
**labelled synthetic per ADR-048** (law 22). Order is forced and stated: seed the year →
plant an undated filing and a lagging asset → let the clock wake → dry run → remediate → begin
→ propose → human adopts → finalize with key ② → read the receipt. **The three published
numbers** of design §6 are recorded in the acceptance file, each with its denominator.
