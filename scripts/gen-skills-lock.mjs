#!/usr/bin/env node
// Skills provenance lock (finding 12). Records each vendored skill directory under
// .claude/skills/ with a content hash, so an unexpected change to the vendored
// engineering-skills toolchain shows up as a diff in skills-lock.json. The old
// repo had a skills-lock.json; the greenfield snapshot lost it — this restores it.
//
// Regenerate after intentionally adding/updating a vendored skill:
//   node scripts/gen-skills-lock.mjs          # rewrite skills-lock.json
//   node scripts/gen-skills-lock.mjs --check   # verify (exit 1 if drifted)
//
// Hashes are over the LF-normalised content of the tracked files in each skill
// dir (so Windows/Linux line endings don't change the hash). No dependencies —
// Node built-ins only.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const REPO_ROOT = git(["rev-parse", "--show-toplevel"]).trim();
const SKILLS_REL = ".claude/skills";
const LOCK_REL = "skills-lock.json";
const LOCK_PATH = join(REPO_ROOT, LOCK_REL);

/** Tracked files under .claude/skills, grouped by top-level skill directory. */
function skillGroups() {
  const files = git(["ls-files", "--", SKILLS_REL])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const groups = new Map(); // skillName -> [relPaths]
  for (const rel of files) {
    const parts = rel.split("/"); // .claude/skills/<name>/...
    if (parts.length < 4) continue; // skip a stray file directly under skills/
    const name = parts[2];
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(rel);
  }
  return groups;
}

function computeLock() {
  const groups = skillGroups();
  const skills = {};
  for (const name of [...groups.keys()].sort()) {
    const rels = groups.get(name).sort();
    const h = createHash("sha256");
    for (const rel of rels) {
      h.update(rel + "\0");
      h.update(readFileSync(join(REPO_ROOT, rel), "utf8").replace(/\r\n/g, "\n"));
      h.update("\0");
    }
    skills[name] = { sha256: h.digest("hex"), files: rels.length };
  }
  return {
    _note:
      "Provenance lock for vendored engineering skills under .claude/skills/. Regenerate with `node scripts/gen-skills-lock.mjs` after intentionally adding/updating a skill; `--check` verifies it is current.",
    version: 1,
    skills,
  };
}

const serialized = JSON.stringify(computeLock(), null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(LOCK_PATH) ? readFileSync(LOCK_PATH, "utf8") : "";
  if (current !== serialized) {
    console.error(`skills-lock: DRIFT — ${LOCK_REL} is out of date. Run: node scripts/gen-skills-lock.mjs`);
    process.exit(1);
  }
  console.log(`skills-lock: OK — ${LOCK_REL} is current`);
  process.exit(0);
}

writeFileSync(LOCK_PATH, serialized, "utf8");
const count = Object.keys(JSON.parse(serialized).skills).length;
console.log(`skills-lock: wrote ${LOCK_REL} — ${count} skill(s)`);
