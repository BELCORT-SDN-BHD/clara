# PROGRESS archive — 2026-09, part 1

*Opened on **2026-09-05**, at the repair session's clock-out, because `PROGRESS.md` could not take
the new posture block without breaching the repo's 500-line document ceiling — the same convention
every earlier part followed. It is the first 2026-09 part; the 2026-08 parts 1–8 are unchanged.*

*It holds the **beta-live posture block of `PROGRESS.md` as it stood immediately before the
2026-09-05 truing** — the 裁-185 GO paragraph and the whole "What ran, and what it proved" bullet
list — moved BYTE-FOR-BYTE and verified present here before `PROGRESS.md` lost it.*

**md5 of the moved block, computed on both sides of the move:**
`50f77696976ce97534407334231a8206` (80 lines, 7294 bytes).

**Why it moved, and where its content lives now.** The block describes the state at the END of the
beta-live sprint — the Worker version, the Fly release count, the reset estate, the re-cut books
pins. The repair session of 2026-09-04→05 landed sixteen pull requests on top of it, so as a
statement of TODAY's posture it is superseded. As a statement of what was true at 2026-09-04
≈06:15 MYT it is still exactly right, which is why it is kept whole rather than edited. The living
version of every fact in it is the new posture block in `PROGRESS.md`; the detail behind it is
[`beta-handover-2026-09-04.md`](beta-handover-2026-09-04.md) and its parts 2 and 3, which moved to
this directory at the same truing if they are no longer under `docs/plan/active/`.

**Nothing here is current.** Read `PROGRESS.md` first. Come here only to answer "what did the beta
go live on?"

---

**⇢ BETA IS LIVE, AND IT IS CLOSED. THE SPRINT SESSION IS OVER.** The owner ruled **裁-185** on
2026-09-04 ≈06:15 MYT (`AskUserQuestion`, option 1 of 3 — "GO — 封閉 beta（建議）"): the product is live
at `https://app.clarabook.com` for **BELCORT and owner-invited testers only**, and open applicants
wait for **a new runtime image (v75 or later)** + the statement-lane fixes + the "Enter a statement"
form fix + **DPA v2**.
Sign-ups are not switched off at the platform (`disable_signup: false`, read by Management API), so
the closure is an OPERATING posture — the owner controls who gets the address — not a technical wall.
Under **裁-150** this session CLOSES with the PR that carries this edit: **the repo is the handover
and there are NO next lanes.** The next session starts on the owner's ask.

**⇢ READ THIS NEXT: [`docs/plan/active/beta-handover-2026-09-04.md`](docs/plan/active/beta-handover-2026-09-04.md)
and its [part 2](docs/plan/active/beta-handover-2026-09-04-part2.md) and
[part 3](docs/plan/active/beta-handover-2026-09-04-part3.md).** That is the complete report
裁-185 asked for — the posture in plain language, the milestone tally of the beta-live walk, **every
backlog item and known issue across backend, frontend, harness, ops and legal** with an id, an owner,
a next step, a size guess and a priority tier, the harness notes, and an ordered pick-list. **The
Backlog and Known-issues sections below are SHORT ROWS pointing at that file's ids; the detail lives
there**, and the two sections as they read before this truing were moved byte-for-byte to
[`docs/plan/completed/progress-archive-2026-08-part8.md`](docs/plan/completed/progress-archive-2026-08-part8.md).

**What ran, and what it proved.** FS-10 (the P6-X cutover) opened 22:10 MYT 2026-09-03 and moved
`app.clarabook.com` from Cloudflare Pages to the Worker `clara-web` at **≈00:31 MYT 2026-09-04**;
FS-11 (the Wave-G factory reset) opened ≈01:32 and closed with BELCORT re-minted through the
product's own self-serve door; the 裁-184 product walk ran to 05:44. As-runs:
[`fs10-cutover-asrun-2026-09-03-part3.md`](docs/plan/completed/fs10-cutover-asrun-2026-09-03-part3.md)
· [`fs11-wave-g-asrun-2026-09-03-part4.md`](docs/plan/completed/fs11-wave-g-asrun-2026-09-03-part4.md)
(+ parts 5 and 6) ·
[`launch-sitting-record-2026-09-04-part3.md`](docs/plan/completed/launch-sitting-record-2026-09-04-part3.md).
**Honest tally: of the ELEVEN enumerated milestones — 6 PASS · 1 PARTIAL · 2 FAIL · 2 NOT REACHED**
(never "16 of 16"; sixteen was never enumerated anywhere — 裁-164). **Every refusal in the walk was
fail-closed with a plain receipt, and no wrong number entered the books at any point.**

- **Web:** Cloudflare Worker `clara-web`, version **I = `c5b1e051-6c68-4f56-8ba2-28b3265979e1`**,
  100 %, six secrets + three vars. Both `workers.dev` URLs OFF (404). **The Pages project `clara` is
  DELETED** and `clara-e3o.pages.dev` no longer resolves — **there is no repoint rollback**; a broken
  Worker is fixed FORWARD by re-promoting a walked version (裁-156, dissent filed on it).
- **Runtime:** Fly machine `48ee715b763048`, 2/2 checks, `/ready` **true**. `fly status` VERSION reads
  **74**, and `fly releases --json` at 06:21 settled what that means: **v71, v72, v73 and v74 all
  carry the same image `deployment-01M1JSJW8SW0EZ1SP8ZR48B1WZ`** — v72–v74 are the night's three
  `fly secrets import` releases (裁-179 ×2 + the freeform password), **not new code**, so the served
  code is the **v71** build of `344f7ad8` and **the next real deploy is v75**. **#533's reconciler
  unwire is MERGED AND NOT SERVING:** the DB no longer defines `clara.reconcile_autopost_rules`, v71
  still calls it, and the runtime logs the error every ~2 s. **A new image (v75 or later) is handover
  row H-01 and it is the first thing to do.** `held_outbox` **6** at the close (0 at 02:39) is **read
  and explained**: `/ready` at 06:21 shows `wakeEngine.heldForDisabledSource` 6 with the warning "6
  held/queued wake-engine row(s) awaiting a disabled/unregistered source" — the designed loudness of
  裁-165's disabled wake sources (`docs/plan/active/g1-wake-engine-design.md:114`), not a fault.
- **Database:** factory-reset and re-applied from scratch — **159 migrations, frontier
  `0164_checkout_gate_c6_web_reads`**, 19 `clara%` roles, `verify_evaluator_freeze()` reading
  `{"ok": true, "verified_deployed": 7, "verified_registered": 8}`. All six runtime lane DSNs now
  carry `uselibpqcompat=true&sslmode=require` — **encrypted, certificate UNVERIFIED** (裁-179 option
  c; before tonight four of them were PLAINTEXT). verify-full is handover row H-43.
- **Estate:** firms **Alara · Borneo · BELCORT** (`04daf86c-3aaf-4c59-9442-cce93f3582af`,
  `is_operator = true`, the only operator firm the unique index admits) · clients Meridian Logistics ·
  Sunrise Retail · Highland Coffee · ROME PROPERTIES `acb60b65…` · **ROME SECRETARY `7a045c7f…`**
  (active, 86-account chart, one sales invoice posted, one bank receipt settled, and **FY2025 OPEN
  with two close runs, both ABANDONED** — run 1 at 05:39 to book the settlement, run 2
  `db941c04-f78e-4595-9004-08df90be1631` at 23:55:11Z = 07:55 MYT at the clock-out, so the period
  wall is not left on for the next session; no attestation, no finalize). **BEE CREATIVE SOLUTION and
  ROME PUBLIC ADVISORY were NOT re-onboarded** — they died with the schema at step 4 and are owed
  before the next full-estate walk (constraint 13).
- **Books pins — RE-CUT.** The standing RS pin **3,396,500 = 3,396,500 is UNPROVEN POST-RESET: its
  SUBJECT no longer exists.** Those books were built through the product at Slice 6 and died at the
  step-4 drop under **裁-177** (the owner waived the pre-reset dump; dissent filed). **The new pins,
  both re-derived by `trial_balance_as_of` from the DB and never read off a chat reply:** at **20:58Z**
  `1100` Dr 2,800.00 / `4000` Cr 2,800.00, and at **21:40Z** `1020` Dr 2,800.00 · `1100` net 0 ·
  `4000` Cr 2,800.00.
- **`main` = `ba8e7d35`** (#540, the `apps/dashboard` source delete). The hand sweep **33781966143**
  on it: **SUCCESS, 13 of 13 jobs**, ≈02:14 MYT — the tree without `apps/dashboard` is proven green
  across every leg including the closed-wave drills and the four frontier legs.
- **The test-data authority has EXPIRED WITH BETA.** Constraint 14 is DATA-scoped and expires at beta,
  and 裁-162's FS-11-scoped supersession of `docs/ops/DR.md`'s owner-run classifier expired with the
  ceremony. **From here: no agent-run destructive command against the live project.** BELCORT is the
  operator firm; the Rome/BEE clients remain resettable TEST fixtures (ADR-0075, constraint 13).
- **CI** is GitHub-hosted on `ubuntu-latest` (裁-135) and **the repo is PUBLIC**; the four `clara-wsl`
  runners are stopped and disabled. After any PR touching a closed drill or the pipeline itself, run
  `gh workflow run ci.yml` by hand, and read a sweep's verdict from `gh run view`'s job list.
- **Hard-blocked ids** (canary `daba7f2e` · witness `d023b48c`) — hook-enforced
  (`scripts/hooks/pinned-ids-guard.mjs`). Their clara-side rows died with the schema at step 4
  (裁-160, accepted); the hook and the constraint are unchanged.
