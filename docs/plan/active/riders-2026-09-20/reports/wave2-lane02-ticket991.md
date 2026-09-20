# Wave 2 · lane 02 · ticket #991 — The pack-shaped-read ownership rule as a class, not a function

**Branch** `riders/w2-lane02` · **base** `23cfad947b5598214168ba9c43d391b4e16aa745` · **worktree**
`C:\Users\zhant\Desktop\clara-wt\636` · **database** `127.0.0.1:55742/clara_l02`

**Status: DONE.** The ticket was live on this branch before I built: `gh issue view 991` showed
`state: OPEN`, labels `enhancement` + `ready-for-agent`, and no existing test file, migration or
`packages/db` change carried the class-level census the owner's ruling asks for — only the
function-scoped assertion #783 wrote in `knowledge-retrieval.test.mjs` (`p658.retrieve.no_human_grant`,
hand-listing three functions against a hand-listed set of eight roles).

## Commit (mine)

| commit | what |
|---|---|
| `164c3ac5f` | `test(db)` the pack-shaped-read ownership rule as a class, with its own census |

Tickets before mine on this branch (#898, #913, #993, #912) were already landed; I touched none of
their files.

## No migration (as the brief predicted)

The ticket says "This ticket is expected to need NO migration." Confirmed: the class's four
functions are already `clara_runtime`-only on `main`/this rig (measured, see Acceptance below), so
the deliverable is a census over existing, correct grants — no DDL, no ACL change, nothing to add
to `packages/db/package.json`'s preintegration-gate chain. **Numbers stayed pre-assigned; none used.**

## The seams I tested at (written down before the first test, work order rule 4)

The Agent Brief names the class's own probe as the seam, not a behavioural door:

1. **The live catalog's EXECUTE grants** on the four seeded pack-shaped reads
   (`clara.get_knowledge_pack`, `clara.retrieve_knowledge`, `clara.read_knowledge_record_for`,
   `clara.read_knowledge_history_for`), read through `has_function_privilege` against every
   `clara%` role `pg_roles` reports — never a hand-listed role set, and never `proacl` alone (which
   reads empty, i.e. "nobody", under the still-live default PUBLIC grant).
2. **A real, uncommitted `GRANT`** on one of the four, as the vacuity control — the only way to prove
   the negative direction ("nobody else does") is actually measured and not vacuously true because
   nothing has ever violated it.
3. **`clara.get_context_pack`**, run through the identical detector, as the boundary control —
   proving the class excludes it by curation, not by the detector failing to see its grants.

No cell tests an internal collaborator or a side channel; every measurement is the catalog itself.

## Acceptance criteria, each with its evidence

Battery: `packages/db/tests/pack-shaped-knowledge-read-census.test.mjs` (pkc.1–pkc.5, 5/5).

| AC (Agent Brief, #991) | cell | evidence |
|---|---|---|
| The cell enumerates all four assembled pack-shaped knowledge reads present on main and passes against the current grants | **pkc.1** | `PACK_SHAPED_KNOWLEDGE_READS` = the four exact identities (`get_knowledge_pack(uuid,text,uuid)`, `retrieve_knowledge(uuid,text,date,text[],integer,uuid)`, `read_knowledge_record_for(uuid,uuid,uuid)`, `read_knowledge_history_for(uuid,uuid,uuid)`), each confirmed live by `to_regprocedure` in `before()`. `packShapedReadFindings()` returns `[]` against this rig's real grants (measured independently before writing the test: all four are exactly `{clara_fn_owner, clara_runtime}`). |
| The cell asserts positively that the runtime role holds EXECUTE on each enumerated function, not only that others do not | **pkc.2** | For each of the four, `executors()` (catalog-derived, not hand-listed) is asserted to include `clara_runtime` directly — a separate, positive-only assertion from pkc.1's combined one. |
| Granting EXECUTE on any enumerated function to a human, agent-read or wake role fails the cell with a message naming the function and the role | **pkc.3 (CONTROL)** | A REAL `grant execute on function clara.get_knowledge_pack(uuid,text,uuid) to clara_authenticated`, issued inside a transaction that is always rolled back (never committed, mirrors `operation-census.test.mjs` opcen.4's own idiom). `packShapedReadFindings()` run against that same transaction's connection reports `{label:"unexpected_grantee", function:"clara.get_knowledge_pack(uuid,text,uuid)", role:"clara_authenticated"}` — the function AND the role, by name, in the finding. After rollback, a clean read outside the transaction is `[]` again — the control changed nothing durable. |
| Adding a new, correctly runtime-only function of the same shape requires only a new entry in the enumeration, with no change to the cell's logic | **pkc.4** | `clara.work_knowledge_drift_for(uuid,uuid)` (confirmed live and `{clara_fn_owner, clara_runtime}`-only, independent of this ticket, #658 tail) is appended to a *copy* of the enumeration and passed to the same, unmodified `packShapedReadFindings()`; the result is still `[]`. No detector code changed to accept the fifth entry. |
| `clara.get_context_pack` keeps its existing human and agent-read grants and does not fail the cell | **pkc.4 (negative half) + pkc.5** | pkc.5 asserts `get_context_pack` is not a member of `PACK_SHAPED_KNOWLEDGE_READS` (so the seeded cell never touches it) and separately asserts its live grants still include `clara_authenticated` and `clara_agent_ro`. pkc.4's negative half is the non-vacuous half: running `get_context_pack` through the SAME `packShapedReadFindings()` DOES report both grants as `unexpected_grantee` — proving the class boundary is a deliberate curation of which functions are *in*, not the detector being blind to `get_context_pack`'s ACL. |
| The owner's answer is recorded on this issue in the words the Wayfinder pass will carry, and the issue is queued for that pass | **already satisfied** | The "Owner's ruling (2026-09-20)" comment is already on issue #991 (`gh issue view 991 --comments`), verified present before I built anything. Work order rule 2 forbids commenting on or closing the issue, so I made no GitHub write; this AC needed none from me. |

**Deliberately left out of scope** (the ticket's own list, honoured): no edit to
`.out-of-scope/human-read-of-knowledge-pack.md` or any Architecture blueprint wording (that drift
stays under #683, moved only in a Wayfinder/to-spec pass); no change to the rule's substance; no
change to any existing grant — all four enumerated functions were already compliant and remain so
(pkc.3's grant is issued and rolled back inside one transaction, never committed).

## Vacuity control (work order rule 4), done by hand this round

With the census's own negative branch deliberately broken —

```js
for (const role of holders) {
  if (role === ROLES.runtime || role === ROLES.fnOwner) continue;
  if (true) continue;                 // <-- deliberate break
  findings.push({ label: "unexpected_grantee", ... });
}
```

— pkc.3 and pkc.4 went **red** for exactly the right reason (`expected the leaked grant on
clara.get_knowledge_pack(...) to clara_authenticated to be reported, got []`, and
`get_context_pack's clara_authenticated grant would trip the same detector` respectively), while
pkc.1, pkc.2 and pkc.5 stayed **green** — which is itself informative: pkc.1 alone, on a clean rig
with no pre-existing leaked grant, cannot detect a broken negative branch, so pkc.3's real GRANT is
not redundant with pkc.1, it is the only cell that actually exercises that code path. The subject
was then restored **byte for byte**:
`sha256` before break `538bb26595694d2bfee6983778b6eed593622b8dedc9c4224f878407c53dc4cf`, after
restore **identical**. Re-run afterward: 5/5 green.

## Gates, with counts

| gate | result |
|---|---|
| The new file, alone | `node --test --test-concurrency=1 tests/pack-shaped-knowledge-read-census.test.mjs` → **5 tests, 5 pass, 0 fail** |
| The new file, with the FULL preintegration-gate chain (`$GATES` = every `--import ./tests/*-preintegration-gate.mjs` flag in `packages/db/package.json`'s `test` script, 51 flags) | **5 tests, 5 pass, 0 fail** |
| `operation-census.test.mjs` (touched `packages/db/tests`, run as insurance though no SQL function was added) | **10 tests, 10 pass, 0 fail** |
| `rig-isolation.test.mjs` (same reason) | **23 tests, 22 pass, 0 fail, 1 skip** (T19 `poison-role`, expected — destructive, gated on `CLARA_RIG_ALLOW_RESET` which RIG.md forbids setting; T10b, the one RIG.md specifically warns about, is green — no World was bootstrapped on this database) |
| Neither `operation-census.test.mjs` nor `rig-isolation.test.mjs` run with `CLARA_RIG_ALLOW_RESET` or `CLARA_RIG_ALLOW_ROLE_SWEEP` | confirmed — env for every run above was exactly `PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres PGDATABASE=clara_l02 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1` |
| `pnpm lint` (repo root) | **exit 0**, clean — no error or warning line in the captured output |
| `pnpm typecheck` (repo root) | **RED, pre-existing, unrelated.** `apps/web/components/documents/document-kind-dialog.tsx(95)`: `TS2552 Cannot find name 'DOCUMENT_KINDS'` + `TS7006`. Verified present at this lane's own base commit `23cfad947b5598214168ba9c43d391b4e16aa745` (`git show 23cfad94:apps/web/components/documents/document-kind-dialog.tsx` already calls `DOCUMENT_KINDS.map(...)` while importing only `CLASSIFIABLE_DOCUMENT_KINDS`) — this is the same inherited defect #912's own report already filed as a wave-wide follow-up. `packages/db` carries no `typecheck` script (plain `.mjs`), so this ticket's own files are outside `tsc`'s scope entirely. Nothing of mine errors. |
| `apps/web` whole unit suite / browser walks | **not run — I did not touch `apps/web`** (work order rule 8 conditions these on having touched it) |
| `packages/runtime` unit files / frozen-workflow checks | **not run — I did not touch `packages/runtime`** |

## Docs (in the same commit)

- `packages/db/README.md` — a new paragraph under "Bounded knowledge retrieval, the recorded
  read-set and drift (#658, 0230)", right after the existing `#783` paragraph: **"#991 restates that
  rule as a CLASS, with its own census."** Names the file, the seeded four, the catalog-derived
  probe, `get_context_pack`'s deliberate exclusion, and points the blueprint-wording drift at #683
  per the owner's ruling.
- `CONTEXT.md` — **not touched.** "Pack-shaped read" is engineering/access-control vocabulary, not a
  product/domain term a firm user encounters (unlike "Knowledge pack", which already has a CONTEXT.md
  entry); the existing precedent for this exact class of vocabulary (`#783`) also lives only in
  `packages/db/README.md`, never in `CONTEXT.md`, and I followed that precedent rather than invent a
  new one.

## Shared files touched (rule 7)

None. `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/e2e/serve-built.mjs`,
`e2e-fixture-ownership.test.ts`, `lib/navigation/tree.ts`, `packages/db/tests/rig-meta.mjs`,
`packages/db/package.json`, `.github/actions/db-live-gates/action.yml`, `CONTEXT.md` — all
untouched. The only files this ticket changed are the new test file and
`packages/db/README.md`.

## Successor contract

**None owed.** Grepped `packages/runtime` and `apps/web` for `get_knowledge_pack`,
`retrieve_knowledge`, `read_knowledge_record_for`, `read_knowledge_history_for` and
`pack-shaped`/`pack_shaped`: every call site is already inside the runtime lane (the four are
`clara_runtime`-only and this ticket changed no grant), and this deliverable is a database-only
census with no new door, no new part kind and nothing a frozen chat or Work body would need to call.
If a fifth pack-shaped read is ever built, its only successor obligation is a one-line addition to
`PACK_SHAPED_KNOWLEDGE_READS` in `packages/db/tests/pack-shaped-knowledge-read-census.test.mjs` —
which is the ticket's own AC4, proven by pkc.4.

## Follow-ups worth filing

- None new. The one pre-existing typecheck/build defect this report notes
  (`document-kind-dialog.tsx`'s `DOCUMENT_KINDS`) is already filed as a wave-wide follow-up in
  `wave2-lane02-ticket912.md` (#912's report, same lane, filed 2026-09-19/20); I did not re-file it.

## Unverified

- **From-scratch apply**: not applicable — this ticket ships no migration.
- **A role born in a future migration actually getting caught by this census**: proven only by
  substitution (pkc.3's real `GRANT` to an *existing* role, `clara_authenticated`) because minting a
  brand-new `clara_*` role for the test would itself be schema-shaped work outside a
  no-migration ticket's scope; `executors()`'s `pg_roles ... like 'clara%'` sweep is unconditional on
  role identity, so a new role is read exactly the same way as an old one, but I have not watched a
  literally-new role trip it.
