# Wave 2 · Lane 01 · #914 — `clara.approve_wrong_client_correction` takes the client rung before any client row

**Status: DONE.** Branch `riders/w2-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\635`, rig
`127.0.0.1:55741` / `clara_l01`. Base `23cfad947b5598214168ba9c43d391b4e16aa745` (the integrated
head of wave 1). Fourth ticket of the lane; `#1014`, `#868` and `#906` had already landed seven
commits and applied migrations `0235`–`0237` before I started (confirmed by `git status` (clean)
and `git log --oneline 23cfad94..HEAD` at start-of-turn).

```
a92e8db7e docs(db): #914 named-suite-family entry for the correction lock-order test
39aaa317d docs(db): #914 the battery that owns the door's refusals, named in the test file
9fbba342a test(db): #914 the source client is still serialised against publication
b4919449e test(db): #914 the catalogue census that says no door is left on the wrong side
d48ef3614 fix(db): #914 the correction door takes the client rung before any client row
```

(on top of `#1014`'s four, `#868`'s one and `#906`'s two, unchanged by me: `88006ff67`,
`041f85cf9`, `3dde8c179`, `d33481f41`, `48a5278ec`, `685890bae`, `521bdd33a`.)

**The ticket was still live on this branch**, measured before building rather than assumed:

- `clara.approve_wrong_client_correction`'s live `prosrc` at 237 migrations is
  `a9c0719e84f5e97a91aaa66a034fcce810d1c96d436883a0cd90471c49d8d25e`, 15 237 bytes —
  **byte-identical** to migration `0125_f_a7_alpha2_judgement_recut.sql`'s own text for that
  function (compared by extracting the `$$…$$` body from the file and sha-ing it). Nothing has
  recut the door since 0125.
- A catalogue census of the live bodies found **exactly one** door acquiring a `clara.clients` row
  before the client rung `203005004` — this one, at `row@2941` / `rung@4506` (1-based `position`),
  which is #649's round-two report's own `clients … for update @2940, rung @4505` to the character.
- `0238` was the next free migration number and is the one reserved for me.

---

## The seams I tested at (written down before the first test, work-order rule 4)

The Agent Brief's "Key interfaces" names three, and I added no seam it does not give me. They are
also written at the top of the test file.

1. **`clara.approve_wrong_client_correction(uuid,text,text,text)`** — the door itself, called as a
   human bookkeeper through `clara_authenticated` under forced multi-session schedules. The oracle
   for AC1 is the **deadlock SQLSTATE**, never a source read.
2. **The two advisory rungs** (`203005002` firm, `203005004` client) — their identifiers and the
   client each covers, observed as lock **acquisition** against an adversary in the rung-first
   order every sibling uses.
3. **The source client row lock** — still the serializer against wiki publication on the source
   client, and still held when the source filing is retired. Measured by racing the door against
   `clara.record_wiki_source_ingest` (the deterministic publication path, 0017:2228, granted to
   `clara_runtime` only), in both directions, reading the blocked side's own `pg_locks`.

Plus the **catalogue-derived census** AC2 asks for. That one is structural by nature — it is a
claim about *every* door in the estate and no dynamic schedule can make it — which is work-order
rule 4's own carve-out ("where this repo's documented standard asks for a structural cell, that
standard wins"), and I say so here as the rule requires.

---

## The vertical slices, each red for its own reason

### Slice 1 — AC1, the deadlock (commit `d48ef3614`)

**Red first, on the live pre-fix body.** `tests/correction-client-rung-order.test.mjs` was written
with ONE cell (`cr.1`) and run before `0238` existed:

```
not ok 1 - cr.1 the door no longer inverts: ...
  error: 'door lost to a DEADLOCK (40P01) -- the door still takes a clara.clients row before the
          client advisory rung 203005004, inverting against every sibling door: deadlock detected'
```

A genuine `40P01 deadlock detected` from PostgreSQL's own detector, not a contrived assertion —
and the cell reached that assertion only *after* `assert.ok(out.doorBlocked)` passed, so the
schedule provably interleaved (`pg_blocking_pids` showed the door queued behind the adversary's
rung) rather than the two transactions simply missing each other.

**The schedule**, driven in three steps so it is forced rather than hoped for:

1. the adversary takes `pg_advisory_xact_lock(203005004, hashtext(source_client))` and holds it —
   the first half of the rung-first order `set_client_fy_end` and `settle_client_onboarding_facts`
   both use;
2. the door fires and blocks on that rung (proved with `pg_blocking_pids`);
3. the adversary completes its own order by taking the same `clara.clients` row `for update`.

Pre-fix the door already held the client row at step 2, so step 3 closes a cycle. Post-fix the
door holds no client row when it blocks, step 3 is uncontended, the adversary commits and the door
runs to its receipt.

**Green.** `packages/db/migrations/0238_correction_client_rung_order.sql` written and applied via
the ordinary `node scripts/migrate.mjs` path; the same cell: **1 pass / 0 fail**. Then the gate
ceremony (preintegration gate module, the frontier premise gate in the test file, the
`package.json` chain entry) and a re-run with the full chain preloaded: still green.

### Slice 2 — AC2, the census (commit `b4919449e`)

`cr.2` and `cr.3` added. `cr.2` reads every `clara` body out of `pg_proc`, strips SQL comments,
splits into statements with **parenthesis-depth tracking**, and compares the first `clara.clients`
ROW acquisition (a locking select on it, or an `update`/`delete` of it) against the first client
rung. Depth tracking is what keeps two regex false positives out of the answer — the ones #649's
own census had to inspect by hand:

- `reconcile_sweep_runs`: `clara.clients` appears inside a CTE of a statement whose
  `for update skip locked` belongs to `clara.sweep_runs`;
- `settle_client_onboarding_facts`: a *comment* block describing the ladder contains both
  `clara.clients` and the words `FOR UPDATE`.

It is deliberately a **second derivation**, not the PostgreSQL-regex census `0238`'s own tail
runs. Both were measured before the migration was written and agreed: **11 bodies** acquire a
`clara.clients` row, **1** of them took it before the rung.

`cr.3` states the positive half: the door is still *in* that census (0238 moved the lock, it did
not remove it — removing it would drop the 0019 §1 serializer), its rung precedes its row, the
client rung is acquired exactly once on `x.from_client`, never on `o.client_id`, and the firm rung
is still taken exactly once.

**Vacuity control** (work-order rule 4, and the only honest way to red a cell written after its
fix): 0125's body spliced back by hand as `clara_fn_owner` → **all three cells red, each for its
own reason** (`cr.1` on a genuine 40P01; `cr.2` naming `approve_wrong_client_correction`; `cr.3` on
`rung@6333` after `row@4121`). Restored with the `#957` redo mode
(`CLARA_MIGRATION_REDO=0238_correction_client_rung_order`), whose prestate took its "first apply"
branch and whose tail passed; **3/3 green** after.

### Slice 3 — AC3, the publication serializer (commit `9fbba342a`)

`cr.4` and `cr.5` added. **This one needed care, and the first version of it was wrong.**

The correction's own inserts carry foreign keys to `clara.clients`, so a publication racing it
blocks on the source client's row *even when 0019 §1's deliberate `clara.clients … for update` is
gone*. A cell that only proved "it blocks" would pass against a door with no serializer at all — I
measured that, it is not a supposition: with the `for update` deleted (one word, nothing else) the
naive cell stayed green.

`cr.4` therefore does three things a plain block does not:

- it publishes a **second document filed to the same source client**, with no entry on it and no
  part in the correction, so the only object it shares with the door is that client (the door also
  locks `clara.documents`, and a publication citing the *same* document would queue there instead,
  proving nothing about the client);
- in the door-first leg it reads the **blocked publisher's own `pg_locks`** and requires a
  `clara.clients` lock among them;
- in the publication-first leg it reads the **blocked door's lock modes on
  `clara.journal_entries`**: with the serializer in place the door is stopped *before* its item
  loop writes anything (`RowShareLock` from `for update of je`, and no `RowExclusiveLock`); without
  it, the reversal mirror is already inserted and the `RowExclusiveLock` is held.

`cr.5` pins the same fact structurally — the client-row **acquisition** (using the census helper,
so an unlocked read of `clara.clients` does not satisfy it) precedes the
`update clara.document_filings set retired_at=now()` statement; a row lock is held to commit, so
that source order *is* what "retires the source filing under that lock" means.

**Vacuity control:** with the `for update` removed and spliced in as `clara_fn_owner`, `cr.2`,
`cr.3`, `cr.4` and `cr.5` all go red — `cr.4` on the measured
`[{"mode":"AccessShareLock"},{"mode":"RowExclusiveLock"},{"mode":"RowShareLock"}]`. Restored,
**5/5 green**. Note for the record: `0238`'s prestate **refused** to redo over that hand-broken
body ("neither its 0125 body nor #914's own (sha d48db30b…) — a third party recut it"), which is
the guard working; the body was put back by hand first and the file then redone (#957), tail green.

### Slice 4 — AC4, the refusal battery (commits `39aaa317d`, `a92e8db7e`)

No new cells: `0238` reorders two lock acquisitions and changes nothing else, so the refusals are
proved by the suites that already own them, re-run against the recut body, plus `0238`'s own tail
(fifteen `raise` sites, all fifteen 0125 messages present → each exactly once). The roster is now
named in the test file's header and in `tests/README.md`.

---

## Migration

**`packages/db/migrations/0238_correction_client_rung_order.sql`** (653 lines), stable stem
`correction_client_rung_order$`, applied checksum
`0c5e8f4729a75cc8a544f45b485dd56083257f5cd414583e3a82576b8eb1aa3d`. Exactly one
`create or replace function` under `set role clara_fn_owner` / `reset role`, carrying 0125's body
with **exactly three edits** (verified by `diff -u` against the extracted 0125 text):

1. the `perform 1 from clara.journal_entries je … for update of je;` statement moves **up**, above
   the client row;
2. one `perform pg_advisory_xact_lock(203005004,hashtext(x.from_client::text));` is inserted
   between them;
3. the item loop's per-item acquisition on `o.client_id` becomes a comment saying the rung is held
   from above.

Every other character — every refusal, the reversal mirror and its adoption branch, the single
`clara._subledger_on_approve` call, `clara._book_today()`, the filing retirement and re-filing, the
coding task, the notification, the audit row, the domain events and the receipt — is 0125's,
verbatim.

### The ladder, before and after (acquisition order, measured)

| step | before | after |
|---|---|---|
| 1 | firm rung `203005002` | firm rung `203005002` |
| 2 | `filing_corrections` row `for update` | same |
| 3 | `clara.documents` row `for update` (0027 task #29) | same |
| 4 | `clara.document_filings` rows `order by id for update` | same |
| 5 | **`clara.clients` row on `x.from_client`** | `clara.journal_entries` rows `for update of je` |
| 6 | `clara.journal_entries` rows `for update of je` | **client rung `203005004` on `x.from_client`, once** |
| 7 | client rung on `o.client_id`, per item, in the reverse branch | **`clara.clients` row on `x.from_client`** |

Live offsets after apply (from the migration's own tail notice): `je@4014` → `rung@5691` →
`clients row@6262`, with `clara._subledger_allocated_items_present@8595` still after the rung, and
0027's `documents@2555 < document_filings@3492`.

### Prestate pins, MEASURED on this rig before the file was written

| fact | value | treated as |
|---|---|---|
| `clara.approve_wrong_client_correction(uuid,text,text,text)` `sha256(prosrc)` | `a9c0719e84f5e97a91aaa66a034fcce810d1c96d436883a0cd90471c49d8d25e` | 0125's body, live and unmoved at 237 migrations (0001→0237); verified byte-identical to 0125's own source text |
| …or, on a `#957` redo | `8531862ccbd2caffd5d665d6dfe92f3cd2174f30ff7a9e48c9cdb58763246188` | this file's own body (bimodal prestate, redo-tolerant) |
| owner | `clara_fn_owner` | unmoved |
| `SECURITY DEFINER` | `true` | unmoved |
| ACL | `{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}` | owner + the human role (0007:2776 / 0009); `create or replace` preserves it, and the tail re-reads it |

Four more prestate checks that are re-derivations rather than shas, each refusing to apply if it
fails: the **defect itself** (client row before rung, on a first apply); 0027's
documents-before-`document_filings` order; the 0037/0038/0042 markers (the hook exactly once, the
allocation refusal, the bank-match refusal, the adoption branch, the house legal date); and — the
structural premise of the one-acquisition rung — `t_je_provenance` present, enabled and still
asserting `f.client_id = new.client_id`, plus `ck_je_document_filing_pair` present and validated.

### Which client the rung covers, and why once is the same lock

The correction's **source** client, `x.from_client`. Every captured item is an entry selected by
`je.filing_id = <the source client's active filing>` (`clara.preview_wrong_client_correction`,
0007:2460, whose plan `propose_wrong_client_correction` stores verbatim);
`ck_je_document_filing_pair` makes `document_id` and `filing_id` null together (`convalidated`,
measured), and `t_je_provenance` — a `DEFERRABLE INITIALLY DEFERRED` constraint trigger, enabled,
measured — refuses any entry with a document whose filing's `client_id` differs from the entry's
own. So `o.client_id = x.from_client` for every item, **structurally**; and neither column can
drift afterwards, because neither appears in any allowset of `t_je_immutable` and a filing's
identity is immutable too (`_tf_document_filing_update`). Advisory xact locks are re-entrant, so
the old per-item repetition was already a no-op after the first item. (Live corroboration, not the
proof: `select count(*) from clara.journal_entries je join clara.document_filings f on f.id =
je.filing_id where f.client_id <> je.client_id` → `0`.)

### Why this does not invert against any neighbour

- **The approve core (0037 §K's one named exception).** `reverse_entry` and this door lock a
  *pre-existing* `journal_entries` row first, *because the core does*. The rung still sits after
  `for update of je`, so 0037 §H.3's body census — re-asserted live by
  `x37-wave-c-a-subledger.test.mjs`'s `ordered(…, ["for update of je",
  "pg_advisory_xact_lock(203005004", "clara._subledger_allocated_items_present("])` — still passes
  (47/47 in the run below). Hoisting the rung to the top of the body, the obvious-looking remedy,
  is exactly what that pin forbids; moving the ROW down is why this ticket needed 0037 read first.
- **`reverse_entry`** touches no `clara.clients` row at all (it is not among the eleven censused
  bodies), so the two doors still meet only on the entry row and the rung, in the same order.
- **The settle door** (`settle_client_onboarding_facts`, rung@893 → row@972) and
  **`set_client_fy_end`** (rung@1128 → row@2480) now agree with this door instead of opposing it.
- **The filing neighbours** meet it on `clara.documents` and `clara.document_filings`, neither
  moved; `retire_document_filing` also takes a client row, and takes it after `clara.documents`,
  exactly as this door still does.
- **The new pair this creates, stated rather than hoped:** the `journal_entries` row locks now
  precede the `clara.clients` row, so a door taking a client row and *then* a `journal_entries` row
  would invert. **There is none** — of the eleven bodies that acquire a `clara.clients` row, this
  is the only one that also locks a `clara.journal_entries` row (measured; the census's other
  apparent hit, `reconcile_sweep_runs`, is the CTE false positive described above).

### Gate ceremony

- Preintegration gate module: `packages/db/tests/correction-client-rung-order-preintegration-gate.mjs`
  (sets `CLARA_ALLOW_MISSING_CORRECTION_CLIENT_RUNG_ORDER=1`), registered in
  `packages/db/package.json`'s `test` script **after**
  `journal-basis-zero-total-unreachable-preintegration-gate.mjs` (0237) — the sorted
  (migration-order) position, a one-line diff on that shared file.
- Frontier gate: inline in the test file (`STEM = "correction_client_rung_order$"` against
  `clara.schema_migrations`), same shape as `subledger-hook-caller-roster.test.mjs` and
  `journal-basis-zero-total-unreachable.test.mjs`.
- **No rig-meta cohort, deliberately** — the same reason `#868` and `#906` gave: this migration
  mints no relation, no function and no grant, and `create or replace` preserves the ACL.
  `rig-meta.mjs`'s cohorts track the grant/table census, and nothing here moves either. Confirmed
  rather than assumed: `rig-isolation.test.mjs` and `operation-census.test.mjs` (both consumers of
  `rig-meta.mjs`) pass unchanged — see Gates. `packages/db/tests/rig-meta.mjs` was **not** touched,
  which is also the safest hunk on that ten-lane shared file.

---

## Acceptance criteria

**AC1 — "A cell drives two concurrent transactions in the orders that deadlocked and proves the
door no longer inverts, using the deadlock error as the oracle."** **Done.** `cr.1`, the
three-step schedule above. Red on the live pre-0238 body with a genuine `40P01 deadlock detected`
(and `doorBlocked` proven first); green after, with the door's receipt `status: "completed"` and
the adversary's own order uncontended. Both sides are asserted against `40P01` *and* `40001`.

**AC2 — "A catalogue-derived census proves no remaining door takes a client row before the client
rung."** **Done, twice, by two independent detectors.** `cr.2` (JavaScript, comment-stripping +
parenthesis-depth statement splitting) censuses 11 bodies and finds 0 violators, and pins the
eleven names so an empty violator set cannot mean "the detector stopped detecting". `0238`'s own
tail runs the same claim in PostgreSQL regexes (`regexp_instr` over a comment-stripped `prosrc`)
and refuses to commit if any door violates it or if fewer than 11 bodies are detected. Both were
measured against the pre-fix estate first and both found exactly one violator, at offsets matching
#649's round-two report.

**AC3 — "A cell proves the door still serialises against publication on the source client and
retires the source filing under that lock."** **Done.** `cr.4` (both directions, a second document
so the client is the only shared object, the blocked publisher's `pg_locks` naming
`clara.clients`, the blocked door's lock modes proving it was stopped before writing) and `cr.5`
(the acquisition precedes the retirement statement; a row lock is held to commit). After leg A the
cell re-reads the source filing and asserts `retired_at is not null` and
`correction_id = <this correction>`. `0238`'s tail asserts the same source order independently.

**AC4 — "Every existing refusal of the door is unchanged; name the battery."** **Done.** The
battery, named in the test file's header and re-run green against the recut body:
`x42-s5c-awcc`, `x37-wave-c-a-subledger`, `x38-wave-c-b-match`, `x38-wave-c-b-bank`,
`x27-filings-lock-order`, `s6-locks`, `s6-tasks`, `s6-schema`, `s6-upgrade`, `f-a7-alpha`,
`f-a7-beta-filing-verb`, `x42-r10-o3`, `x42-r9-mirror`, `x42-adj-period-double`, `x42b0-r8-tails`,
`f-a2-grants`, `subledger-hook-caller-roster`, `document-filing-conflict`. Plus the structural
half: `0238`'s tail counts **15** `raise exception` sites (0125 also had 15, measured) and requires
all fifteen 0125 messages to still be present — so a lost or added refusal fails at apply time as
well as at test time. The fifteen are `op_key is required` (CLR10), `correction not in your firm`
(CLR11), `opening entries are mutable only through the K-family` (CLR31), `correction plan/state
mismatch` (CLR12), `correction requires a distinct checker` (CLR19), `solo correction approval
requires attestation` (CLR19), `correction plan is stale (books version moved)` (CLR19), the live
bank-statement refusal (CLR10), `source filing is no longer active` (CLR19), `filing client not in
the supplied firm` (CLR11), `correction item state changed` (CLR19), `correction touches a closed
period` (CLR19), `destination client attribution is not authoritative` (CLR01), the allocated-items
refusal (CLR10) and the live bank-match refusal (CLR10). Their *order* is unchanged too: the only
statement that moved ahead of a refusal is `for update of je`, which raises nothing.

**AC5 — "Prestate pin, tail census, from-scratch apply."** **Prestate and tail: done** (above; the
apply printed both notices). **From-scratch apply: partially evidenced**, same posture as
`#1014`/`#868`/`#906`'s reports — see "Unverified".

---

## Gates, with counts

Every `packages/db` run is from `packages/db` with the FULL preintegration gate chain
(`node --test --test-concurrency=1 $GATES <files>`, `$GATES` regenerated from `package.json` after
my own gate module was registered — 54 gate modules).

| gate | result |
|---|---|
| `correction-client-rung-order.test.mjs` (added) — focused, no gate preloaded, pre-0238 | **RED: 0 pass / 1 fail** on a genuine `40P01`, the door proven blocked on the rung first |
| `correction-client-rung-order.test.mjs` — full gate chain, post-0238 | **5 pass / 0 fail / 0 skip** |
| `correction-client-rung-order.test.mjs` — vacuity control, 0125 body spliced back | **2 pass / 3 fail** (`cr.1`, `cr.2`, `cr.3` red) |
| `correction-client-rung-order.test.mjs` — vacuity control, `for update` removed | **1 pass / 4 fail** (`cr.2`–`cr.5` red) |
| `x42-s5c-awcc` + `x37-wave-c-a-subledger` + `x27-filings-lock-order` | **47 pass / 0 fail / 0 skip** |
| `s6-locks` + `s6-tasks` + `s6-upgrade` + `s6-schema` | **27 pass / 0 fail / 4 skip** — all four skips are `s6-upgrade`'s reset-gated cells (`CLARA_RIG_ALLOW_RESET`, which RIG.md forbids on this cluster) |
| `x38-wave-c-b-match` + `x38-wave-c-b-bank` + `f-a7-alpha` + `f-a7-beta-filing-verb` | **132 pass / 0 fail / 1 skip** — the skip is `f-a7`'s own named, measured `wake_file_document Tier B3 cell 2` |
| `x42-r10-o3` + `x42-r9-mirror` + `x42-adj-period-double` + `x42b0-r8-tails` + `f-a2-grants` + `subledger-hook-caller-roster` + `document-filing-conflict` | **50 pass / 0 fail / 0 skip** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs` (never with reset flags) | **32 pass / 0 fail / 1 skip** — the skip is `rig-isolation` T19 poison-role, reset-gated |
| `node scripts/migrate.mjs` (final state check) | `0 new migration(s) applied · 233 total`, checksums verified |
| `pnpm lint` (root) | **exit 0**, all workspaces |
| `pnpm typecheck` (root) | **exit 1 — RED AT BASE, not this ticket.** See below |
| `packages/runtime` `tsc --noEmit` alone | **exit 0** |

Not run, and why: **no `apps/web` unit suite and no browser walk** — this lane's diff touches no
file under `apps/web` (`git diff --name-only 23cfad94..HEAD` lists only `CONTEXT.md` and
`packages/db/**`, and `git diff --stat 23cfad94..HEAD -- apps/web` is empty). **No
`check-frozen-workflows.mjs` / `check-parts-parity.mjs`** — nothing under `packages/runtime` was
touched either.

### `pnpm typecheck` is red at the wave-2 base — a wave-1 residue, NOT this ticket's

```
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,22): error TS2552:
  Cannot find name 'DOCUMENT_KINDS'. Did you mean 'documentId'?
apps/web typecheck: components/documents/document-kind-dialog.tsx(95,42): error TS7006:
  Parameter 'k' implicitly has an 'any' type.
```

Proof it is not mine, measured rather than asserted:

- `git diff --stat 23cfad94..HEAD -- apps/web` → **empty**; the whole lane touches no web file.
- `git show 23cfad94:apps/web/components/documents/document-kind-dialog.tsx` → line 95 already
  calls `DOCUMENT_KINDS.map(...)` while line 35 imports only `CLASSIFIABLE_DOCUMENT_KINDS`. The
  identifier has never been imported.
- `git log -3 -- apps/web/components/documents/document-kind-dialog.tsx` → the file last moved in
  `fd52e9360` (`test(web): #878 code-review fix round`), merged as `4b1376f40`
  (`merge: riders wave 1 lane 08`).
- `#1014`'s and `#868`'s reports record the identical finding independently.

**I did not fix it** — another lane's file, another ticket's scope, and three independent reports
now name it. It is repeated in Follow-ups because every wave-2 lane's `pnpm typecheck` will keep
reporting it until someone owns it.

---

## Docs updated (in the same commits)

- `packages/db/README.md` — a new `## 0238 — the correction door takes the client rung before any
  client row (#914)` section: the before/after ladder as a table, why the remedy is to move the row
  rather than hoist the rung (0037 §K/§H.3), which client the rung covers and why one acquisition
  is the same lock, the new ordering pair and the census that shows nothing inverts against it, and
  what the prestate/tail each prove.
- `packages/db/tests/README.md` — the named-suite-family entry for
  `correction-client-rung-order.test.mjs`, in the same shape as the two entries beside it, saying
  what a focused run against a pre-0238 chain does (it fails on the deadlock, which is the
  evidence).
- The test file's own header carries the three seams and the AC4 battery roster.
- **`CONTEXT.md` deliberately untouched.** It is the product and accounting glossary; an advisory
  rung ladder is database internals, whose home is `packages/db/README.md`. That also leaves the
  smallest possible hunk on a file nine other lanes are editing.

---

## Successor contract

**None owed.** Nothing a frozen chat body or Work tool would need changed: the door's signature,
argument order, receipt shape, refusal codes and refusal messages are all identical to 0125's, and
no grant moved. `apps/web/lib/documents/doors.ts` calls it unchanged;
`apps/web/e2e/document-correction-mock.mjs` mocks it unchanged. A reorder of two lock acquisitions
is invisible to every caller — which is exactly why the ticket's only observable is a deadlock that
no longer happens. No frozen body was read or edited.

---

## Follow-ups worth filing

1. **`apps/web/components/documents/document-kind-dialog.tsx` does not compile** — pre-existing at
   the wave-2 base, from wave 1 lane 08's `#878` fix round (`fd52e9360`, merged `4b1376f40`). Line
   95 calls `DOCUMENT_KINDS`, which is never imported; line 35 imports only
   `CLASSIFIABLE_DOCUMENT_KINDS`. Every wave-2 lane's `pnpm typecheck` reports it. Third
   independent report of the same finding in this lane alone.
2. **The lock-ladder census wants a home.** `ladder()` and `stripComments()` in
   `correction-client-rung-order.test.mjs` are a reusable estate detector (they already correctly
   classify the two false positives #649's round-two census had to adjudicate by hand). The next
   lock-order ticket will re-derive them. Worth promoting to a shared helper beside
   `rig-docs-race.mjs`, with the rung-vs-row claim as a standing estate cell that is *not* gated on
   any one ticket's migration stem.
3. **`rig-docs-race.mjs`'s drivers cannot say WHAT the blocked side is queued behind.** I had to
   write two local drivers to capture `pg_locks` for the blocked backend — which is precisely what
   turned a cell that passed against a door with no serializer at all into one that fails. Folding
   an optional `pg_locks` capture into `holdThenContend` would make that available to every
   two-session battery in the estate.
4. **`clara.record_wiki_source_ingest` refuses a caller-supplied note** (CLR10
   `source_note_not_permitted`) — correct, but undocumented in `packages/db/README.md`'s wiki
   section, and it cost a debugging round here. A one-line doc note would pay for itself.

---

## Unverified

- **A full from-scratch chain `0001 → 0238` on a fresh cluster.** RIG.md forbids a second
  from-scratch run on a reused cluster (migration 0154's cluster-global role census, `#867`), so
  that proof belongs to the integrator's disposable-cluster run. What *is* verified here: `0238`
  applied cleanly onto the 237-migration chain this lane built, and re-applied **twice** through
  the supported `#957` redo mode (once over 0125's body, once over its own), prestate and tail
  green each time; its bimodal prestate correctly refused a third-party-recut body; and a final
  plain `migrate` confirms `0 new migration(s) applied · 233 total` with checksums verified.
- **Behaviour under real production concurrency.** Everything here is measured on the lane rig
  (PostgreSQL 17, WSL, `clara_l01`) with forced schedules. The claim the fix supports is about lock
  *order*, which is a property of the bodies and is also pinned structurally; the deadlock's
  absence under arbitrary real traffic is not something a serial rig can establish.
- **The eleven-body census is a snapshot of this branch.** If another wave-2 lane adds a door that
  locks a `clara.clients` row, `cr.2` will census it and check it; but the pinned roster of eleven
  is a floor (membership is asserted, not exact equality), so an integrator merging such a lane
  should expect the count to rise and should re-read the violator set rather than the count.
- **`0238`'s SQL-side census uses `regexp_instr`** (PostgreSQL 15+). This estate is pinned to
  PostgreSQL 17 (`packages/db/README.md`), so it is in-contract, and `0019_wiki_boundary.sql`
  already uses the same function — measured, after first writing "first use in the chain" here and
  checking it. Noted only because it is a version-sensitive builtin in a census that must not
  silently stop detecting.
