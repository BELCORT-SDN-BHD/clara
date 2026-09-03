# 裁-156 — OD-7: NO soak window. The cutover switches the domain and DELETES the Pages project in the same sitting, gated by the real-origin re-walk. (Owner ruled AGAINST the 24 h recommendation.)

**Ruled 2026-09-03 ≈20:2x MYT (owner, AskUserQuestion), verbatim:**

> 不觀察 ，舊的forntend 完全不能用，直接換and 删

**Owner's ground (recorded as stated).** The legacy `apps/dashboard` on Pages is not a product anyone
may use; a rollback to it has no value, so the soak that protects that rollback protects nothing.

**Recommendation declined (filed as dissent, not relitigated):** 24 h with three named observations.
Consequence stated once to the owner: after the Pages delete there is no repoint rollback; a broken
Worker on the real origin is fixed FORWARD (`wrangler versions` — re-promote the previously walked
version; the Worker's own version history is the rollback surface).

**The sharpened execution (the owner's choice, made safe):**
1. FS-10 E: attach the domain to the Worker; the **real-origin re-walk (S21)** covers routes, password
   login, chat/SSE streaming (裁-151), the signup-confirm and password-recover arms (裁-154), the
   origin wall, the `?ct=` look (裁-155).
2. The three observations fold INTO S21 as its own reads: `curl -sI https://app.clarabook.com`
   (status + `server`/`cf-ray`), the route walk, and one read of the Worker's error/exception count over
   the walk window in Cloudflare's observability view.
3. **All clean ⇒ the Pages project delete follows in the SAME sitting** (after the Git integration is
   disconnected and the custom domain is off the project). Any read not clean ⇒ no delete; fix forward
   on the Worker; the Pages project stays only as an inert leftover, never as a fallback.
4. FS-11 may open right after FS-10's as-run is written (no calendar gap). The maintenance posture
   during FS-11 is OD-8 (asked next).

**Consequences for the records.** FS-10 prep D5 (soak) is REPLACED by this; `owner-decisions` §4's
order loses the SOAK line; T-G (the FS-10↔FS-11 posture) is written from 裁-156 + OD-8's ruling.
The `apps/dashboard` SOURCE delete is still OD-9 (separate).

**Record.** Ledger `-09-03` (with the dissent line) + digest row at the final truing.
