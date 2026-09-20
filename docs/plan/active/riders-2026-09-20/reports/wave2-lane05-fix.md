# Wave 2, lane 05 (document intake) — fix round

- **Branch** `riders/w2-lane05`, worktree `C:\Users\zhant\Desktop\clara-wt\655`, db `clara_l05` @ 127.0.0.1:55745.
- **Base** `23cfad947b5598214168ba9c43d391b4e16aa745` · **head before** `aa67d0ee8` · **head after** `1d91c1a92714be44bdc04529939b7bfee20c312d`
- **Tickets** #964, #968, #965. Single fix worker (`/implement-spec`): every review issue below was fixed by one implementer, in vertical slices, red before green.
- Nothing pushed, no PR, no GitHub write, no other worktree touched. This report is the one file written in the main checkout.

## Commits added by this round

| commit | what |
|---|---|
| `8f7741da0` | `fix(db): #968 the re-issue exception's membership test is scoped to THIS firm` |
| `6d67675d6` | `fix(db): #964 the fourth shipped door on the same ceiling moves to MYT too` |
| `96ec44256` | `test(db): #968 a preintegration gate and a loud-fail guard, so a skip stops being evidence` |
| `d537c5421` | `fix(db): #965 0254 stops asserting #964's window, and the README names where the ceiling lives` |
| `937a8ae15` | `fix(web): #965 the batch card stops contradicting what the database now does` |
| `4b991c6a0` | `fix(web): #965 the receipts list phrases the DB's failure code instead of printing it` |
| `2e9d1d1dd` | `docs: #968/#965 CONTEXT says "of this firm", and where the ceiling actually lives` |
| `1d91c1a92` | `fix(web): the two SQL censuses can read this lane's migrations again` |

## How the three unmerged migrations were re-applied

`CLARA_MIGRATION_REDO` (#957) admits **only the highest applied version**, and this lane's frontier is
0254 — so 0252 and 0253 could not be redone through it. The route used instead, recorded because it is
a hand step:

1. **0253** (its splice text changed). `clara.cancel_intake_batch` was restored to its pinned 0229
   pre-image by REVERSE SUBSTITUTION of the landed replacements, and the restore was verified against
   0253's own pin `18f5b8d5…` before anything was written — a wrong restore writes nothing. The
   0253/0254 ledger rows were then deleted and the **ordinary apply path** re-ran both. The edited file
   therefore ran through exactly the route a from-scratch chain takes, not a special one.
2. **0252** (a new §E; §A–§D unchanged). The 0252/0253/0254 ledger rows were deleted and the ordinary
   apply path re-ran all three: §A–§D skipped as redo-over-own-effect, §E spliced, 0253/0254 skipped.
3. **0254** (tail text only). `CLARA_MIGRATION_REDO=0254_intake_refusal_record` — the supported path,
   because 0254 *is* the frontier. New checksum `e233d61e…`.

A plain `node scripts/migrate.mjs` afterwards reports `0 new migration(s) applied · 232 total`, i.e. the
ledger checksums match the files on disk.

**Content shas re-measured after the edits** (they are pinned by the web census, see L05-WEB below):

| file | sha256 |
|---|---|
| `0252_document_ingest_window_myt.sql` | `44f6326f5d528702e7319192b1ebfdd8c7cc6c794ed1933f2a549424f164b728` |
| `0253_batch_cancel_reissue.sql` | `c8ad1b9c5645f660f4f80fb711a10b71b9a9457a155357cfc358c7603520a462` |
| `0254_intake_refusal_record.sql` | `e233d61e67d33c19a339b15612f6973e0461da88bd10af4f18c51af420e1f3ef` |

Prestate pins are unchanged for §A–§D / 0253 / 0254 (`074c9b18…`, `41528b31…`, `b72d83e7…`,
`b23cbc01…`, `18f5b8d5…`, `09784b31…`). §E adds one new pin, MEASURED on `clara_l05`:
`clara.settle_ingest_reservation(uuid,integer,text)` = `a7b8d4eeed2c17bfaf252fe73e2185c78255ce4d1e10fac2b933619ff50a9aab`.

---

## Findings, one by one

### ADV-W2L05-01 / L05-SPEC-08 — #968, major — **FIXED**

**Reproduced.** The new cell
`p968.reissue.blocked_canceller_active_at_another_firm_is_still_replaced` (bob removed from firm A,
inserted ACTIVE bookkeeper at firm B — the only shape `uq_membership_active_user` permits) failed RED
against the landed body with `CLR13 'this intake batch is already stopping under another decision'`,
while the board still read `cancel_blocked='canceller_not_active'`. That is exactly the adversarial
probe, reproduced through the ordinary test fixtures.

**Cause, restated.** `clara.cancel_intake_batch` is SECURITY DEFINER (owner `clara_fn_owner`, whose
`p_firm_memberships_owner` policy qualifies `true`), so its copy of the read's predicate saw EVERY
firm's `clara.firm_memberships`; `clara.get_intake_batch` is INVOKER, so `p_firm_memberships_human`
already confines it to `firm_id = clara.jwt_firm()`. Copying the read's BYTES did not copy the read's
MEANING.

**Fix.** 0253's `v_r1` gains `and fm.firm_id = v_firm`, with the reasoning spelled out in the body
comment, the file header and the function comment. Two hardening changes ride with it:

- §A's "already at target" probe now requires **both** replacements, so a half-landed body falls
  through to the pinned pre-image check and fails loudly instead of being waved past.
- §T gains **T1b**, which asserts the firm scope on its own, separately from T1, so the reason is
  readable without reading the guard.

**It opens no authority.** `clara._intake_batch_actor_ctx` still proves the CALLER is an active
bookkeeper+ of the batch's own firm before any of this is reached, and the door is no more permissive
than before for any identity of this firm.

**Green:** all five `p968.reissue.*` cells pass on the full gate chain, 0 skipped.

### L05-SPEC-01 — #964, major — **FIXED**

**Reproduced.** Measured on the live catalog: `clara.settle_ingest_reservation(uuid,integer,text)` —
SECURITY DEFINER, `{clara_fn_owner=X,clara_runtime=X}` — still carried
`and created_at >= (date_trunc('day',now() at time zone 'utc') at time zone 'utc');` and its own
`coalesce(l.pages_per_day,1000)` / CLR18 `actual pages exceed daily limit`. It is not a wrapper: its
sibling `clara.resize_ingest_reservation` delegates to the helper §B moved, this one counts itself.

A closed-world scan of every `clara` function naming `document_ingest_reservations` **and**
`pages_per_day` shows exactly four bodies with a day window; this was the fourth.
`clara._reserve_processing_call` names both but deliberately carries **no** budget at all (F-A9 PR-1B,
"meter, never cap"), so there is no fifth.

**Fix.** 0252 §E, same discipline as §A–§D: own prestate pin, one anchor proven to occur exactly once,
`AS $function$` boundary check, reverse substitution back to the pre-image, ACL re-read. The header now
says FIVE bodies, not three, and names why this one needed its own section.

**And the class of defect is closed, not just the instance.** §T gains **T2c**, a CENSUS: every `clara`
body reading `document_ingest_reservations` and `pages_per_day` is re-read for **either** spelling of
the UTC idiom (`date_trunc('day', now()` and `date_trunc('day',now()` — the missing space is precisely
how this door slipped past a four-name tail) and the set must be empty. T2b pins the fourth door's own
clause exactly once; T6 pins its ACL.

**Red first:** `p964.window.mechanism_myt — settle_ingest_reservation …` failed on the landed chain
with "does not carry the Asia/Kuala_Lumpur window clause", green after §E. File now 6/6, 0 skipped.

**Consequence handled:** §E adds a fifth CoR patch, so `scripts/wiki-lint-checks.mjs`'s
`DYNAMIC_SQL_ALLOWLIST` gains a `settle_ingest_reservation(uuid,integer,text)` entry with its
rig-measured relations/calls, and the selftest's key ratchet moves 19 → 20.

### L05-SPEC-03 / ADV-W2L05-04 — #968, major — **FIXED**

`0253` shipped with no preintegration gate module and no gate-chain entry, so the four
`p968.reissue.*` cells were **skip-only**: on a chain missing 0253 they reported four green skips and
nothing anywhere failed.

- `packages/db/tests/batch-cancel-reissue-preintegration-gate.mjs` added, setting
  `CLARA_ALLOW_MISSING_BATCH_CANCEL_REISSUE`, on the shape of its two siblings.
- `packages/db/package.json`'s chain gains it in **migration order** (after `document-ingest-window-myt`,
  before `intake-refusal-record`): 52 → 53 entries.
- `intake-batch.test.mjs`'s `before()` now throws when the `batch_cancel_reissue$` stem is absent AND
  that variable is unset. `gateReissue()` stays for the sweep's own slice-frontier skip, exactly as the
  other two stems do.

**Vacuity control (work order rule 4).** With `REISSUE_STEM` temporarily pointed at a stem no migration
carries: the focused run FAILED LOUDLY in `before()` with the new message; the same run **with** the gate
module preloaded skipped all five cells cleanly. The file was then restored from a byte-for-byte copy
taken before the probe.

I note the Standards axis (F3) argued no fix was needed here, on the precedent of #964's own in-file
per-cell gate. I disagree with that reading and followed the work order's house shape instead: #964
itself ships a gate MODULE as well as its in-file cell gate, and the two other reviewers both rated the
omission major. The in-file gate is kept; the module is what makes a missing 0253 loud.

### ADV-W2L05-02 / L05-SPEC-02 — #965, major — **FIXED**

`IntakeBatch.residual.preIntakeRefusal` told every user, unconditionally, that a file refused by the
daily quota "never joins a batch". 0254 made that false — the refusal commits its intake at
`failed`/`limit` and the runtime attaches it as an `awaiting_capacity` wait, so the very card carrying
the sentence now lists such a file. Recut to what 0254 does: the record is kept, it shows as waiting for
the quota, none of its bytes were stored, upload it again; it still points at the upload list that
renders the database's own message and remedy. Both cells that pinned the retired claim
(`intake-batch-card.test.tsx`, `lib/documents/batch-url-state.test.ts`) were recut with the reason
written down.

### ADV-W2L05-03 — #965, major — **FIXED**

`IntakeBatch.capacity.body` promised quota-blocked sources "keep their place and continue after the
reset". **Nothing performs that**, and I checked the whole path rather than the one the finding named:
the refusal takes no reservation and mints no capability; `beginDocumentIntake` returns before
`writeIntakeMeta`, so there is no sidecar; and `recoverPendingDocumentIntakes` re-drives only
`RECOVERABLE_STATES = ["spooled","canonical","received","verifying","verified","duplicate"]`
(`packages/runtime/lib/intake.mjs:532`) — `failed` is not one, so the **post-custody** capacity wait is
not resumed either. The banner now states the remedy the firm actually has. New cell
`intake batch card: a quota-refused source is never promised an automatic resume (ADV-W2L05-03)`
renders a refused-at-creation member (both banner triggers set) and asserts it.

### L05-SPEC-04 — #964, minor — **FIXED**

The card's `?? "00:00"` / `?? "Asia/Kuala_Lumpur"` fallbacks are **gone**, not re-pointed. The copy is
now two strings: `capacity.reset` carries the door's own `{at}`/`{zone}` and renders only when the door
supplied them; `capacity.body` carries what is true whatever the moment is. No local constant is left
for the next window move to come back for, which is what the AC was written to stop. The catalogue cell
asserts no clock time appears in either string.

### L05-SPEC-05 / ADV-W2L05-09 — #964, minor — **FIXED**

All four surfaces recut: `apps/web/README.md`'s capacity paragraph (rewritten to the MYT-midnight fact,
plus a new paragraph on why the copy promises no resume); `packages/runtime/lib/intake-batches.mjs`'s
"wait for 08:00"; `packages/runtime/README.md`'s "one UTC day"; and
`apps/web/lib/documents/batch-url-state.test.ts`, whose TITLE and two failure messages asserted the UTC
day is correct. The cell keeps the reason that survives the move — the moment comes from the door, never
a constant — and now also pins both post-#965 facts. A sweep for `08:00` / `utc_day` / `UTC day` across
the intake surfaces leaves only correctly-framed historical references ("moved off", "until", "used to").

### L05-SPEC-06 — #965, minor — **FIXED (as documentation, which is what it asked for)**

`packages/db/README.md` now says plainly that the durable home of WHICH ceiling refused a file is the
append-only `clara.audit_log` row (and the op receipt), never `clara.document_intakes`, which carries
`failed`/`limit` and nothing separating documents from pages. It gives the exact query, RUN on the rig:
it joins the audit row's `args->>'intake'` back to the intake row, because the audit args carry
`intake, op_key, origin, reason, ceiling, refused` and the file's own identity stays on the record. The
CONTEXT entry, which claimed the record "names which of the two ceilings refused it", was corrected.
**Owner question left open and named in both places:** whether `document_intakes` alone SHOULD answer it
— that is a new column and a new ticket.

### L05-SPEC-07 — #965, minor — **FIXED**

Refused files now reach the Documents tab's durable upload list with no web change, and the row rendered
the literal token `limit`. The phrased next step already existed in `ClientDocuments.queueFailure`; only
the reach was missing. The closed map and its honest default moved out of `upload-panel.tsx` into
`apps/web/lib/documents/failure-advice.ts`, and both surfaces read it — they are two views of ONE
nine-value vocabulary. New file `components/documents/intake-receipts.test.tsx` (added to
`test/manifest.txt` at its sorted position) proves the phrased sentence renders, the raw token does not,
every one of the nine codes carries its own phrase, and an unknown code names ITSELF in a sentence.

### ADV-W2L05-05 — #965, minor — **FIXED**

0254's tail T4 required `clara._reserve_document_ingest` to carry #964's Asia/Kuala_Lumpur window, so
0254 hard-failed on any chain carrying #965 without #964 — a dependency both tickets declare out of
scope, with a message that reads like prestate drift on a body #965 promises never to touch. T4 now
asserts only what this file actually depends on: the two CLR18 sentences its exception arm parses with
`get stacked diagnostics`. The window is #964's to assert. The header's non-goal line says so.

### ADV-W2L05-06 — #965, minor — **FIXED**

`scripts/wiki-lint-checks.mjs`'s load-bearing count said EIGHTEEN while the map held nineteen, and the
growth log omitted #965/0254. It now says TWENTY (§E is the twentieth) and names every contributor
including #965/0254 and #964's fix-round fifth; `check-wiki-dynamic-sql.selftest.mjs`'s key ratchet and
its prose moved with it. Both scripts green.

### ADV-W2L05-07 — #964, minor — **FIXED (stated, which is what it asked for)**

0252's header and `packages/db/README.md` now carry the transition paragraph: the boundary moves EIGHT
HOURS EARLIER, so at the instant 0252 commits, reservations created between 00:00 and 08:00 MYT of the
current day move from "yesterday" into "today", and a firm inside its ceiling one second before the
deploy can be refused one second after it while the card names a reset that has already passed for that
day. It is a one-time transition, not a defect — no quota changes and the next MYT midnight resets
everything — but the release has to be able to explain the first refusal: **apply outside 00:00–08:00
MYT where the schedule allows, and carry the paragraph into the as-run where it does not.**

---

## Found while fixing, not in any review report

### L05-WEB — this lane broke two repo-wide SQL instruments, and the #964 report said otherwise — **FIXED**

`wave2-lane05-ticket964.md` recorded the apps/web unit suite as "4749 tests, 4719 pass, 28 fail — all 28
independently verified pre-existing". **Seven of those 28 were not pre-existing.** Measured decisively:
moving 0252/0253/0254 out of `packages/db/migrations` and re-running the four census files gives 83/83
green; putting them back gives 7 red.

1. **`apps/web/test/sqlFunctionCensus.ts`** threw
   `sql_function_census_unresolved_execute:0252_…:v_head || 'AS $w964rsv$' || …` on every CoR splice in
   all three files. It admits an oid variable bound by `to_regprocedure('clara.f(…)')` but not by
   `'clara.f(…)'::regprocedure` — and the **cast is the spelling the repo's other gate requires**,
   because `scripts/wiki-lint-checks.mjs`'s WB-R21 attribution treats a function-call RHS as
   deliberately unattributable. This lane's own earlier commit `475e8ce35` moved the migrations to the
   cast for exactly that reason, so the two gates contradicted each other. The census now admits the
   literal cast, which names its target exactly as strongly; a cast of a VARIABLE is deliberately still
   refused. Clears 5 cells across `do-action-floors`, `capabilities`, `members-doors`.
2. **`apps/web/tests/firm-scope-db-pins.corpus.ts`** had no `REVIEWED_DYNAMIC_SQL_BARRIERS` entry for
   any of the three, so the successor census threw "unreviewed dynamic-SQL barrier at 0252_…" and
   stopped walking — which is why only 0252 was ever named although all three needed one. Three entries
   appended at the sorted position, each naming its closed roster of recut functions, why no
   `create view` of any spelling is reachable, and the anchor/reverse-substitution discipline, with the
   sha256 measured over each file's content **after** this round's edits. Clears the remaining 2 cells.

### L05-CARD — `IntakeBatch.cancelBlocked.body` named only the PRE-#968 workarounds — **FIXED**

The banner a firm sees when a stop cannot finish said: restore that person's membership, or stop each
remaining work item from its own page. #968 shipped a better remedy **at the door**, and the Stop button
was already reachable — so the copy sent the firm the long way round past the product's own answer. It
now names pressing Stop again first, keeping both fallbacks. Red first on the `ADV-636-03` cell.

### L05-RIG — `intake-batch.test.mjs` poisons its own shared world — **PARTLY FIXED, follow-up named**

`p636.batch.sweep_settles` asserts its batch is on the sweep's **20-row** worklist, ordered by
`cancel_requested_at`. Several cells in the file (including `p636.batch.cancel_blocked_after_revocation`
and the `p968.reissue.*` family) walk away from a permanently-`cancelling` parent, and the world is
shared and long-lived — so every run of the file taxes that worklist. The lane rig had accumulated **38**
such parents and the cell went red on rig drift, not on code. My new cell now finishes what it starts
(fans its decision out and settles the child, through the same doors the belt would use), and the stale
parents were settled on the rig. The underlying isolation gap is **pre-existing and not fixed**: it is
not this lane's ticket, and the honest repair is either per-cell cleanup in the other cells or a
worklist limit that does not depend on how often the file has run. **Follow-up worth filing.**

---

## Gates, with counts

| gate | result |
|---|---|
| `packages/db`, full 53-entry gate chain: `document-ingest-window-myt` + `intake-batch` + `intake-refusal-record` + `operation-census` + `rig-isolation` | **80 tests, 79 pass, 0 fail, 1 skipped** |
| — the 1 skip | `T19 poison-role` in `rig-isolation`, which needs `CLARA_RIG_ALLOW_RESET`; RIG.md forbids setting it. Documented, not new. |
| `node scripts/migrate.mjs` (integrity re-check) | `0 new migration(s) applied · 232 total` — ledger checksums match the files |
| `packages/runtime`: `intake-refusal-unit` + `intake-batch-unit` + `intake-recovery-unit` | **29 tests, 29 pass, 0 fail, 0 skipped** |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files, no manifest diff |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — no new emittable or part kind |
| `node scripts/check-wiki-dynamic-sql.mjs` | OK — 1410 definitions, 219 CoR patches, **20** justified waivers |
| `node scripts/check-wiki-dynamic-sql.selftest.mjs` | OK — including the twenty-key ratchet |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4752 tests, 4730 pass, 20 fail, 2 skipped** |
| — the 20 failures | **all one pre-existing defect**, see below |
| `apps/web` `check-test-manifest` / `check-message-keys` | 496 files listed, in order; 4343 keys resolve |
| `pnpm lint` (repo) | **exit 0** |
| `pnpm typecheck` (repo) | fails on **two pre-existing errors only**, both `document-kind-dialog.tsx:95` |
| `pnpm --filter @clara/web e2e intake-batch-walk` on the lane triple | **could not run** — blocked at `next build` by the same defect |

### The one blocker that is NOT mine, stated precisely

`apps/web/components/documents/document-kind-dialog.tsx:95` references `DOCUMENT_KINDS` while line 35
imports only `CLASSIFIABLE_DOCUMENT_KINDS`. It:

- fails `pnpm typecheck` (`TS2552` + `TS7006`);
- fails `next build`'s TypeScript check, which **blocks every browser walk on this base**, this lane's
  included;
- reds **20** apps/web unit cells (19 are the `ReferenceError: DOCUMENT_KINDS is not defined` verbatim;
  the 20th is `[878] the DETAIL surface's classify Select also stops offering a kind the door always
  refuses`, the cell that exists to catch exactly this).

It is present at this lane's base `23cfad94` and was introduced in **wave 1**: `origin/main`'s copy of
that file imports `DOCUMENT_KINDS` at line 35. **Deliberately not fixed here** — it is another lane's
file, every wave-2 lane hits it, and ten lanes editing one line is a worse integration outcome than one
central fix. The fix is one token: line 95 should map `CLASSIFIABLE_DOCUMENT_KINDS` (which is what the
`[878]` cell demands), not re-add the unfiltered import.

## Docs updated in the same commits

- `packages/db/README.md` — the four-body MYT move and its census proof; the one-time transition
  paragraph; where the refused file's ceiling is durable, with the query.
- `apps/web/README.md` — the capacity copy's rule (the door's moment, no local constant) and the
  no-resume rule.
- `packages/runtime/README.md` — the World leg's daily window.
- `CONTEXT.md` — "Batch cancellation re-issue" (membership read **of this firm**, and the _Avoid_ for the
  canceller who left for another firm); "Refused intake record" (the ceiling lives in the audit trail;
  nothing re-reads the record).

## Successor contracts

None. No frozen chat or Work tool needed anything from this round: the doors' signatures, argument
order, refusal mapping and part kinds are all unchanged.

## Residuals and follow-ups worth filing

1. **`clara.get_intake_batch`'s `cancel_blocked` predicate is firm-scoped only by RLS.** Behaviour is
   correct today (INVOKER + `p_firm_memberships_human`), and the door now evaluates the same thing
   explicitly — but the read's own text does not say so, and the next person to copy it into a
   SECURITY DEFINER body will reintroduce exactly the defect ADV-W2L05-01 found. Worth a ticket to spell
   the scope in the read as well; it needs its own migration and is out of this round's scope.
2. **ADV-W2L05-08 (note) — the re-issue re-stamps `cancel_requested_at`. Decided deliberately: KEEP.**
   It is a genuinely new decision, and its actor, key and moment belong together; the ORIGINAL moment
   stays readable for ever in `clara.audit_log`. The cost is real and named: the sweep orders by
   `cancel_requested_at`, so under a saturated limit a re-issued batch is served last, and the board's
   "stopping since" shows the new moment. If the owner wants the board to show the original, that is a
   read-envelope change and its own ticket.
3. **`intake-batch.test.mjs`'s accumulating `cancelling` parents** (L05-RIG above).
4. **The `failed` facet on the batch card still renders raw task/failure tokens** (`storage_error`
   appears verbatim in the card's rendered text). That is #636's surface, predates this lane, and is the
   same class as L05-SPEC-07; not fixed here because no finding named it and it is not this lane's
   ticket.
5. **`document-kind-dialog.tsx:95`** — above. Needed centrally before any wave-2 lane's browser walk can
   run.

## Anything unverified

- **No browser evidence for this round's web changes.** `intake-batch-walk` cannot build on this base
  (defect above). The copy is proven by unit cells only. The walk's own capacity assertions ("00:00"
  present, no "midnight", no "tomorrow") hold byte for byte under the new copy, so it should pass
  unchanged once the build is fixed — unverified until it runs.
- **`packages/runtime/tests/intake-batch-e2e.mjs`** (the World leg) was recut by #964 and #965 and has
  still not been run: it is a standalone script needing a bootstrapped World, and RIG.md forbids
  bootstrapping one on a lane database (#866). Unchanged by this round.
- **The §E splice has no dynamic cell driving `clara.settle_ingest_reservation` across a real
  boundary**, for the same reason the other three have none: nothing in this estate can move `now()`.
  The evidence is the live prosrc, the reverse-substitution proof, and the tail census — the same
  standard #964 shipped with, now applied to four bodies instead of three.
