# The CI runner — hosted from 2026-09-02; the self-hosted fleet is parked

> **CURRENT STATE (2026-09-02, 裁-135).** CI runs on **GitHub-hosted `ubuntu-latest`**.
> The four WSL2 runner instances are **still registered but receive no jobs** — no
> `runs-on` in `.github/workflows/ci.yml` carries the `self-hosted` label any more.
> Read the next section for the hosted shape. Everything from "The self-hosted fleet"
> onward is the FLEET's record: still accurate about the fleet, and still the procedure
> for decommissioning it.

## Hosted from 2026-09-02 (裁-135)

**Why.** The owner ruled for speed over the private-repo posture at the beta sprint:
*"我要不影响品质的情况下加速 CI 这种死工作 … 如果我 public repo and use github 的资源能换来
更快的开发速度, 我就去做 NOW."* Four self-hosted instances were the merge-rate bottleneck —
a single code PR's four heavy legs queued against every other lane's, and the same
afternoon produced two contention-class false reds. Hosted runners give every job its own
fresh VM, so the four legs are genuinely parallel and there is no fleet to contend for.
This migration is **execution order step 1** of 裁-135; the visibility flip, the
full-history secret scan and the fork-PR approval wall are the owner's steps 2-4.

**What the migration changed — and what it deliberately did not.** Zero gate content
moved. The same nine jobs, the same fail-closed `ci` meta-gate, the same docs-only
classifier, the same weekly-sweep cadence, the same step bodies. Four things changed:

1. `runs-on: [self-hosted, linux, clara]` → `runs-on: ubuntu-latest` on all ten job
   definitions (the nine gates plus the meta-gate).
2. **The host-wide `flock` serialisation retired** — in `.github/actions/pg17-client`
   and in the render drill's font install. It existed because parallel jobs on ONE WSL
   host raced the keyring/sources writes and the dpkg lock. A hosted runner is
   single-tenant, single-job and throwaway, so there is no second job to race. **The
   idempotence guards are kept** — they were never the lock's job.
3. **`timeout-minutes` on every job** — a backstop against a hung leg, not a target
   (GitHub's own default is six hours). `changes` 10 · `ci` 10 ·
   `db-split-partition-total` 15 · `lint` 30 · `build` 45 · `render-drill` 45 ·
   `db-live-gates` 90 · `db-slice-frontiers` 90 · `db-estate` 120 ·
   `closed-wave-drills` 120. Deliberately loose: the WSL host had 24 vCPUs and a standard
   hosted runner has 2 (private) or 4 (public), and the parallel-heavy legs fan `node
   --test` out to CPU count, so a ceiling that merely doubled the WSL timing would
   false-red honest work. **A leg that approaches its ceiling is the signal to
   investigate, not to raise the number.**
4. **The pnpm store moved to the `setup-node` action's own `cache: pnpm`**
   (`.github/actions/setup-workspace/action.yml`). The persistent local store at
   `~/.pnpm-store` was the right answer on a long-lived WSL host; on a throwaway VM it
   is cold by construction, and the remote cache is the only one that can be warm at all.
   The explicit `--store-dir` was removed with it — an install writing where the cache
   step never reads is a cache that silently does nothing.

**What each job needs from the host, and where it comes from.** Measured against the
runner image's own published manifest (GitHub's runner-images repository, the Ubuntu 24.04
readme), not assumed:

| Job | Needs | Source |
|---|---|---|
| `changes` | git, full clone | image |
| `lint` | node 20.19.5 · pnpm 10.33.0 · curl+tar · full git history | setup actions; gitleaks 8.18.4 fetched in-job |
| `render-drill` | node 20.19.5 · **docker** · **DejaVuSans.ttf** | docker 28.0.4 in the image; `fonts-dejavu-core` installed in-job (the image ships NO DejaVu — only `fonts-noto-color-emoji`) |
| `build` | node · pnpm | setup actions |
| `db-estate` | node · pnpm · **psql/pg_dump 17** · 1 × `postgres:17` service | the image ships PostgreSQL **16**, so the pg17-client composite adds PGDG `postgresql-client-17`; the service container is Docker |
| `db-live-gates` | node · pnpm · psql/pg_dump 17 · **4 × `postgres:17` services** · disk for the DR dump | as above |
| `closed-wave-drills` (sweep) | node · pnpm · psql 17 · 1 × `postgres:17` | as above |
| `db-slice-frontiers` (sweep) | node · pnpm · psql 17 · 1 × `postgres:17` per matrix leg | 4 legs → 4 separate VMs |
| `db-split-partition-total` | POSIX shell only (`ls`/`grep`/`awk`/`diff`) | image; no install, no database |
| `ci` (meta-gate) | bash | image |

**The runner GitHub gives us** (docs.github.com, "GitHub-hosted runners", standard
runners, read 2026-09-02): Ubuntu 24.04 for `ubuntu-latest`; **4 vCPU / 16 GB RAM / 14 GB
SSD for PUBLIC repositories** and **2 vCPU / 8 GB RAM / 14 GB SSD for PRIVATE**;
passwordless `sudo`. The proving run for this migration therefore ran on the *smaller*
half — the repo was still private — and the fleet gets faster, not slower, at the
visibility flip. Every run prints its own `nproc` / `free -h` / `df -h` / docker / psql
in the `changes` job's "Runner facts" step, so the claim is a measurement in the log
rather than a line in a document.

**Concurrency — no slot cap.** One axis, two regimes:

- `pull_request` → a per-branch group keyed on `github.ref` (`refs/pull/<n>/merge`, stable
  across that PR's pushes), **with** `cancel-in-progress`: a superseded push's run is dead
  weight and, on billed minutes, dead spend.
- `push` to main · `workflow_dispatch` · `schedule` → a **run-id-keyed** group, so each run
  is alone and cancellation is a structural no-op.

This also fixes two latent shapes the old single group had: the weekly sweep's literal
`weekly-sweep` group meant a second sweep cancelled the first, and every push to main
shared one group, so a merge landing mid-CI cancelled the earlier merge's run. **The
裁-134 per-slot cap (PR #513) is superseded and moot** — a per-slot cap rations a fixed
fleet, and there is no fleet.

**Two measured losses, named rather than discovered later.** The shared Docker daemon's
BuildKit cache does not survive between runs, so the render drill rebuilds its image cold
each time; and the persistent pnpm store is gone, replaced by GitHub's remote cache.

**Security posture on hosted runners.** The RCE class the old private-repo-only order of
operations guarded against — a fork PR executing on our machine — is closed structurally:
fork code now runs on GitHub's disposable VM, never ours. The remaining wall is the
repository setting **"require approval for all outside collaborators"** for fork
pull-request workflows, which the owner sets before the visibility flip (裁-135 step 3).
**The parked fleet must never be re-pointed at `pull_request` while the repo is public.**

**Cost.** The org is on the **Team** plan: private-repo Actions minutes are included at the
plan's monthly allowance and Linux runners bill at 1×; **public repositories use standard
runners free of charge**, which is what the visibility flip buys. The 2026-08-11 exhaustion
that created the self-hosted fleet happened on the *pre-diet* pipeline — the CI diet
(pull_request-only triggers, the docs-only classifier, the weekly sweep) and ADR-0073's
sweep demotion both stand and are what make hosted minutes affordable now.

## The self-hosted fleet (2026-08-11 → 2026-09-02) — parked, kept for decommission

**What this was.** The SAME GitHub Actions CI — same workflows, same binding green-check
gate on every PR (the engineering doctrine is unchanged) — executing on our own hardware
instead of GitHub-hosted runners, because the org's free-tier minutes exhausted and the
merge queue froze. Runner minutes on self-hosted are free and unlimited for private repos.

## Topology

- **Host:** the owner's Windows 11 machine → **WSL2 Ubuntu** distro (`Ubuntu`).
- **Inside WSL:** Docker Engine (docker-ce; systemd-managed) — required for the
  `postgres:17` service containers CI declares — plus **FOUR** GitHub Actions runner
  instances, each in its own home directory with its own `_work` tree (and therefore its
  own lazily-created `_work/_tool` tool cache and `_work/_actions` action cache — zero
  path overlap):
  - `~/actions-runner`   → `clara-wsl`
  - `~/actions-runner-2` → `clara-wsl-2`
  - `~/actions-runner-3` → `clara-wsl-3` (added 2026-08-23)
  - `~/actions-runner-4` → `clara-wsl-4` (added 2026-08-23)

  All four are registered at REPO level to `BELCORT-SDN-BHD/clara` with identical labels
  **`self-hosted, linux, clara`** — four instances let a single PR's four parallel legs
  (build · db-estate · db-live-gates · render-drill, ADR-0073) run fully 4-wide instead of
  queuing 2-at-a-time, and let two PRs each run 2-wide concurrently.
- The `runner` user holds **passwordless sudo** (`/etc/sudoers.d/runner`) — hosted-runner
  parity: workflows written for GitHub images assume it (the DR pg_dump step's
  `sudo apt-get` was the first casualty without it). Acceptable ONLY because the repo is
  private and every workflow change passes our own PR gate.
- **ci.yml** pinned every job `runs-on: [self-hosted, linux, clara]` — **no longer true
  since 2026-09-02** (裁-135): every job is `ubuntu-latest`, so nothing routes here. While
  it did, an OFFLINE runner made jobs QUEUE visibly (never silently pass).

## Security posture (read before changing anything)

- **PRIVATE-REPO ONLY — SUPERSEDED 2026-09-02 by 裁-135, and it is why the fleet is
  parked.** A self-hosted runner on a public repo executes fork PRs' code on our machine.
  The order of operations was: decommission FIRST, then flip visibility. The hosted
  migration satisfies the substance of it — no event routes to these runners any more, so
  fork code never reaches this hardware — and the owner's remaining steps are the fork-PR
  approval setting and then the flip. **The residual rule is absolute: never re-point
  these runners at `pull_request` while the repo is public.** To finish the job properly,
  run the decommission below (`config.sh remove`).
- The runner user is an unprivileged WSL user; secrets available to jobs are only what
  the workflows already carried (the throwaway in-job Postgres needs none).
- The `clara` label keeps these jobs off any other self-hosted runner ever registered.

## Operate

The runner is a **systemd service** (`actions.runner.BELCORT-SDN-BHD-clara.clara-wsl`),
installed via `svc.sh` — it starts whenever the distro boots.

```powershell
# Start after a reboot = just boot the distro (systemd brings docker + runner up):
wsl -d Ubuntu -- true
# Status:
wsl -d Ubuntu -u root -- systemctl status 'actions.runner.*' --no-pager
# Stop / restart:
wsl -d Ubuntu -u root -- bash -c "cd /home/runner/actions-runner && ./svc.sh stop"
wsl -d Ubuntu -u root -- bash -c "cd /home/runner/actions-runner && ./svc.sh start"
```

Autostart: a silent VBS in the user's **Startup folder**
(`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\clara-ci-runner.vbs`) boots
the distro at logon (an elevated Scheduled Task was refused without admin — the Startup
folder needs none). If jobs sit queued after a reboot: log in once, or run the
one-liner above; check Docker with `wsl -d Ubuntu -- docker info`.

### WSL operating laws (from two dated incidents — 2026-08-14/15 and 2026-08-20)

**A detached keeper for any port-dependent WSL work:**
`Start-Process -WindowStyle Hidden wsl.exe -ArgumentList "-e","sleep","43200"` — the WSL NAT
dies ~10 minutes after the last client detaches, even with the distro's VM otherwise held up.
**NEVER `wsl --shutdown` with runners busy** — restart the specific service instead
(`wsl -d Ubuntu -u root -- systemctl restart <unit>`); a shutdown mid-run silently kills every
in-flight job on all four runners. **Never diagnose VM health with a probe that itself cycles
the VM** (the 2026-08-14/15 incident) — a probe that spins the distro up/down to "check" it
can itself trigger the NAT death it is trying to rule out.

**The WSL split-brain signature (the 2026-08-20 incident):** `wsl -l -v` reports the distro
`Stopped` while `vmmem` is still a live process — every subsequent `wsl` command silently
boots a SECOND userland, so two runner-registration copies fight one repo-level registration
(a `Conflict` crashloop; symptom: zero failing steps plus vanished logs, not a red test).
**Cure:** a full `wsl --shutdown` — but only once every runner is genuinely IDLE — then bring
up exactly one keeper (the detached-keeper recipe above). Never attempt the cure with a
runner mid-job.

## Re-register / decommission

```bash
# fresh registration token (admin):
gh api repos/BELCORT-SDN-BHD/clara/actions/runners/registration-token -X POST --jq .token
# inside WSL, in ~/actions-runner:
./config.sh remove --token <TOKEN>          # decommission
./config.sh --url https://github.com/BELCORT-SDN-BHD/clara --token <TOKEN> \
  --name clara-wsl --labels clara --unattended   # register
```

## Cost/why record

Free-tier private-repo minutes (2,000/mo) exhausted 2026-08-11 mid-Wave-E (pre-diet CI
ran 40+ min on every push incl. docs-only). The alternatives ruled out: paying (owner
preferred $0), making the repo public (**hard no — client confidentiality**: real client
names, ledger figures and counterparties live throughout `docs/`). The ci-diet
(pull_request-only triggers + docs-only classifier + weekly sweep) rides the same PR as
this runbook and cuts future load independently.

> **REVERSED 2026-09-02 (裁-135, owner).** The "hard no" above was overruled by the owner
> after the exposure was restated to them: the PRD, the rulings ledger, the legal templates
> and the real-firm-named fixtures going public is **accepted as the price of merge speed**
> for the beta sprint, and the owner intends to return the repo to private after live
> launch (noting that anything published in the interval stays public in forks and caches).
> That is an owner ruling on their own law, recorded here so a later reader does not read
> the 2026-08-11 paragraph as still binding.

## The CI economics overhaul (ADR-0073, 2026-08-21)

The former ~42-min monolithic `ci` job is split into parallel jobs (build · db-estate ·
db-live-gates · render-drill) so the runner instances run up to 4-wide per PR (2-wide
before the 2026-08-23 expansion), and **the
closed-wave upgrade/contract drills + the D-b frontier matrix run on the weekly sweep and
`workflow_dispatch` ONLY** (owner-ruled lever 1; the estate suite + deploy-onto-existing
stay per-PR as backstop). The required check `ci` is now a fail-closed meta-gate over
every job. Step bodies live verbatim in `.github/actions/*` composites.

**Operating practice:** after merging a PR that touches a closed-wave drill, a
split-list, or the pipeline itself, trigger the full sweep by hand rather than waiting
for Thursday:

```sh
gh workflow run ci.yml    # runs EVERY leg, closed-wave drills included
```

Installs use a shared local pnpm store at `~/.pnpm-store` (content-addressed, lock-safe
across all four instances); the pinned gitleaks binary caches at `~/.cache/`. Hybrid
GitHub-hosted runners were considered and DECLINED — the $0 preference above stands.

> **BOTH SENTENCES SUPERSEDED 2026-09-02 (裁-135).** The hosted migration replaced the
> local pnpm store with the `setup-node` action's `cache: pnpm` (a throwaway VM cannot hold a
> local store warm), and the "hybrid hosted runners DECLINED" call was reversed outright —
> CI is fully hosted. The gitleaks staging path is unchanged in code and simply starts cold
> on each VM. **ADR-0073 itself is untouched:** its three levers (sweep demotion, the job
> split, the fail-closed meta-gate) all survive the move intact — only lever 3's *hosting*
> assumption, which was written for this hardware, no longer applies.

## Runner count expansion to four (2026-08-23)

Two more instances — `clara-wsl-3` (`~/actions-runner-3`) and `clara-wsl-4`
(`~/actions-runner-4`) — were added identically to the existing two: same runner version
(2.336.0, tarball sha256 verified against the GitHub release notes before extracting),
same labels (`self-hosted,linux,clara`), same `svc.sh install <user> && svc.sh start`
systemd-service pattern (`actions.runner.BELCORT-SDN-BHD-clara.clara-wsl-{3,4}.service`,
`User=runner`), same repo-level registration. Verified all four `online` with identical
labels via `gh api repos/BELCORT-SDN-BHD/clara/actions/runners`.

**Isolation, unchanged by design:** each instance's `_work` (and therefore its
lazily-created `_work/_tool` tool cache and `_work/_actions` action cache) lives under its
own `~/actions-runner*` root — four disjoint filesystem trees, confirmed by `stat` on all
four paths post-install. The two shared-host race hazards from the original two-instance
build already generalize to N instances without change: the `postgres:17` service
containers bind **ephemeral host ports** (`ports: [5432]`, read back via
`job.services.postgres.ports['5432']`), so concurrent jobs never collide on a fixed port;
the render-drill's `docker build` tags the image `clara-render:ci-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`
(run-scoped, `.github/workflows/ci.yml`), so concurrent builds never collide on a tag; and
the `pg17-client` composite's apt/dpkg install is serialized by a single host-wide
`flock /var/lock/clara-pgdg.lock` regardless of how many runner processes are racing it.

**Capacity verdict: proceed with four, monitor memory.** The WSL2 VM: 24 vCPUs (matches
the host's 24 logical processors — no `processors=` cap in `.wslconfig`), ~15.5 GiB RAM
(the WSL2 default of half the host's ~32 GiB physical memory — `.wslconfig` sets only
`vmIdleTimeout`, no `memory=` override). CPU is not a concern at 4-wide (6 cores/job).
Memory is the binding resource but not, on the evidence gathered, *clearly* insufficient:
idle baseline with both original runners' services up is ~1.2–1.5 GiB used / ~14 GiB
available; `dmesg`/`journalctl -k` show no OOM-kill history; a `postgres:17` service
container itself is cheap (observed 70–320 MiB live). No GitHub Actions job happened to be
mid-run during this check, so peak `pnpm build` + `tsc` + `next build` + `postgres`
memory under real 4-wide load was not directly measured — back-of-envelope (4 concurrent
jobs × an estimated 2–4 GiB peak each) fits inside the ~15.5 GiB cap with a thinner-than-
ideal margin. **Action for the owner:** watch `wsl -d Ubuntu -- free -h` /
`docker stats --no-stream` during the first few genuinely 4-wide PRs (all four
build/db-estate/db-live-gates/render-drill legs of one PR landing at once); if the VM
gets memory-pressured or a job is OOM-killed, the lever is raising `.wslconfig`'s
`memory=` (the host has ~32 GiB physical, so there's room to raise the ~15.5 GiB default
cap) rather than removing a runner instance.

## `fetch-base-main` harness race, forced ref (2026-08-30)

Sweep 33283730630 reded `db-estate` on `fetch-base-main` (`.github/actions/fetch-base-main`):
`git fetch --no-tags --depth=1 origin main:refs/remotes/origin/main` was rejected
non-fast-forward. Both call sites (`lint`, `db-estate`) checkout with `fetch-depth: 0`, so
the remote-tracking ref for main already exists locally, fully-historied, from job start; this
step's own fetch is a *separate*, shallow (`--depth=1`) re-fetch of just the tip, done later
in the job to pick up any main-tip movement since checkout. When another PR merges into
`main` while a long self-hosted job (the `db-estate` suite in particular) is still running,
that later shallow fetch's ref update is fast-forward-only by default and git refuses it —
the step's `shell: bash -e {0}` then dies on the non-zero exit, failing the whole job for a
reason that has nothing to do with the PR's own content. **Fix:** force the refspec
(`+main:refs/remotes/origin/main`) — safe because this ref is read-only base material for
the append-only freeze-lint/migration-history comparisons, never merged into or pushed from,
so there is no correctness reason to require a "clean" fast-forward here; we want the
freshest remote `main` for the comparison regardless of local ancestry shape. No selftest
exists for this composite action (both usages are inline in `ci.yml`); the fix is proven by
reasoned diff, not a rig test — there is no database or migration surface here. **Standing
practice, unchanged:** avoid merging into `main` mid-sweep where practical; the forced ref
is the structural fix for when it happens anyway.
