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

import { fileURLToPath } from "node:url";

const SHIM_URL = new URL("./shims/nextImage.mjs", import.meta.url).href;
const SHIM_PATH = fileURLToPath(SHIM_URL);

export async function resolve(specifier, context, nextResolve) {
  // The shim imports `next/dist/...`, never `next/image`, so this cannot
  // recurse — the parent check is belt-and-braces against a future edit to the
  // shim that reaches for the bare specifier again.
  if (specifier === "next/image" && context.parentURL !== SHIM_URL) {
    return { url: SHIM_URL, shortCircuit: true, format: "module" };
  }
  return nextResolve(specifier, context);
}

/** Exported for `tests/next-image-interop.test.ts`, so the cell asserts against
 *  the path this hook actually redirects to rather than a re-typed copy. */
export const NEXT_IMAGE_SHIM_PATH = SHIM_PATH;
