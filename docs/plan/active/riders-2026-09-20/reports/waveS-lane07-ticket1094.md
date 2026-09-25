# Riders sweep wave — lane 07, ticket #1094

**`CLARA_AUTH_WALL_SERVICE_TOKEN` now gates three pre-session routes, not one — disclosed in
`apps/web/README.md`'s Cloudflare deployment section, where the six Worker secrets are listed and
`wrangler secret list` runs before every deploy. No migration, no code path changed.**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09`, 312 migration files, max `0349_admit_autodraft_task_outcome_disclosure` (**unchanged** — no migration) |
| commit (this ticket) | `b95da1c96` `docs(web): #1094 disclose that CLARA_AUTH_WALL_SERVICE_TOKEN now gates three pre-session routes` |
| tickets before mine on this branch | #1047, #1098 (`0347`), #1046 (`0348`), #1132 (`0349`), #1096, #1099 — none touch `apps/web/README.md`'s Cloudflare deployment section or either runtime route file |
| verdict | **done** |

## Resume note

This is a RESUME. `git status` at start: clean tree, nothing uncommitted. `git log --oneline
7bc5a710f..HEAD`: 16 commits, the top one already naming `#1094`
(`b95da1c96 docs(web): #1094 disclose that CLARA_AUTH_WALL_SERVICE_TOKEN now gates three
pre-session routes`) — an earlier implementer of this ticket finished one slice and committed it
before being cut off; no unfinished uncommitted work was left in the worktree. I read that commit's
full diff, judged it against the ticket's two acceptance criteria and the sweep-wave notes, verified
every factual claim it makes against the live source (below), ran the gates it had not yet run or
recorded, and am reporting it as the finished ticket rather than redoing it. `packages/db` and
`clara.schema_migrations` are untouched by this ticket (still 312 rows / `0349`), matching "expected
to need NO migration."

Ticket contract read fresh via `gh issue view 1094 --repo BELCORT-SDN-BHD/clara --json
number,title,body,comments`: the Agent Brief is in the **issue body**, the issue carries **zero
comments**, no owner-ruling comment on the issue itself. `SWEEP-PLAN.md`'s lane table lists `#1094
(no)` — no migration, consistent. Nothing in `SWEEP-PLAN.md`'s per-ticket notes narrows or
re-briefs #1094 beyond what the issue body already says. Verified still live on this branch before
accepting the landed commit (see "Verifying the claims" below) — nothing before #1094 in the lane
touches `CLARA_AUTH_WALL_SERVICE_TOKEN`, `authWallRoutes.ts`, `invitePreviewRoutes.ts`, or
`apps/web/README.md`'s Cloudflare section.

A status-report request mid-task did not arrive; none to note.

---

## The seam I tested at

Written down before I judged the landed slice, per work-order rule 4:

1. **The ops documentation itself** — the ticket's own "Key interfaces" names exactly one seam:
   "The ops runbook / release documentation that covers secret rotation for
   `CLARA_AUTH_WALL_SERVICE_TOKEN`." There is no door, no read, no component render and no CLI exit
   code named or implied anywhere in the brief. This is a genuinely seam-less documentation ticket:
   the deliverable IS the prose, and its correctness is judged by reading it against the code it
   describes, not by driving a public interface.
2. **The three route files the prose makes claims about** (`packages/runtime/src/
   authWallRoutes.ts`, `packages/runtime/src/invitePreviewRoutes.ts`), read to confirm every factual
   claim in the new paragraph is true today, not merely plausible.

No test file was added, and none is owed. Precedent in this same lane: #1047's two pure-README
commits (`360269c0c`, `4d975c8d0`) added no new test file either — a documentation-only slice with
no computable behaviour and no seam the brief names gets no test, per rule 4's own text ("No test
at a seam the brief does not give you"). I confirmed there is no existing test infrastructure in
this repo that asserts `apps/web/README.md` prose content (searched `apps/web` for any `*.test.*`
file reading `README.md` off disk — the closest analogues, `runtime-outbound.test.ts` and the
`e2e`/`token-contrast` files, test code behaviour or CSS tokens, never README prose), so inventing
one here would be new test infrastructure the ticket does not ask for, not filling a gap the ticket
names.

---

## Verifying the claims — every factual statement in the new paragraph, checked against live source

| claim in the new paragraph | checked against | result |
|---|---|---|
| "gates three pre-session runtime routes, not one" | `authWallRoutes.ts:59-61` (`CONFIRM_PATH`, `RESEND_PATH`, `SERVICE_TOKEN_VAR = "CLARA_AUTH_WALL_SERVICE_TOKEN"`), `invitePreviewRoutes.ts:55` (`INVITE_PREVIEW_PATH`) | **true** — exactly three route constants across the two files, one shared token var |
| `/api/auth-wall/confirm` | `authWallRoutes.ts:59` | **true**, byte-identical |
| `/api/auth-wall/resend`, "#621" | `authWallRoutes.ts:60`, `authWallRoutes.ts:235` (`// #621 (journey A2) — THE RESEND LEG, WALLED THE SAME WAY`) | **true** — the citation matches the code's own comment |
| `/api/invite-preview`, "#871" | `invitePreviewRoutes.ts:55`; `apps/web/README.md:416` ("CLOSED (ticket 871, migration 0309)") | **true** |
| "Sharing one value is deliberate" | `invitePreviewRoutes.ts:18` ("It shares `CLARA_AUTH_WALL_SERVICE_TOKEN` with …") | **true**, stated in the runtime's own comment |
| the runtime "holds it as its own Fly secret on `clara-runtime`" and both files "read `process.env.CLARA_AUTH_WALL_SERVICE_TOKEN`" | `authWallRoutes.ts:29-31` (constant-time comparison, 503 when unset, "there is no allow-when-unconfigured arm"); `invitePreviewRoutes.ts:18` | **true** |
| "rotating it stops all three at the same time" | follows directly from all three routes comparing against the one process-level env var with no per-route fallback | **true**, confirmed by reading the comparison logic, not merely inferred |
| placement: "where an operator rotating the token would actually see it" | `apps/web/README.md:536` lists the six Worker secrets (`CLARA_AUTH_WALL_SERVICE_TOKEN` first) immediately above; `README.md:562-566` runs `wrangler secret list --name clara-web` as the pre-deployment step right below | **true** — the paragraph sits between the secret list and the pre-deploy command an operator actually runs |

No claim in the added prose was found stale or unsupported. I also checked the one other place in
the same README that names this token (`apps/web/README.md:430`, the invite-preview journey-closure
paragraph, unrelated to secret rotation) — it already says "this app holds only
`CLARA_AUTH_WALL_SERVICE_TOKEN`," consistent with the new paragraph, not contradicting it, and out
of this ticket's scope (it documents a different fact: what credential the browser never sees, not
rotation consequences).

I also checked whether "the ops runbook" the brief names could mean something other than
`apps/web/README.md`'s Cloudflare section: `docs/plan/active/riders-2026-09-20/RELEASE-W4-RUNBOOK.md`
mentions "secret"/"rotat" only in the context of the Supabase/Fly token substitution rule and the
one-off #871 release's own as-run record — a dated, immutable history of one past deployment, not a
living rotation playbook — and never names `CLARA_AUTH_WALL_SERVICE_TOKEN` at all (`grep -n
CLARA_AUTH_WALL_SERVICE_TOKEN` on that file: no match). `packages/runtime/README.md` has no Fly-secrets
section and no mention of this token or of `fly secrets set` at all (`grep -n
"CLARA_AUTH_WALL_SERVICE_TOKEN\|fly secret"`: no match) — the runtime side has no natural home for
this note. `apps/web/README.md`'s Cloudflare deployment section is the one place in the repository
that both lists this secret by name among the six Worker secrets AND documents the pre-deployment
`wrangler secret list` step an operator runs before rotating anything. It is the correct target, and
the landed commit chose it correctly.

---

## Acceptance criteria, each with its evidence

### AC1 — "The ops documentation names all three pre-session routes this token currently gates."

**DONE.** `apps/web/README.md:545-556` (current file, after the commit): "`CLARA_AUTH_WALL_SERVICE_
TOKEN` gates three pre-session runtime routes, not one: the confirm wall (`/api/auth-wall/confirm`),
the resend wall (`/api/auth-wall/resend`, #621) and the signed-out invite preview
(`/api/invite-preview`, #871)." All three route paths are named verbatim, each cross-referenced to
the ticket that introduced it. Verified against live source above — every name is byte-accurate.

### AC2 — "The note is placed where an operator rotating the token would actually see it."

**DONE.** The paragraph sits at `README.md:545`, immediately after the six-Worker-secrets bullet
list (`README.md:536-543`, `CLARA_AUTH_WALL_SERVICE_TOKEN` is the first secret named) and before the
build/deploy walkthrough that runs `pnpm --dir apps/web exec wrangler secret list --name clara-web`
as an explicit pre-deployment step (`README.md:562-566`). This is the exact section of the exact
file an operator opens to deploy or rotate a Worker secret — not a buried aside, not a different
document an operator would have to know to cross-reference.

### Out of scope (the ticket's own)

"Splitting the token into per-route secrets (the sharing is deliberate)." Not touched — no code
change anywhere; the sharing remains exactly as it was, and the new paragraph explicitly frames it
as deliberate rather than proposing to undo it.

---

## Gates, with counts

This ticket touches `apps/web/README.md` only — one prose file, no code, no test, no migration.

| gate | result |
|---|---|
| `apps/web` whole unit suite, `node scripts/run-tests.mjs` from `apps/web` (work-order rule 8: owed unconditionally once any `apps/web` file is touched — `README.md` counts) | **5173 tests, 5171 pass, 0 fail, 2 skipped, 142 suites, exit 0** |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime` both `tsc --noEmit` clean, no errors (this ticket touched no `.ts`/`.tsx` file) |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **pass, exit 0** — `apps/web`, `packages/runtime`, `packages/db`, `packages/reporting-render` all clean; `check-frozen-workflows.mjs` and `check-parts-parity.mjs` ran clean as part of the chain |
| DB frontier re-check: `select count(*), max(version) from clara.schema_migrations` on `clara_l09` | `{ n: '312', v: '0349_admit_autodraft_task_outcome_disclosure' }` — **unchanged**, confirming no migration was added by this ticket |
| `git status` / `git diff --stat HEAD` after review | clean, no uncommitted changes anywhere in the worktree |

### Why the `FREEZE_BASE_REF` override was used

Same finding #1132's and #1099's reports already recorded for this lane: `origin/main`'s local ref
has moved 59 commits past this lane's own base `7bc5a710f` (PR #1140, the riders cut-phase
integration, merged after this branch was cut). `check-frozen-workflows.mjs` supports the
`FREEZE_BASE_REF` override (`scripts/check-frozen-workflows.mjs:153`) and the work-order addendum's
own rule ("everywhere a rule says `origin/main..HEAD`, read `<base>..HEAD`") calls for using it.
Recorded again here for whoever reads this ticket's gates next — it will keep recurring until the
lane merges past PR #1140.

Not owed and not run, with the reason: any `packages/db` gate chain (no `packages/db` file touched
— no migration, no test, no SQL function; operation-census/rig-isolation are owed only if
`packages/db/tests` is touched or a SQL function is added, neither happened here); any browser walk
through `pnpm --filter @clara/web e2e <spec>` (no e2e spec touched — a README is not an e2e
surface); `node scripts/check-frozen-workflows.mjs` / `node
packages/runtime/scripts/check-parts-parity.mjs` standalone (no `packages/runtime` file touched;
both ran anyway as part of the full `pnpm lint` chain above and passed).

Known Windows-only reds from `RIG.md`: none encountered.

---

## Migration

**None.** No `packages/db/migrations/*.sql` file was added, edited or applied. No `packages/db`
object was created, recut or touched. The lane database stays at 312 files /
`0349_admit_autodraft_task_outcome_disclosure`, re-measured live and unchanged by this ticket. The
ticket's own "expected to need NO migration" held.

---

## Shared files

| file | my hunk |
|---|---|
| `apps/web/README.md` | ONE new paragraph (11 lines, `README.md:545-556`) in the existing "Cloudflare deployment" section, between the six-Worker-secrets bullet list and the "Build the Cloudflare bundle in Linux…" paragraph. No existing sentence in that section rewritten. |
| `apps/web/messages/en.json`, `apps/web/test/manifest.txt`, `apps/web/lib/navigation/tree.ts`, `apps/web/lib/firm/needs-you.ts`, `apps/web/tests/firm-scope-db-pins.corpus.ts`, `CONTEXT.md` | **not touched.** No code changed, no new vocabulary, no new test file, no migration file (sweep rule d's web-pins-corpus trigger — "whenever a migration file changed" — did not fire). |
| `packages/db/README.md`, `packages/db/package.json` ($GATES), `packages/db/tests/rig-meta.mjs`, the six `packages/db/tests` census files | **not touched** — this ticket is `apps/web` documentation only. |
| `packages/runtime/*` | **read only** (`authWallRoutes.ts`, `invitePreviewRoutes.ts`), to verify the new prose's claims; **not edited**. |

---

## Docs

- `apps/web/README.md`'s Cloudflare deployment section: the new paragraph itself (see above) — the
  module README this ticket's change affects.
- `CONTEXT.md`: no new vocabulary introduced (no new entity, key or term — this documents an
  existing env var's existing scope) — not touched.

---

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no module in a frozen closure —
`grep -rn "CLARA_AUTH_WALL_SERVICE_TOKEN" packages/runtime/workflows` returns nothing, so no chat or
Work tool reaches this name. `pnpm lint` (with `FREEZE_BASE_REF=7bc5a710f`) ran
`check-frozen-workflows.mjs` clean.

---

## Follow-ups worth filing

1. **`apps/web/.env.example:62-66`'s comment on `CLARA_AUTH_WALL_SERVICE_TOKEN`** still says only
   "Bearer shared with the runtime confirmation endpoint" (singular), not naming the resend or
   invite-preview routes. It is a local-dev setup template, not the rotation-facing ops doc this
   ticket's AC targets (the AC says "where an operator rotating the token would actually see it,"
   which is the deployment section, not the dev env template), so I did not touch it — widening the
   ticket to a file its own AC does not name would be scope creep (rule 5). Worth a one-line comment
   update the next time that file is touched, for a developer reading it fresh.
2. **The `FREEZE_BASE_REF` drift**, flagged again above and already flagged by #1132's and #1099's
   own reports for this lane — will keep recurring for #1095, the last ticket in this lane, until
   the branch merges past PR #1140.

---

## Anything unverified

- **Hosted.** Not touched; no claim made about hosted's own deployed README or Worker secret state
  — this is a source-controlled documentation change, verified against the repository's own files
  and code, not against a live Cloudflare account.
- **Whether every operator who has ever rotated this secret read exactly this section of this file**
  is not something any test or reading can establish; the AC asks for placement where the note
  "would actually see it," which I read as "the section documenting the six Worker secrets and the
  pre-deploy secret-list command," and satisfied on that reading.
