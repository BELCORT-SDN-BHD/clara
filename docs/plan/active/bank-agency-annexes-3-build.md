# F-A3 — bank agency: ANNEXES 3 · the build

> Companion to `bank-agency-design.md` **v2** (§4) and the gate record
> `bank-agency-gate-record.md`. **O** the build sequence, the two gates and the width ruling ·
> **J** the D1 write-quiesce list, per PR · **L** the predictions the rig replay must confirm or
> correct · **P** the owner questions and the escalated owner items · **Q** the registered risks and
> the named non-goals.
>
> **New at v2.** v1 carried §5 (build), §4 (questions) and §7 (risks) inside the design doc, which
> reached the 500-line ceiling as the gate folded; **J** and **L** came across from
> `bank-agency-annexes-2-record.md` because the severance turned J into three per-PR lists that only
> read beside the sequence. They live here unchanged in authority: this file is the design doc of
> record for everything it carries.

---

## Annex O · Build sequence, the two gates, and the width ruling

### O.1 · The two gates

**G0 — the constitutional gate (unchanged from v1).** No DB PR opens until the owner's digest
re-sign lands for **TA-P1's open register** (law 71's "exactly" enumeration → a register) and
**TA-P7's invariant-(a) rewrite** (PRD §6.2(a) · ARCHITECTURE §0.1 · digest law 2; the AGENTS.md
home is the owner's call at sign-off, per the sitting record's correction). *PR-0's review and the
estate work proceed regardless.*

**G1 — the wake-execution mechanism (NEW at v2; gate blocker B2; CROSS-ITEM).** A `kind='wake'`
`agent_task` is a HELD PROJECTION: created `'held'` (`0011:1230`), the live transition matrix admits
**held→cancelled only** (`0011:1271`; prose `0006:443`), `wakes_outbox` carries the same one-way
guard (`0006:214`, `:570-581`), `drain.mjs:77-90` is the only writer and `reconciler.mjs:184-189`
states in a comment that a wake task can never leave `held`. **Nothing consumes it, so the F-A3
clock as designed emits an event that ends in a permanently-held row** — AGENTS.md's named
stranded-run hazard, one per cadence tick per client — and design §3.3's Tier-D clause ("every abort
settles the task `failed`") is unexecutable under the same matrix.

Two paths, neither of which this lane may pick unilaterally:

| | mechanism | price |
|---|---|---|
| **(a)** | mint `agent_tasks.kind='bank_agent'` on the autodraft precedent | the kind CHECK swap (`0011:637-639`), a dedicated insert arm (beside `0011:1231-1240`), dedicated transition arms (beside `0011:1272-1276`), **D1 recuts of BOTH `_tf_agent_task_insert` and `_tf_agent_task_update`** — two more live judgement-logic bodies — and an admission/enqueue path on the `autodraft.mjs` model |
| **(b)** | keep `kind='wake'` and build the missing consumer | name what reads the held outbox, what starts `bankAgent.v1`, what settles the task, and how a Tier-D `failed` settlement is expressed given the matrix — i.e. a transition-arm recut anyway, or a second state carrier |

**G1 blocks PR-2 and the clock belt. It does not block PR-1a…PR-1d.** **Fail-closed default the
design proceeds on:** no PR in this train bakes an `agent_tasks.kind`; PR-2 does not open until G1
is ruled; if the ruling is (a), its DB half joins PR-1b's window or takes its own — **it may not
ride PR-2, which is runtime-only.** **F-A4 and F-A5 ride the same TA-P5 source (register A12), so
ONE item lands the mechanism and the others extend it** (§O.4).

### O.2 · The revised build sequence (the width ruling folded)

| # | PR | contents | window |
|---|---|---|---|
| 0 | **PR-0 · the gate** (zero code) | the independent judgement-logic review (law 1) over §3.3-§3.5 + the cross-model adversarial pass (law 28). Its record is `bank-agency-gate-record.md`; **DONE — this v2 is its fold** | — |
| 1 | **PR-1a · pure extraction** | the **NINE** core extractions and **nothing else** — each public verb becomes `c := _human_ctx(...); return clara._<verb>_core(...)`. **ZERO behaviour change.** Plus the prosrc-pin RE-POINTS (M2): the lock-order pins MOVE to the cores and each public body gains the "acquires nothing" pin. One claim, mechanically checkable: *nothing changed* (H.1's differential cell) | **D1** |
| 2 | **PR-1b · the agent limb** | **TEN** re-cut bodies (§J), the whole Tier-A/B/C ladder, the receipt + proposal + hold tables, the two deferred receipt walls, the proposal-accept trigger, the carriers' CHECK swaps, the `bank_agent` credential kind and both mint gates, the ungranted agent cores, the granted wrappers, the role/grant/allowlist, the re-cut censuses. **This is the judgement-logic PR and it takes the whole ladder on its own** (review law 1 on every rung) | **D1** |
| 3 | **PR-1c · the egress purpose** | **FIVE** `0090` bodies + **FOUR** ACCESS EXCLUSIVE CHECK swaps for `bank_matching` (Annex E). Independently provable, **independently rollback-able**, and **blocked on C6** (DPA · client disclosure · PDPA basis) | **D1** |
| 4 | **PR-1d · reads and the gate repair** | `wake_get_bank_pack` · `bank_agent_run_due` · the drawer-2 gate's FOUR-count repair (Annex F). Reads only; the gate function is a stable read whose result rows are append-only and re-measured next close run | none |
| 5 | **PR-2 · runtime** | `bankAgent.v1` (a new frozen export + registry entry), the clock belt beside the six in `leader.mjs`, the `GOVERNED_EGRESS_PURPOSES` entry, the pack budget, the Tier-D `last_refusal` capture, **the `clara_wake_bank_login` DSN + pool wiring** (M4). New frozen `_vN` exports and registry repoints, never edits; **bundle-grep after build**. **GATED ON G1** | none |
| 6 | **PR-3 · retirement + parity + doors** | the drops (Annex I), the four dashboard surfaces, the census dispositions, the five human doors (Annex M.2), chat parity rows (OQ-6), the staff-advance sibling (OQ-7) | **D1** |
| 7 | **PR-4 · acceptance** (zero code) | re-measure as-run, publish the measured populations (M3/M6 refusal classes, the 60-day stop frequency), `PROGRESS.md`, F-A10's bank half | — |

### O.3 · The width ruling (orchestrator, on the bytes lens's convergent evidence)

**v1 priced PR-1 at "eleven CoRs on live audited writers in one window" and declined to sever.
The gate's byte-level re-derivation put the true surface at ~19-20 live bodies plus 8-9 ACCESS
EXCLUSIVE DDL objects — and `_approve_entry_core` and the two allocate cores, the most dangerous
bodies in the estate, would have been re-cut in the same window as nine mechanical body moves.
That is where a count stops being a count (F-A2's GM-9 / R-L3 lesson). PR-1 is SEVERED four ways**
on the grounds the bytes lens named and this fold adopts:

1. **A pure-extraction PR comes first, alone, with zero behaviour change.** Its claim is reviewable
   as one sentence and is proved by a differential cell, not by reading nineteen bodies.
2. **The judgement-logic limb is its own PR.** Every rung of the ladder is judgement logic; mixing
   it with mechanical moves means the review that matters happens on a diff nobody can hold.
3. **Independently-rollbackable limbs are their own PRs.** The egress purpose blocks on C6's legal
   pack and is provable and revertible on its own; carrying it inside the agent limb couples an
   accounting build to a legal-review clock.
4. **The clock cannot open at all until G1** (§O.1).

**The ceremony cost is priced and mitigated, not paid three times.** PR-1a, PR-1b and PR-1c are
three PRs, three migration files and three separate reviews — but they apply in **ONE combined
ceremony window once the train has fully merged** (the F-A2 opener-night lesson: splitting a merged
train's windows opens CREATE stall gaps). The file split buys the review isolation; a second night
buys little and costs the reconciler-herd and zombie-pooler hazards again. **If PR-1c lags on C6, it
takes its own later window** — that is the one case where a second night is right, and it is exactly
why it is a separate PR.

**Rejected at this gate:** the bytes lens also recommended that **OQ-6 (chat parity) and OQ-7 (the
staff-advance sibling) leave the train entirely** on width grounds. **Declined.** Both are inside
the contract's own F-A3 scope (§F-A3 names the staff-advance application leg), both already ride
**PR-3**, not PR-1 — so they cost the wide windows nothing — and F-A2's **D34** is directly on point:
the owner overruled a width-motivated severance of chat parity and ruled that it **stays in the
train**. Sequencing it behind the unattended lane honours D34; removing it would not.

**Ceremonies run from merged `main`**, with the standing runbook hazards: the DSN bridge + a 110s
quiesce, `fly.exe`'s non-zero exit after a successful non-tty `ssh -C`, the post-restart zombie
pooler sweep, `PG*` vars for rig runs, the reconciler herd against two lane slots, and the
**pre-quiesce prosrc sha tripwire** on the two spliced bodies (survey F7).

### O.4 · Cross-item sequencing obligations (stated, never assumed)

1. **The wake-execution mechanism (G1) is shared with F-A4 and F-A5** (register A12 — TA-P5's "ONE
   time-triggered wake source"). Whichever item lands the mechanism owns it; the others EXTEND it
   and say so in their PR. F-A3 assumes nothing and bakes no kind.
2. **`_approve_entry_core` — F-A3's is the TENTH generation, not the ninth.** `0053`'s splice B makes
   the live tip the EIGHTH; **F-A2 ships the NINTH** (the session-local PR-1 ledger's F-A2 PR-1
   design trues).
   F-A3 authors against F-A2's **merged** prosrc and pins its sha. **Strict ordering, never a merge.**
   Whether a tenth body is needed at all is **P-14**.
3. **`chatTurn_v13` is ALREADY CLAIMED by F-A2's PR-2** (`f-a2-agentic-posting-design.md:438`).
   F-A3's chat parity (OQ-6, PR-3) reads the **live registry at authoring time** and takes the next
   free version — never a version named in a design doc (constraint 9; freeze-lint).
4. **`wake_credentials`' two CHECKs and `mint_wake_credential`'s two gates are shared with F-A2's
   D34** (`interactive_client`) and will be shared with F-A4/F-A5. **Whoever lands second re-reads
   the LIVE CHECK text** (`pg_get_constraintdef`, never the migration file) and extends; the PR says
   so against C-3's record.
5. **`open_questions`' CHECK family is shared with F-A7** (a firm-scoped unattributed carrier,
   TA-P7 rider 4). Same rule: whoever lands second re-reads and extends.
6. **The registry-vs-ledger predicate is shared with F-T4.** F-T4 owns drawer-1's
   `bank_recon_close_state` census (R-F 1); F-A3 owns drawer-2's `no_registered_account` arm.
   **One predicate, one owner, two call sites** (TA-P11's one-architecture test) — whichever lands
   first writes it and the other CALLS it. Boundary question: Annex P, owner item 3.
7. **F-A3 sequences after F-A2 PR-3** (the 8th/9th `_approve_entry_core` chain, the receipt trigger,
   D34's re-key). If D34 were ever re-severed, F-A3 carries `wake_open_question`'s re-key itself
   (survey F10) — one extra D1 body.

---

## Annex J · The D1 write-quiesce list, per PR

**ONE number, published here and quoted everywhere: TWENTY-FOUR CoR'd live bodies (23 if P-14
clears), ELEVEN DDL groups, THREE new tables.** v1 said "eleven CoR'd live bodies, two new constraint
triggers, three CHECK swaps, three new tables" over a twelve-row table, while the design body said
"eleven CoRs", H.1 said "ten extracted verbs", A.2's table had nine and P-11 said "twelve" — four
disagreeing counts on the checklist a live-write-quiesce ceremony is run from (gate blocker **B3**).
It is re-derived below **from the verb set**, and **P-11′** predicts the corrected number. The count
is a PREDICTION until the rig replay confirms it; the F-A2 GM-9 lesson is that a label enumerated
nowhere is not a count.

### J.1 · PR-1a — NINE pure extractions, zero DDL, zero behaviour change

| # | body | live tip |
|---|---|---|
| 1 | `clara.match_bank_line/6` | `0038:3817` as patched by `0040:5340-5385` — **spliced, sha-pinned before the window (P-1)** |
| 2 | `clara.unmatch_bank_match` | `0038:5125` |
| 3 | `clara.complete_bank_reconciliation` | `0040:1587` |
| 4 | `clara.void_bank_reconciliation` | `0040:2057` |
| 5 | `clara.resolve_bank_line_exception` | `0040:3372` |
| 6 | `clara.resolve_and_book_bank_line` | `0044:3106` |
| 7 | `clara.void_bank_statement` | `0038:2211` |
| 8 | `clara.add_bank_account` | `0038:2595` |
| 9 | `clara.upsert_account` | `0009:1460` (three-CoR lineage; `0009:1202` drops the 6-arg) |

Plus the **prosrc-pin re-points** (material M2 — test files, not DB objects): `x38-match:1483-1487`,
`:1525`, `:1542-1546` · `x38-bank:2073`, `:2082` · `x40-tieout:3053-3072`.

### J.2 · PR-1b — TEN re-cut bodies + SEVEN DDL groups (the judgement limb)

| # | body / object | why |
|---|---|---|
| 10 | `clara._bank_match_adjustment_entry` (`0038:3713`) | **F2** — ctx identity, NULL `last_human_editor` on the agent arm, the F-A2 receipt write |
| 11 | `clara._settle_from_bank_line_core` (`0044:1706`) | **B1** — thread `p_ctx` through (`:1908`/`:1927`/`:1946`), derive `origin` from ctx (`:2091-2094`), no `'pending'` on the agent arm |
| 12 | `clara._allocate_receipt_core` (`0044:1034`) | **B1** — identity, the receipt write, the explicit LIVE arm past `is_high_stakes` |
| 13 | `clara._allocate_payment_core` (`0044:1353`) | **B1** — the AP twin |
| 14 | `clara._approve_entry_core` (**TENTH** generation) | the bank ctx pass-through + the adjustment arm. **CONDITIONAL on P-14**; authored against F-A2's merged prosrc, sha-pinned |
| 15 | `clara._tf_bank_match_congruence` (`0038:3438`) | the third `origin` arm (agent ⇒ no rule id) |
| 16 | `clara.mint_wake_credential` (`0011:1156`) | **both** gates for `bank_agent` (`:1163-1165`, `:1178-1186`) |
| 17 | `clara._match_bank_line_core` (born PR-1a) | the ctx-derived `origin` literal (**A25**) |
| 18 | `clara._unmatch_bank_match_core` (born PR-1a) | the CLR16 `detail.reason` |
| 19 | `clara._complete_bank_reconciliation_core` (born PR-1a) | the M11 waiver wall's hook |
| DDL 1 | `ALTER TABLE clara.bank_matches` — `origin` CHECK (`0038:611`) | **ACCESS EXCLUSIVE**; validates trivially |
| DDL 2 | `ALTER TABLE clara.wake_credentials` — **both** CHECKs (`0011:622-628`) | **ACCESS EXCLUSIVE**, D34's precedent (P-7) |
| DDL 3 | `ALTER TABLE clara.open_questions` — `scope_kind`, `origin` (`0016:202-204`), `ck_open_questions_scope` | **ACCESS EXCLUSIVE** |
| DDL 4 | `CREATE TABLE bank_agent_receipts`, `bank_agent_proposals`, **`bank_agency_holds`** (+ append-only triggers, + the partial admitted index) | **three** new relations (**A26**, **A27**) |
| DDL 5 | `t_bank_match_agent_receipt`, `t_bank_recon_agent_receipt` | new constraint triggers on live tables — **ACCESS EXCLUSIVE** |
| DDL 6 | **`t_bank_agent_proposal_accept`** on `clara.bank_line_exceptions` | **NEW at v2 (B4)** — ACCESS EXCLUSIVE; **declared judgement logic** |
| DDL 7 | the granted wrappers' single EXECUTE grant + the `bank_agent` allowlist rows | new objects |

**BUILD OBLIGATION J.2-a — the composite's three internal calls (recorded 2026-08-23 by the PR-1a
lane, measured on the rig at frontier 0102).** `clara.resolve_and_book_bank_line`'s body calls the
**PUBLIC** `clara.resolve_bank_line_exception` twice and the **PUBLIC** `clara.match_bank_line`
once. PR-1a deliberately left all three alone — repointing them would drop an inner floor re-check
and PR-1a's whole claim is that nothing changed — so after PR-1a they land on the new thin
wrappers, which re-derive `_human_ctx`. That is exactly today's behaviour for a human caller (the
composite's `owner` floor dominates the inner `bookkeeper` one), and it is **fatal for the agent
lane**: `_agent_resolve_and_book_core` → `_resolve_and_book_bank_line_core` → a public wrapper →
`_human_ctx` → **CLR04 `no authenticated actor`, two levels down**, for a wake caller with no JWT.
The agent composite is *unreachable*, not merely mis-attributed. **PR-1b MUST repoint those three
call sites** at `clara._resolve_bank_line_exception_core` / `clara._match_bank_line_core`, threading
the caller's `p_ctx`, as part of body 17/18's re-cut — and its battery needs the cell that a
`bank_agent` credential can actually reach the composite, because a catalog assertion cannot see
this.

**BUILD OBLIGATION X-1 — arm (4) as designed is VACUOUS ON ITS OWN TARGET POPULATION (recorded
2026-08-23; conductor's ruling).** Design §3.11(4) defines the new `no_registered_account` fail as
*"a bank-class COA account with movement but NO registered `bank_accounts` row"* (`bank-agency-
design.md:459-462`). At the bytes, and re-measured on a rig at frontier 0102, `coa_accounts.
is_bank_account` has exactly **two** writers — `add_bank_account` (`0038:2731`, now
`_add_bank_account_core`) and `remap_bank_account_coa` (`0038:2987`) — so **the flag is minted BY
REGISTRATION**. A zero-registry client therefore carries zero flagged accounts, and arm (4)'s
predicate returns the empty set **exactly on the population it exists to catch** — the same
empty-registry defect repairs (1) and (2) already have, one level down. Prediction **P-4′** cannot
hold as written. **F-T4's design §2.2** (`docs/plan/active/fix-queue-design.md`, on branch
`track-b/ft4-fixqueue-design` until its docs PR lands) enumerates three surviving arms that do not
key on the registration-minted flag; **PR-1b adopts one** and proves it with a **zero-registry
fixture that MUST fire** (a cell that cannot fail proves nothing — law 31). *This lane recorded the
finding and did not design the fix.*

### J.3 · PR-1c — FIVE re-cut bodies + FOUR CHECK swaps (the egress purpose)

| # | body / object | at |
|---|---|---|
| 20-23 | `grant_client_egress_purpose` · `activate_…` · `deactivate_…` · `revoke_client_egress_purpose` | `0090:758`, `:818`, `:890`, `:952` |
| 24 | `prepare_egress_dispatch` | `0090:1007-1058` |
| DDL 8-10 | the three purpose CHECKs | `0090:691-704` — **ACCESS EXCLUSIVE** ×3 |
| DDL 11 | `ck_egress_dispatch_authorizations_doc_sha` (+ the NULL conjunct) | `0090:730-735` — **ACCESS EXCLUSIVE** on a table the witness lane writes on every dispatch |

### J.4 · NOT on any list, each for a stated reason

`settle_from_bank_line/12` — untouched · every new agent core, wrapper and read — **new objects**,
not CoRs · `_close_gate_bank_items` — a stable read, **PR-1d** · `bank_agent_run_due` and
`wake_get_bank_pack` — new reads, **PR-1d** · the human **`except_bank_line`** — **never touched by
this item, in any PR: its floor, arity, ACL, prosrc and semantics are byte-identical after every PR,
and the proposal's `accepted` flip is written by `t_bank_agent_proposal_accept` (DDL 6), a trigger on
the table the verb writes, never by the verb** *(v2 correction — v1's bare "never touched" was true
of the verb and false of the mechanism it was covering for)* · **`agent_tasks`' kind CHECK and both
`_tf_agent_task_*` bodies — NOT LISTED because gate G1 is unruled**; if the ruling is mechanism (a)
they add **two bodies and one DDL group** to whichever item lands them (§O.4 obligation 1).

---

## Annex L · Predictions the rig replay must confirm or correct

**Each is a claim this design could not settle from the checked-in bytes** — the rig settles it, and
a correction is a design amendment, not a bug.

| id | prediction |
|---|---|
| **P-1** | the live `match_bank_line/6` prosrc carries the S4.4a `line_excepted` block exactly once and no `p_via_rule` reference (`pg_get_functiondef`; pin the sha) |
| **P-2′** | **RE-CUT at v2 (B1).** ~~`_settle_from_bank_line_core` needs no CoR.~~ **It DOES.** The rig confirms WHICH of the three ctx hops is load-bearing — the settle core's own unpack (`0044:1722`), the sub-ctx rebuild (`:1927`/`:1946`), or each allocate core's re-derivation (`:1051`/`:1367`) — and whether threading the top-level ctx alone suffices |
| **P-3** | no CI leg re-applies `0040` onto a database that already holds F-A3's wake rows (so F8's LIKE census cannot fire) |
| **P-4′** | **RE-WORDED at v2 (M1).** The gate returns `pass` for every live client today; after the repair, **every client with bank-class COA movement and no registered account flips to `fail` via arm 4**, and ≥1 registered-but-gapped client flips via arm 1 or 2 |
| **P-5** | the 60-day challenge population on the live books is non-zero at the first agent reconciliation (measured; the number rides to the owner, R-E/R-A) |
| **P-6** | the bank estate contains **zero** `entry_evidence` rows (F3) |
| **P-7** | extending `ck_wake_credentials_kind_0011` / `_client_0011` validates trivially over existing rows (D34's rig proof repeated) |
| **P-8′** | **RE-CUT at v2 (B2) into a prediction that can FAIL.** ~~The relay mints a `wake` task with no new kind.~~ **A `bank.agent_due` event ends in a run that reaches `completed` and leaves a `bank_agent_receipts` row.** Under today's bytes this prediction is FALSE and G1's ruling is what makes it settleable |
| **P-9** | `_bank_desc_word_match` / `_bank_rule_regex_escape` have callers outside the rules machine and must survive the drop |
| **P-10** | no second amount-bearing evidence path exists on the bank shapes (the D42 review obligation) |
| **P-11′** | **RE-CUT at v2 (B3).** The D1 surface is exactly **Annex J's 24 bodies (23 if P-14 clears) and 11 DDL groups**, split 9 / 10+7 / 5+4 across PR-1a/1b/1c. A replay that finds a twenty-fifth corrects the design before the window opens |
| **P-12** | the bank tier census (`pg_trigger.tgdeferrable` over every trigger in survey §1.3) matches Annex B's Tier-D membership — replayed, not read |
| **P-13** | `t_je_agent_post_receipt` fires for a bank-match adjustment — i.e. its `is_agent` arm reads the acting identity the adjustment path supplies. **v2 extends it to the SETTLE path**: it fires for an agent settlement's `customer_receipt` entry too |
| **P-14** | **NEW at v2 (B3/A32).** F-A2's merged `_approve_entry_core` (the NINTH generation) accepts the bank ctx keys as-is, so **no TENTH body is needed**. If it does not, body 14 is real and PR-1b's count is 24 |
| **P-15** | **NEW at v2 (B2).** No consumer of `agent_tasks(kind='wake')` or `wakes_outbox` exists anywhere in `packages/runtime` — the catalog/grep census re-run at the rig, both directions |
| **P-16** | ~~**NEW at v2 (M2).** The five prosrc/overload pins are the COMPLETE set that reads an extracted public body.~~ **CORRECTED 2026-08-23 by the PR-1a lane's census — the set is SIX, and one of the five was vacuous.** (i) **A sixth site exists**: `x42-r8-seam.test.mjs:406-412` reads `resolve_and_book_bank_line`'s prosrc by proname and regexes `clara._hash(jsonb_build_object(…))` for `'ack'`; after the extraction the public body computes no hash at all, so the cell goes RED. Moved to the core with its wrapper twin; census row **C17** now lists six sites. (ii) **`x38-match:1483` was measuring nothing**: `fnSource` concatenates `match_bank_line`'s /6 and /7 overloads and PR-1a extracts /6 ONLY (/7 drops in PR-3), so the pin stayed GREEN off the still-fat rule arity — a vacuous pass, exactly the failure M2 exists to prevent. Every wrapper pin is now **per-oid**, the settle precedent at `x38-match:1496-1538`. Negative controls that correctly said nothing: `wb-g-opkeys`' granted-writer-without-`_reserve_op` law (`WB_FN_FAMILY_RE` is the 0017 family), `eta-contract:236`'s `_human_ctx` catalog census (the PUBLIC names keep the call), the wb-0019/0020 wiki whitelists, `epsilon` statutory, `delta` metric-curated and `x42v.g4`'s staff-advance writer lists |
| **P-17** | **NEW at v2 (M4).** No live login role is a member of more than one group (the two-login law N10 holds estate-wide), so `clara_wake_bank_login` is the only way to reach `clara_wake_bank` |

---

## Annex P · Owner questions and the escalated owner items

### P.1 · OQ-1…OQ-8 (recommendation + fail-closed default)

Under the standing delegation the design proceeds on the recommendation; **escalate only if a law or
a ruling would change**. Each is registered in Annex K.

- **OQ-1 · Does "`enter_bank_statement` is Clara's" require a second entrance?** *Recommendation:*
  **no** — she already enters statements through the witness pipeline; a hand-key sibling would have
  to claim `human_keyed` corroboration (§3.2). *Fail-closed default:* do not build it. *Escalate if:*
  the owner reads TA-P1 C / contract §F-A3's naming of the verb as requiring the verb itself.
- **OQ-2 · `remap_bank_account_coa` / deactivate / reactivate.** *Recommendation:* not in v1 — no
  mechanical wall exists for a re-binding. *Fail-closed default:* human-only, revisit with data.
- **OQ-3 · Unmatching a HUMAN-created match.** **CLOSED AT v2 — the question was already ruled.**
  v1 recommended "her OWN matches only; a human-authored match refuses `bank_match_human_authored`",
  framed as *a wall that validates*. It is not: it keys on WHO acted, not on a DB-owned safety fact,
  and it is verbatim the option the sitting REJECTED (`track-a-sitting-agenda.md:96` A3-OQ-6's
  column A). TA-P1 C, the ledger's dissent record (the owner was told the "destroyed history" cost
  and accepted it) and the contract's **"unmatching any pair, not only her own"** all say the same
  thing. **She unmatches any pair**; the only rungs are mechanical (M8 reversal/mirror, **M14** a
  later reconciliation depends on it). Gate material **M5**.
- **OQ-4 · Voiding a statement or a reconciliation.** **CLOSED AT v2, same ground.** v1's "only what
  **she** filed/completed" is the same provenance gate; A3-OQ-2's C column is "both go to Clara",
  unqualified, and A3-OQ-5's is "only `except_bank_line` stays human". **She voids any statement or
  reconciliation**, subject to **M14** (no later reconciliation depends on it) and **M15** (no live
  or pending match on the statement) — both DB-owned facts, both pre-checks of belts that already
  run. Gate material **M5**.
- **OQ-5 · The 60-day number (R-E / R-A, the sitting's only true residual).** *Recommendation:*
  build at 60 for both lanes, **measure the real stop frequency in the battery and on the first live
  run**, and bring the number back to the owner once (PREDICTION P-5).
- **OQ-6 · Does the chat lane get bank parity in this train?** *Recommendation:* PR-1b allowlists
  `bank_agent` only; chat parity (`interactive_client` rows on the same cores) rides **PR-3** — in
  the train, after the unattended lane is proven. **D34 named and distinguished** (nit N4): D34 fixed
  a **broken invariant on an already-granted authority** (an `interactive_client` credential was
  unmintable, so a chat-triggered post had no valid fallback) and the owner reversed a severance that
  would have left that hole open. OQ-6 grants no authority that then goes unfulfilled — the
  allowlist rows simply land in PR-3, the correctness-critical half (draft-or-typed-question) is
  present from PR-1b via the `bank_line` scope built *in the D34 shape*, and human bank matching
  keeps working unchanged throughout. *Fail-closed default:* as recommended — **sequencing, not
  narrowing, and not a severance.**
- **OQ-7 · Does `book_staff_advance_application` (A3-M-advance) ride F-A3 or F-T4?**
  *Recommendation:* **F-A3 PR-3**, as a sibling of the same shape (law 19's B-lite roster untouched)
  — the contract names the staff-advance application leg inside §F-A3. *Fail-closed default:*
  human-only until PR-3.
- **OQ-8 · Where does a PROMOTED payer identifier get keyed? (NEW at v2 — gate blocker B5's
  residual.)** TA-P8 B granted the promotion door. The estate keys client-owned bank accounts into
  `client_identifiers(kind='bank_account')` (`0007:227`, written by `add_bank_account` at
  `0038:2743-2751`) and keys counterparties by `registration_normalized` (`0009:832-841`) — **there
  is no counterparty-bank-account identifier relation**, so a promoted PAYER account has no home
  unless that payer is itself a client of the same firm. *Recommendation:* build the propose half
  now; scope the confirm half to the client-payer case; **do not invent an identity relation on a
  design lane** next door to constraint 12. *Fail-closed default:* `promotion_target_unavailable`,
  proposal stays OPEN. *Escalate:* yes — owner item 2 below.

### P.2 · The four owner items this gate escalated

1. **The wake-execution mechanism (G1).** A mechanism decision under TA-P5's ruling, **cross-item**
   (F-A3 · F-A4 · F-A5), already on the sitting's owner-facing list. Ask: *(a) a new
   `agent_tasks.kind` per authority scope, or (b) one consumer for the existing held-wake
   projection?* Cost of (a): two more live judgement-logic bodies on a D1 list per item that mints a
   kind. Cost of (b): a new consumer + a settlement path that the current matrix does not express.
   **Fail-closed default while unruled:** nothing bakes a kind; PR-2 does not open.
2. **The identifier-promotion target (OQ-8).** TA-P8's granted door has no relation for a
   non-client payer. Ask: *mint a counterparty-identifier relation (a new identity surface beside
   constraint 12), or keep promotion scoped to client-payers until the Wave-G reset?*
   **Fail-closed default:** the narrow scope above.
3. **The R-F 1 boundary reading.** Drawer-2's new `no_registered_account` arm and drawer-1's P-3
   census share one predicate. Ask: *confirm that "drawer-1's P-3 stays F-T4's" is a claim about
   OWNERSHIP (one writer, two call sites), not about absence — because on the absence reading the
   drawer-2 gate cannot be un-greened at all and TA-P14 clause 1 is unmet for this item.*
   **Fail-closed default:** the ownership reading; the arm ships in F-A3 and F-T4 calls it.
4. **G0, unchanged.** The two constitutional amendments' digest re-sign (plus the AGENTS.md home
   question and TA-P7's minuted wording), already on the sitting's list.

*Also standing, not escalated:* OQ-5's 60-day number returns to the owner ONCE on measured data.

---

## Annex Q · Registered risks and named non-goals

- **An adjustment can absorb an error.** A difference booked to "bank charges" hides a mis-posted
  invoice. There is **no amount threshold** (G1.2 forbids it); the protections are M7's account-class
  wall, the mandatory rationale, the receipt, and the reconciliation's own stale challenge.
  **Priced and accepted; measured in PR-4.**
- **The 60-day waiver is now automatic.** M11 is a duplicate-payment test, not a human eye. A
  duplicate that is not same-counterparty/same-amount passes. **This is the dissent's cost, made
  explicit.**
- **She can unmatch and void what a human did.** M5's widening restores TA-P1 C literally. The cost
  the owner was told and accepted in-session — *destroyed history has no human eye* — now lands on
  human-authored work too. The mitigations are mechanical (M8, M14, M15), the act is receipted, and
  the correction path is `unmatch → re-match`. **Named, not softened.**
- **PR-1b is still WIDE** — ten CoR'd live bodies including the estate's three most dangerous
  (`_approve_entry_core`, both allocate cores) in one window. The severance took the nine mechanical
  moves and the five egress bodies out of it; what remains is irreducibly the judgement limb. The
  mitigation is the F-A2 discipline (prosrc pins, a rig replay before the window, a sha tripwire) and
  the review law 1 ladder on every rung — not a smaller claim.
- **Three windowed PRs mean one long combined window** (§O.3). If PR-1c lags on C6 it becomes a
  second night, with the runbook hazards paid twice. Accepted.
- **Two architectures exist between PR-1b and PR-3** — the rules machine still answers while the
  agent lane runs; F-A10 closes it at PR-3, not later.
- **The repaired gate will flip green clients red** (§3.11) — intended, and it will look bad on the
  readiness screen for a week.
- **Non-goals:** no `except_bank_line` widening, ever, in this item — **including by trigger side
  effect**: `t_bank_agent_proposal_accept` reads the exception the verb wrote and writes only the
  proposal row; the verb's own floor, arity, ACL and semantics are byte-untouched · no re-opening of
  the witness predicate, the statement ingest lane or the chain (openers ①②⑥ / `0102`) · no FX
  (law 18) · no close keys (F-A4), reporting (F-A5), freeform read (F-A6) or filing verb (F-A7) ·
  no per-firm capability dial (ADR-0072②) · no amount routing, ramp, sampling or dark launch —
  **ever** · **no counterparty-identifier relation invented on this lane** (OQ-8).
