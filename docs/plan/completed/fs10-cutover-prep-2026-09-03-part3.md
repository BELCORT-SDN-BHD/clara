*Part 3 of 3 of the FS-10 cutover PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `fs10-cutover-prep-2026-09-03-part2.md` · Next: none (this is the last part).*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

   LINK-template **box** as a permanent home, so `:52-53` and `:155-156` can stop pointing at a "pending FS-10
   notes" document that does not exist (§7 item 2).
5. **`docs/ops/wave-g-setup-checklist.md`, Cloudflare section (`:204-217`)** — needs the 裁-147 manual line:
   at the walk **and** at the cutover, `clara.list_stripe_event_problems(false)` must be empty of unhandled rows
   before the cutover proceeds. (Riding truing-4; until it merges this record's P13 IS the line.)
6. **`docs/ops/wave-g-setup-checklist.md:140-145`** — the `?ct=` redaction line should say which of the invite
   link's **two** bearer factors it covers: it redacts the query value, and the `token_hash` **path segment**
   (`apps/web/lib/identity/doors.ts:59,80`) stays in the log line.
7. **`apps/web/.env.example`** — add the four FS-4 C-6 names (D8). Today it disagrees with
   `wave-g-setup-checklist.md:104-133` by omission, and a reader who trusts it will under-configure the Worker.
8. **`apps/web/wrangler.jsonc`** — add a `vars` block for the non-secret Worker names (D8, R3).
9. **`PROGRESS.md`** — the banner is stale on FS-4 (#517 MERGED `aa789d65` 17:02 MYT 2026-09-03; `0164` on
   `main`). truing-4 is writing it; nothing in this ceremony may cite the banner until it lands.
10. **`docs/plan/active/fe-train-plan-2026-08-30-orders-p6.md:461-464`** — the R-3 pair should record that the
    `verify_snapshot` half was **paid on 2026-08-29** as `docs/ops/DR.md` §11, leaving only
    `record_notification` owed (P10, S26).
