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
   *(Closed later in this record — see **Lane 09** below. It landed as `d3aaecdb8`, and the four
   shapes were exactly those, taken as an INSERTION between 0264 and 0269 rather than an append.)*
2. **Pre-existing prose drift in `packages/db/tests/README.md` line 23** — "Run it focused with the
   29 `--import ./tests/*-preintegration-gate.mjs` flags". The chain had 50 entries at the branch
   point and has 80 now, so the number was already wrong before this wave. It is prose, not a pin:
   no census or selftest reads it, and `preintegration-gate-chain.test.mjs` pins the chain as a set
   rather than by length. Left alone, because the merge did not break it.

---

# Lane 09 — landed later, on a branch that had moved

Lane 09 was not ready when the nine other lanes were merged. It is now in. Between the two
sessions the branch moved under me, and I read that state before touching anything:

* **gate worker A's seven `fix(integration)` commits** (`c51172a27` … `0968b5287`) — one migration
  edit (0270's prestate pins re-measured because 0252 recuts four bodies it pins) and six
  test-census re-measures. Its record is
  `docs/plan/active/riders-2026-09-20/reports/wave2-integration-gates-A.md`.
* **`0546ec1e6`, a merge of `main`** (riders wave 1 as merged, with the #1026/#1027 CI gate fixes,
  including the new launcher `scripts/ci/world-gate.mjs`), then **`8bd961d5a`**, a docs commit.

Merge base for lane 09 was still `23cfad947` — the same wave-2 branch point every other lane used —
so this merge saw the whole wave plus gate A's work on one side and one lane on the other.

**Merge commit: `d3aaecdb8` — "merge: riders wave 2 lane 09". Head after it:
`d3aaecdb86b6756162fb02971b536a8864030c2a`.** No fix commit was needed; the merge broke nothing
that typecheck or lint could see.

Lane 09's four migrations sit BETWEEN 0264 and 0269, so every shared ordered list took an
**insertion** rather than an append — the one structural difference from the other nine lanes.

## Conflicts and how each was resolved

| file | how |
|---|---|
| `packages/db/package.json` | gate chain: union, lane 09's four gates INSERTED between 0264's and 0269's |
| `packages/db/README.md` | both sides kept whole, tail re-sorted into migration order |
| `apps/web/components/work/accounting-work-list.tsx` | both sides rewrote the same paragraph with different, compatible intents — both kept |
| `apps/web/components/documents/document-kind-dialog.tsx` | the KNOWN DUPLICATE; ours kept, exactly one copy in the tree |

* **`packages/db/package.json`** — the pre-integration gate chain. The four lane-09 gates
  (`work-question-admitted-basis` 0265, `work-list-claim-label` 0266, `work-list-receipt-window`
  0267, `work-source-correction-supersede` 0268 — each number read off the gate module's own
  header) were inserted **before** `invite-issuer-lapsed-preintegration-gate.mjs` (0269), not
  appended after 0271's. **80 + 4 = 84 tokens, each exactly once; 84 gate modules on disk; none
  un-preloaded.**

* **`packages/db/README.md`** — both sides' sections kept whole, then the file's chronological tail
  put back into its own ordering rule:

  ```
  BEFORE: … 244 245 246 270 271 272 265 266 267
  AFTER : … 244 245 246 265 266 267 270 271 272
  ```

  Every section moved WHOLE; the line multiset is identical before and after the reorder. (Lane 09
  documents 0265, 0266 and 0267 here; 0268 has no section of its own in this README.)

* **`apps/web/components/work/accounting-work-list.tsx`** — the only conflict in the whole wave
  where both sides changed the same lines with *different* intents, both clear and compatible:
  - **lane 09 (#880, 0266)** rewrote the shared "a staff expense claim is not a fourth value here"
    paragraph: the list door's own projection now carries `claim_id`/`claimant_label`, so this
    surface no longer has to ask `clara.get_work_claim_origin` by name;
  - **lane 01 (#984, 0239)** left that paragraph untouched and ADDED a paragraph plus a fourth
    member of `KNOWN_PURPOSE_LABELS`, `"opening_balance"`, which really is a value of the column's
    CHECK.

  Kept, in this order: lane 09's rewritten paragraph (it supersedes the sentence both sides started
  from), then lane 01's #984 paragraph, then the **four**-value Set. They read as one argument —
  lane 01's own text already says "unlike the claim lane above", which is exactly lane 09's
  paragraph. Nothing dropped, no two sentences merged into one.

* **`apps/web/components/documents/document-kind-dialog.tsx` — the KNOWN DUPLICATE.** Lane 09
  carries `9df3f0df5` ("unblock the build — SelectValue's kind roster used the wrong constant"),
  the same one-line `DOCUMENT_KINDS` to `CLASSIFIABLE_DOCUMENT_KINDS` repair that lanes 01, 03, 06,
  08 and 10 each made independently. **The copy kept is the one lane 01 landed in `4c02305b0`**;
  the line itself merged silently because the text is identical, and the conflicted hunk was only
  the comment, where lane 09 added nothing, so lane 08's comment stands. There is exactly **one**
  `CLASSIFIABLE_DOCUMENT_KINDS.map(...)` on the `SelectValue` `items` prop
  (`document-kind-dialog.tsx:107`), and `9df3f0df5` contributes no second copy.

## Auto-merges checked rather than trusted

* **`packages/db/tests/rig-meta.mjs`** — no conflict. Lane 09 put its #885 0268 cohort (five
  ungranted names: `_source_corrected_work`, `_lock_source_corrected_work`,
  `_supersede_source_corrected_work`, `_question_source_corrected`, `_fact_value_changed`) beside
  0217's document source-revision lane, its stated subject, rather than at the tail where lanes
  01-03, 06 and 10 put theirs. Present once, module loads, **105 exports** (gate A measured 104
  before this merge).
* **`apps/web/messages/en.json`** — 5909 base keys + 59 (branch) + 6 (lane 09) − 5 retired across
  the wave = **5969**. No key was added by both sides, no value overwritten, no retired key
  resurrected.
* **`apps/web/test/manifest.txt`** — **502** path lines, plain-string sorted, no duplicate, header
  untouched.
* **`apps/web/tests/firm-scope-db-pins.corpus.ts`** — lane 09 added no barrier entry, so the union
  is the 22 already there. Its census was re-run anyway (below) and passes with 0265-0268 present,
  which is the evidence that none of the four carries unreviewed dynamic SQL.
* `CONTEXT.md`, `apps/web/e2e/home-board-walk.spec.ts`,
  `apps/web/components/work/accounting-work-list.test.tsx` — every line each side added is present.

## Checks after the merge

| check | result |
|---|---|
| JSON-parse `packages/db/package.json` | parses |
| conflict markers, whole tree | none |
| `git diff --check` | clean |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files append-only vs `origin/main`, 55 `"use workflow"` modules frozen+registered, 3 retired entries; **no manifest diff** |
| `node scripts/ci/world-gate.selftest.mjs` | **OK** — every cell PASS, including the wiring guard ("EVERY node invocation of a `tests/` entry point in `db-live-gates` goes through this launcher") and its inverse control |
| `pnpm typecheck` | **PASS** — `apps/web` Done, `packages/runtime` Done |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **PASS**, exit 0 |
| `node --test tests/preintegration-gate-chain.test.mjs` (`packages/db`) | **5/5 pass** — 84 gates on disk, 84 preloaded, no dangling token, no duplicate |
| `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` (`apps/web`) | **22/22 pass** |

Database and browser suites were not run, by instruction. **No migration pin was touched** — gate
worker A re-runs the chain next and owns pin corrections.

## The roster is now COMPLETE

`packages/db/migrations`: **267 files** (229 at the branch point, +38).

```
0235 0236 0237 0238 0239 0240 0241 0242 0243 0244 0245 0246 0247 0248 0249 0250
0251 0252 0253 0254 0255 0256 0257 0258 0259 0260 0261 0262 0263 0264 0265 0266
0267 0268 0269 0270 0271 0272
```

Missing in 0235…0272: **none**. Duplicate 4-digit prefix anywhere in the directory: **none**. The
0265-0268 gap this record opened with is closed by lane 09 (#839 0265, #880 0266, #905 0267,
#885 0268).

## For gate worker A — the cross-pin list it asked for

Read out of the four migration files themselves (`create or replace function clara.<name>`, every
quoted `clara.<name>(args)` signature literal, every `pg_get_functiondef` splice target, with
`--` comments stripped so prose is never counted as a pin):

| migration | WRITES (recuts or creates) | PINS / reads back only |
|---|---|---|
| 0265 (#839) | `_work_question_record` | `get_work_question`, `get_work_pending_question` |
| 0266 (#880) | `list_accounting_work` (9-arg), `get_accounting_work_row` | — |
| 0267 (#905) | `list_accounting_work` — **DROPS the 9-arg signature and creates an 11-arg one** | `get_accounting_work_row` |
| 0268 (#885) | `_source_corrected_work`, `_fact_value_changed`, `_question_source_corrected`, `_lock_source_corrected_work`, `_supersede_source_corrected_work`, `revise_document_fact`, `answer_work_question`, `_work_question_record` | `restate_accounting_work`, `cancel_accounting_work`, `_work_committed_receipt`, `list_source_dependents` |

**Migration-to-migration: the intersection is EMPTY.**

* No body lane 09 writes is pinned or written by **0269, 0270, 0271 or 0272**. For the record: 0269
  writes `preview_invite` and pins `accept_invite`; 0270 writes `_firm_document_limit_ceiling` and
  `set_firm_document_limits` and pins the nine gate A already re-measured; 0271 pins
  `create_account_set_v1`, `_agent_create_account_set_core`, `wake_create_account_set`; 0272 writes
  `_tf_document_capability_high_water_monotone` and pins `_tf_no_truncate` and
  `_tf_document_capabilities_version_high_water`. None of those names appears in lane 09's table.
* No body lane 09 **pins** is written by a lower wave migration (0235-0264) — which matters,
  because 0265's prestate pins were measured on a chain at **0234** (the lane's own rig,
  `clara_l09`, 0001→0234) and 0268's at 0001→0267, i.e. on chains that never carried 0235-0264. On
  this evidence those pins should survive the merged chain order.
* The only names shared with other wave migrations are estate-wide helpers that a body-text census
  NAMES rather than sha-pins — `role_rank`, `jwt_sub`, `jwt_firm`, `actor_role_rank` (0267 against
  0259/0262/0263/0264/0269/0270). Nobody writes them, so they are not a hazard.

**Test-side: ONE pin is very likely to fail, and it is one gate A has already touched once.**

`packages/db/tests/firm-portfolio-pack.test.mjs`, cell **`p659.portfolio.no_recut`** (line 744 for
the sha map, line 765 for the `prosecdef` read) pins

```
clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)
```

by `sha256(prosrc)` **and** by casting that exact nine-argument signature to `::regprocedure`. With
lane 09 in the chain:

1. **0266 recuts that body** — the sha moves; and
2. **0267 runs `drop function if exists` on the nine-arg signature** and creates an eleven-arg one
   (the two new parameters default to null, so ordinary calls of up to nine arguments still
   resolve). The `::regprocedure` cast therefore no longer resolves at all: expect
   `function clara.list_accounting_work(...) does not exist` — an **error**, not a sha mismatch,
   which reads differently in the log.

This is the same cell gate A widened in `633c5c016` for 0260's and 0264's recuts, where it recorded
`list_accounting_work` as "unmoved". That line of its record is now stale. The cell's other four
pins (`list_review_queue`, `get_client_work_pack`, `_work_run_attempts`, `list_activity`) are
untouched by lane 09.

Migrations **0189, 0203 and 0231** also name the nine-arg signature, but all three are BELOW
0266/0267 in chain order and see the nine-arg body when they run, so they are not at risk.

Two things gate A warned about that lane 09 does **not** trip, checked rather than assumed:

* **the S5.25 clock rosters** — none of lane 09's five new bodies carries a clock token; the only
  `now()` / `clock_timestamp()` in the four files are inside the `answer_work_question` recut, and
  that name is **already** on arm (D)'s roster in `x42-s5-helpers.mjs:952`. No widening owed.
* **the `pages_per_day` census (gate 7)** — lane 09 names none of its bodies.

No test outside `firm-portfolio-pack.test.mjs` pins any of lane 09's recut signatures by
`::regprocedure` or by sha (checked for `_work_question_record`, `list_accounting_work`,
`get_accounting_work_row`, `revise_document_fact` and `answer_work_question` across
`packages/db/tests`, `packages/runtime/tests` and `apps/web/tests`); the other files that mention
them **call** the doors rather than pin them.

## Still owed

* The chain re-run, and any pin correction it implies, is gate worker A's — untouched here by
  instruction.
* The pre-existing prose drift at `packages/db/tests/README.md:23` ("the 29 `--import` flags") is
  now further out of date: the chain has **84**. Still prose, not a pin; still not something this
  merge broke.
