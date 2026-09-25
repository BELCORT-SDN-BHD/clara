# Riders sweep wave · lane 05 · #1056 — a person corrects a misread payroll fact through the document Revise control

**Branch** `riders/wS-lane05` · **base** `7bc5a710f` · **head** `41a37f97fd582cf7e1883d99005b48986829e61a`
**Worktree** `C:\Users\zhant\Desktop\clara-wt\642` · **database** `127.0.0.1:55743/clara_l03`
**Status: DONE.** Nothing deliberately left out of the acceptance criteria; four follow-ups filed below.

The ticket carries **no comments** (`gh api repos/BELCORT-SDN-BHD/clara/issues/1056/comments` → `COUNT: 0`),
so the Agent Brief in the body is the newest and binds. Verified live on this branch before building:
`clara._revisable_invoice_field` (0217:473) is still invoice-only, `clara.revise_document_fact` still
asks it directly (0268:628), and `apps/web/components/documents/document-facts-table.tsx:260` still
gated the per-row control on `isRevisableFieldPath`. A payroll path therefore still had no path
through the door at all. **Live, built in full.**

Note (work-order rule f): no mid-task status request reached me.

## Commits

| commit | what |
|---|---|
| `7516cc0e2` | `feat(db)`: the fact door gains a payroll lane arbiter (0344 §B/§C, gate module, gate-chain entry, rig-meta cohort) |
| `c11e80576` | `feat(db)`: the payroll chain's observation and what a declaration makes of its state (§D/§E) |
| `234ac15da` | `feat(db)`: the fact door admits a payroll question, into the payroll chain (§F/§G, the recut) |
| `53afe35ed` | `test(db)`: AC2 both ways — the unposted run and the already-posted run |
| `a65bf43ce` | `feat(db)`: the lineage read publishes the payroll chain's facts version (§H) + `packages/db/README.md` |
| `5add78c22` | `feat(web)`: the document facts table offers a payroll fact its Revise control |
| `41a37f97f` | `fix(web)`: two gate findings — a narrowed version number and a spelled-out ticket reference |

## The seams I tested at (work-order rule 4), written down before the first cell

The brief names two "key interfaces" and one surface; these are them, and no cell sits anywhere else.

| # | seam | why it is the seam |
|---|---|---|
| **S1** | `clara._revisable_fact_lane(text)` | The brief's own first key interface, taken the second way it offers: "a sibling predicate needs to exist and be wired into the document facts table's revise-control decision". |
| **S2** | `clara.revise_document_fact(uuid,text,jsonb,int,text,text)`, driven as a bookkeeper through `humanQuery` | The estate's one human fact door. The whole ticket is whether a payroll question can go through it and where it lands. |
| **S3** | `clara._payroll_posting_verdict(uuid)` | The brief's own second key interface ("the correction path should interoperate with the payroll posting verdict function and the payroll posting body"). It is `stable` and derived, so what a correction does to it is measured by asking it before and after. |
| **S4** | `clara.list_source_revisions(uuid)` | The read the document surface takes its facts version from; a revision QUOTES that number and the door refuses CLR19 when it has moved. |
| **S5** | `DocumentFactsTable`'s rendered behaviour, and the dialog it opens | AC1 is about a control on a page. Driven, not inspected: the version cells press the control and read the quoted number off the opened dialog. |
| **S6** | `clara.document_fact_revisions`, read as COMMITTED rows | AC3's "who revised, when, what the prior value was". |

Vertical slices, one at a time, red for the right reason before each piece of implementation:
S1 red (`function clara._revisable_fact_lane(unknown) does not exist`) → §B/§C → green → commit.
S2 red (`function clara._payroll_source_observation(unknown) does not exist`) and S3 red
(`clara._payroll_state_with_human_fact(...) does not exist`) → §D/§E → green → commit. S4 red
(`field path 'payroll.run.gross_pay' is not one this door can revise`) → the recut → green → commit.
And so on. The migration was re-applied per slice with the supported redo mode
(`CLARA_MIGRATION_REDO=0344_payroll_fact_revision`, #957) — **six redos, recorded here as the work
order asks**; the file is `create or replace` throughout, so each redo is safe over its own old
effects.

## The accounting decision the ticket asks for, and why

> "the desired behavior should say explicitly whether a correction re-runs the posting verdict or is
> blocked once posted."

**Both, because they are two different runs.**

* **An unposted run — the correction moves the reading, and the verdict is re-derived from it.** The
  gate is `stable` and judges "the NEWEST payroll pair banked for this document" (0297:844's own
  comment), so asking it again answers about the corrected figures, Needs-you row included.
  **Nothing posts.** The unattended post is reachable from `clara.persist_payroll_facts` alone
  (0297 §G's splice) and this lane "deliberately has no 'post it anyway' door, because nothing in
  this lane is posted on a guess" (`apps/web/components/firm/needs-you-affordances.tsx:128-130`). A
  correction corrects the READING; it is not an instruction to post.
* **An already-posted run — refused, by name.** `CLR10` / `payroll_run_already_posted`, carrying the
  entry's id, status, posting date and memo, and saying in words to reverse that entry first.

Why blocked rather than admitted-and-flagged: a posted entry is corrected by **reversing** it and
booking the corrected one, never by editing the evidence underneath it while it stands. The posted
entry pins the very extraction it was drafted from (`flags->'payroll_run'->>'extraction_id'`,
0297:960), so admitting the revision would leave approved books citing a superseded reading with
**nothing anywhere saying so** — exactly the desynchronisation the brief forbids. The alternative
(admit it and raise a Needs-you row) needs a seventeenth row kind in
`apps/web/lib/firm/needs-you.ts`, which the sweep plan reserves for L4/#1048 alone.

It is the same family as a pin this door has carried since 0217:602 — a live bank statement bound to
the document must be voided before its facts can be revised — and the estate already supports the
act that clears it: `clara.reverse_entry` makes `clara._document_posting_entry` answer NULL, after
which the correction is admitted and the month re-opens exactly as 0297:697 already says a reversal
does. **Driven for real, not asserted**: cell S6/2 below.

The pin is **payroll-only**, inside a `v_lane = 'payroll'` branch that the migration's own tail
asserts by substring. The invoice lane has never carried a posted-entry wall, #1056 rules on the
payroll lane, and widening the invoice lane here would be a behaviour change nobody asked for to a
door two other batteries pin.

## Acceptance criteria, each with its evidence

### AC1 — "A payroll fact path that is not established … shows a working Revise control on the document facts table."

Built as a **superset**: every one of #945's eleven run-level questions gets the control, not only
the non-established ones. Two reasons, both checkable. (a) The facts table's own row shape
(`EvidenceRegion`) carries no fact state at all — text, cents and confidence — so gating on
"established" would mean importing `payroll_state` into a component that has never read it. (b) The
standing beta ruling is that nothing is dark: a run where both channels misread the same figure is
`established` and still wrong, and a bookkeeper must be able to say so. AC1 asks for a control on
the non-established paths; it gets one, together with its siblings.

| evidence | where |
|---|---|
| `1056 · a payroll run question gets a control; a per-employee cell does not` — one Revise trigger on `payroll.run.gross_pay`, "Read-only" on `payroll.row.gross_pay` | `apps/web/components/documents/document-facts-table.test.tsx` (cell 18), PASS |
| `1056 · a payroll revision quotes the PAYROLL facts version, and an invoice revision the invoice one` — DRIVES the control, reads `revise-observed-version` off the opened dialog: `7` for payroll, `3` for invoice, on one document | same file (cell 20), PASS |
| `1056 · a payroll fact whose chain the read could not report offers no control` | same file (cell 19), PASS |
| `1056 · the lane arbiter names the payroll lane, the invoice lane, and nothing else` | `document-revision-dialog.test.tsx` (cell 2), PASS |
| `1056 · DRIFT CELL: the revisable payroll set is exactly the payroll paths this app labels` | same file (cell 3), PASS — **vacuity control run**: shown RED against a nine-path list, subject restored byte for byte (`git diff --stat` on the file after restore: 31 insertions, 0 deletions, i.e. exactly the addition) |
| `S1 · the lane predicate names the payroll lane, the invoice lane, and refuses everything else` — the DB arbiter, all eleven, plus `payroll.row.*`, `statement.*`, `pages.1.lines.0`, `payroll.run.bonus`, NULL | `packages/db/tests/payroll-fact-revision.test.mjs`, PASS |
| `S4 · a payroll question a person corrects lands in the PAYROLL chain, carrying the other ten forward` — the door end to end: a `payroll_text_facts` row under `clara-fact-human:v1`, eleven regions, the corrected one at `engine_confidence = 1`, **zero** `invoice_facts` extractions, the machine's regions byte-identical afterwards | same file, PASS |
| `S4 · a per-employee cell and a foreign lane's path are still refused` — `payroll.row.gross_pay` → `field_path_not_revisable`; `invoice.total` on a payroll document → `no_facts_to_revise`; no revision row from either | same file, PASS |

"Working" is asserted by driving the door, never by reading the predicate: the control is real
because `clara.revise_document_fact` admitted the path and left a committed extraction behind it.

### AC2 — "defined for both an unposted run and an already-posted run, with each behavior covered by a test"

| arm | cell | result |
|---|---|---|
| unposted | `S5 · correcting an unposted run re-derives the verdict off the corrected figures, and posts nothing` — verdict `blocked`/`channels_agree` before, `ready` after; the gate is judging the **human's** extraction (`v.extraction_id` equals the appended row); the plan's gross-pay leg is 500000 and the entry still balances at 576145 both sides; **zero** journal entries on the document | PASS |
| unposted, the load-bearing negative | `S5 · a run-level correction cannot clear a problem that lives in the employee rows` — row 1's own identity fails (3,000.00 − (330.00+14.75+5.90+120.00) = 2,529.35 against a printed 2,500.00, by hand); after a run-level declaration the verdict is still `blocked`/`arithmetic_holds` and `rows.unbalanced` is still `[1]` | PASS |
| posted | `S6 · a payroll run that is already posted refuses the correction, and names the entry to reverse` — `CLR10` / `payroll_run_already_posted`, `detail.entry_id` equals the approved entry, `detail.status`/`posting_date` match, the message matches `/reverse that entry/`; extractions byte-identical afterwards, no revision row, and the posted entry still cites the extraction it was drafted from | PASS |
| posted → cleared | `S6 · reversing the entry re-opens the reading, and the same correction is then admitted` — `clara.reverse_entry` driven for real, then the same call lands at `facts_version` 2 with `prior_value = {text: "5,000.00", cents: 500000}` | PASS |

### AC3 — "auditable the same way an invoice fact revision is (who revised, when, what the prior value was)"

Satisfied structurally rather than by a parallel ledger: a payroll correction is a
`revision_kind = 'fact'` row in `clara.document_fact_revisions`, written by the same statement in the
same door, with the same `document.fact_revised` event and the same `_audit` row (which now also
carries `lane`). No CHECK was widened — the table's two kinds are unchanged.

Evidence, read as COMMITTED rows inside `S4 · a payroll question a person corrects…`:
`revision_kind = 'fact'`, `field_path = 'payroll.run.gross_pay'`, `observed_version_n = 1`,
`observed_extraction_id` = the machine row, `resulting_extraction_id` = the appended row,
`reason` matches `/misread/`, `recorded_by` present, `recorded_at` a real timestamp,
`prior_value = {text: "5,050.00"}` (no cents — the two channels disagreed, so no figure both
readings supported), `new_value = {text: "5,000.00", cents: 500000}`. And
`S7 · the lineage read publishes the PAYROLL facts version beside the invoice one` shows the same
revision in `clara.list_source_revisions`' chronological lineage under `entry_kind = 'fact'`.

### Out of scope, honoured

No chat or Work-tool surface was built (see the successor contract below, which is recorded and
**not** built). The payroll evaluator's arithmetic and refusal shapes are untouched:
`clara.evaluate_payroll_run_state_v1` is neither called nor recut, and its `sha256(prosrc)` is pinned
in the prestate and re-verified by every apply.

## Migration

**`packages/db/migrations/0344_payroll_fact_revision.sql`** — the number reserved for me. 1109 lines.

Objects: five new ungranted helpers, two recut doors, no table, no CHECK, no new event type, no new
grant, no chart row, no dynamic SQL.

| § | object | kind |
|---|---|---|
| B | `clara._revisable_payroll_run_field(text)` | new, `immutable`, ungranted |
| C | `clara._revisable_fact_lane(text)` | new, `immutable`, ungranted |
| D | `clara._payroll_source_observation(uuid)` | new, `stable security definer`, ungranted |
| E | `clara._payroll_state_with_human_fact(jsonb,text,text,bigint)` | new, `immutable`, ungranted |
| F | `clara._document_live_posted_entry(uuid)` | new, `stable security definer`, ungranted |
| G | `clara.revise_document_fact(uuid,text,jsonb,int,text,text)` | **recut** — the 0268 body plus seven marked `#1056` points |
| H | `clara.list_source_revisions(uuid)` | **recut** — the 0217 body plus one observation and two keys |

### Prestate pins, MEASURED on `clara_l03` before the file was written

The two bodies this file **recuts** (marker-tolerant in one direction only: a body already carrying
`#1056` is a redo of this file, and a body at neither the pre-image nor the post-image stops the
apply):

| signature | pinned `sha256(prosrc)` |
|---|---|
| `clara.revise_document_fact(uuid,text,jsonb,int,text,text)` | `6c5b63a8cac64ad2eb8a2eb984bd86b1d0fc15fce340aa0b74d9b55509bf43e6` |
| `clara.list_source_revisions(uuid)` | `7ff7e9c9c4d43e4344d70f65e44b16f75dd9d8f0e6e0953261ba3fd820e1585f` |

The nine neighbour bodies this file **reads and does not recut** (byte-exact in both the FIRST and
the REDO branch — a moved neighbour here is a merge conflict, not a redo):

| signature | pinned `sha256(prosrc)` |
|---|---|
| `clara._revisable_invoice_field(text)` | `2d44b64fc0011b0c947cf4fceab9363e814e0fe04a62906d9849b05a164c0b23` |
| `clara._monetary_invoice_field(text)` | `1b5a3e32e949107a910bbc9a6e8239438078a63abb64bcbabd1b5b80872f7219` |
| `clara._document_source_observation(uuid)` | `9e2a7abb60e386f550413709da48c4502ff08084ba1818727936dd7f50fd0483` |
| `clara._document_posting_entry(uuid,uuid)` | `8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0` |
| `clara._assert_field_path(text)` | `1f85850ae4b664fd5cdc816394556d391a12be729324cf06f30f3ad03eada52e` |
| `clara.evaluate_payroll_run_state_v1(jsonb,jsonb)` | `0b11727c230ff03ec94b758a95e7a2035c5af09d323a6f6da284cdd9d91fc8cd` |
| `clara.persist_payroll_facts(uuid,jsonb,jsonb,integer)` | `63633a3f06edcb6effebb7b2ca9a8a82c805bb2ca33537e49a1660b66c22f7aa` |
| `clara._payroll_entry_plan(uuid,jsonb)` | `9889780c7abcf79d6c939b79706c521113e7aa6b77b138cee6af1457e4889d83` |
| `clara._payroll_posting_verdict(uuid)` | `23c644b7b4ad11cee43c1e02acb2599733cb1000a808d108a5519d4b3a0a4df0` |

**Integrator note:** `clara._payroll_posting_verdict`, `clara._payroll_entry_plan`,
`clara.persist_payroll_facts` and `clara.evaluate_payroll_run_state_v1` are 0296/0297 bodies. No
other lane in this wave is listed as writing them (the sweep plan gives L4 the payroll capability
registry and the payroll posting basis, and #1048 would need
`clara.evaluate_payroll_run_state_v2` — a NEW name, which does not move my pins). The pins to watch
across the wave are `clara._document_posting_entry` and `clara._assert_field_path`, which are
estate-wide.

**Post-image shas after this ticket** (what a later ticket in this lane must pin, not these):
`clara.revise_document_fact` → `a6858d3e88bfca79d9a0f527a0d511db3702d53ca5612d796a05255fa1927fb8`;
`clara.list_source_revisions` → `cd89d74a96395aae09c026dde234d6cbeb1b3c175a1fb0fda238804cb8912c0c`.

### Data-dependent branches, entered

The prestate's `payroll_text_facts` / `payroll_vision_facts` CHECK probe and the
`clara._field_path_conforms('payroll.run.gross_pay')` probe both run unconditionally and were
exercised on every apply. §E's own branches (a prior fact present, a period without cents, a second
declaration appending to an existing `human_declared` array, a re-declaration not listing a path
twice) were each driven through real rows created by the estate's own doors — filed document, real
router, real task claim, real `clara.persist_payroll_facts` — never by surgery. The door's
`v_found = false` arm (a fact the reader never persisted) is **not** reachable on the payroll lane:
`clara.persist_payroll_facts` writes a region for every one of the eleven questions, answered or
not, so a payroll revision always finds its prior region. That is stated here rather than tested,
because a cell would have had to fabricate an extraction the lane cannot produce.

### The FIRST-APPLY branch, proved by hand (work-order wave-3 rule)

A marker-tolerant pin hides its sha branch from a redo, so the FIRST branch was proved separately:
inside **one transaction that was rolled back**, both pre-images were restored by re-running the
0268 and 0217 bodies verbatim (dumped from `pg_get_functiondef` before the recut), then the
prestate block was run verbatim from the migration file. It printed
`#1056 prestate: OK (FIRST apply) …` and the transaction rolled back; the live bodies afterwards are
the post-images shown above, both carrying the `#1056` marker. The REDO branch printed
`#1056 prestate: OK (REDO apply) …` on every redo after the door recut landed. A plain
`pnpm --filter @clara/db migrate` afterwards reports **0 new migration(s) applied · 310 total**, no
drift.

### House shape, item by item

* Header stating what was missing, what the file does, the accounting decision and what the file is
  NOT.
* Prestate with the eleven `sha256(prosrc)` pins above, measured on this rig now.
* Tail assertions re-read from the **committed** catalog: the lane arbiter in both directions; the
  five helpers unreachable by `clara_authenticated`, `clara_agent_ro`, `clara_runtime` and `public`
  role by role (an ACL-emptiness test is wrong here — `revoke … from public` itself makes the ACL
  non-null, which the first cut of this tail discovered); the recut door's owner, volatility,
  DEFINER-ness, `search_path` and `clara_authenticated`-only ACL; **seventeen** 0268 guards re-read
  by substring off the installed body; the seven `#1056` points; the absence of a direct
  `clara._revisable_invoice_field(p_field_path)` call (one question, one arbiter); the posted-entry
  pin guarded on the payroll lane alone; and `clara.list_source_revisions`' three invoice keys,
  two new payroll keys and own disposition.
* Preintegration gate module with a stable stem:
  `packages/db/tests/payroll-fact-revision-preintegration-gate.mjs` (sets
  `CLARA_ALLOW_MISSING_PAYROLL_FACT_REVISION=1`).
* Gate-chain entry in migration order: appended after
  `schedule-term-correction-preintegration-gate.mjs` in `packages/db/package.json`'s `test` script
  (one-line hunk, 126 gates).
* Rig-meta cohort: `PAYROLL_FACT_REVISION_0344_COHORT` in `packages/db/tests/rig-meta.mjs`, all
  ungranted, registered bimodally in `cohortFailures` the way 0317's is. `clara.revise_document_fact`
  is deliberately **not** listed a second time — it already sits on
  `DOCUMENT_SOURCE_REVISION_0217_HUMAN_FNS`, and a second listing would make this cohort resolve on
  databases 0344 has not touched.
* `apps/web/tests/firm-scope-db-pins.corpus.ts`: **no entry owed and none added.** Rule (d) put the
  corpus in scope because a migration file changed; the corpus lists only reviewed *dynamic-SQL
  barriers*, and 0344 recuts all three bodies statically with no `execute` anywhere. The corpus test
  ran green inside the whole web unit suite against the 310-file tree.

## Gates, with counts

| gate | command | result |
|---|---|---|
| my db battery + both batteries for the recut door, full gate chain (126 gates) | `node --test --test-concurrency=1 $GATES tests/payroll-fact-revision.test.mjs tests/rig-docs-source-revision.test.mjs tests/work-source-correction-supersede.test.mjs` | **37 tests, 37 pass, 0 fail, 0 skipped** (11 mine + 16 + 10) |
| new SQL functions → census and isolation, full gate chain, **no reset flags** | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | **33 tests, 32 pass, 0 fail, 1 skipped** — the skip is `T19 poison-role`, which skips itself because `CLARA_RIG_ALLOW_RESET` is (correctly) unset |
| whole web unit suite | `node scripts/run-tests.mjs` from `apps/web` | **5178 tests, 5176 pass, 0 fail, 2 skipped** — re-run after the last web edit |
| the two web test files I touched | `node --import ./test/bootstrap.mjs --import tsx --test <file>` | `document-facts-table.test.tsx` **20/20**; `document-revision-dialog.test.tsx` **7/7** |
| typecheck | `pnpm typecheck` | clean, 3 projects |
| lint as the runner sees it | `CI=true GITHUB_ACTIONS=true pnpm lint` | clean, 4 projects |
| browser walks I touched, on my triple (3520/3521/3522) | `pnpm --filter @clara/web e2e document-correction-walk` | **15 passed** |
| | `pnpm --filter @clara/web e2e documents-viewer-walk` | **22 passed** |
| frozen closure untouched | `node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files verified, no manifest diff |
| migration ledger | `pnpm --filter @clara/db migrate` | 0 new applied · 310 total · no drift |

Not run, and why: `packages/runtime`'s unit files and
`packages/runtime/scripts/check-parts-parity.mjs` — this ticket touches no runtime file (the
diffstat is db + web only).

No known Windows-only red was hit, and nothing on the RIG.md list was "fixed".

## Docs

* `packages/db/README.md` — its own new `## 0344 …` section (114 lines), in the same commit as the
  work it describes. No existing section edited.
* No `CONTEXT.md` change: the vocabulary this ticket uses — a source revision, a payroll run, a
  posting verdict — is already the estate's. The one new term, `human_declared`, is a value inside a
  fact state rather than a domain concept, and it is defined where it lives (the migration header,
  the function comment and the README section).
* `docs/PRD.md` and `docs/ARCHITECTURE.md` untouched.

## Successor contract — **not owed by this ticket, recorded because the door now exists**

#1056's own "out of scope" line excludes any chat or Work-tool surface, so nothing frozen was edited
and nothing frozen needs to change for this ticket to ship. What follows is what a later ticket
would need if the owner ever rules that a bookkeeper may correct a payroll figure from the
conversation; it is written now because the door's shape is fresh and would otherwise be re-derived.

* **name** `reviseDocumentFact` (one tool for both lanes — the door is one door).
* **zod input**
  `z.object({ documentId: z.string().uuid(), fieldPath: z.string().min(1).max(128), value: z.union([z.string(), z.number()]), observedVersion: z.number().int().min(0), reason: z.string().min(1) })`.
  `observedVersion` is the LANE's version: `payroll_facts_version` from
  `clara.list_source_revisions` for a `payroll.run.*` path, `facts_version` for an `invoice.*` one.
  A tool that guesses the wrong one refuses CLR19 every call.
* **door call, argument order**
  `clara.revise_document_fact(p_document, p_field_path, p_value::jsonb, p_observed_version, p_reason, p_op_key)`.
  `p_value` is a jsonb **scalar** (string or number); an object or array is refused
  `value_not_scalar`.
* **refusal mapping** (all `CLR10` unless noted) — `field_path_not_revisable`,
  `typed_facts_not_supported`, `no_facts_to_revise`, `value_not_scalar`, `value_blank`,
  `value_unchanged`, `monetary_value_malformed`, `component_must_not_be_negative` (invoice),
  **`payroll_value_negative`**, **`payroll_value_out_of_range`**,
  **`payroll_run_already_posted`** (detail: `entry_id`, `status`, `posting_date`, `memo`),
  `live_bank_statement_present`, `revision_incomplete`; `CLR03` agent identity; `CLR11` document not
  in your firm; `CLR19` `stale_source_version` (detail: `observed_version`, `current_version`,
  `attempted_value`).
  **The agent wall is absolute**: `clara.revise_document_fact` raises `CLR03` for any wake
  credential or agent user, so such a tool is a HUMAN-authored act inside a chat, never an OBO twin.
* **part kind** the existing source-revision receipt part; the receipt now also carries `lane`
  (`"invoice"` | `"payroll"`) so a surface knows which version to re-read without parsing the path.
* **prompt stanza** "A figure on a document can only be corrected by the person who read the page.
  If a payroll run has already been posted, say so and name the entry: the person reverses it first,
  and the correction is admitted afterwards."

## Follow-ups worth filing

1. **A cleared payroll block does not post, and nothing says the run is waiting.** Once a correction
   turns the verdict `ready`, the `payroll_posting_blocked` Needs-you row disappears and no entry is
   booked, because the unattended post lives inside the read. This is **pre-existing, not introduced
   here** — `packages/db/tests/payroll-summary-posting.test.mjs`'s own S2 cell records the same
   outcome for a chart that gains its missing account — but #1056 makes it reachable by a much more
   ordinary act. It needs an owner ruling on who may ask for an unattended post a second time
   (re-read, a human "post this run" door, or a wake arm), and a row kind in
   `apps/web/lib/firm/needs-you.ts`, which this wave reserves for L4.
2. **A re-extraction outranks a human declaration.** `clara.request_reextraction` mints a fresh
   machine pair at a higher `version_n`, which the gate then judges — so a correction made before a
   re-read is silently replaced by it. That is the estate's own law (a re-read replaces a reading)
   and is probably right, but nothing states it, and a bookkeeper who corrects a figure and then
   asks for a re-read will not expect it.
3. **One rendering still reads differently in the two cents rules.** The door measures a declared
   payroll figure with the shared `clara._normalize_invoice_cents` under two payroll bounds
   (non-negative, and inside the evaluator's 13-integer-digit window). A rendering padded with
   leading zeros past thirteen digits is admitted here and would have been unreadable to 0296's own
   regex. Closing it means a fourth copy of a normalisation rule the estate already keeps two of
   deliberately; recorded in the README rather than built.
4. **The invoice lane still has no posted-entry pin.** An invoice fact revision on a document whose
   entry is posted is admitted today, exactly as it has been since 0217, and this ticket did not
   change it. Whether that asymmetry is right is an owner question — the invoice lane's entry is
   drafted by a person and corrected through the coding lane, which is a different story from an
   unattended post — but it should be asked rather than left as an accident of which ticket came
   first.

## Unverified

* **Hosted.** Everything above is the lane rig (`clara_l03`, 310 migrations). Nothing was run against
  hosted, and hosted carries rows this seeded rig does not.
* **From-scratch chain.** Not run — the integrator runs it on a disposable cluster. What I proved is
  the FIRST-APPLY prestate branch inside a rolled-back transaction, and six redos.
* **Linux/runner.** The db battery was not re-run under WSL as `runner`; it adds no runtime test
  file, touches no spool and depends on no Windows path, but the claim is not measured.
* **Later tickets in this lane.** #1090, #1092 and #1093 have not run. Every pin above is what was
  live after #1056 alone.
* **Rig residue, measured rather than estimated.** `clara_l03` now carries 94 documents with a
  `payroll_text_facts` extraction and 22 `payroll_run` journal entries, 18 of them approved and
  un-reversed, across period months 2026-01-01 to 2026-09-01 — the accumulation of this battery's
  repeated runs during the build. It is harmless because `buildWorld()` mints a fresh firm and
  fresh clients on every run, so the gate's `same_month_payroll_run` scope (which is per client)
  never reaches across worlds. What it DOES reach across is cells inside one run, which is why
  every cell in this battery names its own month; the reason is written into the fixture's own
  header, and it was measured, not supposed (the first cut read `duplicate_entry` because S2's
  clean run had already posted August).
