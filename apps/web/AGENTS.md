# apps/web — agent notes

The P3 client workbench: Next.js App Router on Cloudflare Workers, replacing apps/dashboard at
cutover. Full reference: `README.md` here.

- Reads ride `lib/read.ts`'s `getRows` against RLS-scoped views/tables or masked `_visible`
  views — never a hand-rolled query. Governed writes ride `lib/doors.ts`'s `callDoor`; a
  `DoorRefusal` renders VERBATIM (code + message), never retried, and every caller re-reads
  after every act — no optimistic UI, ever. A read-flavoured RPC (e.g. a preview) still rides
  `callDoor` as transport but is NOT a governed act — label it as a read at the call site.
- The session token comes ONLY from the blessed `sessionTokenAccessor` singleton
  (`lib/session-accessor.ts`) — never a per-render accessor object literal (the 4GB-heap-OOM
  lesson, that file's own header).
- The UI never invents a number, verb, receipt, or link. A missing backend verb renders
  honestly "not built yet" (the ⌘K "Do" precedent) — never a fake control.
- Every string routes through next-intl; semantic Tailwind tokens only (no raw hex, no `dark:`
  — light-theme-only per the mohe-grill rulings).
- The Node 20 test runner does NOT dir-scan for `.test.ts` — every test file MUST be
  enumerated explicitly in `package.json`'s `test` script or it silently never runs.
- A migration citation must chase the LIVE body (a later `CREATE OR REPLACE`, a dynamic
  splice) — never cite a migration's first `CREATE` without checking what superseded it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
