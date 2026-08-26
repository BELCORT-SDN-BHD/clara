import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// P1 foundation: no bindings declared yet (no KV/R2/D1 incremental-cache
// overrides, no queue, no tag cache). Add them here when a real deploy needs
// them — see https://opennext.js.org/cloudflare/caching.
export default defineCloudflareConfig();
