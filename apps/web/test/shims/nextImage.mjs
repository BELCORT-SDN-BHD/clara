// THE `next/image` ESM-INTEROP SHIM — test runtime only.
//
// `next/image.js` is one line: `module.exports = require('./dist/shared/lib/
// image-external')`, and that inner module is TypeScript-compiled CJS, so its
// `module.exports` is the plain object `{ __esModule: true, default: Image,
// getImageProps }`. Webpack and Turbopack unwrap that shape (the `__esModule`
// convention is a BUNDLER convention), which is why `import Image from
// "next/image"` is correct — and the only correct — spelling in app code.
//
// Node's own ESM-to-CJS interop does NOT implement `__esModule`: the default
// import of a CJS module is `module.exports` itself. So under `node --test` the
// app's `Image` binding was that wrapper OBJECT, and React refused it with
// "Element type is invalid: … but got: object". `next/link` happens to escape
// this only because Next hangs its own extras onto the forwardRef component
// (`module.exports` there IS the component, with `.default` assigned back onto
// it); `next/image` does not do that.
//
// This shim resolves the same inner module and re-exports its real default, so
// the TEST runtime sees exactly what the BUILD runtime sees. It reaches into
// `next/dist/...` deliberately — that is the one place the unwrapped component
// actually lives, and doing it here keeps the reach inside `test/`, where a
// runtime bridge belongs, instead of putting an interop guess into a shipped
// component. `test/nextImageResolve.mjs` is what points `next/image` here.
//
// THE CELL THAT PROTECTS THIS is `components/brand-identity.test.tsx`, "the
// harness renders a REAL next/image component, not the CJS wrapper object". It
// reds two ways: if the redirect stops being registered (the marker below is
// then absent from the `next/image` namespace) and if this shim stops handing
// back something React can render.

import external from "next/dist/shared/lib/image-external.js";

/** The wrapper object's real default, or the module itself if a future Next
 *  version ships this entry as true ESM (in which case `external` IS the
 *  component and there is nothing to unwrap). */
const resolved = external?.default ?? external;

export default resolved;
export const getImageProps = external?.getImageProps ?? external?.default?.getImageProps;

/** The marker that makes the protecting cell MECHANICAL rather than a comment.
 *  `next/image` itself never exports this, so a test that sees it on the
 *  `next/image` namespace has proved the redirect in `nextImageResolve.mjs` is
 *  actually in effect — not merely that Next happened to ship a renderable
 *  default this week. */
export const RESOLVED_VIA_TEST_SHIM = true;
