# Wave 2 · Lane 01 · #1014 — opening-balance evidence wall: the concurrent double commit

**Status: DONE.** Branch `riders/w2-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, rig
`127.0.0.1:55741` / `clara_l01`. Base `23cfad947b5598214168ba9c43d391b4e16aa745` (the integrated
head of wave 1). This lane's first ticket: `git log <base>..HEAD` was EMPTY at start, and no earlier
ticket of the lane had applied a migration (the database was at 229 files / `0234_legal_enforcement_mode`).

```
d33481f41 docs(db): #1014 the claim over-refuses on purpose, and the file says so
3dde8c179 test(db,docs): #1014 the claim's own census, the restated lock order and the vocabulary
041f85cf9 fix(db): #1014 the raced loser is refused in the wall's own voice, never a raw 40001
88006ff67 fix(db): #1014 the document binding becomes a claim, so a blocked opening approval loses
```

**The ticket was still live on this branch.** `obw.race.evidence_then_opening` — #854's regression
sentinel, which asserts that BOTH sides commit — passed 5/5 on the untouched branch before any edit.
The double posting was real here, not already repaired by wave 1.

---

## The seams I tested at (written down before the first test, work-order rule 4)

The brief's "Key interfaces" names two, and I added no seam it does not give me:

1. **`clara.approve_opening_seed`** driven as a real signed-in SERIALIZABLE session against a real
   concurrent `clara.attach_entry_evidence` session — through `humanHoldThenContend`, the battery's
   existing two-session driver. Everything behavioural is asserted here: who commits, what stands on
   the document afterwards (read off committed rows through `postedEntriesOnDocument`), and what the
   loser is told.
2. **The shared document-binding lock, `clara._lock_document_binding`** — as a CATALOG fact
   (ownership, definer posture, ACL, the positional lock-then-claim order) rather than as a callable.
   It is granted to nobody and reachable only from the two binding-wall triggers, so a structural
   census is the only honest cell for it; work-order rule 4's "where this repo's documented standard
   asks for a structural cell, that standard wins" is what it rests on, and `cle.wall` beside 0197's
   tail is the precedent.

Not a seam, and never asserted as one: the claim relation's contents as a domain answer. The one
place a test reads a claim row (`obw.claim`) does so to prove the recut body is REACHED, and says so.

---

## The vertical slices, each red for its own reason

| Slice | The cell | Red, and why | Green after |
|---|---|---|---|
| A | `obw.race.evidence_then_opening`, rewritten to demand exactly one commit | `expected: false / actual: true` — the opening approval returned `{"status":"finalized","entry_count":3}` while the attachment also held. Measured with the frontier gate lifted for the run, restored byte-for-byte after | `0235` (the claim, no refusal mapping) |
| B | `obw.race.typed_refusal` (new) + `assertLoserRefusal(..., "CLR13")` on slice A's cell | both red with `code: "40001"`, `"could not serialize access due to concurrent update"`, `detail: {}` | the `serialization_failure` handler in `clara._lock_document_binding`, applied by redo |
| C | `obw.claim` (catalog census) | vacuity control instead of a natural red: see below | — |

No slice wrote a test it did not then make pass, and no battery of red cells was written ahead of the
implementation.

**Slice C's vacuity control.** `grant select on clara.document_binding_claims to clara_authenticated`
→ `obw.claim` red on exactly the grant assertion (`claim: clara_authenticated holds NO grant on the
token`) → `revoke` → `relacl` re-read as `{clara_fn_owner=arwdDxtm/clara_fn_owner}`, byte-identical
to the pre-break reading → battery green 7/7.

---

## Migration

**`packages/db/migrations/0235_opening_binding_claim.sql`** (510 lines), stable stem
`opening_binding_claim$`.

- **§B** mints `clara.document_binding_claims` (`document_id` PK / `claim_seq` / `claimed_at`):
  `clara_fn_owner`-owned, RLS enabled AND forced, one owner policy, a `TRUNCATE` guard, no grant for
  PUBLIC or any application role. Deliberately **no FK to `clara.documents`**: 0197 §B's contract is
  that a document that does not exist locks nothing and RAISES nothing, and an FK would turn that
  into a `foreign_key_violation`.
- **§C** recuts exactly one body, `clara._lock_document_binding`, with `create or replace` — so no
  catalog entry enters or leaves and the grant matrix is untouched. The `for update` on
  `clara.documents` is unmoved and still first; the claim upsert follows it, for the same document.
- It recuts **nothing else** and edits no applied migration.

### Prestate pins, MEASURED on this rig before the file was written

| body | `sha256(prosrc)` | treated as |
|---|---|---|
| `clara._lock_document_binding(uuid)` | `5aeaf6fa369348ff32d30e85c99dde724f29bf378841a684f12fed7465909aff` | 0197's body — **redo-tolerant**: the prestate also accepts #1014's own body and says which state it found |
| `clara._tf_source_binding_wall()` | `f87510af34baf827b684cdb6402f6d0c483dc7a4f22521a260615823e4ce6eb6` | 0213's live body, left alone, re-pinned in the tail |
| `clara._tf_evidence_link_binding_wall()` | `9ad9cfacc6af237e1e420694ec8bbc27fecf4ad1076ad1a9f7fc9a895f0a8093` | 0197's, left alone |
| `clara._document_posting_entry(uuid,uuid)` | `8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0` | 0182's probe, left alone |
| `clara._approve_opening_entry(uuid,uuid,uuid,text,integer)` | `314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7` | left alone |
| `clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)` | `f18f4c95e8d79c842c707207cfe4a4cc26418c503c33a9c8cce8c85a20791132` | human door, left alone |
| `clara.approve_opening_correction(uuid,jsonb,text,text)` | `4a1e7bc37827fc382ed91451d21274ace20e24575620df050cddb562ab05ffc4` | human door, left alone |

Note that 0213's *header* pins `clara._tf_source_binding_wall` at `d90c0b03…` — that is the **0197**
body it replaced. The live post-0213 body is `f87510af…`, measured here; the work order's "an earlier
ticket may already have recut a body you touch: pin what is LIVE" applied, one file earlier than
expected.

### Redo (recorded, per the prompt)

The migration was **applied once and redone twice**, all with
`CLARA_MIGRATION_REDO=0235_opening_binding_claim` + `CLARA_ALLOW_DESTRUCTIVE=1` (`packages/db/README.md`,
"Redo (#957)"):

1. first apply — prestate notice `state: first apply (the 0197 lock-only body)`, `230 total`;
2. redo for slice B's refusal handler — notice `state: redo (#1014's own body is already live)`,
   checksum `5c3e32c38feecbc39f357b938017559a228ea9eaaa42a9a43847f2237d513b38`;
3. redo for the comment-only over-refusal note — checksum
   `012d744ad9ea7f1894967639e5799e9387f49a20cefb4b8a78618569a938b045`.

The file is redo-safe by construction: `create table if not exists`, `drop policy if exists` /
`drop trigger if exists` before create, `create or replace function`, and a prestate that admits both
lawful states of the one body it replaces. Both redos exercised that path for real.

### Gate ceremony

- Preintegration gate module: `packages/db/tests/opening-binding-claim-preintegration-gate.mjs`
  (sets `CLARA_ALLOW_MISSING_OPENING_BINDING_CLAIM=1`), registered in `packages/db/package.json`'s
  `test` script at the sorted position, after `legal-enforcement-mode` (0234).
- Frontier gate: `BINDING_CLAIM_STEM = "opening_binding_claim$"` + `gateBindingClaim(t)` in
  `packages/db/tests/coding-lane-evidence-link-fixtures.mjs`, beside `gateOpeningWall`; the battery's
  `before` throws on a FOCUSED run below 0235 unless the gate module is preloaded (the #1008 shape).
- rig-meta cohort: `OPENING_BINDING_CLAIM_0235_TABLES = ["document_binding_claims"]`, gated into
  `governedRlsFailures()`'s roster exactly as `DOCUMENT_SOURCE_REVISION_0217_TABLES` is. **No EXECUTE
  cohort is owed and none was added**: 0235 recuts one body in place and mints no function name, so
  the grant matrix does not move.

---

## What the repair actually is, and why the obvious one was not available

#854's report guessed the fix would be "a fresh re-read of `entry_evidence_links` under the document
lock, or a `SELECT … FOR UPDATE` against `entry_evidence_links` itself". **Neither is reachable.** A
SERIALIZABLE transaction cannot read what committed after its snapshot at all, and a row the winner
*inserted* is invisible to a locking clause too. The repair had to be a **conflict**, not a re-read.

Three measurements on this rig (PostgreSQL 17), taken on three throwaway relations in a `spike1014`
schema created and dropped inside the same run, before the migration was written:

| the holder | the SERIALIZABLE waiter |
|---|---|
| LOCKS the row only (`select … for update`) | **proceeds** — this is the defect, reproduced in isolation |
| UPDATES a row the waiter can see | `40001 could not serialize access due to concurrent update` |
| INSERTS a row the waiter's snapshot cannot see; waiter upserts that key `ON CONFLICT DO UPDATE` | same `40001` |

and a fourth, on a throwaway plpgsql function: catching that `serialization_failure` in a subtransaction
and re-raising a `CLR13` propagates the typed error, and the losing transaction still rolls back cleanly.
Both spike schemas were dropped; `select nspname from pg_namespace where nspname like 'spike%'` returns
nothing.

PostgreSQL 17 docs (Context7, `/websites/postgresql_17`): "Transaction Isolation" §13.2.2/§13.2.3 and
"Serialization Failure Handling" §13.5 give the general rule that 40001 is the level's own refusal.
The three outcomes above are **this rig's measurement, not a quotation** — I did not find the exact
`ON CONFLICT`-under-Repeatable-Read sentence in the indexed docs and have not asserted one.

`ON CONFLICT DO UPDATE` rather than `DO NOTHING` is load-bearing: `DO NOTHING` against a **visible**
conflicting row takes no row lock at all, which would have left the race open from a document's second
binding onwards. The migration's tail refuses a body that uses it.

---

## Acceptance criteria

**AC1 — `obw.race.evidence_then_opening` rewritten to assert the CORRECT outcome (exactly one commit,
the loser refused with the typed refusal) and passes; it failed before the fix for the right reason.**
**Done.** `packages/db/tests/opening-balance-evidence-link.test.mjs`. The cell now asserts: the
attachment holds; the opening approval genuinely BLOCKED (`provedBlocked`, `waitEventType === "Lock"`);
`out.b.ok === false`; `assertLoserRefusal(out.b, …, "CLR13")`; `postedEntriesOnDocument` returns
**exactly one** row, and it is the host entry counted through its live link; **every** opening item is
still `draft` (the batch is atomic, as the sequential `obw.evidence_first` cell leaves it); one live
link. Red before the migration with `expected: false / actual: true` and the finalized receipt printed;
red again at slice B with `code: "40001"`; green after. Run: `opening-balance-evidence-link.test.mjs`
**7 pass / 0 fail / 0 skipped**.

**AC2 — `obw.race.opening_then_evidence` still passes unchanged, and the multi-item sibling allowance
cell still passes.** **Done.** Both are byte-unchanged in this diff (`git diff` touches neither cell's
assertions) and both green in the same run: `obw.race.opening_then_evidence` still proves its
contender blocked on a `Lock` and still loses `CLR13 source_already_posted` naming the seed's items,
and `obw.siblings_ok` still approves every item of a ≥3-item seed on one tie document. The sibling
case is also what made `ON CONFLICT DO UPDATE` safe: a second claim of the same key from the SAME
transaction updates the row it already inserted, measured in the spike before the migration.

**AC3 — a cell proves the refused side sees the wall's typed refusal, not SQLSTATE 40001 or another
raw error.** **Done.** `obw.race.typed_refusal` drives the same race and asserts: `code !== "40001"`;
`code === CLR13`; `detail.reason === "source_already_posted"`; `detail.document_id` is the tie
document; `detail.conflict === true`. It then raises the SAME refusal **sequentially** on a second
staged seed and asserts the raced message is byte-identical to it and the detail KEY SETS match — so
no wire token grows for the concurrent arm. The one honest difference is pinned in both directions:
sequentially `detail.entry_id` is the host entry; in the race it is `null`.

*The `entry_id: null` limit, stated plainly.* Every other arm names the entry standing on the document
because it can SEE it. The losing session here cannot — the winner committed after its snapshot. The
key is present-and-null rather than absent, which is what keeps `obw.same_spelling`'s key-set
comparison true. Confirmed harmless downstream: `packages/runtime/src/workRoutes.ts:1005-1014` builds
its 409 with `detail_field(err, "entry_id")` and documents "neither id is invented: a detail without
one answers null"; `apps/web/components/registers/opening-approve-dialogs.tsx` surfaces the door's
refusal message verbatim and does not read `entry_id`.

**AC4 — the lock-order paragraph the opening lane documents is restated once with the new rule, and the
estate's lock order is respected.** **Done.** The §4 header of
`packages/db/tests/opening-balance-evidence-link.test.mjs` is rewritten: it restates the paragraph
once, explicitly superseding #854's wording, and adds the new rung — the document is now TWO
acquisitions, `clara.documents … for update` then that same document's claim, both through the one
helper and always in that order. **The estate's ladder is untouched**: `accounting_plans →
accounting_work → agent_tasks → agent_interruptions` (ARCHITECTURE §6) contains no body that takes the
claim, and the claim takes nothing on it. No new deadlock pair: a transaction binding documents A then
B takes `A.doc, A.claim, B.doc, B.claim`, so the relative order of two documents is the one
`clara.documents` already imposed, and two transactions that inverted it would already have deadlocked
on `clara.documents` before this file. The same paragraph is in `packages/db/README.md` §"0235".

**AC5 — from-scratch chain and the opening batteries pass; the human-facing opening doors' ACLs, owners
and search paths are unchanged (tail assertions).** **Doors: done and asserted. From-scratch chain:
delegated, see "Unverified".** §D of the migration re-reads, for BOTH
`clara.approve_opening_seed` and `clara.approve_opening_correction`: owner `clara_fn_owner`, the
SECURITY DEFINER flag, `search_path=clara, pg_temp`, 0171's `default_transaction_isolation=serializable`
proconfig, `sha256(prosrc)` unmoved, `clara_authenticated` still holds EXECUTE, and PUBLIC /
`clara_runtime` / `clara_agent_ro` still do not — narrowing and widening both refused. Opening
batteries: `wave-b/wb-k-approval.test.mjs` **14/14**, `x42-s5-residuals.test.mjs` **9/9** (the
`x42.s5.2c` carve-out), `opening-balance-evidence-link.test.mjs` **7/7**.

---

## Gates, with counts

Every `packages/db` run is from `packages/db` with the FULL preintegration gate chain
(`node --test --test-concurrency=1 $GATES <file>`, `$GATES` regenerated from `package.json` after my
own gate module was registered).

| gate | result |
|---|---|
| `opening-balance-evidence-link.test.mjs` (added/rewrote cells) | **7 pass / 0 fail / 0 skip** |
| `coding-lane-evidence-link.test.mjs` (I edited its fixtures module) | **8 pass / 0 fail / 0 skip** |
| `rig-isolation.test.mjs` (I edited `rig-meta.mjs`; T18 covers the new table) | **22 pass / 0 fail / 1 skip** — T19, the documented `CLARA_RIG_ALLOW_RESET` skip |
| `operation-census.test.mjs` | **10 pass / 0 fail / 0 skip** |
| `rig-docs-isolation-grants.test.mjs` (the other `rig-meta` consumer) | **12 pass** |
| `preintegration-gate-chain.test.mjs` (validates my new gate module's registration) | **5 pass** |
| `chain-minted-roles-drift-guard.test.mjs` | **7 pass** |
| `journal-work-evidence.test.mjs` (0182's lane, downstream of the recut helper) | **33 pass** |
| `wave-b/wb-k-approval.test.mjs` | **14 pass** |
| `x42-s5-residuals.test.mjs` | **9 pass** |
| `work-journal-admission.test.mjs` | **20 pass** |
| `work-journal-post.test.mjs` | **33 pass** |
| `spoken-for-documents.test.mjs` | **12 pass** |
| `trade-invoice.test.mjs` | **30 pass** |
| `staff-expense-claim.test.mjs` | **24 pass** |
| `pnpm lint` (root, full chain) | **exit 0**, twice (before and after the last commit) |
| `pnpm typecheck` (root) | **exit 2 — RED AT BASE, not by this lane.** See below |

Neither reset flag (`CLARA_RIG_ALLOW_RESET`, `CLARA_RIG_ALLOW_ROLE_SWEEP`) was ever set. No second
from-scratch chain was run on this cluster.

`apps/web` and `packages/runtime` sources are **untouched** by this diff (`git diff --name-only
<base>..HEAD` lists nine files, all under `packages/db` plus `CONTEXT.md`), so the whole web unit
suite, the browser walks, `check-frozen-workflows.mjs` and `check-parts-parity.mjs` were not triggered
— `pnpm lint` ran the frozen-workflow and frozen-evaluator checks anyway, green.

### `pnpm typecheck` is red at the wave-2 base — a wave-1 residue, NOT this lane's

```
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,22): error TS2552:
  Cannot find name 'DOCUMENT_KINDS'. Did you mean 'documentId'?
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,42): error TS7006:
  Parameter 'k' implicitly has an 'any' type.
```

Proof it predates me, not an assertion:

- `git diff 23cfad94..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` → **empty**
  (0 lines). The file is byte-identical between the base and my head.
- `git show 23cfad94:apps/web/components/documents/document-kind-dialog.tsx | grep -n DOCUMENT_KINDS`
  → line 95 already calls `DOCUMENT_KINDS.map(...)` at the base, while line 35 imports only
  `CLASSIFIABLE_DOCUMENT_KINDS`. The identifier has never been imported.
- The file's last commit is `4b1376f40 merge: riders wave 1 lane 08` (2026-09-20).
- Nothing in my diff is in `apps/web`'s tsc input.

`packages/runtime typecheck: Done` in the same run. **I did not fix it** — it is another lane's file
and outside this ticket (work-order rule 5). **The integrator should treat it as a blocker for the
wave**, because every wave-2 lane's `pnpm typecheck` will report it.

---

## Docs, in the same commits

- `packages/db/README.md` — new section **"0235 — the document binding claim (#1014)"**: the two
  facts that made the hole (one shared helper since 0197, SERIALIZABLE approvers since 0171), the
  claim and why `DO NOTHING` will not do, the refusal and the `entry_id` limit, the over-refusal, the
  lock order, and the deployment notes (one body recut in place, no quiescence window owed, rollback
  shape).
- `packages/db/tests/README.md` — the "#854 measured gap" section is rewritten as **"…measured (#854)
  and repaired (#1014)"**: the driver, the repair, the three measurements that settle the mechanism
  #854 explicitly left open, what the loser is told, and the gates.
- `packages/db/tests/opening-balance-evidence-link.test.mjs` — §4 header rewritten (AC4) and a new §5
  header for the census cell.
- `CONTEXT.md` — one term, in the house `term / _Avoid_` shape, at the sorted position beside
  **Evidence link**: **Document binding claim**, with `_Avoid_` separating it from evidence link, tie
  document and "document lock".

---

## Successor contract

Nothing here requires a frozen chat body or Work tool to change, and none was edited. Two items are
owed to callers *outside* the database:

**1. `apps/web` — naming the standing entry after a raced refusal (optional, UI polish).**
A `CLR13` / `source_already_posted` refusal from `clara.approve_opening_seed` can now arrive with
`detail.entry_id === null`. Today the opening approve dialog shows the door's message verbatim, so
nothing breaks. A consumer that wants the entry's name must re-read it in a **fresh transaction**:

- read: `clara.list_entry_links(p_document uuid)` (0182), the existing granted read of a document's
  links, or the links the client workspace already renders;
- trigger: `error.code === "CLR13" && detail.reason === "source_already_posted" && detail.entry_id == null`;
- refusal mapping: unchanged — the 409 body stays `{ error: "source_already_posted", entry_id,
  document_id }` as `packages/runtime/src/workRoutes.ts:1005` builds it, with `entry_id: null`;
- prompt stanza: none. This is a human-facing affordance, not an agent one.

**2. Any future SERIALIZABLE door.** `clara._lock_document_binding` raises ONE spelling
(`source_already_posted`). The evidence wall's `work_commit` arm spells the same conflict
`source_conflict` + `constraint: already_posted`. That difference is unreachable today — exactly two
bodies in the database pin an isolation level and both are the opening approvers — and **0235's tail
asserts that count is 2 and names both**, so a third isolation-pinned body cannot land without the
migration chain saying so. Whoever adds one must re-derive the spelling.

---

## Follow-ups worth filing (I filed none — no GitHub writes)

1. **The claim serializes on the document, not on the conflict, so it over-refuses.** A SERIALIZABLE
   session that blocked on ANY other transaction binding the same document is refused, including one
   that left no live evidence link. **Measured** (both sides driving `clara._lock_document_binding`
   directly, so the claim is the only thing in play): the waiter blocks on a `Lock` and is refused
   `CLR13 source_already_posted`; the same call **unraced succeeds**. The one case where this is
   stricter than the sequential path is a plain CODED approval carrying the tie document racing the
   opening approval — 0213's opening arm probes live links ALONE, so sequentially both stand.
   Narrowing it is not available inside this design: the losing session cannot read WHAT the winner
   claimed, which is the same snapshot limit the claim exists to work around. The outcome is
   conservative, typed and retryable. Recorded in the migration header and `packages/db/README.md`
   rather than left to be discovered; worth a ticket only if someone finds a real workflow where a
   coded entry and an opening seed share a tie document.
2. **`clara.approve_opening_correction` is repaired but still never raced in a cell** — #854's
   L04B-SPEC-07 residual, unchanged by this ticket. It reaches the same wall through the same
   `clara._approve_opening_entry`, so it takes the same claim and gets the same refusal, but that is
   reasoning, not a measurement. A cell driving the correction door through `humanHoldThenContend`
   would close it.
3. **`apps/web/components/documents/document-kind-dialog.tsx` does not compile** (see the typecheck
   section). Present at the wave-2 base, from riders wave 1 lane 08.

---

## Unverified / deliberately left

- **The from-scratch chain (AC5's first clause) was NOT run by me.** `RIG.md`'s addendum forbids a
  second from-scratch chain on a lane cluster (migration 0154 pins the cluster-wide role count) and
  says in as many words that "the integrator runs the from-scratch proof on a disposable cluster".
  What I *can* evidence: the migration applied cleanly from the live 0234 frontier with its prestate
  notice, and was re-applied twice more through the supported redo path, all three with the tail
  census green.
- **The mechanism behind the ORIGINAL defect is now settled by measurement, but only as far as
  outcomes go.** I proved *what* happens (a lock-only holder does not disturb a SERIALIZABLE waiter;
  a writing holder does). I did **not** confirm *which* PostgreSQL internal produces that — #854's
  report floated two accounts (the "second updater" rule vs. SSI's dangerous-structure pivot) and I
  have not checked the source or asked a committer. The repair does not depend on the answer, and the
  docs and comments say so rather than picking one.
- **`claim_seq` overflow, unbounded growth and vacuum pressure are unexamined.** One row per document,
  one upsert per binding attempt; `bigint` and autovacuum make both non-issues at any plausible scale,
  but I measured neither.
- **No browser walk, no runtime leg.** Nothing in `apps/web` or `packages/runtime` changed; the
  refusal reaches a person through a message the opening dialog already renders verbatim.
