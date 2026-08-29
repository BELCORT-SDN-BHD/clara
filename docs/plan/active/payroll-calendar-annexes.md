# F-T2 · The payroll deadline calendar — annexes

> Companions: `payroll-calendar-survey.md` (as-found + the statutory re-verification and its
> `[L1]…[H1]` source table) · `payroll-calendar-design.md` (the design this annex serves).
> **v2, 2026-08-23 (gate-folded)** against `payroll-calendar-gate-record.md`. Annex A mechanics ·
> Annex B decision register · Annex C rig-replay predictions · Annex D owner questions · Annex E
> provenance · Annex F change log.

---

## Annex A · Mechanics

### A.1 · The seed-row shape — what F-T2 asks of F-A4's DDL

`clara.statutory_deadlines` is **F-A4's table** (R-L22). F-T2's rows need the columns below; the
list is an **ask**, sent to the conductor with this design, not a claim of ownership.

| column | shape | why |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | `fx_rates`' greenfield idiom (`internet-lane-design.md:183-186`) |
| `obligation_code` | `text not null` | the stable identity: `pcb_mtd_remittance` · `epf_contribution` · `socso_contribution` · `eis_contribution` · `hrdc_levy` · `form_e_cp8d` · `form_cp8d_praisi` · `form_ea_ec` · `cp58` — **nine, corrected in the fold (nit); v1's list omitted `form_cp8d_praisi`** |
| `authority` | `text not null` | `lhdn` · `kwsp` · `perkeso` · `hrdcorp`; four regulators, four remittance channels, four penalty regimes |
| `domain` | `text not null` | `payroll` for F-T2's rows, `sst` for F-T1's — **one table, two row sets, no second path** (law 81) |
| `cadence` | `text not null` | `monthly` · `annual` |
| `due_rule_kind` | `text not null` | the CLOSED set of A.2 |
| `due_day` / `due_month` | `int` | the arithmetic's parameters; NULL where the rule kind does not use them, paired by CHECK |
| `wording` | `text not null check (btrim(wording)<>'')` | the regulator's **verbatim** sentence |
| `instrument` | `text not null` | e.g. `PSMB Act 2001 s.14`, `ITA 1967` |
| `holiday_rule` | `text not null` | **per-regulator** (R-L24): `next_working_day` · `unverified` (§A.2) |
| `working_day_basis` | `text not null` | `weekends_only` in v1 — the field exists so that "public holidays are not handled" is a **visible fact**, not an unstated limitation |
| `conflict` | `boolean not null default false` | R-L24: two official sources of one regulator disagreeing. **True forces `source_note` to carry both citations** (paired CHECK) |
| `source_url` | `text not null check (btrim(source_url)<>'')` | R-L22's citation half |
| `source_note` | `text not null check (btrim(source_note)<>'')` | `sst_threshold_schedule`'s live idiom (`0016:242`); carries **both** citations on a `conflict` row |
| `source_accessed_on` | `date not null` | R-L22's fetch-date half; **on the screen**, so staleness is visible (design R-2) |
| `evidence_grade` | `text not null` | `direct` · `index` — the survey's D/I distinction carried into the row. **A row may not be seeded at `index`** (P-11); the column exists so a future relaxation is a visible decision |
| `cite_role` | `text not null` | `date_authority` · `structural_only`. **An AGC reprint of an Act is `structural_only`** (R-L24) — it establishes the instrument, never the current date |
| `notice_lead_days` | `int not null` | **explicitly non-statutory** — when Clara speaks is a product decision, not a law |
| `effective_from` / `effective_to` | `date` | half-open `[from, to)` |
| `superseded_by` / `superseded_at` | `uuid` / `timestamptz`, **paired CHECK** | immutable + supersede, `client_facts`' idiom (`0055:405-408`) |
| `recorded_by` / `basis` / `basis_kind` / `recorded_at` | the WHO/BASIS/WHEN trio | `client_facts` `0055:394-399`; `basis_kind='migration_seed'` for a developer-seeded row |

Partial unique index for the live row per key:
`unique (domain, obligation_code, effective_from) where superseded_at is null`.

### A.2 · The due arithmetic — the closed set, and what it never does

| `due_rule_kind` | parameters | date, for period ending `pe` |
|---|---|---|
| `day_of_month_following` | `due_day` | `(date_trunc('month', pe) + interval '1 month')::date + (due_day - 1)` |
| `date_in_following_year` | `due_month`, `due_day` | `make_date(extract(year from pe)::int + 1, due_month, due_day)` |
| `last_day_of_month_in_following_year` | `due_month` | `(make_date(y+1, due_month, 1) + interval '1 month - 1 day')::date` |

`form_ea_ec` uses the third kind (`due_month = 2`), which is why it yields **29 February** in a
leap year — battery cell 8. `form_e_cp8d` and `cp58` use the second (`3`, `31`).
**`form_cp8d_praisi` also uses the second kind (`due_month = 2`, `due_day = 25`) — corrected in
the fold (nit); v1 left it unassigned.** The five monthly rows use the first (`due_day = 15`).

**`statutory_due_date` is what the three rules above produce and it is NEVER shifted.**
`effective_due` is a **second, separately-named** column derived from it (R-L24):

```
effective_due :=
  case
    when extract(isodow from statutory_due_date) not in (6,7) then statutory_due_date
    when holiday_rule = 'next_working_day'  then statutory_due_date + (8 - isodow)   -- → Monday
    when holiday_rule = 'unverified'        then statutory_due_date - (isodow - 5)   -- → Friday
  end
```

`isodow` 6 = Saturday, 7 = Sunday. **Public holidays are not applied at all** — hence
`working_day_basis = 'weekends_only'` on every row, so the limitation is on the screen rather
than in a designer's head. The two arms are asymmetric on purpose: a regulator that **publishes**
a roll-forward concession is followed forward; a regulator that publishes **nothing** gets the
conservative roll-back, because silence is an absence and an absence is not a concession
(law 27(2)).

**Worked, on the one case that is real:** 15 November 2026 is a **Sunday** (`isodow = 7`), the
only weekend 15th remaining in 2026. `effective_due` = **Mon 16 Nov** for `epf_contribution`,
**Fri 13 Nov** for `pcb_mtd_remittance`, `socso_contribution`, `eis_contribution` and
`hrdc_levy`. `statutory_due_date` = **15 Nov** on all five. This is battery cell 9.

### A.3 · `clara.payroll_period_coverage` — the three-valued read

```
clara.payroll_period_coverage(p_client uuid, p_period_start date, p_period_end date)
  returns table(verdict text, dated_count int, undated_count int, newest_filing_id uuid)
  -- STABLE, SECURITY DEFINER, search_path pinned; granted to clara_runtime ONLY.
```

Ordered, and the order is the fail-closed half:

1. count live `payroll_summary` filings for the client with `financial_date` **inside** the
   period → `dated_count`;
2. count live `payroll_summary` filings for the client with `financial_date` **IS NULL** **and
   `document_filings.filed_at` inside `[p_period_start, p_period_end]`** → `undated_count`
   — **period-bound, folded (gate M2).** v1 counted every undated filing in the client's whole
   history, so one January filing silenced `missing` for every later month forever. The bound
   reuses `document_filings.filed_at` (`0007:68`), the same column F-A4's own
   `undated_documents` gate uses to bound its population (`close-key-1-design.md` D-18);
3. `dated_count > 0` → **`covered`**;
4. `undated_count > 0` → **`not_evaluable`** (an undated document filed **within this period**
   may be the period's; a read that cannot say NO has a meaningless YES);
5. otherwise → **`missing`**.

**Step 4 precedes step 5 deliberately.** Rounding `not_evaluable` to `missing` would chase a
client who already sent the document, which teaches the firm to ignore the notice. The
`not_evaluable` arm has its own remedy — date the document — and its own notice kind.

**A forced cell asserts its precondition or exits by a named `skipHere`/`t.skip`** — never
`noteLane` + return, never a `.catch(()=>…)` swallowing the premise, never `?? wire.x` hiding a
durable read, and never an OR between two walls. Fixtures **throw** on construction failure.

### A.4 · The notice payload

**Folded, gate M9.** v1's payload carried one date (`due_date`) plus an undefined free-text
`weekend_label` — nothing else in the design set gives that field a shape, a producer or a
battery cell. A firm reading the notice and the same firm reading `/calendar` for the same
obligation could see two different dates. The fold carries the same typed
`effective_due`/`holiday_rule`/`working_day_basis` triple `list_statutory_calendar` (A.5) already
returns, and drops `weekend_label`.

```
{ obligation_code, authority, domain: "payroll",
  period: { start, end },
  due_date,                       -- statutory_due_date, computed by F-A4's oracle; never moved
  effective_due,                  -- R-L24's derived working-day date (A.2); same body as A.5
  holiday_rule, working_day_basis,
  wording, instrument,
  source_url, source_accessed_on,
  coverage: "missing" | "not_evaluable"   }
```

`kind` is one of `payroll.document_missing` · `payroll.document_undated` ·
`payroll.deadline_upcoming` · `payroll.deadline_passed`. **`notifications.kind` has no CHECK**
(`0003:184-192`), so **no migration is needed to add a kind** — and battery cell 5 is what stops
the payload from growing a money field.

### A.5 · `clara.list_statutory_calendar` — the read verb

```
clara.list_statutory_calendar(p_client uuid, p_from date, p_to date)
  returns table(obligation_code text, authority text, domain text,
                period_start date, period_end date,
                statutory_due_date date,        -- the law's date; never moved
                effective_due date,             -- R-L24's derived date
                holiday_rule text,              -- next_working_day | unverified
                working_day_basis text,         -- weekends_only (v1)
                conflict boolean,
                wording text, instrument text,
                source_url text, source_note text, source_accessed_on date,
                evidence_grade text, cite_role text,
                coverage_verdict text,          -- covered | missing | not_evaluable
                last_notice_kind text, last_notice_at timestamptz)
  -- SECURITY DEFINER; bookkeeper+ floor IN THE BODY; EXECUTE to clara_authenticated.
```

The `get_close_plan` idiom (`0064:154,280-285,312`): a typed definer reader with the floor in the
body, **never a raw `SELECT` grant on a base table**. **There is no `*_cents` column and there
never will be** (design §3.5).

### A.6 · The three `client_fact_keys` rows, as they will be seeded (corrected in the fold, nit — v1's header said two)

```
('payroll.employer_status', 'enum:PAYROLL_EMPLOYER_STATUS_V1',
 '["employer","not_an_employer"]',
 'Whether the client employs anyone in Malaysia. Drives which statutory payroll obligations
  appear on the calendar. NO live row means not_evaluable -- one open question, never a
  notice (design 3.2). Never inferred from the books: nothing in a ledger says a client has
  employees.')

('payroll.hrdc_class', 'enum:PAYROLL_HRDC_CLASS_V1',
 '["mandatory","optional","not_liable"]',
 'The client class under the PSMB Act 2001 -- s.14 mandatory (1% of monthly wage) or s.15
  optional (0.5%). Head-count and sector thresholds are UNVERIFIED as at 2026-08-23, so the
  class is a captured human fact, never derived.')
```

**Folded, gate M8.** v1's seeded description carried an inline claim that "HRD Corp Circular
1/2026 exempts the education industry for Jan-Dec 2026 — an exemption PERIOD, not a class
change" into this **append-only, permanent** row. This class has no carrier for a dated
exemption window — recording the class as `mandatory`/`optional`/`not_liable` says nothing about
*when* liability is suspended — and the circular's own evidence was never graded to this
document's own A/B/C/D standard (no source id, no grade marker, `payroll-calendar-survey.md`
§1.6 marks the whole section OUT OF SCOPE). The claim is dropped from the seeded row rather than
shipped uncited into a table that can never be corrected in place; the gap is registered instead
as **risk R-7**. A dated carrier (a fourth `client_fact_keys` row, or a client-scoped effective
window) is future work once the circular is graded.

```

('payroll.cp8d_route', 'enum:PAYROLL_CP8D_ROUTE_V1', '["e_data_praisi","e_cp8d"]',
 'Which of the two mutually exclusive C.P.8D routes this client is filed on. They carry
  DIFFERENT dates -- e-Data Praisi on or before 25 February, e-CP8D on or before the e-E due
  date -- and Form e-E is only complete once C.P.8D is in by its own deadline (S3 2(i)(a)).')
```

Captured through the existing `clara.record_client_fact(...)` at its existing **admin+** floor
(`0055:499-509`). **No new authority, no wake sibling, no floor change** — **D-17**.
The **entity type** half of the Form E test reuses the existing `entity_type` fact (`0055:371`);
F-T2 adds no fourth key for it (survey F-P14: two flags, not one — but the first already exists).

### A.7 · The producer's rung order

B1 hold (F-A4's live-hold idiom) → B2 applicability, **reading `clara.payroll_applicability`**
(`not_evaluable` → one open question per missing fact, **stop** — **named in the fold, gate
M13**: v1 left B2 with no read door at all, since `client_facts`' RLS admits only
`clara_authenticated` and the producer runs as `clara_runtime`) → B3 F-A4's oracle candidate →
B4 `payroll_period_coverage` (`covered` → **stop**) → B5 dedupe against notices already spoken in
the cadence window → B6 mint a **single-use** proactive credential → B7
`wake_record_notification`. **A rung's own evaluation may never raise out of the ladder**; every
rung is total, and an unreadable input is `not_evaluable`, never `pass`.

---

## Annex B · Decision register

Decisions taken under the standing delegation. **Grounds are stated; a decision without its
"why" rots.**

| id | decision | grounds |
|---|---|---|
| **D-01** | **F-T2 mints no due-date carrier, no oracle and no clock.** | **R-L22**, received twice this session (conductor, and re-transmitted by `tb-ft1-sst` withdrawing its contrary recommendation). Laws 80/81. |
| **D-02** | **F-T2 mints NO wake kind.** The chase rides `wake_record_notification` on a `proactive` credential. | `proactive` is allowlisted for **exactly one** function (`0002:558`; `0011:3903-3910` adds none; `0078:181` is interactive-only) and already granted (`0004:789`) — the capability is sufficient and the wall is structural. The conductor's rider is answered explicitly rather than by silence. |
| **D-03** | **The notice kinds need no migration.** | `notifications.kind` is bare `text not null` (`0003:184-192`). |
| **D-04** | **Applicability is a captured human fact, never derived from the books.** | Nothing in a ledger says a client has employees; deriving it would be a model-authored premise behind a statutory claim. `client_fact_keys` is the estate's existing vocabulary door (`0055:347`). |
| **D-05** | **`not_evaluable` applicability produces ONE open question and ZERO notices.** | A monthly chase for a document a client may not owe is the noise that makes a real notice invisible (risk R-1). Fail-closed here means *do not assert*, not *chase anyway*. |
| **D-06** | **The coverage anchor is the filed `payroll_summary`, not a posted JV.** | No statutory payroll COA is seeded (survey F-P2); recognising a payroll JV would mean assuming a client's chart. Registered as a weakness (R-4) and put to the owner (**OQ-5**). |
| **D-07** | **An undated `payroll_summary` is `not_evaluable`, never `missing`.** | Law 27(2); the same defect class F-A4 is repairing in the uncoded-voucher gate — the two items agree rather than each inventing a treatment. |
| **D-08** | ~~The oracle never shifts a date; it labels.~~ **SUPERSEDED by R-L24 (2026-08-23).** Every row now carries **two** dates: `statutory_due_date`, never moved, and `effective_due`, derived **per regulator** — forward to Monday where the regulator publishes a next-working-day concession (EPF alone), **back to Friday** where none is verified (LHDN, PERKESO, HRD Corp). | R-L24. The v1 reading was *label only*; the ruling is that a firm needs a date to work to, and the conservative direction is the safe one where the rule is unverified. **`working_day_basis='weekends_only'` keeps the public-holiday gap visible** — the part of D-08 that survives. |
| **D-08b** | **A conflict between two official sources of one regulator adopts the EARLIER date, carries BOTH citations, and shows a `conflict` flag.** Never a silent pick. | R-L24, on HRD Corp's 15th-vs-last-day divergence. The earlier date is the one that cannot make the firm late. |
| **D-08c** | **An AGC reprint of an Act is a `structural_only` cite** — it establishes the instrument, never the current date. | R-L24. A 2006-era reprint has been amended many times over; treating it as the date authority is exactly the stale-source failure digest law 16 exists to prevent. |
| **D-09** | **A row whose only evidence is a grade-C INDEX read is NOT seeded** — but **a plain-fetch 403 or 404 never demotes a row**. Reachability is measured per host *and* per path class (survey §0) and a refused tool is not a missing page. | R-L22's citation requirement plus rubric EV-1. The v1 draft wrongly put **EPF** at risk on a 403: KWSP renders fine in a browser, and both the 15th and FAQ 31 were read from the live DOM. **Demoting a row on an instrument failure is "absence is not evidence" inverted** — the failure is evidence about the *tool*, not the *page*. |
| **D-17** | **`clara.record_client_fact` gains NO wake sibling in F-T2**; if one is owed under law 78's open register, **F-A7b** owns it. | Applicability is an *onboarding* datum and F-A7b is the lane that asks the questions. A calendar lane minting an authority verb for a fact it only reads is scope creep. **Cost, and it is real:** until F-A7b lands, every client is `not_evaluable` unless an admin types the fact (risk R-5). Dropped from the owner-question list because the recommendation is not close. |
| **D-18** | **The C.P.8D e-Data Praisi cut-off is its OWN seed row** (`form_cp8d_praisi`, 25 February), not a note on `form_e_cp8d`. | R-L24. The two routes are mutually exclusive and carry different dates; a firm on the Praisi route owes something five weeks before 31 March, and a row that hides that behind the later date is a calendar that lets a client be late. |
| **D-19** | **CP38 rides `pcb_mtd_remittance`'s row, not its own.** | Rule 10(1)(c) says *"bayaran **PCB dan/atau CP38**"* — one payment, one date, one statement. Modelling it separately would invent a deadline the law does not have. |
| **D-10** | **`notice_lead_days` is labelled non-statutory on the row.** | Mixing a practice preference into a cited law column is how a preference ends up looking like a statute (digest law 16's whole point). |
| **D-11** | **No per-firm dial for the lead or the cadence.** | TA-P1's posture: capabilities default-on, no per-firm dial. |
| **D-12** | **No "acknowledge deadline" control is built.** | A door for an act no human is asked to perform is speculative surface — F-A4's own `begin_close` precedent. Recorded as a **named gap**, not an omission. |
| **D-13** | **The calendar surface carries no money at all**, and the design says hard constraint 2 is satisfied **vacuously** here. | Claiming a wall one does not have is worse than naming the absence. There is no authoritative number in this item to get wrong. |
| **D-14** | **Nothing is named `*_filings`.** | `clara.document_filings` (`0007:63`) owns that word for the document pipeline; `list_uncoded_filings` and `_coding_lane_core(p_client, p_filing)` all mean documents (`tb-ft1-sst`, 2026-08-23). |
| **D-15** | **The `open_questions` `origin` spelling is settled at build against the LIVE CHECK**, not against `0011:805-806`. | Bodies and constraints are spliced across generations; F-A3 is adding a member to the same closed world. Extend-only, merge-ordered, announced to the conductor. |
| **D-16** | **No D1 write-quiesce window.** | F-T2 replaces no live writer's body (design §3.9). If review adds one, the window is F-T2's own and is listed in the migration's §0 quiesce inventory. |
| **D-20** | **The `undated_count` arm of `payroll_period_coverage` is bound by `document_filings.filed_at` inside the period being evaluated**, not read client-wide. | Gate finding **M2**: an unbound read let one undated filing suppress every later period's `missing` verdict forever. Reuses F-A4's own `undated_documents` gate bound (`close-key-1-design.md` D-18) rather than inventing a second treatment of the same defect class (law 81). |
| **D-21** | **The applicability matrix is total over the live 8-member `entity_type` enum**: `society` is routed to `not_evaluable` (the WAJIB-dormant citation does not name it) and `other` is routed to `not_evaluable` (the enum cannot express a trust body, a Hindu joint family or an estate). | Gate findings **M6/M22**: v1's table matched neither its own cited enum nor its cited source. Fail-closed on an unclassifiable state beats a wrong statutory assertion (constraint 1). Enum widening is out of scope here — **R-6**. |
| **D-22** | **`payroll.cp8d_route` gates which of `form_e_cp8d` / `form_cp8d_praisi` applies**, wherever the matrix marks Form E + C.P.8D as applying; a missing route puts both `not_evaluable` without touching Form E. | Gate finding **M7**: v1 minted the fact and gated nothing with it, so the ninth seed row (`form_cp8d_praisi`, D-18) had no applicability rule of its own. |
| **D-23** | **`clara.payroll_applicability(p_client uuid)` is a second new SECURITY DEFINER read**, granted to `clara_runtime` only, in `depreciation_run_due`'s idiom including its in-body firm check. | Gate finding **M13**: rung B2 (applicability) has no door under either identity F-T2 gives the producer — `client_facts`' RLS admits only `clara_authenticated`, and `clara_runtime` has no grant or policy on the table at all. |
| **D-24** | **The notice payload carries `effective_due`, `holiday_rule` and `working_day_basis` as typed fields; `weekend_label` is dropped.** | Gate finding **M9**: `weekend_label` was undefined anywhere in the set (one mention, no shape, no producer, no cell); the notice and `/calendar` could show different dates for one obligation. Reuses `list_statutory_calendar`'s (A.5) own typed fields rather than inventing a second date idiom. |
| **D-25** | **PR-1's blocking gate is F-A4/PR-1c, not PR-1b**, everywhere the design set states the `statutory_deadlines` DDL dependency. | Gate findings **M11/M18/M19/M20** — four lenses, one defect: R-L22 assigns the DDL to F-A4's additive PR-1c; PR-1b is a distinct, correct dependency (F-T2's own wake-kind-chain PR-1b reference at design §3.3, untouched) that v1 conflated with it. |
| **D-26** | **Battery cell 1 asserts the GRANT matrix / `42501`, not `assert_wake_allowed`.** | Gate finding **M16**: a `proactive` credential calling any function but `wake_record_notification` dies at the GRANT before `assert_wake_allowed`'s body ever runs; asserting the helper as the refusing mechanism risks a false green or a wall-weakening "repair". Matches the estate's own T17 idiom (`rig-meta.mjs:877`). |
| **D-27** | **§6's acceptance claim is withdrawn: no real-books round is reachable for the coverage predicate on the current estate.** | Gate finding **M23**: ROME PROPERTIES' payroll source documents are ruled excluded from ingestion (`wave-a2-ar-myinvois-contract.md` WA2-R3; reconfirmed `wave-g-e2e-corpus-design.md` OD-4), so no `payroll_summary` filing — dated or not — exists to anchor the predicate. PR-4's round is labelled synthetic per ADR-048 instead. |

---

## Annex C · Predictions the rig replay must settle

Survey **§8 P-1 … P-12** carry the estate predictions; they are not repeated here. Four are
F-T2-specific and are added at PR-0:

| id | prediction |
|---|---|
| **P-13** | At the frontier, `clara.wake_fn_allowlist` contains **exactly one** row for `wake_kind='proactive'`, and it is `wake_record_notification`. **If a second row exists, D-02's speak-never-act argument is weaker than written and the design is amended, not the claim.** |
| **P-14** | `clara.assert_wake_allowed` actually **refuses** a `proactive` credential calling a non-allowlisted function — a cell that makes the wall say NO, not a read of the allowlist table. |
| **P-15** | `clara.client_fact_keys` is append-only at the frontier (`t_client_fact_keys_append_only`) and contains **four** members — `entity_type`, `msic`, `trade_nature`, `customer_identity_policy` — before F-T2's three rows land (**seven** total after PR-1). **Corrected in the fold (gate M0/nit); v1 predicted two** and was already falsifiable against `main` the day it was written (`0056:1233`, `0062:172`, both merged before the design was authored). |
| **P-16** | `clara.statutory_deadlines` exists at the frontier with A.1's columns, **F-A4/PR-1c** having landed the DDL (R-L22; corrected in the fold, **gate M11/M18/M19/M20** — v1's design-set text named PR-1b). **If it does not, PR-1 does not open** — F-T2 does not mint it as a stopgap. |

Every prediction is re-derived by `pg_get_functiondef` / `pg_get_constraintdef` on a fresh rig at
the frontier (`pnpm db:migrate` + `pnpm db:seed` on a throwaway Postgres 17, PG* vars, never
`DATABASE_URL`), with the pinned `prosrc` sha256 recorded. **The conductor's standing rule
applies: the count of extension sites is re-derived, never taken from any design's tally.**

---

## Annex D · Owner questions

Eight. Each states the question, the options, a recommendation and its cost.

> **ALL EIGHT ARE RULED — 2026-08-30 (裁-39): every one PER THE DEFAULTS RECOMMENDED HERE.** Ledger:
> `mohe-grill-rulings-2026-08-29.md` §裁-39. Each question below is kept **verbatim as argued** and
> carries its ruling at the end of its own recommendation. **F-T2's rows are unblocked**: the lane
> contributes seed rows against a DDL live and empty since `0139`. *(Pre-ruling, this block read:
> "None is rhetorical and none is answered here.")*

### OQ-1 · Staff allowances — a PRD-named Wave-F behaviour with no contract item

**The finding.** `PRD.md:111` (§4.96, the ADR-054 amendment) names *"Staff allowances → Wave F —
payroll-calendar adjacent; coded, never computed."* A grep of `wave-f-contract.md` finds **no
mention of staff allowances anywhere** — and the same is true of the other two behaviours the
same PRD paragraph assigns to Wave F: **self-billed e-Invoice obligation detection** and
**withholding tax as a mechanic**. Three PRD-named Wave-F behaviours have no contract item.

**Options.** **(a)** Fold staff allowances into F-T2 now. **(b)** Give the three a contract item
of their own (an F-T5, or an F-A item). **(c)** Re-scope them out of Wave F in the PRD, so the
PRD and the contract agree. **(d)** Leave the disagreement standing and record it.

**Recommendation: (b)**, and treat it as three items, not one — they share only the word
"Wave F". Folding allowances into F-T2 (option a) is the tempting one and it is wrong: an
allowance is a *coding* question (which account, is it a benefit-in-kind, does it enter the EPF
or the HRD Corp wage base — the three bases differ, survey §1.5) and F-T2 is a *calendar*. The
two have no shared machinery.

**Cost.** (b) adds a Wave-F item and a design gate. (d) costs nothing today and leaves the PRD
claiming a capability no contract schedules — the exact `GAP2-6` failure mode this wave exists to
close. — **RULED 2026-08-30 (裁-39): (b), as recommended.** Staff allowances get their own contract item and are **NOT folded into F-T2** — an allowance is a *coding* question, a calendar is not; PRD's "coded, never computed" stands.

### OQ-2 · The Form E grace month — which date does the calendar show?

**The finding.** Form E has **two** dates and they are not interchangeable. The statutory date is
**31 March** (ITA s.83(1)) [**A**, S2]. The 2026 filing programme grants e-Filing *"Tambahan Masa
= 1 bulan"*, so an e-Filed Form E lodged by **30 April 2026** is accepted as in time — **but
¶1(iii) expressly excludes Form E from the s.103(1) payment-side extension** [**A**, S3]. The
grace is a *filing* grace only. Separately, a firm on the **e-Data Praisi** C.P.8D route owes
something on **25 February**, five weeks before either of them.

**Options.** **(a)** Show **31 March** only — the statutory date, conservative, and the firm never
relies on a concession. **(b)** Show **30 April** — what the firm actually works to, at the cost
of a calendar that silently depends on an annually-reissued programme. **(c)** Show **both**, as
`statutory_due_date` = 31 March and a separate `administrative_due_date` = 30 April, with the
payment-side exclusion stated on the row. **(d)** Make it a per-firm setting.

**Recommendation: (c)**, reusing the two-date shape R-L24 already imposes for weekends (design
§3.6) rather than inventing a second idiom. **Cost:** one more nullable column on F-A4's DDL, and
a yearly maintenance duty — the grace is granted by a programme reissued each December, so a row
asserting 30 April for 2027 before the 2027 programme exists would be a fabricated date.
**(a) is the safe fallback if the owner does not want that duty.** — **RULED 2026-08-30 (裁-39): the STATUTORY 31 March is the date of record, with the e-Filing grace month ANNOTATED beside it** and the payment-side exclusion stated on the row. The calendar never silently relies on a concession reissued each December.

### OQ-3 · The CP21 / CP22 / CP22A / CP22B family — in or out?

**The finding.** All four carry hard, verified deadlines [L1, direct]: CP22 *"within 30 days
after the commencement of employment"*; CP22A/CP22B *"not less than 30 days before the cessation
of employment; or not more than 30 days after being informed of the death"*; CP21 *"not less
than 30 days before the expected departure date"*. They are **event-triggered**: no clock can
produce them, because nothing in the books says an employee was hired, left, or died.

**Options.** **(a)** Out of F-T2 entirely, named in the non-goals. **(b)** In, as **reference
rows only** — visible on the calendar as "when this happens, you have 30 days", with no clock and
no chase. **(c)** In, with a human-entered trigger event.

**Recommendation: (b).** The firm's real failure mode is not knowing the rule exists; a reference
row costs one seed row each and zero machinery, and it does not pretend to a trigger Clara
cannot see. **Cost:** four rows the oracle must be told to skip (a `cadence='event'` member that
produces no candidates), and a calendar that mixes dated and undated rows — a presentation
wrinkle on a crude door. — **RULED 2026-08-30 (裁-39): (b), as recommended — the family is IN, as reference rows.** Visible, with no clock and no chase, because nothing in the books says an employee was hired, left or died.

### OQ-4 · CP58 — an obligation this lane was not asked to survey

**The finding.** The same LHDN page carries **Form CP58** — the statement of cash and non-cash
incentive payments to agents, dealers and distributors — *"on or before 31 March of the
following year"* [L1, direct]. It is not payroll, it sits on the employer page beside Form E,
and several BELCORT-class clients pay commissions.

**Options.** **(a)** Seed it with the payroll rows (one row, same authority, same date shape).
**(b)** Leave it to F-T3's tax lane. **(c)** Out.

**Recommendation: (a)**, and the design **provisionally adopts it** — `cp58` is in §3.1's nine
seed rows, marked for removal if the owner says otherwise. It costs one seed row, it is verified
to grade **A** (s.83A, byte-verbatim), and leaving a known 31-March obligation off a calendar the
firm will trust is worse than a slightly wider scope. **Note the narrower scope in the Act:**
s.83A says *"every **company**"*, not "every employer", and the form is **provided to the
recipient, not filed**. **Cost:** a fourth `client_fact_keys` row
(`payroll.pays_agent_incentives`) or an honest `not_evaluable` forever. — **RULED 2026-08-30 (裁-39): CP58 STAYS, and its verdict is `unknown` when the fact is absent — NEVER a verdict.** This overrides the design's provisional unconditional "applies" (gate card OC-3): a chase on every company client regardless of the obligation is the alert-fatigue failure, and `unknown` is the honest state.

### OQ-5 · A payroll-JV account-role convention

**The finding.** The coverage predicate anchors on the **document**, because no statutory payroll
COA is seeded and no account-role marker exists that would let Clara recognise a payroll JV
(survey F-P2). A client who sends the summary but never gets the JV posted reads as `covered`
(risk R-4). The Wave-B COA review proposed `410-003` EPF payable … `410-008` HRD Corp levy
payable (`coa-codex-completeness-review.md:336-349`), and F-T4 already owns *"the claims
accounting class's account-convention design (E-R10)"*.

**Options.** **(a)** Add a payroll account-role marker to F-T4's convention work and let F-T2
consume it later. **(b)** Build a marker inside F-T2. **(c)** Leave the document anchor and
record R-4.

**Recommendation: (a).** One convention, one owner — two lanes inventing account roles is two
architectures (law 81). **Cost:** F-T2 v1 ships with the weaker anchor, and the JV anchor
arrives with F-T4. — **RULED 2026-08-30 (裁-39): the payroll-JV roles come from the COA TEMPLATE's `statutory` marks (裁-21).** One convention, one owner — and the owner is now named: the firm template, not F-T2 and not a second invention inside F-T4.

### OQ-6 · The HRD Corp deadline conflict — 15th, or the last day of the following month?

**The finding.** Two official HRD Corp sources give **different** deadlines for the levy: the
support-centre levy article read directly today says payment must occur *"within 15 days of the
following month"* [H1, **direct**, 2026-08-23], and a second official source gives the **last day
of the following month**. Under **R-L24** this design adopts the **earlier** date (the 15th),
carries **both** citations in `source_note`, and shows a **`conflict` flag** on the calendar.

**Options.** **(a)** Adopt the earlier date with the conflict visible — R-L24's default and this
design's build. **(b)** Adopt the later date (more clients meet it; more exposure if the earlier
one governs). **(c)** Seed **no** HRD row until HRD Corp is asked in writing and answers.
**(d)** Seed both dates as two rows and let the firm choose per client.

**Recommendation: (a)**, and separately **write to HRD Corp** so (c)'s answer arrives without
(c)'s cost. The earlier date cannot make a client late; the later one can.
**Cost:** clients whose practice is the last day will see an "overdue" state up to two weeks
early, every month, for every HRD-liable client — the most likely source of alert fatigue in the
whole item (risk R-1). The `conflict` flag is what stops that from reading as a hard fact. — **RULED 2026-08-30 (裁-39): (a), as recommended — BOTH dates shown, flagged `conflict`, the earlier one governing the reminder.** The earlier date cannot make a client late; the later one can. Writing to HRD Corp stays a standing, unscheduled follow-up.

### OQ-7 · The weekend rule, and whether BELCORT's own practice differs

**The finding.** **R-L24** sets the rule: `effective_due` rolls **forward** to Monday where the
regulator publishes a next-working-day concession — **EPF alone**, on KWSP's own FAQ — and
**back** to the preceding Friday where none is verified, which today is **LHDN, PERKESO (SOCSO
and EIS) and HRD Corp**. **The first live case is 15 November 2026, a Sunday**, the only weekend
15th left in 2026: `effective_due` becomes **Friday 13 Nov** for four obligations and **Monday
16 Nov** for EPF, while the statutory date stays 15 Nov for all five. Public holidays are **not**
modelled at all (no calendar exists, F-P7; Malaysian holidays are partly state-specific across
13 states + 3 federal territories), so every row carries
`working_day_basis = 'weekends_only'`.

**The question is two-part.** *(i)* Is the conservative roll-**back** what BELCORT actually
does, or does the firm in practice pay on the following Monday for all five? *(ii)* Should a
public-holiday calendar be built, and at what fidelity?

**Options for (ii).** **(a)** None; the weekends-only basis stays visible — v1's build.
**(b)** A federal-holidays-only table, accepting that state holidays are wrong. **(c)** Federal
+ state, with a per-client state fact. **(d)** Ask each regulator for its concession in writing
and model only the ones that answer.

**Recommendation: (a) for v1, then (d), and never (b).** A half-right holiday table is worse
than none: it produces a date that *looks* computed and is wrong in Sarawak. **Cost of (a):**
a public holiday falling on the 15th is silently unhandled — mitigated only by
`working_day_basis` being on the screen. **Cost of (c):** a new per-client fact, a holiday
table to maintain forever, and a maintenance duty nobody has been assigned. — **RULED 2026-08-30 (裁-39): (a) for v1, as recommended, and R-L24's directions confirmed** — **EPF rolls FORWARD to Monday**, every other obligation rolls **BACK to Friday**, and **public holidays are EXPLICITLY unhandled** with `working_day_basis` saying so on the screen. A half-right holiday table is worse than none. Part (i) is answered by the same ruling: the conservative roll-back is what the calendar shows.

### OQ-8 · An EPF / SOCSO / EIS rate table as a fourth Tier-1 table

**The finding.** `wave-f-contract.md:342-344` closed Tier-1 at **three** tables for Wave F —
`fx_rates`, the SST rate table, the SST threshold table — and stated *"Income-tax bands, capital
allowances, EPF/SOCSO/EIS, stamp duty and MTD are explicitly out until their own consumers land
(F-T2/F-T3)."* **Corrected in the fold (nit): `wave-f-contract.md`'s R-L25 (2026-08-23) reopened
the closure for exactly two more tables — F-T3's own two, seeded on the D17/R-L19 pattern — and
restated that EPF/SOCSO/EIS, stamp duty and MTD stay out.** F-T2 **is** a consumer landing, but
F-T2's consumption is **narration, not computation** (design §3.5), so the case for an EPF/SOCSO/
EIS rate table is weaker than the contract's original sentence implied, and R-L25 does not change
that — it widens the closure for a different lane's tables, not this one's.

**Options.** **(a)** No rate table in Wave F; the calendar cites rates as *text* on the seed row
where it needs them at all. **(b)** A fourth Tier-1 table with F-A8's fetch attached — a
**contract amendment**. **(c)** A migration-seeded rate table with **no** fetch door, outside
Tier-1 entirely — **this is no longer unprecedented (corrected in the fold): it is the exact
shape R-L25 already ruled for F-T3's two tables and for the deadline tables themselves (D17/
R-L19), so choosing it here would not need a new pattern, only the same one applied a third
time.**

**Recommendation: (a).** F-T2 does not compute a contribution, so it does not need a rate; it
needs a **deadline**. Opening a fourth Tier-1 table for a consumer that only narrates is cost
without a consumer. The real consumer is **F-T3**, and F-T3 should make the case.
**Cost:** if the owner later wants Clara to sanity-check a client's EPF figure against the
Third Schedule, that is a new item — and the survey's F-P8 says a schedule look-up across three
different wage bases is a bigger build than a rate row anyway. — **RULED 2026-08-30 (裁-39): (a), as recommended — NO fourth Tier-1 rate table.** F-T2 narrates a deadline; it does not compute a contribution, so it does not need a rate. The real consumer is F-T3, and F-T3 makes its own case.

---

## Annex E · Provenance — the rulings and messages this design set was written under

| when | from | what |
|---|---|---|
| 2026-08-23 | `tb-ft1-sst` | F-T1 mints `clara.sst_taxable_periods` + `clara.sst_returns` with a **computed** due date; `clara.sst_threshold_schedule` is **live** at `0016:237-244` and F-A8 is ALTERing it in **PR-3**; `clara.sst_rate_schedule` is **F-T1's to build** on `fx_rates`' pattern; the Tier-1 write door is **F-A8's** (`policy_drafts` → `_policy_sources_agree` / `_policy_value_plausible` → `decide_policy_draft` / `override_policy_draft` → `_policy_draft_commit_core`), and until it opens the tables are **migration-seeded only**. **Naming hazard: never `*_filings`.** |
| 2026-08-23 | `conductor` | Wake-kind chain and merge order: F-A2 PR-1 → **F-A4 PR-1b** → F-A3 PR-1b → F-A7 PR-4beta; F-T2 would be **fifth**. Three riders: PR-1b not PR-1; adopting F-A4's `agent_tasks` arm **≠** minting no wake kind; **the site list is re-derived by rig replay, never asserted as a count**, and each later migration re-reads the **live** CHECK with a prestate probe that aborts loudly. Plus: `pnpm db:migrate` **silently skips** any filename not starting with a digit — apply a numbered COPY on a rig, commit the `UNNUMBERED_*` stem. |
| 2026-08-23 | `conductor`, and independently from the orchestrator | **R-L22** — statutory due dates are ONE fact with ONE path: a developer-seeded, versioned, effective-dated **`clara.statutory_deadlines`**, **DDL owned by F-A4**, seeded like D17's price rows through the PR ladder, **every row cited to the regulator page + fetch date**, read by **F-A4's due oracle + cadence belt**. Contributors supply **rows and consumers only**. |
| 2026-08-23 | `tb-ft1-sst` | Withdrew its earlier "the calendar belongs to F-T2" recommendation and confirmed R-L22; part 2 (the policy-table shape and the Tier-1 three-table closure) stands. |
| 2026-08-23 | orchestrator | **R-L24** — **(1)** conflicting official sources → the **earlier** date, **both** citations, a visible **`conflict`** flag, never a silent pick; **(2)** weekend/holiday roll-over is a **per-regulator** `holiday_rule` column, EPF forward on its published concession and everything unverified **back** to the preceding working day, with the `unverified` state visible and the owner asked whether firm practice differs; **(3)** rates and wage bases are **not the calendar's business** but the four-base divergence matrix and the June-2026 SOCSO change go into the **survey** as cited, out-of-scope engine facts; **(4)** every row cites the regulator page + fetch date, and **AGC-era reprints are structural cites only**. |
| 2026-08-23 | `ft2-lhdn-research` (lane) | Grade-A byte-verbatim from the ITA 1967 (as at 21 May 2024), GPHDN 1/2024, GPHDN 2/2024, the 2026 filing programme and LHDN's own e-PCB Plus deck. Settled **five** things this design had wrong or open: **CP38 and CP39 ride PCB's own 15th** (Rule 10(1)(c)) · **dormancy is NOT a Form E exemption** · the **e-Filing grace is one month and filing-only** · **e-PCB Plus subsumes the three legacy names as MODULES**, so a page naming them proves nothing (law 27(3)) · **two LHDN web pages contradict the Act** (CP21's section, the s.120(1) fine) **and the Act wins**. LHDN's weekend rule is a **bounded negative**, three channels unreadable. |
| 2026-08-23 | `ft2-kwsp-research` (lane) | Browser-DOM reads of KWSP/PERKESO/HRD Corp plus gazette PDFs. Settled: **EPF's next-working-day concession is a DIRECT read** (employer FAQ 31), scoped to the Late Payment Charge · **the HRD Corp deadline conflict is three-way**, Reg 7's own text unverifiable (scanned PDF; AGC HTTP 500) · **HRD Corp handles holiday clashes by after-the-fact circular** (No. 2/2025) · **SOCSO/EIS weekend rule: measured NOT-FOUND** across three pages · the **four-base** divergence matrix · **SKBBK / LINDUNG 24 JAM** with its **31 August 2026** opt-out · **non-citizen EPF 2%/2% in force from 1 Oct 2025 with NO phase-up** (a positive absence). |

**What this design set did NOT receive and therefore does not assume:** any owner ruling on the
eight questions of Annex D; any confirmation that `clara.statutory_deadlines`' DDL will carry
A.1's columns; any **F-A4 PR-1c** merge (corrected in the fold, gate M11/M18/M19/M20 — v1 named
PR-1b here, the unrelated wake-kind-chain dependency named two rows above).

---

## Annex F · Change log

| version | date | change |
|---|---|---|
| **v1** | 2026-08-23 | First issue on branch track-b/ft2-payroll-design. Statutory surface re-verified the same day: grade-**A** byte-verbatim extraction of the ITA 1967, GPHDN 1/2024 and 2/2024, the 2026 filing programme, the LHDN e-PCB Plus deck, HRD Corp's media release and General Guidelines, PERKESO's LINDUNG 24 JAM FAQ, and the Act 452 / Act 4 / Act 800 / A1760 / A1788 gazette PDFs; grade-**B** browser-DOM reads of KWSP, PERKESO, HRD Corp and the live LHDN employer pages. **No code.** |
| **v1 (same-day revisions)** | 2026-08-23 | Folded **R-L22** (deadlines are F-A4's seeded table; F-T2 contributes rows + a consumer) and **R-L24** (conflict → earlier date + both citations + a visible flag; per-regulator `holiday_rule` with a second `effective_due` date; the four-base divergence and the June-2026 SOCSO change recorded as out-of-scope engine facts; reprints are structural cites only). Corrected **four v1 errors** on the research lanes' evidence: CP38/CP39 ride PCB's own 15th (**D-19**) · dormancy is not a Form E exemption (design §3.2) · EPF was wrongly put at seeding risk on a plain-fetch 403 (**D-09**) · the C.P.8D Praisi cut-off is its own row (**D-18**). Owner questions re-cut: the wake-sibling question became **D-17**, its slot taken by the **HRD Corp deadline conflict** (**OQ-6**); the answered dormancy question was replaced by the **Form E grace month** (**OQ-2**). |
| **v2 (gate-folded)** | 2026-08-23 | PR-0 gate (`payroll-calendar-gate-record.md`) confirmed 3 blockers, 19 materials and 5 nits against v1; 6 raised claims were refuted. **Eleven distinct corrections folded** (**D-20…D-27** plus three registered without a decision
entry, plus the row/count/cite nits above): `payroll_period_coverage`'s `undated_count` bound by
`filed_at` to the period (D-20) · the applicability matrix made total over the live `entity_type`
enum, with `society` and `other` routed to `not_evaluable` (D-21) · `payroll.cp8d_route`
threaded into the matrix (D-22) · a second new read, `clara.payroll_applicability`, named for
rung B2 (D-23) · `effective_due`/`holiday_rule`/`working_day_basis` added to the notice payload,
`weekend_label` dropped (D-24) · PR-1's DDL gate corrected from F-A4/PR-1b to F-A4/PR-1c
everywhere it was misstated (D-25) · battery cell 1 corrected to assert the grant matrix, not
`assert_wake_allowed` (D-26) · §6's acceptance claim withdrawn — no real-books round is reachable
today (D-27) · `client_fact_keys`' stale "two members" corrected to four at the frontier
throughout (§2, P-15) · the ungraded HRD Corp exemption claim dropped from the append-only
`hrdc_class` seed description, registered as **R-7** · the LLM-classification trust surface on
`covered` registered as **R-8**. Plus nits: the nine-row / three-`client_fact_keys`-row counts
trued everywhere they drifted to eight/two, the `wave-f-contract.md:405`→`:424` cite, and the
stale "Tier-1 closes at three tables" (R-L25 reopened it for two more). **Three blockers and four materials are owner-reserved** — recorded as open cards in the gate record, not resolved here: the `documents.financial_date` coverage anchor (B1/B14), the payroll period-basis anchor (M3), CP58's missing fourth fact (M5/M21), and the weekend-rule computation-of-time direction (M10, feeds OQ-7). |
