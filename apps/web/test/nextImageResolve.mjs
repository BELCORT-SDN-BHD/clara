// A module-resolution hook that points the bare specifier `next/image` at
// `test/shims/nextImage.mjs` under the node:test runtime, and at nothing else.
// The shim's own header explains WHY the redirect is needed; this file is only
// the wiring.
//
// SCOPE, STATED SO IT CANNOT DRIFT: the ONE specifier `next/image`, matched
// exactly (never a prefix, never `next/image-types/...`), and only inside a
// process that loaded `test/bootstrap.mjs`. Nothing about the shipped build
// passes through here — `next build` uses its own bundler resolution and never
// loads this file.

const SHIM_URL = new URL("./shims/nextImage.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  // The shim imports `next/dist/...`, never `next/image`, so this cannot
  // recurse — the parent check is belt-and-braces against a future edit to the
  // shim that reaches for the bare specifier again.
  if (specifier === "next/image" && context.parentURL !== SHIM_URL) {
    return { url: SHIM_URL, shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}

// PROVED BY: `components/brand-identity.test.tsx`, "the harness renders a REAL
// next/image component, not the CJS wrapper object". That cell reads
// `RESOLVED_VIA_TEST_SHIM` off the `next/image` namespace — a marker only the
// shim exports — so it reds if this hook stops being registered, and it reds
// again on the component shape if the shim stops unwrapping correctly. There
// is deliberately no exported path constant here: nothing needs the path, and
// an export whose only consumer is a comment is how a citation rots.
