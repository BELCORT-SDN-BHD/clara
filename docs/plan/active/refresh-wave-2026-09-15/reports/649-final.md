# #649 — create a client and continue accounting onboarding · final report

**Branch** `impl/649-client-onboarding` · **worktree** `C:\Users\zhant\Desktop\clara-wt\649` · rig PG **55508** / `clara_649` (**194** migrations after 0204) · Playwright **3300/3301/3302**. All evidence is **LOCAL**; **hosted evidence pending**.

```
baaf48fe test(web): the first client-creation browser walk, plus CONTEXT.md and the two READMEs
b18ee47d feat(web): the identity candidate face, the fy-end Field, and the two client-Home data seams
ddff3d01 fix(db): 0204 — the >=2 refusal carries the candidate ROWS, not bare ids
471f04fb test(runtime): the SST park is STILL announced today, recorded as the successor's owed red
56d90892 feat(db): 0204 — client identity candidates + the onboarding-facts settle door
```

**The interrupted attempt left nothing.** `git status` clean, `git log origin/main..HEAD` empty, `git stash list` empty, no untracked files. Nothing kept, nothing discarded.

## Acceptance criteria

| AC | State | Evidence |
|---|---|---|
| **AC1** duplicate/ambiguous identity + scope | **done** | `clara.client_identity_candidates(text,jsonb)` (0204 §3), admin floor, firm from the session, EXECUTE to `clara_authenticated` only. Cells `p649.identity.{family,wall_two,arity_one,floor,census_replay}`. Face: `add-client-candidates.test.tsx` (5) + `client-create-walk.spec.ts` (4). Scope preservation **verify-only, re-measured**: `client-scope-invalidation.test.tsx` 9/9 |
| **AC2** ask-only-missing / canonical record / Knowledge / resume | **partial, by design** | (a) ask-only-missing + H-52 → **successor contract only; closes at the `clientOnboarding_v5` cut** — not claimed fixed. (b) Knowledge **verify-only** (`knowledge-onboarding-promotion` 13/13) **+ the new seam**: `client-identity-band-knowledge.test.tsx` (5). (c) canonical record **done**: `clara.settle_client_onboarding_facts(uuid,int,int,text)`, `p649.settle.{fy_end,clr38,replay_isolation}`, `onboarding-field-composition.test.tsx` (8). (d) resume **verify-only, re-run**: `interview-kill-resume-e2e.mjs` **exit 0** on this rig |
| **AC3** first-year vs deferred + opening link | **done (the link)** | `openingStory()` reads the two item keys the DB reads by name; `client-onboarding-progress-opening-link.test.tsx` (5) — link on the deferred branch only, honest sentence on first-year, retired by a finalized seed. `accounting_work.purpose` **not widened** (DECISIONS §1.3) |
| **AC4** stale / concurrent / cancel / revocation | **verify-only, re-measured** | `wb-o-lifecycle.test.mjs` O1–O7 green under real per-role users. On the NEW surfaces: draft preserved across a refusal (candidate face — walk + unit), across a validation failure (fy-end Field), and `p649.settle.replay_isolation` (two concurrent settles → one receipt, one write, sibling client untouched) |
| **AC5** reach Home; no blanket ritual | **partial, as briefed** | `seed_decision_plan_state` seam built and read (`coa-seed-decision-state.test.tsx`, 6). The open-plan chart refusal (0173:8-16) is **intended** and the new copy explains it rather than removing it. A needs-you row kind is **out of scope** (DECISIONS §1.6) |
| **AC6** states / 320px / zoom / keyboard / SR / motion / URL-Back / drafts | **done on the surfaces I own** | `client-create-walk.spec.ts`: 320px + 200% zoom + `prefers-reduced-motion`, keyboard-only path, focus **returns** to the trigger on Escape, Back returns to `/clients`, 2 axe scans. `OnboardingItemRow`'s resolve/amend re-composed onto `Field` with `aria-invalid`; four-parameter door call unchanged (`onboarding-amend-and-chart.test.tsx` 12/12 still green). `InterviewRunCard` re-composition **out of scope** — owner #633; **named residual** |
| **AC7** least-privileged roles + real World | **done** | New battery calls every door under test through `humanQuery` personas (admin/bookkeeper/viewer) and `roleQuery(clara_runtime)`; `rootQuery` appears only for the catalog census and fixture planting. `interview-e2e.mjs` **exit 0** on a real in-process WDK Postgres World |

## Historical rows

| Row | State | Evidence |
|---|---|---|
| **UI-21** full-screen onboarding | **NOT re-measured — named residual** | The altitude leg belongs to `interview-walk.spec.ts`, which runs only under `e2e/live-stack/run-live-walk.mjs` (docker + PostgREST + a `clara_rt_test`-named DB it provisions). This rig has the cluster but no docker/PostgREST, so an arm authored there could not be run — I did **not** ship an unverified one. Follow-up filed below |
| **CB-AE2E-024 / H-51** Add Client | **verify-only + extended** | `add-client-control.test.tsx` **7/7** (the named question/keyboard/format/count/focus regressions), plus the new candidate face and the first browser walk of the control |
| **H-50** stale page head | **verify-only, re-measured** | Structurally absent (layout renders no chrome). Announce→re-read chain green: `onboarding-progress-sync` 3/3, `client-workspace-overview` 12/12, `client-scope-invalidation` 9/9 |
| **H-52** SST number still asked | **live and unfixed — successor contract only** | `p649.interview.sst_park_today` in `interview-e2e.mjs` asserts the park **is still announced today** and is meant to go red at the cut |
| **COA before cancelled onboarding** | **verify-only; owed count is hosted** | Recurrence closed by 0173; `coa-template-pr-b.test.mjs` green. The row's own instruction is a hosted COUNT first — **hosted evidence pending**; no repair migration |

## Tests and commands

- **DB battery, 29-gate chain** (`node --test --test-concurrency=1 $GATES tests/client-onboarding-identity.test.mjs`, gates copied verbatim from `packages/db/package.json`): **9 tests, 9 pass, 0 fail, 0 skipped**. **Red first**: the identical file before 0204 → **9 fail**, every one on "the 0204 cohort is required for a focused run".
- `operation-census` **10/10**; `rig-isolation` (no reset flags) **21 tests, 20 pass, 1 skip** (the destructive T19 cell, as RIG.md requires).
- Re-measurement chain: `wb-o-lifecycle` + `knowledge-onboarding-promotion` + `coa-template-pr-b` → **75 tests, 75 pass, 0 fail**.
- **Runtime World legs, both on this rig, both exit 0**: `node tests/interview-e2e.mjs` and `node tests/interview-kill-resume-e2e.mjs`. `check-parts-parity.mjs` **OK**; `check-frozen-workflows.mjs` **OK** (281 frozen files).
- **Whole `apps/web` suite** (`node scripts/run-tests.mjs`): **3748 tests, 3746 pass, 0 fail, 2 skipped** — both pre-existing live-provider-gated auth cells. `thread-live-clarify.test.tsx` did **not** flake in the whole run and is **2/2** in isolation. #707/#693 not touched.
- **Playwright** `client-create-walk`: **4 passed (59.7s)**, exit 0.
- `pnpm typecheck` (worktree root) **exit 0**; `pnpm lint` (worktree root) **exit 0**.

## Docs

`packages/db/README.md` (new section: the granted-wrapper/ungranted-core idiom and the census enforcing it, the three arities, the day-as-parameter ruling, the CLR38 posture, the named birth-door residual) · `packages/db/tests/README.md` · `apps/web/README.md` (new "Creating a client…" section) · `CONTEXT.md` (**Client onboarding plan**, **Client identity candidate**, **Opening position**, each with its Avoid).

**Blueprint drift (not edited, per WORK-ORDER §5):** `docs/ARCHITECTURE.md:171` states the version pins as `chatTurn → chatTurn_v19`、`claraWork → claraWork_v3` only. It omits `clientOnboarding → clientOnboarding_v4` today and goes stale the moment the wave's `clientOnboarding_v5` lands.

## Successor contract — `clientOnboarding_v5`

New sibling `packages/runtime/workflows/interview.v4.questions.ts`, exporting
`CLIENT_SEGMENTS_V4` built by **flat-mapping over `CLIENT_SEGMENTS_V3`** and replacing only changed segments **by reference** (the discipline `interview.v3.questions.ts:107` states and `coa-interview-v4.test.mjs` asserts). Three changes:

1. **H-52** — `sst_no` gains `appliesTo: (prior) => prior["sst_regime"] !== "not_registered"`. Exactly the shape `interview.v2.segments.ts:375` already uses; `segmentApplies` (`interview.v2.core.ts:246`) is the only mechanism and needs no change.
2. **The fy-end day** — a `fye_day` segment emitted immediately **after** `fye` (flat-map on that one key): `{ key: "fye_day", question: "Which day of that month is the client's financial year-end? (1–31 — Clara does not assume month end)", requiredForCommit: false, skippable: false, validate: <integer 1–31, refused against prior["fye"]'s own month length>, toItems: (v, seg) => [{ item_key: "fye_day", item_kind: "capture", question: seg.question, answer: v, state: "answered", required_for_commit: false }] }`. **`required_for_commit` stays FALSE** — `commit_client_onboarding`'s gate is a live ceremony and making the day a commit prerequisite is a product change nobody ruled; the day is still asked, and the web form remains its transport until #654's `financial_year_end_day` key lands through 0205. If the orchestrator wants it gating, that is a one-word change and should be an explicit ruling.
3. **Known-facts pre-read** — one new sibling step module, run before the segment loop, seeding `prior` from `clara.get_knowledge_pack` (0192, already granted to `clara_runtime`) plus the plan's own answered items, with a `knownApplies` guard beside `segmentApplies` so an answered fact is "an absent question, not an unanswered one". **A knowledge record that DISAGREES with current truth must be able to say *known, confirm*, not only *known, skip*.**

Registry: import + export `clientOnboarding_v5`, repoint `registry.ts:264` and `:908`; keep v1–v4 exported and in `workflowBodies` (the stranded-body gate refuses **database-wide** otherwise). `interviewRoutes.ts` needs no edit. **No door call, no refusal map, no part kind, no `WORK_ACCEPTED_PURPOSES` widening.** At the cut, flip `p649.interview.sst_park_today` to assert **no** `sst_no` park and no `sst_no` plan item — that flip is H-52's evidence.

## Assumptions (for orchestrator review)

1. **0204's `name_family_collision` detail carries the candidate ROWS, not bare ids** (commit `ddff3d01`). The brief said "candidate ids in `detail`"; ids alone leave the refused face either printing uuids or issuing a second read of the fact it is reporting. Each row still carries its `id`. The migration was re-applied from a true prestate on the rig to do this (it is unmerged; an applied migration is never edited).
2. **A blank fy-end pair does not block Commit and calls the settle door not at all.** Gating the commit ceremony on the new field would have changed `onboarding-checklist*.test.tsx`'s existing commit cells, and sending a null day would manufacture `fy_end_day_required` for a value the human deliberately withheld. A **partially or wrongly** filled pair does block.
3. **The settle door is bookkeeper-floored** (matching `set_client_fy_end`), not admin. The commit that precedes it is admin-floored anyway.
4. **The two runtime World legs ran on `clara_rt_test`, a `CREATE DATABASE … TEMPLATE clara_649` clone on the same cluster** — not on `clara_649` itself. Both e2es are hard-gated to `PGDATABASE ∈ {clara_rt_test, clara_wave_b_ci}`, so the brief's literal command (`PGDATABASE=clara_649`) cannot run; a second from-scratch chain would trip 0154's cluster-wide role-count pin (0160 mints two more `clara%` roles), which is exactly why CI uses a template copy. The clone is still on the cluster.
5. **The e2e lane mock scopes `begin_client_onboarding` by NAME** and is hooked **before** the P6-5 lane, which answers it for every name. Both claimants are declared in `SHARED_RPC_VERBS`.

## Follow-ups worth filing

1. **UI-21's altitude leg has no runnable home on an implementation rig.** `interview-walk.spec.ts` only runs under the live-stack runner (docker + PostgREST). Either give that runner a docker-free path, or move the altitude/focus/Back assertions into a mock lane that owns the rail and the full-screen thread. Until then the row is re-measured by nobody.
2. **The fy-end DAY is not in Knowledge.** It lands on `clara.clients` and nowhere else. #654 owns `knowledge_keys`; a `financial_year_end_day` key + map row through 0205 closes it.
3. **The ≥2 wall lives at the candidates READ, not inside the birth door.** `begin_client_onboarding` still succeeds at any arity (`p649.identity.direct_birth_residual`). Closing it needs a NEW birth verb (its 2-arg signature is censused by name and a defaulted third parameter is an overload `0103:1055-1070` refuses).
4. **`InterviewRunCard` is still pre-`Field`** — owner #633; AC6's re-composition stops at this ticket's own surfaces.
5. **The COA-before-cancelled-onboarding count is hosted work** and must precede any repair migration.

## Unverified

Everything hosted. The hosted database's frontier, its actual `name_family_*` ACLs, and the COA/cancelled-onboarding affected-row count were not measured — **hosted evidence pending**. UI-21's keyboard/focus-return, typed-data survival across the altitude change, and its 320px/200% legs are **unverified** for the reason in follow-up 1.
