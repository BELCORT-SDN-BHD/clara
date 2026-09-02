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
// component. `test/nextImageResolve.mjs` is what points `next/image` here, and
// `tests/next-image-interop.test.ts` is the cell that reds if this shim ever
// stops handing back a renderable component.

import external from "next/dist/shared/lib/image-external.js";

/** The wrapper object's real default, or the module itself if a future Next
 *  version ships this entry as true ESM (in which case `external` IS the
 *  component and there is nothing to unwrap). */
const resolved = external?.default ?? external;

export default resolved;
export const getImageProps = external?.getImageProps ?? external?.default?.getImageProps;
