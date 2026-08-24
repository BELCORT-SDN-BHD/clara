# F-T4 — the fix queue: design v2 (gate-folded 2026-08-23), part 2

> **Part 2 of `fix-queue-design.md`** — one design in two files, split for the repo's 500-line
> per-file ceiling on 2026-08-23 (the same shape `sst-engine-design.md`/`-part2.md` already use
> in this directory). **Part 1 carries §1-§8.2** (items A/B/D/E/F/G-H-I, and §8.1-§8.2 of item C —
> the claims accounting standard and the three legally distinct cases); **this file carries
> §8.3-§10**, opening with item C's options. **Section NUMBERS did not change** — every existing
> `§8.x`/`§9`/`§10` citation still resolves, only the file it resolves in did. Read part 1 first;
> nothing here restates its premises.

### 8.3 The options

- **Option 1 — one control account, expense-at-approval (RECOMMENDED).** A single client-level
  non-`payable`-class liability, "Amount owing to employee — expense claims", credited at
  approval; settlement debits it and credits bank. Person-level detail is a **register** problem,
  solved by Wave G's claims module, not by chart bloat. *Pro:* MPERS-correct at recognition; it
  reuses the proven fail-safe — a non-payable credit cannot masquerade as a `supplier_bill`
  (`0009:492-499`) and mints no AP item (`x37-wave-c-a-subledger.test.mjs:1974`); zero new DB
  objects. *Con:* "who is owed what" is a journal-line read until Wave G lands the register.
- **Option 2 — the advance/clearing convention.** Clone the D-b register
  (`0043_wave_d_b1_staff_advances.sql:335-363`): one per-person COA account carrying both
  directions, net. *Pro:* a built, walled, law-19-compliant person model with attestation and
  retire semantics; netting matches what a float-holding employee actually does. *Con:* the
  account flips between asset and liability across the year, which **collides with §8.2's set-off
  rule**, and `staff_advance_applications.advance_id` is `NOT NULL` (`0043:539`) so a pure
  out-of-pocket claim has no row without widening the register.
- **Option 3 — hybrid.** Two directional per-person accounts plus an explicit application verb
  that offsets only where a set-off right is recorded. *Pro:* correct presentation **and** the
  netting reality. *Con:* two accounts per person, in a chart that today has neither.

**Recommendation: Option 1 for employees, with the director and sole-proprietor rows of §8.2 as
mandatory rather than conventional, and netting off by default.** Option 2's register is the right
*eventual* shape and Wave G should build it — but as a claims register in its own right, not by
overloading the advance account and inheriting a set-off problem the chart already warns about.

### 8.4 The two things the convention alone cannot fix

1. **The role discriminant is a judgement, and it must be ASKED, never inferred.** WC-R10's reason
   (iv) — *"a staff claim is either a reimbursement or an allowance/perquisite — a professional
   judgement Clara must never make silently"* — is now grounded in PR 5/2019 §3.7/§6.3. Under
   law 71 the agent posts unattended, so the design's answer is a **refusal path, not a default**:
   a claim whose evidence does not establish that the cost was incurred *on the entity's behalf*
   opens an `open_questions` row and posts nothing. Fail-closed on the unknown. And a claim
   posting with **no filed document** is refused outright — CA 2016 s.245(1)/(3) makes the receipt
   part of the statutory record.
2. **The breeding vector (F28) is not closed by a chart entry.** `x37.w` proves three employee
   claims still breed a `vendor_account` proposal, and the carve-out discriminates on
   `checked_via_rule_id is null` (`0037:2030-2033`), not on humanness — so an agent approval
   satisfies it. Whether F-A2's coder still writes sightings is **F-A2's fact to state**
   (prediction P-6, cross-item note X-2). If it does, the claims convention needs a wall on that
   path before an unattended claim ever posts.

### 8.5 The 2026-08-23 owner ruling — OQ-9's recognition-timing convention

**RULED: option (A) from `fix-queue-gate-record.md`'s M4 addendum, realized as a close-time scan
and draft, not a build-time cut-off clause.** §8.2/§8.3's recognition-at-approval convention
SHIPS as written — Option 1 stands, unedited. **What the ruling adds:** at close, Clara scans
approved claims whose incurred date falls inside the closing FY but whose approval date falls
after FYE, and DRAFTS the accrual adjustment for human approval — the ratified TA-P6 split
(judgement accruals draft, never auto-post) supplies the mechanism, so §8's posting path needs no
new cut-off clause of its own. **Widening trigger REGISTERED**: after the first real closes
provide data, revisit auto-post for deterministic-dated claims (the 60-day-waiver pattern) — a
Backlog-weight follow-up, not a build blocker. Item C's employee row is UNBLOCKED by this ruling;
§10's "decide item C" refusal is DISCHARGED for the recognition-timing question (OQ-1/OQ-2 stand,
unrelated to timing).

---

## 9 · The D1 write-quiesce inventory

**Gate-folded (D-13, D-14, D-22, D-23): five DB CoR'd live bodies (was three, and one of the three
— `request_reextraction` — is now dropped), one CHECK swap on the correct object, four frozen
runtime-module `_vN`s (not DB, priced into PR-3 alongside), two new tables, one new fact key.**

| PR | body / object | kind |
|---|---|---|
| PR-3 | `clara.finalize_document_intake(…)` | **CoR**, prosrc-SHA pin |
| PR-3 | `ck_processing_task_error_code_f_a1` → successor | CHECK swap, extend-only (D-13) |
| PR-3 | `clara.fail_invoice_facts` / `fail_statement_facts` / `fail_witness_facts` | 3× **CoR**, prosrc-SHA pin (D-23) |
| PR-3 | `documentIngest.behavior_v2` / `invoiceFacts.v1.behavior` / `statementFacts.v1.behavior` / `statementFacts.v2.behavior` | 4× new `_vN` + registry repoint (D-22, runtime not DB) |
| ~~PR-3~~ | ~~`clara.request_reextraction(uuid,text,text)`~~ | **DROPPED — no CoR needed (D-14)** |
| PR-4 | `clara.bank_recon_close_state(uuid,uuid)` | **CoR**, prosrc-SHA pin |
| PR-4 | `clara._bank_registry_ledger_state(uuid,date)` | NEW — or F-A3's, called; `security definer` per §2.1 (D-19) |
| PR-4 | `client_fact_keys` ← `banking_arrangement` | additive INSERT |
| PR-2 | `clara.refusal_remedies` | NEW table + seed, key widened (D-16, D-17), grant corrected (D-18) |

Every CoR'd body is re-derived on the rig by `pg_get_functiondef` at authoring time and its
`prosrc` sha256 pinned in the migration's §0 quiesce inventory; files are named
`UNNUMBERED_ft4_<slug>.sql` and **no number is claimed until merge**.

## 10 · What this design refuses to do

**Weaken a wall to make a fix fit** — `finalize_document_intake`'s door still refuses
`corrupt`/`encrypted` (`request_reextraction`'s pre-existing, out-of-scope non-refusal is R-5, not
a weakening this item makes), drawer 1 still has no attestation path, the coding mapper still
leaks no raw text · **name a `_vN` number** (every version is read from the live registry at
authoring time) · **trust migration text as a live body** (`finalize_document_intake` is spliced;
all D1 bodies are rig-replayed) · **decide item C's chart-account choice** (Option 1 vs 2 vs 3 is
still the owner's per §8.3 — only the recognition-TIMING question, OQ-9, is ruled; OQ-1/OQ-2
stand) · **repair a body that is retiring** (item E) or **claim another lane's item** (G/H/I, and
the predicate body).
