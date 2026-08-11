# Wave E — THE ACCEPTANCE MATRICES (minted BEFORE the build) — PART 2

> **CONTINUES `wave-e-acceptance-matrix.md`** (Sections 0–5: how to read a cell, Sections A–E).
> Split at a section boundary (the `wave-e-design-skeleton.md`/`-part2.md` banner pattern) when the
> lane-γ R1 fix-batch amendment (2026-08-11) pushed the first file past the repo's 500-line
> discipline — the split the header there always said would come. This file carries **Section F**
> (the E-R12 client-facts trio, lane α) and its ratification record, then **Sections 7–10**
> (coverage sweeps, run order, the closing-verification template, and what this matrix does not
> claim) — all of which index or govern cells across EVERY section, not only F, so their physical
> placement here is a file-size accident, never a scope boundary. **Where this document and
> `docs/plan/active/wave-e-contract.md` disagree, the contract wins**, exactly as part 1 states.

---

## 6. Section F — THE E-R12 CLIENT-FACTS TRIO

Lane **α**, the first strike of the campaign. **Design home: `wave-e-design-skeleton-part4.md` §3** —
§3.1 (F-1 verify-first + the `apply_open_items` guard), §3.2 (`entity_type` + MSIC, the one capture
door and the facts table), §3.3 (the context-pack splice). This section is the one where the ADR-066
lesson bites hardest: **F-1's wall already exists in the schema**, so a battery that only proves it
refuses would prove nothing new.

| # | ruling | precondition | action | exact assertion | negative case | lane | verifier |
|---|---|---|---|---|---|---|---|
| **F1a** | **THE VERIFY-FIRST CELL** · E-R12 item 1 | before writing any code | prove the wall's IDENTITY, not its spelling | `pg_get_functiondef` on the LIVE `clara.allocate_receipt` / `clara.allocate_payment` (thin wrappers, `0044_wave_d_b3_af2_composite.sql:1642-1657` / `:1659-1674`) resolves to the `_core` bodies at `0044:1034` / `0044:1353`, and those bodies contain the unborn-item wall at **`0044:1266-1272`** (receipt) and **`0044:1557-1563`** (payment) | reading a matching STRING in a migration file and calling the wall live is exactly the "spelling is not identity" failure — a FAIL of method even if the conclusion is right | α | V-DB |
| **F1b** | **RIGHT ANSWER** · E-R12 item 1 | a legitimate advance/deposit scenario: money received BEFORE the bill exists | book the money as an advance, then `apply_open_items` once the item exists | the money **POSTS**; the open item settles; AR/aging ties at every as-of in cents. The sanctioned remedy the refusal message itself names must work | if the only proven behaviour is refusal, the guard is a brick: money-before-bill economics is served by the advances machinery, and this cell is what proves it | α | V-DB |
| **F1c** | E-R12 item 1 refusal | an open item dated later than the settlement | call `allocate_receipt` / `allocate_payment` with `p_posting_date < i.item_date` | **`errcode='CLR10'`**, `detail->>'reason' = 'allocation_to_unborn_item'`, carrying `item_id`, `item_date`, `posting_date` — quoted verbatim from the live raise at `0044:1266-1272`; **no override argument exists** (WD-R13 ruled no-override; asserted against the function's argument list, not its comments) | an override flag appearing anywhere on this path is a FAIL of the ruling | α | V-CI |
| **F1d** | E-R12 item 1 scope | RECORD CELL — F1a, F1b, F1c, F1e and F1f are SEEN | record | the record states what F-1 actually required: **ratify-plus-regression on the `allocate_*` wall, PLUS one new guard on the apply path** (F1e). The `allocate_*` wall is live and carried byte-for-byte into 0044; **if a second, duplicate wall is written there, the record must say why** | writing a duplicate wall without stating the reason is a FAIL of the record; so is recording F-1 as "no new code" now that F1e exists | α | V-OWNER |
| **F1e** | E-R12 item 1 — **the apply-path guard** (both round-1 reviews converged; **DECIDED — orchestrator R18**) | RPR-shaped fixture: a post-dated source item (credit note dated in the future) and a historical target invoice | `clara.apply_open_items` pairing them | **REFUSED** — the guard is `clara._book_today() < greatest(si.item_date, ti.item_date)` → raise in the standing shape (token spelling per §0.4). The defect it closes is read, not argued: the live body stamps both legs `clara._book_today()` (`0042:4896-4903`) but performs **no date test** against either item; aging admits items at `item_date <= p_as_of` (`0040:3946`) while allocations enter at `effective_date <= p_as_of` (`0040:3207`), so between the act date and the source's `item_date` the target carries its allocation while the source is invisible — Σ aging buckets ≠ the unmoved control account | the live comment at `0044:1265` says `apply_open_items` "is act-dated and structurally immune to this defect": act-dating is PROVEN (the producer law, `0040:789-811`; the column added `0040:813`), but immunity is CONDITIONAL on the act date being ≥ both item dates, and a repo scan for a future-posting-date guard returns nothing. Shipping the comment as the mechanism is a FAIL — a comment is not a mechanism | α | V-DB |
| **F1f** | **RIGHT ANSWER** · E-R12 item 1 | both items dated on or before today | `clara.apply_open_items` on a same-day pair, and on a historical pair | both **SUCCEED**; the allocation pair is written with one `effective_date`, and the AR aging vs control tie holds in cents at as-of = the act date and at as-of = a later date | a guard that refuses the ordinary same-day application would break the very remedy F1b's refusal message names — the wall would become a brick, and F1e without F1f is an unproven wall | α | V-DB |
| **F2a** | **RIGHT ANSWER** · E-R12 item 2 | BEE (sole prop) and RPR (Sdn Bhd) | call `clara.get_context_pack(client_id, purpose)` and **read the returned PACK** | the pack's `client` object carries `entity_type` with the correct value per client (`sole_prop` for BEE, `sdn_bhd` for RPR — both members of `ENTITY_TYPES_V2`, `packages/runtime/workflows/interview.v2.frameworks.ts:50-52`). **The assertion is on the pack JSON, not on the migration source** | asserting the splice landed by grepping the migration is derived-state-as-evidence and a FAIL of method | α | V-DB |
| **F2b** | E-R12 item 2 (the BEE lesson made structural) | F2a green | drive a coding/drafting prompt for BEE | the sole-prop signal reaches the model surface; a proprietor-draw draft codes to **EQUITY**, never to a staff advance and never to a counterparty | a proprietor draw coded as an employee advance is the exact WC-R10 defect this ruling exists to prevent | α,η | V-RT |
| **F2c** | patch-not-rebuild law | before the splice | harvest | the `entity_type` splice is applied against the **LIVE** `get_context_pack` body (harvested via `pg_get_functiondef`). Its current change-of-record is the msic-augmented client object **CONSTRUCTED** at `0036_wave_c0_deferred_belts.sql:1559-1566` (a concatenated literal assembled into `v_next`, not a single string) — **not** `v_anchor` as declared at `0036:1554`, which is the PRE-0036 anchor and appears ZERO times in the live body after the splice. A builder who counts `v_anchor` finds nothing and must not conclude the splice is absent | a from-file rebuild silently reverts the 0017/0018/0019/0036 splices — a quiet, total regression and a hard FAIL; counting the wrong literal is a FAIL of method | α | V-DB |
| **F3a** | E-R12 item 3 | MSIC door built; RPR active | enter **68109** through the door, then **replay the identical call with the same `op_key`** | the fact is readable on RPR; the receipt carries **who** (actor id), **basis** (the owner's instruction/evidence), **when** (timestamp); the act appears in `clara.audit_log` (`0002_foundation.sql:276-288`; `outcome` is CHECKed to `'ok'` at `:285` — committed successes only). **The replay returns the STORED result from `clara.op_receipts` (`0002:295-303`) and mints NO second fact row, NO second audit_log row, NO second event** — asserted by counting all three before and after | a code written with no basis captured is a FAIL — who/when alone is not the ruled trio. A replay that writes a second fact, or that returns a fresh unrecorded result, is a FAIL of idempotency | α | V-DB |
| **F3b** | E-R12 item 3 | RS active | enter **82110**, then replay under the same `op_key` | as F3a | as F3a | α | V-DB |
| **F3c** | E-R12 item 3 | BEE active | enter **74101**, then replay under the same `op_key` | as F3a | as F3a | α | V-DB |
| **F3d** | E-R12 item 3 / ADR-062 | after F3a-c | attempt the OLD path | `clara.commit_client_onboarding` still refuses an active client — **`CLR10` `'client onboarding is not open'`** (`0017_wave_b.sql:2777-2778`). The new door is a NEW door, not a reopening of the interview commit | a door that reopens onboarding for an active client is a FAIL: it would let any committed fact be silently re-answered | α | V-CI |
| **F3e** | E-R4 / Law 2 | RECORD CELL — F3a, F3b and F3c are SEEN | validate | the door does **not** validate against an official MSIC registry, because **no `clara.msic_codes` reference table exists** — a scan of migrations 0001–0054 finds `msic` only as an interview item key and as the 0036 context-pack splice (`0036:1550`, `:1561`, `:1565`) — the record states this as a measured absence and names basis-capture as the compensating control | claiming the codes were "validated" when only their format was checked is a FAIL of the record | α | V-OWNER |
| **F3f** | Appendix A finding 1 (the arg-tuple half of idempotency) | F3a SEEN | replay the door with the **same `op_key` and DIFFERENT arguments** | the call is **REFUSED** (a `CLR10`-class refusal), not silently answered from the stored receipt — asserted as BEHAVIOUR. The intent is documented at `0002:292-294` (*"request_hash pins the arg tuple so op_key reuse with DIFFERENT args is rejected (CLR10) rather than silently returning a stale receipt"*), and this cell proves the mechanism rather than quoting the comment | returning the stored result for a different arg tuple would let one op_key launder a second, unrelated fact into the book — a FAIL; and a comment standing in for the proof is a FAIL of method | α | V-CI |
| **F4** | E-R12 item 3 + E-R3 immutability discipline (supersession, never mutation) | a client fact already entered through the door (e.g. RPR's `68109`) | enter a CORRECTED value through the same audited door | the new fact SUPERSEDES the old: the prior row remains readable with its original who/basis/when, the new row carries its own trio plus an explicit supersession link, and the read surface returns the CURRENT fact exactly once (no duplicate, no silent overwrite). Asserted by reading both rows and the reader's single answer | an in-place UPDATE of a client fact destroys the basis the ruling exists to capture — a FAIL; a reader that returns both the superseded and the current fact as equals is a FAIL of the surface | α | V-DB |

### 6.1 F-1 RATIFICATION RECORD (skeleton §3.1's required record — written at the lane α build, 2026-08-11)

**E-R12 item 1 was discharged by VERIFICATION PLUS ONE GUARD, not by a rebuild.** The record,
so no future session re-builds the wall:

- **The wall exists and is the live mechanism.** The unborn-item predicate lives in
  `clara._allocate_receipt_core` / `clara._allocate_payment_core`, byte-identical
  (`0044_wave_d_b3_af2_composite.sql:1266-1272` / `:1557-1563`); the public wrappers are thin
  delegators (`0044:1642-1657` / `:1659-1674`) and do not re-spell it. **No second wall was
  written on the allocate path — deliberately**: the wall is inherited by every caller through
  the cores, and a duplicate spelling is exactly the F1d FAIL this record exists to prevent.
- **The caller census was measured from the live catalog** (pg_proc.prosrc, 2026-08-11, rig at
  frontier 0054): exactly **{`_settle_from_bank_line_core`, `allocate_payment`,
  `allocate_receipt`}**. The lane α migration pins this set and `open_items.item_date NOT NULL`
  (`0037:738`) as EXECUTABLE build-time assertions (its S1), so every fresh apply — including
  CI's — re-proves the wall's identity, the wrappers' thinness, the census, and the column
  floor from then on. A fourth caller or a relaxed column is a loud migration failure, not a
  silent opening.
- **The ONE genuinely open hole was the apply path, and it is now guarded** (its S2): the live
  `apply_open_items` is act-dated (`0040` S4.9 → `0042` S5.22; producer law `0040:864-877`) but
  no conjunct enforced act-date ≥ both items' `item_date`. The guard refuses
  `clara._book_today() < greatest(si.item_date, ti.item_date)` with `CLR10` /
  `'apply_before_item_date'`, strict boundary (same-day passes, F1f). It is NOT the R9
  `greatest()` guard — R9's hazard is a negation row sorting before the allocation it negates
  (`0040:6162-6169`); this one is an item not yet born at the act date.
- **RPR's two documented scars** (as-of 2025-08-31 / 2025-09-30, self-healing at as-of ≥
  2026-08-01) are stored data predating the wall (`0041`), not a live gap — the wall operates
  at call time and never retro-touches rows. Section D's D2a precondition still measures them
  at run time before any RPR close.
- **As-run quotes** belong to the lane α as-run acceptance record, not this matrix: the
  F1a–F1f battery outputs and the field read, AND the live-corpus halves the rig cannot
  discharge — F2a on the REAL BEE/RPR packs, F3a–F3c's three parked codes entered on the REAL
  RPR/RS/BEE through the door, and F4's supersession read on whichever real fact first needs
  correcting. The rig proves shape on synthetic clients; the named clients close at the
  ceremony. F1d and F3e close there too, V-OWNER.

---

## 7. Coverage sweeps

### 7.1 The eight mandatory coverage dimensions — sweep index (rebuilt from cell TEXT)

E-R9's closing sentence lists eight dimensions that must be swept **across** the corpus rows, not
treated as a ninth machine. Each cell below was re-read and listed only where its own assertion
text carries the dimension — the first mint's index credited two dimensions with cells borrowed
from another. Each dimension must close with at least one **SEEN** cell.

| # | dimension | cells (each verified to assert it in its own text) |
|---|---|---|
| **D1** | role / RLS boundaries | A6e (the definer read SEES FY rows — the owner-policy prerequisite), A9 (`has_function_privilege` sweep + live `42501`), A10, A11, A12, A18, A27 (definer/invoker + client-in-firm), A28 (keys ②③ separately grantable), A29 (zero granted writers on curated tables), A34 (the agent's catalog SELECT, per table), F3d |
| **D2** | concurrency | A13 (two `begin_close`, the loser's WAIT observed, ONE `in_progress` run), A13b (finalize-vs-finalize → ONE receipt), A13c (the reopen's `row → 004 → 007` acquisition order, read from the body and probed both ways), A13d (close-vs-**gate-evidence**: allocations, statements, exceptions, FA), A19b (close-vs-**post**, both directions), A33 (leader dispatch: claim-once, at-least-once idempotent), E2/E2b/E7 (same-transaction staleness identity) |
| **D3** | idempotency | A14 (close replay), A33 (duplicate dispatch → one artifact under `x-upsert:false`), F3a/F3b/F3c (door replay under the same `op_key`, three counts before/after), F3f (same key, different args → refused) |
| **D4** | evaluator edge policies | A15 (the five named policies), A30a (type/scope rejection), A30b (definition-static vs evaluation-time cost + `account_set_drift`), A31 (provenance completeness), A16, B3, D1, E1b (`$P-1` missing prior → `absent`), E6 |
| **D5** | number-injection attempts | A7 (narration placeholders), A8 (inline chart values), A32a (ad-hoc axis bounds), A32b (same-source table), B3, D1, E1b (a plausible figure against the wrong comparative is a number-injection outcome without an injector) |
| **D6** | reopen ordering | A5 (the ordering guard), A5b (the reopen's REQUIRED effect order, proven by the wall's refusal of the reversed order), A13c (reopen contention is retryable, not a deadlock), A19a (a post/reverse into a closed FY refuses), A22 (`abandon_close` returns the FY to `open` and disarms the wall) |
| **D7** | guard activation (E-R6) | A6a (fires on a closed period), A6b (open periods still work), A6c (unknown entry fails closed), A6d (the three-reader roster + the honest twin), A6e (the RLS prerequisite that makes all four meaningful) |
| **D8** | byte-reproduction of sealed artifacts | A17, D4, E3 |

**Continuity (E-R2 drawer 1) is swept by A19f/A19g**, which are listed under no single dimension
above because they are the identity itself rather than a property of it: the pin lands at close(n)
(A19f), the tie fires absolutely at the earliest successor event (A19g), and neither has an
attestation path in any drawer.

A dimension whose only cells are refusals is flagged in the as-run record and re-asked with a
right-answer cell before the section closes.

### 7.2 Ruling-disposition rows (no ruling leaves this matrix silent)

Three rulings carry no execution cell. Their disposition is stated here rather than inferred from
absence — the same discipline §0.2 applies to evidence.

| ruling | disposition | where it is discharged |
|---|---|---|
| **E-R1 first strike** (`wave-e-contract.md:21-24`) | **EXTERNALLY DISCHARGED — no cell in this matrix.** The F6–F9 fix batch closed at ADR-066 with its own as-run record; re-asserting it here would inherit a discharge instead of measuring one | `docs/plan/completed/wave-e-f6f9-acceptance.md` (and the ADR). Note the record's own boundary: it does **not** state that F6 unblocked Gate P |
| **E-R10 UX debt** (`wave-e-contract.md:213-222`) | **NON-BUILD RULING — no execution cell.** All of it ships in Wave G; lane θ builds plumbing-grade surfaces only, and this matrix asserts no UX behaviour. A cell here would grade something Wave E is ruled not to build | Wave G's own acceptance. The lane-θ surfaces are covered only where a cell needs them as a READ (A4's readiness read) |
| **E-R13 settlement-corroboration door** (`wave-e-contract.md:256-285`) | **DESIGN-ONLY IN E — no execution cell, and none may be added.** The build rides Wave F, and until that ADR lands 7A-R3 stands whole: no tax-silent document posts unattended | Wave F's build ADR + acceptance. If any Wave-E lane finds itself needing a corroboration cell, that is scope leak — stop and escalate |

---

## 8. Run order (E-R7 / E-R9 — dependency, not slicing) — **the canonical order, stated once**

E-R7's one stated dependency is binding: **statements cannot be accepted before a close model
exists.** The canonical acceptance order is **F → A → B → C → D → E**; E-R9's corpus table names
the CORPUS, not the run sequence, and where any sibling document states an order this section
governs. Everything beyond the stated dependency is **(builder choice)** and may be re-sequenced
without reopening a ruling.

1. **Section F (lane α)** — the trio is independent of the close model and may ride early. F1e's
   guard is a lane-α build item, not a test-only cell.
2. **Section A (β, then γ/δ/ε/ζ cells as their lanes land)** — the sandbox battery. A6a–A6e
   cannot run before β births the period model (and **A6e runs FIRST among them**: if the owner
   policy on `fiscal_years` is missing, A6a–A6d can all read green against a totally fail-open
   guard). A13–A13d and A19a–A19e wait on the wall; **A19f/A19g need two consecutive FYs, so they
   are sequenced last inside Section A**; A15/A16/A30/A31 and E1b wait on δ; A32a/A32b, A17, A33
   and A34 wait on ε/ζ.
3. **Section B (β + δ/ε)** — the goods-trader fixture.
4. **Section C (β)** — BEE FY2025, the first REAL close. Runs only after Section A's close/reopen
   cells are SEEN in the sandbox.
5. **Section D (δ, ε, ζ)** — the RPR MPERS pack. **D2 and D2a run FIRST and gate the rest of the
   section**: if the candidate FY's `ends_on` sits inside the scar window, remediation precedes
   the close. D5's wording-content cells are **NOT CAPTURED** until task #43 clears; D1 does not
   depend on it.
6. **Section E (γ)** — the RS snapshot/staleness witness.

**Gate between 2 and 4:** no real-client close is attempted until the sandbox has SEEN close,
reopen, **all five guard-activation cells (A6a–A6e)**, the wall battery (A19a–A19e) **and the
gate-evidence serialization cell (A13d)**. The sandbox is fully controllable; BELCORT's books are
not — and A13d is on this gate specifically because a gate input that moves under a live close
produces a receipt describing a state that never existed, which is unrecoverable on real books and
trivially reproducible on synthetic ones.

---

## 9. Closing-Verification-Block — the template every acceptance session ends with

Copy verbatim into each as-run record; fill only with what a read SAW.

```
CLOSING VERIFICATION — <section> · <UTC timestamp> · <lane> · <model override>

1. TB TO THE SEN        <client>: debits <n>¢ = credits <n>¢, difference 0
                        (both sides read directly; NOT one derived from the other)
2. STRANDED COUNT       <query> -> 0 rows  (a POSITIVE read of zero, quoted with its query;
                        an empty result set is only evidence when the query is shown)
3. PROTECTED WITNESSES  canary daba7f2e   -> UNANSWERED (read again, still untouched)
                        b2 witness d023b48c -> status 'draft' (read again, unmoved)
                        RS registrations -> 0 across <n> customers (n re-measured today)
4. CROSS-FIRM ISOLATION zero writes outside firm <id>, asserted by firm id
5. COUNTS RE-MEASURED   every count in this record was measured today; none inherited
6. REFUSAL HEADS        <token>: <n> ; any head at 0 is listed here as an OPEN QUESTION,
                        never as a witnessed wall
7. GATE CATCHES         every verify-before-approve stop, with what it prevented
8. VOCABULARY           each claim tagged SEEN / NOT SEEN (reason) / NOT REACHABLE /
                        NOT CAPTURED / NOT PROVEN
9. SUPAVISOR            <n>/60, runtime pool <n>   (headroom re-checked before any deploy)
```

---

## 10. What this matrix does NOT claim

1. **Nothing here has run.** Every cell is a question minted before the build; not one is
   evidence. The as-run records are separate files.
2. **The sandbox battery, the goods-trader fixture, the close model, the closed-period wall, the
   period registry, the algebra evaluator, the FS template layers, the render worker and the MSIC
   door do not exist on disk.** Cells that assert their behaviour assert an OUTCOME the build must
   produce, not a mechanism this document has read. Where a cell names a live object it carries
   that object's file:line, re-read on 2026-08-09.
3. **Two owner gates block content cells, not structure cells:** task #43 (MASB golden-wording
   manual pull + HUMAN verify — D5) and task #44 (sole-prop positive primary check — C5). Both
   are **NOT CAPTURED**, not "absent therefore free to invent".
4. **Proposed refusal-token spellings and `CLRnn` codes in §0.4 are (builder choice)** and bind
   nothing; the as-run record quotes whatever the shipped code actually raises, verbatim. The same
   holds for the advisory namespace `203005007` and every migration number.
5. **The lane→cell assignments and the verifier roster are (builder choice)**; the independence
   law behind them (ADR-061 Law 1, and a verifier that reads a different angle than the claim's
   producer) is not.
6. **Cell counts are not coverage.** A section with every cell green and no right-answer cell in
   it is not discharged — see the header lesson, which this document exists to obey.
7. **This matrix does not decide the owner items it depends on.** The E-R11 factory default is
   **owner-only — CONFIRMED by the owner 2026-08-09** (ruling record:
   `wave-e-design-skeleton-part4.md` §6 item 2); A28 asserts the SEPARATE-grantability ruling,
   which held under either default and stands unchanged. The RPR-close reachability question
   (D2a) remains a measurement to be taken, not a conclusion recorded here.
