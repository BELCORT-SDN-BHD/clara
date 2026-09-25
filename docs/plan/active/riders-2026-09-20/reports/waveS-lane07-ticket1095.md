# Riders sweep wave — lane 07, ticket #1095

**Render a Retry-After wait time when the signed-out invite preview is rate-limited — no
migration.**

| | |
|---|---|
| branch | `riders/wS-lane07` in `C:\Users\zhant\Desktop\clara-wt\659` |
| base | `7bc5a710f` (the integrated head of the wave before) |
| lane database | `127.0.0.1:55749` / `clara_l09` — **untouched by this ticket** (no PostgreSQL object created, edited or applied) |
| commits (this ticket) | `3de6ef87b` `feat(web): #1095 carry the invite preview's Retry-After wait through the courier`; `6faa2ef2a` `feat(web): #1095 render the invite preview's rate-limit wait on the landing page`; `5cfb011c1` `docs(web): #1095 correct the invite preview README's stale rate-limit claim` |
| tickets before mine on this branch | #1047, #1098 (`0347`), #1046 (`0348`), #1132 (`0349`), #1096, #1099, #1094 — none touch `lib/firm/invite-preview-public.ts`, `components/invite-accept-form.tsx`, or any invite-preview test file |
| verdict | **done** |

`git status` / `git log --oneline 7bc5a710f..HEAD` at start: clean tree, 16 commits ahead of base,
the seven tickets above already landed (matches the prompt). Ticket contract read from
`gh issue view 1095 --comments` (issue body only; **zero comments**, no owner-ruling comment dated
2026-09-20). Labels not re-queried beyond the brief itself — the brief is unambiguous and needed no
disambiguation. Re-verified live on this branch before building: `grep -rn "kind: \"indefinite\""
apps/web` (pre-change) showed `readPublicInvitePreview`'s 429 branch still collapsing to
`indefinite("rate_limited")` with no payload, and `invite-accept-form.tsx`'s confirm-stage render
still treating every `!signedOutPreview.ok` outcome identically (nothing rendered) — the gap the
brief describes was real and unbuilt.

**This ticket was expected to need NO migration, and needed none.** No `packages/db/migrations/*`
file was added, edited or applied; the runtime route (`packages/runtime/src/invitePreviewRoutes.ts`)
already computed and sent `retryAfterSeconds` on its 429 body before this ticket — the gap was
entirely in the web-side courier discarding it and the page never rendering it, both pure
`apps/web` changes.

No status-report request arrived mid-task; none to note.

---

## The seams I tested at

Written down before the first cell, per work-order rule 4 — the two "Key interfaces" the brief
names, in order:

1. **`readPublicInvitePreview({token, clientIp}, deps)`** (`apps/web/lib/firm/invite-preview-
   public.ts`) — the server-only courier to the runtime's `POST /api/invite-preview`. Driven through
   its own public seam exactly as `lib/firm/invite-preview-public.test.ts` already did (`fetchImpl`
   and `env`, the only two seams; no mock of an internal collaborator).
2. **`InviteAcceptForm`'s rendered behaviour at the `confirm` stage** (`apps/web/components/invite-
   accept-form.tsx`), given a `signedOutPreview` prop — the invite landing page's FIRST screen, the
   same seam `invite-accept-signed-out-preview.test.tsx` already drives. Nothing here mocks the
   component; the transport is proven separately at seam 1.

No seam outside these two was touched: no database door, no runtime route, no frozen workflow, no
other ticket's migration.

---

## Acceptance criteria, each with its evidence

### AC1 — "A rate-limited invite-preview read's `Retry-After` value is carried through to the page."

**Done.** `readPublicInvitePreview` used to answer a 429 with `indefinite("rate_limited")` — no
payload, the number the runtime already computed simply discarded. It now reads
`retryAfterSeconds` off the 429 body and returns it on the outcome, clamped to the display ceiling
and flagged when clamped — the exact `waitSeconds` rule every other pre-session wait on this app
already uses (`app/(entry)/auth/confirm/wait-seconds.ts`, reused rather than copied; this file's
wall is the *same shape*, confirmed by reading `0309_invite_preview_public_door.sql`'s own header:
a 15-minute/5-reload window, `least(900, greatest(0, …))`, same as the confirm lane's C1/C2).

Evidence, `apps/web/lib/firm/invite-preview-public.test.ts` (`node --import ./test/bootstrap.mjs
--import tsx --test lib/firm/invite-preview-public.test.ts`, run from `apps/web`):

| test | result |
|---|---|
| `p871.web.preview: a rate refusal carries the door's own retryAfterSeconds through, verbatim` (429, `retryAfterSeconds: 47` → `{…, retryAfterSeconds: 47}`, no `atLeast`) | **pass** |
| `p871.web.preview: a rate refusal's over-long wait is CLAMPED to the display ceiling and FLAGGED, never downgraded` (429, `retryAfterSeconds: 3600` → `{…, retryAfterSeconds: 900, atLeast: true}`) | **pass** |
| `p871.web.preview: a missing or unusable rate-limit wait still tells a true story -- the wall's own 900s ceiling` (no field / non-number string / negative / unparseable body → `{…, retryAfterSeconds: 900}`) | **pass**, 4/4 sub-cases |
| `p871.web.preview: every OTHER failure is INDEFINITE …` (rate_limited case moved OUT of this shared-shape loop, since it now carries an extra field the others don't) | **pass**, unaffected |

Full file: **8 tests, 8 pass, 0 fail.** Red-then-green proven: ran the three new tests against the
pre-implementation subject first (see "TDD proof" below) — 3 failed for the right reason
(`retryAfterSeconds` missing from the actual outcome), then implemented and re-ran green.

### AC2 — "The invite landing page can render a wait time … when rate-limited, distinct from its other failure states."

**Done, as a wait-time notice** (the brief's "or" — I did not add an interactive retry control;
see "What was deliberately left" below). `InviteAcceptForm`'s confirm-stage block gained one new
branch: when `signedOutPreview` is `{ok:false, kind:"indefinite", reason:"rate_limited"}`, it
renders a `<p>` naming the wait in seconds (or "at least N seconds" when the courier's own
`atLeast` flag is set), using two new `Invite.preview` message keys
(`rateLimitedNotice`/`rateLimitedNoticeAtLeast`, ICU plural, the same `{seconds, plural, =1 {…}
other {# seconds}}` shape `ConfirmEmail.resendLockedDescription` already uses). This is a THIRD
render path, distinct from both: (a) the firm/role/email preview block (`ok: true` only), and (b)
the "nothing at all" path the other two indefinite reasons still take.

Evidence, `apps/web/components/invite-accept-signed-out-preview.test.tsx`:

| test | result |
|---|---|
| `p871.web.signed_out: a rate-limited read renders the wall's own wait, and nothing else changes` (`retryAfterSeconds: 47` → text matches `/47 seconds/`; firm/role/email section absent; sign-in gate still offered; no verdict language) | **pass** |
| `p871.web.signed_out: an over-long wait renders as 'at least', matching the courier's own flag` (`retryAfterSeconds: 900, atLeast: true` → text matches `/at least 900 seconds/`) | **pass** |

### AC3 — "The existing 'a failed read renders nothing extra' behavior for other failure states is unchanged; only the rate-limited case gains a render."

**Done.** The pre-existing shared-failure test (`p871.web.signed_out: every failed read renders
NOTHING extra and never takes the sign-in step away`) had its `rate_limited` case removed and now
covers exactly `null`, `not_previewable`, `transport`, `unreadable` — all four still assert "no
`invite-signed-out-preview-heading` section, sign-in gate present, no verdict text" and all four
still **pass** unchanged. `rate_limited` is proven to be the ONLY reason that gains a render by the
two AC2 tests above plus this narrowed test's exclusion of it.

Full test file: **7 tests, 7 pass, 0 fail** (up from 5 before this ticket; the sixth pre-existing
test, the closed-world import census, is unaffected and still passes).

---

## TDD proof (vertical slices, red then green)

**Slice 1 — the courier.** Added the three new tests plus the loop-exclusion edit to
`invite-preview-public.test.ts` first, ran them against the UNCHANGED `invite-preview-public.ts`:

```
not ok 4 - p871.web.preview: a rate refusal carries the door's own retryAfterSeconds through, verbatim
not ok 5 - p871.web.preview: a rate refusal's over-long wait is CLAMPED …
not ok 6 - p871.web.preview: a missing or unusable rate-limit wait still tells a true story …
# tests 8 / pass 5 / fail 3
```
(the pre-existing test I edited to remove the rate_limited case was already green, correctly — the
edit only removed a now-inapplicable assertion, it did not target new behaviour by itself). All
three reds failed on the SAME assertion — the actual outcome was missing `retryAfterSeconds`
entirely — the right reason. Implemented the type split, `DEFAULT_RATE_LIMITED_SECONDS`,
`rateLimitedOutcome()` and the 429 dispatch change; re-ran: **8/8 pass.** Committed (`3de6ef87b`).

**Slice 2 — the render.** Added the two new render tests plus the failures-array edit to
`invite-accept-signed-out-preview.test.tsx` first, ran against the UNCHANGED
`invite-accept-form.tsx`:

```
not ok 5 - p871.web.signed_out: a rate-limited read renders the wall's own wait, and nothing else changes
    error: "the door's own wait, rendered exactly -- never rounded into a vaguer bucket"
    actual: "Accept your invitationThis link can only be used once. Continue when you're ready to set your password.Accept invitation"
not ok 6 - p871.web.signed_out: an over-long wait renders as 'at least', matching the courier's own flag
# tests 7 / pass 5 / fail 2
```
Red for the right reason (the text the test expects is simply absent — no wait notice rendered at
all). Implemented the new render branch and the two `en.json` message keys; re-ran: **7/7 pass.**
Committed (`6faa2ef2a`).

---

## Gates, with counts

| gate | result |
|---|---|
| `apps/web/lib/firm/invite-preview-public.test.ts` (`node --import ./test/bootstrap.mjs --import tsx --test lib/firm/invite-preview-public.test.ts`, from `apps/web`) | **8 tests, 8 pass, 0 fail** |
| `apps/web/components/invite-accept-signed-out-preview.test.tsx`, same runner | **7 tests, 7 pass, 0 fail** |
| `apps/web/components/invite-accept-form.test.tsx` + `apps/web/tests/invite-verification.test.ts` (neighbouring suites on the same surface, run as a sanity check — not strictly owed since neither file was touched) | **44 + 14 = 58 tests, 58 pass, 0 fail** |
| `pnpm typecheck` (repo root) | **Done** — `apps/web` and `packages/runtime`, no errors |
| `CI=true GITHUB_ACTIONS=true FREEZE_BASE_REF=7bc5a710f pnpm lint` (repo root) | **exit 0** — `apps/web`/`packages/db`/`packages/runtime`/`packages/reporting-render` eslint all clean; `check-token-contrast`, `check-test-manifest` (540 files, both test files already listed — no manifest edit needed), `check-message-keys` (**4688** static `t("…")` keys all resolve, including the two new `rateLimitedNotice*` keys), `check-ui-add-guard`, `freeze-lint`, `evaluator-freeze-lint` all pass — see "The `FREEZE_BASE_REF` finding" below |
| `apps/web`'s WHOLE unit suite once (`node scripts/run-tests.mjs`, from `apps/web`) | **5178 tests, 5176 pass, 0 fail, 2 skipped** — the two skips are the pre-existing `CLARA_LIVE_SUPABASE_AUTH_URL`-gated live-provider cells in `apps/web/tests/…` (unrelated to this ticket, gated the same way before this ticket); all 15 `p871.web.preview`/`p871.web.signed_out` cells present and green inside this run |

Not owed and not run, with the reason: no `packages/db` file touched (no `operation-census.test.mjs`
/ `rig-isolation.test.mjs` owed); no `packages/runtime` file touched (`check-frozen-workflows.mjs`
and `check-parts-parity.mjs` ran anyway as part of the full `pnpm lint` chain above and passed); no
browser walk touched — `apps/web/e2e/members-invite-walk.spec.ts` exists but this ticket's diff
never touched it, and work-order rule 8 owes "each browser walk you touched", not every walk that
exists on the surface. The signed-out preview's OWN component-level seam
(`invite-accept-signed-out-preview.test.tsx`) is the seam #871 itself established for this exact
rendering property (its own header: "Nothing here mocks the component; the transport was already
proven at its own seam … and the DOOR at `packages/db/tests/invite-preview-public.test.mjs`") —
following that precedent rather than reaching for a new Playwright walk this ticket's brief does
not ask for.

### The `FREEZE_BASE_REF` finding (same drift #1132's, #1096's, #1099's and #1094's reports already flagged for this lane)

`pnpm lint`'s `check-frozen-workflows.mjs` step compares the working tree against `origin/main` by
default; on this host `origin/main` has moved to `061a6992b` (PR #1140, the riders cut-phase
integration, merged after this lane branch was cut from `7bc5a710f`), so a bare `pnpm lint` reports
28 spurious `REMOVED-VS-BASE`/`REGISTRY-DOWNGRADE` violations against files this ticket never
touched. Confirmed the drift is pre-existing and unrelated to this diff:
`FREEZE_BASE_REF=7bc5a710f node scripts/check-frozen-workflows.mjs` alone reports `freeze-lint: OK
— 322 frozen file(s) verified against frozen-workflows.json (append-only vs 7bc5a710f)`. Ran the
full chain with `FREEZE_BASE_REF=7bc5a710f` throughout, per the work-order addendum's "everywhere a
rule says `origin/main..HEAD`, read `<base>..HEAD`" — recorded again here since it recurs on every
ticket in this lane until the branch merges past PR #1140.

Known Windows-only reds from `RIG.md`: none encountered.

---

## Migration

**None.** No `packages/db/migrations/*.sql` file was added, edited, or applied. `packages/db/
package.json`'s `$GATES` list and `packages/db/tests/rig-meta.mjs` are both untouched. The lane
database is unchanged by this ticket (no connection was opened to it). The ticket's own "expected to
need NO migration" line held, and no site in this ticket's diff needed one.

---

## Shared files

| file | my hunk |
|---|---|
| `apps/web/messages/en.json` | two new keys added under the existing `Invite.preview` namespace (`rateLimitedNotice`, `rateLimitedNoticeAtLeast`), inserted immediately after the existing `indefiniteNote` key. No existing key edited or reordered. |
| `apps/web/test/manifest.txt` | **not touched** — both touched test files were already listed (`components/invite-accept-signed-out-preview.test.tsx`, `lib/firm/invite-preview-public.test.ts`); confirmed by `check-test-manifest`'s clean 540-file run above. |
| `apps/web/e2e/serve-built.mjs`, `apps/web/e2e/e2e-fixture-ownership.test.ts`, `apps/web/lib/navigation/tree.ts`, `packages/db/tests/rig-meta.mjs`, `packages/db/package.json`, `.github/actions/db-live-gates/action.yml`, `CONTEXT.md` | **not touched.** No navigation entry, no new domain vocabulary (no new entity, key or term — "Retry-After"/"rate wall" is an existing implementation concept already used by the confirm lane, not a new CONTEXT.md term), no new gate module, no new CI action edit. |
| `apps/web/tests/firm-scope-db-pins.corpus.ts` | **not touched** — sweep rule (d)'s trigger ("whenever a migration file changed, even a comment") did not fire; no migration file changed. |

---

## Docs

- `apps/web/README.md`: corrected the stale claim "a walled read simply leaves the block out" (it
  was written for #871/#872 before this ticket existed) with a dated "CORRECTED (ticket 1095,
  2026-09-25)" paragraph, per the house convention of overwriting/annotating rather than silently
  editing a claim that used to be true. States precisely what changed (the courier now carries the
  wait through) and what did NOT change (the two other indefinite reasons still render nothing; the
  invitation itself stays untouched either way).
- No migration header to update (no migration).
- `CONTEXT.md`: no new vocabulary introduced by this ticket (reusing the existing "Retry-After
  wait, clamp-and-flag" mechanism the confirm lane already established, not naming a new domain
  concept) — not touched.

---

## Successor contract

**None owed.** This ticket touches no frozen workflow body and no module in a frozen closure —
`lib/firm/invite-preview-public.ts` and `components/invite-accept-form.tsx` are both plain
`apps/web` surfaces, and neither is reachable from `packages/runtime/workflows` (confirmed:
`grep -rn "invite-preview-public\|invite-accept-form" packages/runtime` returns nothing). No
frozen chat or Work tool needs anything from this diff. `pnpm lint` (with
`FREEZE_BASE_REF=7bc5a710f`) ran `check-frozen-workflows.mjs` clean, `freeze-lint: OK`.

---

## What was deliberately left

- **No interactive "try again" control.** The brief's AC2 says "a wait time OR 'try again'
  affordance" (either satisfies it); I built the wait-time notice only, matching the existing
  `indefiniteNote` paragraph's simplicity one branch over rather than adding a new
  `router.refresh()`-driven button, an extra message key, and the extra test surface that would
  need — a scope call, not an oversight. A future ticket could add a literal retry control if the
  product wants one; the notice alone already tells the visitor what the brief asked for (how long
  to wait).
- **No change to the rate wall's own limits or windows** — explicitly out of scope per the brief,
  and nothing in this diff touches `0309_invite_preview_public_door.sql` or any other migration.

## Follow-ups worth filing

1. **The `FREEZE_BASE_REF` drift**, flagged again above and by every prior ticket in this lane —
   will keep recurring until the branch merges past PR #1140. Still worth the one-line
   `RIG.md`/`WORK-ORDER.md` addition those reports already proposed (default `check-frozen-
   workflows.mjs` to the lane's own base ref when one is known, or document the override
   prominently enough that a first-time lane worker finds it before the first red run).
2. If the product later wants the interactive retry control noted above, it is a small, separable
   addition on top of this ticket's plumbing (`router.refresh()` is already imported and used
   elsewhere in `InviteAcceptForm`) — not filed as a ticket by itself, noted here as the natural
   next step if asked for.

## Anything unverified

Nothing load-bearing. One thing noted for completeness rather than flagged as a risk: I did not
independently re-verify the runtime route's own 429 body shape against a live runtime process (no
runtime process was started for this ticket) — I read `packages/runtime/src/invitePreviewRoutes.ts`
source directly (`res.status(429).set("Retry-After", String(retryAfterSeconds)).json({outcome:
"rate_limited", retryAfterSeconds})`, line 143) and `packages/runtime/tests/p871-invite-preview-db.
test.mjs`'s own `retryAfterSeconds` assertions (lines 295-307, `{skip}`-gated on this lane's rig,
unrelated to this ticket) as the source of truth for the wire shape my courier test fixtures
mirror, which is the same standard the existing `invite-preview-public.test.ts` file already used
for the 200/404 shapes before this ticket.
