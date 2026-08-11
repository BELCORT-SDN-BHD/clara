import { defineNitroConfig } from "nitro/config";

// Express has no build system of its own; Nitro provides one and the
// `workflow/nitro` module enables the `"use workflow"` / `"use step"`
// directives (the durable Workflow DevKit substrate proven in the Slice-0
// spike — see docs/ARCHITECTURE.md Appendix A).
export default defineNitroConfig({
  modules: ["workflow/nitro"],
  // Starts the Postgres world's embedded queue worker on boot — but only when
  // CLARA_START_WORLD=1 (see plugins/startWorld.ts). Default OFF for the skeleton.
  plugins: ["plugins/startWorld.ts"],
  routes: {
    "/**": { handler: "./src/index.ts", format: "node" },
  },
});
