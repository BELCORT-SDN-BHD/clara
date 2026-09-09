// OPERATION-CONTRACT CENSUS — RENDERING.
//
// The markdown summary and the two output files. Nothing here computes anything: every number
// it prints is read off the census object, so a reader comparing the markdown against the JSON
// is comparing two views of ONE measurement, not two measurements.
//
// DETERMINISM. No wall clock, no machine path, no connection string ever reaches these files —
// `writeCensus` is handed a destination and writes exactly two names into it.
//
// Split out of scripts/operation-census.mjs at this repository's 500-line ceiling. Behaviour
// is byte-identical to the code it replaced.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FINDING_LABELS } from "./scope.mjs";

export function renderMarkdown(census) {
  const lines = [];
  lines.push("# Clara operation-contract census", "");
  lines.push("Recomputed from the live catalog and the current repository sources. No number here is carried over from an earlier wave.", "");
  lines.push("## Migration frontier (the ledger, not a migration's own flag)", "");
  lines.push("| source | count | max version |", "|---|---|---|");
  lines.push(`| clara.schema_migrations | ${census.frontier.ledger_count} | ${census.frontier.ledger_max_version ?? "(none)"} |`);
  lines.push(`| packages/db/migrations | ${census.frontier.disk_count} | ${census.frontier.disk_max_version ?? "(none)"} |`);
  lines.push("", `Ledger and disk agree: **${census.frontier.matched}**.`, "");
  lines.push("## Scope", "");
  lines.push(`- clara functions/procedures read: **${census.scope.catalog_functions}**`);
  lines.push(`- application roles (from pg_roles): ${census.scope.application_roles.join(", ")}`);
  lines.push(`- caller sites resolved: **${census.scope.caller_sites}** (web: ${census.scope.web_roots.join(", ")}; runtime: ${census.scope.runtime_roots.join(", ")})`);
  lines.push(`- excluded: ${census.scope.excluded}`);
  lines.push(`- clara.<name>( occurrences that are relation references, not calls: ${census.scope.relation_references_skipped}`);
  lines.push(`- clara.<name>( occurrences inside a string that is prose or a catalog signature, not SQL: ${census.scope.prose_mentions_skipped}`);
  lines.push(`- source files whose lexer scan failed: ${census.scan_errors.length}`);
  lines.push("");
  lines.push("## Findings", "");
  lines.push("| label | before waivers | after waivers |", "|---|---|---|");
  for (const label of FINDING_LABELS) {
    lines.push(`| ${label} | ${census.counts.before_waivers[label]} | ${census.counts.after_waivers[label]} |`);
  }
  lines.push("");
  if (census.waivers_applied.length) {
    lines.push("### Waivers applied", "");
    for (const w of census.waivers_applied) lines.push(`- \`${w.key}\` — ${w.reason}`);
    lines.push("");
  }
  if (census.waivers_unused.length) {
    lines.push("### Waivers that matched nothing (dead exemptions)", "");
    for (const k of census.waivers_unused) lines.push(`- \`${k}\``);
    lines.push("");
  }
  for (const label of FINDING_LABELS) {
    const rows = census.findings.filter((f) => f.label === label);
    if (!rows.length) continue;
    lines.push(`### ${label} (${rows.length})`, "");
    for (const f of rows) lines.push(`- ${f.waived ? "[waived] " : ""}\`${f.target}\` — ${f.detail}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function writeCensus(census, outDir) {
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "operation-census.json");
  const mdPath = join(outDir, "operation-census.md");
  writeFileSync(jsonPath, `${JSON.stringify(census, null, 2)}\n`);
  writeFileSync(mdPath, renderMarkdown(census));
  return { jsonPath, mdPath };
}
