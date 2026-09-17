# Wave 2026-09-15 integration — the twelve merges, the from-scratch chain, the gates

Branch `integration/wave-2026-09-15` @ **`017440fd`**, worktree
`C:\Users\zhant\Desktop\clara-wt\int`, base `origin/main` (`4464e471`). Worktree clean;
**nothing pushed, no PR, no ticket worktree touched.** 142 commits ahead of `origin/main`
(12 merge commits, 125 inherited from the twelve branches, 5 integration fixes).
310 files changed, +77,345 / −478.

Rig: **`rigint`** `127.0.0.1:55600`, database **`clara_int`**, created fresh for this run —
never migrated before, so 0154's cluster-global `clara%` role census (`= 14`) is honest
(measured 0 `clara%` roles before the chain, PG **17.11**). No reset flag and no role-sweep
flag was ever set. Every number below is **LOCAL**; **hosted evidence: none, anywhere in this
wave.**

---

## 1 · Merges, in migration order (no-migration branch first)

| # | merge sha | branch (tip merged) | migration | conflicts |
|---|---|---|---|---|
| 1 | `21a3f2d6` | `impl/633-document-intake` (`da5c3f1a`) | — | **none** |
| 2 | `2d17ab95` | `impl/650-client-home-work` (`e9deacae`) | 0199 | **none** |
| 3 | `12c10d57` | `impl/647-counterparty-identity` (`bda62a1d`) | 0200 | 4 files |
| 4 | `a2b5d124` | `impl/639-asset-acquisition` (`693f8899`) | 0201 | 6 files |
| 5 | `ca8cd54b` | `impl/646-document-correction` (`255559cb`) | 0202 | 6 files |
| 6 | `a08a6979` | `impl/648-firm-setup` (`dcc7c94a`) | 0203 | 6 files |
| 7 | `e6638192` | `impl/649-client-onboarding` (`22d283c3`) | 0204 | 8 files |
| 8 | `165cce0f` | `impl/654-firm-defaults` (`1251e374`) | 0205 | 13 files |
| 9 | `6123efbe` | `impl/638-staff-claim` (`a26e4dd0`) | 0206 | 8 files |
| 10 | `6519dbf5` | `impl/652-accrual-adjustments` (`f917c4ae`) | 0207 | 9 files |
| 11 | `266a2b09` | `impl/653-prepayment-amortisation` (`6252a08d`) | 0208 | 12 files |
| 12 | `e83967d0` | `impl/625-membership-lifecycle` (`241acf74`) | 0209 | 7 files |

`git merge` throughout (never rebase), so every reviewed SHA on every branch is preserved and
reachable. `git ls-files --eol` over the whole changed set: **no CRLF**. No branch edited
`docs/PRD.md` or `docs/ARCHITECTURE.md` (measured: `git diff --name-only origin/main -- docs/`
is empty).

---

## 2 · Conflict resolutions — what was kept, file by file

Seventy-nine conflicted files across the ten conflicting merges. Grouped by file, because most
files conflicted repeatedly and the rule applied was the same each time.

### Shared registration files — unions at the sorted position

**`apps/web/e2e/e2e-fixture-ownership.test.ts`** (conflicted in 6 of 12 merges; the wave's
single hottest file). `LANE_MOCKS` is ASCII-sorted and the auto-merge twice landed a name out of
order (`accrual-mock.mjs` after `activity-mock.mjs`, `prepayments-mock.mjs` after
`staff-expense-claim-mock.mjs`); both repaired by hand. Final: **25 lane mocks, 25
`LANE_DECLARATIONS` rows, derived set matches `serve-built.mjs`'s own import block exactly.**
`SHARED_RPC_VERBS`: `get_document_state` folded to the four-lane union
(`document-correction`, `documents-intake`, `documents-viewer`, `work-list`);
`list_spoken_for_documents` to the four-lane union (`accrual`, `documents-intake`,
`journal-work`, `periodic-adjustment`), both comment blocks kept. #646's rewritten
`knowledge-mock.mjs` row (which adds `list_firm_knowledge` as unscopeable) replaced the
identical #644 row it was derived from and #647's row was kept beside it.

**`apps/web/test/manifest.txt`** (3 merges). Plain-string sorted union — the file is sorted as
a whole, header comments included, so the resolution is literally `sorted()`. **40 new entries,
440 total, sorted, no duplicates.**

**`apps/web/messages/en.json`** (4 merges). Union with no duplicate key anywhere (verified with
a strict `object_pairs_hook` parser, not `JSON.parse`, which would have hidden one). Top-level
order is semantic, not alphabetical, so unions were appended at the conflict site.

**`packages/db/tests/rig-meta.mjs`** (7 merges). Cohort rows and `cohortFailures(...)` calls
unioned in **migration order**, never merge order. The `];`-swallowing hazard the last two waves
hit did not recur: the module imports cleanly (82 exports) and all **eleven** wave cohorts are
present (`CLIENT_WORK_PACK_0199` … `PREVIEW_INVITE_0209`); #633 ships none by design.

**`packages/db/package.json`** (9 merges). The preintegration-gate `--import` chain is ordered by
**migration number, not alphabetically** (#625's own report states the rule). #647's branch had
inserted its gate next to `counterparty-alias-kind` in the middle; it was **moved to migration
position**. Final chain: **39 gates**, ending
`… firm-document-limits · client-work-pack (0199) · counterparty-identity (0200) ·
fixed-asset-acquisition (0201) · document-source-revision (0202) · firm-setup (0203) ·
client-onboarding-identity (0204) · knowledge-firm-defaults (0205) · staff-expense-claim (0206) ·
accrual-adjustments (0207) · prepayment-0208 · preview-invite (0209)`.

**`apps/web/e2e/serve-built.mjs`** (5 merges). Import block and dispatch chain unioned, and two
lanes were placed where their own headers *require* rather than where the merge put them:
#649's `client-create` lane **before** the P6-5 lane (which answers `begin_client_onboarding`
for any name) and #625's `members-lifecycle` lane **before** this file's own three CORE member
branches (a declared handover). Verified after merge: **25 lane imports, no duplicate, and the
dispatch order holds** — members-lifecycle `:424` < CORE `caller_context` `:553`;
client-create `:652` < P6-5 `:653`; firm-setup `:698` < the generic `get_firm_setup` default
`:771`; fixed-asset `:704` < home-board `:714`. #639's `viewer@` rank-0 persona branch and
#648's default `get_firm_setup` response both survived intact, as did #639's additive
`getElementById` in `apps/web/test/domInspect.ts`.

**`.github/actions/db-live-gates/action.yml`** (2 merges). Union in each ticket's stated order.
Final leg order ends: … fixed-asset (#639) → staff-expense-claim (#638) → work-egress →
chat-turn-v19 → two-build → plan-occurrence → accrual (#652) → prepayment-occurrence (#653) →
**#637's world guard LAST**. All five new legs present; YAML parses; **no dangling `\`
continuation** (the defect #653's own CI edit hit once).

**`CONTEXT.md`** (4 merges). Both term groups kept every time. One real collision: **#652 and
#653 each minted a `Service period` term.** Folded into one entry carrying both halves (the
span, the document anchor, its supersede-never-mutate grain) and the union of both `_Avoid_`
lists — **105 terms, 105 unique.**

### Owned files — the owner's version, with the other side's one-liner grafted

**`apps/web/components/documents/document-admin.tsx`** and
**`components/documents/document-kind-dialog.tsx`**. #646 *moved* the document-kind change out of
`DocumentAdmin` into its own exported dialog (so #633's list/receipt surface can mount the same
component); #633 had, on its own branch, replaced that control's raw enum tokens with the phrases
`lib/documents/kind-label.ts` owns. Taken: **#646's version of the surface** (the move is the
owner's), with **#633's `renderKindLabel` one-liner grafted into the new home**. See §6 fix 1 —
this was the only conflict where the text merge produced a *green* tree with a lost behaviour.

**`apps/web/components/documents/document-detail.tsx`.** #646's shape (the `SourceCorrectionBand`
above the tab strip, its rewritten #624 comment), with #633's `showWorkLinks` prop on
`DocumentStatePanel` kept.

**`apps/web/lib/navigation/tree.ts`** (4 merges). `ClientLeafId` reflowed as a union of all
members; leaf rows, href builders and `ClientItemId` members unioned. `SETTINGS_SECTIONS`
auto-merged to **seven** sections in the order `account, firm, members, knowledge (#654),
setup (#648), compliance, vendorBindings`; every dependent count was then re-derived (§6 fix 2).

**`apps/web/lib/command/routes.ts` / `routes.test.ts`** (2 merges each). Keyword rows and route
patterns unioned; the ⌘K route census literal repaired (§6 fix 2).

**READMEs.** `apps/web/README.md`'s Client and Settings rows are one table cell each and every
lane appended to them: the merged Client row now carries #650's Home-board parenthetical,
#647's `/knowledge/parties/:counterpartyId`, #639's `/registers/assets/:assetId`, #638's
`/accounting/claims`, #652's `/accruals` and #653's `/prepayments`, spliced at the anchor the
two sides share rather than one side winning. `packages/db/README.md`,
`packages/db/tests/README.md` and `packages/runtime/README.md` are section unions in migration
order; `tests/README.md`'s shared anchor line ("Database cleanup and cluster-role cleanup must
account for other live test connections.") appears **once**.

---

## 3 · The from-scratch chain on a cluster that had never seen a clara migration

```
pnpm db:migrate  → 204 applied (0001 … 0209), exit 0, 118 s
pnpm db:seed     → 2 seed files, exit 0
pnpm db:migrate  → 0 new migration(s) applied · 204 total, exit 0
```

**204 = 193 (at `4464e471`) + 11** — exactly the eleven this wave numbered. Every migration's own
prestate pins and tail assertions ran and passed inside the chain; nothing was edited, weakened
or re-pinned, and no migration file was touched at any point during integration.

**The hazard DECISIONS §3.3 (2) and WAVE-DIGEST §5 both named did not fire.** 0201 (#639 T.5) and
0206 (#638 §0) pin the `clara._subledger_on_approve` caller roster independently, by
whole-schema regex, and a sibling body that merely *names* the hook trips 0206's prestate. On the
merged chain 0206 printed, verbatim:

> `#638 tail OK (2/7): the subledger-hook caller census is byte-identical to the six measured
> before this migration ran — 0206 adds no caller`

and `#638 tail OK (1/7)` confirmed both purpose CHECK texts byte-identical to 0194 with the six
non-regression bodies unchanged. **No roster string was re-issued.**

---

## 4 · Gates, from the integration worktree root

| gate | exit | evidence |
|---|---|---|
| `pnpm typecheck` | **0** | `packages/runtime` Done, `apps/web` Done |
| `pnpm lint` | **0** | freeze-lint + 13 sibling checkers + eslint + every workspace's own lint |
| `node scripts/check-frozen-workflows.mjs` | **0** | **281 frozen files** verified append-only vs `origin/main`; **51** `"use workflow"` modules all frozen+registered |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **0** | reader ⊇ emittable; emittable = 6 kinds, allowlist = 3, full census printed |
| `node scripts/check-worker-paths.mjs` | **0** | 2 spawn sites through `resolveLibWorker`; **built** bundle verified against the deployed layout |
| `node scripts/check-workflow-bundle.mjs` | **0** | 12 pinned classes with their WDK directives, no superseded pin survives, 51 superseded bodies still ship, chatTurn pinned at **v19**, 40 checks |
| `pnpm --filter @clara/runtime build` | **0** | nitro build Done |
| `pnpm build` (whole repo) | **0** | see the note below |

**`pnpm build` needed one piece of local rig setup, not a repo change.** The fresh integration
worktree had no `apps/web/.env.local`, and `apps/web/scripts/check-public-key.mjs` refuses to
build without a publishable/anon `NEXT_PUBLIC_SUPABASE_ANON_KEY` — by design, so a secret can
never be inlined into a browser bundle. `.env.local` is `.gitignore`d (`.gitignore:6`); it was
copied from the main checkout and the build then ran green (Next compiled in 18.9 s, TypeScript
in 22.9 s). Recorded because any freshly created worktree will hit the same wall.

---

## 5 · Counts (all LOCAL)

### 5.1 · db — `rigint` 127.0.0.1:55600 / `clara_int`, chain 0001…0209, the exact **39** gate flags from `packages/db/package.json`, **no reset flags**

**The twelve tickets' own batteries — 237 tests, 237 pass, 0 fail, 0 skip.**

| battery | ticket | pass/fail/skip |
|---|---|---|
| `document-intake-capabilities` | #633 | 6 / 0 / 0 |
| `document-intake-noncoding` | #633 | 4 / 0 / 0 |
| `document-intake-receipts` | #633 | 4 / 0 / 0 |
| `rig-docs-isolation-grants` | #633 | 12 / 0 / 0 |
| `unassigned-intake-reuse` | #633 | 6 / 0 / 0 |
| `client-work-pack` | #650 | 13 / 0 / 0 |
| `counterparty-identity` | #647 | 19 / 0 / 0 |
| `fixed-asset-acquisition` | #639 | 21 / 0 / 0 |
| `rig-docs-source-revision` | #646 | 16 / 0 / 0 |
| `firm-setup` | #648 | 17 / 0 / 0 |
| `client-onboarding-identity` | #649 | 13 / 0 / 0 |
| `knowledge-firm-defaults` | #654 | 21 / 0 / 0 |
| `staff-expense-claim` | #638 | 24 / 0 / 0 |
| `accrual-adjustments` | #652 | 21 / 0 / 0 |
| `prepayment-schedule` | #653 | 18 / 0 / 0 |
| `prepayment-occurrences` | #653 | 10 / 0 / 0 |
| `preview-invite` | #625 | 12 / 0 / 0 |

**The estate / census suites the wave-2 lessons name — 492 tests, 489 pass, 0 fail, 3 skip.**

| battery | pass/fail/skip | | battery | pass/fail/skip |
|---|---|---|---|---|
| `operation-census` | 10 / 0 / 0 | | `document-capability-registry` | 16 / 0 / 0 |
| `rig-isolation` | 20 / 0 / **1** | | `document-fact-validation-belt` | 8 / 0 / 0 |
| `checkout-gate-c3` | 69 / 0 / 0 | | `document-filing-conflict` | 5 / 0 / 0 |
| `work-journal-post` | 32 / 0 / 0 | | `knowledge-records` | 27 / 0 / 0 |
| `work-journal-admission` | 20 / 0 / 0 | | `knowledge-onboarding-promotion` | 13 / 0 / 0 |
| `work-cancel` | 42 / 0 / 0 | | `rig-runtime-visibility` | 8 / 0 / 0 |
| `accounting-plans` | 20 / 0 / 0 | | `counterparty-alias-kind` | 28 / 0 / 0 |
| `accounting-plan-occurrences` | 15 / 0 / 0 | | `coding-lane-evidence-link` | 8 / 0 / 0 |
| `periodic-adjustment` | 19 / 0 / 0 | | `chat-clarify-expiry` | 10 / 0 / 0 |
| `close-closing-stock-producer` | 4 / 0 / 0 | | `x42b0-r7-s5-census / -clock / s5c-clock` | 4+4+4 / 0 / 0 |
| `rig-docs-filings-provenance` | 7 / 0 / 0 | | `x42b2-r7-s5-census / -clock / s5c-clock` | 2+2+2 / 0 / 0 |
| `rig-docs-attribution` | 8 / 0 / 0 | | `x42b2-af2-rebook4` | 0 / 0 / **1** |
| `rig-docs-correction` | 10 / 0 / 0 | | `x42b3-af2-rebook4` | 2 / 0 / 0 |
| `rig-docs-download-door` | 21 / 0 / 0 | | `f-a7-beta-filing-verb` | 47 / 0 / **1** |

The three skips are all by design and none is used as evidence: `rig-isolation`'s **T19**
poison-role cell (destructive; `CLARA_RIG_ALLOW_RESET` deliberately never set),
`x42b2-af2-rebook4`'s dormant AF-2 cell (0037/0038/0040 bank substrate absent) and
`f-a7-beta-filing-verb`'s one 0011-dependent cell. **`rig-isolation` T10b, which #652 and #653
both reported red on their own rigs, is GREEN here** — confirming their reading that it was
WDK-world contamination of rig state and not the migration.

The five filing-lane regressions (`rig-docs-*`, `f-a7-beta-filing-verb`) were run because #654's
`t_document_filings_firm_knowledge` now takes a lock on that path; its own fix round 2 named
them and they hold on the merged chain too.

### 5.2 · web — whole `apps/web` unit suite, `node scripts/run-tests.mjs`

**4098 tests · 4095 pass · 1 fail · 2 skip · 276 s.**

The one fail is `lib/clara/use-clara-thread-stop.test.ts` cell **630** ("a stop the door says had
ALREADY FINISHED does not re-attach") — a file this wave does not touch, and a **named known
flake** (DECISIONS §3.3 item 6). Re-run in isolation **twice: 25/25 both times.** Not fixed, not
hidden: named. The 2 skips are the env-gated `live-provider-auth` cells.

Census suites, re-run individually at the tip because the digest named them as the merge's
blind spots: `firm-scope-fourth-entrance` **21/21** · `firm-scope-surfaces` **35/35** ·
`require-firm-scope` **58/58** · `firm-scope-db-pins` **22/22** · `sql-oracle` **25/25** ·
`parity-holes` **7/7** · `e2e-fixture-ownership` **16/16** · `tree.test.ts` **27/27**.

### 5.3 · runtime — unit only

`accrual-basis-unit` + `counterparty-identity-unit` + `fixed-asset-acquisition-unit` +
`prepayment-schedule-basis-unit` + `staff-expense-claim-unit`: **58 / 58**.
`work-journal-db` (against `clara_int`): **23 / 23**. `p6-1-parts-parity`: **22 / 22**.

---

## 6 · The integration fixes — five commits, each red first

**1 · `b269d18f` — `fix(web): #633 x #646 — the kind phrases follow the control #646 moved`.**
The only conflict whose text merge produced a green *tree* with a lost *behaviour*. #646 moved
the document-kind control into `document-kind-dialog.tsx`; #633's phrase rendering stayed behind
in the file the control left. **Measured red first:**
`components/documents/document-kind-labels.test.tsx` was **3 pass / 2 fail** at the merge tip —
the dialog rendered "Current: ssm_company_doc" and offered the DB enum as option labels. With
#633's `renderKindLabel` one-liner grafted into #646's dialog and the two cells re-pointed at the
surface that carries the control today: **5/5**. Control: reverting *only* the graft puts it back
to **3/2**, so the graft is the load-bearing half, not the re-pointing. The dialog keeps the
**full** kind roster; #633's own list/receipt entrance keeps its `consent_evidence` exclusion,
which #633 recorded as a deliberate difference.

**2 · `5683046d` — `fix(web): #638's client leaf resolves, #639's is retired`.** #652 shipped a
`resolveActive`-walking wall in `tree.test.ts` — every `CLIENT_LEAVES` row must be one the
resolver can actually produce, typed `Record<ClientLeafId, string>`. Wave integration is the
first moment that wall and #638's / #639's leaves shared a tree, and it caught **two dead
leaves**, both dead on their own branches too:
* **#638** registered `staffExpenseClaim` and its label but no `leafFor` arm. It gains the arm,
  in the exact shape of its two siblings (`accounting/journal/new`, `accounting/adjustments/new`).
  **Red first:** without the arm the wall is **26 pass / 1 fail** naming `staffExpenseClaim`;
  with it, **27/27**.
* **#639's `fixedAsset` is RETIRED**, not repaired, for the reason #652 wrote two rows below for
  its own `/accruals`: the path's first segment is `registers`, a top-level `ACCOUNTING_ITEMS`
  segment, so `resolveActive` answers that list on `rest[0]` alone and returns before `leafFor`
  is reached. The route, `fixedAssetHref` and every link into it are untouched; what the asset
  detail does not get today is its own crumb, and giving it one means teaching `breadcrumbFor` to
  read a leaf under `accountingItem` (it only reads one under `clientItem`). That is a nav change,
  not an integration repair — filed as a follow-up, with the message key left in `en.json` for it.

**3 · `114c30f7` — `fix(web,docs): two merge unions that broke a literal`.**
`SHARED_RPC_VERBS` ended the merge with `record_client_resolution` declared **twice** (#646's arm
and #633's arm, each a legitimate union at its own merge). TS1117 caught it; at runtime the
second would have silently won and #646's claimant would have gone unmeasured. Folded to one row
with all three claimants. And `CONTEXT.md`'s duplicate `Service period` (§2).

**4 · `d352e964` — `test(db,web): three cross-branch censuses answered with named reasons, not
widened`.**
* **`p654.census.not_a_posting_grant`** — "no function outside the knowledge cohort reads
  `clara.knowledge_records`". On the merged chain two do: `clara.get_firm_setup()` (#648, 0203)
  and `clara.list_source_dependents(uuid)` (#646, 0202). Both are named in a
  `READ_ONLY_CONSUMERS` map **with what they do**, and the cell now MEASURES the claim on each
  live body: present in the catalog (a dead exception fails), no INSERT/UPDATE/DELETE against the
  relation, not VOLATILE. The DML predicate carries its own **positive control** against
  `clara._knowledge_insert_revision`, this schema's one real writer, so a loop that cannot
  recognise a writer cannot pass. **21/21** (was 20/1).
* **`SHARED_RPC_VERBS`** — `set_document_kind` is answered by two lanes now (§6 fix 1's move).
  Each gates on ids it minted; declared share.
* **`CORE_RELATION_HANDOVERS`** — `caller_context` has a second static claimant, #633's intake
  lane. **Measured: it never runs** — `serve-built.mjs` answers `caller_context` in its own CORE
  at `:553` and only reaches the intake lane at `:645`, on #633's branch as much as here.
  Declared with the measurement rather than deleted (the intake transport is #633's to own,
  DECISIONS §1.7); removing the dead branch is a follow-up. **`e2e-fixture-ownership` 16/16**
  (was 14/2).

**5 · `017440fd` — `test(db): the S5.25 clock censuses learn this wave's twenty-two names`.**
Arms (B) and (D) are forward ratchets and neither had seen 0199…0209, so four cells (plus their
b0 forks) went red. Measured on the from-scratch chain by running each arm's own detector over
the live catalog and diffing — not read off the migration files.
* **Arm (D)** (bare clock token), **eight stem-gated cohorts, fifteen names**, every one stamping
  or comparing an INSTANT: row stamps (0201 `_fa_complete_particulars_core`, 0202
  `dismiss_orphaned_classification_question`, 0203's four setup writers, 0206
  `_claim_resolve_claimant`), the lawful as-of argument (0206 `_assert_claim_basis` →
  `_adv_enrolment_at(…, now())`), display conversions (0200's three reads), one sampled instant
  (0199 `get_client_work_pack`), an expiry comparison (0209 `preview_invite`). **0204, 0207 and
  0208 add nothing and are named as such**, measured rather than omitted.
* **Arm (B)** (`Asia/Kuala_Lumpur` spelled), **four stem-gated cohorts, seven names, two
  classes.** CLASS 1 spells the zone as a NAME and derives no date (0200's three `to_char`
  display stamps; 0208's `create_prepayment_schedule`, which hands the zone to the plan lane and
  returns it as a key). **CLASS 2 is three READ doors that do derive an MYT date** — 0199's work
  pack and 0205's two knowledge reads. They are **pinned, not recut**, and the reason is written
  where the next reader will argue with it: none is a money date (no posting date, no period
  bound, nothing reaching a ledger row), and `get_client_work_pack` would be made *worse* by
  `clara._book_today()`, whose per-statement sample would split its window bounds from its date
  across MYT midnight — `preview_ocr_sales_evidence`'s own recorded case. **The two knowledge
  reads carry the weaker argument and are escalated as a follow-up, not settled here.**
* Also in this commit: **`p640.schedule.rules`** (#640) pinned the plan-kind roster at the two
  kinds 0193 shipped; 0208 adds `amortisation_schedule`. The cell now **derives** the expected
  roster from `clara.accounting_plans`' own `kind` CHECK and asserts the door's advertised
  `detail.supported` equals it — two different objects that must agree, so neither can move alone
  again — plus a non-vacuity arm that a refused kind is never also listed as supported.
  **accounting-plans 20/20** (was 19/1); the six clock/census files **18/18** (was 14/4).

---

## 7 · Open items, and what was NOT done here

**Not done, by scope:**
1. **The successor cut is not in this branch.** `chatTurn_v20`, `claraWork_v4` and
   `clientOnboarding_v5` + `interview.v4.questions.ts` are still uncut; `frozen-workflows.json`
   is unchanged at 281 files and `check-workflow-bundle` still reports `chatTurn` pinned at
   **v19**. WAVE-DIGEST §4's warning stands: the cut worker must read **each report's own
   stanza**, not DECISIONS §1.1's summary, or #647's `record_counterparty_alias`, #652's
   `answer_accrual_term` park and #654's `ask_knowledge_conflict` will be missed.
2. **No browser walk was run at integration** (Playwright ports 3350/3351/3352 unused), and
   **no World e2e leg** — the db estate suite in full, the runtime suite in full and the whole
   browser suite remain CI's / the orchestrator's, as every ticket's report says.
3. **Rig cleanup** (WAVE-DIGEST §5's census — `rig654r` stale, `rig647z`/`rig<n>r` to drop, the
   shared `clara_rt_test` template that accumulates cross-lane state) is untouched. `rigint`
   itself is left up, carrying the merged chain.

**Findings worth an issue:**
4. **The asset detail has no breadcrumb** (fix 2). `breadcrumbFor` reads a leaf only under
   `clientItem`; a leaf under a top-level `ACCOUNTING_ITEMS` segment cannot be produced at all.
   Either teach the crumb builder the `accountingItem`+leaf shape, or accept that `/registers/…`
   details stop at the register. **Today `/registers/assets/:id` with no `?tab=` marks the
   *default* (aging) register row current**, which is worse than no mark.
5. **Two READ doors derive the house MYT date themselves** (`clara.list_firm_knowledge`,
   `clara.get_knowledge_applicability`, both 0205) rather than calling `clara._book_today()`.
   Pinned with the reason; the question is whether a read-side "today" belongs to the authority.
6. **#633's `documents-intake-mock.mjs` carries a dead `/rest/v1/caller_context` handler** —
   unreachable behind `serve-built.mjs`'s own CORE branch. Declared, not deleted.
7. **Two components now answer `clara.set_document_kind`** with different rosters: #646's
   `DocumentKindDialog` (full) on the detail surface and #633's `DocumentKindControl` (excluding
   `consent_evidence`, which the door always refuses) on the list/receipt surfaces. Both are
   deliberate; whether the detail surface should also stop offering a kind the door always
   refuses is a product call nobody has made.
8. **`staff-expense-claim-mock.mjs` carries a private copy of `readCachedJson`** instead of
   importing `mock-dispatch.mjs`. Measured **not** a hazard — byte-equivalent, same
   `request.__e2eParsedBody` cache key, so it interoperates with every other lane — but it is the
   last private body reader in the e2e lane set and the shape wave 2 had to fix once already.

**Unverified:**
9. **Everything hosted.** No hosted run exists anywhere in this wave, and none was attempted here.
10. The **two-build cutover blocker** recorded in wave 3 (`ARCHITECTURE` §10: a Work parked on
    `claraWork_v1`/`_v2` can never post once 0195 is live) is untouched by this wave and still
    unruled. This branch does not change it in either direction.
11. `pnpm build`'s web half is green **only with a local `apps/web/.env.local`** (§4). CI
    supplies its own; a freshly created worktree does not.
