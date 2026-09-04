# 裁-154 — OD-5: the preview walk is password-login only; the redirect allowlist is NOT widened; confirm + recover are proven on the REAL origin at FS-10 S21

**Ruled 2026-09-03 ≈20:0x MYT (owner, AskUserQuestion): 「照建議」.**

- Supabase Auth's redirect allowlist stays exactly `https://app.clarabook.com/auth/confirm` and
  `…/auth/recover`, no wildcard, no `workers.dev` entry — at any point of FS-10.
- The preview walk (S14) covers routes, password login, chat/SSE (the 裁-151 proxy + streaming),
  the origin wall's UNSET arm, the 11 security lines' FS-10 half (裁-153), the `?ct=` look (OD-6).
- The signup-confirm and password-recover arms are walked on the real origin at S21, right after the
  domain attaches; rollback at that point is still a repoint.
- Constraint 14's operative clause was the ground; the "widen then narrow" alternative was offered
  with its cost and not taken.

**Record.** Ledger `-09-03` + digest row at the final truing; FS-10 prep D6 carries it.
