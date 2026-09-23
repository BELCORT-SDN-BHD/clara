# Wave 2 · Lane 06 · Ticket #935 — DONE (firm setup 2/2: optional education tips)

Branch: `riders/w2-lane06` (worktree `C:\Users\zhant\Desktop\clara-wt\656`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad947b5598214168ba9c43d391b4e16aa745..HEAD`
at start showed seven commits (#894, #895, #891, #934, all already landed):

```
544e9daa2 fix(web): document-kind-dialog references the renamed DOCUMENT_KINDS export
a43143735 docs(web): #934 firm setup checklist shows the accountant note, not the engineer note
9eb0fc61c feat(db): #934 firm setup user_note/retired_at columns and get_firm_setup recut
7f4f0cc69 feat(web): #891 firm setup checklist hides/marks inapplicable items
33b797e72 feat(db): #891 firm setup applicability predicates
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

and now shows ten:

```
07da571ae fix(web): #935 a pending education tip renders nothing on a committed checklist
4a605a9dd feat(web): #935 firm setup checklist renders education tips
67e92799b feat(db): #935 firm setup education tips catalogue, seed recut and the narrow dismiss door
544e9daa2 fix(web): document-kind-dialog references the renamed DOCUMENT_KINDS export
a43143735 docs(web): #934 firm setup checklist shows the accountant note, not the engineer note
9eb0fc61c feat(db): #934 firm setup user_note/retired_at columns and get_firm_setup recut
7f4f0cc69 feat(web): #891 firm setup checklist hides/marks inapplicable items
33b797e72 feat(db): #891 firm setup applicability predicates
dc9f16db4 fix(db): #895 0218 firm-setup migration polish -- three defects the #648 fix round left
4d23d3c5d fix(db): #894 harden uq_onboarding_plans_one_open_firm's predicate
```

`git status` in the worktree is clean after all three commits.

## Ticket

#935 "Firm setup (2/2): optional education tips with a read-or-later rendering, outside the required
counters and the audit trail (closes #892)". The NEWEST Agent Brief is the issue body itself, plus
two triage comments: the first closes the door-reuse question ("`clara.defer_firm_setup_item` cannot
serve as the tip's 'Later' action — it requires a non-blank reason, only accepts
`required_for_commit=false` rows, and audits + emits an event on every acceptance; tips need their own
narrower door") and corrects AC1's framing (the catalogue's own `item_kind` CHECK already admits
`education`; what needed widening is the PLAN-ITEM table's CHECK, `onboarding_plan_items.item_kind`).
The **owner's ruling comment dated 2026-09-20** approves the three draft tips exactly as drafted and
restates the two hard properties unchanged: a tip never counts toward the required total or blocks
completion, and acknowledging or deferring one writes NO audit row and NO domain event. Blocked by
#934 (the `retired_at` column and the `get_firm_setup` recut) — verified live and applied on this
branch before building (`clara.firm_setup_keys.retired_at` exists; `get_firm_setup`'s `sha256(prosrc)`
matched the post-#934 value I measured directly off `pg_proc`). No code for #935 existed on this
branch before I started — #934's own report states it explicitly ("Sibling ticket #935 ... it is not
mine and I did not build any part of it") and I re-verified: `clara.dismiss_firm_setup_tip` was
absent and no `education`-kind row existed in `clara.firm_setup_keys` at the start of this session.

## Seams tested at

- **`clara.seed_firm_setup_plan(p_op_key)`** through `humanQuery` as a real admin persona — AC1's
  named seed, proving the catalogue's own `item_kind` is carried through rather than folded onto
  `todo`.
- **`clara.get_firm_setup()`** through `humanQuery` — AC2's named read, proving a tip is excluded from
  `counter`/`required_outstanding` and that `commit_firm_setup` (a real commit, not merely a counter
  reading full) succeeds with all three tips still pending.
- **`clara.dismiss_firm_setup_tip(p_plan, p_item_key, p_action)`** through `humanQuery` — the new
  door itself: both actions, the audit/event non-write, idempotent repeat calls, and the narrow-door
  refusal of a non-education item.
- **`clara.answer_firm_setup_item` / `clara.defer_firm_setup_item`**, called AGAINST a tip item_key —
  proving the new guard that refuses them (a decision beyond the AC's literal text; see below).
- **`clara.onboarding_plan_items.item_kind`** and **`clara.firm_setup_keys`**, read directly through
  `rootQuery`, for the migration's own tail census and the test file's direct-row assertions.
- **The web checklist's rendered surface** (`components/firm-setup/firm-setup-checklist.tsx`) through
  both the component unit harness (`firm-setup-checklist.test.tsx` `fs.web.14`) and the
  `firm-setup-walk` e2e spec — AC3's named surface and AC4's named walk.
- **The firm-home tile** (`components/firm/firm-home/firm-setup-tile.tsx`) — read, not edited: it
  already reads only `required_outstanding`/`counter`, both proven tip-blind by the DB cell above, so
  AC4's "the tile ignores tips" is a corollary rather than a separate code path.

## A decision beyond the ticket's literal text, stated plainly

AC3 asks that acknowledging or deferring a tip, THROUGH THE NEW DOOR, write no audit row and emit no
event. It does not explicitly ask that the two EXISTING doors (`answer_firm_setup_item`,
`defer_firm_setup_item`) refuse a tip's item_key — because before this ticket, no `education` row
existed for that gap to be observable. Once this ticket seeds three real tips, calling either existing
door directly against a tip's item_key would silently succeed (their catalogue lookup and validation
never discriminated on `item_kind`), recording an AUDITED "accounting item answered" event for what
the brief calls "product guidance, never an accounting position." I judged this a real, closeable
correctness gap in the invariant the owner's ruling states as an absolute property, not merely a
property of the one new door, and added one guard clause to each existing door (`CLR10
firm_setup_item_is_a_tip`), each pinned and proved at the migration's own tail
(`p935.tip.narrow_door_guards` proves both refusals under real roles). Both doors' every other line,
ACL, floor and signature are unmoved (pinned pre-image, re-measured, and a fragment-position check
that the new guard sits immediately after the catalogue lookup and nowhere else). A reviewer who
judges this out of the ticket's stated scope can revert just SS D/E of the migration and the two
`p935.tip.narrow_door_guards` assertions against `answer`/`defer`; the door itself
(`dismiss_firm_setup_tip`) and every other AC do not depend on it.

## Migration

`packages/db/migrations/0259_firm_setup_education_tips.sql` — applied cleanly to `clara_l06` via
`pnpm migrate` (from `packages/db`) on top of the lane's chain after #894/#895/#891/#934 (234 files
total after apply, the runner's own summary line below). No redo used — applied cleanly on the first
attempt.

**Prestate pins, measured on `clara_l06` at the frontier left after #934 (0258 applied), moments
before applying — hardcoded constants in the migration's own `DO` block, not transcribed from
memory:**

- `clara.seed_firm_setup_plan(text)` `sha256(prosrc)` (recut gate):
  `57f8c602730119442042a5a3754efa2ca180f3f87ced0af17aea603af3060118`
- `clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)` `sha256(prosrc)` (recut gate):
  `2539fd1e88d94de8a17ba8b71ae0a5f0ee64df71b1df315ad34217ef680712f2`
- `clara.defer_firm_setup_item(uuid,uuid,text,text,text)` `sha256(prosrc)` (recut gate):
  `f5625c6a26300039a2de196531be4a0d8dd641e479491398da5d0af4f3664aa3`
- `clara.get_firm_setup()` `sha256(prosrc)` (measured baseline, not a gate — this file never touches
  it; the tail re-measures the same sha and requires it unchanged):
  `dfe46764c5c4932cc771c46c5ee743820da69ebb790420b15314fb6b5e1732b0`
- `clara.commit_firm_setup(uuid,uuid,text)` `sha256(prosrc)` (same, measured baseline):
  `c527f0bf01a9a583d18180270a21bac4c7110b4daf64927ef7967bc428e9dc23`
- The original twelve rows' pre-existing-column hash (the SAME formula and value 0257/0258 both
  re-proved unchanged): `156dc83bce062e83ca4fe0185f6a18f9c57891ed8fe16d4e5d4d1f7134e6a1dd`
- `onboarding_plan_items_item_kind_check`'s live definition confirmed to admit exactly
  `must_ask`/`capture`/`todo` (measured off `pg_constraint`, not assumed from 0017's file text).

Notices from the real apply:

```
[notice] #935 prestate: clean -- every recut/called name is present at its pinned pre-image
  (seed/answer/defer to recut; get_firm_setup/commit_firm_setup as untouched baselines),
  clara.dismiss_firm_setup_tip does not yet exist, neither door yet refuses an education row, no tip
  row exists yet, the catalogue holds exactly its pinned twelve rows byte-identical to the prior
  tickets' own pin, and onboarding_plan_items.item_kind does not yet admit education.
[notice] #935 tail: OK -- clara.firm_setup_keys gained exactly three education-kind rows
  (tip_invite_colleagues/tip_knowledge_page/tip_start_from_conversation), required_for_commit=false,
  group tips, no knowledge_key, none retired, a non-blank user_note each, in sort order after the
  original twelve, whose own pre-existing columns hash unchanged to the prior pin;
  onboarding_plan_items.item_kind now admits education alongside must_ask/capture/todo;
  clara.seed_firm_setup_plan no longer folds education onto todo; clara.answer_firm_setup_item and
  clara.defer_firm_setup_item each carry exactly one occurrence of the new education guard;
  clara.get_firm_setup and clara.commit_firm_setup are byte-identical to their measured baselines
  (untouched); clara.dismiss_firm_setup_tip exists with the standard firm-setup-door posture, is
  EXECUTE-unreachable by every machine role, and calls no audit/event/bump/reserve primitive in its
  own body; and the four untouched helpers plus #894's widened index are unmoved. The BEHAVIOURAL
  proof (no audit row, no domain event, a real door call under real roles) is
  firm-setup-education-tips.test.mjs's job.
applied 0259_firm_setup_education_tips · backend pid 379189
migrate: 1 new migration(s) applied · 234 total · target 127.0.0.1:55746/clara_l06
```

**Schema change.** `clara.onboarding_plan_items.item_kind`'s CHECK is dropped and re-added under the
same name, widened to admit `education`, guarded by a definition probe so a redo is a no-op if the
CHECK is already widened. **Catalogue.** Three new `clara.firm_setup_keys` rows by plain `insert`
(never an `update` — brand-new rows, so the append-only trigger is never disabled, unlike #934's
backfill of twelve EXISTING ones). **Recuts.** `seed_firm_setup_plan` drops the `case k.item_kind when
'education' then 'todo' else k.item_kind end` fold for a straight `k.item_kind` pass-through;
`answer_firm_setup_item`/`defer_firm_setup_item` each gain one new guard clause right after the
catalogue lookup. **New door.** `clara.dismiss_firm_setup_tip` — see "A decision beyond..." above and
the Successor contract section below for its exact shape.

## Acceptance criteria

- **[x] AC1 — a new migration seeds the approved education rows with `item_kind = 'education'`,
  `required_for_commit = false`; the seed no longer folds `education` into `todo`; prestate pins on
  the recut seed and read bodies.**
  - Three rows seeded, catalogue order and shape: `p935.seed.education_kind` — **PASS** (asserts
    `item_kind`, `group_key`, `required_for_commit`, `knowledge_key`, a non-blank `note`, and the
    exact title `"Invite your colleagues"` for one, both on `clara.onboarding_plan_items` directly
    and through `get_firm_setup`).
  - The plan item carries `education`, never `todo`: same cell, direct row read
    (`select item_kind from clara.onboarding_plan_items ...`) — **PASS**.
  - Prestate pins on the recut (`seed_firm_setup_plan`) and the untouched read (`get_firm_setup`),
    plus `answer_firm_setup_item`/`defer_firm_setup_item` (also recut) and `commit_firm_setup` (also
    untouched): see "Migration" above — all five measured live, none transcribed.
  - Migration tail re-reads the catalogue's full 15-row order and the three tips' shape: passed on
    the real apply (notice above; no exception raised).

- **[x] AC2 — `get_firm_setup` excludes education items from the required counters and returns them
  in their own group; a cell proves an unread tip neither counts nor blocks commit nor appears in
  `required_outstanding`.**
  - `p935.counters.excludes_tips` — **PASS**: seeds a plan (all three tips land `pending`), answers
    every REQUIRED row while confirming the three tips stay untouched and are never in
    `required_outstanding`, asserts `required_total` is unmoved by the fifteen-row catalogue now
    existing, and then **actually calls `commit_firm_setup` and it succeeds** with all three tips
    still `pending` — the strongest available proof of "never blocks completion" (not merely "the
    counter reads full").
  - "Returns them in their own group": `p935.seed.education_kind` asserts `item.group_key === "tips"`
    for all three; `firmSetupGroups` (an existing, untouched helper) groups by `group_key` alone, so
    no `get_firm_setup` or web code change was needed for this half — a MEASURED claim, not an
    assumption: `get_firm_setup`'s `sha256(prosrc)` is pinned unchanged (see Migration), so its
    existing group-by-`group_key` projection is provably the same code that already ran before this
    ticket.

- **[x] AC3 — the checklist renders a tip with title, body, "Got it" and "Later" and no answer form;
  acknowledging or deferring is stored through a door that writes no audit row and emits no domain
  event (a cell asserts both), and the tip disappears from the list afterwards.**
  - No audit row, no domain event, BOTH actions: `p935.tip.dismiss_no_audit_trail` — **PASS**. Snapshots
    `count(*) from clara.audit_log where firm_id=$1` and `count(*) from clara.domain_events where
    firm_id=$1` immediately before and after each of the two calls (`"acknowledged"` on one tip,
    `"deferred"` on another) and asserts zero delta on both tables for both actions; separately
    confirms the firm's whole `firm_setup.*` event stream contains only the earlier `seeded` event,
    never an `item_answered`/`item_deferred` for either tip.
  - The plan item remembers the act: same cell, direct row read — `state`/`answer` read back exactly
    `{answered, {tip_action: "acknowledged"}}` and `{deferred, {tip_action: "deferred"}}`.
  - Repeat-call safety (a residual the migration's own header names, since a real UI double-click is
    possible): `p935.tip.dismiss_idempotent` — **PASS**. A second identical call, and then a call with
    the OTHER action, both leave the row's `answered_at`/`state`/`answer` untouched; the door's own
    echoed `tip_action` reflects what was JUST requested (never a lie about a state it did not write).
  - The checklist's own rendering: `firm-setup-checklist.test.tsx` `fs.web.14` — **PASS**. Two tips
    sharing one fixture: renders title + body, asserts NO `firm-setup-answer-<key>-action` and NO
    `firm-setup-skip-<key>` controls exist for a tip, asserts the group's bounded-walk trigger
    (`firm-setup-answer-group-tips`) does NOT render even with two pending tips in the same group (a
    real bug I found and fixed while building this — see "Two bugs I found and fixed" below), presses
    "Got it" on one and "Later" on the other, and asserts each disappears from the DOM on its own next
    read while the required counter never moves.
  - The browser walk: `firm-setup-walk.spec.ts` `firmSetup.walk.answer` now reads a tip's title and
    body, asserts no answer/skip control renders for it, presses "Later", and asserts it disappears —
    **PASS** (run below).
  - A pending tip left undismissed into a COMMITTED checklist renders nothing at all (no title, no
    buttons) rather than dead-looking controls — a gap in my own first draft, fixed and covered by
    `fs.web.08`; see "Two bugs I found and fixed while building this" below.

- **[x] AC4 — the firm-home setup tile ignores tips; the firm-setup walk covers reading and skipping
  a tip; the twelve-count cells and the e2e mock are updated.**
  - The tile ignores tips: `components/firm/firm-home/firm-setup-tile.tsx` is UNCHANGED (git diff
    against this ticket's commits shows no edit to this file) — it reads only
    `env.required_outstanding`/`env.counter`, both proven tip-blind by `p935.counters.excludes_tips`
    above. No test regression: the tile's own existing coverage in `firm-setup-walk.spec.ts`
    (`firmSetup.walk.start`, asserting `"of 3 required facts recorded"` and, later,
    `firmSetup.walk.finish`, asserting the tile clears once every REQUIRED item settles) still passes
    unedited with three tips now present in the catalogue and one dismissed mid-walk.
  - The walk covers reading and skipping a tip: see AC3's walk evidence above (the tip is read, then
    skipped via "Later" — the ticket's own two words, "reading" and "skipping", both exercised).
  - The twelve-count cells: four literal assertions across three files updated from `12`/`10`/`7` to
    `15`/`13`/`10` (`firm-setup.test.mjs` ×4, `firm-setup-polish.test.mjs` ×3,
    `firm-setup-user-notes.test.mjs` ×1 — see the DB commit diff for the exact lines) plus one
    `deepEqual` item-key list in `firm-setup.test.mjs` extended with the three new keys in sort order.
    All four files re-verified GREEN together (32 cells, see Gates).
  - The e2e mock: `firm-setup-mock.mjs` gains one `education`-kind row (`tip_invite_colleagues`, in a
    new `tips` group), `dismiss_firm_setup_tip` added to `FIRM_SETUP_RPC_VERBS` and a handler branch
    that mutates the SAME `state.answers` map every other verb uses (never rotating `state.revision`,
    matching the real door's own no-CAS contract).

## Two bugs I found and fixed while building this

**(1) A still-pending tip kept its buttons on a committed checklist.** Every OTHER write control on
this surface disappears once the plan is committed (`!committed && ...` guards the answer/skip
buttons for the twelve accounting rows); my first draft of the tip's own row carried no such guard,
so a tip nobody dismissed before commit would keep rendering its title and both "Got it"/"Later"
buttons on an already-completed checklist that has no reopen door to act through — dead-looking UI on
a face the ticket calls "complete." Fixed by adding `|| committed` to the tip's hide condition
(`fix(web)` commit `07da571ae`, separate from the `feat` commit above it, once I noticed the gap while
re-reading my own diff against the rest of the component's conventions rather than by a failing test).
`fs.web.08` (the not-started/completion faces cell, which already exercised a COMMITTED fixture for
the twelve accounting rows) gains one still-pending tip in that same fixture and asserts it renders
nothing — verified red-then-green by reverting the `|| committed` clause and re-running the cell,
which failed on exactly that assertion, then restoring the fix.

**(2) The group-level bounded-walk trigger** ("Answer these N together") is offered
whenever `group.items.filter(isPending).length > 1`. All three education tips share ONE `group_key`
(`"tips"`), so on a freshly seeded plan all three read `pending` at once — without a fix, the group
would have offered "Answer these 3 together" and opened `FirmSetupItemForm`, a form built entirely
around the twelve accounting items' answer shapes, for three rows that have none. I excluded education
items from that specific `pending` count (`group.items.filter((i) => isPending(i) &&
!isEducationTip(i))`), leaving every other use of `isPending` (the per-item row, `allSettled`,
`notStarted`) untouched. `fs.web.14` asserts the trigger's absence directly with two pending tips in
the fixture — verified red-then-green the same way as bug (1): reverting the one-line filter change
and re-running the cell failed as expected on the `firm-setup-answer-group-tips` assertion, then
restoring the fix turned it green again.

## Gates

- **`packages/db/tests/firm-setup-education-tips.test.mjs`** (new, own stable stem
  `firm_setup_education_tips$`, 5 cells, one per AC/residual):
  - Focused run AFTER the migration applied → **5/5 pass**.
  - Run together with the other four firm-setup DB files (see below) → still **5/5 pass** inside a
    combined 32/32.
- **`packages/db/tests/firm-setup.test.mjs`** (four literal edits) → **17/17 pass** (`EXPECTED_CELLS`
  unchanged; the count is the same seventeen cells, six of them touched by value only).
- **`packages/db/tests/firm-setup-polish.test.mjs`** (three literal edits) → **3/3 pass**.
- **`packages/db/tests/firm-setup-applicability.test.mjs`** (untouched — re-verified, no edit needed)
  → **4/4 pass**.
- **`packages/db/tests/firm-setup-user-notes.test.mjs`** (one literal edit) → **3/3 pass**.
  All five files together in one `node --test` invocation → **32/32 pass, 0 fail**.
- **`packages/db/tests/operation-census.test.mjs`** (this ticket adds one new granted SQL function,
  `dismiss_firm_setup_tip`, and recuts two others — run per rule 8) → **10/10 pass**.
- **`packages/db/tests/rig-isolation.test.mjs`** (same, never with reset flags) → **22/23 pass, 1
  skip** (`T19 poison-role`, the one destructive cell, correctly SKIPped —
  `CLARA_RIG_ALLOW_RESET` is unset), **0 fail**.
- **`pnpm typecheck`** (repo-wide) → clean (`apps/web typecheck: Done`, `packages/runtime typecheck:
  Done`).
- **`pnpm lint` (repo root, exactly as the runner invokes it)** → the top-level `&&`-chain FAILS
  before reaching either `eslint` or `pnpm -r lint`, at a PRE-EXISTING, UNRELATED selftest
  (`node scripts/check-frozen-workflows.selftest.mjs`), one case: "`--ruling` followed by another flag
  ... is treated as NO ruling given" expects a specific refusal but instead meets an EARLIER
  CI-only refusal (`--retire is REFUSED under CI`) the selftest's own child-process invocation does not
  clear `CI`/`GITHUB_ACTIONS` for — exactly the category RIG.md's addendum names ("a selftest that
  spawns such a CLI must clear both variables for the child when the refusal it pins sits behind the
  CI refusal"). Verified unrelated to #935: (a) this file and `scripts/check-frozen-workflows.mjs` are
  under `scripts/`, not `packages/db` or `apps/web`; (b) I touched no file under `packages/runtime` or
  `scripts/`; (c) `node scripts/check-frozen-workflows.selftest.mjs` run standalone (no CI env vars)
  → **all cases pass**, including this exact one — it fails ONLY under the CI-simulated env. Given the
  top-level chain never reaches the packages, I ran the remaining stages directly instead:
  `pnpm --dir packages/db lint` → clean; `pnpm --dir apps/web lint` (includes `check-token-contrast`,
  `check-test-manifest` + its own selftest, `check-message-keys` + its own selftest confirming my four
  new `en.json` keys resolve, `check-ui-add-guard`'s selftest) → clean; `pnpm -r --if-present lint`
  (covers every workspace member `pnpm lint` would, apps/web + packages/db + packages/runtime) → exit
  0, all report `Done`. **Reported as an unrelated pre-existing red, not fixed** (out of #935's scope;
  unlike #934's `document-kind-dialog.tsx` fix, this one is not a one-token correction blocking my own
  gates — my `pnpm typecheck` and `next build` both already succeed without it).
- **This ticket touches `apps/web`, so the WHOLE unit suite ran once**
  (`node scripts/run-tests.mjs` from `apps/web`) → **4749/4751 pass, 0 fail, 2 skip** (the two skips
  are the documented live-Supabase-auth checks needing external config, unrelated to firm setup —
  confirmed by name and by re-grepping the full run's own "SKIP" lines).
- **The browser walk I touched, `firm-setup-walk`, on this lane's triple**
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3550 CLARA_E2E_NEXT_PORT=3551
  CLARA_E2E_RUNTIME_PORT=3552`) → **5/5 pass** (`pnpm --filter @clara/web e2e firm-setup-walk`).
- `packages/runtime` gates (`check-frozen-workflows.mjs`, `check-parts-parity.mjs`): not run as a
  dedicated step — this ticket touches no file under `packages/runtime`, and the frozen-workflows
  check itself already ran (and passed its substantive check; only its OWN CI-simulated selftest
  failed, per above) as part of the `pnpm -r` sweep.

## Docs

- `packages/db/README.md` — the "Firm setup (0218, journey A5)" section: the intro line now says "six
  names" (was "five") and names the new door; the door table gains a `dismiss_firm_setup_tip` row; a
  new paragraph after the #934 one names #935/0259, the widened CHECK, the seed recut, the two
  untouched reads/gate and why (catalogue-data-driven exclusion, for free), the two new door guards
  and why they exist beyond the AC's literal text (cross-referenced to this report's own "A decision
  beyond..." section).
- `CONTEXT.md` — a new term, **Firm setup education tip**, added after **Firm setup catalogue note**,
  house `term` / `_Avoid_` shape, naming the "read-or-later, not remind-me-later" semantics and the
  no-audit/no-event property.
- `packages/db/package.json` — the new preintegration gate added to the `test` script's chain, at the
  sorted (migration-order) position, immediately after `firm-setup-user-notes-preintegration-gate.mjs`
  (shared file, work-order rule 7 — minimal, one-entry hunk).
- `packages/db/tests/rig-meta.mjs` — a new `FIRM_SETUP_TIP_0259_COHORT` (one granted name,
  `dismiss_firm_setup_tip`), spliced into `ALLOWED[ROLES.authenticated]` and `cohortFailures()` at the
  position immediately after the existing `#1008`/0234 block (shared file, minimal hunk, three
  insertion points as the file's own established pattern uses).

## Successor contract

None. `clara.dismiss_firm_setup_tip` is not, and is not called by, any frozen chat or Work tool body
or closure module; nothing in this ticket touches `packages/runtime`. If a future chat/Work-tool
surface ever wanted to let Clara acknowledge a tip on a person's behalf, the door's own shape would
need naming here first — it does not exist today, so there is nothing to specify.

## Follow-ups worth filing

- **The `seed_firm_setup_plan` retired-row residual**, named by #934's own migration header and
  report and re-confirmed untouched by this file (pinned pre-image, re-measured): whether a retired
  catalogue row — including, now, a retired TIP — should stop being reconciled into a plan is still a
  named residual for whichever ticket first actually retires something. This ticket adds no retired
  row either (all three `retired_at` are null, tail-checked).
- **The `commit.ready`/`commit.notReady` wording quirk** (pre-existing, not introduced by this ticket):
  `firm-setup-checklist.tsx`'s `allSettled = env.seeded && env.items.every((i) => !isPending(i))`
  already read `false` whenever ANY optional item (mia/tin/currency, before this ticket) was still
  pending, even though the commit button itself is enabled purely by `required_outstanding.length ===
  0` — so the "notReady" sentence could show while the button is actually clickable. Three MORE
  optional, always-unrequired items (the tips) make this slightly more likely to be visible in
  practice, but I did not change this computation: it is a pre-existing surface-wording behaviour, not
  named by any of #935's four ACs, and fixing it would be a scope decision for whoever owns that
  copy's intent (does "ready" mean "the button works" or "everything on the page is settled"?).

## Unverified

- Whether the owner's approved three tip sentences will need small wording corrections later — same
  posture as #934's own report: this migration seeds them exactly as ruled, byte for byte against the
  ticket text.
- Any hosted/production firm's current `firm_setup_keys` content beyond this lane's own rig — no
  access to hosted catalog state from this lane.
- Whether the pre-existing `check-frozen-workflows.selftest.mjs` CI-only failure (see Gates) is
  already tracked elsewhere; I did not file a new issue for it, per scope discipline, and note it here
  as the loudest available record.
