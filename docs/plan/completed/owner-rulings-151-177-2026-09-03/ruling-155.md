# 裁-155 — OD-6: the invite link's `?ct=` edge-log redaction is FS-10 step S16 — look on screen first; configure + prove with one live invite link if the control exists; a dated explicit deferral naming the exposure if it does not

**Ruled 2026-09-03 ≈20:1x MYT (owner, AskUserQuestion): 「照建議」.**

- S16's first act: read Cloudflare's dashboard for a zone/Worker-level query-string redaction
  control on THIS plan (unmeasured in the repo — notFound 5).
- If present: configure, then hit one live invite link and read the edge/access log — the
  checklist's own proof shape (`docs/ops/wave-g-setup-checklist.md:140-145`); the burned link is
  the evidence.
- If absent: an explicit dated deferral in the as-run + a Known-issues row naming the exposure
  (bearer material in ingress logs), the owner as actor, and the ruling number. Never a silent skip.
- Stated on the record: the link carries TWO bearer factors (path `token_hash` + query `ct`,
  `apps/web/lib/identity/doors.ts:59,80`; `lib/members/invite-mail.ts:10,97`); the checklist covers
  the query one only, so "redacted" = one of two, written as such.
- The "defer without looking" alternative was offered with its cost and not taken.

**Record.** Ledger `-09-03` + digest row at the final truing; FS-10 prep D7 carries it.
