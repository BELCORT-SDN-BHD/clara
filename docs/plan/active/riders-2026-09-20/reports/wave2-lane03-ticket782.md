# Wave 2 · lane 03 · ticket #782 — Invoice line items stop being `planned`

**Status: DONE.** Branch `riders/w2-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`,
database `127.0.0.1:55743/clara_l03`. Base `23cfad947b5598214168ba9c43d391b4e16aa745`.

```
4a5c9f2d7 feat(web): #782 the document detail shows invoice line items as an accepted limitation
a2bc8fbe8 test(runtime): #782 clara.get_document_state reads the invoice line-item limit's new value
380617b1b feat(db): #782 the invoice family's registry limit becomes an accepted limitation, not planned
bcc38b749 docs(db): #846 the high-water mark in the module READMEs, CONTEXT and the rig cohort
f0ab72bb4 test(db): #846 the wall closes a hole, not the door — the three positive controls
```

(the last two are #846, already landed on this branch when I started — `git log
23cfad94..HEAD` showed five #846 commits and nothing of mine.)

## The ticket is the contract — which brief wins

`gh issue view 782 --comments` has four comments. In order: an original "ready-for-human" brief
about a much wider question (per-line invoice AND credit-note/debit-note/receipt facts); an
owner-direction comment (2026-09-15) widening the question further and relabelling it
`idea`+`needs-triage`; **the newest Agent Brief, an owner ruling dated 2026-09-18** — "no invoice
line items this round; stop promising them" — which is the one that binds (work order rule 2: the
newest Agent Brief, together with any 2026-09-20 owner ruling, wins); and a wave-2 coordination
comment left after #846 landed, telling whoever picks this up to raise the registry from 2 to 3 by
UPDATE. I built to the 2026-09-18 brief's "What to build" and acceptance criteria, using the
coordination comment's instructions for the migration's own mechanics.

**Verified still live before building.** Measured on the lane rig before any change: `pdf ×
invoice`'s `limits.invoice_line_items` read `"planned"`, and the registry published
`registry_version = 2` uniformly across all 240 rows (0228's raise, wave-1). Nothing in wave 1 or
in #846 touched the invoice-family `limits` values.

## The seams I tested at (written before the first test)

The brief names three surfaces: "the capability registry's named limit" (a DML fact on
`clara.document_capabilities.limits`), "every user-visible sentence built from that limit" (the
document detail panel, which reads the registry through `clara.get_document_state`), and "the
PRD's document-reading section". So the seams are:

1. **DML on `clara.document_capabilities`** through the owner/migration connection — the only
   writer this table has (0191's ruling, restated by every migration since).
2. **The live read**, both directly (`document-capability-registry.test.mjs`,
   `document-capability-high-water.test.mjs` — a sibling battery over the same row I did not
   expect to need editing, see below) and through the runtime's own door
   (`clara.get_document_state`, exercised by `document-facts-validation-db.test.mjs`).
3. **The rendered sentence** in `DocumentStatePanel` (`document-state-panel.tsx` +
   `en.json`'s `capabilityLimit.invoiceLineItems`), proved under real `next-intl` messages in
   `document-state-panel.test.tsx`, and in the browser walk `documents-viewer-walk.spec.ts`
   (blocked from actually running — see Gates).

No seam at `docs/PRD.md`: read in full (154 lines) and grepped for "invoice"/"line item"/
"planned"/"coming" — zero matches. The PRD's document-reading section never described line items
at all, so that half of the AC is **already satisfied**, not built. (`docs/ARCHITECTURE.md:529`
does still describe them as `planned` — see Follow-ups; I did not touch it, because the work order
forbids editing `docs/ARCHITECTURE.md` from inside a ticket.)

## Vertical slices, in order

| slice | the red I saw, for the right reason | the code that turned it green |
|---|---|---|
| 1 | `document-capability-registry.test.mjs`'s invoice-shaped-PDF cell: `expected 'planned', actual 'planned'`→ edited to expect `accepted_limitation` first, so it read `expected 'accepted_limitation', actual 'planned'`; two more cells (`PUBLISHED_REGISTRY_VERSION`-derived) also went red for the same pre-migration reason | migration `0245_invoice_line_items_accepted_limitation.sql` |
| 2 | `document-capability-high-water.test.mjs`'s rollback-hygiene cell, discovered AFTER slice 1 landed: `expected {invoice_line_items:'planned'}, actual {invoice_line_items:'accepted_limitation', invoice_line_items_reason:'no_consumer_reads_line_facts'}` — a pin I had not found by grepping the coordination comment's named files | edited that cell's expected object; no new migration content |
| 3 | `document-facts-validation-db.test.mjs`'s `#624 get_document_state` cell: `expected 'planned', actual 'accepted_limitation'` | edited the assertion (no runtime code changes — the value already flows through `get_document_state`) |
| 4 | `document-state-panel.test.tsx`: the invoice fixture already carried the new value (I bumped it ahead of the copy change), so the panel rendered the OLD sentence through the `capabilityLimitUnknown` fallback for the new `invoice_line_items_reason` key and the stale English for `invoice_line_items` itself | `en.json`'s two `capabilityLimit.*` strings + `document-state-panel.tsx`'s `LIMIT_KEY` gaining `invoice_line_items_reason` |

Slice 2 is the one thing the coordination comment's own file list did not name (it named
`document-capability-registry.test.mjs:274,464,480`, `document-facts-validation-db.test.mjs:200`
and the web fixtures). A repo-wide grep for `invoice_line_items` before I touched anything had
already turned up `document-capability-high-water.test.mjs` as one of eleven hits, but I read past
it as "not the file the ticket names" and only caught the pin when `operation-census`+
`rig-isolation`'s sibling run went red. Lesson recorded for whoever reads this: a value pinned in
two batteries over one table moves in both, and a coordination comment's file list is a floor, not
a ceiling.

## Acceptance criteria

| AC | verdict | evidence |
|---|---|---|
| A new migration re-seeds the invoice family's limit from `planned` to an accepted-limitation value carrying a reason, using the additive idiom, with the tail census re-reading the rows; registry/runtime/web cells pinning `planned` updated | **done** | `0245_invoice_line_items_accepted_limitation.sql` §B1 (`limits \|\| jsonb_build_object(...)`, the exact additive shape 0228 used for `browser_entrance`); tail §C(4) re-reads all 28 rows and asserts the new pair of values; §C(3) asserts zero rows anywhere still read `planned`. Cells updated: `document-capability-registry.test.mjs` (3 cells + the `PUBLISHED_REGISTRY_VERSION` doc comment), `document-capability-high-water.test.mjs` (1 cell), `document-facts-validation-db.test.mjs` (1 cell), `document-state.test.ts`, `capability-registry.test.ts`, `document-state-panel.test.tsx`, `documents-viewer-mock.mjs`, `work-list-mock.mjs`, `documents-viewer-walk.spec.ts`. |
| The document detail shows the limitation sentence and its reason; no "planned"/"coming" wording for line items remains in the registry seed, the web copy or the PRD | **done** | `en.json`'s `capabilityLimit.invoiceLineItems` → "Per-line invoice facts: {level}. Clara records the header totals with their source regions; the questionnaire, autodraft and posting all work from those header facts alone." and new `capabilityLimit.invoiceLineItemsReason` → "Reason: {level}."; rendered end-to-end under real next-intl messages in `document-state-panel.test.tsx` ("a supported invoice still declares its LINE-ITEM limit"), which now also asserts `doesNotMatch(/planned/i)`. Repo-wide grep after the change: the only remaining `invoice_line_items`+`planned` co-occurrences are (a) 0191's own applied migration (never edited), (b) my own migration's prestate/tail literals describing the BEFORE state and asserting it is gone, and (c) an old, dated wave report file (`docs/plan/active/refresh-wave-2026-09-14/reports/624-review-closure.md`) which records history and is not a live surface. PRD: already satisfied (see above). |
| The questionnaire, autodraft and posting batteries are unchanged and green; the document-reading walk covers the new sentence | **done / partly unverified** | `packages/runtime/tests/s6-invoice-facts.test.mjs` 24/24, `trade-invoice-unit.test.mjs` 23/23, both untouched by this ticket. The walk (`documents-viewer-walk.spec.ts`) is edited to assert the new sentence AND its reason line, and the mock it reads from carries the new fixture — but **I could not run it**: `next build` fails to typecheck for a reason that has nothing to do with this ticket (see Gates → "Blocked"). The equivalent DOM-level proof (`document-state-panel.test.tsx`) did run and is green, against the real message strings and the real component, which is the same rendering path the walk exercises minus the browser. |

## The migration

`packages/db/migrations/0245_invoice_line_items_accepted_limitation.sql` — the number reserved for
this ticket. Applied to `clara_l03` with `pnpm db:migrate`; the migration's own notices printed
`#782 prestate: OK` and `#782 tail: OK`. Chain now 231 files.

**Prestate pins, MEASURED on this rig now** (`encode(sha256(convert_to(prosrc,'UTF8')),'hex')`
keyed by `to_regprocedure`, never transcribed from another file's text — the wave-2 addendum's
own rule, because #846 is this same lane's prior ticket and could in principle have recut a body
mine rides):

| function | sha256(prosrc) |
|---|---|
| `clara._tf_document_capabilities_version_monotone()` (0207) | `170df87b15ca9eafa40e0dfa2e09423d145de89e0ed55b3c44247ec68b9e9c56` |
| `clara._tf_document_capabilities_version_high_water()` (0244) | `b40906871b7e7e43bff50799c187d7ae38d13d30f61f7a1ab99547d6de8618c9` |
| `clara._tf_document_capabilities_high_water_record()` (0244) | `839c51fb125268bf17bd2fd35ed4d4583cae4d251aad6724a241fc78429de40d` |
| `clara._tf_document_capability_high_water_monotone()` (0244) | `196780f9528d1d74cbef0bbc400024974ebd9828106c1b0fc8f7026652888f27` |
| `clara._tf_document_capabilities_version_uniform()` (0244) | `d21b6837207cb438ab13caf279ef3d52a69066c480e20807f5be3ae7895ef776` |

All five matched #846's own pins exactly (no drift since #846 landed a few commits earlier on this
same branch). The prestate also measured: registry uniformly at version 2 across 240 rows; exactly
28 rows carrying `limits.invoice_line_items = 'planned'` (the six OCR-family formats ×
invoice/credit_note/debit_note/receipt = 24, plus xml × invoice/credit_note/debit_note/
e_invoice_xml = 4); no row yet carrying `invoice_line_items_reason`; and the high-water mark
already agreeing with the registry on every pair.

**What it changes** (no function, table, trigger, CHECK, policy or grant — a pure republication,
same shape as #656's 0228):

1. `update ... set limits = limits || jsonb_build_object('invoice_line_items','accepted_limitation','invoice_line_items_reason','no_consumer_reads_line_facts') where limits ->> 'invoice_line_items' = 'planned'` — 28 rows, additive idiom, `basis`/`typed_facts`/`business_operation` untouched.
2. `update ... set registry_version = registry_version + 1` — all 240 rows, 2 → 3.

**Tail** re-hashes all five pinned bodies again (byte-identical), confirms `count(distinct
registry_version) = 1` and `= 3`, confirms 240 rows (no insert/delete), confirms zero rows anywhere
still read `planned`, confirms the 28 rows now read the new pair of values AND that
`typed_facts`/`business_operation` are still `supported` and `basis` still names the facts engine
(nothing else moved), confirms the high-water mark rose to 3 for every pair via #846's ordinary
AFTER-trigger writer (never a first publication), and confirms no application role gained anything.

**Why `accepted_limitation` + a sibling reason, not a longer value.** The existing two-key idiom
`limits` already uses for the OFX row (`opening_balance` + `reader`) is the precedent; I mirrored
it rather than inventing a third shape. The reason value is checkable, not asserted: I grepped
`packages/runtime` for any reader of a per-line invoice fact and found none — the only hit outside
tests and the registry migrations is `trade-invoice-basis.ts`'s own comment, which already said
"#782 owns line items" (see Successor contract / Follow-ups: I could not update that comment).

**Redo.** Not needed — the migration applied clean on the first try; no edit-and-reapply cycle.

## Gates, with counts

Every db command ran with `PGHOST=127.0.0.1 PGPORT=55743 PGUSER=postgres PGDATABASE=clara_l03
CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`; every db battery ran with the full gate chain from
`packages/db/package.json`. `CLARA_RIG_ALLOW_RESET`/`CLARA_RIG_ALLOW_ROLE_SWEEP` never set.

| gate | result |
|---|---|
| `tests/document-capability-registry.test.mjs` (touched) | **19 pass / 0 fail / 0 skipped** (red on 3 cells immediately after editing them, before the migration; green after) |
| `tests/document-capability-high-water.test.mjs` (touched) | **7 pass / 0 fail / 0 skipped** (red on 1 cell after the migration, before I found and edited its pin; green after) |
| `tests/operation-census.test.mjs` (required by rule 8) | **10 pass / 0 fail / 0 skipped** |
| `tests/rig-isolation.test.mjs` (required by rule 8, no reset flags) | **22 pass / 0 fail / 1 skipped** — the skip is T19 `poison-role`, which needs `CLARA_RIG_ALLOW_RESET`, forbidden by RIG.md |
| `packages/runtime/tests/document-facts-validation-db.test.mjs` (touched) | **6 pass / 0 fail / 0 skipped** |
| `packages/runtime/tests/s6-invoice-facts.test.mjs` (AC3 evidence, untouched) | **24 pass / 0 fail** |
| `packages/runtime/tests/trade-invoice-unit.test.mjs` (AC3 evidence, untouched) | **23 pass / 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 312 frozen files verified, no manifest diff** (see "A mistake I made and reverted" below) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** |
| `apps/web`: whole unit suite once (`node scripts/run-tests.mjs`) | **4727 pass / 20 fail / 2 skipped** — the 20 failures are **pre-existing and unrelated**, all five files' worth (`document-detail-live-refresh.test.tsx`, `document-kind-dialog.test.tsx`, `document-kind-labels.test.tsx`, `documents-url-state.test.tsx`, `documents-workbench-refresh.test.tsx`) tracing to one root cause, `DOCUMENT_KINDS is not defined` in `document-kind-dialog.tsx:95` — see "Blocked" below. Re-ran the whole suite a second time after restoring my own changes (see the stash note) and got the identical 20 failures, same files, confirming nothing of mine moved them. |
| `pnpm --filter @clara/web e2e documents-viewer-walk` (touched) | **BLOCKED — `next build` fails to typecheck.** See "Blocked" below. |
| `pnpm --filter @clara/web e2e work-list-walk` (touched fixture only) | **not attempted** — the same `next build` step would fail identically; running it would prove nothing new. |
| `pnpm lint` (worktree root) | **exit 0**, after a fix-round on my own diff (below) |
| `pnpm typecheck` (worktree root) | **FAILS — inherited, not mine.** See "Blocked" below; independently re-verified my own diff is typecheck-clean. |

### A fix-round on my own diff: the raw-colour lint rule

My first draft of `document-state-panel.test.tsx`'s new assertions used `"#782"` inside two
assertion-message string literals. `eslint`'s `NO_RAW_COLOR_VALUES` rule (owner ruling Q4,
2026-08-27) fires on any `#` followed by 3/4/6/8 hex-looking characters, and the rule's own error
text names exactly this false positive ("a plain ticket reference like `#658` trips it too") with
the prescribed fix: reword rather than weaken the rule. Reworded both to "ticket 782"; `npx eslint
.` went from 2 errors to 0, and the same string in a `//` comment (not a string literal, two other
files) does not trip the rule at all — confirmed by grep + a clean `eslint .` run.

### A mistake I made and reverted: touching a frozen workflow body

I first "fixed" a stale comment in `packages/runtime/lib/trade-invoice-basis.ts` (it said "#782
owns line items and `docs/ARCHITECTURE.md:529` records them as planned" — accurate before this
ticket, stale after). `node scripts/check-frozen-workflows.mjs` immediately failed: that file is a
frozen workflow body, and freeze-lint hashes the whole file, so even a comment-only edit is a
"BODY CHANGED" violation (work order rule 5: never edit a frozen workflow body). I reverted the
edit (`git diff` against the file is now empty) and re-ran freeze-lint: **OK, 312 files verified,
no manifest diff**. The stale comment stands — see Follow-ups.

### A near-miss: `git stash` popped my own worktree

While trying to isolate whether the 20 web-unit failures were caused by my diff, I ran `git stash
push` scoped to my changed directories to get a clean baseline, intending to compare. That
un-applied ALL of my edits (expected, in hindsight — that is what `stash push` does), which the
harness's own file-change reminders then reported as files "changed on disk". I ran `git stash pop`
immediately, verified every edited file's content and `git status` matched what I had before the
stash, and re-ran the DB and web-unit gates from clean to confirm nothing was lost. No file was
regenerated from a stale read after this; every subsequent edit and gate run in this report is
against the restored (and now committed) state. Recorded because it is the one place I made a
tooling mistake against my own worktree.

## Blocked: a pre-existing, wave-1-inherited defect (not mine, not fixed)

`apps/web/components/documents/document-kind-dialog.tsx:95` reads a bare `DOCUMENT_KINDS`, but the
file imports only `CLASSIFIABLE_DOCUMENT_KINDS` (line 35). This is **already documented** as a
follow-up in this lane's own `wave2-lane03-ticket846.md` ("`apps/web/components/documents/
document-kind-dialog.tsx` does not compile on the wave-1 integrated head... blocks the typecheck
gate for every wave-2 lane"). I re-confirmed it independently:

- `git diff 23cfad947b..HEAD -- apps/web/components/documents/document-kind-dialog.tsx` is empty —
  byte-identical to the lane's base commit. Its last touching commit is `4b1376f40 merge: riders
  wave 1 lane 08`, before this lane's branch was even cut.
- `pnpm typecheck` and `apps/web`'s own `tsc --noEmit` fail with the identical two errors
  (`TS2552`, `TS7006`) whether or not any of my commits are present.
- **New information #846 could not have found** (it never touched `apps/web`, so never ran `next
  build`): the same defect fails `next build`'s own TypeScript pass, which means `pnpm --filter
  @clara/web e2e <spec>` **cannot run at all** for any spec, on this branch, today — not only
  `tsc --noEmit`. I confirmed with `documents-viewer-walk`.
- I verified the fix and its blast radius without shipping it: temporarily added `import {
  DOCUMENT_KINDS } from "@/lib/documents/types";` to the file, re-ran `tsc --noEmit` from
  `apps/web` — **zero errors** — then reverted with `git diff` showing empty again. This proves my
  own diff introduces no typecheck regression anywhere in `apps/web`, and that the one-line import
  fix is sufficient, but I did not ship it: it is not ticket #782's file, and each lane is its own
  worktree/branch, so a local fix here would not reach the other nine lanes anyway — only whoever
  owns the #633/#878 dialog lineage, or the integrator, can fix it once for everyone.

## Docs, in the same commits

- `packages/db/README.md` — new "#782 — the invoice family's line-item limit becomes an accepted
  limitation (0245)" section beside 0244's: the change, the checkable reason, and why the
  prestate re-pins #846's five wall bodies rather than trusting #846's own pins.
- `packages/db/tests/README.md` — a note under the #846 section recording that #782 edits
  `document-capability-registry.test.mjs` (and `document-capability-high-water.test.mjs`) in
  place rather than adding a cell, with both files' new pass counts.
- `packages/db/tests/rig-meta.mjs` — a comment-only `#782` cohort (0245 installs no function, no
  table, no trigger — the same reason 0228's `#656` entry above it carries none), placed
  immediately after `#846 END`.
- No `CONTEXT.md` change: no new vocabulary term. **Capability registry version** (added by #846)
  already covers what a version bump means; this ticket only changes what one `limits` value says.

## Successor contract

**None is owed.** #782 touches no door, no grant, no callable verb and no chat/Work-tool surface.
The only writers of `clara.document_capabilities` remain migrations (0191, 0228, 0245); every
reader in `apps/web`/`packages/runtime` is unchanged (`GET .../document_capabilities`,
`clara._document_capability`, `clara.get_document_state`). Nothing in the chat or Work lane
changes shape, and no frozen workflow or closure module was edited (see "A mistake I made and
reverted" above — the one attempt was caught by freeze-lint and reverted).

## Follow-ups worth filing

1. **`document-kind-dialog.tsx`'s `DOCUMENT_KINDS` defect now blocks `next build` and every e2e
   walk, not only `tsc --noEmit`** — already filed as a follow-up by #846's report; this
   corroborates it with the build-level evidence #846 could not gather (it never touched
   `apps/web`). One-line fix verified (add `import { DOCUMENT_KINDS } from
   "@/lib/documents/types"`), reverted, not shipped — belongs to the #633/#878 dialog lineage or
   the integrator, and should be treated as **urgent**: it silently blocks the e2e gate for every
   wave-2 lane touching `apps/web`, not just this one.
2. **`packages/runtime/lib/trade-invoice-basis.ts`'s comment above `tradeInvoiceLineSchema`** still
   reads "#782 owns line items and `docs/ARCHITECTURE.md:529` records them as planned" — accurate
   before this ticket, stale after, and I cannot touch it (frozen workflow body; a real fix needs a
   new `_vN` export per `docs/ARCHITECTURE.md` §10, which is not this ticket's job for a
   comment-only correction).
3. **`docs/ARCHITECTURE.md:529`**'s §7 "accepted but unimplemented" table still lists "发票行项目
   （line items）的类型化事实 | 能力目录中显式标为 planned" as a future target. That row is now
   stale — the owner ruling makes this a standing limitation, not a deferred target — but the work
   order forbids editing `docs/ARCHITECTURE.md` from a ticket; it wants a wayfinder/to-spec pass.
   Overwrite (never append) that row when one runs.

## Anything unverified

- **The document-reading browser walk itself.** `documents-viewer-walk.spec.ts` is edited
  correctly (verified by reading the diff and the mock fixture it reads from) but could not be
  RUN, for the pre-existing, unrelated reason above. The same rendering path is proven at the
  component level (`document-state-panel.test.tsx`, 10/10, real message strings, real component,
  real next-intl), which is the closest substitute available without a working `next build`.
- **`work-list-walk` and the other two specs that import the same mock module**
  (`firm-navigation-walk.spec.ts`, `shell-migration-walk.spec.ts`) — not run for the same reason;
  grepped and confirmed neither of the latter two references `invoice_line_items` or the sentence
  text, so my fixture edit could not have changed their outcome even if they ran.
- **Hosted evidence.** None of this has reached hosted; that is the release runbook's job, not
  mine.
