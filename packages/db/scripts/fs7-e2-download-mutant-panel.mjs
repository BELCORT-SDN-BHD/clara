#!/usr/bin/env node
// THE RED-BEFORE PANEL for the FS-7 echelon 2 download door (裁-96②).
//
// RIG-ONLY, AND NOT A CI GATE. It CREATE OR REPLACEs live function bodies to break them on purpose,
// so it runs against a throwaway rig and nothing else — the `packages/db/scripts/
// fa5-pr3-real-seal-drill.mjs` posture exactly. It is committed rather than left in a lane's
// scratch directory for one reason: the PR body's RED-before table is a claim, and a reviewer who
// wants to check it should be able to RE-RUN the instrument instead of trusting the table.
//
//   PGHOST=127.0.0.1 PGPORT=<rig> PGUSER=postgres PGPASSWORD=… PGDATABASE=<rig db> \
//   DATABASE_URL=postgres://… node scripts/fs7-e2-download-mutant-panel.mjs
//
// It restores the shipped body after every mutant AND re-runs the battery at the end, so a panel
// that died mid-way leaves a database whose last state is visible rather than silently broken.
//
// Each mutant REPLACES one shipped body with one wall removed (or one predicate swapped for the
// wrong instrument), runs the focused battery, and records which cells go red. A mutant that reds
// NOTHING is a wall nothing proves; a mutant that reds EVERYTHING broke the fixture, not the wall.
//
// A MUST-NOT-RED CONTROL (an inert comment-only edit) runs first: if the control reds, the panel
// is measuring the harness rather than the walls.
//
// TWO WALLS ARE DELIBERATELY REDUNDANT and the panel says so out loud rather than reporting a
// masked mutant as a proven one: the sealed family's firm scope is enforced BOTH by the lookup's
// own `ra.firm_id = p_firm` and by the client-in-firm belt beneath it, so removing EITHER alone
// reds nothing. M2b removes both at once, which is the mutant that actually measures the pair.
//
// Usage: DATABASE_URL=... node .lane-scratch/mutants.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, "..", "migrations", "UNNUMBERED_fs7_e2_artifact_download_door.sql");
const src = readFileSync(MIG, "utf8");

function body(createLine, endMarker) {
  const s = src.indexOf(createLine);
  const e = src.indexOf(endMarker, s);
  if (s < 0 || e < 0) throw new Error(`could not locate ${createLine}`);
  return src.slice(s, e).replace("create function ", "create or replace function ");
}
const GATE = body("create function clara._artifact_download_core(",
  "revoke all on function clara._artifact_download_core(uuid,uuid,uuid,int) from public;");
const OFFER = body("create function clara.list_downloadable_artifacts(",
  "revoke all on function clara.list_downloadable_artifacts(uuid,int) from public;");
const SHIPPED = { gate: GATE, offer: OFFER };

const MUTANTS = [
  { id: "M0-control", target: "gate", mustRed: [],
    why: "MUST-NOT-RED control: an inert comment, no behaviour change",
    apply: (g) => g.replace("declare\n  a record;", "declare\n  -- inert control edit\n  a record;") },

  { id: "M1-no-core-read-floor", target: "gate", mustRed: ["D2.2", "D7.2"],
    why: "deletes the gate's human read floor",
    apply: (g) => g.replace("  if p_rank < clara.role_rank('bookkeeper') then",
                            "  if false and p_rank < clara.role_rank('bookkeeper') then") },

  { id: "M1b-offer-floor-to-viewer", target: "offer", mustRed: ["D8.4"],
    why: "drops the OFFER's own entry floor from bookkeeper to viewer (D8.4's floor is _human_ctx's, not the core's)",
    apply: (o) => o.replace("clara._human_ctx(clara.role_rank('bookkeeper'))",
                            "clara._human_ctx(clara.role_rank('viewer'))") },

  { id: "M2a-lookup-firm-only", target: "gate", mustRed: [],
    why: "drops ONLY the lookup's firm predicate — MASKED by the client-in-firm belt, so it is expected to red nothing; recorded so the redundancy is visible rather than inferred",
    apply: (g) => g.replace("   where ra.id = p_artifact and ra.firm_id = p_firm;",
                            "   where ra.id = p_artifact;") },

  { id: "M2b-both-firm-walls", target: "gate", mustRed: ["D1.2", "D1.3"],
    why: "THE PAIR: removes the lookup's firm predicate AND the client-in-firm belt, which is what actually opens cross-firm reads",
    apply: (g) => g
      .replace("   where ra.id = p_artifact and ra.firm_id = p_firm;", "   where ra.id = p_artifact;")
      .replace("    if not exists (select 1 from clara.clients cl where cl.id = a.client_id and cl.firm_id = p_firm) then",
               "    if false then") },

  { id: "M3-no-superseded", target: "gate", mustRed: ["D4.1"],
    why: "deletes the superseded wall",
    apply: (g) => g.replace("    if v_successor is not null then", "    if false and v_successor is not null then") },

  { id: "M4-substring-watermark", target: "gate", mustRed: ["D5.2"], mustNotRed: ["D5.1", "D5.3"],
    why: "THE WORD-BOUNDARY MUTANT: swaps the \\m..\\M match for a substring one, so `unwatermarked` passes",
    apply: (g) => g.replace("v_keywords !~ '\\mwatermarked\\M'", "v_keywords not like '%watermarked%'") },

  { id: "M5-no-watermark-wall", target: "gate", mustRed: ["D5.2", "D5.3"],
    why: "deletes the draft watermark wall entirely",
    apply: (g) => g.replace("    if a.kind = 'draft_watermarked' then", "    if false then") },

  { id: "M6-no-completion-wall", target: "gate", mustRed: ["D6.2"],
    why: "deletes the sandbox completion wall",
    apply: (g) => g.replace(
      "  if e.state <> 'done' or e.storage_key is null or e.artifact_sha256 is null or e.byte_size is null then",
      "  if false then") },

  { id: "M7-watermark-object-coercion", target: "gate", mustRed: ["D6.3"],
    why: "THE JSONB COERCION MUTANT: reads the whole watermark OBJECT instead of its `watermark` key, so {\"watermark\":\"\"} coerces to a non-blank 17-character string",
    apply: (g) => g.replace("select btrim(coalesce(wpv.watermark ->> 'watermark', '')) into v_watermark",
                            "select btrim(coalesce(wpv.watermark::text, '')) into v_watermark") },

  { id: "M8-no-covered-client-wall", target: "gate", mustRed: ["D6.4"],
    why: "deletes the sandbox covered-client wall",
    apply: (g) => g.replace("  if cardinality(v_stray) > 0 then", "  if false then") },

  { id: "M9-offer-copies-the-predicate", target: "offer", mustRed: ["D8.2"],
    why: "THE 裁-112 MUTANT: the offer stops CALLING the gate and answers with its own copy of the predicate ('a report_artifact row exists, so it is downloadable') — the exact duplicated-gate defect the law names",
    apply: (o) => o.replace(
      "      v_verdict := clara._artifact_download_core(row_.id, c.firm, c.actor, coalesce(v_rank, -1));\n      v_ok := true; v_reason := null;",
      "      v_verdict := jsonb_build_object('sha256', null, 'byte_size', null,\n        'content_type', 'application/pdf', 'filename', 'copy.pdf');\n      v_ok := true; v_reason := null;") },
];

async function applyBody(sql) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query("set role clara_fn_owner");
  await c.query(sql);
  await c.query("reset role");
  await c.end();
}

function runBattery() {
  const r = spawnSync(process.execPath,
    ["--test", "--test-concurrency=1", "tests/fs7-e2-artifact-download.test.mjs"],
    { cwd: join(HERE, ".."), encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout}\n${r.stderr}`;
  return {
    red: [...out.matchAll(/^not ok \d+ - (D[0-9.]+)/gm)].map((m) => m[1]),
    total: (out.match(/^# tests (\d+)/m) ?? [])[1],
  };
}

const results = [];
for (const m of MUTANTS) {
  const mutated = m.apply(SHIPPED[m.target]);
  if (mutated === SHIPPED[m.target]) throw new Error(`${m.id}: the mutation matched nothing`);
  await applyBody(mutated);
  const { red, total } = runBattery();
  results.push({ ...m, red, total });
  console.log(`${m.id.padEnd(32)} tests=${total} red=[${red.join(" ")}]`);
  await applyBody(SHIPPED[m.target]); // restore before the next mutant
}
const restored = runBattery();
console.log(`${"RESTORED shipped bodies".padEnd(32)} tests=${restored.total} red=[${restored.red.join(" ")}]`);

let bad = 0;
for (const r of results) {
  for (const cell of r.mustRed ?? []) {
    if (!r.red.includes(cell)) { console.log(`FAIL ${r.id}: ${cell} did NOT red — that wall is unproven`); bad += 1; }
  }
  for (const cell of r.mustNotRed ?? []) {
    if (r.red.includes(cell)) { console.log(`FAIL ${r.id}: ${cell} red but must not — non-discriminating`); bad += 1; }
  }
}
if (results[0].red.length > 0) { console.log(`FAIL control red [${results[0].red.join(" ")}]`); bad += 1; }
if (restored.red.length > 0) { console.log(`FAIL restore left ${restored.red.length} cell(s) red`); bad += 1; }
console.log(bad === 0
  ? "\nPANEL OK — every wall has a mutant that reds its cell, the control stayed green, and the shipped bodies restore clean."
  : `\nPANEL FAILED: ${bad} expectation(s) unmet`);
process.exit(bad === 0 ? 0 : 1);
