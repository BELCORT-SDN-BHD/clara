# riders closing wave · lane 01 · #1148 — a granted, document-scoped read of the payroll posting verdict

**Branch** `riders/wK-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\701`, base `ffb629d73`.
**Database** `clara_c01` on 127.0.0.1:55742 (338 files / `0362` at start, **339 files / `0363` at end**).
**Playwright triple** 3600 / 3601 / 3602.
**Status: DONE.** The ticket was live on this branch, is now built, tested and documented, and every
acceptance criterion but one (the from-scratch chain, the integrator's) carries its own evidence.

**Commits** (`git log --oneline ffb629d73..HEAD`, five for this ticket, all ending
`Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; the six before them are #1147's):

| commit | what |
|---|---|
| `ae374a6f1` | `feat(db): #1148 a document page can ask why a payslip did not post (0363 §A)` |
| `057ce4a08` | `test(db): #1148 the read is no oracle, projects five keys, floors at viewer, and answers about a payslip` |
| `fd9c8b76f` | `feat(web): #1148 the payroll lane's granted read has a web module, and it rewords nothing` |
| `55a1cc734` | `feat(web): #1148 the document page says why a payslip did not post, in the database's own words` |
| `97a89dd01` | `docs(db): #1148 the 0363 README section, its pins and the two refusals it tells apart` |
| `e210b1db3` | `fix: #1148 two lint defects of my own, found by the runner's own chain` |

Files this ticket changed (9): the migration, its test file and its pre-integration gate module,
`packages/db/package.json` (`$GATES`), `packages/db/tests/rig-meta.mjs` (one cohort),
`packages/db/README.md`, and on the web side `apps/web/lib/documents/payroll-posting-state.ts` + its
test, `apps/web/components/documents/payroll-posting-section.tsx` + its test,
`apps/web/components/documents/document-detail.tsx` (import + one mount),
`apps/web/messages/en.json` (two keys) and `apps/web/test/manifest.txt` (two lines).

Working tree clean. Nothing pushed, no PR, no GitHub write, no other worktree touched apart from
this report file. **No status-report request arrived mid-task.**

---

## 1 · The ticket was still live on this branch — verified before building

The newest Agent Brief is the issue **body**:
`gh api repos/BELCORT-SDN-BHD/clara/issues/1148/comments` returns an **empty list**, so there is no
later brief and no owner ruling comment dated 2026-09-20 to override it. (`gh issue view` prints
nothing at all on this host — exit 0, zero bytes, both with and without `--repo`; `gh api` works.
Noted as a rig quirk, not a finding of this ticket.)

Measured on `clara_c01` and on the branch before writing anything:

| claim in the brief | evidence it was still true at `ffb629d73` + #1147 |
|---|---|
| no granted read of the verdict exists | `select … from pg_proc where proname like '%payroll_posting%'` returned **one** row, `clara._payroll_posting_verdict(uuid)` — no wrapper of any name |
| the internal is ungranted | `proacl` = `{clara_fn_owner=X/clara_fn_owner}`, exactly |
| the name is free anywhere in the repo | `rg get_payroll_posting_state` over the worktree matched **4 lines, all in plan documents** (`CUT-PLAN.md:367`, `wave4-lane01-ticket946.md:473`, `waveS-lane04-ticket1048.md:446` and `:472`) — the follow-up that asks for it, never an implementation |
| its three callers | `prosrc like '%_payroll_posting_verdict(%'` across schema `clara` returned exactly `clara._list_review_queue_core`, `clara._post_payroll_run`, `clara.answer_payroll_completeness` (note: 0352 split the queue into a core, so the brief's `clara.list_review_queue` is that core today) |
| the first run of the new cell | failed with `no migration matching /payroll_posting_state_read$/ is applied` |

---

## 2 · The seams I tested at (written down before the first test)

| seam | why there |
|---|---|
| **S1** `clara.get_payroll_posting_state(p_document uuid)`, driven through `humanQuery` as a real signed-in **VIEWER** of the owning firm | the production path, and the least-privileged human connection that may hold this read at all. A direct call to the internal as `postgres` would prove nothing about the grant, the floor or the firm wall, all of which are the ticket |
| **S2** the same door from the wrong side — another firm's OWNER, an id that is no document, a caller with no membership, a caller with no authenticated actor | the refusal IS the deliverable there, and the fact that two of them are **indistinguishable** is the acceptance criterion |
| **S3** the **live catalog** — `pg_proc.proacl` for the door and for the internal, the floor argument the door's own body names, and the set of bodies that name the internal | three claims are about what a LATER file may not do. No behavioural cell written today can drive those, and this repo's own documented shape for them is a census (`p1137.obo.plan_step_parity`, `p1147.read.acl`), which WORK-ORDER rule 4 names explicitly |
| **S4** `getPayrollPostingState(...)`'s returned value, over a mocked `fetch` | the module's decoder is the seam: what it does with a bigint that arrives as a string, and with a refusal it must recognise rather than reword |
| **S5** `PayrollPostingSection`'s **rendered text** and the door calls it makes | what a person reads is the deliverable, and "an invoice page pays nothing for this section" is a claim about a call that must NOT happen |

No cell was written at a seam the brief does not name. `clara._payroll_posting_verdict` itself is
read as root **only** to establish what was available to project (S3's premise), never asserted on:
what the verdict decides is `payroll-summary-posting.test.mjs` (#946) and
`payroll-completeness-witness.test.mjs` (#1048), both of which run unchanged and green.

---

## 3 · Acceptance criteria, with evidence

All db cells are in `packages/db/tests/payroll-posting-state-read.test.mjs` (6 cells), run with the
**full gate chain** (308 `--import` flags) against `clara_c01`.

| AC (issue #1148) | cell / file | evidence |
|---|---|---|
| **AC1** — the new read answers a blocked payroll summary's verdict for a viewer of the owning firm, **driven on a real least-privileged connection rather than as `postgres`** | `p1148.read.blocked` | a filed, unread payroll summary → `verdict: "blocked"`, `rung: "facts_read"`, `reason: "payroll_not_read"`, `sentence: "This payroll summary has not been read yet."` — the literal 0297 §D builds, transcribed by hand from the spec. Driven as **carol**, firm A's `viewer` (the rank-0 member `buildWorld` mints). Firm B's **owner** asking about the same document is CLR11 in the same cell |
| **AC2** — its answer carries the sentence, verdict, rung, reason and completeness, and a cell asserts `rung_vector` is **absent** | `p1148.read.projection` | `Object.keys(r).sort()` deepEquals `["completeness","document_id","reason","rung","sentence","verdict"]`; `"rung_vector" in r === false`. The cell FIRST reads the internal as root and asserts `"rung_vector" in internal` and `>6` keys, so the claim is that the door NARROWS rather than that the source was already narrow. The state is #1048's own (a page printing no run totals, witnessing nothing): `rung: "completeness_witness"`, `reason: "completeness_unwitnessed"`, `completeness.parked === true`, `rows_read === 2`, and the sentence's whole prefix — *"This payroll summary for March 2026 prints no total; is this every employee for the month? Clara read 2 employee line(s), totalling RM 5,000.00 gross and RM 4,255.70 net…"* — hand-derived from 0343:1804's format string applied to #945's worked example |
| **AC3** — a document of another firm and an unknown document id answer the **same** refusal; a cell asserts a caller cannot tell them apart | `p1148.read.no_oracle` | both refusals are captured whole (`code`, `message`, `detail`, `hint`, `constraint`, `table`, `column`) and `deepEqual`'d; `code === "CLR11"`. The unknown id is `gen_random_uuid()` from the database itself, not a literal a future fixture could mint. The same viewer still reads her own firm's document in the same cell, so the claim is not "it always refuses". **Vacuity control shown** — see §5 |
| **AC4** — a caller below the viewer floor is refused at the floor | `p1148.read.floor` | **and the honest shape of that criterion is recorded rather than faked:** `clara.role_rank` puts viewer at **0** and `clara.firm_memberships_role_check` admits `viewer/bookkeeper/admin/owner` and nothing else, so there is NO role below this floor. The two reachable arms are driven for real: a `clara_authenticated` connection with no JWT → `CLR04 "no authenticated actor"`, and a real signed-in user who is nobody's member → `CLR04 "actor has no active membership"`, both `clara._human_ctx`'s own words. The ladder is read off the catalog in the cell; the door's single floor call and its `role_rank('viewer')` argument are read off the installed body |
| **AC5** — `clara._payroll_posting_verdict(uuid)` is still ungranted after the migration, asserted off the catalog | `p1148.acl.census` | `proacl` is exactly `{clara_fn_owner=X/clara_fn_owner}`, AND every application role on this cluster is asked one at a time (`has_function_privilege`, plus `public`) → empty. The door itself is reached by `["clara_authenticated"]` and nobody else. Exactly **four** bodies in schema `clara` name the internal — the queue's core, the poster, the answer door and this one. Enforced twice more by the migration: §0 **refuses to apply** over a database where any role already holds EXECUTE on the internal, and the tail re-reads both the ACL and the body's sha. **Vacuity control shown** — see §5 |
| **AC6** — the document page states why the summary did not post, reading the new door, asserted by a web cell | `payroll-posting-section.test.tsx` (5 cells) | the `account_missing` sentence renders **verbatim** under its own heading; the parked question renders with its figures and with the line naming where it is answered; an `invoice` page makes **0 door calls** and renders the empty string; a kind that moved under the page (CLR10 / `not_a_payroll_summary`) renders the empty string after 1 call; every other refusal (CLR11) renders a banner. Every cell is mocked at `fetch`, so the whole path component → `callDoor` → a real PostgREST POST is exercised |
| **AC7** — the migration applies from scratch and on a populated database, **first-apply branch proved**, and the from-scratch chain is green | populated apply ✔ (apply, then two redos), both prestate branches ✔, three refusal arms ✔ (§4) | **from-scratch chain: NOT run here** — see §9 *Unverified* |
| **AC8** — `CI=true GITHUB_ACTIONS=true pnpm lint` exit 0 | ✔ | measured, `exit=0` — after **two real lint defects of mine** were found by it and fixed (`e210b1db3`) |

### The one scope decision this ticket took, and why it is the brief's own

The brief's Desired behaviour is a wrapper that "answers the posting state of ONE **payroll summary**
document". `clara._payroll_posting_verdict` takes any uuid and is right to: every body that calls it
has already established what it is looking at. A granted door has not — handed an invoice it would
answer `facts_read / payroll_not_read`, i.e. *"This payroll summary has not been read yet."* said
over a supplier bill. §A therefore refuses `CLR10` + `{"reason":"not_a_payroll_summary"}`
(`p1148.read.kind`). That is a **narrowing to the brief's own subject**, not a widening: a door that
answered about any document would be broader than the ticket asked for.

The refusal is deliberately **not** the CLR11 wall: the document IS the caller's firm's and its
`document_kind` is already theirs to read, so "not found" would be the lie here. Another firm's
invoice is still CLR11 — asserted in the same cell — so the kind refusal never confirms a document a
stranger may not see.

---

## 4 · Migration

`packages/db/migrations/0363_payroll_posting_state_read.sql` — the number reserved for this ticket.
**No other migration file was edited.** Ledger after: **339 files, max
`0363_payroll_posting_state_read`**; a second `migrate` reports `0 new migration(s) applied` and no
drift.

| § | object | what it is |
|---|---|---|
| 0 | prestate | six checks (below) |
| A | `clara.get_payroll_posting_state(uuid)` | the document page's read — STABLE SECURITY DEFINER, `clara_authenticated`, VIEWER floor, firm-scoped, payroll-summary-scoped |
| Z | tail | 5 assertions, all read off the live catalog |

### Prestate pins — EVERY pinned signature, with its sha

Measured on `clara_c01` **now** (338 files, max `0362_standing_instruction_agent_read`; #1147 landed
first in this lane and recut nothing named here). All three are pinned **unconditionally** — this
file recuts none of them in either mode, so a changed sha is always a finding and never a redo
artefact.

| body | pinned pre-image (`sha256(prosrc)`) | why |
|---|---|---|
| `clara._payroll_posting_verdict(uuid)` | `4c350623e41527b717a1fc58e3ee8b772060b895b5353098f8cd21153585dac8` | the body this door wraps |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` | the floor it enters at and never mentions again |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` | what "viewer" means underneath that floor |

Bimodal, by name only: `clara.get_payroll_posting_state(uuid)` must be **free**, or already carry
this file's own `#1148 [0363]` marker (a redo). Anything else refuses by name.

**Post-image the next lane will find** (for the integrator's re-derivation, closing-plan seam
rule (c)):

| body | post-image |
|---|---|
| `clara.get_payroll_posting_state(uuid)` | `bf304a34fcc5775bdf70fe607e1d3ba350ec74fa469e2c399789cdf6abdf2cb4` |
| `clara._payroll_posting_verdict(uuid)` | **unchanged** — `4c350623…`, re-read by the tail after applying |

**Nothing in this lane pins a body lane L2 or L3 writes.** L2 (#1150) rewrites the on-behalf plan
cores and the reservation namespace; L3 (#1152) widens the accrual register's read. Neither touches
the payroll family, `clara._human_ctx` or `clara.role_rank`. The three unconditional pins are the
estate's floor plumbing and the payroll verdict, and the census reads the ACLs structurally rather
than pinning any body's text.

The remaining three prestate checks are structural: the four roles exist; 0297 and 0343 are applied;
**the internal's ACL is exactly its owner's** (the file REFUSES to apply over a database where some
role already holds EXECUTE on it — a wrapper on top of a body the caller can already call is
decoration, not a wall); `clara.documents` carries `id`, `firm_id` and `document_kind`; and
`clara.document_capabilities` knows the `payroll_summary` kind, so this door's subject is not a
string the file invented.

### Both prestate branches proved, and all three refusal arms driven

The wave-3 addendum's rule: `CLARA_MIGRATION_REDO` only ever takes the "my own body is already live"
branch, so a bimodal pin can hide its other branch. Both were exercised for real:

- **apply 1** (ordinary `pnpm db:migrate`): `0363 prestate: OK -- the read door is FIRST APPLY; the
  verdict is at its measured pre-image and ungranted`
- **redo 1** (`CLARA_MIGRATION_REDO=0363_payroll_posting_state_read`, after the vacuity control of
  §5): `… already carries this file's marker (redo path)`, checksum `ee51d4e7…`
- **redo 2** (after the §A.2b kind-gate edit): same branch, checksum `9d7ca441…`
- **and the FIRST-APPLY branch re-proved against the CURRENT prestate**, inside ONE transaction that
  was rolled back: the door dropped, §0 run **verbatim** out of the file →
  `0363 prestate: OK -- the read door is FIRST APPLY`. After the rollback the door measured back at
  `bf304a34…`

Three refusal arms, each in its own rolled-back transaction, each refusing BY NAME:

| planted | what §0 said |
|---|---|
| a foreign `clara.get_payroll_posting_state(uuid)` squatting on the name | `CLR10 … already exists and is not this file's body` |
| `clara._payroll_posting_verdict` recut to a stub | `CLR10 … body drifted (sha d47505cf…)` |
| `grant execute on clara._payroll_posting_verdict to clara_agent_ro` | `CLR10 … already carries an ACL other than its owner's ({…,clara_agent_ro…})` |

After the three rollbacks: door `bf304a34…`, verdict `4c350623…`, verdict ACL
`{clara_fn_owner=X/clara_fn_owner}` — all three back at their pre-images.

### The data-dependent branch was entered

The `completeness` key is only non-trivial on a database that holds a payslip printing no run totals
(the addendum's rule). That state was created through the estate's own doors on `clara_c01` — filed
through `file_document`, routed by the real router, claimed as a real task, read through
`clara.persist_payroll_facts` with every run field `not_printed` — and the door was driven against
it (`p1148.read.projection`). The states covered: **unread** (`facts_read`), **parked completeness
question** (`completeness_witness`), **another firm's document**, **an id that is no document**, **a
document of this firm that is not a payslip**.

**Redo-safe by construction** (#957): one `create or replace function`, one `revoke`, one `grant`, no
table, no row, no backfill. **No role is minted** (closing-wave risk 1). **No dynamic SQL**:
`grep -c "execute format\|execute '"` on the file returns `0`, so no `REVIEWED_DYNAMIC_SQL_BARRIERS`
entry is owed — stated with the run of the pins corpus, not assumed.

---

## 5 · Vacuity controls

Two cells were green on their first run, so each was shown FAILING against a deliberately broken
subject and the subject restored and re-measured.

| cell | broken subject | what it printed | restored |
|---|---|---|---|
| `p1148.read.no_oracle` | the door recut (marker kept, so a redo could restore it) to raise `'no such document'` for an id that is no document at all, keeping `'payroll summary not found'` for a foreign one — the exact oracle the criterion forbids | *"a caller can tell 'somebody else has it' from 'nobody has it' -- that IS an existence oracle, one uuid at a time (foreign {…"payroll summary not found"…} vs unknown {…"no such document"…})"* | restored by `CLARA_MIGRATION_REDO`; sha back at the pre-image `66d2be3b9f25ab7f9e4493312597b3e9b7f64351502b0846eaa307ab04cd5517` (the pre-kind-gate body), **byte for byte** |
| `p1148.acl.census` | `grant execute on function clara._payroll_posting_verdict(uuid) to clara_authenticated` | *"clara._payroll_posting_verdict holds its owner's EXECUTE and nothing else — actual `{clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner}`"* | revoked; ACL back at `{clara_fn_owner=X/clara_fn_owner}` and the body's sha still `4c350623…` |

The remaining four cells were red first for the right reason before any code existed
(`p1148.read.blocked`: *no migration matching /payroll_posting_state_read$/ is applied*;
`p1148.read.kind`: *an invoice must not be told what a payroll run's posting gate thinks of it*;
both web modules: `ERR_MODULE_NOT_FOUND`).

---

## 6 · Gates, with counts

Every db run used the full `--import ./tests/*-preintegration-gate.mjs` chain from
`packages/db/package.json` (**308 gate flags** after this ticket's entry), `--test-concurrency=1`,
against `clara_c01`. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set.

| gate | result |
|---|---|
| the db files I added or touched plus the two the ticket's own family owns, **with the full gate chain** — `payroll-posting-state-read.test.mjs`, `operation-census.test.mjs`, `rig-isolation.test.mjs`, `payroll-completeness-witness.test.mjs`, `payroll-summary-posting.test.mjs` | **82 tests · 81 pass · 0 fail · 1 skip** — the skip is `rig-isolation` T19 poison-role, which self-skips because it is destructive and `CLARA_RIG_ALLOW_RESET` is (correctly) unset |
| `payroll-posting-state-read.test.mjs` alone, full chain | **6 pass / 0 fail / 0 skip** |
| `operation-census.test.mjs` (SQL function added) | **10 pass / 0 fail / 0 skip**, run without any reset flag |
| `rig-isolation.test.mjs` | **23 tests · 22 pass · 0 fail · 1 skip** (T19, as above) |
| migration-scanning db batteries — `chain-minted-roles-drift-guard`, `collation-pin-scan`, `collation-pin-portability`, `sandbox-marker`, `migrate-runner-unit`, `hrd-a-recut-guard` | **58 tests · 56 pass · 0 fail · 2 skip** |
| **web pins corpus** (closing-wave rule (d) — a migration file changed): `apps/web` `tests/firm-scope-db-pins.test.ts` | **22 pass / 0 fail / 0 skip** — **no barrier entry owed** (no dynamic SQL in 0363; the `grep` above returns 0), stated with the run rather than assumed |
| `apps/web/lib/documents/payroll-posting-state.test.ts` (new) | **4 pass / 0 fail** |
| `apps/web/components/documents/payroll-posting-section.test.tsx` (new) | **5 pass / 0 fail** |
| the mount's neighbours — `document-detail-live-refresh`, `documents-workbench-refresh`, `documents-url-state`, `documents-a11y` | **37 pass / 0 fail / 0 skip** |
| **the WHOLE web unit suite** (`node scripts/run-tests.mjs` from `apps/web`) | **5268 tests · 5266 pass · 0 fail · 2 skip**, exit 0 |
| **browser walk** — `document-correction-walk` (the walk that renders `?tab=accounting`, where my section mounts), on **my triple** 3600/3601/3602 | **15 passed (41.8s)** |
| **browser walk** — `documents-viewer-walk` (the other walk that mounts `DocumentDetail`), same triple | **22 passed (53.4s)** |
| `pnpm typecheck` (worktree root) | **exit 0** — `apps/web` and `packages/runtime` both `Done` |
| `CI=true GITHUB_ACTIONS=true pnpm lint` | **exit 0** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 347 frozen file(s) verified against `frozen-workflows.json` (append-only vs origin/main); 60 "use workflow" module(s) all frozen+registered; 3 retired entries** |
| `pnpm --filter @clara/db migrate` (no redo, final) | `0 new migration(s) applied · 339 total`, max `0363_payroll_posting_state_read` |

**The frozen law (rule (a)), proved:** `git diff --name-only ffb629d73..HEAD -- packages/runtime` is
**empty (0 files)**; no `frozen-workflows.json`, `registry.ts`, `startWorld.ts` or
`packages/runtime/workflows` path appears in the diff; `check-frozen-workflows.mjs` is clean against
the base. `check-parts-parity.mjs` was **not** run and is not owed — it is required only when
`packages/runtime` is touched, and it is not.

**Two live observations from the browser walks worth recording.** The e2e mock log shows
`POST /rest/v1/rpc/get_payroll_posting_state` **never appears** across either walk, because neither
walk's documents are payroll summaries — which is the "an invoice page pays nothing for this
section" property observed in a real browser rather than only in the component battery. And
`get_contract_terms` still appears, so the tenancy panel beside mine is unaffected.

**Known Windows-only reds:** none were met. Every skip was identified rather than left as a number —
the 2 in the whole web suite are the two live-provider auth cells
(`CLARA_LIVE_SUPABASE_AUTH_URL` / `..._ANON_KEY` not configured, mocked coverage elsewhere); the 2 in
the migration-scanning batteries are `hrd-a HIGH-1` and its mutant (`SKIP destructive (drops schema
clara)`); the 1 in `rig-isolation` is `T19 poison-role`, same reason. All are environment self-skips
this lane must not fix, and none touches anything this ticket changed.

---

## 7 · Docs

- **`packages/db/README.md`** — a new `## 0363` section in the same commits as the code: what 0343
  left, why the floor is VIEWER and what "below the viewer floor" can even mean when viewer is rank
  0, why the firm wall and the payroll-summary subject raise DIFFERENT codes, exactly what the door
  projects and the eleven verdict keys it leaves behind, why there is no shared core (law 31), why
  STABLE is a wall rather than a hint, the three unconditional prestate pins with their measured
  shas, the post-image, the redo evidence with both prestate branches and all three refusal arms, and
  the five tail assertions. **No applied migration's section was touched.**
- **The new function carries a `comment on`** naming its floor, its wall, its two refusals and what
  it deliberately does not project.
- **`CONTEXT.md` was NOT touched**, and that is a measurement rather than an omission: #1148 mints no
  domain vocabulary. **"Payroll posting gate"** is already an entry (`CONTEXT.md:967`) and is exactly
  the concept this door reads; the door is a new way to REACH a concept the estate already names.
  Recorded here so the merger can reconcile without re-deriving it.
- **`apps/web/messages/en.json`** — two keys, appended inside `ClientDocuments` immediately before
  the sibling `tenancy` block (the section is grouped by feature, not alphabetical). The file was
  **not** re-serialized (`git diff --stat` = `4 ++++`, insertions only), and it was scanned for a
  duplicate key with an **independent scanner** (`json.loads(..., object_pairs_hook=…)`, which sees
  the raw pair list rather than a collapsed dict) → no duplicates.

---

## 8 · Successor contract — `read_payroll_posting_state`, re-pointed at this door

**Not built here.** #1144's roster is closed to additions (closing plan, rule (a)), and the ticket's
own out-of-scope line says so. Nothing in `packages/runtime` was edited. This **supersedes
`waveS-lane04-ticket1048.md` §9.2**, whose door call had to route through the queue precisely because
this read did not exist.

**Name:** `read_payroll_posting_state`

**Zod input** (unchanged from §9.2):

```ts
export const readPayrollPostingStateInput = z.object({
  document_id: z.string().uuid()
    .describe("the payroll summary whose posting state to read"),
});
```

**Door call**, on the chat lane's human-scoped pool — **and this is the part that changes**. §9.2 had
to write:

```sql
-- SUPERSEDED: clara.list_review_queue($1::jsonb, $2::jsonb, $3::integer)
--   p_scope = {"client_id": …}, then filter row_kind in
--   ('payroll_posting_blocked','payroll_completeness_question') and match the document
```

It is now one call about the document the tool actually has:

```sql
select clara.get_payroll_posting_state($1::uuid) as result
--   argument order: p_document
```

**Answer** (always an object; a blocked run is a state, not an error):

```jsonc
{ "document_id": "<uuid>",
  "sentence": "…the database's own sentence, rendered verbatim…",
  "verdict": "blocked",                 // or "ready"
  "rung": "completeness_witness",       // null when ready
  "reason": "completeness_unwitnessed", // null when ready
  "completeness": { "parked": true, "state": …, "witness": …, "answer": …,
                    "rows_read": 2, "gross_sum_cents": 500000, "net_sum_cents": 425570 } }
```

`rung_vector` is **not** projected and must not be reconstructed by the tool: it is the evaluator's
internal ladder, and a model narrating it would be narrating working rather than a decision.

**Refusal mapping** (`code` / `detail.reason` → what the tool does):

| code | reason | what it means | what the tool says |
|---|---|---|---|
| `CLR11` | *(none)* | the document is not this firm's, **or** does not exist — indistinguishable by design | "I can't see that document" — never "it belongs to another firm" |
| `CLR10` | `not_a_payroll_summary` | a document of this firm that is not a payslip | a tool bug or a stale id; say the document is not a payroll summary |
| `CLR04` | *(none)* | no authenticated actor / no active membership | infrastructure; the turn cannot read it — do not guess an answer |

**Grant the tool will need, and the one thing that is NOT true today:** the door is
`clara_authenticated`-only. A chat tool riding the human's own session reaches it as it stands; a
**model-lane twin** (`clara.wake_get_payroll_posting_state`, `clara_agent_ro` + one `interactive`
allowlist row, over an ungranted `clara._get_payroll_posting_state_core(p_firm, p_document)` on
0352's / 0353's split) does **not** exist and is a LATER migration's business, not a successor
contract's. 0363 mints no core precisely because one entrance needs none (law 31); the day the twin
is wanted, the split is the first thing that file does.

**Part kind:** **none.** This is a read; a chat turn produces no new write part for it, and no
`parts-parity` entry is owed — measured, not assumed (`packages/runtime` is untouched and
`check-frozen-workflows.mjs` is clean).

**Prompt stanza:**

> When somebody asks why a payslip did not post, ask `read_payroll_posting_state` about that
> document and say what it answers, **in its own words**. The sentence you get back is built by the
> database in one place so that what a person reads and what the lane decided cannot drift — do not
> summarise it, reword it or rebuild it out of `rung` and `reason`.
> If `completeness.parked` is true, the run is not refused: the page prints no run total and Clara
> is waiting for a named person to answer *"is this every employee for the month?"*. **You may not
> answer it** — it is a professional judgement, and the door that records it is a human one. Say what
> is being asked, say how many lines Clara read and what they total, and say that a bookkeeper or
> above answers it under Needs you.

---

## 9 · Follow-ups worth filing

1. **The model-lane twin of this read.** `clara.wake_get_payroll_posting_state` over an ungranted
   `_core(p_firm, p_document)`, on 0352's / 0353's own split, plus one `interactive`
   `clara.wake_fn_allowlist` row. 0363 mints no core because one entrance needs none; the twin is the
   file that would split it. Until then §8's tool rides the human's own session.
2. **The chat tool itself** — §8's contract, for the cut AFTER #1144's, since that roster is closed.
   It also lets `waveS-lane04-ticket1048.md` §9.2's queue-shaped contract be retired rather than left
   as two live descriptions of one tool.
3. **No browser cell drives the new section.** Both walks that mount `DocumentDetail` pass, and the
   mock log proves the section makes no door call for a non-payroll document — but no walk files a
   payroll summary and reads the accounting tab, because neither walk's mock serves
   `get_payroll_posting_state` and adding a payslip to a shared mock is wider than this ticket. The
   section's behaviour is proved by its component battery and the door's by its db battery. (Same
   posture and same gap #1147's settings card has.)
4. **`gh issue view` prints nothing on this host.** Exit 0, zero bytes, with and without `--repo`,
   both piped and to a file; `gh api` on the same repo and the same auth works. Every lane that reads
   a ticket through `gh issue view --comments` is therefore reading an empty contract without being
   told. Worth a line in `RIG.md` or a fix in the issue-tracker skill.
5. **A parked completeness question is now stated in two places** — the Needs-you row (#1048) and
   this section — and the ACT lives only in the first. That is deliberate here (a read must not grow
   a second button for the same door), but whether the document page should also carry the affordance
   is a product question nobody has been given. The section names where the answer is given, which is
   the minimum a question with no button owes a reader.

---

## 10 · Anything unverified

- **The from-scratch chain (AC7's second half).** Not run here, by the work order: this cluster
  already ran a chain and migration `0154` pins the cluster-wide role count, so a second from-scratch
  chain needs the #867 recipe, and the closing plan gives the from-scratch proof to the integrator on
  a disposable cluster. What **is** proven: the populated apply plus two redos, the FIRST-APPLY branch
  re-proved against the current prestate inside a rolled-back transaction, and all three refusal arms
  driven.
- **Nothing in production exercises the new read except the new panel.** No chat or Work tool calls
  it (that is §8), so the door is proven at the door — on a real viewer, a real firm wall and a real
  refusal ladder — and on one page above it.
- **Hosted rows.** The verdict states were driven on a seeded rig. Hosted holds payroll summaries
  this rig does not, and the door projects whatever the verdict answers for them; the projection is
  key-for-key and carries no per-state branch of its own, so the risk is confined to states the
  verdict itself can produce (which #946's and #1048's batteries own and which run green here).
- **`document_kind` is read once, at the moment of the call.** A correction that changes a document's
  kind between the page's bundle read and this door's call produces the `not_a_payroll_summary`
  refusal, which the panel answers with silence. That path is driven in the component battery against
  a mocked refusal; it is not driven end to end against a real correction, because no walk does a
  kind correction on a payslip.
