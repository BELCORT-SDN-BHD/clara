# waveS · lane L8 · #1137 — the model lane reaches the tenancy lane: six read twins and two on-behalf-of confirmations

**Branch** `riders/wS-lane08` in `C:\Users\zhant\Desktop\clara-wt\635`, cut from `main` at
**`061a6992b`** (the merged and RELEASED riders cut phase). Database `clara_l01` on
`127.0.0.1:55741`, **313 files / `0352_agent_read_twins_payroll_agreement`** when I started (#1136,
the ticket before me in this lane), **314 files / `0353_tenancy_agent_twins_obo_confirmations`**
now.

**Status: DONE** — the DATABASE HALF, which is the whole of this lane's ruled scope. The four chat
tools themselves are NOT built (`chatTurn_v22` is frozen and deployed, its manifest entries locked);
they are written below under **Successor contracts for the next chatTurn cut**, for the
orchestrator to re-parent to the mainline's next cut.

## Commits (`git log --oneline 45eccd158..HEAD`; `45eccd158` is #1136's last)

| commit | what |
|---|---|
| `3c9c4d622` | `feat(db): #1137 the tenancy lane's six agent read twins and two OBO confirmations` — the migration, the first two cells, the gate module, the gate-chain entry, the rig-meta cohort, the README section |
| `a2cd50131` | `test(db): #1137 the six reads agree row for row, and the OBO confirmation is the bookkeeper's own act` |
| `ac9d26be6` | `test(db): #1137 the escalation's OBO revision, and the eight-door ACL driven role by role` |
| `e86a0c015` | `test(db): #1137 the two guards that watch the revision body follow it into the core` |
| `2b1331a28` | `style(db): #1137 three unused bindings the runner's lint refuses` |
| `bd1487500` | `test(db): #1137 the #977 one-definition census admits the tenancy plan step` |
| `075064597` | `test(db): #1137 the model lane's floor, driven rather than argued` |
| `e2ac28bf3` | `test(db): #1137 the bare-token clock roster follows both of this lane's splits` |
| `e890a56c6` | `docs(db): #1137 the tail reports its object counts instead of naming a stale one` |

Ten files, **+3981 / −13**. Working tree clean. Nothing pushed, no PR, no GitHub write.

## The seams I tested at (work order rule 4, written before the first cell)

- **S1** `clara.wake_get_contract_terms(p_document uuid)` — the model lane's door onto #949's
  recorded-terms read (AC1).
- **S2** `clara.wake_get_tenancy_rent_plan_draft(p_document uuid)` — the lessee-treatment branch,
  the drafted plan, and whether a person has already confirmed one (AC2).
- **S3** `clara.wake_propose_contract_terms(p_document uuid)` — what Clara CAN read off #948's
  banked reading, and what she cannot (AC1).
- **S4** `clara.wake_get_rent_settlement_candidates(p_client uuid)` and
  `clara.wake_get_tenancy_deposit_coding(p_client uuid)` — the open rent months with their
  candidate bank lines, and the recorded deposits with their 1120 coding offer (AC4, AC5).
- **S5** `clara.wake_get_tenancy_escalation_revision(p_document uuid)` — the revision a recorded
  escalation asks for, which is what a person must see BEFORE confirming one (AC6).
- **S6** `clara.confirm_tenancy_rent_plan_for(p_client, p_author, p_document, p_rent_account,
  p_payable_account, p_judgement, p_op_key)` — the OBO twin of #949's confirmation.
- **S7** `clara.confirm_tenancy_rent_plan_revision_for(p_client, p_author, p_document, p_judgement,
  p_op_key)` — the OBO twin of the escalation's confirmation.
- **S8** the TEN human doors of 0300 and `clara.revise_accounting_plan` of 0193 — same signature,
  same ACL, same answers after the split. Their own batteries are this change's real regression
  proof and run unchanged.
- **S9** the ACL and the wake-kind allowlist — driven role by role, never read off the catalog.

## What was built, and why it is nine splits and eighteen new objects

CUT-PLAN.md §1.4 deferred #949's four successor contracts (class C, entries C4–C7) because all ten
0300 doors are `clara_authenticated`-only and a chat tool carries no JWT
(`packages/runtime/lib/pools.mjs`: the read pool logs in as `clara_agent_read_login` and SET ROLEs
to `clara_agent_ro`; the act lane runs `withRuntime` as `clara_runtime`). It also held the two
CONFIRMATIONS open for an owner ruling, because they are acts a person takes.

**The ruling of 2026-09-25 on #1137 says yes**, in #915's shape: the person still confirms and the
act is recorded as theirs. So the delta is four tools, eight doors:

| tool | what it reads or does | doors it needed |
|---|---|---|
| `read_tenancy_terms` (#949 item 1) | the recorded terms, the treatment branch, and — where nobody has recorded terms yet — what Clara CAN read | `clara.get_contract_terms`, `clara.get_tenancy_rent_plan_draft`, `clara.propose_contract_terms` |
| `read_rent_settlement_candidates` (item 4) | the open rent months with their candidate bank lines, and the deposits with their 1120 offer | `clara.get_rent_settlement_candidates`, `clara.get_tenancy_deposit_coding` |
| `confirm_tenancy_rent_plan` (item 2) | a named bookkeeper confirms the plan | `clara.confirm_tenancy_rent_plan` |
| `confirm_tenancy_rent_plan_revision` (item 3) | a named bookkeeper confirms the escalation's revision, after reading the offer | `clara.get_tenancy_escalation_revision`, `clara.confirm_tenancy_rent_plan_revision` |

The reads take #1000's [0320] / #1136's [0352] shape (one ungranted `_*_core(p_firm, …)`, one thin
human wrapper, one audited wake wrapper, one allowlist row per kind). The acts take #915's [0307]
shape (one ungranted core both entrances run, the human wrapper keeping its JWT read, and an
actor-explicit `_for` twin granted to `clara_runtime` that re-checks the named author LIVE).

`clara.revise_accounting_plan` (0193) is the ninth split, and it is in this file because the
escalation's confirmation ENDS in a plan revision and that door resolves its caller through
`clara._plan_door_ctx` → `clara._human_ctx` → `clara.jwt_sub()`. The alternative was a machine-side
copy of 8.7 kB of concurrency-critical logic — two advisory rungs, a row lock, a re-read under it,
the alignment wall, the catch-up wall — and a second copy of that is a second place for a posting
race to be forgotten.

## Migration

**`packages/db/migrations/0353_tenancy_agent_twins_obo_confirmations.sql`** — 2,393 lines, of which
~1,000 are the nine embedded core bodies. Reserved number used exactly once; no other migration file
touched.

Twenty-seven function objects — EIGHTEEN new and NINE recut, plus fourteen surgery helpers it
creates and drops again — six rows, no table, no column, no chart row, no event type, no role:

| § | objects |
|---|---|
| §-1 | fourteen `clara.__t1137_*` surgery helpers, dropped in §Z |
| §A | six ungranted read cores |
| §B | the six human read doors, recut as thin delegates |
| §C | the six `clara.wake_*` reads |
| §D | `clara._revise_accounting_plan_core(uuid,uuid,uuid,text,text,integer,text,date,date,jsonb,text,text)` |
| §E | `clara.revise_accounting_plan`, recut as a thin delegate |
| §F | `clara._tenancy_plan_core(...)` — the OBO lane's plan-creation step |
| §G | the two ungranted confirmation cores |
| §H | the two human confirmation doors, recut as thin delegates |
| §I | `clara.confirm_tenancy_rent_plan_for`, `clara.confirm_tenancy_rent_plan_revision_for` |
| §J | ACL + six `clara.wake_fn_allowlist` rows, all `interactive` |
| §K | comments on every new name |

### The surgery is ONE anchor for eight of the nine bodies

`c := clara._human_ctx(clara.role_rank('<floor>'));` is replaced by a comment and
`select p_firm as firm into c;` (the reads) or `select p_firm as firm, p_actor as actor into c;`
(the two confirmations). **The replacement assigns the SAME record variable the human door
assigned**, so no second substitution is needed: every `c.firm` and `c.actor` below resolves to an
argument and the rest of each body is the human door's own text byte for byte. Three bodies carry
one further anchor each, and each is a LANE question and nothing else:

- `clara.confirm_tenancy_rent_plan`'s plan step — human → `clara.create_accounting_plan`, OBO →
  `clara._tenancy_plan_core`. The branch tests for `obo` and NOT for `human`, so an unknown lane
  takes the JWT path and fails CLOSED rather than writing a plan with no receipt.
- `clara.confirm_tenancy_rent_plan_revision`'s plan step — BOTH lanes → `clara._revise_accounting_plan_core`,
  so there is no branch at all.
- `clara.revise_accounting_plan`'s own actor ladder — `clara._plan_door_ctx` moves up into the human
  delegate and the core re-resolves the plan under the firm it was handed, so a plan outside the
  caller's firm answers that body's OWN `CLR11 plan_not_found` on both lanes.

Both confirmations additionally stamp the LANE on their audit row (`via`), exactly as 0222, 0307 and
0308 stamp theirs. **That is the only observable change to a human entrance in this whole file, and
it is additive** (no cell in the estate asserts on those audit payloads — grepped).

### Prestate pins — every signature, with its sha (integrator: this is the list to diff against other lanes' recuts)

**The nine bodies this file recuts** (measured live on `clara_l01` at 313 files / `0352`):

| signature | pinned pre-image sha256(prosrc) | post: core | post: delegate |
|---|---|---|---|
| `clara.get_contract_terms(uuid)` | `2eb8402e9f343deb72f6d0a48aeeedf8f3f85dbe6458a01ba2b5150993d1e2c9` | `af2a3178bf078bd08e4c1770ec7bbe59349655d003e36446d0c9a96b693b8d27` | `ba539960fd0c2a0f7bc96e56772f5cd7ecf434d1209437f04857e187b72f28c1` |
| `clara.get_tenancy_rent_plan_draft(uuid)` | `65296ec0dc4e30c75ba441581312d59133e3325233d9fc87edd87592cd2354d0` | `c930f0aa0fe8202631b1c3abc94f011ecd3d13994fab317a04603f58b2382635` | `df2dd115d09cc643fbc8e8586ca5ab0b481f5720913428091fef5fb6de8bb707` |
| `clara.propose_contract_terms(uuid)` | `e630c5a4867d9ff1f1e124fc8ca6d45617f9632d6817e2347498331ff72eb297` | `6d1cf1b746465866b66776e7fd5dde9f46fcb5cbcbaea53930441c1c619fad60` | `464b53dbc00128e9fe2332abea410ab325c73cfa2915a8dfbbc389b063c1e0b6` |
| `clara.get_tenancy_escalation_revision(uuid)` | `75301d54afcd9f7bcf0451b016c065677b45d2207e9881386dbf3eba36ba63c5` | `221d59382b2d1f00dc5303b02381c1af5de6ce2a065f0bfbfad57244f3e17648` | `2df7bd6f2c536f7c884ac4a6c5b66fe56b9bd096f2bae33c4c34e27dc8a4c7be` |
| `clara.get_rent_settlement_candidates(uuid)` | `c08efcd38f95a5b0360233f5dd0ad6528d58c6e062592d4c8e676fa83cfa7090` | `3fe122690feec88235f26e1619c80ffe217b1958cfb918be6be63f15577e57dd` | `84deca00de71f449be9e3769699075a63e62d511e8c4091f15f7dc9ec900716f` |
| `clara.get_tenancy_deposit_coding(uuid)` | `2ceefb9cac34c65edc965ce350443af1bd8fec18088558fe2f4cf73d5a509900` | `3092d3d42a713bed5692ea41f8f32fa03ef4892c71241706eab2c2a92d8846b9` | `2bf8247e411c53f25cd4423e8c5fbfdc0e5e4649664077bd8603eabacb4f8461` |
| `clara.confirm_tenancy_rent_plan(uuid,uuid,text,text,text,text)` | `4561bcf6de011930f5c9b74fa90bca1bd24af105398f2fe584bf21c696ceb4ce` | `e8a65796245bd331a72c7f92c6b882737f45e4f1be12c35739f5ea430265ef29` | `dd1cd5a3ea4ae265ba204b29d3906ab07630315b18441960312614f34afdb48a` |
| `clara.confirm_tenancy_rent_plan_revision(uuid,uuid,text,text)` | `5a69eed78db63e81f0c4915b784aa38be4991a7dbdaa1258324e413e02642530` | `5fe080568b2cf3ae0e5258af244340789e376d2060e6695ff08fc99b8c15a2d4` | `85cd0d60303778b266aa18950421483bb029755b742b72807d7f4aa90c9b2a2f` |
| `clara.revise_accounting_plan(uuid,text,text,integer,text,date,date,jsonb,text,text)` | `8a6e69efac967592592bf3e8d08683145e5b43456a63fe673788337349382886` | `0908c2b7c026fe39bd9b8f3ce7aa3e34b196cb8086300c8c9a665ee17a1f596c` | `94804ddc1dccd444c5bb5294524634db4afea043499eb8746dd7aae16b02ad77` |

**Fifteen unconditional neighbour pins** — every body a core this file installs (or delegates to)
CALLS:

| signature | pinned sha256(prosrc) |
|---|---|
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` |
| `clara.wake_context()` | `fae8e7999b1763b96d451e12cba28ba15a27a2eb93601ccf9f178f4f361b540d` |
| `clara.assert_wake_allowed(text,text)` | `1c88b7e09e60e3384ee5a2cff36db7ba242f3397f0213b488388f7f827306e3b` |
| `clara._plan_door_ctx(uuid,integer)` | `97bd6c12ed368f7a2e5f2c96b548f7d77c6a49e603210203e282a011310e289b` |
| `clara._tenancy_rent_plan(uuid)` | `a9f66ff101e102e485878c097a3a3741ecd84d479ce183b006e94cb2a44afa09` |
| `clara._tenancy_rent_plan_draft(uuid,uuid,text,text)` | `e90c192ce7b8d22c353218aa0967b2e709aeb9c4c591ac8505d7386fcc89dc4c` |
| `clara._tenancy_lease_treatment(uuid,uuid)` | `1666cc76d4a17cb54acf672a3a792c15dbf48c823cc5ebff256845eac33182a6` |
| `clara._tenancy_escalation_state(uuid)` | `f389d329ce111afe0105657e06ade332c4c74cc62714c3dfc69188fcdb85f336` |
| `clara._tenancy_term_regions(uuid)` | `7945c7765018a2cf30b015b84436a0766db8b9ca5fe0804dd3332370381bac64` |
| `clara._contract_terms_row_json(clara.contract_terms)` | `6d38d52c210862af433baecae2da6cf4a9a58540ea94c80d87ef9e06b5349bbc` |
| `clara._contract_term_rank(text)` | `3113af0f1292a70d86a21a455dbde62fb9cc617ee867c9416cada2a38fff087a` |
| `clara._agreement_signed_date(text)` | `0e03f17abc8d13f5fa1e52b29bbd14de1f12605572a98520f5fca77df6e95322` |
| `clara._rent_payable_unsettled(uuid)` | `458964d8e6f28bf8df016f11d5f82305d2e5ba964dbe625cf39d2fa9fcd9b4c0` |
| `clara._rent_settlement_bank_candidates(uuid,bigint,date,integer)` | `ef61f841cd48f22b24a3e24b9fbe6c74365ab348d59df43a439ea94ef65977f3` |

**Post-image shas of the eight new granted names** (for a later lane that pins them):
`wake_get_contract_terms` `047d3198c0adf49baf281e3b679b8ec13ac9b57bd1e3eb0318be3245cbb513dc`;
`wake_get_tenancy_rent_plan_draft` `d766f56965e4799b4ed8d08fc7ce7a57eebedf17cdf5d4e93beb71c34b8adbc4`;
`wake_propose_contract_terms` `4a9612da31cb76dfcefc615b8b39662a59978aecc8cd1a2ba2824b6b1ccbf3d6`;
`wake_get_tenancy_escalation_revision` `9ef79f0402d8b8278e7c251c4aa4abee0545d3f6bfe373028ef2945bdcd0ca06`;
`wake_get_rent_settlement_candidates` `f0e85c078eb6e2fdf892fefb189be9fe326b041234308831dc7815334e78ca69`;
`wake_get_tenancy_deposit_coding` `079790380aecbf98df24781d2ac4622118e1ffc4addba8d30523b5ae2d3f3cb6`;
`confirm_tenancy_rent_plan_for` `10a5f4b3d48020d98842c261c0cb231fc8f6b7f4ce753ad0ffa07a23f07ebe60`;
`confirm_tenancy_rent_plan_revision_for` `1e7a87b2105f6add9561d04abf2f02ee8726f47f339239b811fda190012f0681`.
The tenth ungranted core, `clara._tenancy_plan_core(...)`, is
`b8ebd47b7a6dd1cf1516bb5f602264f1cb7a374804bfaee721320977f75d1acf`.

### FOUR BODIES THIS FILE DELIBERATELY DOES NOT PIN, and it is a ruling rather than an omission

`clara.create_accounting_plan`, `clara._obo_plan_core`, `clara._accrual_plan_core` and
`clara._authority_ref_refusal` are **lane L1's this wave**: `reports/waveS-lane01-ticket1051.md`
recuts the first two (`a7c108d5…` → `544cd88e…`, `2049c1c4…` → `149b4a3d…`) and
`reports/waveS-lane01-ticket1080.md` recuts the third. Pinning a body another lane recuts in the
same wave would refuse this migration at integration for a change that is not a defect. See
**§F, and the one duplication this file knowingly adds** below.

### Both branches of the bimodal prestate were DRIVEN on this rig

The prestate is bimodal by construction: it recovers each pre-image from the human door on a fresh
apply and by REVERSING the committed core on a redo. `CLARA_MIGRATION_REDO` only ever takes the
redo branch, so the fresh branch was driven separately.

- **FIRST APPLY (FRESH)** — driven twice. Once for real: the file's original apply printed
  `#1137 prestate: OK -- nine bodies recovered, pinned, derived and reversed (modes: FRESH FRESH
  FRESH FRESH FRESH FRESH FRESH FRESH FRESH); 15 neighbour(s) unmoved.` And once against the FINAL
  file text inside one transaction that was rolled back: all nine pre-images were restored by
  REVERSING the committed cores (never typed by hand — each restored body was asserted byte-equal to
  its pinned sha), the eighteen objects and the six allowlist rows were removed, the file was run
  verbatim, both notices printed, and the transaction rolled back. Afterwards the catalog reads zero
  `clara.__t1137*` leftovers, six allowlist rows, ledger 314 / `0353`, and a plain
  `pnpm --filter @clara/db migrate` reports `0 new migration(s) applied · 314 total`.
  Script: `<scratchpad>/wS-l08-1137/first-apply.mjs` (not committed).
- **REDO** — `CLARA_MIGRATION_REDO=0353_tenancy_agent_twins_obo_confirmations pnpm --filter @clara/db migrate`
  → `#1137 prestate: OK … (modes: REDO REDO REDO REDO REDO REDO REDO REDO REDO)`. Run twice: once
  on the file as first committed (`new checksum 3b72c562…`), and once after `e890a56c6`'s prose fix
  (`new checksum bb70ac8cb526aba80490a59c86e8d17c25f00125f75c5cbfec88c7631e288b58`, which is the
  ledger's value now). **Both branches were re-driven against the edited file**, so neither proof is
  against bytes that no longer exist: the FRESH rehearsal above was re-run after `e890a56c6` and
  printed `modes: FRESH × 9` and a green tail again. That edit moves no function body, so every pin
  in the tables above is unchanged — which is exactly what the re-run measured.
- **No data-dependent branch was left unentered.** §TAIL's behavioural probe drives all six read
  cores: each answers 0300's own `CLR11` for a firm that holds neither the document nor the client.
  The catalog probes walk every role of the seven-role machine roster, not a remembered subset.

## Acceptance criteria, each with its evidence

Ticket #1137's Agent Brief (body) plus the owner-delegated ruling comment of 2026-09-25, both
verified live on 2026-09-25 (`gh issue view 1137 --comments`; labels `enhancement`,
`ready-for-agent`).

### AC1 — "The owner's ruling on the two confirmations is recorded on this ticket before the confirmations are built."

**Satisfied before I started.** The ruling comment is on #1137, dated 2026-09-25, applied under the
owner's delegation of 2026-09-23 (SWEEP-PLAN.md): *"yes, Clara may confirm a tenancy rent plan on a
bookkeeper's behalf from the conversation, as an OBO twin in #915's shape. The person still confirms
and the act is recorded as theirs."* The label moved from `needs-info` to `ready-for-agent`.

### AC2 — "The read twins, tenant-walled, with cells proving agreement with the human doors; the tools cut into the next `chatTurn` version with their walks."

**The database half is DONE; the tools are a successor contract.**

| claim | evidence |
|---|---|
| the recorded terms agree | `p1137.terms.same_answer` — a tenancy driven end to end through #948's OWN contract-facts lane (router → claim → `clara.persist_agreement_facts`), its four readable terms recorded through `clara.record_contract_terms`, then `assert.deepEqual(machineAnswer, humanAnswer)` on the WHOLE envelope. These reads store nothing and sample nothing, so there is no per-call key that may legitimately differ. |
| the draft agrees under BOTH branches | `p1137.draft.same_answer` — whole-envelope `deepEqual` for MPERS + level rent (`drafts: true`, `MPERS Section 20`, the plan travels) AND for MFRS over twelve months (`drafts: false`, `mfrs_lease_over_twelve_months`, `plan: null`, and the QUESTION naming a right-of-use asset is what reaches the model lane). |
| the proposal agrees | `p1137.proposal.same_answer` — whole-envelope `deepEqual`, four terms proposed and no more, and the escalation named among `not_read` with `no_question_in_the_questionnaire`. |
| the open rent months agree | `p1137.settlement.same_answer` — a confirmed plan, a real posted month of rent (Dr 6100 / Cr 2050 through the ordinary journal doors), a real bank statement with the payment 20 days later; whole-answer `deepEqual`, `unsettled_cents` 360000, `candidate_window_days` 35, exactly one in-window candidate. |
| the deposit offer agrees | `p1137.deposit.same_answer` — whole-answer `deepEqual`, `deposit_cents` 720000, `proposed_account_code` 1120 in chart, `already_coded` false, and BOTH fix-round figures on the row (`deposits_account_balance_cents`, `coded_basis: account_balance_fifo`, `deposits_sharing_account`). |
| the escalation offer agrees, and reading it changes nothing | `p1137.escalation.same_answer` — whole-answer `deepEqual`, `pending` true, 360000 → 396000, and the plan is still on revision 1 afterwards. |
| tenant-walled, document scope | `p1137.terms.tenant_wall` — through firm A's credential, firm B's REAL tenancy and an invented uuid answer the same CLR11 sentence (compared after masking the id); the human door answers the same way; and firm B's own owner still reads it. |
| tenant-walled, client scope | `p1137.reads.client_tenant_wall` — both client-scoped reads answer `client not in your firm` for firm B's real client and for an invented id, identically, on the model lane AND on the human door. |
| no act | `p1137.reads.read_only` — all six reads answer inside a transaction proven read-only by a `create temporary table` that 25006s inside a savepoint first, and `clara.domain_events`, `clara.op_receipts` and `clara.audit_log` counts are identical before and after. |
| refused to every other role | `p1137.acl.eight_doors_two_roles` — `clara_agent_ro` answers on all six reads and `clara_runtime` on both acts; every other role gets 42501 on every one of the eight; the ten cores are 42501 from all four application roles; the eleven human doors — `clara.settle_rent_payable` and `clara.record_contract_terms` included — are 42501 from every machine role; and the allowlist is six rows of one kind with NOTHING for an act. |
| the model lane is never wider than the human door | `p1137.reads.model_lane_floor` — a VIEWER of firm A reads the human door herself and `clara.mint_wake_credential` refuses to mint a credential on her behalf at all (`CLR10 authority_lost`), so on the four viewer-floored reads the model lane is strictly NARROWER; and a standing credential is re-validated on EVERY use — the bookkeeper's secret reads, his membership is withdrawn through the estate's own door, the same secret answers CLR03 on a document read and on a client read, and a fresh credential reads again once the membership is back. |

**The tools themselves are NOT cut.** `chatTurn_v22`, `claraWork_v6` and `statementFacts_v4` are
frozen and deployed and their manifest entries are LOCKED. Nothing under
`packages/runtime/workflows/` was touched:
`FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` → **OK, 347 / 60 / 3**.

### AC3 (the ruling's half) — the two CONFIRMATIONS as OBO twins in #915's shape, the act recorded as theirs, the same refusals as the human doors, high-stakes `awaiting_checker` honoured.

| claim | evidence |
|---|---|
| the act is recorded as the named bookkeeper's | `p1137.obo.confirms_as_the_named_bookkeeper` — through a real `clara_runtime` connection with no JWT at all: `clara.contract_plan_confirmations.confirmed_by = BOB`, the plan's `authorised_by`, `created_by` and its revision's `created_by` all BOB, the plan cites `{kind:'contract_confirmation', id:<confirmation>}` as its explicit instruction, and BOTH audit rows (`confirm_tenancy_rent_plan`, `create_accounting_plan`) carry `actor = BOB` and `via = confirm_tenancy_rent_plan_for`. |
| …and for the revision | `p1137.revision.obo` — revision 2 at 396000 from the escalation's own date, `contract_plan_confirmations.kind = rent_plan_revision`, `confirmed_by = BOB`, the accountant's written judgement passed through unchanged, the plan revision's `created_by = BOB`, audit `via = confirm_tenancy_rent_plan_revision_for`. |
| the two entrances produce the same act | `p1137.obo.same_receipt_as_the_human_door` — identical receipt key sets, and the two plans agree on status, kind, authority kind, frequency, day rule, day of month, timezone, effective range, auto-reverse, reversal day rule, revision and BASIS. (`framework_record_id` inside `treatment` legitimately differs: it names the knowledge row each client's framework was read from.) |
| the same refusals, seven of them | `p1137.obo.refusals_match` — `plan_credits_bank_account`, `account_not_in_chart`, `professional_judgement_required` (the message IS the branch's own question), `terms_incomplete`, `confirm_wrong_kind`, `rent_plan_already_confirmed`, `payable_account_in_use`. Each driven on ONE scene through BOTH entrances and compared on **sqlstate, sentence AND typed detail**. |
| …and three more for the revision | `p1137.revision.refusals_match` — `no_escalation_recorded`, `not_due_yet` (inside the sixty-day lead), `already_revised`, same three-way comparison. `p1137.revision.judgement_required` proves a stepped rent ALWAYS asks and that both entrances ask the same question. |
| the named human's standing, LIVE | `p1137.obo.authority` — a blank op key refuses first and unconditionally; a null author is its own `invalid_author`, answered before the client is read; a non-member author and an unknown client answer the SAME sentence; a viewer gets `insufficient_role`; a member whose membership is withdrawn mid-scene through the estate's own door gets `authority_lost`; nothing survives any of them (no confirmation row, not even a reservation); and the same call succeeds once authority is live again. |
| ONE op-key namespace | `p1137.obo.one_op_key_namespace` — a replayed chat confirmation returns a byte-identical receipt, and a HUMAN replay of the same decision under the same key converges on the SAME receipt and ONE plan. |
| the human doors unchanged | `p1137.revise.human_door_unchanged` plus the neighbouring batteries below. |

**The `wave4-lane01-fix.md` §8 amendment is carried** into the successor-contract text for
`read_rent_settlement_candidates` (refusal mapping AND prompt stanza): `clara.settle_rent_payable`
returns `status ∈ {'settled','awaiting_checker'}`, and on `awaiting_checker` returns
`match_id: null`, `reason: 'high_stakes_needs_checker'` and `eligible_checker_count`. **A caller
that reads success from the absence of an error will tell a person a settlement landed when it is a
draft waiting for a second pair of eyes.** Verified live on `clara_l01` in `clara._settle_rent_payable_core`'s
body (0300:2075–2119). `candidate_window_days` (35) is likewise already on the wire and is asserted
by `p1137.settlement.same_answer`. No settlement ACT is opened by this ticket, and the tail asserts
`clara.settle_rent_payable` stayed `clara_authenticated`-only.

### AC4 — "From-scratch chain green; `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0."

- **Lint**: `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=061a6992b pnpm lint` → **exit 0**.
  (`FREEZE_BASE_REF` is the wave-2 addendum's substitution for `origin/main`; see *Base artefact*
  below. A first run found three unused bindings the runner's lint refuses and a bare `pnpm lint`
  had not; fixed in `2b1331a28`.)
- **From-scratch chain**: NOT run here. The work order assigns it to the integrator on a disposable
  cluster, and a second chain on a lane cluster is forbidden (0154 pins a cluster-wide role count).
  This file mints no role and no table, so it adds nothing the chain has not already seen; the
  FIRST-APPLY branch was proven separately, above.

## Gates, with counts

Every db run uses the FULL gate chain (the 130 `--import ./tests/*-preintegration-gate.mjs` flags in
`packages/db/package.json`, which now includes this lane's own), `--test-concurrency=1`, on
`PGPORT=55741 / clara_l01`.

| gate | result |
|---|---|
| `tests/tenancy-agent-twins.test.mjs` (new, full gate chain) | **20/20 pass** |
| FINAL RUN — every battery that reads a recut body or a guard this ticket or #1136 touched, in ONE run with the full gate chain: `tenancy-agent-twins`, `tenancy-rent-plan`, `accounting-plans`, `accrual-correction`, `accounting-plan-occurrences`, `plan-overlap-sibling-arm`, `plan-overlap-template-arm-retired`, `plan-schedule-yield-wall`, `accrual-bill-conflict`, `authority-ref-human-instruction`, `x42b2-r7-s5-clock`, `x42b2-s5c-clock`, `x42b0-r7-s5-clock`, `x42b0-s5c-clock`, `agent-read-twins-payroll-agreement`, `firm-portfolio-pack`, `wave-b/wb-g-tail`, `operation-census`, `rig-isolation` (never with the reset flags) | **241 tests · 240 pass · 0 fail · 1 skipped** (the skip is `T19 poison-role`, which needs `CLARA_RIG_ALLOW_RESET`) |
| the whole `x42-*-s5*` clock family (10 files), after the roster change | **28 tests · 28 pass · 0 fail** |
| the WHOLE `packages/db` suite, run directly (see **the gate-chain ceiling** below) | **5,852 tests · 5,739 pass · 3 fail · 110 skipped**, 28 minutes. **All three failures are fixed and individually re-verified green** — they are the #977 census (`bd1487500`) and the two arm-(D) clock cells (`e2ac28bf3`), and one of the three was already red from #1136. See the note below on why this is a once-per-database measurement. |
| `apps/web/tests/firm-scope-db-pins.test.ts` (sweep-rule (c): the corpus is in scope whenever a migration changed) | **22/22 pass** — and NO corpus entry is owed: 0353 installs plain SQL and contains no `execute` at all, so the reviewed dynamic-SQL barrier map is untouched |
| `pnpm typecheck` | **Done** (apps/web + packages/runtime, no errors) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=061a6992b pnpm lint` | **exit 0** |
| `FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` | **OK — 347 / 60 / 3** |
| `node scripts/check-wiki-dynamic-sql.mjs` | **OK — 1588 clara function definition(s) and 248 change-of-record patch(es) scanned**; 0353 needs NO dynamic-SQL waiver, because it contains no `execute` at all |
| `node packages/runtime/scripts/check-parts-parity.mjs` (not owed — `packages/runtime` untouched — run to MEASURE the part kinds the successor contracts name) | **OK**, `emittable={freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}` |
| `apps/web` unit suite / browser walks | not run: the diff touches NO file under `apps/web` (`git diff --stat 45eccd158..HEAD` lists ten files, all under `packages/db`) |

### Vacuity controls (each break was applied to the LIVE catalog and then undone byte for byte)

1. **The frontier gate.** The first run of the new test file, before 0353 existed, failed LOUDLY
   with the file's own message (`#1137: no migration matching /tenancy_agent_twins_obo_confirmations$/
   is applied … this is a FOCUSED run and must fail loudly rather than skip`) rather than skipping.
2. **The tenant wall.** `f.firm_id = c.firm` → `f.firm_id = f.firm_id` in
   `clara._get_contract_terms_core` and `cl.firm_id = c.firm` → `cl.firm_id = cl.firm_id` in
   `clara._get_rent_settlement_candidates_core`, reinstalled on the live catalog: **2 of the 19
   cells went red**, including `firm B's real tenancy through firm A's credential: expected SQLSTATE
   CLR11 but the call SUCCEEDED`. Both bodies restored from a pre-break dump and sha-compared
   (`af2a3178…`, `3fe12269…`); 19/19 again.
3. **The OBO authority floor.** `if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then` →
   `if false then` in `clara.confirm_tenancy_rent_plan_for`: `p1137.obo.authority` went red on the
   viewer arm. Restored, sha `10a5f4b3…`.
4. **The lane stamp.** The `case p_lane when 'obo' …` in `clara._confirm_tenancy_rent_plan_core`'s
   audit replaced by the bare human verb: `p1137.obo.confirms_as_the_named_bookkeeper` went red.
   Restored, sha `e8a65796…`.
5. **The rig-meta roster.** Removing `...TENANCY_AGENT_TWINS_0353_AGENT_FNS` from the `agentRo` set
   turned `operation-census` red with six exact messages (`clara.wake_get_contract_terms(p_document
   uuid) — granted to clara_agent_ro but no cohort in packages/db/tests/rig-meta.mjs ALLOWED … claims
   the name`, and five siblings). Restored from a byte copy; the working tree was clean afterwards.
6. **The two-sided pin.** ONE extra space inside one embedded core (`'history', v_hist` →
   `'history',  v_hist`), run in a rolled-back transaction: the file refused BY NAME —
   `#1137 tail: clara._get_contract_terms_core(uuid,uuid) was committed at sha 18b6bc34… but §0
   derived af2a3178…`. Script: `<scratchpad>/wS-l08-1137/pin-vacuity.mjs`.

### A Windows-only gate-chain ceiling — already crossed before this ticket, and MEASURED

`pnpm --filter @clara/db test` fails on this Windows host with **`The command line is too long`**.
It is `cmd.exe`'s command-line ceiling, which pnpm's `run` shells through, and I measured it on this
host rather than inferring it: a bare `cmd /d /s /c "echo <n bytes>"` passes at 8,150 and fails at
8,180.

**This ticket did NOT tip it**, and I checked rather than assumed. Running the real `test` script's
own text through `cmd /d /s /c` with the runner replaced by a same-length no-op:

| chain | length | result |
|---|---|---|
| as it stands (130 gates, mine included) | 8,247 | too long |
| **without my entry** (129 gates) | **8,186** | **too long** |
| without mine and #1136's (128 gates) | 8,110 | OK |

So the crossing happened one commit before me, in this same lane, when #1136 added the 129th entry
(`agent-read-twins-payroll-agreement-preintegration-gate.mjs`) — consistent with that ticket's own
report, which lists 22 batteries and never claims a whole-suite run. Mine widens the overrun by 61
characters; it did not cause it.

**CI is unaffected** — every job in `.github/workflows/ci.yml` is `runs-on: ubuntu-latest`, where the
limit is `ARG_MAX` (megabytes), and no Windows job exists. The whole suite still runs on this host
when invoked directly rather than through pnpm's `cmd.exe` shim:
`node --test --test-concurrency=1 $GATES "tests/**/*.test.mjs"` from `packages/db`, which is how the
whole-suite figure in the gate table was produced.

**Every remaining lane in this wave that adds a gate module widens the overrun**, so this is an
integrator note as much as a follow-up: see follow-up 2.

### …and the whole suite is a ONCE-PER-FRESH-DATABASE measurement

I ran it a second time after the last commit, to re-measure at the final tree, and got a different
kind of red: two batteries refuse a REUSED database by name. `f-a5-reporting-agency-pr1`'s cell D
says it outright (`evaluate_fs_pack_agent v1 is already deployed but CLARA_ESTATE_REUSED_DB is not
set to "1" — either this database is not actually fresh … or the reuse is deliberate`), because the
FIRST run deployed that closure row; and `f-a5b-sandbox-export-pr1`'s readiness guard reports
`sandbox_watermark rows=4/3`, because the first run inserted one. Both cells are `ok` at the same
cell numbers in the first run's log. So the first run IS the measurement, and I did not chase the
second one — the three real failures it would have re-measured were each re-run individually and
are green. Re-measuring the whole suite properly needs a fresh database (or
`CLARA_ESTATE_REUSED_DB=1` plus whatever the watermark guard wants), which is the integrator's
from-scratch cluster, not a lane's.

## Docs, in the same commits

- **`packages/db/README.md`** — a new `## 0353` section (its own section only; no existing section
  touched): why the four tools were blocked, the ruling, the two shapes applied at once, why
  `clara.revise_accounting_plan` is in the file, **the one duplication this file knowingly adds and
  the follow-up that removes it**, what the machine side bought, the surgery and how a reader checks
  it, the two shapes of client-pin arm, and the redo note.
- **`packages/db/tests/rig-meta.mjs`** — a `#1137 [0353]` cohort block (six agent names, two runtime
  names, ten ungranted cores, the bimodal `cohortFailures` guard) plus the two roster entries; and
  the `#949 [0300]` prose amended so "not one machine-lane grant" still reads true and says HOW (new
  names beside the ten, never a widened grant on one of them).
- **`packages/db/package.json`** — one gate-chain token at the end (migration order: after
  `agent-read-twins-payroll-agreement`, 0352).
- **`CONTEXT.md`** — not edited. This ticket mints no domain vocabulary: "wake wrapper", "ungranted
  core", "OBO twin" and "settlement candidate row" are all already in the estate's language.
- **`docs/PRD.md` / `docs/ARCHITECTURE.md`** — not edited (work order rule 5).

### Two neighbour guards that watch the revision body, brought forward (`e86a0c015`)

0353 is the first generation of `clara.revise_accounting_plan` that is a SPLIT rather than a splice,
so two existing guards needed the same generational treatment every earlier recut got. Neither is
weakened:

- `accounting-plans.test.mjs` `p640.revision.end_race` greps its two markers (`for update`, then
  `plan_ended` after it) from wherever the computation actually is — the core once it exists, the
  door before that.
- `plan-overlap-template-arm-retired.test.mjs` `p929.tail` (T.4) gains a generation gated on this
  lane's own stable stem: the roster it walks swaps the door for the core, and a new **(T.5)** pins
  the thin delegate (`94804ddc…`) and asserts it IS one — it names the core and holds no rung and no
  row lock of its own.
- (T.4) also stops measuring the plan row lock by a substring that is not one. The revision core
  opens with a firm-walled RE-RESOLUTION of the plan — the wall `clara._plan_door_ctx` applied above
  the door before the split — and that plain read matched the old proxy without being a lock. The
  rung-above-lock claim is now read at `for update` itself. **Measured on the live catalog**: of the
  roster's bodies only the revision core carries `for update` at all, so no body that was checked
  before is skipped now.

### A THIRD and FOURTH guard, both found by the whole-suite run

**The #977 one-definition census (`bd1487500`).**

`authority-ref-human-instruction.test.mjs` `p977.definition.one` keeps an EXACT closed world of the
clara bodies that READ `clara._authority_ref_refusal`. `clara._tenancy_plan_core` joins it — which is
the ruling HOLDING on one more machine lane rather than escaping it: the tenancy OBO plan step reads
the one definition instead of carrying an inline chat-lane existence test of its own, exactly as
#915's and #941's twins do. The roster stays measured (a reader the cell does not name still reds
it) and the new entry carries the note that this body belongs inside `clara._obo_plan_core` and goes
away with it when #1051 and #1080 land.

**The round-8 M4 bare-token clock roster (`e2ac28bf3`).** `x42-s5-helpers.mjs`'s arm-(D) census
keeps an EXACT roster of the clara bodies that carry a bare clock token, and BOTH of this lane's
splits move one: #1136's `clara.list_review_queue` → `clara._list_review_queue_core`, and mine
`clara.revise_accounting_plan` → `clara._revise_accounting_plan_core`. The roster follows the
COMPUTATION rather than the door name, exactly as it already does for #899's client-birth core and
#1000's financial-pack core: the first leaves the unconditional base array for a MOVE-gated pair on
0352's own stem, the second swaps one name inside 0193's cohort above 0353. **#1136's half was red
on this branch before I touched anything** — that ticket's report lists 22 batteries and never
claims a whole-suite run — so this commit repairs the lane, not just my ticket. Neither gate is
weakened: the census is still exact at both frontiers, a MISSING name still fails, and a body that
GROWS a clock token still fails.

**Integrator note:** `plan-overlap-template-arm-retired.test.mjs` is a file lane L1 also edits this
wave (its `RECUT` roster pins `clara.create_accounting_plan` at `a7c108d5…`, which #1051 moves to
`544cd88e…`). My hunk is additive and sits below the roster; L1's is a value inside it.
`authority-ref-human-instruction.test.mjs` is the same shape of shared file: #1080 moves the roster
`p977.definition.one` walks (its `_assert_plan_authority` becomes the caller), and my hunk adds one
gated entry beside the existing one rather than rewriting the assertion.

## §F, and the one duplication this file knowingly adds

`clara._tenancy_plan_core` is the plan-creation step the OBO confirmation takes, because
`clara.create_accounting_plan` resolves its actor from a JWT a `clara_runtime` connection does not
have. It is `clara._obo_plan_core`'s (0308) body with the kind fixed to `recurring_journal` and the
`via` fixed to this entrance — **a THIRD instance of a body the estate is actively de-duplicating**,
and it belongs in `clara._obo_plan_core` as a two-line widening of that body's closed kind set
(whose own comment invites it: *"a later lane that widens the set finds this line instead of a
silent constraint violation"*).

It is separate only because **lane L1 of this same wave recuts `clara._obo_plan_core`**
(`reports/waveS-lane01-ticket1051.md`: pre `2049c1c4…` → post `149b4a3d…`, and #1080 after it), and
the sweep's grouping rule is that no database body is written in one lane and written or pinned in
another. Widening it from here would be a second recut of one body in one wave — the exact collision
the rule prevents — and a marker-tolerant prestate over a body I cannot see the post-image of would
be an untestable branch, which the wave-3 addendum forbids. So this file adds a body, names the
duplication in the migration header, in the function's own `comment on`, and in
`packages/db/README.md`, and files it as follow-up 1 rather than reaching into another lane's.

## Successor contracts for the next chatTurn cut

Not built. Four tools, for the `chatTurn` version that follows `v22`.

**The pools, measured.** The reads run inside `readScoped`, which mints a plain `interactive`
credential OBO the initiating human and runs it on the `clara_agent_ro` read pool — exactly the one
wake kind 0353 allowlists. It is defined at `chatTurn.v13.infra.ts:76` and re-exported through v14
into `chatTurn.v15.infra.ts:52`, which is what `chatTurn.v22.tools.ts:28` imports. The
confirmations run inside `pools().withRuntime`, which SET ROLEs to `clara_runtime` — exactly how
`runStartPrepaymentScheduleWork` calls `clara.create_prepayment_schedule_for`
(`chatTurn.v22.tools.ts:1550-1552`).

**The part kinds, measured rather than assumed** (`node packages/runtime/scripts/check-parts-parity.mjs`,
run on this branch):

- the two READS emit **`freeform_result`**, which is already declared and already emittable from the
  chat lane — the census names its one construction site, `chatTurn.v16.prompt.ts:187`. **No new
  kind, no parity entry.**
- the two CONFIRMATIONS are the cut's ONE open question, and the measurement is this: `work_result`
  IS a declared, emittable kind, but every one of its six construction sites is a
  `claraWork.*.impl.ts` — the chat lane has never emitted it. #949's contract names `work_result`;
  the narrower option, and the one the nearest precedent takes, is what
  `runStartPrepaymentScheduleWork` does: return a TYPED TOOL RESULT to the model
  (`{ok:true, status:"confirmed", plan: rentPlanPart(receipt), replayed}`) and let the turn's
  existing part mapping decide what reaches the wire, which needs no new kind and no parity entry
  at all. **I did not decide this; the database half is identical either way.** Whichever the cut
  takes, the parity check is the arbiter and it is green today at
  `emittable={freeform_result, work_accepted, work_status, work_result, work_question, knowledge_receipt}`.

### 1 · `read_tenancy_terms` (#949 item 1)

```ts
export const readTenancyTermsInputSchema = z.object({
  document_id: z.string().uuid().describe("the filed tenancy agreement to read"),
}).strict();
```

> #949's input, unchanged. No `client_id` is needed and none should be added: all three doors take
> the DOCUMENT, and each core resolves the client itself under the credential's firm — adding a
> client argument would be one more existence surface for no gain.

**Door calls, with argument order**

```ts
// clara.wake_get_contract_terms(p_document uuid) — the recorded terms, each with its
// source_region_ids, its basis_kind and its basis sentence, plus the superseded readings in
// `history`, and the agreement's own class.
const terms = await callDoor("clara.wake_get_contract_terms", [input.document_id]);

// clara.wake_get_tenancy_rent_plan_draft(p_document uuid) — the treatment branch, the drafted plan
// (ONLY when the branch admits it), the refusals, and whether a person has already confirmed one.
const draft = await callDoor("clara.wake_get_tenancy_rent_plan_draft", [input.document_id]);

// …and ONLY when `terms.terms` is empty: what Clara CAN read off #948's banked reading, and what
// she cannot. Never called otherwise: the RECORD is what a person decided, the proposal is what a
// machine read, and offering the second beside the first invites the model to prefer its own.
const proposal = terms.terms.length === 0
  ? await callDoor("clara.wake_propose_contract_terms", [input.document_id])
  : null;
```

**Refusal mapping**

| SQLSTATE / shape | tool refusal | what the person is told |
|---|---|---|
| `CLR03` (no credential / kind not allowlisted / no `on_behalf_of` / a client-pinned credential) | `not_permitted` | "I cannot read your firm's agreements in this conversation." Never name the document. |
| `CLR11` (`document % is not a live filing in your firm`) | `not_found` | "I cannot find that agreement under your firm." **This is also the answer for another firm's real tenancy — that is deliberate, and a tool must not distinguish them.** The id in the sentence is the caller's own, so it leaks nothing. |
| `draft.agreement_class` is not `tenancy`, or `draft.refusals` carries `not_a_tenancy` | `not_a_tenancy` | say what class it IS, from `agreement_class`, and stop. A deterministic evaluator decided that from the words the page uses for itself. |
| `terms.terms` is `[]` | NOT a refusal | nobody has recorded the terms yet. Report the proposal's `proposed` and `not_read` and say the recording is a person's act on the Contract page. |
| `draft.treatment.drafts === false` | NOT a refusal | give `draft.treatment.question` VERBATIM and name `draft.treatment.standard`. NEVER compose a question and never offer a plan: `draft.plan` is null on that branch by design. |
| `draft.confirmed === true` | NOT a refusal | a plan already runs (`plan_id`, `plan_status`). Say so before offering anything. |

**Part kind:** `freeform_result`.

**Prompt stanza** (verbatim; #949's own, unchanged — the doors beneath it changed, the words did
not):

```
When someone asks what a tenancy says, read the terms that were recorded against it and quote them
as they are recorded. Five terms exist — the monthly rent, the deposit, the term's first and last
day, and any escalation — and each one says how it came to be what it is: READ from a region of the
page, DERIVED from regions by the rule its basis sentence states, or STATED by a person. Say which.
Never present a derivation as something the page printed, and never add two terms together. A term
that is not recorded is not zero and not absent from the tenancy — it is a term nobody has recorded,
and the proposal read says whether Clara can read it at all (an escalation never can: the agreement
questionnaire has no question for one). If the rent plan has not been confirmed, say what the
standard asks before you say what Clara would draft: the treatment carries a written basis naming
MPERS Section 20 and MFRS 16, and where it asks, its `question` is the sentence to give — do not
compose your own.
```

### 2 · `read_rent_settlement_candidates` (#949 item 4)

```ts
export const readRentSettlementCandidatesInputSchema = z.object({
  client_id: z.string().uuid().describe("the client whose rent and deposits these are"),
}).strict();
```

**Door calls, with argument order**

```ts
// clara.wake_get_rent_settlement_candidates(p_client uuid)
// rows: [{entry_id, plan_id, document_id, filing_id, posting_date, period_month,
//         payable_account_code, rent_cents, unsettled_cents, candidate_window_days,
//         candidates: [...]}]
const months = await callDoor("clara.wake_get_rent_settlement_candidates", [input.client_id]);

// clara.wake_get_tenancy_deposit_coding(p_client uuid)
// rows: [{document_id, deposit_cents, printed_raw, recorded_at, basis_kind, source_region_ids,
//         term_start, proposed_account_code:'1120', proposed_account_name,
//         proposed_account_in_chart, already_coded, coded_cents,
//         deposits_account_balance_cents, coded_basis:'account_balance_fifo',
//         deposits_sharing_account, candidates: [...]}]
const deposits = await callDoor("clara.wake_get_tenancy_deposit_coding", [input.client_id]);
```

**Refusal mapping**

| SQLSTATE / shape | tool refusal | what the person is told |
|---|---|---|
| `CLR03` | `not_permitted` | "I cannot read this client's rent in this conversation." |
| `CLR11` (`client not in your firm`) | `client_not_found` | "I cannot find that client under your firm." **Another firm's real client answers identically.** |
| `months` is `[]` | NOT a refusal | "No month of rent is waiting on its payment." |
| one or more months | NOT a refusal | for each: the month, the amount still owed, the window that was searched (`candidate_window_days`, 35), and EVERY candidate's own date, description and amount — never picking one, even when exactly one is offered. |
| a deposit with `already_coded: false` | NOT a refusal | offer the 1120 coding and say both figures out loud: the account's own balance and THIS deposit's FIFO share of it. A deposit is never drafted from the agreement: signing states a term, it does not say the money moved. |
| `proposed_account_in_chart: false` | NOT a refusal | say 1120 Deposits Paid is not in this client's chart and that adding it is the chart door's act, not this lane's. |

**The `wave4-lane01-fix.md` §8 amendment, carried.** If a later cut ever gives the chat lane a rent
settlement ACT — **this ticket deliberately does not, and 0353's tail asserts
`clara.settle_rent_payable` is `clara_authenticated`-only** — then
`clara.settle_rent_payable(uuid,uuid,uuid,text)` returns `status ∈ {'settled','awaiting_checker'}`,
and on `awaiting_checker` returns `match_id: null`, `reason: 'high_stakes_needs_checker'` and
`eligible_checker_count`. **A caller that reads success from the absence of an error, or from
`entry_id` alone, will tell a person a settlement landed when it is a draft waiting for a second
pair of eyes.** (Verified live on `clara_l01` in `clara._settle_rent_payable_core`'s body.)

**Part kind:** `freeform_result`. **No accept-via-chat tool is proposed**, per #949's own report.

**Prompt stanza** (verbatim, #949's own, with the amendment's sentence added at the end):

```
A month of rent stays open until the payment appears on the statement, and a cheque is the same
case — the day it appears is the only day you can see. Offer every candidate line a month has and
choose none of them: two lines of the same amount in the same window are two lines a person
adjudicates, not a tie you break. Never say a rent has been paid because a plan posted it; the plan
recognises the expense, the bank line moves the money. A deposit is never drafted at all: signing
states a term, it does not say the money moved, so offer the deposits-paid coding only when a line
of exactly that amount is actually there. And if a person tells you they have just settled one,
never confirm it landed from the absence of an error: a high-stakes settlement comes back
awaiting_checker, which is a draft waiting for a second pair of eyes, not a payment.
```

### 3 · `confirm_tenancy_rent_plan` (#949 item 2, built under the ruling of 2026-09-25)

```ts
export const confirmTenancyRentPlanInputSchema = z.object({
  client_id: z.string().uuid(),
  document_id: z.string().uuid().describe("the filed tenancy agreement whose plan is being confirmed"),
  rent_account: z.string().trim().min(1).max(32).nullable()
    .describe("the expense account to debit; null takes the draft's own 6100 Rental of Premises"),
  payable_account: z.string().trim().min(1).max(32).nullable()
    .describe("the liability account to credit; null takes the draft's own 2050 Rent Payable"),
  judgement: z.string().trim().min(1).max(4000).nullable()
    .describe("REQUIRED when the lessee branch asks; the accountant's own written treatment"),
}).strict();
```

**Door call, with argument order** — `clara.confirm_tenancy_rent_plan_for`, NOT
`clara.confirm_tenancy_rent_plan` (which stays `clara_authenticated`-only):

```ts
// The session's pin governs, and a DISAGREEMENT is refused rather than silently resolved: a tool
// that quietly preferred one of two client ids would be deciding whose books an act lands in.
if (!ctx.clientId) return noClientRefusalV22("rent_plan_needs_client_pin", "…");
if (input.client_id !== ctx.clientId) return clientMismatchRefusalV22("rent_plan_client_mismatch", "…");
const opKey = stableOpKey(ctx.taskId, CONFIRM_TENANCY_RENT_PLAN_TOOL, input);
const receipt = await pools().withRuntime(async (c) => (await c.query(
  "select clara.confirm_tenancy_rent_plan_for("
  + "p_client          => $1::uuid, "
  + "p_author          => $2::uuid, "
  + "p_document        => $3::uuid, "
  + "p_rent_account    => $4::text, "
  + "p_payable_account => $5::text, "
  + "p_judgement       => $6::text, "
  + "p_op_key          => $7::text) as r",
  [input.client_id, ctx.createdBy, input.document_id,
   input.rent_account, input.payable_account, input.judgement, opKey],
)).rows[0]?.r ?? null);
```

> **`p_judgement` is sent EXPLICITLY even when null**: null is an answer on this wire, not an
> omitted key.
>
> **A STABLE op key, not a fresh one per call, and this is a deliberate departure from #949's
> wording.** #949 wrote "a FRESH `p_op_key` per act" for the WEB surface, where two clicks are two
> intents. In chat, a retried tool call is ONE intent, and `stableOpKey(ctx.taskId, tool, input)` is
> what every other v22 authoring tool uses. The core's reservation hashes the caller's own arguments
> and NOT the author, so a chat confirmation and a human replay of the same decision under the same
> key converge on ONE receipt and ONE plan — driven by `p1137.obo.one_op_key_namespace`.

**Refusal mapping** (every token below is answered IDENTICALLY by the human door — sqlstate,
sentence and typed detail — and `p1137.obo.refusals_match` drives all seven on both entrances):

| SQLSTATE / `detail.reason` | tool refusal | what the person is told |
|---|---|---|
| `CLR10` `professional_judgement_required` | `judgement_required` | **the refusal's MESSAGE is the branch's own question** — give it verbatim, name `detail.standard`, then ask the person for their written treatment. NEVER supply it yourself and never confirm on your own reading of the standard. |
| `CLR10` `plan_credits_bank_account` | `plan_credits_bank_account` | the payable named is one of this client's own bank accounts (`detail.account_code`, `detail.account_name`). Offer the liability account instead; never retry with a different bank account. |
| `CLR10` `payable_account_in_use` | `payable_account_in_use` | another tenancy's live rent plan already uses that payable account (`detail.plan_id`, `detail.document_id`); two plans on one account share their payments month for month. Give this tenancy its own liability account. |
| `CLR10` `account_not_in_chart` | `account_not_in_chart` | `detail.account_code` is not in this client's chart or is inactive. The chart door adds it; this lane does not. |
| `CLR10` `rent_plan_already_confirmed` | `already_confirmed` | a plan already runs (`detail.plan_id`, `detail.plan_status`). Ending or revising it is the plan lane's own act. |
| `CLR10` `confirm_wrong_kind` | `not_an_agreement` | the document is not an agreement contract (`detail.kind`). |
| `CLR10` `terms_incomplete` | `terms_incomplete` | there is no rent plan to confirm: `detail.missing_terms` names what is missing, and recording terms is a person's act on the Contract page. |
| `CLR10` `invalid_op_key` / `invalid_author` | internal fault | neither can be caused by a person; both mean the tool built its call wrong. |
| `CLR11` (`client is not in your firm`) | `client_not_found` | "I cannot find that client under your firm." **A non-member author answers identically — deliberately.** |
| `CLR04` `authority_lost` | `not_permitted` | "Your membership of this firm is no longer active, so I cannot record a confirmation as yours." |
| `CLR04` `insufficient_role` | `not_permitted` | "Confirming a rent plan needs a bookkeeper or above." |
| `CLR13` | `in_flight` | an in-flight sibling holds this key. |

**Part kind:** see *The part kinds, measured* above — `work_result` as #949 wrote it, or a typed
tool result in `runStartPrepaymentScheduleWork`'s shape. The receipt the door returns is
`{document_id, client_id, confirmation_id, plan_id, revision_id, status, occurrences,
next_occurrences, overlap_warning, treatment, professional_judgement}` — and note that
`occurrences` is a COUNT (24 for a two-year monthly tenancy), not a list. A replayed op key returns
the byte-identical receipt.

**Prompt stanza** (#949's own, with two sentences added for the conversational entrance):

```
A recurring rent plan never starts because you read a contract. It starts because a person said so,
looking at what you read. Before you offer to confirm one, state the rent, the term and the accounts
the plan would use, and say which standard admits the treatment. If the branch ASKS — the accounts
are on MFRS and the lease runs over twelve months, the tenancy states an escalation, or nobody has
recorded the framework — you may not confirm on your own reading of the standard. Give the question
the branch carries, ask the accountant for their written treatment, and pass it through unchanged.
It is recorded with the act and printed on the plan. Never choose the payable account yourself when
the door has refused one: a rent plan that credits the bank counts the statement line that pays the
rent twice. When you do confirm, the act is recorded as the person you are working for, not as you:
their name is on the confirmation and on the plan, and the trail says it was taken in a
conversation. So confirm only when they have said so in this conversation, in words, about this
tenancy — never because it looks like the obvious next step.
```

### 4 · `confirm_tenancy_rent_plan_revision` (#949 item 3, under the same ruling)

```ts
export const confirmTenancyRentPlanRevisionInputSchema = z.object({
  client_id: z.string().uuid(),
  document_id: z.string().uuid(),
  judgement: z.string().trim().min(1).max(4000).nullable()
    .describe("a stepped rent ALWAYS makes the branch ask, so in practice this is required"),
}).strict();
```

**Door calls, with argument order.** The offer is READ first, on the read pool, and the act is taken
second, on the runtime pool:

```ts
// 1 — the offer, through readScoped:
//     clara.wake_get_tenancy_escalation_revision(p_document uuid) → {pending, reason, plan_id,
//     current_cents, new_cents, days_until, effective_from, lead_days, printed_raw,
//     proposed_revision:{…}}
const offer = await readScoped(ctx, (c) => callDoor(c, "clara.wake_get_tenancy_escalation_revision",
  [input.document_id]));

// 2 — the act, through withRuntime:
const receipt = await pools().withRuntime(async (c) => (await c.query(
  "select clara.confirm_tenancy_rent_plan_revision_for("
  + "p_client   => $1::uuid, "
  + "p_author   => $2::uuid, "
  + "p_document => $3::uuid, "
  + "p_judgement=> $4::text, "
  + "p_op_key   => $5::text) as r",
  [input.client_id, ctx.createdBy, input.document_id, input.judgement, opKey],
)).rows[0]?.r ?? null);
```

**Refusal mapping** (all three-way identical to the human door; `p1137.revision.refusals_match` and
`p1137.revision.judgement_required` drive them on both entrances):

| `detail.reason` | tool refusal | what the person is told |
|---|---|---|
| `professional_judgement_required` | `judgement_required` | **the usual case** — a stepped rent always asks, and the message is the branch's own question. |
| `no_escalation_recorded` | `nothing_to_revise` | no escalation is recorded on this tenancy; recording one is a person's act, because the frozen questionnaire has no question for a rent review. |
| `no_confirmed_plan` | `nothing_to_revise` | no rent plan runs on this tenancy yet. |
| `not_due_yet` | `not_due_yet` | the escalation is real but further out than the sixty-day lead (`detail.days_until`, `detail.effective_from`, `detail.lead_days`). |
| `already_revised` | `already_revised` | the plan already charges the escalated rent. |
| `CLR11` / `CLR04` / `CLR13` / op-key | as for tool 3 | identical. |

**Part kind:** as for tool 3. The receipt is `{document_id, client_id, confirmation_id, plan_id,
revision, revision_id, from_cents, to_cents, effective_from, treatment, professional_judgement}`.

**Prompt stanza** (verbatim, #949's own, with one sentence added for the conversational entrance):

```
A rent review changes nothing by itself. When a tenancy states an escalation, say what the plan
charges today, what it would charge, and from when — and then say why the standard asks:
straight-line means the total rent averaged over the term, so a stepped rent's monthly expense
differs from the month's cash rent unless the increases only follow expected general inflation. That
is a judgement about the term, not a figure you can read. Ask for it, pass it through unchanged, and
never average anything yourself. The revision is recorded as the person you are working for: confirm
it only when they have said so in this conversation, about this escalation, after seeing both
figures.
```

### What the cut must NOT do

- **Do not add a settle tool.** `clara.settle_rent_payable` is `clara_authenticated`-only and
  0353's tail asserts it stayed that way, role by role. Two candidate lines of the same amount in
  one window are two lines a PERSON adjudicates, where they can see both.
- **Do not add a record-terms tool.** `clara.record_contract_terms` is likewise untouched: what a
  page says is a person's own reading, and the proposal read exists so Clara can show what she read
  without recording it.
- **Do not call an ungranted core.** `clara._tenancy_lease_treatment`, `clara._tenancy_rent_plan_draft`,
  `clara._tenancy_escalation_state` and `clara._rent_payable_unsettled` are granted to nobody and
  reached only from the doors above. The treatment's QUESTION reaches the chat lane inside
  `wake_get_tenancy_rent_plan_draft`'s answer, which is the same body a person reads.
- **Do not allowlist `interactive_client` for any of the six reads.** None needs a client pin, and
  the four document-scoped doors REFUSE a pinned credential outright rather than ignoring it.
- **Do not grant either `_for` twin to `clara_agent_ro` or to a wake role.** A read role that could
  confirm a rent plan would be the agent deciding what it is allowed to do. They are runtime doors,
  not wake doors, and 0353's tail asserts no `wake_fn_allowlist` row names either of them.

## Base artefact the integrator should expect (not a defect of this lane)

A bare `pnpm lint` on this branch reports **35 `UNLOCKED-VS-BASE` freeze violations**, exactly as
#1136's report records. They are entirely a consequence of the base: `origin/main` is `3bf6aa94d`,
which is AHEAD of this lane's base `061a6992b` and carries
`204b7c199 chore(runtime): lock the 35 deployed frozen-workflow entries after the cut release`.
`git diff 061a6992b..HEAD -- frozen-workflows.json` is **empty** — this lane changed no manifest
entry. Against the wave base the check is clean:
`FREEZE_BASE_REF=061a6992b node scripts/check-frozen-workflows.mjs` → `OK — 347 / 60 / 3`.

## Follow-ups worth filing

1. **`clara._obo_plan_core` should absorb `recurring_journal`, and `clara._tenancy_plan_core` should
   become a two-line caller of it.** The estate now carries THREE OBO plan-creation steps
   (`_accrual_plan_core`, `_obo_plan_core`, `_tenancy_plan_core`) where one parameterised body would
   do, and #1051/#1080 are narrowing the first two this very wave. The change is two lines in
   `_obo_plan_core` (the closed kind set and the `via` case) plus a delegate here. **It must land
   AFTER #1051 and #1080**, in a lane that owns that body. Named in the migration header, in
   `comment on function clara._tenancy_plan_core`, and in `packages/db/README.md` § 0353.
2. **`packages/db`'s gate chain is past `cmd.exe`'s command-line ceiling**, so
   `pnpm --filter @clara/db test` does not run on a Windows host. MEASURED (see the section above):
   it crossed at the 129th entry, #1136's, one commit before this ticket; mine is the 130th and
   widens the overrun to 8,247 characters. CI is Linux and unaffected, and the suite still runs when
   invoked directly. The structural fix — one `--import ./tests/preintegration-gates.mjs` that
   imports the 130 modules, instead of 130 flags — is a single-hunk change to a file NINE lanes edit
   this wave, so it belongs to a ticket of its own after integration, not to a lane mid-wave.
3. **The chat lane can now confirm a rent plan, and nothing tells the firm it happened in a
   conversation except the audit row's `via`.** That is the same posture `create_prepayment_schedule_for`
   has, but a rent plan is a recurring posting instruction with a professional judgement attached.
   Worth an owner look at whether the Contract page should show "confirmed in a conversation with
   Clara" beside the person's name.
4. **The dormant client-pin arms have no cell.** All six wake doors carry a pin wall — a comparison
   for the two client-scoped reads, an outright refusal for the four document-scoped ones — and
   neither is driven, because no pinned kind is allowlisted for any of them. The first ticket that
   allowlists `interactive_client` owes the cells.
5. **`clara._tenancy_plan_core` writes no operation receipt**, where the human lane's
   `clara.create_accounting_plan` writes one under `<key>:plan`. That is 0307's own precedent (the
   outer act's key covers the whole configuration) and `p1137.obo.same_receipt_as_the_human_door`
   states it out loud, but it means the two lanes leave different receipt trails for one decision.
   Worth a look when #1077's follow-up on the shared `:plan` op-key namespace is picked up.

## Anything unverified

- **No real model has driven any of the four tools.** The database half is driven end to end on a
  real rig through real doors, but the tools do not exist and no provider call touched these doors.
- **The from-scratch chain** (0001 → 0353 on a fresh cluster) was not run here; the work order
  assigns it to the integrator on a disposable cluster. BOTH branches of the bimodal prestate were
  proven, the FRESH one inside a rolled-back transaction against the final file text.
- **Hosted was not read.** §0's fifteen neighbour pins would fail loudly BY NAME on a hosted body at
  a different shape rather than silently, but I did not measure hosted.
- **The integrator's WSL re-run** of the new test file as user `runner` has not happened. It reaches
  only Postgres and the rig fixtures (no spool, no Windows path, no directory left by an earlier
  run, every client minted fresh inside the test), so I expect it to pass — expect, not verified.
- **The whole `packages/db` suite cannot be run through `pnpm test` on this host** (follow-up 2, and
  it was already so before this ticket). It was run directly instead; the figure is in the gate
  table. It is a ONCE-per-fresh-database measurement (see the note under the gate-chain section), so
  the figure quoted is the FIRST run's, taken before the last two commits; the three failures it
  found were each fixed and re-run individually, and the 241-test FINAL RUN covers every battery
  those commits touch. **A whole-suite figure at the exact final tree on a fresh database is the
  integrator's, not measured here.**
- **`clara_freeform_ro` is in §TAIL's machine-role roster but has no behavioural cell.** The catalog
  assertion covers it; no test drives a freeform login against these doors.
- **Two of the four guards this ticket brought forward were found by the WHOLE-SUITE run, not by
  reasoning.** The #977 census and the round-8 clock roster are structural censuses over the live
  catalog that no amount of reading the diff would have surfaced, and one of the two was already red
  from #1136. If the integrator's from-scratch chain or the runner turns up a fifth, the same
  treatment applies: the census follows the COMPUTATION, never the door name.
- **The `p_lane` argument is not validated inside either confirmation core.** Both cores are
  ungranted and both callers pass a literal, and the plan branch tests for `obo` so an unknown lane
  fails CLOSED on the JWT path — but a cell cannot reach it to prove that, because nothing can call
  the core.
- **TDD shape, stated plainly.** The first seam (`wake_get_contract_terms`, its agreement cell and
  its tenant-wall cell) was driven red → green: the battery failed loudly against a database with no
  0353, then passed once the migration applied. The remaining eight seams' cells were written
  against a migration that already existed, because §0 and §TAIL are table-driven over all nine
  bodies and splitting the file per slice would have meant rewriting both blocks five times. The
  work order's own substitute was applied instead and is reported above: six vacuity controls, each
  breaking a live subject, seeing the exact cells go red with the right message, and restoring the
  subject byte for byte (sha-compared).
