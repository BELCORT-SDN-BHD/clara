# Gate R2 — the tick-list ceremony runbook (prepared 2026-07-26)

> **✅ EXECUTED 2026-07-26 on runtime v29 — claims (1)+(2) CLOSED; claim (3) remains** (needs a
> seeded rule to code a real future document). Batch `e2831cad`; the forecast below held to the
> number. Do not re-run against the same GL (`create_seeding_batch` will 409 the duplicate).
> Receipt: `docs/plan/research/wave-b/live-gate-r2-2026-07-26.md`.

**State when this was written:** the code is MERGED (`40dc88c`, PR #102) but **not deployed**.
Live is still `clara-runtime` **v27**, which predates both PR #100 (storage duplicate detection)
and PR #102 (the printed-ledger seeding source). The ceremony cannot run until the runtime
carries #102, because `/api/seeding/prepare` executes there.

**Two steps below can only be performed by the owner:**

1. **`fly deploy`** — blocked for the agent by the permission classifier.
2. **Minting a dashboard session JWT** — it is an ES256 Supabase auth token from a real password
   login. The agent does not authenticate with the owner's password, and that holds even when
   the owner asks it to.

Everything else the agent can drive.

---

## Prerequisites already satisfied

| | |
|---|---|
| RPR client id | `e2b0f365-09c5-4f6a-953a-52a18c1bcc8a` (ROME PROPERTIES SDN BHD, active) |
| Prior-GL document | `d7bc9c02-0489-4646-be37-3477c2814ec5` |
| …ingested | yes — born-digital, 7 pages, 3,236 regions (1,907 table cells) |
| …filed to RPR | yes — filing `efae710b-3f70-48f7-87a9-53a72cf55aaa` |
| …classified | `management_account` at **0.98** — an accepted `create_seeding_batch` kind |
| Seeding batches today | **0** — nothing has been seeded yet, so this is a first run |

---

## Step 1 — deploy the runtime (OWNER)

```
fly deploy -c packages/runtime/fly.toml
```

Run from the **repo root**. The machine (`48ee715b763048`) is currently `started`; a deploy
while it is stopped leaves it stopped. Afterwards confirm the new release is serving and the
loops came up:

```
fly status -a clara-runtime
fly logs -a clara-runtime | grep -i "WIKI_PROJECTION acquired"
```

## Step 2 — mint a session JWT (OWNER)

```
node <scratchpad>/mint_session_jwt.mjs
```

It reads `~/.clara-owner-login.json` and writes only the token to `~/.clara-session-jwt.txt`.
**Expiry is 1 hour** — it will expire mid-ceremony if the ceremony stalls; re-mint and continue.

## Step 3 — prepare the batch (agent)

```
POST https://clara-runtime.fly.dev/api/seeding/prepare
  { "clientId": "e2b0f365-…", "documentId": "d7bc9c02-…" }
```

Admin floor. Expected `202 {status:"created", batchId, proposal_count, refused_count,
unattributed_row_count}`.

**Forecast, from running the parser against the real document offline:**

| | |
|---|---|
| entries | 125 |
| `vendor_account_rule` proposals | 81 |
| `wiki_fact` proposals | 34 |
| `unattributed_row_count` | **24** — every one a payroll accrual or statutory contribution, which genuinely has no counterparty |
| auto-refused | any account of class `payable`/`receivable` (control accounts, refused at parse) |

If the counts differ materially from this, **stop and investigate** rather than proceeding — the
forecast is the falsifiable part of this ceremony.

## Step 4 — the tick list (OWNER JUDGEMENT, agent executes)

A general ledger is double-entry, so **`310-000 CASH AT BANK` appears as a candidate for almost
every counterparty** — it is the contra side of each payment, not a coding rule. And
`uq_coding_rules_one_live_vendor` permits **exactly one live rule per counterparty**, so one
account must be chosen per party.

**Recommended ticks (12 real counterparties):**

| counterparty | account | basis |
|---|---|---|
| ROME PUBLIC ADVISORY SDN BHD | `900-A01` accounting fee | ×9, dominant |
| PKL GROUP SDN BHD | `610-000` purchases | ×3 (`310-000` ×5 is the bank side) |
| DARE TO DREAM REAL ESTATE SDN BHD | `500-000` revenue | ×3, a customer |
| IWIFI GROUP SDN BHD | `420-002` | ×4 |
| INF ASSET HOLDINGS | `900-O01` office & warehouse rental | ×3 |
| BRIGHTPATH CONSULTANCY SDN. BHD. | `610-000` | ×2 |
| BUSYSTREET CONSULTANCY SDN BHD | `610-000` | ×1 |
| D & DREAM PROPERTIES SDN BHD | `500-000` | customer |
| KOK LIONG ACCOUNTANCY & MANAGEMENT SERVICES | `900-S04` secretary fee | ×1 |
| MAYBANK | `900-B01` bank charges | ×1 |
| ROME GROUP SDN BHD | `350-002` | ×1 |
| TAN LAKE WEI | `420-001` | director pay-on-behalf |

**Recommended declines:** every `310-000` bank-side candidate, and the narrative pseudo-parties
(`BEING TAKE IN ACCRUAL SALARY*`, `SALARY <month>`, `STATUTORY FOR <month>`,
`BEING RECORD FOR WAIVER OF`, `BEING INCORPORATED ALLOTMENT`, `PROFIT/(LOSS)`).

**OWNER RULING (2026-07-26) — both questions answered YES:**

1. **`INF ASSET HOLDINGS` and `INF ASSET HOLDINGS SDN BHD` ARE the same entity.** They must
   become ONE counterparty with an alias, exactly like `D & DREAM` → `DARE TO DREAM`.
2. **`INF ASSET HOLDINGS → 900-O01` (office & warehouse rental) is CONFIRMED**, and it is B-12's
   RM161,120.00 rental-gap counterparty. Once signed, future INF documents code to rental.

**Execution order for the alias — this matters.** `tick_seeding_proposal` resolves the
counterparty by `name_normalized`, and the two spellings normalize differently
(`infassetholdings` vs `infassetholdingssdnbhd`). Ticking both would **birth two counterparties**,
which is the opposite of the intent. So:

1. **Tick** `INF ASSET HOLDINGS → 900-O01`. This births the single canonical counterparty.
2. **Decline** every `INF ASSET HOLDINGS SDN BHD` proposal (`900-R01` / `900-T03` / `900-W01`,
   one occurrence each — nothing in the document distinguishes them, and the ruling makes them
   the same party anyway).
3. **Then** attach `INF ASSET HOLDINGS SDN BHD` as an alias of the canonical counterparty
   (`clara.counterparty_aliases`; `tick_seeding_proposal` writes aliases only from a
   `payload.aliases[]` array, which the prior-GL parser does not emit — so this is a separate
   audited step, not part of the tick).

Verify afterwards that RPR has exactly **one** INF counterparty and that the alias resolves:

```sql
select id, name, name_normalized from clara.counterparties
 where client_id = 'e2b0f365-…' and name ilike 'INF%';          -- expect ONE row
select alias, source from clara.counterparty_aliases
 where counterparty_id = '<that id>';                            -- expect the SDN BHD spelling
```

Verbs: `clara.tick_seeding_proposal(p_proposal, p_op_key)` /
`clara.decline_seeding_proposal(...)`, both admin-floored, both op-key idempotent. A tick births
or resolves the counterparty and inserts a `coding_rules` row `status='live'`,
`signed_by = <the ticking human>`, `signed_at = now()` — **the signature is the owner's**, which
is why the accounting choices above are the owner's to confirm.

## Step 5 — verify the three Gate-R2 claims

Gate R2: *"the tick-list ceremony mints real per-rule signatures; zero sighting-pool entries from
prior GL; a seeded rule participates in live coding under its signature."*

```sql
-- (1) real per-rule signatures
select id, account_code, status, signed_by, signed_at, origin, content_hash
  from clara.coding_rules
 where client_id = 'e2b0f365-…' and rule_type = 'vendor_account' and status = 'live';

-- (2) ZERO sighting-pool entries from prior GL  (the seeding lane must never breed sightings)
select count(*) from clara.rule_sightings s
 where s.client_id = 'e2b0f365-…'
   and s.created_at >= '<the ceremony start timestamp>';   -- expect 0

-- (3) the audit + event spine actually recorded it
select event_type, count(*) from clara.domain_events
 where client_id = 'e2b0f365-…' and event_type in
   ('seeding.batch_created','seeding.proposal_decided','kb_rule.signed','counterparty.created')
 group by 1;
```

**Claim (3) — "a seeded rule participates in live coding under its signature" — is the hard
half** and is NOT satisfied by the ceremony alone. It needs a subsequent real document from a
seeded counterparty to be coded, with the receipt naming the seeded rule. BRIGHTPATH and
PKL GROUP invoices are already in Clara, so the candidates exist.

**Caution:** the auto-draft lane cannot supply this today — it has drafted **0 times** in
production (`tier_a_fails` on 29/29 documents; Azure's confidence tops out at 0.837 against a
0.95 bar). So claim (3) must be driven through the **chat lane**, or after the Tier-A
corroboration fix. Do not report R2 fully closed on claims (1)+(2) alone — say which are closed.

---

## What must NOT be done

- Do not lower the Tier-A `0.95` confidence bar to make the autodraft lane fire. It is the
  control that stops an unverified number being auto-posted. The correct fix is corroboration by
  **agreement between two independent readers**, which the XML tier already does.
- Do not tick a proposal whose counterparty is a journal narrative just to raise the count.
- Do not declare Gate R2 closed until the ceremony has actually run on live and the queries in
  Step 5 have been executed and recorded.
