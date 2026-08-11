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
// STRICT=true SINCE ASSEMBLY (2026-08-12). It was false on the authoring lane because three of
// the four entries (PROGRESS.md, docs/adr/README.md, docs/plan/index.md) were being written by
// sibling lanes in parallel and were not yet on disk; all four exist now, so a missing entry is
// a hard failure. It never softened anything else: a broken reference INSIDE a file that exists
// was always a hard failure regardless of STRICT.
//
// No dependencies — Node built-ins only.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const STRICT = true;

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
  "origin/main", // a git ref (AGENTS.md, ci.yml, and Wave docs all say "never push origin/main" etc.), not a file
  "firms/{firm_id}/…", // an API route TEMPLATE (ARCHITECTURE.md), placeholder segment + ellipsis
  "…/vision-alignment-audit-2026-07-27.md", // an elided path in prose (leading "…" = "somewhere under"), not literal
  "clara-rebuild/", // the rebuild plan's own genesis note ("fresh repo, seeded from `clara-rebuild/`") — names this repo's own root by folder name, not a subpath of it

  // --- Documents that were authored OUTSIDE this repo and never committed to it. Each names a
  // real artifact of a real ladder; the standing law each one minted is recorded in the harness
  // (AGENTS.md / docs/adr/), which is where a reader should be sent. Kept as named exceptions
  // rather than rewritten, because the ADR bodies that cite them are append-only.
  "RENUMBER.md", // the merge-time renumber procedure minted by ADR-058, authored in the Wave D-b build tree; the law it encodes is AGENTS.md hard constraint 10
  "algebra.md", // the metric-algebra research dossier behind wave-e-design-reporting.md's lane-δ section; a cross-model research output, never committed
  "INTERFACE-PINS.md", // the Wave-A/Slice-6 interface-pin sheet, authored under a .tmp build dir; its amendments are docs/plan/completed/wave-a-as-built-amendments.md

  // --- Named things that carry a "/" or a path-like extension but are not repo files.
  "build/wave-d-b-0042", // a git BRANCH (the Wave D-b evidence archive, "NEVER MERGE"), not a directory
  "build/wave-a-daily-loop", // a git branch (the Wave-A build lane), not a directory
  "actions/checkout@v4", // a GitHub Actions ref in a CI excerpt, not a file
  "github.com/mosaladtaooo/clara", // ADR-001's original repo URL written without a scheme (the repo has since moved to the org, ADR-021)
  "openai/gpt-5-mini", // a model identifier (the extraction lane's OCR model), not a file
  "BELCORT-SDN-BHD/clara", // a GitHub owner/repo slug, not a path in this tree
  "manifest.json", // a file INSIDE a produced backup bundle (DR.md §9), not a file in this repo
  "backups/", // the produced backup output dir — gitignored by design ("dumps may hold data")
  "db-snapshots/", // a remote (rclone) destination prefix in the DR plan, not a repo directory
  "firm-docs-mirror/", // likewise a remote destination prefix, not a repo directory
  "clara.chart/v1", // a typed artifact media-type identifier in the reporting design, not a path
  "clara.metric/v1", // likewise
  "/clients/plan", // a dashboard ROUTE with two segments (looksLikeRoute only clears single-segment routes)
  "/etc/sudoers.d/runner", // an absolute path on the CI RUNNER host, not in this repo
  "/run/secrets/clara_storage_service_key", // a container secret mount path, not in this repo

  // --- Instruments and packages the ACTIVE design docs specify but that are not built yet. They
  // are named in future tense in docs/plan/active/; they become real paths when their lane lands,
  // and the entry then comes back out of this list.
  "scripts/check-frozen-evaluators.mjs", // wave-e-design-reporting.md §: the evaluator freeze instrument (lane δ, unbuilt)
  "check-frozen-evaluators.mjs", // the same instrument named by basename
  "frozen-evaluators.json", // its manifest (unbuilt)
  "packages/reporting-render", // the render package the reporting design specifies (unbuilt)
  "packages/reporting-render/", // the same, written as a directory

  // --- Produced or remote directories, and working dirs, that are gitignored by design.
  "packages/db/backups/", // where a dump lands; gitignored ("dumps may hold data" — DR.md)
  "reports/", // the produced-report storage prefix the reporting design writes under, not a repo dir
  ".tmp/h2/", // a Codex-lane sandbox working dir (the §7-A h2 evidence run); .tmp/ is gitignored
  "//run", // DR.md's own illustration of a DOUBLED-slash mount path, quoted to show the bug shape
  "mint_session_jwt.mjs", // an owner-side ceremony helper kept outside the repo (it handles a live secret)
  "wave-7a-acceptance-h1/h2.md", // the "-h1/-h2" pair shorthand: two files named once (completed/wave-7a-acceptance-h1.md and -h2.md)
]);

/**
 * Content that carries a "/" or a path-like extension but CANNOT be a single repo path, by its
 * own shape. This narrows the BACKTICK heuristic only — an explicit markdown link is never
 * excluded here, so a real `[text](path)` reference still always has to resolve.
 *
 * Every clause below describes a construct this repo's prose uses constantly inside backticks:
 *   - whitespace: a shell command (`pnpm --filter @clara/db test`), an HTTP verb + route
 *     (`GET /ready`), an SQL clause (`ALTER ROLE … NOBYPASSRLS`), a column list. A path in this
 *     tree never contains a space.
 *   - {} <> * |: a brace expansion (`deploy/{roles-bootstrap,acl-baseline}.sql`), a glob
 *     (`docs/plan/research/slice6/asbuilt-*`), a placeholder segment (`firms/{uuid}/docs/…`).
 *     These name a SET or a TEMPLATE, never one file.
 *   - ( ) ' " = , ; : and the typographic marks … ≡ → ·: an expression, a quoted literal, an
 *     assignment, an elision, or a prose comparison — none of which is a filename.
 * A construct that is genuinely one path never needs any of these characters, so nothing this
 * clears could have been a broken reference worth reporting.
 */
const STRUCTURALLY_NOT_A_PATH_RE = /[\s{}<>*|()'"=,;:…≡→·%]/;

// A bare extension used as prose shorthand — "the `.sql` bodies", "`.impl.ts` holds the logic".
// SUFFIX_SHORTHAND_RE above covers the dashed form (`-part2.md`); this covers the undashed one.
const BARE_EXT_RE = /^\.(?:md|mjs|sql|ts|json)$|^\.[a-z0-9]+\.(?:md|mjs|sql|ts|json)$/i;

// An npm package specifier — `@clara/db`, `@clara/runtime`, `@workflow/world-postgres`. The "/"
// is the scope separator, not a directory separator; the workspace package it names lives at a
// path this repo spells differently (packages/db, packages/runtime).
const NPM_SPECIFIER_RE = /^@[a-z0-9][\w.-]*\/[\w.-]+$/i;

/**
 * This repo's shorthand for a SET of SQL/JS identifiers written slash-joined — `fy_end_month/day`
 * (two columns), `superseded_by/superseded_at`, `propose_/approve_/reject_/supersede_metric_definition`
 * (four function names sharing a suffix), `grant/revoke_client_egress`.
 *
 * The discriminator is snake_case, and it is a real property of this tree, not a guess: every
 * tracked path here is kebab-case or numeric — ZERO tracked paths have an underscore in any
 * directory segment, and no extensionless tracked file has one either (verified at assembly with
 * `git ls-files`). Underscores are how this codebase spells SQL and JS identifiers, and nothing
 * else. So: no recognised path extension anywhere, at least one snake_case segment, and every
 * segment a bare identifier => a set of identifiers, never a file. `docs/adr` and `packages/db`
 * carry no underscore and stay fully checked.
 */
function looksLikeIdentifierShorthand(content) {
  if (PATH_EXT_RE.test(content) || !content.includes("/")) return false;
  const segments = content.split("/");
  if (!segments.some((s) => s.includes("_"))) return false;
  return segments.every((s) => /^[A-Za-z0-9_.]*$/.test(s));
}

/**
 * Prefixes whose files are APPEND-ONLY or FROZEN by standing law, so a stale reference inside one
 * cannot be repaired without rewriting a historical record. Their own existence as a reference
 * TARGET is still validated (an index row pointing at a missing archive file still fails, and
 * docs/adr/ keeps its bidirectional index check) — this exempts only their CONTENT from the
 * one-hop scan. Same discipline as HOP_CONTENT_EXEMPT: a one-line reason per entry.
 */
export const HOP_CONTENT_EXEMPT_PREFIXES = Object.freeze([
  // Closed waves and slices. Owner-ruled untouchable at the 2026-08-12 harness refactor: "they
  // may cite the old world as history — leave them; only their INDEX rows describe present
  // reality". Their sibling cross-references were written against the pre-refactor docs/plan/ flat
  // tree and are history, not instructions.
  "docs/plan/completed/",
  // Frozen per-wave research dossiers — cross-model evidence, cited as-of their authoring date.
  "docs/plan/research/",
  // The ADR bodies. Append-only by the log's own first law ("supersede with a NEW entry; never
  // rewrite or prune an old one" — docs/adr/README.md), so their prose is a permanent minute of
  // what was true at ratification. docs/adr/README.md itself is an ENTRY and stays fully checked.
  "docs/adr/0",
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
  if (SUFFIX_SHORTHAND_RE.test(content) || BARE_EXT_RE.test(content)) return false;
  if (STRUCTURALLY_NOT_A_PATH_RE.test(content)) return false;
  if (NPM_SPECIFIER_RE.test(content) || looksLikeIdentifierShorthand(content)) return false;
  return content.includes("/") || PATH_EXT_RE.test(content);
}

/** True if this file's CONTENT is exempt from the one-hop scan (see HOP_CONTENT_EXEMPT*). */
export function isHopContentExempt(relFile) {
  return HOP_CONTENT_EXEMPT.has(relFile) || HOP_CONTENT_EXEMPT_PREFIXES.some((p) => relFile.startsWith(p));
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
 * root (the convention AGENTS.md uses — e.g. `` `docs/product/PRD.md` `` — and what a leading "/"
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
  let hopExempt = 0;
  for (const relFile of hopCandidates) {
    if (isHopContentExempt(relFile)) {
      hopExempt++;
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

  if (hopExempt > 0) {
    warnings.push(
      `${hopExempt} reached file(s) skipped for CONTENT — append-only or frozen by standing law `
      + `(HOP_CONTENT_EXEMPT / _PREFIXES in scripts/check-harness-links.mjs). Their existence as a `
      + `reference target was still validated.`,
    );
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
    + (warnings.length > 0 ? `, ${warnings.length} warning(s) above.` : "."),
  );
  return 0;
}

const invoked = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) process.exit(main());
