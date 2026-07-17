#!/usr/bin/env node
// Leak-scan gate — fails the build if a credential looks committed.
// Scans git-tracked (+ staged-but-not-ignored) files only, so a gitignored .env
// never reaches here, for high-signal credential shapes: embedded DSN
// credentials, private keys, and well-known token formats.
//
// LIGHTWEIGHT GATE — NOT a substitute for a maintained scanner. This is a fast,
// dependency-free first line; the authoritative second layer is gitleaks, run in
// CI (.github/workflows/ci.yml) with its maintained rule set. Keep both.
//
// Exemptions are NARROW (finding 7): a DSN is only exempt when its SECRET is an
// explicit placeholder token (YOUR_*, REPLACE_ME, <...>, ${...}, xxxx, …) or the
// match is the exact WDK dev-default fixed string `world:world@localhost`. There
// is NO blanket localhost exemption, NO username==password exemption, and NO
// per-file exemption — a real credential is flagged wherever it appears.
//
// Matched secrets are ALWAYS REDACTED in output — the credential line is never
// printed verbatim to CI logs.
//
// Token prefixes below are assembled from fragments on purpose, so this scanner
// never matches its own source. No dependencies — Node built-ins only.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts });
}

const REPO_ROOT = git(["rev-parse", "--show-toplevel"]).trim();

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf",
  ".zip", ".gz", ".woff", ".woff2", ".ttf", ".eot", ".wasm",
]);
const MAX_BYTES = 512 * 1024;

// A secret is exempt ONLY if the WHOLE captured value is an explicit placeholder.
const SECRET_PLACEHOLDER =
  /^(?:YOUR[_-].*|REPLACE[_-]?ME|CHANGE[_-]?ME|PROJECT_REF|EXAMPLE|PLACEHOLDER|SECRET|PASSWORD|<[^>]+>|\$\{[^}]+\}|\{\{[^}]+\}\}|x{4,})$/i;

// scheme://user:secret@host — built so the scanner never self-matches.
// Captures: [1]=scheme [2]=user [3]=secret [4]=host.
const DSN = new RegExp("([a-z][a-z0-9+.-]*):" + "//" + "([^\\s:/@]+):([^\\s:/@]{3,})@([^\\s:/@]+)", "i");

// Token prefixes assembled from fragments (avoid literal secret prefixes here).
const AWS_KEY = new RegExp("\\b" + "AK" + "IA" + "[0-9A-Z]{16}\\b");
const GH_TOKEN = new RegExp("\\b" + "gh" + "[pousr]" + "_[0-9A-Za-z]{36}\\b");
const GH_PAT = new RegExp("\\b" + "github" + "_" + "pat_" + "[0-9A-Za-z_]{60,}\\b");
const SLACK = new RegExp("\\b" + "xox" + "[baprs]-[0-9A-Za-z-]{10,}\\b");
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/;
const GENERIC = /(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][0-9A-Za-z/+_-]{24,}["']/i;
// Supabase personal/management access token: sbp_ + 40 hex (prefix from fragments).
const SUPABASE_TOKEN = new RegExp("\\b" + "sb" + "p_" + "[0-9a-f]{40}\\b");
// JWT — three base64url segments (e.g. a Supabase anon/service key). "eyJ" is the
// base64 of a JSON header opener; assembled so this scanner never self-matches.
const JWT = new RegExp("\\b" + "ey" + "J" + "[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\b");

const RULES = [
  {
    id: "embedded-credential",
    test: (line) => {
      const m = DSN.exec(line);
      if (!m) return false;
      const [, , user, secret, host] = m;
      // The ONLY host-based exemption: the exact WDK dev-default fixed string.
      if (user === "world" && secret === "world" && host.toLowerCase() === "localhost") return false;
      if (SECRET_PLACEHOLDER.test(secret)) return false; // explicit placeholder secret
      return true;
    },
  },
  { id: "private-key", re: PRIVATE_KEY },
  { id: "aws-access-key", re: AWS_KEY },
  { id: "github-token", re: GH_TOKEN },
  { id: "github-pat", re: GH_PAT },
  { id: "slack-token", re: SLACK },
  { id: "supabase-access-token", re: SUPABASE_TOKEN },
  { id: "jwt", re: JWT },
  { id: "generic-key-assignment", re: GENERIC },
];

/** Redact the sensitive part of a line so it is safe to print. */
function redact(line, ruleId) {
  let out = line;
  if (ruleId === "embedded-credential") {
    out = out.replace(DSN, (_full, scheme, user, _secret, host) => `${scheme}://${user}:***REDACTED***@${host}`);
  } else {
    const rule = RULES.find((r) => r.id === ruleId);
    if (rule && rule.re) out = out.replace(new RegExp(rule.re.source, rule.re.flags.replace("g", "") + "g"), `[REDACTED:${ruleId}]`);
  }
  return out.trim().slice(0, 160);
}

function trackedFiles() {
  // Tracked (--cached) + new-but-not-ignored (--others --exclude-standard), so a
  // secret is caught before it is even committed, while .gitignore'd files
  // (e.g. .env) are never scanned. De-duplicated.
  const out = git(["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(out)];
}

function main() {
  const findings = [];
  for (const rel of trackedFiles()) {
    if (BINARY_EXT.has(extname(rel).toLowerCase())) continue;
    const abs = join(REPO_ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile() || st.size > MAX_BYTES) continue;
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        const hit = rule.test ? rule.test(line) : rule.re.test(line);
        if (!hit) continue;
        findings.push({ rel, line: i + 1, rule: rule.id, redacted: redact(line, rule.id) });
      }
    });
  }

  if (findings.length > 0) {
    console.error("leak-scan: FAIL — possible committed credential(s) [secrets redacted]:\n");
    for (const f of findings) console.error(`  ${f.rel}:${f.line}  [${f.rule}]  ${f.redacted}`);
    console.error(
      `\n${findings.length} finding(s). Remove it, ROTATE it (assume it is compromised once written), and keep credentials in the gitignored .env (never tracked). A false positive on a genuine placeholder means the value isn't an explicit placeholder token — make it one.`,
    );
    return 1;
  }
  console.log("leak-scan: OK — no credentials detected in tracked or staged files (backed by gitleaks in CI).");
  return 0;
}

process.exit(main());
