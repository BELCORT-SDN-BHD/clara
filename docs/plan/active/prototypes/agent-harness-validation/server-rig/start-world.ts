import { definePlugin } from "nitro";
import { getWorld } from "workflow/runtime";

export default definePlugin(() => {
  void (async () => {
    try {
      await getWorld().start?.();
      console.log(`[restart-rig] durable world started pid=${process.pid}`);
    } catch (error) {
      console.error("[restart-rig] durable world failed", error);
      process.exit(1);
    }
  })();
});
