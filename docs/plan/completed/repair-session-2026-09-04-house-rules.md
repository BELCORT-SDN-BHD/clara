# Repair session 2026-09-04 — lane house rules

The common house rules every build lane of the 2026-09-04→06 repair session inherited, plus the
migration-renumber tool the lead ran at merge time — a rename + basename-reference rewrite that
never touches a migration's own bytes, so reviewed barrier hashes hold. Filed here byte-verbatim
from the session scratchpad (historical labels: lane-house-rules.md, renumber-migrations.mjs). Every order in
[`repair-session-2026-09-04-orders.md`](repair-session-2026-09-04-orders.md) inherits this file.
Filed under `completed/` as a closed record of what was issued; the live queue and its order are
`PROGRESS.md`'s Backlog, which governs.

<!-- begin verbatim: lane-house-rules.md · md5 5f187db1df03c84dec433cfbc79093cb -->
# Common house rules for every build lane (paste into each dispatch)

You are a BUILD lane in the Clara monorepo (`C:\Users\zhant\Desktop\clara-rebuild`, `main` = the
current origin/main). Work ONLY inside your own worktree, which you create yourself:

```
git -C C:/Users/zhant/Desktop/clara-rebuild fetch origin main
git -C C:/Users/zhant/Desktop/clara-rebuild worktree add C:/Users/zhant/Desktop/clara-rebuild/.claude/worktrees/<LANE> -b <BRANCH> origin/main
cd C:/Users/zhant/Desktop/clara-rebuild/.claude/worktrees/<LANE>
pnpm install --frozen-lockfile --offline   # a REAL install from the pnpm store; NEVER a junction/symlink to the main checkout's node_modules
```

Never touch the main checkout's working tree. Never remove a worktree (junction-unsafe host; the
orchestrator cleans up). Every Bash call `cd`s into your worktree first (the cwd does not persist).
Print `git branch --show-current` inside the commit command.

## The laws that bind a code change here
- **The DB owns every number; the UI never invents a number, verb, receipt or link.** A missing
  backend verb renders an honest `NotBuiltNote` (`apps/web/components/common/not-built-note.tsx`),
  never a fake control. A DoorRefusal renders VERBATIM (code + message), is never retried, and every
  caller RE-READS after every act — no optimistic UI, ever.
- Reads ride `apps/web/lib/read.ts`'s `getRows` against RLS-scoped views; governed writes ride
  `apps/web/lib/doors.ts`'s `callDoor`. The session token comes only from `lib/session-accessor.ts`.
- **Every string routes through next-intl** (`apps/web/messages/en.json`); semantic Tailwind tokens
  only (no raw hex, no palette classes, no `dark:`); Base UI / shadcn primitives in
  `apps/web/components/ui` (add new ones with `pnpm dlx shadcn@latest add <name>` from `apps/web/`,
  strip `dark:` classes, keep `style: base-nova`). Respect the token contract in
  `apps/web/app/globals.css` (its own notes) and `apps/web/README.md` "Token provenance". Motion:
  the `--duration-*` scale with reduced-motion arms — no ad-hoc durations.
- **Tests:** every new `*.test.ts(x)` under `apps/web` is enumerated in `apps/web/test/manifest.txt`
  (the manifest gate reds otherwise). Inside an OPEN dialog drive buttons with `clickButton` from
  `apps/web/test/hookHarness.ts` (fireEvent no-ops there). A click test asserts a DISCRIMINATING
  post-condition (true only after the click). Mutant panel on every fold: mutate the code, show the
  test go RED, restore from a buffer you captured (never `git checkout --`).
- **Browser leg (裁-86):** every frontend train adds/extends a Playwright spec under `apps/web/e2e/`
  walking its journey on the BUILT app (`pnpm --filter @clara/web e2e` runs build + serve + specs;
  ports overridable via `CLARA_E2E_NEXT_PORT`/`CLARA_E2E_RUNTIME_PORT` — pick the pair named in your
  order; find the OWNING PID before calling a port busy, never a name-kill). Run it unpiped, teed to
  a file. Axe (WCAG A/AA) on every face touched.
- **Verify before you claim:** `pnpm --filter @clara/web typecheck`, `pnpm --filter @clara/web lint`,
  `pnpm --filter @clara/web test`, then the e2e leg. Quote the tail of each run in your report; a
  verdict is read from the full output, never through `| tail`/`| grep`.
- **Absence is not evidence; spelling is not identity.** Cite `file:line` for every claim.
- **Frozen workflow bodies** (`packages/runtime/workflows`): a behavioural change is a NEW `_vN`
  export + registry repoint (`.claude/rules/runtime-workflows.md`), then `pnpm freeze:update` and
  `node scripts/check-frozen-workflows.mjs --compare-base origin/main`; grep the built bundle.
- **Migrations** (`packages/db/migrations`): author as `UNNUMBERED_<name>.sql`, rig-validate on a
  throwaway Postgres (docker runs in WSL: `wsl -d Ubuntu -- docker …`), number is claimed at MERGE
  time (`.claude/rules/db-migrations.md`); prestate measurements + tail census; forced RLS on new
  tables; a new `clara_authenticated` door names its frontend home in the PR body.
- **A file-scanning gate SEES an `UNNUMBERED_*` migration even though the chain skips it** (learned on #551): before
  opening a DB PR run `pnpm --filter @clara/web test` (the `firm-scope-db-pins` successor census refuses an unreviewed
  dynamic-SQL splice — add the reviewed barrier entry with its sha) and `packages/runtime`'s drift guards (a tail that
  seeds a roster the runtime mirrors, e.g. `bank_institutions`, reads as a second seeding migration — use the seeded
  rows in fixtures, never a new seed), and `apps/web/lib/firm/receipt-kinds.test.ts` (learned on #552: it greps every
  migration for each receipt shim's definition and reds when a shim declared UNWIRED is defined by your file — if your
  migration wires a shim, move its WIRED state AND the Activity page's honest-coverage copy with it). Merge main
  before your final push: a gate that landed on main after you branched is a merge surface. And NEVER `git add -A` in a DB worktree: the temporary numbered rig copies
  (`0165_*_rig.sql`…) must be deleted before staging or they claim numbers on merge.
- **After merging `origin/main` into your branch, re-run `pnpm install --frozen-lockfile --offline` BEFORE any suite** if
  `pnpm-lock.yaml` changed in the merge (learned on #551's renumber: #555 added `pdfjs-dist`; the stale node_modules
  red-ed one cell with `Cannot find module` — an install artifact that reads exactly like a code defect).
- **A backgrounded verifier is finished when its OUTPUT FILE says so — never when a wake-up arrives.** Twice on
  2026-09-05 a lane ended its turn "waiting to be woken" by a background task and stayed silent for hours (11 h and
  15 min); the completion notification does NOT wake an idle lane on its own — it is delivered with the next message.
  Rule: never end a turn with an unread result and no reader you control; read the teed file on your own clock
  (poll it in the foreground with a deadline), and send the lead a one-line ping at launch and at 10 minutes.
- **Never commit a credential; DSNs from the environment only.** Never print a secret.
- **Docs you touch:** the 500-line ceiling is a write-blocking hook — `wc -l` before adding lines.

## Delivery
- Small scoped PR referencing `#541` where the item comes from it (`Refs #541 CB-AE2E-0NN`) and the
  handover id (`H-NN` / `C-NN`) in the title or body. `git add` only your files; commit message ends
  with these two trailer lines, exactly:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01TwznLpQduXtQ72aUQpEbhb` (the session URL CHANGED on 2026-09-05
  after the owner's re-login — use this one from now on); push; `gh pr create --base main`
  with a body that lists: what changed, the tests + e2e spec added, the verify commands and their
  tails, the mutant panel, what you did NOT do and why, and `Lane: native <model> xhigh (裁-190)`.
  End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` followed by a blank line and
  `https://claude.ai/code/session_01TwznLpQduXtQ72aUQpEbhb`.
- Report back (your final message is the report): PR number + URL, files touched, the verify tails,
  open questions. Do not merge.
<!-- end verbatim: lane-house-rules.md -->

## The renumber tool (lead-run at merge, 2026-09-05)

Renames `UNNUMBERED_*` migration files to their claimed numbers and rewrites basename references
in test/doc files that cite them — never touching a migration's own bytes, so a reviewed barrier
hash still holds after the rename. Usage (see the tool's own header comment for the exact CLI
shape): `node renumber-migrations.mjs <worktree> <first-number> <order>`, where `<order>` is
either a regex with a numbered capture group (`'^UNNUMBERED_dba(\d+)_'`) or a comma-separated list
of basename substrings naming the explicit order. It refuses a collision with an already-claimed
number and prints the mapping plus every file it rewrote.

<!-- begin verbatim: renumber-migrations.mjs · md5 9de722d59ef7c28a7ce0694bb16981be -->
```js
// Renumber UNNUMBERED_* migrations at MERGE time (the lead's act; .claude/rules/db-migrations.md).
// Usage: node renumber-migrations.mjs <worktree> <first-number> <stem-order-regex> [<barrier-test-path>]
//   e.g. node renumber-migrations.mjs C:/.../dba-close-gates 165 '^UNNUMBERED_dba(\d+)_'
//   e.g. node renumber-migrations.mjs C:/.../dbb-reads 174 'web_reads|stmt_witness'   (explicit order list form below)
// Renames files in place (git sees a rename), rewrites every reference to the old basename in the
// barrier map test + any .mjs/.ts/.md under packages/db and apps/web/tests, and prints the mapping.
// It never touches file CONTENT beyond the basename references (content hashes stay valid).
import fs from "node:fs";
import path from "node:path";

const [worktree, firstArg, orderArg] = process.argv.slice(2);
if (!worktree || !firstArg || !orderArg) {
  console.error("usage: node renumber-migrations.mjs <worktree> <first-number> <order: regex-with-index-group | comma-list-of-substrings>");
  process.exit(2);
}
const migDir = path.join(worktree, "packages", "db", "migrations");
const files = fs.readdirSync(migDir).filter((f) => f.startsWith("UNNUMBERED_") && f.endsWith(".sql"));
if (files.length === 0) { console.error("no UNNUMBERED_* files in " + migDir); process.exit(1); }

let ordered;
if (orderArg.includes(",")) {
  const keys = orderArg.split(",").map((s) => s.trim());
  ordered = keys.map((k) => {
    const hits = files.filter((f) => f.includes(k));
    if (hits.length !== 1) { console.error(`order key '${k}' matches ${hits.length} files: ${hits.join(", ")}`); process.exit(1); }
    return hits[0];
  });
  const missed = files.filter((f) => !ordered.includes(f));
  if (missed.length) { console.error("unordered UNNUMBERED files present: " + missed.join(", ")); process.exit(1); }
} else {
  const re = new RegExp(orderArg);
  ordered = files
    .map((f) => { const m = f.match(re); if (!m) { console.error("file does not match order regex: " + f); process.exit(1); } return [Number(m[1]), f]; })
    .sort((a, b) => a[0] - b[0])
    .map(([, f]) => f);
}

const first = Number(firstArg);
const mapping = ordered.map((f, i) => {
  const n = String(first + i).padStart(4, "0");
  const rest = f.replace(/^UNNUMBERED_(dba\d+_|dbb\d+_)?/, "");
  return [f, `${n}_${rest}`];
});

// Refuse a collision with an existing numbered file.
for (const [, to] of mapping) {
  const num = to.slice(0, 4);
  const clash = fs.readdirSync(migDir).find((f) => f.startsWith(num + "_") && f !== to);
  if (clash) { console.error(`number ${num} already claimed by ${clash}`); process.exit(1); }
}

// Rename.
for (const [from, to] of mapping) fs.renameSync(path.join(migDir, from), path.join(migDir, to));

// Rewrite basename references (barrier map keys, cohort rosters, docs) — text only, exact old basename.
const roots = [path.join(worktree, "apps", "web", "tests"), path.join(worktree, "apps", "web", "test"), path.join(worktree, "packages", "db"), path.join(worktree, "packages", "runtime", "tests"), path.join(worktree, "docs")];
const exts = new Set([".ts", ".tsx", ".mjs", ".js", ".md", ".json", ".sql", ".yml"]);
const touched = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { walk(p); continue; }
    if (!exts.has(path.extname(ent.name))) continue;
    // NEVER rewrite a migration's own bytes: the reviewed-barrier map hashes CONTENT, and a
    // basename mentioned inside a migration's comment is historical, not a reference to chase
    // (learned on #552: the tool rewrote a comment inside 0175 and moved its reviewed sha256).
    if (p.includes(path.join("packages", "db", "migrations")) && ent.name.endsWith(".sql")) continue;
    let text = fs.readFileSync(p, "utf8");
    let changed = false;
    for (const [from, to] of mapping) {
      const stemFrom = from.replace(/\.sql$/, ""), stemTo = to.replace(/\.sql$/, "");
      if (text.includes(from)) { text = text.split(from).join(to); changed = true; }
      if (text.includes(stemFrom)) { text = text.split(stemFrom).join(stemTo); changed = true; }
    }
    if (changed) { fs.writeFileSync(p, text); touched.push(path.relative(worktree, p)); }
  }
}
for (const r of roots) walk(r);

console.log(JSON.stringify({ mapping: Object.fromEntries(mapping), referencesRewrittenIn: touched }, null, 1));
```
<!-- end verbatim: renumber-migrations.mjs -->
