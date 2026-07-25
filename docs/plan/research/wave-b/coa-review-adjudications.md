# Chart-of-accounts template — review rounds and adjudications

> Companion to `apps/dashboard/app/shared/coaTemplate.ts` and
> `malaysian-coa-official-research.md`. Rounds 1 and 2 are adversarial reviews of the built
> template by `gpt-5.6-sol` (xhigh, read-only, web-search enabled), each grounded in official
> sources; **round 3 is a capability round**, adding the sole-proprietorship entity shape;
> **round 4 is an adversarial review of round 3**, and is the first round whose findings are
> mostly about the PRODUCT rather than the accounting — what the workbench can actually do,
> and what the DB actually does on refusal. This file records **what was found and what was
> decided** — the raw session logs are large and are not tracked. Read this before changing
> the template.

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

## Round 3 — entity shape: sole proprietorship (193 → 196 accounts, 21 → 22 blocks)

Not a review round. A **capability** round, forced by a real client: **BEE CREATIVE SOLUTION**
(202103229799 / PG0516352-X), a **sole proprietorship** whose accountant-prepared management
accounts present equity as *balance b/f · profit · drawings*, certified personally by the
proprietor and filed on **Form B**, not Form C. Clara had onboarded only Sdn Bhd clients.
`clara.coa_accounts` is client-scoped and entity-agnostic; only the default template was
Sdn-Bhd-shaped.

### The ground fact of this round

**MPERS does not reach a sole proprietorship, and nothing else does either.** MASB defines a
private entity as *"a private company as defined in section 2 of the Companies Act 2016"*
that neither prepares nor lodges financial statements under a Securities Commission or Bank
Negara law and is not a subsidiary, associate or jointly controlled by an entity that does.
A business registered under the **Registration of Businesses Act 1956** is not a company.
Reading Act 197's own arrangement of sections (SSM's official reprint as at 1 June 2017)
settles the rest: Part I preliminary, Part II registration/renewal/termination, Part III
appeal, offences, penalties, rule-making, service, exemption, electronic filing — **no
accounts, no financial statements, no audit, anywhere in the Act**. Its long title is "An Act
to provide for the registration of businesses."

What *does* bind is **ITA s.82**, on which LHDN's Public Ruling **Keeping Sufficient Records
(Individuals & Partnerships)** requires books "sufficient to explain the transactions and to
enable a true and fair profit and loss account and a balance sheet to be prepared" (3.3.2),
and separately names records of **private money brought into the business** (3.4.3),
**personal drawings** (3.4.4) and **capital and current accounts** (3.4.7).

And **Form B** supplies the actual output shape. Part K, *Financial Particulars of Individual
(main business only)*, balance sheet, carries verbatim: **Capital account**; **Current account
balance brought forward**; **Current year profit / loss**; **Drawings / advance (Net)**;
**Current account balance carried forward** — plus **Non-allowable expenses** on the P&L side.
That is LHDN itself analysing proprietor equity into a capital account and a current account.

So the same logic round 1 applied to Form C ("the streams Form C analyses separately each get
their own line") applies here to Form B.

### The structural constraint that shaped the design

`clara.uq_coa_special` is `UNIQUE (client_id, special_acc_type) WHERE special_acc_type IS NOT
NULL`, and `ck_coa_retained_earnings_equity` (0017 K7) forces that marker onto an
`account_type='equity'` row. Gate K's `_draft_opening_item_core` resolves **both**
`opening_balance_equity` **and** `retained_earnings` by marker and raises `CLR31` if either is
missing; the `obe_plug` kind posts its signed amount **between the two marker-resolved
accounts**. So for a sole proprietor the **capital account must take the retained-earnings
slot** — verified against the migration, not assumed.

### The three findings, and what was decided

1. **The `equity` block was doing two jobs.** It held company equity (share capital,
   reserves, retained earnings, dividend clearing) *and* `190-OBE`, which is machinery every
   client needs. A sole proprietor must drop the first four and keep the fifth — impossible
   while they share a block. **Decided: `190-OBE` moves to the `system` block**, beside
   `999-R00`. Both are marker-resolved, entity-agnostic, machine-owned and required by a DB
   mechanism rather than by any presentation standard; `190-OBE` was already documented as
   "not a statutory presentation concept" and already maps to "must clear to nil (no
   statutory roll-up)". This is a correction, not a workaround. Standard-block account count
   is unchanged at 145 — the account only moved between two standard blocks.
2. **Two blocks now legitimately carry the same `retained_earnings` marker**, and the DB
   permits only one per client. Selecting both would raise a unique violation **mid-apply**,
   after the earlier accounts had landed. Documentation alone was not good enough for a
   failure that partial-seeds a chart. **Decided: a minimal, explicit mechanism** —
   `CoaTemplateBlock.conflictsWith?: readonly string[]`, declared on both sides, plus
   `conflictingBlockKeys()` reading it in both directions, plus a conflict-aware
   `toggleBlockKey()`. The workbench mutates the selection only through `toggleBlockKey`, so
   no component change was needed. Four cells pin it: symmetry, "only `retained_earnings` may
   duplicate and only across those two blocks", "no two STANDARD blocks conflict" (the
   default selection would otherwise be un-appliable), and the toggle's drop-on-select.
3. **No `MPERS_ROLLUPS` value fitted.** Mapping a proprietor's capital to
   "Equity — retained earnings" would assert a company presentation for an entity outside
   MPERS, and the closed set exists precisely so that adding an account forces a deliberate
   mapping. **Decided: extend the set by two, saying so in the strings themselves** —
   `"Equity — proprietor's capital (no MPERS roll-up)"` and
   `"Equity — proprietor's capital movement (no MPERS roll-up)"`, following the `190-OBE`
   precedent. Recorded as **limitation 5**: the field is named `mpers` and now serves an
   entity MPERS does not reach; only the equity section actually diverges, and the fix is the
   same per-client reporting-dimension change limitation 4 already asks for.

### The block as built — `sole-proprietor`, optional, 3 accounts

| Code | Name | Why it exists |
|---|---|---|
| `100-CAP` | Capital contributed by the proprietor | Form B's separate *Capital account* figure; PR record of private money brought into the business. Kept apart from `150-CAP` so the roll-forward is readable — `160-DIV`'s role, reversed. **→ the `160-DIV` analogy and the movement roll-up are WRONG; superseded by round 4 F4, and the account is renamed.** |
| `150-CAP` | Proprietor's capital account | Carries `special: "retained_earnings"`. The accumulated position (b/f + result − drawings) and the account Gate K's carry-down targets. **→ renamed "Proprietor's capital account — accumulated" by round 4 F5.** |
| `160-DRW` | Drawings | Contra-equity. Form B *Drawings / advance (Net)*; PR 3.4.4 record of money taken out for personal or family use. |

`150-CAP`'s note states the **naming tension** outright: `special_acc_type='retained_earnings'`
is a DB mechanism, not a claim about the account's title; the carry-down resolves the marker,
not a code; "retained earnings" is a company concept and this entity has no shareholders, so
the marker's wording must not be imported into the name.

The blurb names what to **deselect** (`410-DIV`, `900-D01`, `900-D04`, `900-D05`, and the four
director related-party balances `250-DIR`/`350-D01`/`420-D01`/`472-DIR` — there are no
directors, and owner money is capital, not a related-party balance with a separate legal
person) and what to **keep** (the whole System block: `190-OBE` and `999-R00`, without which
the carry-down refuses). A test asserts every one of those eight codes appears in the blurb.

> **→ SUPERSEDED by round 4 F1.** The workbench has no per-account deselection, so that
> instruction named an operation the product cannot perform, and the test pinned prose rather
> than behaviour. The eight moved into the standard `company-officers` block, which
> `conflictsWith: ["sole-proprietor"]` drops automatically; the test now asserts the outcome.

### Deliberate departures and non-additions, with grounds

| Considered | Decision | Ground |
|---|---|---|
| Split `150-CAP` into a strict Form B *capital account* + *current account* pair, marker on the current account | **One accumulated account, with the analysis explained in its note** | The client's own accountant — and Malaysian SME practice generally — runs a single capital account. A split the books do not hold invites the opening plug to land in the wrong half, and the template has no non-posting/header guard (limitation 3). `100-CAP` gives the Form B capital figure its own line without forcing the split. |
| An expense account for the proprietor's own EPF (i-Saraan) / SOCSO Act 789 contributions | **No account; the fact goes in the drawings note and the blurb** | Verifiable: those are self-employed schemes, and a proprietor cannot be his own employee, so they are **not** employer contributions on a contract of service and do not belong in `900-E01`/`900-E02`/`900-E07`. **Not** verifiable from an official source in this round: whether they are a business deduction or a personal relief. Typing the account (expense vs equity) would have asserted exactly that unverified conclusion. Round 1/2's rule holds — refuse to state what cannot be grounded. |
| A "loan from proprietor" liability | **Omitted** | A sole proprietorship is not a separate legal person; funds introduced are capital. A client that genuinely needs the presentation adds it by hand. |
| Rename `MPERS_ROLLUPS` now that it carries non-MPERS values | **Kept the name, recorded limitation 5** | A rename ripples through the model, the workbench and the tests for zero behavioural gain; the two strings say "no MPERS roll-up" in their own text, which is where a reader actually looks. |
| Enforce mutual exclusion in the apply path or the DB | **Recorded as limitation 6** | `toggleBlockKey` is the only enforcement point. A hand-assembled block list still meets a mid-apply `uq_coa_special` violation (safe to retry — `coaSeedOpKey` is deterministic — but a refusal, not a warning). A real guard is an apply-path or DB-side change, i.e. Wave C. **→ REVERSED and CORRECTED by round 4 F2/F3: the apply-path guard was built, and "safe to retry" was false — the failure rolls back its own op-key reservation, so it re-raises forever until the marker is cleared.** |

### What could NOT be verified in this round

- **The current-year Form B item numbering.** `hasil.gov.my` served an HTML shell to every
  PDF request in this session (both WebFetch and a direct download). The Part K labels above
  were extracted verbatim from the **Form B 2021** PDF; a later-year snippet suggests the
  financial-particulars part may have moved to Part N. **The template therefore cites the
  Form B item LABELS, never the K-numbers** — an item number is an effective-dated fact of
  exactly the kind standing rule 2 keeps out of the ledger.
- **The revised text of PR 5/2000.** `phl.hasil.gov.my` refused connection throughout. The
  quotations are from the CTIM-hosted copy of PR 5/2000 (1 March 2000); a *(Revised)* version
  exists and was not read. The three provisions relied on (3.3.2, 3.4.3, 3.4.4) are
  record-keeping requirements, not treatment rules.
- **Whether a proprietor's own i-Saraan / Act 789 contributions are deductible against
  business income** — see the table above. Deliberately left unstated.

### Sources

- MASB, *Approved Accounting Standards for Private Entities* — private-entity definition and MPERS scope: <https://www.masb.org.my/pages.php?id=20>
- SSM, *Registration of Businesses Act 1956 [Act 197] as at 1 June 2017* (official reprint) — arrangement of sections: <https://www.ssm.com.my/Pages/Legal_Framework/Document/ROBA%201956_Act%20197_as%20at%201%20June%202017.pdf>
- SSM / MalaysiaBiz, *Sole Proprietorship / Partnership*: <https://malaysiabiz.gov.my/en/portal/sole-proprietership-partnership>
- LHDN, *Public Ruling 5/2000 — Keeping Sufficient Records (Individuals & Partnerships)*, s.82 ITA 1967 (CTIM-hosted copy; the LHDN host refused connection): <https://www.ctim.org.my/file/news/14/00044_Keeping%20Sufficient%20Records%20(Individuals%20&%20Partnerships)%20-%20PR%2005-00%20(010300).pdf> · revised version (unreachable this round): <https://phl.hasil.gov.my/pdf/pdfam/PR5_2000_Rev.pdf>
- LHDN, *Form B — Resident Individual Who Carries On Business*, Part K financial particulars: <https://www.hasil.gov.my/media/qjgl3j2a/form_b2023_2.pdf> (current year; not fetchable this session) — labels extracted from the 2021 form: <https://cukaipendapatan.wordpress.com/wp-content/uploads/2017/10/form_b_2021_2.pdf>
- Income Tax Act 1967 s.39(1)(a)/(b) (KPMG Malaysia's reproduction of Act 53): <http://www.kpmg.com.my/kpmg/publications/tax/22/a0053s0039.htm>
- PERKESO, *Self-Employment Social Security Act 2017 [Act 789] as at 1 March 2020*: <https://www.perkeso.gov.my/images/imej/akta_dan_peraturan/Act%20789%20-%20As%20at%201%20March%202020.pdf>
- EPF, *i-Saraan — voluntary contributions for the self-employed*: <https://www.kwsp.gov.my/en/member/savings/i-saraan> (403 to WebFetch; description taken from the search index, not read directly)

## Round 4 — adversarial review of round 3 (196 accounts, 22 → 23 blocks)

An adversarial review of the round-3 capability work, adjudicated by the orchestrator. Five
findings, **all accepted**. No account was added or removed — the account total stays 196 and
the standard set stays 145; eight accounts only **moved between standard blocks**, exactly as
`190-OBE` did in round 3.

### F1 — the blurb instructed an operation the product cannot perform, and a test made it look enforced

Round 3's `sole-proprietor` blurb told the operator to "ALSO DESELECT, per client" eight codes:
`410-DIV`, `900-D01`, `900-D04`, `900-D05`, `250-DIR`, `350-D01`, `420-D01`, `472-DIR`.
**There is no per-account deselection anywhere in the product.** Panel 2 of the accounts
workbench renders one checkbox per BLOCK, and `apps/dashboard/app/accounts/api.ts` exposes only
`listAccounts` + `upsertAccount` — no deactivate, no delete. All eight lived inside
`liabilities`, `operating-expenses`, `non-current-assets` and `current-assets`: four blocks a
sole proprietor needs in full. So a sole proprietor onboarded **through the product** received
Dividends payable, Directors' fees, Directors' salaries and bonuses, Directors' benefits and
four director related-party accounts, with no way to remove them.

Worse, `accountsModel.test.ts` asserted only that the eight strings appeared in the blurb. It
pinned the PROSE and read as enforcement — the failure mode this project keeps finding: a green
test proving something untrue.

**Decided: a new STANDARD block `company-officers`** ("Directors and distributions — company
only"), holding exactly those eight, declaring `conflictsWith: ["sole-proprietor"]`. The
mechanism round 3 already built carries it: `toggleBlockKey` drops the block automatically, the
standard total is unchanged at 145 (accounts only moved between standard blocks), and the "no
two STANDARD blocks conflict" cell still passes because `sole-proprietor` is optional. This
also widened what `conflictsWith` is *for*: round 3 admitted only a DB-constraint reason, and
the type doc now states the second admissible reason — an account set that presupposes a legal
form the other entity does not have — because selection is per block and a note cannot carry it.

The prose test is **replaced by two behaviour cells**: selecting `sole-proprietor` yields a
selection containing none of the eight codes, and the company default still contains all eight
(a re-homing, not a silent deletion).

### F2 — an already-seeded client could not switch entity shape, and the silent path was worse than the refusal

`toggleBlockKey` guards the in-session selection only; it knows nothing about rows already in
`clara.coa_accounts`. The real path is mundane: `sole-proprietor` is optional and unchecked, so
an operator applies the default first, realises the client is a sole proprietorship, ticks the
block and re-applies. Then all three of these are true — **each verified on a throwaway PG17 rig
against the deployed `clara.upsert_account`, not reasoned about**:

1. `150-000` still holds the marker, so `150-CAP` hits `uq_coa_special` and the writer raises
   the hardcoded **"a rounding account already exists for this client"** (`CLR10`) — naming the
   wrong account class entirely.
2. The apply loop **catches per-account errors and continues**, so 195 accounts land and one row
   shows an error. Scroll past that one red row among 196 and there is **no `150-CAP` at all**:
   `retained_earnings` stays on an account named "Retained earnings", and Gate K's `equity_net`
   carry-down — which resolves the marker, not a code — posts the proprietor's accumulated
   capital there **with no error**. Exactly the misdescription `150-CAP` exists to prevent.
3. Deactivating `150-000` is a trap: `uq_coa_special` has no `is_active` predicate (rig-confirmed
   — the refusal persists), so the slot stays occupied while the carry-down's marker lookup,
   which *does* filter on active, refuses with `CLR31`.

**`0009_coding_floor.sql` is DEPLOYED and was not edited.** Its misleading message cannot be
fixed here — see the known issue below.

**Decided: a pre-apply guard in the accounts lane, not a note.** `specialMarkerConflicts()`
(pure) diffs the selection's markers against a FRESH read of the client's accounts;
`markerConflictRefusal()` builds the operator-facing text; `AccountsWorkbench.applyTemplate()`
runs both **before the first write** and refuses, fail-closed if the read itself fails. The
message does the three things the DB's own cannot: names the account actually holding the
marker (by code *and* name), gives the remedy, and states the deactivation trap outright. The
DB still enforces; this stops the operator ever reaching a half-applied, silently-wrong chart.

**The remedy was tested, not asserted.** On the rig, re-upserting `150-000` through
`clara.upsert_account` with `p_special_acc_type` NULL — exactly what panel 3 sends with the
special select left on "—" — writes the null through the `on conflict … do update set
special_acc_type = excluded.special_acc_type` path, clears the marker, and frees the slot;
`150-CAP` then takes it cleanly. `p_type` is unchanged in that call, so the writer's
"cannot change type/class of an account that has lines" guard does not fire.

### F3 — limitation 6 and the `toggleBlockKey` doc overstated the failure and misstated the retry

Two corrections, both to claims round 3 made, both **corrected rather than softened** (round 2's
standard):

- *"leaves a half-seeded chart"* — **false**. The apply loop continues past a per-account error.
  The danger is the opposite of a truncated run: a chart that reads as complete while the
  accumulated-equity marker sits on an account named for the wrong entity shape.
- *"safe to retry — `coaSeedOpKey` is deterministic, so the retry replays"* — **false for this
  failure**. The exception aborts the whole `upsert_account` transaction, rolling back
  `_reserve_op`'s reservation with it, so there is nothing to replay. Rig-confirmed: two
  successive calls with the identical deterministic op_key raise the identical error, and
  `clara.op_receipts` holds **zero** rows for that op_key afterwards. Every retry reproduces the
  violation for as long as the marker sits elsewhere.

Limitation 6 was rewritten to state the enforcement as it now is (two app-side guards, neither
of them the DB), what is still uncovered (a caller bypassing both), and all three exact facts
about that failure — including the misleading message.

### F4 — `100-CAP` was described as three incompatible things

Its `mpers` said *movement*; its note said the Form B capital figure "can be read straight off"
it (a standing balance); and it claimed `160-DIV`'s role reversed — but `160-DIV` is a
**clearing** account zeroed each year. The same defect round 2 fixed for `310-FD1`: the closed
roll-up set exists so one account maps deterministically to one line.

**Decided: the balance reading.** `100-CAP` is the Form B *Capital account* line — a standing
balance of what the proprietor contributed, never closed off or cleared. Accordingly:

| | before | after |
|---|---|---|
| name | Capital contributed by the proprietor | **Capital account — contributed by the proprietor** |
| `mpers` | Equity — proprietor's capital **movement** (no MPERS roll-up) | **Equity — proprietor's capital** (no MPERS roll-up) |
| note | "…the role 160-DIV plays for a company, in the opposite direction" | analogy **deleted**; states the standing balance, the Form B line, and that a contribution is not a profit |

That leaves `"Equity — proprietor's capital movement (no MPERS roll-up)"` used by `160-DRW`
alone, which is what it describes. Two standing balances (`100-CAP`, `150-CAP`) mapping to one
face line is normal and deterministic in the direction that matters — one account, one line —
and matches how `530-DIV` and `530-ROY` both map to "Other income" while Form C analyses them
separately. Pinned by a structural cell, not by prose.

### F5 — the `150-CAP` closing sentence reintroduced a rejected split and inverted both new roll-ups

The sentence read: *"Where a client's accounts carry the further analysis the Form B financial
particulars ask for — a capital account beside a current account … — 100-CAP carries the
contributed capital and this account carries the current-account balance."* Two defects:

- It made `100-CAP`'s role **conditional** ("where a client's accounts carry the further
  analysis"), contradicting `100-CAP`'s own note, which reads the Form B capital figure off it
  unconditionally — and reopening the split round 3 explicitly refused.
- On its own description, `100-CAP` is the *capital account* and `150-CAP` the *current
  account* — the exact **inverse** of how the two new roll-ups were assigned.

**Decided:** the closing sentence now says Form B's analysis is served by the **three accounts
together and not by splitting this one** — `100-CAP` is the *Capital account* line, `150-CAP`
with `160-DRW` carries the *current account* — and names the round-3 refusal and its ground
(a split the client's books do not hold lets the opening plug land in the wrong half, and there
is no non-posting header guard: limitation 3).

**Collateral rename, recorded because it was not asked for.** With `100-CAP` renamed to
"Capital account — …", `150-CAP`'s "Proprietor's capital account" became indistinguishable from
it on screen — two rows both reading *capital account*, which is how a contribution lands in the
accumulated line. `150-CAP` is now **"Proprietor's capital account — accumulated"**. This does
not adopt the rejected split: it does not call the account a *current account* and does not
assert the client keeps one. A cell pins the three names distinct.

### Kept, deliberately — round 4 changed none of these

- **MPERS does not apply to a sole proprietorship**, and the two self-labelling
  `"… (no MPERS roll-up)"` values are the honest answer.
- **`190-OBE` in `system`**, not `equity`.
- **The `conflictsWith` mechanism** — a note could not have prevented a mid-apply
  `uq_coa_special` violation, and (F1) could not have prevented the director accounts either.
- **No EPF/SOCSO self-employment account**, because deductibility could not be verified from an
  official source.
- **Form B item LABELS, never numbers.**

### Known issue for a future migration (NOT fixed here)

`clara.upsert_account` wraps its insert in `exception when unique_violation then raise
exception 'a rounding account already exists for this client'` — `0004_governed_fns.sql:393`,
`0005_event_spine.sql:668`, `0009_coding_floor.sql:1494`. Since `0017` the same
`uq_coa_special` index also guards `opening_balance_equity`, `retained_earnings`, `sst_output`
and `sst_purchase_cost`, so **every** marker collision is reported as a rounding one, and the
`on conflict (client_id, account_code)` clause means an `account_code` collision cannot reach
that handler at all — the message is wrong for four of the five markers it now covers.
`0009` is deployed and immutable; the fix is a future migration that inspects
`SQLERRM`/the conflicting `special_acc_type` and names it. The dashboard guard above makes the
common path never reach the message, but a non-dashboard caller still does.

### Round-4 verification

`cd apps/dashboard && pnpm typecheck && pnpm lint && pnpm test` — green, **321 pass / 0 fail**
(baseline 314; +7 cells). Root `pnpm typecheck` green. The `upsert_account` behaviours asserted
above were exercised on a disposable local PG17 cluster migrated `0001`–`0019`; no live or
shared database was touched.

## Standing conclusion

The template is a **defensible practice default, not an official list**. Its two standing
rules and six recorded limitations are part of the artefact: they say what it does not
know, which is what makes what it does say trustworthy. Any future change should be run
back through the same two questions — *does this name assert a conclusion the ledger cannot
support?* and *does this account map deterministically to one statement line?* — and, since
round 3, a third: *does this account exist for every entity shape, or only one, and if only
one, does the DB let both shapes be seeded at once?*

Round 4 adds a fourth, and it is not an accounting question: **can the product actually perform
the operation this text instructs, and does the test prove the behaviour or only the prose?**
Round 3 failed it twice — an instruction to deselect accounts one at a time in a surface that
selects by block, pinned by a test that asserted eight strings appeared in a sentence. Both
answers must come from the surface and the migration as built, not from the template's own
description of them.
