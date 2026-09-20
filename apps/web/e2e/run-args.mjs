/**
 * THE E2E RUNNER'S ARGUMENT PARSE, as its own pure module (#851).
 *
 * `run.mjs` spawns a build the moment it is imported, so nothing could import it to check how it
 * reads argv without paying for a whole `next build`. That is why this parse lives here: it is the
 * one part of the runner with a contract other lanes depend on, and it is the one part that can be
 * held by a unit cell (`run-args.test.ts`).
 *
 * TWO KINDS OF ARGUMENT, and telling them apart is the whole job. Everything this runner does not
 * claim for itself belongs to Playwright — a spec-name filter, `--headed`, `--grep`. `--no-build`
 * is the runner's own and must be CONSUMED here: forwarded, Playwright would fail on an unknown
 * option, and a parser loose enough to swallow a look-alike (`--no-builds`) would silently widen a
 * one-spec gate into the whole suite, which is exactly the failure #630 recorded for a stray `--`.
 * So the match is EXACT EQUALITY, never a prefix or a substring.
 *
 * WHAT `--no-build` DOES NOT CHANGE: the environment block `run.mjs` sets, the order of the
 * Playwright invocation, or anything about a run that does not pass it. A bare
 * `pnpm --filter @clara/web e2e` is the run it always was, argument for argument — `run-args.test.ts`
 * holds that against the historical expression itself rather than against a copied list.
 *
 * @param {string[]} argv `process.argv.slice(2)` — everything after `node e2e/run.mjs`.
 * @returns {{ build: boolean, passthrough: string[] }} `build` — whether to run `pnpm --filter
 *   @clara/web build` first (true unless `--no-build` was passed); `passthrough` — the arguments
 *   Playwright receives.
 */
export function parseRunArgs(argv) {
  const passthrough = [];
  let build = true;
  for (const arg of argv) {
    if (arg === "--no-build") {
      build = false;
      continue;
    }
    // #630 — STRIP A LEADING `--` (measured 2026-09-12, pnpm 10.33.0): `pnpm --filter @clara/web
    // e2e -- work-cancel-walk` forwards the separator ITSELF in argv, so playwright received
    // `test -- work-cancel-walk`, treated the separator as end of options and ran the WHOLE suite.
    // A separator is never a spec filter, so dropping it costs nothing.
    if (arg === "--") continue;
    passthrough.push(arg);
  }
  return { build, passthrough };
}
