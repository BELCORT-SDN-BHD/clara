// Print this package's PREINTEGRATION GATE CHAIN as `node --test` flags — the ONE source of
// truth being `package.json`'s own `test` script, never a second list.
//
// WHY (#1041). A gate module is `process.env.CLARA_ALLOW_MISSING_<LANE> = "1"`: it tells a cell
// whose premise migration is NOT on the database that this is an ESTATE SWEEP against a
// pre-integration chain, so the cell may skip loudly instead of failing. `.github/actions/
// frontier-leg` replays the CURRENT slice lists against a chain that stops at 0042..0045, which
// is precisely that situation, and it ran them with a bare `node --test` — so cells whose
// premise is above the frontier died instead of skipping (dispatch run 35893727271). The action
// now runs `node scripts/print-gate-chain.mjs` and passes the result through. Copying the 106
// flags into the YAML would have made a second list to keep in step with the first; this reads
// the first.
//
// `packages/db/tests/ci-frontier-leg-contract.test.mjs` holds the output to the gate modules ON
// DISK — a third, independent instrument — so a gate that ships without joining the `test`
// script, or a `test` script entry with no file, fails by name.
//
// Output: the flags on ONE line, space-separated, in the `test` script's own order, e.g.
//   --import ./tests/delta-preintegration-gate.mjs --import ./tests/rs-guard-preintegration-gate.mjs …
// A shell uses it unquoted, exactly as CI does:
//   GATES="$(node scripts/print-gate-chain.mjs)"; node --test $GATES tests/foo.test.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..", "package.json");

const script = JSON.parse(readFileSync(PKG, "utf8"))?.scripts?.test;
if (typeof script !== "string" || script.length === 0) {
  throw new Error(`print-gate-chain: ${PKG} has no "test" script to read the gate chain from`);
}

const gates = [...script.matchAll(/--import\s+(\.\/tests\/[A-Za-z0-9._-]+\.mjs)/g)].map((m) => m[1]);
if (gates.length === 0) {
  throw new Error(
    `print-gate-chain: the "test" script in ${PKG} preloads no gate module — either its shape changed `
    + "(update this parser) or the chain was lost; a sweep with no gates fails every pre-integration cell.",
  );
}
const seen = new Set();
for (const g of gates) {
  if (seen.has(g)) throw new Error(`print-gate-chain: the "test" script preloads ${g} twice`);
  seen.add(g);
}

process.stdout.write(gates.map((g) => `--import ${g}`).join(" "));
