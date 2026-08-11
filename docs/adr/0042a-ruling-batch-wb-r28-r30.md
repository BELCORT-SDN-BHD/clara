### Ruling batch WB-R28..R30 — Gate P's proof standard, B-12's opening date, and Gate F's blocker (2026-07-26)

- **WB-R28 — Gate P's proof standard: ACCEPTED as-is (owner ruling, 2026-07-26).** The only
  SST-bearing documents in the entire 288-file Bee Creative corpus are **8 OpenAI invoices**
  carrying a real `MY FRP 24000037` registration and an 8% Malaysian **service tax** line with an
  RM equivalent on the face (RM6.61–6.90 across Apr–Nov 2025). They are atypical for the gate as
  originally imagined: a **foreign** registered person self-charging on an imported digital
  service, billed to the proprietor **personally** at a residential address, in **USD**. The owner
  rules this **sufficient** — it is genuine, unfabricated Malaysian service tax, and it exercises
  FRP + FX + a personal-name bill on a sole proprietorship. **The receipt must say exactly that**,
  because "Gate P closed" reads very differently against a local registered supplier's invoice.
  Every Midjourney invoice carries no tax line at all — that is the imported-services
  self-accounting case, a different workflow, and out of scope for P.

- **WB-R29 — B-12's opening date: BEFORE 2025-02-04; no deletion.** The double-counting concern
  is resolved by the data rather than by removing it. RPR carries **zero** opening-balance entries
  (`is_opening_balance = 0` across all 30) and its earliest **approved** posting is **2025-02-04**
  (29 approved + 1 withdrawn, spanning Feb–Dec 2025). An opening position dated before that sits
  cleanly ahead of every posted transaction — opening balances *plus* subsequent transactions is
  ordinary correct accounting. Double-counting would arise only from an opening date **after**
  some of those postings, embedding activity that is also posted individually. Deleting the client
  was considered and rejected on three grounds: **there is no delete verb anywhere in the schema**
  (reverse-not-delete is structural, not conventional); those 29 approved entries are the evidence
  base cited by the Wave A / A2 / A2.1 gate receipts; and **WB-R16 makes B-12 the *incremental*
  variant deliberately** — a carry-down onto a client that already has activity — so a cleaned
  client cannot test the property B-12 exists to test. The **clean-room** carry-down is Bee
  Creative (zero entries, both YA2024 and YA2025 present, sole-proprietor CoA merged in #87),
  which also yields an independent second Gate K on a different entity shape.
  *(Context: these tenants are the owner's test vehicles, not paying-client production; the
  DOCUMENTS are real, which is what the no-fabrication rule protects.)*

- **WB-R30 — Gate F is BLOCKED on account provisioning, not on engineering.** `create_firm`
  (`0004:318`) refuses every principal that exists today: the owner's account and the seed account
  each hold an active membership (`actor already belongs to a firm`, CLR10), and the only
  membership-free identity is the **agent**, which is refused by name (`the agent identity cannot
  own a firm`, HIGH-11). There are also **zero unconsumed `firm_admissions` tokens** (3 of 3
  consumed). Gate F therefore needs three owner actions before any engineering can start: a new
  auth account holding **no** firm membership, a freshly minted admission token, and Rome Public
  Advisory's real particulars for the 11-Q interview. The agent is prohibited from creating
  accounts, so this is not delegable.
