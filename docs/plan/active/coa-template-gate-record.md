# 裁-21 — the standard chart of accounts: THE GATE · **OPEN**

> **STATUS: OPEN.** The gate has not sat. This is the must-answer set the owner reads, written
> to the standing grill protocol — **one question per turn, 大白话, the cost of each choice
> stated, a recommendation with its reason, and a fail-closed default the design proceeds on if
> the question is deferred.** Nothing in `coa-template-design.md` is build-authorised until this
> record closes.
>
> **Every question below is answerable in ONE LINE by a Malaysian accounting-firm principal.**
> That is deliberate: none of these is a database question dressed up as a domain question. The
> DB mechanics are settled in the design and the annexes; what is genuinely undecided is
> **firm practice**, and only the owner holds that.
>
> Set: `coa-template-survey.md` (as-found, with a live rig replay) · `coa-template-design.md`
> (the design, D-1…D-14) · `coa-template-annexes.md` (sources · the family cut · the battery ·
> frontend homes · the DDL · the build sequence) · this record.

---

## 0 · What the owner should know before answering (大白话, 60 seconds)

**What we found.** The product **already asks** every new client *"Apply the standard LHDN-aligned
MPERS Chart of Accounts seed?"* and the accountant must answer before the client can be created —
**and nothing in the system does anything with the answer.** No chart is ever applied. A brand-new
client's chart is empty, and staff build it by hand, client by client. That is the gap 裁-21
closes, and it is bigger than a missing feature: it is a promise on screen that the software
cannot keep.

**What we checked, and what does not exist.** We re-read the official sources on 2026-08-29.
**There is no official Malaysian chart of accounts.** LHDN does not publish one. MPERS tells you
the *minimum lines that must appear on the face of the accounts* (18 on the balance sheet, 9 on
the P&L) but no codes and no order. SSM's MBRS filing system has the closest thing to a standard
list of items — and every company has had to file into it since 1 June 2025 — but we could only
reach a 2022 draft of it, not the current one, so we are treating it as a cross-check, not a
foundation. **The upshot: a firm's standard chart is the firm's own professional judgement,
grounded in MPERS's required lines. It cannot be downloaded from anywhere.**

**What we are asking you for.** Mostly one thing: **your chart.** If BELCORT already has a
standard chart your staff use, that is the answer to half of these questions and the rest are
quick. The others are practice questions — what you do when you take over a client with existing
books, how hard Clara should trim, whether entertainment gets its own account.

**What we are NOT asking.** Nothing here changes the accounting rules, weakens a control, or
lets Clara write into the books unsupervised. Clara **proposes** which parts of your chart fit a
client; **a person applies it.** The design adds no new agent power over the books.

---

## 1 · The questions

Each carries: what is being asked (one line) · the **recommendation** and why · the **cost** of
the alternative · the **fail-closed default** if the question is deferred.

---

### Q1 · Do you already have a standard chart of accounts? — **the big one**

> **"Do you have a chart of accounts your staff already use for new clients — can I have it?"**

**Recommendation: hand it over, and it becomes the template.** A firm's standard chart is, by
definition, whatever the firm already standardises on. If BELCORT has one — in a spreadsheet, in
the old software, in a partner's head — that is the right answer and it beats anything we author.

**If you do NOT have one:** we seed a reviewable draft from MPERS's required line items
(`coa-template-annexes.md` Annex B's family list) and you edit and publish it. **Nothing applies
to any client until you publish** — the draft has no effect on anything.

**Cost of deferring:** everything else in this set still ships; the template just has our
draft chart in it instead of yours, and swapping it later is one `fork → edit → publish` cycle,
which is a normal act, not a migration. **So this question does not block the build.**

**Fail-closed default:** we author the MPERS-grounded draft, in `draft` state, unpublished.

---

### Q2 · What numbering do you use?

> **"Do your account codes look like `1000 / 2000 / 4000`, or like `300-000 / 400-000`?"**

Both are already allowed by the database. The estate's own seed uses 4-digit blocks; the one real
client chart in the repo (ROME PROPERTIES, carried down from its previous accountant) uses the
`300-000` form.

**Recommendation: 4-digit blocks** — `1xxx` assets · `2xxx` liabilities · `3xxx` equity ·
`4xxx` income · `5xxx` cost of sales · `6xxx` expenses · `9xxx` system accounts. It is what most
Malaysian SME packages use, it sorts correctly, and it leaves room to insert accounts.

**Cost of the alternative:** none technically — the `300-000` form works. But mixing the two
across clients is exactly the drift 裁-21 exists to stop, so **pick one and we hold it**.

**Fail-closed default:** 4-digit blocks.

---

### Q3 · Who applies the standard chart to a new client?

> **"Can any bookkeeper start a new client on the firm's chart, or must a partner do it?"**

**Recommendation: any bookkeeper applies it; only an admin/partner may EDIT or PUBLISH the
standard.** The asymmetry is the point — *setting* the firm's standard is a policy act, *using*
it is daily work. The chart can only be applied to a client whose books are still completely
empty, so the blast radius of a mistake is one brand-new client with no transactions.

**Cost of the alternative (admin-only apply):** a partner is in the loop for every single new
client, which will be worked around within a month, and a worked-around control is worse than
none.

**Fail-closed default:** bookkeeper applies, admin publishes.

---

### Q4 · Taking over a client who already has books — whose chart wins?

> **"When you take over a client from another accountant, do you put them on BELCORT's chart, or
> keep the previous accountant's chart?"**

**Recommendation: BELCORT's chart wins.** The client goes onto your standard chart, and the
previous accountant's trial balance is **mapped onto your codes** when the opening balances are
entered. A prior line that maps to nothing is a decision someone makes on purpose — map it, or
add an account — never a silent extra account.

**Why it must be settled and not left to case-by-case:** if both charts are present you get two
"Accounts Payable" accounts for one thing, and every report after that is quietly wrong with
nothing flagging it. The system will therefore **refuse** to apply the standard chart to a client
whose books already have accounts — you get one chart or the other, deliberately.

**The escape hatch, and it stays:** if a particular client's inherited chart is genuinely worth
keeping, answer **"no"** to the chart question at onboarding and build it their way. The system
then lists that client as *off-standard*, which is honest rather than hidden.

**Cost of the alternative (carry-down defines the chart):** every client stays on a different
chart, which is the problem you asked us to fix.

**Fail-closed default:** template first, balances mapped onto it.

---

### Q5 · Should the chart be applied automatically when the client is created?

> **"Should the chart go in automatically the moment the client is created, or should someone
> click 'apply' after reviewing what Clara suggested?"**

**Recommendation: a separate click, after creation.** Clara proposes which parts of the chart
fit; a person looks at the list and applies it. Onboarding already has three things a human must
personally do (accept the new-client proposal, sign the client's AI-consent letter, approve the
opening balances) — this is a fourth, and it is a short one.

**Cost of the automatic alternative:** it would have to be wired into the existing
"create the client" function, which is a live audited body — that means a **write-freeze window**
on the production database to deploy, plus the ceremony around it. It also removes the moment
where anyone actually *looks* at the chart. **We recommend against it, and the recommendation is
about review quality first and deployment cost second.**

**Fail-closed default:** a separate human click.

---

### Q6 · We don't know the client's industry yet — what should Clara suggest?

> **"If we don't know the client's industry code yet, should Clara put in the full standard
> chart, or only the accounts every business needs?"**

Context: the industry code (MSIC) is **optional** in the onboarding interview today — a client
can be fully created without one.

**Recommendation: only the accounts every business needs, and Clara says plainly that she does
not know the industry.** She never guesses an industry from the client's name.

**Cost:** the accountant adds the industry-specific block afterwards with one click (there is a
verb for exactly that). **Cost of the alternative** (full chart when unknown): every such client
carries a pile of irrelevant accounts nobody ever removes, and after a year the chart means
nothing.

**Fail-closed default:** core accounts only, absence stated.

---

### Q7 · Should the interview ask what the business actually does?

> **"Should we add one question to the onboarding interview — 'does this client sell goods,
> sell services, or both?'"**

We found that the system already has this field (`trade_nature`: goods / services / both), the
year-end close already uses it, and **nothing ever asks for it.** Meanwhile the interview asks
for the industry code, which is optional and which we cannot check against any official list.

**Recommendation: yes — add it, one question, three choices.** It is the single most useful thing
Clara can know when trimming a chart (a services company needs no Inventory, no Purchases, no
Cost of Sales), it is a proper validated field rather than free text, and the close already
benefits from it.

**Cost:** one extra question in the interview. **Cost of not doing it:** the trim runs on the
weaker signal, and the close keeps saying "unknown" where it could say something.

**Fail-closed default:** add it.

---

### Q8 · Separate accounts for the tax-sensitive expenses?

> **"Should the standard chart keep entertainment, donations, fines and depreciation in their own
> accounts, separate from general expenses, so the tax computation picks them up automatically?"**

**Recommendation: yes.** These are exactly the items that get added back in the tax computation.
If they sit inside "Operating Expenses", someone has to pull them out by hand every year, or
estimate a percentage — and an estimated percentage is a judgement number a person must key and
sign for. Give them their own accounts on day one and the tax computation reads them directly.

The list we propose: entertainment · approved donations · unapproved donations · fines and
penalties · depreciation and amortisation · leave passage · private/proprietor expenses · motor
vehicle running costs.

**Cost:** eight more accounts on the standard chart. **Cost of not doing it:** manual analysis
every year, per client, forever.

**Note on scope:** this question is about **how the chart is cut**, which ships now. Attaching
the actual tax treatment codes to each account waits for the tax-computation work (F-T3), which
has not been built yet — we are not building half of it early.

**Fail-closed default:** cut the families this way.

---

### Q9 · The onboarding question's wording

> **"Can I change the onboarding question from 'Apply the standard LHDN-aligned MPERS Chart of
> Accounts seed' to 'Start this client from the firm's standard chart of accounts'?"**

**Recommendation: yes, change it.** LHDN does not publish a chart of accounts — we checked. The
current wording claims an alignment that does not exist, and the question is on screen in front of
a professional user.

**Cost:** none — the change rides a workflow version that another train (F-A7b) is already
minting, so there is no extra deployment.

**Fail-closed default:** change it.

---

### Q10 · Does the equity section change by entity type?

> **"Should the standard chart swap the equity section by entity type — share capital for a Sdn
> Bhd, capital account and drawings for a sole proprietor, partners' capital and current accounts
> for a partnership?"**

**Recommendation: yes.** A sole proprietor has no share capital, and BEE CREATIVE's sole
proprietor is already a case in this system where the correct treatment is **equity, not a staff
advance**. Getting this wrong at setup is the kind of error that survives for years.

**Cost:** three small equity blocks instead of one. **Cost of not doing it:** every sole
proprietor and partnership needs the equity section rebuilt by hand.

**Fail-closed default:** swap by entity type.

---

### Q11 · What do you call the statutory payables?

> **"What exact names do you use for the EPF, SOCSO, EIS, PCB and SST payable accounts?"**

We did **not** research this — no official source prescribes the naming, and getting it wrong
means every client's chart carries a label your staff have to mentally translate.

**Recommendation:** give us the exact wording you use (English, or BM, or both). If you would
rather not think about it now, we use `EPF Payable · SOCSO Payable · EIS Payable · PCB / MTD
Payable · SST Output Tax Payable` and you rename them in the editor later, which is one edit.

**Cost of deferring:** none — renaming an account on the template is an ordinary act.

**Fail-closed default:** the English names above.

---

### Q12 · MSIC 2008 or MSIC 2025?

> **"When we record a client's industry code, should it be the MSIC 2008 code (what SSM and LHDN
> e-Invoice use today) or the new MSIC 2025 one?"**

**Recommendation: MSIC 2008, and we stamp which edition each recorded code belongs to.** MSIC
2008 is what SSM and LHDN e-Invoice currently key on; MSIC 2025 launched 2025-10-28 with routine
use expected from 2027. The system stores a bare five-digit code today with **no edition stamp**,
so a code entered next year cannot be told apart from one entered now.

**Note:** the chart trim keys on the *broad* level (the industry section or division), not the
five-digit code, precisely so an edition change does not silently break it.

**Cost of deferring:** the codes stay ambiguous, and someone pays for it in 2027.

**Fail-closed default:** MSIC 2008, edition stamped.

---

## 2 · What this gate does NOT decide

- **The tax treatment codes themselves.** F-T3 (the draft tax computation) owns
  `tax_treatment_codes`, and those are **owner-signed** with statutory citations. Nothing here
  pre-empts that; Q8 only decides how the chart is *cut*.
- **Anything about opening balances.** T2 owns the opening seed and the trial-balance tie-out;
  the five materials playbooks are already ruled (`fa7b-gate-record.md`, CLOSED 2026-08-27) and
  are not re-opened here.
- **Firm creation or the firm tiers.** R8(b)'s separate gate.
- **Whether a client-specific account should be blocked.** It is not blocked — it is reported.
  The design's D-11 records the three grounds; no owner ruling is needed unless the owner wants
  the opposite, in which case it becomes a new question.

---

## 3 · The design's own NEEDS-DECISION items, mapped

| Design item | Question |
|---|---|
| D-13 (the seed's provenance) + the interview wording | **Q1**, **Q9** |
| D-3 (`apply_coa_template`'s floor) | **Q3** |
| D-3 rung 5 (refuse on a non-empty chart) | **Q4** (it is the mechanism that enforces Q4's answer) |
| D-7 (the interview seam) | **Q7**, **Q9** |
| D-8 (the trim's fail-closed branch) | **Q6** |
| D-10 (template first, balances after) | **Q4** |
| D-12's rejected alternative (apply inside `commit_client_onboarding`) | **Q5** |
| D-14 (the tax-aware family cut) | **Q8** |
| Annex B.4 (the entity-type equity swap) | **Q10** |
| Annex B.5 (numbering) | **Q2** |
| Annex B.1 (`statutory_payables` names) | **Q11** |
| Annex A (MSIC edition) | **Q12** |

---

## 4 · The gate's own obligations on the build lane (independent of the owner's answers)

These do not need a ruling; they are recorded here so the gate closes on a complete list.

1. **PR-0's seven replay obligations** — `coa-template-annexes.md` Annex G. The headline: **find
   where `CLR37` entered `clara._upsert_account_core`** (survey F2b). The live body carries a rung
   that appears in no migration file this lane read, and until it is located nobody may claim to
   know the core's full ladder.
2. **Law 28's cross-model adversarial pass on PR-c is MANDATORY** — the trim reads
   model-proposed family names, which is an injection surface.
3. **The naming collision is a known fact, not a discovery**: `clara.chart_templates` and
   `clara.chart_template_versions` already exist and are **dataviz** chart specs (survey F10).
   Nothing in this feature may be called `chart_template*`.
4. **The `scope` column must be explicit**, never a `firm_id IS NULL` inference — and the
   platform-visibility cell must be **POSITIVE** (a bookkeeper of another firm IS returned the
   platform row), not merely a leak check.
5. **裁-22's implementing PR should extend its basis contract** to the fact-citation form
   (design D-9) rather than discover it — its own ruling requires both doors to move in one
   contract, and a third door with a fact-shaped basis is a contract question.
6. **The `/admin` shell may not exist in `apps/web`.** If the build lane finds none, this panel is
   its first tenant and that is a recorded scope note, never silently absorbed.
