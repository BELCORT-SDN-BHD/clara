// Test bootstrap for apps/web's node:test suite (mirrors
// apps/dashboard/test/bootstrap.mjs). Loaded via `--import` BEFORE tsx so it can
// point tsx at a react-jsx tsconfig — the app tsconfig uses `jsx: preserve` (Next
// injects the runtime), which esbuild would otherwise compile to the classic
// `React.createElement` and crash. No CSS-module stub needed here: this app's
// components use Tailwind utility classNames, not `*.module.css` imports.

import { fileURLToPath } from "node:url";

process.env.TSX_TSCONFIG_PATH = fileURLToPath(new URL("../tsconfig.test.json", import.meta.url));
