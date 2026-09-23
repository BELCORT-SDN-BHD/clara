# Wave 3 · lane 02 · fix round — #982 and #1007 (trade invoice integrity)

**Branch** `riders/w3-lane02` · **base** `ffe63a0dd084e99b84c1368119845be273c421ce` ·
**worktree** `C:\Users\zhant\Desktop\clara-wt\636` · **database** `127.0.0.1:55742/clara_l02`

**Head after this round: `342287c71`** (two commits on top of `3967ba183`).

Single fix worker for every finding of the lane's three reviews (`…-codereview-spec.json`,
`…-codereview-standards.json`, `…-review-adversarial.json`). Nothing was pushed, no PR was opened,
no GitHub object was touched, no subagent was spawned, and **no process I did not start was
killed** (STD-4 below).

**Starting state.** `git status` clean; `git log --oneline ffe63a0d..HEAD` showed the ten commits
the reviews were written against. The implementer's "uncommitted changes" named in the prompt had
in fact already landed as `3967ba183` — the tree was clean, so there was nothing to recover.

## Verdict per finding

| id | sev | verdict | where |
|---|---|---|---|
| S-1 | blocker | **FIXED** — the probe now rides the admission's own runtime route, over the admission's own translation | `packages/runtime/src/workRoutes.ts`, `apps/web/lib/work/api.ts` |
| ADV-1007-1 | blocker | **FIXED** — the acknowledgement a reviewer reads is bound to what the Work recorded | 0275 §9 |
| ADV-1007-2 | major | **FIXED** — the matcher compares the counterparty's merged family | 0275 §2 |
| ADV-982-1 | major | **FIXED** — a shared TIN no longer outranks the name beside it | 0275 §10 (recut of 0274's body) |
| S-2 | minor | **FIXED** — a TIN-ambiguous refusal gets its own sentence | `apps/web` form + `en.json` |
| S-3 | minor | **FIXED** — the chooser renders `matched_on` | `apps/web` form + `en.json` |
| S-4 | minor | **ACCEPTED DEVIATION, with the risk refuted by measurement** | below |
| S-5 | minor | **FIXED** — the Work page reads the acknowledgement | `apps/web/components/work/work-detail.tsx` |
| STD-1 | minor | **FIXED** — `formatMyr`, and the currency left the message string | form + `en.json` |
| STD-4 | minor | **NOT A CODE DEFECT** — recorded; this round killed nothing it did not start | below |
| ADV-1007-3 | minor | **FIXED** — the human probe carries the admission's `client_inactive` arm | 0275 §4 |
| ADV-1007-4 | note (not in my list) | **FIXED** — the ack writer types its total and date guards | 0275 §8 |
| ADV-1007-5 | note (not in my list) | **FIXED** by ADV-1007-1, plus a content tie-break | 0275 §9 |
| ADV-982-2 | note (not in my list) | **NO CODE CHANGE** — recorded in `packages/db/README.md` | below |
| STD-2 | note (not in my list) | **FIXED** — the duplicated header line is gone | 0275 header |
| STD-3 | note (not in my list) | **FIXED** — the README's redo-safety sentence now matches the file | `packages/db/README.md` |

## The one structural decision, stated first

**Everything in SQL went into 0275, including the recut of 0274's body, and 0274 stays byte-frozen.**

`ADV-982-1` asks for a change to `clara._trade_invoice_resolve_party`, which 0274 recut. The
supported re-apply path for an unmerged migration (`CLARA_MIGRATION_REDO`, `packages/db/README.md`
"Redo (#957)") **refuses a version that is not the highest applied one**, and 0275 sits on top of
0274 on every lane database; editing 0274 in place would mean the hand procedure #957 exists to
abolish, and would leave the ledger's checksum for 0274 wrong until somebody repaired it by hand.
0272 states exactly this reason for not editing 0244.

So section 10 of `0275_trade_invoice_duplicate_probe.sql` carries the recut. The consequences,
each handled:

- 0275's prestate pin on that body is now **two-valued by construction** — 0274's post-image
  `be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8` on a first apply, or a body
  carrying this file's own `#982R2` marker on a redo. Anything else still raises `CLR10`.
- 0275's tail no longer claims the resolver "did not move"; it asserts the live body exists
  exactly once, carries BOTH markers (`#982`, which 0274's own tail reads, and `#982R2`), kept
  0225's owner / `security definer` / `search_path` / `stable` posture, and is still granted to no
  application role.
- The file's "purely additive / recuts nothing" header claim was corrected rather than left
  standing.
- The two new `p982.*` cells gate on **#1007's** frontier (`gateTiDup`), not #982's, because the
  behaviour they drive arrives with 0275. The cells say so in a comment.
- `packages/db/README.md` records the supersession inside the **0274** section too, since 0274's
  own text can no longer be edited.

**Redo record.** 0275 was re-applied five times with
`CLARA_MIGRATION_REDO=0275_trade_invoice_duplicate_probe` (destructive guard set,
`CLARA_RIG_DB=1`), once per slice. Final ledger checksum
`a99bf96eb779cbeb5be2a1324efd9eddb8eb6df049b336ecc1bfde924f1b450a`, which is byte-equal to
`sha256(packages/db/migrations/0275_trade_invoice_duplicate_probe.sql)` on disk. 269 migrations
applied; 0274's row is untouched (`2ecb37de67d8b827d365a87a5c3ef01010d56cc69bc6433f4f7ef72e63330cb7`).

**FIRST-APPLY branch, proved by hand** (wave-3 addendum: a redo only ever takes the marker branch).
Inside one transaction that was rolled back: 0274's own `create or replace function` statement was
re-run verbatim to restore its post-image (measured back at `be2df90e…`, `#982R2` absent), every
object 0275 creates was dropped (`probe_gone: true`, `table_gone: true`), and 0275's prestate block
was run **verbatim**. It reported `clean` and raised **no REDO notice at all**. After the rollback
the live objects and the `#982R2` body were both back.

**Prestate pins, measured on this lane now** (the list the integrator uses to find a pin another
lane recuts):

| pinned body | sha256(prosrc) | branch |
|---|---|---|
| `clara._trade_invoice_resolve_party(uuid,text,jsonb)` | `be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8` | first apply (0274's post-image) |
| …the same body | any body containing `#982R2` | redo over this file's own recut |
| `clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)` | `c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c` | unconditional, and re-read in the tail |

**Live bodies after the round** (for the integrator's own re-measure):

| body | sha256(prosrc) |
|---|---|
| `clara._trade_invoice_resolve_party` | `cf9460134236788238181f5b8921aff0434bf279d41755d0d914451ee7353ed8` |
| `clara._trade_invoice_duplicate_matches` | `99bf25f4b9cf50389b2e7a51b798db6ea25ef157dec65ca4e5897ae2e5543541` |
| `clara.probe_trade_invoice_duplicates` | `fd7a0f37e793496db0d3a76fcd393be61e6559b81a5a98fc38795d1afccfcb64` |
| `clara.record_trade_invoice_duplicate_ack` | `2144be53c2de62f2096982ed698469b69d78e08f3f661308161e0d755de752b7` |
| `clara.get_trade_invoice_duplicate_ack` | `1068254d3353ed4266beb555e55d98d7954fe4b06382ef7e787596dbd10be4ba` |
| `clara.admit_trade_invoice_work` | `c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c` (unmoved) |
| `clara._canonical_counterparty` | `bbbe4a5e9ba57da93f162c74777b5c780a98b64445054291426593b47b3852b4` (unmoved) |

`apps/web/tests/firm-scope-db-pins.corpus.ts` pins only migrations with a **reviewed dynamic-SQL
barrier**; neither 0274 nor 0275 is in that map (`grep` returns nothing) and this round added no
dynamic SQL, so there was no census sha to re-measure.

## Findings, one at a time

### ADV-1007-1 (blocker) — the acknowledgement a reviewer reads

**Reproduced first, on `clara_l02`.** New cell
`p1007.ack.rode_this_recording` drives the browser's own sequence: a bill is warned about,
acknowledged and admitted under intent key K; then the figures are edited and re-submitted under
the SAME key (the form mints one key per draft and re-enables the button after an acceptance), so a
second acknowledgement lands for RM 9,999.00 naming **this Work's own invoice** as the earlier
document, and the admission then refuses `CLR10 intent_payload_conflict`. Red for exactly the right
reason: `get_trade_invoice_duplicate_ack` answered the SECOND acknowledgement.

**Fix (0275 §9).** The read still starts from the Work, but the join is now narrowed by what that
Work **actually recorded**, through its own `clara.trade_invoices` row: same `kind`,
`counterparty_id`, `document_date` and `total_cents`, the same document number under this lane's one
normalisation (`clara._trade_invoice_reference_key`, so `ack 0001` and `ACK-0001` are one number,
exactly as the acknowledgement's own digest says), and `a.acknowledged_at <= w.created_at` — an
acknowledgement written after the admission is one that admission cannot have ridden. Between two
acknowledgements it could equally have ridden (same figures, a different set shown), the **last one
before the admission** wins. A Work with no trade-invoice row — another lane's Work sharing an
intent key — now answers NULL, because the join has nothing to stand on.

Green afterwards, with `p1007.ack.recorded_anyway` and `p1007.ack.guards` still green beside it.

### ADV-1007-5 (note) — two acknowledgements to the same microsecond

Fixed with the above, plus a deterministic total order: `order by acknowledged_at desc,
ack_digest desc, id desc`. The digest is content, not a random primary key, so a reviewer's read
cannot answer differently from one call to the next. What remains is a tie between two
acknowledgements of the *same particulars* at the *same instant* — both true records of the same
choice — and that is stated in the file.

### ADV-1007-2 (major) — the probe was blind across a counterparty merge

**Reproduced first.** New cell `p1007.probe.across_a_merge`: a bill is recorded against a vendor,
`clara.merge_counterparties` (the estate's own shipped door) absorbs that vendor into a survivor,
and the probe naming the survivor answered `match_count 0` — the doubled payable #1007 exists to
prevent.

**Fix (0275 §2).** The matcher now walks the merge tree DOWN from `p_counterparty` with a
`with recursive` CTE over `merged_into` (`ix_counterparties_merged_into` indexes that edge) and
compares `ti.counterparty_id` against the whole family. It is one row wherever nothing was ever
merged, and a caller that hands in a non-canonical id still gets only its own sub-family, never
somebody else's. The cell also asserts the widening is **exactly** the merged family: a third
vendor that was never part of the merge still matches nothing.

### ADV-982-1 (major) — a shared TIN outranked the name printed beside it

**Reproduced first**, two cells: `p982.tin.shared_with_a_name` (a bill naming *Gamma Works* and
carrying a TIN *Delta One* and *Delta Two* share was refused with a chooser offering the two Deltas
and omitting Gamma Works — and that submission resolved cleanly before 0274) and
`p982.tin.shared_name_decides` (the name of one of the two TIN holders refused instead of
resolving).

**Fix (0275 §10).** The rule, written at the arm:

> An identifier that answers with SEVERAL parties has not identified anybody, so it does not
> outrank the name printed beside it — the estate's identifier-over-name tier law is about an
> identifier that ANSWERED.

- name matches exactly one party **and that party holds the TIN** → the two identifiers agree on
  it and the document resolves (the same rule (b3) already applies to a registration-matched row
  carrying the submitted TIN);
- otherwise → `party_ambiguous`, with candidates = every party the TIN reached **union** every
  party the name reached, each carrying `matched_on` ∈ `tin` | `name` | `tin_and_name`, and a
  sentence about the tax identification number rather than a count.

Everything else in that body is carried over byte for byte, including the NAME branch's
`party_ambiguous` detail shape, which is #982's own AC4. All nine `p982.*` cells green, the seven
pre-existing ones unchanged.

### ADV-1007-3 (minor) — the two probe doors disagreed on an archived client

**Reproduced first** (`p1007.probe.client_inactive`): with `clara.clients.status = 'archived'` the
human probe answered normally while the twin raised `CLR10 client_inactive`, so the form warned
about a recording the admission would refuse. **Fix (0275 §4):** the human door carries the
admission's own last arm, token and sentence identical, and the file's "the three doors can never
disagree" claim is true again.

### ADV-1007-4 (note) — untyped `23514` / `22007` from the acknowledgement writer

**Reproduced first** (`p1007.ack.typed_shape`). **Fix (0275 §8):** the writer restates
`clara._assert_trade_invoice_basis`'s own guards word for word — `invalid_total`
(required / integer / positive) and `invalid_due_date` (`constraint: "date"`) — before the insert.
The CHECK constraints stay: they are the belt, not the message. This matters because the route
calls this door FIRST and because it is the door the successor contract hands the chat lane.

### S-1 (blocker) — the form's probe spoke the wrong spelling

**The defect, restated:** `toTradeInvoiceWire(...).invoice` is camelCase (`documentDate`,
`totalCents`) and `clara._trade_invoice_probe_core` reads `document_date` / `total_cents`, so
"same money on the same day" — the signal that exists for a missing or mistyped number — could
never fire from the only shipped entrance, and `TradeInvoice.duplicate.signals.both` was
unreachable.

**Why the fix is a route and not a second translation.** `apps/web` deliberately does not depend on
`@clara/runtime`; `apps/web/lib/registers/fa-refusal-field.ts` states that rule in its own header
and keeps a hand-written MIRROR pinned by a test for exactly this situation. A mirror of the
admission's translation would be a second place to remember, which is the class of bug the review
just caught. So the probe moved onto the transport the admission already uses:

- **`POST /api/work/trade-invoice/duplicates`** (`packages/runtime/src/workRoutes.ts`) takes
  `{ clientId, kind, invoice }` — the SAME wire `invoice` the admission takes — runs the SAME
  `toDbTradeInvoice`, and asks `clara.probe_trade_invoice_duplicates_for` (actor-explicit: a
  `clara_runtime` connection carries no JWT claims, so `clara._human_ctx` cannot answer for it). It
  answers **200**; a refusal rides the admission's own `sendAdmissionError` with
  `TRADE_INVOICE_FIELD_DEFAULTS`, so the browser reads one vocabulary either way.
- **`probeTradeInvoiceDuplicates`** (`apps/web/lib/work/api.ts`) posts there instead of calling
  PostgREST, returns `[]` for any non-200, any unreadable body and a lapsed session, and no longer
  imports `callDoor`.

Drift is now structurally impossible: the object the probe sees IS the object the admission is
about to be sent.

**Driven, red first, at three seams:**

1. `apps/web/lib/work/api.test.ts` — `1007.web:` two cells, red against the PostgREST
   implementation (`NEXT_PUBLIC_SUPABASE_URL is not configured`), green after: the request goes to
   `/api/runtime/work/trade-invoice/duplicates` carrying the WIRE spelling, and every failure shows
   no warning without ever becoming a refusal.
2. `packages/runtime/tests/trade-invoice-e2e.mjs` **leg 8** (new) — the browser's own wire body,
   through the real route, against a real database: with NO number stated the earlier bill for the
   same money on the same day is reported with `signals: ["same_total_and_date"]`; with the number
   stated, both signals; a client with nothing recorded warns about nothing; nothing is admitted.
   **Green on all three runs that reached it** (see "Gates" for the legs that flaked on this host).
3. `apps/web/e2e/trade-invoice-walk.spec.ts` (new cell) — a bill stating no document number is
   warned about in a real browser on the money signal. The fixture was reworked for it: the control
   endpoint now plants **what the books hold** and `apps/web/e2e/trade-invoice-mock.mjs` DERIVES the
   answer from the particulars the browser actually sent, with the wire→database rename transcribed
   from `toDbTradeInvoice` and the two signals from `clara._trade_invoice_duplicate_matches`. A
   browser sending the wrong keys now gets no warning from the fixture either, exactly as it would
   from the real door — which is what the old canned list could never catch.

   **Shown red by a deliberate break**, which is also the sharpest statement of the original
   defect: with the fixture reading `wire.document_date` / `wire.total_cents` (the DATABASE
   spelling) off the wire body, the walk ran **1 failed, 14 passed** — the failing one being
   exactly the new money-signal cell, while the `same_reference` cell beside it stayed green. That
   is the bug's own signature. The fixture was restored byte for byte (md5 checked) and the walk
   is **15 passed** again.

**One honest consequence:** `clara.probe_trade_invoice_duplicates` (the session-scoped door) now has
**no shipped caller**. It is still granted, still proved by nine db cells, and it is the door a
signed-in surface uses when it already holds the database's own spelling. Retiring it would mean
rewriting most of the `p1007.probe.*` battery onto the twin, which is more than a fix round should
do — so it stays, and it is filed as a follow-up below.

### S-2 and S-3 (minor) — the screen said the wrong thing, and left something unsaid

- **S-2.** `party_ambiguous` raised from a TIN was answered with "More than one party answers to
  that name", about a name the submission never carried. The form now reads `detail.matched_on` off
  the refusal's generic carrier and picks the sentence from **one row of data**
  (`REFUSAL_BY_MATCH`, the shape `TRADE_INVOICE_FIELD_DEFAULTS` already has: a lane adds a row,
  never an arm). `TradeInvoice.refusals.party_ambiguous` is unchanged and still answers the name
  branch, byte for byte, with its own cell.
- **S-3.** Each candidate now renders which identifier reached it (`Matched the registration
  number` / `…tax identification number` / `…name` / `…both`), and **only** where the door said so
  — a value outside the four renders nothing, because an invented label would be a sentence the
  door never said. That makes CONTEXT.md's "with the identifier that reached each one" and the
  walk's comment true of the branch, and with ADV-982-1's union list the walk's assertion is no
  longer an accident of disjoint fixtures.

Both cells were shown **red against a deliberate break** of the subject (the sentence mapping
removed and the label element replaced by `null`) — exactly those two cells turned red and the
other three in the file stayed green — and the file was then restored byte for byte (md5 checked).

### S-5 (minor) — no screen read the acknowledgement

`clara.get_trade_invoice_duplicate_ack` existed, was granted and was proved, and nothing called it:
the ticket's purpose clause ("so a reviewer can tell a knowing second recording from an accident")
was true of the database and of no screen. Now the Work detail's trade-invoice block reads it
beside `clara.get_trade_invoice` and says who was warned and which earlier document they were
shown, by the number the BOOKS hold. A recording nobody was warned about says nothing at all, and a
FAILED read is indistinguishable from that — the page never claims a recording was *not* a
duplicate, and nothing on it is blocked by the read.

Three cells in `apps/web/components/work/work-detail.test.tsx`; non-vacuity shown by removing the
rendered block, which turned exactly the first one red (`settleUntil: timed out waiting for the
acknowledgement line to render`) and left the two negative controls green. Restored byte for byte
(md5 checked).

### STD-1 (minor) — `formatCents` and a hardcoded "RM"

Fixed: `formatMyr(m.totalCents)`, and `TradeInvoice.duplicate.entry` became `{reference} · {date} ·
{total}` — the only `"RM {value}"` hardcode in `en.json` and the only `formatCents` call in that
file are both gone. The rendered string is unchanged ("RM 1,060.00"), which the walk still asserts.

### S-4 (minor) — `expired` in the never-posting filter: ACCEPTED, and the risk refuted

The brief names refused / failed / cancelled; the filter also excludes `expired`. Kept, and the
direction that worried the reviewer ("it warns LESS often, which is the direction that loses a
duplicate") is **measured, not argued**: on this lane database, `clara.settle_work_run` lines 65–68
read

```
v_receipt := clara._work_committed_receipt(t.work_id);
if v_receipt is not null and p_outcome <> 'completed' then … v_outcome := 'completed';
```

— a Work holding a committed receipt is forced to `completed` whatever the run asked for (0178's
law). So a Work that POSTED can never terminalise `expired`, and excluding `expired` cannot hide a
posted bill; what it excludes is a parked run whose question died with it, which has no more chance
of posting than a cancelled one. `p1007.probe.never_posting` drives all four states plus a positive
control (a still-queued bill DOES match). **Recorded as an accepted deviation on the ticket rather
than as an acceptance criterion met verbatim**, as the reviewer asked.

### ADV-982-2 (note) — a TIN outranks a uniquely-resolving name, silently

No code change, as the finding itself concludes. Recorded in `packages/db/README.md`'s 0274 section:
a **name is never a conflict partner** on this lane; only the two identifiers are, and 0225 already
behaves this way for a registration number. If the owner wants name-vs-identifier disagreement to
stop too, that is a ticket. (It is now narrower than it was: a TIN that reaches SEVERAL parties no
longer outranks the name at all — ADV-982-1.)

### STD-4 (minor) — the earlier implementer killed three processes

Not a code defect and nothing to fix in the tree; the earlier implementer had already disclosed it
with exact PIDs. For this round: **I killed no process I did not start.** The only process I
stopped was my own backgrounded test run, through the harness's own task-stop. The lane's Playwright
triple was free.

## Two things this round found on its own, while proving S-5

Both were caught by running the file rather than by reading it, and both are worth the integrator's
attention because they are the kind of thing a new read introduces silently.

**1 · The new read would have hidden inside the door census.** `work-detail.test.tsx` carries a
census that pins, by name, every door the Work page opens: `get_document_state`,
`get_work_claim_origin`, `get_trade_invoice`, `work_knowledge_drift`, and **no other**. Two things
went wrong at once. The filter `tradeInvoiceCalls` matches `"/rest/v1/rpc/get_trade_invoice"` as a
SUBSTRING, and `get_trade_invoice_duplicate_ack` begins with exactly that — so the census cell
`624 AC4` went red counting two `get_trade_invoice` reads (measured, not feared). And my first cut
of the harness DEFAULTED `loadDuplicateAck` to `async () => null`, which made the red go away by
shielding every cell in the file from the component's own read — precisely the hole the census's
own comments warn about ("an unpinned exclusion is a hole a second read could hide in"). Both
fixed: the harness now mirrors `loadTradeInvoice` (inject or leave the real read in place), the two
filters no longer overlap, and `get_trade_invoice_duplicate_ack` is pinned by name at one read on
mount and not one more per tab press.

**2 · Three cells without `unmount()` hung the whole suite.** `work-detail.test.tsx`'s convention
is `try { … } finally { await h.unmount(); }` (48 unmounts for 27 renders). My three new cells did
not unmount, and a mounted `WorkDetailView` keeps a live handle: every test passed and the process
then never exited — which, in a single-process `node --test` over the whole manifest, stalls the
ENTIRE suite after this file. Bisected rather than guessed: the file at its pre-round state exits in
34 s; with the component change alone it exits in 33 s; with the three cells it ran to 55/55 and
then hung past 600 s. With the unmounts it is **55 pass, 0 fail, 34 s, exit 0**. The first whole-
suite run of this round was abandoned for exactly this reason and re-run clean afterwards.

**3 · One lint hit the runner would have caught and the rig would not.** An assertion message
beginning `"#1007's acknowledgement read…"` trips the raw-colour selector (`#` plus four
hex-looking characters, the case the rule's own message explains, #994's note). Reworded to
"ticket 1007's…", per the rule's own recommended fix. Caught by
`CI=true GITHUB_ACTIONS=true pnpm lint` before the report, which is what the wave-3 addendum asks
for.

## A rig repair I made, and must report

The first attempt at `packages/runtime/tests/trade-invoice-e2e.mjs` pointed
`WORKFLOW_POSTGRES_URL` at **`clara_l02` itself**. The engine failed to start (no `workflow`
schema) but not before it created a `graphile_worker` schema on the lane database — which is the
World contamination RIG.md warns about (#866): `rig-isolation.test.mjs` then reported **23 tests,
20 pass, 3 skipped**, T10b and T10b-AC2 skipping with "a Workflow/WDK World is bootstrapped on this
database".

I dropped that one schema (`drop schema graphile_worker cascade`, 6 tables, nothing in `clara`
depends on it) and re-ran: **23 tests, 22 pass, 0 fail, 1 skip** — the T19 poison-role skip alone,
which is the state the lane's own ticket report records. The reset flags were never set.

Every later runtime-World run used a **clone** (`createdb … template clara_l02` → `clara_rt_test`,
bootstrapped with `pnpm --filter @clara/runtime exec bootstrap`), per RIG.md's wave-2 addendum. The
clone is dropped at the end of this round.

## Gates, with counts

| gate | result |
|---|---|
| `packages/db` — `trade-invoice-duplicate-probe` + `trade-invoice-party-tin` + `trade-invoice`, **172-flag gate chain**, `clara_l02` | **52 pass, 0 fail, 0 skip** (was 46; +6 new cells) |
| `packages/db/tests/operation-census.test.mjs`, full gate chain | **10 pass, 0 fail** |
| `packages/db/tests/rig-isolation.test.mjs`, full gate chain | **23 tests, 22 pass, 0 fail, 1 skip** (T19 poison-role; reset flags never set) |
| 0275 FIRST-APPLY prestate branch, by hand in a rolled-back transaction | **clean, no REDO notice**; rollback restored everything |
| `packages/runtime` — `trade-invoice-unit` + `work-routes-unit` | **55 pass, 0 fail** |
| `node scripts/check-frozen-workflows.mjs` | **OK** — 312 frozen files, 55 `"use workflow"` modules, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK** — reader ⊇ emittable |
| `pnpm typecheck` (root) | **exit 0** (one `TS2532` in a new cell of `api.test.ts` was caught here and fixed) |
| `CI=true GITHUB_ACTIONS=true pnpm lint` (root) | **exit 0** (one raw-colour-selector hit in a new assertion message was caught here and reworded) |
| whole `apps/web` unit suite (`node scripts/run-tests.mjs`) | **4859 tests, 4857 pass, 0 fail, 2 skip, exit 0** (was 4851/4849/2; +8 new cells) |
| `apps/web/components/work/work-detail.test.tsx` alone, after the final reword | **55 pass, 0 fail, 34 s, exit 0** |
| `apps/web/components/accounting/trade-invoice-form.test.tsx` alone | **21 pass, 0 fail** (was 18) |
| `apps/web/lib/work/api.test.ts` — the two new cells | **2 pass, 0 fail** |
| `pnpm --filter @clara/web e2e trade-invoice-walk` on the lane triple (3510/3511/3512) | **15 passed** (was 14), exit 0 |
| `packages/runtime/tests/trade-invoice-e2e.mjs` (real World, on a clone) | **leg 8 green on every run that reached it**; legs 1, 2, 3, 5 green; legs 4/6/7 flaked on this host — see below |

The first whole-suite run was abandoned mid-flight (it stalled on the unmount defect above) and is
not counted; the figures quoted are from the clean re-run after the fix. One cell,
`[633]: an UNSETTLED receipt keeps a bounded watch…` in `documents-workbench-refresh.test.tsx` —
a file this round does not touch — failed in that abandoned run and passed in the clean one; a
contention flake, reported rather than "fixed".

**The runtime e2e, honestly.** Three runs. Run A: legs 1, 2, 3, **8**, 5 green, then leg 4's
respawned child never became ready. Run B: the engine did not become ready at all
("Re-enqueued 33 active run(s) on startup" — the clone had accumulated runs from the earlier
attempts). Run C, on a freshly re-cloned and re-bootstrapped database: legs 1, 2, 3, **8** green,
then leg 5 timed out at its 90 s poll with the Work still `running`. The flaking legs are the ones
that wait on the engine to drain, on a contended Windows host; **leg 8 needs only the HTTP door and
the database and passed every time**. Not fixed, reported as a host condition — this file is not in
the lane's gate set and nothing in this round touches the engine.

## Docs, in the same commits

- `packages/db/README.md` — 0275: the merged family, what a reviewer reads and how it is bound to
  the recording, the fix round (including why a #1007 file carries a #982 recut, with the rule
  quoted), and a redo-safety sentence that matches the file (STD-3). 0274: the two things its own
  frozen text no longer tells the whole truth about (the recut arm; and ADV-982-2's calibration,
  that a name is never a conflict partner).
- `CONTEXT.md` — "Identifier conflict" gains the ambiguous-identifier rule and one more `_Avoid_`
  ("a chooser that omits the party the document names"); "Probable duplicate" gains the merged
  family and one more `_Avoid_` (reading a warning kept against one recording as if it belonged to
  another attempt under the same key).
- `apps/web/README.md` — why the probe rides the runtime route rather than a door call of its own,
  the `matched_on` label and the TIN sentence, and the reviewer's acknowledgement line.
- `packages/runtime/README.md` — the new route, what it takes and why it exists.

## Successor contract — the amendments the wave-4 cut must carry

The lane's chat half is still delivered only as a contract; nothing frozen was edited
(`check-frozen-workflows.mjs`: no manifest diff). `reports/wave3-lane02-ticket1007.md`'s contract
stands, with these amendments:

1. **The probe call is unchanged** — `clara.probe_trade_invoice_duplicates_for(client, author,
   kind, particulars)`, same argument order. The particulars must be the DATABASE-spelled object
   (`tradeInvoiceFromInput(input)`), which is what the chat lane already builds; this round's S-1
   fix was about the browser, not about this door.
2. **Two new party refusals may now arrive from the probe as well as from the admission**:
   `party_ambiguous` can carry `detail.matched_on = 'tin'` and candidates carrying `matched_on`.
   The map needs no new token — the reason is unchanged — but a chat surface that renders a
   candidate list should say which identifier reached each candidate, as the form now does.
3. **`clara.record_trade_invoice_duplicate_ack` gains two more typed refusals**, both `CLR10` and
   both already in `TRADE_INVOICE_REFUSALS`: `invalid_total` and `invalid_due_date`. No new
   sentence is needed.
4. **The acknowledgement read is narrower**: `clara.get_trade_invoice_duplicate_ack(work)` now
   answers only the acknowledgement that recording actually rode. A chat surface that reads it gets
   the same guarantee the Work page does.

## Follow-ups worth filing

1. **`clara.probe_trade_invoice_duplicates` has no shipped caller** after S-1's fix. Either give it
   one (a signed-in "does this look like a duplicate?" panel that already holds database-spelled
   particulars) or retire it at the wave-4 cut and move the `p1007.probe.*` battery onto the twin.
2. **The probe runs on every submit** — one extra round trip before each recording, now through the
   runtime rather than PostgREST. A later ticket may want to skip it when the particulars have not
   changed since the last probe of this draft.
3. **Name-vs-identifier disagreement still resolves silently** (ADV-982-2). If Clara should stop
   there too, that is a product decision, not a fix.
4. **The Work page's four mount reads are four round trips.** `loadLinks`, `loadClaimOrigin`,
   `loadTradeInvoice`, `loadBatchOrigin` and now `loadDuplicateAck` each answer NULL for a Work
   they do not concern, and each costs one read. This round followed that pattern deliberately
   rather than gating the fifth on the fourth — consistency with the siblings, and the census that
   pins them, is worth more than one saved round trip — but a later ticket could fold them into one
   door.
5. **`trade-invoice-e2e.mjs` flakes on this Windows host** whenever a leg waits for the engine to
   drain. Worth a rig ticket: the 90 s poll budget and the 45 s readiness budget are both tight
   under contention.

## Anything unverified

- The three legs of `trade-invoice-e2e.mjs` that wait on the engine were not driven to completion on
  this host (above). Leg 8, the one this round adds, was.
- Nothing here proves the probe's behaviour at hosted data volumes; the rig's invoice counts are
  tiny, and the merged-family walk adds a recursive read whose cost at hosted scale is unmeasured.
- The browser walk's fixture still answers for PostgREST and for the runtime; it now derives the
  probe's answer rather than replaying one, but the **real** route's translation is proved by the
  runtime e2e leg, not by the walk.
