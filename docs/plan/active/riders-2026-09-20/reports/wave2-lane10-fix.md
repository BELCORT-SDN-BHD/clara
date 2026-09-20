# Wave 2 · Lane 10 · review fix round

**Branch** `riders/w2-lane10` · **base** `23cfad947b5598214168ba9c43d391b4e16aa745` ·
**new head** `ad1c2ce33`
**Worktree** `C:\Users\zhant\Desktop\clara-wt\660` · **database** `127.0.0.1:55750/clara_l10`
**Tickets** #872, #996, #960, #1003 (#871 was stopped with evidence and is no longer part of this
lane) · **Reviews answered** `wave2-lane10-codereview-spec.json` (11 findings),
`...-codereview-standards.json` (4), `...-review-adversarial.json` (9) — 24 findings, 12 distinct
defects after de-duplication.

This round had **two** fix workers. The first was cut off mid-work by a usage limit; this report
extends its work rather than replacing it. Everything under "Round A" below was already committed
and green when this worker started and was **not** redone; "Round B" is this worker's.

---

## 0. Resume: what the first worker left, and how it was judged

`git status` on start showed ONE uncommitted change: a hunk in `apps/web/README.md`. It was judged
on its merits and **kept** (not reverted): it is the second half of `d65b56ce8`'s own named
residual — the MEASURED reason the ADV-L10-05 widening cannot be done on this lane. Its central
claim was re-run before the hunk was committed:

```
$ CLARA_MIGRATION_REDO=0270_firm_document_limits_writer node scripts/migrate.mjs
migrate: FAIL — redo refused: 0270_firm_document_limits_writer is not the highest applied version
(0271_retire_create_account_set_v1 is) — redoing anything below the frontier would silently
invalidate whatever was applied on top of it.
```

Quoted verbatim in the hunk and reproduced exactly. It is committed in `37d88905c`.

Nothing else was uncommitted; the seven Round-A commits were left untouched.

---

## 1. Finding-by-finding disposition

### Round A — fixed by the first worker (verified, not redone)

| Finding(s) | Severity | Commit | Disposition |
|---|---|---|---|
| **S-960-1 / ADV-L10-01** deterministic op key replays a stale receipt | **blocker** | `4e98c10fa` | **FIXED.** `newProcessingCapsOpKey()` mints `op-caps-<uuid>` per submission — the rule every other web door here already follows. db cell 10 drives set(8)→set(2)→set(8) under fresh keys and asserts the row MOVES with three audit rows; the same sequence under a repeated key is measured as the silent no-op (that half is the vacuity control). |
| **S-960-2 / ADV-L10-09** op key collapses to an empty caller id | minor / note | `4e98c10fa` | **FIXED, structurally.** A uuid needs no actor, so `scope.user_id ?? ""` is gone from the panel; the collision cannot be expressed any more. |
| **S-996-1 / L10-STD-01** one firm-roster read per register row | **major** / hard violation | `fbb522d72` | **FIXED.** `WatchDispositionLine` takes a `MemberNameResolver` prop; `ComplianceRegisterPanel` holds ONE `useMemberNames`. New cell pins the roster-read COUNT at 1 for a five-row register; seen red at 5 first. |
| **S-996-2** the extraction silently changed the out-of-scope Needs-You mount | minor | `fbb522d72` | **FIXED.** `WatchDispositionReceipt` holds its own hook above its early returns — exactly where it sat pre-#996 — so that mount's network behaviour is restored byte for byte. |
| **ADV-L10-02** the `issuer_lapsed` notice promises acceptance the door refuses | **major** | `56f311afd` | **FIXED.** Copy no longer claims "accepting is unaffected"; it says the firm re-checks and may need a fresh invitation — true for every `issuer_lapsed` invite, including the removed-issuer case that refuses at the LOWEST role. Cell `p872.web.issuer_lapsed_removed` drives it end to end. Door unchanged, form still not blocked (the owner's ruling stands). |
| **ADV-L10-03 / L10-STD-02 / S-1003-1** 0271 ships no gate, no cohort arm, no chain entry | **major** / hard violation | `da8f18c1d` | **FIXED.** All three artefacts shipped: `retire-create-account-set-preintegration-gate.mjs` (stem-keyed), `RETIRED_0271_HUMAN_FNS` as the removal-shaped frontier arm, the `--import` token in migration order (53 gates). Measured in a rolled-back transaction: without the arm the grant matrix reports `expected false, got true`; with it, green. |
| **ADV-L10-04** #872's readiness keys on the migration NUMBER | **major** | `edbbe133d` | **FIXED.** Both probes now read `version ~ 'invite_issuer_lapsed_status$'`. Measured in a rolled-back rename: `^0269_` matched 0 after the renumber, the stem matched 1. |
| **ADV-L10-06** the CLR13 `operation_in_flight` arm is unreachable | minor | `4e98c10fa` | **REFUTED, then proved.** The arm stays — `clara._reserve_op` synthesises `{"pending": true}` for a committed receipt row with a null result, and eighteen migrations answer that contract with this same CLR13; a door that dropped it would hand `{"pending": true}` back as if it were a receipt. Cell 11 reaches the arm from an arranged prestate receipt row and observes the door's own typed refusal. |
| **L10-STD-03** three copies of the non-blocking `includes()` cast | smell | `59878debd` | **FIXED** (small and clearly better). `isNonBlockingPreviewStatus` lives beside the constant; all three sites call it. New cell takes its expectations from the spec, and was shown failing against a `return true` subject. |
| **ADV-L10-05** a cap above INT4_MAX leaves the door as a raw 22003 | minor | `d65b56ce8` | **PARTIALLY fixed** in round A (card-side bound + named residual) — **finished in round B**, see below. |
| **ADV-L10-07** the estate ceiling bounds one firm, not the estate | minor | `d65b56ce8` | **RECORDED** in `apps/web/README.md` in round A — **given its db-side home in round B**, see below. |

### Round B — this worker

#### ADV-L10-05, finished — `37d88905c` *fix(web): #960 the cap field names the largest number it will carry*

Round A stopped the card sending a value above INT4_MAX, which removed the false *"That change
could not be sent, so nothing was saved."* But the message shown in its place,
`capacityFieldInvalid`, read **"Each cap is a whole number above zero."** — and `2147483648` **is**
a whole number above zero. The card refused the person's value while reciting a rule that value
satisfies, with no way out: the **same class of untruth as ADV-L10-02**, in the same lane, one
ticket apart. Round A's own cell asserted only `/whole number/i`, so it could not see it.

- Copy now: *"Each cap is a whole number from 1 to 2,147,483,647. Clear a field to leave that cap
  as it is."*
- It still says **nothing** about the estate's ceiling. That number belongs to
  `clara._firm_document_limit_ceiling` (granted to nobody), learnt only from its own refusal
  sentence; restating 10,000 in app copy would be a second copy of a policy free to drift.
  `2,147,483,647` is a different kind of fact — the door's declared argument type.
- **Re-measured on `clara_l10`** rather than taken from the review, through the cast PostgREST
  actually performs (it binds the JSON body value and casts it to the declared type):
  - `set_firm_document_limits(p_docs_per_day=>($1)::integer, …)` with `'2147483648'` →
    `22003  value "2147483648" is out of range for type integer`, **no detail**.
  - A bare SQL literal does not even reach the cast: `2147483648` is a `bigint` to the parser, so
    overload resolution refuses it `42883`. The 22003 is the shape the web caller can actually
    produce, which is why it is the one that matters. (The review reported only the 22003; this
    distinction is new and is recorded in both READMEs.)
- Cell: `processing-capacity-card.test.tsx` → *"a number the door's own argument type cannot carry
  is never sent"* gains the message assertion. **Seen RED for the right reason first** (expected
  `/2,147,483,647/`, actual `"…Each cap is a whole number above zero…"`), green after.

**Residual, unchanged and named:** a caller reaching the RPC directly still meets the raw 22003.
Closing it means declaring 0270's four parameters `bigint` — i.e. editing an applied migration and
re-applying it — and the redo refusal quoted in §0 says that cannot be done or re-measured on this
lane. Folding it into 0271 was rejected (another ticket's migration); an unreserved 0272 was
rejected (work-order rule 5, and a number another wave-2 lane may hold). **Follow-up worth filing.**

#### ADV-L10-07 + ADV-L10-05, db-side home — `c8e7262bd` *docs(db): #960 0270's two corrections, where a db reader will find them*

Both corrections apply to migration 0270's **header**, which is applied and therefore immutable,
and round A recorded them only in `apps/web/README.md` — a file nobody reading `packages/db` opens.
There was no 0270 section in `packages/db/README.md` at all, though work-order rule 9 asks for the
module README the change affects. Added, in migration order before 0271's.

**ADV-L10-07 re-measured from the live catalog on `clara_l10`** (not taken from the review):
`clara.claim_document_processing_task`'s two counting statements read

```
select count(*)::int into v_running from clara.document_processing_tasks
  where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts') and status='running';
select count(*)::int into v_running from clara.document_processing_tasks
  where firm_id=t.firm_id and lane='llm_witness' and status='running';
```

Both scoped `where firm_id=t.firm_id`; there is no estate-wide counter anywhere in the body, and no
`estate`/`global` wording in it. So §A's "a shared machine" justification is stronger than the
code: N firms at 16 give 16N. **Nothing in #960's acceptance is broken** — a firm still cannot
exceed its own ceiling, which is all the door promises — and the per-firm numbers stay where they
are. The estate-wide backstop is a follow-up for the owner to rule on.

#### L10-STD-04, answered — `ad1c2ce33` *refactor(web): #960 a parameter with one call site and one possible value*

A judgement call, answered as a small fix plus a recorded reason for what stays.

- **What went:** `readCaps(raw, key)`'s second parameter. One call site, one possible value (the
  module-level `RECEIPT_KEY` that `readPrevious` reads directly); its only effect was to make the
  two functions look gratuitously unlike each other, which is part of why the pair reads as
  accidental duplication. No behaviour change; `readCaps` is not exported and receipt parsing is
  covered through the public `setFirmDocumentLimits`.
- **What stays, and why:** the three readers are **not** folded into one generic walk. They look
  alike because they all iterate `PROCESSING_CAPS`, but each answers a different question about a
  different shape — an object of integers, an object of integers-or-null (where `null` is the fact
  *"no cap was stored"*, not a bad field), and an **array** of column names read backwards to app
  spellings. A generic helper would carry both input shapes and three failure semantics as
  parameters, and would put the one thing a reader of a receipt parser cares about — what makes
  THIS field unacceptable — behind an indirection, to save about eight lines each. The reviewer
  scored it the same way ("a minor judgement call and not required"). The reasoning now sits above
  the three functions so the next reader does not re-open it.

### Findings that are records, not defects — no code owed

| Finding | Severity | Why nothing is owed |
|---|---|---|
| **S-871-1** #871 delivers none of its four AC | major | **Out of this lane.** The lane assignment for this round states #871 was stopped with evidence and is no longer part of lane 10. The stop's load-bearing claims were independently re-run by the spec reviewer and upheld (`grep -rl service_role packages/db/migrations` → 0 files; `apps/web` carries no `pg` dependency). It needs an orchestrator or owner decision — a migration number and a re-issued brief, or an explicit ruling on the service-role key — not an implementer. |
| **S-872-1** the brief's `docs/ARCHITECTURE.md` key interface was not delivered | minor | **Forced by the work order.** Rule 5: "Never edit `docs/PRD.md`, `docs/ARCHITECTURE.md`". The reviewer names the same constraint, and also measured that `grep -ic invit docs/ARCHITECTURE.md` returns 0, so the brief's "invite section" does not exist to carry the note. The ruling is recorded in `CONTEXT.md` and `packages/db/README.md`. **Do not close that AC as met**; it is a Wayfinder follow-up or a ticket amendment. |
| **S-1003-2 / ADV-L10-08** `delta-contract.test.mjs` gives 58/2, not the reported 60/60 | note | **Not a lane defect, and not fixable here.** That suite's own top-level cell is titled *"delta contract requires a fresh disposable DB and runs its one-way ceremony in order"*; `clara_l10` has now been ceremonied, so AC5 cannot be re-proved on it. The single leaf red is `delta-catalog-phase.mjs:633`'s stale `5 + …` deployed-count arithmetic, which does not account for `prepayment_schedule v1`. **Two things for the integrator:** re-run the suite on a fresh disposable database, and file the stale literal as its own ticket. |
| **S-LANE-1** `1a260af98` belongs to none of the lane's tickets | minor | **Integrator decision.** The defect (`DOCUMENT_KINDS` undefined in `document-kind-dialog.tsx`) is pre-existing at the lane base — verified at `git show 23cfad947b:…` — and blocks `pnpm typecheck`/`next build` for any lane touching `apps/web`. Expect the identical one-line fix on several wave-2 branches; de-duplicate rather than resolving it as a conflict. |
| **S-960-3** two behaviours beyond the AC list | note | Both disclosed in 0270's header and defensible (the `no_cap_named` refusal keeps the billing trail free of receipts for changes that did not happen; the per-firm advisory lock stops two admins receipting the same before-image). Neither widens the door's reach. |
| **S-872-2** `isKnownInviteStatus` has no production caller left | note | Deliberate, and the module header says so: `INVITE_STATUSES` stays tied byte-for-byte to `firm_invites.status`'s own CHECK so the census cell keeps working. Recorded so a later cleanup does not delete it. |

---

## 2. Gates

All from `C:\Users\zhant\Desktop\clara-wt\660`, Node 22, on lane 10's own rig
(`127.0.0.1:55750/clara_l10`, Playwright triple 3590/3591/3592).

| Gate | Result |
|---|---|
| `pnpm typecheck` | **clean** — `apps/web` Done, `packages/runtime` Done |
| `pnpm lint` | **exit 0, green** |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 1 — ONE failure, not this lane's** (see below) |
| `apps/web` whole unit suite (`node scripts/run-tests.mjs`) | **4784 tests · 4782 pass · 0 fail · 2 skip**, exit 0 |
| e2e `firm-commercial-walk` on 3590/3591/3592 | **10/10 passed** (37.1s), including the #960 cap cell |
| `packages/db`, 53-gate chain: `firm-document-limits-writer` + `preview-invite` + `client-financial-pack` + `preintegration-gate-chain` + `operation-census` | **77 tests · 77 pass · 0 fail**, exit 0 |
| `packages/db`, 53-gate chain: `rig-isolation` alone | **23 tests · 20 pass · 0 fail · 3 skip**, exit 0 (the documented T10b / T10b-AC2 / T19 rig conditions) |
| `packages/db`, all six above in one batch | run 1: 95 · 92 pass · **1 fail** · 2 skip; run 2: **100 · 97 pass · 0 fail · 3 skip**, exit 0 |
| Touched web unit files individually | `capacity-doors` 4/4 · `processing-capacity-card` 6/6 · `firm-settings-panel` 6/6 |

**The one CI-form lint failure is not lane 10's, concretely.** It is
`scripts/check-frozen-workflows.selftest.mjs`, case *"(L05-STD-02 fix round) `--ruling` followed by
another flag …"*, which fails only under `CI=true` because `freeze-lint --retire` is refused under
CI — exactly the class RIG.md's wave-2 addendum warns about. Attribution, measured:

- the case was introduced at `e8eb79ba2` (#849, wave 1), and
  `git merge-base --is-ancestor e8eb79ba2 23cfad947b` → **true**: it predates this lane's base;
- `git diff 23cfad947b..HEAD --stat -- packages/runtime` is **empty**, and the lane's changed-file
  list contains no `scripts/` or `freeze` file at all.

The standards reviewer reached the same conclusion independently. **It still needs an owner** —
it will be red on the runner for every wave-2 lane.

**The one db batch failure did not reproduce.** In run 1 every leaf cell inside
`rig-isolation.test.mjs` passed and the file-level entry then reported
`failureType: testCodeFailure, exitCode: 3765269347` — a Windows process-exit artifact, not an
assertion. Re-running the identical six-file batch gave 0 fail, and the file alone gives 0 fail.
Both runs are recorded here rather than only the green one.

**No migration was edited in this round**, so nothing needed the `#957` redo path and no prestate
pin moved. `apps/web/tests/firm-scope-db-pins.corpus.ts` lists no lane-10 migration (it carries only
reviewed dynamic-SQL barriers, none of which is 0269/0270/0271), and `firm-scope-db-pins.test.ts`
is green inside the whole-suite run above, so no content sha needed re-measuring.

---

## 3. Rig event during this round (for the integrator)

Mid-run, every `git` command inside the worktree began failing with
`fatal: not a git repository: C:/Users/zhant/Desktop/clara-rebuild/.git/worktrees/660`, and
`git worktree list` in the main checkout listed only the main checkout — **all worktrees had been
deregistered at once.** RIG.md has since been updated with the cause (`git worktree prune` run from
WSL, which cannot stat Windows-registered worktrees) and the repair.

**Nothing was lost from this lane.** Worktree object storage is shared, so all three Round-B
commits were already reachable from the shared ref: `refs/heads/riders/w2-lane10` read `ad1c2ce33`
throughout. This worker did **not** run `git worktree repair` or any other write against the main
checkout; it waited, and re-ran the git-dependent gate (`pnpm lint`, whose
`check-frozen-workflows.mjs` calls `git rev-parse --show-toplevel`) after the repair landed. Both
lint figures in §2 are from after the repair.

---

## 4. Follow-ups worth filing

1. **Widen `clara.set_firm_document_limits`'s four parameters to `bigint`** so the body's own
   `v_asked > ceiling` check answers every number a caller can send with a typed CLR10, instead of
   a raw 22003 from PostgREST's cast. Needs its own migration number; the card-side bound shipped
   here is a courtesy, not the wall. (ADV-L10-05 residual.)
2. **An estate-wide concurrency backstop**, for the owner to rule on. `claim_document_processing_task`
   bounds one firm; N firms at 16 give 16N against the one always-on runtime machine. (ADV-L10-07.)
3. **`delta-catalog-phase.mjs:654`'s stale deployed-count literal** (`5 + …`), which does not
   account for `prepayment_schedule v1`. (S-1003-2 / ADV-L10-08.)
4. **The `docs/ARCHITECTURE.md` invites subsection** #872's brief asked for, as a Wayfinder item —
   the file has no invite section at all today, and work-order rule 5 forbids a lane writing one.
5. **`scripts/check-frozen-workflows.selftest.mjs`'s CI-form red** (#849 / L05-STD-02 fix round) —
   pre-existing, cross-lane, red on the runner for every wave-2 branch.
6. **#871**, which needs an owner or orchestrator decision before any implementer can start.

---

## 5. Anything unverified

- **The migrations applying from scratch.** Deferred to the integrator's disposable cluster by
  RIG.md; no lane ran it and none could without a second from-scratch chain on its own cluster.
- **#1003's AC5** (`delta-contract.test.mjs` end to end) cannot be re-proved on `clara_l10` now that
  its one-way ceremony has run — a fresh database is required. See §1.
- **The CI-form lint gate does not pass on this branch**, for a reason measured to predate it. It is
  reported as a red, not as "fixed".

---

## Commits (base → head)

Round A (first worker, verified and not redone): `4e98c10fa`, `d65b56ce8`, `fbb522d72`,
`edbbe133d`, `da8f18c1d`, `56f311afd`, `59878debd`.

Round B (this worker):

```
37d88905c fix(web): #960 the cap field names the largest number it will carry
c8e7262bd docs(db): #960 0270's two corrections, where a db reader will find them
ad1c2ce33 refactor(web): #960 a parameter with one call site and one possible value
```

**New head: `ad1c2ce33`** (`refs/heads/riders/w2-lane10`). Working tree clean.
