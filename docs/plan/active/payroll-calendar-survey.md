# F-T2 · The payroll deadline calendar — the estate survey (as-found)

> **Item:** Wave F Track B **F-T2** — *"the payroll deadline calendar (documents→JV flow stays;
> no engine)"* (`wave-f-contract.md:405`). **PRD §8 non-goal:** *"A payroll engine → Code
> PCB/EPF/SOCSO/EIS + calendar the deadlines."* (`PRD.md:210`; capability §4 item 16 at `:86`.)
> **Companions:** `payroll-calendar-design.md` · `payroll-calendar-annexes.md`.
> **Written under** digest laws **80 · 81 · 16 · 19 · 2 · 27(2) · 31**, TA-P4 · TA-P5 · TA-P14
> clause 2, and the rulings **R-L22** and **R-L24** (§6).
> **This is a SURVEY: it designs nothing.** Every claim is cited to a byte or a URL, or carries
> the word **UNVERIFIED**.

---

## 0 · Method, instruments, and evidence posture

**Estate claims** were read out of this worktree on **2026-08-23** at the cited `file:line`. They
are **migration-TEXT reads, not live-body reads** — bodies here are spliced across generations, so
the text in any one file is *not* the live body. Every estate claim the design depends on is
restated in **§8 as a prediction the rig replay must settle** by `pg_get_functiondef` /
`pg_get_constraintdef` at the frontier. Graded **SEEN(text)**, never **SEEN(live)**.

**Statutory claims** were re-verified **today, 2026-08-23**, by this lane plus two dedicated
research lanes on the regulators' own domains. Four grades, never conflated:

| grade | what it means |
|---|---|
| **A** | **Byte-verbatim.** The Act or official PDF was downloaded (HTTP 200 recorded) and text-extracted locally. The quote is the actual bytes. |
| **B** | **Direct read of a live page.** One hop, no index — either a plain fetch, or, where the site is Cloudflare-fronted, **driving a real browser to the live URL and reading the rendered DOM**. Some HTML reads are additionally summariser-mediated; where so the fact is cited but **not** presented as verbatim. |
| **C** | **Index only.** The domain was searched; the body was never read. **Never sufficient to seed a row** (§8 P-11). |
| **D** | **FAILED.** Retrieval was attempted and could not be completed. **Absence proves nothing.** |

**Reachability is per HOST *and* per PATH CLASS, and the instrument lies about availability, not
about content.** Measured today, and recorded because a future seed author who probes with the
wrong tool will mis-grade a row:

| target | plain fetch | note |
|---|---|---|
| `hasil.gov.my/wp-content/uploads/*.pdf` | **HTTP 200**, real `application/pdf` | **every grade-A LHDN source came through here.** Browse the `/en/…` index page for the link, then plain-`curl` the PDF |
| `hasil.gov.my/media/*` · the e-CP39 FAQ · the Form E sample | **404** (a 243 KB HTML error page) | killed both e-PCB Plus media statements |
| `hasil.gov.my/en/employers/*` | **404** | the live slugs are `/en/majikan/*` |
| `phl.hasil.gov.my` | **ECONNREFUSED** | separate host, down today |
| `kwsp.gov.my` · `perkeso.gov.my` | **HTTP 403**; `curl` with a browser UA → Cloudflare *"Just a moment…"* | a **real browser renders them**. A plain-fetch 403 here means *the tool was refused*, **never** *the page is gone* — demoting a KWSP row on a 403 would be wrong |

**Where an A source and a B source disagree, A wins** — that rule fired twice today, both times
against an LHDN web page and in favour of the Act (§1.3). **AGC and regulator reprints are
STRUCTURAL cites only** (R-L24): Act 452's reprint reads *"Incorporating all amendments up to 1
January 2006"* and PERKESO's consolidations are *"As at 1 September 2022"*, so they establish a
definition or a section number and **never a current rate, ceiling or date**. No secondary
source (a firm's blog, a vendor, a news site) is cited anywhere in this document.

---

## 1 · The statutory surface, re-verified 2026-08-23

### 1.1 The monthly five — all on the 15th, five different sentences, one conflict

| # | Obligation | Instrument | Wording | grade |
|---|---|---|---|---|
| **M1** | **PCB / MTD** remittance | **Rule 10(1), Income Tax (Deduction from Remuneration) Rules 1994 [P.U.(A) 507/1994]**, read with **s.107(2) ITA 1967** | *"membuat bayaran PCB dan/atau CP38 kepada KPHDN **tidak lewat daripada hari ke-15 tiap-tiap bulan kalendar** bagi potongan bulan sebelumnya"* | **A** [S1 ¶3.1(c)] |
| **M2** | **EPF** contribution | EPF Act 1991 [Act 452] s.45(3) (*"within such period as may be prescribed"*); Late Payment Charge under **s.49(1)** | *"The employer must pay their employee's contributions **on or before the 15th of the following wage month**."* | **B** [K1] |
| **M3** | **SOCSO** | Employees' Social Security Act 1969 [Act 4] | *"Contributions payable for any month must be paid **no later than the 15th day of each succeeding month**"* | **B** [P3] |
| **M4** | **EIS / SIP** | Employment Insurance System Act 2017 [Act 800] s.20(1) | **the same sentence on the same page** — SOCSO and EIS share one channel, one form and one date | **B** [P3] |
| **M5** | **HRD Corp levy** | PSMB Act 2001 [Act 612] s.14 / s.15; Reg 7, P.U.(A) 141/2001 | **CONFLICT — see below** | **A/B** |

**M1's two riders, and both are calendar facts.** **CP38 is NOT a separate clock** — Rule 10(1)(c)
says *"bayaran **PCB dan/atau CP38**"*, so a DGIR direction recovering an employee's arrears is
remitted **with** the PCB on the **same 15th**, as a separate amount on the same statement
[**A**, S1 ¶3.1(b)(c)(d)]. And **CP39 is the statement furnished WITH the payment** (name per
IC/passport, IC or passport number, tax reference, the PCB and/or CP38 amount) [¶3.1(d)] — whose
own warning is a real firm failure mode: *"**Kegagalan majikan mengemukakan data yang lengkap dan
tepat akan menyebabkan bayaran PCB dan/atau CP38 tidak akan diproses**"* — money moves and the
liability does not clear. **Penalty:** Rule 17, **RM200–RM20,000** / ≤6 months / both [¶3.4],
**plus s.75A(1)(b) ITA** making a director holding **≥20%** of ordinary share capital **jointly
and severally liable** for unpaid PCB.

**M5 — the HRD Corp conflict, all three sources on `hrdcorp.gov.my`.**

- **15th**, Employers FAQ: *"by every **15th of the month**."* [**B**, H1/H2]
- **15th**, media release 29 July 2025: *"As stipulated under the … PSMB Act 2001, all registered
  employers are required to make their HRD levy payments **on or before the 15th of every
  month**."* [**A**, H3]
- **Last day of the following month**, General Guidelines: *"Under **Regulation 7** … an employer
  who is liable to pay the HRD levy will have to pay **not later than the last day of the month
  immediately following** the month in respect of which the payment falls due."* [**A**, H4]

H4 is visibly legacy — it still names Public Bank and RHB as collection agents and Forms 2A/2B/2C
as the mechanism, i.e. it **predates e-TRiS**. **Regulation 7's own current text could not be
verified**: HRD Corp's PDF of P.U.(A) 141/2001 is a **scanned image with no text layer**
(`pdftotext` yields only the cover) and AGC returned **HTTP 500** for Act 612. Under **R-L24**
the seed row takes the **earlier** date (the 15th), carries **both** citations, and shows a
`conflict` flag. **OQ-6.**

### 1.2 The annual set — and one semi-annual duty most calendars miss

| # | Obligation | Section | Wording | grade |
|---|---|---|---|---|
| **A1** | **Form E + C.P.8D** | **s.83(1) ITA 1967** | *"Every employer shall, for each year, furnish to the Director General a return in the prescribed form **not later than 31 March in the year immediately following**…"* | **A** [S2] |
| **A2** | **Form EA (C.P.8A) / EC (C.P.8C)** | **s.83(1A) ITA 1967** | *"every employer shall, for each year, **prepare and render to his employee** a statement of remuneration of that employee **on or before the last day of February in the year immediately following**…"* | **A** [S2] |
| **A3** | **Form CP58** | **s.83A ITA 1967** | *"**Every company** shall for each year prepare and provide to **each of its agent, dealer or distributor** a copy of the form prescribed…"*, *"**not later than 31 March in the year immediately following**"* | **A** [S2] |

- **A1's e-Filing grace is one month — and it is FILING grace ONLY.** The 2026 filing programme
  gives Form E *"Tambahan Masa = 1 bulan"* (e-Filed by **30 April 2026** counts as in time), **but
  ¶1(iii) expressly excludes Form E from the s.103(1) payment-side extension** [**A**, S3]. Two
  different dates for one form. **OQ-2.**
- **A1's e-Filing is MANDATORY for every employer** — companies and Labuan companies from **year
  of remuneration 2016**, all others from **year of remuneration 2023** [**A**, S3 ¶1(i); the lane
  re-extracted this table in raw reading order because the layout render interleaved its columns
  and would have mis-paired every row]. **Year of remuneration**, not year of assessment.
- **C.P.8D has its OWN cut-offs and gates A1's completeness.** *"Borang e-E **hanya dianggap
  lengkap jika C.P.8D dikemukakan sebelum atau pada tarikh akhir** pengemukaan Borang e-E"*
  [**A**, S3 ¶2(i)(a)]. Two mutually exclusive routes: **e-Data Praisi on or before 25 February**;
  **e-CP8D on or before the e-E due date**. A firm on the Praisi route therefore has a **25
  February** obligation a month and six days ahead of the 31 March one.
- **Dormancy is NOT an exemption from Form E** [**A**, S3 ¶2(i)(b)]: *"**Syarikat, perkongsian
  liabiliti terhad, badan amanah dan koperasi yang dorman adalah WAJIB mengemukakan Borang e-E dan
  C.P.8D**"*. The only relief is narrower — sole proprietorships, partnerships, Hindu joint
  families and estates **with no employees** are exempt from the **C.P.8D only** and still file
  Form E [¶2(i)(a)]. **Encode entity type and employee count as two flags, never one.**
- **A2 is rendered to the EMPLOYEE and is NOT filed with LHDN** — the statutory verb is *"prepare
  and render to his employee"*; the LHDN-facing counterpart is the C.P.8D on Form E. Stated
  negatively because conflating the two is the commonest firm-side error. Concretely:
  *"memberikan borang tersebut kepada semua pekerja **pada atau sebelum 28 Februari 2026**"*
  [**A**, S3 ¶2(ii)].
- **A3 says "every COMPANY", not "every employer"** — narrower than the rest of this calendar —
  and like A2 it is **provided to the recipient, not filed**.
- **Semi-annual, and easy to miss:** **Form TP1 must be processed not less than TWICE a year** —
  *"tidak kurang daripada dua kali (2) dalam tahun semasa"* [**A**, S1 ¶4.2(b)] — and every new
  hire must be told to furnish **TP3** [¶3.1(g)(i)]. **Retention: 7 years** for tax [S1 ¶3.1(f)]
  against **6 years** under **Employment Act 1955 s.61** [**A**, E1] — **retain to 7**. Penalties
  for A1/A2/A3 are **s.120(1) ITA — RM200–RM20,000 / ≤6 months / both**, not s.112 [**A**, S2].

### 1.3 The event-triggered notices — 30 days each, and a 90-day withholding

| Form | Trigger | Section | Deadline (verbatim) | online mandatory from |
|---|---|---|---|---|
| **CP22** | commences employing a chargeable individual | **s.83(2)** | *"not later than **thirty days after** the commencement of the employment"* | **1 Sep 2024**, e-CP22 |
| **CP22A / CP22B** | cessation / death (private / public) | **s.83(3)** | *"**not less than thirty days before** the cessation… or in respect of cessation by reason of death **not more than thirty days after being informed of the death**"* | **1 Jan 2024**, e-SPC |
| **CP21** | employee leaving Malaysia **> 3 months** | **s.83(4)** | *"**not less than thirty days before** the expected date of departure"* | **1 Jan 2024**, e-SPC |

All four are **A**-grade from the ITA consolidated to 21 May 2024, and **the Finance Act 2020 move
from one month to 30 days has landed** — the Act reads *"thirty days"* throughout s.83(2)(3)(4);
only stale third-party mirrors still say "one month". **s.83(4A)** makes electronic furnishing the
statutory requirement. **Two LHDN web pages contradict the Act and the Act wins both times** —
which is why the A/B split exists: the cessation page cites *"Subsection 106"* for CP21 (**it is
s.83(4)** [S2, S4 ¶3.1]) and the termination page states the s.120(1) fine as *"not more than
RM2,000"* (**it is RM20,000** [S2]).

**The withholding rule, byte-verbatim** [**A**, S2 s.83(5)]: the employer *"**shall not, without
the permission of the Director General, pay any part of those moneys … until ninety days after
the receipt by the Director General of the notice**"*. **Ninety days from LHDN's RECEIPT**, not
"until the tax clearance letter arrives" — the two differ at both ends. **The exposure is not the
fine:** an employer in breach of s.83(3)/(4)/(5) is *"bertanggungjawab untuk membayar sepenuhnya
cukai yang kena dibayar oleh pekerjanya"* and must pay over the undeducted tax under **s.107(4)**
[**A**, S4 ¶3.3].

### 1.4 Weekends and public holidays — four regulators, four different measured states

| regulator | state | evidence |
|---|---|---|
| **EPF** | **measured YES — a standing published concession** | KWSP employer FAQ **item 31**, read out of the live page's own DOM: *"**31.** If the 15th falls on a public holiday and payment is made on the next working day, will the employer still be imposed with a Late Payment Charge? **No.** … if the 15th falls on a public holiday or weekend, payment made on the next working day will not be imposed with a Late Payment Charge."* [**B**, K1]. Note its scope: it removes the **Late Payment Charge**; it does not on its face speak to the separate **Dividend** imposition. |
| **SOCSO / EIS** | **measured NOT-FOUND across the three pages that own the topic** | The deadline sentence and the 6% p.a. interest clause were read in full under PERKESO's own heading *"Contribution Payment Period"*; **there is no holiday or weekend qualifier anywhere in that section**, and none on `contributions.html` or `rate-of-contribution.html`. A NOT-FOUND across three pages, **not** a proof of absence [**B**, P1/P2/P3]. |
| **LHDN** | **a BOUNDED NEGATIVE, and the survey will not upgrade it to a "no"** | The operative text is unqualified (§1.1 M1) and a grep of GPHDN 1/2024 and the 2026 filing programme for `cuti\|minggu\|kelepasan\|sabtu\|ahad\|umum` returns nothing on point; the employer FAQ page now carries **stamp-duty FAQs only**. **But three channels could not be read today** — the whole `hasil.gov.my/media/*` tree **404s**, the e-CP39 FAQ **404s**, and `phl.hasil.gov.my` **refuses connections**. A concession could be sitting in any of them. **Report as "not found in the instruments read", never as "LHDN publishes none".** |
| **HRD Corp** | **no standing rule — but POSITIVE evidence of an ad-hoc mechanism** | Circular **No. 2/2025** / the media release of 29 July 2025 moved the **August 2025** levy deadline to **Friday 19 September 2025** because 15 September 2025 was declared an additional public holiday [**A**, H3]. HRD Corp handles a clash **by issuing a circular after the fact**. A calendar cannot compute that shift; it can only watch for the circular. |

**The dates this bites, computed locally (calendar arithmetic, not a legal claim):** **15 November
2026 is a SUNDAY** — the only weekend 15th left in 2026 (15 Aug 2026 was also a Saturday and has
passed; Sep, Oct and Dec are weekdays) — and **28 February 2027**, the Form EA date, is a Sunday
too.

### 1.5 Channels — and one identity trap worth the space

- **e-PCB Plus exists and the three familiar names now denote MODULES INSIDE IT.** LHDN's own
  briefing deck [**A**, S5]: *"Sistem Potongan Cukai Bulanan (PCB) baharu **e-PCB Plus
  dibangunkan bagi menggantikan sistem sedia ada iaitu e-PCB, e-Data PCB dan e-CP39** di bawah
  satu platform menerusi portal MyTax"*; Phase 1 from **24 September 2024**, *"berfungsi
  sepenuhnya dengan pembukaan menu bayaran pada **3 Februari 2025**"*. The next slide,
  *"PILIHAN FUNGSI PERKHIDMATAN DI DALAM e-PCB PLUS"*, defines all three as functions **within**
  the platform. **So a page naming "e-PCB / e-Data PCB / e-CP39" cannot distinguish the legacy
  standalone portals from the new modules — the name is a projection, not the system** (law
  27(3)). `…/en/majikan/pembayaran-pcb/`, read directly today, names the three and **never
  mentions e-PCB Plus**; that is most likely stale content and **staleness cannot be proven** from
  the page. **UNVERIFIED:** any *mandatory-from* date (no official source uses *mandatori/wajib*
  with a date), and whether the legacy portals were retired — the document that would settle it is
  the **8 January 2025 media statement, which 404s today**.
- **Cheques are gone for direct tax** — cheque and Money Order/Postal Order discontinued at all
  LHDN counters, collection agents and Post Office from **1 August 2023** [**B**, S11].
- **EPF: `i-Akaun (Employer)` + Form A** — *"e-Caruman" appears nowhere on the current KWSP
  employer pages*, so treat it as superseded. **PERKESO: Form 8A**, and *"Self-printed Form 8A …
  are **NOT ALLOWED**."* **HRD Corp: e-TRiS**, biller code **500181**; Form 1 (registration within
  30 days of liability), Form 2 e-slip, Form 2C (interest), Form 3 (arrears).

### 1.6 Facts a future payroll engine would need — RECORDED HERE, OUT OF F-T2 SCOPE (R-L24)

**None of the following is built, consumed or relied on by F-T2.** R-L24 puts them here because
they are expensive to re-derive and because they are the evidence that §8's non-goal is a
*capability* boundary, not a preference.

**(a) FOUR wage bases, not three — and overtime and bonus move in opposite directions.**

| component | EPF | SOCSO | EIS | HRD levy |
|---|---|---|---|---|
| Basic salary · fixed allowances · leave pay | in | in | in | in |
| **Overtime** | **OUT** — Act 452 s.2(b) | **IN** — Act 4 s.2(24) | **IN** — Act 800 s.2 | **OUT** |
| **Annual bonus** | **IN** — s.2 *"includes any bonus"* | **OUT** — s.2(24)(e) | **OUT** — s.2(e) | **OUT** |
| **Commission** | **IN** — s.2 | **IN** — PERKESO list | ⚠️ not excluded by s.2 → in, **statutory reading only** | **OUT** |
| Service charge | **OUT** — s.2(a) | **IN** | ⚠️ statutory reading | not enumerated |
| Travelling allowance / mileage · gratuity · retrenchment · termination | OUT | OUT | OUT | OUT |
| Shift / night / attendance / production incentive | IN | IN | IN | **OUT** (each named) |
| **Benefits-in-kind** | OUT | OUT | OUT | OUT — ⚠️ derived from each definition's *"in money"* limb, **not** an official BIK enumeration |
| **Non-Malaysian employees** | IN (2% band) | IN | IN | **OUT — Malaysian citizens only** |

Sources: Act 452 s.2, Act 4 s.2(24), Act 800 s.2 [**A/G**]; KWSP FAQ 8/11/19/21/23, PERKESO's
employer guide and HRD Corp's support centre for the operational lists [**B**]. The ⚠️ cells are
flagged, not smoothed: **PERKESO publishes no separate EIS inclusion list**, so EIS
commission/service-charge treatment rests on non-exclusion plus the shared schedule. HRD Corp's
formula, verbatim: **`LEVY = [(BASIC SALARY − UNPAID LEAVE) + FIXED ALLOWANCE] × 1%`**, and *"the
wages of employees are not permitted to be deducted under any circumstances for the payment of
the levy."*

**(b) The June-2026 SOCSO change — and an owner-facing deadline EIGHT DAYS from today.**
**Employees' Social Security (Amendment) Act 2026 [Act A1788]** — assent **23 Feb 2026**,
gazetted **5 Mar 2026** [**G**] — inserts *non-employment injury* (s.2(14a)), substitutes s.6 so
**both** categories are *"paid by the employer and the employee"* (**the Second Category gains an
employee side it never had**), and replaces the whole Third Schedule with Parts I–VI. The scheme
is **SKBBK / LINDUNG 24 JAM**, in force **1 June 2026**, **mandatory for foreign workers and
voluntary for locals from 8 July 2026** [**A**, PF1 Q3/Q9]. It is **entirely employee-funded —
the employer contributes nothing** [Q31/Q32] — at **0.75% in Phase 1** (1 Jun 2026 – 31 May 2028),
1.00% Phase 2, 1.25% Phase 3, on wages capped at **RM6,000**. So the **combined First Category
from June 2026 is employer 1.75% (unchanged) and employee 1.25% = 0.5% Keilatan + 0.75% SKBBK**
[Q34] — *the "0.5% → 1.25%" move; the SKBBK component itself is 0.75%, not 1.25%.*
**The opt-out closes 31 August 2026 — eight days from today:** *"Sekiranya tiada pemilihan tidak
menyertai (opt-out) dibuat sehingga tempoh **31 Ogos 2026**, pekerja adalah **diaktifkan secara
automatik**"* [Q8], thereafter **"Sekali Layak, Terus Layak"** [Q7], via the Portal Lindung
Faedah or a Notis Pelepasan Liabiliti. **June 2026 is mandatory for everyone and non-refundable**
[Q9]; refunds run from July 2026 and are claimed **by the employer** through ASSIST [Q11–Q13].

**(c) EPF for non-citizen employees is IN FORCE, and there is NO phase-up.** **EPF (Amendment)
Act 2025 [Act A1760]** (assent 24 Apr 2025, gazetted 14 May 2025) inserts **Third Schedule Part
F: 2% employer / 2% employee** and deletes the old carve-outs [**G**]. KWSP: registration and
contribution *"starting **1 October 2025**"*, first payment by **15 Nov 2025**, **direct
percentage not the Third Schedule table**, rounded **up to the next whole ringgit**, **no wage
limit**, **no age-band split**, minimum-wage floor on the base, domestic servants excluded
[**B**]. **Permanent Residents are NOT in the 2% band** — PRs sit with Malaysians on Parts A/C.
**No escalation clause exists in Act A1760 and the strings "phase" and "increase" are absent from
KWSP's dedicated page** — a positive finding: **do not build a scheduled step-up.**

**(d) Rates, ceilings, penalties.** SOCSO First Category 1.75% employer + 0.5% employee, Second
Category 1.25% employer; EIS 0.4% total (0.2% + 0.2%) [**B**, P2]; **insured-wage ceiling RM6,000
from 1 October 2024**, up from RM5,000 [**B**, P1]. EPF and SOCSO/EIS amounts are **schedule
look-ups** (Third Sch. Act 452; Third Sch. Act 4; Second Sch. Act 800), not straight percentages.
Late payment: **EPF** s.49(1) — the lower dividend rate + 1%, minimum **RM10**, plus the separate
**Dividend** where payment falls into the following month; **SOCSO/EIS** **6% p.a.** per day
[**B**, P3]; **HRD Corp** **10% p.a.**, minimum **RM5**, plus s.20(5) disqualification from
training grants while in default. **MTD 2026 carries no formula amendment** [**A**, S6].
**HRD Corp Circular No. 1/2026** exempts registered **education-industry** employers from the
levy for **January–December 2026**.

### 1.7 UNVERIFIED — the closed list

Weekend/holiday treatment for **LHDN** (bounded negative, three channels unreadable), **SOCSO**,
**EIS** and any standing **HRD Corp** rule · **e-PCB Plus**'s mandatory-from date and whether the
legacy portals were retired · whether **CP38** directions are served electronically · the
**gazette texts** prescribing the 15th (P.U.(A) 507/1994 Rule 10 read only via LHDN's guideline;
the EPF Regulations; the Act 4 / Act 800 regulations) · **PSMB Act 612 s.2 "wages"** and
**Reg 7's current text** (scanned image; AGC HTTP 500) · the **P.U.(B)** appointing Act A1760's
commencement · any **phase-up** for the non-citizen EPF rate (positively absent) · an official
**EIS wage-inclusion** enumeration · the foreign-worker levy (MOHA/Immigration) · **PERKESO
ASSIST 2.0** · the paper **CP39** form text · LHDN's **payment-channel ↔ module** matrix.

### 1.8 Sources — all accessed 2026-08-23

**Grade A** (downloaded + text-extracted), all under `hasil.gov.my/wp-content/uploads/` unless
stated: **S1** GPHDN 1/2024 (MTD guideline) · **S2** Income Tax Act 1967, consolidated **as at
21 May 2024** · **S3** *Program Memfail Borang Nyata 2026* (issued 30 Dec 2025) · **S4** GPHDN
2/2024 (SPC) · **S5** LHDN e-PCB Plus briefing deck 2025 · **S6** MTD Computerised Calculation
Spec 2026 (upd. 01 Jan 2026) · **S7** P.U.(A) 123/2021 · **H3** HRD Corp media release 29 Jul
2025 and **H4** HRD Corp General Guidelines (`hrdcorp.gov.my/wp-content/uploads/`) · **PF1**
PERKESO LINDUNG 24 JAM FAQ v2.1 (`perkeso.gov.my/images/lindung/lindung-24-jam/faq-2.1.pdf`) ·
**E1** Employment Act 1955 reprint (`lom.agc.gov.my`).
**Grade G** (Act / amendment PDFs): Act A1788 and Act 800 (perkeso.gov.my) · Act A1760, Act 452,
Act 4 (lom.agc.gov.my).
**Grade B** (live page, direct read): **L1** `hasil.gov.my/en/majikan/tanggungjawab-majikan/`
(footer *"Last updated on: 18/06/2026"*) · **L2** `…/en/majikan/pembayaran-pcb/` · **S8–S11** the
other `/en/majikan/*` and `/en/syarikat/*` pages · **K1**
`kwsp.gov.my/en/employer/responsibilities/payments` (browser DOM; FAQ 31),
`…/mandatory-contribution`, `…/non-malaysian-citizen-employees` · **P1**
`perkeso.gov.my/en/rate-of-contribution.html` · **P2**
`…/our-services/employer-employee/contributions.html` · **P3** `…/pembayaran.html` · **H1/H2**
`supportcentre.hrdcorp.gov.my/portal/en/kb/articles/hrd-levy`, `hrdcorp.gov.my/faq`.
**Grade D** (failed today): see the §0 reachability table, plus AGC Act 612 (**HTTP 500**) and
HRD Corp's P.U.(A) 141/2001 PDF (scanned image, no text layer).

---

## 2 · The documents→JV flow as it exists today — and F-T2 does not touch it

The contract's parenthesis *"documents→JV flow stays"* is a **preservation clause**. What it
preserves, at the bytes:

- **`payroll_summary` is a first-class document kind** since Slice-0 — `documents.document_kind`
  CHECK `0007:35`, carried verbatim by `0014:67`, `0016:3204,3327`, `0017:695`, `0024:428`,
  `0026:1292,1458`. **SEEN(text).**
- **A payroll summary is STRUCTURALLY excluded from the invoice-facts lane.** `0016:5512` states
  it — *"payroll_summary NEVER reaches invoice_facts (skipped_kind)"* — and `0016:5550-5561` is a
  self-proving probe that classifies a document as `payroll_summary` and **raises** if it reaches
  `invoice_facts`. Two live cells hold it from outside
  (`a21-classifier-gate.test.mjs:196-206`, `x-receipt-routing.test.mjs:146-149`). **A wall that
  has been asked** (law 31).
- **So a payroll summary is filed, then coded by hand like any other voucher.** Filing carrier
  `clara.document_filings` (`0007:63`); coding lane `clara._coding_lane_core(p_client, p_filing)`
  (`0011:1459`, recut `0013:212`), surfaced by `clara.list_uncoded_filings` (`0009:2824`);
  approval `clara.approve_entry` (`0004:519`) over the shared `clara._approve_entry_core`
  (`0037:1750`), which F-A2's `clara.wake_post_entry` also calls as its delegate
  (`f-a2-agentic-posting-design.md:65-77`).
- **There is no payroll-specific coding help anywhere.** A repo-wide grep across `packages/` and
  `apps/` for the fifteen payroll terms returns only the document-kind literal, the unrelated
  Wave-D staff-advance `payroll_deduction` application kind (`0043:544,2302,2538`), and one
  advisory bank-line classifier: **`clara._bank_line_class_hint(p_description)`**
  (`0040:3180-3197`), mapping narration words to `'epf'`/`'lhdn'`/`'perkeso'`/`'sip_eis'`/
  `'payroll'` (matching `salary` and `gaji`) under its own header *"ADVISORY,
  INFORMATIONAL-ONLY … NEVER authoritative"*. It is the estate's only existing signal that a
  statutory remittance has left the bank account.
- **No statutory payroll COA is seeded.** `packages/db/seeds/0002_core_seed.sql` (164 lines) seeds
  no `410-*` payable. The `410-001/003/004/005/006` WAGES/EPF/SOCSO/EIS/PCB **ACCRUED** codes
  exist only as evidence about **one real client's own chart**
  (`slice6/6-rpr-corpus.md:62-66`; `wave-a2/F-rpr-eval-corpus.md:142,182-183,236`) and as a
  Wave-B proposal (`coa-codex-completeness-review.md:336-349`, adding `410-007` PCB/MTD payable
  and `410-008` HRD Corp levy payable). **A client's chart is the client's.**

**Consequence, and it is the whole shape of the item:** today a payroll summary arrives, is filed,
and is coded to a multi-leg JV by a human, and **nothing in the product knows a remittance is due
on the 15th.** That is exactly the gap the pre-rebuild audit recorded as **`GAP2-6` · HIGH** —
*"Payroll accounting is scaffolding-only … the PRD's 'calendars the deadlines' claim has no
implementation at all"* (`docs/audit/01-findings-report.md:3167-3174`).

---

## 3 · The clock spine as-found

- **A clock exists; a clock that wakes Clara does not.** `packages/runtime/lib/leader.mjs` runs
  **six** finite-guarded daily cadence belts (`:41-73`, fired from `:176-195`); each calls a DB
  verb directly under `clara_runtime`, **none mints a wake credential and none enqueues an agent
  task** (`close-key-1-survey.md` F10 `:255-270`, plus `leader.mjs:35-73` read here).
- **Date arithmetic belongs to the DB, and it is written down.** `0041:3613-3615`: *"THE SWEEP'S
  DUE PROBE … **DB-OWNED DUE ARITHMETIC — the runtime must not compute a period, because a period
  is a figure.**"* Shipped as `clara.depreciation_run_due(uuid)` (`0041:3617`) twinned by
  `clara.adjustment_run_due(uuid)` (`0045:5513`). The house legal date is `clara._book_today()`
  (`0042:4592`), `Asia/Kuala_Lumpur`, sampled per statement.
- **F-A4 is building the wake half.** `close-key-1-design.md:170-201` §3.3: a DB due oracle, a
  **seventh** leader belt that *"computes nothing"*, and a new WDK workflow.
- **The wake surfaces, at the migration text.** `clara.wake_credentials` (`0002:230`) with the
  CHECK **pair** `ck_wake_credentials_kind_0011` / `ck_wake_credentials_client_0011`
  (`0011:623-628`); `clara.wake_fn_allowlist(wake_kind, function_name)` (`0002:247-251`);
  `clara.mint_wake_credential` (`0004:687`), whose body at 0004 refuses anything but
  `interactive`/`proactive`; `ck_agent_tasks_kind_0011` (`0011:1251-1252`) and **both** trigger
  bodies, whose dispatches end `else raise 'unknown task kind %'` (`0011:1241`) and `else false`
  (`0011:1277`). **SEEN(text) only** — the conductor's standing rule is that the **site COUNT is
  re-derived by rig replay, never taken from any design's tally.**
- **`clara.wake_record_notification(p_kind, p_payload, p_client, p_op_key)`** (`0004:654`) is
  **already allowlisted for `interactive` and `proactive`** (`0002:557-558`) and **already granted
  to `clara_wake_proactive`** (`0004:789`). It writes `clara.notifications(firm_id, client_id,
  kind, payload, created_by)` via `clara._record_notification_core` (`0004:272`), which audits
  (`0004:291-293`) and settles an `op_receipts` row. **`notifications.kind` is bare `text not
  null` with NO CHECK** (`0003:184-192`) — **a new notification kind needs no migration.** Two
  constraints: a **`proactive` credential is single-use** (consumed `0004:674-679`, replay-safe
  only for the same `op_key`), and it carries **`client_id is null`**, so the client rides
  `p_client`.
- **`proactive` is allowlisted for EXACTLY ONE function.** `0002:553-558` seeds five rows, one of
  them `('proactive','wake_record_notification')`; `0011:3903-3910` adds six `autodraft` rows and
  one `interactive` row and **nothing for `proactive`**; `0078:181` says in its own words that its
  row is `'interactive'` **and never `'proactive'`**. That is PRD §4 item 18's *"speak-never-act,
  structurally enforced"*, already built and already granted.

---

## 4 · Deadline / obligation prior art, and what is missing

- **`clara.statutory_deadlines` does not exist.** No table, no function, no reference in this
  worktree. It is **minted by F-A4 under R-L22** (§6). **NOT SEEN — structural.**
- **Effective-dated policy tables exist and have a shape.** `clara.sst_threshold_schedule`
  (`0016:237-244`) is the live exemplar — composite PK `(service_group, effective_from)`,
  `effective_to`, **`source_note text not null check (btrim(source_note)<>'')`**, seeded by the
  migration at `0016:245-248`, header stating *"System-maintained: shipped by migrations, NO
  firm-editable writer exists (asserted in the tail)"*. F-A8's `internet-lane-design.md:183-186`
  re-shapes the greenfield `fx_rates` on `client_facts` (`0055:386-420`): surrogate `id`,
  half-open effective range, `superseded_by`/`superseded_at` with a paired CHECK, and the
  WHO/BASIS/WHEN trio.
- **The Tier-1 write door is F-A8's and is not open yet.** `wake_submit_policy_draft` →
  `clara.policy_drafts` → `_policy_sources_agree` / `_policy_value_plausible` → the owner
  one-click `decide_policy_draft` / `override_policy_draft` → `_policy_draft_commit_core`
  (`internet-lane-design.md:98,136-138,150,160,169,176`). **`p_table_key`'s closed set is
  `{'fx_rates'}` at PR-1** (`:424`), and the **Wave-F Tier-1 list CLOSES at three tables** with
  *"EPF/SOCSO/EIS … explicitly out until their own consumers land (F-T2/F-T3)"*
  (`wave-f-contract.md:342-344`). **A fourth Tier-1 table inside Wave F is a contract amendment.**
- **F-T1 keeps its due dates in its own period model** — `clara.sst_taxable_periods` (computed
  `due_date`) and `clara.sst_returns` (`tb-ft1-sst`, 2026-08-23). Under R-L22 both lanes
  contribute **rows to one table**, not paths.
- **No Malaysian public-holiday calendar and no business-day arithmetic exist** — grep for
  `public_holiday|holiday|business_day|working_day` across `packages/db/migrations/*.sql` and
  `packages/runtime/lib/*.mjs` returns **zero hits**. **NOT SEEN — structural** (**F-P7**).

---

## 5 · The chase carrier, receipts, and the human surface

- **`clara.open_questions` (`0011:796-836`)** is the durable question carrier, opened by
  `clara.wake_open_question(p_client, p_scope_kind, p_scope_id, …)` (`0011:1984`). Two closed
  worlds — `scope_kind in ('document','vendor','client')` and `origin in ('clarify_promotion',
  'rule_proposal','rule_conflict','sweep_refusal','manual')` — plus `ck_open_questions_scope`
  binding each scope to its own id column. **Extending it is precedented and extend-only**: F-A3
  is adding a `bank_line` scope and a `bank_ambiguity` origin
  (`bank-agency-annexes-2-record.md:276`, the D34 precedent).
- **Receipts today are `clara._audit` + `clara.op_receipts`.** A dedicated
  `clara.agent_act_receipts` is **F-A4's** (`close-key-1-annexes-2-record.md` §E.3) — designed,
  **UNBUILT**. TA-P4's citation mechanism is **F-A8's** — designed, **UNBUILT**
  (`internet-lane-design.md:280-288`).
- **The human surface.** `apps/dashboard/app/` has fifteen page routes and **no `api/route.ts`
  anywhere** — pages call PostgREST `rpc()` directly. The crude-door idiom is
  `apps/dashboard/app/close/page.tsx` (header `:1-27`): `"use client"`, dev auth = a pasted
  session JWT in `sessionStorage` under the shared `clara_dev_jwt` key, reads via named RPC
  wrappers in a sibling `*Api.ts`, **no new writer invented**, every row *"shape + label (a glyph
  plus a text word), never hue-only and never a raw digit"*, **"The UI computes no cents"**, and
  a two-layer client-switch race guard (AbortController + a generation ref). TA-P14 clause 2's
  bar: *"The UI may be crude; it may not be absent"* (`0074:313-314`).

---

## 6 · The rulings this lane received, 2026-08-23

Four, in full in **`payroll-calendar-annexes.md` Annex E**; in one line each here because they
change what the design may build.

- **R-L22 (laws 80/81).** Statutory due dates are **ONE fact with ONE path**: a developer-seeded,
  versioned, effective-dated **`clara.statutory_deadlines`**, **DDL owned by F-A4**, read by
  **F-A4's due oracle + cadence belt**; contributing lanes supply **seed rows and a consumer** —
  no carrier, no second oracle, no clock.
- **R-L24.** Conflicting official sources → the **earlier** date + **both** citations + a visible
  **`conflict`** flag, never a silent pick · weekend roll-over is a **per-regulator** column ·
  rates and bases are **not the calendar's business** but are recorded here as engine facts
  (§1.6) · every row cites the page + fetch date, and **reprints are structural cites only**.
- **The wake-kind chain (`conductor`).** Merge order `F-A2/PR-1` → **`F-A4/PR-1b`** →
  `F-A3/PR-1b` → `F-A7/PR-4beta`; F-T2 would be **fifth**. Adopting F-A4's `agent_tasks` arm does
  **not** by itself decide whether a kind is minted, and **the site list is re-derived by rig
  replay, never asserted as a count.**
- **Naming hazard (`tb-ft1-sst`).** **Never `*_filings`** — `clara.document_filings` (`0007:63`)
  owns that word for documents. Tax uses "return" and "obligation".

---

## 7 · The findings that bind the design

| id | finding | grade |
|---|---|---|
| **F-P1** | A payroll summary is a filed document with **no downstream machinery**; the invoice-facts wall refuses it and **has been asked**. | SEEN(text) |
| **F-P2** | **No statutory payroll COA is seeded**; every `410-*` in the repo is evidence about one client's chart. The only payroll signal in the product is `_bank_line_class_hint`'s five advisory words, self-declared non-authoritative. | SEEN(text) |
| **F-P4** | `clara.statutory_deadlines` does not exist; **F-A4 mints it** (R-L22). F-T2 is a row contributor and a consumer. | NOT SEEN (structural) |
| **F-P5** | A chase notice needs **no new wake kind and no new migration**: `proactive` is allowlisted for **exactly one** function, already granted, and `notifications.kind` has no CHECK. | SEEN(text) |
| **F-P6** | `open_questions` can carry a payroll question at `scope_kind='client'`, but its `origin` closed world needs an extend-only widening — a shared surface with an F-A3 precedent. | SEEN(text) |
| **F-P7** | **No public-holiday calendar and no business-day arithmetic exist**, and the four regulators are in **four different** measured states (§1.4). | NOT SEEN (structural) |
| **F-P8** | There are **FOUR** wage bases, not three, and overtime and bonus move in **opposite** directions between EPF and SOCSO/EIS. Reproducing any of it is the forbidden engine. | A/B per §1.6 |
| **F-P9** | Tier-1 **closes at three tables** for Wave F; an EPF/SOCSO/EIS rate table is a **contract amendment**. | SEEN(text) |
| **F-P10** | PRD §4.96 names **staff allowances**, **self-billed e-Invoice detection** and **WHT-as-a-mechanic** as Wave F behaviours; grep of `wave-f-contract.md` finds **none of the three**. | SEEN(text) |
| **F-P11** | The audit's **`GAP2-6` (HIGH)** is this item's ancestry and states the same gap in the pre-rebuild system. There is **no `apps/dashboard/app/api/**/route.ts`**; a crude door is a client page over PostgREST `rpc()` on `/close`'s idiom. | SEEN(text) |
| **F-P13** | **CP38 and CP39 ride PCB's own 15th**, inside Rule 10(1)(c) — they are calendar items, not free-floating events. | A |
| **F-P14** | **Dormancy is not an exemption from Form E**; the only relief is from C.P.8D, and only for four unincorporated forms with no employees. Entity type and employee count are **two** flags. | A |

---

## 8 · Predictions the rig replay must settle

Every one is a **migration-text read the build must re-derive live** at the frontier
(`pnpm db:migrate` + `pnpm db:seed` on a throwaway Postgres 17, PG* vars, never `DATABASE_URL`),
recording the pinned `prosrc` sha256.

| id | prediction |
|---|---|
| **P-1** | The live `wake_credentials` kind CHECK **pair** is `ck_wake_credentials_kind_0011` + `ck_wake_credentials_client_0011`, and by F-T2's merge point its member list contains the three original kinds plus the four Track-A kinds. **The count of extension sites is re-derived, never asserted.** |
| **P-2** | `clara.mint_wake_credential`'s live body still refuses any kind outside its own list — i.e. a `proactive` notice needs **no change to it**. |
| **P-3** | `clara.wake_fn_allowlist` still contains `('proactive','wake_record_notification')`. |
| **P-4** | `clara.notifications.kind` still carries **no CHECK**; `clara.open_questions`' `origin` CHECK at the frontier contains F-A3's added member (the live list is read, not assumed). |
| **P-6** | `clara._bank_line_class_hint`'s live body still returns the five statutory literals of `0040:3180-3197`, and `clara._book_today()` is live, `stable`, `Asia/Kuala_Lumpur`. |
| **P-8** | `clara.sst_threshold_schedule`'s live definition still carries `source_note not null check (btrim(source_note)<>'')`; `documents.document_kind`'s live CHECK still contains `payroll_summary` and `tax_correspondence`. |
| **P-10** | The `payroll_summary` → `invoice_facts` wall still **REFUSES** when asked (a behavioural cell, not a substring match). |
| **P-11** | Every statutory row F-T2 seeds is **re-fetched on the day the seed migration is authored**, and a **grade-C** source is upgraded or **the row is not seeded**. The e-PCB Plus / legacy-channel state and the HRD Corp Regulation 7 text are re-read then too; where still unverified, the field is left NULL rather than guessed. |

---

## 9 · What this survey deliberately does NOT cover

**Any payroll computation** — gross-to-net, contribution amounts, PCB, EA figures (PRD §8; §1.6
is recorded evidence, **not** a build input) · **`staff allowances`**, PRD-named Wave F and
unscheduled by the contract (F-P10) — raised as **OQ-1**, not designed · **the e-filing act
itself** (law 80: *"statutory PREPARATION is hers and submission stays human"*; ADR-0075 excludes
e-filing **by nature**) · **F-T1's SST rows and F-T3's CP204** — other lanes' rows in the same
table · **a payroll subledger, an employee register, or any employee-level datum** (law 19:
*"No employee counterparty kind, ever."*).

**One live matter surfaced, not built:** the **31 August 2026** LINDUNG 24 JAM opt-out (§1.6b) is
**eight days away** and is a real advisory question for BELCORT's clients with local employees. A
one-off election is not a recurring calendar row — it goes to the owner as a fact, today.
