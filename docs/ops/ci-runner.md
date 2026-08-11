# The self-hosted CI runner (owner-ruled 2026-08-11)

**What this is.** The SAME GitHub Actions CI — same workflows, same binding green-check
gate on every PR (the engineering doctrine is unchanged) — executing on our own hardware
instead of GitHub-hosted runners, because the org's free-tier minutes exhausted and the
merge queue froze. Runner minutes on self-hosted are free and unlimited for private repos.

## Topology

- **Host:** the owner's Windows 11 machine → **WSL2 Ubuntu** distro (`Ubuntu`).
- **Inside WSL:** Docker Engine (docker-ce; systemd-managed) — required for the
  `postgres:17` service containers CI declares — plus **TWO** GitHub Actions runner
  instances (`~/actions-runner` → `clara-wsl`, `~/actions-runner-2` → `clara-wsl-2`),
  both registered at REPO level to `BELCORT-SDN-BHD/clara` with labels
  **`self-hosted, linux, clara`** — two instances let the db-slice matrix run 2-wide.
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
