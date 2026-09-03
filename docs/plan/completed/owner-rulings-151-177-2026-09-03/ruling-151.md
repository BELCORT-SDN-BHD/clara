# 裁-151 — OD-1: chat + SSE go through the same-origin `/api/runtime/*` proxy (option b), and the standing steer for the ceremony decisions

**Ruled 2026-09-03 ≈19:4x MYT (owner, in chat).** Owner's words, verbatim:

> 按照最流暢和標準的做法辦，我要architwcture 是有效率的的

**Reading.** (1) OD-1 = **option (b)** — repoint `apps/web/lib/clara/api.ts`, `lib/clara/stream.ts`,
`lib/clara/useClaraThread.ts` at the existing same-origin proxy, which every other runtime caller
already uses; the runtime's CORS surface is NOT widened. (2) A **standing steer** for the rest of the
ceremony-decision grill: where two lawful shapes exist, pick the smoothest, standard one; the
architecture must stay efficient — no bespoke surface where a standard one exists.

**Efficiency note stated to the owner.** The proxy adds one hop (browser → Worker → Fly) — the standard
BFF shape; it keeps the Supabase credential off the browser→Fly wire and removes the build-time
`NEXT_PUBLIC_*` freeze. Streaming through the Worker is the one unknown; FS-10 S14 on the preview is
the instrument, and (a) stays the fallback ONLY if the preview does not stream.

**Lane.** fix-chat-proxy (opus-5 xhigh, worktree) was dispatched on (b) before the ruling
(dissent-then-execute); the ruling confirms it. OD-2 (the `vars` block + the four `.env.example`
names) rides its PR.

**Record.** Ledger `docs/plan/active/mohe-grill-rulings-2026-09-03.md` + a digest row in
`docs/adr/README-rulings-2026-09.md` at the final truing (ONE-AUTHOR).
