# Wave synthesis — refresh-wave-2026-09-15

Twelve tickets, twelve worktrees, twelve PG17 clusters, merged later into one integration branch.
This file is the constraint set the orchestrator needs **before** writing the twelve briefs. It is a
synthesis of the twelve FINAL gap maps (`gap-<n>.md` beside this file), with every cross-ticket claim
re-verified against source at `4464e471`.

Ground rules that shaped every decision: `WORK-ORDER.md` rule 8 (no worker cuts a `_vN` successor;
use ONLY the migration number the brief assigns; re-pin by pre-image sha256 every governed function
you recut), AGENTS.md steps 4–5 (blueprints are not edited by implementation), and the estate's own
append-only laws.

---

## 0 · What was re-verified for this synthesis

| Claim | Verified at |
|---|---|
| Frozen manifest is at the **repo root**, 281 entries, **every one `deployed:true`**, **zero `apps/**` keys, zero `.sql` keys** | `frozen-workflows.json` (parsed) |
| Freeze lint scans **all tracked source under `packages/`**, freezes the **transitive relative-import closure**, and is **append-only vs `origin/main`**; `--update` refused under CI; check (d) permits a version **increase**; check (h) refuses a manifest key under a test path | `scripts/check-frozen-workflows.mjs:1-120` |
| `plan-occurrences.mjs`, `workRoutes.ts`, `registry.ts` are **not** manifest keys — the #640 precedent holds | manifest parse |
| `lib/periodic-adjustment-basis.ts`, `lib/knowledge.mjs`, `lib/capability-registry.mjs`, `lib/work-trace.mjs`, `lib/malaysian-registration.mjs` **are** frozen, `deployed:true` — frozen **by closure** | manifest parse |
| The live posting core approves with a **raw `update … set status='approved'`** and calls **no** subledger hook; grep for `_subledger_on_approve\|_fa_on_approve` across 0178/0182/0184/0194/0195 = **0** | `0195:2110-2113`; grep |
| The subledger hook's caller roster is pinned at **exactly four** with a fail-closed whole-schema scan | `0037:3840-3845` |
| `#643 INSERTION 5` is an **unconditional** `if w.adjustment_basis is not null` inserting into `clara.periodic_adjustments` with `w.purpose` | `0195:2165` |
| `clara.periodic_adjustments.purpose` CHECK admits **exactly two** values | `0194:339-340` |
| `ck_accounting_work_adjustment_basis` requires **non-null `adjustment_basis` for every purpose other than `journal_entry`** | `0194:244-247` |
| `0194` prestate pins four bodies by pre-image `sha256(prosrc)`; `0195` pins six plus one explicit **NON-REGRESSION** pin | `0194:171-196`, `0195:371-409` |
| `WORK_ACCEPTED_PURPOSES_V19` is a frozen three-member literal pinned by a parity cell | `chatTurn.v19.parts.ts:91`; `p6-1-parts-parity.test.mjs:548` |
| The interview family (`clientOnboarding.v1..v4`, `firmInterview.v1..v3`, `interview.v1.*`, `interview.v2.*`, `interview.v3.questions.ts`) is **all frozen, all deployed** | manifest parse |
| `knowledge_keys` and `knowledge_plan_item_map` are **append-only on UPDATE and DELETE**; `scope_default` has **three occurrences repo-wide, all writes** | `0192:185-189, :288-289`; grep |
| `kp.01` is a ten-entry `assert.deepEqual` over `knowledge_plan_item_map` | `knowledge-onboarding-promotion.test.mjs:92-113` |
| Both activity kind ladders fall through `else 'documents'`, and `af.15` asserts the two doors agree | `0184:2078`, `0184:2320`, `activity-feed.test.mjs:540` |
| `accounting_plans.kind` is a closed two-member CHECK whose own comment says it is "Widened additively by a later file" | `0193:412-413` |
| Migration frontier is **0198**; 0198 contains **zero** `sha256(prosrc)` pins (it pins by statement probe) | file listing; grep |

---

## 1 · Frozen-body plan

### 1.1 The answer

**No ticket needs a change inside `claraWork_v3`'s or `chatTurn_v19`'s closure to deliver its
database door, its human web door and its tests.** Every one of the twelve can land its branch
without touching a frozen byte, because the freeze lint scans only `packages/`, and every migration
and every `apps/web` file is outside it by construction (verified: 0 `.sql` keys, 0 `apps/` keys in
the manifest).

What several tickets *do* need is a **tool** — a chat-lane or Work-lane verb — to close an
acceptance criterion their DB+web halves cannot reach. Those are deferred, by rule 8, to **one
integration cut after the branches merge**.

### 1.2 The plan: three successor cohorts, one integration worker, one PR

```
twelve branches                       integration branch
─────────────────                     ──────────────────
each ships:                           ONE worker cuts, once:
  · its migration                       · chatTurn_v20      (all chat tools)
  · its human web door                  · claraWork_v4      (if ruled in)
  · its tests                           · clientOnboarding_v5 + interview.v4.questions.ts
  · a NEW non-frozen runtime module     · firmInterview_v4  (only if #648 forks)
    that NO frozen body imports
  · a "successor contract" stanza
    in its final report
```

**Why one cut rather than twelve.** The estate has already ruled this, in its own words, in a frozen
header: `chatTurn.v19.tools.ts:6-10` says v19 adds exactly two tools and is

> "ONE successor rather than two, because a frozen version is expensive to mint twice and both halves
> were deliberately deferred to this file by their own tickets."

That is #643 and #644 sharing v19. This wave has three-to-six tickets wanting chat tools; the same
argument, larger. Twelve parallel successors would also each need their own bundle digest, registry
repoint, parts file, parity run and re-baseline — twelve ceremonies where one suffices, and eleven
opportunities for two branches to mint the same version number.

### 1.3 Who needs what

**chatTurn_v20 (near-certain).** Carries, in one fixed literal roster over `buildToolsV19`:

| Ticket | Tool | Why the DB+web half cannot close it |
|---|---|---|
| #638 | `start_staff_expense_claim_work` | ticket names "对话" as an entrance; **also** must widen `WORK_ACCEPTED_PURPOSES_V19` (`chatTurn.v19.parts.ts:91`), which `p6-1-parts-parity.test.mjs:548` pins — so a claim Work has **no nameable chat `work_accepted` part** until v20 |
| #652 | `start_accrual_work` | ticket names "用会计界面、对话或上传的资料" |
| #653 | `start_prepayment_schedule_work` | `docs/PRD.md:69` lists 预付款摊销 under "conversation, documents or Accounting directly" as *current-version* behaviour |
| #647 | identity write verb | **owner question** — see Q6 |
| #654 | firm-scope capture | **owner question** — see Q11 |
| #646 | source-correction entrance | recommended out of scope |

**claraWork_v4 (conditional on owner rulings).** Two candidate additions, neither required by an
unambiguous AC:

* a knowledge-context step reading `clara.get_knowledge_pack` and feeding
  `observedRevisions({ knowledge_version })` into the existing trace call — `claraWork.v3.impl.ts:474`
  records `basis_digest: null` today, and `knowledge_version` is already in the closed trace
  vocabulary (`lib/work-trace.mjs:282-285`). This is the discriminator every future
  "re-evaluate only affected work" depends on (#654, #646).
* a scoped question capability: `clara.open_work_question` is `clara_runtime`-only **and**
  hook-token-gated (`0180:686`, `0184:1643, :1696`), and `claraWork.v1.prompt.ts:68` forbids the run
  citing a source document — so #653's AC5 park and #639's Q1 reading are claraWork-lane
  capabilities, not DB+web ones.

**clientOnboarding_v5 + `interview.v4.questions.ts` (certain if #649 keeps AC2).** This is the one
place where a frozen change is *unavoidable*: H-52 (a client who answered "not SST-registered" is
still asked for an SST number) is live, and the ask loop lives in
`interview.v2.core.ts:245` / `interview.v2.questions.ts:83-84`, all `deployed:true`. There is no
database door and no web route that makes a frozen interview stop asking a question. **State this in
#649's brief up front**, or its final report will claim an outcome its branch cannot produce.
`firmInterview_v4` joins the same cut **only if** #648 takes the durable-interview fork (recommended
against — its slice is DB doors + a settings page).

**documentIngest_v3: refused.** #633 could emit per-step progress from inside the frozen ingest
body. It must not — the surface already has honest counts in
`listProcessingTasksForDocument` (`intake.ts:144`, already wired at `loaders.ts:123`).

### 1.4 Verification of the plan against the lint

| Rule | Effect on this plan |
|---|---|
| scan = all tracked source under `packages/`; `.sql` and `apps/**` outside | every branch's migration + web door is invisible to the lint — **twelve branches can run in parallel with zero freeze risk** |
| manifest **append-only vs `origin/main`** | a successor **adds** keys; it never changes one. The integration cut passes. |
| (d) registry monotonicity: keep or **increase** | `claraWork: claraWork_v3 → claraWork_v4` and `chatTurn: chatTurn_v19 → chatTurn_v20` are increases. **Every prior version stays exported** (the stranded-body gate refuses database-wide otherwise). |
| (e) enqueue-site provenance | any new `start()` under `packages/` must receive a registry-traced reference |
| (h) no manifest key under a test path | the new modules live under `lib/`, never `tests/` |
| **IMPORT-ESCAPE** — the closure captures any first-party module a frozen body imports | **the sequencing constraint.** `lib/periodic-adjustment-basis.ts` is in the manifest today, `deployed:true`, noted "frozen BY CLOSURE … chatTurn_v19 imports the adjustment schemas". Each ticket's new basis module is editable **only until the successor imports it**, and hash-locked forever after. So the successor must be cut **after** the branches merge **and after** the wave's review round has settled every schema. It also blocks #643's own follow-up 1 today — the same trap, already sprung once. |
| `--update` refused under CI | the integration worker re-baselines **locally**, then the ceremony runs `--lock-deployed` and commits |
| parts parity | a new `chatTurn.v20.parts.ts` must be added to `packages/runtime/scripts/check-parts-parity.mjs`'s closure list, and `registry.ts:165`'s **reader parity hold** means `apps/web` ships the reader half in the same cut |

### 1.5 What each worker writes instead

One stanza, headed **"successor contract"**, in the final report: tool name, `.strict()` zod input
schema, the door call and its argument order, the refusal→message mapping, the part kind, and — for
#638 — the `WORK_ACCEPTED_PURPOSES` widening. The module itself ships on the branch, unit-tested
standalone, with a header stating it is non-frozen **only until the shared successor imports it**.

---

## 2 · Migration allocation

Frontier is **0198**. Append-only; applied bytes immutable; every recut of a governed function pins
the pre-image `sha256(prosrc)` in its own prestate (`0194:171-196` is the idiom).

### 2.1 The rule that forces serialisation

Two branches recutting the same governed function both derive from the **same** live body. Whichever
lands second has a prestate pinning a sha that the first has already replaced, so it **refuses to
apply**. That is a loud failure, not a silent one — but it means the second file's prestate text
**cannot be written until the first file's output text is fixed**. Parallel authoring of a shared
recut is not possible; only serialised authoring is.

### 2.2 Allocation

Numbers are assigned so that the **least-blocked, least-contended** files hold the low numbers and
the serialised accounting spine holds the tail: a spine held up by an owner ruling must not block
seven independent files behind it.

| № | Ticket | Needed | What it carries | Recuts a function another wave ticket also recuts? | Must re-pin |
|---|---|---|---|---|---|
| — | #633 | **no** | default-zero; a door is owed **only** if the settle-without-reload poll ships (`plan_cache_mode = force_custom_plan` is mandatory on a multi-tenant door and 0183's tail refuses without it) or a masked receipt read is built. Every read it needs is already granted. | — | — |
| 0199 | #650 | yes | `clara.get_client_work_pack` — one SECURITY INVOKER read | no | nothing |
| 0200 | #647 | yes | alias provenance columns, `counterparty_identity_revisions`, three reads, four event types | no | nothing (no knowledge/counterparty function is pinned by 0193–0198) |
| 0201 | #639 | yes | **option B**: a deferred constraint trigger on `journal_entries` firing before `t_je_fa_movement_belt`; `acquisition_document_id`; recut `_fa_asset_json` + `get_fixed_asset` | no *(option A would put it in the spine chain — see Q2)* | `_fa_asset_json`, `get_fixed_asset` — **measured on a from-scratch 0001→0198 chain**, since no migration 0180–0198 mentions fixed assets |
| 0202 | #646 | yes | `revise_document_fact` (appends an attested extraction), `dismiss_orphaned_classification_question` | **conditional** — if Q4 takes the `accounting_work` horn it joins the spine and moves to the tail | `_document_posting_entry` at `8ba5e67f…` as a **non-regression** pin (0197 pins it twice) |
| 0203 | #648 | yes | `firm_setup_keys` catalog + four human doors + `get_firm_setup` + `uq_onboarding_plans_one_open_firm` | no | nothing (recommended slice recuts nothing) |
| 0204 | #649 | yes | `client_identity_candidates` wrapper + `settle_client_onboarding_facts` | no | `set_client_fy_end` — **live body is a two-stage splice** (0042 §S5.12, then 0045 §S5.12-b2); read it off `pg_proc`, never off 0041's text |
| 0205 | #654 | yes | firm-scope evidence wall, `get_knowledge_applicability`, `list_firm_knowledge` | **conditional** — `_knowledge_capture_core` / `_knowledge_floor` only if the wall is a recut rather than a new guard function | if recut: both, **plus** a `0195:396-409`-style non-regression pin, because both lie in the **frozen chat lane's call path** (`0192:1203-1205`, `:1191`) |
| **0206** | **#638** | yes | **SPINE HEAD** — widen both purpose CHECKs, recut `ck_accounting_work_adjustment_basis`, **purpose-discriminate the `0195:2165` insert arm**, generalise the four `_adjustment_*` validators, FIFTH recut of the posting core, claim relation + doors | **yes — #652, #653** | `_record_journal_entry_core` (live 0195 body), `_tf_accounting_work_immutable`, `_admit_accounting_work_core`, both CHECK texts |
| **0207** | **#652** | yes | accrual purpose + `accrual_adjustments` + accrual arms; **rides `kind='reversing_journal'`**, so it does *not* widen `accounting_plans.kind` | **yes — pins #638's output** | the same set, at #638's post-image |
| **0208** | **#653** | yes | `amortisation_schedule` kind, prepayment schedule record, **per-period basis** + **the expense-side pairing and its three walls** | **yes — pins #652's output**; sole widener of `accounting_plans.kind` | the same set at #652's post-image, plus `_plan_occurrence_basis`, `_plan_admit_occurrence`, `create_accounting_plan`, `_assert_plan_schedule` |
| 0209 | #625 | **conditional** | `clara.preview_invite(p_token)` — only if Q1 rules that firm+role must be visible **before** authentication | no | nothing |

### 2.3 Why #638 owns the spine

Because it is the only one of the three whose particulars **cannot** ride `adjustment_basis`. The
`0195:2165` arm is unconditional and routes straight into `clara.periodic_adjustments`, whose CHECK
admits two purposes and requires **NOT NULL `period_start`/`period_end`** (`0194:339-342`). An
accrual has a period. An amortisation is a plan occurrence. **A staff expense claim has no period**,
so #638 is forced to build the general mechanism — purpose-discriminating the insert arm and
recutting `ck_accounting_work_adjustment_basis` — and #652/#653 inherit it.

> **Correction to gap-638.** Its §B proposes "a NEW column `clara.accounting_work.claim_basis jsonb`
> with its own NULL-iff-purpose CHECK and recut `_tf_accounting_work_immutable` **once**". That is
> one recut short. `ck_accounting_work_adjustment_basis` (`0194:244-247`) reads
> `(purpose = 'journal_entry' and adjustment_basis is null) or (purpose <> 'journal_entry' and
> adjustment_basis is not null …)` — so a `staff_expense_claim` row with `claim_basis` set and
> `adjustment_basis` NULL **cannot be inserted today**. The CHECK must be dropped and re-added in the
> same file. gap-646 found this for its own case; gap-638's slice does not name it.

The spine head is also the ticket most likely to be blocked by an owner ruling (the subledger hook —
Q2). Mitigation: **the spine and the hook are separable.** The purpose widening, the CHECK recut, the
insert-arm discrimination and the validator generalisation are independent of
`settlement='advance_application'`. #638's brief must be written so the spine lands whatever the
owner rules, and the advance arm is ruled in or descoped without holding 0206.

### 2.4 Numbering discipline

The numbers above are **the brief's to assign**, not the worker's (rule 8). If a conditional file is
ruled out, **release its number rather than renumbering** — a gap in the sequence costs nothing; a
renumber invalidates every prestate written against it.

---

## 3 · Shared surfaces

Each row names an owner and a consumption pattern that avoids a merge conflict.

### 3.1 Database

| Surface | Tickets | Proposal |
|---|---|---|
| `clara._record_journal_entry_core` (5th→7th copy), both purpose CHECKs, `_admit_accounting_work_core` purpose set, the four `_adjustment_*` validators, `ck_accounting_work_adjustment_basis`, the `0195:2165` insert arm | #638 #652 #653 (+#639 opt A, +#646 horn B) | **#638 owns the spine.** It ships the purpose-keyed generalisation with **clean delimited insertion points** so 0207/0208 can pin and re-derive rather than re-type. #652 and #653 write their prestates against #638's committed output. Serialised, never parallel. |
| `clara.accounting_plans.kind` CHECK | #652 #653 | **#653 owns it.** #652 rides `reversing_journal` (which already delivers the accrual→reversal pair, the mirrored basis, the reversal-to-posted-entry binding and the orphan wall). One widener, no prestate collision. |
| `clara._subledger_on_approve` caller roster (pinned at four, `0037:3840-3845`) | #638 #639 | **One owner ruling, one census re-derivation.** Both tickets meet the same belt: a constraint trigger fires on any approved row while the hook fires for only four callers. If the hook gains a fifth caller, **#638 re-derives and re-asserts the census in its own tail** and #639 inherits it; if not, both descope and say so by name. |
| `clara.list_activity` / `clara.get_activity_event` kind ladder + `af.15` | #625 #633 #647 #650 | **No wave ticket touches it.** Two governed bodies must be recut together with two sha pins and two D1 windows; `0184:88-90` warns that two lanes emitting two bodies of one function "is a merge that resolves itself wrongly and silently". Every affected ticket records a named **residual**. File one follow-up issue owned by the activity lane. |
| `clara.knowledge_keys` / `knowledge_plan_item_map` (append-only) + `kp.01`'s ten-entry `deepEqual` | #647 #648 #649 #654 | **#654 owns the catalog for this wave.** #647 defers identity keys (its own Q2); #648 mints none (its own Q2); #649 mints a `knowledge_plan_item_map` row **only** if Q7 answers "ask a fy-end day". Any ticket that does need a row files it **through #654's migration**, so `kp.01` moves exactly once and in one file. |
| `clara.get_knowledge_pack` envelope shape | #647 #654 | **Additive only.** The envelope is read field-by-field by the **frozen** `chatTurn.v19.prompt.ts:130-235`, and `lib/knowledge.mjs:188` turns an unrecognised envelope into `unavailable('malformed')`. Adding a field is safe; renaming or removing one is a behaviour change inside a frozen contract. Any unioned row must carry `authoritative: true` (the frozen `recordLine` marks legacy rows "in force" only on `source_kind === 'legacy_client_fact' \|\| authoritative === true`). |
| `clara.entry_evidence_links` (already `grant select` to `clara_authenticated` under FORCE RLS) | #633 #639 #652 #653 | **Read it directly; wrap nothing.** A `SECURITY DEFINER` wrapper would *remove* the RLS guarantee. #633 owns rendering the document→Work link; the accounting tickets consume the same read. |
| `clara.open_work_question` (runtime-only + hook token) | #639 #646 #652 #653 #654 | **#629's shipped estate; fork nothing.** A second question table would fork the expiry, the transition allowlist, the sweep (hardened by 0198) and the queue kind. The production caller is necessarily a run → `claraWork_v4` contract. Note 0198 removed the `work_id is not null` predicate, so a Work question now shares the chat-clarification expiry clock — the contract must say what an expired conflict question means. |
| `clara.periodic_adjustments` | #638 #652 #653 | **Do not widen its purpose CHECK.** `0194:92-100` argues a thing *with* a schedule must not share a prefix with things that have none, and `_close_gate_closing_stock` points at it — a widening moves a gate's `measured_digest` and re-asks every prior close attestation. Each new operation gets its own relation on that table's idiom. |

### 3.2 Web — registration files edited by every lane

`apps/web/lib/navigation/tree.ts` · `apps/web/messages/en.json` · `apps/web/test/manifest.txt` ·
`apps/web/e2e/serve-built.mjs` + `e2e-fixture-ownership.test.ts` · `packages/db/tests/rig-meta.mjs` ·
`packages/db/package.json` gate chain · `.github/actions/db-live-gates/action.yml` · `CONTEXT.md`

**Proposal, uniform:** every edit to these is **one line, at its sorted position, registering a module
that lives elsewhere**. No logic in a shared file. Three of them have extra traps:

* `apps/web/test/manifest.txt` — 400 lines, **alphabetical by plain string compare**; the Node runner
  does **not** directory-scan, so an unregistered test file silently never runs.
* `apps/web/e2e/e2e-fixture-ownership.test.ts` — a census of which lane mock answers which RPC verb.
  **Every ticket adding a mock must declare its verbs**, and any verb another lane also answers is a
  declared shared verb. `serve-built.mjs` is ONE server for every walk.
* `apps/web/tests/firm-scope-db-pins.corpus.ts` — a `Map` whose **key order is load-bearing** and
  whose sha256 is over **final file content**. Any ticket adding dynamic SQL needs an entry at the
  correct sorted position with a ≥40-character reason. **Sequence these at merge prep**, after the
  migration bytes are final.

### 3.3 Web — components and routes

| Surface | Tickets | Proposal |
|---|---|---|
| `client-workspace-overview.tsx` (client home) | #649 #650 (+#638/#639 affordances) | **#650 owns the layout.** #649 confines itself to two data seams (`coa.ts` reading `seed_decision_plan_state`; the identity band reading promoted knowledge). Affordance tickets add **one registry row each** in `needs-you-affordances.tsx`, never a layout change. Sequence #650 first if possible. |
| `InterviewRunCard.tsx` | #633 #649 | **Genuine two-hand conflict**: #633 rewrites the upload queue it hosts (`:22-31`), #649 re-composes its answer entry onto `Field`. **Sequence #633 first**, then #649 re-composes on top; or split the card into the queue half and the answer half in #633's PR. |
| `apps/web/lib/documents/useUploadQueue.ts` + `intake.ts` transport | #633 #649 | **#633 owns it.** Three callers (`upload-panel`, `ComposerAttachmentControl:95`, `InterviewRunCard:408`); `ComposerAttachmentControl:58`'s `IN_FLIGHT` set keys on **exact state strings** and `chat-parity-walk.spec.ts:209` asserts the terminal word `'Filed'` — a rename breaks a **shipped** browser walk. |
| Work purpose vocabulary — `lib/work/purpose-label.ts`, `accounting-work-list.tsx:114`, `work-list-filters.tsx:55`, `messages/en.json` | #638 #639 #652 #653 #650 | **FOUR surfaces, not one, and two are already stale since #643** (both hard-coded to `["journal_entry"]`, so a periodic adjustment can be neither labelled nor filtered in the Work list today). **#638, as spine head, fixes all four once** and carries `periodic_stock_adjustment` + `payroll_obligation` with it; #652/#653/#639 add one entry each. |
| `components/common/state.tsx` (`StateBanner`) | #646 (+ ~138 referencing files) | **Do not rebuild it on `ui/alert.tsx`.** #646 may adopt `Alert` **on the documents surface only**, through `DoorFeedback`. An estate-wide rebuild changes rendered output across #625, #638, #649, #650, #652, #653 and would re-derive `focus-ring-contract.test.ts:207`'s ring count. Its own ticket if wanted. |
| C13 Knowledge register + detail (`knowledge-panel.tsx`, `knowledge-detail.tsx`, `lib/registers/knowledge.ts`) | #647 #648 #649 #654 | **#654 owns the firm-scope surface** (`/settings/knowledge` + the Promote dialog + the exception pair). #647 renders counterparty identity in **its own** section/route, reusing `knowledge-shared.tsx` verbatim. #648 and #649 **call the doors**, render nothing new here. |
| Settings sections registry (`tree.ts:248-280`) | #625 #648 #654 | Three new-or-changed sections in one five-row literal. **The brief assigns each ticket its section id in advance**; each adds one row at a fixed index. |
| Firm-scope registries (`require-firm-scope.ts` SCOPE_ENTRANCES / UNSCOPED / EXEMPT) + `firm-scope-surfaces.test.ts` + `firm-scope-fourth-entrance.test.ts` | #633 (firm documents leaf) #648 (`/settings/setup`) | An unregistered firm leaf is a **scope hole**, not a cosmetic miss. Each new leaf registers itself in the same commit and runs both census walls. |
| `lib/firm/capabilities.ts` | #625 #638 #654 | **#625 owns it.** It is the one fail-closed rank derivation; #638/#654 read `firmCapabilities`, change nothing. |
| `lib/parts/hooks.ts` re-read contract | #625 #649 | **Nobody changes it.** #625 adds a *second read* to the members panel rather than changing `act()`'s reload discipline, which every hydrated surface shares. |
| `lib/firm/needs-you.ts` row kinds (nine, five enumerated pins, a tenth reserved) | #633 #638 #639 #648 #650 | **No wave ticket adds an eleventh** without the orchestrator's assent — five files move together. Prefer an existing kind or a dedicated read. |

---

## 4 · Ordering

### Group 1 — fully parallel, start immediately (7 tickets)

**#625, #633, #647, #648, #650, #654, #646¹**

No shared governed recut, no shared frozen closure, no blocking owner ruling on the bulk of the
slice. Each lands its own migration (or none, for #633) and its own web surface.

¹ #646 is parallel **only while Q4 is unresolved in the conservative direction**. If Q4 takes the
`accounting_work` horn, #646 joins Group 3 at the tail.

### Group 2 — parallel with Group 1, but sequenced against a sibling (3 tickets)

* **#639** — parallel on the database (option B is a deferred trigger, no posting-core touch), but its
  belt ruling is the *same* ruling as #638's (Q2). Start it; hold the advance/FA arm for the ruling.
* **#649** — parallel on the database, but **after #633** on `InterviewRunCard.tsx`, and its AC2(a)
  + H-52 close in the integration cut, not on the branch.
* **#650** — should land the client-home layout **before** #649's home seams if both are in flight.

### Group 3 — strictly serialised (3 tickets)

**#638 → #652 → #653.** Each writes its prestate against the previous file's committed output. The
second cannot begin authoring its migration until the first's SQL text is frozen. Their **web** halves
(forms, history tables, purpose labels) are parallel throughout; only the migration is serialised.

### Integration phase — one worker, after merge

1. Merge all twelve branches; resolve the shared-file one-liners.
2. Run the census suites (`sql-oracle`, `parity-holes`, `firm-scope-surfaces`,
   `firm-scope-fourth-entrance`, `e2e-fixture-ownership`, `operation-census`, `rig-isolation`).
3. **Then** cut the successors from the twelve "successor contract" stanzas — chatTurn_v20,
   clientOnboarding_v5 (+ interview.v4.questions.ts), claraWork_v4 if ruled in.
4. `--update` locally → `check-parts-parity.mjs` → `check-frozen-workflows.mjs` → registry repoint →
   `--lock-deployed` ceremony. Keep every prior version exported.

---

## 5 · Orchestrator questions

Only questions that change what is built. Plain-language framing first.

### Q1 · #625 — 受邀人在认证之前要不要先看见「我加入的是哪家事务所、什么角色」？

* **今天**：接受成功之后，`invite-accept-form.tsx:337-340` 立刻 `router.replace('/')`，刚读到的
  `firm_name` 与 `role_rank` 被丢掉；认证之前则完全看不到，因为 `firm_invites_visible` 是
  jwt_firm 作用域且 admin+ 地板。
* **建议**：先做零迁移那一半（一个 "joined" 阶段渲染事务所名与角色，加一个「进入工作台」按钮）；同时加一扇最小的
  `clara.preview_invite(p_token)`，只授予 `clara_authenticated`（本仓库没有 anon 角色），沿用
  `accept_invite` 同一堵 JWT-email 墙，返回 `{firm_name, role, effective status}` 与打码邮箱。
* **代价**：若业主判定「认证前必须可见」，那需要服务端路由 + service key，而不是放宽 PostgREST 授权 —— 那是另一张票。
* **Owner decision needed: yes**（决定 0209 存在与否）。

### Q2 · #638/#639 — 记账核心可不可以成为垫款钩子的第五个调用者？

* **今天**：Work 车道上一张借记已登记垫款科目（或固定资产科目）的分录，提交时会被 `CLR40` 打回，因为
  `_record_journal_entry_core` 用一句裸 `update … set status='approved'`（`0195:2110-2113`）批准，不调用
  `_subledger_on_approve`；而那条「皮带」是 constraint trigger，对任何 approved 行都开火。两张票撞的是同一堵墙。
* **建议**：把 (i) 与 (ii) 一起交给业主。(i) 准许记账核心直接调用 `_adv_on_approve`（仅垫款臂），并在
  0206 的 tail 里重新推导并重述 `0037:3840-3845` 的调用者普查；(ii) 把
  `settlement='advance_application'` 降级给既有的 `book_staff_advance_application`，并在票里写明 AC2 的
  「atomically」对该臂未满足。`docs/PRD.md:79`（一件工作等于它相关的全部会计结果）支持 (i)。
* **代价**：(i) 触碰一条估计专门写了普查去抓的边界；(ii) 让 #638 从 XL 降到 L，但留下一条 AC 明确未满足。
* **Owner decision needed: yes** —— 不可由实现者默默决定。

### Q3 · #652/#653/#638 — 哪些票在 chatTurn_v20 里拿到对话入口？

* **今天**：`chatTurn.v19.tools.ts` 是冻结的固定字面量 roster，加不进新工具；而
  `docs/PRD.md:69` 把「通过对话、资料或会计界面直接」列为当前版本行为。
* **建议**：#638、#652、#653 三个入口一起进 v20（它们的 AC 或 PRD 明文点名对话）；#646、#647、#654 的对话入口
  作为单独问题（Q6、Q11）。`WORK_ACCEPTED_PURPOSES_V19` 在同一次成功器里一次性加到四/五个值。
* **代价**：不给，则三张票各有一条 AC 只能写「successor contract 已交付，入口待 v20」；给了但 schema 写错，
  按 IMPORT-ESCAPE 规则那个模块此后永久锁死。
* **Owner decision needed: yes**（产品范围）。

### Q4 · #646 — 「更正 Work」是 `accounting_work` 的一行，还是别的东西？

* **今天**：`_admit_accounting_work_core` **无条件** 调用 `_assert_journal_basis`（`0194:1152`），后者要求
  posting_date、非空 memo、MYR、**至少两行**、借贷严格相等、总额非零。也就是说每一行 `accounting_work`
  在受理那一刻就必须带一套完整、可过账的分录。
* **建议**：取保守读法 —— 更正 Work **不是** `accounting_work` 行（身份与回执放
  `clara.coding_tasks` 或一张新的更正关系）。AC4 自己的收尾句把「来源变更→已入账结果」的整合交给 **#676**。
* **代价**：走 `accounting_work` 这一支，等于把 #676 的范围拉进 #646，并让 #646 加入 0206–0208 的序列化链。
* **Owner decision needed: yes** —— 它决定 #646 的迁移号与并行分组。

### Q5 · #639 — 「through the same Work」是不是把那个有版本的追问绑在 Work 的运行上？

* **今天**：开问题的门 `clara.open_work_question` 只授予 `clara_runtime` 且必须带运行中的 hook token；
  `ask_question` 没有 `execute`，是**冻结的工作流本体**去开问题；`complete_fixed_asset_particulars`
  也没授给 `clara_runtime`。所以「由 Work 发问并应用答案」是 claraWork 车道的能力。
* **建议**：默认复用 #629 已交付的问题机制（人类从登记册或 Needs-you 作答），**不**新建第二套；若业主判定该短语
  确实绑定运行，则 claraWork_v4 与一个 `clara_runtime` 授权进入范围，#639 的工作量再升。
* **代价**：误判会让 #639 建一条每笔都在提交时被打回的车道，而今天没有任何 cell 覆盖 Work 车道的借记方向。
* **Owner decision needed: yes**。

### Q6 · #647 — Clara 能不能自己写入交易对方的别名或识别码？

* **今天**：Clara 只做**解析**（`_resolve_counterparty` 走别名）与**提案**（0154、0103），从不写别名；别名表也
  没有任何机器车道的出处位。AC1 的措辞「不得把机器写的标成人写的」预设了机器写入存在。
* **建议**：本票只做**出处**（`recorded_via` NOT NULL + 四个来源钉 + 门侧客户同源校验），对话写入作为
  successor contract 写在报告里，不在本票实现。
* **代价**：若业主要 Clara 能写，v20 得多带一个工具，且新模块在被导入后永久锁死。
* **Owner decision needed: yes**。

### Q7 · #649 — 财年问「哪个月」还是「哪个月的哪一天」？

* **今天**：访谈只问月份（1–12），但 `clara.set_client_fy_end` 要 `(p_client, p_month, p_day, p_op_key)`，
  `p_day` 为空直接 CLR37；而 `ck_clients_fy_end` 只接受「月日都空」或「月日都有」。**所以这个写入今天根本写不出来** ——
  不是没接线，是缺一个问题或一条业主裁定。
* **建议**：在 `CLIENT_SEGMENTS_V4` 里**加问一天**。用「当月最后一天」去推导，等于在专业人士的记录上发明一条会计事实。
* **代价**：加问一天让 v5 的 delta 从「一个 appliesTo」变成「两处 segment 改动 + 一个新问题」；若业主选推导，必须在
  界面上**显示**该推导并记为裁定，不得静默。
* **Owner decision needed: yes** —— 它**阻塞 0204 的迁移**。

### Q8 · #654 — `knowledge_keys.scope_default` 要不要变成有效规则？

* **今天**：这一列是**死列** —— 全仓库三处出现，全是写入，没有任何读取者；所有已种的键都是
  `scope_default='client'`。也就是说今天一个 admin 可以把**任何**键（包括 `entity_type` 这种客户专属的）
  按事务所范围写下去。
* **建议**：让它有效 —— `scope_default='client'` 的键在 firm scope 被拒（CLR10）。**但本次核对新发现一处成本
  gap-654 未点名**：`clara.knowledge_keys` 对 UPDATE 是 append-only（`0192:185-186`），而
  `knowledge_key` 就是主键 —— 所以**改已有键的 `scope_default` 是一次被触发器拒绝的 UPDATE**。只能
  (a) 仅对**新种**的键生效并记录残留漏洞，或 (b) 重切那条 append-only 触发器的覆盖面。
* **代价**：不做，AC1 的「只有明确面向全所的才成为默认」就没有任何机制在守；(b) 重切估计最严格的不可变 belt。
* **Owner decision needed: yes**。

### Q9 · #633/#648 — 事务所层面的「未归属来料」界面归谁？

* **今天**：`apps/web` 里没有 `(firm)/documents` 路由；但 DB 读 `clara.list_unassigned_documents(int)`
  **自 0009 就存在**、SECURITY INVOKER、已授权给 `clara_authenticated` 和 `clara_agent_ro`，且已有测试 ——
  web 从未调用过它。
* **建议**：**#633 建这个页面**（零迁移，只是一个 web 叶子 + 既有门调用），#648 是它的第一个消费者。新叶子必须注册进
  `require-firm-scope.ts` 的三张表并通过两道普查墙 —— 未注册的事务所叶子是**作用域漏洞**。
* **代价**：两票都不建，#648 的 SSM/身份文件无处可放；两票都建，就有两个事务所文档页。
* **Owner decision needed: no** —— orchestrator 可裁。

### Q10 · 全波 — 活动流的 kind 阶梯这一波动不动？

* **今天**：权限变更、身份更正、文件事件全部落进 `else 'documents'`，而 `p_kinds` 是封闭词表，读者没有任何可选值能筛到它们。
  活体阶梯在 **两扇门**（`0184:2078` 与 `0184:2320`），`af.15` 断言两者一致。
* **建议**：**本波不动**。四张票（#625 #633 #647 #650）共担这块资产，`0184:88-90` 明确警告「两条 lane 同时发同一个函数的两份身体，是一次会静默错解的合并」。四张票各自记一条具名残留，另开一张 issue。
* **代价**：产品历史里权限授予/撤销继续被归错档，且封闭词表筛不到 —— 已知、已记录、非静默。
* **Owner decision needed: no** —— orchestrator 可裁。

### Q11 · #654 — 事务所范围的事实一旦落库，就会出现在**每一个**客户的 Knowledge 页。可以吗？

* **今天**：`list_client_knowledge` 与 `get_knowledge_pack` 都按「同 key + 同适用条件」遮蔽事务所行 —— 反过来说，
  没有自己那一行的客户**都会看到**事务所默认。AC3 要求记进「与 Settings 和 Knowledge 同一份正式记录」，
  而那份记录就是 `clara.knowledge_records`，所以 AC3 **无法在不产生这个后果的前提下满足**。
* **建议**：首刀限定在**已经存在**的六个共享键（`entity_type`、`turnover_band`、`financial_year_end_month`、
  `default_currency`、`reporting_framework`、`accounting_basis`）—— `0192:300-308` 的映射行本来就注着
  「client + firm interviews」。
* **代价**：业主不同意，AC3 的「记录」那一半降级为「只进计划项」，必须明确记为未满足。
* **Owner decision needed: yes**。

### Q12 · #638 — 报销人是一行自由文本，还是必须先有一条垫款账户登记？

* **今天**：全仓库唯一的人名字符串是 `staff_advance_accounts.person_label`，而 `0043:939-941` 明写它是
  「**账户上的一个标签，不是人员记录**」，人员主数据推到 Wave F。自由文本无法把同一个人的两笔报销归到一起 ——
  正是 #647 为对方身份而存在的那个身份漂移问题。
* **建议**：把两个选项一起交给业主。要求登记，身份就结构化了，AC5/AC6 有真实的血缘可显示，还能复用既有的
  statement 面板；代价是多了一个入门前置条件，落在 #649 身上。
* **代价**：选自由文本，必须在 `CONTEXT.md` 里把这个限制写出来，否则 AC1/AC5/AC6 的「报销人身份」会被读成已满足。
  另注：今天的临时做法**已经**在污染供应商主数据（`x37-wave-c-a-subledger.test.mjs:1985-1999` 断言报销分录填了
  vendor 字段就会把员工生成 `kind='vendor'` 的对方）。
* **Owner decision needed: yes**。

### Q13 · #652/#653 — 应计走 `reversing_journal`，还是新开一个 plan kind？

* **今天**：`reversing_journal` 本身就是「应计 → 转回」的两条腿排程：到期日入账、次月一日反冲、转回在数据上指名它反冲的
  那张分录、没有已入账的应计就拒绝。产品文案 `en.json:4832` 也这么说。
* **建议**：#652 **骑** `reversing_journal`（零 kind 改动），#653 独占 `accounting_plans.kind` 的加宽。这样
  两票不在同一条 CHECK 的 prestate 上相撞，且 `accounting-plans.test.mjs:269-273` 只需要被改一次。
* **代价**：给 #652 新开 kind，要四处 0193 recut 各带 sha 钉，还要和 #653 协调同一条 CHECK 的 prestate 文本。
* **Owner decision needed: no** —— orchestrator 可裁（但要写进两张 brief）。

---

## 6 · Per-ticket effort

| Ticket | Effort | One line |
|---|---|---|
| #625 | **L** | DB lifecycle is done and proven; the work is four web faces, a downgrade re-read, a mutable e2e fixture and a narrow `preview_invite` if Q1 says so. |
| #633 | **L** | Zero-migration by default; the bulk is rebuilding the upload queue as a Data Table with real byte progress, 20 kind labels, 9 failure codes, and one new real-World intake-admission e2e. |
| #638 | **XL** | Owns the wave's accounting spine (purpose CHECKs, `ck_accounting_work_adjustment_basis`, the `0195:2165` arm, four validators, the 5th posting-core recut) **plus** the claim lane itself, **plus** the hook ruling. |
| #639 | **XL** | A birth-path change on a deferred constraint trigger, the first FA pins ever measured, a new C7 detail route, and the first FA browser walk. |
| #646 | **XL** | A new human fact-revision door, a narrow orphan-question door, three routed views, a Sheet/Alert re-composition, and a full correction walk — with the Work shape blocked on Q4. |
| #647 | **XL** | Alias provenance + a new revisions relation + three reads + a routed identity detail + repointing the one live human alias writer; the kind ladder and identity keys deferred. |
| #648 | **XL** | Four new human doors on the firm plan (reconciling seed, answer, defer, commit), one read, a new settings section built from zero — there is **no** manual-capture UI at any scope to adapt. |
| #649 | **XL** | Candidate detection + the fy-end settle door (blocked on Q7) + a client-creation walk; H-52 and ask-only-missing close in the integration cut, not on the branch. |
| #650 | **L** | One new read, two facet tiles beside a shipped needs-you chip, the facet→filter href, and the browser legs the client board lacks (320px, zoom, focus return, Back). |
| #652 | **L** | Inherits #638's spine; rides `reversing_journal`; the work is the typed accrual particulars, the accrual relation, a form and a real-World e2e. |
| #653 | **XL** | A per-period basis in a lane whose basis is constant **and** re-deriving the expense-side pairing plus three walls that live only in the 0045 lane's core. |
| #654 | **M** | The database half is done (PRD:122 says so); the work is the entrance — a firm register, a Promote dialog, the exception pair, and one evidence wall. |

---

## 7 · Risks

1. **The prestate chain is the wave's single point of serialisation.** Three tickets recut the
   posting core. Two branches deriving from the same live body produce a second file whose prestate
   refuses to apply. Loud, not silent — but unresolvable in parallel. #638 → #652 → #653, no exceptions.
2. **#638's spine is hostage to an owner ruling it does not need.** The subledger-hook question (Q2)
   governs one settlement arm; the purpose spine does not depend on it. Write #638's brief so the
   spine lands either way, or seven files queue behind one unanswered question.
3. **`ck_accounting_work_adjustment_basis` is a silent blocker gap-638 does not name.** A new purpose
   carrying a separate particulars column with NULL `adjustment_basis` **cannot be inserted today**.
   Discovered mid-implementation it re-opens the migration's shape after the prestate is written.
4. **IMPORT-ESCAPE locks every basis module the moment the successor imports it.** This already
   blocks #643's own follow-up. If the successor is cut before the wave's review round settles the
   schemas, six modules are frozen with the schemas they happened to have.
5. **#649 cannot close AC2 on its own branch.** The ask loop is frozen. If the brief does not say so
   up front, the report will claim an outcome the branch cannot produce.
6. **`kp.01` is a ten-entry `deepEqual` that reds on the first catalog insert and must move again for
   every subsequent one** — a three-way merge conflict in a *test file* on an append-only *table*.
   One catalog owner, or it happens.
7. **Pins must be MEASURED, not transcribed.** Several files (#639's FA bodies, #649's
   `set_client_fy_end` two-stage splice, #646's `commit_client_onboarding` 0018 splice) have live
   bodies that are **not** the text in the file that created them. A pin written from a source read
   will not match and the migration refuses to apply.
8. **Shipped browser walks break on renames.** `chat-parity-walk.spec.ts:209` asserts the queue's
   terminal word `'Filed'`; `ComposerAttachmentControl:58`'s `IN_FLIGHT` set keys on exact state
   strings. #633's cancel/remove split touches both.
9. **`serve-built.mjs` is one server for every walk, and three member reads are answered in its
   CORE dispatcher** — adding mutable fixtures there is a shared-core handover, exactly what
   `e2e-fixture-ownership.test.ts` exists to catch.
10. **Census suites red on files nobody touched.** Budget one whole `apps/web` unit run (~5 min) per
    branch before its final report, plus `operation-census` and `rig-isolation` for any SQL-adding
    slice.
11. **No hosted evidence exists for anything in this wave**, and #631's provider-eval run is void
    until #836 is fixed. Every report writes "hosted evidence pending"; no worker claims otherwise.
12. **Three historical rows across the wave are REDESIGN-dispositioned** — their cited guards are the
    *existing* instruments, not fresh measurements. Copying their `path:line` evidence forward as
    "verified" is exactly what those row headers forbid.
13. **A skipped frontier-gated battery is not evidence** (rule 7). Several existing batteries
    (`f-a4-pr2a-*` behind `prepayGate`) skip clean and call their evaluator through `rootQuery` —
    the **Postgres owner**, never an app role. New batteries must call through `humanQuery` personas
    or they repeat the defect they were written to close.
