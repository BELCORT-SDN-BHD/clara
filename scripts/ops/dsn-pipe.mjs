#!/usr/bin/env node
// The ceremony DSN bridge (F-T4 item F / fix-queue-design.md §6).
//
//   <secret source> | node scripts/ops/dsn-pipe.mjs -- <command> [args...]
//
// Reads a Postgres DSN on STDIN — never argv, never a file — appends
// `sslmode=verify-full`, points PGSSLROOTCERT / NODE_EXTRA_CA_CERTS at the committed
// pooler CA (ops/tls/pooler-ca.crt), and spawns <command> with the DSN in the CHILD's
// environment only. The DSN is never written to disk, never logged, and never appears
// in any process's argv (this script's own or the child's) — it travels env-to-env
// exactly once, per hard constraint 4 and the ADR-0075 receipting law.
//
// Recipe of record: docs/plan/completed/wave-e-delta-ceremony-asrun.md:71-80 ("The
// connection mechanism"), made durable after two live ceremonies degraded to
// `sslmode=no-verify` because the prior dsn-pipe.mjs was session-local and gone
// (fix-queue-survey.md F20-F22).
//
// No dependencies — Node built-ins only.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the committed pooler CA, resolved from THIS file's location — never cwd. */
export const DEFAULT_CA_PATH = resolve(HERE, "..", "..", "ops", "tls", "pooler-ca.crt");

/**
 * Force `sslmode=verify-full` onto a Postgres DSN, preserving everything else.
 * Throws (never echoes the input) if the string does not parse as a postgres(ql):// URI.
 * @param {string} dsn
 * @returns {string}
 */
export function withVerifyFull(dsn) {
  let u;
  try {
    u = new URL(dsn);
  } catch {
    throw new Error("dsn-pipe: stdin did not parse as a URI (expected postgres://... or postgresql://...)");
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error(`dsn-pipe: unsupported scheme ${JSON.stringify(u.protocol)} (expected postgres: or postgresql:)`);
  }
  u.searchParams.set("sslmode", "verify-full");
  return u.toString();
}

/**
 * The environment the CHILD process receives — the ONLY place the DSN is ever written.
 * @param {{ dsn: string, caPath?: string, baseEnv?: NodeJS.ProcessEnv }} args
 * @returns {NodeJS.ProcessEnv}
 */
export function buildChildEnv({ dsn, caPath = DEFAULT_CA_PATH, baseEnv = process.env }) {
  const withSsl = withVerifyFull(dsn);
  return {
    ...baseEnv,
    DATABASE_URL: withSsl,
    PGSSLMODE: "verify-full", // redundant safety net for libpq tools reading PG* vars, not the DSN
    PGSSLROOTCERT: caPath,
    NODE_EXTRA_CA_CERTS: caPath, // augments Node's global TLS trust store for the whole child process
  };
}

/** Read the whole of STDIN synchronously (fd 0), trimmed. Never reads argv or a file. */
export function readDsnFromStdin() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch (err) {
    throw new Error(`dsn-pipe: could not read stdin: ${err.code ?? err.message}`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("dsn-pipe: stdin was empty — pipe the DSN in, e.g. `fly ssh console ... printenv DATABASE_URL | node scripts/ops/dsn-pipe.mjs -- <cmd>`");
  }
  return trimmed;
}

/** Split argv into the bridge's own flags (none today) and the child command after `--`. */
export function splitArgv(argv) {
  const sep = argv.indexOf("--");
  if (sep === -1 || sep === argv.length - 1) {
    throw new Error("dsn-pipe: usage: <secret source> | node scripts/ops/dsn-pipe.mjs -- <command> [args...]");
  }
  const [cmd, ...cmdArgs] = argv.slice(sep + 1);
  return { cmd, cmdArgs };
}

function main() {
  if (!existsSync(DEFAULT_CA_PATH)) {
    console.error(`dsn-pipe: FAIL-CLOSED — pinned CA not found at ${DEFAULT_CA_PATH}`);
    process.exit(1);
  }

  let cmd, cmdArgs, dsn, env;
  try {
    ({ cmd, cmdArgs } = splitArgv(process.argv.slice(2)));
    dsn = readDsnFromStdin();
    env = buildChildEnv({ dsn });
  } catch (err) {
    // Never interpolate `dsn` itself into a message — every throw site above already avoids it.
    console.error(err.message);
    process.exit(1);
  }

  const child = spawn(cmd, cmdArgs, { stdio: "inherit", shell: false, env });
  child.on("error", (err) => {
    console.error(`dsn-pipe: failed to start ${JSON.stringify(cmd)}: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
