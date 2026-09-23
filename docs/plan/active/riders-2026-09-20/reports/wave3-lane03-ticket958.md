# Wave 3, Lane 03, Ticket #958 — cash is book cash; the tie-out's GL balance is never called cash

Branch `riders/w3-lane03`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, base
`ffe63a0dd084e99b84c1368119845be273c421ce`. This is the first ticket to land commits on this
branch/lane database (`git log <base>..HEAD` was empty at start).

Commit: `c8da2a830` — `docs(context): #958 name the bank tie-out's GL balance, forbid a cash label`.

## Status: done

The ticket was **still live** on this branch: the newest Agent Brief and the owner's ruling
comment (both dated 2026-09-20, both on the issue body/its one comment) confirmed Option A. Checked
on the branch before building — matches what the ruling itself already verified on `main`: the
reconciliation surface already labels the tie-out figure "GL balance"
(`components/bank/reconciliation-section.tsx:154`, key `ClientBank.reconciliation.glBalance`), and
the client home cash tile already says "Book cash" (`ClientFinancial.cash.heading`). Nothing was
broken; this ticket writes the rule down and adds the repeatable check the brief asked for.

## The seams (written down before testing, per work order rule 4)

The brief names exactly two public interfaces:
1. **The vocabulary** — `CONTEXT.md`'s own glossary entries (a companion to "Book cash").
2. **A census-style check in the repeatable suite** — over "the surfaces and message copy that can
   render either figure."

No database door, no runtime part, no UI behaviour is in scope (brief's own "Out of scope": no
recut of the tie-out, no change to #675/#668, no blueprint edit, no migration). So the only testable
seam is (2): a new, standalone check, asserting against the real source tree and the real message
catalog. There is no existing production code to drive through a door — the "production code" IS
the check itself, which is why the vertical slice here is: write a failing fixture assertion for the
census logic → implement the minimal logic to turn it green → repeat for each behaviour the census
must have, and separately prove the whole check against the real, once-broken subject (work order
rule 4's vacuity control for a ticket whose deliverable is itself a check).

## Acceptance criteria, each with its evidence

- [x] **The vocabulary names the tie-out's ledger-derived balance, defines it, states it is never
  labelled cash on a human-facing surface, and leaves the Book cash definition otherwise
  unchanged.**
  Evidence: `CONTEXT.md`, new entry "Tie-out GL balance / 核对总账余额" inserted immediately after
  the existing "Book cash" entry, under a `<!-- #958 -->` marker (house convention). The "Book cash"
  entry's own text is byte-identical to before (`git diff CONTEXT.md` shows only an insertion, no
  deletion in that entry). The new entry:
  - defines the figure precisely, grounded in the DB source I read before writing it down (not
    guessed): `packages/db/migrations/0038_wave_c_b_bank.sql:7942` (`list_bank_statements`'s
    `gl_balance_cents` = `sum(jl.debit_cents - jl.credit_cents)` over approved journal lines on
    THAT bank account's own `coa_account_code`, `posting_date <= period_end`) and
    `packages/db/migrations/0040_wave_c_c_tieout.sql` (`get_bank_reconciliation`'s `gl_prime_cents`,
    the same shape net of the opening-anchor set);
  - states its relation to book cash (ledger-derived like book cash, but scoped to one account
    rather than the published cash account set, and never governed by a human membership);
  - states, in the Avoid line, that it is never labelled cash on any human-facing surface, and
    separately disambiguates it from the unrelated `gl_balance` opening-item kind (I found this
    second, pre-existing "GL balance" label on the Opening Register — `components/registers/
    opening-item-fields.tsx`, `messages/en.json` `kindLabels.gl_balance`/`itemFields.kinds.
    gl_balance` — which is a different concept, a generic onboarding item kind, not this ticket's
    figure; naming this in the Avoid line prevents a future reader conflating the two).

- [x] **A check in the repeatable suite fails when a surface renders that balance under a cash
  label, and passes on the tree as it stands.**
  Evidence: `apps/web/tests/gl-balance-cash-label-census.test.ts`, run standalone:
  `node --import ./test/bootstrap.mjs --import tsx --test tests/gl-balance-cash-label-census.test.ts`
  → **7/7 pass, 0 fail** (main census + 6 fix-round regression cells). See "Gates" below for the
  full command and counts, and "Vacuity control" for the once-broken-subject proof.

- [x] **The reconciliation surface still shows the figure under its GL balance label; this ruling
  hides nothing from a person.**
  Evidence: `components/bank/reconciliation-section.tsx` is untouched in the final commit
  (`git diff <base>..HEAD -- apps/web/components/bank/reconciliation-section.tsx` is empty). I did
  edit it ONCE, transiently, to prove the census is non-vacuous (see below), then restored it with
  `git checkout --` and reconfirmed `git status` was clean before committing anything.

- [x] **No behaviour change in bank matching, tie-out computation, reconciliation or the client
  financial pack, and their batteries pass unchanged.**
  Evidence: no file under `apps/web/lib/bank`, `apps/web/components/bank`,
  `apps/web/components/firm/client-home` (the money band / cash tile) or `packages/db/migrations`
  is touched by this commit (`git diff <base>..HEAD --stat` lists only `CONTEXT.md`,
  `apps/web/README.md`, `apps/web/test/manifest.txt` and the one new test file). Their own test
  batteries ran, unchanged, inside the full `node scripts/run-tests.mjs` pass (4851/4853, 0 fail —
  see Gates); spot-checked two representative names inside that run's own TAP output:
  `ok 2144 - toBankLineMatchingContext · a null answer stays null …` and
  `ok 2171 - getBankReconciliation: posts p_statement to /rpc/get_bank_reconciliation`.

- [x] **Nothing here changes which accounts count as cash; that stays the firm's published set.**
  Evidence: no code path that reads or writes `clara.publish_client_cash_account_set` or the cash
  account set is touched. `CONTEXT.md`'s "Cash account set" entry is byte-identical to before.

## Migration

**None.** Per the brief's own "Out of scope" and per the ticket's own pre-assigned expectation
("This ticket is expected to need NO migration"), confirmed: no schema or function change was
needed, and none was written. No prestate pins to record.

## Docs

- `CONTEXT.md` — new "Tie-out GL balance / 核对总账余额" entry (above).
- `apps/web/README.md` — new `## #958` section at the end of the file (matching the house pattern
  the file already uses for `#1005`, `#956`, `#981`, etc.): states the ruling, what was already true
  on the tree before this ticket, and documents the census's own known limitation (inline-JSX only;
  a value read into a local variable first and rendered elsewhere would not be traced across that
  boundary — a real scope limit, not a silently hidden gap).
- `apps/web/test/manifest.txt` — added `tests/gl-balance-cash-label-census.test.ts` at its sorted
  position (between `tests/focusRailSubscription.test.mjs` and `tests/holding-state.test.ts`,
  verified against the manifest's own plain-string-compare rule).

## The census: how it works, and why it is not vacuous

`apps/web/tests/gl-balance-cash-label-census.test.ts` walks every `.ts`/`.tsx` file under `app/` and
`components/` (test files excluded), in the same style as the existing
`tests/select-value-label-census.test.ts` (#1005) precedent. At each AST occurrence of a
`.gl_balance_cents` or `.gl_prime_cents` property/element access — the two field-name spellings the
bank tie-out's ledger-derived balance travels the wire under (`lib/bank/types.ts`'s
`BankStatementTie`, `lib/bank/recon-types.ts`'s `ReconTermSet.gl_prime_cents`) — it:

1. Finds the nearest enclosing `JsxElement` (the "value element", e.g. a `<dd>`).
2. Finds that element's nearest PRECEDING element sibling within the same JSX parent (the "label
   element", e.g. a `<dt>`), skipping whitespace-only JSX text and comment-only expression
   containers.
3. Resolves the label element's rendered text: a JSX text literal, a string literal, or a
   `t("KEY")`/`tc("KEY")` call traced to its `useTranslations(NAMESPACE)` declaration (lexically
   scoped by threading the scope map through block statements in source order) and looked up in the
   REAL `messages/en.json` catalog.
4. Fails if that text matches `/\bcash\b/i` (a **cash-label** violation — covers both a hardcoded
   JSX label and a message-copy violation, since the resolved text comes from the real catalog), or
   if the label cannot be statically resolved at all (an **unresolved-label** violation — fails
   closed rather than assuming an opaque label is safe).
5. A render site with NO preceding label element is out of this census's scope (nothing to mislabel
   it with) and is not a violation.

**Non-vacuous, twice over:**
- The main test asserts `totalSites >= 1` after the full scan — it found exactly the one known site
  (`reconciliation-section.tsx:154`) and would fail if the field-name match matched nothing.
- **Vacuity control (work order rule 4, "a ticket whose whole deliverable is a test … still needs
  the vacuity control"):** I temporarily edited the REAL subject,
  `components/bank/reconciliation-section.tsx`, changing `<dt className="text-muted-foreground">
  {t("glBalance")}</dt>` to `<dt className="text-muted-foreground">Cash</dt>`, re-ran the census, and
  it failed for exactly the right reason:
  ```
  1 bank tie-out balance render site(s) fail the cash-label rule:
    components\bank\reconciliation-section.tsx:154 [cash-label] — a "Cash" label precedes a
    rendered gl_prime_cents — the bank tie-out's own ledger-derived balance may never be labelled
    cash (owner ruling #958); it stays a term of the reconciliation under its own label
  ```
  I then restored the file with `git checkout -- apps/web/components/bank/reconciliation-section.tsx`
  and confirmed `git status`/`git diff` showed the file byte-identical to before (clean tree) before
  re-running the census green and before committing anything.

**Six fixture regression cells** (synthetic, never-read-from-disk source strings, mirroring
`select-value-label-census.test.ts`'s own `zz-fixture-…-never-read-from-disk.tsx` pattern) prove
each behaviour independently:
- a literal `Cash` JSX label → `cash-label`;
- a `t()` call resolved through the REAL `messages/en.json` to `ClientFinancial.cashSet.
  chooseAccounts` = "Choose cash accounts" (a genuine existing key, reused next to the figure) →
  `cash-label`, proving the MESSAGE-COPY path, not just the source-literal path;
- the real reconciliation surface's own `t("glBalance")` → "GL balance" → no violation (proves no
  false positive on the tree as it stands);
- an unresolvable dynamic label (`{someHelper(kind)}`) → `unresolved-label` (fail-closed);
- a render site with no adjacent label at all → no violation (documented out-of-scope case);
- a bare fixture with a real label → `sites === 1` (non-vacuous field-match sanity check).

(While building fixture #2 I first guessed the wrong i18n namespace — `ClientBank.cashSet` instead
of the real `ClientFinancial.cashSet` — and the test correctly went red with `unresolved-label`
instead of `cash-label`, which is itself a small proof the fail-closed path works; I found the
correct namespace by reading `messages/en.json` directly, fixed the fixture, and it went green for
the right reason.)

## Known, documented limitation

The census only sees the balance rendered INLINE inside JSX (an `.gl_balance_cents`/`.gl_prime_cents`
access whose direct ancestor chain reaches a `JsxElement`). A future surface that reads the field
into a local variable first (`const bal = ctx.tie.gl_balance_cents;`) and renders that variable
elsewhere would not be traced across that boundary. This is stated in the test file's own header
comment and in `apps/web/README.md`'s new `## #958` section — not a silently hidden gap. Today's one
call site renders the value inline, so the check is a real, non-vacuous proof of the tree as it
stands, not a proof for all future shapes.

## Gates, with counts

- **This ticket's own test file**, standalone:
  `node --import ./test/bootstrap.mjs --import tsx --test tests/gl-balance-cash-label-census.test.ts`
  from `apps/web` → **7 tests, 7 pass, 0 fail** (1 main census + 6 fix-round regression cells).
  Plus the one-time deliberate-break proof above (not counted in the 7 — a manual, reverted run).
- **`pnpm typecheck`** from the worktree root → clean (`apps/web typecheck: Done`,
  `packages/runtime typecheck: Done`).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** from the worktree root (wave-3 addendum: run lint as
  the Linux runner sees it) → exit 0, clean across `apps/web`, `packages/runtime`, `packages/db`,
  `packages/reporting-render`. Includes `check-test-manifest` (503 files, alphabetical, matches disk
  — my new file counted) and `check-message-keys` (4311 static `t()` keys, all resolve — my new
  file's fixtures use only real, resolvable keys or synthetic component code, neither of which
  `check-message-keys` scans since it targets real component `t()` call sites, not test fixtures).
- **Whole `apps/web` unit suite once** (`node scripts/run-tests.mjs` from `apps/web`, since this
  ticket touches `apps/web`) → **4853 tests, 4851 pass, 0 fail, 2 skipped** (both pre-existing,
  documented Windows-only skips per `RIG.md`, not introduced by this ticket — no test file I touched
  is among the four named Windows-only reds).
- **No `packages/db/tests` gate chain** — no SQL/db file touched, no migration written.
- **No `packages/runtime` gate chain** — no runtime file touched.
- **No browser walk** — no `apps/web/e2e` spec touched, and no rendered-component behaviour changed
  (the one file I touched, `reconciliation-section.tsx`, was edited and then reverted; the committed
  diff never includes it).

## Successor contract

None. This ticket adds no door, no part and no prompt stanza a frozen chat or Work tool would need;
it is a vocabulary entry plus a lint-style repeatable check.

## Follow-ups worth filing

- The census's own documented limitation (inline-JSX-only tracing) could be widened to follow a
  local variable's flow from the target field into a later JSX render, if a future surface actually
  needs that shape. Not needed today — filing this only so the limitation has a home if it ever
  bites, per the report format's own ask for follow-ups worth filing, not because current behaviour
  requires it.
- The pre-existing "GL balance" label on the Opening Register (`gl_balance` item kind,
  `components/registers/opening-item-fields.tsx`) is a same-two-words, different-concept collision
  with this ticket's new CONTEXT.md term. I disambiguated it in the Avoid line rather than renaming
  either (out of scope for #958 — the Opening Register's kind label is #660-era, unrelated, and
  renaming it was not asked for), but a future glossary pass could consider a less overlapping label
  for one of the two if the collision ever confuses a reader in practice.

## Anything unverified

- I did not verify hosted hosted/production behaviour (no hosted release is in scope for this
  ticket or this wave-3 lane run); everything above is verified against the lane's own worktree and
  database only, as the rig prescribes.
- I did not exhaustively search `packages/reporting-render` or any PDF/export code for a rendering
  of `gl_balance_cents`/`gl_prime_cents`, beyond the repo-wide grep in the "Context/grounding" pass
  (27 files matched `gl_balance_cents` repo-wide; all non-web matches were the DB migrations that
  define the function, DB/e2e test/mock files, or reports docs — none in `packages/reporting-render`
  or any export path). Stated as checked, not unverified, but noting the method: a repo-wide
  case-sensitive grep for the literal field name, not a semantic trace through every possible
  reporting pipeline.
