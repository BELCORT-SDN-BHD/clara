# Wave 1 · Lane 09 — /code-review fix round

**Branch** `riders/w1-lane09` in `C:\Users\zhant\Desktop\clara-wt\659`, database `clara_l09`
@ 127.0.0.1:55749. Working tree clean. No push, no PR, no GitHub write, no other worktree touched,
no subagent spawned.

**Head at start** `3f686871` · **New head** `be3f548ac7f3016947bd3d5338af23c32eff5e2a`

```
be3f548a style(runtime): #966 the LIVE-upload cell's second fixture builds from a length, not an unused map param
16080c26 test(runtime): #966 the recency guard DELAYS the expiry arm by one quiet window, and a cell says so
0626af12 docs(runtime): #966 the ten are ten sidecars that CARRY an intake, and the two knobs reach the catalog
a126cb9d test(runtime): #852 the belt's ORDER is proven behaviourally, not by scanning reconciler.mjs
--- everything below was already on the branch ---
3f686871 fix(runtime): #966 the recovery budget is ten ACTIONS, not ten reads
887ae5ac fix(runtime): #966 the intake recovery belt can no longer fail a live intake
52601ff4 feat(runtime): #852 fold the chat-clarify belt into the sweep receipt
```

Fix-round diff, `3f686871..HEAD`: 4 files, 126 insertions / 27 deletions — `README.md`,
`lib/intake.mjs` (**comments only**, no statement changed), and two test files. All under
`packages/runtime`. No migration, no frozen file, no shared file from work-order rule 7.

---

## Verdict per finding

| id | ticket | severity | outcome |
|---|---|---|---|
| SPEC-1 | 966 | minor | **refuted in part, stays in part** — the "narrowed guard" half does not reproduce; the residual is real, pre-existing, out of scope, and now operable |
| SPEC-2 | 966 | minor | **stays, deliberately** — kept and recorded where an operator reads it |
| SPEC-3 | 966 | minor | **fixed** — the claim was wrong, not the code; corrected in four places and pinned by a new cell |
| SPEC-4 | 966 | minor | **refuted** — the ticket asks for it in as many words; now pinned by a new cell instead of prose |
| STD-09-1 | 966 | minor | **fixed** — both knobs in the README's canonical env-var catalog |
| STD-09-2 | 852 | minor | **fixed** — the implementation-coupled source scan removed, after checking the behavioural cell covers it |

---

## SPEC-1 — "the belt still opens a LIVE intake's sidecar once quiet 5 s, and the retry deadline was cut 2000 to 250 ms"

Two claims. They resolve differently.

### (b) "the same branch cut the writer's retry deadline … narrowing the only remaining guard" — **does not reproduce**

Measured on this host, from `packages/runtime`, cell `p966.race` (500 `writeIntakeMeta` calls for
one intake against a tight `listIntakeMetas` loop — the belt's own read path):

| `CLARA_SPOOL_RENAME_RETRY_MS` | result |
|---|---|
| unset, i.e. the shipped default **250 ms** | 0 of 500 failed — three consecutive runs, each `# pass 1 / # fail 0` |
| **2000 ms** (the first cut's value) | 0 of 500 failed |
| **0 ms** (control) | **414 of 500 failed**, every one `EPERM` |

250 ms and 2000 ms are indistinguishable against the contention this guard exists for, because a
reader's handle lives for microseconds — no write in 500 came near either deadline. The deadline is
not the guard's strength; its existence is. Nothing was narrowed in any way this rig can measure.

### (a) "the belt still opens a LIVE intake's sidecar once that intake has been quiet 5 s" — **true, pre-existing, out of scope, and smaller than it reads**

True: the `receiving → spooled` and `spooled → canonical` legs can exceed the quiet window, and
`spooled` is in `RECOVERABLE_STATES`. Three things bound it, all checkable:

1. **Not a regression.** `origin/main` opened EVERY pending sidecar on EVERY sweep and had no retry
   at all. Measured above: that shape loses 414 of 500 writes on this host; the branch loses 0.
2. **The fix the finding asks for is explicitly out of scope.** `gh issue view 966`, Out of scope:
   "Changing the sidecar format or moving intake status out of the filesystem." A belt that skips on
   status without opening needs the status in directory metadata — i.e. in the filename. Work order
   rule 5 forbids widening a ticket to get there.
3. **A belt-driven finalize on a live intake is already refused, in process.** `lib/intake.mjs:106`
   `enterIntake(id)` throws `IntakeError(409, "intake_busy")` when that intake is already in flight,
   and both `finalizeDocumentIntake` (`:256`) and the upload leg (`:204`) take it. So the worst case
   on the `spooled → canonical` leg is not a double-finalize: the belt's call throws, the belt counts
   `out.deferred += 1` and logs `[reconcile] intake recovery deferred intake=…`. Stated honestly:
   that guard is a **per-process** set, not a cross-process lock — it holds for the single-runtime
   deployment this repo ships and would not hold for two runtime processes on one spool volume.

**What changed for it anyway.** STD-09-1's fix puts `CLARA_SPOOL_RENAME_RETRY_MS` in the README's
own configuration catalog with the one sentence an operator needs — raise it on a host whose AV
scanner or indexer holds spool files open longer than a reader does. That is the first of the two
remedies the reviewer named, and it is now discoverable where it is looked for.

**Follow-up worth filing** (not done here — no GitHub write): let the recovery belt decide
actionability from directory metadata, so the `receiving` and `spooled` legs are never opened at
all. That is a sidecar-naming change and needs its own ticket and an owner ruling.

---

## SPEC-2 — the TTL reaper's ownership regex widened to `intake-*.(bin|json)` — **stays**

Kept, for reasons I can point at rather than assert:

- It is load-bearing for the finding directly below it in the same review. SPEC-3's residual — junk
  the belt reads past every sweep — has an END only because something reaps it. The one shape
  nothing could reap was an `intake-` file whose name is not a uuid, because no
  `removeIntakeSpool(id)` is ever called for it. `tests/intake-sidecar-race.test.mjs`'s `p966.reap`
  is the cell; it is green.
- The risk is bounded by construction: every path this package writes comes from `intakePaths()`,
  which enforces the uuid itself, and `atomicJson`'s temp files end in `.tmp` and stay unmatched.
- Reverting it would re-open the unbounded case to remove a comment's worth of scope.

**The release-note line the reviewer asked for** is now in the README's own configuration catalog,
not only in the #966 narrative (`packages/runtime/README.md`, "Other configuration groups >
Intake:"): *`CLARA_SPOOL_TTL_MIN` (its reaper owns EVERY `intake-*.(bin|json)` in
`CLARA_SPOOL_DIR` since #966, not only uuid-named ones — point `CLARA_SPOOL_DIR` at a directory
nothing else writes)*.

---

## SPEC-3 — "the budget is ten ACTIONS, not ten reads" — **fixed: the claim was wrong, not the code**

The finding is correct on the facts. It offers two repairs; I took the second, and here is the
measurement that decided it.

**Why not move `handled += 1` below the `RECOVERABLE_STATES` gate.** I applied exactly that
alternative (increment inside the expiry arm, and again after the gate) and ran the suite:

```
not ok 5 - p966.budget: a sweep opens at most TEN sidecars that carry an intake, never the whole directory
not ok 6 - p966.quiet: the quiet window does not eat the BUDGET — ten still get read past a crowd of live uploads
not ok 13 - p966.budget: a settled LIVE upload DOES spend one of the ten …
# tests 15 / # pass 11 / # fail 4
```

(The fourth red, `p966.race`, does not exercise the belt at all and did not reproduce on the
restored subject — host contention from the repeated runs, reported rather than swept up.)

Those three reds are the cost, stated plainly: the alternative lets **one sweep open up to thirty
live sidecars instead of ten** — tripling the handle-taking on exactly the files #966 exists to stop
touching, which is SPEC-1 made worse in order to make a sentence true.

And it buys little, because **the two junks are not alike**:

- `{corrupt}` / id-less / collected junk is **permanent** until `sweepSpoolTtl` reaps it. That is
  why the carve-out was built, and it stays.
- A live upload is **transient**: it carries a 15-minute capability, and the belt's expiry arm is an
  action it always takes. The blinding shape ends by itself within the capability's life.

`lib/intake.mjs` was restored byte for byte after the control (`sha256sum -c`: OK).

**What was fixed instead — the claim, in four places:**

1. `packages/runtime/README.md`: the bullet is now "**The ten are ten sidecars that CARRY AN
   INTAKE**", and says out loud that a live-status sidecar spends a slot, deliberately, with both
   reasons.
2. `lib/intake.mjs`, `RECOVERY_OPEN_BUDGET`'s header: "THE BUDGET IS A BUDGET FOR ACTIONS, NOT FOR
   READS" → "THE TEN ARE TEN SIDECARS THAT CARRY AN INTAKE", plus a new paragraph naming SPEC-3 and
   the trade-off.
3. `recoverPendingDocumentIntakes`'s header: "enough of them to ACT on `RECOVERY_BATCH`" → "enough
   of them to reach `RECOVERY_BATCH` sidecars THAT CARRY AN INTAKE".
4. The older cell's title and message: "the TEN sidecars it can act on" → "TEN sidecars that carry
   an intake", with a pointer to the new cell.

Commit `3f686871`'s subject line cannot be corrected in history; commit `0626af12` is where a later
reader finds that out.

**New cell** `p966.budget: a settled LIVE upload DOES spend one of the ten — the carve-out is for
junk, not for uploads`. Ten settled live uploads hide a crashed intake for one sweep (the residual,
pinned rather than claimed away); once those ten are past their capability the SAME sweep expires
all ten, and the next sweep carries the crashed intake into finalize. Vacuity control (work order
rule 4): with the alternative applied the cell reds on its own message; subject restored byte for
byte.

---

## SPEC-4 — "the recency guard now gates the EXPIRY arm too" — **refuted, and pinned**

The ticket asks for it in as many words (`gh issue view 966`):

- *Desired behavior*: "the belt decides what to skip from directory metadata **before opening
  anything**, so the existing recency guard runs ahead of the open rather than behind it."
- *Key interfaces*: "The belt's existing recency skip: move it ahead of the open, and **keep it the
  only such guard**."

`expiresAt` lives inside the sidecar and can only be read by opening it. A guard that runs before
every open therefore gates the expiry arm — there is no reading of those two lines under which it
does not. The criterion it must keep — "still expires an intake whose upload capability has passed
its 15-minute expiry, and still clears that intake's spool" — carries no latency clause and is
green. The DB cell's edit was to its **setup** (`utimes` on the fixture), and an abandoned sidecar
genuinely is old, which is what that cell's own name already claimed.

What was missing is that the delay lived only in prose. **New cell** `p966.expire: a FRESH sidecar
past its capability is expired on the NEXT sweep — a delay, not a retirement`: the same expired
intake, driven twice. Inside the quiet window it is not opened and nothing is expired; once quiet it
is opened exactly once and expired. Five seconds against a fifteen-minute capability, about three
leader cycles. Vacuity control: with the quiet filter removed from `recoverPendingDocumentIntakes`
the cell reds on "the guard is ahead of the open"; `lib/intake.mjs` restored byte for byte.

---

## STD-09-1 — the two new knobs were not in the README's env-var catalog — **fixed**

`packages/runtime/README.md`, "Other configuration groups > Intake:" now carries
`CLARA_INTAKE_SIDECAR_QUIET_MS` (default 5000) and `CLARA_SPOOL_RENAME_RETRY_MS` (default 250) with
their defaults, one sentence on when to raise the retry deadline, and a pointer to the #966 section.
The same bullet records SPEC-2's widened reaper (above).

---

## STD-09-2 — the repointed `chat.wiring` cell duplicated a behavioural fact by scanning source — **fixed**

The finding is right, and its own footnote is slightly off: it says the "leader no longer calls the
belt" assertion is not covered elsewhere, but `chat-clarify-sweep-wiring.test.mjs:205` (`#852
wiring`) asserts exactly that, plus `swept.chatClarify`. So the repointed cell duplicated **both**
its non-startWorld halves.

**Checked before removing anything.** Moved the `chat clarify reconcile` registration below `task
reconcile` in `lib/reconciler.mjs` and ran both cells:

```
not ok 1 - #852 order: the belt runs FIRST of the belts …
    the chat-clarify belt is the FIRST belt — immediately after the heartbeat, …
```

The behavioural cell — which drives a whole sweep against a scripted client and reads the real
statement order off it — reds for exactly the right reason. `lib/reconciler.mjs` restored byte for
byte (`sha256sum -c`: OK).

**Removed:** the three `indexOf('await belt("…"')` assertions against `lib/reconciler.mjs`. That is
the /tdd *Implementation-coupled* shape the finding names: folding the belt registrations into a
config array iterated in order preserves the order exactly and would red a cell whose subject never
regressed.

**Kept:** the negative grep on `leader.mjs` (a symbol name, not a call-site string — it breaks only
on a rename, and it keeps the cell's name honest) and the `startWorld.ts` production wiring, which
is unique to this file. Cell renamed to what it now proves: `chat.wiring: ONE caller drives this
belt, and it is handed a real world resume`. Both remaining assertions are load-bearing — appending
a `reconcileChatClarifies` mention to `leader.mjs` reds the cell on its own message; subject
restored byte for byte.

---

## Sensitivity of every cell on both tickets

No horizontal-slicing finding was raised (the standards review checked per-commit `--stat` and found
lib and test files landing together in every commit). The equivalent check was run anyway,
consolidated: both tickets' subjects reverted to `origin/main`
(`git checkout origin/main -- lib/{control,intake,leader,reconciler-chat-clarify,reconciler,spool}.mjs`,
`rm lib/hook-resume.mjs`), both suites re-run:

| suite | against `origin/main` | against HEAD |
|---|---|---|
| `tests/intake-sidecar-race.test.mjs` | **12 of 16 red** | 16 / 16 pass |
| `tests/chat-clarify-sweep-wiring.test.mjs` | **7 of 8 red** | 8 / 8 pass |

The five that stay green are green **correctly**, and each one says so in its own name: `p966.host`
and `p966.stat_is_not_a_handle` measure a property of the host, not of the subject; `p966.expire`
and `p966.listing: listIntakeMetas keeps its old contract` are "this still works" cells whose whole
point is that `origin/main` passes them; and `#852 graph: the ONE pre-existing cycle` pins a cycle
that exists on `main` too. Subjects restored; `git status --porcelain` empty.

Per-finding controls (each restored byte for byte, `sha256sum -c` OK): SPEC-3's alternative → three
causal reds; SPEC-4's guard removed → its new cell reds; belt order swapped → `#852 order` reds;
`reconcileChatClarifies` re-mentioned in `leader.mjs` → `chat.wiring` reds.

---

## Gates, with counts

| Gate | Result |
|---|---|
| `node --test tests/intake-sidecar-race.test.mjs` | **16 tests, 16 pass** |
| `node --test` over the ten `intake-*.test.mjs` files (lane DB) | **88 tests, 87 pass, 1 fail** — the known #693 EICAR red |
| `node --test tests/control-chat-clarify.test.mjs tests/control-work-question.test.mjs tests/chat-clarify-sweep-wiring.test.mjs` (lane DB) | **42 tests, 42 pass** |
| `node --test tests/reconcile-belt-isolation-unit.test.mjs` | 22 tests, 22 pass |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff, 3 retired entries |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |

`apps/web` and `packages/db` untouched by this round, so no web unit suite, no browser walk and no
db gate chain applies.

**The 1 fail is the known Windows-only red, not mine.** `intake-unit.test.mjs` → `scanner rejects
EICAR, encrypted PDF, and XML entity expansion` (#693, listed in RIG.md — Defender removes the
fixture between the test's own `writeFile` and `scanFile`).
`git diff origin/main..HEAD -- packages/runtime/lib/scan.mjs packages/runtime/tests/intake-unit.test.mjs`
is **empty**. `pnpm lint` reds once during this round on my own new cell (`no-unused-vars`, an
unused `map` parameter) and was fixed in `be3f548a`; it is green now.

---

## Docs updated

`packages/runtime/README.md` only, in the same commits as their code and cells: the Intake
configuration-catalog bullet (STD-09-1 plus SPEC-2's release-note line) and the #966 budget bullet
(SPEC-3). `CONTEXT.md` deliberately untouched — the vocabulary here is runtime mechanics, not
accounting or product.

## Left for the orchestrator

1. **A follow-up ticket for SPEC-1(a)** — actionability from directory metadata, so the `receiving`
   and `spooled` legs are never opened. Needs an owner ruling, because it is the sidecar-format
   change #966 put out of scope.
2. **SPEC-5's control wording** (a note, not in my finding set, but it touches text I did not
   write): if the as-run repeats the quiet-window vacuity control, state it as
   `CLARA_INTAKE_SIDECAR_QUIET_MS=0`, not `=1`. I did not re-measure it this round.
3. **SPEC-8** — `tests/intake-batch-e2e.mjs`, the leg that measured #636's original symptom, still
   needs a database that can carry a bootstrapped World, or #966 closes naming the unit measurement
   (`p966.race`: 0 of 500 with the fix, 414 of 500 without) as its evidence.
4. `enterIntake`'s per-process guard (SPEC-1(a), point 3) is not a cross-process lock. Fine for the
   single-runtime deployment; worth a line in any future multi-runtime design.
