# Chart-of-accounts template — review rounds and adjudications

> Companion to `apps/dashboard/app/shared/coaTemplate.ts` and
> `malaysian-coa-official-research.md`. Two adversarial review rounds were run against the
> built template by `gpt-5.6-sol` (xhigh, read-only, web-search enabled), each grounded in
> official sources. This file records **what was found and what was decided** — the raw
> session logs are large and are not tracked. Read this before changing the template.

## Round 0 — the ground fact

Both the research lane and the review lane, independently, established the same thing:
**Malaysia has no statutory chart of accounts.** The phrase "chart of accounts" appears
zero times in MPERS and zero times in the Companies Act 2016 — both were extracted in full
and grep-verified. MPERS 4.9 says the standard "does not prescribe the sequence or format
in which items are to be presented", and 4.9(b) permits renaming and resequencing. CA 2016
s.245 is outcome-based.

So the template cannot be *copied* from anywhere. Its legitimacy rests entirely on
**mappability** — to the MPERS 4.2/5.5 face lines, the SSM MBRS (SSMxT) taxonomy actually
filed, and the LHDN Form C analysis. Everything below follows from that.

## Round 1 — completeness review (106 → 118 → 186 accounts)

Verdict: *"a strong foundation, but not yet safe as a universal professionally defensible
default"*. Three structural criticisms, all accepted:

1. **Tax conclusions were embedded in account names.** Adopted as **standing rule 1**: an
   account is named for the FACTS that drive its treatment, never for the outcome. Fixed
   in two waves — first the incorporation-cost accounts, then the entertainment,
   donations and legal-fee accounts in round 2.
2. **Conditional regimes were labelled "core".** The tier was renamed `core` → `standard`
   and redefined as *the practice's default set, prune per client* — not a universality
   claim. SST output, imported services, foreign workers, construction, zakat, welfare,
   intangibles and extended PPE became optional modules.
3. **Several accounts combined amounts the Form C or the tax computation needs
   separately.** Twelve splits applied (see the commit message for the list).

Two earlier factual errors of the orchestrator's own were caught and corrected here:
"qualifying/non-qualifying" incorporation naming (the 2003/2005 Rules key on an
**authorised-capital** ceiling that CA 2016 abolished — the mismatch is unresolved, so the
account stays "(tax review)"), and "directors' fees never attract EPF" (EPF/SOCSO turn on a
**contract of service**, not on the ledger label).

### Deliberate departures from round 1, with grounds

| Recommendation | Decision | Ground |
|---|---|---|
| Make deferred tax optional alongside the balance-sheet accounts | **All three standard** | Deferred tax is an accounting conclusion under MPERS Section 29, not a bookkeeping preference. Consistency was the real complaint; it is resolved upward, not downward. |
| Modularise SST entirely | **Output gated, purchase SST standard** | An unregistered buyer still bears supplier SST — it is a cost to everyone. Only the output/self-account obligations are registration-gated. |
| Modularise payroll | **Stays standard** | Nearly every operating Sdn Bhd pays someone, and the tier semantics — not the composition — were the defect. |
| Make `500-000`/`530-000` non-posting headers | **Renamed to residuals** | `clara.coa_accounts` has no posting flag. Recorded as limitation 3 rather than faked. |
| Keep `470-H02` interest-in-suspense as a legacy account | **Removed outright** | MPERS 20.9 measures the obligation net. A gross-instalment workflow is a per-client exception, not a default. |

## Round 2 — second-pass verification (186 → 193 accounts)

Verdict: *"not safe to ship unchanged"* — materially better, structurally intact, but
carrying **three material MPERS errors** and a wrong regulatory gate. All were real. All
are fixed.

### The four that blocked release

1. **`900-RND` stated the full-IFRS development test.** MPERS Section 18 expenses
   internally incurred expenditure on **both research AND development** as incurred,
   unless it forms part of another recognised asset. The IAS 38 development-capitalisation
   test does not apply. The note asserted the opposite. **Fixed.**
2. **Deferred tax notes claimed recognition is "mandatory where temporary differences
   exist".** Overbroad — Section 29 carries its own exceptions, and a deferred tax *asset*
   has a recoverability constraint. **Fixed**: recognition is *assessed under* Section 29.
3. **`340-UNB` used IFRS 15 "contract asset" vocabulary.** That is the MPERS (2025) third
   edition's model, not the Section 23 currently in force, which presents the gross amount
   due from/to customers. The header's claim that the template is "unaffected" by the 2027
   transition was correspondingly too strong. **Fixed**: current-model terminology
   throughout, and the header now says Sections 4/5 presentation survives the transition
   while **Section 23 does not**.
4. **`430-ITS` sat inside a registered-person-only module.** Wrong: a business recipient of
   an imported taxable service can be required to self-account **without** being a
   registered service-tax person (RMCD provides the non-registered workflow and return).
   **Fixed**: its own `imported-services` module, separately gated, test-pinned.

### Also fixed

- `430-SLT` implied an importer's output tax. Sales tax on imports is levied and collected
  at importation and is a cost of the goods — the account is now explicitly the
  **registered manufacturer's** output tax.
- Name-rule violations that survived round 1: the three entertainment accounts (now named
  for the fact patterns — staff/logo/promotional, clients/suppliers/non-logo, AGM/related-
  company/non-business — each citing its section), `900-DON` (now "with current approval
  evidence"), `900-L01`/`900-L02`.
- Unsafe notes: "permanent add-back candidate" on the collective allowances (a general
  allowance normally reverses — a timing question), "not a taxable amount" on disposal
  gains (RPGT/CGT exist), "falls inside the service-tax scope" on premises rental (now
  "may fall within"), "for a company incorporated after 2016" (an effective-era assertion),
  "revenue-natured duty only" on stamp duty.
- **Rule 2 contradicted the file**: notes legitimately cite the MPERS twelve-month
  classification criterion, which the rule as drafted forbade. The rule now names its three
  exemptions — statutory citations, the twelve-month criterion, and classification codes —
  and a test scans notes *and* blurbs for the things that are never allowed (a percentage,
  a ringgit amount).
- **`900-AMO` was orphaned**: standard, while every intangible asset was optional. Moved
  into the intangibles module, and a `module coherence` test now pins that a charge account
  never ships without the assets it charges (amortisation/intangibles, inventory
  write-down/allowance, IP fair-value movement/asset, HP finance charge/liability).
- **`900-L02` was a permanent P&L destination for capital transaction costs.** Redesigned
  as a **clearing line** — like `190-OBE` — that must be reallocated to the asset (MPERS
  17.10), the financial liability (Section 11) or equity (Section 22) before the statements
  are finalised. A residual balance is a finding.
- **The `mpers` field was free text with non-deterministic values** (`310-FD1` mapped to
  "Cash and cash equivalents / other current assets" — two mutually exclusive
  destinations). It is now a **closed set**, `MPERS_ROLLUPS`, test-pinned in both
  directions: every account maps into the set, and every value in the set is used. The
  ambiguous placements were split (`310-FD1` cash-equivalents vs `340-FD1` not), and the
  non-statutory ones labelled as such (`190-OBE` → "must clear to nil (no statutory
  roll-up)"). Borrowings adopt the MBRS "loans and borrowings" wording; zakat adopts
  "contribution to zakat".
- **Missing lines added**: the fair-value investment-property asset (`230-FV1` — the module
  had the fair-value *movements* but nowhere to carry the asset), inventory write-down and
  reversal (`620-IMP`), non-financial impairment under Section 27 (`900-IMP`), the current
  foreign-worker bond (`340-FWB`), and the non-current siblings the notes promised
  (`491-D01`, `491-R01`).
- **`610-100` vs `610-PUR` posting policy** stated explicitly in the block blurb —
  perpetual posts cost of sales, periodic posts purchases plus the `620-ADJ` movement, and
  mixing them double-counts. The account names now carry `(perpetual)` / `(periodic)`.

### Deliberate departures from round 2, with grounds

| Recommendation | Decision | Ground |
|---|---|---|
| Enforce the perpetual/periodic and residual policies with a posting guard | **Documented, not enforced** | No posting flag exists in `clara.coa_accounts` (limitation 3). A guard needs schema or application work — a Wave C candidate, not a silent workaround. |
| Add a reporting-profile dimension so `mpers` can serve by-nature and by-function presentations | **Recorded as limitation 4** | Real and correct, but it is a data-model change, not a template change. The strings name the by-function face line and carry the by-nature tags a by-function presentation must still disclose; the two known cross-function collectors are mapped to "must be reallocated". |
| Add an optional share-based-payment module | **Omitted deliberately** | The reviewer agreed it is not a ship blocker. Employee share schemes are rare in this SME population; the pair is better added per client. Recorded in the file. |
| Make `430-WHT` split by remittance class | **Single account, class per transaction** | Splitting is only defensible if the transaction metadata is mandatory, which the template cannot make it. The note requires the class to stay identifiable. |

## Standing conclusion

The template is a **defensible practice default, not an official list**. Its two standing
rules and four recorded limitations are part of the artefact: they say what it does not
know, which is what makes what it does say trustworthy. Any future change should be run
back through the same two questions — *does this name assert a conclusion the ledger cannot
support?* and *does this account map deterministically to one statement line?*
