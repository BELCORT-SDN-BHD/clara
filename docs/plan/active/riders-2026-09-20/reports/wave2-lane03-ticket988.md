# Wave 2 · lane 03 · ticket #988 — `business_operation` gains a fifth level, `proposal_only`

**Status: DONE.** Branch `riders/w2-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`,
database `127.0.0.1:55743/clara_l03`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
019506782 docs(web): unblock fix-round — record why the trigger label uses the filtered roster
1e7565e2f fix(web): unblock — DocumentKindDialog referenced an undefined DOCUMENT_KINDS
dadfd18dd feat(web): #988 the Documents workbench renders proposal_only distinctly
f8467bf4a feat(db): #988 business_operation gains a fifth level, proposal_only
```

(the rest of `git log 23cfad94..HEAD` is #846 and #782, already landed on this branch when I
started — `git status` was clean and `git log` showed only those five commits, nothing of mine.)

## The ticket is the contract — which brief wins

`gh issue view 988 --comments` has exactly one comment: an owner ruling dated 2026-09-20 that
**also contains the newest Agent Brief inline**, already written to reflect that ruling. So there
is no separate "brief vs. ruling" reconciliation to do — the comment I built to says, verbatim:
"Confirmed Option B: `business_operation` gains a fifth level meaning 'Clara proposes, a person
confirms' ... This differs from the ticket's own 'After the decision' list in one load-bearing
way: `prior_gl` is NOT reclassified onto the new level ... The new level exists for the next
pairing shaped this way, not for `prior_gl`." The issue *body* (an earlier, pre-ruling draft) still
lists `prior_gl`'s reclassification as part of "After the decision" — I built to the comment, which
is both newer and the one carrying the ruling, per the work order's own precedence rule.

**Verified still live before building.** Measured on the lane rig before any change:
`document_capabilities_business_operation_check` read the original four-value form
(`supported`/`stored_only`/`unsupported`/`planned`), the registry published `registry_version = 3`
uniformly across 240 rows (0245's own publish, #782 — this lane's own prior ticket), and zero rows
carried `proposal_only`. Nothing between #782 and now touched this column.

## The seams I tested at (written before the first test)

The brief names four interfaces: "the `business_operation` allowed-value rule" (a schema CHECK),
"the registry's honesty invariants" (a repeatable test cell, per the ticket's own name for the
sibling rule — see below), "every surface rendering a capability level, including the Documents
workbench" (the web read layer), and "the registry's monotone version ... governs the republish"
(the version-raise mechanism, #846/#782's own machinery). So the seams are:

1. **The CHECK constraint** on `clara.document_capabilities.business_operation`, through the
   owner/migration connection.
2. **The honesty invariant**, as a repeatable cell in `document-capability-registry.test.mjs` —
   the SAME file the ticket's own wording points at ("the existing check that refuses an operation
   promised over facts that do not exist" is that file's cell at :309-315, never a table CHECK).
3. **The web read layer**: `CapabilityLevel` (`document-state.ts`), `resolveCapability`/
   `tierStateKey` (`capability-registry.ts`), and the one place a raw level renders as a word,
   `capability-tiers.tsx`.
4. **The version mechanism** — not a new seam, but a claim to verify: does this migration need to
   raise it?

No seam at `docs/PRD.md`/`docs/ARCHITECTURE.md` (never edited from a ticket, work order rule 5).

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `document-capability-registry.test.mjs` after adding `proposalLevelCell`'s two new cells and `BUSINESS_OPERATION_LEVELS`: both new cells correctly SKIPPED (not failed) below the frontier — `after` hook asserted `executed === EXPECTED_CELLS_PRE_988 (20)`, proving the gating math itself before touching the schema | migration `0246_business_operation_proposal_only.sql` |
| 2 | after `pnpm db:migrate`: re-ran the same file, `executed === EXPECTED_CELLS (22)`, both new cells now green | (the migration alone; no further test code needed) |
| 3 | `document-state.test.ts`'s closed-set guard: `isCapabilityLevel("proposal_only")` → `false` (1 fail) | widened `CapabilityLevel`/`CAPABILITY_LEVELS` in `document-state.ts` |
| 4 | `capability-registry.test.ts`'s new distinctness cell: `TIER_STATE_KEYS.includes("capabilityTier.proposal_only")` → `false` (1 fail; `resolveCapability`/`tierStateKey` themselves already passed the row through generically, needing no code change) | added the key to `TIER_STATE_KEYS`; added `capabilityTier.proposal_only` to `en.json` |
| 5 | (no test; a rendering-code change with no existing or newly-justified test seam — see "What I deliberately did not test" below) | `capability-tiers.tsx`'s `TONE` map gains its own `proposal_only` entry |

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| `business_operation` accepts a fifth value, added in a new migration; no applied migration is edited | **done** | `0246_business_operation_proposal_only.sql` §B: `alter table ... drop constraint ... add constraint document_capabilities_business_operation_check check (business_operation in ('supported','stored_only','unsupported','planned','proposal_only'))` — SAME constraint name, no other migration touched. `document-capability-registry.test.mjs`'s new `proposalLevelCell` behaviourally proves the CHECK admits `proposal_only` (a rolled-back UPDATE) AND still refuses a sixth value. |
| No row is reclassified onto the new level except one the owner explicitly names; `prior_gl` is not among them and still reads the store-only level | **done** | Migration §A(e)/§C(5): zero rows carry `proposal_only` before AND after (a rolled-back probe is the only place the value is ever written). `document-capability-registry.test.mjs`'s new cell: `select ... where business_operation = 'proposal_only'` → `[]`, live, every run. `prior_gl`'s own rows are untouched by this file (not named in it at all) and still read `stored_only` (unchanged since #656/0228). |
| An honesty-invariant check asserts the new level's own rule and fails if a row at that level claims typed facts it does not have | **done** | New cell in `document-capability-registry.test.mjs`, same shape as the sibling `supported` rule at :309-315 (a repeatable SELECT-based cell, not a table CHECK — matching the sibling's own house shape, since that rule has never been a live CHECK either). PROVEN discriminating, not merely vacuous: the migration's own tail §C(4) and the new frontier-gated `proposalLevelCell` each set up one HONEST row (`pdf`×`invoice`, `typed_facts='supported'`) and one DISHONEST one (`ofx`×`bank_statement`, `typed_facts≠'supported'`) inside a rolled-back transaction and assert the invariant query finds exactly the dishonest one. |
| Every reader that renders or branches on `business_operation`, including the Documents workbench, treats the new level as distinct from the store-only level | **done, with one explicit judgement call recorded** | `CapabilityLevel` (`document-state.ts`) admits the fifth value; `resolveCapability`/`tierStateKey` (`capability-registry.ts`) pass it through unchanged — pinned by a new test proving `proposal_only` reads distinct from `stored_only` both as a value and as its message key; `capability-tiers.tsx`'s tone map gets its own entry (`text-info`) so it does not fall through to an unstyled default; `en.json` gets `capabilityTier.proposal_only`. **`document-state.ts`'s `operationVerdict()` is deliberately NOT changed** — see "A judgement call" below. |
| The registry version is raised exactly once for the whole republish, by updating existing rows, and every row published together carries the same value | **satisfied vacuously, by design — see "Why the version does not move" below** | Migration prestate/tail: registry publishes version 3 uniformly across 240 rows both BEFORE and AFTER this file runs (`min = max = 3`, `count(distinct registry_version) = 1`, `count(*) = 240`); the high-water mark agrees throughout. No republish happens because no row's content is republished. |

### Why the version does not move

This is the one AC that needed a judgement call, so I am stating it plainly rather than leaving it
implicit. The AC's own wording — "raised ... by updating rows in place" — describes the MECHANISM
a republish must use, not a mandate that #988 perform one. Since the owner's ruling reclassifies
**zero** rows, there is no row content to republish, and I followed the direct precedent already on
this same branch: **#846's own `0244_document_capability_version_high_water.sql`** minted a whole
new relation and two new database walls, touched zero rows of `clara.document_capabilities`, and
did **not** raise `registry_version` — the version stayed at 2 (0228's publish) for the whole of
0244, and only 0245 (#782), which corrected 28 rows' `limits`, raised it to 3. #988 is the same
shape as #846: a vocabulary/mechanism change, not a data republish. Bumping the version anyway
(`update ... set registry_version = registry_version + 1` over all 240 rows with no other column
moving) would have been a **content-free "republish"** — a shape neither #228 nor #245 ever took,
and one that would assert "this row's facts changed" about 240 rows whose facts did not. I chose
honesty over literal AC-checkbox theatre; the report says so explicitly rather than silently
picking one reading.

## The migration

`packages/db/migrations/0246_business_operation_proposal_only.sql` — the number reserved for this
ticket. Applied to `clara_l03` with `pnpm migrate` (packages/db's own script name; the work order
calls it `pnpm db:migrate`, which is not a script in this package — `pnpm migrate` is). The
migration's own notices printed `#988 prestate: OK` and `#988 tail: OK`. Chain now 232 files.

**Prestate pins, MEASURED on this rig now** (never transcribed from #846's/#782's own file text —
the wave-2 addendum's rule, since both are this lane's own prior tickets):

| object | measured value |
|---|---|
| `document_capabilities_business_operation_check` | `CHECK ((business_operation = ANY (ARRAY['supported'::text, 'stored_only'::text, 'unsupported'::text, 'planned'::text])))` |
| `document_capabilities_custody_check` / `_byte_extraction_check` / `_typed_facts_check` | each the same four-value form, own column name |
| `clara._tf_document_capabilities_version_monotone()` (0207) | `170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56` |
| `clara._tf_document_capabilities_version_high_water()` (0244) | `b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9` |
| `clara._tf_document_capabilities_high_water_record()` (0244) | `839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d` |
| `clara._tf_document_capability_high_water_monotone()` (0244) | `196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27` |
| `clara._tf_document_capabilities_version_uniform()` (0244) | `d21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776` |

All five wall bodies matched #782's own pins exactly (no drift). Registry: version 3 uniformly,
240 rows, zero rows already carrying `proposal_only`.

**What it changes** (no function, table, trigger, policy or grant — one CHECK, one column comment):

1. `alter table clara.document_capabilities drop constraint document_capabilities_business_operation_check` then `add constraint ... check (business_operation in ('supported','stored_only','unsupported','planned','proposal_only'))` — same name.
2. `comment on column ... business_operation` updated to describe the fifth level and name `prior_gl`'s exclusion.

**Tail** re-reads the CHECK's new five-value form under the same name; re-reads the three sibling
CHECKs byte-identical; proves the CHECK still refuses a sixth out-of-set value; runs a rolled-back
behavioural probe that sets `pdf`×`invoice` to `proposal_only` (honest — `typed_facts='supported'`
there) and confirms it is ADMITTED and reads distinct from `stored_only`, then sets
`ofx`×`bank_statement` to `proposal_only` too (dishonest) and confirms the invariant query finds
exactly that one violation; confirms the probe left nothing behind; confirms the registry is still
uniformly at version 3 across 240 rows with the high-water mark agreeing; confirms RLS/policies/
grants unchanged; re-hashes all five wall bodies (byte-identical); confirms the column comment
names the fifth level.

**Redo.** Not needed — applied clean on the first try.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55743 PGUSER=postgres PGDATABASE=clara_l03
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every db battery ran with the full gate chain from
`packages/db/package.json`. `CLARA_RIG_ALLOW_RESET`/`CLARA_RIG_ALLOW_ROLE_SWEEP` never set. No SQL
function was added by this ticket, so `operation-census`/`rig-isolation` were not strictly required
by the task's own gate line ("...if you added SQL functions...") — I ran them anyway for extra
assurance, since the CHECK change touches a heavily-shared table.

| gate | result |
|---|---|
| `tests/document-capability-registry.test.mjs` (touched) | **22 pass / 0 fail / 0 skipped** (pre-migration: 20 pass / 0 fail / 2 skipped, the two frontier-gated cells correctly skipping — proved the gating math before the schema changed) |
| `tests/document-capability-high-water.test.mjs` (sibling, untouched) | **7 pass / 0 fail / 0 skipped** |
| `tests/document-intake-capabilities.test.mjs` (sibling, untouched) | **6 pass / 0 fail / 0 skipped** |
| `tests/operation-census.test.mjs` (extra assurance, not required) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (extra assurance, not required, no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, needs `CLARA_RIG_ALLOW_RESET` (forbidden by RIG.md); same skip #782's own report recorded |
| `apps/web/lib/documents/document-state.test.ts` (touched) | **16 pass / 0 fail / 0 skipped** (red on 1 cell before widening `CapabilityLevel`) |
| `apps/web/lib/documents/capability-registry.test.ts` (touched) | **10 pass / 0 fail / 0 skipped** (red on 1 cell before the `TIER_STATE_KEYS`/`en.json` addition) |
| `pnpm typecheck` (worktree root) | **exit 0**, after the unblock fix-round (see below) |
| `pnpm lint` (worktree root) | **exit 0** |
| `apps/web` whole unit suite once (`node scripts/run-tests.mjs`) | **4748 pass / 0 fail / 2 skipped** (4750 total), after the unblock fix-round |
| `pnpm --filter @clara/web e2e documents-intake-walk` (touched: `capability-tiers.tsx`/`document_capabilities` mock) | **12 pass / 0 fail** |
| `pnpm --filter @clara/web e2e documents-viewer-walk` (touched: `document-state.ts`/`get_document_state` mock) | **22 pass / 0 fail** |

### A pre-existing, wave-1-inherited defect I found, verified, and fixed (out of #988's own scope)

`apps/web/components/documents/document-kind-dialog.tsx:95` read a bare `DOCUMENT_KINDS`, which
this file never imports (it imports `CLASSIFIABLE_DOCUMENT_KINDS`, its sibling
`document-kind-control.tsx`'s filtered roster). This is **already documented** by this lane's own
`wave2-lane03-ticket846.md` and `wave2-lane03-ticket782.md` as a pre-existing, wave-1-inherited
defect that blocks `pnpm typecheck` and (per #782's own finding) `next build` — which means it
blocks **every** `pnpm --filter @clara/web e2e <spec>` on this branch, for every lane, not only
mine. `git diff 23cfad947b..HEAD -- <that file>` was empty before my fix: byte-identical to the
lane's base commit, last touched by `4b1376f40 merge: riders wave 1 lane 08`, before this lane's
branch was even cut.

Both prior reports **verified a fix but did not ship it** — #782's report specifically: "I verified
the fix ... (`import { DOCUMENT_KINDS } from '@/lib/documents/types'`) ... but did not ship it: it
is not ticket #782's file." Since this defect stood directly between me and two of my own required
gates (`pnpm typecheck`, both e2e walks), I fixed it rather than reporting the gates as
permanently blocked. **I initially reproduced the exact fix #782's report names as verified, and
it is wrong**: `document-kind-labels.test.tsx`'s hardened `[878]`/CRS-07-09 cell asserts the
dialog's own source text never contains a `DOCUMENT_KINDS.map(` call nor the literal
`consent_evidence` string, precisely to stop the unfiltered roster from re-entering through a side
door (a real, code-reviewed regression the `#782` report's own verification — `tsc --noEmit` only,
not the unit suite — did not surface). I reverted to the correct fix, importing nothing new and
using the same `CLASSIFIABLE_DOCUMENT_KINDS` the adjacent `SelectContent` roster already uses
(`items={CLASSIFIABLE_DOCUMENT_KINDS.map(...)}`), which is what the file's own #878 comment already
says is "the one true roster." Before: `pnpm typecheck` failed repo-wide; the same five files'
worth of unit tests (`document-detail-live-refresh`, `document-kind-dialog`, `document-kind-labels`
[878 cell], `documents-url-state`, `documents-workbench-refresh`) failed identically whether run
alone or in the whole suite, and identically on a HEAD~2 (pre-#988) checkout of `apps/web` — proof
this was pre-existing, not something #988 introduced. After: all clean (counts above).

Committed as two SEPARATE, clearly-labeled commits (`1e7565e2f` fix, `019506782` a same-session
correction with a recorded dead end), never folded into the `#988` feature commits, so the
orchestrator can evaluate or drop it independently.

### A tooling near-miss: a shared, non-scratchpad temp path

While re-verifying gates late in the session I extracted `packages/db`'s preintegration-gate import
list to `/tmp/gates.txt` and reused it across calls. A later re-run of
`document-capability-registry.test.mjs` using that same path failed immediately with
`ERR_MODULE_NOT_FOUND` for `fye-day-preintegration-gate.mjs` — a file that does not exist in
`tests/` and is not in `packages/db/package.json`'s own `test` script. `/tmp` is not scoped to this
session (ten lane agents run concurrently on this machine per RIG.md), so another lane's process
almost certainly overwrote the same generic path in between my calls. I regenerated the list into
my own scratchpad directory and re-ran both `document-capability-registry.test.mjs` (22/22) and
`document-capability-high-water.test.mjs` (7/7) clean. My earlier successful runs using the shared
path are still good evidence — each one printed 20+ or 22 individually-named subtests, which a
corrupted import list could not have produced (it fails before any test runs at all, as this one
did) — but I am recording the near-miss and the fix (a session-scoped scratchpad path) so the
lesson is not lost.

## Docs, in the same commits

- `packages/db/README.md` — new "#988 — a fifth business_operation level, proposal_only (0246)"
  section beside #846/#782's, same shape: the change, why no row moves, why the version does not
  move (citing #846 as precedent), and what changed on the web side.
- `packages/db/tests/rig-meta.mjs` — a comment-only `#988` cohort entry (0246 installs no function,
  no table, no trigger — the same reason #782's `#782` entry above it carries none), placed
  immediately after `#782 END`.
- `CONTEXT.md` — **overwrote**, not appended, the affected section (AGENTS.md working-protocol
  rule 4): "Document capability" no longer claims all four axes share one closed four-value set;
  it now states the business-operation asymmetry directly. Added "Business operation:
  proposal-only" as new vocabulary, `<!-- #988 -->`-wrapped like `<!-- #846 -->`'s entry beside it.

## Successor contract

**None is owed.** #988 touches no door, no grant, no callable verb, and no chat/Work-tool surface.
The registry's only writers remain migrations (0191, 0228, 0245, 0246); every reader in
`apps/web`/`packages/runtime` reads the column generically (no reader anywhere hard-codes the
four-value vocabulary as an enum it switches over exhaustively — confirmed by `pnpm typecheck`
reporting zero exhaustiveness errors anywhere after the type widened). No frozen workflow or
closure module was touched.

## A judgement call: `operationVerdict()` is not changed

`document-state.ts`'s `operationVerdict()` branches on the raw `business_operation` capability only
for `"unsupported"` (→ `"not_applicable"`); every other level — `supported`, `stored_only`,
`planned`, and now `proposal_only` — falls through to the SAME entries/statements-derived logic
(`uncoded`/`coded`/`posted`/`reconciled`), because that function answers "what actually happened to
this document's own entries", not "what does the registry's own vocabulary word promise". It
already treats `stored_only` and `supported` identically pre-posting (both read `"uncoded"` until an
entry exists) — this is not a distinction the function draws for ANY level pair, so declining to
carve out `proposal_only` specially is consistent with its existing design, not a new gap. The AC's
own "renders ... distinctly" is satisfied at the layer that actually renders the raw level word
(`capability-tiers.tsx`'s tone map + `capabilityTier.*`), which I did change. I am recording this as
a judgement call rather than a silent omission: a future ticket that builds the actual "Clara
proposes, a person confirms" UI (accepting/rejecting a proposal) would very plausibly want a new
`OperationVerdict` value here, and that is real, additional scope this ticket's own ACs do not ask
for (there being zero rows at the level yet, there is nothing for such a UI to render regardless).

## What I deliberately did not test

`capability-tiers.tsx`'s tone map has **no existing test coverage today, for any of its four
current levels** — no component-level test file exists for it, and the codebase's own boundary
tests the DERIVATION functions (`resolveCapability`, `tierStateKey`) rather than the presentational
component that consumes them. I made the code change (the new `TONE` entry) and verified it via
the pure-function tests above plus the whole-suite regression and both e2e walks, rather than
inventing new component-test infrastructure for a one-line color-class addition — "no test at a
seam the brief does not give you," and this repo's own established seam for this exact concern is
one layer below the component.

## Follow-ups worth filing

1. **The `document-kind-dialog.tsx` `DOCUMENT_KINDS` defect is now fixed on THIS lane's branch
   only.** Each lane is its own worktree/branch, so this fix does not reach the other lanes; #846's
   and #782's reports already flagged it as urgent for the integrator. I am the third report to
   independently re-confirm it, now with a shipped, gate-verified fix diff (`1e7565e2f`) the
   integrator can cherry-pick or use as the reference correction, plus a documented dead end
   (`019506782`) for the OTHER candidate fix that looks equally plausible and is not.
2. **A future "Clara proposes, a person confirms" UI** (accepting/rejecting a specific proposal)
   will want its own `OperationVerdict` value in `document-state.ts` and its own branch in
   `operationVerdict()` — out of #988's scope (zero rows exist at the level today), noted above.

## Anything unverified

- **Hosted evidence.** None of this has reached hosted; that is the release runbook's job, not
  mine.
- **The other two capability-related e2e walks** (`document-correction-walk.spec.ts`,
  `work-list-walk.spec.ts`) reference `get_document_state`/`business_operation` in their own mock
  fixtures but were not run — I ran the two most directly exercising the files I changed
  (`documents-intake-walk` for `capability-tiers.tsx`, `documents-viewer-walk` for
  `document-state.ts`/`DocumentStatePanel`) and the change is additive everywhere else (confirmed
  by `pnpm typecheck` finding zero new exhaustiveness errors and the whole unit suite passing
  clean), so I judged the marginal evidence from the other two walks not worth the additional
  `next build`+Playwright cycle time. Flagging rather than asserting they would pass.
