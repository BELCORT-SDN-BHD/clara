# Wave 2 · Lane 02 — fix round over the three review reports

**Lane theme:** knowledge keys and the audit log. **Tickets:** #898, #913, #993, #912, #991.
**Branch:** `riders/w2-lane02` · **worktree:** `C:\Users\zhant\Desktop\clara-wt\636` ·
**database:** `127.0.0.1:55742/clara_l02` (233 applied, frontier `0243_audit_actor_role`).
**Base:** `23cfad947b5598214168ba9c43d391b4e16aa745` (everything below diffs `BASE..HEAD`).

**New head: `a618d6e631ee132da9b7fde261bde1a82b4e2d2f`.**

Reviews answered: `wave2-lane02-codereview-spec.json` (8 findings), `wave2-lane02-review-adversarial.json`
(8 findings), `wave2-lane02-codereview-standards.json` (1 finding). **17 findings, all answered:**
1 blocker fixed, 3 majors fixed or refuted by measurement, 6 minors fixed/refuted, 6 notes
fixed/narrowed/handed off, 1 smell kept with a reason.

## Resume: what the killed worker had already landed

The worktree was CLEAN on arrival — no half-finished edit to judge, nothing to complete or revert.
The previous fix worker's finished parts were already committed as the eight commits
`e492c1e5f..fc3fbe4f2`; it was killed before it wrote this report. I re-read every one of those
commits and their diffs, re-ran their gates on the live lane database rather than trusting their
commit messages, extended rather than replaced their work, and then carried on with what was left.

### Fix-round commits (newest first)

| commit | findings | what it does |
|---|---|---|
| `a618d6e63` | (a red gate no review reached) | `fix(web)`: the P4 successor census now reviews 0240's splice — **mine, this session** |
| `fc3fbe4f2` | ADV-04 | `docs(db)`: why the viewer floor is not a loosening, and what the register says for `none` |
| `1d2321daa` | SPEC-L02-06, ADV-08, SB-991-01 | `test(db)`: pkc.3 walks the criterion's whole matrix; the census header says what it reaches |
| `a976b4030` | SPEC-L02-03 | `fix(web)`: the register says "no membership" in words, never the raw marker |
| `3ec46fe82` | ADV-03 | `test(db)`: fd.06 — where the impossible year-end is actually refused, and what is left owed |
| `0044989db` | SPEC-L02-01 | `revert(db)`: restore 0242's bytes — a non-highest applied migration cannot be edited |
| `aa4bc4512` | SPEC-L02-01 | `test(db)`: kg.05 pins the recorder's body instead of pattern-matching a hash |
| `30b734cca` | ADV-06, ADV-05, ADV-07, ADV-02 | `fix(db)`: no insert can assert a role the database did not measure (0243 redone) |
| `e492c1e5f` | ADV-01 | `test(db)`: ar.02 claims the mechanism, not this rig's row count |

## Adversarial lens

### ADV-01 (blocker, #912) — ar.02 pinned a row count only this rig has · **FIXED** (`e492c1e5f`)

`assert.ok(nulls > 60000)` was true only of `clara_l02`, whose NULL population is the batteries the
lane ran between applying 0240 and applying 0243; on a from-scratch chain 0243 lands before the seed
and the population is in the hundreds. ar.02 now mints its own subject and states the claim
relatively: count the NULL population, insert one real backdated row (the shape a plain-dump restore
replays through COPY) and prove it is NOT handed a role, prove it cannot be back-filled later
(CLR08 "audit_log is append-only", attempted as `clara_fn_owner`), prove a row claiming to happen NOW
is stamped (the control that shows the trigger was armed), then prove the NULL population grew by
EXACTLY one. No environment constant survives in the cell. Verified by re-reading
`packages/db/tests/audit-actor-role.test.mjs:158-211` and re-running the battery (below).

### ADV-02 (major, #912) — the role is resolved at the audit write, not at admission · **ANSWERED as the review's second option** (`30b734cca`)

The review offered a carry (a txn-local GUC set by `clara._human_ctx`) or plain words. The carry is
impossible here and that was measured, not argued: every function between admission and the write is
a pinned member of the frozen `metric_input_snapshot` v1 producer closure. Re-measured by me on
`clara_l02` from `clara.metric_input_producer_version_members`: `clara._human_ctx(integer)` (ordinal 2),
`clara._reserve_op(uuid,text,text,bytea)` (2, 7), `clara.role_rank(text)` (3), `clara.jwt_sub()` (4),
`clara.jwt_firm()` (5), `clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)` (5, 10),
`clara.actor_role_rank()` (6). `scripts/migrate.mjs`'s FREEZE_GUARDS refuse a migration that recuts
any of them.

So the column says what it is, in all four places the finding named, and one cell pins it:

- the live column comment (read back from `col_description` on `clara.audit_log.actor_role`):
  "the role `actor` held in `firm_id` **AT THE AUDIT WRITE**, inside the act's own transaction …
  Resolved when the audit row is written, not when the door admitted the call: a role change that
  COMMITS between the two is what this column then reports";
- 0243's header section "WHEN THE ROLE IS RESOLVED, EXACTLY";
- `packages/db/README.md`'s #912 section;
- `CONTEXT.md`'s new **Role at the act** term ("measured at the moment the act is recorded, not at
  the moment the door admitted the call");
- **ar.07** drives the two-connection race live (a bookkeeper's `correct_knowledge` parks on a row
  lock, the caller is promoted and commits, the audit row reads `owner`) with the unraced capture
  beside it reading `bookkeeper` so the cell cannot pass vacuously.

This is a deliberate, documented, pinned property, not a silent one. It is the one finding whose
resolution is "stated, not fixed", so it is listed under *owed ratification* below.

### ADV-03 (major, #898) — Knowledge accepts 31 February · **REFUTED on the accounting half, the ticket clause recorded as owed** (`3ec46fe82`)

Reproduced exactly as reported (`capture_knowledge(financial_year_end_month => 2)` then
`(financial_year_end_day => 31)`, both `captured`). Refuted by measurement on the live lane database:

- `clara.set_client_fy_end(client, 2, 31)` — the door to `clara.clients`, the row every fiscal-year
  read derives a date from — refuses with CLR37 `{"reason":"fa_particulars_invalid","axis":"fy_end"}`,
  "a financial-year end must be a real calendar day"; `(2, 28)` is accepted. No impossible year-end
  can become the authoritative fact.
- Nothing reads `financial_year_end_day` out of Knowledge (grepped outside `packages/db/migrations`
  and their tests: no hits), so the finding's "any read that derives a year-end date now has an
  impossible one" has no such read to name today.
- The product path refuses it at answer time: `validateFyeDay` in
  `packages/runtime/workflows/interview.v4.questions.ts` is month-aware.

What is NOT refuted is #898's own "Desired behavior" clause (see SPEC-L02-04): **fd.06(d) pins the
disagreement** (knowledge says 31, the client row says 28, nothing reconciles them) so the follow-up
has to come back and change that assertion deliberately. A cross-key refusal cannot be built in this
lane: it needs a new statement in 0240, which is no longer the highest applied version, so the #957
redo path is closed to it (`scripts/migrate.mjs:396-401`).

### ADV-04 (minor, #912) — the viewer floor on a `clara.audit_log` fact · **REFUTED, written down for ratification** (`fc3fbe4f2`)

The measurement the finding did not make: `p_firm_memberships_human` is `firm_id = clara.jwt_firm()`
with NO rank floor and `clara_authenticated` holds SELECT on `clara.firm_memberships`, so "what role
does this colleague hold in my firm" is already a viewer-readable fact at the table that owns roles.
The bookkeeper floor on `clara.audit_log` protects the LOG (which acts ran, by whom, with what
arguments and outcome); `promoter_role_at_act` discloses none of that — one role word, about the
promoter of a rule the same viewer is already shown, beside `promoter_role_now`, which that viewer
can read from `firm_memberships` directly. Nothing was loosened: 0243's own tail asserts
`p_audit_log_human`'s qual is byte-unchanged and refuses if it moved. The argument lives in
`packages/db/README.md` so the owner can ratify or overrule it on the evidence.

### ADV-05 (minor, #912) — `none` stamped on rows with no actor at all · **FIXED** (`30b734cca`)

A fourth token, `no_actor`, now carries "this act names nobody"; `none` keeps its defined meaning
(a NAMED actor held no active membership). `clara.role_rank()` is NULL for both, so neither can be
compared as authority. Verified by reading the live `clara._tf_audit_actor_role()` body back off
`pg_proc`: `if new.actor is null then new.actor_role := 'no_actor'; return new; end if;` before the
roster lookup, and `new.actor_role := coalesce(v_role, 'none')` after it. The column comment and the
`CONTEXT.md` term carry both words. *Rig-history note, not a shipped state:* `clara_l02` still holds
40,395 rows stamped `none` from before the redo, ~39k of which name no actor. Those rows were minted
by this lane's own batteries between the first apply of 0243 and its redo. A from-scratch chain and
the hosted apply have no such population (pre-existing rows stay NULL; only inserts after the trigger
exists are stamped, and they are stamped by the corrected body).

### ADV-06 (minor, #912) — a backdated insert kept a supplied role · **FIXED** (`30b734cca`)

The history arm now CLEARS the column (`new.actor_role := null`) instead of returning the row
unchanged, so `at` is no longer a dial an insert can turn to assert an authority. The worry about
doing that is answered by measurement inside the migration: `pg_dump` emits triggers in POST-DATA,
after the data, so `scripts/restore.mjs` loads `clara.audit_log`'s COPY before the trigger exists and
every restored row keeps the role the dump carried. ar.06 covers the three escapes (supply a role,
backdate the row, be a second writer) with its own control.

### ADV-07 (note, #912) — the sole-writer census matched one exact spelling · **FIXED** (`30b734cca`)

§Z and ar.05(a) now share a case-insensitive regex over the comment-stripped body tolerating
whitespace and an optional schema qualifier, and ar.06(c) is its CONTROL: a real second writer spelled
the other lawful way, created and censused inside a rolled-back transaction.

### ADV-08 (note, #991) — the census enumerates only `clara%` roles · **NARROWED, with the measurement** (`1d2321daa`)

The header's claim is narrowed to the naming convention it depends on, beside the measurement (on
`clara_l02`: 34 roles, 18 `clara`-prefixed, zero non-superuser application roles outside the prefix).
The filter is KEPT deliberately and the file says why: an exclusion list would have to name the
managed roles of every environment this runs in (hosted Supabase carries more than this rig), and a
census that goes red on a platform role is one people learn to ignore.

## Spec lens

### SPEC-L02-01 (major, #993) — AC4 proved by a measurement compared against nothing · **FIXED in the review's own preferred home** (`aa4bc4512`, `0044989db`)

kg.05 now compares the recorder's live `prosrc` sha256 against the literal 0230 produces,
`8f745815512727bbedfa01f25e66177a066574c461f964574d120b532ac8fc79`, and re-asserts in its own terms
that the recorder still runs the grammar literal `^[a-z][a-z0-9_]{0,62}$` that 0242 copied into both
catalog CHECKs. The pin is portable, not a rig fact: `0230_knowledge_retrieval.sql` is the only file
that creates the recorder and none recuts it. Vacuity control recorded in the commit: with the pin
flipped to 64 zeroes the cell fails with "#993 must not move one byte of the recorder" (10 pass /
1 fail), then the file was restored byte for byte.

**The residue, and why it is a handoff and not laziness.** The same commit also reworded 0242's header
and tail comments, and `node scripts/migrate.mjs` refused: *"applied migration
0242_knowledge_key_grammar was MODIFIED after being applied (checksum drift)"*. 0242 is no longer the
highest applied version (0243 is), and the #957 redo path refuses anything below the frontier —
`scripts/migrate.mjs:396-401`, *"redo refused: … is not the highest applied version … redoing anything
below the frontier would silently invalidate whatever was applied on top of it"*. A comment-only edit
is still an edit as far as the ledger's checksum is concerned, and leaving it would have blocked every
later redo of 0243 on this rig. So 0242 was restored byte for byte (its file sha256 `cf9fc9a2aeb9e953…`
matches its `clara.schema_migrations` row today) and `packages/db/README.md` was corrected instead.
**The exact comment replacement is handed to the integrator below** — it is comment-only, so it is
safe on the from-scratch chain the integrator runs.

### SPEC-L02-02 (minor, #912) — `clara._audit` was named, a table trigger was built · **recorded in the repo; GitHub write owed**

The substitution is written down where a reader of the code will find it: 0243's header (including
*"an earlier draft of this file DID recut `_audit` and the runner rolled the whole migration back"*),
`packages/db/README.md`'s "0243 — the role at the instant of a governed act (#912)" section, and the
battery's own header. I re-measured the compulsion myself (the frozen-member list under ADV-02).
What is still owed is the ruling-vocabulary comment on issue #912 — a GitHub write, which work-order
rule 2 forbids this lane.

### SPEC-L02-03 (minor, #912) — `none` reached the firm register untranslated · **FIXED** (`a976b4030`)

kf.14 first (red for the right reason: 14 pass / 1 fail, the wording absent), then one message key at
its sorted position in `apps/web/messages/en.json` and one conditional in
`apps/web/components/registers/knowledge-firm-panel.tsx`; 15/15 after. The sibling marker `no_actor`
gets no wording, and the reason is measured rather than assumed: `clara.knowledge_records.asserted_by`
is NOT NULL and the authority subquery matches `a.actor is not distinct from r.asserted_by`, so an
audit row with no actor can never be the one cited. Note the review called `none` unreachable; it is
reachable *at the audit write* (ADV-02), which is why the wording was built rather than the
unreachability recorded.

### SPEC-L02-04 (minor, #898) — "never disagree silently" is not delivered · **RECORDED as unmet; follow-up owed** (`3ec46fe82` pins it)

Stated plainly here because the #898 ticket report is not a file this run may edit: **#898 does not
deliver its "Desired behavior" clause "a client's day on the client row and in Knowledge never
disagree silently", and the clause is owed, not done.** fd.06(d) now pins the disagreement the estate
allows today. The follow-up should cover BOTH keys (`financial_year_end_month` has the identical gap)
and pick one of: `set_client_fy_end` and a `financial_year_end_*` capture reconcile, or a read
surfaces the disagreement. Filing it is a GitHub write this lane may not make.

### SPEC-L02-05 (minor, #991) — "already satisfied" was half true · **corrected here; queueing owed**

Corrected verdict: the owner's answer IS recorded on #991 in the Wayfinder's words; the issue is NOT
queued for that pass (no milestone, no label, no cross-reference). That half is **owed, and not mine
to do — work-order rule 2 forbids the GitHub write.**

### SPEC-L02-06 (note, #991) — the leak control was narrower than the criterion · **FIXED** (`1d2321daa`)

pkc.3 now walks three leaks in three rolled-back transactions — `clara_authenticated` on
`get_knowledge_pack`, `clara_agent_ro` and `clara_wake_interactive` on `retrieve_knowledge` — across
TWO enumerated functions, so the finding's `function` field is proved to follow the leak instead of
being a constant, and a wake role is exercised as the criterion's own words require.

### SPEC-L02-07 (note, #912) — an unasked index on `clara.audit_log` · **no change; named for the release notes**

The index is `ix_audit_log_knowledge_revision on clara.audit_log (firm_id, (args ->> 'revision_id'))
where args ->> 'revision_id' is not null`, created with `create index if not exists` inside 0243's
transaction, and 0243's tail refuses if it is absent. **Hosted-apply note the release notes should
carry:** this is plain (not CONCURRENTLY — it cannot be, inside a migration transaction), so the build
holds a SHARE lock on `clara.audit_log` and blocks audit-row INSERTs — that is, every governed act —
for its duration. The same section also runs `alter table clara.audit_log add column actor_role text`
(fast: nullable, no default) and `add constraint ck_audit_log_actor_role` (validates every existing
row under ACCESS EXCLUSIVE). Local scale for calibration: 189,302 rows on `clara_l02`, apply plus redo
both well under the migration timeout; hosted `audit_log` is larger, so the window should be sized
before the apply rather than discovered during it.

### SPEC-L02-08 (note, #898) — the #898 report cites an fd.01 assertion that no longer exists · **corrected here**

Corrected evidence line for #898 AC1 (the ticket report is not a file this run may edit): AC1's
"typed and validated the same way, at the same scope and floor" is carried by **fd.01** (kind,
value_shape, `validated_against='range:day_1_31'`, `allowed_values=null`, `authority_bearing=false`,
`min_role='bookkeeper'`) **plus fd.04 plus sd.03**; the scope half moved to **sd.03** when this lane's
own #913 (`0241_knowledge_scope_default_drop.sql`) dropped `clara.knowledge_keys.scope_default`.

## Standards lens

### SB-991-01 (minor, smell) — duplicated `executors()` · **KEPT, with the reason** (`1d2321daa`)

The reviewer called it a judgement call; I agree with the previous worker's decision and add one
argument. (1) `has_function_privilege` probes appear in many batteries in this directory, each
carrying its own; for a census that IS the proof of a security boundary, an instrument shared with
another battery can be weakened by an edit made for that other battery's reasons. (2) The two copies
genuinely differ: the new one takes the connection so pkc.3's control can see an uncommitted GRANT.
(3) The extraction would land in a shared fixture module while nine other lanes are editing this
directory in the same wave — exactly the collision work-order rule 7 exists to avoid. The new file's
header names `f-a2-grants.test.mjs`'s `executors()` as the same instrument, so the relationship is
stated, not hidden.

## What I found that no review reached: one red gate, fixed

`apps/web/tests/firm-scope-db-pins.test.ts` was **20 pass / 2 fail** on this branch, both failing with
`unmodelled: unreviewed dynamic-SQL barrier at 0240_financial_year_end_day.sql — the successor census
cannot prove this migration unrelated`. That census walks every migration after each P4 scope view's
pinned body looking for a second `create view`; a migration whose dynamic SQL its lexer cannot resolve
must be admitted BY NAME, with a review reason and the sha256 of the file's content, because admitting
it silently would let a later recut of `clara.caller_context` or
`clara.firm_registration_requests_visible` hide behind an `execute`. #898's §B splice is exactly such a
barrier and the ticket landed no entry.

Fixed in `a618d6e63` by adding the entry at the sorted position (the Map's key order is load-bearing:
the census compares it to the corpus's file-sorted `blockedAt`). The entry is a review act and says
what was measured: 0240's only dynamic SQL is the one do-block that recuts
`clara._knowledge_assert_value(text,jsonb)` at its exact regprocedure literal; that function RETURNS
VOID and its live body contains no CREATE VIEW of any spelling (measured on `clara_l02`:
`prosrc ilike '%create%view%'` → 0 rows), and the file itself contains no `create view` of any
spelling, so neither P4 scope view is reachable from it by construction. sha256 over the file's content
is `c75d8d8e388452174af4227c2773fc4a65b69245fefc6a1fbdf4e43529bcd67d` — the same number
`clara.schema_migrations` recorded when 0240 applied here, because `.gitattributes` forces LF and the
ledger's own recipe normalises CRLF to LF. **22/22 after.**

No other lane migration needs an entry: with 0240 admitted the census walks 0241, 0242 and 0243
without blocking, which is what the green run proves. No pin elsewhere keys on a lane migration's
content sha (grepped `0243` across `packages`, `apps` and `.github` outside `packages/db/migrations`:
only prose and the cohort gate).

## TWO INHERITED BLOCKERS — the wave-1 head is red before this lane touches it

Both are at `BASE` in files this lane never touched, both break gates every wave-2 lane must run, and
both have a one-line fix I measured. **Neither is committed here** (work-order rule 5, scope), so the
integrator should land them once for the whole wave.

### 1. `pnpm typecheck` is red — `apps/web/components/documents/document-kind-dialog.tsx:95`

```
components/documents/document-kind-dialog.tsx(95,22): error TS2552: Cannot find name 'DOCUMENT_KINDS'.
components/documents/document-kind-dialog.tsx(95,42): error TS7006: Parameter 'k' implicitly has an 'any' type.
```

These are the ONLY two errors in the repo. Proof it is inherited:
`git show BASE:apps/web/components/documents/document-kind-dialog.tsx` carries the identical line 95,
and `git diff BASE..HEAD -- apps/web/components/documents apps/web/lib/documents` is empty. The same
`ReferenceError: DOCUMENT_KINDS is not defined` reds **20 unit cells** across five files
(`document-kind-dialog`, `document-kind-control`, `documents-url-state`,
`document-detail-live-refresh`, `documents-workbench-refresh`) and it fails `next build`, so **no
Playwright walk can run on any wave-2 lane branch**. The #912 ticket report already reported it; it is
still there.

**The fix is one word, and it is NOT the obvious one.** Adding `import { DOCUMENT_KINDS } from
"@/lib/documents/types";` makes tsc green and 19 of the 20 cells green, but reds
`document-kind-labels.test.tsx` cell **[878]** ("the dialog must not fall back to mapping the full,
unfiltered roster") — I measured both. The intended spelling is the sibling's filtered roster, which
the file already imports at line 35:

```diff
-              items={DOCUMENT_KINDS.map((k) => ({ value: k, label: renderKindLabel(k, t) }))}
+              items={CLASSIFIABLE_DOCUMENT_KINDS.map((k) => ({ value: k, label: renderKindLabel(k, t) }))}
```

Measured with that one word applied in this worktree and then reverted byte for byte
(`git status` clean, line 95 restored): `npx tsc --noEmit` exit 0, and the five documents files
**36/36**.

### 2. `CI=true GITHUB_ACTIONS=true pnpm lint` is red — `scripts/check-frozen-workflows.selftest.mjs:729`

Plain `pnpm lint` exits **0**. Under the runner's own variables the freeze-lint selftest fails one case:

```
FAIL  (L05-STD-02 fix round) `--ruling` followed by another flag … is treated as NO ruling given
      expected the MISSING-RULING refusal specifically; got stderr:
      freeze-lint: --retire is REFUSED under CI — a deliberate local ceremony act…
freeze-lint selftest: FAIL — 1 case(s) failed.
```

This is exactly the hazard `RIG.md`'s wave-2 addendum names (PR #1025's lesson), in a second cell of
the same file: the case spawns `--retire` and pins the missing-ruling refusal, which sits behind the
CI refusal. Inherited: the file's last commit is `e8eb79ba2` (#849), an ancestor of BASE, and this
lane's diff does not touch `scripts/`. The house idiom is already in the same file at line 680:

```diff
-    { cwd: REPO_ROOT, encoding: "utf8" },
+    { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, CI: "", GITHUB_ACTIONS: "" } },
```

Measured with that applied and then reverted (`git status` clean):
`CI=true GITHUB_ACTIONS=true node scripts/check-frozen-workflows.selftest.mjs` →
**"freeze-lint selftest: OK — all cases passed."**

## Gates, with counts

Every command run from the lane worktree, with `PGHOST=127.0.0.1 PGPORT=55742 PGUSER=postgres
PGDATABASE=clara_l02 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1` where a database is involved. No reset
or role-sweep flag was ever set.

| gate | result |
|---|---|
| the seven lane db batteries, full preintegration-gate chain (`audit-actor-role`, `knowledge-fye-day`, `knowledge-scope-default-drop`, `knowledge-key-grammar`, `knowledge-firm-defaults`, `knowledge-onboarding-promotion`, `pack-shaped-knowledge-read-census`) | **67 pass / 0 fail** |
| `operation-census.test.mjs` + `rig-isolation.test.mjs`, same chain, no reset flags | **32 pass / 0 fail / 1 skipped** |
| `node scripts/migrate.mjs` (ledger integrity) | **0 new · 233 total** — no drift; 0242 and 0243 both match their ledger rows |
| `apps/web` `tests/firm-scope-db-pins.test.ts` | **22 pass / 0 fail** (was 20/2 — the gate this round fixed) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4730 pass / 20 fail / 2 skipped of 4752** — all 20 are inherited blocker 1 |
| `pnpm typecheck` | **RED, inherited only** — 2 errors, both `document-kind-dialog.tsx:95`; green with the one-word fix |
| `pnpm lint` | **green (exit 0)** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **RED, inherited only** — 1 freeze-lint selftest case; green with the one-option fix |
| `eslint apps/web/tests/firm-scope-db-pins.corpus.ts` under CI vars | clean |
| Playwright `knowledge-firm-walk` on the lane triple (3510/3511/3512) | **NOT RUN.** With blocker 1 patched locally `next build` completes (so the build break is that one word and nothing else), but the run then fails at `http://127.0.0.1:3511/signup is already used`: lane 02's triple is held by an orphaned `next start` (**pid 43092, started 2026-09-20 07:22**, before this fix round) left by an earlier worker. I did not kill a process I did not start. |

Both local probes used to characterise the inherited blockers were reverted byte for byte;
`git status` is clean at `a618d6e63` and the lane's tree contains no foreign change.

## Owed — not mine to do

1. **GitHub writes (rule 2 forbids them to this lane).** (a) #912: record the `clara._audit` →
   table-trigger substitution in the ruling's vocabulary, and ratify or overrule the deviations below.
   (b) #991: queue the issue for the Wayfinder pass (a milestone, or the #683 cross-reference the
   ticket's own out-of-scope names). (c) File the #898 follow-up covering BOTH
   `financial_year_end_day` and `financial_year_end_month` (SPEC-L02-04 / ADV-03), noting that
   fd.06(d) pins today's disagreement and must be changed deliberately when it lands.
2. **Owner ratification of three deliberate positions**, each argued from measurement in the repo:
   the stamp lives on `clara.audit_log`'s write path because `clara._audit` is a frozen
   metric-input-producer member (SPEC-L02-02); `promoter_role_at_act` is emitted at the register's
   viewer floor rather than the audit log's bookkeeper floor (ADV-04); and the column is the role at
   the audit write, so a promotion that commits while a door is parked on a lock is what the act then
   reports (ADV-02) — said in four places and pinned by ar.07, but stated rather than fixed.
3. **0242's comment-only correction** (SPEC-L02-01 residue), for the integrator to apply on the
   integration branch, where 0242 has not been applied to any database. Exact replacements:

   `packages/db/migrations/0242_knowledge_key_grammar.sql` lines 41-43, replace

   ```
   -- source of truth the brief names, unweakened and unwidened; the tail re-measures its live
   -- `prosrc` sha256 against 0898's own prestate pin to prove that positively rather than by omission
   -- alone. It touches no function and recuts nothing: a catalog key is a primary key used only as a
   ```

   with

   ```
   -- source of truth the brief names, unweakened and unwidened. The PROOF is that no `create or
   -- replace function clara.record_work_knowledge_read` appears anywhere in this file, greppable
   -- over the file itself; the tail below asserts only that the recorder still RESOLVES at its 0230
   -- signature and prints its live `prosrc` sha256 as as-run evidence, and the HARD pin against the
   -- value 0230 produces lives in tests/knowledge-key-grammar.test.mjs kg.05.
   -- It touches no function and recuts nothing: a catalog key is a primary key used only as a
   ```

   and lines 240-246, replace

   ```
     -- AC4 (out-of-scope guard, proved positively): clara.record_work_knowledge_read's own grammar
     -- check is untouched -- its prosrc sha256 is still one of the two live pins #898's prestate
     -- measured for the (unrelated) _knowledge_assert_value splice's neighbour function, because
     -- this file's own grep of itself contains no `create or replace function
     -- clara.record_work_knowledge_read` at all. Re-measured here rather than argued from that grep
     -- alone: any accidental recut of this function would change its prosrc and this assertion would
     -- catch it even if a future editor missed the grep.
   ```

   with

   ```
     -- AC4 (out-of-scope guard): clara.record_work_knowledge_read's own grammar check is untouched,
     -- and the proof is that no `create or replace function clara.record_work_knowledge_read`
     -- appears anywhere in this file -- greppable over the file itself. What follows is NOT that
     -- proof: it asserts only that the recorder still RESOLVES at its 0230 signature, and measures
     -- its live prosrc sha256 so the as-run notice can carry it. The HARD pin against the value 0230
     -- produces (8f745815512727bbedfa01f25e66177a066574c461f964574d120b532ac8fc79) lives in
     -- tests/knowledge-key-grammar.test.mjs kg.05, the portable home for it.
   ```

   Nothing executable changes and `packages/db/README.md` already states the same thing. **Do not
   apply this on a database where 0242 is applied** — it is below the frontier and `migrate.mjs` will
   refuse with checksum drift.
4. **The two inherited blockers above**, landed once for the whole wave.
5. **Release-note line for the hosted apply:** 0243 adds a column, a CHECK constraint and the
   `ix_audit_log_knowledge_revision` index to `clara.audit_log` — DDL on the estate's largest
   append-only table, inside one transaction (SPEC-L02-07).
6. **The orphaned `next start` on lane 02's triple** (pid 43092, started 07:22): whoever owns it
   should clear it so a walk can run here.

## Anything unverified

- **No browser walk ran on this branch**, for the two reasons in the gates table. The panel behaviour
  the walk would have exercised is covered by kf.12/kf.13/kf.14 in the unit suite, and
  `apps/web/e2e/knowledge-mock.mjs` already carries `promoter_role_at_act` in
  `clara.list_firm_knowledge`'s shape.
- **The whole-suite figure (4730/20) is from the run at HEAD with no probe.** A third whole-suite run
  (with the blocker-1 probe applied) hung after ~25 minutes under host contention on
  `components/parts/sweep-receipt-card.test.tsx` and I stopped it; the two earlier whole-suite runs on
  this machine finished in 75s and 115s, so I record the hang as contention, not as a finding. The
  five affected documents files were measured individually instead (36/36).
- **ADV-05's rig-history rows** (40,395 `none`, ~39k of them actorless) are an artifact of this lane
  database's own redo history, not of the shipped migration. Not corrected, and not worth a backfill:
  a from-scratch chain and the hosted apply never produce them.
- `CONTEXT.md`, `apps/web/messages/en.json`, `apps/web/test/manifest.txt`,
  `packages/db/tests/rig-meta.mjs`, `packages/db/package.json` and
  `packages/db/tests/x42-s5-helpers.mjs` carry this lane's minimal hunks at their sorted positions;
  nine other lanes are editing the same files this wave and I did not re-check them for conflicts
  beyond my own.
