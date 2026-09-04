// H-43 — the pooler CA in the image, and the boot assert that refuses a broken pin.
//
// THE DEFECT. `ops/tls/pooler-ca.crt` exists at the repo root (the Supabase Root 2021 CA,
// fingerprint-pinned in `scripts/ops/dsn-pipe.mjs`), and the runtime image NEVER copied it. The
// runner stage installs `ca-certificates`, which is the ~150-root PUBLIC Mozilla trust store —
// and Supabase's pooler CA is SELF-SIGNED, so it is not in that store. `docs/ops/dsn-bridge.md`
// proves the negative directly: `openssl s_client` WITHOUT the CA exits 1 with "self-signed
// certificate in certificate chain".
//
// WHAT THAT MEANT MECHANICALLY, at pg 8.20.0 / pg-connection-string 2.14.0. Without
// `uselibpqcompat` in the DSN, that parser's non-libpq branch maps `sslmode=verify-full` to
// `ssl.rejectUnauthorized = true`, and Node TLS with `rejectUnauthorized` true validates against
// the DEFAULT store unless `ssl.ca` is set. `ssl.ca` is set ONLY from `sslrootcert`, via a
// `readFileSync` of that path. So there were exactly two outcomes in the image:
//   (a) the DSN carries `sslrootcert=<path>` and the path does not exist -> readFileSync THROWS
//       at connect time, on every lane, hard; or
//   (b) the DSN carries only `sslmode=verify-full` -> Node validates against the public store,
//       the self-signed chain fails, the connection is refused.
// Neither is verify-full working, which is why two live ceremonies degraded to
// `sslmode=no-verify` before the bridge was committed.
//
// THE FIX HAS TWO HALVES AND NEITHER WORKS ALONE. CODE: the Dockerfile COPY, this assert, and
// the drift cell. CEREMONY: the live openssl leg, the six secrets re-set, and the ordering —
// IMAGE FIRST, SECRETS SECOND. Recipe: `docs/ops/runtime-tls-verify-full-ceremony.md`.
//
// WHY THIS ASSERT IS DSN-DRIVEN RATHER THAN UNCONDITIONAL, stated because it is a deliberate
// scoping decision and not an oversight. An assert that REQUIRED the CA at the in-image path on
// every boot would refuse to start the image in exactly the window the ceremony ordering
// creates — the deploy that PUTS the CA in the image, before the secrets carry `sslrootcert`.
// It would also refuse every local `pnpm start` outside a container. So the rule is: a DSN that
// PINS a CA must pin a VALID one (fail closed, refuse to boot — a pinned-but-broken CA is the
// real hazard, because `readFileSync` would otherwise fail per-connection with a confusing
// error), and a production deployment that pins NOTHING gets a loud WARN naming the ceremony.
// Refusing that second case outright is a genuine hardening, and the map's own recommendation
// was to WARN here and take a separate ruling before refusing.
//
// THE FINGERPRINT LIVES IN TWO PLACES, BY NECESSITY. `scripts/ops/` is NOT in the image (the
// Dockerfile copies `packages/runtime/scripts`, not the repo-root `scripts/`), so the runtime
// cannot import the bridge's copy at runtime. It carries its own, and a CELL asserts the two
// strings are equal by READING the bridge's source — so a rotation that moves one and not the
// other reds in CI rather than at a ceremony.

import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * The in-image path the runner stage COPYs the CA to. THIS PATH IS BAKED INTO EVERY LANE DSN
 * SECRET (`sslrootcert=/app/ops/tls/pooler-ca.crt`), so changing it later is another secrets
 * ceremony across six or more secrets. It mirrors the repo layout deliberately: a reader who
 * greps `ops/tls/pooler-ca.crt` finds both the source file and the image path.
 */
export const IN_IMAGE_CA_PATH = "/app/ops/tls/pooler-ca.crt";

/**
 * Captured from the live pooler 2026-08-23 and independently confirmed byte-identical against
 * Supabase's publicly-hosted copy — see `docs/ops/dsn-bridge.md` "CA provenance" for both
 * readings. MUST MOVE IN THE SAME PR as `ops/tls/pooler-ca.crt` and as
 * `scripts/ops/dsn-pipe.mjs`'s own copy of this constant; a cell asserts the two agree.
 */
export const EXPECTED_CA_FINGERPRINT_SHA256 =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

/**
 * Every DSN variable whose TLS posture this assert reads. The seven lane logins plus the two
 * base sources the durable engine and the relay resolve from — WORKFLOW_POSTGRES_URL is the
 * world's own DSN and gets no less scrutiny than a lane's.
 */
export const TLS_CHECKED_DSN_VARS = Object.freeze([
  "CLARA_RUNTIME_DATABASE_URL",
  "CLARA_READ_DATABASE_URL",
  "CLARA_WRITE_DATABASE_URL",
  "CLARA_FREEFORM_DATABASE_URL",
  "CLARA_BANK_DATABASE_URL",
  "CLARA_STRIPE_WEBHOOK_DATABASE_URL",
  "CLARA_AUTH_WALL_DATABASE_URL",
  "WORKFLOW_POSTGRES_URL",
  "DATABASE_URL",
]);

/** The sslmode values that actually authenticate the server. Everything else is encrypted-but-anonymous. */
const VERIFYING_SSLMODES = Object.freeze(["verify-full", "verify-ca"]);

/**
 * Parse and STRUCTURALLY validate a pinned CA. Ported from `scripts/ops/dsn-pipe.mjs`'s
 * `validateCa` — existence alone is NOT enough: an empty or truncated file passes `existsSync`
 * while providing no trust anchor at all. Throws (fail-closed) on any of: unreadable, not a PEM
 * CERTIFICATE block, does not parse as X.509, missing `basicConstraints CA:TRUE`, outside its
 * own validity window, or a sha256 fingerprint that does not match the pin.
 * @param {string} caPath
 * @param {{expectedFingerprint?:string, now?:number}} [opts]
 * @returns {X509Certificate}
 */
export function validateCa(caPath, opts = {}) {
  const expected = opts.expectedFingerprint ?? EXPECTED_CA_FINGERPRINT_SHA256;
  let text;
  try {
    text = readFileSync(caPath, "utf8");
  } catch (err) {
    throw new Error(`clara-runtime TLS: FAIL-CLOSED — could not read the pinned CA at ${caPath}: ${err.code ?? err.message}`);
  }
  if (!text.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error(`clara-runtime TLS: FAIL-CLOSED — ${caPath} does not contain a PEM CERTIFICATE block`);
  }
  let cert;
  try {
    cert = new X509Certificate(text);
  } catch (err) {
    throw new Error(`clara-runtime TLS: FAIL-CLOSED — ${caPath} did not parse as a valid X.509 certificate: ${err.message}`);
  }
  if (cert.ca !== true) {
    throw new Error(`clara-runtime TLS: FAIL-CLOSED — ${caPath} is not a CA certificate (basicConstraints CA:TRUE required)`);
  }
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) {
    throw new Error(`clara-runtime TLS: FAIL-CLOSED — ${caPath} is outside its validity window (${cert.validFrom} .. ${cert.validTo})`);
  }
  if (cert.fingerprint256 !== expected) {
    throw new Error(
      `clara-runtime TLS: FAIL-CLOSED — ${caPath}'s sha256 fingerprint does not match the pinned expectation ` +
        `(got ${cert.fingerprint256}, expected ${expected}) — the committed CA may have been swapped or corrupted`,
    );
  }
  return cert;
}

/**
 * Read one DSN's TLS posture WITHOUT ever returning the DSN or any of its components.
 * Unparseable is reported as such rather than thrown: `assertNoTargetSplit` and the pools'
 * own connect path already own DSN validity, and this assert must not become a second, earlier
 * place a malformed DSN kills the boot with a different message.
 * @param {string} dsn
 * @returns {{parsed:boolean, sslmode:string|null, sslrootcert:string|null}}
 */
export function readDsnTlsPosture(dsn) {
  let u;
  try {
    u = new URL(dsn);
  } catch {
    return { parsed: false, sslmode: null, sslrootcert: null };
  }
  return {
    parsed: true,
    sslmode: u.searchParams.get("sslmode"),
    sslrootcert: u.searchParams.get("sslrootcert"),
  };
}

/**
 * The BOOT ASSERT (called from `assertProductionPoolConfig`, beside the DSN-presence loop).
 *
 * Refuses to boot when a configured DSN PINS a CA that is absent, malformed, not a CA, expired,
 * or whose fingerprint moved. Warns — never refuses — when production DSNs pin nothing, or when
 * a DSN's `sslmode` does not actually authenticate the server. Returns a summary so a cell can
 * assert on it; the summary names VARIABLES and PATHS, never DSN contents.
 *
 * @param {{env?:NodeJS.ProcessEnv, testMode?:boolean, log?:(msg:string)=>void, now?:number}} [opts]
 * @returns {{pinned:string[], unpinned:string[], weakMode:string[], validated:string[]}}
 */
export function assertLaneDsnTlsPosture(opts = {}) {
  const env = opts.env ?? process.env;
  const testMode = opts.testMode ?? env.RELAY_TEST_MODE === "1";
  const log = opts.log ?? ((msg) => console.error(msg));

  const pinned = [];
  const unpinned = [];
  const weakMode = [];
  const caPaths = new Set();

  for (const name of TLS_CHECKED_DSN_VARS) {
    const dsn = env[name];
    if (!dsn) continue;
    const posture = readDsnTlsPosture(dsn);
    if (!posture.parsed) continue; // not this assert's job — the connect path owns DSN validity
    if (posture.sslrootcert) {
      pinned.push(name);
      caPaths.add(posture.sslrootcert);
    } else {
      unpinned.push(name);
    }
    if (!posture.sslmode || !VERIFYING_SSLMODES.includes(posture.sslmode)) weakMode.push(name);
  }

  // FAIL CLOSED on a pinned-but-broken CA — the one condition where booting is worse than not.
  // Validated ONCE PER DISTINCT PATH: the six lane DSNs normally share one file, and six
  // identical readFileSync + X509 parses at boot buy nothing.
  const validated = [];
  for (const caPath of caPaths) {
    validateCa(caPath, { now: opts.now });
    validated.push(caPath);
  }

  if (testMode) return { pinned, unpinned, weakMode, validated };

  if (pinned.length === 0) {
    log(
      "[clara-runtime] TLS WARNING: no configured DSN carries sslrootcert=, so no lane pins the Supabase pooler CA. " +
        `Until the verify-full secrets ceremony runs, lane TLS is unauthenticated in practice. Recipe: ` +
        `docs/ops/runtime-tls-verify-full-ceremony.md (the CA ships in this image at ${IN_IMAGE_CA_PATH}).`,
    );
  }
  if (weakMode.length > 0) {
    log(
      `[clara-runtime] TLS WARNING: ${weakMode.length} configured DSN(s) do not request a VERIFYING sslmode ` +
        `(verify-full/verify-ca): ${weakMode.join(", ")}. An encrypted-but-unauthenticated connection is what ` +
        `docs/ops/dsn-bridge.md exists to prevent.`,
    );
  }
  return { pinned, unpinned, weakMode, validated };
}
