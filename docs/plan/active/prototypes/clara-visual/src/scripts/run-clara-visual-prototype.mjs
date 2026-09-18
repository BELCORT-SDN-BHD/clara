import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const child = spawn(
  process.execPath,
  [nextBin, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "8767"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      // Reuse the repository's existing opt-in local harness gate. The route is
      // not public unless this explicit prototype command starts the server.
      CLARA_E2E_MONEY_INPUT_HARNESS: "1",
    },
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
