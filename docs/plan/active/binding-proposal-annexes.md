# 裁-18b — the Clara vendor-binding PROPOSAL door: ANNEXES

> Companion to `binding-proposal-design.md` (the design of record) and
> `binding-proposal-survey.md` (the as-found). **v1, 2026-08-29.** Gate:
> `binding-proposal-gate-record.md` (**OPEN**).
>
> **A** verbs and columns · **B** the receipt contract · **C** the battery · **D** the frontend
> delta · **E** risks and non-goals · **F** change log · **G** the cross-lane ledger ·
> **J** the D1 inventory.

---

## Annex A — verbs and columns

### A.1 New functions

```sql
-- the wake wrapper: granted to clara_wake_filing AND clara_wake_interactive
clara.wake_propose_vendor_identity_binding(
  p_client uuid, p_counterparty uuid, p_basis jsonb,
  p_rationale text, p_model jsonb, p_op_key text) returns jsonb

-- the ungranted core: the walls, the receipt, the insert
clara._propose_vendor_binding_agent_core(
  p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text, p_credential uuid,
  p_client uuid, p_counterparty uuid, p_basis jsonb,
  p_rationale text, p_model jsonb, p_op_key text) returns jsonb

-- the non-hashed derived basis: STABLE, SECURITY DEFINER, ungranted
clara._derive_vendor_binding_basis(
  p_firm uuid, p_client uuid, p_counterparty uuid) returns jsonb

-- the eligibility read that keeps trigger T1 from probing by refusal
clara.wake_list_binding_candidates(p_client uuid)
  returns table(counterparty_id uuid, counterparty_name text, eligible boolean,
                reason text, matched_approved_entries int,
                has_open_proposal boolean, has_live_binding boolean)
```

`_derive_vendor_binding_basis` returns
`{matched_approved_entries, window_span_days, distinct_posting_dates, f1_evidence[],
f2_evidence[], resolved_citations[]}` — every value read from the same relations the frozen
derivation reads, **none of it entering `content_hash`** (design §3.2; survey S4).

### A.2 Columns added to `clara.vendor_identity_bindings` (ADD COLUMN only)

| column | type | null | note |
|---|---|---|---|
| `proposed_by_agent` | `boolean` | `not null default false` | the honest label |
| `proposer_model` | `text` | null | provider/model/version snapshot, flattened |
| `proposal_receipt_id` | `uuid` | null | FK to the receipt, firm-congruent |

Constraints (design §3.4 W10-W12):

```sql
check (proposed_by_agent = (created_by = clara.agent_user_id()))   -- bidirectional honesty
check (proposer_model      is null or proposed_by_agent)
check (proposal_receipt_id is null or proposed_by_agent)
foreign key (proposal_receipt_id, firm_id)
  references clara.binding_agent_receipts(id, firm_id)
```

### A.3 The index that closes S6

```sql
create unique index uq_vib_one_open_proposal
  on clara.vendor_identity_bindings(client_id, counterparty_id)
  where status = 'proposed';
```

No body change: the human `propose_vendor_identity_binding` already wraps its INSERT in
`exception when unique_violation then raise 'binding_conflict' using errcode='CLR36'`
(`packages/db/migrations/0028_vendor_identity_binding.sql:770-772`), so the new index surfaces
as the estate's existing typed refusal on both paths. **Prediction P-1** settles it on the rig.

### A.4 Allowlist and grants (the complete delta)

```sql
insert into clara.wake_fn_allowlist(wake_kind, function_name) values
  ('filing',     'wake_propose_vendor_identity_binding'),
  ('interactive','wake_propose_vendor_identity_binding'),
  ('filing',     'wake_list_binding_candidates'),
  ('interactive','wake_list_binding_candidates');

grant execute on function clara.wake_propose_vendor_identity_binding(uuid,uuid,jsonb,text,jsonb,text)
  to clara_wake_filing, clara_wake_interactive;
grant execute on function clara.wake_list_binding_candidates(uuid)
  to clara_wake_filing, clara_wake_interactive;
```

**Zero new roles**, so no `packages/db/deploy/roles-bootstrap.sql` twin is owed (the W2/W3 law ①
does not fire). **Zero `wake_credentials` CHECK change** — both kinds already exist. **Zero
`wake_engine_sources` row.** **Zero egress-purpose CHECK change** (survey S9).

### A.5 The unchanged surfaces, named so a reviewer can check they stayed unchanged

`clara.propose_vendor_identity_binding(jsonb,text)` · `clara.sign_vendor_identity_binding(uuid,text)` ·
`clara.revoke_vendor_identity_binding(uuid,text,text)` · `clara._derive_vendor_binding_proposal(uuid,uuid,uuid)` ·
`clara._resolve_vendor_binding(uuid,uuid,uuid)` · `clara._binding_common_prefix(text,text,text)` ·
`clara._binding_f3_holds(uuid,text,text)` · `clara._coding_lane_core(uuid,uuid)` ·
`clara.agent_receipts_visible` · `clara.agent_receipt_contract` — **each pinned by prosrc sha256
in every migration's §0 and re-asserted in its tail** (the shas are in `binding-proposal-survey.md` §S1).

---

## Annex B — the receipt table and its 19-column contract mapping

```sql
create table clara.binding_agent_receipts (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null references clara.firms(id),
  client_id        uuid        not null,
  counterparty_id  uuid        not null,
  binding_id       uuid,                      -- null on a REFUSED proposal
  model            text,
  model_version    text,
  rationale        text        not null check (btrim(rationale) <> ''),
  verdict          jsonb       not null check (jsonb_typeof(verdict) = 'object'),
  failing_rungs    text[]      not null default '{}'::text[],
  via_wake_kind    text        not null,
  trigger_kind     text        not null check (trigger_kind in ('wake_task','chat_turn')),
  trigger_id       text        not null check (btrim(trigger_id) <> ''),
  authorization_id uuid,                      -- always NULL here (survey S9)
  adopted_verbatim boolean,
  acting_actor     uuid        not null,
  on_behalf_of     uuid,
  created_at       timestamptz not null default now(),
  constraint uq_binding_agent_receipts_id_firm unique (id, firm_id),
  constraint fk_bar_client       foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_bar_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint fk_bar_binding      foreign key (binding_id, firm_id, client_id)
    references clara.vendor_identity_bindings(id, firm_id, client_id),
  constraint ck_bar_proposed_iff_clean
    check ((binding_id is not null) = (failing_rungs = '{}'::text[]))
);
```

Forced RLS + owner-only policy + the `_tf_append_only` / `_tf_no_truncate` trigger pair; **no**
`revoke … from public` (the measured DR-drift no-op, `0126`/`0142`'s finding); **no**
`clara_authenticated` grant — the read is `clara.agent_receipts_visible` only.

**Shim mapping to the 19-column contract** (`clara.agent_receipt_contract`, ordinals 1-19):

| # | contract column | source |
|---|---|---|
| 1 | `receipt_kind` | `'binding_agent'::text` |
| 2 | `receipt_id` | `r.id::text` |
| 3 | `firm_id` | `r.firm_id` |
| 4 | `client_id` | `r.client_id` |
| 5 | `subject_id` | `coalesce(r.binding_id, r.counterparty_id)::text` |
| 6 | `acting_actor` | `r.acting_actor` |
| 7 | `on_behalf_of` | `r.on_behalf_of` |
| 8 | `occurred_at` | `r.created_at` |
| 9-10 | `model` / `model_version` | `r.model` / `r.model_version` |
| 11-13 | `rationale` / `verdict` / `failing_rungs` | direct |
| 14-16 | `via_wake_kind` / `trigger_kind` / `trigger_id` | direct |
| 17-18 | `authorization_id` / `adopted_verbatim` | direct (both null here) |
| 19 | `scope` | `'firm'::text` |

Registry delta: one `clara.agent_receipt_surfaces` row, the two closed-world regex widenings
(item + shim_relname), and a **ninth** `union all` arm in `clara._agent_receipts_all`.
`clara.agent_receipts_visible` is untouched. Tail must prove:
`clara._assert_receipt_surface_conforms(<shim>)`, `clara.agent_receipt_source_census()` returns
**9** rows with the new row `shim_exists ∧ wired ∧ conforms ∧ column_count=19 ∧ dark_rows=0`, and
`clara.agent_receipt_dark_rows()` is empty.

---

## Annex C — the battery

**Discipline.** A wall's proof is a cell that makes the wall REFUSE (never a substring match on
source text). Absence is not evidence. A forced cell asserts its precondition or exits by a
named, counted `skipHere`/`t.skip` — never `noteLane`+return, never a swallowed premise.
Fixtures THROW on construction failure. Differential over self-referential.

### C.1 Wake authority — BOTH directions, with a REAL CREDENTIAL through the EXECUTOR ROLE

*(the F-A7b PR-a lesson: an allowlist read is not an authority proof)*

| cell | shape | expect |
|---|---|---|
| **B1** | mint a `filing` credential → `set role clara_wake_filing` → set `clara.wake_secret` → call the wrapper with a valid basis | **admitted**, a `proposed` row + a receipt |
| **B2** | mint an `interactive` credential → `set role clara_wake_interactive` → call | **admitted** (trigger T2) |
| **B3** | mint a `proactive` credential → `clara_wake_proactive` → call | **refused `CLR03`** by `assert_wake_allowed` — and PRD §6 invariant 11's own proof |
| **B4** | mint a `bank_agent` credential → `clara_wake_bank` → call | **refused `CLR03`** |
| **B5** | mint an `autodraft` credential (client-bound) → `clara_wake_interactive` (its live executor, survey S2a) → call | **refused `CLR03`** — the allowlist, not the grant, is the wall here, and this cell is what proves it |
| **B6** | mint an `interactive_client` credential → call | **refused `CLR03`** |
| **B7** | no credential at all (`clara.wake_secret` unset) → `clara_wake_filing` → call | **refused `CLR03`** `no valid wake credential` |
| **B8** | `clara_authenticated` (a human session, no wake secret) → call the wrapper | **refused 42501** — the wrapper carries no `clara_authenticated` grant |
| **B9** | ACL census: `clara_agent_ro`, `clara_runtime`, `clara_freeform_ro`, `clara_wake_proactive`, `clara_wake_bank`, `clara_authenticated` × both new functions | **zero** EXECUTE |
| **B10** | adversarial twin for B9: grant one of them EXECUTE inside a savepoint and assert the census **fails** | the census is discriminating |

### C.2 The walls (design §3.4)

| cell | wall | shape | expect |
|---|---|---|---|
| **W3-a** | firm congruence | a client of firm B, credential of firm A | `CLR11` |
| **W4-a** | counterparty | a `retired_at`-stamped vendor | `CLR36 binding_counterparty_inactive` |
| **W4-b** | counterparty | a vendor with blank `registration_normalized` | `CLR36 binding_unattributable` |
| **W5-a/b** | rationale/model | blank rationale; `p_model` missing `version` | `CLR10`, **before** `_reserve_op` (assert no `op_receipts` row was reserved) |
| **W6-a** | 裁-22 | `p_basis` carrying `sightings` | `CLR10` `no_model_sightings` |
| **W6-b** | 裁-22 | a citation region of **another firm's** document | refused, nothing written |
| **W6-c** | 裁-22 | a citation region of a document **not among the three evidence documents** | refused |
| **W6-d** | 裁-22 | a citation region of a **superseded** extraction generation | refused |
| **W6-e** | 裁-22 | empty `citations` array | `CLR10` |
| **W7-a** | duplicate open | propose twice (agent, agent) | second → `CLR36 binding_conflict` |
| **W7-b** | duplicate open, **cross-path** | human `propose_` then agent propose, and the reverse | both → `CLR36 binding_conflict` (P-1) |
| **W8-a** | live binding | sign one, then propose again | `CLR36 binding_conflict` from the derivation, **not** from the index (P-5: assert the message) |
| **W9-a** | expiry | assert `expires_at - created_at = 12 months` and that a hand-forced 13-month row is refused by `ck_vib_expiry` |
| **W10-a** | honest label | `update … set proposed_by_agent = true` on a human-proposed row | refused by name (`23514`, constraint asserted from `get stacked diagnostics`) |
| **W10-b** | honest label, **the other direction** | insert an agent-`created_by` row with `proposed_by_agent = false` | refused by name |
| **W11-a** | model honesty | `proposer_model` set on a human row | refused by name |
| **W12-a** | receipt congruence | `proposal_receipt_id` pointing at another firm's receipt | `23503` |
| **W13-a** | replay | same `op_key`, same args, twice | second returns the dedupe echo; **exactly one** binding row and **one** receipt |
| **W13-b** | replay tolerance | same `op_key`, **different `p_rationale`/`p_model`** | still the dedupe echo (the hash excludes them by design) |
| **W13-c** | op_key conflict | same `op_key`, **different `p_counterparty`** | `op_key reused with different args` |

### C.3 The derivation is untouched (the frozen-window discipline)

| cell | shape | expect |
|---|---|---|
| **F-1** | `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` for `_derive_vendor_binding_proposal` | `de0f58078f23ef2c6ce3f4a82cb29691a3633e3b8b9c48ae90babc53e7ee043c` (P-6) |
| **F-2** | same, `_resolve_vendor_binding` / `_coding_lane_core` / `_binding_common_prefix` / `_binding_f3_holds` | the §S1 shas |
| **F-3** | **differential**: derive a proposal on the human path and on the agent path for one (client, counterparty) — assert the five content fields and the evidence array are **byte-identical** | one derivation, two doors |
| **F-4** | a proposal made **before** this train's migrations and signed **after** them | signs clean (no `proposed_drifted`) — the proof S4's hazard was avoided |

### C.4 The sign path with an agent-created row

| cell | shape | expect |
|---|---|---|
| **S-1** | agent proposes → an admin who is **not** the proposer signs | `live`, `signed_by = that admin`, `created_by` still the sentinel |
| **S-2** | agent proposes → a **bookkeeper** tries to sign | refused at the admin floor (`_human_ctx`) |
| **S-3** | agent proposes → an admin of **another firm** signs | `CLR11` |
| **S-4** | agent proposes → the evidence window moves (a fourth invoice approved) → sign | `CLR36 proposal_drifted` — the pre-existing wall, proven still live over an agent-created row |
| **S-5** | **裁-18a interlock rehearsal** (a *forward-looking* cell, skipped-by-name until that wall lands): with the wall applied on a scratch copy, an agent-proposed row is still signable by any admin, and a human self-propose+self-sign is refused | the wall is actor-comparison, not "proposer must be human" (design §3.4) |
| **S-6** | the solo-firm case: a firm with exactly one admin (`eligible_checker_count` = 1) — Clara proposes, that admin signs | admitted; the 裁-18c way out is real |

### C.5 The receipt

| cell | expect |
|---|---|
| **R-1** | a successful proposal writes exactly one `binding_agent_receipts` row with `binding_id` set, `failing_rungs = '{}'`, `rationale` verbatim, `model`/`model_version` from `p_model` |
| **R-2** | a REFUSED proposal that got past `_reserve_op` writes a receipt with `binding_id IS NULL` and a non-empty `failing_rungs`; `ck_bar_proposed_iff_clean` refuses both lying shapes |
| **R-3** | the row is visible through `clara.agent_receipts_visible` to a bookkeeper of the owning firm and **invisible** to a bookkeeper of another firm |
| **R-4** | `clara.agent_receipt_source_census()` returns 9 rows; the new one is `shim_exists ∧ wired ∧ conforms ∧ 19 cols ∧ 0 dark`; `clara.agent_receipt_dark_rows()` is empty |
| **R-5** | append-only: `update` and `delete` on the receipt table are refused; `truncate` is refused |
| **R-6** | ACL: zero non-owner table grants; no app role holds insert/update/delete |
| **R-7** | the two widened registry regexes refuse a garbage `item` and a garbage `shim_relname` via **real INSERT probes**, each isolated by a lawful companion row and each confirmed refused by **its named constraint** (`get stacked diagnostics`) — 0142's F7 round-2 discipline, not a regex-against-itself tautology |

### C.6 The candidate read

| cell | expect |
|---|---|
| **E-1** | a client with a fully eligible vendor → `eligible = true`, `reason = null`, `matched_approved_entries` equal to a hand-counted control |
| **E-2** | a vendor with only 2 approved entries → `eligible = false`, `reason = 'insufficient_evidence'` |
| **E-3** | a vendor whose window spans 9 days → `reason = 'window_too_recent'` |
| **E-4** | a vendor whose invoice prefix is `INV-` → `reason = 'prefix_too_weak'` |
| **E-5** | a vendor with an open proposal → `has_open_proposal = true` (so T1 cannot loop) |
| **E-6** | the read leaks nothing cross-firm: a `filing` credential of firm A asking for a client of firm B → `CLR11` |
| **E-7** | **non-vacuity control**: E-1's fixture with one approved entry deleted must flip E-1 to `eligible = false` |

### C.7 Estate

Full `pnpm --filter @clara/db test` on a pristine rig at the end, `--test-concurrency=1`, tails
unfiltered; plus the runtime, dashboard and render suites per `packages/*/README.md`. **Every
skip named and counted.** The wall-introducing-PR law (W2/W3 ④) applies: the fixtures in
`packages/runtime` that construct vendor bindings — if any — are enumerated and trued in the same
branch as W7's index, not left for the estate leg to find.

---

## Annex D — the frontend delta (train 1)

| file | change |
|---|---|
| `apps/web/lib/firm-admin/vendor-bindings.ts` | the `listVendorBindings` row type gains `created_by: string` and `proposed_by_agent: boolean`; the `getVendorBinding` type gains the `proposal` object (`rationale`, `model`, `basis.resolved[]`, `derived.matched_approved_entries`, `derived.window_span_days`, `derived.distinct_posting_dates`); a new `askClaraToProposeBinding` wrapper for T2 |
| `apps/web/components/firm-admin/vendor-binding-ceremony.tsx` | `VendorBindingDetailView` gains the agent-proposal block (design §3.3, items 1-6), rendered **only** on `proposed_by_agent`; `VendorBindingRowActions` gains the "Proposed by Clara" chip driven by the boolean, never by a uuid comparison |
| `apps/web/components/firm-admin/vendor-bindings-panel.tsx` | the "Ask Clara to propose" control beside `ProposeBindingDialog`; unconditional trigger, errors rendered in the dialog body (the PR #395 F3 discipline) |
| `apps/web/messages/en.json` | new keys for the block; **and the 裁-18a copy flip** — annex G |

**Test discipline, from PR #395's own findings:** every new fetch is really mocked and content-asserted
(F2's vacuous-pass class), and every fix is **pinned** by a cell that REDs under its revert
(F3 round 2 — "correct but unpinned" is not done).

---

## Annex E — risks, and the named non-goals

| # | risk | mitigation |
|---|---|---|
| **R1** | **The honesty CHECK depends on `clara.agent_user_id()`.** If a later lane ever CoRs that function, the CHECK's meaning silently changes and existing rows are not re-validated. | Pin its prosrc (`0b958c48…`) in the migration's §0 **and** in the tail; state the alternative (a `before insert or update` trigger reading the function at write time) in the PR body. Prediction P-2 settles admissibility. |
| **R2** | **裁-22's shared resolver is being written for ONE document; this door has THREE.** | Gate question G2. If the resolver lands single-document-only, PR-2 holds and the resolver takes an array argument in a follow-up — it does **not** ship with a local copy (that would mint the fourth door 裁-22 exists to prevent). |
| **R3** | **The duplicate-open index changes the HUMAN door's behaviour without changing its body.** A second human proposal now refuses. | Behavioural, intended, and stated in the PR body; cell W7-b proves the typed refusal on both paths; gate question G8 asks the owner to confirm. |
| **R4** | **Two lanes may CoR `clara.list_review_queue` in one window** (裁-17's ninth row_kind and this item's tenth). | The tenth is deferred to train 2 and explicitly sequenced after 裁-17 merges (design §3.6, gate question G5). |
| **R5** | **`eligible_checker_count` is bookkeeper-floored**, while the binding signer floor is admin — 裁-18c's "add a second admin" message could be computed from the wrong number. | Recorded for the 裁-18a/c lane (annex G); not this item's body. |
| **R6** | **A refused proposal still consumes an `op_key` reservation** (reserve-first, design §3.4 W13). A caller that retries after a genuine refusal must mint a new key. | The refusal RAISEs, which rolls the reservation back with everything else — 0142's own reasoning, re-proven by cell W5-a's "no `op_receipts` row" assertion. |
| **R7** | **Clara could propose on a vendor a human deliberately declined.** No `declined` status is ever written today (survey A3), so there is nothing to check. | Gate question G7. Until then `has_open_proposal`/`has_live_binding` are the only loop brakes, and W7 makes the loop refuse rather than duplicate. |

**Named non-goals (each recorded, none silently dropped):**

- **N1** — Clara never signs, declines, revokes or shortens a binding. One transition: `null → proposed`.
- **N2** — no change to F1/F2/F3, the window, the denylist or the content hash.
- **N3** — **no G1 sweep source.** A clock-driven proposal sweep is a `wake_engine_sources` row +
  a workflow export + a login pool + an enable ceremony; the two existing rows are still disabled
  (survey §4). Named as the future extension, not built.
- **N4** — no `ClaraPart` member. The 18-member union and `PART_CATALOG` are exhaustiveness-guarded
  and land in one batched wire bump; a binding-proposal part rides that bump or nothing.
- **N5** — no restoration of the post-time re-check (survey S5).
- **N6** — no egress authorization and no egress-purpose CHECK widening (survey S9).

---

## Annex F — change log

| v | date | change |
|---|---|---|
| v1 | 2026-08-29 | First issue. Survey + design + annexes + gate record authored against a rig at frontier `0142` (137 migrations). Gate **OPEN** with 8 questions. |

---

## Annex G — the cross-lane ledger (what other lanes must know)

| # | to | obligation |
|---|---|---|
| **G-a** | the **裁-18a** hardening lane (signer≠proposer) | Write the wall as an **actor comparison** (`signed_by <> created_by`), never as "the proposer must be a human". `created_by = clara.agent_user_id()` is a real `is_agent` user row (survey S3), so the correct form lets any admin sign Clara's proposals; the wrong form strands every single-admin firm and defeats 裁-18c. |
| **G-b** | the **裁-18a/c** lane | `clara.eligible_checker_count(uuid)` (prosrc `1afd4710…`) already counts non-agent members at **bookkeeper** rank. 裁-18c's message speaks about **admins**. Use an admin-floor read, or the verbatim message will name a number that is not the one the wall enforces (risk R5). |
| **G-c** | the **裁-18a** lane + whoever ships the copy | `apps/web/messages/en.json:1898` — *"propose and sign are rank-gated, not required to be different people"* — and `:1915-1917` — *"Requires admin; the same admin who proposed it may also sign it."* Both are true today (T10 trued them, PR #395 F1) and become **false on the day 裁-18a merges**. Whoever merges the wall flips the copy in the same PR. |
| **G-d** | the **`db-proposal-basis`** lane (裁-22) | The shared resolver needs a **document-set** signature (`uuid[]`), not a single `p_document` — this door's basis spans the three evidence documents the derivation selected. Gate question G2 / risk R2. |
| **G-e** | the **`db-ninth-rowkind`** lane (裁-17) | `clara.list_review_queue` is a shared body. This item's tenth `row_kind` (`vendor_binding_proposed`) is deliberately sequenced **after** yours merges, so the two do not CoR it in one window (risk R4). |
| **G-f** | the **conductor** (shared-surface ledger) | This item touches four named shared surfaces: `clara.wake_fn_allowlist` (+4 rows), the `agent_receipt_surfaces` closed-world CHECK pair (+ the ninth member), `clara._agent_receipts_all` (+1 union arm), and — in train 2 only — `clara.list_review_queue`. It touches **no** `wake_credentials` CHECK, **no** egress purpose CHECK, **no** evaluator closure, **no** workflow export. |

---

## Annex J — the D1 write-quiesce inventory

**The whole item replaces ZERO live PL/pgSQL WRITER bodies.** Enumerated in full:

| PR | object | kind | D1? | why |
|---|---|---|---|---|
| PR-1 | `clara._derive_vendor_binding_basis` | new function | **no** | brand-new name; the tail proves exactly one `pg_proc` row, as a census |
| PR-1 | `clara.binding_agent_receipts` + its shim view | new relation/view | **no** | first creation |
| PR-1 | `clara._agent_receipts_all` | **view CoR** (+1 union arm) | **no** | a view definition has no "in-flight call runs the old body" hazard; once the DDL commits every subsequent SELECT sees the new definition (`0142` §0's own measured reasoning) |
| PR-1 | `vendor_identity_bindings` — 3 ADD COLUMNs, 3 CHECKs, 1 FK, 1 partial unique index | DDL | **no** | ACCESS EXCLUSIVE briefly; carry `set local lock_timeout = '5s'` and say it is **precautionary** |
| PR-2 | `clara.wake_propose_vendor_identity_binding` | new function | **no** | brand-new name |
| PR-2 | `clara._propose_vendor_binding_agent_core` | new function | **no** | brand-new name |
| PR-2 | `clara.wake_list_binding_candidates` | new function | **no** | brand-new name |
| PR-3 | `clara.list_vendor_bindings(uuid)` | **body CoR** | **no quiesce** | `STABLE`, read-only, returns a table; pin prosrc `53a0d3fc…` in §0 and re-assert the new shape in the tail |
| PR-3 | `clara.get_vendor_binding(uuid)` | **body CoR** | **no quiesce** | `STABLE`, read-only; pin prosrc `ce1e8bc4…`. Prediction P-3 first checks whether the CoR is even needed for the new **columns** (`to_jsonb(b)` picks them up) — only the receipt join needs it |
| PR-5 | `clara.list_review_queue` | **body CoR** | **no quiesce** | `STABLE`, read-only; sequenced after 裁-17 (annex G-e) |

**Not in this inventory, and that is the point:** `propose_vendor_identity_binding`,
`sign_vendor_identity_binding`, `revoke_vendor_identity_binding`,
`_derive_vendor_binding_proposal`, `_resolve_vendor_binding`, `_coding_lane_core`,
`_draft_entry_core`, `revise_entry`, `_approve_entry_core`, `_firm_question_core`. Each is pinned
by prosrc in every migration's §0 prestate and re-asserted in its tail, so a drift aborts the
apply rather than passing silently.
