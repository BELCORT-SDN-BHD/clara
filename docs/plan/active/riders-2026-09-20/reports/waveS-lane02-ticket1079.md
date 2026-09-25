# riders sweep wave · lane 02 · ticket #1079 — the Prepayment accounts panel heading now names both purposes it administers

**Status: done.**

- Branch `riders/wS-lane02`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, base `7bc5a710f`.
- Database `clara_l05` on `127.0.0.1:55745`. Untouched by this ticket: **311 files, max
  `0336_revenue_recognition_plan_op_key`** before and after (the state #1077's report left). This
  ticket needs no migration, as its brief predicted, and none was written.
- Three commits, all on this branch, none pushed:

| commit | what |
|---|---|
| `5171807dc` | slice 1 — the unit assertion renamed first (red against the unchanged copy), then the heading copy in `en.json` renamed to make it green |
| `d6ede5c56` | slice 2 — the browser walk's literal assertion, red against the already-renamed copy, then updated to match and reran green |
| `2e7f1c970` | fix round — the first commit's own failure-message string spelled the ticket as `#1079`, which trips this repo's `no-raw-color-values` selector (#994); reworded to `ticket 1079` per that rule's own documented fix, no behaviour change |

**The ticket is still live on this branch.** `gh api repos/BELCORT-SDN-BHD/clara/issues/1079`: state
`open`, labels `bug` + `ready-for-agent`, **0 comments**, created and last updated 2026-09-24 — so
there is no 2026-09-20 owner ruling comment to reconcile; the issue body's own Agent Brief is the
whole contract. Nothing on this branch had done it before I started: at the branch head (after
#1114 and #1077), `apps/web/messages/en.json`'s `PrepaymentAccounts.heading` still read `"Prepayment
accounts"`, and both literal-string assertions the lane notes named
(`prepayment-accounts-panel.test.tsx:132`, `prepayments-walk.spec.ts:384`) still pinned that exact
string.

`gh issue view 1079 --comments` returned empty stdout on this host (exit 0, from Git Bash), the same
rig quirk #1077's report recorded; `gh api repos/BELCORT-SDN-BHD/clara/issues/1079` was used instead
and returned the full body above with `"comments":0`.

No message arrived mid-task.

---

## The seams I tested at (written before the first test, work order rule 4)

The brief names one interface directly and one derived from it:

1. **The panel's rendered heading text** — `apps/web/components/registers/prepayment-accounts-panel.tsx`
   reads `t("heading")` from the `PrepaymentAccounts` i18n namespace
   (`apps/web/messages/en.json`), never a hardcoded string, so the seam I test at is the copy value
   itself plus the two places that already assert it:
   - the unit render, `p940.panel.empty` in `prepayment-accounts-panel.test.tsx` (mounts the real
     component tree, reads `h.text()`);
   - the browser walk, `prepayments.walk.roster` in `e2e/prepayments-walk.spec.ts` (a real Chromium
     page, `panel.getByText(...)`).

I did not add a new test file: the brief's own "Key interfaces" names exactly these two existing
assertions ("the prepayment accounts panel component's heading text and its associated test/e2e
assertions, which currently assert the literal 'Prepayment accounts' string"), and the lane scan
confirms only these two literal sites exist
(`docs/plan/active/riders-2026-09-20/SWEEP-PLAN.md` names them for this ticket; a repo-wide grep for
the exact phrase `"Prepayment accounts"` outside `docs/plan/**` reports only these three lines:
the two test files plus `en.json`'s own `heading` value — reproduced below).

No web-copy heading exists in any other locale file: `apps/web/messages/` holds only `en.json`
(confirmed by listing the directory), so there is no second translation to update.

---

## What the defect was, measured

`apps/web/messages/en.json`'s `PrepaymentAccounts.heading` key held the literal `"Prepayment
accounts"`. The component this key feeds
(`apps/web/components/registers/prepayment-accounts-panel.tsx:66,134,153,255`) has read and
enrolled/retired **both** the `prepayment` and `deferred_revenue` purposes since #941 (the
purpose badges, the purpose-specific account-type rule and the roster read all already branch on
`purpose`), but the heading itself was never touched by #941 and still named only the first
purpose.

## The fix

One copy change, `apps/web/messages/en.json`:

```diff
     "PrepaymentAccounts": {
-      "heading": "Prepayment accounts",
+      "heading": "Prepayment and deferred-revenue accounts",
```

I chose to name both purposes explicitly rather than the brief's other example ("a more general
phrase like 'Recognition accounts'") because CONTEXT.md's own domain vocabulary
(`CONTEXT.md`, "Prepayment account roster") already describes this roster in exactly those terms —
"one roster carries both purposes a release schedule can have (a prepaid asset, and deferred
revenue's credited liability)" — and does not use "recognition accounts" as a term anywhere. Naming
both purposes in the heading matches the vocabulary the codebase already has rather than minting a
new one, and it is the more literal, less ambiguous reading of the acceptance criterion ("the
panel's heading reflects that it administers both the prepayment and deferred-revenue purposes").

Nothing else changed: no component logic, no row, no enrol/retire flow, no other i18n key
(`subheading`, `purposeBadgePrepayment`, `purposeBadgeDeferredRevenue`, etc. are all untouched), per
the brief's own "Out of scope".

---

## Acceptance criteria, each with its evidence

### AC1 — "The panel's heading reflects that it administers both the prepayment and deferred-revenue purposes."

`PrepaymentAccounts.heading` in `apps/web/messages/en.json` now reads `"Prepayment and
deferred-revenue accounts"`, which names both purposes the badges below it already use
(`purposeBadgePrepayment: "Prepayment"`, `purposeBadgeDeferredRevenue: "Deferred revenue"`), so the
same two words the panel already uses per-row now also appear in its own title.

- Rendered in the unit tree: `p940.panel.empty` reads the mounted panel's own text and matches
  `/Prepayment and deferred-revenue accounts/`. **PASS.**
- Rendered in a real browser: `prepayments.walk.roster` reads
  `page.getByTestId("prepayment-accounts-panel").getByText("Prepayment and deferred-revenue
  accounts")` and asserts it visible. **PASS** (see the two runs below).

### AC2 — "Existing tests and the browser walk that assert the old heading text are updated to match."

Both named sites were updated, each shown red against the unchanged production text first, then
green:

- **Unit — `p940.panel.empty`** (`prepayment-accounts-panel.test.tsx:132`).
  **Red first, for the right reason:** with the assertion changed to the new text but `en.json`
  still unchanged, `node --import ./test/bootstrap.mjs --import tsx --test
  components/registers/prepayment-accounts-panel.test.tsx` failed with
  `AssertionError [ERR_ASSERTION]: ticket 1079: the heading must name both purposes this panel
  administers, not only the first`, `actual` printing the mounted text with the OLD heading
  `"…Fixed assetsPrepayment accountsEnrol an account…"` — the right failure, at the right seam.
  **Green after the `en.json` edit:** same command, **8/8 tests pass** (the file's full suite,
  including the pre-existing #941 purpose-branching cells `p941.panel.rows_both`,
  `p941.panel.enrol_purpose`, `p941.panel.retire_purpose`, none of which this ticket touches).
- **Browser walk — `prepayments.walk.roster`** (`prepayments-walk.spec.ts:384`).
  **Red first, for the right reason:** run against the already-renamed `en.json` with the OLD
  assertion still in place —
  `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3540 CLARA_E2E_NEXT_PORT=3541
  CLARA_E2E_RUNTIME_PORT=3542 pnpm --filter @clara/web e2e prepayments-walk` — failed exactly at
  line 384: `Error: expect(locator).toBeVisible() failed … Locator:
  getByTestId('prepayment-accounts-panel').getByText('Prepayment accounts') … element(s) not
  found`, one test failed, seven passed. This is the coupling AC2 asks for: the copy change alone
  broke the un-updated assertion.
  **Green after updating the assertion:** same command, same triple, **8/8 tests pass** (35.4s),
  including this walk's other unrelated assertions on the same panel (`19000001`, the enrolment
  reason text, the retire/re-enrol/amortise sequence).

### Out of scope, respected

"Any change to the panel's layout, rows, or the enrol/retire flows themselves" — none. The diff
against the branch head touches exactly three lines across three files (below); no component file
changed at all.

---

## No migration

The brief says this ticket needs none, and it does not: nothing here reaches PostgreSQL. Confirmed
after finishing: `packages/db/migrations/` still holds **311 files, max
`0336_revenue_recognition_plan_op_key`**, identical to the state before this ticket (#1077's own
report). No `packages/db/**` file was read for editing, let alone changed.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| the unit test file touched | `node --import ./test/bootstrap.mjs --import tsx --test components/registers/prepayment-accounts-panel.test.tsx` (from `apps/web`) | **8 tests, 8 pass, 0 fail** (run three times across the slice loop: red, green, and green again after the lint-driven reword) |
| the browser walk touched, on my triple | `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3540 CLARA_E2E_NEXT_PORT=3541 CLARA_E2E_RUNTIME_PORT=3542 pnpm --filter @clara/web e2e prepayments-walk` | **8 tests, 8 pass, 0 fail** (run twice: 1 failed/7 passed red at line 384, then 8/8 green — see AC2) |
| the whole `apps/web` unit suite, once | `node scripts/run-tests.mjs` (from `apps/web`) | **5173 tests, 5171 pass, 0 fail, 2 skipped** (run twice — once before, once after the lint-driven reword, identical tallies both times). The 2 skips are pre-existing and unrelated: `components/entry/password-recovery-live.test.ts` skips two live-provider cells when `CLARA_LIVE_SUPABASE_AUTH_URL`/`CLARA_LIVE_SUPABASE_AUTH_ANON_KEY` are not configured, with mocked coverage living elsewhere by the skip's own message |
| typecheck | `pnpm typecheck` | exit 0 — `apps/web` and `packages/runtime` both `Done` |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | exit 0 on the second run. The first run failed at `apps/web/components/registers/prepayment-accounts-panel.test.tsx:133:7`: my own new assertion message spelled the ticket `#1079`, which the repo's `no-raw-color-values` selector cannot distinguish from a 4-hex-digit colour (its own documented limitation, #994 — proved by that rule's own selftest inside this same lint run). Reworded to `ticket 1079`; rerun green |
| message-key check (part of lint, run standalone too) | `node scripts/check-message-keys.mjs` (from `apps/web`) | `4686 static t("…") key(s) … all resolve to a string in messages/en.json` |
| JSON validity of the edited file | `node -e "JSON.parse(readFileSync('apps/web/messages/en.json'))"` | valid |
| frozen closures (inside the lint chain) | `node scripts/check-frozen-workflows.mjs` | OK, no manifest diff — nothing under `packages/runtime` or a frozen workflow file was touched |
| ledger, unchanged | `ls packages/db/migrations \| wc -l` | 311 files, max `0336`, before and after |

I did not run `packages/db`'s test suites, `operation-census.test.mjs` or
`rig-isolation.test.mjs`: this ticket adds no SQL function and touches no `packages/db/**` file, so
those gates do not apply (work order rule 8's own conditionals). I did not run the migration-pins
corpus (`apps/web/tests/firm-scope-db-pins.corpus.ts`) either: sweep rule (d) puts it in scope only
when a migration file changed, and none did.

No known Windows-only red (RIG.md's list) was hit, and none was "fixed".

---

## Files, and the shared-file discipline

| file | what I did |
|---|---|
| `apps/web/messages/en.json` | one value changed: `PrepaymentAccounts.heading`. Shared-file rule followed: the hunk is a single existing key's value, at its existing sorted position, not a re-serialization |
| `apps/web/components/registers/prepayment-accounts-panel.test.tsx` | one assertion's regex and message updated (`p940.panel.empty`) |
| `apps/web/e2e/prepayments-walk.spec.ts` | one literal-string assertion updated (`prepayments.walk.roster`) |
| `apps/web/test/manifest.txt` | **no change** — the touched test file was already listed (line 300), and no new test file was added |
| `apps/web/components/registers/prepayment-accounts-panel.tsx` | **untouched** — the component already reads `t("heading")`; only the translated value moved |
| any `packages/db/**` file, `CONTEXT.md`, any module `README.md` | **untouched, deliberately.** No new vocabulary was introduced (the heading now uses the same two words, "prepayment" and "deferred revenue", CONTEXT.md's own "Prepayment account roster" entry already uses), and no README exists for `apps/web/components/registers/` or `apps/web/lib/registers/` (checked: no `README*` file under either directory) |

No frozen body and no frozen closure module was touched; `packages/runtime` is untouched entirely.

---

## Successor contract

**None needed.** This ticket changes only a rendered string in a human-facing web page; it adds no
tool, no zod input, no door call, no refusal mapping, no part kind and no prompt stanza, and nothing
in `packages/runtime` reads or names this heading. There is nothing for the `chatTurn_v22` /
`claraWork_v6` cut to inherit from this ticket.

---

## Follow-ups worth filing

None arising from this ticket specifically. For completeness: `apps/web/messages/` holds only
`en.json` today (#1082, deferred), so this heading has no second-locale copy to keep in sync yet.

---

## Unverified

- **No World / runtime leg** — not applicable; nothing here reaches `packages/runtime` or a
  bootstrapped World.
- **Hosted-only state** — not applicable; this is a static copy string with no database read, so
  hosted has nothing different from the rig for this change.
- **`gh issue view` returns empty output on this host** (exit 0, no stderr) — the same rig quirk
  #1077's report already recorded and already suggested filing against `RIG.md` (lane 06, #1124).
  Not re-filed here to avoid a duplicate.
- **A message mid-task**: none arrived. Per the sweep-wave rules, had one arrived asking for a
  status report, it would have been addressed to the orchestrator, noted here in one line, and work
  would have continued — moot in this run.
