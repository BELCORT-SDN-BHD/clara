#!/usr/bin/env node
// (D4) The REAL node-postgres-path cell for the ceremony DSN bridge, split out of
// dsn-pipe.selftest.mjs so neither file crosses the repo's file-size convention.
//
//   node scripts/ops/dsn-pipe.pgpath.selftest.mjs   # exit 0 green, 1 red
//
// The sibling file's raw-TLS probe (`tls.connect()` directly) never exercises the DSN REWRITE
// itself — only the env vars. This file spins a minimal hand-rolled Postgres-speaking TLS
// server and connects through the bridge's actual rewritten DATABASE_URL using node-postgres's
// own Client, both polarities, so the DSN-level `sslrootcert` pin (review finding B1) is proved
// against the library that will actually carry it in a real ceremony — never the real pooler,
// always a local throwaway fixture. Uses the REAL, unmodified `buildChildEnv()` (imported
// directly from dsn-pipe.mjs) rather than the CLI, so the CLI's `validateCa()` preflight gate
// (which pins the ONE production CA's exact fingerprint, review C1) never blocks a throwaway
// test fixture — that gate is proved separately, directly, in dsn-pipe.selftest.mjs's (C1)
// section. Depends on `pg` / `pg-connection-string`, already a dependency of packages/db and
// added here as a root devDependency for this file.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createNetServer } from "node:net";
import { TLSSocket } from "node:tls";
import { createHarness, freshDir, fakeDsn, opensslAvailableForCaFixtures, reportOpensslMissing, mintCert, spawnWithBuiltEnv } from "./dsn-pipe.selftest-helpers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DSN_PIPE_SRC = join(HERE, "dsn-pipe.mjs");

const { asyncTestCase, reportFail, reportSkip, summarize } = createHarness();
const harnessForOpenssl = { reportFail, reportSkip };

function int32be(n) {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n, 0);
  return b;
}
const AUTH_OK = Buffer.concat([Buffer.from("R"), int32be(8), int32be(0)]);
const BACKEND_KEY_DATA = Buffer.concat([Buffer.from("K"), int32be(12), int32be(4242), int32be(24242)]);
const READY_FOR_QUERY = Buffer.concat([Buffer.from("Z"), int32be(5), Buffer.from("I")]);

/** A minimal server: answers Postgres's SSLRequest, completes TLS, then sends just enough of
 * the wire protocol (AuthenticationOk + BackendKeyData + ReadyForQuery) for node-postgres's
 * Client.connect() to resolve. It never needs to parse the StartupMessage it receives. */
function startFakePgTlsServer(keyPath, crtPath) {
  return new Promise((resolvePromise) => {
    const server = createNetServer((socket) => {
      socket.once("data", () => {
        socket.write("S"); // any first packet is treated as SSLRequest
        const tlsSocket = new TLSSocket(socket, { isServer: true, key: readFileSync(keyPath), cert: readFileSync(crtPath) });
        tlsSocket.on("secure", () => {
          tlsSocket.once("data", () => {
            tlsSocket.write(Buffer.concat([AUTH_OK, BACKEND_KEY_DATA, READY_FOR_QUERY]));
          });
        });
        tlsSocket.on("error", () => {
          try {
            socket.destroy();
          } catch {
            /* already gone */
          }
        });
      });
    });
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

console.log("(D4) the REAL pg-path TLS cell (node-postgres, both polarities), throwaway local fixture only:");

if (!opensslAvailableForCaFixtures()) {
  reportOpensslMissing(harnessForOpenssl, "(D4) real pg-path TLS cell, both polarities", 2);
} else {
  const dir = freshDir("dsnpipe-pgpath-");

  // A dedicated CA that actually SIGNS the server's leaf cert (mintCert() alone only makes
  // self-signed fixtures, which a client would never accept as "signed by this CA").
  const pgCa = mintCert(dir, "pg-fixture-ca", { ca: true });
  const leafKeyPath = join(dir, "pg-leaf.key");
  const leafCsrPath = join(dir, "pg-leaf.csr");
  const leafCrtPath = join(dir, "pg-leaf.crt");
  // A HOSTNAME, not an IP literal: node-postgres deliberately never sets TLS `servername` for
  // an IP-literal host (net.isIP(host) !== 0 -> no SNI, since RFC 6066 disallows IPs there),
  // so Node's checkServerIdentity then runs with no hostname to check against, at which point
  // even a cert whose SAN correctly lists `IP:127.0.0.1` fails ALTNAME verification. `localhost`
  // exercises the same servername path a real ceremony hits (the pooler is a hostname, never an
  // IP), and resolves locally without any network dependency.
  execFileSync("openssl", ["req", "-newkey", "rsa:2048", "-nodes", "-keyout", leafKeyPath, "-out", leafCsrPath, "-subj", "/CN=localhost"], { stdio: "pipe" });
  const extFile = join(dir, "leaf.ext");
  writeFileSync(extFile, "subjectAltName=DNS:localhost\nbasicConstraints=critical,CA:FALSE\n");
  execFileSync(
    "openssl",
    ["x509", "-req", "-in", leafCsrPath, "-CA", pgCa.crtPath, "-CAkey", pgCa.keyPath, "-CAcreateserial", "-out", leafCrtPath, "-days", "1", "-extfile", extFile],
    { stdio: "pipe" },
  );
  const wrongCa = mintCert(dir, "pg-fixture-wrong-ca", { ca: true }); // did NOT sign the leaf

  const pgServer = await startFakePgTlsServer(leafKeyPath, leafCrtPath);
  const pgServerPort = pgServer.address().port;
  const dsn = fakeDsn({ hostport: `localhost:${pgServerPort}`, db: "selftestdb" });

  const pgProbeScript = `
    const { Client } = require(${JSON.stringify(join(HERE, "..", "..", "node_modules", "pg"))});
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.connect()
      .then(() => { console.log("PG_OK"); return client.end(); })
      .then(() => process.exit(0))
      .catch((e) => { console.log("PG_FAIL:" + (e.code || e.message)); process.exit(1); });
  `;

  await asyncTestCase("(D4) WITH the matching CA, node-postgres's own Client connects through the bridge's rewritten DSN", async () => {
    const r = await spawnWithBuiltEnv({ dsnPipeSrc: DSN_PIPE_SRC, dsn, caPath: pgCa.crtPath, probeScript: pgProbeScript });
    if (!r.stdout.includes("PG_OK")) throw new Error(`expected PG_OK, got stdout=${r.stdout} stderr=${r.stderr} code=${r.code}`);
  });

  await asyncTestCase("(D4) WITHOUT the matching CA, node-postgres's own Client is REFUSED through the bridge's rewritten DSN", async () => {
    const r = await spawnWithBuiltEnv({ dsnPipeSrc: DSN_PIPE_SRC, dsn, caPath: wrongCa.crtPath, probeScript: pgProbeScript });
    if (!r.stdout.includes("PG_FAIL:")) throw new Error(`expected a PG_FAIL refusal, got stdout=${r.stdout} stderr=${r.stderr} code=${r.code}`);
    if (r.stdout.includes("PG_OK")) throw new Error("a mismatched CA must never be silently trusted by the REAL pg client path");
  });

  pgServer.close();
  rmSync(dir, { recursive: true, force: true });
}

process.exit(summarize());
