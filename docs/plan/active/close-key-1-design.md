# F-A4 — Close key ①: design v2

> **Design doc of record for Wave-F Track A item F-A4** (`wave-f-contract.md` §F-A4), carrying
> **TA-P14's closing criterion**. **v2, 2026-08-22 — gate 2 folded (record:
> `close-key-1-gate-record.md`)**. Estate as-found: **`close-key-1-survey.md`** v1.2 — findings
> **F1-F14**, censuses **C1-C16**, predictions **P1-P16**. **Annexes:**
> `close-key-1-annexes-1-mechanics.md` (**A** ladder + decision tables · **B** the evaluators ·
> **C** the wake-kind census · **D** the battery) · `close-key-1-annexes-2-record.md`
> (**E** vocabulary + shapes · **F** the D1 list, now TWO windows · **G** decision register ·
> **H** change log · **I** human doors + T17 pins).
>
> **Binds under** the 2026-08-22 Track-A sitting — **TA-P1 C** (three riders) · **TA-P2 A+** ·
> **TA-P4 A** · **TA-P5 A** · **TA-P6 A** · **TA-P14 A** — and digest laws **71 · 72 · 73 · 76**,
> **21** (as narrowed by TA-P5), **25** (as amended by 0071 G2), **23**,
> **1 · 2 · 4 · 6 · 7 · 22 · 27 · 28 · 29 · 31 · 34 · 68 · 69**. Every build PR takes the uniform
> ADR-061 ladder; **every rung of §3.2 and every branch of §3.9 is judgement logic** (law 27(1)).
>
> **THREE digest items were pending the owner's sign-off** (the session-local PR-1 ledger's sitting-closing
> list (i)(ii)(iii)) **and this design is written under them** — **PREREQUISITE SATISFIED 2026-08-22: the
> owner RATIFIED laws 78-81 + the rider R-TA-P1-walls.** **TA-P1** — load-bearing, without it the
> four agent-side write verbs have no authority to exist · **TA-P5's narrowing of law 21 to
> "periodic POSTING belts"** — load-bearing for §3.3; the RULING is final, only its digest WORDING
> is unsigned (gate GM-10) · **TA-P7** — not load-bearing here. Item (iv) (law 76) is out of scope.
> **THE BUILD DOES NOT START UNTIL THE DIGEST IS RE-SIGNED** (§5). Method from the F-A2 gate:
> unsettleable claims ride as **PREDICTIONS for rig replay** · line numbers come from the
> instrument that prints them · a body's live tip is found by CoR lineage.

---

## 1 · The ruled shape (fixed, not designable)

- **Key ① is Clara's, whole** — `begin_close` / `abandon_close` **plus the entire preparation
  surface**, freeze-timing judgement included (law 25 as amended by 0071 G2). **Keys ②③ stay
  human**: attesting a drawer-2 exception, finalizing, reopening. B3's segregation wall stands.
- **TA-P5 A — ONE time-triggered wake source and F-A4 mints it**, under law 71's posture: **no
  ramp, no first-run-drafts-only, no sampling, no dark launch.** Riders as design law: a visible
  notice, a human HOLD button, and **a new wake kind — four sites, not two** (§3.3, D-27).
- **TA-P2 A+ — three origins and only three:** witness pair · a **versioned deterministic
  evaluator** over DB-owned inputs · an effective-dated policy row. Calculable adjustments post
  automatically (already true daily — F12); **estimates are DRAFTS** adopted by one-click exact
  revision. F-A4 mints no policy table.
- **TA-P1 C — the open register, at its RULED width.** The ADR's own list
  (`0074-the-track-a-sitting.md:31-33`) hands Clara **abandon and re-freeze a close** and
  **snapshot mint**; the contract restates it verbatim (`wave-f-contract.md:154-156`: *"abandoning
  a close **including one she did not open**, and re-freezing after a reopen · minting the month
  snapshot"*). **v1 built the narrower A-column shape for all three with no dissent recorded; v2
  widens to the ruling and WALLS it** (gate GM-6/GM-9 → **D-20**, **D-21**, **OQ-7**).
  **Riders, binding, stated as D-01 actually applies them:** new authority arrives as **wake
  SIBLING verbs** and **no live human verb changes what it DOES** — a body-move proven
  byte-equivalent against the pre-migration prosrc is not a change (**D-01**, §3.1's entrance
  seam; `attest_close_exception`'s signature change is the one reasoned exception, OQ-5) ·
  capabilities **default-on, no per-firm dial** · **walls validate** — how the three widened verbs
  ship.
- **TA-P4 A — receipts mechanically bound and human-readable.** Every close-side agent judgement
  act carries **model + version + rationale**, `via_wake_kind` is **NOT NULL on the receipt**, the
  who/why/from-where binds to the **triggering wake task**, act and receipt are **one
  transaction**, and a **bookkeeper+ read surface** exists.
- **TA-P6 A — the wall re-aims at the directing human.** The agent identity occupies neither end;
  `segregation_mode` gains **`agent_prepared`** and never lies — **in BOTH bodies that write it**,
  `finalize_close` and `reopen_fiscal_year` (gate GM-5 → §3.9 change 4). The solo arm (CLR05,
  live-proven at BEE) stays the one-human path and **auto-upgrades**. **The human side does not
  move a word** (`OQ-A4-6` A).
- **TA-P14 A — the loop must be walkable.** F-A4 repairs the vacuous gate, builds the minimal human
  doors it manufactures, gives the proposal a durable carrier, and accepts on a **synthetic** round
  per ADR-048 with **BEE FY2025's deferral RECORDED**.
- **Task #17 Fix A is F-A4's, and F-T4 stands down** (gate GM-7 → **D-23**). `finalize_close` and
  `reopen_fiscal_year` carry Fix A's `closing_transfer` marking, TA-P6's re-aim and TA-P4's
  authorship columns in ONE migration inside **window B**, and Track B's **13-cell battery rides
  it in full** (`PROGRESS.md:181-183`) — not compressed to one cell.

---

## 2 · The estate as-found — what binds §3

All fourteen survey findings are at the bytes in `close-key-1-survey.md` §2; **G1-G4 are the
gate's own byte findings** (record §2), new to v2. The twelve that decide the design:

| # | the finding, at the bytes | what it forces |
|---|---|---|
| **F1** | three of the four close reads open with `_human_ctx` (`0056:2535`, `:2623`, `:2670`); an agent grant there is *"either dark or a cross-tenant read"* (`0064:29-38`) | **sibling verbs, not grants** (§3.1, D-04) |
| **F2** | the two-person wall SILENTLY PASSES on an agent-prepared year (`0056:2115-2137`): `v_preparer` resolves to the agent's pinned uuid, so the distinct-checker test goes vacuous and the receipt reads `two_person` | §3.9's recut + `agent_prepared` |
| **F3** | the uncoded gate is vacuous on a NULL `financial_date` (`0056:1397`; nullable since `0007:38`) **and the miss is permanent** (`:1403-1405`) | §3.10's repair (TA-P14 (1)) |
| **F4** | `begin_close` arms CLR19 before it measures anything (`0056:1770` then `:1774`); gates measure only inside a run (`:1425`, `:1462-1467`) | the dry run (§3.5); freeze last (§3.4) |
| **F6/F7** | `_audit` gets literal NULLs in both agent slots (`0056:1775`, `:1983`, `:2343`); `open_questions` cannot hold a year subject (`0011:800`, `:822-829`) | two new carriers (§3.7, §3.8) |
| **F10/F11/F12** | six daily belts run under `clara_runtime` and mint no wake (`leader.mjs:41-73`, `:176-195`); *"the runtime must not compute a period"* (`0041:3613-3615`); both calculable families already post daily (`reconciler-fa.mjs:64,111,132`) | a new wake on an existing clock (§3.3); **no new automation** (§3.6) |
| **F13** | neither `0041` nor `0045` names a fiscal year; a period trapped in a frozen year stays `due:true`, is refused CLR19, retries **every day forever** behind one log line (`reconciler-fa.mjs:154-157`) | rung B13 + OQ-6 (§3.6) |
| **F14** | no credential↔task link exists (`0011:1133-1135`, `0002:230-240`, `0006:138-158`) | the binding is BUILT, by siblings (§3.8, D-13) |
| **G1** | `adjustment_run_due` (`0045:5513`) asserts `_assert_due_read_ctx` FIRST (`0045:5525`); with a null `jwt_sub()` that body admits **only** `clara_runtime` (`0042:441-451`, raise `:447`), and the wake pool is `clara_wake_write_login` → `clara_wake_interactive` with no JWT (`pools.mjs:58`, `:373`). B13's ADJ half **raises CLR03 inside the freezing transaction**. `depreciation_run_due` (`0041:3617-3630`) is unaffected | §3.6's B13 recut · **OQ-9** · D-26 |
| **G2** | `snapshot_state` opens `_human_ctx(viewer)` (`0057:578`) — but its pure core **already exists ungranted** (`_snapshot_state_core`, `0057:564`); `propose_fiscal_year` opens `_human_ctx(bookkeeper)` (`0056:1634`), IS granted (`0056:1655`), and `open_fiscal_year` calls it **in-body** (`0056:1697`) under its own `_human_ctx(admin)` (`0056:1665`) | §3.1 / §3.11 · D-16 |
| **G3** | the first statement below `begin_close`'s and `abandon_close`'s `_human_ctx` line is the **`close_and_attest` capability gate** (`0056:1729-1733`, `:1950-1954`), which the agent identity (`0002:334-335`, `:549-551`) can never satisfy | §3.1's **entrance seam** · D-15 |
| **G4** | the `agent_tasks` triggers dispatch on `kind` and end in `else raise 'unknown task kind'` (`0011:1241`) / `else false` (`0011:1277`); the `wake` arm forces birth `held` (`:1230`) with **`held→cancelled` the only transition** (`:1271`). A new kind on the CHECK alone is **unbornable and unexecutable** | §3.3's two trigger arms · D-27 |

---

## 3 · The design

### 3.1 The verb set — wake wrappers, ungranted cores, shared cores

**The `0077`/`0078` idiom exactly** (`0078:90-95`): each tool reaches the DB through ONE named
wrapper — SECURITY DEFINER, pinned `search_path`, EXECUTE to `clara_wake_interactive` and nothing
else, one `wake_fn_allowlist` row per kind, **no DML text in a wrapper body**. Skeleton: Annex A.1.

| wrapper | delegates to | what it is |
|---|---|---|
| `wake_list_fiscal_years` | **`_list_fiscal_years_core`** (extracted below `0056:2670`'s `_human_ctx`) | the FY list, client-pinned |
| `wake_get_close_plan` | **`get_close_plan(uuid)` unchanged** | the plan; the pin is asserted in the wrapper |
| `wake_get_close_readiness` | `_close_readiness_core` (extracted below `0056:2623`'s) | the readiness read |
| `wake_verify_close` | `_verify_close_core` (extracted below `0056:2535`'s) | receipt verification |
| `wake_snapshot_state` | **the EXISTING ungranted `_snapshot_state_core`** (`0057:564`), firm check re-expressed on `clara.actor_firm_id()` | the read half — **no live-body recut at all** |
| **`wake_dry_run_close_readiness`** | `_close_dry_run_core` → `_measure_one_gate` | **§3.5** |
| **`wake_open_fiscal_year`** | `_agent_open_fiscal_year_core` → `_open_fiscal_year_core` → **`_propose_fiscal_year_core`** | **§3.11** |
| **`wake_begin_close`** | `_agent_begin_close_core` → `_begin_close_core` (shared) | **§3.4** |
| **`wake_abandon_close`** | `_agent_abandon_close_core` → `_abandon_close_core` (shared) | **§3.4** |
| **`wake_mint_month_snapshot`** | `_agent_mint_month_snapshot_core` → `_mint_month_snapshot_core` (extracted below `0057:780`'s) | **§3.11** — TA-P1 C, D-21 |
| **`wake_propose_close`** | `_agent_close_proposal_core` | **§3.7** |
| **`wake_run_depreciation_catchup`** | `_fa_run_period_core` **unchanged** (`0041`) | **§3.6** |
| **`wake_establish_prepayment_schedule`** | `prepayment_schedule_v1` + the live propose/sign template cores | **§3.6** |

**THIRTEEN wrappers** — v1 said twelve, before TA-P1 C's snapshot mint was folded. The count binds
every census, every allowlist row and Annex I.2's pins.

**Why the human bodies are SHARED, not copied.** `begin_close`/`abandon_close` are recut once so
their post-authority statements move into `_begin_close_core` / `_abandon_close_core`, the human
verb becoming a thin delegate — the estate's containment idiom (`0004:749-750`) and the only shape
satisfying **TA-P11**. **It does touch two live human bodies**, and the narrow reading is D-01's: a
body-move proven byte-equivalent against the pre-migration prosrc is not a behavioural change.

**THE ENTRANCE SEAM — the cut is BELOW the human capability gate, not below the `_human_ctx`
line** (gate G3 → **D-15**; mechanism and cells in **Annex A.8**). `_begin_close_core` starts at
today's `0056:1734`, `_abandon_close_core` at `0056:1955`. *The human entrance's authority wall is
`_human_ctx(bookkeeper)` + `_has_capability(…,'close_and_attest')`; the agent entrance's is the
`close_prep` credential + the allowlist row + the client pin + the bound wake task; neither
entrance reaches the other's wall and the shared core carries NEITHER.*

**The agent never picks an authoritative input** (`0078:135-146`). **Op keys are deterministic and
DERIVED** (gate GN-4 → **D-25**): `sha256(wake_task_id ‖ verb ‖ subject_id)`, so a retry inside one
wake replays `_reserve_op`'s stored outcome (`0004:46-60`) while **a new wake task is a new
operation** — a released hold or a cleared catch-up is re-measured, never replayed (cell **B-11**).

### 3.2 The gate ladder — four tiers, typed tokens

Tier membership for any deferred trigger is **a fact about `pg_trigger.tgdeferrable`, derived by
RIG REPLAY**, never written from memory (F-A2's D5 lesson). Mechanism: Annex A. Tokens: Annex E.2.

**Tier A — authority and shape. RAISE (CLR\*), nothing durable.** credential present → CLR03 · `assert_wake_allowed(kind, fn)` → CLR03 · **the credential's client pin equals the subject's client** → CLR03 · **the bound wake task resolves** → CLR03 `wake_task_unbound` · op key non-blank → CLR10 · `_reserve_op` · FY/run in the credential's firm → CLR11 · **the two advisory locks in the house order `203005004` then `203005007`** (`0056:1749-1750`) · the status re-read **under** the locks (`:1751-1755`) · the oldest-first ordering rung (`:1763-1769`). **The capability gate is deliberately NOT a rung here** — it is the human entrance's wall (§3.1's seam).

**Tier B — the admission gates. A TYPED NON-ACT RECEIPT, no raise; the transaction COMMITS so the
reason is durable. Every rung is EVALUATED on every call; the receipt carries the full failing
vector; acting requires an empty one.**

| # | rung | applies to | token |
|---|---|---|---|
| B1 | **no live hold** on this (client, purpose) — §3.3 | every F-A4 verb | `close_prep_held` |
| B2 | the receipt triple is complete (model name + version + non-blank rationale) | every verb | `receipt_incomplete` |
| B3 | **drawer 1 is clean on a fresh dry run** (§3.5) | `wake_begin_close` | `drawer1_not_clean` |
| B4 | no `close_runs` row is `in_progress` for this FY | `wake_begin_close` | `close_already_in_progress` |
| B5 | every earlier FY of the client is `closed` | `wake_begin_close` | `close_ordering_violation` |
| B6 | **no LIVE `close_attestations` row stands on the run** — she may abandon a run she did not open (TA-P1 C) but never void a human's signed drawer-2 statements (**D-20**) | `wake_abandon_close` | `close_run_attested` |
| B7 | **WITHDRAWN at gate 2** (was `reopened_year_human_only`); the number is RETIRED, never reused. TA-P1 C gives her the abandon, and F5's tell survives in the receipt chain — `has_active_reopen_receipt` (`0056:2681-2682`) reads `close_receipts`, which an abandon does not touch (cell A-8) | — | — |
| B8 | the file carries an FY end AND the proposal's fallback is unused (§3.11) | `wake_open_fiscal_year` | `fy_end_not_on_file` |
| B9 | a live signed `fa_depreciation_authorities` row exists | `wake_run_depreciation_catchup` | `depreciation_authority_absent` |
| B10 | the evaluator derives a term and a start from DB-owned inputs | `wake_establish_prepayment_schedule` | `prepayment_term_underivable` |
| B11 | no live proposal stands for this run at the same gate digest | `wake_propose_close` | `close_proposal_exists` |
| B12 | the gate digests the proposal binds are the FRESH ones | `wake_propose_close` | `close_proposal_stale` |
| B13 | **no belt-due period lies at or before `fy.ends_on`, and no outstanding belt draft is dated there** (F13; recut at gate 2 — §3.6, Annex A.3) | `wake_begin_close` | `belt_period_unrun` |
| B14 | **the reopen's correction is not in flight** — on a `reopened` FY, refuse while any unapproved draft is dated inside it. Re-freezing IS hers (D-20); blocking a human's own fix behind CLR19 is not | `wake_begin_close` | `reopen_correction_in_flight` |

**Tier C — the transaction-scoped invariants.** Act and `agent_act_receipts` row are written in ONE transaction inside the protected region; a **deferred constraint trigger** (**ARM-0 first**, law 68) fires at COMMIT and requires exactly one receipt row per agent-authored close-lifecycle transition. **No receipt, no act** — TA-P4 (3), structural. **Tier D — the runtime's capture.** Anything aborting at commit (a deferred floor, a serialization failure, the reconciler herd) is captured as `last_refusal` and re-presented on the next wake; it never silently disappears.

### 3.3 The clock — TA-P5's one time-triggered wake source

**Three parts, and only the middle one is new machinery.** (1) **The due oracle, in the DB**
(F11's law): `clara.close_prep_due()` — STABLE, SECURITY DEFINER, granted to `clara_runtime` and
nobody else — returns one row per (firm, client, fiscal_year) whose `ends_on` is on or before
`clara._book_today()`, status `open` **or `reopened` with no correction in flight** (D-08 as re-cut
by D-20), carrying no live hold, with no close-prep wake minted inside the cadence window. **Every
date is computed here** (Annex B.1). (2) **The belt, in the leader**: a seventh finite-guarded
daily cadence beside the six that exist (`leader.mjs:41-73`, `:176-195`) — ask the oracle, then per
row mint a `close_prep` credential (client-pinned, `on_behalf_of` NULL, director-less by
construction, law 68) and admit one agent task. **The belt computes nothing.** (3) **The
workflow**: `closePrep.v1`, a new WDK export, never an edit to a deployed one (law 9) — read →
dry-run → remediate → begin → propose, its tools §3.1's wrappers plus F-A2's `wake_post_entry`.

**Notice and hold, together and without delay.** At mint the belt emits `close.preparation_started`
(a new event type on both registers), which lands as a dashboard notice card. **There is no quiet
period: a delay before the first act is indistinguishable from law 21's ramp**, which TA-P5
forbids. The brake is **live** instead — a `clara.close_prep_holds` row (append-only with a release
stamp, `firm_capability_grants`'s idiom at `0056:1078-1097`) is **rung B1 of every F-A4 verb**, so
HOLD stops the lane at its next write, mid-run included (Annex I). **Data gating, as TA-P5
requires:** the clock is *wake and look* — a missing statement yields a chase notice, never a
fabricated reconciliation, and `unknown` is never rounded to `pass`.

**A new wake kind, `close_prep` — FOUR sites, not two** (gate G4 → **D-27**; per-site dispositions
in Annex C). It extends, never rewrites: the two `wake_credentials` CHECKs, `agent_tasks.kind`, the
`wake_fn_allowlist` rows — **and both `agent_tasks` trigger bodies**, whose `kind` dispatch ends in
`else raise 'unknown task kind'` (`0011:1241`) and `else false` (`0011:1277`), so a CHECK-only
extension yields a kind that can neither be inserted nor transition. The new arm follows the
**`autodraft` precedent** — firm and client present, no session, no intent, a non-blank
`model_snapshot`, **born `queued`** on the `queued→running→completed/failed` lifecycle — because
the `wake` arm's `held` birth (`0011:1230`) with `held→cancelled` as its sole transition (`:1271`)
describes a task **nothing in the estate can execute**. **This is the clock's execution path, F-A4
mints it first, and F-A3/F-A5 adopt this arm rather than each minting their own** (TA-P11; gate
record §7). **`mint_wake_credential`'s live body is NOT touched** (D-13): after F-A2's PR-1 it
carries a **FOUR**-kind list (F-A2's CoR of `0011:1163` — `f-a2-annexes-1-estate.md:419`, D34) and
simply refuses `close_prep`; the branch lives in the F14 sibling, the only minter of this kind.
**F-A4 authors against the POST-F-A2 text and its prestate pins that text** (gate GM-8).

### 3.4 begin / abandon — the freeze-timing judgement, walled

**`wake_begin_close` is the LAST act of preparation, not the first** (F4). B3/B4/B5/B13/B14 mean
she flips the year only when drawer 1 is clean on a fresh dry run, the ordering law holds, no belt
period is unrun and no reopen correction is in flight. The flip, the run insert and
`_evaluate_close_gates` are the live core's own statements, unchanged.

**`wake_abandon_close` — ANY run, walled by the attestations on it** (TA-P1 C; **D-20** widens v1's
B6). `close_runs.started_by` is still READ and recorded on the receipt — the column, never a name
and never `users.is_agent` (law 27(3)) — but it no longer refuses. What refuses is **B6**: a live
`close_attestations` row on the run, because *abandoning a run voids the drawer-2 statements a
professional signed against it, and voiding a human's signature is not an act the register hands
anyone.* An abandon on a **`reopened`** year is permitted (B7 withdrawn); the receipt records
`flattened_from='reopened'` and `has_active_reopen_receipt` keeps telling the truth.
**Re-freezing after a human reopens IS hers** (**D-20** reverses v1's `OQ-A4-5` reading), walled by
**B14**: while any unapproved draft is dated inside the reopened FY the correction is in flight and
the freeze refuses, because CLR19 would block the human's own fix; once it is posted she may
re-freeze and `close_prep_due()` re-admits the year on the same predicate. **The orchestrator's
dissent is recorded** (D-20, OQ-7): an agent re-freeze can surprise a reopen's author — but walls,
not a human gate, are what the ruling permits.

### 3.5 The dry run — measuring readiness without arming the wall

F4's problem: measurement lives inside a run, and a run arms CLR19. The fix is a **shared
deterministic core with one entrance per surface** (TA-P11; mechanism **Annex A.6**). The pure
measurement is extracted out of `_evaluate_one_gate` (`0056:1425`) into
**`clara._measure_one_gate(p_check_key, p_client, p_fy)`** — the `case chk.check_key … end`
dispatch and the `v_state` derivation verbatim, inside the same `begin…exception` block that turns
a raising probe into `state='error'`. **`_evaluate_one_gate` keeps its identity and its INSERT**,
now calling the extracted core, so result rows, digests and every downstream consumer stay
byte-identical (proven by cell A-3, not asserted). **`_close_dry_run_core(p_client, p_fy)`** calls
the same core over the whole catalog and returns the same per-check shape **without a run, without
an INSERT and without touching `fiscal_years.status`**; it is STABLE.

**One architecture, not two:** one measurement body, two entrances; a separately-written "preview"
evaluator would be two, and is refused (D-03). **Honest limit:** two drawer-1 checks are computed
*inside* `finalize_close` (`0056:396-397`), so the dry run reports them
**`not_measurable_before_finalize`**, never `pass` (law 27(2) applied to our own read), and B3
tests only the **measurable** drawer-1 set. §7 R-6 prices it.

### 3.6 The calculable adjustments — TA-P2 A+ with no new posting machine

**Start from what is already true (F12).** Both families already post unattended, daily, per active
client, with overdue-period chasing, so F-A4 adds **no automation** here and claims none — only a
close-time trigger, a chase when the authority is missing, and the missing prepayment evaluator.

**Depreciation catch-up (`OQ-A4-3`).** `wake_run_depreciation_catchup` delegates to the
**unchanged** `_fa_run_period_core` — the core the human twin and the belt also use, *"so a
manually-run period and a swept one are the same act with the same evidence"* (`0041:3595-3597`).
Its point is **ordering**: the periods must clear *before* `wake_begin_close`, because after the
freeze they cannot clear at all (F13). B9 refuses unless a **live, human-signed**
`fa_depreciation_authorities` row exists (`0041:614`, `:642-643`) — **she executes an existing
authority and never signs one.**

**The stranded-period rule (F13), RE-CUT at gate 2** (GM-3, G1; full mechanism **Annex A.3**). v1
asked the two oracles for *"a `due:true` whose period lies inside the FY"*; at the bytes that is
unsound twice and unevaluable once. **(1)** `_fa_oldest_unmet_period` (`0041:1904-1958`) answers
about the GLOBAL oldest unmet period, so once a period is stranded in FY2024 v1's B13 passes on
every later year — F13 reproduced by the rung written to prevent it. *Recut: refuse whenever
`due:true` and `period_end <= fy.ends_on`.* **(2)** `{due:false,'period_draft_outstanding'}`
(`0041:1918-1921`) is a not-due answer hiding a standing draft that CLR19 refuses forever after the
freeze. *Recut: B13 reads the draft DIRECTLY* — `status='draft'`, `flags ?
'depreciation_charges'` (the oracle's own predicate, copied verbatim — one reading of "outstanding
draft") with `posting_date <= fy.ends_on`. **(3)** `adjustment_run_due` cannot be called from this
lane at all (G1): its first act raises CLR03 for a wake session, aborting the freezing transaction
and producing no receipt — the opposite of Tier B's contract. *Until OQ-9 is ruled the ADJ half is
fail-closed and never raises:* B13 evaluates it inside a `begin…exception` block and an inevaluable
answer counts as DUE (ARM-0, law 68), refusing `belt_period_unrun` with payload reason
`adj_oracle_inevaluable`. The recommendation is **OQ-9(a)**, which requires §7 and **D-14** to
narrow explicitly — and they do (**D-26**). **ARM-0 stands on both halves**; F-A4 adds **no FY
predicate** to `0041`/`0045`, so D-14's substance is unchanged, and a period falling due *after* a
lawful close is **OQ-6**: a typed open question, never an automatic reopen.

**Prepayment amortisation — the one genuinely missing machine.** A NEW versioned deterministic
evaluator, **`clara.prepayment_schedule_v1(p_client, p_source_entry)`** — straight-line over a term
derived from DB-owned inputs only, the rounding remainder placed by a stated rule in the final
period. It mints the `lines` of an ordinary `adjustment_templates` row (`0045:1139`, `content_hash`
frozen at signature) that the **existing** `run_adjustment_occurrence` belt runs: one new
evaluator, zero new posting machinery, a number reproducible by re-running it (**Annex B.2**).
**Estimates are drafts and F-A4 builds no approval door** — the human approves through
`approve_entry`, whose exact-revision binding makes the judgement his (PRD invariant 8); a named
non-goal. **Policy tables: none here.**

### 3.7 The proposal — a durable carrier, not a sentence in chat

**`clara.close_proposals`** — append-only, one live proposal per close run (the partial-unique idiom
of `uq_close_runs_one_live`, `0056:429`), carrying the run, FY, client, acting identity, **the gate
digest vector it binds** (`check_key → measured_digest`, so a moved measurement invalidates it),
the **drafted attestation texts per (check_key, item_key)**, a narrative, the model triple and its
state. **Why not extend `open_questions`** (F7): its scope CHECK admits no fiscal-year subject
(`0011:822-829`) and `resolve_open_question` records text only (`:2007`) — no digest vector, no
drafted attestation set, no testable staleness (**D-06**). **The human side** is the review card
(Annex I): each drafted attestation beside its gate row, and two actions — **adopt** (walk
`attest_close_exception` per item, then finalize) and **decline with a reason**. She never finalizes.

### 3.8 Receipts — TA-P4, one carrier for every agent judgement act

**`clara.agent_act_receipts`** — append-only, zero DML grant to any role, keyed
`(act_kind, subject_kind, subject_id, op_key)`, carrying `acting_actor`, `on_behalf_of` **nullable
and NULL on the clocked lane — never inferred** (law 68), **`via_wake_kind` NOT NULL**,
`wake_task_id` (TA-P4 (2)'s mechanical binding), `model_name` + `model_version` + `rationale` (NOT
NULL, non-blank by CHECK), the failing-rung vector and the verdict. Columns, and why neither
`audit_log` nor `close_receipts` can carry it: **Annex E.3**. It is deliberately **GENERIC** — the
ruling's own shape — so F-A5/F-A6/F-A8 adopt it rather than each minting their own; F-A2's
`entry_post_receipts` stays as shipped. Two tables, two facts, one discipline (risk R-4).
**Binding the task (F14) — a SIBLING, never a `wake_context()` recut:** a nullable
`wake_credentials.agent_task_id`, a sibling `mint_wake_credential_for_task(...)` that records it,
and a new ungranted `clara._wake_task_id()` reading it back off the same session secret;
`wake_context()`'s five-column shape stays byte-identical (C14), and a credential naming no task
refuses `wake_task_unbound` — **no binding, no act**.

**The human read surface** (TA-P4 (4)): `clara.list_agent_act_receipts(p_client, p_since)`,
SECURITY DEFINER at the **bookkeeper+** floor, rendered as a panel on `/close`. A receipt nobody
can read is not an audit control. **`audit_log.via_wake_kind` stays NULL on BOTH entrances,
deliberately** (gate GR-2): a human act has no wake kind, and on the agent path the wake context
lives in `agent_act_receipts`, because `audit_log` has no model/version/rationale column and its
`outcome` CHECK admits only `'ok'` (`0002:285`) — a REFUSED act cannot be recorded there at all.
The contract's *"`via_wake_kind` stops being NULL"* (`wave-f-contract.md:169-170`) is discharged
**on the receipt**, TA-P4's carrier — stated here so no reader must assemble it from three places.

### 3.9 Segregation — TA-P6, the wall re-aimed and the label made honest

`finalize_close`'s segregation block (`0056:2115-2137`) is recut. **Four changes, each judgement
logic** (the eight-combination table is **Annex A.4**):

| # | change | why |
|---|---|---|
| 1 | **the wall measures the last HUMAN preparer** — `v_human_preparer` is the most recent FY entry whose `coalesce(last_human_editor, maker_actor)` resolves to a user with `is_agent = false`, and the distinct-checker test runs against **that** actor | law 69's shape; today's single `v_prep` read resolves to the agent and the test goes vacuous (F2) |
| 2 | **an independent agent-preparation probe** — `v_agent_prepared` is true when **any** approved FY-dated entry carries the agent as maker with no human editor | a separate read for a separate question; deriving it from `v_prep` is exactly the derivation that broke |
| 3 | **the honest label with a stated priority** — `segregation_mode` becomes `('two_person','solo_self_attested','agent_prepared')`, **one value added at `0056:1520`, the two existing values byte-identical in meaning**; `agent_prepared` wins whenever `v_agent_prepared` | under-claiming is fail-closed; over-claiming a two-human review is the harm. The receipt reads *"prepared by Clara, sole human signer X"* |
| 4 | **`reopen_fiscal_year` gets the SAME re-aim** (gate GM-5 → **D-19**) — its own two-value computation at `0085:344-345` writes the identical column under the identical CHECK, so today a reopen of a year Clara prepared records `two_person`. The CLR05 arms at `0085:328-340`, about the REVERSAL act's signer, **do not move a word** | the sentence TA-P6 ruled untruthful, in the other body, inside the CoR window PR-1b already owns. Cell **A-10** |

**The solo arm auto-upgrades.** At `eligible_checker_count(firm) = 1` the self-attestation
requirement stands unchanged (`0056:2130-2136`) — CLR05's live-proven BEE path; when a second human
joins the distinct-checker arm starts biting **on its own** against `v_human_preparer`: no dial, no
migration. **Attestation authorship (`OQ-A4-8`):** `close_attestations` gains `authored_by` and
`adopted_verbatim`, and `attest_close_exception` a defaulted `p_from_proposal uuid`, so the door
RECORDS which drafted text was adopted and whether it changed — **deriving adoption by string
comparison afterwards is refused** (law 27(2)). A third live human body recut (D-02, OQ-5).

### 3.10 The undated-document gate — the repair (TA-P14 clause 1)

F3's defect: a NULL `financial_date` makes a filing invisible to `_close_gate_uncoded`
(`0056:1397`) and the miss is permanent (`:1403-1405`). **The repair gives the undated population
its OWN drawer-2 catalog row and does not widen the dated gate** (gate GM-4 → **D-18**, re-cutting
v1's D-10). Predicate and payload: **Annex A.5.**

| what | at the bytes |
|---|---|
| **a new catalog row** `('undated_documents', 2, …, 'clara._close_gate_undated', 'always')` and a new evaluator returning `unknown` on a non-empty population | drawer 2 already treats `unknown` exactly like `fail` (`0056:2074`): a per-item attestation, not an absolute block. Each undated document is its own item under the new key in `_gate_outstanding_items` (`0056:1790`), so attestation, the digest-staleness rule and `get_close_readiness`'s `attested` computation need no change |
| **a NEW row is the only lawful way** | `close_gate_checks` is INSERT-open but carries `t_close_gate_checks_append_only` BEFORE UPDATE OR DELETE (`0056:378-379`); v1's fold would have made `uncoded_documents`' shipped title (`0056:403`) false and structurally uncorrectable |
| **its own digest — and that is the point** | `measured_digest` is per check_key (`0056:1466`), so a new undated filing moves only the undated gate's digest and never invalidates a signed attestation about the *dated* set (`0056:2083-2100`) |
| **the population is TIME-BOUNDED by a DB-owned fact** — `f.filed_at::date <= fy.ends_on` (`0007:68`) | a letter filed next year for a year nobody is closing cannot churn this year's digest. **The residual is stated:** an undated document filed *after* the year end cannot be placed in the year by any fact the DB owns — reported on the close plan as a count (a read, not a digest input), routed through OQ-6, and put to the owner as **OQ-8** |
| **`_close_gate_uncoded`'s own body is unchanged** | the smallest true fix, and one CoR fewer in the window |

**Priced as TA-P14 priced it: this flips some currently-green clients red** — the intended
direction, because a gate that passes because it cannot see is not a gate (law 31); **P2** measures
the population before the ceremony and §6 publishes it. Two non-members, recorded not dropped: an
**unfiled** document is invisible to a client-scoped gate by construction (F-A7), and a draft-only
coding stays "coded" here. **Census C15: the catalog is FOURTEEN rows**, and every "thirteen gate"
assertion extends with it.

### 3.11 Opening a fiscal year, the snapshot mint, and the human doors

**`wake_open_fiscal_year`** is hers **only on the narrow path the sitting drew** (`OQ-A4-9`): the
file already carries an FY end and she accepts the system's computation unchanged; B8 refuses
`fy_end_not_on_file` otherwise, because choosing an FY end is an assertion about the client's
constitution and stays human. **The path is three bodies deep, not one** (gate G2):
`open_fiscal_year` (`0056:1657`) opens `_human_ctx(admin)` at `:1665` **and calls
`propose_fiscal_year` in-body at `:1697`**, which opens `_human_ctx(bookkeeper)` at `:1634` — so
**both** are extracted (`_propose_fiscal_year_core`, `_open_fiscal_year_core`), the human verbs
becoming thin delegates and the agent core entering below both floors. The honesty label is
computed at `:1697-1700` from the caller's own `p_ends_on`; **the core takes the label as an
argument** so each entrance states its own truth — the human entrance passes today's `case`
verbatim (byte-equivalent), the agent entrance the new third value **`asserted_by_file`** (*on
file, accepted unchanged, not asserted by a human at this moment*), extended at the `0056:245`
CHECK, never rewritten. `FiscalYearRow.fy_end_source` (`closeApi.ts:23`) and census C6 follow.

**`wake_mint_month_snapshot`** (TA-P1 C, **D-21**). `mint_month_snapshot` (`0057:772`) is a
`_human_ctx(bookkeeper)` audited writer taking `203005007`-EXCLUSIVE; `_mint_month_snapshot_core`
is extracted below `0057:780` and the agent reaches it through wrapper 13. It is a deterministic
capture — it hashes `_snapshot_dataset` and records it, computing no judgement — so its walls are
§3.1's seam plus B1/B2. **Lock note (Annex A.2):** the wrapper is never called while a close lock
is held; `203005004` → `203005007` remains this lane's only order.

**The minimal human doors (TA-P14 clause 2)** — six controls on `/close`, crude but never absent,
riding the page's client-switch race guard (`page.tsx:15-27`) and its no-hue-only /
no-computed-cents rules: **Finalize (key ②)** · **Abandon** · **the review card** (§3.7) ·
**Reopen (key ③, `ends_on` variant, mandatory reason + correction target)** · **HOLD / release**
(§3.3) · the **agent-act receipt panel** (§3.8). Wire shapes: **Annex I**. **`begin_close`'s human
door is deliberately NOT built** — the agent holds key ①, F9 makes the human verb owner-only in
practice, and a door for an act no human is asked to perform is speculative surface. A named gap.

---

## 4 · Owner questions I could not settle

Under the standing delegation the build proceeds on the recommendation; escalate only if a law or a
ruling would change. Grounds and the cost of each alternative: **Annex G.2**.

| # | question | recommendation (the build proceeds on this) | fail-closed default |
|---|---|---|---|
| OQ-1 | the clock's cadence and first fire | **the day after `ends_on`**, re-asked daily until a run exists or a hold is set | seven days after `ends_on`: delays, never skips |
| OQ-2 | does `agent_prepared` outrank `two_person` when a human posted the bulk of the year? | **yes** (§3.9's priority) — under-claiming is fail-closed | the same |
| OQ-3 | is the undated gate attestable per item, or absolute? | **drawer 2, per item** — an evidence gap a professional may accept in writing | the same; drawer 1 makes some clients unclosable |
| OQ-4 | the prepayment term when the document states none | **refuse** (`prepayment_term_underivable`) and open a question | the same |
| OQ-5 | may `attest_close_exception` be recut, given TA-P1's rider? | **yes, inside window B we already own** — a receipt that cannot say who wrote the words is what TA-P4 was ruled to fix | do not recut; stamp `attestation_authorship='unproven'` — honest, weaker |
| OQ-6 | a belt period falling due **after** a lawful close (F13) | **a typed open question** naming client, period and year; key ③ stays the human's; no FY predicate on the oracles | the same; today's alternative is a silent daily log line |
| **OQ-7** | **TA-P1 C hands her abandon-any-run, re-freeze and snapshot mint; v2 ships all three walled by B6, B14 and §3.1's seam. Is that the intended reading, and should the wall set be a NAMED TA-P1 rider in the sitting ledger so F-A5/F-A6/F-A7 inherit the scope?** | **ship the ruled width with these walls**; the orchestrator's accounting dissent is recorded at **D-20**, not acted on | the walled-wide shape. Narrowing back to v1 needs the owner's word — it refuses verbs the register gave her |
| **OQ-8** | **an undated document filed AFTER the year end**, outside §3.10's `filed_at` bound | **report it on the close plan as a count** and route it through OQ-6's typed question | the same; including it re-imports the cross-year re-attestation churn D-18 exists to stop |
| **OQ-9** | **B13's ADJ half is unevaluable from the wake lane** (G1). (a) an additive ungranted `_adjustment_run_due_core` below `0045:5525`, the live oracle keeping its admission; (b) a second F-A4-written due predicate (two readings of "due" — a TA-P11 cost); (c) the belt records the probes at mint and B13 reads them with a freshness bound | **(a)** — one architecture, one reading of "due", the admission wall unmoved for every existing caller | **the freeze REFUSES**: an inevaluable probe counts as DUE (`belt_period_unrun` / `adj_oracle_inevaluable`), never as clear and never as a raise |

---

## 5 · Build sequence

**Hard prerequisites.** (i) ~~**The owner's digest re-sign**~~ — **SATISFIED 2026-08-22 (owner ratified laws
78-81 + the rider R-TA-P1-walls)**; it covered **TA-P1** (without it the agent-side close verbs have no
authority) **and TA-P5's law-21 narrowing** (§3.3's clock is built on it) — gate GM-10 closed. (ii) **F-A2's PR-1 MERGED**
— F-A4 authors against the post-F-A2 wake-kind text (C9) and F-A2's posting lane remediates
drawer-2 items. (iii) **a chatTurn `_vN` for the directed close ask queues behind F-A2's PR-2**,
which claims that chain first (gate record §7). (iv) F-A3 is an **acceptance** dependency (§6).

1. **PR-0 (gate) — zero code. DONE 2026-08-22**: the independent judgement-logic review (law 27(1))
   over the ladder, §3.9's table, the gate repair, the dry-run extraction and the clock, plus the
   rulings lens; every finding adversarially verified. **Record: `close-key-1-gate-record.md`;
   this v2 is the fold.**
2. **PR-1a — WINDOW A, the measurement layer.** `_measure_one_gate` extracted ·
   `_evaluate_one_gate` recut to delegate · the new `undated_documents` catalog row +
   `_close_gate_undated` · `_gate_outstanding_items`'s new branch · **`_close_dry_run_core`**
   (additive, no window, nothing calls it until PR-1c's wrapper — Annex F.1 always listed it
   here and v2's step 2 did not; **trued at build, 2026-08-23**). **Touches no wake surface, no
   receipt table, no wake kind.** Cells A-3/A-4/A-5/A-11.
   **AS-BUILT FINDING (2026-08-23), a G1-class analogue on the dry-run path:**
   `clara.fa_register_tie` — the `fa_register_tie_view` evaluator — opens `_human_ctx(viewer)`
   as its first act, and it is the **only one of the fourteen** that does (closed-world census,
   cell `f-a4.pr1a.human-ctx-census`). So a dry run reached from any session without an
   authenticated human — PR-1c's `wake_dry_run_close_readiness` included — records
   `state='error'`, `CLR04 no authenticated actor` for it. **It blocks nothing** (drawer 3 is
   advisory and §3.2's rung B3 weighs only the measurable drawer-1 set), and the raise is
   caught by the extracted body's own `begin…exception` block exactly as designed. Recorded
   because if a *fourteenth-plus* gate ever joins that set in drawer 1 or 2, §3.5's honest-limit
   list must be re-cut; the census cell fails loudly if it does.
3. **PR-1b — WINDOW B, the close-lifecycle writers.** The ALTERs first (`segregation_mode`,
   `fy_end_source`, `authored_by`, `wake_credentials` ×2, `agent_tasks.kind`) · then
   **`finalize_close`** (Fix A + §3.9 changes 1-3) · **`reopen_fiscal_year`** (Fix A's mirror +
   change 4) · **`attest_close_exception`** · the `begin_close`/`abandon_close` body-moves at the
   entrance seam · the `open_fiscal_year` + `propose_fiscal_year` extractions ·
   `mint_month_snapshot`'s extraction · the two `agent_tasks` trigger arms. **D1 list: Annex F.**
4. **PR-1c — ADDITIVE, no ceremony.** The three new tables and their triggers · the read
   extractions · the two new evaluators · the F14 siblings · `_adjustment_run_due_core` if OQ-9
   rules (a) · the thirteen wrappers, allowlist rows, roster/census surfaces and the tail census.
   Grants ride their consumer's PR (Annex I.2).
5. **PR-2 (runtime)** — `close_prep_due` as a seventh leader belt · `closePrep.v1` as a NEW export
   with a registry entry (never an edit, law 9; bundle-grep after build) · the task-bound mint in
   `pools.mjs`. **PR-3 (dashboard)** — the six controls of §3.11, C6 regenerated in the same PR.
   **PR-4 (acceptance, zero code)** — the synthetic round, the measured numbers, `PROGRESS.md`
   (including Track B's stand-down on task #17, D-23), the recorded BEE FY2025 deferral.

**TWO ceremonies, severed at the gate** (**D-24**). Windows A and B are separate D1 write-quiesce
windows run from merged `main`; PR-1c/PR-2/PR-3 need none. A mid-window failure now strands one
layer, not nine live bodies at once. Standing runbook hazards apply to both: the DSN bridge + 110s
quiesce, `fly.exe`'s non-zero exit after a successful non-tty `ssh -C`, the post-restart
zombie-pooler sweep, `PG*` vars for rig runs, the reconciler herd.

---

## 6 · Battery and acceptance

**Every finding and every rung gets a cell** (Annex D; contract-blind ▣). The sharp ones: F2's silent pass reproduced **before** the fix and refused **after** · the eight-row segregation table · **the reopen receipt's mode on a year Clara prepared** (A-10) · F3's vacuous pass converted to `unknown` on its OWN gate with the dated gate's digest **unmoved** (A-11) · a dry run that arms **no** CLR19 · digest-equality across the `_measure_one_gate` extraction ▣ · **a human without `close_and_attest` still refused after the body-move** (A-9) ▣ · abandon refused on an attested run and permitted on a human's unattested one · a mid-run hold stopping the next write · the receipt trigger refusing an act with no receipt ▣ · **F13 reproduced**, B13 refusing on a stranded PRIOR year and on an outstanding draft ▣ · **`adjustment_run_due` called through a real `clara_wake_interactive` session** (C-19 — the positive control whose absence hid G1) ▣ · the prepayment evaluator re-run reproducing its lines to the sen ▣ · **the approve-writer census UNMOVED** (C5) · **task #17's 13-cell battery in full** (D.5).

**Acceptance, per TA-P14 (4) and ADR-048.** No real books are available: **BEE FY2025 is deferred
to the Wave-G reset (ADR-0072 ⑤) and that deferral is RECORDED here.** F-A4 accepts on a **full
synthetic round in ROME PUBLIC ADVISORY** — open the year → clock wakes → dry run → remediate →
begin → propose → the human adopts and finalizes with key ② → the receipt reads `agent_prepared` —
**labelled synthetic per ADR-048 in every artifact** (law 22). Constraints 12 and 13 hold
throughout. **Three numbers are MEASURED AND PUBLISHED**: the undated filings the new gate surfaces
per client (P2); drawer-2 items she drafted attestations for versus those the human rewrote;
clocked wakes ending in a proposal versus a chase notice.

---

## 7 · Registered risks and named non-goals

| # | risk, registered |
|---|---|
| **R-1** | **SEVERED at gate 2, not carried.** v1 put nine live bodies in one window and declined severance for the cost of one extra review of `_gate_outstanding_items`; the gate re-derived the list (three rows missing) and ruled the other way (**D-24**). The residual risk is two ceremony nights instead of one |
| **R-2** | **the clock acts unobserved, by design** — month-end, nobody watching, the year frozen and a proposal standing. G1.2/G1.3's posture; the notice and the hold are the brake, and only as good as whether anyone reads the card |
| **R-3** | **the new gate's population is unmeasured until PR-1a's replay** — if P2 is large, publish it and let the owner order the remediation; never loosen the gate (law 36) |
| **R-4** | **two receipt tables now exist**; convergence is a Wave-G question, never a mid-wave recut of F-A2's shipped table |
| **R-5** | **`close_prep_due` is a new closed world of "what is due"** — two oracles disagreeing about a date is TA-P11's failure in slow motion |
| **R-6** | **two drawer-1 checks stay unmeasurable before finalize** (§3.5) — she can be confident and still be refused at the last step |
| **R-7** | **B13 refuses a close the belts could have unblocked yesterday** — correct, and it will feel like an obstruction |
| **R-8** | **the widened verbs (D-20/D-21) are the RULING's width, not the orchestrator's preference** — if OQ-7 returns narrower, B6/B14 shrink and wrapper 13 is withdrawn; a subtraction, which is why they are named rungs and not scattered conditions |
- **Non-goals.** No bank matching or bank drawer-2 gate (F-A3) · no report issue, sandbox,
  definition self-approval or archive verb (F-A5) · no freeform read (F-A6) · no filing or
  attribution verb (F-A7) · no policy tables and no internet fetch (F-A8) · no metering reshape
  (F-A9) · no SST semantics beyond task #17's marking (F-T1) · **no change to what
  `depreciation_run_due` / `adjustment_run_due` ANSWER** — no FY predicate, ever (D-14); the ONE
  permitted edit to `0045` is OQ-9(a)'s additive extraction below the admission, which changes no
  answer and no grant (**D-26 narrows v1's blanket "no edit to `0041`/`0045`"**) · no edit to
  `wake_context()` or `mint_wake_credential`'s live signature (siblings only) · **no change to keys
  ②③**, `_has_capability`, the `firm_capability_grants` CHECK or any human floor (F9 stays as
  found) · **no estimate-approval door** · no `except_bank_line` · **no ramp, no
  first-run-drafts-only, no sampling, no dark launch — ever** (TA-P5, law 71).
