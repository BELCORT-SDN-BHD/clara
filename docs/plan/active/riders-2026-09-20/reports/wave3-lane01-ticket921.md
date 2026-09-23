# Wave 3, lane 01, ticket #921 — make the legacy vendor-bindings panel read-only

Branch `riders/w3-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. This is the lane's second ticket — #890 is done and
committed (`aeb92314c`). An earlier implementer of #921 was cut off mid-work by a usage limit after
landing the migration slice (`276ac5fb1`) and leaving two uncommitted companion files
(`packages/db/package.json`, `packages/db/tests/rig-meta.mjs`); this session resumed from there,
judged those changes on their merits (correct and necessary — see "Migration" below), finished and
committed them, then did the web-side work the ticket's brief still required. Commits on this branch
for #921 (newest first):

- `00ba92176` `fix(web): #921 disambiguate the counterparty-name text match in the new e2e walk`
- `75799d467` `fix(web): #921 re-true the /admin/vendor-bindings page-shadow copy pin`
- `cf7f211b3` `docs: #921 packages/db/README.md — the 0273 vendor-binding write-doors revoke`
- `b74b9f7f0` `fix(web): #921 reword ticket references to clear the raw-colour lint gate`
- `f293aaabf` `fix(web): #921 remove the propose and sign controls from the vendor-bindings panel`
- `b85471da7` `fix(web): #921 retire canProposeVendorBinding and canSignVendorBinding`
- `0c196f5d3` `test(db): #921 wire the vendor-binding write-doors-revoked gate into the chain`
- `276ac5fb1` `feat(db): #921 revoke the human write grant on vendor-binding propose/sign/decline` (prior implementer)

## Status: done

Verified still live on this branch before building: `gh issue view 921 --json body,comments` — zero
comments, no owner-ruling comment dated 2026-09-20 on #921 itself. The Agent Brief in the issue body
is the newest and only binding text:

> **Summary:** Make the legacy vendor-bindings panel read-only, as D6 requires: revoke the human
> grants on propose, sign and decline; keep list, get and revoke.
>
> **Desired behavior:** No human role can propose, sign or decline a vendor identity binding.
> `list_vendor_bindings` and `get_vendor_binding` stay granted (historical receipts);
> `revoke_vendor_identity_binding` stays granted (closing an in-flight legacy binding). The panel
> shows history and the revoke action only; its LEGACY badge stays. Nothing else in the lane moves.
>
> **Key interfaces:** A new migration (revoke execute on the three doors, prestate pin + tail
> census). `vendor-bindings-panel.tsx` and `vendor-binding-ceremony.tsx`: propose, sign and decline
> controls removed; `canProposeVendorBinding` retired or forced false. The e2e-fixture-ownership
> census and any walk that drove a proposal: updated to the read-only shape.
>
> **Out of scope:** Removing the lane's tables, doors or historical rows (D6 keeps them). The
> counterparty identity lane (#647), the replacement.

## The seams tested at

Per the brief's own "Key interfaces", written down before building:

- **The grant itself** — `has_function_privilege('clara_authenticated', <fn>, 'execute')` for all
  five vendor-binding doors, driven by a real RPC call under a real JWT for propose/sign/decline
  (42501, every rank) and a real end-to-end door drive for list/get/revoke.
- **The panel's rendered controls** — `VendorBindingsPanel` / `VendorBindingRowActions` /
  `ProposeBindingDialog` (deleted), mounted through their real caller, never a dialog's internals
  directly: no Propose or Sign trigger renders, at any rank, and Revoke still does for bookkeeper+
  on a live row.
- **The capability derivation** — `firmCapabilities()`'s own shape: `canProposeVendorBinding` and
  `canSignVendorBinding` no longer exist as properties, at any rank.
- **The operation-contract census** — `apps/web`'s only remaining callers of the three retired doors
  had to go, because `operation-census.test.mjs`'s `called_ungranted` label is exactly the seam that
  proves a dead call site, not merely "the button is gone".
- **The real browser** — the panel's own route (`/settings/vendor-bindings`), at owner and
  bookkeeper rank, through a real sign-in.

`e2e-fixture-ownership.test.ts` was checked and needed no change: it carries zero references to
vendor bindings (confirmed by `grep`), and no e2e walk anywhere in the tree drove a proposal before
this ticket (confirmed by `grep -rn "propose_vendor_identity_binding\|sign_vendor_identity_binding"
e2e/` — zero matches). The brief's phrase "the e2e-fixture-ownership census and any walk that drove
a proposal" therefore named a defensive check, not a found defect; the actual "walk" that exercised
the retired UI at the component level was `vendor-binding-ceremony.test.tsx`'s own Sign-dialog
click-through cells, which this ticket rewrote (see below).

## Acceptance criteria, with evidence

| Criterion | Evidence |
|---|---|
| A cell proves `clara_authenticated` cannot execute propose, sign or decline (typed permission refusal), and can still execute list, get and revoke | `packages/db/tests/vendor-binding-write-doors-revoked.test.mjs` — 6/6 PASS (vb921.1–vb921.3: 42501 on each of the three; vb921.4: the denial holds for both an admin and a viewer, before rank is ever read; vb921.5: list/get/revoke reachable end-to-end against a real binding). Independently re-verified live on `clara_l01` just now, outside any test harness: `select proname, proacl from pg_proc where proname in (...)` shows `propose_vendor_identity_binding` and `decline_vendor_identity_binding` with `proacl = {clara_fn_owner=X/clara_fn_owner}` only (no `clara_authenticated` entry), while `revoke_vendor_identity_binding`/`list_vendor_bindings`/`get_vendor_binding` all carry `clara_authenticated=X/clara_fn_owner`. No PUBLIC leak on either revoked function (`has_function_privilege('public', …)` = false for both). |
| The panel renders history and revoke only; no propose or sign control exists (a unit cell and the firm-navigation walk) | Unit: `vendor-binding-ceremony.test.tsx` — 3/3 PASS ("no Propose control renders, at any rank"; "no Sign control renders, at any rank, even for a historical 'proposed' row"; "Revoke stays offered on a live binding to bookkeeper+, and absent below it"), each checked at owner (the ceiling — clears every floor the retired doors ever had) and viewer (the floor). `firm-admin-a11y.test.tsx` and `firm-admin-keyboard.test.tsx` gained the same absence assertion and stay green (11/11 combined). Browser: `e2e/firm-navigation-walk.spec.ts`, new test "the vendor-bindings panel offers NO propose or sign control at any rank — the doors are revoked, not merely rank-gated" — PASS, driven at owner and bookkeeper rank through a real sign-in, real navigation to `/settings/vendor-bindings`, a real client selection, BY ROLE and BY TEXT absence checks for both controls, presence check for Revoke, and a clean axe scan at both ranks. |
| The migration applies on a from-scratch chain; the vendor-binding db batteries are updated to the read-only shape and stay green | Applied and live on `clara_l01` (`clara.schema_migrations`: `version=0273_vendor_binding_write_doors_revoked`, `applied_at=2026-09-20T16:04:15.827Z`, `checksum=61f1ae8b…`, independently recomputed from the file on disk just now — byte-identical, no drift). `rig-isolation.test.mjs`'s T17 grant-matrix sweep — PASS (see Gates). A true from-scratch-chain proof on a disposable cluster is the integrator's job per RIG.md/WORK-ORDER.md, not a lane's; this lane's own database was itself migrated from scratch 0001→0272 before this ticket started (RIG.md), and 0273 is the 268th file on it now (`select count(*) from clara.schema_migrations` = 268). |

## Migration

**`0273_vendor_binding_write_doors_revoked.sql`** (landed by the prior implementer, `276ac5fb1`;
this session finished its companion wiring and verified it — see "Resume" below). `revoke execute`
on three of the five vendor-binding doors 0028 created — `propose_vendor_identity_binding(jsonb,text)`,
`sign_vendor_identity_binding(uuid,text,text)`, `decline_vendor_identity_binding(uuid,text,text)` —
from `clara_authenticated`. Nothing else: no table, column, trigger, policy or function body moves.
REVOKE, never DROP, per the brief's own "Out of scope" line — these three bodies remain the only
record of how a still-visible `proposed`/`live`/`declined` historical row came to exist.

**Prestate pins, MEASURED on `clara_l01` by the prior implementer** (I re-verified all six live
against the current database and found zero drift):

| function | measured prosrc sha256 | grant before 0273 |
|---|---|---|
| `propose_vendor_identity_binding(jsonb,text)` | `fe14f23984e00178e1dc084caf3224cfe4cb5b62fe080301b95e2fc4b671dc82` | granted (revoked by this file) |
| `sign_vendor_identity_binding(uuid,text,text)` | `b56d25542f6edbaf59a22948d7e0768e836cd6163763af3ffbe41469f4c9826c` | granted (revoked by this file) |
| `decline_vendor_identity_binding(uuid,text,text)` | `b289a0b660a2817d9bfeb0d368494467f4135ac8e9ba9423e3abfb52378bdbad` | granted (revoked by this file) |
| `revoke_vendor_identity_binding(uuid,text,text)` | `b0b566b36d84b17469425a86fdfd4c68fcaebea6dd793b3edb2f1bce609433ce` | granted, unmoved |
| `list_vendor_bindings(uuid)` | `53a0d3fcd9f37fe9a23aebf9862e9adb2af316dfaf2aef3d97b2aaf7ffa0c7fe` | granted, unmoved |
| `get_vendor_binding(uuid)` | `ce1e8bc460a4caac4b23c524987f0654a38015ac429759c6c77d91c03cf954a7` | granted, unmoved |

The tail re-reads the live catalog and re-asserts every one of the six shas byte-identical, the
three revocations, and no PUBLIC leak on any of the six — I re-ran the equivalent read independently
against the live database (see the acceptance-criteria table above) and it matches the migration's
own claim exactly.

**REDO-SAFE by construction** (the file's own header): `revoke execute … from <role>` is a no-op
against an absent grant, so the prestate reads current state and reports FIRST APPLY or REDO rather
than assuming one. This migration was applied exactly once (`clara.schema_migrations` shows a single
row, `applied_at=2026-09-20T16:04:15.827Z`) — the genuine FIRST-APPLY branch ran for real when the
prior implementer applied it, not a redo; I did not need `CLARA_MIGRATION_REDO`. Because the
migration recuts no function body, its sha pins are single-valued in both branches (a REVOKE never
touches `prosrc`), so the wave-3 addendum's "prove the bimodal pin's first-apply branch yourself"
caution does not apply here — there is no bimodal pin, only a bimodal grant-state read, and that
branch already ran for real.

**The migration triad**, in migration order: `packages/db/tests/vendor-binding-write-doors-revoked-preintegration-gate.mjs`
(stem `vendor_binding_write_doors_revoked$`), `packages/db/tests/vendor-binding-write-doors-revoked.test.mjs`,
and the `--import` token in `packages/db/package.json`'s test script (this session's own commit,
finishing what the prior implementer's commit left uncommitted). In `packages/db/tests/rig-meta.mjs`:
`VENDOR_BINDING_0028_HUMAN_FNS` narrowed from all five names to the three D6 keeps as human doors
(the EXISTENCE cohort, renamed `VENDOR_BINDING_0028_ALL_FNS`, still names all five — a REVOKE never
changes whether a function exists), and `BINDING_PROPOSAL_PR1_HUMAN_FNS` dropped
`decline_vendor_identity_binding`. Unlike #1003's [0271] DROP, this needs **no bimodal retirement
window**: `grantMatrixFailures()` judges every name it finds live in the catalog on every frontier,
so an unlisted name simply reads as the correct `expected=false` on both sides of 0273 with no
frontier arm to maintain — confirmed by `rig-isolation.test.mjs`'s T17 passing clean (see Gates).

## The web-side fix

**`apps/web/components/firm-admin/vendor-binding-ceremony.tsx`** — deleted `ProposeBindingDialog`
outright and the Sign half of `VendorBindingRowActions`. A "proposed" row (necessarily historical
now — the door that creates one is revoked) carries no action at all; a "live" row still offers
Revoke, unchanged.

**`apps/web/components/firm-admin/vendor-bindings-panel.tsx`** — no more `action` on the section
header (the Propose trigger lived there), no more `canSign`/`canProposeVendorBinding` props passed
down.

**`apps/web/lib/firm/capabilities.ts`** — **retired** (not merely forced false)
`canProposeVendorBinding` and `canSignVendorBinding`: removed from the `FirmCapabilities` type, the
`NOTHING` constant, the derivation in `firmCapabilities()`, and their two `FIRM_CAPABILITY_FLOORS`
mirror rows. A FLOOR row mirrors a REACHABLE door's rank check; migration 0273 revoked EXECUTE
outright, for every rank, so there is no floor left to mirror — retiring the capability makes that a
compile-time fact rather than a boolean that silently reads `false` forever.
`canRevokeVendorBinding` is unchanged.

**`apps/web/lib/firm-admin/vendor-bindings.ts`** — removed `proposeVendorIdentityBinding`,
`signVendorIdentityBinding`, `loadVendorCounterparties` and `VendorCounterpartyRow`. This was not
optional cleanup: `operation-census.test.mjs`'s `opcen.1`/`opcen.6` cells went RED the moment
migration 0273 applied, because these two wrapper functions were still live call sites naming doors
`clara_authenticated` can no longer execute — exactly the `called_ungranted` defect that gate exists
to catch (measured directly: `called_ungranted:` findings named both functions and their exact call
sites, `apps/web/lib/firm-admin/vendor-bindings.ts:173`/`:182`, before this fix; zero after).

**`apps/web/messages/en.json`** — retired `signTrigger`/`signTitle`/`signDescription`,
`proposeTrigger`/`proposeTitle`/`proposeDescription`,
`counterpartyLabel`/`counterpartyPlaceholder`/`counterpartyNoneYet`/`counterpartiesLoading` (all
propose/sign-dialog-only strings); `pageDescription` no longer claims a control that cannot succeed
("Review history and revoke a vendor's identity binding. Proposing and signing are retired…").

## Vacuity controls

- **The Propose control's absence.** Reintroduced a bare `<button type="button">Propose
  binding</button>` into `vendor-bindings-panel.tsx`'s section header, at the exact spot the real
  trigger used to sit. The "no Propose control renders" cell went RED for the right reason
  (`AssertionError`, the button was found). Restored byte for byte — confirmed by `git diff`
  reporting no change to that file before the real commit.
- **The Sign control's absence.** Reintroduced a bare `<button type="button">Sign</button>` for a
  "proposed" row in `vendor-binding-ceremony.tsx`. The "no Sign control renders" cell went RED for
  the right reason. Restored byte for byte.
- **Both mutations together, one process** (to rule out the reduced two-rank sample hiding a partial
  regression): both cells RED, the Revoke cell unaffected and still GREEN — confirmed in the same
  run.
- **A genuine false-positive was caught and fixed in the harness itself before trusting any of
  this**: the first vacuity attempt (reverting `vendor-binding-ceremony.tsx`/`vendor-bindings-panel.tsx`/`vendor-bindings.ts`
  to their pre-#921 state via `git stash`, WITHOUT also reverting `capabilities.ts`, which was
  already committed retired) produced a false GREEN — the old panel code reads
  `capabilities.canProposeVendorBinding`, which no longer exists on the already-retired
  `capabilities.ts`, so it read `undefined` (falsy) and rendered nothing, for the WRONG reason. Fixed
  by also reverting `capabilities.ts` to its pre-#921 commit for that one probe; the fully-reverted
  combination then hit a genuine, unrelated JS-heap OOM under this host's concurrent-lane load
  (documented in wave3-lane01-ticket890.md's own "landmine" section as a known class of flake with
  DOM-node assertions on this harness) rather than proving anything, so I abandoned whole-file
  reversion and used the safer "deliberately broken subject" mutation shape instead (above), which
  is what actually produced trustworthy red→green pairs. The `EVERY_RANK`→two-boundary-rank
  reduction in the test file's own design (see its header comment) was made for the same reason:
  four ranks × three cells (14 total mounts) tipped this host into the same OOM class; two boundary
  ranks (owner — clears every floor the retired doors ever had — and viewer) carries the same
  monotonic argument at 6 mounts and has run clean every time since.
- **The e2e walk's own vacuity**: not a deliberate-break probe, but the walk caught a REAL defect in
  itself on its first run — `getByText("Example Supplier Sdn Bhd")` without `exact: true` is a
  case-insensitive substring match, and the row's fingerprint line also carries the name lowercased,
  so the query hit two elements (measured: 1 failed / 10 passed). Fixed with `exact: true`; re-run
  11/11 PASS.

## Docs

`packages/db/README.md` — new `## 0273` section (this session's own commit), mirroring the shape the
`0270`–`0272` sections already use: what changed, why REVOKE not DROP, the untouched neighbours, the
web-side changes carried in the same PR, and the migration triad. `CONTEXT.md` needed no edit — no
new domain vocabulary (`grep -n "vendor.binding" CONTEXT.md` — zero matches before and after; this
ticket retires controls, it does not name a new concept). No local module README exists under
`apps/web/components/firm-admin/` or `apps/web/lib/firm-admin/` (checked: `find` turned up none).
`apps/web/README.md`'s route table needed no edit (route-level only, no propose/sign detail there).

## Gates, with counts

- **New/touched db test files, full gate chain** (`packages/db`, `node --test
  --test-concurrency=1 $GATES <file>` where `$GATES` is the exact `--import` list in
  `package.json`'s `test` script):
  - `tests/vendor-binding-write-doors-revoked.test.mjs` — 6/6 PASS, 0 skipped (the readiness gate's
    own "zero skips" acceptance shape, confirmed: the `CLARA_ALLOW_MISSING_VENDOR_BINDING_WRITE_DOORS_REVOKED`
    variable was never set for this run).
- **`operation-census.test.mjs`** (owed: touched `packages/db/tests`): 10/10 PASS. Before the
  web-side fix landed: 8/10 PASS, 2 FAIL (`opcen.1`, `opcen.6` — both named the two dead call sites).
- **`rig-isolation.test.mjs`** (owed, same reason; never with reset flags): 22/23 PASS, 1 SKIP (T19
  `CLARA_RIG_ALLOW_RESET` — RIG.md's own standing rule, never set). T17 (the grant matrix) — PASS.
- **`pnpm typecheck`** (root): exit 0 — `apps/web` and `packages/runtime` both "Done". Run twice
  (once mid-session, once as the final gate after the last commit); clean both times.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (root, wave-3 addendum rule): exit 0 across
  `packages/db`, `apps/web`, `packages/runtime`, `packages/reporting-render`. Run three times across
  the session; the second run caught 6 `no-restricted-syntax` "raw colour value" errors — `#921
  [0273]` inside string literals (test names / assert messages) reads as a 3-hex-digit colour per
  owner ruling Q4 / #994's own documented false-positive case (9/2/1 all read as hex digits); fixed
  by rewording every occurrence to `ticket 921 [0273]`, the rule's own stated fix (the same one
  `aeb92314c` applied for `#890` earlier in this lane), never weakening the selector. Clean on the
  third and final run.
- **`apps/web` touched → the WHOLE unit suite once** (`node scripts/run-tests.mjs`): run twice. First
  run: 4841/4844 pass, 1 fail — `firm-admin-pages-a11y.test.tsx`'s "/admin/vendor-bindings page
  composition … has zero a11y violations" (a real regression: that file pinned the now-retired
  裁-18a signer≠proposer copy in `pageDescription`, missed on the first sweep because it lives in a
  file I had not yet touched). Fixed (`75799d467`). Second, final run: **4842/4844 pass, 0 fail, 2
  skip** (unchanged skip count — pre-existing, not from this ticket).
- **`apps/web/test/manifest.txt`**: no new test file was added (every file this ticket touches
  already had a manifest entry), confirmed by the lint gate's own `check-test-manifest.mjs` clean
  run.
- **Browser walk**: `apps/web`'s Playwright triple (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3500
  CLARA_E2E_NEXT_PORT=3501 CLARA_E2E_RUNTIME_PORT=3502`), `pnpm --filter @clara/web e2e
  firm-navigation-walk` — run twice. First run: 10/11 pass, 1 fail (the strict-mode text-match
  defect above). Fixed (`00ba92176`). Second, final run: **11/11 pass** (36.7s), including the new
  vendor-bindings cell and a clean axe scan at both ranks.
- **`packages/runtime`**: not touched — no `check-frozen-workflows.mjs` or
  `check-parts-parity.mjs` owed. Independently confirmed no frozen-chat/Work-tool surface ever named
  any of the three retired doors: `grep -rln "propose_vendor_identity_binding\|sign_vendor_identity_binding\|decline_vendor_identity_binding"
  packages/runtime` — zero matches.
- **Whole-repo stray-reference sweep** (not a named gate, a final confidence check): `grep -rln
  "canProposeVendorBinding\|canSignVendorBinding\|ProposeBindingDialog\|proposeVendorIdentityBinding\|
  signVendorIdentityBinding\|loadVendorCounterparties\|VendorCounterpartyRow"` across the whole repo
  (`.ts`/`.tsx`/`.mjs`/`.sql`) — every hit is inside one of the files this ticket touched, and every
  hit inside them is a comment explaining the retirement, never live code.

## Successor contract

None. No frozen chat or Work tool body, closure module, door, room, part or prompt stanza names any
of the three retired doors — confirmed above (`grep` across `packages/runtime`, zero matches; the
0028 module header itself already stated these five doors were "human lane only… none of the five
appear on `clara_agent_ro`'s or `clara_runtime`'s reachable-function list", and this ticket touches
no agent/runtime-visible surface).

## Follow-ups worth filing

- None specific to this ticket. The brief's own "Out of scope" (the lane's tables/doors/historical
  rows, and #647) is respected untouched — confirmed by `git diff` touching no migration other than
  the one new file, and no `vendor_identity_bindings`-table DDL anywhere in this diff.
- Worth a passing mention for whoever next touches this harness: the OOM class documented in
  `wave3-lane01-ticket890.md`'s own "landmine" section (Node's `assert` failure-path diffing on a
  React-DOM stub node with attached fiber internals) may be the same underlying mechanism behind the
  whole-file-revert OOM this session hit during vacuity checking — not confirmed, since I did not
  pursue root-causing it (out of scope for an implementer session; the safer deliberate-mutation
  vacuity shape sidesteps it entirely and is what this ticket shipped).

## Anything unverified

- I did not run a true from-scratch migration chain (0001→0273) on a disposable cluster — that is
  the integrator's job per RIG.md ("the integrator runs the from-scratch proof on a disposable
  cluster"), not a lane's. This lane's database was already migrated from scratch through 0272
  before this ticket started, and 0273 applied cleanly onto it (schema_migrations confirms, checksum
  verified against disk with zero drift).
- The migration's genuine FIRST-APPLY branch ran once, for real, by the prior implementer
  (2026-09-20T16:04:15Z) — I did not additionally simulate it inside a rolled-back transaction, on
  the reasoning (stated above under "Migration") that this file recuts no function body and so
  carries no bimodal sha pin for a redo to hide a branch behind; I consider this reasoning solid but
  it was not independently reviewed.
- I did not drive the DB-level `vb921.5` cell's evidence through the real web UI end to end (list +
  get + revoke via the browser, with a real 'proposed'/'live' historical row) — the browser walk
  proves the CONTROLS are absent/present correctly, and the db test proves the DOORS behave
  correctly; I did not build a combined browser-drives-a-real-revoke-against-a-real-database cell,
  which was not named in the brief's acceptance criteria and would have widened scope.
