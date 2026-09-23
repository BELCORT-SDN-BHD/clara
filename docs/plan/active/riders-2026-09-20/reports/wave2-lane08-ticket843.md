# Wave 2 · lane 08 · ticket #843 — Give operators a human-readable audit surface

**Status: DONE.** Branch `riders/w2-lane08`, worktree `C:\Users\zhant\Desktop\clara-wt\658`,
database `127.0.0.1:55748/clara_l08`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
6b9ac9aed docs: #843 the operator support act, its timeline cells and their frontier
5b664576b test(db): #843 os.21 proves a replayed op_key adds no second timeline line
f4b861b72 test(db): #843 os.20 proves the three acts stay inside the operator firm
575231cf9 feat(db): #843 the problem-resolution act appends a domain event too
b65949ad4 feat(db): #843 the admission-capacity act appends a domain event under the operator firm
--- #840's commits, landed before mine ---
a60a3f40d fix(web): DocumentKindDialog's trigger items referenced undefined DOCUMENT_KINDS
dbe37fa07 feat(web): #840 render the successor Work link on a cancelled row
00caf708d fix(db): #840 project the successor Work id onto a work.cancelled row
```

Working tree clean. First action was `git status` and
`git log --oneline 23cfad94..HEAD`: three #840 commits were already on the branch and its
migration `0262_activity_successor_link` was already applied to `clara_l08` (chain at 230 files
before mine, 231 after). `wave2-lane08-ticket840.md` was read before any change.

## The contract, and that it is still live

The newest Agent Brief is the 2026-09-17 triage comment, plus **two later comments that both bind**:

- the owner's confirmation (2026-09-18): route A stands — the two silent acts emit domain events
  onto the operator firm's existing timeline;
- a **correction** (the newest comment on the ticket): the brief's "Key interfaces" line naming
  `clara.list_firm_timeline` is stale. That door and `apps/web/lib/firm/timeline.ts` retire under
  **#998**; #659 already swapped Firm Home's "Recent activity" onto `clara.list_activity`. The read
  the acceptance cell asserts against moves to `clara.list_activity`; the mechanism does not. It
  also adds one scope item: **decide with #861 whether the two new types get a kind or ride the
  stated default, and say which in the acceptance cell.**

There is no owner ruling comment dated 2026-09-20 on #843.

**The ticket was still live**, measured on this rig before any change:

| what | measured |
|---|---|
| `clara.set_admission_capacity(integer,text,text)` body | sha `190d0fe847c2ab24eb6a257c68e2478f10c5df857f96e085846f6b43243a7c86` — 0186 §C's, calling `clara._audit` and **no** `clara._append_event` |
| `clara.resolve_stripe_event_problem(uuid,text,text)` body | sha `979898e7f342fa818c81c070b68f013e951dd53829eb3a8926055507349d28c7` — 0205 §1's (the #775 audit recut), same: audit only |
| `clara.event_types` | 137 rows; neither `admission.capacity_set` nor `stripe_event.problem_resolved` present |
| `clara.reject_firm_registration(uuid,text,text)` | sha `ba4f168a13d504b8ef09405fc6d7c01e3a9a448a04937c3ffb8a52170173edb1` — already audits **and** appends `firm_registration.rejected` (0145 §D), i.e. the third act was already visible |

And red at the seam: with the frontier gate temporarily satisfied (see "Vacuity controls"),
os.20 failed on `the operator's timeline carries admission.capacity_set` **after** its
`firm_registration.rejected` control had passed — the read worked, the event did not exist.

## The seams I tested at (written before the first test)

- **`clara.set_admission_capacity(p_max_firms, p_reason, p_op_key)`** — the door, driven as the
  operator-firm owner through `clara_authenticated` with real JWT claims
  (`checkout-convergence-fixtures.mjs`'s `setCapacity`), never root.
- **`clara.resolve_stripe_event_problem(p_problem, p_resolution, p_op_key)`** — same, through
  `resolveProblemWithKey` (the caller-chosen-op_key wrapper, which is what a replay cell needs).
- **`clara.list_activity(p_cursor, p_limit, p_client, p_kinds, p_since, p_until, p_work)`** — the
  read the brief's correction names, exercised as the operator-firm owner, as another firm's owner,
  and as an operator-firm **viewer** (below the bookkeeper floor).
- **`clara.event_types` / `clara.trigger_taxonomy` read as root** — the *instrument* the taxonomy
  claim is checked against, never the door under test. The migration's own §T re-reads the same
  two relations against the committed catalog, which is the AC's "tail census re-reads the
  taxonomy" and the repo's documented structural-cell standard (work-order rule 4's carve-out).

No test at a seam the brief does not give: `clara.get_activity_event`, `clara.firm_timeline_visible`,
`clara.list_operator_support_queue`/`get_operator_support_case` and `clara.audit_log`'s shape are
all untouched and unasserted-about beyond what already existed. **No `apps/web` file is touched at
all** — `list_activity`'s row renderer already prints `description` (the `event_types` sentence)
for any `source === "event"` row (`apps/web/lib/firm/activity.ts:560`), so a new event type needs
no web change to render.

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green | commit |
|---|---|---|---|
| 1 | `os.20 …` — `the operator's timeline carries admission.capacity_set` false, while the `firm_registration.rejected` control in the same cell passed | 0263 v1: register `admission.capacity_set`, recut `clara.set_admission_capacity` with one `_append_event` | `b65949ad4` |
| 2 | same cell, extended to the third act — `the operator's timeline carries stripe_event.problem_resolved` false | 0263 v2: register `stripe_event.problem_resolved`, recut `clara.resolve_stripe_event_problem`; re-applied with `CLARA_MIGRATION_REDO` | `575231cf9` |
| 3 | the isolation/floor half, proven to have teeth by two deliberate breaks (below) | no production code — the wall is `firm_timeline_visible`'s own; the slice is the acceptance the AC names | `f4b861b72` |
| 4 | `os.21 …` — `expected 1, actual 2` against a body whose append had been hand-moved in FRONT of `_reserve_op` | the committed placement (append strictly between `_reserve_op` and `_finish_op`), restored by redo | `5b664576b` |

Slices 1 and 2 are the only ones that changed SQL. Slice 2 deliberately edited and re-applied my
own unmerged migration rather than writing a second file.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A named cell in the operator support battery proves all three acts are readable on the timeline by an operator-firm owner, and that a second firm's operator reads none | **done** | `packages/db/tests/operator-support.test.mjs` **os.20**: rejects a registration, changes capacity and resolves a provider problem as the operator-firm owner, then reads `clara.list_activity` windowed on a root-measured `now()`; asserts for each of `firm_registration.rejected`, `admission.capacity_set`, `stripe_event.problem_resolved` the row's presence, `actor = operator.owner`, `client_id = null`, a non-empty `description`, and its `kind`. Then an ordinary firm's owner's page carries **none** of the three types and **no** row acted by the operator. Then an operator-firm **viewer** meets `CLR04` rather than an empty page (the brief's "a below-floor caller meets a refusal, not an empty list"). Run: **22 pass / 0 fail / 0 skipped** with the full gate chain. |
| A replay under the same operation key adds no second line, matching what os.13 proves for the audit row | **done** | **os.21**: both doors driven twice under one op_key each; `clara.domain_events` counted **as root** (the instrument) before and after — 1 and 1 for each type; both replays return the byte-identical original receipt (`assert.deepEqual`); then the same one-line-each answer read back through `clara.list_activity`. |
| The migration applies on a from-scratch chain and its tail census re-reads the taxonomy | **done, at the scope RIG.md gives a lane** | `clara_l08` was built from scratch 0001→0234 at rig setup (RIG.md), #840's 0262 landed on it, and `0263_operator_support_timeline_events.sql` applied on top on the first attempt. Its **§T** re-reads the committed catalog: both types registered exactly once as `client_scoped = false`, both routed `context_update` at the active taxonomy version, **and the whole-catalog coverage anti-join empty** (the law `rig-events-structure.test.mjs` §7 enforces). Ledger checksum `9c32fb5779b62758c894bcd22cf9d7583ff054b51e82d4342b9674f20afe36ff`, verified byte-identical to the file on disk. Chain now **231 files**. A SECOND from-scratch chain was deliberately not run: RIG.md forbids it on a reused cluster and gives the integrator a disposable one. |
| *(scope addition from the correction)* Say which kind the two new types take, decided with #861 | **done, stated in the cell** | They **ride the door's stated default, `documents`**, together with `firm_registration.rejected`. `SUPPORT_EVENT_KIND` in `operator-support-fixtures.mjs` spells it once; os.20 asserts it per type with the reasoning inline. See below. |

### The kind decision, in full

`clara.list_activity`'s ladder (0202) recognises `sweep.run_completed`, `entry.%`, `document.%`,
`close.%`, `work.%` and files everything else under `documents` — its stated `else` arm. Neither
new type matches a recognised prefix.

The decision is to **leave them there**, because the owner's #861 ruling (2026-09-18) fixes exactly
five new kinds — `people` (`member.*`, `invite.*`), `assets`, `counterparties`, `clients`
(`client.*`, `knowledge.*`), `firm` (`firm.*`) — and **none of them covers an operator admission
act**. Critically, `firm_registration.rejected` is **not** matched by `firm.%` either: its fifth
character is `_`, and `.` is a literal in a LIKE pattern. So the act that was already visible rides
the default before *and* after #861, and putting the two new types anywhere else would split the
three acts this ticket exists to show **together**. A sixth kind is new user-visible vocabulary,
and vocabulary is the owner's call, not this ticket's (work-order rule 6, and #861's own brief
says "Why human: the names and grouping of the new kinds").

**Handoff to #861, which is the next ticket in this lane:** the ladder recut must keep using
`like 'firm.%'` (with the dot). A looser `like 'firm%'` would silently sweep `firm_registration.*`
and `firm_setup.*` into the new `firm` kind — four live event types — which the owner's ruling does
not ask for. os.20's `SUPPORT_EVENT_KIND` assertion is the tripwire: if #861 does give these acts
a kind, that one constant moves and the cell moves with it.

## The migration

`packages/db/migrations/0263_operator_support_timeline_events.sql` — the number reserved for this
ticket. Stable stem `operator_support_timeline_events$`.

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed
by `to_regprocedure`, never transcribed from a file's text):

- `clara.set_admission_capacity(integer,text,text)` =
  `190d0fe847c2ab24eb6a257c68e2478f10c5df857f96e085846f6b43243a7c86` — 0186 §C's body, still live.
- `clara.resolve_stripe_event_problem(uuid,text,text)` =
  `979898e7f342fa818c81c070b68f013e951dd53829eb3a8926055507349d28c7` — 0205 §1's body, still live.
- Posture pins, measured and **deliberately different from each other**:
  - capacity: `clara_fn_owner | true | search_path=clara, pg_temp,plan_cache_mode=force_custom_plan | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner`
  - resolve: `clara_fn_owner | true | search_path=clara, pg_temp | clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner` — **no `plan_cache_mode` pin**, which 0205's own header explains ("0183's pin belongs to bodies that bind the session firm into a cached read; this is a WRITE door reached once per decision"). Pinned as it *is*, so this file can neither add nor drop one.
- Reference-shape pin: `clara.reject_firm_registration` still carries the `_audit`-then-`_append_event`
  pair this file copies (§0.5) — if the convention moved, this file would be inventing one.
- Arm censuses per door (owner floor, operator fragment, reservation pair, audit call, advisory
  lock; plus the resolution stamp and both refusals on the sibling) so a failure names *which*
  property the sha stood for.

**Post-state, measured after the final apply:** capacity
`a0cb5ac6a03830552f5cf4ed122244ae9b429b1cfb172404199265c4a6eaa49b`, resolve
`46bb3d5a1efa389d8ac3ed54ca8782075934a3a40d80bd49fd351cc237500525`.

**What it changes.** Two `clara.event_types` rows + their `clara.trigger_taxonomy` routing at the
active version, and **one `perform clara._append_event(...)` statement added to each of two
bodies**, via `create or replace` over unchanged signatures. Both bodies were reproduced from the
**live `prosrc`** and diffed against it before applying: the only difference in each is my added
statement and its comment.

- `clara.set_admission_capacity` → `admission.capacity_set`, payload `'{}'::jsonb`.
- `clara.resolve_stripe_event_problem` → `stripe_event.problem_resolved`, payload `{problem}`.

**Naming.** `<aggregate>.<fact>`, the catalog's house shape (`bank.account_created`,
`bank.line_exception_resolved`, `firm_setup.item_answered`), where the aggregate is the thing
decided about and never the function that decides. Both firm-level (`client_scoped = false`) — an
admission act names no client, the brief's own words — and both routed `context_update`, 0145 §G's
own choice for the registration decisions ("an operator's ruling is not something that wakes the
agent").

**Payload confidentiality is a rule here, not a shortcut.** `clara.domain_events` is read
**estate-wide** by `clara_runtime` (0005 N2), while `clara.audit_log` is firm-scoped under forced
RLS. `clara.reject_firm_registration` already draws that line inside one body: audit
`{request, reason}`, event `{request}`. So the resolution's free text and the Stripe event id stay
on the audit row, and the capacity figures (`max_firms`/`firms_count` — precisely the
business-confidential numbers #628's review round S4 moved *behind* the operator wall) stay there
too, which is why that event's payload is empty, matching `member.role_changed`'s own `'{}'`.
§T asserts the **exact** payload text of both appends for this reason. Neither payload is visible
on the timeline in any case: `clara.firm_timeline_visible` projects no `payload` column.

**Placement is the whole idempotence claim, and §T measures it positionally.** Each append sits
immediately after the `_audit` call — `reject_firm_registration`'s own order — and strictly between
`_reserve_op` and `_finish_op`, so a replay returns at the `v_dedupe` guard above both writes. §T
compares `position(...)` of the three calls rather than asserting the placement in prose.

**Two prestate rules were deliberately relaxed in slice 2, and the reason is the redo path.** A
first draft refused any state where the two doors disagreed, or where a type was registered without
an appender. Both refusals make the file **un-redoable**: `clara.event_types` is append-only
(0005 / `rig-events-structure.test.mjs` §6), so a registration can never be withdrawn, and a rig-side
revert of one body (exactly what a vacuity control does) would have left no way back. The committed
file instead pins **each door's own body** (the check that matters — nothing is overwritten unread)
and refuses only the direction that actually breaks at runtime: **a body appending a type the
catalog does not carry**, which would raise a foreign-key violation on every call
(`clara.domain_events.event_type references clara.event_types(name)`). The observed per-door state
is named in the prestate notice rather than silently tolerated.

**Redo, used twice, both recorded.**
1. Slice 2: after editing 0263 to add the second half,
   `CLARA_MIGRATION_REDO=0263_operator_support_timeline_events` re-applied it (new checksum
   `9c32fb57…`). One failed attempt preceded it — §0.4's arm census read a `v_src` that §0.3's new
   block had reassigned to the sibling's body, so it reported "missing arm(s): reserve_op finish_op
   audit-call advisory-lock" against the wrong function. The runner rolled it back cleanly and
   recorded nothing; I re-selected the body at the top of §0.4 and it applied.
2. Slice 4: to restore the committed body after the deliberate break (below). Same checksum,
   `9c32fb57…`, and the door's sha returned to `a0cb5ac6…`.

**No new rig-meta cohort, measured rather than omitted.** Both doors keep their existing cohorts
(`CHECKOUT_CONVERGENCE_0186_COHORT` for the capacity door, `CHECKOUT_GATE_C2_HUMAN_FNS` for the
resolve door): no new function name, no signature change, no grant change — each re-read by §T
after the recut. The file's other effect is reference data, which no cohort in `rig-meta.mjs`
enumerates; the estate's coverage law over the catalog lives in `rig-events-structure.test.mjs` §7
and 0263's tail re-reads that anti-join itself. A `#843` / `#843 END` bracketed note beside
`CHECKOUT_CONVERGENCE_0186_COHORT` records it — the same shape #840's own note carries five
sections below.

**Preintegration gate module**: `packages/db/tests/operator-support-timeline-preintegration-gate.mjs`
(`CLARA_ALLOW_MISSING_OPERATOR_SUPPORT_TIMELINE=1`), wired into `packages/db/package.json`'s `test`
script **in migration order**, immediately after `activity-successor-link-preintegration-gate.mjs`
(#840's, the only other new one in this lane). The first #843 cell uses the LOUD discriminator
`assertSupportTimelineCohortPresent`, the second the quiet counted `gateSupportTimeline` — the
double-gate idiom `accrual-adjustments-fixtures.mjs` documents and `activity-feed.test.mjs` uses
for #840.

## Vacuity controls

Four, each restored byte for byte afterwards.

1. **The substantive red for slice 1** could not be seen through the frontier gate (it fails first,
   correctly, on "the migration is absent"), so `SUPPORT_TIMELINE_STEM` was temporarily pointed at
   `operator_support_console$` — a stem that *is* applied. os.20 then failed on
   `the operator's timeline carries admission.capacity_set` with its `firm_registration.rejected`
   control passing. Stem restored from a saved copy.
2. **The isolation half has teeth**: the outsider's read was temporarily pointed at
   `operator.owner`; the cell failed on
   `another firm's owner reads no firm_registration.rejected row`.
3. **The floor half has teeth**: the `assertRaises` probe was temporarily pointed at the owner; the
   cell failed on `expected SQLSTATE CLR04 but the call SUCCEEDED (no error)`.
4. **os.21's own red**: `clara.set_admission_capacity` was hand-recut on the rig (raw SQL through
   `set role clara_fn_owner`, **never a second migration file**) with its `_append_event` moved in
   FRONT of `_reserve_op` — measured: append at offset 1071, reserve at 1212 — and os.21 failed on
   `expected: 1 / actual: 2`, i.e. the replay appended a second line. Restored through
   `CLARA_MIGRATION_REDO=0263_operator_support_timeline_events` and the whole battery re-run green.

**And the gate module is proven not to be dead.** With `SUPPORT_TIMELINE_STEM` temporarily pointed
at an unapplied stem: a FOCUSED run failed loudly with the module's own sentence
("Apply 0263_…, or set CLARA_ALLOW_MISSING_OPERATOR_SUPPORT_TIMELINE=1"), and a run with the full
gate chain reported **22 tests / 20 pass / 0 fail / 2 skipped** — including a green vacuity control,
which is the point of the frontier-aware count.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55748 PGUSER=postgres PGDATABASE=clara_l08
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every battery ran with the **full gate chain** from
`packages/db/package.json` (`node --test --test-concurrency=1 $GATES tests/<file>.test.mjs`).
`CLARA_RIG_ALLOW_RESET` / `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| `tests/operator-support.test.mjs` (touched, +2 cells) | **22 pass / 0 fail / 0 skipped** (os.01–os.19 unchanged, os.20/os.21 new, vacuity control green) |
| `tests/operation-census.test.mjs` (touched `packages/db/tests`) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (touched `packages/db/tests`; **no reset flags**) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which demands `CLARA_RIG_ALLOW_RESET`; RIG.md forbids it |
| `tests/rig-events-structure.test.mjs` (the estate's event-catalog coverage law) | **14 pass / 0 fail / 0 skipped** |
| `tests/s6-tasks.test.mjs` (the second full-taxonomy-routing census) | **9 pass / 0 fail / 0 skipped** |
| `tests/counterparty-merge-pr-1.test.mjs` (cm.17's own unrouted-type anti-join) | **19 pass / 0 fail / 0 skipped** |
| `tests/p4t2-approval.test.mjs` (the third act's own battery) | **22 pass / 0 fail / 0 skipped** |
| `tests/checkout-convergence.test.mjs` (owns `set_admission_capacity`) | **36 pass / 0 fail / 0 skipped** |
| `tests/checkout-gate-c2.test.mjs` (owns `resolve_stripe_event_problem`) | **18 pass / 0 fail / 0 skipped** |
| `tests/checkout-gate-c3.test.mjs` | **69 pass / 0 fail / 0 skipped** |
| `tests/activity-feed.test.mjs` (the door the new rows are read through; #840's own battery) | **33 pass / 0 fail / 0 skipped** |
| `pnpm typecheck` (worktree root) | **exit 0** — `apps/web` and `packages/runtime` both `Done` |
| `pnpm lint` (worktree root) | **exit 0** |

**No `apps/web` gate is owed and none was run**: `git diff --stat b65949ad4^..HEAD` shows this
ticket touches only `packages/db/**` and the two root docs. **No `packages/runtime` gate is owed**:
nothing there is touched, so `check-frozen-workflows.mjs` and `check-parts-parity.mjs` govern no
manifest that could have moved.

Known Windows-only reds (RIG.md): none was encountered, because none of them lives in the files
this ticket runs.

## Docs, in the same commits

The four slice commits carry the code; `6b9ac9aed` carries the docs, in its own commit rather than
folded into the slices (the slices were committed as each went green). Named here rather than
glossed over.

- **`CONTEXT.md`**: new term **"Operator support act"**, in the house `term / definition / _Avoid_`
  shape, inserted between the existing "Operator support case" and "Support receipt" so the three
  admission terms sit together. It states the three acts, that each now leaves an audit row **and**
  one domain event under the operator firm, that the act is readable on that firm's Activity and on
  no other's, and that a repeat under the same operation key writes neither again. Approval is
  named in the definition as the same shape with one difference (it also mints a firm), rather than
  being pushed into `_Avoid_` where it would read as "not an operator act".
- **`packages/db/tests/README.md`**: a new section
  `## operator-support.test.mjs os.20 / os.21 — #843 / migration 0263`, placed after the existing
  `os.19` section. It documents why the read moved off `clara.list_firm_timeline`, what each cell
  proves, the kind decision and its #861 handoff, the frontier stem and gate module, the
  frontier-aware vacuity count (and the latent gap it does **not** close), and why no rig-meta
  cohort is owed.
- **`packages/db/tests/rig-meta.mjs`**: the `#843` / `#843 END` bracketed note beside
  `CHECKOUT_CONVERGENCE_0186_COHORT`.
- **`packages/db/README.md`: no section added**, deliberately. That file documents subsystems, and
  none of 0145 / 0186 §C / 0205 — the lineage this ticket extends — has one; the same bar #840's
  0262 recorded for its own body-only recut. The migration documents itself at length (≈105 header
  lines covering the naming, the kind decision, the payload rule, the placement and the redo
  posture).
- Shared files touched, minimally and at the sorted position: `packages/db/package.json` (one
  `--import` token, in migration order), `packages/db/tests/rig-meta.mjs` (a bracketed comment),
  `CONTEXT.md` (one term). `apps/web/messages/en.json`, `apps/web/test/manifest.txt`,
  `apps/web/e2e/*`, `apps/web/lib/navigation/tree.ts` and
  `.github/actions/db-live-gates/action.yml` are all **untouched** — the gate chain lives in
  `package.json`, not in the CI action.

## Successor contract

**None is owed.** Neither recut changes a signature, a parameter, a refusal or a return shape:
`clara.set_admission_capacity(integer,text,text)` still returns
`{status, max_firms, reason, firms_count, full, updated_at}` with the same six `detail.reason`
values, and `clara.resolve_stripe_event_problem(uuid,text,text)` still returns
`{problem_id, event_id, resolved}` with the same four refusals. `clara._append_event` validates no
caller input, so no new refusal exists to map. No frozen chat body, frozen Work tool, zod input,
door-call argument order, part kind or prompt stanza is affected, and `packages/runtime` is not
touched at all — no manifest `check-frozen-workflows.mjs` governs could have moved, which is why
it was not run.

The only thing a later caller inherits is **vocabulary**, recorded here so the shared
`chatTurn_v22` / `claraWork_v6` cut at the end of wave 4 does not have to rediscover it:

| event type | client_scoped | taxonomy decision | payload | appended by |
|---|---|---|---|---|
| `admission.capacity_set` | `false` | `context_update` | `{}` | `clara.set_admission_capacity` |
| `stripe_event.problem_resolved` | `false` | `context_update` | `{"problem": <uuid>}` | `clara.resolve_stripe_event_problem` |

Both surface on `clara.list_activity` as `source: "event"` rows with `kind: "documents"`,
`client_id: null`, `actor` = the deciding operator, and `description` = the registered sentence.

## Follow-ups worth filing

1. **#861 must use `like 'firm.%'`, with the dot.** A looser `firm%` would sweep
   `firm_registration.approved/paid/rejected` and the four `firm_setup.*` types into the new `firm`
   kind — seven live event types the owner's ruling never mentions. This is a handoff inside lane
   08 rather than a new issue, but it is the single sharpest way #861 could go wrong.
2. **`operator-support.test.mjs`'s vacuity control is still unconditional for the four #776 name
   cells.** `EXPECTED_CELLS = 19` counts os.15–os.18, which gate on the *separate*
   `operator_support_applicant_name$` frontier — so a database carrying 0188 and **not** 0206 reds
   the control while saying nothing about anything. Pre-existing, not caused here, and deliberately
   not widened: I gave my own two cells the frontier-aware count (`EXPECTED_TIMELINE_CELLS`) and
   left the older four exactly as they were. Worth a small ticket.
3. **A human-readable operator surface is still not a *console*.** This ticket makes the three acts
   readable on the operator firm's own Activity, which is what route A asked for; it does not give
   the operator console its own activity panel. If the owner ever wants one, the natural shape is a
   web read of `clara.list_activity` on the operator firm — no new door — plus, at that point, the
   question of whether admission acts deserve their own kind (deliberately left to the owner here).
4. **`apps/web/components/documents/document-kind-dialog.tsx`** was fixed by #840 in this lane
   (`a60a3f40d`, not named `#840`). Unchanged by me; #840's report already flags for the integrator
   that more than one lane may carry the same one-line fix.

## Anything unverified

- **The hosted estate.** Nothing here is hosted evidence; hosted evidence is pending and not mine
  to claim.
- **A true from-scratch 0001→0263 chain, independently re-run.** Not run, by RIG.md's rule (one
  from-scratch chain per cluster; the integrator runs the proof on a disposable one). 0263's
  prestate and tail both ran and passed on every one of the four times it was applied on this rig
  (first apply, slice-2 redo, slice-4 restore redo, and the failed slice-2 attempt that rolled
  back cleanly).
- **The relay's behaviour on the two new `context_update` types.** `packages/runtime` was not
  touched and no runtime battery was run. The reasoning is precedent, not measurement: 0145
  registered two operator-decision types at the same decision and needed no runtime change, and
  `context_update` is the taxonomy's own "do not wake the agent" arm. If the integrator wants that
  measured rather than inherited, `packages/runtime/tests/relay-taxonomy.test.mjs` is the file.
- **Whether any sibling lane registers a colliding event type name.** I have no visibility into
  other worktrees. `admission.*` and `stripe_event.*` are both new aggregates in a 137-row catalog,
  so a collision is unlikely, but the `on conflict (name) do nothing` in §1 means a colliding
  registration with a *different* description would be silently kept rather than refused — worth
  one glance at integration time.
