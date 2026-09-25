# Riders sweep wave — lane 06, fix round 2

Branch `riders/wS-lane06`, worktree `C:\Users\zhant\Desktop\clara-wt\658`, base `7bc5a710f`.
Database `clara_l08` on `127.0.0.1:55748`; Playwright triple `3570 / 3571 / 3572`.
Single fix worker, second round. No status-report request arrived during this round.

The independent recheck (`waveS-lane06-recheck.json`, verdict accept-with-fixes on head `5c086b8f2`)
left **two** findings open, both major, both EVIDENCE gaps rather than code defects — 22 of 24
findings were confirmed fixed and nothing was newly broken. This round closed both by producing the
evidence each one asked for, on this host, rather than by carrying them forward:

| finding | ticket | what the recheck asked for | outcome |
|---|---|---|---|
| SPEC-1141-AC1 | #1141 | a reproduction on different infrastructure/load, or an explicit ruling in its place | **reproduced** — 10 red before the fix, 10 green after, under a load whose shape was derived from a measurement |
| SPEC-1044-AC3 | #1044 | the WHOLE `db-live-gates` driver (all three intake legs) green five consecutive times on a genuinely fresh database, not a rig-cloned lane cluster | **MET — ten consecutive green rounds**, thirty of thirty legs exit 0, each round on its own fresh database |

Starting state, checked first as rule 1 requires: `git status` clean, `git log --oneline 7bc5a710f..HEAD`
= the 23 commits the recheck rechecked, head `5c086b8f2`. No landed work was redone.

**New head: `90aaa63264535fdac2f469981e6f49f948eb0484`** (`90aaa6326`) — one commit added this round,
on top of the recheck's `5c086b8f2`. 24 commits against the base, 21 files, +1683 / -87. Worktree
clean before and after every experiment below, and after every control.

---

## SPEC-1141-AC1 — the bounded loop, reproduced (major, CLOSED)

**AC1:** *"A bounded loop (ten runs under load, for example beside a parallel unit-suite run)
reproduces the red before the fix and passes after."* Round 1 ran the ticket's own instrument and did
not reproduce; the recheck accordingly left the AC open, asking for either a ruling or a reproduction
on different infrastructure/load. **This round reproduced it, in both directions.** No ruling is
needed.

### First the window was measured, because guessing at the load had already failed twice

A temporary in-page sampler (one sample per animation frame and one per macrotask beat, a
`MutationObserver` on the row node, and the driver's OWN read timestamp taken in the same place the
pre-fix cell reads) on an otherwise quiet host, **5 runs of the PRE-FIX cell**, all times in ms from
the submit click:

| run | focus leaves the button (`BODY`) | the row node is removed | focus lands on the heading (`H2`) | the pre-fix cell's instant read | read - landing |
|---|---|---|---|---|---|
| 1 | 45.3 | 55.7 | 66.0 | 72.6 (`H2`) | **+6.6 ms** |
| 2 | 47.9 | 58.6 | 67.0 | 74.4 (`H2`) | **+7.4 ms** |
| 3 | 44.5 | 56.8 | 65.6 | 70.6 (`H2`) | **+5.0 ms** |
| 4 | 46.9 | 61.1 | 74.3 | 81.3 (`H2`) | **+7.0 ms** |
| 5 | 39.0 | 50.3 | 59.3 | 65.6 (`H2`) | **+6.3 ms** |

The old cell was not winning that race comfortably. It was winning it by about a third of a frame.

### Which is why every "make the machine busy" lever had failed

`nextPaint()` is one `requestAnimationFrame` plus one `setTimeout(0)`, so the landing runs in a
MACROTASK AFTER that frame's rendering steps. The driver's own read is not behind that queue: measured
above, it lands 13.8-20.2 ms after the row node is removed, i.e. within about one frame of it, while
the landing takes 8.4-13.2 ms — the two are a frame apart, on either side of the same rendering. A
load that slows the whole main thread slows BOTH sides and moves nothing; a load that makes the
FRAME's own rendering expensive moves only the landing. (Why the driver's read is not itself delayed
by the frame is Playwright's business and is not asserted here — what is asserted is the measurement.)
Measured, not assumed:

- **24 busy-loop node processes saturating all 24 cores** of this host, PRE-FIX cell,
  `--repeat-each=20`: **20 green / 0 red**. The load was real — the cell's own wall time rose from
  8.0 s (the quiet baseline) to 7.3-8.6 s over the first five repeats and 11.4-13.6 s over the last five.
- (round 1, re-stated) CDP `Emulation.setCPUThrottlingRate` 6 and 20: 0 catches; the ticket's own
  instrument beside a parallel whole-unit-suite run: 10 green / 0 red.
- A per-frame main-thread BURNER (60 ms of synchronous work per frame, injected in the page) moved it
  the WRONG way, and the sampler shows why: it delays the driver's own detection more than the
  landing (landing 2 ms after the row's removal; the read 185-250 ms after it).

### The load that does reproduce it is PAINT

400 fixed-position 320x240 tiles under `filter: blur(24px)`, driven by a 33 ms CSS keyframe animation
— paint work per frame, no script of their own — appended to the page immediately before the submit
click. Frame gap under it: median 17.5-19.5 ms, max ~167 ms. The sampler under that load records the
row removed at 240-255 ms, the driver's instant read at 248-283 ms **reading `BODY`**, and the
landing still queued behind the frame's rendering.

**The bounded loop, both arms, same load, same host, no sampler in either arm:**

| cell | command | runs | result |
|---|---|---|---|
| PRE-FIX (`git show 7bc5a710f:…`, one unwaited `page.evaluate`) | `e2e -- --no-build work-question-walk -g "B4: the SAME question" --repeat-each=10` | 10 | **10 RED / 0 green** — every one `Error: focus was dumped onto the document body when the row disappeared` at the cell's own assertion |
| the committed fix (`expect.poll` over `{tag,text,tabindex}`) | same command, same `CLARA_E2E_B4_PAINT_TILES=400` | 10 | **10 GREEN / 0 red** (1.5 m) |

That is AC1's text, satisfied literally: a bounded loop that reds before the fix and passes after.

**Restoration.** Both arms were temporary, uncommitted edits. `apps/web/e2e/work-question-walk.spec.ts`
was restored with `git checkout HEAD --` and is byte-identical to the committed cell
(`sha256 de353810dc67becda7b9e5d8d77f0be45c6390ab4f8866eede7d7d7eef7ab011`, unchanged from before the
experiment), `git status --porcelain` empty. Nothing about the load was committed into the cell: an
env-gated load injector inside a walk is exactly the kind of machinery the ticket's Out of scope and
the work order's "no speculative code" refuse.

**What WAS committed** is the record, in the one place the next reader of this flake will look —
`apps/web/e2e/README.md`'s own #1141 section (commit `90aaa6326`): the measured window, the three load
shapes that do NOT reproduce it and why, the two bounded loops with their counts, and the snippet to
re-run the reproduction. The section's earlier "this host could not force it" paragraph is replaced,
not appended to.

---

## SPEC-1044-AC3 — the whole driver, on a genuinely fresh database (major, CLOSED)

**AC3:** *"the `db-live-gates` driver green five consecutive times on a fresh database"*, plus lint and
the runtime file under the runner's own platform (both already satisfied and unchanged). Round 1 ran
the three legs on CLONES of this lane's `clara_l08` — a used estate — and reported leg 2 red every
round on its terminal `waitForQueueDrain` and leg 3 red once at `intake-batch-e2e.mjs:650`. The
recheck therefore left AC3 open and said what would close it: **the whole driver, all three intake
legs together, on a genuinely fresh database of CI's `clara_intake_ci` shape, not a rig-cloned lane
cluster.** That is what this round built and ran.

### The rig it needed, and why the lane's own cluster could not give it

Migration `0154` pins a cluster-wide role count, so a SECOND from-scratch chain cannot run on a lane
cluster (RIG.md forbids it). A disposable cluster was created for this evidence instead, on a free port
below 55772 (RIG.md's own constraint on this host; it records 55704/55705/55707 as earlier fix
workers' disposable clusters, so 55710 was taken to avoid colliding with a concurrent one):

```
pg_createcluster 17 rigl06ac3 --port=55710      # trust auth, 127.0.0.1, C.UTF-8 like every rig cluster
createdb clara_pristine                          # on a cluster that has never run a chain
PGDATABASE=clara_pristine pnpm db:migrate        # 309/309 applied, 0001 -> 0318_knowledge_fye_pair_applicability, exit 0
PGDATABASE=clara_pristine pnpm db:seed           # 0001_smoke_seed.sql + 0002_core_seed.sql, exit 0
```

`clara_pristine` reads **309 migrations, max `0318_knowledge_fye_pair_applicability`**, and carries
the POST-fix `0295_wave4_chart_rows` checksum the cut phase standardised on
(`5196d64d944e61ef836313cffd6bcc2d4dddd18bc808ca55f86e30544ecece0d`). It is the CI shape in the one
respect that decided round 1's reds — **it has never been used**:

| | `clara_pristine` (this round) | a clone of `clara_l08` (round 1) |
|---|---|---|
| `clara.agent_tasks` | **0** | 661 held `wake` tasks at the drain, 19 even after three layers of settling |
| `clara.wake_intents` | **0** | 584 pending |
| `clara.documents` / `clara.firms` | 3 / 2 (the seed's own) | the lane's whole test estate |

Each round then builds its own `clara_intake_ci` exactly as the action's own comment prescribes for a
second pristine database on a cluster whose chain has completed — a TEMPLATE COPY, which mints no
role and so cannot collide with `0154`:

```
drop database if exists clara_intake_ci; create database clara_intake_ci template clara_pristine;
WORKFLOW_POSTGRES_URL=postgres://postgres@127.0.0.1:55710/clara_intake_ci pnpm --filter @clara/runtime exec bootstrap
cd packages/runtime && for each leg, in the action's own order:
  PGDATABASE=clara_intake_ci WORKFLOW_POSTGRES_URL=... CLARA_GATE_STEP="<the action's step name>" \
    node <root>/scripts/ci/world-gate.mjs tests/<leg>.mjs
```

`CREATE DATABASE ... TEMPLATE` is a file-level copy, and the template here has never been connected
to by anything but the migrate and the seed, so every round starts from a genuinely fresh estate — the property round 1 could not have. The runtime bundle the
legs import was rebuilt at HEAD first (`pnpm --filter @clara/runtime build`, exit 0) and carries the
fix (`grep -c sidecarLocks packages/runtime/.output/server/index.mjs` -> 4).

### The rounds — every leg, every round, the action's own order

| round | `intake-e2e` | `intake-admission-e2e` | `intake-batch-e2e` | the round |
|---|---|---|---|---|
| 1 | **exit 0** (5s) | **exit 0** (11s) | **exit 0** (134s) | **GREEN** |
| 2 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (114s) | **GREEN** |
| 3 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (116s) | **GREEN** |
| 4 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (109s) | **GREEN** |
| 5 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (86s) | **GREEN** |
| 6 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (121s) | **GREEN** |
| 7 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (259s) | **GREEN** |
| 8 | **exit 0** (5s) | **exit 0** (12s) | **exit 0** (89s) | **GREEN** |
| 9 | **exit 0** (3s) | **exit 0** (23s) | **exit 0** (101s) | **GREEN** |
| 10 | **exit 0** (4s) | **exit 0** (11s) | **exit 0** (67s) | **GREEN** |

**Rounds 1-5 are AC3's five consecutive greens. Rounds 6-10 were run identically afterwards**, because
a round costs about two minutes on this rig and the question behind the AC — is the intake chain
actually stable, or did five rounds get lucky — is worth ten rounds rather than five. **Ten of ten
rounds green, thirty of thirty legs exit 0.**

Every leg printed its OWN terminal line in every round, not merely exit 0 — checked per round, per
leg, 30 of 30: `INTAKE E2E: PASS (HTTP stream/CORS/token lock -> Storage -> finalizer -> WDK OCR ->
regions; SSE live under structured parse load)`; `INTAKE ADMISSION E2E: PASS (8 legs — …)` with all of
its own `[leg n] PASS` lines; and `[p636] intake-batch-e2e: ALL LEGS PASSED`.

### What the fresh database settles that a clone could not

**Leg 2's terminal drain — round 1's standing red, in all five of its rounds — completes immediately
here.** The `#967` cross-leg hygiene drain that never finished on a clone of the lane estate finished
in **4 to 6 polls and 809-1192 ms in every one of the ten rounds** (leg 1's own drain: 1-2 polls,
10-340 ms). That is round 1's diagnosis confirmed by experiment rather than by argument: the held
`wake` tasks it waited on were minted from the CLONED estate's own client data (compliance and lint
notifications, with both `clara.wake_engine_sources` rows disabled), and a database with no such data
never mints them. No #1044 code path was ever involved, and nothing had to be changed to make leg 2
pass — only the estate it ran against.

**Leg 3's `intake-batch-e2e.mjs:650` did not fire in any of the ten rounds.** On the loaded clone it
fired twice in nine rounds in round 1; here the leg runs 67-259 s (median ~110 s) rather than
343-707 s, and the window that assertion is sensitive to — a child settling between the cancel
decision and the belt sweep — never widened enough to open. It is still worth filing as a follow-up
(below): the gap in the cell is real, it is simply not exercised on an unloaded, unused estate.

### What this evidence is, and what it is not

`db-live-gates` has seven steps: the nitro build, the three intake legs, the Wave-B fault-gate leg,
and the two DR steps. **This round ran the build and the three intake legs — the driver's intake
chain, all three legs together, in the action's own order, ten consecutive times, each on its own
genuinely fresh database.** That is what the recheck's `required_fix` names ("all three intake legs
together ... CI's `clara_intake_ci` shape, not a rig-cloned lane cluster").

Not run here, and disclosed rather than implied: the **Wave-B fault-gate step** — though its own
`#637` two-build cutover drill WAS run end to end in round 1, for #1131 (`TWO-BUILD CUTOVER E2E: ALL
PASS`) — and the **two DR steps**, which need the action's other three pristine clusters and a
`pg_dump` this Windows host does not carry on PATH (one of RIG.md's own known Windows reds). Those
remain CI's to prove, as it does per PR. The legs were run without `CI=true` / `GITHUB_ACTIONS=true`,
exactly as round 1 ran them.

**AC3's other two clauses** are unchanged and still satisfied: `CI=true GITHUB_ACTIONS=true pnpm lint`
exit 0 (re-run this round, below) and the runtime test file once under WSL as user `runner`
(round 1: `intake-sidecar-race.test.mjs` 22/22, `l9-pool-contract-lane-probe.test.mjs` 28/28). The
#1044 cells themselves were re-run at this head against the rebuilt bundle: **22 pass / 0 fail**.

---

## What changed in the tree this round

**One file, and it is documentation.** No source, no test, no migration, no workflow.

| commit | file | why |
|---|---|---|
| `90aaa6326` | `apps/web/e2e/README.md` | #1141's section now carries the reproduction: the measured window, the three load shapes that do not open it, the two bounded loops with their counts, and the snippet to re-run it. The old "this host could not force it" paragraph is replaced, not appended to. |

Both open findings were EVIDENCE gaps, so both were closed by producing evidence, not by editing the
subject. Nothing in `packages/runtime`, `packages/db`, `apps/web`'s source or the workflows moved this
round; the 23 commits the recheck confirmed are untouched.

Sweep rules, checked: **(b)/(d)** no migration in this lane and none added, so no number was drawn
from the overflow block, no prestate pin moved, and `apps/web/tests/firm-scope-db-pins.corpus.ts`
stays out of scope (`git diff --name-only 7bc5a710f..HEAD` still lists no file under
`packages/db/migrations/`). **(c)** no shared body was recut. **(e)** no digest was pinned over
text-ordered row content. **(f)** no status-report request arrived during this round.

## Gates re-run this round

| gate | command | result |
|---|---|---|
| typecheck | `pnpm typecheck` | **exit 0** |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** |
| frozen closures | `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` | **OK** — 322 frozen files verified (append-only vs `7bc5a710f`), 57 `use workflow` modules frozen+registered, 3 retired entries |
| parts parity | `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| #1044's own cells, at this head, against the rebuilt bundle | `packages/runtime`: `CLARA_SPOOL_DIR=<per-run temp> node --test tests/intake-sidecar-race.test.mjs` | **22 pass / 0 fail** |
| the driver's intake chain on fresh databases | `scripts/ci/world-gate.mjs` per leg, 10 rounds x 3 legs | **30 of 30 exit 0**, each with its own terminal PASS line |
| the B4 cells on the RESTORED committed spec | `e2e -- --no-build work-question-walk -g "B4:" --repeat-each=2` | **6 passed** (44.8 s) — the focus-landing cell, the 320 px / reduced-motion cell and the URL-stability cell, twice each |
| #1141's bounded loops | `--repeat-each=10`, paint load, both arms | **10 red pre-fix / 10 green post-fix**; and 20 green pre-fix under 24-core saturation (the negative control) |
| worktree | `git status --porcelain` | **empty** — before and after every experiment, and after every restore |

**Not re-run, with the reason.** The whole `apps/web` unit suite and the other browser walks (this
round changed no `apps/web` source and no unit test — only `e2e/README.md`, a documentation file that
no cell reads); the `packages/db` gate chain, `operation-census.test.mjs` and `rig-isolation.test.mjs`
(no SQL object, no migration, no `packages/db` file touched); `apps/web/tests/firm-scope-db-pins.corpus.ts`
(sweep rule (d) arms it only when a migration file changed; none did, in this round or in the lane).

## Follow-ups (I cannot file issues)

1. **`packages/runtime/tests/intake-batch-e2e.mjs:650`** — unchanged from round 1 and still worth
   filing: the receipt census asserts one receipt per child on the DECISION's worklist, with no
   allowance for a child settling between the decision and the belt sweep, while the lines above it
   assert by identity precisely because that drift is lawful before the decision. It did not fire in
   this round's fresh-database runs; it is a pre-existing cell gap, not a #1044 code path.
2. **The rest of `db-live-gates` was not run here** (the Wave-B fault-gate leg and the two DR steps):
   they need the action's other three pristine clusters and a `pg_dump` on PATH. The recheck's requirement
   was the three intake legs together, which is what this round ran; the rest is CI's own to prove,
   as it does per PR.
3. **`clara_pristine` / cluster `rigl06ac3` (port 55710) is disposable** and is left running so the
   integrator can re-run or extend this evidence cheaply (one `create database … template
   clara_pristine` per round). It holds no work of any lane and can be dropped with
   `pg_dropcluster 17 rigl06ac3 --stop`.

## Anything unverified

- The three legs were run WITHOUT `CI=true` / `GITHUB_ACTIONS=true` (as round 1 ran them), so the
  runner's own CI-refusal arms are not what this evidence covers. The three leg files and
  `tests/queue-drain.mjs` contain no `process.env.CI` or `GITHUB_ACTIONS` read (checked); what the
  bundle they import does with those variables was not audited.
- The host is Windows and the runner is Linux. This is the same platform caveat every rig gate
  carries; the touched runtime file's own unit cells were re-run under WSL as user `runner` in round
  1 (22/22 and 28/28) and nothing in this round changed that file.

