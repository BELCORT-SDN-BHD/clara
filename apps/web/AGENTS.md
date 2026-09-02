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
  client-owned rail state does not reset on a client switch by construction — every new piece
  of client-owned rail state ships its own reset on `clientId` change plus a scope cell (A→B
  and A→firm), until P6-5 lands the structural boundary (#507 the thread, #508 the attachments
  each paid for this sentence).
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
