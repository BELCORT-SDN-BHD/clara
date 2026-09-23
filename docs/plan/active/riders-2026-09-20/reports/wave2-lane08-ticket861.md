# Wave 2 · lane 08 · ticket #861 — Activity-kind ladder misfiles events under "documents"

**Status: DONE.** Branch `riders/w2-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`,
database `127.0.0.1:55748/clara_l08`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
04f717324 fix(web): #861 gate fixes — an undefined label read and a ticket-shaped literal
b53d8ce8b docs: #861 the kind ladder's five rungs, their cells and their frontier
d4ad1554c fix(web): #861 Firm Home stops disclosing a kind residual it no longer has
2cfa1acb3 feat(web): #861 the activity vocabulary, labels and chips gain the five kinds
6c0d0e244 test(db): #861 the two ladders are one ladder, for every registered event type
8f3e2972b test(db): #861 an unnamed prefix rides the STATED DEFAULT, in both doors
f6d82bdfe feat(db): #861 firm.created files under kind=firm, and the look-alikes do not
9ffe522c3 feat(db): #861 client-facet and knowledge events file under kind=clients
4e3cdb42d feat(db): #861 counterparty events file under kind=counterparties
88d32148b feat(db): #861 fixed-asset events file under kind=assets
8891d4c0f feat(db): #861 membership and invitation events file under kind=people
--- (#843, #840 below this line, landed before me on the same branch)
```

Working tree clean. The two tickets before mine in the lane had already landed
(`git log 23cfad94..HEAD` showed eight commits from #840 and #843 at start, and `clara_l08`
carried their migrations 0262 and 0263).

**The contract** is issue #861's Agent Brief (triage comment, 2026-09-17) as fixed by the **owner
ruling comment of 2026-09-18** on the same issue, which is the newest comment on the ticket; there
is no 2026-09-20 comment on #861. The ruling settles the one decision that was the owner's — the
vocabulary — and reclassified the ticket `ready-for-agent`.

**The ticket was still live**, measured before any change on this branch's own database:
`clara.list_activity`'s live body (sha `186ab1aff6cd278e98577764a4d5712c692ef58eb674746efe0174cb2967e0c9`)
and `clara.get_activity_event`'s (`37319708f836424358f640e745f1b5e8e3787d628b217f734764a9d0ad4855a1`)
both ended their domain-event ladder `else 'documents'` after five rungs, and
`clara.list_activity`'s `p_kinds` roster was 0181's six values — so `kinds=['people']` answered
`CLR10 unknown activity kind people`, which is the red the first cell was seen in.

---

## The seams I tested at (written before the first test)

- **`clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)`** and
  **`clara.get_activity_event(text,text)`** — the two doors the brief names. Tested through the
  doors, never through an internal projection: every kind claim is read off a returned row.
- **`apps/web/lib/firm/activity.ts`'s exported vocabulary** — `ACTIVITY_KINDS`, `isActivityKind`,
  `parseActivityUrlState` (the brief's "web activity kind vocabulary … and URL parser").
- **`ActivityFilters`'s rendered behaviour** — the chips' labels and their `aria-pressed` state
  (the brief's "filter control"), through the component, never through its props.
- **`Activity.kindLabels` in `apps/web/messages/en.json`** — the brief's "labels", pinned by a
  census cell because this app has no `IntlMessages` typing, so `tsc` does NOT catch a missing
  label for a template key like `` t(`kindLabels.${kind}`) `` (verified: no `IntlMessages`
  declaration anywhere in `apps/web`, and `scripts/check-message-keys.mjs`'s own header states it
  deliberately skips template keys).

No test at a seam the brief does not give. I did not touch the agent-receipt UNION arm or its
`report`/`agent` split, I registered no new event type, and I backfilled nothing — all three are
named out of scope by the brief, and the kind is computed at read time so no backfill exists to do.

One seam the brief does not name was changed, and I state it rather than bury it:
**`apps/web/components/firm/firm-home/firm-recent-activity.tsx`** carried a sentence under its list
disclosing this exact defect ("Some events are still filed under the wrong kind by the activity
door (#861)"). Leaving it would have put a false statement on a surface whose whole discipline is
honest notes. Its own pinning cell was flipped first (below).

---

## Vertical slices, in order

| # | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `af.33` — `CLR10 unknown activity kind people` from the door's closed roster | 0264 with the `people` rung + the roster entry |
| 2 | `af.34` — `CLR10 unknown activity kind assets` | the `assets` rung + roster entry (redo) |
| 3 | `af.35` — `CLR10 unknown activity kind counterparties` | the `counterparties` rung + roster entry (redo) |
| 4 | `af.36` — `CLR10 unknown activity kind clients`, then a SECOND red (below) | the `clients` rung + roster entry (redo), then the cell's own fix |
| 5 | `af.37` — `CLR10 unknown activity kind firm` | the `firm` rung + roster entry (redo) |
| 6 | `af.38` — green before and after, so a deliberate break: `else 'documents'` → `else 'clients'` on both live bodies, and the cell failed on "bank.statement_ingested is reachable under the default kind" | nothing (the cell documents an arm the recut keeps); bodies restored |
| 7 | `af.39a`/`af.39b` — the detail door's `assets` rung hand-recut to `documents`, and both cells failed (the ladder comparison, and `get_activity_event`'s answer for `asset.*`) | nothing; body restored |
| 8 | `ACTIVITY_KINDS is the door's closed roster` — `deepEqual` failed on the six-value list | the widened `ACTIVITY_KINDS` + the five `kindLabels` |
| 9 | the two chip cells + the two vocabulary cells, all four red with `"counterparties"` removed from `ACTIVITY_KINDS` | nothing; the file restored byte for byte |
| 10 | the board cell's assertion flipped to `doesNotMatch(/wrong kind by the activity door/)` and seen red against the still-present paragraph | the paragraph, its header stanza and the `en.json` key removed |

Slices 1–5 each edited the ONE migration file and re-applied it through the supported redo path;
slices 6, 7 and 9 are vacuity controls for cells that are green the moment the change lands, which
is what the work order asks of such a cell.

**A finding inside slice 4.** `af.36`'s first cut read a REAL `client.created` row, because
`clara.create_client` is what `buildWorld()` calls — and it failed. **`client.created` is a
REGISTERED but UNEMITTED event type** on this estate: `clara.domain_events` carries
`client.activated`, `client.onboarding_started` and `client.resolved` and not one `client.created`
(measured by a grouped count). The cell now drives `client.activated` and says why.

---

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A regression cell per new kind proves the event type lands on it in both doors and is reachable by filter | **done** | `packages/db/tests/activity-feed.test.mjs` af.33 (people: a REAL `member.added` written by `clara.add_member` at world build, plus an `invite.issued`), af.34 (assets), af.35 (counterparties — TWO types of the family, so the arm is proven to be a prefix match and not one name), af.36 (clients — one `client.*` and one `knowledge.*`, so the `or` is proven and not only its first branch), af.37 (firm: a REAL `firm.created` written by `clara.create_firm`). Each cell asserts the filter ADMITS the kind, that `clara.list_activity` files the type under it, that every row the filter returned carries that kind, and that `clara.get_activity_event` answers the same kind for the same row id. af.34 adds the departure half (the acquisition has LEFT the `documents` rung). |
| A cell proves the two ladders agree for every event type | **done** | af.39a reads both INSTALLED bodies out of `pg_proc`, slices each ladder from the sweep rung to the stated default, drops comment lines, normalises whitespace and asserts the two are the same sentence — then asserts that sentence equals `EXPECTED_LADDER`, written out in the test from #728/#630 and the owner's ruling rather than re-derived from the SQL under test. af.39b is the behavioural half: it appends ONE event of **every** registered `clara.event_types` name (137 of them), pages the feed until every one is seen, and asserts both doors answer the kind an independent prefix table predicts, then asks the door for each kind it saw so "correctly labelled" and "reachable" are one claim. `sweep.run_completed` is the single excluded name, with its reason stated in the cell: #728 keeps an effectless heartbeat out of the feed entirely, so a bare append could never reach a page; af.15 owns that rung behaviourally and af.39a covers it structurally. Migration 0264's own tail additionally rebuilds each rung's predicate from the (kind, prefixes) pairs and requires it EXACTLY ONCE in each body. |
| The activity-feed cells owned by #625, #633, #639, #646, #647 and #650 still pass | **done** | The whole `activity-feed.test.mjs` battery — af.1 through af.39b — ran in ONE invocation with the full gate chain: **41 pass, 0 fail, 0 skipped**. The same run covers #632's, #728's, #630's, #770's and #840's own cells. Beyond the file: `operator-support.test.mjs` (#843's os.20 pins all three operator support acts on the stated default, and `firm_registration.rejected` is exactly the look-alike this ladder must not catch) ran **22/22, 0 skipped**; the whole `apps/web` unit suite ran **4751/4753 pass, 0 fail**. |
| A cell proves an unknown event type lands on the documented default | **done** | af.38, driven through THREE families the ruling does not name (`bank.statement_ingested`, `egress.purpose_activated`, `open_item.created`) so the claim is about the `else` arm and not one lucky prefix, asserting `documents` in both doors. Its vacuity control is slice 6 above. af.37 proves the sharper case: `firm_registration.rejected` and `firm_setup.seeded` are absent from the `firm` page and still answer `documents` in both doors — the negative that makes `like 'firm.%'` (with the dot) load-bearing. |
| The migration applies from scratch | **done, at the scope RIG.md gives a lane** | `clara_l08` was built from-scratch 0001→0234 at rig setup (RIG.md); 0262 and 0263 landed before me; `0264_activity_kind_ladder.sql` applied cleanly on top, taking the chain to **232 files**, and its ledger checksum `47eb464c75b99f3836456cb99fcc2152a6fe645d5d52c520c7d7271c4abde7c2` is byte-identical to `sha256` of the file on disk (both measured). A SECOND from-scratch chain was deliberately NOT run: RIG.md forbids it on a cluster that already ran one and states the integrator runs that proof on a disposable cluster. |
| The filter roster admits the new values; the web vocabulary, labels and URL state match | **done** | Door side: the roster is widened in the same statement as the ladder, and 0264's tail asserts the roster is EXACTLY `{documents,journal,close,report,agent,work,people,assets,counterparties,clients,firm}` in one place, once, and that it admits every kind the ladder can produce. Web side: `apps/web/lib/firm/activity.test.ts` pins `ACTIVITY_KINDS` by `deepEqual` against that list (transcribed from 0264, never read back off the module) and pins the label map both ways (every kind has a non-empty label; the map carries no extra key). `activity-filters.test.tsx` proves each kind renders as a pressable chip under its own label with no raw `kindLabels.` key, and that `kinds: ["counterparties"]` presses exactly that one chip. |
| A bookmarked URL naming a retired kind degrades to "no filter on that axis" | **already satisfied, unchanged** | `parseActivityUrlState` already filters through `isActivityKind`, and `apps/web/lib/firm/activity.test.ts`'s cell "an unrecognised kind token is dropped, not sent to the door as garbage" already pinned it. Widening the roster does not weaken it: it is still a closed list, and the cell still passes (in the 42/42 run of the two web files and in the whole-suite run). I added no second cell for a property that was already proven. |

---

## The migration

`packages/db/migrations/0264_activity_kind_ladder.sql` — the number reserved for this ticket. 1028
lines. Ledger checksum `47eb464c75b99f3836456cb99fcc2152a6fe645d5d52c520c7d7271c4abde7c2`, equal to
`sha256` of the file.

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed
by `to_regprocedure`, never transcribed from a file's own text). Both are **0262's output, not
0202's/0184's** — #840 landed earlier in this lane and recut both bodies, exactly the case the
wave-2 addendum warns about:

- `clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)` =
  `186ab1aff6cd278e98577764a4d5712c692ef58eb674746efe0174cb2967e0c9`
- `clara.get_activity_event(text,text)` =
  `37319708f836424358f640e745f1b5e8e3787d628b217f734764a9d0ad4855a1`
- Posture pin for BOTH (measured identical, and re-read by the tail):
  `clara_fn_owner | false | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan |
  clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner`

Post-state, measured after the final redo: list_activity
`02a7f720a936dc434013047835e4cda1661c2576ff0dcbc86636d6a0cbf8f869`, get_activity_event
`54dfe97c84d002cc07b6d88b9ca1d46c00f38a7b4200a1f3942d40c7e31911d0`; both postures byte-identical to
the pins above.

**The prestate is redo-tolerant, the shape 0263 §0.3 established two commits earlier on this
branch**: it measures whether this file's own effect (`then 'people'`) is already present and pins
the pre-image sha only when it is not — otherwise a fix-round redo would be impossible — while the
arms the recut keeps (`sweep`, `entry.%`, `document.%`, `close.%`, `work.%`, `else 'documents'`,
0262's `successor_work_id`, `p_work`, the three-arm union, the kind predicate, the refusal reasons)
are asserted on BOTH paths, and 0202's six-value roster only on the pre-image path.

**What it changes.** Two `create or replace` statements over UNCHANGED signatures, in one
transaction:

| prefix(es) | kind |
|---|---|
| `member.%`, `invite.%` | `people` |
| `asset.%` | `assets` |
| `counterparty.%` | `counterparties` |
| `client.%`, `knowledge.%` | `clients` |
| `firm.%` | `firm` |

plus the same five values appended to `clara.list_activity`'s closed `p_kinds` roster — a WIDENING
of accepted input, not a new refusal. Both doors' bodies are 0262's committed text, byte-for-byte:
I extracted 0262's own §R sections and **verified them against the LIVE `prosrc` of both functions
before editing** (identical apart from one trailing space my slice cut), then applied exactly three
textual edits. Nothing else in either 350-line body moves.

**`like 'firm.%'` is written with the dot, and that is the one subtle thing in this file.** In a SQL
LIKE pattern `.` is an ordinary character but `_` is a single-character WILDCARD, so the
natural-looking `firm_%` would also have matched `firm_registration.*` (three types) and
`firm_setup.*` (four) — two families the ruling does not name, and #843's os.20 pins the first of
them on the stated default on this very branch. af.37 asserts that negative from the product side.

**Tail assertions.** Both doors resolve exactly once at their pre-existing signatures; each new rung
is present exactly once in EACH body with its predicate **rebuilt from the (kind, prefixes) pairs**
rather than pasted, so the census cannot silently agree with a typo in the ladder; the roster is
tested in exactly one place and is exactly the expected closed set; the roster admits every kind the
ladder can produce; every arm 0181/0183/0184/0202/0262 shipped survives (18 probes on the feed door,
12 on the detail door, plus the `successor_work_id` counts of 3 and 3); both postures are
byte-identical to §0.5's measurement; both comments name #861.

**Redo, used six times, recorded per instruction.** Four to add rungs 2–5 during slices 2–5, and two
to restore after the vacuity controls of slices 6 and 7. Every redo was
`CLARA_MIGRATION_REDO=0264_activity_kind_ladder` with the destructive guard set, and each reported
its new checksum; the final one restored the committed file's checksum `47eb464c…` exactly.

**One redo was REFUSED, and correctly.** After slice 6's vacuity control replaced `else 'documents'`
with `else 'clients'` in both live bodies, the redo failed its own prestate —
`#861 prestate: the live clara.list_activity is not 0262's body -- missing: stated-default` — because
§0.4 asserts that arm on both paths. That is the prestate refusing to overwrite a body it cannot
recognise, which is what it is for. I reversed the one replacement by hand (the exact inverse
substitution, so byte-for-byte) and then redid; both shas returned to their pre-break values.

**No new rig-meta cohort**, and that is a measured finding rather than an omission — the same shape
0183's note, #840's note and #843's note record. Both doors are still 0181's same two names at their
same signatures and grant (`ACTIVITY_FEED_0181_HUMAN_FNS` already covers them); a `#861` / `#861 END`
bracketed note beside that constant in `packages/db/tests/rig-meta.mjs` records the reasoning.

**Gate module and chain**: `packages/db/tests/activity-kind-ladder-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_ACTIVITY_KIND_LADDER=1`), stable stem `activity_kind_ladder$`, wired into
`packages/db/package.json`'s `test` script in migration order immediately after
`operator-support-timeline-preintegration-gate.mjs`. af.33 uses the LOUD discriminator; af.34–af.39b
use the quiet gate — the double-gate idiom, and the same shape #840's af.31/af.32 use one frontier
earlier in the same file.

---

## ⚠ Cross-lane incident: I wrote to lane 05's database, and repaired it

**What happened.** My throwaway SQL helper lived at the scratchpad root
(`…\2d0e3faa-…\scratchpad\q.mjs`). That directory is **shared with at least one other concurrently
running lane session**, and lane 05's session overwrote that exact filename with its own helper,
which hard-codes `port: 55745, database: "clara_l05"`. From that moment my reads — and, worse, ONE
write — went to lane 05's database instead of mine. The write was the slice-6 vacuity control: it
replaced `else 'documents'` with `else 'clients'` in `clara.list_activity` and
`clara.get_activity_event` on `clara_l05`.

**How it was caught.** The contradiction was loud, not silent: af.38 passed against what I believed
were broken bodies. Rather than accept the pass I probed the connection itself
(`select current_database(), inet_server_port()`), which answered `clara_l05 / 55745`.

**The repair, and its evidence.** I reversed exactly the one substitution on `clara_l05` and
measured the result: `clara.list_activity` =
`dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870`, `clara.get_activity_event` =
`80bc1390416da02e3787cd64ea4a3df483402edafd5eb8067ae6289bc5b8531f`. Those two values are not mine to
choose: they are the **exact pre-0262 pins quoted in this lane's own #840 report** ("0202's own body,
still live" / "0184's own body, still live"), recorded before I touched anything, and lane 05
carries neither 0262 nor 0264 (its head is `0253_batch_cancel_reissue`, 231 migrations). Both
postures are intact (`clara_fn_owner`, `SECURITY INVOKER`, both settings, PUBLIC-revoked, EXECUTE to
`clara_authenticated`). Re-verified at the end of the session: still correct, `then 'people'` absent,
`else 'clients'` absent.

**What is NOT affected.** Only those two function bodies on `clara_l05`, and only between two
commands in one session; nothing was written to lane 05's worktree, branch or ledger (its
`schema_migrations` was never touched), and no other statement I issued through that helper was a
write. My own `clara_l08` was never in the wrong state — the earlier prestate measurement that
produced 0264's pins was taken before the overwrite, which the migration's own prestate then
independently confirmed against `clara_l08` when it applied.

**What I changed so it cannot recur.** Every helper now lives in a lane-private subdirectory
(`scratchpad/lane08/`), takes its connection from `argv` instead of the environment, and prints
`current_database()` / `inet_server_port()` on every single call. Every measurement quoted in this
report was taken with that helper and carries that banner.

**Follow-up worth filing** (see below): the scratchpad directory is documented as
"session-specific, isolated", and on this host it is not isolated between concurrent lane sessions.

---

## Gates, with counts

| gate | result |
|---|---|
| `activity-feed.test.mjs` with the FULL gate chain (53 preintegration modules from `package.json`'s `test` script) | **41 pass, 0 fail, 0 skipped** |
| `operator-support.test.mjs` with the full gate chain (#843's os.20 reads the same ladder) | **22 pass, 0 fail, 0 skipped** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs`, full gate chain, **no reset flags** | **33 tests, 32 pass, 0 fail, 1 skipped** — the skip is `T19 poison-role`, self-declared `# SKIP destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1`, which RIG.md forbids on this rig |
| `pnpm typecheck` (worktree root) | **Done** — `apps/web` and `packages/runtime` both clean |
| `pnpm lint` (worktree root) | **clean** across all four workspaces, including `apps/web`'s five extra gates (token-contrast, both manifest checks, both message-key checks, ui-add guard) |
| whole `apps/web` unit suite, `node scripts/run-tests.mjs` | **4753 tests, 4751 pass, 0 fail, 2 skipped** — both skips are the live-Supabase-auth cells (`CLARA_LIVE_SUPABASE_AUTH_URL`/`…_ANON_KEY not configured`), a pre-existing rig condition, not mine |
| `pnpm --filter @clara/web e2e activity-feed-walk` on my triple (3570/3571/3572) | **19 passed** |
| `pnpm --filter @clara/web e2e home-board-walk` on my triple | **27 passed** |

The two browser walks are not files I edited; I ran them because my change moves what they render
(the kind chips, and the paragraph that left Firm Home). `packages/runtime` was not touched, so its
frozen-workflow and parts-parity gates are not owed — and `grep` over `packages/runtime` finds no
reference to `list_activity`, `get_activity_event` or an activity kind at all.

---

## Docs updated (in the same commits)

- **`packages/db/tests/README.md`** — a new `af.33`–`af.39b` section: the rung table, why `firm.%`
  carries the dot and what `firm_%` would have swallowed, which cells read product-written rows and
  which append their own, the `client.created` finding, af.38's vacuity control, how af.39a/af.39b
  split the "two ladders agree" criterion, the new frontier stem and gate module, why no rig-meta
  cohort is owed, and that the browser's `ACTIVITY_KINDS` is the same contract kept in a second
  place. It also records that os.20's reading survives 0264 unchanged.
- **`packages/db/tests/rig-meta.mjs`** — the `#861` / `#861 END` bracketed note.
- **`CONTEXT.md`** — new term **Activity kind** in the house `term / _Avoid_` shape, placed between
  "Activity event" and "Kept sweep receipt" (a minimal, sorted-position hunk, per the shared-file
  rule).
- **`apps/web/lib/firm/activity.ts`** — its own header's kind list and a docstring on
  `ACTIVITY_KINDS` naming the door as the owner of the vocabulary.
- **`apps/web/components/firm/firm-home/firm-recent-activity.tsx`** — the `#861` stanza rewritten
  from "named here, not patched here" to "fixed in the door, and its disclosure left with it".
- **No `packages/db/README.md` section**: that file documents subsystems, and neither the
  0181/0183/0184/0202 lineage this recut extends nor 0262 has one — the same bar #840 and #843
  recorded for their own body-only recuts on this branch. The migration documents itself at length.

---

## Successor contract

**None is owed.** Nothing frozen consumes this change:

- No frozen workflow body or closure module was touched, and `packages/runtime` contains no
  reference to `clara.list_activity`, `clara.get_activity_event` or an activity kind (grep over
  `packages/runtime/src` and `packages/runtime/workflows` returns nothing).
- Both doors keep their exact signatures and argument order, so no caller's call shape moves:
  `clara.list_activity(p_cursor text, p_limit int, p_client uuid, p_kinds text[], p_since
  timestamptz, p_until timestamptz, p_work uuid)` and `clara.get_activity_event(p_source text, p_id
  text)`.
- The only contract that widened is the value set of `p_kinds`, and it widened in the permissive
  direction: every value accepted before is still accepted, and the `CLR10 invalid_kind` refusal
  (`detail.reason = 'invalid_kind'`, with `kind`) is unchanged for anything outside the list. A
  caller written against the six-value roster keeps working untouched.
- For any future reader that needs the list: the closed roster is
  `{documents, journal, close, report, agent, work, people, assets, counterparties, clients, firm}`,
  and the browser's copy is `ACTIVITY_KINDS` in `apps/web/lib/firm/activity.ts`, pinned to it by
  `lib/firm/activity.test.ts`.

---

## Follow-ups worth filing

1. **The scratchpad is not isolated between concurrent lane sessions on this host.** The harness
   describes it as "session-specific, isolated from the project", and a generically-named helper
   there was replaced under me by another lane's session, which sent one write to that lane's
   database (repaired; see above). Worth either a per-session subdirectory guarantee or a documented
   warning in `RIG.md` for multi-lane waves.
2. **`client.created` is registered and never emitted.** `clara.event_types` carries it, and no door
   in the estate appends it (measured). Either a door should, or the catalog row is dead weight that
   a future reader will trust. Not this ticket's business, and deliberately left.
3. **Prefixes still on the stated default that a later ruling may want to name.** With the five
   rungs landed, the families still falling to `documents` include `bank.*` (18 types), `egress.*`
   (13), `kb_binding.*`/`kb_rule.*` (10), `open_item.*` (5), `firm_setup.*` (4), `wiki.*` (4),
   `firm_registration.*` (3), `seeding.*` (3) and a dozen singletons. That is the owner's vocabulary
   call, not an agent's; the brief scoped this ticket to five.
4. **`af.39b` seeds one event per registered type into the lane world.** It is bounded (137 rows in
   a per-file sandbox firm) and runs last in the file, but if the catalog grows a lot it is the cell
   that will notice first.

---

## Anything unverified

- **A true from-scratch 0001→0264 chain was not run here**, deliberately: RIG.md forbids a second
  from-scratch chain on a cluster that already ran one, and assigns that proof to the integrator on
  a disposable cluster. What IS verified is that 0264 applies onto the real chain and that its
  ledger checksum equals the file.
- **`packages/runtime` gates were not run** (`check-frozen-workflows.mjs`,
  `check-parts-parity.mjs`): nothing under `packages/runtime` was touched. Unverified in the sense
  that I did not execute them.
- **The browser walks I ran are the two my change affects**; I did not run the rest of the e2e
  suite, and the rule does not ask for it.
- **The hosted/deployed behaviour is untested by me** — everything above is the lane rig.
- **Lane 05's database is repaired as measured at the end of my session.** I have no visibility into
  what that lane does next, and I deliberately did not touch anything else of theirs; if their own
  work depended on those two bodies between my break and my repair, they would have seen a wrong
  kind on an unrelated read during that window. The window was roughly the time between two of my
  commands, and their two bodies now hash to the values their own chain implies.
