// #1127 — the weekly scheduled CI sweep's own failure must be VISIBLE somewhere other than a
// raw run log. This wave's own evidence is that it was not: while investigating this wave's CI
// reds, it became clear the schedule had evidently not been green for some time, because two
// unrelated changes elsewhere in the codebase (a test-corpus retarget and a census widening) each
// moved a number `db-slice-frontiers` depends on, and neither was caught or acted on for a
// stretch of time — which only happens if nobody is regularly looking at the scheduled run's
// result (originating ticket #1041, follow-up 3 of wave4-lane07-ticket1041.md; ruled on
// 2026-09-23 in SWEEP-PLAN.md: "wire the weekly scheduled CI dispatch's failure to a visible
// notification").
//
// THE CHANNEL. No notification mechanism (Slack, email, a dedicated webhook) exists anywhere in
// this repo's `.github/` today — a repo-wide grep for `slack|webhook|notify|github-script` inside
// `.github/` turns up nothing but a comment mentioning Stripe's OWN webhook table. The ticket's
// own recommendation names a GitHub issue comment as the fallback channel, so that is what ships:
// a comment on the standing tracking issue itself (#1127), which turns the issue that asked the
// question into the place a reader would already look for the answer.
//
// THE SCOPE IS THE SCHEDULE, NOT EVERY RED. `workflow_dispatch` also runs the sweep-only legs
// (`ci.yml`'s own comment above `ci:` calls both "sweep-only"), but a human just triggered that
// run by hand and is already watching it; a `pull_request`/`push` failure is already visible to
// its author on the PR itself. Only the unattended weekly run needed a channel it didn't have.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..", "..", "..");
const CI_WORKFLOW = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

/** One top-level job's own block, cut out of the workflow by its `  <key>:` line (2-space
 *  indent — the level `jobs:`'s own children sit at, one level above every step or `needs` entry
 *  inside a job), so a cell about job A cannot be satisfied by something job B's block contains. */
function jobBlock(yaml, jobKey) {
  const re = new RegExp(`\\n {2}${jobKey}:\\n([\\s\\S]*?)(?=\\n {2}[A-Za-z][\\w-]*:\\n|$)`);
  const m = re.exec(yaml);
  assert.ok(m, `.github/workflows/ci.yml has no top-level job named "${jobKey}"`);
  return m[1];
}

test("p1127.notify.exists ci.yml declares a job that reacts to the weekly sweep's own result", () => {
  const yaml = readFileSync(CI_WORKFLOW, "utf8");
  assert.match(yaml, /\n {2}notify-schedule-failure:\n/,
    "no notify-schedule-failure job — the weekly schedule's failure still lands nowhere but a raw run log (#1127)");
});

test("p1127.notify.needs the notify job depends on the terminal `ci` gate alone, never a leg directly", () => {
  const yaml = readFileSync(CI_WORKFLOW, "utf8");
  const job = jobBlock(yaml, "notify-schedule-failure");
  assert.match(job, /^ {4}needs: ci$/m,
    "the notify job must depend on `ci` — the ONE job that already computes \"every leg green or lawfully "
    + "skipped\" — so its verdict can never drift from the terminal gate's own; re-deriving pass/fail from an "
    + "individual leg here would be a second, uncoordinated copy of what `ci` already decides");
});

test("p1127.notify.scope the notify job fires on a failed SCHEDULE run only, never on workflow_dispatch, pull_request or push", () => {
  const yaml = readFileSync(CI_WORKFLOW, "utf8");
  const job = jobBlock(yaml, "notify-schedule-failure");
  const ifLine = /^ {4}if:\s*(.+)$/m.exec(job);
  assert.ok(ifLine, "the notify job carries no `if:` condition at all — it would fire on every event, "
    + "including a plain pull_request run whose author already sees the failure on the PR");
  const cond = ifLine[1];
  assert.match(cond, /always\(\)/,
    "the condition must open with always() — `needs: ci` alone would skip this job whenever ci itself failed, "
    + "which is exactly the case this job exists to react to");
  assert.match(cond, /github\.event_name == 'schedule'/,
    "the condition must scope to the schedule event by name — a human running workflow_dispatch is already "
    + "watching that run, and a pull_request/push failure is already visible to its author on the PR");
  assert.doesNotMatch(cond, /workflow_dispatch/,
    "the condition names workflow_dispatch — the ticket's own scope is the UNATTENDED weekly run, not a run a "
    + "human just triggered by hand");
  assert.match(cond, /needs\.ci\.result != 'success'/,
    "the condition must compare needs.ci.result, not re-derive success/failure some other way");
});

test("p1127.notify.least-privilege the notify job requests issues:write for itself, and the workflow grants nothing blanket", () => {
  const yaml = readFileSync(CI_WORKFLOW, "utf8");
  assert.doesNotMatch(yaml, /^permissions:\n/m,
    "ci.yml now carries a top-level `permissions:` block — every other job in this workflow relies on it NOT "
    + "existing (the default token scope), so widening it here would silently change every other job's grant too");
  const job = jobBlock(yaml, "notify-schedule-failure");
  assert.match(job, /\n {4}permissions:\n {6}issues: write\n/,
    "the notify job must declare its OWN job-level `permissions: issues: write` — with no workflow-level grant, "
    + "posting a comment needs that scope, and declaring it only on this job keeps every other job at its "
    + "current (lesser) default rather than widening the whole workflow's token");
});

test("p1127.notify.channel the notify job posts a GitHub issue comment naming the run that failed, not just that something did", () => {
  const yaml = readFileSync(CI_WORKFLOW, "utf8");
  const job = jobBlock(yaml, "notify-schedule-failure");
  assert.match(job, /gh issue comment 1127\b/,
    "the notify job must comment on the standing tracking issue (#1127) through `gh issue comment` — the "
    + "channel the ticket's own recommendation names, since no Slack/email/webhook channel exists anywhere "
    + "in .github/ today");
  assert.match(job, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
    "gh issue comment authenticates off the GH_TOKEN environment variable inside a workflow step "
    + "(docs.github.com, \"Using GitHub CLI in workflows\") — without it the step has no token to call the API with");
  assert.match(job, /actions\/runs\/\$\{\{\s*github\.run_id\s*\}\}/,
    "the comment must carry a link back to the SPECIFIC run (github.run_id) — a comment that only says "
    + "\"the weekly sweep failed\" with no way to open the run is not meaningfully more visible than the raw log "
    + "it replaces");
  assert.match(job, /needs\.ci\.result/,
    "the comment body must read needs.ci.result (skipped/failure/cancelled), not a hardcoded word — a hardcoded "
    + "\"failed\" would misreport a cancelled run as a genuine gate failure");
});

test("p1127.notify.no-cycle the terminal `ci` gate's own needs list is untouched by the new job", () => {
  const yaml = readFileSync(CI_WORKFLOW, "utf8");
  const ciJob = jobBlock(yaml, "ci");
  assert.doesNotMatch(ciJob, /notify-schedule-failure/,
    "`ci` must not depend on notify-schedule-failure — that job depends on ci's own result, so the reverse edge "
    + "would be a needs-cycle GitHub Actions refuses to schedule");
  const needsBlock = /needs:\n((?:\s+- .+\n)+)/.exec(ciJob);
  assert.ok(needsBlock, "ci job's own `needs:` list moved shape entirely");
  const legs = needsBlock[1].split("\n").map((l) => l.trim()).filter(Boolean);
  assert.equal(legs.length, 10,
    `ci's own needs list now has ${legs.length} entries, expected the same 10 legs as before #1127 — this `
    + "ticket adds a job that reacts to ci, it does not add a new leg ci itself waits on");
});
