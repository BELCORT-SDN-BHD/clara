import { defineNitroConfig } from "nitro/config";

// Express has no build system of its own; Nitro provides one and the
// `workflow/nitro` module enables the `"use workflow"` / `"use step"`
// directives (per the official Express getting-started guide).
export default defineNitroConfig({
  modules: ["workflow/nitro"],
  // Starts the Postgres world's embedded graphile-worker on server boot.
  plugins: ["plugins/startPgWorld.ts"],
  routes: {
    "/**": { handler: "./src/index.ts", format: "node" },
  },
});
