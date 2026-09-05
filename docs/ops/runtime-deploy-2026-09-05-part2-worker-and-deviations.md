# The 2026-09-05 production ceremony — part 2: the web Worker, the deviations register, the instruments

**Part 1 is [`runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](runtime-deploy-2026-09-05-v75-and-db-0165-0176.md)**
(§0 preflight → §5 runtime v75). This file continues at §6 because part 1 reached the repo's
500-line ceiling. Same ceremony, same run, one record in two files.

---

## 6 · The web Worker

**Tooling, after two failures.** Windows node is **v20.19.5** and wrangler 4 needs **≥22**; this
checkout's `node_modules` carries **`@cloudflare/workerd-windows-64`**. So wrangler runs neither
from Windows nor from the repo under WSL. The owner logged in ≈01:20 MYT with a **standalone
wrangler under WSL outside the repo** ("/tmp/wr", `npx -y wrangler@4`, node 22 at "/opt/node"),
creds landing in "/home/runner/.config/.wrangler/config/default.toml".

**The §0.6 baseline, taken late (D-2).** Account **tools@belcort.com**, id
`ac42cba1bda978bd00f6c45d0e25dc24`. **Promoted version `c5b1e051-6c68-4f56-8ba2-28b3265979e1` at
100 %**, deployed 2026-09-03T16:24:09Z — version **I**. The deployment before it was `de3e4530…`.
Secrets: **exactly six names**, values never read. **No rotation owed.**

> **Method note for the runbook: `wrangler versions list` does NOT say what is promoted.** It
> returns the version HISTORY with no deployment percentage, so reading its top entry as "the
> promoted one" is a guess that merely happened to be right. **`wrangler deployments list` is the
> instrument.**

**6.1 Build — in a WSL clone with its own install.** `cf:build` **exit 0** 16:47:21Z.
**".open-next/worker.js" = 2,278 BYTES**, byte-identical in size to the FS-10 cutover's recorded
thin entry. `.open-next` **48 M**. The clone installed **`@cloudflare+workerd-linux-64`**, which is
the whole reason the build must happen there.

**The first build REFUSED, correctly.** `check-public-key.mjs` stopped it because the clone had no
env file: *"REFUSING TO BUILD … Whatever sits in that variable is inlined into the browser bundle
by `next build`."* The clone was then given **the `NEXT_PUBLIC_*` values ONLY**, plus
`CLARA_BUILD_SHA`. Those are public by construction — `next build` inlines them into the browser
bundle, `.env.example` calls the anon key *"publishable by design"*, and the gate refuses anything
that is not a publishable key or a JWT whose decoded role is positively `anon`. The four Cloudflare
vars are COMMITTED in `apps/web/wrangler.jsonc`, so the clone already had them.

**Leak check — stated precisely rather than reassuringly.** Client assets contain **ZERO**
occurrences of `CLARA_E2E_MONEY_INPUT_HARNESS`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`;
those names appear only in server-side files ("middleware/handler.mjs", `server-functions/**`,
"required-server-files.json"), which is correct — the Worker reads them from its own env at request
time. The two `NEXT_PUBLIC_` values appear 4× each in assets, by design. **BUT the value-level grep
SKIPPED four names**, because every non-public variable in the source `.env.local` is EMPTY there —
the real values live only in Cloudflare. **The first attempt printed a clean verdict while silently
skipping those greps — a FALSE-PASS shape** — and was rewritten to say *"check SKIPPED (not a
pass)"* out loud. The assurance therefore rests on two facts, not on a positive grep: the values are
not in the source at all, so they could not have been baked in; and their names appear nowhere in
the client assets.

**`NEXT_PUBLIC_CLARA_RUNTIME_URL` is empty BY DESIGN, not by omission.** The same-origin proxy
("app/api/runtime/[...path]/route.ts") reads the server-side `CLARA_RUNTIME_URL` at REQUEST time;
its own header records that the build-time browser variable was removed because a baked value *"was
measurably dead on a deployed origin either way it was set"*. **Control: the live deployed bundle
contains zero occurrences of the runtime host.**

**6.2 Upload.** Version **`90c1a5d0-f808-4b88-bd28-d2395d9bc26a`**, 16:50:15Z. 67 files (25 already
present), **14,823.26 KiB / gzip 3,325.78 KiB**, **startup 40 ms**.

**FS-10's H-defect check was RUN, and it is why the promote was safe to ask for.** That cutover's
version H carried **FIVE** secrets instead of six and was never promotable; the fix was re-putting
the missing one to mint version I. So `wrangler versions view` was READ rather than inheritance
assumed: this version carries **SIX** — `CLARA_AUTH_WALL_SERVICE_TOKEN`, `CLARA_RATE_WALL_PEPPER`,
`INVITE_MAIL_FROM`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **No H
defect.**

**Trued here: it is FOUR environment variables, not three** — `CLARA_PUBLIC_ORIGINS`,
`CLARA_RUNTIME_URL`, `CLARA_STRIPE_LIVEMODE`, `CLARA_TRUSTED_CLIENT_IP_HEADER`.

**6.3 Promote.** `wrangler versions deploy 90c1a5d0-…@100% --yes` at 16:52:13Z → **"SUCCESS
Deployed clara-web version 90c1a5d0-… at 100% (1.91 sec)"**. `deployments list`: newest deployment
**16:52:20.434Z carrying `90c1a5d0…` at (100%)**.

**Not trusting the deployment record alone** — a record saying a version is live is not proof the
bytes changed. Three content-hashed chunk paths pulled from the LIVE `/login` HTML —
`08ubrwmyen8g8.js`, `0cz1d0mv5g_q7.js`, `0jfzb6enoct9v.js` — are **ALL PRESENT** in the built
artifact. Content-hashed filenames match only if the content matches, so **the bundle now served IS
the one built from `0351f022`**. Anonymous reads: `/` 307 · `/login` 200 · "/api/build-info" 307 ·
**`/favicon.ico` 200 "image/vnd.microsoft.icon"** · **`/icon.png` 200 "image/png"** — the #553 icon
work is live.

**6.4 Smoke — PASS ×7**, in the signed-in Playwright page on the promoted Worker, 16:53–16:57Z:

1. **Firm home = #557's board with real content** — "BELCORT · Owner · 2 clients" (role via the
   catalog), the eight needs-you counts, oldest-waiting, "Clara is working" (8 tasks), recent
   activity via **`rpc/list_firm_timeline` 200** (#552's door), sweep runs, clients.
2. **Client home = the situation board** — identity band with the status in the h1, onboarding,
   needs-attention counts, documents & coding, Bank "latest statement to 2025-06-30", Close
   "FY2025 · Open · 2025-12-31 (stated by your firm) · 9 of 15 gates" via
   **`rpc/get_close_readiness` 200**, last activity via **`rpc/list_agent_act_receipts` 200**.
   **Journals** = #548's table (status/source filters, paging, two posted entries; *no draft exists
   on this client, so the one-Approve rule had nothing to show*).
3. **Documents** → RSINV → detail with "Open document", extraction tasks, filings, evidence table;
   "Show page overlay" → `GET /api/runtime/documents/d7cb5098…/bytes` **200**,
   "/pdf.worker.min.mjs" **200 from the app's own origin**, the blob rendered, toggle → "Hide page
   overlay". The document-kind door (re-cut `0169`) present.
4. **Bank**: six sections; Statements shows #549's header pair (statement date / period start / end
   / opening / closing) plus lines; `rpc/list_bank_statements` **200** for the Maybank account.
   **Close**: 15 gates in three drawers, readiness live — **the two honest FAILs from
   `0166`/`0167`/`0172`** (unmatched statement lines; FY-dated filings without an entry); "Restart
   close" present.
5. **ENTER-TO-SEND** — the discriminating check of the whole deploy, because it did NOTHING on the
   old Worker at §4.2: `POST /api/runtime/chat/d4dddb69…/turns` **202** → `tasks/c622c866…/stream`
   **200** → *"Yes, I can see this turn."* **The new build is live in the browser beyond doubt.**
6. "chat/sessions" **200** on every page.
7. Sign out → `/login` **200**.

**Console: 0 errors on every page** (only the pre-existing font-preload warnings).

> **AXE WAS NOT RUN IN THIS WALK.** The MCP browser used for the smoke has no axe. Accessibility for
> these surfaces is carried by the frontend trains' own Playwright legs, per surface, under 裁-86 —
> not by this ceremony. Stated rather than implied.

**Rollback for the Worker:** re-promote `c5b1e051-6c68-4f56-8ba2-28b3265979e1` at 100 %. There is no
repoint rollback — a broken Worker is fixed FORWARD (裁-156).

---

## Deviations register

**D-1 · One non-terminal workflow run at preflight (part 1, §0.4).**
`wrun_01M1MNTV64Z681KNQ6QVM4HEDH`, `clientOnboarding_v4`, `running`. **RULED PROCEED** by the lead:
it predates the session, no PR renamed or removed `clientOnboarding_v4`, so rolling forward leaves
it exactly as stranded; §0.4 exists to catch runs the NEW image would orphan. **Not touched.**
**Subject:** client `6fd74d69…` = **"Pine & Co E2E Sdn Bhd"** under firm `8fa177d0…` = **"Clara E2E
Audit 2026-09-04"** — an **E2E audit fixture**, not a real firm or client. Its onboarding plan
`cdb31b50…` reached **`committed`** twenty-one minutes after the run started, so the DB-side work
FINISHED and only the engine row never left `running`.
**TIMESTAMP CORRECTION.** The first reading of this run was **8 h wrong**.
`workflow.workflow_runs.{created,started,updated}_at` are `timestamp WITHOUT time zone`, and
node-postgres parses those as LOCAL time on this UTC+8 host. Re-read as TEXT with the arithmetic
done server-side: created **`2026-09-03 22:22:05.477778` UTC**, age **1 d 15 h 56 m 39 s** at
16:18:45Z; last activity anywhere in that table **`2026-09-04 00:28:37` UTC**. The calibration that
proves the UTC reading rather than assuming it: the onboarding plan it names was created
`22:21:35.465643` UTC, **30 s before** the run. Only the UTC reading puts the run after its own plan.

**D-2 · The Worker baseline could not be taken at preflight.** Wrangler was unauthenticated
everywhere on the host — no OAuth config under WSL, none under the Windows profile, no
`CLOUDFLARE_API_TOKEN` in any environment — and the tooling failed twice more before working (§6).
Taken late, after the owner's login.

**D-3 · One `statement_facts` task `running` at §1.3.** Task `8923e85a…`, document `8978b8d5…`,
started `2026-09-04 00:28:20.908148` UTC, untouched for **1 d 15 h 41 m**, `finished_at` null —
**and its workflow run `wrun_01M1MX20K6TCVBN000G2SJN7M6` has status `failed`**, twelve seconds after
the task started. **This is H-03 itself**, the task-settlement-on-step-failure defect #545 fixes:
the row is an orphan of the very bug this deploy ships the fix for.
**RULED PROCEED, DO NOT WRITE.** `0175`'s hazard is an **ACTIVE PL/pgSQL CALL** on the body being
replaced (its header, line 13); with zero `clara_%` sessions of any state and the runtime stopped
there was no call, and **`grep document_processing_tasks 0175…sql` returns ZERO matches**, so the
file neither refuses nor rolls back on it. **A Known-issue row is owed.**

**D-4 · `pnpm db:migrate` cannot run through the bridge on Windows.** The first migrate invocation
failed **without touching the database**: `dsn-pipe: failed to start "pnpm": spawn pnpm ENOENT` —
`pnpm` is a shim and `dsn-pipe.mjs` spawns its child with no shell. **Absence was not treated as
evidence:** the frontier was re-read and was still 159 / 0164. The working form is the one
`ceremony-practices.md` already documents — **`node packages/db/scripts/migrate.mjs`** — which
resolves `DEFAULT_MIGRATIONS_DIR` from the SCRIPT FILE (`migrate.mjs:57`), not the cwd.

**D-5 · An HTTP checkpoint landed one minute after the restart and raised a quiesce-breach alarm.**
Resolved by two independent proofs: `packages/runtime/fly.toml:40-42` reads
`auto_stop_machines = false`, **`auto_start_machines = false`**, `min_machines_running = 1`, so
Fly's proxy could not have started the machine on any inbound request; and the timeline puts the
curl at ≈16:15Z, after the 16:14:47Z restart and the 16:15:09Z first `/ready` 200. The mid-window
read at 16:08:47Z had returned **zero sessions of any state**. **No breach.** The rule still goes
into the recipe — for a different reason than the one that prompted it: a future edit flipping
`auto_start_machines` would make the hazard real, and **a recipe that depends on a config value it
never checks has an invisible precondition.**

**D-6 · The recall harness cannot run inside the image it ships in — two defects.**
(i) `packages/runtime/Dockerfile`'s final stage copies `.output`, `scripts`, `lib`, `package.json`
and `node_modules` but **NOT `packages/runtime/workflows/`**, and `lib/classify.mjs:28` imports
`packages/runtime/workflows/invoiceFacts.v1.behavior.mjs` → `ERR_MODULE_NOT_FOUND`. The server never hits it
because the server runs the nitro bundle where the import is inlined; only a standalone script does.
(ii) `scripts/measure-classify-recall.mjs:290` builds a **bare `pg.Client`** and never `SET ROLE`s,
so it fails **42501, permission denied for table `document_regions`**, through every lane login — by
design of `packages/db/deploy/roles-bootstrap.sql:190`,
`grant clara_runtime to clara_runtime_login WITH INHERIT FALSE, SET TRUE`, whose own comment says
the bare login stays privilege-less until it SET ROLEs. `packages/runtime/lib/pools.mjs` does that on every checkout.
**The env-only fix was tried and is shut:** node-postgres DOES map `PGOPTIONS` onto the startup
`options` parameter (`pg/lib/connection-parameters.js:83` via `val()`, `:139` into the startup
packet), but **the session pooler does not forward arbitrary startup options to the backend**.
Worked around for this run by putting the one 5,190-byte file in and, under the lead's option-(a)
ruling, using the migration DSN. **Both are follow-up fixes, not closed here.**

**D-7 · Two path hazards in opposite directions, Git Bash ↔ a native `.exe`.** Git Bash rewrote the
POSIX **remote** destination "/tmp/x.json" into a Windows path (fixed with `MSYS_NO_PATHCONV=1`);
with conversion off, the **local** absolute path must already be Windows-form or `fly.exe` cannot
open it (fixed with `cygpath -w`). The relative path needed neither, which is why only one of the
two files failed on the second attempt.

**D-8 · The sleeper expires on its own clock.** `683e761cd13d38` (`sleep 5400`, created 14:15:31Z)
stopped at **15:45:41Z**, as flagged in advance. A fresh sleeper was spun and its pipe proved by a
live read BEFORE the window opened, and the expired machine destroyed. **Census before teardown.**

**D-9 · The as-run exceeded the repo's 500-line file ceiling** and was split into part 1 and this
file, on the precedent of the FS-10 cutover as-run's own parts.

---

## Instruments, for the next operator

Every DB read ran as
`fly ssh console -a clara-backup --machine <sleeper> -C "printenv DATABASE_URL" | node scripts/ops/dsn-pipe.mjs -- node <script>`
— `sslmode` forced to `verify-full` with `ops/tls/pooler-ca.crt` pinned, every read wrapped in
`BEGIN TRANSACTION READ ONLY`. **No DSN touched argv, a file, or any output at any point in this
ceremony.** Sleepers were created and destroyed inside the session.

Body identity was measured as `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` over `pg_proc`,
with volatility, `prosecdef`, `proconfig`, owner and ACL beside it — captured pre, captured post,
compared. **That instrument, not the migration tails, is what proves the six moved and the
seventeen did not.**

Three identity proofs in this ceremony deliberately avoided name-matching, per review law 3
("spelling is not identity"): the released runtime image was matched to the gated one **by Fly image
id**, not by tag; the served Worker bundle was matched to the built one **by content-hashed chunk
filenames**, not by the deployment record; and the twelve applied migrations were matched **by
ledger checksum against values pinned before the window**, not by filename.
