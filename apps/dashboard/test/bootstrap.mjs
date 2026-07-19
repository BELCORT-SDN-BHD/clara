// Test bootstrap for the card-catalog parity test. Loaded via `--import` BEFORE
// tsx so it can (1) point tsx at a react-jsx tsconfig — the app tsconfig uses
// `jsx: preserve` (Next injects the runtime), which esbuild would otherwise
// compile to the classic `React.createElement` and crash; and (2) stub CSS-module
// imports so a component that imports `*.module.css` loads in a plain Node test
// process. A CSS-module class name resolves to its own key string, which is all a
// parity render needs. Zero new dependencies (tsx is a workspace devDependency;
// react-dom is a dashboard dependency).

import Module from "node:module";
import { fileURLToPath } from "node:url";

// (1) Automatic JSX runtime for the render probe.
process.env.TSX_TSCONFIG_PATH = fileURLToPath(new URL("../tsconfig.test.json", import.meta.url));

// (2) CSS-module stub. Deliberately NOT flagged __esModule so esbuild's __toESM
// interop synthesizes `.default` = this proxy (a default import `styles` → proxy).
const stylesProxy = new Proxy(
  {},
  { get: (_t, k) => (typeof k === "symbol" || k === "__esModule" ? undefined : String(k)) },
);
Module._extensions[".css"] = (mod) => {
  mod.exports = stylesProxy;
};
