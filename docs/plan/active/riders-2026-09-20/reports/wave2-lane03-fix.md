# wave 2 · lane 03 · fix round — #846, #782, #988

- **Worktree / branch**: `C:\Users\zhant\Desktop\clara-wt\642`, `riders/w2-lane03`
- **Base**: `23cfad947b5598214168ba9c43d391b4e16aa745`
- **Head before this round**: `019506782`
- **Head after this round**: `9e8fd9e4a00e04cb44219d956c6b33e32dd7e5c6`
- **Database**: `clara_l03` on `127.0.0.1:55743`, now at **233** migrations (`0272` is the new one)
- **Playwright triple**: `https://127.0.0.1:3520` / `3521` / `3522`

Eight new commits, each one vertical slice (one failing cell → the minimal change → green):

| commit | slice |
|---|---|
| `b5a7446f6` | `fix(db)` #846 — the high-water ledger refuses TRUNCATE |
| `4bd4ca7d2` | `fix(db)` #846 — a re-keying UPDATE is a first publication, and is walled as one |
| `8ff7f5911` | `fix(db)` #846 — `recorded_at` only moves forward |
| `02dadcf0f` | `fix(db)` #782 — the registry's own column documentation stops calling line items planned |
| `8dd54e02b` | `fix(web)` #988 — `proposal_only` is its own operation verdict |
| `4aa1ff1bb` | `fix(web)` #782/#988 — machine tokens stop reaching the accountant; the level types mirror the CHECKs |
| `bc3ec7671` | `docs(db)` — the fix round in the module READMEs, CONTEXT, the rig-meta note |
| `9e8fd9e4a` | `docs(db)` — #988's honesty residual said plainly; the ticket-reference lint reword |

One new migration: **`0272_document_capability_wall_completion.sql`**, checksum
`4b84df8dba6dad928e4254452474e6dc85f7a3cfa298294c257e74bea2366967`, verified byte-identical to its
ledger row (see "Migration, and why a new file").

---

## Findings, one by one

### ADV-846-2 / SPEC-846-1 — TRUNCATE re-opens the delete-then-insert hole · major · **FIXED**

**Reproduced** as `clara_fn_owner` on `clara_l03`, inside a rolled-back transaction:
`truncate clara.document_capability_version_high_water` took **240 marks → 0 with no refusal**.
No row-level trigger fires on TRUNCATE, and `clara._tf_document_capability_high_water_monotone`
is a BEFORE UPDATE OR DELETE **row** trigger.

**Fixed** in `0272` §B.1: `t_document_capability_high_water_no_truncate`,
`before truncate … for each statement`, executing **`clara._tf_no_truncate()`** — 0003's single
truncate guard, the same body already armed on `audit_log`, `journal_entries`, `journal_lines`
(0003), `domain_events`, `taxonomy_versions`, `wake_intents`, `relay_dead_letters` (0005), the
runtime spine (0006) and the document pipeline (0007).

*The one place I did not follow the finding's letter*: the adversarial fix asked for
`CLR08 / registry_version_high_water_append_only` with a `detail.reason`. The estate's guard
raises `CLR08` with no `detail`, and minting a #846-shaped twin would be a second spelling of a
fact the estate already spells once — which is the exact argument 0244's own header makes about
reusing 0207's CLR08/detail shape. It also keeps the file free of any new function name, so no
rig-meta cohort moves. The cost is named in the migration header, in `packages/db/README.md` and
in the test cell: a TRUNCATE refusal carries no `detail.reason`, and a caller classifies it by
code and by the relation the message names. Nothing catches it — a TRUNCATE of this ledger is only
ever a migration's mistake.

**Evidence**: cell *"TRUNCATE of the high-water mark is refused: a row trigger does not fire on
TRUNCATE, so the ledger needs its own statement wall"* in
`packages/db/tests/document-capability-high-water.test.mjs`. Red before `0272`
(`error: "TRUNCATE emptied the mark ledger — #846's reproducer is back in two statements…"`),
green after. `0272`'s tail §D(2) proves the same thing at apply time, rolled back whole.

### ADV-846-1 — the high-water floor is INSERT-side only; a re-keying UPDATE republishes below the mark · major · **FIXED**

**Reproduced** as `clara_fn_owner`, rolled back: publish `zzzprobe × zzzkind` at
`registry_version` 1 (admitted — no mark), then
`update … set format='pdf', document_kind='invoice'` → **registry read 1 while the mark read 3**,
and the deferred uniformity wall passed it.

**Fixed** in `0272` §B.2: the SAME body,
`clara._tf_document_capabilities_version_high_water()`, armed a **second** time as
`t_document_capabilities_version_high_water_rekey`, `before update … for each row when
(new.format is distinct from old.format or new.document_kind is distinct from
old.document_kind)`. The body is **byte-unchanged** (sha `b409…c9` pinned in `0272`'s prestate
and re-read in its tail): it reads `new` and has no opinion about `old`, so on a re-key it
already asks the right question of the destination key.

**What I got wrong first, and how it was caught** — worth the integrator's attention, because it
is a real trap in this table: the obvious cut, re-arming 0244's own trigger as
`BEFORE INSERT OR UPDATE`, was written, applied and measured to be **wrong**. PostgreSQL fires
BEFORE ROW triggers in trigger-NAME order; `…_version_high_water` sorts before
`…_version_monotone`; so an ordinary **in-place lowering** update came back as
`CLR08 / registry_version_high_water` instead of 0207's `registry_version_monotone`, and
`document-capability-registry.test.mjs`'s own monotone cell went red on the next run. Re-labelling
a refusal a caller already classifies is a breaking change a fix round has no mandate for. The
widening is therefore confined by the `when` clause — which has to live on its own trigger,
because a combined INSERT OR UPDATE trigger may not reference `OLD` at all. `0272`'s tail §D(5b)
now pins that non-regression itself, and §B.2 re-creates 0244's trigger at 0244's exact spelling
so a database carrying the earlier wide cut is repaired on redo.

**Evidence**: cell *"a RE-KEYING update cannot republish a pair below its mark: the wall reads the
key the row is moving TO"* — red before (`a re-keying UPDATE republished pdf x invoice BELOW its
high-water mark`), green after; it asserts `detail.format = 'pdf'`, `detail.document_kind =
'invoice'`, `detail.from = 3` (the DESTINATION's mark), `detail.to = 2`. Plus `0272` tail §D(4)
(the refusal), §D(5) (the whole-registry raise still admitted) and §D(5b) (0207 keeps its subject).

### ADV-846-4 — `recorded_at` is unwalled and can be rewritten backwards · minor · **FIXED**

**Reproduced**: `update … set recorded_at = '1999-01-01' where format='pdf' and
document_kind='invoice'` succeeded, returning `1998-12-31T16:00:00Z`, although 0244 comments the
column "Moves only upward with `registry_version`."

**Fixed** in `0272` §B.3: one more case arm in
`clara._tf_document_capability_high_water_monotone`, **last** in the expression, so an update that
moves both the version and `recorded_at` backwards still reports `registry_version` — the more
serious fact — first. Strictly `<`: the writer stamps `now()`, which is constant inside a
transaction, so a transaction that raises the same mark twice writes the same instant and is
admitted; and two concurrent writers of this ledger are republishing the registry, which 0244's
deferred uniformity wall already refuses (the adversarial lens measured that race itself).

I chose the wall over softening the comment because the column comment is a checkable claim, and
an estate whose comments are only sometimes backed teaches the next reader to check every one of
them by hand.

**Evidence**: cell *"recorded_at only ever moves forward: the column comment is a claim the wall
backs"* — red before, green after; asserts
`detail.reason = registry_version_high_water_append_only`, `detail.column = 'recorded_at'`, and
that a FORWARD stamp is still admitted. `0272` tail §D(5c) proves the same at apply time.
The recut body's post-image sha is `62e83a3b…8c`; the prestate's pin for this ONE body is
two-valued by construction (0244's pre-image **or** this file's post-image), which is what
redo-safety means for a `create or replace`.

### SPEC-782-1 — "planned" wording still stands in the registry's live column documentation · minor · **FIXED**

**Reproduced**: `col_description(clara.document_capabilities.limits)` still read 0191's
`` `{"invoice_line_items":"planned"}` records the ONE capability deferred by this slice … per-LINE
facts are an accepted target with no table yet``.

**Fixed** in `0272` §B.4: the comment is re-issued from a successor file (0191 unedited), exactly
as this lane's own 0246 re-issued 0191's `business_operation` comment. The tail additionally
proves the comment and the ROWS agree — 28 rows carry
`{invoice_line_items: accepted_limitation, invoice_line_items_reason:
no_consumer_reads_line_facts}` and **zero** rows publish a limit valued `planned`.

**Evidence**: cell *"the registry's OWN documentation of `limits` stops calling invoice line items
planned (#782)"* in `document-capability-registry.test.mjs`, gated on
`wallCompletionApplied()` — which reads 0272's **truncate trigger**, a catalog fact from the same
file, never the comment it asserts (that would be circular) and never a migration number.

### ADV-988-1 / SPEC-988-1 — `operationVerdict()` folds `proposal_only` into the store-only verdict · major · **FIXED**

**Reproduced**: `operationVerdict()` branched on the level exactly once
(`=== "unsupported"` → `not_applicable`) and sent every other level down the same ladder, so a
`proposal_only` pairing and a `stored_only` one both rendered **"Not coded yet"** on the one
surface a professional opens for a filed document. Those are opposite facts.

**Fixed**: `OperationVerdict` gains `awaiting_confirmation`, returned where the two levels really
differ — nothing coded, nothing posted, no statement. It carries its own message key
(`stateOperation.awaitingConfirmation` = "Proposed, needs your confirmation"), its own
`StateRow` tone through a new `operationTone()` (`info`, the same token `capability-tiers.tsx`
already gives the tier), and its own detail sentence
(`stateOperationAwaitingConfirmationDetail`) saying why nothing is booked. Once a person has
acted, the verdict is about what happened, so a confirmed proposal reads `coded` or `posted` like
any other entry — the level only speaks where nothing has happened yet.

**Evidence**: `lib/documents/document-state.test.ts`, cell *"operation: proposal_only is its OWN
verdict, never the store-only one"* — red before (`+ 'uncoded' − 'awaiting_confirmation'`), green
after, and it pins the four non-regressions (stored_only, draft, posted, unsupported).
`components/documents/document-state-panel.test.tsx`, cell *"a proposal_only pairing reads
DIFFERENTLY from a store-only one on the operation row (ticket 988)"* — mounts both fixtures and
asserts the rendered text differs. Vacuity control on that cell: pointing
`OPERATION_KEY.awaiting_confirmation` at `stateOperation.uncoded` reds it
(`the fifth level gets its own word…`); restored byte for byte, verified by `git diff --stat`.

### ADV-782-1 — the document detail shows the registry's machine tokens verbatim · major · **FIXED**

**Reproduced**: the detail rendered "Per-line invoice facts: **accepted_limitation**." and
"Reason: **no_consumer_reads_line_facts**.", and `documents-viewer-walk.spec.ts:365-368` pinned it.

**Fixed**: both halves of a limit now go through their own message key — the NAME through
`capabilityLimit.*` (already there), the VALUE through a new `capabilityLimitLevel.*`. The map is
a **literal** `Record<string, string>` in `document-state.ts` with a
`capabilityLimitLevelKey(level)` accessor, never a ``t(`capabilityLimitLevel.${value}`)`` cast:
`document-facts-table.tsx`'s own header settled that for this family — a missing translation
renders the KEY at a professional. The roster is closed and **measured**: the seven distinct
values `clara.document_capabilities.limits` publishes across all 240 rows (`absent`,
`absent_in_format`, `accepted_limitation`, `myinvois_ubl_only`, `no_consumer_reads_line_facts`,
`parse_succeeds_corroboration_cannot`, `tab_separated_mime_not_routed`). An unmapped value falls
back to the raw token — honest, and the same rule the panel already follows for an unnamed limit
KEY.

The detail now reads: *"Per-line invoice facts: an accepted limitation. Clara records the header
totals with their source regions…"* and *"Reason: nothing Clara posts through reads a per-line
fact."*

**Scope note, deliberate**: `capability-tiers.tsx`'s badge routes through the same helper.
Without it the identical tokens would still reach an accountant on every intake row
(`invoice_line_items: accepted_limitation`), i.e. half a fix. The badge's limit **NAME** is still
the registry's own key; naming each limit for a badge is #633's surface, not this fix round's, and
it is listed as a follow-up below.

**Evidence**: panel cell *"a supported invoice still declares its LINE-ITEM limit"* — red before,
now asserts the sentence AND `doesNotMatch(/accepted_limitation/)` /
`doesNotMatch(/no_consumer_reads_line_facts/)`. New panel cell *"an unpublished limit VALUE
degrades to the raw token rather than to a wrong sentence"* (the fallback, and that a message key
is never rendered). `documents-viewer-walk.spec.ts` moves onto the sentence and adds
`toHaveCount(0)` over both tokens — **22 passed (58.8s)** on the lane's own triple.

### ADV-988-2 — `CapabilityLevel` widened for all four axes · minor · **FIXED**

**Reproduced on the lane database**: only `document_capabilities_business_operation_check` admits
`proposal_only`; `..._custody_check`, `..._byte_extraction_check` and `..._typed_facts_check` all
still read the original four.

**Fixed**: `CapabilityLevel` is back to those four (`CAPABILITY_LEVELS`, `isCapabilityLevel`), and
`BusinessOperationLevel = CapabilityLevel | "proposal_only"` is this axis's own union with
`BUSINESS_OPERATION_LEVELS` and `isBusinessOperationLevel` beside it — mirroring the db battery's
own `BUSINESS_OPERATION_LEVELS` constant rather than widening `LEVELS`. `DocumentCapability
.business_operation`, `DocumentStateResult.operation.capability`, `CapabilityRegistryRow
.business_operation` and `TierState.level` (the union over all four axes, so the widest set) move
to it.

**Evidence**: `document-state.test.ts` — *"the four shared capability levels are a closed set…"*
now asserts `isCapabilityLevel("proposal_only") === false`, and a new cell
*"business_operation's own guard admits the fifth level, and still nothing else"* pins
`BUSINESS_OPERATION_LEVELS.length === CAPABILITY_LEVELS.length + 1`. Red before
(`SyntaxError: … does not provide an export named 'BUSINESS_OPERATION_LEVELS'`), green after.
`pnpm typecheck` exit 0.

### S1 — `capability-tiers.tsx`'s TONE map is `Record<string, string>` · minor (smell) · **FIXED**

Small and clearly better, and the type split above made it free: `TONE` is now
`Record<BusinessOperationLevel, string>` (the widest of the four axes' sets), and `tierTone`
indexes it without the `?? ""` fallthrough. A sixth level, or a rename, is now a compile error
rather than a silently unstyled badge. `pnpm typecheck` exit 0 with the map total.

### ADV-846-3 — `packages/db/tests/README.md` states 19/19; it runs 22 · minor · **FIXED**

Both sentences are gone. The section now carries **measured** counts — 10/10 for
`document-capability-high-water.test.mjs`, 23/23 for `document-capability-registry.test.mjs`
(17 below 0207, 20 below 0246, 22 below 0272) — each named beside the `EXPECTED_CELLS_*` constant
that carries it, plus new paragraphs for #988's three cells and the fix round's four.

### ADV-988-3 — the honesty invariant never refuses at write time · minor · **ACCEPTED, and now said plainly**

**Re-measured myself**, as `clara_fn_owner`, rolled back: `update clara.document_capabilities set
business_operation='proposal_only' where format='ofx' and document_kind='bank_statement'` (that
row's `typed_facts` is `unsupported`) was **ACCEPTED**, and `set constraints all immediate` passed
it too.

**Not closed, deliberately.** The pre-existing `supported`-over-unsupported-facts rule has always
lived in exactly the same place (a repeatable test cell), and splitting the pair across a CHECK and
a test would make the weaker half look stronger while changing a shape three lanes' worth of
tickets read. What I did instead is make the claim honest: `packages/db/README.md`'s 0246 section
now states the residual with the measurement, and names the exact successor — the cross-column
CHECK `business_operation not in ('supported','proposal_only') or typed_facts = 'supported'`,
which I verified **validates clean against the live 240 rows today (0 violations)**, together with
the prerequisite that ADV-988-4 names: pin 0246's `SELECT INTO` by `conname` first, because that
CHECK would be the second one naming `business_operation` and 0246's unordered `ilike` probe would
then be a coin flip on a redo (measured: exactly 1 such CHECK today).

### SPEC-782-2 — ARCHITECTURE.md still lists invoice line items as a 'planned' accepted target · minor · **DECLINED (not a lane fix)**

`docs/ARCHITECTURE.md:529` still reads
`| 发票行项目（line items）的类型化事实 | 能力目录中显式标为 planned，当前不抽取行项目 |`.
Work-order rule 5 forbids a lane worker editing `docs/ARCHITECTURE.md`, and the spec review's own
`required_fix` says so: *"Orchestrator or a wayfinder pass overwrites that ARCHITECTURE.md row …
Not a lane fix."* I did not touch it. **Orchestrator action**: after 0245 + 0272 the sentence is
factually false about the registry (which publishes `accepted_limitation` with a reason, and whose
column comment now says so); per AGENTS.md working-protocol rule 4 the row should be overwritten
in place so the accepted target becomes a recorded permanent boundary.

### SPEC-ALL-1 — two commits change `document-kind-dialog.tsx`, which no lane ticket asked for · minor · **KEPT, for the orchestrator to confirm or drop**

Unchanged by this round and re-verified: `git show 23cfad947b:apps/web/components/documents/
document-kind-dialog.tsx` references `DOCUMENT_KINDS` with only `CLASSIFIABLE_DOCUMENT_KINDS`
imported — a TS2552 and a runtime `ReferenceError` inherited from the wave-1 integrated head,
which blocks `pnpm typecheck` and every `pnpm --filter @clara/web e2e <spec>` (each runs
`next build`). Both of this lane's required gates. The fix is one identifier swap to the file's own
established filtered-roster convention, in two separate clearly-labelled commits
(`1e7565e2f`, `019506782`) precisely so it can be evaluated or dropped independently.
It sits on the wave-1 integrated head, so **the other nine lanes carry it too** — it deserves one
resolution for the wave, not ten. AGENTS.md clock-out rule 4 still asks the owner to confirm an
edit the session did not intend as its own ticket's work.

---

## Migration, and why a new file

`0272_document_capability_wall_completion.sql` — 566 lines, one prestate, four `§B` sections, one
tail. It mints **no function**, moves **no row**, raises **no version** and contains **no dynamic
SQL** (`grep -c "execute format\|execute '"` → 0), so `apps/web/tests/firm-scope-db-pins.corpus.ts`
does not key on it and needed no entry; `rig-meta.mjs` gains a comment recording why #846's cohort
does not move (it rosters NAMES, and every name 0272 touches is already in that cohort or in
0003's).

**Why not an edit of 0244/0245.** Both are unmerged and both *could* be edited under the wave-2
rule, but the supported re-apply path (`packages/db/README.md`, "Redo (#957)") refuses any version
that is not the **highest applied** one — "redoing anything below the frontier would silently
invalidate whatever was applied on top of it" — and 0245/0246 sit on top of 0244 on every lane
database. Editing 0244 in place would mean the hand procedure #957 exists to abolish. A successor
file is also what **both** review axes prescribed for these findings. One file rather than two
because this is a fix round, not a ticket delivery: two clearly separated sections (#846's three
routes, #782's comment) under one prestate and one tail, rather than a second round of migration
ceremony for one `comment on column`.

**The number needs the orchestrator's eye.** `0272` is deliberately **above** the wave-2
reservation (`0235`…`0271`, each belonging to a named ticket in another lane per
`riders-2026-09-20/README.md`), so it collides with nothing today — but it is also the number
wave 3 would otherwise take first. Nothing in the estate depends on it; renumbering at integration
costs a `git mv` and a header line, and the from-scratch chain does not ask for gapless numbering.

**Redo, as used**: the file was re-applied through
`CLARA_MIGRATION_REDO=0272_document_capability_wall_completion pnpm --filter @clara/db migrate`
**five times** across the slices, each time reporting `#846 fix prestate: OK -- REDO apply`.
0244/0245/0246 were **not** edited and their checksums still match their ledger rows byte for byte
(verified: all four `MATCH`).

**Prestate pins, measured on `clara_l03` (never transcribed)**

| object | pin |
|---|---|
| `clara._tf_document_capabilities_version_monotone()` | `170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56` |
| `clara._tf_document_capabilities_version_high_water()` | `b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9` |
| `clara._tf_document_capabilities_high_water_record()` | `839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d` |
| `clara._tf_document_capabilities_version_uniform()` | `d21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776` |
| `clara._tf_document_capability_high_water_monotone()` | two-valued: `196780f9…f27` (0244 pre-image) **or** `62e83a3b249ca1d0186041ac36c6f77615f3631b04d96eb57fc16f010974ec8c` (0272 post-image) |
| `clara._tf_no_truncate()` (0003) | `e64ba9f6b93ba56d2752b095bae361dc4a3f0baf63e841e7c81f1b631c68eea8` |
| registry state | 240 rows, one distinct `registry_version` (3), every pair marked at or above its version |

**The honesty boundary, stated in the file and in the README**: "by any route" means by any route
a writer of this estate has. A superuser who sets `session_replication_role = replica` or drops a
trigger disables every wall here — exactly what 0003's own truncate guard says of itself.
Verified on `clara_l03`: `clara_fn_owner` gets `42501 permission denied to set parameter
"session_replication_role"`, so that is an explicit act by a different actor, not a route.

---

## Gates, with counts

| gate | result |
|---|---|
| `document-capability-high-water.test.mjs` (focused, gate variable UNSET) | **10 pass / 0 fail / 0 skip** |
| `document-capability-registry.test.mjs` (focused) | **23 pass / 0 fail / 0 skip** |
| both, **with the full `$GATES` chain**, plus `operation-census.test.mjs` + `rig-isolation.test.mjs` | **66 tests · 65 pass / 0 fail / 1 skip** |
| the skip | `rig-isolation` T19 poison-role — needs `CLARA_RIG_ALLOW_RESET`, forbidden by RIG.md |
| `rig-isolation.test.mjs` re-run after the runtime db leg | **23 tests · 22 pass / 0 fail / 1 skip** (T10b green) |
| `packages/runtime/tests/document-facts-validation-db.test.mjs` (the lane's own runtime leg) | **6 pass / 0 fail** |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4754 tests · 4752 pass / 0 fail / 2 skip** (138 suites) |
| `pnpm --filter @clara/web e2e documents-viewer-walk` (triple 3520/3521/3522) | **22 passed (58.8s)** |
| `pnpm --filter @clara/web e2e documents-intake-walk` | **12 passed (23.3s)** |
| `pnpm --filter @clara/web e2e work-list-walk` | **18 passed (37.2s)** |
| `pnpm typecheck` | **exit 0** (`apps/web` and `packages/runtime` both Done) |
| `pnpm lint` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen files, no manifest diff** |
| migration checksums vs disk (0244, 0245, 0246, 0272) | **all MATCH** |

`pnpm lint` failed once on my own text, not on code: the raw-colour rule reads `#988` in a string
as a hex literal. Its message says to reword rather than weaken the rule, so two test strings now
say "ticket 988".

No new test FILE was added (cells went into existing batteries), so
`apps/web/test/manifest.txt` needed no hunk — `check-test-manifest` passes.

## Shared files touched

`apps/web/messages/en.json` (three new key groups, at their sorted positions:
`stateOperation.awaitingConfirmation`, `stateOperationAwaitingConfirmationDetail`,
`capabilityLimitLevel.*`), `packages/db/tests/rig-meta.mjs` (a comment inside the existing
`#846 … #846 END` block, no roster change) and `CONTEXT.md` (one entry overwritten in place).
Nine other lanes edit these at the same time; every hunk is minimal and at its sorted position.

## Docs updated

- `packages/db/README.md` — 0244's table rows describe the walls as they now stand; a new **0272**
  section (the three routes as measured, why the re-key wall is a second trigger, why a new file,
  the honesty boundary, redo-safety); the 0246 section's misleading "no reader folds the new level"
  sentence replaced by what the panel actually does, plus the honesty-invariant residual.
- `packages/db/tests/README.md` — corrected counts, the fix-round cells, the 0244+0272 cohort.
- `CONTEXT.md` — "Capability registry version" names re-keying and truncation as routes the mark
  survives, and says plainly that "cannot be undercut" is not a claim about a superuser.
- `packages/db/tests/rig-meta.mjs` — why 0272 adds no name to #846's cohort.

## Successor contracts

None. This round adds no door, no tool input and no part kind; no frozen chat or Work tool needs
anything from it.

## Follow-ups worth filing

1. **`docs/ARCHITECTURE.md:529`** — overwrite the line-items row (SPEC-782-2). Orchestrator or
   wayfinder; a lane worker may not.
2. **The cross-column honesty CHECK** — `business_operation not in ('supported','proposal_only') or
   typed_facts = 'supported'`, validated clean against the live 240 rows, **after** pinning 0246's
   `SELECT INTO` by `conname` (ADV-988-4's note, which becomes live the moment a second CHECK names
   that column).
3. **Limit NAMES on the intake badge** — `capability-tiers.tsx` still renders
   `invoice_line_items: …`; a `capabilityLimitName.*` map beside the new
   `capabilityLimitLevel.*` would finish the job on #633's surface.
4. **A messages-completeness cell over `TIER_STATE_KEYS`** — the manifest says it exists "so a
   completeness check over it would catch a missing translation", and no such check exists
   (SPEC-988-3's note, not in this round's list).
5. **`document-capability-high-water.test.mjs`'s one committing cell** has no repair path if the
   deferred wall is ever absent (ADV-846-5, a note, not in this round's list).

## Unverified

- The **from-scratch `0001 → 0272` chain on a fresh cluster** is the integrator's proof, as it was
  for 0244. Reasoned, not run: 0272's prestate pins are 0244's own installs (untouched by
  0245/0246), the registry is uniform after 0245, and §B.2 re-creates 0244's trigger at 0244's
  spelling, so the file is order-correct behind 0245/0246. RIG.md forbids a second from-scratch
  chain on a lane cluster.
- **Hosted behaviour** of the new copy: the walks run against the e2e mock, which is what this
  rig has.
