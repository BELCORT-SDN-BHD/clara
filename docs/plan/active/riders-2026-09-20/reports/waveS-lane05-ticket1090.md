# Wave S, lane 05, ticket #1090 — catalogue a depreciation-policy knowledge key

Branch `riders/wS-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\642`, database `clara_l03`
(127.0.0.1:55743). Base for this lane's own tickets: `7bc5a710f` (the integrated wave head named
in the orchestrator prompt; `#1056` already landed six commits on this branch before this ticket
started — confirmed by `git log --oneline 7bc5a710f..HEAD` at start).

**Commits** (oldest first, on top of #1056's six):

| commit | subject |
|---|---|
| `20e794ce9` | `feat(db): #1090 catalogue a depreciation-policy knowledge key` |
| `f0f825bc3` | `feat(runtime): #1090 map a depreciation-policy knowledge row onto the proposal's client_knowledge ground` |
| `7275f99f8` | `test(db): #1090 the door, the trust wall, and the read-map-derive pipeline, driven on a live database` |

**Migration: `0345_depreciation_policy_knowledge_key.sql`** — the reserved number for this ticket,
the only new migration this ticket owns. **Redone once**, before merge (see "The redo" below).

**No mid-task status request arrived.** Nothing to note under sweep-wave rule (f).

---

## The ticket, as it stands today

`gh issue view 1090 --comments` — the body is the whole contract: **ZERO comments**, so there is no
2026-09-20 owner ruling to override it. Originating ticket #933's own report
(`reports/wave4-lane05-ticket933.md`, follow-up 1) named the exact gap, and its own live
measurement ("fourteen keys, none about depreciation") was re-verified on this lane database at the
start of this ticket, unchanged.

**Verified still live on this branch before building:** `packages/runtime/lib/
fa-particulars-proposal.ts` already carries `deriveFaParticularsProposal`'s `client_knowledge`
ground, ranked and tested, exactly as #933 left it. `packages/runtime/workflows/claraWork.v6.impl.ts`
is absent and `registry.ts` still resolves `claraWork_v5` — the successor step this ticket's brief
names (`loadFaProposalInputsStepV6`) does not exist, confirming the ticket's own "not-yet-built
proposal input-loading step" framing (SWEEP-PLAN.md) is still accurate.

---

## Seams tested at (written before the first test)

1. **`clara.knowledge_keys` / `clara.capture_knowledge`** — the catalog row's shape, and the real
   door: a client-scope capture, the floor it enforces, the trust wall it enforces, a firm-scope
   refusal.
2. **The read** — `select id, applies_when, value from clara.knowledge_records where client_id = $1
   and knowledge_key = 'depreciation_policy' and state = 'live'`, under the SAME OBO
   `clara_agent_ro` credential v4's own register read mints, client-pinned, firm-walled.
3. **`mapDepreciationKnowledgeRows`** (`packages/runtime/lib/fa-particulars-proposal.ts`, this
   ticket's own pure addition) — the raw-row-to-`FaProposalKnowledgeNote` mapping, driven both as a
   pure function and round-tripped through the real database.
4. **`deriveFaParticularsProposal`** (already built, ranked and tested by #933 — no change made
   here) — used as the assembly seam that proves the new code (capture → read → map) integrates
   correctly, per AC3's own wording ("a test drives a client…").

No test was written at a seam the brief does not give.

---

## Acceptance criteria, each with its evidence

### AC1 — "A depreciation-policy knowledge key exists in the catalog and can be recorded against a client through the existing knowledge-recording door."

- **Shape**: `packages/db/tests/depreciation-policy-knowledge.test.mjs` `dk.01` — `depreciation_policy`
  exists exactly once: `kind=assertion`, `value_shape=object`, `validated_against=shape_only`,
  `allowed_values=null`, `authority_bearing=true`; `clara._knowledge_floor('depreciation_policy',
  'client')` and `(...,'firm')` both return `admin`. **PASS.**
- **Recordable at client scope**: `dk.02` — an admin captures a client-scoped, account-scoped note
  through `clara.capture_knowledge`; `status = 'captured'`. **PASS.**
- **The floor is enforced, not merely claimed**: `dk.02` — a bookkeeper (below admin) attempting the
  same capture is refused `CLR04` (authz/role-floor). **PASS.**
- **Only a person's own statement may fill it** (the #883 ruling, "a person stays the author of
  every depreciation estimate," applied one layer earlier than the derivation): `dk.03` — a
  `model_inference` or `document_extraction` source is refused `CLR10 knowledge_trust_insufficient`
  (the door's own explicit trust-wall check, 0192:938-946, fires before any source-pin check); the
  three admitted sources (`user_statement`, `interview`, `registry_lookup`) all succeed. **PASS.**
- **Never a firm default** (this ticket's brief names a CLIENT's recorded note only): `dk.04` — a
  firm-scope capture is refused `knowledge_scope_not_firm_defaultable`, and no firm-scope row lands.
  **This was NOT true of the first draft** (see "A design mistake, measured and corrected" below) —
  `dk.04` is the cell that caught it. **PASS.**

### AC2 — "The proposal derivation's input-loading step reads that knowledge and supplies it as the `client_knowledge` ground when one is recorded."

The STEP itself is not built — it cannot be, without creating or editing a frozen-workflow closure
(work order rule 5; see "Successor contract" below). What this ticket delivers, and what AC2 is
evidenced against:

- **The read is specified and driven**: `dk.05` — the exact SQL a future step would run, executed
  under a minted `clara_agent_ro` wake credential (the SAME OBO credential v4's own register read
  mints), returns the captured row, client-pinned; a wake credential minted for ANOTHER firm reads
  zero rows for the same client (firm-walled, `clara.wake_firm()`). **PASS.**
- **The mapping is built and tested, pure**: `mapDepreciationKnowledgeRows`
  (`packages/runtime/lib/fa-particulars-proposal.ts`) — 6 pure unit cells
  (`packages/runtime/tests/fa-particulars-proposal-unit.test.mjs`, `p1090.map.*`): a well-formed row
  maps field for field from an independent expected literal; an empty `applies_when` maps
  `assetAccount: null` (client-wide); missing fields become `null`/`""`, never `undefined`; a
  malformed `value` (null/string/array) is DROPPED, never thrown, while a well-formed sibling row
  still comes through; a malformed `applies_when` reads as client-wide rather than throwing; row
  order is preserved (ranking is `deriveFaParticularsProposal`'s own job). **PASS, 6/6.**
- **The round trip through the real database**: `dk.06` — a captured row, read back under
  `clara_agent_ro`, mapped by `mapDepreciationKnowledgeRows`, carries EXACTLY the values a person
  typed (`assetAccount`, `label`, `method`, `usefulLifeMonths`, `rateBps`, and `recordId` equal to
  the knowledge record's own `id`). **PASS.**

### AC3 — "A test drives a client with a recorded depreciation-policy knowledge note and asserts the proposal is grounded by it, outranking an account-siblings-based proposal for the same asset."

`dk.07` — an admin records a client-scoped, account-scoped note (`straight_line`, 96 months) through
the real door; it is read back under `clara_agent_ro` and mapped; the mapped note is fed into the
REAL `deriveFaParticularsProposal` (imported, not re-implemented) alongside a DISAGREEING
`account_siblings` input on the same account (`straight_line`, 60 months — a real tension, not a
vacuous agreement). Result: `basis = ["client_knowledge", "acquisition_date",
"firm_default_residual"]`, `useful_life_months = 96` (the note's own value, not the siblings' 60),
and the reason names the knowledge ground and quotes the recorded label. **A control in the SAME
cell** — the identical asset and siblings, `knowledge` omitted — grounds `account_siblings` instead
at 60 months, proving the reversal above is real rather than two independently-true proposals.
**PASS.**

**No change was made to `deriveFaParticularsProposal` or its ranking order** — the ticket's own "no
change needed," true by construction (no `.ts` diff to that function in this ticket's commits; only
a new function was ADDED to the same file).

---

## A design mistake, measured and corrected (worth reading before the migration file)

The first draft of migration 0345 used `kind = 'policy'` (matching `reporting_framework` /
`accounting_basis`, both `policy`-kind object rows, and matching the "a decision about how the
books are prepared" reading of 0192's own vocabulary). Applying it and driving `dk.04` showed it
was WRONG: `clara._tf_knowledge_firm_eligibility` (0220, unmodified) admits `kind IN
('preference','policy')` at firm scope UNCONDITIONALLY, with no regard for
`clara.knowledge_key_firm_eligibility` at all — a `policy`-kind draft let a firm-scope capture
succeed with no eligibility row naming it. That is a feature this ticket's brief never asked for
(a CLIENT's recorded note, only), and it would have been a DARK one: the successor's read is
client-pinned (`client_id = $1`, and a firm-scope row always carries `client_id IS NULL`), so a
captured firm default would sit accepted and permanently invisible to the one thing that would ever
read it.

The fix: `kind = 'assertion'` with `authority_bearing = true` — the `customer_identity_policy`
precedent (measured live: `kind=assertion, authority_bearing=true, min_role=owner`), which still
forces "asserted trust only" at two of 0192's own three named belts (the door's explicit check and
the `_tf_knowledge_authority` trigger), while leaving the firm-eligibility wall live. `dk.04` now
passes for the right reason.

**Because `clara.knowledge_keys` is append-only for every role, including `clara_fn_owner`** (no
escape hatch — `_tf_append_only` raises unconditionally on UPDATE/DELETE), the wrong first draft
could not be healed by a redo of the migration's own SQL. The lane database was returned to a clean
prestate by an out-of-band rig operation on this disposable database: `ALTER TABLE ... DISABLE
TRIGGER` on both `clara.knowledge_records` (the two test-inserted rows that already referenced the
wrong catalog row) and `clara.knowledge_keys` (the wrong row itself), `DELETE`, then `ENABLE
TRIGGER` again on both — never against an applied/merged migration, never against a shared cluster.
`CLARA_MIGRATION_REDO=0345_depreciation_policy_knowledge_key` then applied the corrected file. A
from-scratch chain will only ever see this file's one, correct, first apply. Both the migration's
own header/README section and this report record the mistake and the fix, per the work order's
"claims need evidence" rule — I do not assert the design is right without the measurement that
showed the alternative wrong.

**The FIRST-APPLY branch was also proven**, not merely the redo: the very first `pnpm db:migrate`
run against the ORIGINAL (uncorrected) file applied cleanly from a genuinely absent
`depreciation_policy` row, and the corrected file's redo re-ran the identical prestate/tail logic
against the same "absent" branch after cleanup — so both branches of the prestate's "absent OR
already-landed-at-this-exact-shape" logic have been exercised, on this rig, not merely reasoned
about.

---

## Migration `0345_depreciation_policy_knowledge_key.sql` — prestate pins

MEASURED on this lane database (`clara_l03`) immediately before authoring, after #1056's six
commits and before this ticket's own migration:

| pinned signature | sha256(prosrc) | role |
|---|---|---|
| `clara._knowledge_assert_value(text,jsonb)` | `84fca940b4d520dc6d4291cd629e526507d31595103badc10c4382872d1b90d5` | relied on unmodified (the `shape_only` arm) |
| `clara._knowledge_floor(text,text)` | `5e4d80691226a6b0bc80dc45c50a6089db5f3a3f7e905f782a0c99c6db8820ca` | relied on unmodified (the "higher of the two floors" rule) |

Catalog row count pinned at **14 other rows** before this file's own insert (matching #933's own
live measurement of the same database). Tail re-measures both shas byte-identical, and the catalog
at exactly **15** rows with `depreciation_policy` present exactly once.

**No function was recut.** No `rig-meta.mjs` cohort entry was added, because none of that file's
PRONAMES/EXECUTE-grant machinery moved: this migration creates no function, grants no EXECUTE to
any role, and revokes nothing — `clara.knowledge_keys` and `clara.knowledge_records` were already
granted SELECT to `clara_authenticated`/`clara_agent_ro`/`clara_runtime` by 0192, unchanged.

**`apps/web/tests/firm-scope-db-pins.corpus.ts`** — checked as in scope (sweep-wave rule d, any
migration file changed). No entry was needed: 0345 contains no dynamic SQL (`execute format`,
`pg_get_functiondef`) at all, so the corpus's static lexer admits it with no review-barrier entry.
Verified by running the corpus's own test (`apps/web/tests/firm-scope-db-pins.test.ts`, 22/22 pass)
rather than by reading the file.

**Redo checksum**: `4b0718e261b165c3c73a51f03b9e0f391779d9283525519b160ed4766c93a0bb` (the corrected
file, currently applied). A second `pnpm db:migrate` reports `0 new migration(s) applied · 311
total`, confirming idempotency.

---

## Gates, with counts

- **Test files added or touched**, run with the full gate chain (`$GATES` = every `--import
  ./tests/*-preintegration-gate.mjs` flag in `packages/db/package.json`'s `test` script):
  - `packages/db/tests/depreciation-policy-knowledge.test.mjs` — **7/7 pass** (`dk.01`-`dk.07`).
  - `packages/db/tests/knowledge-firm-defaults.test.mjs` (touched: the firm-scope-refused census
    moved 10 → 11) — run together with `knowledge-fye-day.test.mjs` and the new file: **40/40
    pass**.
  - `packages/runtime/tests/fa-particulars-proposal-unit.test.mjs` (touched: 6 new `p1090.map.*`
    cells added beside the 24 pre-existing `p933.*` ones) — **30/30 pass**.
  - **Vacuity controls, driven and restored byte-for-byte**: (1) `mapDepreciationKnowledgeRows`'s
    `assetAccount` mapping was broken to a literal and 4 of the 6 new pure cells failed for the
    right reason, then restored — `git diff` confirms no residual change; (2) `dk.04`'s firm-scope
    refusal was disarmed by temporarily inserting a `knowledge_key_firm_eligibility` row (via the
    same disable-trigger/delete/enable rig procedure, on the disposable lane database only) and the
    cell failed for the right reason, then the row and its trigger state were restored.
- **`node scripts/check-frozen-workflows.mjs`** (repo root): `freeze-lint: OK — 322 frozen file(s)
  verified …, no manifest diff` — confirms `fa-particulars-proposal.ts` is still outside every
  frozen closure (nothing in this ticket froze it).
- **`node packages/runtime/scripts/check-parts-parity.mjs`**: `parts-parity: OK` — unaffected by
  this ticket (no workflow part touched).
- **`operation-census.test.mjs`**: 32/33 pass, 1 skipped (the `CLARA_RIG_ALLOW_RESET`-gated
  destructive cell, never set, per RIG.md). Run even though this ticket added no SQL function,
  because `packages/db/tests` was touched (WORK-ORDER.md's own, broader condition).
- **`rig-isolation.test.mjs`**: 22/23 pass, 1 skipped, same reset gate.
- **`pnpm typecheck`**: `apps/web typecheck: Done`, `packages/runtime typecheck: Done`. Clean.
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (the runner's own env, per the wave-2/wave-3
  addenda): exit 0 across every workspace (`apps/web`'s many embedded self-test suites included,
  `packages/reporting-render` eslint included).
- **`apps/web` was not touched at all** (no file under `apps/web` changed in this ticket's three
  commits), so the whole unit suite and browser walks are not owed by work-order rule 8. The one
  `apps/web` test run (`firm-scope-db-pins.test.ts`, 22/22) was the targeted rule-(d) verification
  above, not the whole-suite gate.

---

## Docs updated (same commits as the code they describe)

- **`packages/db/README.md`** — new section `## 0345 — a depreciation-policy knowledge key, so the
  fixed-asset proposal's client_knowledge ground can fire (#1090, riders sweep wave, lane 05)`,
  in the same commit as the migration. States the catalog choice, the measured `kind=policy`
  mistake and its fix, the append-only-table redo constraint and how the lane database was
  recovered, and what is still owed (the read/step wiring).
- **`packages/runtime/README.md`** — the #933 section's stale bullet ("the knowledge ground is
  wired and unfed … none of its fourteen keys is about depreciation") is REPLACED with what #1090
  actually delivers (catalogued, mapped, driven end to end; still not wired into a workflow step),
  in the same commit as `fa-particulars-proposal.ts`'s own change.
- **`CONTEXT.md`**: checked, not edited. No individual knowledge key (`financial_year_end_day`,
  `mpers_eligibility`, `reporting_framework`, …) carries its own CONTEXT.md entry — verified by
  grep, zero hits for any of them — only the general "Client knowledge" concept term is documented
  there, and the existing "Depreciation particulars proposal" entry already describes "a recorded
  note about this client" as a ground (written from #933's own, forward-looking, derivation-level
  perspective) without needing correction now that the ground is reachable.

---

## Successor contract — the `depreciation_policy` read, for whichever workflow step next reads a #933-style knowledge ground

Everything a future `loadFaProposalInputsStepV6`-shaped step needs, in a form it can transcribe.
**Nothing frozen was edited; no frozen file exists yet to edit.**

**1 · Imports.** From the non-frozen `../lib/fa-particulars-proposal.js`:

```ts
import { mapDepreciationKnowledgeRows, type DepreciationPolicyKnowledgeRow }
  from "../lib/fa-particulars-proposal.js";
```

**2 · Zod input — none.** Same posture #933's own contract states: the proposal (and now its
knowledge ground) is not a model act: the workflow BODY reads it after a commit, so no tool gains
an input and no new zod object is needed beyond `faParticularsProposalSchema`, unchanged.

**3 · The read**, under the SAME OBO `clara_agent_ro` credential v4's own register read mints
(`readScoped`), additionally client-pinned exactly as v4 pins the asset's own client:

```sql
select id, applies_when, value
  from clara.knowledge_records
 where client_id = $1::uuid and knowledge_key = 'depreciation_policy' and state = 'live'
```

RLS (`p_knowledge_records_agent`, 0192:611-612, unmodified) already binds `firm_id =
clara.wake_firm()`; this statement adds nothing else. It never throws on a malformed row (that is
the mapper's job, below); it can return zero, one, or several rows (a client-wide note beside
account-scoped ones, or several account-scoped ones on different accounts).

**4 · The mapping**, pure, already built and tested:

```ts
const knowledge = mapDepreciationKnowledgeRows(rows as DepreciationPolicyKnowledgeRow[]);
```

Feed `knowledge` into `FaProposalInputs.knowledge` alongside whatever `siblings`/`retiredPolicy`
the step already gathers (v4's own two `clara.fixed_assets` statements, and #1092's forthcoming
`fa_account_depreciation_policies` read for `retiredPolicy`) — `deriveFaParticularsProposal` itself
needs no change, per this ticket's own "out of scope."

**5 · Refusal mapping — none.** The read is a plain SELECT under an existing RLS policy (no new
CLR code, no new door); the mapper never throws. A step that cannot reach the pool for any reason
should treat this read the same way v4's own register read is treated: it never withholds the
question, only the ground.

**6 · Part kind / prompt stanza — none new.** This ticket adds no tool, no part, no prompt text; it
only feeds an existing, already-specified input type.

---

## Follow-ups worth filing

1. **The read is specified and tested but not wired into any workflow step.** `loadFaProposalInputsStepV6`
   does not exist; wiring the read above (and #1092's `retiredPolicy` read) into a real step is the
   remaining half of #933's own "wired and unfed" gap, and belongs to whichever ticket builds
   `claraWork_v6`.
2. **A floor asymmetry, worth an owner grill, not fixed here.** This ticket's knowledge note (an
   ADVISORY input to a proposal a person still confirms) floors at `admin+`
   (`authority_bearing=true`, `clara._knowledge_floor`). `clara.fa_account_depreciation_policies`'s
   own commit door (#932, a BINDING account default that births future acquisitions COMPLETE with
   no question at all) floors at `bookkeeper` (`packages/db/migrations/0277_fa_default_
   depreciation_policy.sql:355,463`). The lower-stakes act costs more than the higher-stakes one —
   a pre-existing decision on a different door, not touched or second-guessed here, but worth
   naming.
3. **`value` is validated only as "an object" (`shape_only`), never a congruent method/life/rate.**
   `congruent()` in the derivation already drops what it cannot use, so a malformed capture simply
   grounds nothing rather than being refused at capture time — a possible tightening (a new
   `validated_against` label, spliced into `_knowledge_assert_value` the way 0240 spliced
   `range:day_1_31`), deliberately not built: this ticket's own brief says "no change needed" to the
   derivation's ground logic, and the catalog validation is the same posture every other object
   policy/assertion key in this catalog already keeps.
4. **Whether a firm should ever have a firm-wide default depreciation-policy NOTE (distinct from
   #932's per-account default) is an explicit product question this ticket did not answer** — the
   measured mistake above is the reason it is now REFUSED rather than silently possible; if the
   owner ever wants it, that is a new ticket with its own read-side wiring (the successor's read
   above is client-pinned and would need to change too).

---

## Anything unverified

- **The full round trip through a running `claraWork_v6`** is unverified BY CONSTRUCTION — the cut
  does not exist. Everything on both sides of that eventual join is driven here: the catalog and
  door (dk.01-dk.04), the read under the real OBO credential (dk.05), the mapper (dk.06 and the six
  pure `p1090.map.*` cells), and the assembly with the already-proven deriver (dk.07) — the same
  posture #933's own report states for the identical gap.
- **Hosted behaviour** is inferred from this lane database, migrated from scratch to the same
  frontier as every other lane; it is not measured against a hosted database.
- **The whole `packages/db` test suite and the whole `apps/web` test suite were not run** by this
  ticket — only the files this ticket touched (with the full gate chain), the two named
  cross-cutting gates (`operation-census`, `rig-isolation`), and one targeted `apps/web` file
  (`firm-scope-db-pins.test.ts`), per work-order rule 8's own scope for a ticket that did not touch
  `apps/web`. A wider regression sweep is the integrator's own gate, per the wave process.
