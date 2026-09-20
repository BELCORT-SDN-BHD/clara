# Wave 2 · Lane 10 · Ticket #872 — DONE (read-time `issuer_lapsed` effective status)

Branch: `riders/w2-lane10` (worktree `C:\Users\zhant\Desktop\clara-wt\660`). Base:
`23cfad947b5598214168ba9c43d391b4e16aa745`. `git log 23cfad9..HEAD` was empty at start (#871,
the ticket before mine in this lane, stopped without applying anything — confirmed by its own
report, `wave2-lane10-ticket871.md`).

Commits on top of base, in order:

1. `f4da314ee` — `feat(db): #872 read-time issuer_lapsed effective status for invites` (migration
   0269, `preview-invite.test.mjs`, the new preintegration gate, `packages/db/package.json`'s gate
   chain, `packages/db/README.md`, `packages/db/tests/README.md`, `CONTEXT.md`).
2. `ba14c5a5a` — `feat(web): #872 render issuer_lapsed as a notice, never a block`
   (`lib/firm/invite-preview.ts`, `invite-accept-form.tsx`, `lib/members/reads.ts`,
   `components/admin/members-tables.tsx` + its new test file, `messages/en.json`,
   `apps/web/README.md`, and the corresponding test-file updates).
3. `1a260af98` — `fix(web): correct undefined DOCUMENT_KINDS reference in kind dialog`. **NOT part
   of #872** — see "An out-of-scope fix I had to make" below.

## The ticket

Newest Agent Brief (owner ruling, dated 2026-09-18, `ready-for-agent`), verified still live on
this branch before building (grepped the touched bodies on the rig — neither `issuer_lapsed` nor
any recut of `firm_invites_visible`/`preview_invite` existed yet):

> A fifth effective status exists, `issuer_lapsed`: an invite that is still pending whose issuer's
> current membership no longer carries admin standing (demoted or removed). It is computed at read
> time by one expression shared by `preview_invite` and the admin roster read, so the two can never
> disagree, and it is reversible: re-promoting the issuer returns the invite to `pending`. No
> write-time change. An invite in that state can still be accepted; the preview shows the notice
> and the accept door is unchanged.

This reverses R1 (`docs/plan/active/refresh-wave-2026-09-15/DECISIONS.md` §3.0, 2026-09-15 —
"do not add a fifth status, keep the two reads agreeing on four").

## The seams tested at

- **`clara.preview_invite(text)`** — the invitee's own door, called as a real
  `clara_authenticated` session (`humanEmailQuery`). Public interface: its jsonb return's `status`
  field.
- **`clara.firm_invites_visible`** — the admin roster's own read, called as a real signed-in owner
  (`humanEmailQuery`). Public interface: the view's `status` column.
- **`clara.accept_invite(text,text,text)`** — unchanged by this ticket, exercised to prove it stays
  unchanged: its refusal code/message, and the membership row it does or does not mint.
- **`InvitesTable`** (`components/admin/members-tables.tsx`) — a component's rendered behaviour,
  mounted directly with its own row prop (not through `MembersPanel`, for a reason given below).
- **`InviteAcceptForm`** (`components/invite-accept-form.tsx`) — the invitee-facing journey, driven
  end to end through the real `readInvitePreview` → password form → `acceptInvite` path with a
  faked transport, exactly the seam the existing `p625.web.*` cells already use.
- **`lib/firm/invite-preview.ts`** and **`lib/members/reads.ts`** — the two typed read contracts,
  at their exported constants and type guards.

No test at any other seam: `clara._invite_issuer_rank` was a rejected design (see the migration's
own header) and was never built, so there is no such seam to test.

## Acceptance criteria, each with its evidence

- [x] **A cell proves preview and roster both report `issuer_lapsed` for a demoted issuer and for
  a removed issuer, and `pending` again after re-promotion.**
  - Demoted: `p872.status.demoted` (`packages/db/tests/preview-invite.test.mjs`) — admin issues at
    `admin`, is demoted to `bookkeeper`; `preview_invite` and `firm_invites_visible` both read
    `issuer_lapsed`; stored `firm_invites.status` stays `pending`; re-promoting to `admin` restores
    `pending` on both reads. **PASS** (`node --test … tests/preview-invite.test.mjs`, test 12).
  - Removed: `p872.status.removed` — admin issues at `viewer`, is fully removed
    (`clara.remove_member`); both reads agree on `issuer_lapsed`; re-adding the same person at
    `admin` (`clara.add_member`, a fresh active membership) restores `pending`. **PASS** (test 13).
- [x] **A cell proves acceptance still succeeds in that state.**
  - `p872.accept.lapsed_but_compatible` — admin issues at `viewer` (rank 0), is demoted to
    `bookkeeper` (rank 1): `issuer_lapsed` is true (1 < admin's rank 2) but `accept_invite`'s own
    wall (`role_rank(invited) > coalesce(issuer_rank, -1)`, i.e. `0 > 1`) does not fire, so
    acceptance succeeds — a real membership is minted at `viewer`, the invite moves to `accepted`.
    **PASS** (test 14).
  - Web-layer: `p872.web.preview_issuer_lapsed` (`invite-accept-form.test.tsx`) drives the same
    shape through the real component — the password form renders (not blocked), the notice
    appears, and `fillAndSubmit` completes a real `acceptInvite` call that mints the membership.
    **PASS** (test file, 43/43 including this one).
  - Named, not glossed over: a **fully removed** issuer refuses acceptance for **every** role,
    including the lowest one (`coalesce(v_issuer_rank, -1) = -1`, and every real role outranks
    `-1`) — this is `accept_invite`'s own, pre-existing, unchanged behaviour, made explicit by
    `p872.status.removed`'s own refusal assertion rather than left implicit. The owner ruling's
    "can still be accepted" is materially true for a **demoted** issuer whose current rank is not
    below the invited role, not for a removed one — this is a fact about the unchanged accept door,
    not a gap this ticket introduced or was asked to close.
- [x] **The four existing statuses are unchanged (existing cells green).**
  `p625.preview.recipient`, `p625.preview.no_oracle` (×2), `p625.preview.status_faces`,
  `p625.preview.no_leak` (×3), `p625.doors.nonregression` (×2) all pass unmodified — 11/11.
  `p625.preview.issuer_rank` was **rewritten** (per the brief's own "Key interfaces" line) to
  assert the new agreeing behaviour: preview now reads `issuer_lapsed` (not `pending`), and
  `accept_invite` still refuses CLR04 with its own verbatim sentence when the invited role
  outranks the issuer's now-lower current rank — the wall, not the read, is what still refuses.
  **PASS** (test 15). Web-side: `p625.lib.wire`/`p625.lib.fail_closed` (11 cells) and
  `p625.web.*` (all pre-existing invite-accept-form cells) are unmodified and green.
- [x] **The migration applies from scratch; ARCHITECTURE carries the note.**
  Migration applies cleanly (`pnpm db:migrate` → `applied 0269_invite_issuer_lapsed_status`, tail
  notice OK, `230 total`). **`docs/ARCHITECTURE.md` does NOT carry a note** — see "Unverified /
  deviated" below; this is the one AC I could not satisfy as literally worded, with the reasoning
  and the alternative I took instead.

## Migration

`packages/db/migrations/0269_invite_issuer_lapsed_status.sql`. Recuts two EXISTING bodies —
`clara.firm_invites_visible` (view, 0141 §H) and `clara.preview_invite` (function, 0224 §A) — each
gaining one new `WHEN` arm in the status `CASE` they already shared. **No new function, no new
grant**: the arm is a correlated subquery against `clara.firm_memberships`, not a standalone
helper. Reasoning, checked rather than assumed: a scratch probe on this rig (in the migration's own
header) measured that a plain view referencing a `SECURITY DEFINER` function with no `EXECUTE`
grant to the querying role still raises `42501` — Postgres checks `EXECUTE` against the actual
invoker, never the view owner, for every function a view's body names — so a
`clara._invite_issuer_rank(firm_id, user_id)` helper would have needed `EXECUTE` granted to
`clara_authenticated`, which PostgREST would then expose as a bare, arbitrary-argument RPC door: a
cross-tenant membership oracle of exactly the class `clara.shares_my_firm_human`/`_wake`
(`0002:453-465`) were split apart to avoid.

**Prestate pins, MEASURED on `clara_l10` immediately before writing the file** (never
transcribed from 0141/0224's own text):
- `clara.firm_invites_visible`'s `pg_get_viewdef(..., true)`, sha256:
  `8bc47b6b4608cd1caae8a0257f8dff887fc1247f5b730a02a78882ae0bfcb7b6`
- `clara.preview_invite(text)`'s `prosrc`, sha256:
  `0c26f516ecb971055265a8ab6ee94c3d98c8b9037b2f0f801c66e1e37263a511`
- `clara.accept_invite(text,text,text)`'s `prosrc` (pinned as a non-regression check — this file
  does not recut it), sha256: `42a153231c724aaace9fb9dae7abe3551667c6669e7dacd1d5495b35c31aeef2`
  (matches 0224's own `DOOR_PINS` constant — unmoved since 0157).
- `clara.firm_memberships`'s application-role grant matrix (measured, never assumed zero — unlike
  `clara.firm_invites`, this table already carries `clara_agent_ro:SELECT,
  clara_authenticated:SELECT` behind its own RLS, independent of this ticket): pinned and
  re-asserted unchanged at the tail.

Tail: both bodies name `issuer_lapsed` exactly once; both read `clara.firm_memberships` and
compare against `role_rank('admin')`; the `expired` arm survives byte-for-byte in
`preview_invite`; the four-key output shape, the no-write/no-lock discipline, the view's
`security_barrier`/ten-column contract and the function's owner/`SECURITY DEFINER`/`search_path`/
ACL are all re-read after the recut; 0141 §B (zero grant + `FORCE RLS` on `clara.firm_invites`)
stands; `clara._invite_issuer_rank` is confirmed absent; `clara.accept_invite` is confirmed
byte-identical to its pin. Applied once, cleanly, no `CLARA_MIGRATION_REDO` needed — every earlier
failed attempt during authoring rolled back automatically (a tail assertion raised inside the same
transaction the `CREATE OR REPLACE` statements ran in) before ever writing a
`clara.schema_migrations` row, so there was nothing to redo.

**No rig-meta cohort was added.** Cohorts in `packages/db/tests/rig-meta.mjs` track NEW grants for
`operation-census.test.mjs`'s sweep; this migration introduces none (confirmed: `CREATE OR REPLACE
VIEW`/`FUNCTION` preserve existing ACLs, and the tail proves the grant matrices are byte-identical
to prestate). `operation-census.test.mjs` and `rig-isolation.test.mjs` both ran clean with no edit
to `rig-meta.mjs` (see Gates), which is the check that this reasoning was right, not merely stated.

## Gates, with counts

- **`packages/db/tests/preview-invite.test.mjs`**, full gate chain (102 `--import` gates,
  `--test-concurrency=1`): **15 tests, 15 pass, 0 fail, 0 skip.** (11 pre-existing cells unmodified
  and green, 1 rewritten per the brief, 3 new.)
- **`packages/db/tests/operation-census.test.mjs` + `rig-isolation.test.mjs`** (no reset flags):
  **33 tests, 30 pass, 0 fail, 3 skip** — all three skips are the rig's own documented,
  pre-existing conditions (`T19` needs `CLARA_RIG_ALLOW_RESET`, never set; `T10b`/`T10b-AC2` skip
  under this rig's World contamination, RIG.md's own #866 note) — not run because my ticket added
  no SQL function, but run anyway as a belt-and-suspenders check on the recut view/function.
- **`packages/db` lint**: clean (part of the full `pnpm lint` run below).
- **`pnpm typecheck`** (repo root): **0 errors** — see "An out-of-scope fix I had to make" for why
  this needed a one-line fix outside #872 first.
- **`pnpm lint`** (repo root): **0 errors** — my own two test files initially tripped the
  raw-colour-value rule (`#872` inside a string literal reads as a 3-digit hex colour, the
  documented #994 false-positive class); reworded, both files now clean.
- **`apps/web` — the WHOLE unit suite once** (`node scripts/run-tests.mjs`): **4757 tests, 4755
  pass, 0 fail, 2 skip.** The 2 skips are `RIG.md`'s own documented Windows-only symlink skip
  (`EPERM` creating a directory symlink, needs Developer Mode / elevation) — pre-existing, not
  touched.
- **`apps/web` e2e — `members-invite-walk`**, on this lane's triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3590 CLARA_E2E_NEXT_PORT=3591
  CLARA_E2E_RUNTIME_PORT=3592`): **5 passed, 0 failed.** This is the one browser walk that
  exercises the two components this ticket touched (`InvitesTable` via the admin roster,
  `InviteAcceptForm` via the invite/preview journey).
- `packages/runtime` was not touched, so its gates (`check-frozen-workflows.mjs`,
  `check-parts-parity.mjs`) do not apply.

### The test files touched, individually (each already counted above; listed here for the
per-file evidence rule 8 asks for)

- `packages/db/tests/preview-invite.test.mjs` — 15/15, gate chain above.
- `apps/web/lib/firm/invite-preview.test.ts` — 11/11.
- `apps/web/lib/members/members-doors.test.ts` — 46/46 (was 45; the one-live-body view census
  split into two `it`s because `firm_invites_visible` legitimately gained a second definer).
- `apps/web/components/invite-accept-form.test.tsx` — 43/43 (2 new cells).
- `apps/web/components/admin/members-tables.test.tsx` — 3/3, new file.

## An out-of-scope fix I had to make

`pnpm typecheck` and `next build` (which the e2e walk's own build step runs) both failed, before
any of my changes, on `apps/web/components/documents/document-kind-dialog.tsx:95` — a reference to
an undefined `DOCUMENT_KINDS` (the correct import, `CLASSIFIABLE_DOCUMENT_KINDS`, is already used
two lines below, at `:109`). Confirmed pre-existing and untouched by #872: `git diff
23cfad947b5598214168ba9c43d391b4e16aa745 -- apps/web/components/documents/document-kind-dialog.tsx`
was empty before I touched it. This is unrelated to invites/members and I have no brief for it, but
it blocked **both** required gates for my own ticket (typecheck fails repo-wide; `next build`
fails, so no e2e walk can run at all on this lane while it stands) — not a Windows-only red I can
report-and-skip, a build-breaking one. I applied the one-line, obviously-correct fix
(`DOCUMENT_KINDS` → `CLASSIFIABLE_DOCUMENT_KINDS`) in its **own commit** (`1a260af98`), not folded
into either #872 commit, with the evidence above in its own message, so the orchestrator can keep
it, revert it alone, or re-route it to whichever ticket actually owns that file without touching
anything of #872's. Re-running the four `document-kind-*` test files and the three files whose
failures cascaded from the same defect (`document-detail-live-refresh`, `documents-url-state`,
`documents-workbench-refresh` — 20 failing tests total before the fix, 0 after) confirms this one
line was the whole cause; nothing else in the pre-existing 20 failures touched invite/member code.

## Docs updated

- `packages/db/README.md` — the `#625` "Named residual" note marked CLOSED by #872, with the
  original text kept for the historical record; a new dated note for migration 0269 beside 0224's.
- `packages/db/tests/README.md` — `preview-invite.test.mjs`'s paragraph extended to name #872's
  cells and its own gate.
- `CONTEXT.md` — new term **"Issuer lapsed"**, house `term` / `_Avoid_` shape, placed beside
  **Invitation**.
- `apps/web/README.md` — the mirrored `#625` residual paragraph closed the same way, naming
  `INVITE_PREVIEW_NON_BLOCKING_STATUSES` as the mechanism.
- `docs/ARCHITECTURE.md` — **NOT touched.** See below.

## `docs/ARCHITECTURE.md` — the one AC I deviated from, and why

The brief's key-interfaces line says "`docs/ARCHITECTURE.md`'s invite section: records the fifth
status and that R1 … is superseded." **`docs/ARCHITECTURE.md` has no invite section, and no
mention of invites, R1, or `firm_invites_visible` at all** — checked with
`grep -in "invit" docs/ARCHITECTURE.md`, zero hits, across all 535 lines. The file's own stated
scope (`AGENTS.md`'s harness table: "Highest-level technical blueprint: stack and rationale, system
boundaries, module responsibilities, dependencies, data flows and tradeoffs") is a level above
feature-specific status enums; every comparable feature-level decision in this codebase (the
trade-invoice due-date ruling, the prepayment amortisation shape, this very ticket's own R1) is
recorded in `packages/db/README.md` and `CONTEXT.md`, never in `docs/ARCHITECTURE.md`. I recorded
the resolution in both of those instead (see "Docs updated" above), which is where R1 itself and
every other per-migration ruling already lives, and I am flagging this brief's pointer as
**unverified/incorrect** rather than inventing a new "Invites" section in a document whose scope
this ticket has no mandate to expand (work order rule 5: "do not widen a ticket"; rule 4: PRD/
ARCHITECTURE changes are a Wayfinder-session act, not a lane ticket's). If the owner wants an
ARCHITECTURE-level invites section, that is a follow-up worth naming explicitly, not something I
inferred my way into.

## Successor contract

None. No frozen chat or Work-tool surface is implicated by this ticket — `preview_invite` and
`firm_invites_visible` are plain PostgREST-reachable reads, not a chat tool or Work door.

## Follow-ups worth filing

- The ARCHITECTURE.md pointer above — either accept that feature-level invite rulings live in
  `packages/db/README.md`/`CONTEXT.md` (as every other one already does) and correct the brief
  convention, or file a ticket to add an actual "Invites" subsection to ARCHITECTURE.md.
- `document-kind-dialog.tsx`'s fix (commit `1a260af98`) should be confirmed by whichever
  ticket/lane owns that file, or re-filed as its own tiny ticket if the orchestrator wants a paper
  trail independent of #872's PR.

## Unverified

- Whether a hosted/live Supabase project's `clara.firm_invites_visible`/`clara.preview_invite`
  match what this migration measured as "live" on `clara_l10` — this lane's rig is a bare Postgres
  cluster (RIG.md), not the hosted stack; the prestate pins would refuse to apply on hosted if the
  live bodies there have drifted, which is the whole point of measuring rather than assuming.
- Whether the owner intends `issuer_lapsed` to also appear anywhere in the invite-issue flow
  itself (e.g. warning an admin who is ABOUT to demote themselves that pending invites they issued
  would go stale) — out of scope per the brief's own "Out of scope: any other invite-lifecycle
  change ruled out by D2," not attempted.
