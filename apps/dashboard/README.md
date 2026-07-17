# @clara/dashboard — Next.js 15 skeleton

Slice-1 scope: the app **boots**, renders a placeholder page, and reads
`NEXT_PUBLIC_*` config. No real UI yet — the two-pane Agentic Accounting OS
(typed `parts[]` transcript, fail-closed card catalog, PLAN→SHOW→GATE→VERIFY→
RECOVER) is later work (`docs/design/DIRECTION.md`).

Stack per Gate 2: Next.js 15 (App Router) + React 19, TypeScript, deployed on
Vercel in a later slice, dashboard-direct on the Supabase session JWT (never a
god key).

```sh
pnpm --filter @clara/dashboard dev        # local dev server
pnpm --filter @clara/dashboard typecheck  # tsc --noEmit
pnpm --filter @clara/dashboard build      # next build
```

Config: copy `.env.example` to `.env.local`. Only `NEXT_PUBLIC_*` vars are
exposed to the browser — never put a secret there.
