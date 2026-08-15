#!/usr/bin/env node
// THE DOUBLE-RENDER BYTE-EQUALITY DRILL (design part2 §9/§10 — "a CI obligation ... and a DR
// obligation"). Repo-resident so CI can run it; the same script the DR cadence uses.
//
// THREE ARMS, ALL REQUIRED:
//   A vs B  identical inputs        -> the sha256 must MATCH   (the render is reproducible)
//   A vs C  changed wall clock      -> the sha256 must MATCH   (the environment cannot move bytes)
//   A vs D  changed PINNED INPUT    -> the sha256 must DIFFER  (the manifest actually reaches them)
//
// The control arm is not a nicety. BYTE-EQUALITY PROVES NOTHING UNLESS THE OUTPUT IS CAPABLE OF
// VARYING: if the renderer had stopped reading its inputs, or the comparison ran the same file
// twice, or the engine emitted a fixed placeholder, an A-vs-B-only drill would still come back
// green. A run reporting only A == B is NOT a pass — and a run where D MATCHED is a worse finding
// than a mismatch, because a changed input leaving the output identical means the pin is wired to
// nothing at all.
//
// WHY THE CLOCK ARM FLIPPED (round 2). It used to vary SOURCE_DATE_EPOCH and require the bytes to
// DIFFER — which was the right control for a fixture that pinned no date of its own. The product's
// document pins its date from the reporting period, so the environment's clock is not an input to
// a real render at all, and requiring it to change the bytes would have been asserting the opposite
// of the property we want. It now asserts the property we DO want (a different SOURCE_DATE_EPOCH
// leaves the artifact identical), and the capable-of-varying job moved to arm D, where a changed
// MANIFEST must move the bytes.
//
// AND IT COMPILES THE PRODUCT'S OWN EMISSION. The document comes from assemble() via
// scripts/drill-fixture.mjs, not from a hand-written .typ — a round-2 blocker (a `description:`
// argument that the pinned Typst 0.12.0 rejects) would have failed EVERY real render while this
// drill stayed green, because the fixture emitted a preamble the product never emits. It still
// needs no database, no firm and no client data: sealed-artifact reproducibility from real inputs
// is the DR drill's job (docs/ops/DR-render.md).
//
// Usage:  node scripts/double-render-drill.mjs [--image clara-render:spike]
// Exit 0 only when ALL THREE arms pass.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDrillDocument } from "./drill-fixture.mjs";

const IMAGE = (() => {
  const i = process.argv.indexOf("--image");
  return i !== -1 ? process.argv[i + 1] : (process.env.CLARA_RENDER_IMAGE || "clara-render:spike");
})();

// PORTABILITY OVERRIDES — so the drill is runnable where the people who need it actually are.
// CI is a Linux runner with node and docker in one place and needs none of these. A Windows dev
// box has node on Windows and docker inside WSL, which means the docker COMMAND and the stage
// PATH both need translating — and a gate that can only ever run in CI is a gate whose first
// exercise is the run that matters. Defaults keep the CI path exactly as it was.
//   CLARA_DRILL_DOCKER       e.g. "wsl -e docker"
//   CLARA_DRILL_STAGE_HOST   where THIS process writes the fixture (a Windows/UNC path)
//   CLARA_DRILL_STAGE_GUEST  the same directory as the docker daemon sees it (a Linux path)
//   CLARA_DRILL_FONT         an explicit font file, when the distro paths below do not apply
const DOCKER_CMD = (process.env.CLARA_DRILL_DOCKER || "docker").split(/\s+/);
const STAGE_HOST = process.env.CLARA_DRILL_STAGE_HOST || null;
const STAGE_GUEST = process.env.CLARA_DRILL_STAGE_GUEST || null;
const EPOCH_A = "1767139200"; // 2025-12-31T00:00:00Z — a reporting period end, not a clock read
const EPOCH_C = "1234567890"; // deliberately different: the environment's clock, which must not matter

// THE DOCUMENT UNDER TEST IS assemble()'s OWN OUTPUT (see scripts/drill-fixture.mjs).
const FIXTURE = buildDrillDocument().typst;
// Arm D's document differs by ONE PINNED INPUT — a different reporting period, which is the most
// honest "changed input" available: it moves the document's date, its keywords and its content
// through exactly the path a real request travels.
const FIXTURE_D = buildDrillDocument({ periodEnd: "2026-06-30" }).typst;

const FONT_CANDIDATES = [
  process.env.CLARA_DRILL_FONT,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
].filter(Boolean);

function fail(message) {
  process.stderr.write(`double-render-drill: FAIL — ${message}\n`);
  process.exit(1);
}

function docker(args, opts = {}) {
  return spawnSync(DOCKER_CMD[0], [...DOCKER_CMD.slice(1), ...args], { encoding: "utf8", ...opts });
}

// THE DRILL DELETES ONLY WHAT THE DRILL CREATED. `finally` recursively removes the stage, and an
// operator following the header's guidance may point CLARA_DRILL_STAGE_HOST at a directory that
// already holds their own files — so when a host stage is supplied we work inside a fresh
// per-run subdirectory of it and remove THAT, never the directory we were handed.
const RUN_DIR = `run-${randomUUID().slice(0, 8)}`;
const stage = STAGE_HOST ? join(STAGE_HOST, RUN_DIR) : mkdtempSync(join(tmpdir(), "clara-drill-"));
const stageGuest = STAGE_GUEST ? `${STAGE_GUEST}/${RUN_DIR}` : stage;
if (STAGE_HOST) mkdirSync(stage, { recursive: true });
try {
  mkdirSync(join(stage, "fonts"), { recursive: true });
  mkdirSync(join(stage, "out"), { recursive: true });
  writeFileSync(join(stage, "report.typ"), FIXTURE, "utf8");
  writeFileSync(join(stage, "report_d.typ"), FIXTURE_D, "utf8");

  // A CONTENT-ADDRESSED FONT, mounted exactly as production supplies them — the image ships no
  // font directory at all, deliberately, so a drill that found one would not be testing production.
  const font = FONT_CANDIDATES.find((p) => existsSync(p));
  if (!font) fail(`no DejaVuSans.ttf found (looked in ${FONT_CANDIDATES.join(", ")}); install fonts-dejavu-core`);
  copyFileSync(font, join(stage, "fonts", "DejaVuSans.ttf"));

  const render = (out, epoch, src = "report.typ") => docker(["run", "--rm", "-v", `${stageGuest}:/w`, IMAGE, "sh", "-c",
    `cd /w && SOURCE_DATE_EPOCH=${epoch} TZ=UTC LC_ALL=C typst compile --font-path /w/fonts --ignore-system-fonts ${src} out/${out}`]);

  for (const [out, epoch, src] of [["a.pdf", EPOCH_A, "report.typ"], ["b.pdf", EPOCH_A, "report.typ"],
    ["c.pdf", EPOCH_C, "report.typ"], ["d.pdf", EPOCH_A, "report_d.typ"]]) {
    const r = render(out, epoch, src);
    // A COMPILE FAILURE IS THE POINT OF COMPILING THE REAL PREAMBLE: an engine that rejects an
    // argument assemble() emits fails HERE, on every PR, instead of on a client's first render.
    if (r.status !== 0) fail(`render ${out} failed (image ${IMAGE}): ${(r.stderr || r.stdout || "").slice(0, 400)}`);
  }

  const sha = (f) => createHash("sha256").update(readFileSync(join(stage, "out", f))).digest("hex");
  const [a, b, c, d] = ["a.pdf", "b.pdf", "c.pdf", "d.pdf"].map(sha);
  process.stdout.write(`  A (epoch ${EPOCH_A})  ${a}\n  B (same inputs)      ${b}\n`
    + `  C (epoch ${EPOCH_C})  ${c}\n  D (changed period)   ${d}\n`);

  const determinism = a === b;
  const clockProof = a === c;
  const control = a !== d;
  process.stdout.write(`  DETERMINISM ${determinism ? "PASS" : "FAIL"} — A ${determinism ? "==" : "!="} B\n`);
  process.stdout.write(`  CLOCK       ${clockProof ? "PASS" : "FAIL"} — a changed SOURCE_DATE_EPOCH ${clockProof ? "leaves" : "MOVES"} the bytes\n`);
  process.stdout.write(`  CONTROL     ${control ? "PASS" : "FAIL"} — a changed pinned input ${control ? "changes" : "does NOT change"} the bytes\n`);

  if (!determinism) fail("two renders of identical inputs produced different bytes — the render is not reproducible");
  if (!clockProof) {
    fail("the same document rendered under a DIFFERENT SOURCE_DATE_EPOCH produced different bytes — the artifact is reading the environment's clock, so two lawful re-renders of one manifest would disagree.");
  }
  if (!control) {
    fail("a CHANGED pinned input produced IDENTICAL bytes — the manifest is wired to nothing, and the A==B arm is therefore vacuous. This is a worse finding than a mismatch.");
  }
  process.stdout.write("double-render-drill: PASS — all three arms\n");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
