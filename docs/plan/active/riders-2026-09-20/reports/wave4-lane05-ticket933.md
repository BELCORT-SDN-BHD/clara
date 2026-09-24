# Riders wave 4 · lane 05 · ticket #933 — Fixed assets (2/2): Clara proposes the depreciation particulars, the person confirms

**Branch** `riders/w4-lane05` · **base** `cd2925391` · **status: DONE for the scope this wave admits**
(one acceptance criterion is deliberately left to the `claraWork_v6` cut — see "What was deliberately
left" and the successor contract).

**Commits** (`git log --oneline cd2925391..HEAD`, oldest first):

| commit | subject |
|---|---|
| `42b4991a7` | `feat(runtime): #933 the depreciation-particulars proposal, derived` |
| `4d52cb2b1` | `test(db): #933 the proposal's transport, measured — source_ref carries it, no migration` |
| `0f57464ce` | `feat(web): #933 the proposal reader every answering entrance pre-fills from` |
| `53c397830` | `feat(web): #933 the asset page dialog and the Needs-you inline form pre-fill from the proposal` |
| `cda7bd783` | `feat(web): #933 the conversation question form pre-fills from the proposal it carries` |
| `9e10ed6e3` | `docs(context): #933 the depreciation particulars proposal, as vocabulary` |

**Migration: none.** The ticket was expected to need none and it needs none — but that was a claim
about a live database, so it is measured rather than asserted (§ "The database side").

---

## The ticket, as it stands today

`gh issue view 933 --comments` — OPEN, `enhancement`, `ready-for-agent`. ONE comment, `belcorttao`
2026-09-19, the triage correction: the successor is **`claraWork_v6`**, not v5 (v5 shipped hosted on
2026-09-19 and carries no proposal), and AC1's "(the cut #847, #882 (a), #915 and #931 also ride)"
clause is stale. There is **no 2026-09-20 owner ruling comment** on this ticket, so the body plus
that correction is the contract. Blocker #932 is CLOSED (released riders wave 3, PR #1039).

**Verified still live on this branch before building:** `grep -rn "ParticularsProposal|particulars.*proposal"`
over `packages/` and `apps/` at `cd2925391` returns one unrelated hit (`0041:3147`, a seeding
proposal). Nothing of this ticket existed.

---

## Seams I tested at (written before the first test, work order rule 4)

1. **`deriveFaParticularsProposal(inputs)`** — `packages/runtime/lib/fa-particulars-proposal.ts`.
   Pure; observed through the returned block's values, its `basis` and its `reason`, and through
   `null`.
2. **`proposalSourceRef(assetId, proposal)` / `faParticularsProposalSchema`** — the same module's
   wire half: the `source_ref` object a question carries, and what the contract admits.
3. **The database transport** — `clara.open_work_question`, `clara.get_work_pending_question`,
   `clara.answer_work_question`, and the human role's firm-scoped SELECT on
   `clara.agent_interruptions.source_ref`, all driven on the live lane database.
4. **`readFaParticularsProposal` / `particularsFromProposal` / `proposalAnswerDraft` /
   `loadAssetParticularsProposal`** — `apps/web/lib/registers/fa-particulars-proposal.ts`, observed
   through return values and through the URL the read issues.
5. **`CompleteParticularsDialog`** (asset page) — rendered behaviour: the controls' values, the
   reason on screen, and the body `clara.complete_fixed_asset_particulars` receives.
6. **`FixedAssetIncompleteAffordance`** (Needs-you inline) — the same three.
7. **`WorkQuestionForm`** (conversation) — the draft the controls render, the reason on screen, and
   the `p_answer` `clara.answer_work_question` receives.

No test was written at a seam the brief does not give. Every seam above is one of the brief's own:
"the typed proposal block", "the three answer entrances pre-fill from the proposal and show the
reason", "submitting applies the confirmed values through the existing OBO particulars door".

---

## Acceptance criteria, each with its evidence

### AC1 — "The next `claraWork` successor extends the dependent-particulars question with a typed proposal block and its reason; the frozen v4 body is untouched."

**PARTIAL, by the lane's own rule (a): the block and its derivation are built; the cut is not.**

- The typed block and its derivation ship in `packages/runtime/lib/fa-particulars-proposal.ts`
  (new, non-frozen, 18/18 cells).
- The frozen v4 body is untouched, and so is every other frozen file:
  `node scripts/check-frozen-workflows.mjs` → `freeze-lint: OK — 312 frozen file(s) verified …;
  55 "use workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded.`
- `node packages/runtime/scripts/check-parts-parity.mjs` → `parts-parity: OK`.
- The v6 cut itself is the one shared cut this programme does at the END of wave 4. The successor
  contract below is written in full so that cut is transcription, not design.

### AC2 — "The three answer entrances pre-fill from the proposal and show the reason; submitting applies the confirmed values through the existing OBO particulars door under the answering person's authority."

**DONE, all three.**

| entrance | file | pre-fill | reason on screen | the person's values reach the door |
|---|---|---|---|---|
| asset page dialog | `apps/web/components/registers/fa-row-actions.tsx` (`CompleteParticularsDialog`) | `p933.dialog.prefill` | `p933.dialog.reason` | `p933.dialog.the_edit` |
| Needs-you inline form | `apps/web/components/firm/fixed-asset-incomplete-affordance.tsx` | `p933.needsyou.prefill` | `p933.needsyou.reason` | `p933.needsyou.the_edit` |
| conversation question form | `apps/web/components/work/work-question-form.tsx` | `p933.conversation.prefill` | `p933.conversation.reason` | `p933.conversation.the_edit` |

- `apps/web/components/registers/fa-proposal-prefill.test.tsx` **4/4**
- `apps/web/components/firm/fixed-asset-proposal-prefill.test.tsx` **4/4**
- `apps/web/components/work/work-question-proposal.test.tsx` **6/6**

Each `the_edit` cell drives the real door through a mocked `fetch` and reads the posted body: the
dialog sends `p_particulars.useful_life_months = 84` after the person changes it from the proposed
60; the inline form sends `rate_bps = 1500` after the person changes it from 2000; the conversation
form sends `p_answer.useful_life_months = "84"` after the same edit. **A form that submitted its own
seed would send the proposal's value, and each of those three cells is the one that would catch it.**

`p933.conversation.confirm_as_proposed` additionally submits with NOTHING touched and pins the whole
answer object, which is the ticket's "the person confirms with one action":
`{method:"straight_line", useful_life_months:"60", residual_cents:0, start_date:"2026-03-01",
description:"Air compressor, workshop bay 2"}` — the ungrounded `rate_bps` **absent**, not blank.

**"under the answering person's authority" is unchanged and was not touched.** The dialog and the
inline form go on calling `clara.complete_fixed_asset_particulars` under the signed-in person's own
session; the conversation form goes on calling `clara.answer_work_question`, and it is the run that
later applies the answer through `clara.complete_fixed_asset_particulars_for` with `p_obo`. Nothing
about authority moved, and nothing here widens it.

**The reason line is not the question's own reason.** In the conversation form they render as two
separate blocks (`work-question-proposal` beside `work-question-reason`), and
`p933.conversation.reason` asserts both are present: they answer different questions ("why are you
asking?" and "why these values?").

### AC3 — "A cell proves a proposal is present when the account has no policy and absent when the policy path already completed the row; a cell proves the applied particulars are the confirmed ones, not the proposal, when the person edits."

**DONE.**

- **Present / absent**: `p933.core.siblings_ground_the_method` (a pending row on a policy-less
  account earns a proposal) and `p933.core.absent_when_the_policy_path_completed_the_row` (a row
  #932's policy path birthed COMPLETE earns `null` — no question opens, so there is nothing to
  propose about). Both in `packages/runtime/tests/fa-particulars-proposal-unit.test.mjs`.
- **The applied particulars are the confirmed ones**: the three `the_edit` cells above, plus
  `p933.wire.answerable` on the live database, which answers a proposal-carrying question with
  `useful_life_months = "84"` and then reads back BOTH: `answer.useful_life_months = "84"` and
  `source_ref.proposal.useful_life_months = 60` — the departure is legible a year later.

### AC4 — "A World e2e leg covers the park-with-proposal and confirm path."

**NOT BUILT — deliberately, and this is the one criterion left open.**

The park-with-proposal half is `claraWork_v6` opening the question with the block in its
`source_ref`. That cut is frozen for this wave (lane rule (a); work order addendum: "The ONE shared
cut `chatTurn_v22` / `claraWork_v6` happens at the end of wave 4"). A World leg run today would
exercise `claraWork_v5`, which opens the question with #639's bare stanza, so it could only assert
the absence of a proposal — which is not what the AC asks for.

What exists instead, and what it is worth: the **transport** that leg would exercise is driven on a
live database by five db cells (below), and the **confirm** half is driven on all three surfaces by
fourteen browser-level cells plus four green Playwright walks. What is genuinely untested is the
join — v6 actually putting the derivation's output on the wire — and that is a cell for the cut.

---

## The database side

`packages/db/tests/fa-particulars-proposal.test.mjs` — **5/5** on `clara_l05` with the full gate
chain. Frontier-gated on `fixed_asset_acquisition$` (0216's stable stem) through the shared
`fixed-asset-acquisition-fixtures.mjs`, so it is dormant below that migration. Every assertion runs
through a persona; the two root reads are marked as readbacks.

| cell | what it measures |
|---|---|
| `p933.wire.verbatim` | the extended `source_ref` is admitted, the Work parks exactly as #639 leaves it, and the human's own `clara.get_work_pending_question` returns the block KEY FOR KEY — all nine keys, none added, none dropped by the jsonb round trip |
| `p933.wire.answerable` | the question still ANSWERS, the stored answer is the person's EDIT, and the proposal stands unedited beside it on the same row |
| `p933.read.by_asset` | the two register-side entrances' read, statement for statement (client-scoped pending questions under `p_agent_interruptions_human`, the asset located by `source_ref`), plus a measurement that the narrower `source_ref->>'asset_id'` server-side filter is lawful too |
| `p933.read.firm_walled` | a person of ANOTHER firm reads **no row** for the same asset id — not a redaction, an absence, so there is no existence oracle |
| `p933.wire.object_only` | an ARRAY `source_ref` is REFUSED while the object form carrying the extra key is admitted |

**Why there is no migration, measured rather than read off the file.**
`clara.agent_interruptions.source_ref` is constrained to `source_ref is null or
jsonb_typeof(source_ref) = 'object'` (0180:183) and nothing more, and `clara.open_work_question`
validates the FIELDS while passing `p_source_ref` through (0180:579-589). `p933.wire.object_only` is
what turns that reading into a measurement. The alternative — a `default` key per declared field —
is **closed**: `clara._assert_work_question_fields` admits exactly `key,label,kind,required,options,unit`
and raises CLR10 `unknown_key` on anything else (0180:311-333), so the fields array could not have
carried the pre-fill.

**Column grants, measured on `clara_l05` on 2026-09-24** (these are what the web read stands on):
`clara_authenticated` holds SELECT on `clara.agent_interruptions` including `source_ref`, `work_id`,
`client_id`, `status`, `fields`, `question`, `reason`; its only read policy is
`p_agent_interruptions_human = (firm_id = clara.jwt_firm())`.

**Prestate pins: none.** This ticket adds no migration, recuts no function body and pins no
`sha256(prosrc)`.

---

## Successor contract — `claraWork_v6`

Everything the frozen cut needs, in the form the cut can transcribe. **Nothing frozen was edited.**

### 1 · Name and imports

`packages/runtime/workflows/claraWork.v6.impl.ts` imports, from the non-frozen
`../lib/fa-particulars-proposal.js`:

```ts
import {
  deriveFaParticularsProposal, proposalSourceRef, faParticularsProposalSchema,
  type FaParticularsProposal, type FaProposalInputs, type FaProposalSibling,
} from "../lib/fa-particulars-proposal.js";
```

The moment v6 imports it, `scripts/check-frozen-workflows.mjs`'s IMPORT-ESCAPE hash-locks that
module with the closure — the same trajectory `lib/fixed-asset-acquisition.ts` took under v4, and
the reason it is written to be final.

### 2 · Zod input — **none, and that is the point**

The proposal is **not a model act**. The dependent particulars question is opened by the workflow
BODY after a commit (v4's own header states this: "`ask_question` carries no `execute` — the
workflow body opens it"), so v6's **tool roster is unchanged from v5** and no tool gains an input.
The one zod object involved is `faParticularsProposalSchema`, which the body uses to refuse putting
a malformed block on a durable wire:

```ts
z.object({
  v: z.literal(1),
  method: z.enum(["straight_line","reducing_balance","none"]).nullable(),
  useful_life_months: z.number().int().positive().nullable(),
  rate_bps: z.number().int().min(1).max(10000).nullable(),
  residual_cents: z.number().int().min(0).nullable(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  description: z.string().trim().min(1).max(200).nullable(),
  basis: z.array(z.enum([
    "enrolment","client_knowledge","retired_account_policy",
    "account_siblings","acquisition_date","firm_default_residual",
  ])),
  reason: z.string().max(400),
}).strict()
```

### 3 · The new step, and the read under it

v4's `loadPendingFixedAssetStepV4` is imported unchanged (it returns `assetId`, `description`,
`costCents`, `nonDepreciable` and nothing else). v6 adds ONE step beside it:

```ts
export async function loadFaProposalInputsStepV6(
  work: LoadedWork,
  pending: PendingFixedAssetV4,
): Promise<FaProposalInputs | null> {
  "use step";
  // The SAME OBO read credential v4's own register read mints — `readScoped`, i.e. clara_agent_ro
  // under `p_fixed_assets_agent (firm_id = clara.wake_firm())`, additionally client-pinned here.
  // It NEVER throws: a register the run cannot read is not a reason to withhold a question.
}
```

Its SQL, in two statements against `clara.fixed_assets` (the only relation this credential can
reach — see "Follow-ups" for the two grounds that cannot be reached yet):

```sql
-- (a) this asset's own account, acquisition date and completeness
select fa.asset_account_code, fa.acquired_date,
       (fa.depreciation_start_date is not null and fa.depreciation_method is not null)
         as particulars_complete
  from clara.fixed_assets fa
 where fa.client_id = $1::uuid and fa.id = $2::uuid;

-- (b) the account's OTHER completed, live rows
select fa.asset_account_code, fa.depreciation_method, fa.useful_life_months,
       fa.depreciation_rate_bps, fa.residual_cents
  from clara.fixed_assets fa
 where fa.client_id = $1::uuid
   and fa.asset_account_code = $3::text
   and fa.id <> $2::uuid
   and fa.superseded_at is null
   and fa.status in ('active','pending')
   and fa.depreciation_method is not null
   and fa.depreciation_start_date is not null
 order by fa.created_at desc
 limit 50;
```

mapped to `FaProposalInputs`:

```ts
{
  asset: { assetId, description, costCents, nonDepreciable,   // from loadPendingFixedAssetStepV4
           particularsComplete, assetAccount, acquiredDate },  // from (a)
  siblings: rows.map((r) => ({ assetAccount: r.asset_account_code, particularsComplete: true,
    method: r.depreciation_method, usefulLifeMonths: r.useful_life_months,
    rateBps: r.depreciation_rate_bps, residualCents: Number(r.residual_cents) })),
  // knowledge / retiredPolicy: OMITTED on this frontier — see "Follow-ups".
}
```

### 4 · The question, and the door call with argument order

`particularsQuestionV6(pending, proposal)` replaces `particularsQuestionV4(pending)`. **Only the
`sourceRef` changes**; `question`, `reason`, `context` and `fields` are v4's, byte for byte:

```ts
sourceRef: proposalSourceRef(pending.assetId, proposal)
// -> { kind: "fixed_asset", asset_id }                       when proposal === null
// -> { kind: "fixed_asset", asset_id, proposal: {…} }        otherwise
```

The opener's argument order is **unchanged** from v2/v4:

```
clara.open_work_question(
  p_task       => <the run's task id>,
  p_hook_token => <the minted WDK hook token>,
  p_question   => <jsonb: {type:"form", text:"How is <label> depreciated?"}>,
  p_fields     => FA_PARTICULARS_FIELDS,
  p_reason     => <v4's reason text>,
  p_source_ref => proposalSourceRef(assetId, proposal)     // <- the ONLY change
)
```

and the apply side is untouched:

```
clara.complete_fixed_asset_particulars_for(
  p_client => work.clientId, p_asset => assetId,
  p_particulars => particularsFromAnswer(typed),
  p_op_key => `apply_fixed_asset_particulars:${work.workId}:${assetId}`,
  p_obo => work.initiator)
```

### 5 · Refusal mapping — **nothing new refuses**

The derivation cannot fail: it is pure, every input is optional, and an absent ground produces a
narrower proposal rather than an error. The step that gathers its inputs never throws (v4's own
posture for the same read). So:

- read fails, or returns nothing → `proposal = null` → `proposalSourceRef` omits the key → the
  question opens **exactly as v5's does**, and every surface renders today's empty form.
- `faParticularsProposalSchema.safeParse(proposal).success === false` (a defect, not a refusal) →
  treat as `null` and open the question without a block. **Never** put a block the particulars door
  would later refuse onto a durable question a person reads hours later.
- Every existing CLR37 mapping through `refusalFieldForAxis(details)` is unchanged.

### 6 · Part kind — **unchanged**

`work_question`, as `emitWorkQuestionStepV3` writes it
(`claraWork.v3.impl.ts:542-554`): `{type, work_id, client_id, question_id, question_version,
status}`. It carries ids only; every surface reads the record through `clara.get_work_question` /
`get_work_pending_question`, which is where the proposal already is. **No parts-parity change**, and
the `check-parts-parity.mjs` census above is the current one.

### 7 · Prompt stanza — **unchanged**

`claraWork.v4.prompt.ts:24-31` already states that the dependent particulars question is a WORKFLOW
ACT and not a tool, and that the model neither opens nor answers it. The proposal is the body's own
act on the same lane, so the model's instructions do not move. A v6 prompt that mentioned the
proposal would be telling the model about a decision it cannot take.

### 8 · What the web needs from the cut — nothing further

`apps/web/lib/registers/fa-particulars-proposal.ts` already reads `v: 1` and this exact shape, on all
three entrances, today. A question opened by v5 (no block) and a question opened by v6 (a block) both
render correctly on the shipped web build; the surfaces do not need to ship with the cut.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| runtime unit (new file) | `node --test tests/fa-particulars-proposal-unit.test.mjs` | **18/18** |
| runtime unit (neighbour) | `node --test tests/fixed-asset-acquisition-unit.test.mjs` (with the above) | **27/27** for the pair |
| frozen closure | `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, 55 workflow modules, 3 retired entries |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| db (new battery) | full gate chain + `tests/fa-particulars-proposal.test.mjs` | **5/5** |
| db census + isolation | full gate chain + `operation-census.test.mjs` `rig-isolation.test.mjs` + the new battery | **38 tests, 37 pass, 0 fail, 1 skipped** (no reset flags set) |
| db neighbours | full gate chain + `fixed-asset-acquisition.test.mjs` `fa-depreciation-policy.test.mjs` | **38/38** |
| web unit (new files) | `lib/registers/fa-particulars-proposal.test.ts` **11/11**; `components/registers/fa-proposal-prefill.test.tsx` **4/4**; `components/firm/fixed-asset-proposal-prefill.test.tsx` **4/4**; `components/work/work-question-proposal.test.tsx` **6/6** | 25/25 |
| web unit (whole suite, once) | `node scripts/run-tests.mjs` from `apps/web` | **5011 tests, 142 suites, 5009 pass, 0 fail, 2 skipped** |
| typecheck | `pnpm typecheck` | **Done** (both projects) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| browser walk | `pnpm --filter @clara/web e2e fixed-asset-acquisition-walk` | **9 passed** |
| browser walk | `pnpm --filter @clara/web e2e work-question-walk` | **14 passed** |
| browser walk | `pnpm --filter @clara/web e2e work-list-walk` | **18 passed** |
| browser walk | `pnpm --filter @clara/web e2e depreciation-walk` | **5 passed** |

All web work ran on this lane's triple (`https://127.0.0.1:3540` / 3541 / 3542) and all db work on
`clara_l05` at `127.0.0.1:55745`. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never
set, and no second from-scratch chain was run.

### One rig repair I had to make, recorded plainly

**The worktree's `node_modules` was stale and it blocked three gates.** `apps/web/package.json`
declares `@shadcn/react@^0.3.1`, added by `b5462ab36` (`feat(web): #970 …`, 2026-09-20) which is an
**ancestor of this lane's base** `cd2925391`; this worktree's `node_modules` was installed
2026-09-18. The consequences, all measured before I touched anything:

- `pnpm typecheck` failed on `components/ui/message-scroller.tsx(9,8): Cannot find module
  '@shadcn/react/message-scroller'` — **with my changes stashed as well as applied**;
- the whole web unit suite ran **24 files red**, every one of them
  `Cannot find package '@shadcn/react'`, and none of them in this ticket's change surface;
- `next build` failed the same way, so **no browser walk could run at all**.

`pnpm-lock.yaml` already carried the entry (`pnpm-lock.yaml:48,2387,8646`), so I ran
`pnpm install --frozen-lockfile` **in this worktree only**: `+1` package, 1.9 s, exit 0, and
`git status --short` showed no tracked file changed by it. All three gates then ran clean (the counts
above). I did not touch any other worktree, the main checkout's install, or the lockfile.

---

## Docs updated, in the same commits

- `packages/runtime/README.md` — a new "#933 — the proposal that question now carries" section under
  the #639 one: the four grounds in their order of authority, the two facts that are not estimates,
  why the block rides `source_ref` and needs no migration, and that the knowledge ground is wired and
  unfed (`42b4991a7`).
- `packages/db/README.md` — "#933 — the depreciation-particulars proposal rides `source_ref`, and
  needs no migration": the constraint it stands on, the five cells, and the vacuity control
  (`4d52cb2b1`).
- `CONTEXT.md` — **Depreciation particulars proposal**, in the house `term / _Avoid_` shape, placed
  between "Default depreciation policy" and "Depreciation change class" (`9e10ed6e3`). Its two
  load-bearing _Avoid_s are "a useful life inferred from an asset's name or class" and "a method
  picked between two of the account's own assets that disagree" — both of them Clara making a
  professional judgement under somebody else's name.
- `apps/web/messages/en.json` — four keys, two hunks, both at the end of their own object:
  `FixedAssetsDepreciation.particulars.proposalHeading` / `.proposalHelp` and
  `WorkQuestion.proposalLabel` / `.proposalHelp`.
- `apps/web/test/manifest.txt` — three lines, each inserted at its sorted position (two hunks of one
  line, one of one line across two commits).

---

## The accounting judgement, and why the derivation is shaped the way it is

The owner's 2026-09-18 ruling on #883 says **"a person stays the author of every depreciation
estimate."** A useful life is a professional judgement about how long an asset will earn its keep;
under MPERS/MFRS 116 it is management's estimate, reviewed at least at each reporting date. It is not
recoverable from an asset's name, and a product that guessed one from the word "compressor" would be
making that judgement under a person's signature.

So the core proposes a **driver only where a ground exists**, in this order of authority:

1. **`enrolment`** — an enrolment with no accumulated-depreciation account admits `none` and nothing
   else. That is not an estimate at all, it is
   `clara.complete_fixed_asset_particulars`'s own rule (0041:3080-3083); proposing anything else
   would be proposing a refusal.
2. **`client_knowledge`** — a depreciation note recorded against this client, the narrower (account-
   scoped) record governing the wider one.
3. **`retired_account_policy`** — THIS account's own default policy, retired. A person of the firm
   signed it for these very assets.
4. **`account_siblings`** — the account's other COMPLETED rows, **where they agree**. A split account
   grounds nothing and the reason says so: picking a side would be Clara choosing between two
   humans' judgements. (`p933.core.a_split_account_grounds_no_method`.)

and where nothing grounds a method it proposes **none at all**, with the reason saying so in words —
`p933.core.the_two_facts_that_are_not_estimates_are_always_proposed`. The only things always proposed
are the two that are **not** estimates: the in-service date is the acquisition's own posting date and
the residual is nil, **both the owner's own 2026-09-18 decisions on #932**, applied to the same
question. A ground whose shape the particulars door would refuse is **dropped, never repaired**
(`p933.core.an_incongruent_sibling_is_dropped`), because repairing it would invent the missing half.

---

## What was deliberately left

- **AC4's World e2e leg** — see AC4 above. It belongs to the `claraWork_v6` cut.
- **`apps/web/lib/firm/needs-you.ts`** — not touched, per lane rule (c). The Needs-you entrance finds
  its proposal without a queue-row change, which is precisely why it reads
  `clara.agent_interruptions` by the asset.
- **A finer knowledge grammar.** The core accepts a `knowledge` ground and ranks it above the
  account's own history, but nothing supplies one yet: see the follow-ups.
- **The `clara.list_review_queue` row was not widened**, no door was added, no grant was widened.

---

## Follow-ups worth filing

1. **The `client_knowledge` ground has no catalogued key, so it can never fire today.**
   `clara.knowledge_keys` is a closed, code-populated catalogue and
   `clara.knowledge_records.knowledge_key` carries a foreign key onto it. Measured on `clara_l05`
   2026-09-24, it holds **fourteen** keys and none is about depreciation: `accounting_basis`,
   `banking_arrangement`, `coa_seed_decision`, `customer_identity_policy`, `default_currency`,
   `entity_type`, `financial_year_end_day`, `financial_year_end_month`, `mpers_eligibility`, `msic`,
   `reporting_framework`, `sst_regime`, `trade_nature`, `turnover_band`. Cataloguing a
   `depreciation_policy` key (a migration) plus a mapper from its `value` onto
   `FaProposalKnowledgeNote` is the whole of that change; the core is built, ranked and driven
   (`p933.core.a_recorded_depreciation_note_outranks_…`, `p933.core.a_note_about_THIS_account_beats_…`)
   so nothing else has to move.
2. **The `retired_account_policy` ground is unreachable from the runtime's read credential.**
   Measured on `clara_l05` 2026-09-24: `clara.fa_account_depreciation_policies` has **no grant** to
   `clara_agent_ro` or `clara_runtime`, and **no policy** for either (its only read policy is
   `p_fadp_human`, for `clara_authenticated`). So `loadFaProposalInputsStepV6` cannot supply
   `retiredPolicy` without a migration adding a SELECT grant and an agent policy. The core handles
   its absence by falling through to the siblings, so this is a missing ground, not a defect.
3. **The narrower server-side read.** `loadAssetParticularsProposal` reads up to 50 of a client's
   pending questions and locates the asset's own in JS, rather than filtering
   `source_ref->>asset_id=eq.<id>` at PostgREST. The jsonb-path filter is documented PostgREST
   (v13 "Filter and Order JSON Data", checked through Context7 on 2026-09-24) and
   `p933.read.by_asset` measures that the equivalent SQL is lawful to the human role — but its
   query-string encoding through `URLSearchParams` has no precedent in this app, so the ordinary
   column filters were chosen and the tightening left as a one-line change with its evidence already
   in place.
4. **A `depreciation_authority`-style "Clara proposed, who confirmed" read.** The proposal survives on
   `agent_interruptions.source_ref` beside the answer (`p933.wire.answerable` proves it), so
   "where did 84 months come from, and what did Clara suggest" is answerable — but no surface renders
   that pairing on a SETTLED question yet. Worth a ticket if the firm wants the review trail visible.

---

## Anything unverified

- **The v6 join.** That `claraWork_v6` actually puts `deriveFaParticularsProposal`'s output on the
  wire is **unverified by construction** — the cut does not exist. Everything on both sides of the
  join is driven (the derivation as a pure function; the transport on a live database; the three
  surfaces against a block of the contract's own shape), and the contract above is what closes it.
- **The live PostgREST round trip of the proposal read.** `loadAssetParticularsProposal` is driven
  against a mocked `fetch` (the URL it builds is pinned) and the equivalent SQL is driven against the
  live database under the human role, but no cell drives the two joined through a running PostgREST:
  the four browser walks that ran do not reach a fixed asset with a parked, proposal-carrying
  question, because nothing on this frontier opens one.
- **The reason line's wording has not been reviewed by the owner.** It is written to the ruling's own
  terms and every cell asserts its substance (the ground named, the account named, the posting-date
  origin stated, and that the person decides) rather than its exact prose, so a reword is a message
  change and not a test change.
- **Hosted behaviour of the extra `source_ref` key is inferred from the lane database**, which was
  migrated from scratch to the same frontier. `clara.agent_interruptions.source_ref`'s CHECK was
  added by 0180 and has not moved since, so the inference is narrow — but it is an inference.
