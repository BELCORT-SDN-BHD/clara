# F-T4 · The fix queue — the design doc of record

**v1 · 2026-08-23 · design set 2 of 3.** Reads on `fix-queue-survey.md` (findings **F1-F33**); read
by `fix-queue-annexes.md` (mechanics · censuses · predictions · decision register · owner
questions). **Nothing here is built until the gate passes and the owner questions are answered.**

**The laws this design is written under.** Numbers are the DB's, reproduced by a versioned
deterministic evaluator (constraint 2 / PRD §6) — no item here mints a numeral. Walls are proved
**behaviourally**: the proof of a wall is a cell that makes it REFUSE, never a substring match on
source text. Absence is not evidence — every "not found" falls to a fail-closed branch, and
three-valued evaluation (pass / fail / **not_evaluable**) is used wherever the honest answer is
"the world did not tell me". Forced cells assert their precondition or exit by a **named** skip.
Frozen workflow bodies are never edited — a behavioural change ships as a new `_vN` with a registry
repoint (constraint 9), and **no version number is named here**: the build lane reads the live
registry at authoring time and takes the next free one.

---

## 1 · The shape — five PRs, one owner ruling, and what is deliberately NOT built

| PR | scope | DB? | D1? | depends on |
|---|---|---|---|---|
| **PR-1** | item **F** — the ceremony DSN bridge, in-repo | no | no | nothing |
| **PR-2** | item **B** — N5, the remedy field reaches the coding lane | new table only | no | nothing |
| **PR-3** | item **D** — the 401/403 split | CHECK swap + 2 CoRs | **yes** | nothing |
| **PR-4** | item **A** — P-3, drawer 1's zero census | 1 CoR + 1 fact key | **yes** | **F-A3** (§2.1) |
| **PR-5** | item **E** — the two missing F8 cells | tests only | no | nothing |
| — | item **C** — the claims convention | **owner ruling, then Wave G** | — | OQ-1/OQ-2 |

**PR-1 first, and that is not ceremonial ordering.** Every remaining Wave-F and Wave-G ceremony
walks the DSN bridge (F20-F22), and it has already degraded to CA-unpinned TLS against the live
pooler twice. It touches no DB and no product code, so nothing gates it.

**Deliberately not built:** a second registry-vs-ledger predicate (F-A3 owns the body); a
`fix`-sentence backfill across ten applied migrations' raise sites (priced and declined, D-4); a
repair of F8's door on a retiring host lane (D-2); the claims module itself — item C designs a
**convention**, not a register. **PR-3 and PR-4 each open a D1 write-quiesce window**; they may
share one if they merge together (§9), but neither may be folded into F-A4's `finalize_close`
window, which carries three other lines already (`wave-f-contract.md`, sequencing correction 2).

---

## 2 · Item A — P-3, drawer 1's registry-vs-ledger zero census

### 2.1 The predicate: one body, one owner, and F-T4 is the consumer

F-A3 owns the registry-vs-ledger predicate (`bank-agency-annexes-3-build.md:119-121`, obligation
6). **This design calls it and does not write it** — with one stated exception: *whichever item
lands first writes it*, so if PR-4 merges before F-A3's arm 4, PR-4 authors the body **to the
contract below** and F-A3 calls it. Either way there is one body. The contract, stated so both
lanes can build against it:

```
clara._bank_registry_ledger_state(p_client uuid, p_as_of date) returns jsonb
  -- { state: 'clear' | 'gap' | 'not_evaluable', accounts: [...], basis: <literal> }
```

`state` is **three-valued and fail-closed**; `accounts` enumerates the offending COA accounts with
their DB-computed positions (read through `clara.trial_balance_as_of`, never recomputed — constraint
2); `basis` is a versioned literal so a reader can tell which generation answered.

### 2.2 The circularity, and why the predicate may not key on `is_bank_account` alone

**F3 is the finding that shapes this item, and it binds F-A3's arm 4 identically.**
`coa_accounts.is_bank_account` is written only by `add_bank_account` and its remap sibling
(`0038:2731`, `0038:2987`) — it is *minted by registration*. On a client with zero
`bank_accounts` rows, zero COA accounts carry the flag, so a predicate of the shape "a flagged
account with movement and no registering row" returns **the empty set on exactly the population it
exists to catch**. Three arms, evaluated in order:

- **(a) the deactivated / remapped case — non-vacuous.** A COA account with `is_bank_account =
  true` and no **active** `bank_accounts` row binding it ⇒ `gap`. This arm has real reach:
  `0038:2532-2535` records that deactivating an account does **not** clear the flag, so the flag
  outlives the registration and this arm sees it.
- **(b) the zero-registry case — `not_evaluable`, never `clear`.** If the client has **no**
  `bank_accounts` rows at all, the chart cannot answer the question and the predicate says so.
  Absence of a flagged account is not evidence of a bankless client.
- **(c) no name or code heuristic, ever.** An account titled "MAYBANK CURRENT" is a projection of
  the thing (review law 3); the predicate reads structure and declared facts only.

### 2.3 The door — a missing INPUT through the audited fact door, not an attestation

Drawer 1 is absolute and gains **no** attestation path (F4). What arm (b) needs is not an
override, it is **the fact nobody ever recorded**. The estate already has that door and an exact
precedent: `trade_nature` (`0056:1233-1239`), whose own description says *"ABSENT means the
closing-stock gate reads UNKNOWN and refuses attestably — an unknown trade nature is not evidence
of a service business."* This design clones it.

**New `client_fact_keys` row** (append-only, extend-only, code-populated):

| field | value |
|---|---|
| `fact_key` | `banking_arrangement` |
| `validated_against` | `enum:BANKING_ARRANGEMENT_V1` |
| `allowed_values` | `["has_accounts","no_accounts"]` |
| description | the registry's completeness as a *declared* fact — ABSENT means drawer 1 reads `unknown`; `no_accounts` is a positive declaration with who/basis/when; `has_accounts` asserts the registry is populated, so **zero rows under `has_accounts` is a contradiction, not a pass** |

Written through the existing `clara.record_client_fact(p_client, p_fact_key, p_fact_value,
p_basis, p_basis_kind, p_source_document_id, p_op_key)` (`0055:499-501`) at its **admin+** floor
(`:510`) with basis capture. **No new verb, no new grant, no new role.** Each of the three states
does work:

| registry rows | `banking_arrangement` | verdict |
|---|---|---|
| 0 | *absent* | `not_evaluable` → drawer 1 `unknown`, reason `bank_registry_undeclared` |
| 0 | `no_accounts` | `clear` — the question is answered, the loop runs over nothing, `tie` stands |
| 0 | `has_accounts` | `gap`, reason `bank_registry_contradicted` — a declared registry that is empty |
| ≥1 | any / absent | arm (a) decides; the declared fact does not override a measured gap |

### 2.4 The call site — fold into the worst-wins aggregation, never an early return

`clara.bank_recon_close_state(uuid,uuid)` (`0056:959`) is CoR'd with **one** addition. The
predicate is called once before the loop; the loop and its per-account shape are **byte-unchanged**;
the verdict is folded into the existing worst-wins aggregation (`0056:1019-1022`) *after* the loop,
and the predicate's own JSON is attached under a new `registry` key on the returned object:

```
if v_reg->>'state' in ('gap','not_evaluable') then v_state := 'unknown'; end if;
… return jsonb_build_object('state', v_state, …, 'registry', v_reg);
```

**Early-returning on the gap was considered and rejected:** it would suppress the per-account
array a human reader needs, and it would let a registry gap mask a real mismatch. Folding keeps
both. `v_state`'s `'tie'` initialiser at `:962` is left in place — the branch above is what makes
the empty-registry case unable to reach it.

### 2.5 The retroactive consequence, taken deliberately

`clara.verify_close(uuid)` (`0056:2529`) re-probes the four drawer-1 identities from scratch
against a **sealed** receipt (`:2544-2548`). After this change, **every historical close of a
client with no registered accounts re-verifies as `unknown`.** That is taken, not hidden:

- **It is the honest answer.** `verify_close` interrogates; saying "this identity cannot be
  re-established today" is true, and a receipt that silently re-verified on a vacuous `tie` was
  telling the reader nothing.
- **The remedy is a human act with a record, not a code carve-out.** Recording
  `banking_arrangement = no_accounts` with a basis makes the re-verification green again.
- **A date-scoped carve-out is refused.** Scoping the new branch to runs after a date is a dated
  tripwire pinned on ceremony state — the class this estate has already paid for.

The measured population rides to the owner as **PREDICTION P-10** (§Annex): how many sealed
receipts flip, per client, published before and after.

---

## 3 · Item B — N5, the remedy reaches the coding lane

### 3.1 The problem is two-sided, and the naive fix is refused

The coding lane's raises carry no `fix` and its mapper has no slot for one (F6-F8). The obvious
"backfill" — add a `fix` sentence to every coding-lane raise — means CoR'ing raise sites across
`0009`, `0011`, `0015`, `0016`, `0022`, `0028`, `0029`, `0035`, `0036`, `0037`. **Declined (D-4):**
it is a very large D1 surface for prose, and it puts the remedy text in ten places at once — the
same "two rosters that can disagree" defect `0057:1400-1404` exists to prevent.

### 3.2 The design — one governed remedy table, and the dashboard stops being the authority

Today the remedy a human reads is **hardcoded in the frontend**: `reviewCopy.ts:8-16`
(`CLR21_COPY`) / `:39-44` (`CLR05_COPY`), rendered at `JeReviewCard.tsx:369`. The agent, who has no
frontend, sees nothing. The fix moves that authority into the DB, once:

**`clara.refusal_remedies(errcode text, reason text, remedy text, basis text, primary key
(errcode, reason))`** — **code-populated, not firm-configurable**, on the `close_gate_checks`
posture (`0056:369-378`): append-only trigger, no-truncate trigger, RLS forced, a global read
policy for `clara_authenticated`, and a select grant. Seeded from the existing frontend copy so
**no wording is invented** and the change is a move, not a rewrite.

**Resolution order in the mapper, fail-closed:**

1. `(err.code, reason)` present in `clara.refusal_remedies` → that remedy. The table wins.
2. otherwise → **no remedy at all.** An unknown reason shows the refusal with no advice.

### 3.3 The oracle objection is answered structurally, not by promise

`chatTurn.v10.errors.ts:72` says the mapper parses the detail *"without leaking raw text"* — that
is a deliberate hardening and this design must not undo it. **It does not:** the coding lane's
mapper still never reads `detail.fix`, never reads `sqlerrm`, and never reads a row value. It
reads a **closed, code-populated table keyed by a token it already trusts**. The authoring lane
keeps its own inline-`fix` path (`chatTurn.v11.tools.ts:80-109`) untouched — two vocabularies, two
mappers, exactly as `:76-79` insists.

### 3.4 The consumer chain

`refusalFromDbError` gains an optional `fix` on its output, and `RefusalPart` gains `fix?: string`.
Both mappers are frozen (`frozen-workflows.json:249`, `:294`), so this ships as new `_vN` error
modules for **`autoDraft`** and **`chatTurn`** plus their registry repoints.
**`chatTurn`'s next version is a shared surface** — F-A2 PR-2 already claims one and F-A3's parity
takes another (`bank-agency-annexes-3-build.md:112-115`). The build lane reads the live registry,
takes the next free number, and tells the conductor before authoring. Wire side:
`apps/dashboard/app/shared/parts.ts:153` gains the field, both `PgrestError` mirrors
(`shared/wire.ts:60-69`, `chat/api.ts:232`) gain it, `chat/parts.tsx:212-220` renders it, and
`JeReviewCard.tsx:369` prefers the DB remedy over `clr21Copy(...)`, keeping the hardcoded lookup
only as a fallback until the table's coverage is proven — then deleting it in the same PR that
proves it.

### 3.5 What proves it

Three behavioural cells, one of them differential and one a wall:
(1) a real CLR21 refusal renders the DB-owned remedy on the coding card;
(2) **differential** — a refusal whose `reason` has no row renders the refusal **with no remedy**,
not a stale or nearest-match one (fail-closed on the unknown);
(3) **the oracle wall** — force a raise whose `message`/`sqlerrm` carries a unique marker string
and assert the marker is **absent** from the rendered part. A wall proved by refusal, not by
grepping the mapper.

---

## 4 · Item D — the 401/403 retryable auth-code split

### 4.1 One classifier, extracted to a non-frozen lib

A new **packages/runtime/lib/engine-status.mjs** exporting
`classifyEngineHttpStatus(status) -> code`, adopted by all three adapters (F9):

| status | code | note |
|---|---|---|
| `>= 500` | `engine_error` | unchanged |
| `401`, `403` | **`engine_auth`** | the new code |
| `404` | `engine_unavailable` | the statement lane's existing carve-out, now shared |
| everything else | `bad_type` | unchanged, and narrower than today |

`egress.mjs` is a library and adopts it directly. The two workflow adapters
(`invoiceFacts.v1.azure.mjs`, `statementFacts.v1.engine.mjs`) are checked against
`frozen-workflows.json` at authoring time; a frozen one takes a new `_vN`. **The live-adapter
census is PREDICTION P-11** — the F-A1 cutover left the Azure invoice engine as a tombstone, so
that adapter may need no change at all.

### 4.2 The DB code, extended not replaced

`ck_processing_task_error_code_0038` (`0038:7279-7286`) is dropped and re-added with
`engine_auth` appended. **Shared surface** — the live text is re-read with `pg_get_constraintdef`
first, and a prestate probe aborts loudly if any predecessor value is missing (extend-only). It
does **not** join the NEVER-CLAIMED allowlist (`0038:7288-7292`): an auth failure happens on a
CLAIMED task, so the existing `workflow_run_id` arm already admits it.

### 4.3 The narrowing that makes this safe: retryable **at the doors**, not automatically

A 401 is retryable in principle, but the `ocr` lane has **no attempt cap** (`0051:910-914`), so
adding `engine_auth` to the runtime `RETRYABLE` sets would let a persistently-401 lane spin and
re-buy vendor reads forever. **`engine_auth` is therefore admitted at the two human doors and
nowhere else:**

- `clara.finalize_document_intake`'s adopted-branch list (`0051:1286`) gains it;
- `clara.request_reextraction(uuid,text,text)`'s own list gains it.

Both are **live, spliced bodies** — `0051` is a harvest-and-splice migration (`:46`, `:809`) — so
both are CoR'd inside a D1 window with prosrc-SHA prestate pins and a tail self-proof that raises
on failure. The runtime `RETRYABLE` sets are **left alone**, so no frozen behaviour module needs a
new version for this half. Automatic retry under a new `ocr` attempt cap is priced in the decision
register (**D-6**) and deferred.

### 4.4 What this does NOT do — the seven documents stay stuck

Gate P's seven are already written `bad_type` (F13); a code change does not re-classify terminal
rows. **The split stops the eighth; it does not unstick the seven.** The honest remedy for those
remains the owner re-export ADR-0066 names. A one-time audited reclassification door was
considered and is **not** recommended — it would make `bad_type` re-admissible by human assertion,
which is precisely the "unreadable bytes re-bought forever" hazard `0051:1231-1244` exists to
prevent. It goes to the owner as **OQ-4** rather than being decided here.

### 4.5 What proves it

A forced cell that drives a stubbed 401 through the adapter and asserts the task lands
`engine_auth`, not `bad_type`; a **differential** cell that drives a 500 and a 400 through the same
path and asserts `engine_error` / `bad_type` respectively (so the new arm did not swallow its
neighbours); a door cell proving `engine_auth` is admitted; and a **wall** cell proving `corrupt`
and `encrypted` are still refused by the same door — extend-never-weaken, proved by refusal.

---

## 5 · Item E — F8's single-use door and the two `0034` inherits

**The recommended answer is coverage, not repair (D-2).** `PROGRESS.md:266-267` says F-A2 replaces
F8's host lane; a CoR of `clara.admit_autodraft_task` inside a D1 window, on a body that is
retiring, buys a fix that dies with it. PR-5 therefore:

1. **adds the two cells nothing pins today** (F18) to
   `packages/db/tests/x34-autodraft-retry-door.test.mjs` — one asserting the op-receipt's state
   after a re-admission that is **refused** downstream, one asserting `sales_backfill_batches`
   slot consumption on that same refused path. Both are forced cells: each asserts its precondition
   (a settled receipt exists; a slot is free) or exits by a named skip. **No body is touched, no D1
   window opens, and the two inherits stop being merely recorded.**
2. **carries the ordering inherit forward as a named obligation on F-A2's replacement lane**,
   written into the annexes' cross-item notes (**X-3**), so the successor does not inherit it
   silently the way `0053` inherited it from `0034`.

If the owner wants the repair now (**OQ-5**), the shape is: move the settled-op-receipt delete to
**after** the lane/consent/budget checks, and reserve the sales-backfill slot at the same point —
one live-body CoR, one D1 window, on `clara.admit_autodraft_task`
(`0034_autodraft_retry_door.sql:134`). Priced, not recommended.

---

## 6 · Item F — the ceremony DSN bridge, in-repo

Four artefacts, no product code, no DB:

1. **ops/tls/pooler-ca.crt** — the pooler's CA chain, committed. *A CA public certificate is a
   trust anchor, not a credential*; hard constraint 4 governs DSNs and secrets, and this design
   keeps the DSN env-only, off disk and off argv throughout.
2. **scripts/ops/dsn-pipe.mjs** — reads the DSN on **stdin**, never from argv and never from a
   file; appends `sslmode=verify-full`; sets `PGSSLROOTCERT` to (1) and `NODE_EXTRA_CA_CERTS` for
   the Node client; spawns the given command with the DSN in the **child env only**. It is the
   `wave-e-delta-ceremony-asrun.md:74-79` recipe, made durable.
3. **scripts/ops/dsn-pipe.selftest.mjs** — the **both-directions** proof, because a probe that
   cannot say NO has a meaningless YES: connect **with** the CA and succeed; connect **without**
   it and be **refused**. It also reads the committed certificate's `notAfter` and fails when
   fewer than 30 days remain — a monotonic direction, never a pinned date, so it cannot rot into a
   dated tripwire.
4. **docs/ops/dsn-bridge.md**, plus a one-line TLS step added to each of the five runbooks that
   today carry only the argv rule (`wave-b-0019-ceremony-runbook.md:83`,
   `wave-b-0021-ceremony-runbook.md:71-72`, `wave-b-ceremony-runbook.md:45`,
   `runtime-hard-restart.md:26-28`, `DR.md:376`), and a harness-menu row so the next reader finds
   it from `AGENTS.md` without knowing it exists.

**One prediction the build must settle (P-12):** whether `check-leaks.mjs` / gitleaks flag a
`-----BEGIN CERTIFICATE-----` block. If they do, the allowance is narrow, path-scoped and
justified in the gate's own comment — never a widened pattern.

---

## 7 · Items G/H/I — sketches; PROGRESS homes all three at F-A2

Offered so the analysis is not lost. **This lane claims none of them** (D-1); F-A2 adopts, or the
orchestrator re-homes them and `PROGRESS.md` records it.

- **G · the wiki CoR-comment gate.** Mirror the sibling that already solved it: re-mask the block
  itself inside `parseCoRPatches` before the CREATE test — `const masked = maskComments(block)`,
  exactly `censusReadOffsets`' fix (`scripts/wiki-lint-checks.mjs:913-919`), whose comment even
  explains why length preservation keeps the offsets aligned. Add a selftest fixture whose CoR
  block *quotes* a create-function phrase in a comment and must pass. **Judgement logic — its own
  independent review pass.** The wording workaround retires with it.
- **H · `0057` §11's writer-roster successor.** The roster's defect is that it is a temp table
  (F24), so the successor is a **standing** cell, not a longer list: a battery test that derives
  the books-writer set from `pg_proc` at every rig run and diffs it against a committed roster,
  failing on an **unrostered** writer. Extend-never-weaken: the committed roster may gain names,
  never lose them, and a removal needs its own recorded reason.
- **I · `0007`'s firm-limits pseudo-upsert.** The trigger cannot know which columns the caller
  named, so no trigger-level repair is honest. Replace it with a real verb —
  `clara.set_firm_document_limits(p_firm, p_limits jsonb, p_op_key)` doing a genuine
  `insert … on conflict (firm_id) do update set` over **only the keys present in `p_limits`** —
  and recut the trigger to **refuse** a bare INSERT against an existing row rather than emulate
  one. A live-body CoR and a D1 window; `llm_witness_concurrency` becomes settable through a door
  for the first time.

---

## 8 · Item C — the claims accounting class: the convention

**Scope.** The contract asks for *"the account-convention design (E-R10 — the generic lane posts it
unattended now; only the convention needs ruling)"* (`wave-f-contract.md:411-412`). This section
therefore states the standard, the three cases, the options and a recommendation — and **decides
nothing**. The submission/approval surface is Wave G (`wave-e-contract.md:221-222`).

### 8.1 The standard, fetched 2026-08-23 from primary sources

**MPERS (2016) is the standard in force** — MASB's own notice on the acceptance page says the third
edition (MPERS 2025) applies only to periods beginning on or after 1 January 2027.
Source: [MASB MPERS landing page](https://www.masb.org.my/pages.php?id=614) →
[MPERSDec2016_website.pdf](https://www.masb.org.my/pdf/MPERSDec2016_website.pdf), fetched
2026-08-23. Paragraph references below are to that file.

- **Recognition — §2.15(b), §2.20, §2.27, §2.36, §2.39.** A liability is a present obligation from a
  past event whose settlement is expected to require an outflow; it is recognised when the
  obligation exists, outflow is probable and the amount is reliably measurable; and §2.36 puts the
  statements on the **accrual basis** — recognition follows the definition, not the cash. *Applied
  to a claim:* once an employee has incurred a cost on the entity's behalf and the claim is
  approved, the liability exists. **This application is our inference; §2 never says
  "reimbursement".**
- **§28 Employee Benefits — MPERS IS SILENT, and that silence is the finding.** §28.1 scopes
  employee benefits to *"consideration given by an entity in exchange for service rendered"*.
  A full-text search of MPERS for `reimburs*` finds it **only** in §21 (reimbursement assets) and
  §28.28 (a defined-benefit reimbursement right) — **never** for an employee's out-of-pocket
  expense claim. So the common reading *"a reimbursement is not an employee benefit"* is a
  reasonable inference from §28.1's own words and **is not a quotable MPERS statement.** Recorded
  as an inference so nothing downstream cites it as text.
- **§22 Liabilities and Equity — no sole-proprietor section exists.** §22.17 reduces equity for
  distributions to holders of equity instruments; §22.19 makes transactions with owners **in their
  capacity as owners** equity transactions, not P&L. §4.13 is the only place MPERS contemplates an
  entity without share capital (*"such as a partnership or trust"*), and only for disclosure. The
  drawings/capital mechanics are therefore §22.19 + §4.13 **by analogy**, not a named provision.
- **§33 Related Party Disclosures — a director's claim is squarely in scope, and this one is not
  inference.** §33.2(a)(i) makes a director key management personnel and so a related party;
  §33.6-33.7 require KMP **compensation** (employee benefits per §28) disclosed in total;
  **§33.8(c)** gives as an example of a related-party transaction a person who controls the entity
  incurring expenses directly that would otherwise be borne by the entity; **§33.12(i)** lists
  settlement of liabilities on behalf of the entity; and §33.9 requires outstanding balances
  disclosed. A director's expense claim is a §33 transaction **and** its year-end balance is
  separately disclosable — distinct from the §33.7 compensation total.
- **MIA — NOT FOUND at official source.** The current By-Laws (On Professional Ethics, Conduct and
  Practice), [updated Jan 2026, effective 15 December 2026](https://mia.org.my/by-laws/), were
  full-text searched for `reimburs`, `expense claim`, `supporting document`, `source document`:
  the only `reimburs*` hits concern reimbursing an inducement's cost (an independence topic).
  **No MIA by-law, circular, technical release or FAQ on expense-claim documentation exists** as
  far as MIA's own published materials show. Stated as an absence, not filled with a secondary
  source.
- **Companies Act 2016 s.245 — the record-keeping obligation.** SSM's consolidated text
  ([Act 777 as at 1.8.2022](https://www.ssm.com.my/Pages/Legal_Framework/Document/Companies%20Act%202016_Akta%20777_BI%20(1.8.2022).pdf)):
  s.245(1) records sufficient to **explain the transactions** and permit true-and-fair statements;
  **s.245(2) entries within 60 days** of the transaction; **s.245(3) retention for 7 years**;
  s.245(9) a fine up to **RM500,000** and/or 3 years' imprisonment. **The receipt behind a claim is
  part of the statutory record**, not optional supporting colour.
- **LHDN — the tax side does NOT follow the accounting side, and this is the load-bearing one.**
  Public Ruling **5/2019 "Perquisites From Employment"** (19 November 2019),
  [PR_05_2019.pdf](http://lampiran1.hasil.gov.my/pdf/pdfam/PR_05_2019.pdf): **§3.7 defines
  "reimbursement" as a sub-species of perquisite** — an expense incurred by the employee and
  subsequently reimbursed; **§6.3** makes any personal pecuniary liability of the employee settled
  or reimbursed by the employer a **taxable perquisite** under ITA s.13(1)(a); §7.2.1 exempts a
  travelling allowance to RM6,000/year with records kept **7 years**; §3.2 defines "Document" to
  include invoices, vouchers and receipts. **NOT FOUND:** any public ruling stating the
  reimbursement-vs-perquisite distinction as one general principle — only these category-specific
  rules. So *"is this a reimbursement or a perquisite?"* has **no mechanical answer** in the
  published law.

### 8.2 The three cases are legally distinct, and two of them are not choices

| case | treatment | why it is not a preference |
|---|---|---|
| **employee** claim | expense (or asset) at approval, credit a **non-`payable`-class** "amount owing to employee" liability | WC-R10 (`wave-c-contract.md:56`) + digest law 19; MPERS §2.27/§2.36 fixes the timing |
| **director** claim | credit **`420-D01` "Amount owing to director — current"** (or `472-DIR`), **never** the employee account | MPERS §33.8(c)/§33.12(i) make it a related-party transaction and §33.9 makes the balance separately disclosable — merging it into a staff account **destroys a required disclosure** |
| **sole proprietor** (BEE) | **EQUITY** — credit `100-CAP`; drawings to `160-DRW`. Never a payable, never a claim | digest law 19 + hard constraint 13; MPERS §22.19 (owners in their capacity as owners); `coaTemplate.ts:249` — *"the proprietor cannot be his own director or his own debtor, and money he puts in or takes out is capital"* |

**Netting is refused as a default.** The chart's own director note states the rule
(`coaTemplate.ts:263`): *"Directional. Never net against 420-D01 without a legally enforceable
right of set-off."* The same binds an employee holding both an advance (receivable) and a claim
(payable): presented gross unless a set-off right is recorded.

### 8.3 The options

- **Option 1 — one control account, expense-at-approval (RECOMMENDED).** A single client-level
  non-`payable`-class liability, "Amount owing to employee — expense claims", credited at
  approval; settlement debits it and credits bank. Person-level detail is a **register** problem,
  solved by Wave G's claims module, not by chart bloat. *Pro:* MPERS-correct at recognition; it
  reuses the proven fail-safe — a non-payable credit cannot masquerade as a `supplier_bill`
  (`0009:492-499`) and mints no AP item (`x37-wave-c-a-subledger.test.mjs:1974`); zero new DB
  objects. *Con:* "who is owed what" is a journal-line read until Wave G lands the register.
- **Option 2 — the advance/clearing convention.** Clone the D-b register
  (`0043_wave_d_b1_staff_advances.sql:335-363`): one per-person COA account carrying both
  directions, net. *Pro:* a built, walled, law-19-compliant person model with attestation and
  retire semantics; netting matches what a float-holding employee actually does. *Con:* the
  account flips between asset and liability across the year, which **collides with §8.2's set-off
  rule**, and `staff_advance_applications.advance_id` is `NOT NULL` (`0043:539`) so a pure
  out-of-pocket claim has no row without widening the register.
- **Option 3 — hybrid.** Two directional per-person accounts plus an explicit application verb
  that offsets only where a set-off right is recorded. *Pro:* correct presentation **and** the
  netting reality. *Con:* two accounts per person, in a chart that today has neither.

**Recommendation: Option 1 for employees, with the director and sole-proprietor rows of §8.2 as
mandatory rather than conventional, and netting off by default.** Option 2's register is the right
*eventual* shape and Wave G should build it — but as a claims register in its own right, not by
overloading the advance account and inheriting a set-off problem the chart already warns about.

### 8.4 The two things the convention alone cannot fix

1. **The role discriminant is a judgement, and it must be ASKED, never inferred.** WC-R10's reason
   (iv) — *"a staff claim is either a reimbursement or an allowance/perquisite — a professional
   judgement Clara must never make silently"* — is now grounded in PR 5/2019 §3.7/§6.3. Under
   law 71 the agent posts unattended, so the design's answer is a **refusal path, not a default**:
   a claim whose evidence does not establish that the cost was incurred *on the entity's behalf*
   opens an `open_questions` row and posts nothing. Fail-closed on the unknown. And a claim
   posting with **no filed document** is refused outright — CA 2016 s.245(1)/(3) makes the receipt
   part of the statutory record.
2. **The breeding vector (F28) is not closed by a chart entry.** `x37.w` proves three employee
   claims still breed a `vendor_account` proposal, and the carve-out discriminates on
   `checked_via_rule_id is null` (`0037:2030-2033`), not on humanness — so an agent approval
   satisfies it. Whether F-A2's coder still writes sightings is **F-A2's fact to state**
   (prediction P-6, cross-item note X-2). If it does, the claims convention needs a wall on that
   path before an unattended claim ever posts.

---

## 9 · The D1 write-quiesce inventory

**Three CoR'd live bodies, one CHECK swap, two new tables, one new fact key** — all of it, on the
recommended paths:

| PR | body / object | kind |
|---|---|---|
| PR-3 | `clara.finalize_document_intake(…)` | **CoR**, prosrc-SHA pin |
| PR-3 | `clara.request_reextraction(uuid,text,text)` | **CoR**, prosrc-SHA pin |
| PR-3 | `ck_processing_task_error_code_0038` → successor | CHECK swap, extend-only |
| PR-4 | `clara.bank_recon_close_state(uuid,uuid)` | **CoR**, prosrc-SHA pin |
| PR-4 | `clara._bank_registry_ledger_state(uuid,date)` | NEW — or F-A3's, called |
| PR-4 | `client_fact_keys` ← `banking_arrangement` | additive INSERT |
| PR-2 | `clara.refusal_remedies` | NEW table + seed |

Every CoR'd body is re-derived on the rig by `pg_get_functiondef` at authoring time and its
`prosrc` sha256 pinned in the migration's §0 quiesce inventory; files are named
`UNNUMBERED_ft4_<slug>.sql` and **no number is claimed until merge**.

## 10 · What this design refuses to do

**Weaken a wall to make a fix fit** — the `0051` door still refuses `corrupt`/`encrypted`, drawer 1
still has no attestation path, the coding mapper still leaks no raw text · **name a `_vN` number**
(every version is read from the live registry at authoring time) · **trust migration text as a live
body** (three of these are spliced; all are rig-replayed) · **decide item C** (the convention is the
owner's — OQ-1/OQ-2; this design states the standard, the options and a recommendation, and stops)
· **repair a body that is retiring** (item E) or **claim another lane's item** (G/H/I, and the
predicate body).
