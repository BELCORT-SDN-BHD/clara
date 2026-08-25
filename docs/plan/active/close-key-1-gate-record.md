# F-A4 PR-0 — the gate record

> **The gate ran 2026-08-22** against design **v1.1** (`close-key-1-design.md` + the survey and
> the two annexes), as design §5 step 1 requires. **Two lenses, both fresh-context, both
> read-only on code:** the **BYTES lens** — every migration and code cite in all four files
> resolved mechanically and printed back, plus a full `create [or replace] function` lineage
> sweep across all 102 migrations for every body the design CoRs — and the **RULINGS lens**,
> walking the design against the six TA-P rulings it binds under, ADR-0074's own text and the
> sitting ledger. **Every finding was then re-attacked by an independent verifier that did not
> raise it**, which re-graded severity and REFUTED two.
>
> **Verdict: the design's SEAMS hold and its estate work is unusually good; three blockers and
> ten materials bind the build; PR-1 is SEVERED into two D1 windows.** Every finding below names
> its fold target. **The fold is v2's change-log entry (Annex H) and this file is its
> specification.**
>
> Counts: **3 blockers · 10 materials · 3 nits CONFIRMED · 2 REFUTED** (both re-graded to nits and
> folded as clarity, not defects). One further finding, **G4**, was derived by the fold lane while
> re-deriving the census a CONFIRMED finding showed incomplete; it is recorded here with its bytes
> and carries a blocker's weight for the clock.

---

## 1 · What was attacked and HELD

- **The estate survey is byte-accurate where it matters.** The lineage sweep found **no later CoR**
  for any of the twelve bodies the design touches (`finalize_close` `0056:2003` · `reopen_fiscal_year`
  `0085:172` · `attest_close_exception` `0056:1816` · `begin_close` `:1723` · `abandon_close` `:1943` ·
  `_evaluate_one_gate` `:1425` · `_close_gate_uncoded` `:1381` · `_gate_outstanding_items` `:1790` ·
  `get_close_plan` `0064:154` · `snapshot_state` `0057:574` · `wake_context` `0011:1133` ·
  `mint_wake_credential` `:1156`), so §1.1's live tips hold and findings F2-F7 / F11-F14 all
  reproduce at the bytes.
- **F2's quote is byte-exact** and the Fix-A bytes (`0056:2242-2246` · `0085:379-386` · `0016:602`)
  are exact. **The two event registers really are two** (`0056:1037-1052` + `:3190-3199`).
  **`wake_context` carries no kind list**, so census C14's premise is sound. **All thirteen gate
  evaluators are STABLE**, so the dry-run core can be. **The approve-writer census (C5) genuinely
  does not move.** The event-type censuses are superset-shaped, so the new notice type is safe.
- **The one-architecture discipline is real, not decorative.** D-03 (the dry run reuses
  `_measure_one_gate`), D-11 (the prepayment evaluator mints an `adjustment_templates` row rather
  than a second posting machine) and D-04 (wrappers, not a `get_close_plan` grant — which keeps the
  client pin meaningful and leaves T4's census green) were each attacked and each held.
- **The rulings walk is disciplined.** Every one of TA-P1, TA-P2, TA-P4, TA-P5, TA-P6 and TA-P14 is
  walked with named member-question dispositions; the clock and the minimal doors are both built
  with named non-goals guarding against ramp and scope creep; six open questions are escalated with
  fail-closed defaults rather than decided unilaterally. **No superseded-body cite, no unbuildable
  limb and no self-referential test cell** was found in the item's own annexes.
- **D-13's sibling shape survived attack.** Widening `wake_context()` or recutting
  `mint_wake_credential` in place would put the two most-read wake bodies in a D1 window covering
  every wake lane; the sibling carrier is the narrower and correct call. **Ships as designed.**

---

## 2 · Blockers — the build may not start until each is folded

**GB-1 · Rung B13's second oracle cannot be evaluated from the agent lane at all.**
*(BYTES lens, CONFIRMED blocker — "every cited byte checks out exactly, and the mechanism is
airtight, not merely plausible".)* `clara.adjustment_run_due(p_client)` (`0045:5513`) performs
`clara._assert_due_read_ctx(v_firm)` as its **first act** (`0045:5525`) — unconditionally, before
the templates loop, so the blast radius is every client, not only those with a template. That body
(`0042:437-454`) admits, when `clara.jwt_sub()` is null (`:441`), only
`current_setting('role')='clara_runtime'` or `session_user in ('clara_runtime','clara_runtime_login')`
(`:443-444`), else raises **CLR03** (`:447`). The wake write pool connects as
`clara_wake_write_login` and `SET ROLE`s `clara_wake_interactive` (`pools.mjs:58`, `:373`), and
`setupSql()` (`:136-141`) sets no `request.jwt.claims` on any pool. So B13 **raises inside the
freezing transaction**: no receipt row, no failing-rung vector, Tier B's "COMMITS so the reason is
durable" contract broken, and cell C-16 unable ever to go green. v1 then closed both natural exits
itself — §7's "no edit to `0041`/`0045`" and D-14. The FA twin is fine (`0041:3617-3630` compares a
non-null `jwt_firm()` only).
**Fold:** design §3.6's B13 is re-cut into three arms with the ADJ arm inside its own
`begin…exception` block, **fail-closed — an inevaluable probe counts as DUE** and refuses
`belt_period_unrun` with `reason='adj_oracle_inevaluable'`, never a raise (Annex A.3 B13 arm 3;
Annex E.2 gains the reason). The **repair itself is an owner item (OQ-9)**: the recommendation is
an additive ungranted `_adjustment_run_due_core` below `0045:5525` with the live oracle keeping its
admission and becoming a thin delegate — which required §7 and D-14 to be narrowed explicitly, and
they now are (**D-26**: "no change to what the oracles ANSWER" replaces "no edit to `0041`/`0045`").
**New cell C-19** calls `adjustment_run_due` through a real `clara_wake_interactive` session in both
directions — the positive control whose absence let this ship in v1.

**GB-2 · Two of the wrappers delegate to bodies that open with `_human_ctx` and are declared
"unchanged".** *(BYTES lens, CONFIRMED blocker.)* `snapshot_state` (`0057:574`) opens
`c := clara._human_ctx(clara.role_rank('viewer'));` at **`0057:578`** — and survey §1.1 recorded its
ctx resolver as `—`. `propose_fiscal_year` (`0056:1629`) opens `_human_ctx(bookkeeper)` at
**`0056:1634`** and **is granted** to `clara_authenticated` at `0056:1655` — survey §1.1 called it an
"ungranted helper". `open_fiscal_year` calls it **in-body at `0056:1697`** under its own
`_human_ctx(admin)` (`:1665`). `_human_ctx` (`0004:298-307`) raises CLR04 when `jwt_sub()` is null,
so both wrappers are dark on a wake credential — the exact class the design's own F1 states from
`0064:29-38`, and the ROME-PUBLIC-ADVISORY acceptance round cannot even start.
**Fold, and it is cheaper than the finding proposed:** `clara._snapshot_state_core(uuid)`
**already exists, ungranted, at `0057:564`** (revoked from public `:572`), so `wake_snapshot_state`
reaches it with the firm check re-expressed on `clara.actor_firm_id()` — **no live-body recut at
all**. The FY chain does need two extractions, `_propose_fiscal_year_core` and
`_open_fiscal_year_core` (design §3.11, **D-16**, D1 rows **B1-12/B1-13**). Survey §1.1's two rows
are corrected; Annex F's "unchanged" paragraph no longer lists `snapshot_state` for the wrong
reason. **New cell C-22** walks the FY-open chain both ways.

**GB-3 · The shared begin/abandon cores swallow the `close_and_attest` capability wall, and the
design never says how the agent crosses it.** *(BYTES lens, CONFIRMED blocker; verified against the
migration, the design's own text AND the owner-ruling ledger.)* §3.1 said the human bodies are
recut to move **"everything below their `_human_ctx` line"**. At the bytes the first statement below
that line is the capability gate: `begin_close` `0056:1728` then **`:1729-1733`**
(`if not clara._has_capability(c.firm, c.actor, 'close_and_attest') then raise … CLR04
'capability_missing'`), `abandon_close` `:1949` then **`:1950-1954`**. `_has_capability`
(`0056:1114-1126`) is satisfied only by a live `firm_capability_grants` row — whose sole writer is
the owner-only `grant_firm_capability` (`0056:1130`) — or literal firm-`owner` membership; the agent
uuid is seeded as a bare `clara.users` row (`0002:334-335`, `:549-551`) and `create_firm`
(`0004:318`) refuses to let it own a firm. **So built as written, every clocked close raises CLR04
forever; built the other way, the estate's only key-① wall is deleted silently** — and C-12 could
not catch it, because C-12 proves only the human entrance. §7 and `OQ-A4-14` closed both exits.
**Fold:** design §3.1 states **THE ENTRANCE SEAM** as law — the cut is below the capability gate
(`0056:1734`, `:1955`), each entrance's authority wall is named, and the shared core carries
neither (**D-15**, mechanism in **Annex A.8**). §3.2's Tier A says explicitly that the capability
gate is *not* a rung. **New cell A-9** (contract-blind): after the body-move a human holding
`bookkeeper` but **not** `close_and_attest` is still refused CLR04 on both verbs, while the agent
path succeeds with no capability row anywhere for `clara.agent_user_id()`.

---

## 3 · Materials — each folds into v2

**GM-1 · The D1 list is incomplete against the design's own verb set.** *(CONFIRMED.)*
`clara.open_fiscal_year` (`0056:1657`) is a deployed audited writer — it INSERTs `fiscal_years`
(`:1701-1705`), calls `_audit` (`:1706`) and `_append_event` (`:1710`), and computes `fy_end_source`
in-body (`:1697-1700`), the very domain D1-10 extends — yet §3.1 routed the agent to "the shared
open path" in a phrase that appears once in the whole design with no mechanism, and Annex F named
it nowhere. `get_close_readiness` and `verify_close` are likewise extracted and listed nowhere.
**Fold:** Annex F is **re-derived from the verb table**, not the narrative, and now carries
**nineteen** D1 rows across two windows (three in A, sixteen in B) plus an explicit
**read-extraction carve-out** (F.3) naming
`get_close_readiness`, `verify_close`, `list_fiscal_years` and `_adjustment_run_due_core` with the
read-only argument spelled out and a prestate pin + parity cell each. §3.11 says plainly that the
FY-open core is an **extraction**, and that the honesty label is passed **as an argument** so
neither entrance guesses.

**GM-2 · `wake_list_fiscal_years` mints a SECOND reader of the fiscal-year list.** *(CONFIRMED.)*
§3.1 routed it to `_close_reads_core (new)` — a phrase with no bytes citation anywhere in the four
files — while its two row-mates cite the live bodies they extract from. The live
`list_fiscal_years` (`0056:2665-2688`) carries `has_active_reopen_receipt` (`:2681-2682`) with its
stated reason (`:2678-2680`), which the new core would have to reproduce by hand. That is D-03's
own refusal, applied to reads. *(The verifier narrowed the harm honestly: `close_prep_due()` reads
`fiscal_years.status` directly, so a wrong field cannot cause an unauthorised close-begin — the
exposure is an audit-honesty read that drifts, which keeps this material rather than a blocker.)*
**Fold: `_list_fiscal_years_core`**, extracted like its siblings (**D-17**), and **new cell C-21**
proves all three read extractions byte-parity-equal, `has_active_reopen_receipt` named among the
compared keys — closing the same silence for readiness and verify, which no cell covered either.

**GM-3 · Rung B13 does not close F13's hole.** *(CONFIRMED; "if anything conservative".)*
`_fa_oldest_unmet_period` (`0041:1904-1958`) returns the **global** oldest unmet period (the loop at
`:1934-1943` keeps the minimum) — it is not FY-scoped. So once a period strands in FY2024, every
later year's freeze reads a `period_start` outside the FY and v1's "lies inside the FY" test passes
**forever**. Second, `{due:false,'period_draft_outstanding'}` (`:1918-1921`) is a *not-due* answer
that hides a standing draft which `_tf_period_wall` (`0056:643-696`) will refuse CLR19 forever once
the year freezes. Neither branch is undocumented, so the ARM-0 arm never fires.
**Fold (D-22):** B13 refuses on `due:true and period_end <= fy.ends_on` — *at or before*, never
"inside" — and reads the outstanding draft **directly**, with the oracle's own predicate copied
verbatim (`je.status='draft' and je.flags ? 'depreciation_charges'`) plus the date bound the oracle
lacks. **New cells C-20** cover the stranded-prior-year and outstanding-draft fixtures.

**GM-4 · The repaired gate's population is date-unbounded, and the catalog row it rides becomes
false.** *(CONFIRMED.)* Annex A.5's population 2 was client-scoped and unbounded in time by
construction. `measured_digest` is `md5` over the whole payload per check_key (`0056:1466`);
`finalize_close` re-evaluates every gate in-transaction and raises `close_attestation_stale` on any
drift (`:2083-2100`), and `get_close_readiness` uses the same equality (`:2645-2655`). So one newly
filed undated document *anywhere in the client's history* invalidates attestations a professional
signed about the **dated** set — a daily event once F-A7's filing lane runs. Separately, the
catalog row `('uncoded_documents', 2, 'No FY-dated filings without an entry', …)` (`0056:403`)
becomes false, and `t_close_gate_checks_append_only` (`:378-379`) makes it uncorrectable in place.
**Fold (D-18):** the undated population gets its **own drawer-2 catalog row** `undated_documents`,
its own evaluator `_close_gate_undated`, its own item branch and **its own digest**; the population
is bounded by the DB-owned `document_filings.filed_at` (`0007:68`) at or before `fy.ends_on`;
`_close_gate_uncoded`'s body is left **unchanged** (one CoR fewer). The residual — an undated
document filed after year end — is reported off-digest and put to the owner as **OQ-8**. Census
**C15** records the catalog moving 13 → 14; cell **A-11** proves digest independence in both
directions.

**GM-5 · `reopen_fiscal_year` computes `segregation_mode` in its own two-value body.**
*(CONFIRMED.)* `0085:344-345` (`v_self := v_checked is null or v_checked = c.actor;`
`v_mode := case when v_self then 'solo_self_attested' else 'two_person' end;`) inserts into the
identical `close_receipts.segregation_mode` column under the identical CHECK (`0056:1520`), and
`x85-b3-reopen-ends-on.test.mjs:430` asserts the receipt records the determination. v1 recut
`finalize_close` only, gave D1-2 "Fix A's mirror marking" alone, and the survey assigned the
duplicated vocabulary to F-A5 — so a reopen of a year Clara prepared would record `two_person`, in
the same PR that fixes that sentence next door. **Fold (D-19):** §3.9 gains change 4, D1 row
**B1-8** grows, the survey's F2 gains the `0085` site as **F-A4's** (§8's exclusion withdrawn), and
**cell A-10** exercises it. The CLR05 arms at `0085:328-340` — about the reversal act's signer —
**do not move**.

**GM-6 + GM-9 · Three verbs the sitting gave Clara are refused with no dissent recorded.**
*(Both lenses, independently, both CONFIRMED.)* ADR-0074's TA-P1 C text lists **"abandon and
re-freeze a close"** and **"snapshot mint"** among the acts passing to Clara
(`0074-the-track-a-sitting.md:31-33`); the contract restates it verbatim
(`wave-f-contract.md:154-156`); the ledger and the agenda agree (the orchestrator's
session-local PR-1 ledger, TA-P1;
`track-a-sitting-agenda.md:101-103`, C-column). v1 built the A-column shape — B6
`close_not_agent_run`, B7 `reopened_year_human_only`, D-08's exclusion of reopened years, and no
snapshot-mint verb at all — asserted it in §1 as "the ruled shape (fixed, not designable)", and
recorded **no dissent**, even though §4 escalates a comparable TA-P1-rider tension at OQ-5. The
rulings lens added the forward cost: F-A5/F-A6/F-A7 all bind under the same unqualified "TA-P1 C"
and would have no way to know a narrowing existed.
**Fold (D-20, D-21):** v2 **widens to the ruling and walls it** — B6 becomes
`close_run_attested` (no live attestation on the run), **B7 is WITHDRAWN with its number retired**,
new **B14** `reopen_correction_in_flight` bounds the re-freeze, D-08 is re-cut so the clock admits a
reopened year with no correction in flight, and **wrapper 13 `wake_mint_month_snapshot`** is built
over an extracted `_mint_month_snapshot_core` (`0057:780`). **The orchestrator's accounting dissent
is recorded, not acted on** (D-20), and the whole wall set goes to the owner as **OQ-7**, with the
request that his answer be written into the sitting ledger as a NAMED TA-P1 rider.

**GM-7 · Task #17 Fix A is claimed by two lanes with two batteries.** *(CONFIRMED.)*
`PROGRESS.md:113` and `:167-168` — the state authority — put Fix A in **Track B's** fix queue with a
**13-cell battery**, and `wave-f-contract.md` still lists it under F-T4, unstruck; meanwhile this
design folds it into F-A4's own migration (Annex F D1-1/D1-2) and compresses the battery to one
cell, C-10. No ruling anywhere adjudicates it — unlike the bank drawer-2 double-claim, which
ADR-0074's R-F cut explicitly.
**Fold (D-23): ONE owner, named — F-A4's PR-1b.** It holds the window on both writer bodies, so it
holds the fix; F-T4's fix queue **stands down**, and **Track B's thirteen cells ride F-A4 in full**
(Annex D.5): enumerated T1..T13 in the migration's battery file with their Track-B ids preserved,
each either carried or marked *subsumed by C-nn*, never dropped. **PR-4 trues `PROGRESS.md`'s
Track-B row and the contract's F-T4 row** — a docs obligation of this train, listed in §7 below.

**GM-8 · Annex C's `mint_wake_credential` disposition describes a body the design's own
prerequisite has already replaced.** *(Re-graded nit → MATERIAL by the verifier.)* Annex C and
design §3.3 both stated the live body "keeps its **three**-kind list"; F-A2's PR-1 — a **hard
prerequisite** named in §5 — CoRs `0011:1163` itself to a four-kind list plus a new arm
(`f-a2-annexes-1-estate.md:419`, D34; confirmed on the f-a2 PR-1 build branch). The survey's own census
C9 already said so and calls it a hard ordering dependency, so the design package contradicted
itself, with the wrong version stated twice and the right one never. A prestate pin copied from
Annex C would fail to apply (fail-closed, but an avoidable authoring trap on a fact already flagged).
**Fold:** Annex C's row and §3.3 are re-written to the **post-F-A2 four-kind** text, and the
prestate pin is pointed at it the way the sibling CHECK rows already were.

**GM-10 · The design undercounts its own pending constitutional prerequisites.** *(CONFIRMED.)*
The header claimed **two** amendments pending the owner's digest sign-off (TA-P1, TA-P7) and §5
named only TA-P1's re-sign as build-blocking; the sitting ledger's closing paragraph
(`pr1-ledger.md:185-191`) lists **four**, and item (iii) is **"law 21 narrowed to periodic POSTING
belts (TA-P5)"** — the exact ruling §3.3's clock, the item's headline mechanism, is built on. The
design states "law 21 (as narrowed by TA-P5)" as settled fact and never acknowledges the wording is
unsigned.
**Fold:** the header names **three** pending items relevant to F-A4 and says which are
load-bearing; §5's hard prerequisites add TA-P5's law-21 narrowing to the same digest re-sign, and
state that its *ruling* is final while its *digest wording* is not. Item (iv) (law 76, TA-P13) is
named out of scope.
**PREREQUISITE SATISFIED 2026-08-22:** the owner RATIFIED laws 78-81 plus the rider R-TA-P1-walls,
so the digest wording is signed and GM-10 is closed. The remaining hard prerequisite for F-A4's
PR-1 is unchanged and still open — **F-A2's PR-1 MERGED** (the post-F-A2 wake-kind text, C9).

**GM-11 (derived at fold, from GM-1's census re-derivation) · A new `agent_tasks.kind` is
unbornable and unexecutable on the CHECK alone — and the `wake` lifecycle cannot run a clocked
task.** v1's Annex C disposed of `agent_tasks.kind` (`0011:638-639`) with "extend". At the bytes
`_tf_agent_task_insert` dispatches on `kind` and ends `else raise 'unknown task kind %'` CLR10
(`0011:1241`), and `_tf_agent_task_update` ends `else false` (`:1277`) → CLR13 — so a CHECK-only
extension yields a kind that can neither be inserted nor transition. Worse, the `wake` arm forces
birth `held` (`:1230`) and permits only `held→cancelled` (`:1271`): **the estate has no execution
path for a clock-born wake task at all.**
**Fold (D-27, survey G4/C16):** both trigger bodies get a `close_prep` arm (D1 rows **B1-15/B1-16**)
on the **`autodraft` precedent** — born `queued`, `queued→running→completed/failed`. Design §3.3
states that **F-A4 mints the clock's execution path first and F-A3/F-A5 adopt this arm** rather than
each minting their own (TA-P11). **New cell C-23.**

---

## 4 · Nits — folded without argument

**GN-1 · Cite drift the v1.1 pass did not cover.** Annex H claimed every `file:line` "in all four
files" was resolved mechanically; the annexes were not. Corrected: Annex A.6's dispatch
`0056:1435-1450` → **`1434-1449`**, `v_state` `1451-1459` → **`1450-1457`**, the `begin` `1434` →
**`1433`**, the exception block `1460-1463` → **`1458-1462`**, the digest `:1465` → **`:1466`**;
design §3.5's in-body drawer-1 checks `0056:395-396` → **`396-397`** (`:395` is
`bank_recon_identity`, a different check); Annex A.3's B3 quote `0056:2073-2078` → the words are at
**`:2070`**; Annex I's abandon-reason cite `0056:1959-1962` → **`1958-1961`**; survey §4's
`clara_dev_jwt` seam `page.tsx:37` → **`:39`**. Annex H's coverage claim is narrowed to what the
pass actually covered.
**GN-2 · Survey §1.1 mis-recorded `propose_fiscal_year`'s grant** ("ungranted helper" against
`0056:1655`'s `grant execute … to clara_authenticated`) and its ctx resolver — corrected, together
with `snapshot_state`'s (GB-2). The grant matrix is the instrument F1 uses to sort bodies into
"re-grantable" and "must be a sibling"; a wrong cell there is how the wrong verb gets a one-line
grant.
**GN-3 · §1 stated TA-P1's rider as an absolute** ("never by rewriting a live human body") while
§3.1/D-01 apply a narrower reading the register itself calls "TA-P1's rider read maximally" as the
*foregone* alternative — and `attest_close_exception`'s signature change is a second, differently
reasoned exception (OQ-5). Re-worded in §1 to state the rider **as D-01 actually applies it**, with
the forward pointer, so a later Track-A author reading only §1 does not inherit a false absolute.

---

## 5 · The width ruling

**Both lenses read width, and they disagreed.** The rulings lens judged the single window
"correctly scoped and not artificially narrowed" — the bundling of Fix A, TA-P4's columns, TA-P6's
re-aim, the gate repair and the dry-run extraction into one ceremony with explicit internal
ordering matches the item-specific hazard. The bytes lens disagreed **on buildability grounds**,
and that is the ground that decides: v1's own R-1 already listed *"three live human bodies recut,
two body-moves, one evaluator extraction, one gate repair, four CHECK/ALTER extensions, three new
tables"*, and the re-derivation adds `open_fiscal_year` (a writer), `propose_fiscal_year`,
`mint_month_snapshot`, the two `agent_tasks` triggers and the readiness/verify extractions —
**nine-plus live bodies in one quiesce window on the estate's most consequential verb family.**

**RULED: PR-1 is SEVERED** (design §5, **D-24**, Annex F):

1. **Window A — the measurement layer** (PR-1a): `_measure_one_gate`'s extraction,
   `_evaluate_one_gate`'s recut, the new `undated_documents` catalog row and evaluator,
   `_gate_outstanding_items`' new branch. It touches **no wake surface, no receipt table, no wake
   kind**. v1 declined this severance for "a second review of the same `_gate_outstanding_items`
   surface" — but that body is read by `finalize_close` **and** `get_close_readiness`, so it is in
   the finalize window either way; the saving was one review of one small SQL body, against a
   mid-window failure stranding a live close estate.
2. **Window B — the close-lifecycle writers** (PR-1b): the ALTERs, then `finalize_close` (Fix A +
   TA-P6), `reopen_fiscal_year` (Fix A's mirror + TA-P6), `attest_close_exception`, the
   begin/abandon body-moves at the entrance seam, the FY-open chain, the snapshot-mint extraction,
   and the two `agent_tasks` trigger arms.
3. **Everything additive needs no window at all** (PR-1c): the thirteen wrappers, the agent cores,
   the three new tables, the two new evaluators, both F14 siblings, and — if OQ-9 rules (a) —
   `_adjustment_run_due_core`. The read extractions ride here too, under F.3's stated carve-out.

**Both windows run from merged `main`** under the standing runbook hazards. Whatever else changes,
**the D1 list is re-derived from the verb table before either window is scheduled** — the three
missing rows were the argument for narrowing, not a detail to fix inside it.

---

## 6 · Owner items

The build proceeds on each fail-closed default; none of these blocks PR-0's closure, and each needs
the owner's word before the PR that depends on it merges.

| # | the question, in one line | the fail-closed default the design proceeds on | needed before |
|---|---|---|---|
| **OQ-7** | Does TA-P1 C's open register mean what its text says for abandon-any-run, re-freeze and snapshot mint — and should the wall set (B6 · B14 · the entrance seam) be recorded as a **named TA-P1 rider in the sitting ledger**, so F-A5/F-A6/F-A7 inherit one scope? | **the walled-wide shape ships.** Narrowing back to v1's behaviour would refuse verbs the register gave her, which a design lane may not do unilaterally — the orchestrator's accounting dissent is on file at D-20 instead | PR-1b (B6/B14 are in the cores) and the digest re-sign |
| **OQ-8** | An undated document filed **after** the year end: in the gate (and churning signed attestations across years), or off-digest on the plan? | **off-digest** — a plan count plus OQ-6's typed question; the gate's population stays bounded at `filed_at <= fy.ends_on` | PR-1a (the evaluator's predicate) |
| **OQ-9** | B13's ADJ oracle admission (GB-1): (a) an additive ungranted core below `0045:5525`; (b) a second F-A4-written "due" predicate; (c) belt-recorded probes with a freshness bound | **the freeze REFUSES** — an inevaluable probe counts as DUE (`belt_period_unrun` / `adj_oracle_inevaluable`), never clear, never a raise. Every clocked close on a client with a live adjustment template refuses until ruled | PR-1c (the core) / PR-2 (the workflow's chase) |
| **carried** | OQ-1 cadence · OQ-2 label priority · OQ-3 drawer · OQ-4 prepayment term · OQ-5 recutting `attest_close_exception` · OQ-6 a period due after a lawful close | unchanged from v1.1; grounds in Annex G.2 | as before |

**Orchestrator rulings 2026-08-22 (R-L12 / R-L13 / R-L11) — OQ-7, OQ-8 and OQ-9 are RULED under
the owner's standing delegation (mechanism and sequencing only; no law touched). Each item's text
above stands as written; these are the dispositions.**

- **OQ-7 → R-L12: the walled-wide shape SHIPS**, and the wall set **B6 `close_run_attested` · B14
  `reopen_correction_in_flight` · the §3.1 entrance seam (cut below the capability gate)** is
  adopted as a NAMED TA-P1 rider, **"R-TA-P1-walls"**, which F-A5/F-A6/F-A7 inherit as ONE scope.
  The orchestrator's accounting dissent at D-20 is **DISCHARGED by B6 itself**: a run carrying a
  live attestation cannot be abandoned by anyone but its attester's door, so a stranger's signed
  drawer-2 attestations are never voided by Clara. The owner meets the rider as minuted wording at
  the TA-P1 digest sign-off, not as a new question.
- **OQ-8 → R-L13: off-digest** — a plan-level count plus OQ-6's typed question to the professional;
  the gate population stays bounded by `filed_at <= fy.ends_on` (D-18). Grounds: a re-attestation
  storm teaches re-signing without reading, which is the worse accounting outcome, and the typed
  question keeps a human on the one document that might belong to the closed year.
- **OQ-9 → R-L11: option (a)** — an ADDITIVE ungranted `_adjustment_run_due_core` extracted BELOW
  `_assert_due_read_ctx` (`0045:5525`); the live oracle keeps its admission, and the binding
  constraint is D-26's *"no change to what the oracles ANSWER"*, not *"no edit to 0041/0045"*.
  Grounds: TA-P11 one-architecture rules out (b) (two readings of one fact), and (c) moves the
  measurement out of the freezing transaction. **The fail-closed default (inevaluable = DUE) stays
  as the runtime behaviour until (a) lands.** This DISCHARGES the cross-item obligation F-A5 and
  F-A6 recorded as *"must be explicitly reversed in F-A4 §7/D-14"* — satisfied by D-26 as written.

**Also for the owner's eye, not a question:** the three digest items F-A4 is written under
(TA-P1 · TA-P5's law-21 narrowing · TA-P7) — GM-10 showed the design had counted two.

---

## 7 · Cross-item sequencing obligations

Stated here because they bind more than one item and no single item's design can settle them alone.

1. **The B13 oracle admission is F-A4's to fix but the reversal is the owner's** (GB-1 / OQ-9 /
   D-26). §7's non-goal and D-14 are now narrowed in writing; if the owner prefers (b) or (c), §3.6
   and Annex A.3's arm 3 change, not the non-goal.
2. **Task #17 Fix A has ONE owner: F-A4's PR-1b finalize/reopen window; Track B's 13-cell battery
   rides it** (GM-7 / D-23). `PROGRESS.md`'s Track-B row and `wave-f-contract.md`'s F-T4 fix queue
   must be trued in PR-4 — until they are, the state authority and this design disagree.
3. **The clock's execution path is shared with F-A3 and F-A5** (GM-11 / D-27). A `kind='wake'`
   `agent_task` is born `held` (`0011:1230`) with `held→cancelled` its only transition (`:1271`) —
   nothing executes it. F-A4 mints the `close_prep` arm on the `autodraft` lifecycle; **F-A3 and
   F-A5 adopt that arm rather than each minting their own** (TA-P11).

   **SUPERSEDED 2026-08-25 by gate G1's owner ruling** (`bank-agency-gate-record.md §6 item 1`,
   design of record `g1-wake-engine-design.md`): F-A3 and F-A5 do **NOT** adopt the `close_prep`
   arm — they ride `kind='wake'` through a new shared consumer/settlement path instead, per
   mechanism (b), ruled over mechanism (a) (which this obligation's own recommendation was, argued
   before G1 existed to weigh it against the alternative — the honest tension is recorded in
   `g1-wake-engine-survey.md §6`, not hidden). **`close_prep`'s own shape is unaffected** — this
   item's `0120` build stands exactly as shipped, byte-unchanged; it is GRANDFATHERED as a second,
   closed-world carrier shape inside the G1 engine, one of the four sources that engine names as
   served, never retrofitted onto `kind='wake'`. F-A4's own remaining obligation (`close_prep_due`,
   `close_prep_holds`, `closePrep.v1`) is unchanged by this — only WHICH RUNTIME CONSUMER claims and
   dispatches the resulting tasks moves, from a bespoke seventh leader belt to a registry row in the
   G1 engine (`g1-wake-engine-design.md §5`).
4. **chatTurn `_vN` chains are claimed by F-A2's PR-2 first.** F-A4's directed close ask (§3.4's
   "a human asks in chat") needs a chat tool, so it queues behind F-A2's runtime PR — named in §5's
   prerequisite (iii). Never a second live `chatTurn` chain.
5. **`wake_credentials`' CHECK pairs are extend-only after D34.** F-A4 authors against the
   **post-F-A2** four-kind text and pins it (GM-8); F-A5/F-A6 do the same, each adding a row and
   leaving every existing one byte-identical in meaning.
6. **F-A5's evaluate leg must name a lawful entrypoint** — an agent orchestrator calling the same
   **frozen** `evaluate_metric_v1` under the OBO closure, not a second evaluator. Recorded here
   because F-A5's window and F-A4's share the wave: **the eta is honestly unknown** until F-A5's own
   gate rules on it, and F-A4 depends on none of it.
7. **F-A6's receipt must not be FORGEABLE by the payload, and the read role's privilege set over
   every other table does not move.** *(Orchestrator ruling 2026-08-22 (R-L16): this obligation was
   originally written as "F-A6's receipt writers must NOT be granted to the read role" — a shape
   F-A6 cannot meet, because its SQL must execute as `clara_freeform_ro` under SECURITY INVOKER.
   The obligation is re-worded here to its ruled INTENT; the alternative — a DEFINER outer wrapper
   with `SET LOCAL ROLE` — was REJECTED, since a payload escaping the role switch would run as
   `clara_fn_owner`, a worse failure class than a forged receipt.)* TA-P4's "no receipt, no read"
   is satisfied on F-A6's side by the **one-arm/one-settle** shape (no read-id argument; any second
   call aborts the transaction; a settle-once trigger plus a deferred must-settle trigger, so a read
   with no settled receipt cannot COMMIT), proven by three battery cells. F-A4's own carrier is
   unchanged: `agent_act_receipts` keeps its separate ungranted DEFINER path and zero DML grant to
   every role (Annex E.3). D-05's "one carrier, one architecture" stands — the two items share the
   discipline, not the grant topology.

---

## 8 · Refuted register — recorded so nobody re-raises them

**GR-1 · "Deterministic op keys plus `_reserve_op` make every read and every Tier-B refusal
sticky."** *(Raised material, REFUTED, re-graded nit.)* The claim was that a released hold or a
post-remediation dry run would replay a stale `_reserve_op` outcome. It fails against the design's
own explicit text: **"Every rung is EVALUATED on every call"** is stated as law in §3.2 and repeated
verbatim in Annex A.3 for the exact rungs named (B1, B3, B12) — F-A2's already-battery-proven shape,
not a new promise. B3/B12 are measured **fresh, in-transaction, from the shared core**, not read
back from a cached receipt; `_reserve_op`'s key includes `fn`, so a read wrapper's entry cannot leak
into a different wrapper's core. And cells **B-4** and **C-16** are precisely the planned
must-pass tests for hold-release and catch-up-clears. **The residual, folded as D-25:** §3.1 said
"deterministic" without stating the derivation — now `sha256(wake_task_id ‖ verb ‖ subject_id)`,
re-computed and checked by the wrapper, with cell **B-11** proving replay-within-task and
re-measure-across-tasks.

**GR-2 · "`via_wake_kind` is still NULL on the agent's audit row, against the contract's own
words."** *(Raised material, REFUTED, re-graded nit.)* The underlying fact is true and **already
carried, three times**: it is survey finding **F6**; the design's own §2 row states the disposition
("two new carriers"); and **Annex E.3** gives the reasoned refusal to widen `audit_log` — no
model/version/rationale column, an `outcome` CHECK admitting only `'ok'` (`0002:285`) so a REFUSED
act cannot be recorded there at all, and the widest possible blast radius for the narrowest gain.
Cell C-12 was also mischaracterised: it scopes byte-equivalence to a **human** fixture close and
pins nothing about the agent path. The contract's *"`via_wake_kind` stops being NULL"* is discharged
on TA-P4's carrier, `agent_act_receipts`, where the column is NOT NULL. **The residual, folded:**
§3.8 now says so inline — both entrances, deliberately — so no reader must assemble it from three
places.

---

## 9 · What the rig replay must confirm (this gate's own predictions)

Everything below was read from migration source and is a **prediction about the live catalog** until
a rig replay says otherwise. Each names the instrument.

1. **`_assert_due_read_ctx` refuses a real wake session** — call `clara.adjustment_run_due(client)`
   through `clara_wake_write_login` → `clara_wake_interactive` and read the SQLSTATE (expect CLR03);
   the twin call to `depreciation_run_due` answers. **Cell C-19**; the whole of GB-1 rests on it.
2. **The live tips are the tips** — `to_regprocedure` + `prosrc` on all nineteen D1 objects
   immediately before each window, matched against the prestate pins. The lineage sweep found no
   later CoR, but a sweep of migration text is not a read of the catalog.
3. **The entrance seam's premise** — `_has_capability(firm, clara.agent_user_id(),
   'close_and_attest')` is false on every seeded firm, and no `firm_capability_grants` row names the
   agent uuid. **Cell A-9** and GB-3 both depend on it.
4. **The catalog is thirteen rows before window A and fourteen after**, and every pre-existing
   `measured_digest` is byte-identical across the `_measure_one_gate` extraction (**A-3**, re-cut so
   the new key is an addition, not a vacuous fourteen-equals-fourteen).
5. **P2, unchanged and now sharper** — the count of live filings whose document has NULL
   `financial_date` **and** `filed_at <= fy.ends_on`, per client, on live books: the population the
   new gate flips red. Published in §6's acceptance numbers.
6. **The clocked task actually runs** — a `kind='close_prep'` row is born `queued` and reaches
   `completed`, while a `kind='wake'` row on the same rig still refuses anything but
   `held→cancelled` (**C-23**). This is the one prediction that decides whether the clock exists.
7. **The read extractions are parity-equal** including `has_active_reopen_receipt` (**C-21**), and
   the FY-open chain stamps `asserted_by_file` on the agent path while the human path is unmoved
   (**C-22**).
