# Wave 3, Lane 09, Ticket #970 — final report

**Ticket:** Finish AC2's shadcn native-chat component migration (attachment, message-scroller)
**Branch:** `riders/w3-lane09` · **Worktree:** `C:\Users\zhant\Desktop\clara-wt\659` · **Base:** `ffe63a0dd084e99b84c1368119845be273c421ce`
**Commits (base..HEAD, all four are this ticket's — no prior ticket had landed on this lane):**

```
b5462ab36 feat(web): #970 install attachment and message-scroller through the ui:add override
2958a9aa9 feat(web): #970 migrate the composer's attachment tray onto shadcn Attachment
1cafed931 feat(web): #970 render message-scroller on the attachment tray; teach the harness its DOM surface
16356f705 docs(web): #970 record the override's first real use and message-scroller's bundle cost
```

No migration: `git diff ffe63a0dd084e99b84c1368119845be273c421ce..HEAD --stat -- packages/db/migrations` is
empty. This ticket was expected to need none, and did not.

## The contract used

`gh issue view 970 --comments` — the single comment (2026-09-19, `belcorttao`) carries both the
**Owner's ruling (2026-09-20)** and the **newest Agent Brief**, which supersede the issue body's
Option A ("diff first, override only if reconcilable"). The ruling: install through the guard's
named override, let upstream's `button.tsx` win the overwrite outright, then re-apply only the
three owner-ruled behaviours on top of it (offset ring, `/90` hover, destructive ring
unification) plus only the app-specific variants/sizes still referenced. That is what was built.

## Seams tested at (written before building, per the work order's rule 4)

1. **The guard's own decision** (`scripts/ui-add.mjs`'s `main`/`checkGuard`) — not touched; verified
   by driving the real CLI through it (dry-run, override, real install, and a post-change refusal
   check on `pagination`).
2. **`components/ui/button.tsx`'s exported `buttonVariants`** — the existing
   `tests/focus-ring-contract.test.ts` is the oracle for the three owner-ruled behaviours; it was
   driven RED against the raw upstream overwrite before any reconciliation, then GREEN after.
3. **A new pure function's public contract**: `attachmentDisplayState` (exported from
   `ComposerAttachmentControl.tsx`), narrowing `QueueState` (9 members) to `Attachment`'s `state`
   prop (5 members) — its own `[970]` unit cell in `composer-attachment-control.test.tsx`.
4. **The composer's rendered DOM**, driven through the real `ComposerAttachmentControl`/
   `ClaraThreadView` via `test/hookHarness.ts`'s `renderComponent` — the existing
   `composer-attachment*.test.tsx` suite (including `checkAccessibility`/`checkKeyboardWalk`) plus
   one new `[970]` cell proving `message-scroller`'s `data-slot`s and roles are present and that
   wrapping it introduces no `nested-live-region` violation.
5. **A real browser** (Playwright, my triple) — `chat-parity-walk.spec.ts`'s "composer attachment
   face" axe scan and `checkout-gate-walk.spec.ts`'s button-hover-contrast walk.

## Acceptance criteria, each with its evidence

- **[x] attachment and message-scroller are installed and render on the composer surface.**
  Installed via `CLARA_UI_ADD_OVERWRITE=1 node scripts/ui-add.mjs attachment message-scroller
  --overwrite --yes` (commit `b5462ab36`). Both render on `ComposerAttachmentControl`'s tray
  (`components/clara/ComposerAttachmentControl.tsx`, commits `2958a9aa9`/`1cafed931`):
  `Attachment`/`AttachmentMedia`/`AttachmentContent`/`AttachmentTitle`/`AttachmentDescription`/
  `AttachmentActions`/`AttachmentAction` render each queued row inside the existing `<li>`;
  `MessageScrollerProvider`/`Root`/`Viewport`/`Content` wrap the `<ul>`, bounding the tray to
  `max-h-48`. Evidence: `composer-attachment.test.tsx`'s new `[970]` cell (finds
  `data-slot="message-scroller"`/`-viewport`/`-content`, roles `region`/`log`, and still exactly
  five `<li>`s for the six-file cap) — GREEN; `chat-parity-walk.spec.ts:208` ("a document attached
  from the composer rides the sent turn as its document reference", which includes `scan(page,
  "composer attachment face")`) — GREEN, 11/11 in that spec file, real browser, my triple.
- **[x] The button's offset focus ring, AA-corrected default hover and destructive-variant focus
  unification all hold after the overwrite, each with its reasoning recorded in the file.**
  `components/ui/button.tsx`'s own header (commit `b5462ab36`) carries all three, each explicitly
  marked "RE-APPLIED" with the same reasoning the pre-overwrite file carried, ported onto the
  upstream file (which, on every other axis — six variants, eight sizes, `dark:` variants,
  `transition-all` — is upstream's own, unmodified content; the diagnosis of WHY the former motion
  polish was NOT carried back is in that file's own header too). Evidence:
  `tests/focus-ring-contract.test.ts`'s `裁-64③` cell (all six variants, all four ring classes,
  `doesNotMatch(/focus-visible:ring-destructive/)`) and the M-1 `cn()`-premise cell — both RED
  against the raw upstream overwrite (measured explicitly, see "Vacuity control" below), GREEN
  after.
- **[x] Every button variant and size an existing caller references resolves as before, and the
  build and type-check are clean.** Upstream's `base-nova` `button.tsx` ships the SAME six
  variants (`default`/`outline`/`secondary`/`ghost`/`destructive`/`link`) and the SAME eight sizes
  (`default`/`xs`/`sm`/`lg`/`icon`/`icon-xs`/`icon-sm`/`icon-lg`) this file already had — nothing
  was added or removed, so there was nothing to restore on that front (recorded in the file's own
  header). Evidence: `pnpm typecheck` (root) — clean, both `apps/web` and `packages/runtime`; a
  real `next build` (Turbopack) completes (`✓ Compiled successfully`, `Finished TypeScript`, all 68
  routes collected/generated) — see the bundle-cost section for why this build was also run.
- **[x] The focus-ring contract passes over every file this work installs, at the alpha the token
  declares.** `attachment.tsx`'s own `focus-within:ring-ring/70` (re-cut from upstream's generated
  `/50` in the same edit, commit `b5462ab36`) and `button.tsx`'s `/70` both hold.
  `tests/focus-ring-contract.test.ts`'s census is updated (commit `b5462ab36`): `attachment.tsx`
  joins the file list (21 → 22 carriers), with a new comment explaining why `message-scroller.tsx`
  does NOT join (its one control renders through `Button`'s own `render` prop, so it inherits
  `button.tsx`'s ring rather than drawing a second one). All 7 subtests GREEN.
- **[x] message-scroller's added runtime dependency is measured and its bundle cost recorded
  before merge.** MEASURED (2026-09-20, pinned `@shadcn/react@0.3.1`): the ONLY two files the
  `@shadcn/react/message-scroller` subpath export ships (`dist/message-scroller/index.js`, 18,862
  bytes; the shared `dist/chunk-HBS6WEDP.js` it imports, 1,190 bytes) are **20,052 bytes raw /
  6,484 bytes gzipped, combined** — nothing else in the package is reachable (its own `exports` map
  scopes every other subpath, e.g. `./questionnaire`, away from this one). A real `next build`
  succeeds; the actual client chunk carrying both `attachment.tsx` and `message-scroller.tsx`'s
  code together (not isolated from my own new component code, so not a clean per-dependency figure)
  is 131,219 bytes raw / 35,616 bytes gzipped. No bundle-size budget is declared anywhere in this
  repo to compare either figure against (checked: no `size-limit`/`bundlesize` config exists).
  Recorded in `components/ui/README.md` (commit `16356f705`).
- **[x] No extraneous dependency is left in the package manifest or lockfile by the install.**
  The override path installs a REAL `cn@0.3.0` npm package (the guard's own documented behaviour:
  `CLARA_UI_ADD_OVERWRITE=1` also opts the run into keeping a genuine external `cn`, since that is
  the one other thing the same knob controls) — this was NOT wanted here (only the button overwrite
  needed the override), so `pnpm remove cn` was run immediately after the install (commit
  `b5462ab36`). `git diff -- apps/web/package.json` shows exactly one added dependency,
  `@shadcn/react`; `pnpm-lock.yaml`'s diff carries no `cn` entry.
- **[x] The button is still on the protected list and the guard still refuses an unreviewed
  overwrite of a protected component for any other item after this change.**
  `scripts/protected-components.json` is byte-identical to before this ticket (`git diff` against
  it is empty). Evidence: `node scripts/ui-add.mjs pagination --dry-run` (no override) still
  refuses, naming BOTH `button.tsx` and `pagination.tsx`, exit 1 — run live, not only through the
  selftest fixtures. `scripts/check-ui-add-guard.selftest.mjs` (wired into `pnpm lint`) — GREEN.
  `attachment.tsx`/`message-scroller.tsx` deliberately did NOT join the allowlist — see
  `components/ui/README.md`'s new "Not every hand edit earns a place on the list" paragraph: their
  hand edits (a bare-`cn`-import fix, a `/50→/70` ring recut) are the SAME routine install hygiene
  eleven other already-vendored files carry with no allowlist entry, never an owner-ruled
  behavioural correction.
- **[x] The existing unit and browser walks covering the button and the composer surface pass.**
  See Gates below for full counts. Summary: the WHOLE `apps/web` unit suite (4848 tests) is green;
  `chat-parity-walk.spec.ts` (11/11) and `checkout-gate-walk.spec.ts` (16/16) are green on my
  Playwright triple.

## Vacuity control (the reconciliation's own RED, measured)

Before writing `button.tsx`'s reconciled content, the raw override install was run and the existing
gate driven against it: `tests/focus-ring-contract.test.ts` went **3 pass / 4 fail** — the
ring-alpha census (both `attachment.tsx:10` and `button.tsx:6` at `/50`), the vacuity file-list/
count, the `裁-64③` offset-ring cell (upstream's base string lacks `ring-offset-2`/
`ring-offset-background` entirely, and the destructive variant still carried its own
`focus-visible:border-destructive/40 focus-visible:ring-destructive/20` override) and the M-1
premise cell. After the reconciliation commit, all 7 subtests are green. This is the same
red-for-the-right-reason proof the work order's rule 4 asks for, applied to an install+reconcile
step rather than a from-scratch new test.

## Gates, with counts

- **Test files added or touched**, run individually and together (`node --import
  ./test/bootstrap.mjs --import tsx --test <files>`):
  - `components/clara/composer-attachment-control.test.tsx` — 3/3 (1 new `[970]` cell)
  - `components/clara/composer-attachment.test.tsx` — 8/8 (1 new `[970]` cell)
  - `components/clara/composer-attachment-scope.test.tsx` — 6/6 (untouched content, re-run for
    regression)
  - `components/clara/composer-keyboard.test.tsx` — 5/5 (regression)
  - `components/clara/composer-field-wiring.test.tsx` — 5/5 (regression)
  - `tests/focus-ring-contract.test.ts` — 7/7 (1 census entry updated)
  - `tests/token-contrast.test.ts` — 4/4 (regression, unaffected — run because button.tsx's own
    tokens are what it measures)
  - Combined single run of all seven above: **53/53 pass, 0 fail**.
- **`pnpm typecheck`** (root): clean — `apps/web` and `packages/runtime` both `Done`.
- **`pnpm lint`** (root, the whole chain: frozen-workflows/evaluators, leak/citation/SQL/dsn-pipe/
  world-gate/dispatch-model-guard selftests, `eslint scripts`, then `pnpm -r lint` across
  `apps/web`/`packages/db`/`packages/runtime`/`packages/reporting-render`): exit 0, every
  sub-check PASS, including `check-token-contrast` (56 pairs), `check-test-manifest` (502 files,
  unchanged — no new test FILE was added, only existing files extended, so no manifest edit was
  needed), `check-message-keys` (4312 keys) and `check-ui-add-guard.selftest` (all cases).
- **`CI=true GITHUB_ACTIONS=true pnpm lint`** (the wave-3 addendum's own required re-run, since the
  runner is Linux and sets these): exit 0, identical result.
- **`apps/web` WHOLE unit suite** (`node scripts/run-tests.mjs`, since `apps/web` was touched):
  **4848 tests, 4846 pass, 0 fail, 2 skip** (the 2 skips are the known Windows-only ones RIG.md
  names, e.g. the Defender/EICAR skip — not touched by this ticket), exit 0, 89.6s.
- **Browser walks, my triple** (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3580
  CLARA_E2E_NEXT_PORT=3581 CLARA_E2E_RUNTIME_PORT=3582`, against `clara_l09`):
  - `pnpm --filter @clara/web e2e chat-parity` — **11/11 pass** (35.8s), including the composer
    attachment axe scan and the long-history-scroll axe walk.
  - `pnpm --filter @clara/web e2e checkout-gate` — **16/16 pass** (45.6s), including the button
    hover-contrast walk at 320px/200%/reduced-motion/back-navigation.
  - No `packages/runtime` or `packages/db/tests` files were touched, so their gate chains do not
    apply; no SQL function was added, so `operation-census`/`rig-isolation` do not apply.
- **`node scripts/check-frozen-workflows.mjs`**: part of the root `pnpm lint` chain above — clean;
  no frozen workflow body or closure module was touched.

## Docs updated

`apps/web/components/ui/README.md` (commit `16356f705`): the two new files named in the opening
paragraph; a new "Not every hand edit earns a place on the list" note explaining why neither joined
`protected-components.json`; the override's first REAL use recorded under "What makes an override
legitimate" (previously only described, never exercised); a new "`message-scroller`'s runtime
dependency, and the test harness it needed" section with the measured bundle figures and the three
`test/domInspect.ts` fixes. `CONTEXT.md` was not touched — nothing here is new ACCOUNTING/PRODUCT
domain vocabulary (the affected terms are UI-implementation-level: a component family name, an
internal display-state mapping).

## Successor contract

None. This ticket touches no frozen chat/Work-tool surface — `ComposerAttachmentControl` is
ordinary client UI, not a door, a part kind, or a prompt stanza. Nothing here needs a
`chatTurn_v22`/`claraWork_v6` entry.

## Follow-ups worth filing

1. **`test/domInspect.ts`'s new capabilities are narrow and reactive, not a general contract.**
   `Element.toggleAttribute`, the `window`-mirrored timer/rAF quartet, and `Element.scrollTo` were
   each added only after being MEASURED as the exact next thrown error — the same discipline this
   file's own header requires (never speculative). A future vendored primitive reaching another
   modern Web API (a real `IntersectionObserver` callback firing, `getBoundingClientRect` returning
   non-zero, `ResizeObserver` actually observing) will hit the SAME class of wall this file's header
   already names for axe-core, and should not assume this ticket's three fixes are exhaustive.
2. **The Next.js client chunk figure (131,219 / 35,616 bytes gzip) is not isolated per dependency**
   — it bundles `attachment.tsx` and `message-scroller.tsx`'s own code together with
   `@shadcn/react`'s contribution. A future ticket wanting a clean before/after Workers-bundle delta
   would need two full `pnpm cf:build` runs (with and without the dependency) on a disposable
   checkout; that was judged disproportionate for this ticket's own bundle-cost criterion, which the
   isolated package-file measurement (20,052 / 6,484 bytes) already satisfies with a clear, stated
   method.
3. **`message-scroller`'s scroll-anchor/auto-follow-newest behaviour is inert in this composition**
   (documented in `ComposerAttachmentControl.tsx`'s own header): `MessageScrollerItem` is always a
   bare `<div>` with no `render`/`asChild` escape hatch, so using it per-row would break "listitem is
   a direct child of list" (an existing, pinned five-`<li>` structural test). If a future ticket
   wants the anchor tracking for real (auto-scroll to a newly queued attachment), it would need
   either an ARIA-role-based list (`role="list"`/`role="listitem"` on plain `div`s, replacing the
   native `<ul>`/`<li>`) or a decision that the tray no longer needs literal `<li>` semantics — a
   product/accessibility call, not made here.

## Anything unverified

- **Hosted/production behaviour** — everything above is local (this lane's rig database and dev
  build). Whether `@shadcn/react` is acceptable in the deployed Cloudflare Workers bundle was not
  verified against a real `wrangler`/OpenNext deploy in this session (see follow-up 2).
- **Other e2e specs that mount the composer or the Button** (`agentic-finish-walk.spec.ts`,
  `documents-viewer-walk.spec.ts`, `journal-work-walk.spec.ts`, `manual-journal-walk.spec.ts`,
  `work-cancel-walk.spec.ts`, `a11y-finish-walk.spec.ts`, `work-question-walk.spec.ts`) were not run
  in this session — `chat-parity-walk` and `checkout-gate-walk` were chosen as the two most directly
  named/relevant to the composer-attachment surface and the button's own hover contrast,
  respectively, given the whole-suite unit run (4846/4846) already covers the component logic these
  specs would otherwise re-exercise at the DOM level.
- **Whether a firm ever queues five attachments long enough for the `max-h-48` bound to visibly
  scroll** was not observed in a real, human-driven session — only structurally (DOM roles/slots)
  and via the six-file-cap test's five `<li>` rows.
