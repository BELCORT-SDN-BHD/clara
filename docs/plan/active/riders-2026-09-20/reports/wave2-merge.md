# Riders wave 2 — integration merge

Worktree `C:\Users\zhant\Desktop\clara-wt\int2`, branch `integration/riders-w2`, cut from the
wave-1 integration head. Lane 01 was already merged when this record opens; lanes 02, 03, 04, 05,
06, 07, 08 and 10 were merged in that order, one `--no-ff` merge commit each. **Lane 09 was NOT
merged** — it was not ready, and its reserved numbers 0265-0268 are the only gap in the roster
below.

Final head: **`8264fa3eee1a2680ce0903b022ec78ad3890f734`**

| # | commit | what it lands |
|---|---|---|
| 01 | `4c02305b0` | merge: riders wave 2 lane 01 (pre-existing) |
| 02 | `d4b93924a` | merge: riders wave 2 lane 02 |
| 03 | `b0bd147c0` | merge: riders wave 2 lane 03 |
| 04 | `04375bb3d` | merge: riders wave 2 lane 04 |
| 05 | `eb6752acd` | merge: riders wave 2 lane 05 |
| 06 | `3b62738f8` | merge: riders wave 2 lane 06 |
| 07 | `37353e230` | merge: riders wave 2 lane 07 |
| 08 | `fccf2d01a` | merge: riders wave 2 lane 08 |
| 10 | `7f95a6ccb` | merge: riders wave 2 lane 10 |
| — | `058e6cc72` | fix(integration): #996's row builder names #974's `authority_id` |
| — | `8264fa3ee` | docs(integration): erratum on lane 05's merge commit message |

Everything below was resolved by the intent of each side traced to its source — the gate modules,
the migration files themselves and the lanes' own reports — never by taking a whole side where
both sides had added something.

---

## Lane 02 — #898 0240, #913 0241, #993 0242, #912 0243

**Conflicted: `packages/db/package.json`, `packages/db/README.md`.**

* **`packages/db/package.json`** — the pre-integration gate chain. UNION of both sides ordered by
  the migration number each gate belongs to. Lane 01's five (`opening-binding-claim` 0235,
  `subledger-hook-caller-roster` 0236, `journal-basis-zero-total-unreachable` 0237,
  `correction-client-rung-order` 0238, `opening-balance-work` 0239) keep their place after 0234's
  `legal-enforcement-mode`; lane 02's four (`fye-day` 0240, `scope-default-drop` 0241,
  `key-grammar` 0242, `audit-actor-role` 0243) follow. Each gate's migration was read off the gate
  module's own header, not guessed. **55 + 4 = 59 tokens, each exactly once.**
  `tests/preintegration-gate-chain.test.mjs` pins the chain as a SET (every gate on disk is
  preloaded, every token names a real file, no duplicate) with a non-vacuity floor — it pins
  neither order nor length, so nothing there needed re-measuring.
* **`packages/db/README.md`** — both sides' sections kept whole, in migration order: lane 01's
  0235-0239, then lane 02's 0243. No section merged into another.

**Auto-merges checked rather than trusted:** `packages/db/tests/rig-meta.mjs` (both lanes appended
a cohort block at the same anchor, `// #1008 END`, and git interleaved them out of order — both
kept, reordered to 0235 #1014, 0239 #984, 0243 #912; the two call-site hunks are in different
functions and did not collide; module load-checked), `apps/web/messages/en.json` (clean union,
5909 + 6 + 3 = 5918, no key added by both sides), `CONTEXT.md` (three entries, each at its own
place in the file's own ordering).

## Lane 03 — #846 0244, #782 0245, #988 0246, and its fix round 0272

**Conflicted: `packages/db/package.json`, `packages/db/tests/rig-meta.mjs`.**

* **`packages/db/package.json`** — UNION; lane 03's one new gate
  (`document-capability-high-water`, 0244) appended after 0243's. **59 + 1 = 60 tokens.**
* **`packages/db/tests/rig-meta.mjs`** — `grantMatrixFailures` gained a bimodal cohort check on
  BOTH sides at the same anchor. Both kept, in migration order (0243's audit actor-role stamp,
  then 0244's capability-registry high-water mark). The two sides shared the block's closing brace,
  so the first block was given its own; neither `if` was folded into the other. Module
  load-checked.

**Done by hand beyond the conflict:** lane 03 had placed its four README sections (0244, 0272,
0245, 0246) BEFORE 0234's, and git kept them there. That breaks the file's own ordering rule — its
chronological tail runs ascending by migration number. The tail was put back into that order:

```
BEFORE: 226 228 229 232 233 234 235 236 237 238 239 243 244 245 246 272 (git's placement was
        226 228 229 232 233 [244 272 245 246] 234 235 236 237 238 239 243)
AFTER : 226 228 229 232 233 234 235 236 237 238 239 243 244 245 246 272
```

Every section moved WHOLE, and the file's line multiset was verified identical before and after the
reorder, so nothing was edited or merged.

**Auto-merges checked:** `apps/web/messages/en.json` (5909 + 9 + 11 = 5929),
`apps/web/components/documents/document-kind-dialog.tsx` (both sides made the SAME one-line repair,
`DOCUMENT_KINDS` → `CLASSIFIABLE_DOCUMENT_KINDS`; identical text, no collision), `CONTEXT.md`,
`packages/db/tests/README.md`.

**Roster note:** lane 03 carries `0272_document_capability_wall_completion.sql` on top of its
reserved 0244-0246.

## Lane 04 — #972 0247, #973 0248, #976 0249, #977 0250, #979 0251

**Conflicted: `packages/db/package.json` only.**

* UNION; lane 04's five gates appended in their own migration order (`fa-birth-watermark` 0247,
  `fa-depreciation-leg-fold` 0248, `fa-particulars-completion-fold` 0249,
  `authority-ref-human-instruction` 0250, `fa-authority-retired-read` 0251). **60 + 5 = 65
  tokens.**

`rig-meta.mjs` did not conflict because lane 04 grouped its five cohorts with the fixed-asset
family (beside 0216's and 0227's) instead of at the tail where lanes 01-03 put theirs. Each lane's
placement was left as its lane wrote it; every cohort is present exactly once and the module loads.
`packages/db/README.md` gained no new section from lane 04 (it appends inside existing ones), so the
tail was still in order. en.json: 5909 + 20 + 3 = 5932.

## Lane 05 — #964 0252, #968 0253, #965 0254

**Conflicted: `packages/db/package.json`, `apps/web/tests/firm-scope-db-pins.corpus.ts`.**

* **`packages/db/package.json`** — UNION; `document-ingest-window-myt` 0252,
  `batch-cancel-reissue` 0253, `intake-refusal-record` 0254 appended in migration order. **65 + 3 =
  68 tokens.**
* **`apps/web/tests/firm-scope-db-pins.corpus.ts`** — the reviewed dynamic-SQL barrier map, whose
  KEY ORDER is load-bearing (the census compares it to the corpus's file-sorted `blockedAt`). Both
  sides had appended after 0234's entry: lane 02's 0240 and lane 05's 0252/0253/0254. All four
  kept, in file-sorted key order. Each side's block ended mid-entry on closing lines the two
  shared, so the first entry was given its own copy of them rather than either being folded into
  the other.

**Auto-merges checked:** `apps/web/test/manifest.txt` (union, plain-string sorted, header
untouched), en.json (5909 + 23 + 1 = 5933), `packages/db/tests/x42-s5-helpers.mjs`,
`packages/runtime/tests/intake-batch-e2e.mjs`, four READMEs and `CONTEXT.md`.

**Erratum:** the merge commit `eb6752acd` names the tickets "#975 0252, #978 0253, #980 0254".
Those numbers are wrong — the migration headers and the lane reports say **#964 (0252), #968
(0253), #965 (0254)**. Nothing in the resolution depended on them (it was done against the gate
modules and the migration files), and the correction is committed as `8264fa3ee` rather than by
rewriting five later merge commits.

## Lane 06 — #894 0255, #895 0256, #891 0257, #934 0258, #935 0259

**Conflicted: `packages/db/package.json`, `packages/db/tests/rig-meta.mjs`.**

* **`packages/db/package.json`** — UNION; `onboarding-plan-firm-uniqueness` 0255,
  `firm-setup-polish` 0256, `firm-setup-applicability` 0257, `firm-setup-user-notes` 0258,
  `firm-setup-education-tips` 0259, in migration order. **68 + 5 = 73 tokens.**
* **`packages/db/tests/rig-meta.mjs`** — both sides appended a cohort block at the same anchor
  (`// #1008 END`). Both kept, in migration order: the branch's 0235/0239/0243 blocks, then lane
  06's #935 0259 firm-setup tip cohort. Its check site in `grantMatrixFailures` merged without
  conflict and is present once. Module load-checked.

**Auto-merges checked:** en.json (5909 + 24 + 7 = 5940), the document-kind dialog (lane 06 makes
the same repair as lanes 01 and 03 — identical text), `CONTEXT.md`, both db READMEs.

## Lane 07 — #974 0260, #998 0261

**Conflicted: `packages/db/package.json`, `apps/web/tests/firm-scope-db-pins.corpus.ts`.**

* **`packages/db/package.json`** — UNION; `depreciation-authority-pending-rowkind` (0260) appended
  after 0259's. **73 + 1 = 74 tokens.**
* **`apps/web/tests/firm-scope-db-pins.corpus.ts`** — again the barrier map: the branch's
  0240/0252/0253/0254 and lane 07's 0260, all five kept in file-sorted key order.

**Auto-merges checked:** `apps/web/test/manifest.txt` — a union WITH a retirement: 495 base lines +
2 (branch) + 1 (lane 07) − 1 (`lib/firm/timeline.test.ts`, deleted by #998 along with
`lib/firm/timeline.ts` when 0261 retired `clara.list_firm_timeline`) = 497, still in exact
plain-string order, no duplicate, header untouched. en.json: 5909 + 31 + 10 = 5947.

## Lane 08 — #840 0262, #843 0263, #861 0264

**Conflicted: `packages/db/package.json`, `apps/web/components/documents/document-kind-dialog.tsx`.**

* **`packages/db/package.json`** — UNION; `activity-successor-link` 0262,
  `operator-support-timeline` 0263, `activity-kind-ladder` 0264. **74 + 3 = 77 tokens.**
* **`apps/web/components/documents/document-kind-dialog.tsx`** — the same
  `DOCUMENT_KINDS` → `CLASSIFIABLE_DOCUMENT_KINDS` repair a fourth lane made. Our side added
  NOTHING in the conflicted hunk (the repaired line itself merged cleanly), so lane 08's comment —
  why the unfiltered roster was a build failure as well as a CLR28 refusal — was kept, beside lane
  03's JSX comment that already sits above it. Nothing was replaced.

**Auto-merges checked:** `apps/web/lib/firm/activity.ts` — both sides rewrote parts of the SAME
header in different hunks (lane 07 restates why the module does not use `getRows` now that
`lib/firm/timeline.ts` is retired; lane 08 widens the closed `kind` vocabulary to eleven values and
adds `successor_work_id`). Compatible; both present. en.json: 5909 + 41 + 7 − 4 RETIRED keys (three
`FirmHome.clients*` on the branch, `FirmHome.activityKindResidual` in lane 08) = 5953, with no
retired key resurrected.

## Lane 10 — #872 0269, #960 0270, #1003 0271 (and #996, no migration)

**Conflicted: `packages/db/package.json`, `packages/db/README.md`,
`packages/db/tests/rig-meta.mjs` (twice),
`apps/web/components/documents/document-kind-dialog.tsx`.**

* **`packages/db/package.json`** — UNION; `invite-issuer-lapsed` 0269,
  `firm-document-limits-writer` 0270, `retire-create-account-set` 0271. **77 + 3 = 80 tokens.**
* **`packages/db/README.md`** — both sides' sections kept whole, then the tail put back into the
  file's own ordering rule:

  ```
  BEFORE: 226 228 229 232 233 234 235 236 237 238 239 243 244 245 246 272 270 271
  AFTER : 226 228 229 232 233 234 235 236 237 238 239 243 244 245 246 270 271 272
  ```

  Line multiset verified identical before and after the reorder.
* **`packages/db/tests/rig-meta.mjs`, hunk 1** — the `ROLES.authenticated` spread list: both sides
  added one entry after 0234's. Both kept, in migration order (0259's education-tip dismissal door,
  then 0270's document-limits writer).
* **`packages/db/tests/rig-meta.mjs`, hunk 2** — `grantMatrixFailures`: the branch's 0243 and 0244
  bimodal checks and lane 10's 0270 one, all kept in migration order; the brace the two sides
  shared was re-opened for the second, as in lanes 03 and 06. Module load-checked; 0270's cohort
  resolves.
* **`apps/web/components/documents/document-kind-dialog.tsx`** — a fifth lane's copy of the same
  repair. Lane 10 added NOTHING in the conflicted hunk, so lane 08's comment (already on the
  branch) stands; nothing was dropped.

**Auto-merges checked:** en.json (5909 + 48 + 11 − 4 retired = 5964), `apps/web/test/manifest.txt`
(495 + 3 + 4 − 1 = 501, sorted, no duplicate), `CONTEXT.md`, `apps/web/README.md`,
`packages/db/tests/README.md`.

---

## Semantic collision, and its fix

One, found by `pnpm typecheck` on the merged tree and fixed in its own commit
`058e6cc72` — *fix(integration): #996's review-queue row builder names #974's authority_id*.

* **What disagreed.** #974 (lane 07, migration 0260) added a REQUIRED `authority_id: string | null`
  to `ReviewQueueRow` in `apps/web/lib/firm/needs-you.ts` and updated the three row builders that
  existed in its own lane (`lib/firm/needs-you.test.ts`, `lib/firm/home-facts.test.ts`,
  `lib/firm/use-review-queue.test.ts`). #996 (lane 10) wrote a FOURTH builder, `makeRow` in
  `apps/web/lib/firm-admin/compliance.test.ts`, which neither lane could see from the other. Each
  lane was green alone; the merged tree was not:

  ```
  lib/firm-admin/compliance.test.ts(178,3): error TS2322 ... Types of property 'authority_id' are
  incompatible. Type 'undefined' is not assignable to type 'string | null'.
  ```

* **The fix.** One field, `authority_id: null`, added to that literal with a comment naming both
  tickets. A `compliance_watch` row names no depreciation authority, so `null` is the honest value
  and the one every sibling builder already uses. No behaviour and no assertion changed.

No other semantic collision surfaced: nothing else failed typecheck or lint, and no two lanes recut
the same function body.

## Migration roster

`packages/db/migrations`, 229 files at the branch point, **263** after the wave (+34).

| numbers | lane | present here |
|---|---|---|
| 0235-0239 | 01 (#1014, #868, #906, #914, #984) | yes, once each |
| 0240-0243 | 02 (#898, #913, #993, #912) | yes, once each |
| 0244-0246 | 03 (#846, #782, #988) | yes, once each |
| 0247-0251 | 04 (#972, #973, #976, #977, #979) | yes, once each |
| 0252-0254 | 05 (#964, #968, #965) | yes, once each |
| 0255-0259 | 06 (#894, #895, #891, #934, #935) | yes, once each |
| 0260, 0261 | 07 (#974, #998) | yes, once each |
| 0262-0264 | 08 (#840, #843, #861) | yes, once each |
| **0265-0268** | **09** | **ABSENT — lane 09 is not ready and was not merged** |
| 0269-0271 | 10 (#872, #960, #1003) | yes, once each |
| 0272 | 03's fix round (on top of its reservation) | yes, once |

Every reserved number that exists on a lane branch we merged is present here exactly once. No
number is duplicated anywhere in the directory (`ls | grep -oE '^[0-9]{4}' | sort | uniq -d` is
empty). The 0265-0268 gap is lane 09's reservation and the only gap from 0235 up.

## Re-measured pins, before and after

| pin | before (branch point) | after |
|---|---|---|
| gate chain, `packages/db/package.json` `test` script | 50 `--import` tokens | **80**, each exactly once |
| pre-integration gate MODULES on disk | — | **80** (chain length equals disk count) |
| `apps/web/messages/en.json` keys | 5909 | **5964** (+59 added, −4 retired) |
| `apps/web/test/manifest.txt` path lines | 495 | **501** (+7, −1 retired), plain-string sorted, no duplicate |
| reviewed dynamic-SQL barrier entries, `firm-scope-db-pins.corpus.ts` | 17 | **22** (+0240, +0252, +0253, +0254, +0260), in file-sorted key order |
| `packages/db/migrations` files | 229 | **263** |

No pinned **sha256** moved: every barrier sha is taken over its own migration file's CONTENT, and
this merge did not touch a single migration file's bytes.

Censuses re-run against the merged tree, with their own commands:

* `node --test tests/preintegration-gate-chain.test.mjs` (in `packages/db`) — **5/5 pass**: every
  gate on disk is preloaded, every `--import` names a real file, no duplicate, corpus non-empty on
  both sides.
* `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (in
  `apps/web`) — **22/22 pass**: the barrier map's key order matches the corpus's file-sorted
  `blockedAt`, and no migration in the merged tree carries unreviewed dynamic SQL.
* `node scripts/check-frozen-workflows.mjs` after EVERY lane merge — OK each time, no manifest
  diff: 312 frozen files verified append-only against `origin/main`, 55 `"use workflow"` modules
  all frozen and registered, 3 retired entries recorded.
* `node -e "JSON.parse(... packages/db/package.json ...)"` after every lane — parses.
* `git diff --check` and a conflict-marker grep over the touched files after every lane — clean.

## Gates

* **`pnpm typecheck`** — PASS (`apps/web` and `packages/runtime` both Done), after the one
  integration fix above. It was the gate that found the collision.
* **`CI=true GITHUB_ACTIONS=true pnpm lint`** — PASS, exit 0 across the workspace, including
  `check-test-manifest`, `check-message-keys` (4362 static `t("…")` keys all resolve) and the
  ui-add guard selftests.
* Database and browser suites were deliberately NOT run here; a separate gate stage runs them on a
  fresh cluster.

## Stopped on / owed

Nothing was left unresolved: no merge is in progress, the working tree is clean, and no file was
left with a conflict marker. Two things are worth carrying forward, neither caused by this merge:

1. **Lane 09 (`riders/w2-lane09`, 0265-0268, #839/#880/#885/#905) is not in this branch.** Its
   numbers are free and its merge will be additive in the same shapes: the gate chain, `rig-meta`'s
   cohort list, the db README tail and the barrier map.
2. **Pre-existing prose drift in `packages/db/tests/README.md` line 23** — "Run it focused with the
   29 `--import ./tests/*-preintegration-gate.mjs` flags". The chain had 50 entries at the branch
   point and has 80 now, so the number was already wrong before this wave. It is prose, not a pin:
   no census or selftest reads it, and `preintegration-gate-chain.test.mjs` pins the chain as a set
   rather than by length. Left alone, because the merge did not break it.
