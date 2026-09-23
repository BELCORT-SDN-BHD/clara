# Wave 3 · lane 02 · ticket #1007 — warn before recording a trade invoice or bill that looks like one already recorded

**Branch** `riders/w3-lane02` · **base** `ffe63a0dd084e99b84c1368119845be273c421ce` ·
**worktree** `C:\Users\zhant\Desktop\clara-wt\636` · **database** `127.0.0.1:55742/clara_l02`

**Status: DONE** — every acceptance criterion is met and evidenced below, except the chat
entrance, which the ticket itself defers to the shared `chatTurn_v22` / `claraWork_v6` cut and
which is delivered here as a successor contract.

## Commits (this ticket only; #982's six are below the base of this list)

| commit | what |
|---|---|
| `6acde36be` | `feat(db): #1007 the trade-invoice duplicate probe, warn-only (0275, slices 1-5)` |
| `9e7750df2` | `feat(db): #1007 the chat lane's probe twin and the "recorded anyway" record (0275, slices 6-8)` |
| `b7ee16a48` | `test(db): #1007 rewrite #655's named residual to prove the warning (AC7)` |
| `3967ba183` | `feat(web,runtime): #1007 the form warns before it records, and keeps the choice (slices 9-11)` |

The worktree is clean; nothing is pushed and no GitHub object was touched.

## What I inherited, and what I did with it

An earlier implementer of this ticket was killed by a usage limit. It had **no commits** —
`git log ffe63a0d..HEAD` showed only #982's six — and left three uncommitted things: migration
`0275` (677 lines, the whole ticket), a 343-line test file with six probe cells, and 87 lines of
fixtures.

**Measured, not assumed:** the migration on disk and the migration on the database were not the
same file. `clara.probe_trade_invoice_duplicates` and its two internals were live;
`clara.trade_invoice_duplicate_acks`, the runtime twin, the acknowledgement writer and its read
were **not** (`to_regclass` → null; the sixth cell failed `42P01 relation … does not exist`). So
the applied part was the probe alone and the rest was untested, unapplied, speculative code.

I judged it on its merits and kept it, but I did **not** commit it as one lump:

- The probe half (sections 1–4, the six cells) was verified green, trimmed so the file on disk is
  exactly what is applied, and landed as commit 1 — with its **non-vacuity measured**, not
  assumed (below).
- The acknowledgement half was **removed from the file**, and then re-landed test-first: a cell
  written, seen red for the right reason (`42883 function … does not exist`), then the code. Twice.
- Everything the ticket asks for that the inherited draft did not have — the rewritten `p655` cell,
  the frontier triad, the rig-meta cohort, the web form, the runtime door, the browser walk, the
  docs — is new work in this session.

## The seams I tested at

The brief names a read door, a record of "recorded anyway", the web form and the chat tool. So:

| seam | what drives it |
|---|---|
| `clara.probe_trade_invoice_duplicates(p_client,p_kind,p_particulars)` | the signed-in bookkeeper's own session (`humanQuery`) — the form's transport |
| `clara.probe_trade_invoice_duplicates_for(p_client,p_author,p_kind,p_particulars)` | `clara_runtime` (`roleQuery`) — the chat lane's transport |
| `clara.record_trade_invoice_duplicate_ack(...)` | `clara_runtime`, OBO a named human |
| `clara.get_trade_invoice_duplicate_ack(p_work)` | a signed-in viewer |
| `clara.admit_trade_invoice_work` | unchanged, driven to prove it still admits exactly as before |
| `TradeInvoiceFormView`'s rendered behaviour | its `probe` and `submit` seams, in the unit harness |
| `POST /api/work/trade-invoice` | `toAcknowledgedInvoiceIds` as a pure function, and the real route in the browser walk |

`clara._trade_invoice_duplicate_matches`, `_trade_invoice_reference_key`, `_trade_invoice_probe_core`
and `_trade_invoice_actor_firm` are ungranted internals; **no cell calls them directly** (the
migration tail asserts they are ungranted, and `p1007.probe.is_a_read` reads only their catalog
posture).

## Acceptance criteria, each with its evidence

Test files: `packages/db/tests/trade-invoice-duplicate-probe.test.mjs` (9 cells),
`packages/db/tests/trade-invoice.test.mjs` (30), `apps/web/components/accounting/trade-invoice-form.test.tsx`,
`packages/runtime/tests/trade-invoice-unit.test.mjs`, `apps/web/e2e/trade-invoice-walk.spec.ts`.

1. **Same counterparty + same reference as a posted one warns in the form before any Work is
   admitted; cancel admits nothing.** — `p1007.probe.same_reference` (db, the match names the
   invoice, its Work and the signal that fired); web cell *"1007 — a bill this client already looks
   to have is WARNED about, and NOTHING is admitted until the person chooses"* asserts
   `sent.length === 0` after the submit and again after Cancel; walk cell
   *"#1007 — a bill this client already looks to have is WARNED about in the form…"* asserts the
   **runtime received `[]`** at both points, in a real browser.
2. **`INV-001` and `inv001` match for one counterparty; the same reference under another does
   not.** — `p1007.probe.normalised` (`match_count === 1` for `inv 001` against `INV-001`,
   `reference_key === "inv001"`, and `match_count === 0` for the same number under Beta).
3. **With no reference: same counterparty, total and document date match; the same total on a
   different date does not.** — `p1007.probe.same_money_same_day` (both arms, and the second is
   the monthly-rent case the ticket names).
4. **A refused / failed / cancelled Work, or a reversed entry, does not match.** —
   `p1007.probe.never_posting`: four earlier bills, one per terminal state plus one posted and
   then reversed through the estate's own `reverseEntry` (with `reversed_by` re-read to prove the
   rig really reversed it), all `match_count === 0`, **plus a positive control** — a bill under a
   still-queued Work DOES match, so the four negatives are the filter working rather than the probe
   seeing nothing.
5. **"Record anyway" admits exactly as today, and the acknowledgement is readable afterwards with
   who, when and which earlier invoice was shown.** — `p1007.ack.recorded_anyway`: the
   acknowledgement is written first and **admits nothing** (the `accounting_work` count is
   unchanged), the admission then returns its own `invoice_id` (≠ the first), `clara.get_trade_invoice`
   answers for it exactly as before, and `clara.get_trade_invoice_duplicate_ack(work)` returns
   `acknowledged_by`, a real `acknowledged_at`, the intent key and the shown invoice **re-read from
   the books** (`reference: "ACK-0001"` as recorded, not `"ack 0001"` as retyped). A Work nobody was
   warned about reads back `null`.
6. **A sales invoice never matches a supplier bill; another client's invoices are never read
   (second client and second firm).** — `p1007.probe.scoped`: one bill and one sales invoice under
   the same number on one client see only their own side; a second client of the same firm with the
   same number matches nothing; another firm's client and an unknown uuid both raise
   `CLR11 client_not_found` with **byte-equal messages**, so the probe is no existence oracle.
7. **`p655.duplicate.same_reference_is_NOT_probed` rewritten, `p655.replay.*` unchanged.** —
   rewritten as `p655.duplicate.same_reference_is_probed_and_warns` in #655's own file: the probe
   reports the earlier bill **before** the second Work exists (naming both signals, since a straight
   re-recording repeats the number *and* the money on the day) and the door **still admits**, so the
   two invoices and the doubled payable are now a chosen outcome. `trade-invoice.test.mjs`: 30/30,
   every `p655.replay.*` cell untouched and green.
8. **The probe is a read: no row lock, no write.** — `p1007.probe.is_a_read`, proved from outside
   in two ways: a row census over `trade_invoices`, `trade_invoice_status`, `accounting_work` and
   `clara.audit_log` is unchanged by a probe (a read that audited itself would be a write), and a
   second session takes `for update nowait` on the very row the probe just reported **while the
   probe's transaction is still open**. The catalog half pins all three bodies `stable` +
   `security definer`.
9. **The final report carries the successor contract for the chat half.** — below.

Extra cells the ticket implies but does not enumerate: `p1007.twin.same_answer` (the runtime twin
answers the form's answer whole, carries the admission door's authority ladder arm for arm, and
`clara_authenticated` gets `42501` on it) and `p1007.ack.guards` (`nothing_acknowledged`,
`unknown_acknowledged_invoice`, replay convergence on one row, a viewer refused, and the browser
lane holding neither the grant nor any DML on the table).

## Non-vacuity, measured

Four of the cells' subjects existed before the cell did (inherited code, or the guards inside a
body I landed whole). The work order's substitute for a red-first cycle is a deliberate break, so
each was measured on the lane database and then restored **byte for byte** through the supported
redo (#957) — the ledger checksum before the breaks and after the restore is the same
`2450a2b01b694c7d43066c99be4fdf52e5ea8de9d1ef1617f0ae9d7de3bf01e2`:

| break | what turned red |
|---|---|
| removed `ti.counterparty_id = p_counterparty` from the matcher | exactly `p1007.probe.normalised` |
| removed `w.status not in ('refused','failed','cancelled','expired')` | exactly `p1007.probe.never_posting` |
| removed the empty-`shown` guard from the writer | exactly `p1007.ack.guards`, at assertion (1), **as a `23514`** — which is the very thing that assertion forbids |
| removed the cross-client ownership guard from the writer | exactly `p1007.ack.guards`, at assertion (2), with *"the call SUCCEEDED"* |

The cells landed test-first had ordinary red-first evidence: `p1007.twin.same_answer` and
`p1007.ack.recorded_anyway` both failed `42883 function … does not exist`; the three
`1007.route.*` cells failed `toAcknowledgedInvoiceIds is not a function`; the two web cells failed
with no probe seam and no control to press.

## The migration

**`packages/db/migrations/0275_trade_invoice_duplicate_probe.sql`** (742 lines, applied to
`clara_l02`, ledger checksum `2450a2b01b694c7d43066c99be4fdf52e5ea8de9d1ef1617f0ae9d7de3bf01e2`).
Purely additive: one table, four ungranted internals, two probe reads, one writer, one read of
what it wrote. It recuts nothing.

**Prestate pins — every pinned signature, measured on this lane *after* #982's recut, as the
addendum requires:**

| pinned body | sha256(prosrc) |
|---|---|
| `clara._trade_invoice_resolve_party(uuid,text,jsonb)` | `be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8` (0274's post-image) |
| `clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)` | `c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c` |

**Both are re-read in the tail** to prove this file moved neither while it applied. *Integrator
note: these are the two pins another lane could recut.* The prestate also asserts structurally:
0225's table and status ledger exist, `clara.trade_invoices` carries the five compared columns,
`accounting_work`'s status vocabulary names all four terminal-without-posting states,
`journal_entries.reversed_by` exists, and **no unique index constrains a trade-invoice reference**
(the negative premise the whole ticket rests on).

**Redo and first-apply.** I re-applied 0275 with `CLARA_MIGRATION_REDO=0275_trade_invoice_duplicate_probe`
five times while building it (each slice, and once to restore after the breaks). The prestate has
**no bimodal sha branch** — its pins are unconditional — but it does carry a REDO *notice* branch
and the table's `create table if not exists`, so the FIRST-APPLY branch was proved separately, as
the addendum asks: inside one transaction that was rolled back, every object this file creates was
dropped (verified: `probe_gone: true, table_gone: true`) and the prestate block was run **verbatim**;
it reported `clean` and did **not** take the REDO branch, and the rollback restored the live
objects. The `create table` branch was also exercised for real: the table did not exist when slice
7 first applied it.

**No data-dependent branch.** Nothing in the prestate or the tail runs only when rows exist — the
tail reads the catalog (four names, RLS enabled *and* forced, two belts, the grant matrix) and the
two pinned shas. So there is no state I had to seed before applying.

**Frontier triad**, per the work order: `tests/trade-invoice-duplicate-probe.test.mjs`,
`tests/trade-invoice-duplicate-probe-preintegration-gate.mjs` (stem
`trade_invoice_duplicate_probe$`, env `CLARA_ALLOW_MISSING_TRADE_INVOICE_DUPLICATE_PROBE`) and its
`--import` token appended to `packages/db/package.json`'s test script **in migration order**, after
#982's. A chain carrying 0225 and 0274 and not 0275 runs #655's and #982's batteries in full while
this one skips.

**rig-meta**: `TRADE_INVOICE_DUPLICATE_0275_COHORT` (two human reads, two `clara_runtime` doors,
four ungranted internals), the two `ALLOWED` rows, and the sweep entry. The acknowledgements table
is invisible to that function roster, so its `SELECT`-and-no-DML posture is asserted in 0275's own
tail instead.

## Gates, with counts

| gate | result |
|---|---|
| `tests/trade-invoice-duplicate-probe.test.mjs` + `trade-invoice.test.mjs` + `trade-invoice-party-tin.test.mjs`, full gate chain | **46 pass, 0 fail, 0 skip** |
| `tests/operation-census.test.mjs`, full gate chain | **10 pass, 0 fail** |
| `tests/rig-isolation.test.mjs`, full gate chain | **22 pass, 0 fail, 1 skip** (T19 poison-role, destructive; reset flags never set) |
| `pnpm typecheck` (root) | apps/web **Done**, packages/runtime **Done** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | clean, exit 0 |
| whole web unit suite (`node scripts/run-tests.mjs` from `apps/web`) | **4851 tests, 4849 pass, 0 fail, 2 skip** |
| `packages/runtime/tests/trade-invoice-unit.test.mjs` | **26 pass, 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, 55 `"use workflow"` modules, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — reader ⊇ emittable |
| `pnpm --filter @clara/web e2e trade-invoice-walk` on the lane triple (3510/3511/3512) | **14 passed**, #1007's cell is cell 2 |

## Docs (in the same commits)

- `packages/db/README.md` — a new `## 0275` section: the two signals and why they are independent
  (QuickBooks warns on vendor + number and still saves; SAP's all-six conjunction lets a
  mistyped reference through), the normalisation, which earlier invoices count, the read proof, the
  two-doors authority argument, the three deliberate properties of the acknowledgement record, the
  redo/first-apply posture and the frontier triad.
- `CONTEXT.md` — **Probable duplicate** (with its `_Avoid_` line, including "calling a replayed
  request a probable duplicate — that is an intent key converging, not a second document").
- `apps/web/README.md` — the `warned` state, the `probe` seam, the two controls, and why a failed
  advisory read must not block a recording.
- `packages/runtime/README.md` — the optional `acknowledgeDuplicates` key, its shape guard's
  vocabulary, and the write-before-admit ordering with the reason.

## Successor contract — the chat half (for the `chatTurn_v22` / `claraWork_v6` cut)

Nothing frozen was edited. `start_trade_invoice_work` in `chatTurn.v21.tools.ts` and
`lib/trade-invoice-basis.ts` are untouched (`check-frozen-workflows.mjs`: no manifest diff). The
successor cut needs exactly this.

**1 · The probe call, in `runStartTradeInvoiceWork`, BEFORE the admission.** The chat lane cannot
use the form's door: a `clara_runtime` connection carries no JWT claims
(`packages/runtime/lib/pools.mjs` issues only `set role clara_runtime` plus two timeouts), so
`clara._human_ctx` raises `CLR04` on every one. Use the actor-explicit twin, **argument order
fixed**:

```
select clara.probe_trade_invoice_duplicates_for(
  $1::uuid,   -- ctx.clientId
  $2::uuid,   -- ctx.createdBy          (the named human the runtime acts for)
  $3::text,   -- input.kind
  $4::jsonb   -- tradeInvoiceFromInput(input)   — the SAME object the door will receive
) as r
```

It answers `{ client_id, kind, counterparty_id, counterparty_name, reference, reference_key,
document_date, total_cents, match_count, matches[] }`, each match carrying
`{ invoice_id, work_id, signals[], reference, document_date, total_cents, state, entry_id,
recorded_by, created_at }`. `signals` ∈ `same_reference` | `same_total_and_date`. It **writes
nothing and refuses no duplicate**; it raises the admission door's own
`CLR11 client_not_found` / `CLR04 actor_not_active` / `CLR04 insufficient_role` /
`CLR10 client_inactive`, and the party refusals `party_unresolved` / `party_ambiguous` /
`party_identifier_conflict` (0274) — all already in `TRADE_INVOICE_REFUSALS`, so the map needs no
new token for the probe.

**2 · The question asked, and the two branches.** `match_count > 0` must **not** refuse the call —
that is the owner's ruling, and refusing would also lose the figures. It is the mid-turn question
shape `claraWork_v4` has and `chatTurn_v21` does not: today an admission-time problem is refused
outright and the person retries. So the successor asks, in the turn, with the matches rendered:

> *"This client already has a supplier bill from Alpha Supplies numbered ALPHA-2026-0042, dated
> 4 March 2026, for RM 1,060.00. Record this one anyway, or stop?"*

- **stop** → no door call at all, no Work, nothing to undo;
- **record anyway** → step 3, then the ordinary admission, unchanged.

**3 · The acknowledgement, written BEFORE the admission, under the same intent key.** Argument
order fixed:

```
select clara.record_trade_invoice_duplicate_ack(
  $1::uuid,   -- ctx.clientId
  $2::uuid,   -- ctx.createdBy
  $3::text,   -- the SAME intentKey the admission will use (stableOpKey(...))
  $4::text,   -- input.kind
  $5::jsonb,  -- tradeInvoiceFromInput(input)   — the same particulars again
  $6::jsonb   -- the shown invoice ids, e.g. ["65509aaa-…"]  (a JSON array of uuid strings)
) as ack
```

Answers `{ ack_id, replayed, intent_key, counterparty_id, shown_count }`. Idempotent on
`(firm, client, intent_key, ack_digest)`, so a replayed step converges on one row and answers
`replayed: true`. Granted to `clara_runtime` only. Two new refusal tokens for
`TRADE_INVOICE_REFUSALS` (eighteen → twenty), both `CLR10`:

| token | sentence (as shipped in `apps/web/messages/en.json`) |
|---|---|
| `nothing_acknowledged` | *"Clara could not record which earlier document you were shown. Try recording it again."* |
| `unknown_acknowledged_invoice` | *"Clara could not record which earlier document you were shown. Try recording it again."* |

Both are caller faults, not things the person can fix by retyping, which is why one sentence serves
both.

**4 · Part kind: NONE is added.** The success path still mints the existing
`work_accepted` part (`WorkAcceptedPartV19`), with **no** `WORK_ACCEPTED_PURPOSES` widening — a
trade-invoice Work's purpose is `journal_entry`, exactly as today. The warning is a *question in
the turn*, not a card; the acknowledgement is a durable row a reviewer reads through
`clara.get_trade_invoice_duplicate_ack(work_id)`, not a part.

**5 · The prompt stanza**, to sit beside the existing "I've queued it":

> *Before you record an invoice or a bill, ask whether this client already has one that looks the
> same. If Clara finds one, say what she found — the number, the date and the total — and ask
> whether to record it anyway. Never refuse it yourself, and never record it without asking. If the
> person says go ahead, keep that choice with the recording.*

**6 · `claraWork` needs nothing.** The acknowledgement is written at admission time and the run
reads `basis` off the Work row and nothing else. `claraWork_v6` can be a straight re-cut.

## Follow-ups worth filing

1. **The warning does not reach the Work page.** `clara.get_trade_invoice_duplicate_ack(p_work)`
   exists, is granted and is proved by a cell, but no surface calls it yet: a reviewer opening the
   Work still cannot see that the preparer was warned. A small web ticket (one read on the
   trade-invoice link block, one line of copy) closes AC5's "so a reviewer can tell" for the
   *reviewer's* screen rather than only for the database.
2. **The probe runs on every submit.** One extra round trip before each recording. It is a single
   indexed read of one counterparty's invoices, but a later ticket may want to skip it when the
   particulars have not changed since the last probe of this draft.
3. **Cross-kind and credit notes stay out**, as the ticket says — worth a line in whatever ticket
   picks up #662 so the two checks are not re-litigated as one.

## Deviations and anything unverified

- **I stopped three processes I did not start.** The lane's Playwright triple (3510/3511/3512) was
  held by an orphaned `e2e/serve-built.mjs` and its `next start` child in **this** worktree, created
  `20/9/2026 7:22 AM` — the rig of the session that was cut off — with a dead parent shell. The walk
  cannot bind its own ports otherwise. I stopped exactly those three PIDs (43092, 45404, 46408) by
  id, touched nothing else, and the walk then ran green. Recording it because the work order forbids
  it in general; the host still carries a dozen older orphaned node processes from other sessions,
  which I left alone.
- **One Windows-host crash, not a test failure.** Running `operation-census.test.mjs` and
  `rig-isolation.test.mjs` in one `node --test` invocation crashed the census child once with
  `exitCode 3221226505` (`0xC0000409`) and no failing cell. Run separately, both are green every
  time (10/10 and 22 + 1 skip). Reported as a host flake under contention, not fixed.
- **The chat entrance is not built**, by the ticket's own sequencing. Everything it needs is the
  successor contract above; nothing in this branch changes a frozen body.
- **What no cell here proves:** that the probe behaves the same on hosted data volumes (the rig's
  invoice counts are tiny), and that the browser walk's mocked PostgREST answers match hosted
  PostgREST's exactly — the db battery is the authority on the door's answer, and the walk is the
  authority on the journey.
