# F-A2 annexes 1 — the estate and the retirement checklist

> Companion to `f-a2-agentic-posting-design.md` (**v5, 2026-08-22**). **Annex A** the estate
> as-found and the seven binding findings at the bytes · **Annex B** the retirement checklist.
> Siblings: `f-a2-annexes-2-mechanics.md` (C, D) and `f-a2-annexes-3-record.md` (E-I).
>
> **Standing caveat.** Everything read from migration *source* is a **prediction about the live
> catalog**, not a measurement of it. Three classes defeat source reading: `base + dynamic splice`
> bodies (the live text is in neither file alone) · `pg_get_functiondef` round-trips re-shipped in
> **uppercase** (three `execute_rule_post` bodies, including the live one, are invisible to a
> case-sensitive grep) · and **trigger deferrability, a `pg_trigger` fact** (§D.1).

---

## Annex A · The estate as-found

The survey of record (the draft→post seam · the twelve-wall inventory · the 0077/0078 wrapper
precedent · the retirement census · the context pack · chat parity · risks G-1..G-13) is the
standalone F-A2 estate survey, 1073 lines. Design §2 restates only the findings that bind §3.

**Its own load-bearing corrections:** `get_context_pack` **does** read wiki (`0017:5017-5060+`),
not just the 0016 base body · the live `execute_rule_post` is `0046:782`, not `0023:379` ·
`clara._bank_rule_sightings` / `clara.bank_rules` (`0040:3144`, `0040:609`) are the Wave C-C
bank-matching family, they **survive**, and they are F-A3's (`wave-f-contract.md:74`).

### A.1 · The seven binding findings, at the bytes (design §2)

1. **The corroboration gate does not block.** `evaluate_witness_fact_state_v1` never raises
   (`0092:209-217`) and **every** consumer branch is `if corroborated then <extra check>`, so
   `corroborated=false` *removes* walls: `0016:4131-4152` skipped, `0037:1928-1938` skipped, and
   `0036:831-847`'s verified-total tie inert because it selects `entry_evidence where
   provenance_tier='verified'` and gets NULL. Only `0046:1141-1146` refuses, on the retiring executor.
2. **Breeding is inside the shared approve core.** `0037:2046-2100`: two `rule_sightings` inserts
   plus the ≥3-distinct-entry `vendor_account` loop, which writes `coding_rules` (`:2083-2089`),
   `open_questions` (`:2090-2094`) and emits `kb_rule.proposed` (`:2095-2097`), gated on the H2
   carve-out at `:2046-2048` and **`0040:7115`**'s `bank_rule_suggested` splice. `_draft_entry_core`'s
   limb: a `coding_rules … FOR SHARE` read (`0016:4170-4182`) and a `rule_decisions` insert
   (`0016:4184-4195`), read back at `:4211-4212`.
3. **N1's chain.** `_tf_assert_supplier_bill_shape()` (`0009:525-530`) → `perform
   clara._assert_supplier_bill_shape(new.id)` — the **1-arity intermediate**. The NULL pin is at
   `0016:3957-3961`, whose header (`0016:3954-3955`) says the delegate exists so *"every legacy
   caller — draft floor, human approve, the D-P4 probe — keeps its exact behavior via the null
   pin"*. Sales is identical and was untouched by v1: `t_je_sales_invoice_shape` (`0015:1033-1037`)
   → `_assert_sales_invoice_shape(uuid)` (`0016:2115-2119`) → `_at(p_entry, null)`, while the
   caller pins `v_bound` at `0037:1990`.
4. **The generic kind.** `chatTurn.v12.tools.ts:292` sends NULL `coding_kind`;
   `autoDraft.v8.prompt.ts:129` offers only the three coded kinds; a NULL kind skips
   `0016:4020-4034` and is outside the direction-family arm's kind list (`0046:2687-2689`).
5. **The false-green gate.** `check-binding-post-control.mjs` scans the migration tree on disk
   (`:38`, `:50-56`) for the last static `create or replace function clara.execute_rule_post`
   (`:58`); `parseFunctions` matches only `CREATE [OR REPLACE]`, so a `drop function` is invisible
   to every failure path and the `:161-168` "no static definition exists" branch is unreachable.
6. **Settlement kinds.** `ck_je_coding_kind` admits five values (`0037:500-503`). The named refusal
   (`0037:1826-1830`) is gated `if v_checked_via_rule is not null and e.coding_kind in
   ('customer_receipt','supplier_payment')`; the durable half `ck_je_settlement_not_rule_checked`
   (`0037:519-522`) reads `… or checked_via_rule_id is null`. **The agent post passes no rule id, so
   neither fires.** The two settlement shape floors (`0037:674-678`, `0037:680-684`) are deferred and
   *would* abort at commit — which is why B1 refusing the kind removes the need for two pre-checks.
7. **The wake director.** `mint_wake_credential` (`0011:1178-1186`): for `p_wake_kind='autodraft'`
   it raises unless `p_client` is a firm-congruent active client **and `p_on_behalf_of` is null**
   (*"autodraft wake requires a firm-congruent active client and no on_behalf_of"*); otherwise a
   non-null `p_client` raises *"legacy wake kinds do not accept a client binding"*. The durable half is
   `ck_wake_credentials_client_0011` (**`0011:625-628`**). **v4 ruled it untouched and the KIND CHECK
   (`0011:623-624`) extended instead — GB-3 showed that cannot be built, because the client CHECK is
   itself a closed-world enumeration over the three existing kinds. The whole limb is SEVERED to the
   chat-parity follow-on PR (§D.2c); nothing in PR-1 touches either CHECK.**

---

## Annex B · Retirement — the executable checklist

**Counts:** 31 distinct DB artifacts · 7 bodies of `execute_rule_post` · 1 production SQL call
site · 10 test call sites across 6 files · **~118 breakage sites**, plus **two censuses v1
missed** (§B.5) and **one roster miscount corrected** (§B.2).

### B.1 · Artifact dispositions

**RETIRE (drop the verb).**

| Artifact | LIVE home | Grant | Callers to unwire |
|---|---|---|---|
| `execute_rule_post(uuid,text)` | `0046:782` (prestate `0046:739-751`, tail `:3262`) | `0015:1796-1797` → `clara_runtime_login` **login-direct** | `packages/runtime/lib/rule-post.mjs:53` |
| `_settle_rule_post_skip` | `0029:357-387` | revoke-all `0029:389` | executor only |
| `propose_coding_rule` / `sign_coding_rule` | `0016:3031` / `0016:3082` | `0011:4021-4022`; ACL pin `0011:4252-4255` | `reviewApi.ts:137`, `:141`; **no `proposeCodingRule` wire exists** |
| `decline_coding_rule` · `retire_coding_rule` · `get_coding_rule` | `0011:2180` · `~2200` · `3607` | `0011:4023/4024/4035` | `reviewApi.ts:141`, `:55` |
| `propose_autopost_rule` / `sign_autopost_rule` | `0016:1606` / `0016:1776` | `0015:3556-3564`; tail `0015:3667-3675` proves `clara_agent_ro` lacks them | `reviewApi.ts:242`, `:226`; `apps/dashboard/app/rules/page.tsx`, `AutopostRulePanel.tsx:163,170` |
| `retire_autopost_rule` / `list_autopost_rules` | `0015:2914` / `0015:2855` | `0015:3559/3562` | `reviewApi.ts:235`, `:83` |
| `acknowledge_rule_posts` / `get_rule_post_run` | `0015:2801` / `0015:2831` | `0015:3560/3561` | `reviewApi.ts:171`, `:78` |
| `reconcile_autopost_rules()` | `0015:2759-2795`; drift pin `0017:410-434` | **`0015:3566-3568` → `clara_runtime` (the GROUP)** — a *different* posture from the executor's login-direct; do not conflate | `lib/leader.mjs:79,177,185,191` → `lib/reconciler.mjs:622,472,475` |
| `_ocr_sales_floor` / `_ocr_sales_floor_pop` | `0046:616` / `0046:568` | ungranted | read `rule_sightings` |
| `preview_ocr_sales_evidence` | `0046:2010` | `0046:2081` | `reviewApi.ts:110`, `AutopostRulePanel.tsx:13` — **OQ-3** |

**A RETIRING WALL THAT NEEDS A NAMED SUCCESSOR (GM-2).** The executor's own rungs die with it, and one
was doing real work: **`account_mismatch` (`0046:1092`)** is the only estate wall that ever refused a
*fabricated* `sst_output` leg tied against a lumped total. **Its successor is B4-sales' component tie**
(Annex I) — which is exactly why that tie must evaluate **`not_evaluable`, never `pass`**, wherever the
nil-tax witness arm withholds `total_excl_tax_cents` / `tax_total_cents` (`0100:553-554`): a lumped B4
with no component tie would let a fabricated output-SST credit tie perfectly, the shape
`account_mismatch` caught. **Disposition: RETIRE with the executor, successor named, C.3 cells them
both.**

**KEEP-AS-HISTORY (stop the writes; keep the relations).** `rule_post_runs` (`0015:315`) ·
`rule_post_skips` (`0015:337`) · `coding_rules` (`0011:753`) · `rule_sightings` (`0011:843`) ·
`rule_decisions` (`0011:864`, **OQ-2**) · `journal_entries.checked_via_rule_id` (`0015:222-223`) ·
`entry.rule_posted` (`0015:388`, taxonomy `0015:3877-3880`) · `kb_rule.*` (`0011:3887-3889`) ·
`relay_checkpoints`/`relay_dead_letters` rows with `consumer='rule_post'` — **audit rows, kept**.

**Why the TABLES cannot be dropped.** `clara.coding_lane` is reached by the **frozen** toolfaces
(`autoDraft.v1.tools.ts:218` … `v8.tools.ts:472`) and `_coding_lane_core` reads `coding_rules`
(`0031:470-472`); `journal_entry_revisions.rule_decision_id` is a live FK to `rule_decisions`
(`0011:898`). **The largest non-obvious blast radius outside the posting lane:**
`clara.tick_seeding_proposal` (`0017:4525`) writes its output **as a signed `coding_rules` row**
and emits `kb_rule.signed` — **OQ-3**.

**Confirmed clean — do not over-scope.** `get_context_pack` · `get_draft_review` (`0016:4358`) ·
`get_doc_entry_diff` (`0015:2496`) · `_resolve_counterparty` (`0015:1128`) ·
`_invoice_fact_state` (`0016:2259`) · `persist_invoice_facts` (`0026:662`) ·
`list_notifications` (`0015:2892-2910`). The wiki projections read nothing here — so design
§3.6's patterns block is **pure addition**.

### B.2 · The closed-world rosters

| # | Site | Enumerates | Edit |
|---|---|---|---|
| 1 | **`packages/db/tests/x42-s5-helpers.mjs:161-203`** (`S5_25_BARE_TOKEN_ROSTER`) | ~150 fn names compared **EXACTLY** against the live catalog | **remove ELEVEN, not ten** — `_ocr_sales_floor` (**line 169, missed by v1**), `acknowledge_rule_posts`, `decline_coding_rule`, `execute_rule_post`, `list_autopost_rules`, `propose_autopost_rule`, `reconcile_autopost_rules`, `retire_autopost_rule`, `retire_coding_rule`, `sign_autopost_rule`, `sign_coding_rule`. **AND ADD the three new post-path verbs as an `appliedStem`-GATED COHORT** — see §B.3 |
| 2 | `packages/db/tests/rig-meta.mjs` | `:43-51` · `:65-68` · `:72` `WAVE_A2_RUNTIME_FNS` | trim all three; consumed by `rig-docs-meta.mjs:23,74`, `rig-runtime-meta.mjs:10,50` |
| 3 | `packages/db/tests/wave-a-helpers.mjs` | `:70-80` · `:83` · `:86-96` · `:103-114` · `:122-159` | trim; drives `wave-a-shape.test.mjs` |
| 4 | `packages/db/tests/wave-b/wb-helpers.mjs:212-226` `WB_AUTHORITY_FNS` | the WB-R6 no-wiki roster | trim retired names **AND ADD `wake_post_entry`, `_agent_post_entry_core`, `_tf_assert_agent_post_receipt`** (D17) |
| 5 | `packages/db/tests/f-a1-dispatch.test.mjs:314-315` | `_invoice_fact_state` caller census | remove `execute_rule_post`; the floor drops 7 → 6 — **`0093:373` is immutable, so name the file that moves it** |
| 6 | `packages/db/tests/x46-blind-contract.test.mjs:289` | `_ocr_sales_floor`'s live caller set | retires with the floor |
| 7 | `packages/db/tests/a21-helpers.mjs:81` | `A21_NEW_FNS` | trim |
| 8 | `packages/db/tests/wave-b/wb-x-crossfirm.test.mjs:147-185` | — | trim |
| 9 | **`packages/runtime/tests/relay-redrive-consumers.test.mjs`** | measured with `cat -n`: import `:12` · `MERGED` `:16` · `EXPECTED_IDENTITY` **`:21-27`** with `rule_post: "runtime-login"` at **`:24`** | trim *(v3's `:11/:15/:20-26/:23` were each off by one — the delta review's span was exact; see the change log's P5 entry)* |

### B.3 · The gated-cohort obligation — the easiest thing here to get wrong

`x42-s5-helpers.mjs` does **not** compare a flat list. At **`:420`** it builds the comparison set as
`[...S5_25_BARE_TOKEN_ROSTER]` (declared `:161`) and then **conditionally pushes later cohorts gated on
the migration ledger**. **F-A2's cohort must gate on `appliedStem` — declared at `:417`, the F-A1 idiom
being `appliedStem("f_a1_writer$")` at `:431` and `appliedStem("f_a1_statements$")` at `:433` — and NEVER
`applied("00NN_%")`, because migration numbers are claimed at MERGE, so a number-keyed gate is a guess
that silently never fires.** *(All five cites re-trued against the current file at the gate; v4's
`:403`/`:407`/`:417`/`:418` were stale.)* Its own header (`:208-214`) says why the gating exists at all:
the roster is compared **exactly against the live catalog**, and `db-slice-frontiers` runs this
battery against databases pinned at **earlier frontiers** (d-b0..b3 stop at 0042-0045) *"where
these three functions do not exist. An unconditional entry turns every one of those legs red while
saying nothing about clock discipline."* **An unconditional append reds every d-b0..b3 leg.**
Removing the eleven retired names is likewise exact in **both** directions.

### B.4 · CI, lint and partition obligations

- **`scripts/check-binding-post-control.mjs` goes FALSE-GREEN — and worse than v1 said.** It scans
  the migration tree on disk (`:38`, `:50-56`) for the last static
  `create or replace function clara.execute_rule_post(uuid,text)` (`:58`), then asserts 0029's
  binding-gate source order (`:79-80`, `:170-192`). **`parseFunctions` matches only
  `CREATE [OR REPLACE]` — there is NO DROP handling at all**, so a drop is invisible to every
  failure path and its `:161-168` "no static definition exists" branch is unreachable. Retire in
  the drop PR with `check-binding-post-control.selftest.mjs` (`:11`, `:37`, `:359-365`), the
  `ci.yml:189-192` step and both `package.json` entries (`:14`, `:33-34`).
- **Lints that do NOT trip** (all 14 verb names searched across `scripts/`):
  `check-wiki-dynamic-sql`, `wiki-lint-checks`, `check-frozen-workflows`,
  `check-frozen-evaluators`, `check-leaks`, `check-harness-links`, `pinned-ids-guard`.
- **CI partitions.** Retired DB test files sit outside the partition corpus — **note `ci.yml:1403`
  is explicitly *not* a partition per the file's own comment; only `:1419` is.** **The
  `#!cells-floor:` exception is list-wide, not one cell:** `split-lists/test-list-d-b2.txt:24`
  carries `#!cells-floor: 168` (`ci.yml:1269-1270`) over the whole list, and **three cell sources
  move** — `x42.prod-23` and `x42.prod-25` in `x42-producer.test.mjs`, plus
  **`x42-producer-role.test.mjs`** (list line 48). The floor cannot be set until the whole
  membership has been swept (§B.6's method header).
- **Deploy ceremony scripts: KEEP, do not edit.** `packages/db/deploy/*-postverify.sql` (0022-0030)
  — one-shot evidence, not re-run by CI.

### B.5 · The two censuses v1 missed

1. **`packages/db/deploy/wave-b-w2-authority-boundary-audit.sql:~142-176`** — an **exact-match**
   authority array naming six retired verbs, raising if any is missing. §B.4's "KEEP the
   `*-postverify.sql` glob" does **not** cover this filename. Dormant (a manual ceremony script,
   not CI), so nothing breaks at merge — but **the next W2 audit breaks**. **Schedule its
   amendment in the retirement PR** rather than leaving it to be discovered on a ceremony night.
2. **`apps/dashboard/app/shared/dbSeamCensus.test.ts:473`** — a **live, rig-gated
   DB-introspection census** (`FRONTIER_GATED_READS`) naming `preview_ocr_sales_evidence`, and
   documented to fail on stale entries. v1 listed `dbSeamCensus.bindings.ts` but not the
   `.test.ts`. **Edit both.**

### B.6 · Test and dashboard breakage

> **METHOD, binding on the retirement PR.** **The census follows the retired VERBS across every
> fixture surface — never the law's NAME.** A name-keyed sweep of "WB-R2" found five sites and
> missed a sixth in the same file, a second zero-count head three lines from the first, and
> `x42-producer-role.test.mjs` entirely. **Before the `#!cells-floor:` number is set, sweep the
> whole `test-list-d-b2.txt` membership for retired-verb fixtures** — the floor is list-wide.
>
> **PR-0 re-ran this census independently and found it exact but for TWO gaps.** The first is
> **GM-11's `kb_rule_proposal` part-type surface**, folded below. The second is labelled **N-9** in the
> gate record §1 and is **not expanded there**, so it is carried here as an obligation rather than a
> fixed item: **PR-3 re-runs the verbs-not-names sweep over the whole list membership and resolves N-9
> before the floor number is set.** An unresolved N-9 blocks the floor, not the merge.

**UNCONDITIONAL breakage found by the delta review, in addition to the lists below:**
`wb-s-seeding.test.mjs:217` (calls `proposeCodingRule` `:225` and `signCodingRule` `:230`; its
`:221-222` comment marks the route **MUST-FAIL with no fallback**, so it breaks whatever OQ-3 rules)
· **`x42-producer-role.test.mjs`** (list line 48; `signedCodingRule` at `:79`, `:83`, `:149`).

**DB rig, 38 files. Whole-file retire (10):** `wave-a2-execute-rule-post.test.mjs` ·
`wave-a2-autopost-rule.test.mjs` · **`wave-a-sightings.test.mjs`** (the breeding block's own
witness) · `a21-prestate` · `a21-ocr-envelope` · `a21-sightings-lift` · `a21-reconcile` ·
`x1-anchor` · `x36-vendor-binding-executor` · `x36-q-round-regressions`.
**Helper/roster surgery (10):** `a21-helpers.mjs` · `rig-meta.mjs` · `wave-a-fixtures.mjs:152-171`
· `wave-a-helpers.mjs` · `wave-a-reads.mjs:62-65,106-114` · `x1-helpers.mjs:390-392` ·
`wave-b/wb-calls.mjs:355-367` · `wave-b/wb-helpers.mjs:212-226` · `x42-af2-world.mjs:101-105` ·
`x42-s5-helpers.mjs:161-203`.
**~55 named tests inside surviving files.** Heaviest: `a21-adversarial` (13) · `wave-a-shape` (7)
· `x46-blind-contract` (7) · `wb-s-seeding.test.mjs` (6 — the seeding↔`coding_rules` coupling,
OQ-3) · `x46-wave-7a-sales-lane` (5) · `x37-wave-c-a-subledger` (4; **`:1951`** — *"three
employee claims STILL breed a vendor_account proposal"* — whose **inversion is a C.8 cell**).

**TWO HELPERS THAT FAIL SOFT — delete, never leave.** `x1-helpers.mjs:390-392` returns
`(await fnSource("execute_rule_post")).includes("X4 DARK GUARD")` → **`false` silently** once the
function is gone. Same shape at `x37-wave-c-a-subledger.test.mjs:1684-1693` (`caught()` →
`noteLane()` → early return). **Both stop proving their own claim without going red.**

**Runtime, 13 files.** Whole-file retire: `rule-post-unit.test.mjs`,
`reconcile-autopost-unit.test.mjs`. Roster: `relay-redrive-consumers.test.mjs`.
**Consumer + wiring:** `packages/runtime/lib/rule-post.mjs` (342 lines) whole;
`plugins/startWorld.ts:15,209-213,221`
· `lib/health.mjs:20,175-182` · `scripts/relay.mjs:23,65,79-81,85` · `lib/receipts.mjs:8` ·
`README.md:33,37,96`.

**Dashboard.** `apps/dashboard/app/rules/` retires whole — **except `AdjustmentTemplatePanel.tsx`,
a Wave-D surface: RELOCATE, do not delete.** Parts catalog: `shared/parts.ts:77,80,161` ·
`chat/partCatalog.ts:117-120` · `chat/parts.tsx:17,239-241` ·
`apps/dashboard/app/shared/cards/RulePostReceiptCard.tsx`
· `chat/partCatalog.test.tsx:80-87` (**test at `:83` breaks**).

**THE `kb_rule_proposal` PART TYPE — the census's first gap (GM-11), and it follows the verbs.** It is a
**live dashboard consumer of three retiring verbs** — `get_coding_rule`, `sign_coding_rule`,
`decline_coding_rule` — so by this section's own method header it retires *with* them, across all three
of its surfaces: the **parts catalog** entry, the **card** that renders it, and its **tests**. The verbs
are already on §B.1's RETIRE list and their `reviewApi.ts` call sites on the list above; what v4 missed
is that a part type outlives its verbs silently — the catalog keeps accepting the type, the card keeps
mounting, and the only symptom is a card that can never act. **Retire the type, not just the calls.**
`apps/dashboard/app/shared/reviewApi.ts`:
`:55,78,83,110,116-121,137,141,171,226,235,242` retire; `:34` and `:67` **survive but change
shape**. Types + census: `apps/dashboard/app/shared/reviewCardTypes.ts` ·
`shared/dbSeamCensus.bindings.ts:60,125-130,246`
· **`shared/dbSeamCensus.test.ts:473`** (§B.5). **Not affected:** `apps/dashboard/app/bank/*`.

**An already-dead reader** (goes silent, never throws): `reviewApi.ts:116-121` filters on
`autopost_renew_or_retire` / `autopost_rule_expiring` / `autopost_rule_retired` — **two of the
three have zero producers anywhere**; the real kinds are `autopost_rule_expired`,
`autopost_renew_or_retire`, `autopost_rule_suspended`.

### B.7 · The WB-R2 code-assertion sites — verified at the bytes

**WB-R2 (*"no autopost rules from seeding, ever"*) is moot** — digest law 12 is SUPERSEDED by
ADR-0071/G1.4 together with the machinery it governed. **But SIX code sites still assert it — five
that name it and one that does not — and they are closed-world census inputs for the retirement
PR.** Extend-never-weaken: each is re-pointed or re-worded **with** the machinery it asserts;
**none is silently deleted.**

| # | site | exact text asserted | disposition |
|---|---|---|---|
| 1 | `packages/db/tests/wave-b/wb-s-seeding.test.mjs:97` (test at `:77`) | *"open proposals are the WB-R2 landing state"* | **RE-WORD the citation, KEEP the cell.** It pins the seeding proposal state machine, not the autopost tier. **Rides OQ-3**, not the drop |
| 2 | `…wb-s-seeding.test.mjs:119` (test at `:115`) | *"the WB-R2 tick floor is admin+ (deliberately above the bookkeeper sign floor)"* | same — **the floor is a seeding-lane fact and survives** |
| 3 | `…wb-s-seeding.test.mjs:197` (test at `:158`) | *"unticked proposals STAY 'proposed' after completion (the WB-R2 landing state)"* | same |
| 4 | `packages/runtime/lib/prior-gl-cells.mjs:113` | *"Over-proposing is corrected by an admin declining a tick — the exact control WB-R2 specifies — while under-proposing is an invisible loss. Emit, and let the human judge."* | **RE-WORD, NEVER DELETE.** It is the stated reason for a deliberate design choice (NO narrative filtering, `:108-113`); the control it names — the admin decline on a seeding tick — **survives** (`decline_seeding_proposal` is not on the retire list). Only the law citation moves. Deleting the comment deletes the reason a future reader needs before "fixing" the no-filtering behaviour |
| 5 | `packages/db/tests/x42-producer.test.mjs:389` (header `:388-393`), test **`x42.prod-25`** at `:394` | *"THE AUTOPOST LAW (ADR-049/050, WB-R2). A suggestion is a HAND-DRAFT class object … which is also what keeps 0040's H2 carve-out honest."* | **RE-POINT the fixture, KEEP the cell.** Its *claim* is about the **bank-rule-suggestion** path (`acceptBankRuleSuggestion`) — Wave C-C / **F-A3** territory, so the claim survives F-A2 — but its *fixture* calls `signedCodingRule(…)` → the retired `sign_coding_rule`, so it breaks on the fixture, not the assertion |

**The SIXTH site is WB-R2-shaped but does not name the string, and it carries the sharpest hazard**
(`wb-s-seeding.test.mjs:200-215`, *"S5: structural negatives — ZERO sightings, ZERO autopost, ZERO
new metric columns, NO candidate tier"*). It holds **two zero-count heads, three lines apart**:

- `:202-203` `assert.equal((await sightingRows(onb.client)).length, 0, …)` — **after the breeding
  excision this is trivially true everywhere, so it stops discriminating.** Law 31's zero-count head
  exactly. **Disposition: MERGE into C.8**, re-pointed to assert that an **agent post and a human
  approve both** leave `rule_sightings` unchanged — the excision's own witness.
- **`:205` `!tickSrc.includes("autopost")` is a SECOND head, and v2 cleared it in error.**
  `fnSource` (`a21-helpers.mjs:609-613`) ends `return r.rows[0].src ?? ""` — a **fail-soft empty
  string**. If `tick_seeding_proposal` ever stops existing, the assertion passes on `""`. It is a
  **prosrc-shape assertion on a body OQ-3 proposes to rewrite, read through a helper that cannot say
  NO**, and it gets the same disposition as `:202-203` rather than a clean bill. *(`:207`'s `pdef`
  check reads a CHECK constraint, not a function body, and does survive.)*
- `:208-215` the `coding_rules` metric-column and candidate-tier negatives — **survive**, because
  the table survives KEEP-AS-HISTORY.

**`:217` breaks UNCONDITIONALLY, and v2's "rides OQ-3" disposition was wrong.** The cell *"S5/Gate
R2: the ticked rule is INDISTINGUISHABLE from a hand-signed rule on the rule row"* builds its
comparator by calling **`proposeCodingRule` (`:225`) and `signCodingRule` (`:230`)** — both on the
retire list — and its own comment at `:221-222` marks the route **MUST-FAIL with no fallback**:
*"[R1-F13d] the hand-signed comparator is REQUIRED — no fallback. A refusal on this fixture route is
a MUST-FAIL that forces the N-2 adjudication."* **It moves to §B.6's unconditional list with that
note attached.** OQ-3 changes what the RIGHT replacement is, not whether it breaks.

**`x42.prod-23` gets an inverted twin too.** Its header (`:296-307`) says *"The CONTROL is the point
of the cell: the same counterparty and the same account, approved through an ORDINARY draft, MUST
move the counter"* — a **positive** witness that breeding happens on an ordinary approval, the same
class as `x37:1951`. Same treatment: an inverted twin in **C.8**. Its `:335` `noteLane` already
records the carve-out half as vacuous in this build, so only the control half is live evidence — and
the control half is exactly what the excision deletes.

### B.8 · The retirement precondition (owner directive, AMENDED 2026-08-20)

**The post-Window-A re-extraction is TWENTY documents, not the full 64** — ADR-0072 ①.2, ruled
after the openers' predicted-outcome table existed: all four predicted refusals plus ~16 across
the predicted-pass classes, so the re-measure covers both the arm-fired and plain-path populations.

**The consequence for retirement, stated rather than left to be discovered at the check.** The
fallback arms' own retirement trigger reads *"the post-ceremony **full-population** re-extraction
plus the F-A2 retirement PR, **or the Wave-G factory reset, whichever lands first**"*
(`0101_f_a2_witness_readers.sql:465-467`). A twenty-document re-extraction **cannot satisfy the
first branch**, so the trigger falls through — by its own wording, not by a new decision — to the
**Wave-G factory reset**. Until then, legacy-regime documents still resolve through the fallback,
and **F-A10's terminal check closes at that reset** rather than on a backfill. The arms therefore
live longer than the directive first implied; that is the priced cost of the smaller re-extraction.

### B.9 · PR-1's THREE files, by content, and the numbered D1 list (design §5 step 2)

**Severed at PR-0 (gate record §4).** Chat parity leaves the train (GB-3), B12/B13 are cut (GM-3), and
the `posted` chain becomes its **own file inside the same window**. The `0077`/`0078` split still
governs the first two: part 1 ships ungranted machinery and grants nothing, part 2 adds the granted
surface plus the census that proves it, and the residue between halves is fail-safe (cores reachable by
no role). Part 3 is behaviourally inert until PR-2 emits `posted`, and provable in isolation via C.9.

- **Part 1 (ungranted):** `clara.entry_post_receipts` + its `_tf_append_only`/no-truncate triggers ·
  `t_je_agent_post_receipt` · `clara._agent_post_entry_core` — the ladder **B1–B11, B14, B15** and
  **Tier A's three lock acquisitions** (§D.7) · **`clara._assert_control_leg_counterparty_at`, GB-2's
  extracted projected-state predicate** (§D.6), with `_assert_supplier_bill_shape_at` re-cut as a thin
  delegate passing NULL · the **8th `_approve_entry_core` body** (breeding excision + ctx identity + the
  agent arm + the Tier-C `detail` reasons, **now including `registration_conflict`** — GM-5) · the
  `_draft_entry_core` CoR (OQ-2 limb, N1's draft copies **on the projected state**, direction-family
  re-cut, generic widening) · **T3's two trigger-function recuts** · the two new event kinds with their
  taxonomy pairs.
- **Part 2 (granted + proved):** `clara.wake_post_entry` · `revoke all on function … from public` plus a
  single `grant execute … to clara_wake_interactive` · the two `wake_fn_allowlist` rows (`'autodraft'`,
  `'interactive'`; never `'proactive'`) · the `_approve_entry_core` zero-grant re-pin
  (`0015:3592-3596`) · the `WB_AUTHORITY_FNS` extension and the **`appliedStem`-gated** `x42-s5` cohort
  (§B.3) · the tail census asserting the new core is ungranted and that no granted surface gained DML
  against `journal_entries`.
- **Part 3 (the `posted` chain, inert on arrival):** Annex F's **five** layers and six further sites.
- **NOT in PR-1 any more, and named so nobody re-adds them:** the **B12/B13 belt-predicate extractions**
  (CUT on correctness grounds, GM-3) · the whole **`interactive_client` limb** — the kind-CHECK
  extension, the `mint_wake_credential` arm and `wake_open_question`'s re-key (SEVERED, GB-3 / §D.2c).
  **`(CLR10, customer_identity_name_only)` costs no body edit at all** (GM-6): `0062:196-243` already
  raises with `detail.reason`, so PR-1 only lists the pair.

**The D1 write-quiesce list, recounted AFTER the severance — EIGHT CoR'd live bodies and one
`ALTER TABLE`.** GM-9: §3.5's old *"eight bodies and one ALTER TABLE"* label was enumerated nowhere and
B.9's v4 contents needed ≥11. This table is the enumeration, and **the count design §3.5 cites is this
list's count — PR-1's rig replay confirms or corrects it** (gate §7). Two of the eight are new since
the gate's own arithmetic: GB-2 puts the supplier floor on the list, and the `posted` chain's finalize
body is a third function, not a second overload.

| # | body | why it is on the list |
|---|---|---|
| 1 | `clara._approve_entry_core` | the 8th body — breeding excision, ctx identity, the agent arm, the Tier-C `detail` reasons |
| 2 | `clara._draft_entry_core` | the OQ-2 limb, N1's draft copies, the direction-family re-cut, the generic widening |
| 3 | `clara._tf_assert_supplier_bill_shape()` (`0009:524`) | T3's receipt-keyed pin |
| 4 | `clara._tf_assert_sales_invoice_shape()` (`0015:1027`) | T3's receipt-keyed pin, sales twin |
| 5 | `clara._assert_supplier_bill_shape_at` (live tip `0036:601`) | **GB-2** — the `0036:619-626` prologue moves out into the new predicate and the floor becomes a thin delegate passing NULL |
| 6 | `clara.settle_autodraft_task`, 6-arity (`0036:856`) | the `posted` outcome: the guard, the entry-exists validation, the `v_item_outcome` mapping, `last_refusal`, `entry_id`, the CLR29 fabrication |
| 7 | `clara.settle_autodraft_task`, 5-arity (`0011:2642`) | the other overload's own copy of the guard (`0011:2642-2652`) |
| 8 | `clara.reconcile_sweep_runs()` (`0011:2709`) | the finalize bucketing (`0011:2754-2762`), which counts a `posted` row in none of its three counters |
| + | **`ALTER TABLE clara.sweep_run_items`** | the `outcome` CHECK (`0011:734-735`) **and `ck_sweep_run_items_shape`** (GM-8) — **ACCESS EXCLUSIVE**, hence the window |

**Not on the list, and each for a stated reason.** The **1-arity shape delegates** (`0016:3957-3961`,
`0016:2115-2119`) are byte-unmoved — that is T3's whole point. `clara._agent_post_entry_core`,
`clara._assert_control_leg_counterparty_at`, `clara.wake_post_entry`, `clara.entry_post_receipts` and
`t_je_agent_post_receipt` are **new objects**, not CoRs of live bodies, so they add nothing to the
quiesce surface beyond the window they arrive in.

### B.10 · The 0040 marker dispositions for the 8th `_approve_entry_core` body (design §3.5)

**Lineage of the body being replaced:** `0015:1247` → `0016:1220` → the 0017 dynamic splice →
`0029:27` → `0035:140` → `0037:1750` → the `0040:7026-7174` S5 splice = the **7th**; F-A2 ships the
**8th**.

The `0040:7148-7159` anti-revert postcheck pins **11 markers** at exact counts, *"the anti-revert
half: it proves the recut carried 0017's dynamic splice, 0029's vendor-binding pins, 0035's
advisory and 0037's hook + settlement refusal through unchanged"* (`0040:7145-7147`). **PR-1's
prestate must state a disposition for each, or a copy-the-0040-idiom prestate refuses at apply.**

- **RETIRE — 3 names / 5 occurrences**, all inside the deleted `0037:2046-2100` block:
  `H2 CARVE-OUT: sightings + auto-proposal are HUMAN-only` ×1 · `insert into clara.rule_sightings`
  ×2 · `uq_rule_sightings_mapping` ×2.
- **CARRY — 8, each at its original count of 1:** `opening_entry_k_family_only` ·
  `[R1-F1] K-family-only lifecycle boundary` · `receipt_preheld` · `bound_extraction` ·
  `unpinned_rule_post` · `settlement_not_autopostable` · `clara._subledger_on_approve(` ·
  `no_counterparty_sighting`.
- **`bank_rule_suggested` is NOT on that list, and the count goes 2 → 0, not 2 → 1.** It carries its
  own postcheck at `0040:7123-7127` expecting exactly 2 — *"one in the installed comment, one in the
  live test"* (`0040:7126`). **Both occurrences live inside the deleted region:** the `v_to`
  replacement text at `0040:7100-7115` contains the SECTION-S5 comment block *and* the
  `and not (coalesce(e.flags,'{}'::jsonb) ? 'bank_rule_suggested') then` conjunct, and that whole
  `v_to` is the head of the `if` gate on the breeding block. Deleting the block deletes both, so
  **PR-1's prestate states 0**. The splice is **inert on arrival by its own admission**
  (`0040:7109-7112`: *"INERT ON ARRIVAL, ON PURPOSE: no writer stamps this key yet … Do not read the
  absence of writers as evidence this is dead code"*), so nothing behavioural is lost.
