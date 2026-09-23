# Wave 3, lane 08, ticket #1020 — the test-manifest header, un-sorted back to prose

Branch `riders/w3-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. Commit for this ticket:

- `4d9a5062b` `fix(web): #1020 restore the test-manifest header to coherent prose`

Final head of the lane branch after both #1019 and #1020: `4d9a5062ba171352c5fb8ec3eb285486455d2995`.

## Status: done

Verified still live before building: `gh issue view 1020 --repo BELCORT-SDN-BHD/clara --json
title,body,comments` — no comments beyond the triage-filed Agent Brief, the spec of record below.
`apps/web/test/manifest.txt`'s header was still in string-sort order: four blank `#` lines grouped
at the top (lines 1–4), then 30 more `#` lines in plain alphabetical order with no readable
sentence flow — matching the brief exactly.

## The seam tested at

- **The header comment block itself** (`apps/web/test/manifest.txt` lines 1–34): content only, via
  a byte-for-byte diff against a git-history source, never a hand-retyped guess.
- **The manifest-checking script and its own selftest** (`apps/web/scripts/check-test-manifest.mjs`,
  `check-test-manifest.selftest.mjs`) — both already treat `#`-prefixed and blank lines as ignored,
  so the header fix is provable through them without adding new tooling (the brief's own out-of-scope
  note: "adding new tooling to prevent a future sort... is a separate, optional improvement").

## Finding the original text (cite the commit)

Reconstructed from git history rather than rewritten by hand, per the brief's explicit instruction.
Bisected `git log --reverse --oneline -- apps/web/test/manifest.txt` (191 commits touching the file)
by checking `git show <commit>:apps/web/test/manifest.txt \| head -2` at each probe:

- **Coherent** at `b43bef2fb` (`feat(web): honest tax reads and the capability boundary (#627)`) —
  header reads as connected prose, 34 `#`-prefixed lines, no truly-blank separator line (already
  dropped by that point relative to the file's very first, T0-seam version).
- **Scrambled** starting at `846c9fcd1` (`feat(web): the shared work question — one record, one
  form, one door (#629)`) — `git show 846c9fcd1 -- apps/web/test/manifest.txt` shows the header hunk
  replaced by a plain `sort`-ordered rewrite of the same 34 lines (its own diff is the clearest
  evidence: every line on the `-` side reappears on the `+` side, only reordered, with the file's
  own path-list content below it edited separately in the same commit for the `#629` work-question
  test files). Every commit checked between `846c9fcd1` and `HEAD` (spot-checked at roughly the
  1/2, 1/4 and midpoints of the remaining history, plus the tip) still showed the scrambled form, so
  nothing since re-coalesced it.

Took the header verbatim from `git show b43bef2fb:apps/web/test/manifest.txt`, lines 1–34 — the
last point in history where it read as prose. Independent corroboration: `apps/web/scripts/
check-test-manifest.mjs`'s own header comment (untouched by the sort, since the sort only hit the
manifest text file) carries the same "FOLD (Codex round-3, LOW manifest ordering drift)" paragraph
almost verbatim, confirming the reconstructed wording is the real content and not a plausible
fabrication.

## Acceptance criteria, with evidence

| # | Criterion | Evidence |
|---|---|---|
| AC1 | The header comment block reads as grammatically coherent, logically ordered prose from start to finish, with no duplicated adjacent lines | `apps/web/test/manifest.txt` lines 1–34 now read as the four coherent paragraphs from `b43bef2fb` (what the manifest is and why it replaces the old hardcoded `--test` arg list; how `run-tests.mjs`/`check-test-manifest.mjs` use it; the alphabetical path-ordering contract, including the `#629`-era FOLD explaining the plain-string-compare rule; the blank/`#`-line convention). Checked for adjacent duplicates with `awk 'NR>1 && $0==prev{print} {prev=$0}'` over the restored file — no output, zero duplicates (the four blank `#` lines that grouped at the top of the CORRUPTED version are gone; the restored version has them distributed at their original four positions, lines 2/12/18/33, each non-adjacent to another blank line). |
| AC2 | The manifest's list of test-file paths is byte-for-byte unchanged | `sha256sum` over the path-list portion (everything from line 35 onward) computed identically before and after the edit: `1a212c236a20ce759828b5df46baed631e96e75c0faf3f5e90907882fbd4d8c0` both times. `git diff apps/web/test/manifest.txt` shows exactly ONE hunk (`@@ -1,37 +1,37 @@`), whose `-`/`+` lines are entirely within the header region; every line from `components/accounting/journal-composer.test.tsx` onward is unmarked context, not a change. |
| AC3 | The manifest-checking script and the test runner that consumes this file both still pass afterward | `node apps/web/scripts/check-test-manifest.mjs` — exit 0, "503 test file(s) listed in test/manifest.txt — every real test file on disk is present, exactly once, in alphabetical order." `node apps/web/scripts/check-test-manifest.selftest.mjs` — exit 0, all cases PASS including "the real gate against the real apps/web tree." The test runner (`node scripts/run-tests.mjs`, which reads this manifest via `run-tests.mjs`'s own loader) ran the full 4856-test suite clean (see Gates below) — the manifest drove every one of those files exactly as it did before the header fix. |

Out of scope, respected: no change to which files are listed or their order (proven by AC2's hash
match), and no new sort-guard tooling was added (noted as a residual risk below, per the brief's own
framing, not built).

## Docs

No module README or `CONTEXT.md` update needed: this is a prose restoration to an existing header
comment, not new vocabulary or a new invariant — the header's own content (which already documents
the manifest's purpose and ordering contract) is the artifact being fixed.

## Gates, with counts

- **File touched**: 1 — `apps/web/test/manifest.txt` (header-only; no test file added for this
  ticket, since the acceptance criteria are satisfied by the two existing manifest-checking scripts
  rather than a new cell — the brief's Key interfaces section names the checking script as
  "unaffected by this fix," not a place to extend).
- **Manifest-checking scripts** (found in `apps/web/package.json`'s `lint` script and wired into the
  root lint chain): `node apps/web/scripts/check-test-manifest.mjs` — exit 0, 503 files. `node
  apps/web/scripts/check-test-manifest.selftest.mjs` — exit 0, all cases pass.
- **`pnpm --filter @clara/web typecheck`**: exit 0 (unaffected by a `.txt` file change; run to
  confirm nothing else drifted).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, run once from the worktree root covering both
  #1019 and #1020's final state): exit 0 across `apps/web`, `packages/db`, `packages/runtime`,
  `packages/reporting-render` — including `check-test-manifest` (503 files, alphabetical, exactly
  once each) and `check-test-manifest.selftest` (all cases pass) as part of `apps/web lint`'s own
  chain.
- **The WHOLE `apps/web` unit suite once** (`node scripts/run-tests.mjs`, run once from `apps/web`
  covering both tickets' final state): **4856 tests, 4854 pass, 0 fail, 2 skipped** — the 2 skips are
  the known, pre-existing `CLARA_LIVE_SUPABASE_AUTH_URL`/`CLARA_LIVE_SUPABASE_AUTH_ANON_KEY`
  live-provider skip in the `password-recovery-live.test.ts` family (RIG.md's documented
  Windows-only known state), unrelated to this ticket.
- No e2e browser walk owed: this ticket touches only `apps/web/test/manifest.txt`, not any
  `packages/runtime` file or `*.spec.ts` walk.
- Tree clean after commit: `git status --short` in the worktree returns nothing. Final head:
  `4d9a5062ba171352c5fb8ec3eb285486455d2995`.

## Fix round — SPEC-L08-04: where the "duplicated reference tags" actually are

The ticket's Context describes the file as ending with "what look like duplicated one-line
reference tags (the same issue-number tag appearing twice, adjacent to each other, because the sort
placed identical lines next to one another)". Those lines are NOT in the header this ticket
restored, and the report did not say so. Naming them, so a reader comparing the ticket text against
the delivered file does not have to work it out:

- `awk 'NR>34 && /^#/ {print NR": "$0}' apps/web/test/manifest.txt` prints exactly four lines, all
  inside the PATH LIST, none of them in the header: `# #770` at 303 and 305, and `# #809` at 438
  and 440. They are unchanged on this branch.
- They are NOT adjacent duplicates, and neither of each pair is redundant. Each tag line precedes
  exactly ONE path it tags: 303 tags `components/work/work-activity-view.test.tsx` (304), 305 tags
  `components/work/work-cancel-dialog.test.tsx` (306); 438 tags `lib/plans/api.test.ts` (439), 440
  tags `lib/plans/schedule.test.ts` (441). The sort put the two `# #770` lines two rows apart with
  the path each one tags in between, which is what reads as a duplicate at a glance. Deleting "the
  second of each pair" would strip a real file's train marker, so no deletion was made.
- They are also the ONLY four tagged paths out of 503, so the convention is inconsistent rather
  than wrong. Removing all four is a cosmetic change to a file rule 7 names as shared across nine
  concurrent lanes this wave, and it would spend the provenance of four files to buy nothing any
  script reads (`check-test-manifest.mjs` and `run-tests.mjs` both ignore `#` lines, per the
  header's own last paragraph). **Deliberately left as they are.** AC2 (the path list byte-for-byte
  unchanged) is a second, independent reason this ticket does not touch them.

## Follow-ups worth filing

- Optional, and only if those four tag lines ever become a real convention rather than four
  leftovers: either tag every path or none. Not worth a ticket on its own today.
- The brief itself names this as optional: a guard against a future line-based sort touching this
  header again (e.g., a positive-control test asserting the header's first line is the title
  sentence, or that no two adjacent header lines are identical) is not built here, per the brief's
  explicit "separate, optional improvement" framing. Worth a small follow-up ticket if this file
  proves to attract another automated sort — the same class of tool that broke it once could break
  it again with nothing catching it before a human reads the file.

## Anything unverified

- The bisection that located `846c9fcd1` as the scrambling commit spot-checked roughly a dozen
  commits out of 191 rather than every single one; it is possible (though contradicted by every
  probe taken) that the header was briefly coherent again at some later point and re-scrambled a
  second time before `HEAD`. I did not find any such point in the commits checked, and the two
  independent corroborations (the coherent text matching `check-test-manifest.mjs`'s own untouched
  header comment almost verbatim, and the restored file passing both manifest-check scripts
  immediately) make a second, undetected corruption unlikely — but a full commit-by-commit replay
  was not performed.
