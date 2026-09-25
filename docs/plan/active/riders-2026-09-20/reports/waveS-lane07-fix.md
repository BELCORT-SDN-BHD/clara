# Riders sweep wave — lane 07, the fix round

**Branch** `riders/wS-lane07` (worktree `C:\Users\zhant\Desktop\clara-wt\659`, database
`clara_l09` at `127.0.0.1:55749`).
**Base** `7bc5a710f`. **Head before this round** `865fefe1f`. **New head `6705be0d1`.**
Working tree clean; nothing pushed, no PR, no GitHub write, no subagent, no other worktree touched
except this one report file in the main checkout.

Single fix worker for every review finding (`/implement-spec`). Thirteen findings were handed over:
five majors, seven minors, one smell. **Twelve are fixed. One major is refuted as lane work on the
strength of the spec reviewer's own `required_fix`, which says in terms "Do not re-open this in the
lane."** Every finding was reproduced on the live rig before anything was written.

## The seven new commits

| commit | what it closes |
|---|---|
| `1e42ef9db` | ADV-L07-03, ADV-L07-05 — the collation scanner's two blind spots, and the re-derived record |
| `6fb13cb6d` | SPEC-L07-1099-A — the reverse census that detects the NEXT ungranted-but-reserving writer |
| `01f66e811` | SPEC-L07-README-A — the two migration-less pins moved out of applied migrations' sections |
| `622e80553` | ADV-L07-07 — a half-rotated service token is answered 401, not 503 |
| `278155bcd` | ADV-L07-01 — the invite-preview rate notice stops publishing another party's wait |
| `cb94e7e5f` | ADV-L07-02, ADV-L07-06, ADV-L07-04, STD-1, SPEC-L07-1046-A |
| `6705be0d1` | SPEC-L07-1047-A, SPEC-L07-1047-B — the glibc `en_US.UTF-8` leg, run at last |

## The database was rebuilt, because redo could not reach 0348 or 0349

ADV-L07-02, ADV-L07-06 and ADV-L07-04 all require edits to **0348** and **0349**, which are this
lane's own unmerged migrations and therefore editable. `CLARA_MIGRATION_REDO` refuses anything that
is not the *highest* applied version (`packages/db/scripts/migrate.mjs:399-401`) and **0350** sits
above both, so the redo path could not be used and no hand ledger edit was made either.

Instead the documented **#867 recipe** (`packages/db/README.md`, "From-scratch reapply on a reused
cluster"), which the cut phase already used on lanes C1/C2:

1. `drop database clara_l09` (0 open backends, checked first);
2. `node scripts/role-census-reset.mjs --apply` — dropped the six post-0154 minted roles, cluster
   back to **14**, which is 0154's own pin;
3. recreated at `C.UTF-8` / `UTF8` / `datlocprovider = c`, matching the rig's own settings;
4. `pnpm --filter @clara/db migrate` → **313/313 applied**, `0001` → `0350_via_wake_kind_lane_disclosure`;
5. `pnpm --filter @clara/db seed` → 2 seed files.

Verification: a second `migrate` reports `0 new migration(s) applied · 313 total` and no drift;
`0295`'s checksum is the post-fix `5196d64d944e61ef836313cffd6bcc2d4dddd18bc808ca55f86e30544ecece0d`;
20 `clara%` roles. **This is also AC4's first leg** (below).

One real defect surfaced during that re-apply and was fixed before the chain went green: 0348's tail
T.1 pins `proconfig` exactly, so adding `set lock_timeout` made the file refuse itself. The pin is
now `search_path=clara, pg_temp,lock_timeout=3s`, which means a future edit that drops the bound
cannot ship either.

---

# Per finding

## ADV-L07-01 — major — the rate notice published another party's wait · FIXED

**Reproduced first**, on `clara_l09` inside a rolled-back transaction. Five loads of one token
planted under the *invitee's* origin digest, four minutes old; then
`clara.preview_invite_by_token('adv-oracle-token', sha256('attacker-ip'))` as a first-ever request
from a cold address:

```
attacker FIRST request against the loaded token : {"outcome":"rate_limited","retry_after_seconds":660}
attacker's own rows in the evidence table        : 0
attacker against an untouched token             : {"outcome":"not_previewable"}
```

`0309_invite_preview_public_door.sql:461-499` computes each limb's wait independently and advertises
the **maximum**, with no `scope` field — its own comment says naming the limb "would tell a prober
which of two budgets it exhausted". The wait is that same disclosure by arithmetic: 900 − 660 = 240
dates the other party's fifth-oldest load to the second.

**The fix takes the ticket's own second alternative.** #1095 AC asks for "a wait time **or** a 'try
again' affordance"; the affordance is the half that was genuinely missing (before #1095 a rate
refusal rendered *nothing*, identically to a transport failure), and it costs no oracle.

- `apps/web/lib/firm/invite-preview-public.ts` — the outcome type carries **no** number. `indefinite()`
  takes all three reasons again and `rateLimitedOutcome()` / the `waitSeconds` import are gone, so the
  leak cannot be reintroduced by a rendering change. The runtime's own `Retry-After` header is
  untouched, which is where a machine reads it.
- `apps/web/components/invite-accept-form.tsx` — one wait-free notice.
- `apps/web/messages/en.json` — the copy no longer says "We checked **your** invitation too many
  times", which is false for a third-party token limb and for anyone behind a shared NAT. Two keys
  became one; the diff against base is a single added key at the sorted position, verified with an
  independent scanner (no duplicate key, brace depth 0 at EOF), never `JSON.parse`.
- `apps/web/README.md` — the CORRECTED paragraph now states the decision and the measurement.

**Also fixed on the way:** with the wait gone the old ICU message would have rendered
"Wait **NaN** seconds". The new cell pins that by name.

**Cells** (both seen RED first):
- `p871.web.preview: a rate refusal is its own reason and carries NO wait, whatever the door said` —
  drives three 429 bodies (47 s, 3600 s, absent) and asserts no number reaches the seam.
- `p871.web.signed_out: the rate-limited notice carries no number and does not accuse the visitor` —
  reads the notice **paragraph itself** (a slice of the page had hidden the accusing opening clause,
  which is why the first cut of this cell passed vacuously) and refuses any digit, any `NaN`, and any
  "we/you checked".

15/15 green across the two files.

## ADV-L07-02 — major — the prune could shut the whole pre-session auth wall · FIXED

**Reproduced first**, three connections on `clara_l09`:

```
C (an unrelated wall write, no conflict with A): {"ok":false,"code":"55P03","ms":3003}
B (the queued prune):                            {"ok":true,"ms":3411}
```

A held an ordinary open INSERT into `clara.confirmation_attempts` (RowExclusive only); B called
`clara.prune_confirmation_attempts` and queued for ShareRowExclusive; C then drove a **completely
unrelated** wall write — different digest, different origin, no row conflict with A — and was
refused `55P03` after 3003 ms, blocked by **B's queued request**, not by A. Without its own
`lock_timeout`, C would simply have waited as long as A lived.

**Fixed at the function, not at the caller** (the bound has to hold for every caller, including an
operator holding `clara_fn_owner`): both 0348 verbs carry `set lock_timeout = '3s'` as a SET clause
beside `search_path`, pinned by the tail. `packages/runtime/lib/reconciler.mjs` tolerates the
resulting `55P03` exactly as it already tolerates `42883`, so a skipped sweep is a silent no-op and
the belt retries next cycle. 0348's header and the `## 0348` README section now state the real
bound (the slowest concurrent `RowExclusive` holder, amplified by the queue) instead of "as long as
the batched delete takes".

## ADV-L07-06 — minor — the prune silently downgraded an `ENABLE ALWAYS` trigger · FIXED

**Reproduced first**, inside a rolled-back transaction: `tgenabled` `'O'` → `enable always` → `'A'`
→ one call to the verb → back to `'O'`.

Each verb now reads `tgenabled` before the disable and restores **exactly what it found** — `'A'`,
`'R'`, `'O'`, and `'D'` too, because a guard an operator deliberately turned off is not this verb's
to turn back on — returns it as `trigger_posture` on its own result envelope, and refuses (`CLR10`)
if the trigger is absent altogether rather than deleting from a table whose append-only guard has
moved. The guarantee is now stateable in one line: **this verb never changes the posture, in either
direction.** Both catalog comments, 0348's header and the README section say so.

## STD-1 — smell — four near-identical batch-delete loops · FIXED (the fix was small and bought something)

`pruneBatched(client, { sql, params, batch, maxBatches, tolerate, contain, lane })`, called four
times. It was worth doing beyond tidiness because the *variance* is now data, and the tolerance and
containment policies ADV-L07-02 and SPEC-L07-1046-A needed were then one field each rather than four
edited copies.

The two original lanes keep their contract byte for byte: `prune_trace_spans` tolerates nothing,
`prune_work_execution_traces` tolerates `42883`, both rethrow anything else.

## SPEC-L07-1046-A — note — a mis-set margin aborted the whole belt · FIXED with it

The two riders are `contain: true`: anything they raise that is not tolerated is recorded as a named
lane error and the sweep carries on, so a `CLARA_RATE_WALL_ATTEMPT_RETENTION_MINUTES` below 15 no
longer costs the trace-prune counters (the belt's fallback is `{ pruned: 0 }`) and no longer skips
the sibling lane. `pruneTraces()` returns `errors`, and the sweep logs each one with the existing
`[reconcile] <name> error:` idiom — every cycle, never de-duplicated — and pushes it onto
`beltErrors`, so a contained fault still reaches the receipt.

**Cells** (`packages/runtime/tests/reconcile.test.mjs`, driven at `pruneTraces()` with a REAL second
connection holding the REAL lock; nothing stubbed):

- *a rate-wall table locked by somebody else is SKIPPED, not queued, and its sibling still sweeps* —
  `errors` empty, 0 deleted, the row survives, elapsed bounded **above** (< 30 s, it gave up) **and
  below** (≥ 1.5 s, it really queued and really hit the 3 s timeout; a lane that never attempted the
  lock would return in milliseconds and pass an upper bound alone), the **sibling** lane sweeps its
  own stale row, and the next call — lock gone — deletes the row.
- *a misconfigured rate-wall margin is reported by name and does not take the belt down* — a margin
  of 1 minute yields exactly two errors, `invite preview attempts: CLR10 …` and
  `confirmation attempts: CLR10 …` (so the first lane's fault did not skip the second), while
  `res.pruned >= 1` and the 100-day span it counted really is gone.

**Vacuity control:** with `'55P03'` removed from the tolerated list and `contain: false`, both cells
fail with codes `55P03` and `CLR10`; `reconciler.mjs` restored byte for byte (`git diff --stat` back
to the intended change only) and 13/13 green again.

## ADV-L07-03 — major — the scanner was blind to the array-verdict idiom · FIXED

**Reproduced first:** `scanSqlText()` on the whole of `0220_firm_knowledge_defaults.sql` and
`0132_f_a5b_pr1_sandbox_export.sql` returned `[]`, although both aggregate an ordinary text column
ordered by itself and pin the result against `array[…]`.

`pinReason()` recognised a verdict only when its right-hand side began with a quote, an `E'` or a
`||`. It now also reads an **array constructor**, which pins the order exactly as hard, and returns
the verdict's own `members` with the finding.

**The record was re-derived with the widened instrument, which is the substance of the finding:**

| | files | movable keys |
|---|---|---|
| first cut | 37 | 66 |
| re-derived | **56** | **99** (61 in 34 applied migrations, 38 in 22 batteries) |

Twenty files were newly found, plus one moved (0038 gained six `m[1]` keys) and one shrank
(`f-t1-sst-reference`, because `rolname::text` is now correctly free). **Every one is an applied
migration or a battery, so every one is RECORDED with its reason; none needed the lane's contingency
migration 0351, which returns unused.** The `packages/db/README.md` completeness claim is corrected
to what the instrument covers, and the first cut's numbers are recorded beside it so a reader can
see what changed and why.

**The live half grew two cells**, one of them the general instrument this needed:

- *every ARRAY verdict an applied migration pins sorts identically under both collations* — 33
  verdicts today, their members read **back out of the file by the scanner**, never hand-copied.
  This is the only way to prove 0038's four document CHECK censuses at all: a migration tail runs
  against the schema at its own point in the chain, and a later migration renamed their subjects, so
  no live query at head can reach them.
- *the free `%_id` list is a measured fact: no name on it is a text column* — the closed list is
  checked against the live catalog instead of asserted in a comment.

Four live value sets were added for the new sites (0220's knowledge keys, 0129's per-kind wake
roster, 0139's `statutory_deadlines` constraint names as text, 0290's table-grant grantees).

**A real hazard was measured on the way and is now in the README:** the quoted tokens of *every*
`clara` CHECK constraint DO move between the two collations — `cancel_requested` against `cancelled`
in `agent_tasks_status_check`, `op_key` against `open` in `clara._abandon_close_core`'s own body. The
sets the estate actually pins escape only because none of them holds such a pair. That is luck with
a guard around it, which is why the rule is a rule.

## ADV-L07-05 — minor — `classifyOrderKey` hard-freed aliases and `%_id` · FIXED

`k`, `n`, `i`, `o` are gone from the integer cohort (`k` is this estate's own
`jsonb_object_keys(…) k` TEXT alias at 0132:1545), and the generic `%_id` spelling is gone from the
identifier cohort. **Measured on the live catalog:** `clara` carries about forty TEXT `%_id` columns
— `stripe_session_id`, `stripe_event_id`, `run_id`, `trace_id`, `span_id`, `event_id`, `receipt_id`,
`logical_op_id`, `engine_id`, `bundle_id` … — every one of which sorts under the database collation.
The free set is now the closed list `id`, `account_id`, `account_set_version_id`,
`constant_version_id` (`id`: 220 uuid, 6 bigint, 2 boolean, no text), re-measured live by the cell
above.

`grantee::text` gained the opposite treatment: a `name` cast to text keeps `C`, which the
portability battery already proves with `pg_collation_for`, so 0127's three sites are correctly free
rather than recorded.

**Vacuity control for both scanner cells, run against the pre-fix module (git HEAD's own text):**
`scanSqlText(arrayVerdict)` returns `[]`, `classifyOrderKey('k')` returns `integer/free`,
`classifyOrderKey('stripe_session_id')` returns `identifier/free`, `classifyOrderKey('grantee::text')`
returns `unresolved`. Every new assertion would have been red.

## ADV-L07-04 — major — the #1132 disclosure named an outcome the body cannot write · FIXED

**Re-measured on the live `prosrc` with line comments stripped**, and it was wrong in three ways at
once — plus a fourth the review did not name:

| claim | truth |
|---|---|
| writes `refused_budget` | **never.** 3 occurrences, all inside comments recording that the 15-drafts/day cap was retired |
| the ten inserts write five outcomes | **four**: `noop_existing` ×4, `refused_attempts` ×2, `skipped_lane` ×3, `refused_concurrency` ×1 |
| success is `admitted` or `re_admitted` | **three** tokens: the CASE also returns `re_admitted_after_withdrawal` |
| — | `already_done` is recorded as `noop_existing` (the fourth, not in the review) — so **three** returned outcomes wear a coarser label, not two |

The catalog comment and the `## 0349` README section now carry all of it, including the
coarser-label table.

**And the disclosure is now measured rather than remembered.** New cell
`p1132.disclosure.agrees_with_the_live_body` derives the four written outcomes (the first quoted
literal in each `values(...)` is the `outcome` column — positions 0–4 are identifiers, never
literals) and the success CASE's tokens **from the live body**, and requires the comment and the
README to name each, to name the three coarser-label pairs, and **not** to present a phantom outcome
as one this function writes. Since this disclosure IS the whole deliverable of #1132, it is the one
place in the file where drift from the subject is fatal.

**Vacuity control:** the pre-fix comment text was put back on the function; the cell failed naming
`re_admitted_after_withdrawal` and the sibling cell failed on `op_receipts`. Restored from 0349's own
bytes and verified `live comment === 0349 file text: true`; 4/4 green again.

## SPEC-L07-1099-A — major — AC2's mechanism could not detect the next case · FIXED

The registry added by the first cut is hand-maintained, and the META cell only walks names somebody
remembered to write down — a forward check over the known, not a detector for the unknown.

The **reverse census** now sits in the G4/[R2-F8] cell, where both sets were already computed: every
WB-family fn whose live `prosrc` calls `_reserve_op`, **minus** the grant-derived writer inventory,
**minus** `RESERVE_LAW_EXEMPT`, must be a subset of `UNGRANTED_RESERVING_FNS`, and is named by name
with the remedy otherwise.

Measured at 313 migrations: `writers` = 31, `reserving` = 26, and the difference is exactly
`{create_client}` — the #1038 case itself and nothing else. The cell asserts that floor too, because
an empty difference would mean the instrument stopped working rather than that the hazard went away.

**Vacuity control:** with `UNGRANTED_RESERVING_FNS` emptied the cell fails with
`UNGRANTED-BUT-RESERVING writers that no census covers any more: create_client`; file restored
(`git diff --stat` = 31 insertions, the new cell only), 4/4 green.

## SPEC-L07-1047-A and SPEC-L07-1047-B — minors — the named collation pair and the from-scratch chain · FIXED

The required fixes assigned both to the integrator. They are done here instead, because a disposable
cluster turned out to be cheap and because "unverified" was the weakest line in the lane's report.

**Why the rig could not do it:** the lane's WSL cluster refuses
`create collation (provider = libc, locale = 'en_US.UTF-8')` with "No such file or directory", even
though the host's `locale -a` lists `en_US.utf8` and `LC_ALL=en_US.UTF-8 locale charmap` answers
`UTF-8`. The locale archive is dated after the cluster's postmaster started, and glibc caches its
mapping per process. Restarting a cluster I did not start is out of bounds, so the battery had been
falling back to ICU `ka-shifted`.

**What was run instead.** `sudo pg_createcluster 17 rigl7g -p 55708 --locale=en_US.UTF-8 --start`
(a process this worker started, on a free port below 55772, dropped afterwards with
`pg_dropcluster --stop`; `pg_lsclusters` shows no `rigl7g`):

| leg | cluster | result |
|---|---|---|
| `C.UTF-8` | the lane rig, rebuilt by the #867 recipe | **313/313** from scratch, `0001` → `0350`; second migrate 0 new, no drift |
| glibc `en_US.UTF-8` | disposable `rigl7g` | **313/313 from scratch**; then `collation-pin-portability` + `collation-pin-scan` **21/21** green |

The comparator on that cluster was measured explicitly, not inferred:
`{"glibc_flips":true,"under_c":false,"under_default":true}` — the real
`provider = libc, locale = 'en_US.UTF-8'` collation creates, and it reorders 0295's own pair
(`taxation` before `tax_liabilities`) while `C` does not.

The second leg is the stronger one for a reason worth keeping: on that cluster the **database
default** is `en_US.UTF-8`, so the battery's own "this server's default ordering already differs from
C" control was itself taken under glibc and still passed at every recorded site. A `C.UTF-8` rig
cannot say that. Recorded in the `## Collation and pinned order (#1047)` README section as a table.

## SPEC-L07-README-A — minor — two paragraphs inside applied migrations' sections · FIXED

The sweep plan's rule is absolute ("Your own new `## NNNN` section only. Never edit an existing
section") and seven lanes edit this file in the same wave. #1096 and #1099 own no migration and so no
section; both paragraphs now live in one new section at the end, each naming the section it belongs
with, with the deictic references that only worked in place ("this migration", "the disclosure
above") resolved to 0316 and 0318 by name.

`git diff 7bc5a710f -- packages/db/README.md` now shows exactly **two** hunks: the new collation
section at 409 and the append at the end. No existing section is touched.

## ADV-L07-07 — minor — the rotation note said 503 where it is 401 · FIXED

Verified against source: `invitePreviewRoutes.ts:91-100` and `authWallRoutes.ts` answer 503 only when
`CLARA_AUTH_WALL_SERVICE_TOKEN` is unset or blank; a token that is set but does not match is answered
`401 {"error":"unauthorized"}` by `bearerMatches` (`authWallRoutes.ts:76-83`). The note now carries
both cases in a table with **what the runtime log prints for each** — the 401 prints nothing, because
a bearer mismatch is an ordinary refusal, which is exactly the trap — and what each renders for the
visitor (`confirmation-wall.ts`'s `{kind:"unavailable"}` for any non-200/429;
`invite-preview-public.ts:222`'s `indefinite("transport")`).

## SPEC-L07-1098-A — major — REFUTED AS LANE WORK, on the reviewer's own instruction

The finding's own `required_fix` opens: **"Do not re-open this in the lane."** It asks for three
things outside the lane's hands, and the lane already did the one thing inside them.

- The backfill is real and the marking is right; the residual is **driven, not asserted**, and still
  is: `p1098.residual.a_committed_plan_still_refuses_the_answer` re-run on the rebuilt database,
  6/6 green.
- The gap is disclosed in 0347's header, in the `## 0347` README section and in the ticket report.
- Closing it needs a **reopen door or a scoped answer path for a committed plan**, which changes what
  a commit means. That is an owner product decision and its own ticket with its own migration number,
  which is exactly what the lane declined to take on its own authority (work-order rule 5).

**Owed to the orchestrator, not done here** (the reviewer assigns all three):

1. File the follow-up the ticket's own alternative branch asks for. The one question, in plain words:
   *may a committed firm-setup checklist still be COMPLETED for a question it was never asked, while
   never being AMENDED for a fact it attested to?*
2. Do **not** close #1098 as fully satisfied on the strength of the backfill alone.
3. Quote the residual cell in the closing comment.

---

# Gates

All on `clara_l09` at 313 migrations unless stated.

| gate | result |
|---|---|
| `packages/db` — `collation-pin-scan`, `collation-pin-portability`, `rate-wall-attempts-retention`, `admit-autodraft-task-outcome-disclosure`, `firm-setup-committed-tin-backfill`, `entry-post-receipts-via-wake-kind-disclosure`, `knowledge-onboarding-promotion`, `wave-b/wb-g-opkeys` (full gate chain) | **61 pass, 0 fail, 0 skip** |
| `packages/db` — `operation-census`, `rig-isolation`, plus the six census files #1047 touches (`firm-document-limits-writer`, `firm-portfolio-pack`, `plan-overlap-template-arm-retired`, `preview-invite`, `coa-template-pr-b`, `subledger-hook-caller-roster`) | **129 pass, 0 fail, 1 skip** (the known RIG.md `rig-isolation` skip) |
| `packages/runtime` — `reconcile.test.mjs` | **13 pass, 0 fail** |
| `packages/runtime` — `reconcile-belt-isolation-unit`, `chat-clarify-sweep-wiring` (with `CLARA_SPOOL_DIR` at a per-run temp dir) | **32 pass, 0 fail** |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK |
| `FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` | OK — 322 frozen files, no manifest diff |
| `apps/web` — whole unit suite (`node scripts/run-tests.mjs`) | **5174 pass, 0 fail, 2 skip** (5176 tests, 142 suites) |
| `apps/web` — `tests/firm-scope-db-pins.test.ts` (sweep rule d: a migration file changed) | **22 pass** — the census pins none of 0347–0350 and did not move |
| `pnpm typecheck` | Done, clean |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** |
| from-scratch chain, `C.UTF-8` | 313/313, second migrate 0 new, no drift |
| from-scratch chain, glibc `en_US.UTF-8` (disposable `rigl7g`, dropped) | 313/313, then collation batteries 21/21 |

No browser walk is owed: `apps/web/e2e/members-invite-walk.spec.ts` queries the `ok:true` preview
block only (`spec:404`), which neither the lane nor this round touched.

Known Windows-only reds: none hit this round.

# Shared files, as edited

| file | this round's hunk |
|---|---|
| `apps/web/messages/en.json` | one key at the sorted position (was two); scanned independently for duplicates, depth balanced |
| `packages/db/README.md` | **two hunks against base**: the lane's own new `## Collation and pinned order (#1047)` section, and the append at the end; no existing section touched |
| `packages/db/tests/` six census files | unchanged this round |
| `packages/db/package.json`, `packages/db/tests/rig-meta.mjs`, `apps/web/test/manifest.txt` | untouched — no new test file, no new gate module, no new minted name |
| `packages/runtime/lib/runtime-contracts.mjs`, `rollback-preflight.mjs`, CI workflows, `RIG.md`, `frozen-workflows.json`, `CONTEXT.md` | untouched |

# For the merger

- **0348 and 0349 changed**, so any lane pinning their bytes must re-measure. Nothing outside this
  lane does: `apps/web/tests/firm-scope-db-pins.corpus.ts` pins neither (re-run, 22/22).
- **`packages/db/tests/collation-pin-scan.mjs` and the record moved a long way** (66 keys over 37
  files → 99 over 56). `RECORDED_SITES` is keyed by path, so a lane that edits a battery in the
  record will show as MOVED rather than merge-conflict; the refusal names the file and says what to
  write. L1 owns `plan-overlap-template-arm-retired`, which this lane still touches only at the one
  `collate "C"` hunk from the earlier round.
- **`pruneTraces()` returns a new `errors` key.** The only caller is the sweep in the same file.
- **Migration 0351 (the #1047 contingency) is unused** and returns to the orchestrator. No overflow
  number from 0360+ was needed or taken.

# Anything unverified

Nothing material. Two things a reader should know are bounded rather than absolute:

- The `3s` `lock_timeout` is a judgement call, not a derived constant: an uncontended prune measures
  5 ms and the belt retries every cycle, so the slack is generous, but a permanently busy table would
  be swept late rather than never — the counters and the log line are how that would show.
- `IDENTIFIER_KEY_NAMES` is a closed list derived from what the corpus orders by today. A future
  census ordering by some other `%_id` will be reported as a NEW site rather than silently freed,
  which is the conservative direction, and the live cell stops the list itself from quietly
  acquiring a text column.

# Mid-task messages

None arrived.
