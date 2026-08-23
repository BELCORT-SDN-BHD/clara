# F-T2 · The payroll deadline calendar — design v1

> **Item:** Wave F Track B **F-T2**, `wave-f-contract.md:405`. **Companions:**
> `payroll-calendar-survey.md` (the as-found estate + the statutory re-verification, with the
> source table this document cites by `[id]`) and `payroll-calendar-annexes.md` (mechanics ·
> decision register · rig-replay predictions · owner questions).
> **v1, 2026-08-23.** Written under digest laws **80 · 81 · 16 · 19 · 2 · 27(2) · 31 · 78**,
> TA-P4 · TA-P5 · TA-P14 clause 2, PRD **§6** (LAW) and **§8**'s payroll non-goal, and the
> three rulings recorded at `payroll-calendar-survey.md` §6.
> **No code ships with this document.** It is a design for review.

---

## 1 · The ruled shape — fixed, not designable

Five things were decided before this design and are not re-opened in it.

1. **No payroll engine, ever.** PRD §8: *"A payroll engine → Code PCB/EPF/SOCSO/EIS + calendar
   the deadlines."* (`PRD.md:210`.) The survey's §1.5 is the evidence that this is a
   *capability* boundary and not just a scope preference: EPF, SOCSO and EIS amounts are
   **schedule look-ups** against three **different** wage bases, and PCB is a relief-dependent
   formula over data Clara does not hold. **F-T2 computes no contribution, no deduction and no
   net pay, and the calendar surface carries no money at all.**
2. **R-L22 — one fact, one path.** Statutory due dates live in **one** developer-seeded,
   versioned, effective-dated `clara.statutory_deadlines` table whose **DDL is F-A4's**, read by
   **F-A4's due oracle and cadence belt**. **F-T2 contributes SEED ROWS and a CONSUMER. It mints
   no carrier, no oracle and no clock** (survey §6).
3. **Law 80 — one time-triggered wake source, and the WORK triggers on data.** *"a missing
   statement yields a chase notice, never a fabricated reconciliation"*; for this item, **a
   missing payroll document yields a chase notice, never a fabricated JV.**
4. **TA-P14 clause 2 — the minimal human door.** *"The UI may be crude; it may not be absent."*
   The Codex frontend replaces it later; its absence now is not a deferral, it is a failure.
5. **The documents→JV flow STAYS.** The contract's own parenthesis. §3.9 lists, by name, every
   body F-T2 does not touch.
6. **R-L24 — the seeding rules.** Conflicting official sources → the **earlier** date, **both**
   citations, a visible `conflict` flag, **never a silent pick**. Weekend/holiday roll-over is a
   **per-regulator** column. Rates and wage bases are **not the calendar's business** but ARE
   recorded in the survey as facts a future engine would need, each cited and marked out of
   scope. Every row cites the regulator page + the fetch date; **AGC reprints are structural
   cites only**, never the date authority.

---

## 2 · What binds §3

| binding | source |
|---|---|
| A payroll summary is a filed document with no downstream machinery; the invoice-facts wall refuses it and has been asked | survey F-P1 |
| No statutory payroll COA is seeded; every `410-*` code in the repo is evidence about one client's chart | survey F-P2 |
| `proactive` is allowlisted for **exactly one** function — `wake_record_notification` (`0002:558`); `0011:3903-3910` adds none and `0078:181` is explicitly interactive-only | survey F-P5 |
| `notifications.kind` has **no CHECK** (`0003:184-192`) — a new notice kind needs no migration | survey F-P5 |
| `client_fact_keys` is a **code-populated, append-only** global vocabulary with two members today (`0055:347-382`); the capture door is `clara.record_client_fact(...)` at an **admin+** floor (`0055:499-509`) | survey §5, read here |
| The runtime must not compute a period — *"a period is a figure"* (`0041:3613-3615`); the house date is `clara._book_today()` (`0042:4592`) | survey §3 |
| No public-holiday calendar and no business-day arithmetic exist anywhere | survey F-P7 |
| `open_questions` carries two closed worlds and an extend-only precedent (F-A3's `bank_line`/`bank_ambiguity`) | survey F-P6 |
| Tier-1 closes at three tables for Wave F; a rate table is a **contract amendment** | survey F-P9 |
| Never name anything `*_filings` | survey §6 |

---

## 3 · The design

### 3.1 The rows F-T2 contributes to `clara.statutory_deadlines`

**Eight rows, and every one of them is a LAW plus its citation.** The table is F-A4's; F-T2
supplies rows through a `UNNUMBERED_ft2_*` seed migration on the D17 price-row pattern — shipped
through the full PR ladder, never a live edit.

| code | authority · instrument | cadence · due rule | wording (verbatim) | grade · src |
|---|---|---|---|---|
| `pcb_mtd_remittance` | `lhdn` · **P.U.(A) 507/1994 r.10(1)** + **ITA s.107(2)** | monthly · day 15 following | *"tidak lewat daripada hari ke-15 tiap-tiap bulan kalendar bagi potongan bulan sebelumnya"* — and note *"PCB **dan/atau CP38**"*, so **CP38 rides this same row** | **A** [S1 ¶3.1(c)] |
| `epf_contribution` | `kwsp` · **Act 452 s.45(3)**, LPC under **s.49(1)** | monthly · day 15 following | *"The employer must pay their employee's contributions **on or before the 15th of the following wage month**."* | **B** [K1] |
| `socso_contribution` | `perkeso` · **Act 4** | monthly · day 15 following | *"Contributions payable for any month must be paid **no later than the 15th day of each succeeding month**"* | **B** [P3] |
| `eis_contribution` | `perkeso` · **Act 800 s.20(1)** | monthly · day 15 following | the **same sentence on the same page** — one channel, one form, one date | **B** [P3] |
| `hrdc_levy` | `hrdcorp` · **PSMB Act 2001 s.14/s.15**; **Reg 7 P.U.(A) 141/2001** | monthly · day 15 following | **`conflict = true`.** *"by every **15th of the month**"* [B, H1] and *"**on or before the 15th of every month**"* [A, H3] **versus** Reg 7's *"**not later than the last day of the month immediately following**"* [A, H4]. **Earlier date adopted; both citations stored.** | **A/B** |
| `form_e_cp8d` | `lhdn` · **ITA s.83(1)** | annual · 31 March following | *"Every employer shall, for each year, furnish… **not later than 31 March in the year immediately following**"* | **A** [S2] |
| `form_cp8d_praisi` | `lhdn` · **ITA s.83(1)**, programme ¶2(i)(a) | annual · **25 February** following | the e-Data Praisi route's own cut-off — **a separate row, because it is a separate date with a separate consequence**: an e-E is *"hanya dianggap lengkap jika C.P.8D dikemukakan"* by its deadline | **A** [S3] |
| `form_ea_ec` | `lhdn` · **ITA s.83(1A)** | annual · **last day of February** following | *"prepare and **render to his employee** a statement… **on or before the last day of February in the year immediately following**"* — **not filed with LHDN** | **A** [S2] |
| `cp58` | `lhdn` · **ITA s.83A** | annual · 31 March following | *"**Every company** shall… provide to **each of its agent, dealer or distributor**… **not later than 31 March in the year immediately following**"* — **companies only, provided not filed** | **A** [S2] |

**Nine rows, not eight** — the C.P.8D e-Data Praisi cut-off is split out per R-L24, because a firm
on that route owes something on **25 February** and a row that hides it behind 31 March is a
calendar that will let a client be late.

**Three properties of the row, and each one is load-bearing.**

- **The due rule is a typed arithmetic, never a free sentence.** `due_rule_kind` in a closed set
  — `day_of_month_following` (+`due_day`) · `date_in_following_year` (+`due_month`,`due_day`) ·
  `last_day_of_month_in_following_year` (+`due_month`) — so F-A4's oracle computes the date and
  nothing in the runtime does. The **verbatim wording is stored beside it** and the two must
  agree; a battery cell checks them against each other, not a reader's eye. **The monthly
  wordings differ from one another** (survey §1.1) and are stored as distinct strings, because an
  amendment can move one without moving the others (digest law 16).
- **The citation is a column, not a comment**, on `sst_threshold_schedule`'s live idiom
  (`source_note text not null check (btrim(source_note)<>'')`, `0016:242`): `source_url`,
  `source_note`, `source_accessed_on date`, `instrument`, `evidence_grade` and `cite_role`, all
  `not null`. R-L22's words: *"each row cited to the regulator page + fetch date"*.
  **P-11 makes this bite:** a row whose only evidence is a **grade-C index read** is upgraded to a
  direct read on the day the seed is authored, **or it is not seeded**.
  **EPF is NOT at risk on this rule, and the earlier draft of this design was wrong to say it
  was.** KWSP returns HTTP 403 to a *plain fetcher*; the page renders normally in a real browser,
  and both the 15th and FAQ 31's next-working-day concession were read out of the live DOM. **A
  403 means the tool was refused, never that the page is gone** — demoting a row on an instrument
  failure would be exactly the "absence is not evidence" error inverted. `evidence_grade='direct'`
  with the instrument recorded as a browser read.
- **`cite_role` keeps reprints out of the date position.** An AGC or regulator reprint —
  Act 452's *"Incorporating all amendments up to 1 January 2006"*, PERKESO's *"As at 1 September
  2022"* — is `structural_only`: it establishes a section number, never a live date or rate.
- **`holiday_rule` is PER-REGULATOR, and a conflict is flagged, never silently resolved**
  (**R-L24**). Members: `next_working_day` — today **EPF alone**, on KWSP's own FAQ — and
  `unverified`, which is what LHDN, PERKESO and HRD Corp's silence actually means (law 27(2):
  an absence is not a "no"). Where two official sources of the SAME regulator disagree on the
  date — **HRD Corp's 15th versus last-day-of-the-following-month** — the row carries the
  **earlier** date, **`conflict = true`**, and **both** citations in `source_note`; the calendar
  surface shows the flag. **A silent pick is forbidden.** See §3.6.

**What F-T2 asks of F-A4's DDL** (sent to the conductor with this design): the columns above,
plus `notice_lead_days int not null` — **labelled non-statutory** on the row, because *when
Clara speaks* is a product decision and not a law, and mixing the two in one uncited column is
how a practice preference ends up looking like a statute.

### 3.2 Which client owes what — three-valued, never derived into a chase

Nothing in the books says a client has employees. **F-T2 adds three rows to
`clara.client_fact_keys`** (code-populated, append-only, migration-shipped — `0055:347`):

- **`payroll.employer_status`**, `["employer","not_an_employer"]`
- **`payroll.hrdc_class`**, `["mandatory","optional","not_liable"]`
- **`payroll.cp8d_route`**, `["e_data_praisi","e_cp8d"]` — which of the two mutually exclusive
  C.P.8D routes the firm files on, because they carry **different dates** (25 Feb vs the e-E date)

**Entity type and employee count are TWO flags, never one** — the survey's F-P14. The existing
`entity_type` fact (`0055:371`) supplies the first; `payroll.employer_status` supplies the second.
Applicability is then read, never inferred:

| fact state | PCB · EPF · SOCSO · EIS | HRD levy | Form E + C.P.8D | Form EA | CP58 |
|---|---|---|---|---|---|
| `employer_status = employer` | **applies** | per `hrdc_class` | **applies** | **applies** | per entity: **companies only** |
| `not_an_employer` **and** `entity_type ∈ {sdn_bhd, bhd, llp, society, cooperative}` | does not apply | does not apply | **APPLIES — dormancy is not an exemption** ([**A**], survey §1.2) | does not apply | companies only |
| `not_an_employer` **and** `entity_type ∈ {sole_prop, partnership}` | does not apply | does not apply | **Form E applies; C.P.8D exempt** | does not apply | n/a |
| **either fact missing** | **`not_evaluable`** | `not_evaluable` | `not_evaluable` | `not_evaluable` | `not_evaluable` |

**`not_evaluable` produces exactly ONE open question and never a notice.** A missing
applicability fact is a gap in the firm's own onboarding record, not a client's late filing, and
chasing a client monthly for a document they may not owe is the noise that gets a real notice
ignored. The question rides `clara.wake_open_question` at `scope_kind='client'` with an
**extend-only** new `origin` member (F-A3's `bank_ambiguity` precedent, D34) — the exact
spelling is settled at build against the **live** CHECK text, never against `0011:805-806`.

The facts are captured through the **existing** human door `clara.record_client_fact` at its
existing admin+ floor. **F-T2 mints no new authority and no wake sibling** — under law 78's open
register a sibling is arguably owed, but the fact is an *onboarding* datum and **F-A7b** is the
lane that asks the questions (**D-17**).

**The dormant case is now settled, and the earlier draft of this design had it backwards.** It
proposed `not_evaluable` for Form E on the strength of an UNVERIFIED reading. The 2026 filing
programme answers it directly [**A**, S3 ¶2(i)(b)]: *"**Syarikat, perkongsian liabiliti terhad,
badan amanah dan koperasi yang dorman adalah WAJIB mengemukakan Borang e-E dan C.P.8D**"*. **A
dormant company files.** The only relief is the narrower one in the table above.

### 3.3 The consumer — what F-T2 actually builds

Three parts, and **only the middle one is new machinery**. The shape is deliberately
`close_prep`'s (`close-key-1-design.md:170-183`), because two mutually-unaware clock consumers
would be two architectures (law 81).

1. **The dates: F-A4's oracle.** It reads `statutory_deadlines`, applies `due_rule_kind` against
   `clara._book_today()`, and emits one candidate per (client, obligation, period) inside
   `notice_lead_days`. **F-T2 contributes no date arithmetic whatsoever.**
2. **The data: `clara.payroll_period_coverage(p_client uuid, p_period_start date,
   p_period_end date)`** — F-T2's one new read. STABLE, SECURITY DEFINER, **granted to
   `clara_runtime` and nobody else**, in `depreciation_run_due`'s idiom (`0041:3617`). It answers
   **one** question with **three** values, and it is the only thing standing between a clock tick
   and a chase:

   | verdict | when |
   |---|---|
   | `covered` | a live `payroll_summary` filing exists for the client whose `documents.financial_date` falls inside `[p_period_start, p_period_end]` |
   | `missing` | no `payroll_summary` filing for the client has a `financial_date` in the period, **and** none is undated |
   | `not_evaluable` | at least one `payroll_summary` is filed with a **NULL `financial_date`** — it may or may not be the period's, and a read that cannot say NO has a meaningless YES |

   **`not_evaluable` is not rounded to `missing`.** It produces its own notice — *"a payroll
   summary is filed but undated; it cannot be matched to a period"* — which is a different act
   with a different remedy (date the document) and it is the honest one. It is also the same
   defect class F-A4 is repairing in the uncoded-voucher gate (`close-key-1-design.md` §3.10),
   so the two items agree rather than each inventing a treatment.

   **Why the document and not the JV.** A posted payroll JV would be the better anchor, and
   **there is no way to recognise one**: no statutory payroll COA is seeded (survey F-P2), and
   inventing an account code would be assuming a client's chart. Recognising a payroll JV needs
   an account-role convention that does not exist — **OQ-5**, adjacent to F-T4's E-R10.
3. **The speech: `wake_record_notification` on a `proactive` credential — and F-T2 mints NO
   wake kind.** This is the design's single most important structural choice, so it is argued
   rather than asserted:

   - **`proactive` is allowlisted for exactly one function** (`0002:558`; nothing added at
     `0011:3903-3910`; `0078:181` interactive-only). A lane holding a proactive credential is
     **structurally incapable of doing anything but speak** — it cannot draft, cannot code,
     cannot post. That is PRD §4 item 18's *"speak-never-act, structurally enforced (allowlist
     per wake kind)"*, already built, already granted (`0004:789`), already asked.
   - **The conductor's rider is respected explicitly:** adopting F-A4's `agent_tasks` arm does
     **not** by itself decide the wake-kind question, and F-T2 answers it separately — **no new
     kind, because the notice needs no capability the `proactive` kind does not already have.**
     Nothing here touches `mint_wake_credential`, the `wake_credentials` CHECK pair,
     `agent_tasks.kind`, either trigger body, or `wake_fn_allowlist`. **F-T2's position in the
     wake-kind chain is therefore VACANT, not fifth.** If review overturns this, the kind is
     fifth behind all four Track-A claimants and lands in F-T2's **PR-1b**.
   - **Two properties of the `proactive` kind the build must respect.** A proactive credential
     is **single-use** — consumed at `0004:674-679`, replayable only for the same `op_key` — so
     the belt mints **one credential per notice**, never one per cycle. And a proactive
     credential carries **`client_id is null`** (`ck_wake_credentials_client_0011`,
     `0011:625-628`), so the client rides `p_client`, which `_record_notification_core` then
     checks against the firm (`0004:281-286`, CLR11).
   - **`on_behalf_of` is NULL because nobody instructed it** — director-less by construction,
     never inferred as `false` (law 68 / ARM-0, F-A8's own wording at
     `internet-lane-design.md:308-311`).

**The notice kinds** — free text, no migration (survey F-P5): `payroll.document_missing` ·
`payroll.document_undated` · `payroll.deadline_upcoming` · `payroll.deadline_passed`. The
payload carries the obligation code, the period, the computed statutory date, the wording, the
source URL and the accessed date. **It carries no amount.**

### 3.4 There is no quiet period, and there is no ramp

F-A4's reading of TA-P5 applies unchanged: *"a delay before the first act is indistinguishable
from law 21's ramp"* (`close-key-1-design.md:184-186`). The first firing speaks. The brake is
**live** — F-A4's `close_prep_holds` idiom, or its successor, evaluated as the first rung of the
producer — not a warm-up.

### 3.5 The engine wall, structurally

The calendar's refusal to compute is not a prompt line and not a review convention.

- **The read verb returns no money column.** `clara.list_statutory_calendar` (§3.8) has no
  `*_cents` in its `returns table(...)`, so there is no place for an amount to appear.
- **The notice payload schema forbids one.** A battery cell asserts the payload of every
  `payroll.*` notice kind contains no numeric key outside `{period, due_date}` — a **behavioural**
  cell that makes the check refuse, not a substring match on source text (law 27(3)).
- **The one existing payroll signal stays advisory.** `_bank_line_class_hint`'s five statutory
  words (`0040:3180-3197`) are read for narration only; the function's own header already says
  *"NEVER authoritative"* and F-T2 does not promote it.
- **Hard constraint 2 is satisfied vacuously here**, and the design says so plainly rather than
  claiming a wall it does not have: **there is no authoritative number in this item to get
  wrong.**

### 3.6 Weekends, and the two dates every row carries (R-L24)

**Every calendar row shows TWO dates and never one.**

- **`statutory_due_date`** — the law's own date, computed by A.2's arithmetic. **It is never
  moved, for any reason.** It is what a penalty is measured against and what a professional
  would cite.
- **`effective_due`** — the date the firm should work to, derived from `holiday_rule`:

| `holiday_rule` | who, today | `effective_due` when the statutory date is a Sat/Sun |
|---|---|---|
| `next_working_day` | **EPF only**, on KWSP's own FAQ | the **following** Monday — the regulator's published concession |
| `unverified` | **LHDN · PERKESO (SOCSO + EIS) · HRD Corp** | the **preceding** Friday — conservative, because no roll-forward is verified |

**Three honesty clauses, each of which the build must carry as a visible field, not a comment.**

1. **`holiday_rule='unverified'` is shown on the row.** The firm must be able to see that the
   preceding-Friday date is Clara's conservatism and not the regulator's rule.
2. **"Working day" here means weekends only.** No public-holiday calendar exists in this estate
   (F-P7) and Malaysian public holidays are partly state-specific, so `effective_due` is computed
   on `extract(isodow …) in (6,7)` and **nothing else**. The row carries
   `working_day_basis = 'weekends_only'` so that a public holiday falling on the 15th is
   visibly *not* handled rather than invisibly wrong.
3. **`conflict = true` rows show both dates and both citations** (§3.1) — the earlier date is
   adopted, the disagreement stays on the screen.

**The first live case is 15 November 2026, a Sunday** — the only weekend 15th left in 2026
(15 Aug 2026 was also a Saturday and has passed; Sep/Oct/Dec are weekdays). Under this design
that Sunday yields `effective_due` = **Friday 13 November 2026** for PCB, SOCSO, EIS and the HRD
levy, and **Monday 16 November 2026** for EPF. **Four regulators, two different answers, from
one statutory date** — which is exactly why the column is per-regulator and why **OQ-7** asks the
owner whether BELCORT's own practice differs.

### 3.7 Receipts

Every notice is receipted **in the same transaction as its effect**, and this needs no new
machinery: `_record_notification_core` already reserves an op (`0004:277-280`), inserts the
notification, calls `clara._audit(...)` with the wake kind and the `on_behalf_of`
(`0004:291-293`) and settles an `op_receipts` row (`0004:294`). TA-P4's *"no receipt, no act"* is
therefore structural on this path today. When F-A4's `clara.agent_act_receipts` lands, F-T2's
producer writes through it instead of beside it — **one receipt carrier, not two** (law 81).

**No fetch tool is called on this path**, so TA-P4-M1's zero-citation refusal does not bite here.
Citations live on the **seed rows** instead, which is where the statutory claim actually is.

### 3.8 The human-visible door — crude, and not absent

**One read verb.** `clara.list_statutory_calendar(p_client uuid, p_from date, p_to date)
returns table(...)` — SECURITY DEFINER with a **`bookkeeper+` floor in the body** and EXECUTE
granted to `clara_authenticated`, the `get_close_plan` idiom (`0064:154,280-285,312`), **never a
raw `SELECT` grant on a base table**. It returns, per (obligation, period): the obligation code
and authority, **both dates** (`statutory_due_date` and `effective_due`), `holiday_rule` and
`working_day_basis` as **words**, the `conflict` flag, the verbatim wording, `source_url` +
`source_accessed_on` + `evidence_grade`, the coverage verdict as a **word** (`covered` /
`missing` / `not_evaluable`), and the last notice spoken.

**One page.** A new calendar/page.tsx under `apps/dashboard/app/`, on `/close`'s idiom exactly
(`close/page.tsx:1-27`): `"use client"`, dev auth from `sessionStorage` under the shared
`clara_dev_jwt` key, reads through a sibling calendarApi.ts over PostgREST `rpc()`, **no new
writer invented**, every verdict rendered as **glyph + text word, never hue-only**, and the
two-layer client-switch race guard (AbortController tied to the effect's dependencies **plus** a
monotonic generation ref checked before any `setState`). **The no-computed-cents rule is free
here**: the page has no cents to compute.

**Two controls, and only two.** *Open the question* (for a `not_evaluable` applicability row,
routing to the existing open-question surface) and *Mark spoken/read* on a notice. **No
"acknowledge deadline" button is built** — an acknowledgement that changes nothing statutory is
speculative surface, and a door for an act no human is asked to perform is the named gap F-A4
declined to build for `begin_close`. Recorded as a named gap, not an omission.

### 3.9 The documents→JV flow — the untouched list

F-T2 **does not touch, wrap, recut or re-grant** any of: `clara.document_filings` (`0007:63`) ·
`clara._coding_lane_core` (`0011:1459`, `0013:212`) · `clara.list_uncoded_filings` (`0009:2824`) ·
`clara.approve_entry` (`0004:519`) · `clara._approve_entry_core` (`0037:1750`) ·
`clara.wake_post_entry` (F-A2) · the `payroll_summary` → `invoice_facts` wall
(`0016:5550-5561`) · `documents.document_kind`'s CHECK · `_bank_line_class_hint`
(`0040:3180-3197`) · `clara.mint_wake_credential` · the `wake_credentials` CHECK pair ·
`agent_tasks.kind` or either trigger body · `clara.wake_fn_allowlist`. **There is no D1
write-quiesce window in F-T2** — no live writer's body is replaced.

The two shared surfaces F-T2 **does** extend, both extend-only and both announced to the
conductor: `clara.client_fact_keys` (two new rows) and `clara.open_questions`' `origin` closed
world (one new member, spelling settled against the live CHECK).

---

## 4 · Owner questions

Eight, no more, each with options, a recommendation and its cost: **annexes §D**. In one line
each — **OQ-1** staff allowances (PRD-named Wave F, absent from the contract) · **OQ-2** the Form
E **grace month** (31 March statutory vs 30 April e-Filing, and the payment-side exclusion) ·
**OQ-3** the CP21/22/22A/22B event family · **OQ-4** CP58 ·
**OQ-5** a payroll-JV account-role convention · **OQ-6** the **HRD Corp deadline conflict**
(15th vs last day of the following month) · **OQ-7** the **weekend rule and BELCORT's own
practice** (15 Nov 2026 is the first live case) · **OQ-8** an EPF/SOCSO/EIS rate table as a
fourth Tier-1 table (a **contract amendment**, not a design choice).

*Dropped from the list and recorded as decision **D-17** instead:* whether
`clara.record_client_fact` gains a wake sibling. It is a routing question between F-T2 and
F-A7b, not a product question for the owner, and the recommendation (F-A7b owns it) is not
close.

---

## 5 · Build sequence

| PR | contents | gate |
|---|---|---|
| **PR-0** | this design set, reviewed; the rig replay of survey §8's twelve predictions, with the pinned `prosrc` sha256s recorded | design gate |
| **PR-1** | the **nine seed rows** into `clara.statutory_deadlines` + the **three** `client_fact_keys` rows. Docs/DB only, **no writer, no grant**. **Blocked on F-A4/PR-1b** landing the DDL. Every row's source re-fetched **on the authoring day** (P-11) **using survey §0's reachability table**; grade-C sources upgraded or the row dropped | the DDL exists; every row cites a direct read |
| **PR-2** | `clara.payroll_period_coverage` + the `origin` widening + the chase producer on F-A4's belt + the battery | judgement logic → review law 1's independent pass |
| **PR-3** | `clara.list_statutory_calendar` + `/calendar` | TA-P14 clause 2 |
| **PR-4** | acceptance (§6) | ADR-048 labelling if synthetic |

Migrations are `packages/db/migrations/UNNUMBERED_ft2_<slug>.sql`, underscore-only stems,
**numbers claimed at merge by the conductor**; on a rig, a numbered COPY is applied and never
committed (`pnpm db:migrate` silently skips any filename not starting with a digit).

---

## 6 · Battery and acceptance

**Cells that make a wall REFUSE** (a zero-count refusal head is a question, not a wall — law 31):

1. A `proactive` credential calling **anything other than** `wake_record_notification` is
   refused by `assert_wake_allowed` — the speak-never-act wall, **asked**, not assumed.
2. A second `wake_record_notification` on the **same** proactive credential with a **different**
   `op_key` raises CLR03 (single-use), while the **same** `op_key` replays the stored receipt.
3. A client with **no** `payroll.employer_status` fact produces **zero notices** and **exactly
   one** open question — and a second cycle produces **no second question**.
4. A filed `payroll_summary` with a **NULL** `financial_date` yields `not_evaluable`, **not**
   `missing`, and the undated notice kind — the differential cell, run against a sibling client
   whose document IS dated.
5. Every `payroll.*` notice payload contains **no numeric key** outside `{period, due_date}`.
6. `list_statutory_calendar` called by a role **below** bookkeeper is refused **in the body**.
7. Each of the eight seed rows: the **stored wording** and the **computed date** agree for a
   sampled period — the differential form (compute from `due_rule_kind`, compare to the quote's
   parsed day), never a self-referential read of the same column twice.
8. `form_ea_ec` computes **29 February** for a leap year and **28 February** otherwise.
9. **The 15 November 2026 cell** — one Sunday, four regulators, two answers: `effective_due` is
   **Friday 13 Nov** for PCB/SOCSO/EIS/HRD (`holiday_rule='unverified'`) and **Monday 16 Nov**
   for EPF (`holiday_rule='next_working_day'`), while **`statutory_due_date` stays 15 Nov on all
   five**. The differential cell — five rows, one date input, three distinct outputs.
9b. A `conflict = true` row returns **both** citations and the **earlier** date; a cell asserts
   the calendar surface renders the flag, so the disagreement cannot be read as a settled fact.
10. The `payroll_summary` → `invoice_facts` wall still refuses (P-10) — F-T2 did not perturb it.
11. Cross-tenant: a calendar read under firm A returns **zero** rows for firm B's client.

**Acceptance.** On the real BELCORT estate the payroll accruals of ROME PROPERTIES YA2025 are
already in evidence (four payroll JVs, `ADR-0054`), so a real-books round is reachable for the
coverage predicate. Where a real round is not reachable, the round is **labelled synthetic per
ADR-048** and the deferral is **RECORDED**, per TA-P14 clause 4 — on the record, never an
omission.

---

## 7 · Registered risks and named non-goals

| id | risk |
|---|---|
| **R-1** | **The calendar is right and nobody reads it.** The notice is the whole product; if the inbox is noisy the notice is invisible. §3.2's refusal to chase on `not_evaluable` is the only mitigation in v1, and it is a mitigation, not a fix. |
| **R-2** | **A statutory date moves and the seed row does not.** The rows are developer-seeded and there is no fetch attached (Tier-1 closes at three tables). The mitigation is the citation columns making staleness *visible* — `source_accessed_on` is on the screen — not automatic. **OQ-8.** |
| **R-3** | **The seeding instrument can lie about availability.** KWSP, PERKESO and Cloudflare-fronted LHDN pages return **HTTP 403** to a plain fetcher while rendering normally in a browser, and `hasil.gov.my/media/*` **404s** while `hasil.gov.my/wp-content/uploads/*.pdf` serves fine. A future seed author who probes with the wrong tool will mis-grade a row and drop it. **The reachability table in survey §0 is part of the build instructions, not background.** |
| **R-4** | **The document anchor is weaker than a JV anchor.** A client who sends a payroll summary but whose JV is never posted reads as `covered`. **OQ-5.** |
| **R-5** | **The applicability facts are captured by a human at admin+ and may simply never be captured**, leaving every client `not_evaluable` and the calendar empty of notices. That is fail-closed and it is also useless; onboarding must actually ask. |

**Named non-goals inside the item:** any computation of a contribution, deduction or net pay ·
an employee register or any employee-level datum (law 19) · e-filing or submission of anything
(law 80: *"submission stays human"*; ADR-0075 excludes e-filing **by nature**) · a payroll
subledger · staff allowances (**OQ-1**) · the CP21/22 family (**OQ-3**) · a second clock, a
second oracle, a second due-date carrier (**R-L22**).
