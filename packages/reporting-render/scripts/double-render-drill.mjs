#!/usr/bin/env node
// THE DOUBLE-RENDER BYTE-EQUALITY DRILL (design part2 §9/§10 — "a CI obligation ... and a DR
// obligation"). Repo-resident so CI can run it; the same script the DR cadence uses.
//
// TWO ARMS, BOTH REQUIRED:
//   A vs B  identical inputs  -> the sha256 must MATCH   (the render is reproducible)
//   A vs C  changed input     -> the sha256 must DIFFER  (the inputs actually reach the bytes)
//
// The control arm is not a nicety. BYTE-EQUALITY PROVES NOTHING UNLESS THE OUTPUT IS CAPABLE OF
// VARYING: if the renderer had stopped reading its inputs, or the comparison ran the same file
// twice, or the engine emitted a fixed placeholder, an A-vs-B-only drill would still come back
// green. A run reporting only A == B is NOT a pass — and a run where C MATCHED is a worse finding
// than a mismatch, because a changed input leaving the output identical means the pin is wired to
// nothing at all.
//
// It renders a FIXTURE rather than a real pack on purpose: this measures the ENGINE and the
// pinned image, which needs no database, no firm and no client data. Sealed-artifact
// reproducibility is the DR drill's job (docs/ops/DR-render.md), and it re-renders real inputs.
//
// Usage:  node scripts/double-render-drill.mjs [--image clara-render:spike]
// Exit 0 only when BOTH arms pass.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const EPOCH_C = "1234567890"; // deliberately different: the control

// A fixture exercising the paths that actually vary: text, a table of pre-formatted figures,
// rect geometry standing in for chart bars, and a stamped box.
const FIXTURE = `#let s(t) = text(t)
#set document(title: "Clara determinism drill", author: "BELCORT")
#set page(paper: "a4", margin: 20mm)
#set text(font: "DejaVu Sans", size: 10pt)
#align(center, box(stroke: 1pt, inset: 6pt, s("UNCERTIFIED: drill artifact")))
#heading(level: 1)[#s("Statement of financial position")]
#par[#s("ACME SDN BHD (202301234567)")]
#table(columns: 2, [#s("Revenue")], [#s("1,234,567.89")], [#s("Cost of sales")], [#s("(987,654.32)")])
#stack(dir: ltr, spacing: 3mm, rect(width: 8mm, height: 12.3456mm), rect(width: 8mm, height: 30mm))
`;

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

const stage = STAGE_HOST || mkdtempSync(join(tmpdir(), "clara-drill-"));
const stageGuest = STAGE_GUEST || stage;
if (STAGE_HOST) mkdirSync(stage, { recursive: true });
try {
  mkdirSync(join(stage, "fonts"), { recursive: true });
  mkdirSync(join(stage, "out"), { recursive: true });
  writeFileSync(join(stage, "report.typ"), FIXTURE, "utf8");

  // A CONTENT-ADDRESSED FONT, mounted exactly as production supplies them — the image ships no
  // font directory at all, deliberately, so a drill that found one would not be testing production.
  const font = FONT_CANDIDATES.find((p) => existsSync(p));
  if (!font) fail(`no DejaVuSans.ttf found (looked in ${FONT_CANDIDATES.join(", ")}); install fonts-dejavu-core`);
  copyFileSync(font, join(stage, "fonts", "DejaVuSans.ttf"));

  const render = (out, epoch) => docker(["run", "--rm", "-v", `${stageGuest}:/w`, IMAGE, "sh", "-c",
    `cd /w && SOURCE_DATE_EPOCH=${epoch} TZ=UTC LC_ALL=C typst compile --font-path /w/fonts --ignore-system-fonts report.typ out/${out}`]);

  for (const [out, epoch] of [["a.pdf", EPOCH_A], ["b.pdf", EPOCH_A], ["c.pdf", EPOCH_C]]) {
    const r = render(out, epoch);
    if (r.status !== 0) fail(`render ${out} failed (image ${IMAGE}): ${(r.stderr || r.stdout || "").slice(0, 400)}`);
  }

  const sha = (f) => createHash("sha256").update(readFileSync(join(stage, "out", f))).digest("hex");
  const [a, b, c] = ["a.pdf", "b.pdf", "c.pdf"].map(sha);
  process.stdout.write(`  A (epoch ${EPOCH_A}) ${a}\n  B (same inputs)     ${b}\n  C (epoch ${EPOCH_C}) ${c}\n`);

  const determinism = a === b;
  const control = a !== c;
  process.stdout.write(`  DETERMINISM ${determinism ? "PASS" : "FAIL"} — A ${determinism ? "==" : "!="} B\n`);
  process.stdout.write(`  CONTROL     ${control ? "PASS" : "FAIL"} — a changed input ${control ? "changes" : "does NOT change"} the bytes\n`);

  if (!determinism) fail("two renders of identical inputs produced different bytes — the render is not reproducible");
  if (!control) {
    fail("a CHANGED input produced IDENTICAL bytes — the pin is wired to nothing, and the A==B arm is therefore vacuous. This is a worse finding than a mismatch.");
  }
  process.stdout.write("double-render-drill: PASS — both arms\n");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
