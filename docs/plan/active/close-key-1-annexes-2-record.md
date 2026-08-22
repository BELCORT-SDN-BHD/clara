# F-A4 · Close key ① — annexes 2: the record

> Annexes to `close-key-1-design.md` **v2, 2026-08-22 — gate 2 folded (record:
> `close-key-1-gate-record.md`)**. **E** the verb signatures, the closed refusal vocabulary and the
> new table shapes · **F** the numbered D1 list, **now TWO windows** · **G** the decision register
> and the owner-question grounds · **H** the change log · **I** the human-door spec and the T17
> roster pins. Estate cites resolve against `close-key-1-survey.md`.

---

## Annex E · Signatures, vocabulary, shapes

### E.1 · The thirteen wrapper signatures

Every writing wrapper ends with the same three arguments — `p_rationale text`, `p_model jsonb`
(`{name, version}`), `p_op_key text` — because TA-P4 makes the receipt triple part of the call,
not an afterthought. Reads carry `p_op_key` only where they mint a receipt (they all do: TA-P4
extends the discipline to reads).

| # | signature | grant |
|---|---|---|
| 1 | `wake_list_fiscal_years(p_client uuid, p_op_key text)` | `clara_wake_interactive` |
| 2 | `wake_get_close_plan(p_fiscal_year_id uuid, p_op_key text)` | ” |
| 3 | `wake_get_close_readiness(p_client uuid, p_fy uuid, p_op_key text)` | ” |
| 4 | `wake_verify_close(p_receipt uuid, p_op_key text)` | ” |
| 5 | `wake_snapshot_state(p_snapshot uuid, p_op_key text)` | ” |
| 6 | `wake_dry_run_close_readiness(p_client uuid, p_fy uuid, p_op_key text)` | ” |
| 7 | `wake_open_fiscal_year(p_client uuid, p_label text, p_starts_on date, p_rationale text, p_model jsonb, p_op_key text)` | ” |
| 8 | `wake_begin_close(p_fy uuid, p_rationale text, p_model jsonb, p_op_key text)` | ” |
| 9 | `wake_abandon_close(p_close_run uuid, p_reason text, p_rationale text, p_model jsonb, p_op_key text)` | ” |
| 10 | `wake_propose_close(p_close_run uuid, p_drafted jsonb, p_narrative text, p_rationale text, p_model jsonb, p_op_key text)` | ” |
| 11 | `wake_run_depreciation_catchup(p_client uuid, p_through date, p_rationale text, p_model jsonb, p_op_key text)` | ” |
| 12 | `wake_establish_prepayment_schedule(p_client uuid, p_source_entry uuid, p_rationale text, p_model jsonb, p_op_key text)` | ” |
| **13** | `wake_mint_month_snapshot(p_client uuid, p_month_start date, p_rationale text, p_model jsonb, p_op_key text)` — **new at v2** (TA-P1 C's snapshot mint, D-21) | ” |

*(**Thirteen** is the count that binds every census and every allowlist row — v1 said "eleven" in
four places, v1.1 corrected it to twelve, and gate GM-6 added the snapshot mint. Each recount is
recorded rather than quietly absorbed, per the F-A2 lesson about body counts.)*

**`wake_open_fiscal_year` takes NO `p_ends_on`** — deliberately. Supplying an end date is the
assertion the sitting reserved to a human (design §3.11); the agent core reaches
**`_propose_fiscal_year_core`** (the extraction below `0056:1634`'s `_human_ctx`, **not** the
granted human verb — gate G2) and uses its computed end, or refuses `fy_end_not_on_file`.

**`wake_run_depreciation_catchup` takes `p_through`** because the *scope* of a catch-up is a
choice; but the **periods** it produces are `_fa_run_period_core`'s own arithmetic, and a
`p_through` beyond `_book_today()` refuses.

### E.2 · The closed refusal vocabulary

**Tier A — raises (existing SQLSTATEs, no new class).** `CLR03` no valid wake credential ·
`CLR03` allowlist refusal (`assert_wake_allowed`) · `CLR03` `wake_client_pin_mismatch` ·
`CLR03` `wake_task_unbound` · `CLR10` blank op key / blank rationale / incomplete model ·
**`CLR10` `op_key_not_derived`** (new at v2, D-25: the supplied key is not
`sha256(wake_task_id ‖ verb ‖ subject_id)`) · `CLR11` subject not in the credential's firm ·
`CLR41` the estate's own close-state refusals, unchanged.

**Tier B — typed non-act tokens (new; this list is CLOSED and every member has a cell).**

| token | raised by | meaning |
|---|---|---|
| `close_prep_held` | every F-A4 verb | a live hold stands for this client and purpose |
| `receipt_incomplete` | every F-A4 verb | the model/version/rationale triple is not complete |
| `drawer1_not_clean` | `wake_begin_close` | a measurable drawer-1 check is not `pass` |
| `close_already_in_progress` | `wake_begin_close` | a live run exists (the estate's own token string, reused deliberately — one spelling for one fact) |
| `close_ordering_violation` | `wake_begin_close` | an earlier FY is not closed (estate string, reused) |
| `close_run_attested` | `wake_abandon_close` | a LIVE `close_attestations` row stands on the run — abandoning would void a human's signed drawer-2 statements (**D-20**) |
| `reopen_correction_in_flight` | `wake_begin_close` | the FY is `reopened` and an unapproved FY-dated draft still stands (**D-20**) |
| ~~`close_not_agent_run`~~ | — | **RETIRED at gate 2.** TA-P1 C gives her *"abandoning a close including one she did not open"*; the started-by column is still read and recorded, but it no longer refuses. Listed struck, never silently deleted (law 31) |
| ~~`reopened_year_human_only`~~ | — | **RETIRED at gate 2.** The reopen tell survives an abandon in the receipt chain (`0056:2678-2682`), and TA-P1 C hands her the act |
| `fy_end_not_on_file` | `wake_open_fiscal_year` | no FY end on the client file, or the proposal's fallback would be used |
| `depreciation_authority_absent` | `wake_run_depreciation_catchup` | no live signed authority |
| `prepayment_term_underivable` | `wake_establish_prepayment_schedule` | no term derivable from DB-owned inputs |
| `prepayment_source_unfit` | ” | the source entry is unapproved or its prepaid leg is ambiguous |
| `close_proposal_exists` | `wake_propose_close` | a live proposal stands at the same digest vector |
| `close_proposal_stale` | `wake_propose_close` | the bound gate digests have moved |
| `belt_period_unrun` | `wake_begin_close` | a depreciation/adjustment period is still due inside the FY (F13) — freezing would strand it |
| `wake_task_unbound` | every F-A4 verb | the credential names no agent task, so TA-P4 (2)'s binding cannot be written (F14) |

**Gate-item reasons (payload vocabulary, not refusal tokens):** `uncoded` (the dated gate) ·
`undated` (the NEW `undated_documents` gate, A.5) · `not_measurable_before_finalize` ·
**`adj_oracle_inevaluable`** (new at v2 — the reason `belt_period_unrun` carries when
`adjustment_run_due` cannot be reached from the wake lane, gate G1 / OQ-9).

**Two strings deliberately REUSED rather than re-minted** (`close_already_in_progress`,
`close_ordering_violation`): the human verbs already raise them for the same facts
(`0056:1756`, `:1768`). A second spelling for one fact is how read surfaces start lying —
TA-P12's rename lesson in the other direction.

### E.3 · `clara.agent_act_receipts`

```
id, firm_id, client_id                      not null
act_kind        text not null check (act_kind in ('close_read','close_dry_run','open_fy',
                  'begin_close','abandon_close','propose_close','depreciation_catchup',
                  'prepayment_schedule','mint_snapshot'))  -- CLOSED; extend, never rewrite
                -- 'mint_snapshot' added at v2 with wrapper 13 (D-21); subject_kind 'snapshot'
                -- was already in the closed set below, so only this list moves.
subject_kind    text not null check (subject_kind in ('client','fiscal_year','close_run',
                  'close_receipt','journal_entry','snapshot'))
subject_id      uuid not null
acting_actor    uuid not null references clara.users(id)
on_behalf_of    uuid          references clara.users(id)   -- NULL on the clocked lane, law 68
via_wake_kind   text not null check (btrim(via_wake_kind) <> '')     -- TA-P4: never NULL here
wake_task_id    uuid not null references clara.agent_tasks(id)   -- read from
                -- clara._wake_task_id(), NEVER an argument; F14 builds the carrier
model_name      text not null check (btrim(model_name) <> '')
model_version   text not null check (btrim(model_version) <> '')
rationale       text not null check (btrim(rationale) <> '')
verdict         text not null check (verdict in ('acted','refused'))
rung_vector     jsonb not null default '[]'          -- empty iff verdict='acted'
op_key          text not null
created_at      timestamptz not null default now()
constraint uq_aar unique (firm_id, act_kind, subject_kind, subject_id, op_key)
constraint ck_aar_vector check ((verdict='acted') = (jsonb_array_length(rung_vector)=0))
```

Append-only triggers (`_tf_append_only`, `_tf_no_truncate`), FORCE RLS, **zero DML grant to
every role** — the `close_write_permits` posture (`0056:626-630`). Read is through
`list_agent_act_receipts` only.

**Why not `audit_log`.** It has no model/version/rationale column, its `outcome` CHECK admits
only `'ok'` (`0002:285`) so a REFUSED act cannot be recorded there at all, and widening a table
every writer in the estate inserts into is the widest possible blast radius for the narrowest
possible gain. **Why not `close_receipts`.** It is minted only by finalize and reopen — two
human acts — and its belt requires a `closing_position` (`0056:1547`) no agent act has.

### E.4 · `clara.close_proposals`

```
id, firm_id, client_id, fiscal_year_id, close_run_id      not null (composite FKs, 0007:59 idiom)
state           text not null check (state in ('open','adopted','withdrawn','superseded'))
proposed_by     uuid not null references clara.users(id)   -- the agent identity
bound_digests   jsonb not null       -- {check_key: measured_digest}; the staleness target
drafted         jsonb not null       -- [{check_key,item_key,text}]; the attestation drafts
narrative       text not null check (btrim(narrative) <> '')
model_name/model_version/rationale   text not null, non-blank
settled_by      uuid, settled_at timestamptz, settle_reason text
create unique index uq_close_proposal_live on clara.close_proposals (close_run_id)
  where state = 'open';
```

Supersede-never-mutate, the `close_attestations` discipline (`0056:500-502`). RLS: select for
`clara_authenticated` at `firm_id = clara.jwt_firm()` — the same policy shape `close_runs`
carries (`0056:463`); **no agent policy**, because she reaches it through her own wrapper.

### E.5 · `clara.close_prep_holds`

```
id, firm_id, client_id                      not null
purpose      text not null check (purpose in ('close_prep'))   -- CLOSED; extended by later items
held_by      uuid not null references clara.users(id)
reason       text not null check (btrim(reason) <> '')
held_at      timestamptz not null default now()
released_by  uuid, released_at timestamptz, release_reason text
constraint ck_hold_release_paired check ((released_by is null) = (released_at is null))
create unique index uq_hold_active on clara.close_prep_holds (client_id, purpose)
  where released_at is null;
```

Release-only update trigger (`0056:1078-1097`'s shape), append-only otherwise. Written by two
new human verbs at the **bookkeeper** floor — `hold_close_prep` / `release_close_prep` — because
pressing the brake must be cheaper than any act it stops.

---

## Annex F · The numbered D1 list — TWO windows (design §5)

**D1 = a write-quiesce window is required** because the object is a deployed audited writer whose
body or signature is being replaced, or is reached from one inside the same transaction. Run from
merged `main`. Each row states why. **The list was RE-DERIVED from the verb table at gate 2**
(GM-1: three live bodies were missing from v1's fourteen rows) and **SEVERED into two windows**
(the width ruling, **D-24**).

### F.1 · WINDOW A — the measurement layer (PR-1a)

Nothing here touches a wake surface, a receipt table or a wake kind.

| # | object | change | why D1 |
|---|---|---|---|
| A1-1 | `clara._evaluate_one_gate(uuid,text)` | CoR — delegates to the new `_measure_one_gate`, and its dispatch gains the `undated_documents` arm | a writer (`close_gate_results`) reached from `finalize_close`'s transaction |
| A1-2 | `clara._gate_outstanding_items(text,jsonb)` | CoR — a new `undated_documents` branch | read by both `finalize_close` and `get_close_readiness`; **the one body window A shares with the finalize path**, which is why A runs first |
| A1-3 | `clara.close_gate_checks` | **INSERT** — a fourteenth catalog row, `undated_documents` (census C15) | not a CoR, but it changes what `_evaluate_close_gates` loops over inside a live writer's transaction, so it lands with A1-1/A1-2, never between them |

*Additive in the same PR, no window needed:* `clara._measure_one_gate` and
`clara._close_gate_undated` (created before A1-1 references them), and `_close_dry_run_core`.
**`clara._close_gate_uncoded` is NOT here** — gate GM-4 moved the F3 repair into the new sibling
evaluator, so the dated gate's body is untouched (v1's D1-7 is withdrawn).

### F.2 · WINDOW B — the close-lifecycle writers (PR-1b)

| # | object | change | why D1 |
|---|---|---|---|
| B1-1 | `clara.close_receipts` | ALTER — `segregation_mode` CHECK gains `agent_prepared` | a live-table CHECK swap on a table **`finalize_close` AND `reopen_fiscal_year`** both insert into (gate GM-5) |
| B1-2 | `clara.fiscal_years` | ALTER — `fy_end_source` CHECK gains `asserted_by_file` | live-table CHECK swap; the column is NOT NULL and read by three shipped surfaces |
| B1-3 | `clara.close_attestations` | ALTER — new `authored_by`, `adopted_verbatim` columns | live table written by `attest_close_exception`; defaulted-nullable so existing rows stay valid |
| B1-4 | `clara.wake_credentials` | ALTER — both CHECKs extended for `close_prep` | live-table CHECK swap on the credential table every wake reads; authored against the **post-F-A2** text |
| B1-5 | `clara.wake_credentials` | ALTER — new nullable `agent_task_id` (F14) | the same live table as B1-4, listed separately so the review sees two distinct changes |
| B1-6 | `clara.agent_tasks` | ALTER — `kind` CHECK gains `close_prep` | live-table CHECK swap |
| B1-7 | `clara.finalize_close(uuid,text,text)` | CoR — task #17 Fix A's `closing_transfer` (`0056:2242-2246`), §3.9 changes 1-3, the authorship read | deployed audited writer; an in-flight call spanning the replace would run the old route |
| B1-8 | `clara.reopen_fiscal_year(uuid,text,jsonb,text,text)` | CoR — Fix A's mirror marking (`0085:379-386`) **and §3.9 change 4's segregation re-aim at `0085:344-345`** (gate GM-5 — v1 listed only the mirror) | same; `0085`'s own header sets the precedent |
| B1-9 | `clara.attest_close_exception(uuid,text,text,text,text)` | CoR **+ signature change** (`p_from_proposal uuid default null`) | deployed audited writer with a **shipped dashboard caller** (`closeApi.ts:151`); named args keep it compatible, the window covers the swap |
| B1-10 | `clara.begin_close(uuid,text)` | CoR — body-moved to `_begin_close_core` **from `0056:1734`, i.e. BELOW the capability gate** (D-15); behaviour byte-equivalent | deployed audited writer |
| B1-11 | `clara.abandon_close(uuid,text,text)` | CoR — the same body-move, from `0056:1955` | same |
| B1-12 | **`clara.open_fiscal_year(uuid,text,date,date,text,text)`** *(gate GM-1, missing from v1)* | CoR — body-moved to `_open_fiscal_year_core` below `0056:1665`'s `_human_ctx(admin)`; the core takes the honesty label as an argument | **a deployed audited writer**: it INSERTs `fiscal_years` (`0056:1701-1705`), calls `_audit` (`:1706`) and `_append_event` (`:1710`), and computes `fy_end_source` in-body (`:1697-1700`) — the very domain B1-2 extends |
| B1-13 | **`clara.propose_fiscal_year(uuid,date)`** *(gate GM-1/G2, missing from v1)* | CoR — body-moved to `_propose_fiscal_year_core` below `0056:1634` | STABLE, but **called in-body by `open_fiscal_year` at `0056:1697`**, so it is reached from a live writer's transaction; replaced in the same window rather than split |
| B1-14 | **`clara.mint_month_snapshot(uuid,date,text)`** *(new at v2 — D-21)* | CoR — body-moved to `_mint_month_snapshot_core` below `0057:780` | a deployed audited writer that takes `203005007`-EXCLUSIVE and mints `period_snapshots` |
| B1-15 | **`clara._tf_agent_task_insert()`** *(gate G4)* | CoR — a `close_prep` arm before the terminal `else raise` (`0011:1241`) | a BEFORE trigger on `agent_tasks`, fired by every chat turn and every wake in flight |
| B1-16 | **`clara._tf_agent_task_update()`** *(gate G4)* | CoR — a `close_prep` transition arm before the terminal `else false` (`0011:1277`) | same trigger family, same live table |

### F.3 · NOT on either list, and why

- **Additive — nothing in-flight can be inside a body that does not exist:** the thirteen wrappers,
  the agent cores, the two new evaluators, the three new tables, the two hold verbs, both F14
  siblings (`mint_wake_credential_for_task`, `_wake_task_id`), and — if **OQ-9** rules (a) — the
  additive ungranted `clara._adjustment_run_due_core` (the live `adjustment_run_due` becomes a thin
  delegate keeping its own `_assert_due_read_ctx`; the CoR is a **read** body reached from no
  writer, so it needs no window, but it DOES need a prestate pin and a parity cell — C-19).
- **Read extractions, CoR'd but window-free** (gate GM-1 asked that these be listed rather than
  left silent): `clara.get_close_readiness(uuid,uuid)` (`0056:2618`), `clara.verify_close(uuid)`
  (`:2529`) and `clara.list_fiscal_years(uuid)` (`:2665`) each become thin delegates over a new
  `_core`. All three are `stable`, write nothing, and are reached from no writer's transaction, so
  Annex F's own definition does not force a window — but each gets a **prestate pin and a parity
  cell** (C-21), including `has_active_reopen_receipt`.
- **Genuinely unchanged:** `clara.get_close_plan` (D-04) · **`clara.snapshot_state`** — the agent
  reaches the pre-existing ungranted `clara._snapshot_state_core` (`0057:564`), so *no* extraction
  is needed (gate G2 corrected v1's "unchanged, and fine" for the wrong reason) · `wake_context()`
  and `mint_wake_credential`'s live five-arg body (D-13; C13/C14) · `_close_gate_uncoded` (D-18) ·
  `clara.reverse_entry`, `_tf_period_wall`, `_approve_entry_core` and **every `0041` body**
  (D-14) — the tail census pins them unmoved.

**Ordering.** Window A: `_measure_one_gate` + `_close_gate_undated` created → A1-1 → A1-2 → A1-3.
Window B: the ALTERs (B1-1..B1-6) before every CoR that depends on their new values → the writer
CoRs B1-7..B1-14 → the trigger CoRs B1-15/B1-16 → then, outside both windows, the thirteen
wrappers, their allowlist rows and the tail census, with grants riding their consumer's PR (I.2).

---

## Annex G · Decision register

### G.1 · Decisions taken under the standing delegation

| id | decision | grounds | alternative, and its cost |
|---|---|---|---|
| **D-01** | `begin_close` / `abandon_close` are **body-moved** to shared cores; the human verbs become thin delegates | TA-P11's one-architecture test: one close semantic, two entrances. The estate's own containment idiom (`0004:749-750`) | Copy the logic into agent-only cores: no live human body is touched (TA-P1's rider read maximally), but two close semantics drift the moment either is patched. **Cost of the choice taken:** two live human bodies are recut, priced into the D1 window we already own |
| **D-02** | `attest_close_exception` is recut for authorship (§3.9) | TA-P4 (5) requires the receipt to record author + verbatim-adoption; deriving it by string comparison is refused by review law 27(2) | Do not recut (OQ-5's fail-closed default): TA-P4 (5) stays half-discharged and the receipt says `unproven` |
| **D-03** | the dry run reuses `_measure_one_gate`; no separate preview evaluator | TA-P11 — two mutually-unaware computations of one fact are two architectures | A standalone preview: no D1 on `_evaluate_one_gate`, at the price of the exact defect class TA-P11 was ruled to prevent |
| **D-04** | the agent reads through **wrappers**, not through a `clara_agent_ro` grant on `get_close_plan` | a `close_prep` credential is **client-pinned**; `get_close_plan` is firm-scoped, so a bare grant would let the clocked lane read every client's plan in the firm. It also leaves T4's census (C3) green and unweakened | The contract's literal recipe (one-line grant + T17 pin): cheaper by one verb, wider by a whole firm |
| **D-05** | `agent_act_receipts` is a **generic** carrier, adopted by F-A5/F-A6/F-A8 | TA-P4's ruling extends the discipline to *every* agent judgement act; one carrier is one architecture | Per-item receipt tables: four shapes for one discipline. F-A2's `entry_post_receipts` is left alone regardless — recutting a shipped table mid-wave is the worse move |
| **D-06** | the proposal gets its **own** carrier, not an `open_questions` scope extension | F7: no FY subject in the scope CHECK, no FK to `fiscal_years`, and `resolve_open_question` can carry neither a digest vector nor a drafted attestation set | Extend the enum (safe for F-A2's B9 — F7's adjacent fact — but insufficient): a proposal whose staleness cannot be tested is one nobody should act on |
| **D-07** | the notice is **concurrent with the first act**, not a quiet period before it | a delay before the first act is indistinguishable from law 21's ramp, which TA-P5 forbids; the live hold is the brake instead | A notice window: friendlier, and it re-imports the ramp through the back door |
| **D-08** | ~~`close_prep_due()` **excludes `reopened` years**~~ — **RE-CUT at gate 2 by D-20.** The oracle now admits a `reopened` year **with no correction in flight**; the exclusion was an authority narrowing dressed as a cadence choice | v1's ground (re-freezing blocks the human's own correction behind CLR19, agenda `OQ-A4-5`) survives as the WALL, not as a refusal of the verb | v1's blanket exclusion: simpler, and it refuses a verb TA-P1 C gave her, with no dissent on file |
| **D-09** | `agent_prepared` is decided by the agent-preparation probe **alone** and outranks the other two labels | under-claiming review is fail-closed; over-claiming `two_person` is the harm TA-P6 named | A compound value (`two_person_agent_assisted`): more precise, and it widens a live CHECK's domain to four for a distinction no wall reads. Surfaced as **OQ-2** |
| **D-10** | the undated population lands in **drawer 2** as `unknown`, itemised — **the drawer choice stands; D-18 re-cuts WHERE it lands** | drawer 2 already treats `unknown` exactly like `fail` (`0056:2074`) and gives the professional an attested path; drawer 1 has no path at all | Drawer 1: some clients become unclosable until every historical document is dated. Surfaced as **OQ-3** |
| **D-11** | the prepayment evaluator mints an **`adjustment_templates`** row; F-A4 writes no journal line | the belt, the reversal semantics and the immutability are already built and reviewed (`0045`) | A new prepayment subledger: a second posting machine for a fact the estate already posts |
| **D-12** | `close_already_in_progress` and `close_ordering_violation` are **reused**, not re-minted | one spelling per fact; a second spelling is how read surfaces begin to lie | New agent-side names: tidier vocabulary, two strings for one fact |
| **D-13** | the credential↔task binding (F14) is built from **siblings** — `mint_wake_credential_for_task` + `_wake_task_id` + a nullable `wake_credentials.agent_task_id` — and `wake_context()` is left byte-identical | TA-P1's rider, and blast radius: `wake_context()` is read by every wake wrapper in the estate, so widening its return type to satisfy one item's receipt is the widest possible change for the narrowest gain. A NULL task refuses (`wake_task_unbound`) rather than writing an unbound receipt | Widen `wake_context()` and recut `mint_wake_credential` in place: one carrier instead of three objects, at the price of a drop-and-recreate on the two most-read wake bodies (the `0011:1130-1131` precedent shows it takes exactly that) and a D1 window covering every wake lane |
| **D-14** | F-A4 adds **no** fiscal-year predicate to `depreciation_run_due` / `adjustment_run_due` and **changes no answer either gives**; it refuses the freeze instead (rung B13) and escalates the post-close case (OQ-6). **NARROWED at gate 2 by D-26:** v1's blanket "no edit to `0041`/`0045`" is replaced by "no change to what the oracles ANSWER" | changing a due oracle to skip frozen years would make the trapped period **disappear** from the only instrument that can see it — the vacuous-green class F3 is being repaired for, minted a second time | Widen the oracles: closes are never blocked by a lagging belt, and a genuinely unposted period silently stops being due — an accounting error with no reader |

### G.1b · Decisions taken at gate 2 (the PR-0 fold)

Each row names the gate finding it folds; the record's own §2/§3 carry the bytes.

| id | decision | grounds | alternative, and its cost |
|---|---|---|---|
| **D-15** | the shared cores begin **BELOW the human capability gate** (`0056:1734`, `:1955`), and each entrance's authority wall is NAMED (Annex A.8) | gate **GB-3/G3**: the first statement below `_human_ctx` is `_has_capability(…,'close_and_attest')`, which the agent identity can never satisfy — so "everything below the `_human_ctx` line" either darkens key ① or silently deletes the estate's only key-① wall, and the design said neither | Cut below the capability gate without saying so: the same code, undocumented, with cell C-12 (human-entrance only) unable to catch the deletion. Or grant the agent the capability — which contradicts §7 and `OQ-A4-14` and is the owner's call, not ours |
| **D-16** | `wake_snapshot_state` reaches the **pre-existing ungranted `_snapshot_state_core`** (`0057:564`); `propose_fiscal_year` and `open_fiscal_year` are **extracted** | gate **GB-2/G2**: `snapshot_state` (`0057:578`) and `propose_fiscal_year` (`0056:1634`) both open `_human_ctx`, so v1's "unchanged" routing was dark; but the snapshot core already exists, so only the FY chain costs a recut | Extract a fourth snapshot core: a live-body recut bought for nothing |
| **D-17** | `wake_list_fiscal_years` reaches **`_list_fiscal_years_core`** extracted from the live body; there is no `_close_reads_core` | gate **GM-2**: a new hand-written FY list is a second computation of one fact — `has_active_reopen_receipt` (`0056:2681-2682`) the first key to drift. TA-P11, and the same reasoning D-03 applies to the dry run | A purpose-built agent projection: cheaper today, two FY lists forever. Parity is proven (C-21), not asserted |
| **D-18** | the undated population gets its **OWN drawer-2 catalog row** `undated_documents`, its own evaluator and its own digest, bounded `filed_at <= fy.ends_on` | gate **GM-4**: folding it into `uncoded_documents` made an append-only catalog title false (`0056:403`, trigger `:378-379`) AND let one new undated filing anywhere in the client's history move the digest signed attestations bind to (`:1466`, `:2083-2100`) — a re-attestation event every day once F-A7's filing lane runs | v1's single-gate fold: one fewer catalog row, at the price of spurious re-signing and an uncorrectable false title. The unbounded variant is **OQ-8** |
| **D-19** | `reopen_fiscal_year`'s own `segregation_mode` computation (`0085:344-345`) gets the **same** re-aim as `finalize_close`'s | gate **GM-5**: it writes the identical column under the identical CHECK, so TA-P6's "never `two_person` for an agent-prepared year" is half-true otherwise — and the body is already open in window B for Fix A's mirror | Leave it: the reopen receipt keeps saying `two_person` on a year Clara prepared, in the same PR that fixes the sentence next door |
| **D-20** | **abandon-any-run and re-freeze are HERS**, walled by B6 `close_run_attested` and B14 `reopen_correction_in_flight`; B7 is withdrawn and D-08 re-cut | gate **GM-6 + GM-9**: TA-P1 C's own text (`0074:31-33`) and the contract (`wave-f-contract.md:154-156`) hand her both; v1 built the A-column shape and recorded no dissent. TA-P1's third rider is **walls validate**, so the ruled width ships behind mechanical walls | Keep v1's refusals: safer by the orchestrator's reading, but it refuses verbs the register gave her without the owner's word. **The orchestrator's dissent is recorded here, not acted on** — abandoning a stranger's run and re-freezing a year mid-correction both surprise a human — and put to the owner as **OQ-7** |
| **D-21** | **`wake_mint_month_snapshot` is built** — wrapper 13 over `_mint_month_snapshot_core`, extracted below `0057:780` | same ruling, same list ("snapshot mint"); the survey's §8 line *"the contract gives the agent the read half only"* was true of the pre-amendment contract and is false now | Ship the read half only: a ruled verb missing from the build with nothing on file saying why |
| **D-22** | B13 refuses on **`period_end <= fy.ends_on`** and on an outstanding belt draft read DIRECTLY | gate **GM-3**: `_fa_oldest_unmet_period` returns the GLOBAL oldest (`0041:1934-1943`), so "inside the FY" passes forever once a period strands; and `period_draft_outstanding` (`:1918-1921`) is a not-due answer hiding a draft CLR19 will refuse after the freeze | v1's wording: the rung written to prevent F13 reproduces F13 one year later |
| **D-23** | **F-A4's PR-1b OWNS task #17 Fix A**; F-T4's fix queue stands down and Track B's **13-cell battery rides F-A4** in full (D.5) | gate **GM-7**: `PROGRESS.md:113`/`:167-168` put Fix A in Track B's queue while this design folds it into its own migration — two lanes, one `finalize_close` body, no adjudication. The shared window is the evidence: whoever holds the window holds the fix | Leave both claims standing: whichever merges second loses the other's change or re-opens the window. PR-4 trues `PROGRESS.md` and the contract's F-T4 row |
| **D-24** | **PR-1 is SEVERED into window A (measurement) + window B (lifecycle writers) + an additive PR** | the width ruling (record §5): the re-derived list is sixteen D1 rows, not fourteen, and A's blast radius is disjoint from B's — A touches no wake surface, no receipt table, no wake kind. v1 declined severance for the cost of one review of `_gate_outstanding_items`, which is in the finalize window either way | One window: one ceremony night instead of two, with a mid-window failure stranding the whole close estate at once |
| **D-25** | op keys are **derived** `sha256(wake_task_id ‖ verb ‖ subject_id)` and the wrapper **re-computes and checks** them | gate **GN-4** (the stickiness claim itself was REFUTED — every rung is evaluated on every call — but the derivation was never stated, and "deterministic" without a formula is a builder's coin flip): one key per (task, verb, subject) makes a retry a replay and a new wake a new measurement | Leave it unstated: `_reserve_op` (`0004:46-60`) either replays a dead refusal across wakes or never dedupes a retry, depending on what the builder picks |
| **D-26** | the ONE permitted edit to `0045` is an **additive ungranted `_adjustment_run_due_core`** below the admission (`0045:5525`), recommended at **OQ-9**; §7's blanket non-goal narrows to "no change to what the oracles ANSWER" | gate **GB-1/G1**: `_assert_due_read_ctx` (`0042:437-454`) admits only `clara_runtime` when `jwt_sub()` is null, so B13's ADJ half RAISES CLR03 inside the freezing transaction — and v1's §7/D-14 forbade the only in-place fix. The extraction changes no answer, no grant and no admission for any existing caller | (b) a second F-A4-written "due" predicate — two readings of one fact, a TA-P11 cost; (c) belt-recorded probes with a freshness bound — indirection, and a staleness window in the freezing transaction. **Until the owner rules, the fail-closed default stands: the freeze REFUSES** |
| **D-27** | the new wake kind extends **FOUR** sites: both `wake_credentials` CHECKs, `agent_tasks.kind`, the allowlist — **plus both `agent_tasks` trigger bodies**, on the `autodraft` (not `wake`) lifecycle | gate **G4**: the triggers dispatch on `kind` with `else raise 'unknown task kind'` (`0011:1241`) and `else false` (`:1277`), so a CHECK-only extension yields a kind that cannot be born or move; and the `wake` arm's `held`-birth / `held→cancelled`-only rule (`:1230`, `:1271`) describes a task nothing in the estate executes | Reuse `kind='wake'`: no CHECK swap, and a clocked task that can only ever be cancelled. **F-A3/F-A5 adopt this arm rather than minting their own** (TA-P11) |

### G.2 · Grounds for the owner questions (design §4)

- **OQ-1 (cadence).** The recommendation matches the six daily belts already in the leader
  (`leader.mjs:41-73`), so the operational shape is one nobody has to learn. The seven-day
  default exists because a *delay* is not a *skip* — it degrades timeliness, never correctness.
- **OQ-2 (label priority).** See D-09. The reason this is an owner question rather than a
  builder's call: the label appears on a professional record a regulator may read, and how
  harsh it should sound is the owner's judgement, not the build's.
- **OQ-3 (drawer).** See D-10. Escalated because it decides whether some real clients can close
  at all this year.
- **OQ-4 (prepayment term).** Inferring a 12-month default would put a model-chosen number into
  the books through the back door — law 1 / hard constraint 2. The recommendation and the
  fail-closed default are the same, so the build proceeds; it is listed because the owner may
  want a firm-level accounting-policy row instead, which would be F-A8's shape.
- **OQ-5 (recutting `attest_close_exception`).** The rider's purpose is to avoid buying a D1
  window per grant; we already own the window for `finalize_close`, so the rider's cost argument
  does not apply. What remains is a judgement about touching a human door at all, which is the
  owner's.
- **OQ-6 (a belt period that falls due after a lawful close).** See D-14. It is the owner's
  because the only honest remedies are *reopen the year* (key ③, his) or *carry the charge into
  the next year* (an accounting-policy choice with a real P&L effect), and a design lane may pick
  neither. The recommendation — surface it as a typed question naming client, period and year —
  is the fail-closed shape either way: it converts today's silent daily log line
  (`reconciler-fa.mjs:154-157`) into something a professional can see and decide.
- **OQ-7 (the width of TA-P1 C's three verbs).** See D-20/D-21. It is the owner's for two
  reasons, and neither is "we could not decide". First, the design lane **narrowed a ruling in v1
  without recording a dissent**, which is the failure the harness's owner-rulings protocol exists
  to catch; the honest repair is to widen to the ruling AND put the walls on the record for his
  eye. Second, **F-A5/F-A6/F-A7 all bind under the same unqualified "TA-P1 C"**, so whichever
  answer he gives should be written into the sitting ledger as a NAMED rider, not buried in this
  item's register — otherwise the next item derives a different scope from the same words. The
  accounting costs of the widened shape, stated plainly: abandoning a stranger's run voids the
  drawer-2 attestations he signed against it (B6 is exactly that wall), and re-freezing a
  reopened year can surprise the human who opened it even after his drafts are posted (B14 bounds
  it, but does not abolish the surprise).
- **OQ-8 (an undated document filed after the year end).** See D-18. The trade is real in both
  directions and it is an accounting-visibility judgement, not an engineering one: **include it**
  and every late-filed undated document anywhere in the client's history re-opens signed
  attestations (`0056:2083-2100`) for a year already measured; **bound it** and a December bank
  letter filed in January is not in December's gate. The recommendation bounds the gate and keeps
  the fact visible off-digest (a plan count plus OQ-6's question), because a re-attestation storm
  teaches professionals to re-sign without reading — the worse failure of the two.
- **OQ-9 (B13's ADJ oracle admission).** See D-26 and gate record §2/§6. Escalated because every
  route out crosses a line a design lane may not cross alone: (a) edits `0045`, which v1's own §7
  and D-14 forbade — the reversal must be the owner's, not a lane quietly re-reading its own
  non-goal; (b) mints a second reading of "due", which TA-P11 was ruled to prevent; (c) moves the
  measurement out of the freezing transaction, which is the property B13 exists for. **The build
  is not blocked** — the fail-closed default (an inevaluable probe counts as DUE and the freeze
  refuses) is buildable today and never raises — **but it makes every clocked close on a client
  with a live adjustment template refuse until the owner rules**, which is a cost worth his eye
  before PR-1c is written, not after.

---

## Annex H · Change log

**v1 (2026-08-22)** — first issue. Written from the estate survey against the 2026-08-22 Track-A
sitting rulings TA-P1 C · TA-P2 A+ · TA-P4 A · TA-P5 A · TA-P6 A · TA-P14 A. Twelve decisions,
five owner questions, fourteen D1 rows, 32 battery cells.

**v1.1 (2026-08-22, same day)** — the **cite re-read**: every `file:line` in all four files was
resolved mechanically and its line printed back; **nine had drifted** by one to three lines and
are corrected (`0056:242`/`:245` fiscal-year CHECKs · `:1756` `close_already_in_progress` ·
`:1982` the abandon flatten · `:1983`/`:2343` the two `_audit` calls · `:2074` drawer-2's
`unknown` arm · `:652` the period wall's shared lock · `0041:3617` `depreciation_run_due`).
The same pass produced **two new findings** — **F13** (the depreciation and adjustment belts run
daily already and have zero close-awareness, so a freeze strands a due period behind CLR19
forever) and **F14** (no credential↔task link exists anywhere, so TA-P4 (2)'s binding must be
built) — and **settled** v1's open task-id prediction. Folded in: rung **B13**
(`belt_period_unrun`) and token `wake_task_unbound` · **OQ-6** · decisions **D-13**/**D-14** ·
D1 row **D1-13** (and v1's `mint_wake_credential` row REMOVED — D-13 replaces the recut with a
sibling) · censuses **C13**/**C14** · cells **C-15..C-18** · the honest **twelve**-wrapper
count (v1 said eleven in four places) and the honest **32**-cell count (v1 said 34).
Now: fourteen decisions, six owner questions, **fourteen** D1 rows (one v1 row REMOVED — see
Annex F), **36 battery cells**.
**No PR-0 gate has run yet**; when it does, its record becomes this design's specification and
v2 folds it, as `f-a2-pr0-gate-record.md` did for F-A2.

**v2 (2026-08-22, same day) — THE PR-0 GATE IS FOLDED.** Record:
**`close-key-1-gate-record.md`** (two lenses, every finding adversarially verified; **3 blockers ·
10 materials · 3 nits CONFIRMED, 2 REFUTED**). What moved:

- **Blockers.** **GB-1** → §3.6's B13 arm 3 + **OQ-9** + **D-26** (the ADJ oracle cannot be reached
  from the wake lane; fail-closed until ruled). **GB-2** → §3.1/§3.11's corrected delegate chain +
  **D-16** (`_snapshot_state_core` already exists; `propose_fiscal_year`/`open_fiscal_year` are
  extracted). **GB-3** → §3.1's **entrance seam**, Annex A.8, **D-15**, cell **A-9**.
- **Materials.** **GM-1** → Annex F re-derived (three missing live bodies; sixteen D1 rows across
  two windows). **GM-2** → **D-17** + cell C-21. **GM-3** → **D-22** + cells C-20. **GM-4** →
  **D-18** (a new `undated_documents` catalog row, own digest, `filed_at` bound) + **OQ-8** +
  cell A-11 + census **C15**. **GM-5** → §3.9 change 4, **D-19**, cell A-10, D1 row B1-8.
  **GM-6/GM-9** → §1 and §3.4 widened to TA-P1 C's ruled width with walls B6/B14, **D-20**,
  **D-21** (wrapper 13), **OQ-7**, dissent recorded. **GM-7** → **D-23** (F-A4 owns task #17 Fix
  A; the 13-cell battery rides it — D.5). **GM-8** → Annex C's `mint_wake_credential` row and
  §3.3 re-written to the POST-F-A2 four-kind text. **GM-10** → the header names THREE pending
  digest items and §5 lists TA-P5's law-21 narrowing as a prerequisite.
- **Nits.** **GN-1** → Annex A.6's four spans and the `md5` cite corrected (`1433` · `1434-1449` ·
  `1450-1457` · `1458-1462` · `:1466`), design §3.5's in-body-checks cite → `0056:396-397`, A.3's
  B3 quote → `0056:2070`, Annex I's abandon-reason cite → `0056:1958-1961`, survey §4's dev-JWT
  seam → `page.tsx:39`, and Annex H's coverage claim narrowed to what the pass actually covered.
  **GN-2** → survey §1.1's `propose_fiscal_year` and `snapshot_state` rows corrected.
  **GN-3** → §1's TA-P1 rider re-worded to how D-01 applies it, with the forward pointer.
  **GN-4** → **D-25** + cell B-11. **GN-5** → §3.8's explicit both-entrances clause.
- **Refuted, recorded so nobody re-raises them** (record §8): the op-key **stickiness** claim
  (every rung is evaluated on every call — Tier B's own law; `fn` namespaces differ; B-4/C-16
  already test it) and the `via_wake_kind` **contradiction** claim (the design already disposes of
  it at line 77 and Annex E.3; the contract's "receipts" is TA-P4's carrier, not `audit_log`).
- **Counts after the fold, each recounted rather than carried:** **thirteen** wrappers ·
  **twenty-seven** decisions (D-01..D-27) · **nine** owner questions · **nineteen** D1 rows across
  **two** windows — three in window A, sixteen in window B — plus the read-extraction carve-out ·
  **forty-six** battery cells (A-1..A-11 · B-1..B-12 · C-1..C-23) plus task #17's thirteen ·
  censuses **C1-C16**.

**Still unsettled, rather than guessed:** OQ-1's cadence window, and OQ-7/OQ-8/OQ-9. v1's open
task-id item was **settled at the bytes** in the v1.1 re-read (survey F14 → D-13).

---

## Annex I · The human doors, and the T17 roster pins

### I.1 · The six controls on `/close`

All six ride the page's existing client-switch race guard (`page.tsx:15-27`), render shape +
label rather than hue alone (`page.tsx:39-56`), and compute no cents (`page.tsx:11-13`). Each
new call is added to `closeApi.ts` in the same defensive-skin style as `toClosePlan`
(`closeApi.ts:117-134`) — an unrecognised envelope renders "unavailable", never a guess.

| control | verb | floor rendered | states |
|---|---|---|---|
| **Finalize (key ②)** | `finalize_close(p_fy, p_self_attestation, p_op_key)` | shown only when the plan's `close_run.state='present'/'in_progress'` | the self-attestation box appears only when the firm has one eligible checker; the CLR41 refusals render verbatim by `reason` |
| **Abandon** | `abandon_close(p_close_run, p_reason, p_op_key)` | reason required, mirroring the verb (`0056:1959-1962`) | confirms with the FY label; refuses render verbatim |
| **Review card** | reads `close_proposals`; **adopt** walks `attest_close_exception` per item then hands off to Finalize; **decline** withdraws | rendered when a live proposal exists for the run | each drafted attestation sits beside its gate row with an "edit before signing" box; editing sets `adopted_verbatim=false` |
| **Reopen (key ③)** | `reopen_fiscal_year(p_fy, p_reason, p_correction_target, p_attestation, p_op_key)` | reason **and** correction target both required | the `ends_on`-dated mirror is explained in the confirm text — a professional must know the reversal lands in the reopened year, not today |
| **HOLD / release** | `hold_close_prep` / `release_close_prep` | bookkeeper floor | a held client shows a persistent banner naming who held it, when and why |
| **Receipt panel** | `list_agent_act_receipts(p_client, p_since)` | bookkeeper+ | one row per agent act: kind, subject, model + version, rationale, verdict, and the failing-rung vector when refused |

**The notice card** (design §3.3) is not a control: it renders the
`close.preparation_started` event with the FY label and a link to the plan, and it carries the
HOLD button so the brake is one click from the notice.

**Named gap:** no human `begin_close` door (design §3.11's closing paragraph). Registered here
so a later reader finds the reason rather than the absence.

### I.2 · T17 roster pins — every new grant names its shipped consumer

T17's rule (`rig-isolation.test.mjs:531`; `0064:24-28`): **a grant is named by a shipped
consumer, never by a design's anticipation of one.** Each pin below must be true at the merge
of the PR that makes the grant, or the grant does not ship in that PR.

| grant | consumer that names it |
|---|---|
| the **thirteen** `wake_*` wrappers → `clara_wake_interactive` | the new closePrep.v1.tools.ts under `packages/runtime/workflows/` (PR-2, unbuilt). **Gate note (GB-2/GB-3):** a wrapper whose delegate cannot answer under a wake session is a pin naming a verb that can never fire — so the roster row ships only after cell **C-19** (the ADJ oracle probed through a real `clara_wake_interactive` session) and cells **C-21/C-22** are green |
| `close_prep_due()` → `clara_runtime` | the new leader belt in `packages/runtime/lib/leader.mjs` (PR-2) |
| `mint_wake_credential_for_task(...)` → `clara_runtime` | the same belt's credential mint, `packages/runtime/lib/pools.mjs` (PR-2) — the sibling's grant mirrors `mint_wake_credential`'s (`0011:1196-1197`), and `_wake_task_id()` stays **ungranted** |
| `hold_close_prep` / `release_close_prep` → `clara_authenticated` | the HOLD control in `apps/dashboard/app/close/page.tsx` (PR-3) |
| `list_agent_act_receipts` → `clara_authenticated` | the receipt panel, same file (PR-3) |
| a read of `close_proposals` → `clara_authenticated` | the review card, same file (PR-3) |

**Consequence for the build order:** PR-1 may create every wrapper but **must not grant** the
ones whose consumer ships in PR-2/PR-3 — or it must ship the grants in those PRs. The design
takes the second reading (grants ride with their consumer's PR), which keeps T17 literally true
and costs one extra small migration per PR. Recorded here because it is the kind of thing a
builder discovers at the gate otherwise.
