# Wave 2 · Lane 01 · #868 — the subledger hook states its own live caller roster

**Status: DONE.** Branch `riders/w2-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, rig
`127.0.0.1:55741` / `clara_l01`. Base `23cfad947b5598214168ba9c43d391b4e16aa745` (the integrated
head of wave 1). Second ticket of the lane; `#1014` had already landed four commits and applied
migration `0235` before I started (confirmed by `git log 23cfad94..HEAD` at start-of-turn).

```
48a5278ec fix(db): #868 the subledger hook states its own live caller roster
```

(on top of `#1014`'s four commits, unchanged by me: `d33481f41`, `3dde8c179`, `041f85cf9`,
`88006ff67`.)

**The ticket was still live on this branch.** `select obj_description('clara._subledger_on_approve(uuid)'::regprocedure, 'pg_proc')`
returned `null` before my edit — no comment existed anywhere, confirming the 2026-09-19 triage
comment's "still open" list was accurate on this database, not already closed by `#1014` or by
`0235`.

---

## The seam I tested at (written down before the first test, work-order rule 4)

The Agent Brief's "Key interfaces" names exactly one, and I added no seam it does not give me:

1. **`clara._subledger_on_approve`'s catalog comment** (`obj_description(...,'pg_proc')`) — the one
   public surface a migration that "gains a comment; body untouched" can be observed through. No
   door, no wire shape, no new relation, so a structural/catalog cell is the only honest one for it
   (work-order rule 4's "where this repo's documented standard asks for a structural cell, that
   standard wins" — the same reasoning `#1014`'s report used for its lock helper).

A second, non-regression fact rides along because AC3 names it explicitly ("no body, trigger or
grant changes"): the hook's `prosrc` sha, owner, `SECURITY DEFINER` flag, grant and trigger
reachability, all re-read from the catalog rather than assumed.

---

## The vertical slice, red for its own reason

One seam, one cycle: `packages/db/tests/subledger-hook-caller-roster.test.mjs` written first,
5 cells (`sr.1`–`sr.5`), run **before** `0236` existed on disk.

**Red, for the right reason.** `node --test tests/subledger-hook-caller-roster.test.mjs` (no gate
preloaded, a focused run) failed all 5 cells in the `before()` hook itself, with the loud premise
error the file is written to raise: `#868 premise 0236_subledger_hook_caller_roster.sql is not
applied (no subledger_hook_caller_roster$ row in clara.schema_migrations) and
CLARA_ALLOW_MISSING_SUBLEDGER_HOOK_ROSTER is unset -- this is a FOCUSED run and must fail loudly,
not skip.` A skip would not have been evidence; a hard failure was the correct red.

**Green.** `packages/db/migrations/0236_subledger_hook_caller_roster.sql` written, applied with
`pnpm db:migrate` (prestate/tail notices below), then the same focused run: **5 pass / 0 fail**
(after one self-inflicted bug fix: `array_agg(p.proname order by …)` returns Postgres `_name`, which
`node-postgres` does not auto-parse into a JS array — fixed by casting to `p.proname::text` in the
test's own read-back query; the migration's own PL/pgSQL comparisons were never affected, since
`text[] is distinct from array[...]` works natively inside `plpgsql`).

**Vacuity control (work-order rule 4, "a ticket whose whole deliverable is a test still needs
it").** With `0236` applied, I ran, by hand, outside the migration file:

```sql
comment on function clara._subledger_on_approve(uuid) is 'deliberately broken subject for the vacuity control';
```

Re-ran the focused test: `sr.1`, `sr.2`, `sr.3` went **red** (they read the comment); `sr.4`, `sr.5`
stayed **green** (they read `prosrc`/owner/ACL/triggers, an independent fact the corruption did not
touch) — proof the cells discriminate on what they claim to, not on each other. Restored the
subject byte-for-byte via the supported redo path (`packages/db/README.md` "Redo (#957)"):
`CLARA_MIGRATION_REDO=0236_subledger_hook_caller_roster pnpm db:migrate` (the migration file itself
was never edited during this exercise — the redo re-ran the same unmodified `comment on function`
statement). Re-ran the focused test: **5/5 green** again. No battery of red cells was written ahead
of the implementation; the migration went from absent straight to its final, evidence-checked text.

---

## Migration

**`packages/db/migrations/0236_subledger_hook_caller_roster.sql`** (≈195 lines), stable stem
`subledger_hook_caller_roster$`. Exactly one DDL statement: `comment on function
clara._subledger_on_approve(uuid) is '...'`. No `set role` (nothing is created or owned by this
file, so ownership is irrelevant to a `comment on function`, and the superuser migration
connection can issue it regardless).

### Prestate pin, MEASURED on this rig before the file was written

| body | `sha256(prosrc)` | treated as |
|---|---|---|
| `clara._subledger_on_approve(uuid)` | `6e37c601ff716e0c73b3061bcb503cc01539f2f237841650657fa2d9600accfd` | 0037's original body, live and unmoved at 230 migrations (0001→0235) |

Plus a re-derivation (not a hard pin, per AC1): the prestate re-runs the exact
`position('clara._subledger_on_approve(' in p.prosrc)` scan `0216`/`0221`'s own tails use and
refuses to write the comment unless the live set is exactly the measured six, by name. Measured on
this rig: `{_approve_entry_core,_approve_opening_entry,approve_wrong_client_correction,
finalize_close,reopen_fiscal_year,reverse_entry}` — matches.

### The arrival-migration research (AC2), and one correction to an existing comment

Independent archaeology, cited in both the SQL comment and `packages/db/README.md`'s new "0236"
section:

| caller | arrived | evidence |
|---|---|---|
| `_approve_entry_core` | 0037 | created calling the hook (0037:1050 creates the hook itself; 0037's own tail pins the four at 0037:3840-3845) |
| `_approve_opening_entry` | 0037 | same |
| `approve_wrong_client_correction` | 0037 | same |
| `reverse_entry` | 0037 | same |
| `finalize_close` | 0056 | created already calling it (0056:2003 creates the function, 0056:2276 is the `perform` call) |
| `reopen_fiscal_year` | 0085 / 0086 | **not** 0056 — see below |

**The correction.** `0216`'s own in-file comment (line 930) attributes both new callers to "0056's
close model added `finalize_close` … and `reopen_fiscal_year`". I verified this is imprecise for
`reopen_fiscal_year`:

- `grep -c "_subledger_on_approve" packages/db/migrations/0056_wave_e_close_model.sql` inside the
  `reopen_fiscal_year` definition (lines 2360–2517) is **zero** — the only hit in the whole file is
  `finalize_close`'s call at line 2276.
- `0085_b3_reopen_ends_on.sql`'s own header states outright: *"0056's reopen routes its unwind
  through `clara.reverse_entry`"* — i.e. at 0056, `reopen_fiscal_year` was not itself a direct
  caller; it called `reverse_entry`, which called the hook.
- `0085:399` is where `perform clara._subledger_on_approve(v_mirror);` first appears inside
  `reopen_fiscal_year`'s (recut) body.
- `0086_b3_reopen_ends_on_part2.sql` (the sibling file `0085`'s header requires) is the migration
  that pins the resulting caller census at six and the approve-writer census at six, both
  re-derived from the catalog, and states in its own `raise notice`: *"the sixth is
  reopen_fiscal_year, which now performs its own census-visible flip instead of delegating to
  reverse_entry"*.

I did not edit `0216` (applied, immutable, out of scope). `0236`'s comment carries the corrected
attribution (0085/0086), and both `packages/db/README.md` and the SQL comment note the
discrepancy explicitly rather than silently disagreeing with `0216`'s prose.

### Gate ceremony

- Preintegration gate module: `packages/db/tests/subledger-hook-caller-roster-preintegration-gate.mjs`
  (sets `CLARA_ALLOW_MISSING_SUBLEDGER_HOOK_ROSTER=1`), registered in `packages/db/package.json`'s
  `test` script, appended after `opening-binding-claim-preintegration-gate.mjs` (0235) — the sorted
  (migration-order) position.
- Frontier gate: inline in the test file (`STEM = "subledger_hook_caller_roster$"` against
  `clara.schema_migrations`), following `preview-invite.test.mjs`'s lighter shape rather than a
  dedicated fixtures module — this ticket has one seam and no fixture-building of its own.
- **No rig-meta cohort was added, deliberately.** `0236` mints no relation, no function, no grant
  and recuts no body (`create or replace` of nothing) — `rig-meta.mjs`'s cohorts track grant/table
  census, and nothing here moves either. Confirmed rather than assumed: `rig-isolation.test.mjs`
  and `operation-census.test.mjs` (both consumers of `rig-meta.mjs`) pass unchanged, see Gates.

---

## Acceptance criteria

**AC1 — "The migration derives the roster from the catalogue and refuses if it is not the six 0216
and 0221 pin."** **Done.** `0236`'s prestate (§A.2) runs the re-derivation and would `raise
exception … using errcode='CLR10'` on a mismatch; the tail (§C.3) re-runs it after. Evidence: the
migration applied cleanly with notice `#868 prestate: clean -- … its live caller roster is exactly
the measured six`, and `sr.5` re-asserts the same fact from the test side, both **passing** because
the live estate genuinely is the measured six — I did not (and per scope could not) fabricate a
red case for "refuses if wrong" without corrupting one of the six real caller bodies, which is out
of scope (AC3, "no body … changes"). The refusal path is exercised the same way `0216`/`0221`'s own
tails prove theirs: by being live code that runs on every apply.

**AC2 — "The hook's comment names all six callers with their arrival migrations."** **Done.**
`sr.1` (all six names present) and `sr.2` (each name credited to its correct migration, read
positionally out of the comment text) both green. The comment text: `_approve_entry_core (0037)`,
`_approve_opening_entry (0037)`, `approve_wrong_client_correction (0037)`, `reverse_entry (0037)`,
`finalize_close (0056)`, `reopen_fiscal_year (0085`, plus the 0086 sibling citation and the
corrected-attribution note (`sr.3`, plus explicit mentions of `0216`/`0221`/`STALE`).

**AC3 — "No body, trigger or grant changes; applies from scratch."** **Done.** `sr.4`: `prosrc`
sha unchanged (`6e37c601…`), owner still `clara_fn_owner`, `SECURITY DEFINER` still true, ACL still
exactly `{clara_fn_owner=X/clara_fn_owner}` (no PUBLIC, no application role). `sr.5`: zero
`pg_trigger` rows name the hook as `tgfoid` (unchanged from before — it has never been installed as
a trigger function), and the six-name caller census is unchanged. "Applies from scratch": the
migration applied as `#231` in sequence on a chain that ran `0001→0235` from scratch earlier in
this lane (`#1014`'s report); I did not run a second from-scratch chain (RIG.md forbids it on a
reused cluster — `#867`), so the from-scratch claim rests on `0236` applying cleanly onto that
chain's live state, not on a fresh `0001→0236` run of my own. Recorded under "Unverified" below.

---

## Gates, with counts

Every `packages/db` run is from `packages/db` with the FULL preintegration gate chain
(`node --test --test-concurrency=1 $GATES <file>`, `$GATES` regenerated from `package.json` after
my own gate module was registered).

| gate | result |
|---|---|
| `subledger-hook-caller-roster.test.mjs` (added) — focused, no gate preloaded | **RED before `0236`** (loud premise failure, all 5 cells), **GREEN after** (5/5) |
| `subledger-hook-caller-roster.test.mjs` — with full gate chain preloaded | **5 pass / 0 fail / 0 skip** |
| `operation-census.test.mjs` | **10 pass / 0 fail / 0 skip** |
| `rig-isolation.test.mjs` | **22 pass / 0 fail / 1 skip** — T19, the documented `CLARA_RIG_ALLOW_RESET` skip, not touched |
| `pnpm --filter @clara/db lint` | **exit 0**, silent |
| `pnpm lint` (root, full chain) | **exit 0** |
| `pnpm typecheck` (root) | **exit 2 — RED AT BASE, not this ticket.** See below (identical finding to `#1014`'s report) |

Neither reset flag (`CLARA_RIG_ALLOW_RESET`, `CLARA_RIG_ALLOW_ROLE_SWEEP`) was ever set. No second
from-scratch chain was run on this cluster. I added no SQL function, so `operation-census`/
`rig-isolation` were run as an extra confidence check (WORK-ORDER.md rule 8 asks for them whenever
`packages/db/tests` is touched; the lane task's own gate list conditions them on "if you added SQL
functions", which I did not) rather than a strict requirement — both pass either way.

`apps/web` and `packages/runtime` are **untouched** by this diff (`git diff --name-only
d33481f41..HEAD` lists exactly 6 files, all under `packages/db`), so the web unit suite, browser
walks, `check-frozen-workflows.mjs` and `check-parts-parity.mjs` were not triggered.

### `pnpm typecheck` is red at the wave-2 base — pre-existing, not this ticket's

```
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,22): error TS2552:
  Cannot find name 'DOCUMENT_KINDS'. Did you mean 'documentId'?
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,42): error TS7006:
  Parameter 'k' implicitly has an 'any' type.
```

Same finding `#1014`'s report already recorded on this branch (I re-observed it, did not
re-diagnose it). `packages/runtime typecheck: Done` in the same run. Nothing in my diff touches
`apps/web`; not fixed here (work-order rule 5, scope discipline) and already flagged to the
integrator by the prior ticket's report.

---

## Docs, in the same commit

- `packages/db/README.md` — new section **"0236 — the subledger hook's caller roster, stated on
  the hook itself (#868)"**: the six callers with arrival migrations in a table, the
  `reopen_fiscal_year` correction and its evidence, and what the migration's prestate/tail check.
- `packages/db/tests/README.md` — one paragraph added to "Named suite families" describing
  `subledger-hook-caller-roster.test.mjs` and its gate, in the same style as the `preview-invite`
  entry beside it.
- `CONTEXT.md` — **not touched.** No new domain vocabulary: "the subledger hook" and its caller
  roster are an internal implementation fact (a Postgres function's catalog comment), not a term a
  reader of the shared accounting vocabulary needs; `CONTEXT.md` did not mention "subledger" before
  this ticket and does not need to now.

---

## Successor contract

**None.** Nothing here is reachable from a frozen chat body, a frozen workflow closure module, or
the Work tool — `clara._subledger_on_approve` is an internal Postgres trigger-adjacent helper,
never wired to any door, wire shape or agent-facing surface. `node scripts/check-frozen-workflows.mjs`
was not run standalone (not required — `apps/web`/`packages/runtime` untouched) but `pnpm lint`
runs it as part of the root chain and reported no manifest diff.

---

## Follow-ups worth filing (I filed none — no GitHub writes)

1. **`0216`'s own in-file comment misattributes `reopen_fiscal_year`'s hook call to "0056".** Not
   wrong at the level `0216`'s own assertion checks (the roster count/names), but the prose is
   imprecise about *when*. `0216` is applied and immutable and this ticket's Agent Brief placed
   editing it out of scope; `0236`'s comment and `packages/db/README.md` both carry the corrected
   citation, so a future reader who compares the two will find the correction rather than a
   contradiction, but the stale prose in `0216` itself was not (and could not be) touched.
2. **`apps/web/components/documents/document-kind-dialog.tsx` does not compile** — pre-existing at
   the wave-2 base, from riders wave 1 lane 08, already flagged by `#1014`'s report. Repeating it
   here only because every wave-2 lane's `pnpm typecheck` will keep reporting it until someone
   fixes it or the integrator accepts it as a known wave-1 residue.

---

## Unverified / deliberately left

- **A true from-scratch `0001→0236` chain was not run by me.** RIG.md forbids a second
  from-scratch chain on this reused cluster (migration 0154's role-count pin, `#867`). What I *can*
  evidence: `0236` applied cleanly onto the chain `#1014` already ran from scratch this session (per
  its own report), with both prestate and tail notices green, and was additionally exercised twice
  more through the supported `#957` redo path during the vacuity control, each time re-asserting
  the same tail facts.
- **Whether `0221`'s own tail cites the same six by the same exact array literal as `0216`'s was
  not independently re-verified byte-for-byte** — I verified `0216`'s literal and the live catalog
  measurement directly; `0221` was checked only by grep for its participation in the roster
  discussion (ticket comments, `WAVE-DIGEST.md` context), not by reading its full tail block. Low
  risk: both `sr.5` and the migration's own guard measure the *live* catalog independently of
  either migration's literal text, so a mismatch there would have failed the migration's own apply,
  not merely gone unnoticed.
- **No pairing with `#906`**, despite the 2026-09-17 triage comment's suggestion that the two
  tickets "can share one migration" (also a comment on a shared function). I was dispatched as the
  sole implementer of `#868`, with migration number `0236` reserved for this ticket alone and
  `#906` next in the lane's own order; I did not widen this ticket's migration to also cover `#906`
  or reserve room in it for that ticket's implementer to extend. `#906`'s implementer inherits a
  clean, single-purpose `0236` to reference rather than a shared file to edit.
