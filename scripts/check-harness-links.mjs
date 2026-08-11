#!/usr/bin/env node
// Harness-links gate (owner-ruled Q9-A) — every doc a session is told to read FIRST must
// actually point somewhere real, or the harness silently rots the moment a file moves.
//
// SCOPE: a pinned ENTRY_LIST of "read this first" docs (AGENTS.md, PROGRESS.md,
// docs/adr/README.md, docs/plan/index.md). Each is parsed for markdown links `[text](path)`
// AND backtick-quoted repo paths; every referenced path must exist on disk. Referenced `.md`
// files that live under docs/ are followed ONE hop (so an index file's own references are
// validated too — e.g. docs/plan/index.md pointing at wave-e-contract.md, and THAT file's own
// paths get checked), never further. External URLs, in-page anchors, and anything inside a
// fenced code block are ignored. docs/adr/ additionally gets a BIDIRECTIONAL check: every file
// actually on disk under docs/adr/ must be referenced by docs/adr/README.md's own index, not
// just the reverse.
//
// THE BACKTICK HEURISTIC (owner-ruled, "by heuristic"): a backtick span is a path CANDIDATE only
// when it contains "/" or ends in .md/.mjs/.sql/.ts/.json — this naturally excludes function
// names (`approve_entry(...)`), SQL, and bare ids, which is most of what backticks quote in this
// repo's prose. The few things that slip through the heuristic anyway (a git ref like
// `origin/main` has a "/" but is not a file) go in NON_PATH_ALLOWLIST below, by explicit,
// justified entry — never by loosening the heuristic itself (same shape as
// DYNAMIC_SQL_ALLOWLIST in wiki-lint-checks.mjs).
//
// STRICT=false TODAY (owner-ruled, dispatch brief for this lane). Three of the four entries
// (PROGRESS.md, docs/adr/README.md, docs/plan/index.md) are being authored by OTHER lanes of
// this same harness refactor in parallel and do not exist on disk yet in this branch — an
// absent entry file WARNS, it does not fail, so this branch stands on its own green. This does
// NOT soften anything else: a broken reference INSIDE a file that does exist (AGENTS.md, today)
// is always a hard failure regardless of STRICT. Flip STRICT to true at harness-refactor
// ASSEMBLY, once every entry above is actually on disk (comment stays as the marker to find).
//
// No dependencies — Node built-ins only.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const STRICT = false; // <-- FLIP TO true AT ASSEMBLY (see header) once all 4 entries exist.

export const ENTRY_LIST = Object.freeze([
  "AGENTS.md",
  "PROGRESS.md",
  "docs/adr/README.md",
  "docs/plan/index.md",
]);

// Known backtick spans that pass the path heuristic (slash or a path-like extension) but name
// something other than a repo file. Every entry needs a one-line reason — this list is a named
// exception, never a loosened rule.
export const NON_PATH_ALLOWLIST = new Set([
  "origin/main", // a git ref (CLAUDE.md, ci.yml, and Wave docs all say "never push origin/main" etc.), not a file
  "@workflow/world-postgres", // an npm package specifier (the WDK Postgres backend), not a file
  "firms/{firm_id}/…", // an API route TEMPLATE (ARCHITECTURE.md), placeholder segment + ellipsis
  "…/vision-alignment-audit-2026-07-27.md", // an elided path in prose (leading "…" = "somewhere under"), not literal
  "clara-rebuild/", // REBUILD-PLAN.md's own genesis note ("fresh repo, seeded from `clara-rebuild/`") — names this repo's own root by folder name, not a subpath of it
]);

// First path segments that mean "this is the FROZEN prior repo, not this tree" — CLAUDE.md's own
// header: "the frozen prior build and its `belcort/` doctrine are not carried over wholesale...
// The old `initial acc software skillmd` repo... are FROZEN read-only audit evidence." Citations
// into either are never resolvable here, by design, forever.
const EXTERNAL_PATH_PREFIXES = new Set(["belcort", "initial acc software skillmd"]);
function isKnownExternalPath(target) {
  if (target.startsWith("~")) return true; // the user's home dir (e.g. ~/.clara-tools/...) — never inside this repo, by design
  const firstSegment = target.replace(/^\.?\//, "").split("/")[0];
  return EXTERNAL_PATH_PREFIXES.has(firstSegment);
}

// A leading-slash backtick span with no further "/" and no recognised extension reads as an
// HTTP route segment in this repo's own prose ("`/ready`" a health check, "`/bank`" a REST
// resource) — this repo has no established convention for a leading slash meaning "repo root";
// every genuine repo-root reference here is written WITHOUT one.
function looksLikeRoute(target) {
  return target.startsWith("/") && !target.slice(1).includes("/") && !PATH_EXT_RE.test(target);
}

// `` `-part2.md` ``, `` `-abi.md` `` — a prose shorthand this repo uses repeatedly (e.g.
// wave-d-b-asbuilt.md's own header: "This file and `-part2.md` are the as-built truth"): the
// base filename is named once, and later files are named by just their distinguishing suffix.
// Not a standalone path — there is nothing before the dash to resolve.
const SUFFIX_SHORTHAND_RE = /^-[\w.-]*\.(?:md|mjs|sql|ts|json)$/i;

// Files reached via the one-hop recursion whose OWN backtick conventions are known NOT to name
// current-repo paths, so recursing INTO them is skipped. The file's own existence (as a target
// referenced FROM an entry file) is still validated as normal — this only exempts its content.
// Every entry needs a one-line reason, same discipline as NON_PATH_ALLOWLIST.
export const HOP_CONTENT_EXEMPT = new Set([
  // A salvage/audit document whose backticks systematically cite the FROZEN prior repo's own
  // file inventory (components/*, lib/*, app/*, dashboard/*) as historical evidence of what
  // existed pre-rebuild, often as prose lists ("A + B, C") rather than single paths — never a
  // path meant to resolve in THIS tree. See docs/audit/02-salvage-manifest.md's own header.
  "docs/audit/02-salvage-manifest.md",
]);

const PATH_EXT_RE = /\.(md|mjs|sql|ts|json)$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i; // http://, https://, ftp://, ...

/** True if a backtick span's content should be treated as a candidate repo path. */
export function looksLikePath(content) {
  if (NON_PATH_ALLOWLIST.has(content)) return false;
  if (SCHEME_RE.test(content) || /^mailto:/i.test(content)) return false;
  if (SUFFIX_SHORTHAND_RE.test(content)) return false;
  return content.includes("/") || PATH_EXT_RE.test(content);
}

/** Strip a markdown link's optional trailing `"Title"` and surrounding whitespace. */
function normalizeTarget(raw) {
  return raw.replace(/\s+["'][^"']*["']\s*$/, "").trim();
}

/** True for a pure in-page anchor or an external scheme — never a repo file to validate. */
function isExternalOrAnchor(target) {
  return !target || target.startsWith("#") || SCHEME_RE.test(target) || /^mailto:/i.test(target);
}

function stripAnchor(target) {
  const i = target.indexOf("#");
  return i === -1 ? target : target.slice(0, i);
}

/**
 * A backtick span sometimes carries a citation suffix AFTER the real path — a section/line
 * reference in prose, e.g. `` `docs/design/03-architecture.md (ch.03)` `` or
 * `` `belcort/AGENTS.md §20 — Storage CREED (L94)` ``. If a recognised extension appears
 * anywhere in the content, the real path ends there; anything after is citation, not filename.
 */
function stripTrailingCitation(target) {
  const m = target.match(/^(.*?\.(?:md|mjs|sql|ts|json))\b/i);
  return m ? m[1] : target;
}

/**
 * Parse one file's text for path references, skipping fenced code blocks. Markdown-link spans
 * are masked out before the backtick pass runs, so a link like [`x.md`](./x.md) is reported
 * once (as a md-link), not twice.
 * @returns {{line: number, raw: string, kind: "md-link"|"backtick"}[]}
 */
export function extractPathReferences(text) {
  const lines = text.split(/\r?\n/);
  const refs = [];
  let inFence = false;

  const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
  const BACKTICK_RE = /`([^`]+)`/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue; // the fence delimiter line itself is never scanned
    }
    if (inFence) continue;

    let masked = line;
    MD_LINK_RE.lastIndex = 0;
    let m;
    while ((m = MD_LINK_RE.exec(line))) {
      refs.push({ line: i + 1, raw: normalizeTarget(m[2]), kind: "md-link" });
      const [start, end] = [m.index, m.index + m[0].length];
      masked = masked.slice(0, start) + " ".repeat(end - start) + masked.slice(end);
    }

    BACKTICK_RE.lastIndex = 0;
    let b;
    while ((b = BACKTICK_RE.exec(masked))) {
      const content = b[1].trim();
      if (looksLikePath(content)) refs.push({ line: i + 1, raw: content, kind: "backtick" });
    }
  }
  return refs;
}

function toRel(repoRoot, abs) {
  return relative(repoRoot, abs).split("\\").join("/");
}

function isUnderDocs(rel) {
  return rel === "docs" || rel.startsWith("docs/");
}

/**
 * Resolve a raw reference against the referencing file's own directory FIRST (the convention
 * real Wave docs use — e.g. `[x](./wave-e-design-skeleton-part2.md)`), then against the repo
 * root (the convention AGENTS.md uses — e.g. `` `docs/prd/PRD.md` `` — and what a leading "/"
 * always means). Both conventions are live in this repo today, so both are tried.
 * @returns {{skip: true} | {skip: false, resolved: string|null, candidates: string[]}}
 */
export function resolveReference(repoRoot, fromDirAbs, rawTarget) {
  const normalized = normalizeTarget(rawTarget);
  if (isExternalOrAnchor(normalized)) return { skip: true };
  const target = stripTrailingCitation(stripAnchor(normalized));
  if (!target || isKnownExternalPath(target) || looksLikeRoute(target)) return { skip: true };

  const candidates = target.startsWith("/")
    ? [join(repoRoot, target.slice(1))]
    : [resolve(fromDirAbs, target), resolve(repoRoot, target)];

  for (const c of candidates) {
    try {
      const st = statSync(c);
      // A file OR a directory: prose constantly points at a directory with a trailing slash
      // ("the technical realisation is `docs/architecture/`") — that is a real, resolvable
      // reference, just not a FILE one.
      if (st.isFile() || st.isDirectory()) return { skip: false, resolved: c, candidates };
    } catch {
      /* not this candidate */
    }
  }

  // Last resort: a BARE filename (no "/" anywhere in it) that didn't sit beside the referencing
  // doc or at the repo root — this repo's prose regularly names a well-known script or doc by
  // just its basename (e.g. ARCHITECTURE.md: "verified... in `scripts/check-frozen-workflows.mjs`,
  // which delegates to `freeze-lint-checks.mjs`" — the second one has no path at all). Search
  // every tracked file for that exact basename; accept it ONLY when the match is unambiguous.
  if (!target.includes("/") && PATH_EXT_RE.test(target)) {
    const matches = trackedFilesByBasename(repoRoot).get(target) || [];
    if (matches.length === 1) {
      const resolved = join(repoRoot, matches[0]);
      return { skip: false, resolved, candidates: [...candidates, resolved] };
    }
  }

  return { skip: false, resolved: null, candidates };
}

const basenameIndexCache = new Map();

/**
 * repoRoot -> Map<basename, relPath[]> of every git-tracked file. Cached per repoRoot. Returns
 * an empty map outside a git repo (e.g. a self-test fixture directory) — the bare-filename
 * fallback above then simply never fires, rather than throwing.
 */
function trackedFilesByBasename(repoRoot) {
  if (basenameIndexCache.has(repoRoot)) return basenameIndexCache.get(repoRoot);
  const index = new Map();
  try {
    const out = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    for (const rel of out.split("\n").map((s) => s.trim()).filter(Boolean)) {
      const base = rel.split("/").pop();
      const list = index.get(base);
      if (list) list.push(rel);
      else index.set(base, [rel]);
    }
  } catch {
    /* not a git repo (e.g. a self-test fixture) — fallback stays empty, harmless */
  }
  basenameIndexCache.set(repoRoot, index);
  return index;
}

function formatBrokenRef(relFile, ref, candidates, repoRoot) {
  const kindLabel = ref.kind === "md-link" ? "BROKEN-MD-LINK" : "BROKEN-BACKTICK-PATH";
  const tried = candidates.map((c) => toRel(repoRoot, c)).join(" or ");
  return (
    `${relFile}:${ref.line}  ${kindLabel}  "${ref.raw}" does not resolve (tried: ${tried}). `
    + `Fix the path, or if this is a deliberate non-file mention, add "${ref.raw}" to `
    + `NON_PATH_ALLOWLIST in scripts/check-harness-links.mjs with a one-line reason.`
  );
}

function listFilesRecursive(dirAbs) {
  const out = [];
  for (const ent of readdirSync(dirAbs, { withFileTypes: true })) {
    const abs = join(dirAbs, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(abs));
    else if (ent.isFile()) out.push(abs);
  }
  return out;
}

/** docs/adr/README.md's own index vs. what actually sits on disk under docs/adr/ — both directions. */
function checkAdrBidirectional(repoRoot, adrReadmeAbs, adrDirAbs) {
  const findings = [];
  const refs = extractPathReferences(readFileSync(adrReadmeAbs, "utf8"));
  const referenced = new Set();
  for (const ref of refs) {
    const { skip, resolved } = resolveReference(repoRoot, dirname(adrReadmeAbs), ref.raw);
    if (skip || !resolved) continue;
    if (resolved === adrDirAbs || resolved.startsWith(adrDirAbs + sep)) {
      referenced.add(toRel(repoRoot, resolved));
    }
  }
  const onDisk = listFilesRecursive(adrDirAbs)
    .map((abs) => toRel(repoRoot, abs))
    .filter((rel) => rel !== "docs/adr/README.md");
  for (const rel of onDisk) {
    if (!referenced.has(rel)) {
      findings.push(
        `${rel}:0  ORPHANED-ADR-FILE  sits on disk under docs/adr/ but docs/adr/README.md's `
        + `index does not reference it. Add a link/backtick reference to it in the index, or `
        + `delete it if it is stale.`,
      );
    }
  }
  return findings;
}

/**
 * The whole gate, pure: takes a repo root so the self-test can point it at a throwaway fixture
 * tree instead of the real repo.
 * @returns {{ok: boolean, findings: string[], warnings: string[], entriesChecked: number, refsChecked: number}}
 */
export function checkHarnessLinks({ repoRoot, entryList = ENTRY_LIST, strict = STRICT } = {}) {
  const findings = [];
  const warnings = [];
  let entriesChecked = 0;
  let refsChecked = 0;
  const hopCandidates = new Set();

  function scanExistingFile(relFile) {
    const abs = join(repoRoot, relFile);
    entriesChecked++;
    const text = readFileSync(abs, "utf8");
    for (const ref of extractPathReferences(text)) {
      refsChecked++;
      const { skip, resolved, candidates } = resolveReference(repoRoot, dirname(abs), ref.raw);
      if (skip) continue;
      if (!resolved) {
        findings.push(formatBrokenRef(relFile, ref, candidates, repoRoot));
        continue;
      }
      const relResolved = toRel(repoRoot, resolved);
      if (relResolved.toLowerCase().endsWith(".md") && isUnderDocs(relResolved) && !entryList.includes(relResolved)) {
        hopCandidates.add(relResolved);
      }
    }
  }

  for (const relFile of entryList) {
    const abs = join(repoRoot, relFile);
    if (!existsSync(abs)) {
      if (strict) {
        findings.push(
          `${relFile}:0  MISSING-ENTRY-FILE  pinned entry is absent (STRICT=true). Author it, `
          + `or remove it from ENTRY_LIST in scripts/check-harness-links.mjs if it is no longer a canonical entry point.`,
        );
      } else {
        warnings.push(`${relFile}: absent — STRICT=false (TODO: authored by another lane; will hard-fail once STRICT flips true at assembly)`);
      }
      continue;
    }
    scanExistingFile(relFile);
  }

  // ONE hop, never further: every hop candidate got here only via a successfully-RESOLVED
  // reference from an entry file, so it is guaranteed to exist — its own references are
  // validated, but files IT references are not added back into hopCandidates.
  for (const relFile of hopCandidates) {
    if (HOP_CONTENT_EXEMPT.has(relFile)) {
      warnings.push(`${relFile}: one-hop content validation skipped — HOP_CONTENT_EXEMPT (see scripts/check-harness-links.mjs)`);
      continue;
    }
    const abs = join(repoRoot, relFile);
    entriesChecked++;
    const text = readFileSync(abs, "utf8");
    for (const ref of extractPathReferences(text)) {
      refsChecked++;
      const { skip, resolved, candidates } = resolveReference(repoRoot, dirname(abs), ref.raw);
      if (skip) continue;
      if (!resolved) findings.push(formatBrokenRef(relFile, ref, candidates, repoRoot));
    }
  }

  // docs/adr/ bidirectional check — only meaningful once its README index exists.
  if (entryList.includes("docs/adr/README.md")) {
    const adrReadmeAbs = join(repoRoot, "docs/adr/README.md");
    const adrDirAbs = join(repoRoot, "docs/adr");
    if (existsSync(adrReadmeAbs) && existsSync(adrDirAbs)) {
      findings.push(...checkAdrBidirectional(repoRoot, adrReadmeAbs, adrDirAbs));
    } else if (existsSync(adrReadmeAbs) && !existsSync(adrDirAbs)) {
      findings.push(`docs/adr/README.md:0  MISSING-ADR-DIR  the index exists but the docs/adr/ directory does not.`);
    } else if (!strict) {
      warnings.push("docs/adr/: bidirectional index check skipped — README.md not authored yet (STRICT=false)");
    }
  }

  return { ok: findings.length === 0, findings, warnings, entriesChecked, refsChecked };
}

export function main({ repoRoot } = {}) {
  const root = repoRoot ?? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const { ok, findings, warnings, entriesChecked, refsChecked } = checkHarnessLinks({ repoRoot: root });

  for (const w of warnings) console.warn(`check-harness-links: WARN — ${w}`);

  if (!ok) {
    console.error(`\ncheck-harness-links: FAIL — ${findings.length} broken reference(s):\n`);
    for (const f of findings) console.error("  " + f);
    console.error(`\n${findings.length} finding(s) across ${entriesChecked} file(s) scanned, ${refsChecked} reference(s) checked.`);
    return 1;
  }
  console.log(
    `check-harness-links: OK — ${entriesChecked} file(s) scanned, ${refsChecked} reference(s) validated, 0 broken`
    + (warnings.length > 0 ? `, ${warnings.length} warning(s) above (STRICT=false).` : "."),
  );
  return 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exit(main());
