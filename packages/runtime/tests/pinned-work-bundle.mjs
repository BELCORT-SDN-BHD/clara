// THE PINNED `claraWork` BUNDLE, READ FROM THE REGISTRY RATHER THAN RETYPED.
//
// WHY THIS FILE EXISTS. Every standalone World e2e in this directory spawns the real supervisor
// (`scripts/serve.mjs`) and then compares what the RUN recorded — `work.bundle.id`,
// `work.bundle.digest`, `operation_receipts.bundle_digest`, `work_execution_traces.bundle_id` —
// against what the PROCESS logged. Both sides move together every time the registry's `claraWork:`
// pin moves: v1 -> v2 (#629), v2 -> v3 (#631), v3 -> v4 (the wave 2026-09-15 successor cut). Until
// this file, each script carried the version as a LITERAL in three places (the banner regex, an
// `id` assertion and a sentence), so a cut had to find and move all of them by hand.
//
// It did not. The cut re-anchored the eleven `node --test`-collected cells on
// `registry.workflowPins` and a whole-suite grep found them; these scripts are NOT collected by
// `node --test` (they are wired one by one in `.github/actions/db-live-gates/action.yml`), so the
// grep never reached them and SIX of them red — on a stale literal, not on the behaviour each one
// exists to measure. `startWorld` logs one banner per RETAINED body, so the v3 regex kept matching
// after the pin moved and silently captured a digest no run could ever record.
//
// WHY THE SOURCE IS READ AND NOT IMPORTED. These scripts run as plain `node tests/<file>.mjs`
// with no tsx loader registered in the PARENT process (the TypeScript is loaded inside the child
// the script spawns). The registry's own `workflowPins` literal, read as text, is the one anchor
// available on this side of that line — the same thing `chatturn-v18.test.mjs` does with
// `REGISTRY_SRC` for the pin LINE.
//
// IT IS SELF-CHECKING, NOT A NAMING CONVENTION. The bundle id is never guessed from the pin's
// name: the pin gives the VERSION, and the bundle module of that version must itself declare
// `id: "clara-work/v<N>"`. If the two ever stop agreeing this throws by name, rather than handing
// a caller a bundle id no image serves.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REGISTRY = fileURLToPath(new URL("../workflows/registry.ts", import.meta.url));

/** The body the registry PINS for the `claraWork` class, e.g. `{ body: "claraWork_v4", version: 4 }`. */
export function pinnedClaraWorkBody() {
  const src = readFileSync(REGISTRY, "utf8");
  // The trailing comma is the boundary, deliberately rather than `\b` — `claraWork_v1` is a
  // PREFIX of `claraWork_v10`, and the registry's own bundle gate has already paid once for a
  // substring match that could not tell a version from the start of a longer one.
  const m = /\n {2}claraWork: "(claraWork_v(\d+))",/.exec(src);
  if (!m) {
    throw new Error(
      "workflows/registry.ts's workflowPins no longer carries a `claraWork: \"claraWork_vN\",` line — "
      + "re-derive tests/pinned-work-bundle.mjs against whatever replaced it",
    );
  }
  return { body: m[1], version: Number(m[2]) };
}

/** The bundle id the pinned body serves, e.g. `"clara-work/v4"` — verified against that body's own bundle module. */
export function pinnedClaraWorkBundleId() {
  const { body, version } = pinnedClaraWorkBody();
  const id = `clara-work/v${version}`;
  const bundleSrc = readFileSync(
    fileURLToPath(new URL(`../workflows/claraWork.v${version}.bundle.ts`, import.meta.url)),
    "utf8",
  );
  if (!bundleSrc.includes(`id: "${id}",`)) {
    throw new Error(
      `workflows/claraWork.v${version}.bundle.ts does not declare \`id: "${id}",\` — the ${body} pin and `
      + "its bundle id no longer agree, so no literal in this suite can be trusted",
    );
  }
  return id;
}

/**
 * The `startWorld` banner line for the SERVING bundle, as a regex whose group 1 is the sha256.
 *
 * THE PREFIX IS ESCAPED BY RULE, NOT BY HAND, AND THE RESULT IS PROVEN AGAINST A SAMPLE BEFORE IT
 * IS RETURNED. Both halves are paid for: a hand-written `\[clara-runtime\]` that loses one
 * backslash becomes a CHARACTER CLASS which matches the banner nowhere, the capture never lands,
 * and the caller's own error says the engine "did not become ready" — a sentence about the server
 * for a fault in this line. Measured, 2026-09-17: nine World legs failed that way in one batch.
 */
export function pinnedClaraWorkBannerRe() {
  const literal = `[clara-runtime] bundle ${pinnedClaraWorkBundleId()} digest=`;
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);
  const re = new RegExp(escaped + "([0-9a-f]{64})");
  const sample = `${literal}${"0".repeat(64)}`;
  if (re.exec(sample)?.[1] !== "0".repeat(64)) {
    throw new Error(`pinned-work-bundle: the banner regex ${re} does not match its own banner shape — refusing to hand it out`);
  }
  return re;
}
