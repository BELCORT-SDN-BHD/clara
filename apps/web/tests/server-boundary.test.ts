// THE SERVER BOUNDARY — no Client Component may reach the invite courier or the
// mail transport. P4-4, folding Codex round 2's N6 and closing L1.
//
// WHY THIS FILE EXISTS RATHER THAN `import "server-only"`. That package is not
// installed in this workspace and a lane may not run `pnpm install`, so adding the
// import would red every gate rather than protect anything. The estate's own
// mechanism for the identical question is P4-5's import-closure walk in
// `tests/firm-scope-db-pins.test.ts` ("client-importable modules never drag
// next/headers into the bundle"), minted when P4-5 hit this exact class. This is
// that instrument, hardened.
//
// WHAT ROUND 2 FOUND WRONG WITH THE FIRST ATTEMPT (N6), and it was fair: the walk
// started from FIVE HAND-LISTED roots and followed only plain static imports. Both
// halves are the same defect in different clothes — the guard could be true of the
// tree it was pointed at while a new `"use client"` file, a re-export barrel or a
// `await import()` walked straight past it. A guard whose coverage depends on
// somebody remembering to extend a list is a guard that will one day be extended
// too late.
//
// SO: the roots are DISCOVERED from the tree (every file carrying a `"use client"`
// directive), and the walk follows every bundler-relevant VALUE edge — static
// imports, bare side-effect imports, `export … from` re-exports (including
// `export *`), and dynamic `import()`. Type-only edges are still NOT followed:
// `import type` is erased at compile time and drags nothing into a bundle, so
// following it would red modules that are perfectly safe.
//
// THE WALK IS DRIVEN THROUGH AN INJECTABLE FILESYSTEM so its own edge cases can be
// measured against a SYNTHETIC tree, without writing throwaway files into the repo
// (which would be visible to every other gate, and to git).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../test/sourceOracle";

const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** The two modules that must never be reachable from a browser bundle: one holds
 *  the service-role key, the other holds Clara's plaintext invite token. */
const SERVER_ONLY = ["lib/members/invite-mail.ts", "lib/members/courier.ts"];

type Tree = {
  /** Every source file in the tree, as repo-relative POSIX paths. */
  files(): string[];
  read(webRelative: string): string;
  exists(webRelative: string): boolean;
};

// ---------------------------------------------------------------------------
// THE WALK
// ---------------------------------------------------------------------------

/**
 * Every specifier a module pulls in AT RUNTIME. Four shapes, because a bundler
 * follows all four:
 *   · `import x from "m"` / `import { x } from "m"`     — static value import
 *   · `import "m"`                                       — side-effect import
 *   · `export { x } from "m"` / `export * from "m"`      — RE-EXPORT (N6). A
 *     barrel file that re-exports the courier makes the courier part of every
 *     bundle that touches the barrel, and the first version of this walk could
 *     not see that edge at all.
 *   · `import("m")`                                       — DYNAMIC (N6). Deferred,
 *     but still bundled, and still shipped to a browser.
 * `import type` / `export type` are erased and deliberately NOT followed.
 */
export function runtimeSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  for (const m of code.matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
    if (/^\s*type\s/.test(m[1] as string)) continue;
    out.push(m[2] as string);
  }
  for (const m of code.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1] as string);
  for (const m of code.matchAll(/export\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
    if (/^\s*type\s/.test(m[1] as string)) continue;
    out.push(m[2] as string);
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1] as string);
  return out;
}

/** Resolve a relative or `@/`-aliased specifier to a file in the tree, or null
 *  for a bare package specifier (which this walk does not follow). */
function resolveLocal(tree: Tree, fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? spec.slice(2)
    : spec.startsWith(".")
      ? join(dirname(fromFile), spec).split(sep).join("/")
      : null;
  if (base === null) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${base}${ext}`;
    if (tree.exists(candidate)) return candidate;
  }
  return null;
}

/** The transitive runtime closure of one entry. */
export function closureOf(tree: Tree, entry: string): Set<string> {
  const files = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (files.has(current)) continue;
    files.add(current);
    for (const spec of runtimeSpecifiers(tree.read(current))) {
      const local = resolveLocal(tree, current, spec);
      if (local !== null) queue.push(local);
    }
  }
  return files;
}

/** Does this file open with a `"use client"` directive? Read as a DIRECTIVE — the
 *  first statement — not as a substring, so a file merely discussing the string in
 *  prose is not mistaken for a Client Component. */
export function isClientComponent(source: string): boolean {
  const code = stripComments(source).trimStart();
  return /^["']use client["']\s*;?/.test(code);
}

// ---------------------------------------------------------------------------
// THE REAL TREE
// ---------------------------------------------------------------------------

const SKIP = new Set(["node_modules", ".next", ".git", "public", "dist", ".turbo", ".open-next"]);

function walkDir(absolute: string, relative: string, out: string[]): void {
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const nextRelative = relative === "" ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) walkDir(join(absolute, entry.name), nextRelative, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(nextRelative);
  }
}

const realTree: Tree = {
  files: () => {
    const out: string[] = [];
    walkDir(WEB_ROOT, "", out);
    return out;
  },
  read: (p) => readFileSync(join(WEB_ROOT, p), "utf8"),
  exists: (p) => existsSync(join(WEB_ROOT, p)),
};

const ALL_FILES = realTree.files();
const CLIENT_ROOTS = ALL_FILES.filter((f) => isClientComponent(realTree.read(f)));

describe("N6: no Client Component in the tree reaches a server-only module", () => {
  test("the roots are DISCOVERED, not listed — and there are plenty of them", () => {
    // The control for the whole file. If discovery silently found nothing, every
    // assertion below would be vacuously true — the absence-from-the-wrong-
    // instrument class this repo has paid for more than once.
    assert.ok(ALL_FILES.length > 200, `the tree walk found only ${ALL_FILES.length} source files`);
    assert.ok(CLIENT_ROOTS.length > 20, `only ${CLIENT_ROOTS.length} "use client" files discovered`);
    for (const known of ["components/admin/members-panel.tsx", "components/admin/invite-dialog.tsx"]) {
      assert.ok(CLIENT_ROOTS.includes(known), `${known} is a Client Component but discovery missed it`);
    }
  });

  test("EVERY discovered Client Component's runtime closure excludes both server-only modules", () => {
    const offenders: string[] = [];
    for (const root of CLIENT_ROOTS) {
      const reached = closureOf(realTree, root);
      for (const forbidden of SERVER_ONLY) {
        if (reached.has(forbidden)) offenders.push(`${root} → ${forbidden}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "a Client Component reaches a module holding the service-role key or the plaintext invite token",
    );
  });

  test("the modules a client MAY import stay importable — this is a boundary, not a ban", () => {
    // `lib/members/doors.ts` and `lib/members/reads.ts` are the client's own
    // seams; if the walk started reporting those the boundary would be useless.
    for (const shared of ["lib/members/doors.ts", "lib/members/reads.ts"]) {
      const reached = closureOf(realTree, shared);
      for (const forbidden of SERVER_ONLY) {
        assert.ok(!reached.has(forbidden), `${shared} reaches ${forbidden}`);
      }
    }
  });

  test("VACUITY CONTROL: the walk really does find the transport from the courier", () => {
    const reached = closureOf(realTree, "lib/members/courier.ts");
    assert.ok(reached.has("lib/members/invite-mail.ts"), "the walk cannot see a one-hop edge");
    assert.ok(reached.has("lib/same-origin.ts"), "…nor a second one");
    assert.ok(reached.has("lib/firm/caller-context.ts"), "…nor the preflight's own read");
  });
});

// ---------------------------------------------------------------------------
// THE WALK'S OWN EDGE CASES, on a synthetic tree
// ---------------------------------------------------------------------------

function syntheticTree(files: Record<string, string>): Tree {
  return {
    files: () => Object.keys(files),
    read: (p) => files[p] ?? "",
    exists: (p) => Object.hasOwn(files, p),
  };
}

describe("N6: the three edges the first version of this walk could not see", () => {
  const COURIER = "lib/members/courier.ts";

  test("a DIRECT import from a new Client Component is detected", () => {
    const tree = syntheticTree({
      [COURIER]: "export function handleInviteRequest() {}\n",
      "components/new-panel.tsx": `"use client";\nimport { handleInviteRequest } from "@/lib/members/courier";\n`,
    });
    const roots = tree.files().filter((f) => isClientComponent(tree.read(f)));
    assert.deepEqual(roots, ["components/new-panel.tsx"], "discovery must find a root nobody listed");
    assert.ok(closureOf(tree, roots[0] as string).has(COURIER));
  });

  test("a RE-EXPORT barrel is detected — the edge that used to be invisible", () => {
    const tree = syntheticTree({
      [COURIER]: "export function handleInviteRequest() {}\n",
      "lib/members/index.ts": 'export { handleInviteRequest } from "./courier";\n',
      "components/new-panel.tsx": `"use client";\nimport { handleInviteRequest } from "@/lib/members/index";\n`,
    });
    assert.ok(
      closureOf(tree, "components/new-panel.tsx").has(COURIER),
      "a barrel re-exporting the courier puts it in every bundle that touches the barrel",
    );
  });

  test("an `export * from` barrel is detected too", () => {
    const tree = syntheticTree({
      [COURIER]: "export function handleInviteRequest() {}\n",
      "lib/members/index.ts": 'export * from "./courier";\n',
      "components/new-panel.tsx": `"use client";\nimport { handleInviteRequest } from "@/lib/members/index";\n`,
    });
    assert.ok(closureOf(tree, "components/new-panel.tsx").has(COURIER));
  });

  test("a DYNAMIC import is detected — deferred is still bundled", () => {
    const tree = syntheticTree({
      [COURIER]: "export function handleInviteRequest() {}\n",
      "components/new-panel.tsx":
        `"use client";\nasync function go() { const m = await import("@/lib/members/courier"); return m; }\n`,
    });
    assert.ok(closureOf(tree, "components/new-panel.tsx").has(COURIER));
  });

  test("RED-BEFORE: the OLD static-only walk missed all three", () => {
    // The measurement that makes N6 a real finding rather than a preference: the
    // previous specifier reader recognised only `import … from` and bare
    // `import "…"`, so each of the three shapes above resolved to nothing.
    const oldSpecifiers = (source: string): string[] => {
      const code = stripComments(source);
      const out: string[] = [];
      for (const m of code.matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
        if (/^\s*type\s/.test(m[1] as string)) continue;
        out.push(m[2] as string);
      }
      for (const m of code.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1] as string);
      return out;
    };
    assert.deepEqual(oldSpecifiers('export { x } from "./courier";'), [], "re-export was invisible");
    assert.deepEqual(oldSpecifiers('export * from "./courier";'), [], "export-star was invisible");
    assert.deepEqual(oldSpecifiers('const m = await import("./courier");'), [], "dynamic import was invisible");
    // …and the new reader sees each of them.
    assert.deepEqual(runtimeSpecifiers('export { x } from "./courier";'), ["./courier"]);
    assert.deepEqual(runtimeSpecifiers('export * from "./courier";'), ["./courier"]);
    assert.deepEqual(runtimeSpecifiers('const m = await import("./courier");'), ["./courier"]);
  });

  test("a TYPE-ONLY edge is still not followed, in either direction", () => {
    // Erased at compile time, so it drags nothing into a bundle. Following it
    // would red modules that are perfectly safe — `lib/read.ts` type-imports a
    // browser-only module today.
    assert.deepEqual(runtimeSpecifiers('import type { X } from "./courier";'), []);
    assert.deepEqual(runtimeSpecifiers('export type { X } from "./courier";'), []);
    assert.deepEqual(runtimeSpecifiers('import { x } from "./courier";'), ["./courier"]);
  });

  test("the client directive is read as a DIRECTIVE, not as a substring", () => {
    assert.equal(isClientComponent('"use client";\nexport const x = 1;'), true);
    assert.equal(isClientComponent("'use client'\nexport const x = 1;"), true);
    assert.equal(isClientComponent('// this file explains "use client"\nexport const x = 1;'), false);
    assert.equal(isClientComponent('export const doc = "use client";'), false);
  });
});
