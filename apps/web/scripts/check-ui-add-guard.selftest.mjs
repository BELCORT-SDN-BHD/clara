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
  classifyDependencies,
  loadAllowlist,
  main,
  resolveTargetPaths,
  resolveTargetPathsFromDryRun,
  restoreFileSnapshot,
  snapshotFile,
  LOCAL_DEPENDENCY_NAMES,
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

/** #989's own measured incident: a `combobox` install whose flattened closure
 *  names the protected `button.tsx` ALONGSIDE four files that are NOT
 *  protected — three already-vendored (`input.tsx`, `textarea.tsx`,
 *  `input-group.tsx`, all listed as `overwrite` targets) and one new
 *  (`combobox.tsx`) — exactly the shape `resolveRegistryItems(["combobox"])`
 *  returns for the real registry today (verified live,
 *  `CLARA_UI_ADD_OVERWRITE=1 pnpm ui:add combobox --dry-run`, recorded in
 *  this branch's delivering report). ONLY `button.tsx` is on the allowlist —
 *  `pagination.tsx` never appears in this closure. */
const COMBOBOX_PAYLOAD = [
  { path: "registry/base-nova/ui/button.tsx", type: "registry:ui" },
  { path: "registry/base-nova/ui/input.tsx", type: "registry:ui" },
  { path: "registry/base-nova/ui/textarea.tsx", type: "registry:ui" },
  { path: "registry/base-nova/ui/input-group.tsx", type: "registry:ui" },
  { path: "registry/base-nova/ui/combobox.tsx", type: "registry:ui" },
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
await testCase("[#989] a payload naming ONE protected file alongside non-protected ones, no override: allowed to proceed PARTIALLY — blocked names only the protected file, installable names the rest", () => {
  const targetPaths = resolveTargetPaths(COMBOBOX_PAYLOAD, ALIASES);
  const { blocked, installable, allowed, overrideUsed } = checkGuard({ targetPaths, allowlist: ALLOWLIST, override: false });
  assert(JSON.stringify(blocked) === JSON.stringify(["components/ui/button.tsx"]),
    `expected only button.tsx blocked, got ${JSON.stringify(blocked)}`);
  assert(
    ["components/ui/combobox.tsx", "components/ui/input-group.tsx", "components/ui/input.tsx", "components/ui/textarea.tsx"]
      .every((p) => installable.includes(p)),
    `expected the four non-protected files installable, got ${JSON.stringify(installable)}`);
  assert(!installable.includes("components/ui/button.tsx"), "the protected file must never appear as installable");
  assert(allowed === true, "a payload where SOME files are protected and others are not must be allowed to proceed partially, never aborted whole");
  assert(overrideUsed === false, "no override was given");
});
await testCase("[#989] a payload where EVERY file is protected, no override: still not allowed — a partial install with nothing left to write is not partial, it is the same abort as before", () => {
  // BUTTON_CONTAINING_PAYLOAD resolves to button.tsx AND pagination.tsx — BOTH
  // on the allowlist — so this is the genuine all-protected corner case the
  // original all-or-nothing abort still owns.
  const targetPaths = resolveTargetPaths(BUTTON_CONTAINING_PAYLOAD, ALIASES);
  const { blocked, installable, allowed } = checkGuard({ targetPaths, allowlist: ALLOWLIST, override: false });
  assert(installable.length === 0, `expected nothing installable, got ${JSON.stringify(installable)}`);
  assert(blocked.length === 2, `expected both files blocked, got ${JSON.stringify(blocked)}`);
  assert(allowed === false, "an install that would write NOTHING but protected files must still abort");
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

/** #969 — `resolveDependencies`/`stripLocalDependencies` default to no-ops here (no
 *  dependency, nothing ever to strip) so every EXISTING `fakeDeps` call site — none of which
 *  concern themselves with dependencies — keeps working unchanged and network-free; a case
 *  that DOES care overrides them via `extra`.
 *  #989 — `backupProtectedFiles`/`restoreProtectedFiles`/`rewriteLocalImports` default to
 *  no-ops FOR THE SAME REASON: no EXISTING call site's payload is ever partial (every fixture
 *  above is either fully blocked or fully clean), so these three are never reached by them —
 *  only the NEW partial-install cases below override them, and never touch a real file. */
function fakeDeps(payload, spawnCalls, extra = {}) {
  return {
    resolveFiles: async () => payload,
    resolveDependencies: async () => ({ dependencies: [], devDependencies: [] }),
    spawnAdd: (args) => {
      spawnCalls.push(args);
      return 0;
    },
    stripLocalDependencies: () => 0,
    backupProtectedFiles: () => new Map(),
    restoreProtectedFiles: () => 0,
    rewriteLocalImports: () => [],
    log: () => {},
    ...extra,
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
// (4a1) #989 — snapshotFile/restoreFileSnapshot: the primitive AC2's byte-
//        identity guarantee is actually built on. Driven against a throwaway
//        temp file, never a real repo file, so this proves the REAL fs
//        read/write logic (not an injected fake) without ever risking
//        button.tsx itself.
// ---------------------------------------------------------------------------
console.log("snapshotFile / restoreFileSnapshot (#989):");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

await testCase("round-trips an EXISTING file's bytes exactly, even after it is overwritten in between — the shape a forced --overwrite produces", () => {
  const dir = mkdtempSync(join(tmpdir(), "ui-add-guard-snapshot-"));
  const target = join(dir, "protected.tsx");
  writeFileSync(target, "export const ORIGINAL = true;\n", "utf8");
  const before = sha256(readFileSync(target));

  const snapshot = snapshotFile(target);
  assert(snapshot.existed === true, "the file exists — the snapshot must say so");

  writeFileSync(target, "export const OVERWRITTEN = true;\n", "utf8"); // simulates the CLI's forced --overwrite
  assert(sha256(readFileSync(target)) !== before, "the simulated overwrite must actually change the file, or this proves nothing");

  restoreFileSnapshot(target, snapshot);
  assert(sha256(readFileSync(target)) === before, "restoreFileSnapshot must put the ORIGINAL bytes back exactly");
});

await testCase("removes a file that did not exist before, if the CLI created one where the snapshot found none", () => {
  const dir = mkdtempSync(join(tmpdir(), "ui-add-guard-snapshot-"));
  const target = join(dir, "new-protected.tsx");

  const snapshot = snapshotFile(target);
  assert(snapshot.existed === false && snapshot.content === null, "a file that does not exist must snapshot as such");

  writeFileSync(target, "export const CREATED = true;\n", "utf8"); // simulates the CLI creating it
  assert(existsSync(target));

  restoreFileSnapshot(target, snapshot);
  assert(!existsSync(target), "a protected file that did not exist before must not exist after restore");
});

// ---------------------------------------------------------------------------
// (4a2) #989 — partial install: SOME files in the closure are protected,
//        others are not. The CLI is invoked (never the whole-payload abort
//        above), forced to `--overwrite` so a non-interactive run never hangs
//        on a per-file prompt for the OTHER, non-protected already-vendored
//        files in the same closure (input.tsx etc.), and the protected
//        file(s) are backed up before that call and restored after — so the
//        guard's OWN restore is what proves byte-identity, never the CLI's
//        behaviour (the CLI is never trusted to leave it alone once
//        `--overwrite` is forced).
// ---------------------------------------------------------------------------
console.log("partial install, protected file(s) skipped (#989):");

await testCase("[AC1][AC2] a payload naming ONE protected file alongside installable ones, no override, REAL run: the CLI IS invoked with --overwrite forced, the protected file is backed up then restored, and the report names it skipped and why — never REFUSING", async () => {
  const spawnCalls = [];
  const backupCalls = [];
  const restoreCalls = [];
  const lines = [];
  const fakeBackup = new Map([["components/ui/button.tsx", { existed: true, content: Buffer.from("ORIGINAL BUTTON BYTES") }]]);
  const code = await main(["combobox"], {}, fakeDeps(COMBOBOX_PAYLOAD, spawnCalls, {
    backupProtectedFiles: (paths) => { backupCalls.push(paths); return fakeBackup; },
    restoreProtectedFiles: (backups) => { restoreCalls.push(backups); return backups.size; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 0, "a successful partial install must exit 0");
  assert(spawnCalls.length === 1, "the CLI must be invoked for a partial payload — never the whole-payload abort");
  assert(spawnCalls[0].includes("combobox"));
  assert(spawnCalls[0].includes("--overwrite"),
    `a partial install must force --overwrite so the OTHER non-protected already-vendored files in the closure do not hang a non-interactive run on a per-file prompt; got ${JSON.stringify(spawnCalls[0])}`);
  assert(backupCalls.length === 1 && JSON.stringify(backupCalls[0]) === JSON.stringify(["components/ui/button.tsx"]),
    `expected exactly one backup call naming only the protected file, got ${JSON.stringify(backupCalls)}`);
  assert(restoreCalls.length === 1 && restoreCalls[0] === fakeBackup,
    "the SAME snapshot backupProtectedFiles returned must be the one restoreProtectedFiles receives");
  const said = lines.join("\n");
  assert(/SKIPPED/.test(said), `expected the report to say SKIPPED; it said:\n${said}`);
  assert(/components\/ui\/button\.tsx/.test(said), `expected the report to name button.tsx; it said:\n${said}`);
  assert(!/REFUSING/.test(said), "a partial install must never say REFUSING — it is not aborted");
});

await testCase("[AC3] the SAME partial payload WITH the override: proceeds as the override always did — no forced --overwrite, no backup, no restore, the protected file is genuinely overwritten", async () => {
  const spawnCalls = [];
  const backupCalls = [];
  const restoreCalls = [];
  const code = await main(["combobox"], { [OVERRIDE_ENV_VAR]: "1" }, fakeDeps(COMBOBOX_PAYLOAD, spawnCalls, {
    backupProtectedFiles: (paths) => { backupCalls.push(paths); return new Map(); },
    restoreProtectedFiles: (backups) => { restoreCalls.push(backups); return 0; },
  }));
  assert(code === 0);
  assert(spawnCalls.length === 1 && spawnCalls[0].includes("combobox"));
  assert(!spawnCalls[0].includes("--overwrite"),
    "the override path is unchanged: it forwards the caller's own args verbatim, it does not force --overwrite itself");
  assert(backupCalls.length === 0, "an override run never needs to protect a file it is deliberately overwriting");
  assert(restoreCalls.length === 0, "an override run must never restore what the caller asked to overwrite");
});

await testCase("a REAL run whose payload is fully installable (no protected file at all): unaffected — no forced flag, no backup, no restore, same as before #989", async () => {
  const spawnCalls = [];
  const backupCalls = [];
  const code = await main(["alert"], {}, fakeDeps(NON_PROTECTED_PAYLOAD, spawnCalls, {
    backupProtectedFiles: (paths) => { backupCalls.push(paths); return new Map(); },
  }));
  assert(code === 0);
  assert(spawnCalls.length === 1 && JSON.stringify(spawnCalls[0]) === JSON.stringify(["alert"]),
    `a non-partial payload must forward argv verbatim, unmodified; got ${JSON.stringify(spawnCalls[0])}`);
  assert(backupCalls.length === 0, "nothing to back up when nothing is blocked");
});

await testCase("a caller who ALREADY passed --overwrite for a partial payload: the guard never duplicates the flag", async () => {
  const spawnCalls = [];
  const code = await main(["combobox", "--overwrite"], {}, fakeDeps(COMBOBOX_PAYLOAD, spawnCalls));
  assert(code === 0);
  assert(spawnCalls[0].filter((a) => a === "--overwrite").length === 1,
    `--overwrite must appear exactly once, got ${JSON.stringify(spawnCalls[0])}`);
});

await testCase("[AC1] a --dry-run on the SAME partial payload: the CLI still previews (dry-run always did), nothing is backed up or restored (nothing was written), and the report says what a REAL run would skip", async () => {
  const spawnCalls = [];
  const backupCalls = [];
  const restoreCalls = [];
  const lines = [];
  const code = await main(["combobox", "--dry-run"], {}, fakeDeps(COMBOBOX_PAYLOAD, spawnCalls, {
    backupProtectedFiles: (paths) => { backupCalls.push(paths); return new Map(); },
    restoreProtectedFiles: (backups) => { restoreCalls.push(backups); return 0; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 0);
  assert(spawnCalls.length === 1 && spawnCalls[0].includes("--dry-run"));
  assert(!spawnCalls[0].includes("--overwrite"),
    "a dry run writes nothing — there is no prompt to suppress, so nothing forces --overwrite for a preview");
  assert(backupCalls.length === 0, "a dry run writes nothing — there is nothing to back up");
  assert(restoreCalls.length === 0, "a dry run writes nothing — there is nothing to restore");
  const said = lines.join("\n");
  assert(/components\/ui\/button\.tsx/.test(said) && /skip/i.test(said),
    `expected the dry-run report to name what a real run would skip; it said:\n${said}`);
});

// ---------------------------------------------------------------------------
// (4b) #969 — the `cn` dependency stand-in: classification, reporting, and the
//      automated strip. AVATAR_PAYLOAD/AVATAR_DEPS below are the real, live-measured
//      shape (see the file header): `resolveRegistryItems(["avatar"])` on the pinned
//      4.19.0 today returns exactly `{dependencies: ["cn"], files: [...]}`.
// ---------------------------------------------------------------------------
console.log("the `cn` dependency stand-in (#969):");

const AVATAR_PAYLOAD = [{ path: "registry/base-nova/ui/avatar.tsx", type: "registry:ui" }];
const AVATAR_DEPS = { dependencies: ["cn"], devDependencies: [] };
const EXTERNAL_DEPS = { dependencies: ["date-fns"], devDependencies: [] };

await testCase("classifyDependencies splits the one known local stand-in from everything else, de-duplicated", () => {
  assert(LOCAL_DEPENDENCY_NAMES.includes("cn"), "cn must be the named local stand-in");
  const { local, external } = classifyDependencies(["date-fns", "cn", "cn", "zod"]);
  assert(JSON.stringify(local) === JSON.stringify(["cn"]), `got local=${JSON.stringify(local)}`);
  assert(JSON.stringify(external) === JSON.stringify(["date-fns", "zod"]), `got external=${JSON.stringify(external)}`);
});
await testCase("classifyDependencies on an empty or dependency-free list returns both empty", () => {
  const { local, external } = classifyDependencies([]);
  assert(local.length === 0 && external.length === 0, `got ${JSON.stringify({ local, external })}`);
});

await testCase("[AC1] an item resolving `cn`, no override, real run: the CLI is invoked, THEN the guard strips cn — no manual revert needed", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const lines = [];
  const code = await main(["avatar"], {}, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 0, "a successful install + successful strip must exit 0");
  assert(spawnCalls.length === 1 && spawnCalls[0].includes("avatar"), "the real CLI must still be invoked");
  assert(stripCalls.length === 1 && JSON.stringify(stripCalls[0]) === JSON.stringify(["cn"]),
    `expected exactly one strip call for ["cn"], got ${JSON.stringify(stripCalls)}`);
  const said = lines.join("\n");
  // [AC2] the guard reports what it did about cn.
  assert(/dropped/i.test(said) && /\bcn\b/.test(said), `expected the log to report dropping cn; it said:\n${said}`);
});

await testCase("[AC3] a --dry-run names the dependencies the item would add, including the one classified as local — and never strips (nothing was written)", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const lines = [];
  const code = await main(["avatar", "--dry-run"], {}, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 0);
  assert(stripCalls.length === 0, "a dry run writes nothing — there must be nothing to strip");
  const said = lines.join("\n");
  assert(/\bcn\b/.test(said) && /local/i.test(said), `expected the dry-run report to name cn as local; it said:\n${said}`);
});

await testCase("the override lets a genuine external `cn` survive: no strip call, and the log says so", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const lines = [];
  const code = await main(["avatar"], { [OVERRIDE_ENV_VAR]: "1" }, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 0);
  assert(stripCalls.length === 0, "the override must skip the strip entirely — the caller wants cn kept");
  const said = lines.join("\n");
  assert(new RegExp(OVERRIDE_ENV_VAR).test(said) && /\bcn\b/.test(said),
    `expected the override's effect on cn to be named; it said:\n${said}`);
});

await testCase("[AC4] an item whose dependencies do NOT touch cn behaves exactly as before — no strip call, no cn claim in the log", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const lines = [];
  const code = await main(["alert"], {}, fakeDeps(NON_PROTECTED_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => EXTERNAL_DEPS,
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 0);
  assert(stripCalls.length === 0, "no local dependency was resolved — nothing to strip");
  const said = lines.join("\n");
  assert(!/\bcn\b/.test(said), `expected no mention of cn for an item that never resolved it; it said:\n${said}`);
  assert(/date-fns/.test(said), "a genuine external dependency should still be named in the report");
});

await testCase("[AC4] a PROTECTED payload that also resolves cn is still refused on the protected file FIRST — dependencies are never even resolved, nothing is stripped", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  let dependenciesResolved = false;
  const code = await main(["pagination"], {}, fakeDeps(BUTTON_CONTAINING_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => { dependenciesResolved = true; return AVATAR_DEPS; },
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
  }));
  assert(code !== 0, "the protected-file refusal must be unaffected by #969");
  assert(spawnCalls.length === 0, "the CLI must never be invoked");
  assert(dependenciesResolved === false, "dependency resolution is wasted work on a refusal that never installs anything");
  assert(stripCalls.length === 0);
});

await testCase("(L05B-S03) spawnAdd exits non-zero AFTER already installing cn (the pinned CLI installs dependencies BEFORE it writes files): the guard still strips cn instead of silently returning", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const lines = [];
  const code = await main(["avatar"], {}, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    spawnAdd: (args) => { spawnCalls.push(args); return 1; },
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 1, `a failed add must still propagate the CLI's own exit code, got ${code}`);
  assert(stripCalls.length === 1 && JSON.stringify(stripCalls[0]) === JSON.stringify(["cn"]),
    `expected the guard to strip cn even though spawnAdd itself failed (it already installed cn before failing), got ${JSON.stringify(stripCalls)}`);
  const said = lines.join("\n");
  assert(/\bcn\b/.test(said), `expected the log to mention cn on this path; it said:\n${said}`);
});

await testCase("(L05B-S03) a --dry-run that itself exits non-zero never strips — a dry run writes nothing, whatever spawnAdd's own exit code, so the install-before-write ordering guarantee does not apply", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const code = await main(["avatar", "--dry-run"], {}, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    spawnAdd: (args) => { spawnCalls.push(args); return 1; },
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
  }));
  assert(code === 1, `a failed dry run must still propagate its own exit code, got ${code}`);
  assert(stripCalls.length === 0, "a dry run writes nothing — there is still nothing to strip, even on a failed exit");
});

await testCase("(L05B-S03) a failed add with cn resolved and the override set: no strip call — the caller wants cn kept regardless of how the add went", async () => {
  const spawnCalls = [];
  const stripCalls = [];
  const code = await main(["avatar"], { [OVERRIDE_ENV_VAR]: "1" }, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    spawnAdd: (args) => { spawnCalls.push(args); return 1; },
    stripLocalDependencies: (names) => { stripCalls.push(names); return 0; },
  }));
  assert(code === 1);
  assert(stripCalls.length === 0, "the override must skip the strip even when spawnAdd itself failed");
});

await testCase("a FAILED strip is surfaced loudly, not swallowed: non-zero exit, a WARNING naming cn", async () => {
  const spawnCalls = [];
  const lines = [];
  const code = await main(["avatar"], {}, fakeDeps(AVATAR_PAYLOAD, spawnCalls, {
    resolveDependencies: async () => AVATAR_DEPS,
    stripLocalDependencies: () => 17,
    log: (l) => lines.push(String(l)),
  }));
  assert(code === 17, `a failed cleanup must propagate its own exit code, got ${code}`);
  const said = lines.join("\n");
  assert(/WARNING/.test(said) && /\bcn\b/.test(said), `expected a loud warning naming cn; it said:\n${said}`);
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
