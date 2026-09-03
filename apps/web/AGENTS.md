# apps/web — agent notes

The production Agentic OS frontend (P1–P6 through the beta runway): Next.js App Router on
Cloudflare Workers, replacing apps/dashboard at cutover. Full reference: `README.md` here.

- Reads ride `lib/read.ts`'s `getRows` against RLS-scoped views/tables or masked `_visible`
  views — never a hand-rolled query. Governed writes ride `lib/doors.ts`'s `callDoor`; a
  `DoorRefusal` renders VERBATIM (code + message), never retried, and every caller re-reads
  after every act — no optimistic UI, ever. A read-flavoured RPC (e.g. a preview) still rides
  `callDoor` as transport but is NOT a governed act — label it as a read at the call site.
- The session token comes ONLY from the blessed `sessionTokenAccessor` singleton
  (`lib/session-accessor.ts`) — never a per-render accessor object literal (the 4GB-heap-OOM
  lesson, that file's own header).
- The Clara rail (`RailMount`) mounts OUTSIDE `ClientScopeProvider`'s keyed subtree, so
  client-owned rail state would not reset on a client switch by construction. **P6-5 landed
  the structural boundary: `RailMount` keys `<ClaraRail>` on `clientId ?? "firm"`**, so the
  whole rail subtree is rebuilt on every switch and no new piece of client-owned rail state
  needs its own `clientId` reset **on the rail**. Three things this does NOT cover, and all
  three still bind you: (a) **the full-screen escalation route** — `ClaraFullScreenThread`
  mounts `ClaraThreadView` from `app/(full)/clients/[clientId]/clara/[threadId]`, and the App
  Router reuses a page component across a params-only change, so state shared with that
  component still needs its own `clientId` reset (the composer attachment tray keeps
  exactly that, and its scope cell is what proves it); (b) state keyed on something other
  than the client (a `threadId`-scoped tray keeps its own reset); (c) anything living
  OUTSIDE React — the module-level `claraThreadStore` survives the remount deliberately,
  because a running turn's SSE attachment is not React state and must not die on a switch.
  **The scope cells stay** (A→B and A→firm) — they are the proof, not scaffolding for the
  resets they were written beside.
- The UI never invents a number, verb, receipt, or link. A missing backend verb renders
  honestly "not built yet" (the ⌘K "Do" precedent) — never a fake control.
- Every string routes through next-intl; semantic Tailwind tokens only (no raw hex, no `dark:`
  — light-theme-only per the mohe-grill rulings).
- The Node 20 test runner does NOT dir-scan for `.test.ts` — every test file MUST be
  enumerated explicitly, one path per line, in `test/manifest.txt` (T0 seam, port-wave plan
  §3.1; `scripts/run-tests.mjs` feeds it to `node --test`). A file missing from the manifest
  is no longer silent: `scripts/check-test-manifest.mjs`, wired into `pnpm lint`, globs every
  real test file on disk and fails the build (RED) if one is absent from the manifest.
- A migration citation must chase the LIVE body (a later `CREATE OR REPLACE`, a dynamic
  splice) — never cite a migration's first `CREATE` without checking what superseded it.

### Testing a dialog — two laws the port wave paid for

- **`h.fireEvent` silently no-ops on anything inside an OPEN dialog.** Base UI renders open
  dialog content into a portal on `document.body` — a sibling of the render root, outside the
  delegated-listener tree `fireEvent` dispatches through. The trigger works (it lives in the
  container); the Confirm button, the Cancel button and every field inside do not. Drive them
  with **`clickButton` from `test/hookHarness.ts`**, the one shared instrument: it invokes the
  real handler on the real node, and it **throws** on a node whose live `disabled` is true —
  assert the gate, then act. Never hand-roll a local copy; three lanes did, and one of them
  wrote a test that clicked nothing and passed.
- **A click test must assert a DISCRIMINATING post-condition** — something that is true only
  *after* that click. A match that was already true before the click (a word that also appears
  in a summary line elsewhere on the page) is a vacuous green, and it will survive deleting the
  very component the test exists to prove.

## Lane laws for frontend trains (minted 2026-08-31 → 09-03)

Every law below is stated here as a POINTER, not a copy — the full text, reasoning and measured
cost sit at the source cited; read that before applying the law, not this line. Source of truth
for the clause names: `docs/plan/active/frontend-sprint-handoff-2026-08-31-orders.md` section C.

- **PORT-ASSIGNMENT.** A lane's dev-server port range is the one named in its work order; an
  "address in use" is resolved by finding the OWNING PID first, never by a name or
  command-line-substring kill, and only one Playwright leg runs on this host at a time. Orders
  §C, PORT-ASSIGNMENT clause.
- **BACKGROUND-VERIFIER.** A backgrounded Playwright run is unpiped and teed to a file (a piped
  `grep` makes "still running" and "0 bytes" read the same), its `next start` child is confirmed
  dead by PID before a retry, and BROWSER liveness is read by the process's `ExecutablePath`
  under `ms-playwright`, never by process name. Orders §C, BACKGROUND-VERIFIER clause.
- **`ensureRealFocus`.** Every keyboard-first Playwright walk anchors its first key press on
  `apps/web/e2e/helpers.ts:40`'s `ensureRealFocus(page)`, never a bare `bringToFront()` or a
  sleep — a fresh navigation is the vulnerable shape, a page that already had a real prior
  interaction is not. PR #510 (that file's own header comment carries the measured mechanism).
- **MERGE-FORWARD LAW, the frontend items.** After merging origin/main onto any apps/web branch:
  a value-level diff of `apps/web/messages/en.json` for keys both sides touched, PLUS a raw-text
  duplicate-sibling-key scan (`JSON.parse` silently keeps the last of two identical keys); a grep
  of every auto-merged `.tsx` for duplicate JSX attributes; the three a11y gates, the contrast
  gate and the browser leg re-run on the MERGED tree, never on either parent alone; a diff of the
  e2e harness's composed environment between both parents and the merge. Orders §C, MERGE-FORWARD
  LAW items 1, 2, 6 and 8.
- **The fold-round mutant panel.** Every fold round on an apps/web PR ships the mutant panel as a
  stated deliverable (the mutant, the red it produced, a MUST-NOT-RED control, a byte/md5 restore
  check); on an uncommitted tree the panel restores each mutated file from a buffer it captured
  itself, never `git restore` / `git checkout --`. Orders §C, FOLD-ROUND DELIVERABLE and
  MUTANT-PANEL RESTORE LAW clauses.
- **The "not built yet" copy rule.** Once the verb, route or control a `NotBuiltNote` names is
  actually wired, the note is REMOVED, never softened to a hedge that says the same thing more
  quietly; the guard in `apps/web/components/entry/pending-a11y.test.tsx` reads for the CLASS of
  honest-absence phrasing, not one fixed string, so a differently-worded dashed-edge card cannot
  walk past it unnoticed. PR #517's review (its M2).
- **The manifest gate, the contrast gate and the colour-literal ban** are existing house law and
  are not restated here — see `apps/web/README.md` and `apps/web/scripts/check-test-manifest.mjs`
  / `apps/web/scripts/check-token-contrast.mjs`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
