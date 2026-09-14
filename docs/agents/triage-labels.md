# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Repo-specific labels beyond the five roles

| Label | Meaning |
| --- | --- |
| `awaiting-release` | Merged to `main`; hosted release and evidence pending. A release session removes it and closes the ticket once hosted evidence is recorded on the ticket (precedent: #621, #628, #692, #718, #720, #732). |
| `wayfinder:map`, `wayfinder:research`, `wayfinder:grilling`, `wayfinder:prototype`, `wayfinder:task` | The `/wayfinder` map and its ticket kinds (see `issue-tracker.md` § Wayfinding operations). |
| `bug`, `enhancement`, `documentation` | GitHub's defaults, used as plain classifiers alongside the triage role. |
| `lane-1` … `lane-3` | Parallel implementation lanes of the 2026-09-12 plan (historical). |
