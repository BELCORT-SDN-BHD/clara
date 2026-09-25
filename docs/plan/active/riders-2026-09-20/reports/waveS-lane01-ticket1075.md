# riders sweep wave · lane 01 · ticket #1075 — the accrual register's side filter moves server-side

**Status: DONE.**
Branch `riders/wS-lane01`, worktree `C:\Users\zhant\Desktop\clara-wt\651`, base `7bc5a710f`.
Database `clara_l04` at `127.0.0.1:55744`. Playwright triple `https://127.0.0.1:3530 / 3531 / 3532`.

Start state, as the work order requires: `git status` clean; `git log --oneline 7bc5a710f..HEAD`
showed the two #1051 commits, the five #1080 commits, the four #1074 commits and the four #1073
commits already landed (top commit `fc9d61b2b`, `feat(web): #1073 "Reverse this period only" on
both conflict surfaces`); the lane database read **313 files, max
`0333_plan_occurrence_reversal_door`**.

Commits added by this ticket:

| sha | message |
|---|---|
| `705520ed9` | `fix(db): #1075 the accrual register's side filter moves server-side (0334)` |
| `c6355d4ef` | `test(db): #1075 the optional filter, its composition with the window, and the closed set` |

Working tree clean. Nothing pushed, no PR, no GitHub write of any kind. **No message arrived
mid-task** (sweep rule (f) did not fire).

---

## The seams I tested at (written before the first test, work order rule 4)

1. **`clara.list_accrual_adjustments(uuid,date,date,text)`** — the one door the ticket names. Driven
   as BOB (bookkeeper) through the named-argument RPC call shape (`p_client => …, p_side => …`),
   the same shape PostgREST sends.
2. **`clara._accrual_sides()`** — the closed set the new filter is judged against (#942/0304's own
   internal, consumed here and not redefined).
3. **The door's existing date-window predicate** (`p_from`/`p_to`) — driven alongside the side
   filter, never in isolation, because AC1 asks for the two to compose.
4. **The catalog** — the estate's documented structural standard for a widened door (a prestate that
   recognises two starting shapes, tail assertions, ACL/posture re-reads). Work order rule 4 says
   that standard wins where it applies.

What I deliberately did **not** add a seam at: `apps/web/components/accruals/accruals-list.tsx` and
`apps/web/lib/accruals/api.ts`'s `loadAccruals`. See "Out of scope" below.

---

## The ticket, verified live on this branch before building

`gh issue view 1075 --repo BELCORT-SDN-BHD/clara --comments`: the issue body carries the only Agent
Brief and there are **zero comments**, so there is no owner ruling comment on this ticket, and none
dated 2026-09-20 either.

| the ticket's claim | measured on `clara_l04` before a line was written | verdict |
|---|---|---|
| "`clara.list_accrual_adjustments` takes no `side` parameter; it always returns every accrual of the requested date range" | confirmed: `pg_get_function_identity_arguments` reads `p_client uuid, p_from date, p_to date`, three arguments, no side | **live** |
| "the register's own side filter … narrows what was already read, entirely in the browser" | confirmed: `apps/web/components/accruals/accruals-list.tsx` reads `const rows = side === "" ? all : all.filter((r) => r.side === side)` over the FULL `loadAccruals(clientId)` answer, and the component's own comment already names this as deliberate ("a VIEW of what was already read, not a second round trip") | **live** |
| "if the register is ever changed to paginate … a client-side filter over one page would silently miss matching rows" | the register does not paginate today: `loadAccruals` calls the door with no limit and `useAsyncRead` renders the whole answer — so the gap this ticket closes is **latent**, not live, exactly as the ticket's own "Out of scope" line says | **live, and correctly scoped as prevention** |
| Out of scope: "Building pagination itself; this ticket only prepares the read for it. If pagination is not planned soon, this can wait until it is." | `SWEEP-PLAN.md`'s lane table lists `#1075 (yes)` — a migration is owed — and its lane note says only "`#1075 changes clara.list_accrual_adjustments's signature, so it is a migration`", never a web change | **the orchestrator's own scoping already reads this the way I read it: build the door, not the wiring** |

No re-brief was needed; the ticket is narrow and internally consistent, and its own words gate its
second acceptance criterion on pagination existing.

---

## Acceptance criteria, each with its evidence

### AC1 — "`clara.list_accrual_adjustments` accepts an optional side filter and returns only matching rows when given one." ✅

* **`p1075.filter.side`** — a client is configured with one expense-side accrual and one
  revenue-side accrual (same window). `side: "expense"` answers `[expenseId]` and nothing else;
  `side: "revenue"` answers `[revenueId]` and nothing else; the envelope's own `side` key echoes
  what was asked (`"expense"`, `"revenue"`); an omitted `side` answers **both**, with `side: null`
  in the envelope. **PASS.**
* **`p1075.filter.composes_with_window`** — a side filter that ALSO composes with the existing
  window predicate: two expense-side accruals on the same client, one five months back, one two
  months back. `side: "expense"` plus `from`/`to` bounding only the recent window answers the
  recent accrual alone — the older, same-side accrual is excluded because it is OUTSIDE the window,
  never because of the side filter — and the same call WITHOUT the window answers both. This is the
  composition AC1 asks for, measured rather than assumed. **PASS.**
* Every OTHER projected field on a filtered row is unchanged from the unfiltered read
  (`amount_cents` compared directly) — this is a `WHERE` clause, not a re-derivation. **PASS.**

### AC2 — "The register's side filter control uses the server-side parameter once pagination exists, rather than filtering a fully-read page client-side." — deferred, per the ticket's own gate

The ticket's own second acceptance criterion names this happening **"once pagination exists"**, and
the ticket's own "Out of scope" line says building pagination is not this ticket's job and, absent a
pagination plan, "this can wait until it is [planned]". `apps/web/lib/accruals/api.ts`'s
`loadAccruals` still calls the door with no `side` argument and
`apps/web/components/accruals/accruals-list.tsx` still filters the fully-read array client-side —
**unchanged, deliberately**. Rewiring the control now, ahead of pagination, would trade the
register's existing instant client-side filter (every row already in hand, one render, no network
round trip) for an unnecessary round trip on every filter click — the opposite of what the
component's own comment already argues for, and not what either acceptance criterion asks for while
pagination does not exist. The capability AC2 needs is built and proven (AC1); the caller lands with
pagination, as a follow-up (see below).

---

## The migration

**`packages/db/migrations/0334_accrual_list_side_filter.sql`** (468 lines). Exactly one new file,
at the number reserved for me. **No overflow number was needed.**

### Prestate pins — MEASURED on `clara_l04` now (313 files, max `0333_plan_occurrence_reversal_door`), before this file was written

| signature | pin | role |
|---|---|---|
| `clara.list_accrual_adjustments(uuid,date,date)` | `c4924f1dbbd6b3ae0dd073ceed5f9b19016cc842a796d4256bd5f909f58c22df` | the body this file drops and re-creates — matches #942/0304's own recorded post-image exactly; untouched by any of #1051/#1080/#1074/#1073's migrations (measured, not assumed) |
| `clara._human_ctx(integer)` | `d1a8a1940ffee67f0bbe1f44f4081c8a5b1fca1775832948c2c606ced2043a46` | the viewer-floor check the recut body still calls |
| `clara.role_rank(text)` | `5ced25aed03ff000519af583c5c5b89c4d59c4cb5f20e49f39877435e8c2576f` | …the rank it names |
| `clara._accrual_sides()` | `8db11e9cdca5398b85aac24e6ea3ce1a3790149892d911f7008ccbfe0a9d9bab` | the closed set the new filter is judged against; consumed, never redefined |
| `pg_depend` rows on the dropped signature | **0** | belt-and-braces before the DROP; `drop function` without CASCADE would already refuse on a real one |
| other `clara` bodies mentioning `list_accrual_adjustments` by name | **0** | confirms this door is a leaf nothing else calls |
| posture before the drop | `clara_fn_owner \| true \| s \| search_path=clara, pg_temp \| clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner` | SECURITY DEFINER, STABLE, owner, ACL — the four things a DROP destroys and a `create or replace` would have kept |
| `obj_description` on the dropped signature | `null` | no comment existed before this file; 0334 MINTS the first one rather than re-issuing a lost one |

**No data-dependent branch.** Every prestate and tail arm reads `pg_proc`, `pg_depend` and
`pg_namespace` only, so no arm needed rows entered before applying.

### The change

`drop function if exists clara.list_accrual_adjustments(uuid, date, date)` followed by
`create or replace function clara.list_accrual_adjustments(p_client uuid, p_from date, p_to date,
p_side text default null)` — the 0202/#770 and 0267/#905 precedent (`create or replace` cannot add a
parameter; a longer type list is a DIFFERENT overload left resolvable beside the old one, which
`db.tail T.1`-style checks would then need to close by hand). `p_side` sits LAST, so every existing
positional caller keeps its meaning and an omitted value reproduces the three-argument door exactly.

The body gains exactly two things, both inside the existing `begin…end`:

1. a refusal guard, placed right after the existing client-scope check and before the query:
   `if p_side is not null and not (p_side = any (clara._accrual_sides())) then raise … errcode='CLR10' … 'reason','accrual_side_filter_unsupported' …` — the SAME closed-set judgement
   `clara._assert_accrual_particulars` already applies to a CONFIGURED side (0304:434), answered the
   same way (`field`, the value, `supported`).
2. one predicate inside the relation's own `where`, ahead of the `jsonb_agg`:
   `and (p_side is null or a.side = p_side)`.
3. one echoed key in the returned envelope, beside the existing `from`/`to` echo: `'side', p_side`.

Every existing arm — the client-scope refusal, the full 18-key projection, the
`(effective_from desc, created_at desc)` order, both existing date-window predicates, the echoed
`from`/`to` fields — is byte-for-byte unchanged; the tail proves it with `position()` checks against
the committed text rather than assuming the diff did what it says.

Grants and comment, re-issued by hand (a DROP takes them; a `create or replace` alone would have
kept them): `revoke all … from public`, `grant execute … to clara_authenticated`, and a MINTED
`comment on function` (none existed before).

### No rig-meta cohort — the same "still the same name and ACL" shape #905/0267 records

`list_accrual_adjustments` is already in `ACCRUAL_ADJUSTMENTS_0222_HUMAN_FNS`
(`packages/db/tests/rig-meta.mjs`), and a drop-and-create of the SAME name at the SAME grant is not
a new name: the tail re-reads owner, SECURITY DEFINER/STABLE posture and the literal ACL unchanged
after the recut, so that roster entry already covers the widened door. I added a documentation note
beside it (the exact shape #905's own note carries) rather than a new cohort constant — a cohort of
its own would be WRONG here, not merely redundant: `cohortFailures()` fails a half-present cohort,
and `list_accrual_adjustments` is present on every database from 0222 onward regardless of whether
0334 has applied.

### Tail

T.1 the door resolves at exactly `(uuid,date,date,text)`, and the three-argument signature does
NOT resolve as an overload · T.2 the refusal guard, the refusal's `reason`, the predicate and the
echoed envelope key are all present, and `p_side` is mentioned in the committed text **exactly
seven times** (twice in the refusal guard's own condition, twice raising it — the substitution plus
the echoed value in the detail — twice in the predicate, once in the envelope) · T.3 every existing
arm survives byte-for-byte (the client-scope refusal, the projection's first fields, the derived
`posted` flag, the sort order, both date-window predicates, the echoed `from`/`to` fields) · T.4 the
four properties a DROP destroys, re-read in one comparison: owner `clara_fn_owner`, SECURITY
DEFINER (`true`), STABLE (`'s'`), pinned `search_path`, and the exact ACL with its grantor · T.5 the
comment is present and names `#1075` and `p_side` · T.6 the sibling door
`clara.get_accrual_adjustment(uuid)` still resolves — untouched (nothing in this file reaches it).

Every comparison is over `prosrc` text and `proname`; **no digest over text-ordered row content is
pinned anywhere** (sweep rule (e)).

### Apply history on this rig

1. `pnpm --filter @clara/db migrate` → prestate printed **`three-argument, pre-widen`** (the
   FIRST-APPLY branch), `applied 0334_accrual_list_side_filter`, tail printed OK. **The first-apply
   branch of the bimodal prestate was exercised for real.**
   (On the very first attempt the tail's own `p_side` occurrence count was wrong — 7, not the 5 I
   had guessed writing the header comment — and the migration FAILED and rolled back with that exact
   count in its own error message; I corrected the count and comment and re-applied. Recorded here
   rather than hidden: this is the "red for the right reason" the file's own self-checks are for.)
2. Redo tested: `CLARA_MIGRATION_REDO=0334_accrual_list_side_filter` (`CLARA_ALLOW_DESTRUCTIVE=1`,
   `CLARA_RIG_DB=1`) → prestate printed **`four-argument, this file's own prior redo`** (the REDO
   branch, recognised by its `p_side` / `accrual_side_filter_unsupported` markers), tail OK,
   `redone 0334_accrual_list_side_filter · new checksum 329640c3…`. **The redo branch of the
   bimodal prestate was exercised for real too**, and the function's `prosrc` sha was measured
   identical before and after (`2fbad3aafb4317e82f73b061c07119170d9bbb49812fea14cc90d78d3aec2e47`).
3. The subject was then deliberately broken (see "TDD" below) and restored through the SAME redo
   path, converging on the identical sha a second time.
4. Final ledger state, confirmed directly against `clara_l04` at `127.0.0.1:55744`: **314 files, max
   `0334_accrual_list_side_filter`**, function sha `2fbad3aa…`, signature
   `p_client uuid, p_from date, p_to date, p_side text`.

---

## TDD — the slice, and the red I saw

This is a one-slice ticket: one parameter, one predicate, one refusal, one echoed key, on one
already-existing door. The migration's own prestate/tail DO blocks are the first, structural test —
and they went red for a real reason on the first apply (the `p_side` occurrence count, above) before
going green.

**The battery**, written against the applied migration and run immediately: `p1075.filter.side` and
`p1075.filter.unsupported` were green on the first run; `p1075.filter.composes_with_window` was
written second, specifically to make the "server-side" half of AC1 (not just "a filter exists") a
measured claim rather than an assumed one, and was also green on first run — a one-slice migration
built directly against the door's already-verified prestate/tail leaves little room for the cell
itself to be wrong in a way its own construction wouldn't have already caught, so I say plainly that
these three did not go red first, and lean on the break control below for their non-vacuity.

**The vacuity control (work order rule 4), run once over the whole file.** The subject was recut
**on the rig only** into the null hypothesis a reviewer would raise — "the fourth parameter is
accepted but does nothing" — by re-running the ORIGINAL 0304 three-argument body's logic under the
new four-argument signature (the refusal guard and the `and (p_side is null or a.side = p_side)`
predicate both removed, `p_side` otherwise unused except in the echoed envelope). **2 of 3 cells
went RED**, each for its own reason:

```
not ok 1 … side=expense answers EXACTLY the expense-side accrual, never the revenue one
           (got both ids back — the predicate is gone)
ok     2 … composes_with_window (the WINDOW predicate alone still excludes the older accrual;
           this cell does not by itself prove the side predicate, so it stayed green — recorded
           honestly rather than claimed as a second red)
not ok 3 … a side filter outside the closed set: expected SQLSTATE CLR10 but the call SUCCEEDED
           (the refusal guard is gone)
```

The subject was then restored **byte for byte** via `CLARA_MIGRATION_REDO=0334_accrual_list_side_filter`
(the sha the prestate's own redo branch recognises), and all three cells green again, sha confirmed
identical to the pre-break measurement. No battery of red cells was written ahead of implementation;
the migration itself was the implementation this ticket exists to add.

---

## Gates, with counts

| gate | command | result |
|---|---|---|
| my new db file, **full gate chain** (130 `--import` gate modules, mine included) | `node --test --test-concurrency=1 $GATES tests/accrual-list-side-filter.test.mjs` | **3 tests, 3 pass, 0 fail, 0 skipped** |
| the two sibling files I touched, plus mine, full chain | `node --test --test-concurrency=1 $GATES tests/accrual-adjustments.test.mjs tests/accrual-revenue-side.test.mjs tests/accrual-list-side-filter.test.mjs` | **33 tests, 33 pass, 0 fail, 0 skipped** (21 + 9 + 3) |
| operation census + rig isolation (I widened an SQL function's grant-bearing signature), **no reset flags** | `node --test --test-concurrency=1 $GATES tests/operation-census.test.mjs tests/rig-isolation.test.mjs` | operation-census: **10 tests, 10 pass**; rig-isolation: **23 tests, 22 pass, 1 skipped** (`T19 poison-role`, skipped *because* `CLARA_RIG_ALLOW_RESET` is unset — the rig rule, never set here). `T17` (exact grant matrix) and `T18` (every SECURITY DEFINER pins `search_path` and is owned by `clara_fn_owner`) both PASS with the widened door. |
| web migration-pins corpus (sweep rule (d): in scope because a migration file changed) | `node --import ./test/bootstrap.mjs --import tsx --test tests/firm-scope-db-pins.test.ts` from `apps/web` | **22 tests, 22 pass, 0 fail** — confirms **no barrier entry is owed for 0334** (0334 is static DDL — a `drop function`/`create or replace function` pair — with no dynamic SQL splice and no view definition at all) |
| typecheck | `pnpm typecheck` | **exit 0** (I touched no `.ts`/`.tsx` file; ran anyway, per the gate) |
| lint, as the runner sees it | `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` | **exit 0** (see the base-drift note below — same drift #1073's report already recorded, unrelated to this ticket) |
| whole-package db suite, spot-checked beyond rule 8's requirement | `node --test --test-concurrency=1 $GATES "tests/**/*.test.mjs"` (all 130+ gate modules, every `.test.mjs`) | in progress at the time this report was written; **900+ cells observed, zero failures**, my three cells and the two touched siblings' cells all confirmed `ok` within the run. Not a required gate (rule 8 names the touched files' own full chain plus operation-census/rig-isolation), run as extra diligence given the shared-fixture edit; `pnpm run test`'s own invocation hits a Windows `cmd.exe` command-line length ceiling at 130 `--import` flags (unrelated tooling limit, not a test failure — `node` invoked directly avoids it) |
| migration ledger | `pnpm --filter @clara/db migrate` (final run) | `0 new migration(s) applied · 314 total`, max `0334_accrual_list_side_filter` |

I touched no `apps/web` file and no `packages/runtime` file, so the web whole-unit-suite gate, the
browser-walk gate and the runtime gates (`check-frozen-workflows.mjs` /
`check-parts-parity.mjs`) do not apply by rule 8's own conditions — I ran `check-frozen-workflows.mjs`
anyway as part of the `pnpm lint` chain (see above) and it is clean against the lane's own base.

### The lint base-drift, which is NOT this ticket's and must not be read as a green

`CI=true GITHUB_ACTIONS=true pnpm lint` (no `FREEZE_BASE_REF` override) fails at its first step on
this branch with `frozen-workflows.json` violations of the exact shape #1073's own report already
recorded: `origin/main` in this worktree now resolves to `3bf6aa94d` (PR #1142,
`docs/riders-cut-as-run`), well past this lane's base `7bc5a710f` — `git merge-base origin/main HEAD`
confirms `7bc5a710f` is an ancestor of both, i.e. the cut phase (and other wave work) merged to
`origin/main` after this lane was cut. My own diff touches no `packages/runtime` file at all
(`git diff --name-only 7bc5a710f..HEAD` for both my commits lists only `packages/db/*`). Run against
the lane's own base with the script's supported override (`FREEZE_BASE_REF=7bc5a710f`,
`scripts/check-frozen-workflows.mjs:153`), the whole chain is exit 0. This is a wave-level,
pre-existing condition every remaining lane on this base will hit identically; I did not rebase and
I did not touch `frozen-workflows.json`.

---

## Docs, in the same commits

* **`packages/db/README.md`** — a new `## 0334` section: the gap in the ticket's own words, the
  whole of the change, why a drop-and-create rather than `create or replace`, the redo-safety
  construction, why no rig-meta cohort is owed, what the file deliberately does not do (the web
  wiring), and the redo record with the measured shas. **No existing section was edited** and no
  applied migration was touched (`git show --stat` on both commits: only `0334` appears under
  `migrations/`).
* **`packages/db/tests/rig-meta.mjs`** — a documentation-only comment beside
  `ACCRUAL_ADJUSTMENTS_0222_HUMAN_FNS`, in the exact shape #905's own "no cohort change" note
  carries. No cohort constant, no roster change, no `cohortFailures()` call added — none is owed.
* **`packages/db/package.json`** — one `--import ./tests/accrual-list-side-filter-preintegration-gate.mjs`,
  appended at the sorted position (migration order, immediately after 0333's). Minimal hunk on a
  shared file.
* **`packages/db/tests/accrual-adjustments-fixtures.mjs`** — the wire-contract comment at the top of
  the file updated to name the fourth parameter, and `listAccrualAdjustments` documented in place
  (why `side` is sent conditionally).
* **`CONTEXT.md`, `apps/web/messages/en.json`, `apps/web/test/manifest.txt`,
  `apps/web/tests/firm-scope-db-pins.corpus.ts` — no hunk owed.** No new domain vocabulary (the
  "Accrual side" entry names what a side IS, unchanged by a filter parameter on a read door); no new
  web test file; no dynamic-SQL barrier (0334 is static DDL, confirmed by the pins-corpus test run
  above, which needs no new entry to pass).

---

## Successor contract

**None is owed as an edit.** This ticket touches no frozen workflow body and no module in a frozen
closure (`git diff --name-only 7bc5a710f..HEAD` for both commits lists only `packages/db/*`; the
freeze lint is clean against the lane base). No existing door's name, signature, argument order,
grant, part kind or `detail.reason` vocabulary moves — `p_side` is a pure addition with a default,
and every OTHER caller in the estate (the frozen `start_accrual_work` tool included, which never
calls `list_accrual_adjustments` at all) is unaffected.

If a frozen chat or Work tool is ever to read the register filtered by side, the whole of what it
needs is:

* **name** — `list_accrual_adjustments` (PostgREST RPC; `clara_authenticated`, viewer floor enforced
  in the body — unchanged from today).
* **zod input** —
  ```ts
  z.object({
    client_id: z.string().uuid(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    side: z.enum(["expense", "revenue"]).nullable().optional(),   // omitted or null = every side
  }).strict()
  ```
* **door call, argument order** — `clara.list_accrual_adjustments(p_client => client_id,
  p_from => from ?? null, p_to => to ?? null, p_side => side ?? null)`. Four named arguments; the
  first three are unchanged from today, `p_side` is new and optional.
* **answer** — the existing envelope, unchanged, PLUS one new key: `{client_id, from, to, side,
  accruals[]}`, where `side` echoes exactly what was sent (`null` for "every side").
* **refusal mapping** — the two existing refusals are unchanged: `CLR04` (`no authenticated actor` /
  `actor has no active membership` / `insufficient role`, via `clara._human_ctx`) and `CLR11
  client_not_found`. ONE new refusal: `CLR10 accrual_side_filter_unsupported` (`detail.field='side'`,
  `detail.side=<the rejected value>`, `detail.supported=['expense','revenue']`) when `p_side` is
  present and not a member of the closed set — never for an omitted or null value.
* **part kind** — none new; this is a read door, no part is produced.
* **prompt stanza** — "When you read a client's accrual register, you may narrow it to one side
  (`expense` or `revenue`) by naming it exactly; omit it to read every side, which is today's
  behaviour. A side outside the two named ones is refused rather than answering an empty page."

---

## Follow-ups worth filing (I filed nothing — no GitHub write)

1. **The web wiring itself.** `apps/web/lib/accruals/api.ts`'s `loadAccruals` and
   `apps/web/components/accruals/accruals-list.tsx`'s side control should switch to the server-side
   `p_side` parameter (dropping the client-side `.filter(...)`) as part of whatever ticket adds
   pagination to the accrual register — the ticket's own AC2, deferred here per the ticket's own
   words. When that lands, the component's own comment ("a VIEW of what was already read, not a
   second round trip …") needs rewording too, since it would no longer be true.
2. **The freeze-lint base drift (see the gates table)** is a wave-level decision for the
   orchestrator, not a ticket — identical to the note #1073's own report already filed.

---

## Anything unverified

* **The whole-package db suite spot-check was still running when this report was written** (900+ of
  an eventual several-thousand cells observed, zero failures, my own file and both touched siblings
  already confirmed clean within the run). This was extra diligence beyond rule 8's own requirement
  (the touched files' full gate chain, plus operation-census/rig-isolation, both of which completed
  and are reported above with final counts); I am not blocking this report on it finishing, and say
  so rather than implying a completed whole-suite green I had not yet measured.
* **No runtime end-to-end and no browser walk were run for this ticket.** `packages/runtime` and
  `apps/web` carry no change from it, and no frozen tool calls `list_accrual_adjustments` at all
  (only `apps/web/lib/accruals/api.ts`'s `loadAccruals` does, unchanged by this ticket) — so neither
  gate applies by rule 8's own conditions, and I did not run either.
