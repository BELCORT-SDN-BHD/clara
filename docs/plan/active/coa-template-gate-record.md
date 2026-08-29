# 裁-21 — the standard chart of accounts: THE GATE · **CLOSED, all twelve RULED 2026-08-29**

> **STATUS: CLOSED — the sitting ran 2026-08-29 and all twelve are RULED (裁-23).** Each question
> keeps its recommendation, its cost and its fail-closed default verbatim, with the ruling
> written underneath; a gate record that erases what was argued cannot show why a ruling went the
> way it did. Ruling of record: `mohe-grill-rulings-2026-08-28.md` §裁-23.
>
> **The headline: there is no existing BELCORT chart, so the template is RESEARCH-DERIVED and the
> owner waived his review of the draft** — the agent adopts the best practice it finds across
> official Malaysian sources, Malaysian accounting best practice and what mainstream Malaysian
> software ships (newest editions) and **publishes it directly**. **A research lane therefore
> precedes PR-0**, and Q2/Q8/Q11 route to that same research rather than to a fixed answer.
> **Q2 was OVERRULED** (neither legacy numbering convention, by habit or otherwise) and **Q6
> WIDENED** (Clara asks first when the industry is unknown).
>
> *(Historical, pre-ruling:)* **The gate has not sat.** This is the must-answer set the owner
> reads, written to the standing grill protocol — **one question per turn, 大白话, the cost of
> each choice stated, a recommendation with its reason, and a fail-closed default the design
> proceeds on if the question is deferred.** Nothing in `coa-template-design.md` is
> build-authorised until this record closes.
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

**RULED 2026-08-29 (裁-23) — there is no existing BELCORT chart; the template is
RESEARCH-DERIVED, and the owner WAIVED his review of the draft.** Sources: official Malaysian
sources + Malaysian accounting best practice + what mainstream Malaysian accounting software
ships, **newest editions**; the agent adopts the best practice it finds and **publishes it
directly** — *"你自己找到了 best practices 后不用我审, 直接用"*. **This supersedes the fail-closed
default**: the template ships **published**, not as an unpublished draft awaiting the owner. It
still applies to no client until a human clicks (Q3/Q5). **Build consequence: a research lane
precedes PR-0.**

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

**RULED 2026-08-29 (裁-23) — OVERRULED: neither legacy convention. Follow the researched best
practice.** *"两个都不要用旧的东西"* — not the estate seed's 4-digit blocks carried by habit, and not
ROME PROPERTIES' inherited `300-000`. The numbering comes out of the same Q1 research as the
chart itself, and whatever it lands on is held firm-wide. **The recommendation (4-digit blocks)
and this fail-closed default are both set aside**; if the research independently arrives at
4-digit blocks, that is a research finding, not the incumbent surviving.

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

**RULED 2026-08-29 (裁-23) — as recommended, with the edit step made explicit.** The chain is
**Clara proposes the trim → a bookkeeper may EDIT the proposal (toggling families) and applies it
→ an admin publishes the template.** The owner confirmed both halves in his own words: the
proposal is editable before it is applied, and accounts can be added or removed afterwards. The
apply door's `p_families text[]` argument and `add_coa_template_family` are where that lands —
**no new permissive door.**

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

**RULED 2026-08-29 (裁-23) — as recommended: BELCORT's chart wins.** The predecessor's trial
balance is mapped onto it when the opening balances are entered; two charts on one client are
refused; the escape hatch (answer "no" at onboarding and build it their way, the client then
listed off-standard) **stays**.

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

**RULED 2026-08-29 (裁-23) — as recommended: NOT automatic.** A separate human click after the
client is created, consistent with Q3. `commit_client_onboarding` is not touched, so §7's D1
inventory stays EMPTY.

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

**RULED 2026-08-29 (裁-23) — WIDENED: Clara ASKS FIRST.** When the industry is unknown at apply
time she puts an **in-thread question to the human**, and proposes the full trim once it is
answered; **the core family may be applied meanwhile**. She still **never guesses the industry
from the client's name.** The recommendation (core-only plus the absent axis named) becomes the
interim state, not the end state — the ask is behaviour the design now owes, at D-8.

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

**RULED 2026-08-29 (裁-23) — as recommended: ADD the `trade_nature` question** (goods / services
/ both), one question, three choices, riding `clientOnboarding_v4`.

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

**RULED 2026-08-29 (裁-23) — YES on the shape; WIDENED on the content: the LIST comes from the
research.** Tax-sensitive expenses get their own accounts, and the set of them is **the LHDN
add-back items per the researched best practice, newest edition** — **not fixed to the eight
proposed above**, which become a floor to check the research against rather than the answer. The
scope note stands unchanged: this decides how the chart is CUT; the tax treatment codes are
F-T3's.

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

**RULED 2026-08-29 (裁-23) — as recommended: re-word it** to *"Start this client from the firm's
standard chart of accounts"*; the unsupportable "LHDN-aligned" claim goes.

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

**RULED 2026-08-29 (裁-23) — as recommended: the equity section swaps by entity type** (Sdn Bhd /
sole proprietor / partnership).

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

**RULED 2026-08-29 (裁-23) — WIDENED: mainstream Malaysian naming, per the research.** The owner
did **not** hand over a BELCORT wording; he routed the question to the same Q1 research lane —
whatever mainstream Malaysian practice and software call these accounts is what the template
carries. The English names above remain the fallback only if the research finds no dominant
convention, and renaming on the template stays an ordinary act.

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

**RULED 2026-08-29 (裁-23) — as recommended: MSIC 2008, with an edition stamp on every recorded
code.** The trim keys on the broad level, not the five-digit leaf, so an edition change cannot
silently break it.

---

## 1a · The COA maintenance model — RULED 2026-08-29 (裁-23)

The owner asked, in the same sitting, how the firm's chart is maintained after the first apply.
It is **NOT a background sync**, and the answer is a ruling, not a note:

- **Clara proposes at onboarding.** That is the only moment a whole chart arrives.
- **A later template edit never touches an applied chart.** The reason is structural, not
  disciplinary — the apply COPIES rows (design **D-2**), so nothing points back at the template.
- **The drift READ shows divergence** (design **D-11**) — a read, never a wall.
- **Clara may PROPOSE single-account additions in chat**: `wake_upsert_account` is already
  allowlisted for `interactive_client` (survey F3), so this needs no new authority. Every
  **structural** change stays propose → human click.
- **Humans may also maintain the chart manually**, exactly as they do today.

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
