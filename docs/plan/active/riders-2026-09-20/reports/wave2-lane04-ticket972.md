# wave 2 · lane 04 · ticket #972 — the fixed-asset birth honours the enrolment watermark on every firing

**Status: DONE.** Branch `riders/w2-lane04`, worktree `C:\Users\zhant\Desktop\clara-wt\651`,
database `clara_l04` (127.0.0.1:55744). Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
git log --oneline 23cfad94..HEAD
497d02455 test(db): #972 leave x41.s4's allow-list alone — the b3 residue is an A6 window, not an explained red
44449bcdb fix(db): #972 the fixed-asset birth honours the enrolment watermark on every firing
```

The ticket was verified live on this branch before building: `gh issue view 972` has **no
comments**, so the body's Agent Brief is the newest; nothing on `main` or in the wave-1
integration had satisfied it. The defect reproduced on this rig on the first attempt (below).

## Seams I tested at (written down before the first test)

The brief's "Key interfaces", one to one:

1. **`clara.reverse_entry(uuid, text, text)`** — the door whose `reversed_by` stamp re-fires the
   birth trigger. Contract unchanged; asserted unchanged.
2. **The register read** — `clara.fixed_assets` row count per client (`faRows`), the fact the
   brief's AC1 is phrased in.
3. **`clara.fa_register_tie(uuid, date)`** — the production instrument `x41.s4` drives, and the
   brief's own "instrument that proves the fix".
4. **`clara.upsert_fa_account_profile`** — enrolment, which stamps the watermark.
5. **The catalog** (`pg_proc.prosrc`, `pg_trigger`) — the repo's documented structural standard for
   a recut body (prestate sha pins, tail assertions, a `p972.law` cell). Work order rule 4 says this
   standard wins over "no structural cells"; it is why `p972.law` exists.

No test touches an internal collaborator or a private function.

## The defect, measured here first

`clara._tf_fa_acquisition_birth` (0216 §B) is a DEFERRED constraint trigger on
`clara.journal_entries`, `after insert or update … when (new.status = 'approved')`. "Approved" is a
STATE, so it fires again on any later UPDATE that leaves the entry approved; `reverse_entry` stamps
`reversed_by` and deliberately leaves the original approved. Its join carried no watermark
(`fp.asset_account_code = jl.account_code and fp.active`), so a pre-enrolment entry births nothing
at approve, nothing at enrolment — and a register row the moment it is reversed.

Reproduced on `clara_l04` at chain 0234 (so **not** #651's 0227, which was long applied):
`x41.b3` extended by one assertion went red `1 !== 0`, and `x41.s4` went red with the ticket's exact
signature — `x41_b3_…`, account `200-D41`, `cost_diff=77000`, `accum_diff=0`, `pre_cost=77000`.

## Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| Reversing a pre-watermark entry births no register row; the count is identical before and after | **done** | `p972.retro` (`packages/db/tests/fa-birth-watermark.test.mjs`) asserts `faRows(client).length` equal before and after `reverse_entry`. Red `1 !== 0` against the pre-image body, green after 0247. |
| `x41.b3` extended to look at the register again after the reversal, and passes | **done** | `packages/db/tests/x41-wave-d-a-fa.test.mjs:410` — the new `assert.equal((await faRows(client)).length, 0, …)` behind `faBirthWatermarkEnforced()`. Seen RED for the right reason first (`1 !== 0`), green after 0247. |
| The reversed original keeps `approved`, gains `reversed_by`, and a pre-enrolment entry on an enrolled account is still reversible | **done** | The two pre-existing `x41.b3` assertions still pass, and `p972.retro` re-asserts both on its own fixture. Nothing about `reverse_entry` changed: its `sha256(prosrc)` is pinned in 0247's prestate and re-read in its tail. |
| `x41.b4` still passes: an acquisition reversal on a post-watermark asset still flips its row to `unwound` | **done** | `x41.b4` green in the 16-cell run below. `p972.refire` adds the count: one register row, never a twin, `status='unwound'`. |
| On a freshly built family, `x41.s4` reports zero unexplained differences at all three as-ofs, allow-list unchanged at one entry | **done** | `x41.s4` green on a clone of the lane rig with the four pre-0247 phantom rows removed: *"swept 14 register-bearing client(s) × 3 as-of(s) = 42 account rows; 0 explained red(s), 8 open-A6-window row(s), 0 before_baseline row(s), 0 proven over-cap refusal(s), 0 unexplained"*, with the cell's own `ALLOWED_RED.length === 1` assertion passing. **`ALLOWED_RED` is untouched** — `x41-round35-tie.test.mjs` is byte-identical to BASE. See "the allow-list question" below. |
| Ships as a new migration at the next free number; no merged migration edited | **done** | `packages/db/migrations/0247_fa_birth_watermark.sql`, the number reserved in the prompt. No applied or merged migration edited; `pnpm db:migrate` reports `0 new · 230 total` with no drift. |

## The allow-list question (the one judgement call, and it resolved to "change nothing")

Removing the phantom row *un-masks* `x41.b3`'s honest pre-enrolment residue at the sweep's two
earlier as-ofs (`cost_diff=-77000`, `pre_cost=77000`). I first broadened `ALLOWED_RED`'s single
entry to cover it. Then I **measured** rather than argued: `x41.s4` classifies that row as an **A6
correction window** — derived from the data (an approved entry the GL still carries at that as-of
whose approved mirror is dated LATER), never from a fixture name — and the cell separately proves
that window has shut at the settled as-of. It never reaches `allowedBy` at all. So the broadening
was unnecessary and commit `497d02455` reverts `x41-round35-tie.test.mjs` to BASE byte for byte.
The AC's "allow-list unchanged at one entry" holds literally.

## Migration

`packages/db/migrations/0247_fa_birth_watermark.sql` — one `create or replace` of
`clara._tf_fa_acquisition_birth`, adding ONE join predicate:
`and coalesce(new.approved_at, now()) >= fp.enrolled_at` — the belt's own words
(`clara._tf_fa_movement_belt`, 0041 §S2.6), so the instrument that refuses an unregistered movement
and the instrument that births the register row cannot drift apart about scope. `ck_fap_retired`
makes `active` and `retired_at is null` the same fact (asserted in the prestate), so on the set the
birth join considers the two predicates are now identical.

**Prestate `sha256(prosrc)` pins, all MEASURED on `clara_l04` now, off `pg_proc.prosrc`:**

| body | sha256(prosrc) | kind |
|---|---|---|
| `clara._tf_fa_acquisition_birth()` | `090217b0e74d8b1d8381e8b0e9c63c3822763b4eba9f641786247d2fb1fe687c` | recut |
| `clara._tf_fa_movement_belt()` | `be97ea51a8db4d69a32da6986a1f0ab7b136c7dc8432913fe783354a3e4c8b5a` | unmoved |
| `clara._fa_on_approve(uuid)` | `7ffa9a710bf2ba5fc6c49ed184251f7cbb37c834a213f0ddeeb3a3ba91b98fc0` | unmoved |
| `clara.fa_register_tie(uuid,date)` | `c9f47463e1e5c02d56bc1ed7a5396d672990bf2f50de20e33cb47a59cbe67586` | unmoved |
| `clara.reverse_entry(uuid,text,text)` | `cc01323e453de38afb83f0e50b300a488e8a963ce458c621dee9abec4651f4b9` | unmoved |

The recut's **post-image** is `d2a63e27be906076a09f51c34904d8b635f3f9587d53c6d3e9b7cd9084a53b80`;
the file's migration checksum is `9ea73128fb331caade45fff79c10de493a8456a31f38f8a97bfb5051068d4e63`.
Other prestate arms: the watermark column is `NOT NULL`; `ck_fap_retired` still equates `active`
with a NULL `retired_at`; `t_je_fa_acquisition_birth` is still the deferred initially-deferred
insert-or-update constraint trigger gated on `new.status = 'approved'` and still sorts before
`t_je_fa_movement_belt`; the belt phrases the watermark exactly once. Tail T.1–T.8: the watermark
present exactly once, the watermark-free join **gone** (a vacuous replace cannot pass), 0216's four
exclusions and its single conflict-targeted insert intact, owner/`SECURITY DEFINER`/`search_path`
kept and EXECUTE granted to nobody, the trigger unchanged, and all four unmoved bodies re-read.

**Redo (#957) was used twice, and it is recorded here because the work order asks.** Once after an
edit to the file's header (a `CONTEXT.md` term citation that does not exist was replaced with the
0041 §1.2 citation), once to restore the body after the vacuity control. The file carries an
explicit redo branch in its prestate: if the live body already carries the watermark, that is a redo
of 0247 itself, announced with a `raise notice` and admitted, with the tail still re-proving the
whole post-state. Both redos printed that notice or the ordinary clean notice, and the third
ordinary `pnpm db:migrate` reports no drift.

**rig-meta cohort: none needed, and that is not an omission.** This file mints no function and moves
no grant; `_tf_fa_acquisition_birth` is already in `FA_ACQUISITION_0216_UNGRANTED_FNS`
(`packages/db/tests/rig-meta.mjs:1951`). `operation-census.test.mjs` (which fails on an
unattributed door) is green.

## Gates, with counts

| gate | command | result |
|---|---|---|
| new + touched db files, full gate chain (51 `--import`) | `node --test --test-concurrency=1 $GATES tests/fa-birth-watermark.test.mjs tests/x41-wave-d-a-fa.test.mjs` | **16 tests · 16 pass · 0 fail · 0 skip** |
| the new battery FOCUSED (gate module NOT preloaded — final acceptance shape) | `node --test --test-concurrency=1 tests/fa-birth-watermark.test.mjs` | **3 pass · 0 fail · 0 skip** |
| the tie sweep, lane rig | `… $GATES tests/x41-round35-tie.test.mjs` | 3 tests · 2 pass · **1 fail** — `x41.s4`, on exactly the two pre-0247 phantom clients (below) |
| the tie sweep, clone with the pre-0247 phantom rows removed | same, `PGDATABASE=clara_l04_s4` | **3 pass · 0 fail · 0 skip** |
| SQL-function gates | `… $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests · 32 pass · 0 fail · 1 skip** (T19 destructive; reset flags never set) |
| gate-chain census + redo battery | `… $GATES tests/preintegration-gate-chain.test.mjs tests/migrate-redo.test.mjs` | **13 pass · 0 fail · 0 skip** |
| `pnpm typecheck` (worktree root) | — | **FAILS, inherited from BASE** (see below) |
| `pnpm lint` (worktree root) | — | **exit 0** |
| `apps/web` unit suite / browser walks | not run | this branch touches **no** `apps/web` file (`git diff BASE..HEAD --stat`) |
| `packages/runtime` checks | not run as separate commands | this branch touches no `packages/runtime` file; `pnpm lint` runs `check-frozen-workflows` and `check-frozen-evaluators` anyway — both green |

**Vacuity control (work order rule 4).** With the body reverted to 0216's pre-image byte for byte
(sha back to `090217b0…`), `p972.law` reddened `0 !== 1` on the watermark marker and `p972.retro`
reddened `1 !== 0` on the register count; `p972.refire` stayed green, which is the point — it
measures the side the fix must not narrow. Restored with
`CLARA_MIGRATION_REDO=0247_fa_birth_watermark`; the body's sha returned to `d2a63e27…`.

**Both halves of the new frontier gate were exercised**, by pointing the pool at a database that
does not exist so `faBirthWatermarkReady()` takes its catch path: with
`CLARA_ALLOW_MISSING_FA_BIRTH_WATERMARK` unset, `gate972` and `faBirthWatermarkEnforced` both throw
naming the stem; with it set to `1`, `gate972` calls `t.skip(…)` and returns `true`, and
`faBirthWatermarkEnforced` counts a skip and returns `false`.

**The inherited typecheck red.** `apps/web components/documents/document-kind-dialog.tsx(95,42):
error TS7006: Parameter 'k' implicitly has an 'any' type.` The file was last touched by
`4b1376f4 merge: riders wave 1 lane 08`, which `git merge-base --is-ancestor` confirms is an
ancestor of BASE, and `git show 23cfad94:…` shows the identical failing line at BASE. My branch
touches no `apps/web` file. This is the wave-1 integrated head not typechecking, not #972.

**`x41.s4` on the lane rig, precisely.** It stays red on two clients, `x41_b3_12b745` and
`x41_b3_e58a5a`, whose phantom register rows were created at `04:36:37.333Z` and `04:37:42.736Z`
today — by this ticket's own reproduction runs, before 0247 existed. (Two more, `p972_retro_e09005`
and `p972_retro_51e749`, were created at `04:52:53/58` during the vacuity control, while the body
was deliberately reverted; they sit outside the x41 family and the sweep never enumerates them.)
`clara.fixed_assets` forbids DELETE (`_tf_fixed_assets_immutable_0017`, CLR13), and #972 puts
cleaning a long-lived rig out of scope, so **I changed no estate row on the lane rig**. The AC5
green above was taken on a throwaway `template`-copy clone in which those four rows were deleted
with the immutability trigger temporarily disabled and then re-enabled; the clone was dropped
(`drop database … with (force)`), and the cluster now holds `clara_l04` only. Every client built
*after* 0247 sweeps clean on the lane rig itself.

## Docs

`packages/db/tests/README.md` gains "The fixed-asset birth-watermark battery (#972)": the three
cells, the gate module and its migration-order position in the `"test"` chain, why the fixtures are
named `p972_…` outside the x41 family, what 0247 changed about `x41.s4`'s reading of `x41.b3` and
why neither allow-list moved, and the long-lived-rig consequence. No `CONTEXT.md` change: #972 coins
no vocabulary — the enrolment watermark is 0041 §1.2's, and the migration header cites it there
rather than a `CONTEXT.md` term that does not exist. No `docs/PRD.md` or `docs/ARCHITECTURE.md`
change, and no blueprint drift found.

## Successor contract

**None.** #972 is a trigger-body recut behind doors that already exist; it adds no door, no refusal
token and no read. No frozen chat or Work body needs anything: `claraWork_v3`'s acquisition lane
calls the same doors and simply stops seeing a register row it should never have had, and
`clara.reverse_entry`'s contract, argument order and behaviour are unchanged (pinned and re-read).
Nothing is owed to the shared `chatTurn_v22` / `claraWork_v6` cut at the end of wave 4.

## Follow-ups worth filing

1. **`clara._fa_on_approve` arm 4 carries no watermark either.** It is not a live hole — it is only
   ever reached from an approve writer, where `approved_at >= enrolled_at` holds trivially — but the
   two birth sites now disagree in TEXT, and any future caller that re-drives the hook on an
   already-approved entry reopens exactly #972. Aligning arm 4 with the belt's phrasing (via 0042's
   splice idiom, since arm 4's live body is 0041 file text) would make the law single-sourced.
2. **The birth is blind to RETIRED profile generations; the belt is not.** The belt reads the whole
   `[enrolled_at, retired_at]` interval across generations; the birth join takes `fp.active` only.
   An entry approved under a retired generation is therefore in the belt's scope and not the
   birth's. Pre-existing (0216), deliberately untouched by #972; worth measuring on a real
   version-forward.
3. **No supported remedy for a register row born by the pre-0247 body.** DELETE is CLR13 and the
   register's correction path is opening supersede. Either a narrow "retire a phantom register row"
   door or a written rig-rebuild rule should be decided, because today the only answer is "rebuild
   the database".
4. **`x41.b3` leaves one pre-enrolment residue per run on a shared rig.** Harmless after 0247 (the
   sweep classifies it as an A6 window that shuts), but the accumulation is real and the house
   precedent (#884, #651) is to build such fixtures outside the x41 family.
5. **BASE does not typecheck** (item above). Someone should own the wave-1 `apps/web` TS7006.

## Anything unverified

- **Hosted: nothing.** Every figure here is local, on `clara_l04` at 127.0.0.1:55744.
- The **from-scratch** proof of 0247 (a chain 0001→0247 on a disposable cluster) is the integrator's;
  RIG.md forbids a second from-scratch chain on a lane cluster, so I did not run one.
- The frontier gate's "absent chain" path was exercised through a **non-existent database**, not
  against a real pre-0247 chain; the code path taken is the same one the five sibling gates use.
- `x41.s4`'s green is on the **clone** described above, not on the lane rig, and the clone no longer
  exists to re-inspect. The lane rig's own `x41.s4` red is fully accounted for by the two dated
  pre-0247 rows and nothing else — that part is verified there.
