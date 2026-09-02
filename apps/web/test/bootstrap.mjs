// Test bootstrap for apps/web's node:test suite (mirrors
// apps/dashboard/test/bootstrap.mjs). Loaded via `--import` BEFORE tsx so it can
// point tsx at a react-jsx tsconfig — the app tsconfig uses `jsx: preserve` (Next
// injects the runtime), which esbuild would otherwise compile to the classic
// `React.createElement` and crash. No CSS-module stub needed here: this app's
// components use Tailwind utility classNames, not `*.module.css` imports.

import { register } from "node:module";
import { fileURLToPath } from "node:url";

process.env.TSX_TSCONFIG_PATH = fileURLToPath(new URL("../tsconfig.test.json", import.meta.url));

// P6-6: `next/image` needs one resolution redirect under this runtime — Node's
// ESM-to-CJS interop does not implement the `__esModule` convention Next's
// image entry relies on, so the default import lands on a wrapper object React
// cannot render. `test/shims/nextImage.mjs` carries the full explanation;
// `test/nextImageResolve.mjs` is the hook. Registered here rather than in
// run-tests.mjs so a direct `node --import ./test/bootstrap.mjs --import tsx
// --test <file>` (how a single file gets run while debugging) behaves exactly
// like the manifest run.
register("./nextImageResolve.mjs", import.meta.url);
