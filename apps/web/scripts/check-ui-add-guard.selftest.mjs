#!/usr/bin/env node
// POSITIVE CONTROL for #772's shadcn-install guard (scripts/ui-add.mjs). A
// gate that has never been SEEN to catch the defect it exists for is an
// assertion, not a control — this drives `checkGuard`/`resolveTargetPaths`/
// `main` directly against FIXTURE payloads through an INJECTED resolver, so
// it needs no network (the house rule for a gate wired into `pnpm lint`,
// which every PR already runs with no pipeline edit — the same convention
// check-test-manifest.mjs's and check-message-keys.mjs's own selftests use).
//
//   node scripts/check-ui-add-guard.selftest.mjs   # exit 0 green, 1 red
//
// THE ONE THING THIS FILE DELIBERATELY DOES NOT PROVE: that the REAL pinned
// `shadcn` CLI's registry payload for a real component still contains
// `button.tsx` today. That is the rehearsal #772's own acceptance criteria
// ask for as a LIVE, one-time, locally-run check (`pnpm ui:add pagination
// --dry-run` against the pinned 4.19.0, recorded in the delivering report) —
// a network call has no place in a gate every PR runs.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkGuard,
  loadAllowlist,
  main,
  resolveTargetPaths,
  resolveTargetPathsFromDryRun,
  OVERRIDE_ENV_VAR,
} from "./ui-add.mjs";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
async function testCase(name, fn) {
  try {
    await fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ALIASES = { components: "@/components", ui: "@/components/ui", utils: "@/lib/utils", lib: "@/lib", hooks: "@/hooks" };

/** The FIXTURE PAYLOAD that reproduces the real incident: a `pagination`
 *  install whose flattened dependency closure also names `button.tsx`
 *  (`docs/plan/active/refresh-wave-2026-09-14/HANDOFF.md`'s #641 row) —
 *  exactly the shape `resolveRegistryItems(["pagination"])` returns for the
 *  real registry today (verified live, see this branch's delivering report). */
const BUTTON_CONTAINING_PAYLOAD = [
  { path: "registry/base-nova/ui/button.tsx", type: "registry:ui" },
  { path: "registry/base-nova/ui/pagination.tsx", type: "registry:ui" },
];

const NON_PROTECTED_PAYLOAD = [
  { path: "registry/base-nova/ui/alert.tsx", type: "registry:ui" },
];

const ALLOWLIST = loadAllowlist(readFileSync(join(WEB_ROOT, "scripts", "protected-components.json"), "utf8"));

console.log("[check-ui-add-guard.selftest]");

// ---------------------------------------------------------------------------
// (1) resolveTargetPaths — the registry-item → project-file join.
// ---------------------------------------------------------------------------
console.log("resolveTargetPaths:");
await testCase("a registry:ui file joins under aliases.ui, alias prefix stripped", () => {
  const out = resolveTargetPaths([{ path: "registry/base-nova/ui/button.tsx", type: "registry:ui" }], ALIASES);
  assert(out.length === 1 && out[0] === "components/ui/button.tsx", `got ${JSON.stringify(out)}`);
});
await testCase("a file carrying its own explicit target is used as-is, never re-joined", () => {
  const out = resolveTargetPaths([{ path: "registry/x/page.tsx", type: "registry:page", target: "app/dashboard/page.tsx" }], ALIASES);
  assert(out.length === 1 && out[0] === "app/dashboard/page.tsx", `got ${JSON.stringify(out)}`);
});
await testCase("an unrecognised type is omitted, never guessed", () => {
  const out = resolveTargetPaths([{ path: "registry/x/theme.json", type: "registry:theme" }], ALIASES);
  assert(out.length === 0, `expected no target, got ${JSON.stringify(out)}`);
});

// ---------------------------------------------------------------------------
// (2) checkGuard — the whole decision, as one pure function.
// ---------------------------------------------------------------------------
console.log("checkGuard:");
await testCase("a payload naming a protected file, no override: blocked, not allowed", () => {
  const targetPaths = resolveTargetPaths(BUTTON_CONTAINING_PAYLOAD, ALIASES);
  const { blocked, allowed, overrideUsed } = checkGuard({ targetPaths, allowlist: ALLOWLIST, override: false });
  assert(blocked.includes("components/ui/button.tsx"), `expected button.tsx blocked, got ${JSON.stringify(blocked)}`);
  assert(allowed === false, "must not be allowed with no override");
  assert(overrideUsed === false, "override was not given");
});
await testCase("the SAME payload with the override given: allowed, and the override is recorded as used", () => {
  const targetPaths = resolveTargetPaths(BUTTON_CONTAINING_PAYLOAD, ALIASES);
  const { blocked, allowed, overrideUsed } = checkGuard({ targetPaths, allowlist: ALLOWLIST, override: true });
  assert(blocked.includes("components/ui/button.tsx"));
  assert(allowed === true, "the explicit override must let it proceed");
  assert(overrideUsed === true, "the override's use must be recorded");
});
await testCase("a payload naming no protected file: allowed, no false positive", () => {
  const targetPaths = resolveTargetPaths(NON_PROTECTED_PAYLOAD, ALIASES);
  const { blocked, allowed } = checkGuard({ targetPaths, allowlist: ALLOWLIST, override: false });
  assert(blocked.length === 0, `expected nothing blocked, got ${JSON.stringify(blocked)}`);
  assert(allowed === true, "an install touching no protected file must never be refused");
});

// ---------------------------------------------------------------------------
// (3) resolveTargetPathsFromDryRun — the named FALLBACK, exercised so it is
//     never dead code nobody has run.
// ---------------------------------------------------------------------------
console.log("resolveTargetPathsFromDryRun:");
await testCase("recovers project-relative paths from a dry-run transcript", () => {
  const out = resolveTargetPathsFromDryRun(
    `The following files will be created or updated:\n  - ${WEB_ROOT}/components/ui/pagination.tsx\n  - ${WEB_ROOT}/components/ui/button.tsx\n`,
    WEB_ROOT,
  );
  assert(out.includes("components/ui/pagination.tsx") && out.includes("components/ui/button.tsx"), `got ${JSON.stringify(out)}`);
});

// ---------------------------------------------------------------------------
// (4) main() — THE ACCEPTANCE CRITERIA THEMSELVES, end to end through an
//     INJECTED resolver and an INJECTED spawn (no network, no real install,
//     no real file ever touched by this selftest).
// ---------------------------------------------------------------------------
console.log("main():");

function fakeDeps(payload, spawnCalls) {
  return {
    resolveFiles: async () => payload,
    spawnAdd: (args) => {
      spawnCalls.push(args);
      return 0;
    },
    log: () => {},
  };
}

await testCase("a protected payload, no override: aborts non-zero, never spawns the CLI", async () => {
  const spawnCalls = [];
  const code = await main(["pagination"], {}, fakeDeps(BUTTON_CONTAINING_PAYLOAD, spawnCalls));
  assert(code !== 0, "must exit non-zero");
  assert(spawnCalls.length === 0, "the real install must never be reached");
});

await testCase("the SAME protected payload with --overwrite, --yes and --all forwarded: STILL aborts", async () => {
  // The whole point: the CLI's own flags reach only the CLI, which is never invoked once the
  // guard aborts — the guard's own decision does not consult them at all.
  const spawnCalls = [];
  const code = await main(["pagination", "--overwrite", "--yes", "--all"], {}, fakeDeps(BUTTON_CONTAINING_PAYLOAD, spawnCalls));
  assert(code !== 0, "must still abort regardless of which CLI flags were passed");
  assert(spawnCalls.length === 0);
});

await testCase("the SAME protected payload with stdin NOT a TTY: STILL aborts", async () => {
  const originalIsTTY = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    const spawnCalls = [];
    const code = await main(["pagination"], {}, fakeDeps(BUTTON_CONTAINING_PAYLOAD, spawnCalls));
    assert(code !== 0, "a non-interactive run must abort exactly like an interactive one");
    assert(spawnCalls.length === 0);
  } finally {
    process.stdin.isTTY = originalIsTTY;
  }
});

await testCase("the override env var lets the protected payload proceed, and the CLI is invoked", async () => {
  const spawnCalls = [];
  const code = await main(["pagination"], { [OVERRIDE_ENV_VAR]: "1" }, fakeDeps(BUTTON_CONTAINING_PAYLOAD, spawnCalls));
  assert(code === 0, "the override must let the install proceed");
  assert(spawnCalls.length === 1 && spawnCalls[0].includes("pagination"), "the CLI must actually be invoked once overridden");
});

await testCase("a non-protected payload installs through the guard unchanged — no false positive", async () => {
  const spawnCalls = [];
  const code = await main(["alert"], {}, fakeDeps(NON_PROTECTED_PAYLOAD, spawnCalls));
  assert(code === 0);
  assert(spawnCalls.length === 1 && spawnCalls[0].includes("alert"));
});

await testCase("`button.tsx` is byte-identical ACROSS a refused run whose writer WOULD have written it", async () => {
  // THE CASE THIS REPLACES read the same file twice in a row with nothing between the reads —
  // it could not fail, and it wrapped no install attempt. A control that cannot go red is an
  // assertion. This one hashes `button.tsx`, then drives `main()` on the protected payload with
  // an injected writer that REALLY WRITES (to a throwaway file under the OS temp dir, never into
  // the repo) the moment it is entered, then hashes again. If the guard ever let the payload
  // through, the writer would run, the marker file would exist, and this case would fail — so
  // the unchanged hash is evidence about the guard rather than about the absence of a writer.
  const buttonPath = join(WEB_ROOT, "components", "ui", "button.tsx");
  const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  const before = hash(buttonPath);

  const marker = join(mkdtempSync(join(tmpdir(), "ui-add-guard-")), "the-writer-ran.txt");
  const lines = [];
  const code = await main(["pagination"], {}, {
    resolveFiles: async () => BUTTON_CONTAINING_PAYLOAD,
    // A writer with real side effects, standing exactly where the real `shadcn add` stands.
    spawnAdd: (args) => {
      writeFileSync(marker, `the guard let ${JSON.stringify(args)} through\n`, "utf8");
      return 0;
    },
    log: (line) => lines.push(String(line)),
  });

  assert(code !== 0, "the run must be refused");
  assert(!existsSync(marker), "the injected writer RAN — the guard let a protected payload through");
  assert(hash(buttonPath) === before, "button.tsx changed during this selftest run");

  // …and the refusal NAMES the file, which is the whole disclosure a human acts on. The
  // earlier cases silenced `log` and so could not see this.
  const said = lines.join("\n");
  assert(/components\/ui\/button\.tsx/.test(said),
    `the refusal must name components/ui/button.tsx; it said:\n${said}`);
  assert(/REFUSING/.test(said), `the refusal must say so in as many words; it said:\n${said}`);
  assert(new RegExp(OVERRIDE_ENV_VAR).test(said),
    "…and must name the override, or a blocked human has no lawful way forward");
});

// ---------------------------------------------------------------------------
// (5) THE ALLOWLIST ITSELF — data, not logic; adding a file is a one-line
//     edit, demonstrated here as a fixture (never mutating the real file).
// ---------------------------------------------------------------------------
console.log("the allowlist is data:");
await testCase("protected-components.json parses as a flat array and names button.tsx and pagination.tsx", () => {
  assert(ALLOWLIST.includes("components/ui/button.tsx"), "button.tsx must be protected on landing");
  assert(ALLOWLIST.includes("components/ui/pagination.tsx"), "pagination.tsx joins once #771 settles — it has, in this branch");
});
await testCase("adding a NEW file to the allowlist is a one-line data edit — no guard-code change", () => {
  const fixtureText = JSON.stringify([...ALLOWLIST, "components/ui/some-future-file.tsx"]);
  const extended = loadAllowlist(fixtureText);
  const targetPaths = resolveTargetPaths(
    [{ path: "registry/base-nova/ui/some-future-file.tsx", type: "registry:ui" }],
    ALIASES,
  );
  const { blocked } = checkGuard({ targetPaths, allowlist: extended, override: false });
  assert(blocked.includes("components/ui/some-future-file.tsx"), "the guard must catch a file added purely as data, with no code change");
});

// ---------------------------------------------------------------------------
// (6) A throwaway fixture tree, driving `main()`'s REAL fs reads (components.json
//     + the real protected-components.json) — proves the wiring end to end, still
//     with an injected resolver so no network is reached.
// ---------------------------------------------------------------------------
console.log("main() against the real repo's own components.json and allowlist:");
await testCase("the guard is reachable from the `ui:add` package script", () => {
  // RENAMED (review 2026-09-15). The old title said "run as a real subprocess, refuses a fixture
  // payload naming button.tsx" and then asserted a package.json string — a green name that lied
  // about what had been proved. The refusal itself is proved by the `main()` cases above (with a
  // writer that really writes); what THIS case checks is the one thing they cannot: that the
  // entry point a human actually types is wired to the guarded module.
  const pkg = JSON.parse(readFileSync(join(WEB_ROOT, "package.json"), "utf8"));
  assert(pkg.scripts["ui:add"] === "node scripts/ui-add.mjs", "the guard must be reachable from a named package script");
});

await testCase("scripts/ui-add.mjs runs as a REAL subprocess and exits non-zero on its own refusal path", () => {
  // The other half of the wiring: that the module is executable as a PROGRAM — its main-guard
  // fires, its promise is awaited, and its return code becomes the process's exit code. A
  // subprocess run of the GUARD's refusal is not reachable without a network call inside
  // resolveRegistryItems (and a gate every PR runs may not make one), so this drives the one
  // refusal path the entry point owns with no network at all: no component named. It proves the
  // exit-code plumbing that every `pnpm ui:add` refusal, guard included, depends on.
  const out = spawnSync(process.execPath, [join(WEB_ROOT, "scripts", "ui-add.mjs")],
    { cwd: WEB_ROOT, encoding: "utf8" });
  assert(out.status === 1, `the entry point must exit 1, got ${out.status} (signal ${out.signal})`);
  assert(/\[ui-add\]/.test(out.stdout ?? ""), `the entry point must say what it did; stdout was:\n${out.stdout}`);
});

console.log("");
if (failures > 0) {
  console.error(`[check-ui-add-guard.selftest] ${failures} case(s) FAILED.`);
  process.exit(1);
} else {
  console.log("[check-ui-add-guard.selftest] all cases passed.");
  process.exit(0);
}
