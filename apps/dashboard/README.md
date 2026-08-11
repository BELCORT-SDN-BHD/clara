# @clara/dashboard — the Agentic OS surface

The LIVE product surface (Waves A→D): the `/chat` two-pane transcript with the
typed `parts[]` card catalog (je_review, doc_review, refusal, open_question,
sweep_receipt, kb_rule_proposal, rule_post_receipt, …), the `/queue` review queue
(sectioned rows, batch approve, the ComplianceWatchCard with the SST tier banner),
`/documents` intake (upload → scan → file-to-client), and `/rules` (autopost rule
sign/retire **+ the adjustment-template panel**). Wave C added `/bank`
(statement ingest, matching, reconciliation), `/aging` and `/opening`; Wave D added
`/assets` (the FA register) and `/advances` (the staff-advance register). Also live:
`/accounts`, `/clients`, `/onboarding`, `/seeding`.
*(Route list verified against `apps/dashboard/app/` on 2026-08-06.)* Design law: `docs/design/PRODUCT_DESIGN.md`. Governance reads/writes go
**browser → PostgREST** on the session JWT (typed CLR refusals render verbatim);
only the runtime `/api/*` transits the same-origin Pages Function proxy.

Stack per Gate 2: Next.js 15 (App Router) + React 19, TypeScript, deployed on
**Cloudflare Pages** at `app.clarabook.com` (ADR-024; Vercel dropped),
dashboard-direct on the Supabase session JWT (never a god key).

```sh
pnpm --filter @clara/dashboard dev        # local dev server
pnpm --filter @clara/dashboard typecheck  # tsc --noEmit
pnpm --filter @clara/dashboard build      # next build
```

Config: copy `.env.example` to `.env.local`. Only `NEXT_PUBLIC_*` vars are
exposed to the browser — never put a secret there.
