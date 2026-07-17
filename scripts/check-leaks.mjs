#!/usr/bin/env node
// Leak-scan gate — fails the build if a credential looks committed.
// Scans git-tracked files only (so gitignored .env never even reaches here)
// for high-signal credential shapes. Deliberately conservative: it flags
// embedded credentials, private keys, and well-known token formats, and
// treats obvious placeholders (PASSWORD, YOUR_*, <...>, ${...}, xxxx) as safe.
//
// This is the CI "no credential committed" gate; it complements the repo's
// agentlint PreToolUse hook (which stops leaks before a write).
//
// Token prefixes below are assembled from fragments on purpose, so this
// scanner never matches its own source.
//
// No dependencies — Node built-ins only.

import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const REPO_ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf",
  ".zip", ".gz", ".woff", ".woff2", ".ttf", ".eot", ".wasm",
]);
const MAX_BYTES = 512 * 1024;

// Files allowed to contain example/placeholder connection shapes.
const ALLOW_PLACEHOLDER_FILES = new Set([".env.example"]);

const PLACEHOLDER = /(YOUR[_-]|PROJECT_REF|EXAMPLE|PLACEHOLDER|CHANGE[_-]?ME|\bpassword\b|\buser\b|\bhost\b|xxxx|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\})/i;

// scheme://user:secret@host — built so the scanner never self-matches.
// Captures: [1]=scheme [2]=user [3]=secret [4]=host.
const DSN = new RegExp("([a-z][a-z0-9+.-]*):" + "//" + "([^\\s:/@]+):([^\\s:/@]{3,})@([^\\s:/@]+)", "i");
// Localhost / dev-default hosts are never a real leak.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

// Token prefixes assembled from fragments (avoid literal secret prefixes here).
const AWS_KEY = new RegExp("\\b" + "AK" + "IA" + "[0-9A-Z]{16}\\b");
const GH_TOKEN = new RegExp("\\b" + "gh" + "[pousr]" + "_[0-9A-Za-z]{36}\\b");
const GH_PAT = new RegExp("\\b" + "github" + "_" + "pat_" + "[0-9A-Za-z_]{60,}\\b");
const SLACK = new RegExp("\\b" + "xox" + "[baprs]-[0-9A-Za-z-]{10,}\\b");
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/;
const GENERIC = /(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][0-9A-Za-z/+_-]{24,}["']/i;

const RULES = [
  { id: "embedded-credential", test: (line) => {
      const m = DSN.exec(line);
      if (!m) return false;
      const [, , user, secret, host] = m;
      if (LOCAL_HOSTS.has(host.toLowerCase())) return false; // dev-default localhost DSN
      if (user === secret) return false;                     // self-equal dev creds (e.g. world:world)
      if (PLACEHOLDER.test(m[0])) return false;              // obvious placeholders
      return true;
    } },
  { id: "private-key", re: PRIVATE_KEY },
  { id: "aws-access-key", re: AWS_KEY },
  { id: "github-token", re: GH_TOKEN },
  { id: "github-pat", re: GH_PAT },
  { id: "slack-token", re: SLACK },
  { id: "generic-key-assignment", re: GENERIC },
];

function trackedFiles() {
  // Tracked (--cached) + new-but-not-ignored (--others --exclude-standard), so a
  // secret is caught before it is even committed, while .gitignore'd files
  // (e.g. .env) are never scanned. De-duplicated.
  const out = execSync("git ls-files --cached --others --exclude-standard", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(out)];
}

function baseName(rel) {
  const parts = rel.split("/");
  return parts[parts.length - 1] ?? rel;
}

function main() {
  const findings = [];
  for (const rel of trackedFiles()) {
    if (BINARY_EXT.has(extname(rel).toLowerCase())) continue;
    const abs = join(REPO_ROOT, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > MAX_BYTES) continue;
    const allowPlaceholder = ALLOW_PLACEHOLDER_FILES.has(baseName(rel));
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        const hit = rule.test ? rule.test(line) : rule.re.test(line);
        if (!hit) continue;
        if (allowPlaceholder && rule.id === "embedded-credential") continue;
        findings.push({ rel, line: i + 1, rule: rule.id, text: line.trim().slice(0, 120) });
      }
    });
  }

  if (findings.length > 0) {
    console.error("leak-scan: FAIL — possible committed credential(s):\n");
    for (const f of findings) console.error(`  ${f.rel}:${f.line}  [${f.rule}]  ${f.text}`);
    console.error(`\n${findings.length} finding(s). Remove it, rotate it, and keep credentials in the gitignored .env (never tracked).`);
    return 1;
  }
  console.log("leak-scan: OK — no credentials detected in tracked or staged files.");
  return 0;
}

process.exit(main());
