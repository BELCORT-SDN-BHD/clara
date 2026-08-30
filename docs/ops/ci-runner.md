# The self-hosted CI runner (owner-ruled 2026-08-11)

**What this is.** The SAME GitHub Actions CI — same workflows, same binding green-check
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
- **ci.yml** pins every job `runs-on: [self-hosted, linux, clara]`. An OFFLINE runner
  makes jobs QUEUE visibly (never silently pass); bring the runner back and they resume.

## Security posture (read before changing anything)

- **PRIVATE-REPO ONLY.** A self-hosted runner on a public repo executes fork PRs' code
  on our machine. **If this repository is ever made public, DECOMMISSION the runner
  FIRST** (`config.sh remove`), then flip visibility. This is a hard order of operations.
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
`refs/remotes/origin/main` already exists locally, fully-historied, from job start; this
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
