import { defineNitroConfig } from "nitro/config";

export default defineNitroConfig({
  modules: ["workflow/nitro"],
  plugins: ["./server-rig/start-world.ts"],
  routes: {
    "/**": {
      handler: "./server-rig/app.ts",
      format: "node",
    },
  },
});
