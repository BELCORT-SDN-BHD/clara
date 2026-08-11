### ADR-043 — Migration 0021 DEPLOYED; **GATE K CLOSED on Bee Creative** (2026-07-26)

**Decision:** 0021 is live. **21 migrations · `clara-runtime` v27 unchanged** — the first Wave-B
migration to need **no quiescence and no runtime redeploy**, because it is one `create function`
the runtime holds no EXECUTE on. Backup first (10,088,736 B, head recorded at 20, zero 501s) →
`node packages/db/scripts/migrate.mjs` → post-verify **6/6**, strict head check included (the
ceremony does **not** set `clara.postverify_allow_later`; only the rig does).

**A read-only pre-flight was written and run before the apply** and is worth keeping as a habit:
seven probes asking whether LIVE is the database the rig proved the migration against — every
column 0021 writes, both unique indexes still kind-scoped and partial, all six helpers at the
**exact** signatures 0021 calls, both roles present with ownership transferable, **no
`create_counterparty` at any overload** (an existing overload would let `create function` succeed
and leave two verbs, which the tail's exact-signature check would not catch), the `kind` check
admitting both values, and the head at 0020. 7/7 — and the apply then succeeded first time.

**GATE K IS CLOSED, on a second entity shape, end to end through the product.** BEE CREATIVE
SOLUTION (sole proprietorship) — seed `1e60960e` **finalized**, batch 1, four entries **approved
in one serializable transaction**. Posted trial balance, to the sen:

| account | Dr | Cr |
|---|---|---|
| 150-CAP proprietor's capital — accumulated | 65,747.97 | — |
| 310-B01 bank — main operating | 39,252.03 | — |
| 400-000 trade payables — control (**2 counterparty-bound lines**) | — | 105,000.00 |
| 190-OBE opening balance equity (clearing) | 105,000.00 | 105,000.00 |
| **totals** | **210,000.00** | **210,000.00** |

OBE nets to **nil**; the dry-run read `TIES · opening-balance-equity net RM 0.00`. This is the
**negative-equity** case (drawings 163,495.02 exceed profit 53,517.57), so the carry-down seeded a
**debit-balance** capital account into the single `retained_earnings` slot — the demanding shape.

**Three firsts, all in production.** (1) `create_counterparty` minted LOST INVENTION SDN BHD
(`11463f05`), and its audit row proves the ADR-042 fix: `on_behalf_of` **NULL**, client in `args`,
actor the human. Registration left **blank** — no verified SSM number exists for that party and
none was invented, which exercised the name-only index branch. (2) The **`ap_open_item` path
executed for the first time ever**, twice, seeded **at invoice level** (`LIIV-20241205` 84,000.00 +
`LIIV-20241220` 21,000.00) rather than as one lump, so the AP sub-ledger is right from day one.
(3) **WB-R22's solo lane fired on a money-touching approval**: the first submit was refused
`CLR05 · SELF_ATTESTATION` — maker and checker are the same actor and BELCORT has exactly one
eligible approver — and only a typed attestation released it. The refusal came from the DB, not
the UI.

**One product finding, fixed in the same pass.** The opening page rendered **two** inputs both
labelled `aria-label="Amount in cents"` — the keyed trial-balance-target line and the opening item.
A sighted user has the section headings; a screen reader announces the same name twice (WCAG
1.3.1). Now `Keyed target amount in cents` / `Opening item amount in cents`, with a regression
guard that scans every opening-page control for a colliding label — proven to fail on a planted
collision. *(An earlier claim that this "silently misrouted a write" was withdrawn: that was a
`querySelector` first-match artefact of the automation, not something a human clicking a field can
do.)*

**What Gate K does NOT close.** The seed is **keyed**, not document-tied — the `opening_tb.line`
producer still does not exist, so the document-tied carry-down remains unproven on any client.
Ref: PR #94 · ADR-042 · WB-R22 · WB-R24.
