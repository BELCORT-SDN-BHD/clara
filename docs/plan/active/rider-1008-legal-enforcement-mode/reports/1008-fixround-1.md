# #1008 — fix round 1 (adversarial findings A1–A4)

* **Worktree** `C:\Users\zhant\Desktop\clara-wt\int` · **branch** `impl/1008-legal-enforcement-mode`
* **Head** `9a9972f5` (base `origin/main` `511df8f8`); this round added two commits:

```
9a9972f5 docs: #1008 what a prompt-era consent keeps after the flip, and the literal rollback
ed375b97 test(db): #1008 whose acceptance founds the basis, and the forced first-dispatch race
edb2ef9e  (round 0 head)
```

* **Rig** PG 17.11 @ `127.0.0.1:55730` `clara_reh`, frontier **229 / `0234_legal_enforcement_mode`**.
* **0234 was NOT edited**, so the brief's manual re-apply recipe was not needed and no prestate pin
  moved. `apps/web/tests/firm-scope-db-pins.corpus.ts`'s migration-file sha is untouched.

All four findings are **fixed**. None was refuted; none was deferred.

---

## A4 — no hostile-provenance cell · **FIXED** (`ed375b97`)

**Reproduced first.** The finding is a coverage gap, so the reproduction is a mutation: on the rig I
replaced `clara._accounting_work_egress_live`'s prompt-arm owner selection

```
where m.firm_id=p_firm and m.status='active' and m.role='owner'
   and exists (select 1 from clara.legal_acceptances a where a.user_id=m.user_id)
```

with the same predicate minus `m.status='active' and m.role='owner'` — i.e. ANY member of the firm,
active or not, may now found the firm's lawful basis for sending its clients' books to a model. The
whole battery then ran:

```
node --test --test-concurrency=1 tests/legal-enforcement-mode.test.mjs
→ tests 26 · pass 24 · fail 2 · skipped 0
   ok 1..23      (every cell that existed before this round)
   not ok 24 - p1008.db.prompt_wrong_person
   not ok 25 - p1008.db.prompt_owner_leaves
```

The pre-round battery was **entirely green against that mutation**. That is the gap, measured.

**Fixed, test-first** — two new cells in `packages/db/tests/legal-enforcement-mode.test.mjs` §7:

| cell | what it pins |
|---|---|
| `p1008.db.prompt_wrong_person` | a NON-OWNER member of this firm holding REAL acceptances of BOTH published kinds founds nothing; another firm's owner holding both founds nothing here (that other firm is live as the control); the same indistinguishable `{"live": false}` and the same `unknown` dispatch in BOTH modes; nothing minted |
| `p1008.db.prompt_owner_leaves` | the accepting owner DEMOTED through `clara.set_member_role` → basis gone; role put back → basis back (it was the role, not the person); membership REMOVED through `clara.remove_member` → basis gone; a second owner holding nothing never shadows the one who accepted; no consent ever minted |

Both acts go through the real doors, so the CLR09 last-owner wall is respected by adding a second
owner rather than by root DML. One fixture was added: `membershipOf(firm, user)` (a root READ of the
active membership row, because the member doors take the membership id).

**Restored.** `clara._accounting_work_egress_live` was put back from the `pg_get_functiondef` text
captured before the mutation, and re-measured: `sha256(prosrc)` =
`fe5d797ff46fe2bdc8636ee816b1e488bf952557be42a8b59f2064eccaf119a4`, identical to the pre-mutation
measurement.

---

## A3 — no concurrent-first-dispatch cell · **FIXED** (`ed375b97`), and the obvious fix was wrong

**Reproduced first, and the first attempt failed honestly.** I wrote the cell the finding asks for —
`Promise.all([prepareEgressDispatch(), prepareEgressDispatch()])` on the shared pool (`max: 8`, so
two distinct backends) — and then mutated `clara.prepare_egress_dispatch` by DELETING the consent
insert's `on conflict do nothing`, which is the exact defect such a cell must catch. **The cell
passed three times out of three against the mutated body.** The two calls never overlap: the first
commits before the second's `not exists` guard runs, so the second never enters the mint arm at all.
A `Promise.all` race here is not a race, and shipping it would have been a cell that proves nothing.

**Fixed** with a forced, observed window — `racedFirstDispatch` in
`packages/db/tests/legal-enforcement-mode-fixtures.mjs`, in `withWorkRowLocked`'s own
two-connection shape:

1. session A opens a transaction and mints, WITHOUT committing;
2. session B enters the same arm, sees no committed consent, and blocks on
   `uq_client_egress_purpose_consents_one_live` behind A's uncommitted tuple;
3. a THIRD session polls `pg_stat_activity` for `wait_event_type = 'Lock'` on a query naming
   `prepare_egress_dispatch` and only then releases A;
4. `blocked` comes back with both verdicts and **the cell asserts it**, so a future run where the
   contention silently stops happening reds instead of passing vacuously. Both sessions carry a
   `statement_timeout`, so a wall that never lifts fails the cell rather than hanging the battery.

`p1008.db.prompt_first_dispatch_race` then asserts: both dispatches `granted` with DISTINCT
authorization ids, exactly ONE consent, ONE activation, ONE `derive_client_egress_purpose` audit row
naming that consent with `enforcement_mode = prompt`, and ONE `egress.purpose_consent_derived` event
citing the same consent and the same acceptance.

**Evidence that it discriminates:**

| body | result |
|---|---|
| shipped `prepare_egress_dispatch` | `ok 1 … # pass 1 # fail 0` |
| same body with the consent insert's `on conflict do nothing` DELETED | `not ok 1 … code: '23505'` |
| the pre-fix `Promise.all` spelling, against that same mutation | `# pass 1 # fail 0` ×3 — which is why it was replaced |

**Restored.** `clara.prepare_egress_dispatch` was put back from its captured definition and
re-measured: `sha256(prosrc)` = `e5c3ca7d698c9d50d0294c224c5947ac5d3e5fe99add1b4ba31c105ea77d462c`,
identical to the pre-mutation measurement. `clara.consume_egress_dispatch` was never touched and
still hashes to its pinned `f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3`.

---

## A1 — a `prompt`-era consent is never re-derived · **FIXED** (`9a9972f5`), documentation only

The finding asks for a record, not a code change, and agrees no security property is at stake (the
live gate is `prepare_egress_dispatch`'s per-call re-derivation). Recorded in **two** places rather
than only the ticket report, because a release reads the module README:

* `packages/db/README.md`, 0234 section — a new paragraph: the consent is minted once per
  (firm, client, `accounting_work`) and never re-derived, so a beta-minted row survives the flip with
  its prompt scope note and, for a Terms-only owner, a TERMS `legal_acceptance_id`; it grants nothing
  on its own; the only residual window is an issued authorization's 120s TTL; an evidence surface
  must join each consent to a FRESH `clara._accounting_work_egress_live` answer and must read
  `enforcement_mode` before rendering `terms_version` / `dpa_version` (which is finding A6, folded in
  here because it is the same sentence for the same reader); and whether the launch flip re-derives
  or annotates those rows is left, explicitly, to a later ticket.
* `reports/1008-final.md` — the same paragraph in Decision 11 §1, and follow-up 3 (the evidence
  surface) now owns both facts.

---

## A2 — the documented rollback had no surface and no verified precondition · **FIXED**
(`9a9972f5`), with the hosted half explicitly left to the release

`packages/db/README.md` (0234) and `reports/1008-final.md` (Decision 11 §1) now carry, literally:

1. the read-only query that finds the operator firm and its ACTIVE owner, with the statement that
   **zero rows means nobody can reach the door** (`clara.firms.is_operator` is set only by a raw ops
   act — 0133's tail: "ZERO firms are marked operator by this migration");
2. the `psql` form of the flip as that owner — `set local role clara_authenticated`,
   `set_config('request.jwt.claims', …, true)`, then `clara.set_legal_enforcement_mode(...)` — which
   is the form that leaves the `clara._audit` receipt naming actor, new mode and previous mode;
3. the superuser `update clara.legal_enforcement set mode = 'enforce' where id;` as an explicit LAST
   RESORT that leaves no audit row, no `updated_by` and no receipt.

The precondition query was verified for SHAPE on the rehearsal rig inside `begin read only … rollback`
and returns the six documented columns; there it returns **0 rows**, which is the rig's own honest
answer (it carries no operator firm). **The hosted measurement is not mine to make** (WORK-ORDER
rule 5: "Hosted evidence is not yours to claim"), so it stays as the release's first step, written
down where the release will look. That is the only part of A2 still open, by design.

---

## Gates re-run after the fixes

| command | result |
|---|---|
| `node --test --test-concurrency=1 tests/legal-enforcement-mode.test.mjs` | **26 pass / 0 fail / 0 skip** |
| `node --test --test-concurrency=1 tests/work-egress-authority.test.mjs` | 37 pass / 0 fail / 0 skip |
| `node --test --test-concurrency=1 tests/legal-acceptance.test.mjs` | 19 pass / 0 fail / 0 skip |
| `node --test --test-concurrency=1 tests/firm-commercial-settings.test.mjs` | 24 pass / 0 fail / 0 skip |
| `node scripts/check-frozen-workflows.mjs` | OK — 312 frozen files verified, no manifest diff |
| `pnpm typecheck` (worktree root) | exit 0 |
| `pnpm lint` (worktree root) | exit 0 |

No web file, no runtime file, no migration and no SQL function is in this round's diff, so the web
suite and the SQL censuses were not re-run — round 0's counts stand for them.

## Rig left as found

`clara.legal_enforcement.mode` = `prompt`; 229 migrations; `_accounting_work_egress_live`
`fe5d797f…`, `prepare_egress_dispatch` `e5c3ca7d…` and `consume_egress_dispatch` `f461ceb0…` all at
the values measured before this round. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were
never set, no second from-scratch chain was run, no other worktree or cluster was touched, nothing
was pushed and no PR was opened. The scratch helper directory used for the mutations
(`packages/db/.rigq/`) was moved out of the worktree; `git status` shows only `reports/`, untracked.

## Not in this round's list

Findings **A5** (the battery's `after()` forces `prompt` instead of restoring what `before()` found),
**A6** (folded into A1's documentation above, since it is the same instruction to the same reader)
and **A7** (the from-scratch chain and the full estate suite — CI/orchestrator) were not assigned to
this round. A5 is a one-line change to the battery's own hygiene and is still open.

## One deviation to flag

This session's harness attribution differs from BRIEF decision 12. Both commits carry the brief's
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` line **and** this session's required
`Co-Authored-By: Claude Opus 5 (1M context)` / `Claude-Session:` lines. Amend if the wave wants only
the first.
