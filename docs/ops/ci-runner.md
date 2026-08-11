# The self-hosted CI runner (owner-ruled 2026-08-11)

**What this is.** The SAME GitHub Actions CI — same workflows, same binding green-check
gate on every PR (the engineering doctrine is unchanged) — executing on our own hardware
instead of GitHub-hosted runners, because the org's free-tier minutes exhausted and the
merge queue froze. Runner minutes on self-hosted are free and unlimited for private repos.

## Topology

- **Host:** the owner's Windows 11 machine → **WSL2 Ubuntu** distro (`Ubuntu`).
- **Inside WSL:** Docker Engine (docker-ce; systemd-managed) — required for the
  `postgres:17` service containers CI declares — plus the GitHub Actions runner under
  `~/actions-runner`, registered at REPO level to `BELCORT-SDN-BHD/clara` with labels
  **`self-hosted, linux, clara`**.
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

```powershell
# Start (after reboot — WSL does not autostart):
wsl -d Ubuntu -u runner -- bash -lc 'cd ~/actions-runner && nohup ./run.sh > runner.log 2>&1 &'
# Status: repo → Settings → Actions → Runners (Idle = healthy), or:
wsl -d Ubuntu -u runner -- bash -lc 'cd ~/actions-runner && tail -5 runner.log'
# Stop:
wsl -d Ubuntu -u runner -- bash -lc 'pkill -f Runner.Listener'
```

A Windows Scheduled Task **"clara-ci-runner"** (logon trigger) runs the start command so
the runner survives reboots; if jobs sit queued, check the task ran and Docker is up
(`wsl -d Ubuntu -- docker info`).

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
