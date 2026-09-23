# Wave 3, lane 07 — fix round 1 (single fix worker)

Branch `riders/w3-lane07`, worktree `C:\Users\zhant\Desktop\clara-wt\657`, database
`127.0.0.1:55747/clara_l07`.
Base `ffe63a0dd084e99b84c1368119845be273c421ce`.
**New head: `ac4cae6eedc8e8d7e1269b8b758ccfa92f1789e1`.**

Three new commits on top of the fifteen the lane already carried:

| commit | subject |
|---|---|
| `75275dd22` | `fix(db,web): #899 the birth wall is serialised, records its identifier, and names its one residual` |
| `531c6f3f9` | `test(db): #1012 the opening-ledger premise is a floor, so a republication cannot retire the battery` |
| `ac4cae6ee` | `fix(db): #889 the merge door stops being a cross-tenant oracle, and its census reads the value` |

Start state: `git status` clean, `git log ffe63a0d..HEAD` showed the fifteen landed commits. The
"20 uncommitted files" the prompt warned about were not present — they had already been committed
as `df415469f` / `1494cdd98` / `89baede04`.

---

## Findings, one by one

### SPEC-L07-01 — blocker — `create_client` keeps its grant and its unwalled insert
**PARTLY FIXED; the entrance itself is REFUTED as closable inside #899, with the measurement.**

Reproduced: a live sweep on `clara_l07` returns `create_client | auth_exec=t | direct_insert=t |
via_core=f`, and the census cell asserted that residual as if it satisfied AC3.

Measured why neither of the two remaining per-verb answers is available here:

- **Withdraw the grant** — `packages/db/tests/rig-fixtures.mjs:68`'s shared `createClient()` calls
  the verb through `humanQuery`, i.e. a real `clara_authenticated` session, and so do a dozen more
  files directly (`f-a7-pi`, `firm-commercial-settings`, `firm-portfolio-pack`,
  `coa-template-pr-b-helpers`, `rig-events`, `rig-invariants`, `wave-b/wb-g-opkeys`,
  `wave-b/wb-o-lifecycle`, `wave-b/wb-r3`, `audit-actor-role`, `client-birth-wall` itself). Three
  cells exist to pin this verb AS a granted human door: `rig-isolation` T23 ("create_client is
  admin-only", a bookkeeper meets CLR04), T16 (a human `create_client` ignores a foreign
  wake_secret), and `wave-b/wb-helpers.mjs`'s grant matrix (`create_client: ["authenticated"]`).
  Revoking turns those into 42501 and rewrites the RBAC invariants of two shared batteries.
- **Re-point the body** — the wall refuses at arity ≥ 2, and `buildWorld()` puts two same-family
  clients in firm A by construction, so `buildWaveBWorld()`'s `A3_archived` (the base of all 46
  wave-b files) would refuse. It cannot be renamed out of the family: `SANDBOX_MARKER_RE` requires
  the marker to START every fixture name, and `clara.name_family_token` is the name's FIRST token,
  so every marked name in a firm shares one family by construction.

So closing it needs an estate-wide fixture migration, which is a ticket of its own (successor
contract below). What the commit does instead, and it is a real catalogue change, not prose:

- **0287 §C2 marks the verb SUPERSEDED in the catalogue** — `comment on function
  clara.create_client(text,text)` naming `open_client_onboarding` as the successor and saying in
  the same sentence that the gap is still open. That is the brief's third per-verb answer
  ("superseded, re-pointed, or grant withdrawn"), given where any reader of `pg_proc` can see it.
  Body and grant are untouched and still pinned byte-for-byte by the prestate and the tail; a new
  tail check (T.5c) refuses if the comment is missing.
- **The census stops reading as satisfaction.** The cell is renamed
  `p899.census.granted_client_minters_and_the_one_residual` and its message now says the criterion
  is OPEN while the array is non-empty, that a new member is a regression, and that an EMPTY array
  means the census and the ticket's own criterion should both be rewritten.
- **A new cell bounds the reach**: `p899.census.create_client_residual_is_bounded` asserts the
  catalogue comment is live, sweeps `apps/web/app|components|lib` and every `packages/runtime`
  production tree for the verb (**empty**), and records that the one non-test caller anywhere —
  `packages/db/scripts/onboard-rpr.mjs` — runs as the postgres superuser with a jwt GUC and never
  `SET ROLE`s to `clara_authenticated`, so it does not ride the grant this residual is about.

`#899` is therefore still **PARTIAL** on that acceptance criterion, and both the migration header
and `packages/db/README.md` now say so in those words.

### SPEC-L07-02 — major — a third live browser creation path — **FIXED**
`apps/web/components/clara/OnboardingBeginCard.tsx` now calls `openClientOnboarding(name, {
acknowledgedCandidate: null }, { session })`. It has no candidate read and no acknowledgement face,
so the door refuses at arity 1 (`identity_acknowledgement_required`) and the refusal — which names
the register's Add Client control — renders verbatim in the banner the card already had.
`apps/web/lib/onboarding/api.ts`'s claim that this card "is this door's one remaining direct caller
and needs no change" is corrected in place: it was wrong in exactly the case that mattered.
New cell `D3` in `apps/web/components/clara/onboarding-begin-keyboard.test.tsx` pins the door
name, `p_acknowledged_candidate === null`, `p_identifier === null`, and the rendered refusal; F5
and F6's mocks moved to the new door with it (they were red against the old handler name first).

### SPEC-L07-03 / W3L07-ADV-02 / F1 — `sandbox-marker.test.mjs` sbm.3 red — **FIXED**
Reproduced (2 pass / 1 FAIL, naming `0287:58` and `0287:77`). The two header lines now name
`SANDBOX_PREFIX` and `tests/fixtures/sandbox-marker.mjs` instead of quoting the value. The census
is not weakened and no file is exempted by name. `sandbox-marker.test.mjs` → **3/3 pass**.

### SPEC-L07-04 — minor — the README miscounts the entrances — **FIXED**
`packages/db/README.md`'s birth-wall section now says the triage measured TWO entrances, that ONE
is closed and the OTHER (`create_client`) is an open residual marked superseded, matching the
migration header word for word. The same section gained the advisory-lock and identifier-recording
paragraphs and the three-cell description of how the residual is bounded.

### W3L07-ADV-01 — major — the client birth wall is a TOCTOU — **FIXED**
Reproduced with my own cell before the fix: session B did not block on the wall, it blocked late on
`firm_event_seq` with its client row already inserted, then committed — the reviewer's transcript
exactly. `clara._client_birth_core` now takes
`pg_advisory_xact_lock(203005008, hashtext(p_firm::text || ':' || coalesce(clara.name_family_token(p_name),'')))`
immediately before the candidate read: the estate's own firm-scoped guard idiom (0006, 0007, 0009,
0011, 0015, 0016, 0017, 0022) at a new classid, keyed on (firm, family) so unrelated births never
wait on each other. New cell `p899.new_verb.concurrent_same_family_serialised` drives two real
connections, proves the block from `pg_blocking_pids` (never a sleep), and asserts that after A
commits, B meets `name_family_collision` at arity 2 and exactly ONE of the two racers was born.
0287's tail (T.5b) asserts the lock is taken BEFORE the read, not after.

### W3L07-ADV-03 — major — the merge door is a cross-tenant existence oracle — **FIXED**
Reproduced: another firm's real counterparty ids → `CLR23 cross_client`; ids that exist nowhere →
`CLR11`. 0289 now splices a SECOND anchor that lifts the firm test out of the combined guard and
answers it `CLR11 counterparty not found`; the client test keeps its own CLR23 token, message and
detail.

The widening past the ticket's narrowed scope was weighed, not waved through, and the argument is
in the migration header: this file already recuts this exact body, the estate has a WRITTEN law
naming the correct answer (`rig-helpers.mjs`: `notFound: "CLR11", // not-found-in-your-firm (NO
existence oracle)`), and the two cells that pin this door's refusals already admit the corrected
answer — `wave-a-merge.test.mjs:65` accepts `CLR23` **or** `CLR11` for the cross-FIRM case by name,
and `counterparty-merge-pr-1.test.mjs:506`'s cm.19/3 pins `cross_client` for a SAME-firm,
different-CLIENT pair, which this splice leaves exactly as it was. Both re-run green.
New cell `p889.merge.no_cross_tenant_oracle` asserts foreign-real and nowhere-at-all produce the
same code, message and reason, that a mixed pair answers the same, and that the same-firm
different-client case still answers `cross_client`.

### W3L07-ADV-04 — major — `opening-ledger-source.test.mjs`'s premise fails OPEN — **FIXED**
The premise is now a FLOOR (`seen.v >= MIN_PUBLISHED_REGISTRY_VERSION`, still exactly one published
version) and the registry cell asserts the same floor rather than the literal. A pre-0228 chain
(version 1) is still refused; a later republication raises the number and the battery keeps
running, so what reds is the row CONTENT this file owns.
Vacuity control, run and restored: with the floor deliberately set to 5, a focused run fails loudly
("publishes version 4 … expected at least 5"); restored, 12 pass / 0 fail / **0 skipped**.

### W3L07-ADV-05 — minor — the closed-world census is weak — **FIXED**
`p889.census.no_legacy_writer` now (a) closes the roster on the SIGNATURE, not the bare name, so an
overload cannot hide inside a member; (b) iterates EVERY `insert into clara.counterparty_aliases`
in each body, not only the first; (c) reads the VALUE at the `recorded_via` position with a
depth-aware, quote-aware split, and requires a literal honest lane (`'human_ui'` / `'agent'` /
`'seeding'`) — a body that named the column and bound it to a variable, a parameter or
`'legacy_unknown'` used to pass. The parser is proved non-vacuous in the same cell against a
crafted body with two inserts, a `format('a, %s', …)` value and one variable binding.

### W3L07-ADV-06 / SPEC-L07-05 — minor/note — `p_identifier` is an unrecorded guard input — **FIXED**
`_client_birth_core` now WRITES the identifier it walled against into `clara.client_identifiers`,
under `clara.add_client_identifier`'s own normalisation, so the wall a caller cleared with an
identifier also holds for the next caller. New cell
`p899.new_verb.identifier_is_recorded_not_only_consulted` proves the row lands with the right kind,
normalised value, firm and `added_by`; that the read then answers arity 1 with `match_reason =
identifier` under a completely different name; that the door refuses that second birth
unacknowledged; and that a malformed identifier refuses before anything is created. 0287's tail
asserts the write is in the installed body. The parameter and the header now say what it is.

### Findings I did NOT act on
- **SPEC-L07-06** (note, dead 410 branch in `seeding-parse.mjs`) — the brief offered either shape;
  the implementer's own follow-up 4 carries it to the Client-KB lane. Unchanged.
- **W3L07-ADV-07 / ADV-08** (notes, deploy ordering and 0288's row-count/sha pins) — both are
  integrator instructions, not code changes. Carried into "for the integrator" below.
- **W3L07-ADV-09** (note, evidence gap) — partly closed (see gates); the runtime e2e spawners are
  still not run by this lane, see "unverified".

---

## One red the three review lenses did not run for

The whole `apps/web` unit suite was red on this branch **before** this fix round: eight cells
failed with `sql_function_census_unresolved_execute:0289_merge_alias_lane.sql:v_post`
(`do-action-floors.test.ts` ×3, `firm-capability-floors` ×2, the role-ladder census,
`firm-scope-db-pins.test.ts` ×2, `parity-holes`). Proven pre-existing by running
`semanticFunctionOperations` over the **committed** 0289 in isolation: same error.

Cause: `apps/web/test/sqlFunctionCensus.ts` follows a dynamic `execute` back to the function it can
PROVE is being rewritten, by walking TOP-LEVEL assignments whose base is a `pg_get_functiondef` at
a literal regprocedure. 0289's base arrived from a temp-table SELECT and its transform chain lived
inside an `if/else`, so the census failed closed.

Fixed in 0289 itself: S1 reads its base with `select pg_get_functiondef(p.oid) … where p.oid =
'clara.merge_counterparties(uuid,uuid,uuid,text,text)'::regprocedure` and asserts it equals what
the prestate stashed (a real added check — nothing recut the body between S0 and S1), then derives
both images **branch-free**, one `replace()` per statement, exploiting the fact that a forward
replace whose anchor is gone is a no-op. The branch now only chooses which anchor counts to assert.
0289 also gained the `REVIEWED_DYNAMIC_SQL_BARRIERS` entry it shipped without (sha
`2832301c…`), which is what `firm-scope-db-pins.test.ts` needs to record it as a reviewed barrier.

---

## Migrations: how they were re-applied, and both branches proven

`CLARA_MIGRATION_REDO` (#957) refuses any version that is not the HIGHEST applied one, and this
lane's edits are to the LOWEST of three unmerged migrations. The re-apply used was: assert the top
three applied versions are exactly this lane's three, delete the ledger rows of 0288/0289, run the
supported redo for 0287, then let the ordinary apply path re-run 0288 and 0289 (both redo-safe and
bimodal by their own headers). **The two ledger deletes are a hand step the supported path does not
cover; they are recorded here rather than hidden.** 0288's file is byte-unchanged, and its checksum
still matches the corpus pin `6b6c5d03…`.

**First-apply branches driven with the FINAL text, not only redo:**
- `0289` — `clara.merge_counterparties` was restored to its measured pre-image
  (`840180a8…`, derived from the live post-image by the exact inverse of 0289's own splice), its
  ledger row dropped, and the file applied: `#889 tail (1/2): OK (branch first_apply) … the
  re-substitution reproduces the pre-image byte-for-byte`. A redo immediately afterwards reported
  `(branch redo)` with the same post-splice sha.
- `0287` — its bimodal pin is on `begin_client_onboarding`'s PRE-0287 body
  (`1b0cfc06…`), which this fix round does not touch, so that branch's evidence is the ticket
  report's; every redo in this round took the REDO branch and the tail passed each time.

**Final ledger / file checksums on `clara_l07`:**

| version | checksum |
|---|---|
| `0287_client_birth_wall` | `926570adb1cdc3a1e429a887cc988788f24ab4b506b7e14fd7d96a615ebc3b38` |
| `0288_seeding_lane_retired` | `6b6c5d031e2fe33de52c935befe35a4efcc8c4e321b53c4c2943f99ca34857bc` (unchanged) |
| `0289_merge_alias_lane` | `2832301cfc379c493fefa5a7e88fe7752fc2e5b74033bd9f1f0895bce2c68e9e` |

**Pins that moved and must be re-measured by anyone downstream:**
- `clara.merge_counterparties` post-splice `sha256(prosrc)`: `2e4cb1af…` →
  **`ac31da36065caa5f3682d7792d6bad2c49ffd06665adfef6e343f64107f228e7`** (0289 S0's redo branch,
  0289 S2's tail, and `merge-alias-lane.test.mjs`'s `MERGE_ALIAS_LANE_POST_SHA` — all three
  updated together). Its PRE-image pin `840180a8…` is unchanged.
- `apps/web/tests/firm-scope-db-pins.corpus.ts` gained `0289_merge_alias_lane.sql` at sha
  `2832301c…`. **If 0289 is edited again, re-measure that entry.**
- No other prestate pin in the lane moved: `clara.create_client`, `clara.client_identity_candidates`
  and 0287's six preamble routines are all still at their original measured pre-images (0287's own
  tail T.4 re-checks them on every apply).

---

## Gates, with counts

| gate | result |
|---|---|
| `packages/db` `client-birth-wall.test.mjs` (87-flag chain) | **14 pass / 0 fail** |
| `packages/db` `merge-alias-lane.test.mjs` | **3 pass / 0 fail** |
| `packages/db` `sandbox-marker.test.mjs` | **3 pass / 0 fail** (was 2/1) |
| `packages/db` `opening-ledger-source.test.mjs` | **12 pass / 0 fail / 0 skipped** |
| `packages/db` + `seeding-lane-retired`, `ninth-rowkind-seeding-proposal`, `client-onboarding-identity`, `document-capability-registry`, `firm-portfolio-pack` | **93 pass / 0 fail** (combined run) |
| `packages/db` `operation-census` + `rig-isolation` | **32 pass / 0 fail / 1 skip** (T19, reset flag correctly unset) |
| `packages/db` `counterparty-merge-pr-1` + `wave-a-merge` + `counterparty-identity` + merge/birth | **64 pass / 0 fail** |
| `packages/db` `wave-b/wb-o-lifecycle`, `wb-g-opkeys`, `wb-s-seeding`, `wb-x-crossfirm`, `wb-r3`, `name-only-guard`, `rig-invariants`, `rig-events`, `audit-actor-role` | **83 pass / 0 fail** |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4846 pass / 0 fail / 2 skipped**, 4848 tests (was 8 fail) |
| `apps/web` `onboarding-begin-keyboard.test.tsx` | **3 pass / 0 fail** |
| `pnpm typecheck` | **pass** (one TS2532 introduced and fixed) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** (one raw-colour hit on a `#899` string in a test title, reworded to "ticket 899" as the rule's own message prescribes) |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `node scripts/check-dead-citations.mjs` | clean |
| e2e `client-create-walk` on 3560/3561/3562 | **4 passed** |
| e2e `home-board-walk` on 3560/3561/3562 | **28 passed** |

No known Windows-only red was touched or "fixed".

---

## Docs updated

- `packages/db/README.md` — the birth-wall section's entrance count corrected; the supersession,
  the advisory lock, the identifier write and the three bounding cells added; the merge door's
  lock-order section gained the firm-scope/CLR11 paragraph.
- `packages/db/tests/README.md` — the birth-wall battery's cell count and the two new cells; the
  census description rewritten so it cannot be read as satisfying AC3; a new section for
  `merge-alias-lane.test.mjs`, which had none.
- `apps/web/lib/onboarding/api.ts` — the false claim about `BeginOnboardingCard` corrected, and
  `openClientOnboarding`'s `identifier` documented as recorded.
- `CONTEXT.md` — unchanged. Nothing here coins a domain term: "birth wall", "existence oracle" and
  "recording lane" are all already this estate's vocabulary.

---

## Deliberate judgements (smells left standing, with the reason)

- **`beginClientOnboarding` in `apps/web/lib/onboarding/api.ts` now has no caller.** Kept, not
  deleted: `clara.begin_client_onboarding` is still a live, granted door the rig and the runtime
  drive, and `api.test.ts` pins its request shape. Deleting the only typed client for a live door
  to remove an unused export trades real coverage for tidiness. Its doc comment now says plainly
  that no web caller remains and that a new face uses `openClientOnboarding`.
- **`create_client`'s residual** — see SPEC-L07-01. Named, bounded, tested, and left open on
  purpose; the alternative is an estate-wide fixture migration inside a fix round.

## Successor contracts / follow-ups worth filing

1. **Move the rig's client fixtures off `clara.create_client`, then withdraw its grant.** The work:
   change `rig-fixtures.mjs`'s `createClient()` and the ~12 direct callers onto
   `open_client_onboarding`; rewrite `rig-isolation` T16/T23 and `wave-b/wb-helpers.mjs`'s grant
   matrix to pin the verb as unreachable rather than admin-only; and either change the sandbox
   naming so fixture names do not all share one family token, or give `buildWaveBWorld`'s third
   client its own firm. Only then can `create_client` be re-pointed or ungranted and
   `p899.census.granted_client_minters_and_the_one_residual` assert an EMPTY array. This is the one
   thing standing between #899 and its census criterion.
2. **`clara.merge_counterparties`' guard order is fixed for the FIRM; the same shape may exist on
   other doors.** 0015's "look the row up by id, then compare the firm" idiom is not unique to this
   body. A sweep of every SECURITY DEFINER door that looks a row up without a firm predicate and
   then answers something other than CLR11 would be a worthwhile ticket.
3. **`packages/db/tests/binding-proposal-pr-1-helpers.mjs` is now imported by a second battery.**
   Its two-session machinery (`twoSessions`, `asHumanSession`, `waitBlockedByOrThrow`) is generic
   and there are at least four hand-copies of it in the tree. Worth promoting to `rig-helpers.mjs`
   and deleting the copies.
4. **A migration whose dynamic SQL the web census cannot follow reds eight `apps/web` cells.**
   Nothing tells a migration author this until the whole web suite runs. A one-paragraph rule in
   `packages/db/README.md`'s splice section (base from `pg_get_functiondef` at a literal
   regprocedure; one `replace()` per top-level assignment; never inside an `if`) plus the corpus
   entry requirement would have saved this round.

## For the integrator

- 0288 is byte-unchanged and its corpus pin still matches; **0287 and 0289 both moved**, so
  re-measure anything keyed on their content.
- The release order note from W3L07-ADV-07 stands: **0288 must land before the web build** that
  drops the `seeding_proposal` row kind, or open rows render as "Unrecognized item".
- W3L07-ADV-08 stands: if a sibling lane adds a `document_capabilities` row or recuts
  `clara.list_review_queue` before 0288 merges, 0288 §C/§D must be re-derived by hand.
- A true from-scratch chain is still owed (this lane's database has been re-applied, not rebuilt).

## Unverified

- The runtime e2e spawners that drive `clara.begin_client_onboarding` (`interview-e2e.mjs`,
  `interview-kill-resume-e2e.mjs`, `kdoc-opening-tb-e2e.test.mjs`, `wave-b-opening-parse.test.mjs`,
  `wave-b-lint-belt.test.mjs`) were **not run** — they admit only `clara_rt_test`/`clara_wave_b_ci`
  and need a cloned database per RIG.md. The argument that they are unaffected is structural, not
  measured: the advisory lock only serialises concurrent callers of the same family and changes
  nothing for a single session, and the identifier write is guarded by `p_identifier is not null`,
  which the two-argument legacy door always passes as null. `packages/runtime` is untouched by this
  round and `check-frozen-workflows` / `check-parts-parity` are green.
- No clean whole-suite `packages/db` run exists for the branch's final state (the lane's own
  report says the same); the 300-odd cells re-run above are the files this round touched plus every
  battery that drives a body it changed.
