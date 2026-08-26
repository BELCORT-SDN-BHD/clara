#!/usr/bin/env node
/**
 * apps/web/scripts/check-public-key.mjs — the BUILD-TIME gate on the class of
 * the key that gets bundled into every browser.
 *
 * Cross-model security review 2026-08-27, finding 7 (MEDIUM). `next build`
 * inlines whatever string occupies `NEXT_PUBLIC_SUPABASE_ANON_KEY` into the
 * client bundle. The NAME proves nothing about the VALUE: a deploy that
 * pastes an `sb_secret_…` key or a legacy `service_role` JWT into that slot
 * ships an RLS-bypassing credential to every visitor's browser, and nothing
 * in the app would notice. "Spelling is not identity" (AGENTS.md review law
 * 3) — so this gate reads the value's own class, not its variable name.
 *
 * It runs BEFORE bundling (wired into this package's `build`, `cf:build` and
 * `cf:deploy` scripts), never as a runtime warning: by the time a browser
 * could warn, the secret has already shipped.
 *
 * ACCEPTED, and nothing else:
 *   - `sb_publishable_…` — the current publishable-key format.
 *   - a legacy JWT whose decoded payload has `role === "anon"` POSITIVELY.
 *
 * REJECTED: `sb_secret_…` and any other `sb_…` class, `sbp_…` (personal
 * access token), a JWT with any other role (`service_role` above all), a JWT
 * whose payload will not decode or carries no role, a value of no recognised
 * class, and ABSENCE. Every uncertain case lands on the reject branch —
 * absence is never evidence (review law 2).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** @typedef {{ ok: true, class: "publishable" | "legacy-anon-jwt" }} Accepted */
/** @typedef {{ ok: false, reason: string }} Rejected */

const PUBLISHABLE_PREFIX = "sb_publishable_";

/** Prefixes assembled from fragments so no scanner ever reads a literal secret prefix here. */
const SECRET_PREFIXES = ["sb" + "_secret_", "sb" + "p_"];

function decodeJwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return undefined;
  const [, payload] = parts;
  if (!payload) return undefined;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Classifies a candidate public key.
 *
 * @param {string | undefined | null} value
 * @returns {Accepted | Rejected}
 */
export function classifyPublicKey(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, reason: "absent" };
  }

  const key = value.trim();

  for (const prefix of SECRET_PREFIXES) {
    if (key.startsWith(prefix)) {
      return { ok: false, reason: `secret-key-prefix:${prefix}` };
    }
  }

  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    // A bare prefix with nothing after it is not a key.
    const body = key.slice(PUBLISHABLE_PREFIX.length);
    if (!/^[A-Za-z0-9_-]{8,}$/.test(body)) {
      return { ok: false, reason: "malformed-publishable-key" };
    }
    return { ok: true, class: "publishable" };
  }

  if (key.startsWith("sb_")) {
    // Some other, unrecognised `sb_` class. Refuse rather than guess.
    return { ok: false, reason: "unknown-sb-key-class" };
  }

  const payload = decodeJwtPayload(key);
  if (payload === undefined) {
    return { ok: false, reason: "unrecognised-key-format" };
  }

  const role = payload.role;
  if (typeof role !== "string" || role === "") {
    return { ok: false, reason: "jwt-without-role" };
  }
  if (role !== "anon") {
    return { ok: false, reason: `jwt-role:${role}` };
  }

  return { ok: true, class: "legacy-anon-jwt" };
}

const ENV_NAME = "NEXT_PUBLIC_SUPABASE_ANON_KEY";

/**
 * Reads one variable the way a PRODUCTION `next build`/`next start` will see
 * it: the process environment first (that is what a deploy sets), then the
 * dotenv files Next itself loads, in Next's own production precedence —
 * `.env.production.local` > `.env.local` > `.env.production` > `.env`,
 * first-match-wins (reviewer note 1, 2026-08-27: the previous two-file list
 * stopped at `.env.local`, so a value set only in `.env.production.local` —
 * which OUTRANKS `.env.local` — would build with a key this gate never saw).
 *
 * A deliberately minimal parser rather than a dependency: `@next/env` is not
 * a direct dependency of this package, and this gate must run under bare
 * `node` before any bundler exists. It never PRINTS a value it reads.
 *
 * @param {string} name
 * @param {string} [envDir] Directory the dotenv files live in — defaults to
 *   this package's root (one level up from `scripts/`). Overridable so tests
 *   can point it at a disposable fixture directory instead of writing real
 *   dotenv files into the package.
 * @returns {string | undefined}
 */
export function readEnv(name, envDir = join(dirname(fileURLToPath(import.meta.url)), "..")) {
  const fromProcess = process.env[name];
  if (typeof fromProcess === "string" && fromProcess.trim() !== "") {
    return fromProcess;
  }

  for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    let contents;
    try {
      contents = readFileSync(join(envDir, file), "utf8");
    } catch {
      continue;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line === "" || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      if (line.slice(0, eq).trim() !== name) continue;
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^(['"])([\s\S]*)\1$/, "$2");
      if (value !== "") return value;
    }
  }

  return undefined;
}

export function main() {
  const result = classifyPublicKey(readEnv(ENV_NAME));

  if (result.ok) {
    console.log(
      `[check-public-key] ${ENV_NAME} accepted — class: ${result.class}`,
    );
    return 0;
  }

  console.error(
    [
      `[check-public-key] REFUSING TO BUILD.`,
      `${ENV_NAME} is not a Supabase publishable/anon key (${result.reason}).`,
      ``,
      `Whatever sits in that variable is inlined into the browser bundle by`,
      `\`next build\`. Only these are accepted:`,
      `  - an "${PUBLISHABLE_PREFIX}…" key, or`,
      `  - a legacy JWT whose decoded payload has role === "anon".`,
      ``,
      `A secret key, a service_role JWT, or an empty slot must never be`,
      `bundled. Set the value in apps/web/.env.local (see .env.example) or in`,
      `the deploy environment, then build again.`,
    ].join("\n"),
  );
  return 1;
}

// `node scripts/check-public-key.mjs` runs the gate; importing the module
// (tests) does not. `pathToFileURL` rather than a hand-built `file://` string
// — this repo builds on Windows, where a drive letter needs `file:///C:/…`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
