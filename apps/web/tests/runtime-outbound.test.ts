import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  CAPABILITY_LEGS,
  CAPABILITY_LEG_REFUSAL_STATUS,
  buildOutbound,
  hasDotSegment,
  isJwtShaped,
  legFor,
} from "../lib/runtime/outbound";
import { runtimeRouteRegistrations } from "../test/sourceOracle";

/**
 * THE RUNTIME PROXY'S OUTBOUND CREDENTIAL (P4-2).
 *
 * Two rules meet here, and getting either wrong breaks something real:
 *
 *  1. On a SESSION leg the request must leave as the principal the scope guard
 *     authorised (#451 Codex HIGH-1). Cookie A + `Authorization: Bearer B` must
 *     reach the runtime as A — otherwise A's firm scope authorises a request the
 *     runtime executes as B.
 *  2. On a CAPABILITY leg the caller's short-lived upload token IS the credential
 *     the runtime expects (`packages/runtime/README.md:79-80`), so overwriting it
 *     with the session JWT breaks every document upload. The first version of the
 *     HIGH-1 fix did exactly that; the independent review of #451 caught it.
 *
 * Never both: a session leg never carries the caller's bearer, a capability leg
 * never carries the session JWT, and a JWT-shaped bearer on a capability leg is
 * refused rather than forwarded.
 */

const A = "token-A-the-guard-verified";
const B = "token-B-the-caller-chose";

/** A real upload capability's shape: `randomBytes(32).toString("base64url")`
 *  (`packages/runtime/lib/intake.mjs:163`) — ONE base64url segment, no dots. */
const CAPABILITY = "Zm9vYmFyYmF6cXV4Y29ycmVjdGhvcnNlYmF0dGVyeXN0YXBsZXI";

const BEGIN = ["intake", "documents"];
const BYTES = ["intake", "documents", "i-1", "bytes"];
const FINALIZE = ["intake", "documents", "i-1", "finalize"];
const VIEWER = ["documents", "d-1", "bytes"];

/** The two capability legs AS THE RUNTIME DEFINES THEM — method and path together
 *  (`packages/runtime/README.md:79-80`). The pairing is the point: the same URL
 *  under a different verb is NOT a capability leg. */
const CAPABILITY_CALLS: ReadonlyArray<[string, string[]]> = [
  ["PUT", BYTES],
  ["POST", FINALIZE],
];

/** Every method this proxy exports (`app/api/runtime/[...path]/route.ts`). */
const PROXY_METHODS = ["GET", "POST", "PUT"] as const;

function headersOf(r: ReturnType<typeof buildOutbound>): Headers {
  assert.equal(r.ok, true, "expected a forwardable header set, got a refusal");
  return (r as { headers: Headers }).headers;
}

describe("the leg switch is the runtime's own contract", () => {
  it("begin takes a JWT; PUT-bytes and POST-finalize take the capability", () => {
    assert.equal(legFor("POST", BEGIN), "session");
    assert.equal(legFor("PUT", BYTES), "capability");
    assert.equal(
      legFor("POST", FINALIZE),
      "capability",
      "finalize is the SECOND capability leg — the ruling named only bytes, the contract names both",
    );
    assert.equal(legFor("GET", VIEWER), "session", "the evidence viewer rides the JWT lane");
  });

  it("THE METHOD×PATH PRODUCT — only the two contracted pairs are capability legs", () => {
    // Matching on path alone classified EVERY method on those two URLs as a
    // capability leg, and this proxy exports GET, POST and PUT (#451 Codex round
    // 2, item 2). Nothing reachable exploits it today — a wrong-method request
    // finds no Express handler and 404s — but a future session-authenticated
    // handler on either URL would have inherited caller-controlled forwarding.
    const paths: ReadonlyArray<[string, string[]]> = [
      ["BEGIN", BEGIN],
      ["BYTES", BYTES],
      ["FINALIZE", FINALIZE],
      ["VIEWER", VIEWER],
    ];
    const contracted = new Set(CAPABILITY_CALLS.map(([m, p]) => `${m} ${p.join("/")}`));
    for (const method of PROXY_METHODS) {
      for (const [label, path] of paths) {
        const expected = contracted.has(`${method} ${path.join("/")}`) ? "capability" : "session";
        assert.equal(
          legFor(method, path),
          expected,
          `${method} ${label} classified as ${legFor(method, path)}, expected ${expected}`,
        );
      }
    }
  });

  it("the method match is case-insensitive but exact", () => {
    assert.equal(legFor("put", BYTES), "capability");
    assert.equal(legFor("PUTX", BYTES), "session");
  });

  it("an UNKNOWN leg defaults to our own verified identity", () => {
    assert.equal(legFor("GET", ["something", "new"]), "session");
    assert.equal(legFor("GET", []), "session");
    assert.equal(
      legFor("PUT", ["intake", "documents", "i-1", "bytes", "extra"]),
      "session",
      "a longer path must not match a capability leg by prefix",
    );
  });

  it("every registered capability leg names a METHOD and cites the contract", () => {
    assert.equal(CAPABILITY_LEGS.length, 2);
    for (const leg of CAPABILITY_LEGS) {
      assert.match(leg.why, /packages\/runtime/, `${leg.path.join("/")} carries no citation`);
      assert.equal(leg.method, leg.method.toUpperCase(), "the registry method must be uppercase");
      assert.ok(["PUT", "POST"].includes(leg.method));
    }
  });
});

/**
 * THE RUNTIME'S OWN ROUTE TABLE, censused independently (#451 round-3, MED-5 /
 * NEW-1).
 *
 * Until this cell, `CAPABILITY_LEGS` was bound to `packages/runtime/src/
 * intakeRoutes.ts` by CITATION ONLY — each entry's `why` names a file and a line,
 * and nothing checked that the line still says what it said. A leg renamed,
 * re-verbed or added on the runtime side would leave the proxy classifying against
 * a registry nobody had touched: a new capability route would silently take the
 * SESSION lane (the fail-closed direction, but the upload would break), and a
 * retired one would keep forwarding a caller-supplied bearer.
 *
 * Parsed off COMMENT-STRIPPED source with a brace-matched call range, not a
 * non-greedy regex: a `)` inside a comment or a string must not be able to end a
 * handler early and hide the `bearerCapability()` inside it.
 */
const INTAKE_ROUTES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "runtime",
  "src",
  "intakeRoutes.ts",
);

function runtimeRoutes(): { call: string; capability: boolean }[] {
  return runtimeRoutesFrom(readFileSync(INTAKE_ROUTES, "utf8"));
}

function runtimeRoutesFrom(src: string): { call: string; capability: boolean }[] {
  return runtimeRouteRegistrations(src).map(({ call, capability }) => ({ call, capability }));
}

describe("NEW-1 — the leg registry is BOUND to the runtime's real routes", () => {
  const routes = runtimeRoutes();

  it("VACUITY CONTROL: the parser actually read the runtime's route table", () => {
    assert.deepEqual(
      routes.map((r) => r.call).sort(),
      ["POST intake/documents", "POST intake/documents/*/finalize", "PUT intake/documents/*/bytes"],
      "the runtime's intake route table changed — re-read packages/runtime/src/intakeRoutes.ts before touching the registry",
    );
  });

  it("CAPABILITY_LEGS equals the runtime's bearerCapability routes, BOTH ways", () => {
    const fromRuntime = routes.filter((r) => r.capability).map((r) => r.call).sort();
    const fromRegistry = CAPABILITY_LEGS.map((l) => `${l.method} ${l.path.join("/")}`).sort();
    assert.deepEqual(
      fromRegistry,
      fromRuntime,
      "CAPABILITY_LEGS has drifted from intakeRoutes.ts — the proxy is classifying against a stale contract",
    );
  });

  it("VACUITY CONTROL: the begin leg is NOT capability-guarded", () => {
    // If `bearerCapability(` were read as present everywhere, the equality above
    // would hold for the wrong reason. The session leg is the discriminator: it
    // authenticates a JWT (`authenticate(`), and must not appear as a capability.
    const begin = routes.find((r) => r.call === "POST intake/documents");
    assert.ok(begin, "the begin leg vanished from the runtime's route table");
    assert.equal(begin.capability, false, "begin reads a capability — the leg split itself would be wrong");
    assert.equal(routes.filter((r) => r.capability).length, 2, "the bearerCapability() read is not discriminating");
  });

  it("PIN NEW-1a: a helper-added route is censused, never invisible", () => {
    const helper = `import { bearerCapability } from "../lib/intake.mjs";
    register(
      router,
      "put",
      "/api/intake/documents/:id/retry",
      async (req, res) => { bearerCapability(req.header("authorization")); res.end(); },
    );`;
    assert.deepEqual(runtimeRoutesFrom(helper), [
      { call: "PUT intake/documents/*/retry", capability: true },
    ]);
  });

  it("PIN NEW-1b: the word bearerCapability in a string is not a capability call", () => {
    const decoy = `import { bearerCapability } from "../lib/intake.mjs";
    router.put("/api/intake/documents/:id/bytes", (_req, res) => {
      const log = "bearerCapability(req.header('authorization'))";
      res.json({ log });
    });`;
    assert.deepEqual(runtimeRoutesFrom(decoy), [
      { call: "PUT intake/documents/*/bytes", capability: false },
    ]);
  });

  it("PIN NEW-1c: multiline direct calls remain visible", () => {
    const multiline = `import { bearerCapability } from "../lib/intake.mjs";
    router
      .post(
        "/api/intake/documents/:id/finalize",
        async (req, res) => { bearerCapability(req.header("authorization")); res.end(); },
      );`;
    assert.deepEqual(runtimeRoutesFrom(multiline), [
      { call: "POST intake/documents/*/finalize", capability: true },
    ]);
  });

  it("PIN NEW-1d: a trailing slash remains a discriminating extra segment", () => {
    const trailing = `import { bearerCapability } from "../lib/intake.mjs";
      router.put("/api/intake/documents/:id/bytes/", () => bearerCapability("x"));`;
    assert.deepEqual(runtimeRoutesFrom(trailing), [
      { call: "PUT intake/documents/*/bytes/", capability: true },
    ]);
  });

  it("PIN NEW-1e: an unknown helper registration fails closed by helper name", () => {
    assert.throws(
      () => runtimeRoutesFrom(`addRoute(router, "put", "/api/intake/hidden", () => bearerCapability("x"));`),
      /unmodelled: unmodelled registration addRoute\(router, .* at source-oracle\.tsx:1/,
    );
  });

  it("PIN NEW-1f: shadowed or dead bearer call is not capability evidence", () => {
    const shadowed = `import { bearerCapability as importedBearer } from "../lib/intake.mjs";
      router.put("/api/intake/documents/:id/bytes", (_req, res) => {
        function bearerCapability() { return "fake"; }
        bearerCapability();
        res.end(importedBearer);
      });`;
    const dead = `import { bearerCapability } from "../lib/intake.mjs";
      router.put("/api/intake/documents/:id/bytes", (_req, res) => {
        function unused() { bearerCapability("x"); }
        res.end();
      });`;
    assert.deepEqual(runtimeRoutesFrom(shadowed), [{ call: "PUT intake/documents/*/bytes", capability: false }]);
    assert.deepEqual(runtimeRoutesFrom(dead), [{ call: "PUT intake/documents/*/bytes", capability: false }]);
  });

  it("PIN NEW-1g: earlier handler cannot act before capability", () => {
    const actingFirst = `import { bearerCapability } from "../lib/intake.mjs";
      router.put("/api/intake/documents/:id/bytes",
        (_req, res, next) => { res.setHeader("x-before", "1"); next(); },
        (req, res) => { bearerCapability(req.header("authorization")); res.end(); },
      );`;
    assert.throws(() => runtimeRoutesFrom(actingFirst), /unmodelled: handler before capability at source-oracle\.tsx:2/);

    const noOpFirst = `import { bearerCapability } from "../lib/intake.mjs";
      router.put("/api/intake/documents/:id/bytes",
        (_req, _res, next) => next(),
        (req, res) => { bearerCapability(req.header("authorization")); res.end(); },
      );`;
    assert.deepEqual(runtimeRoutesFrom(noOpFirst), [{ call: "PUT intake/documents/*/bytes", capability: true }]);
  });

  it("PIN NEW-1h: mounted child router and hidden helper fail closed", () => {
    for (const source of [
      'child.put("/x", handler);',
      'app.use("/api", child);',
      'router.route("/x").put(handler);',
      'register(child, "put", "/api/x", handler);',
    ]) {
      assert.throws(() => runtimeRoutesFrom(source), /unmodelled: unmodelled registration .* at source-oracle\.tsx:1/);
    }
  });
});

describe("a non-canonical path is refused before it is classified", () => {
  // Classification runs before the target URL is assembled, so a dot segment could
  // make the path judged differ from the path fetched (#451 Codex round 2, item 2).
  const A2 = "token-A";

  it("dot segments, encoded or not, are rejected", () => {
    for (const seg of ["..", ".", "%2e%2e", "%2E", "a/b", "%2Fetc", ""]) {
      assert.equal(hasDotSegment(["intake", seg, "bytes"]), true, `${JSON.stringify(seg)} was accepted as a name`);
    }
  });

  it("ordinary segments are NOT rejected — the wall has to let real traffic through", () => {
    assert.equal(hasDotSegment(BYTES), false);
    assert.equal(hasDotSegment(["documents", "d-1", "bytes"]), false);
    assert.equal(hasDotSegment(["a.b.c"]), false, "a dotted NAME is not a dot segment");
  });

  it("buildOutbound refuses a dot-segment path outright, on either leg", () => {
    for (const [method, leg] of [["PUT", ["intake", "documents", "..", "bytes"]], ["POST", ["intake", ".."]]] as const) {
      const r = buildOutbound(new Headers({ authorization: `Bearer ${CAPABILITY}` }), method, leg, A2);
      assert.equal(r.ok, false, `${method} ${leg.join("/")} was not refused`);
      assert.equal((r as { response: Response }).response.status, CAPABILITY_LEG_REFUSAL_STATUS);
    }
  });
});

describe("SESSION legs — the guard's own token, the caller's never read", () => {
  it("cookie A + header B → the runtime receives A, never B", () => {
    const inbound = new Headers({ authorization: `Bearer ${B}`, "content-type": "application/json" });
    const out = headersOf(buildOutbound(inbound, "POST", BEGIN, A));
    assert.equal(out.get("authorization"), `Bearer ${A}`);
    assert.ok(!String(out.get("authorization")).includes(B), "the caller's bearer survived to the runtime");
  });

  it("a MISSING inbound Authorization still forwards A", () => {
    const out = headersOf(buildOutbound(new Headers({ "content-type": "application/json" }), "POST", BEGIN, A));
    assert.equal(out.get("authorization"), `Bearer ${A}`);
  });

  it("the body headers cross; cookies, origin and referer never do", () => {
    const inbound = new Headers({
      "content-type": "application/octet-stream",
      "content-length": "42",
      cookie: "sb-access-token=leak; sb-refresh-token=leak",
      origin: "https://evil.example",
      referer: "https://evil.example/x",
    });
    const out = headersOf(buildOutbound(inbound, "POST", BEGIN, A));
    assert.equal(out.get("content-type"), "application/octet-stream");
    assert.equal(out.get("content-length"), "42");
    for (const dropped of ["cookie", "origin", "referer"]) {
      assert.equal(out.get(dropped), null, `${dropped} reached the runtime`);
    }
    assert.deepEqual([...out.keys()].sort(), ["authorization", "content-length", "content-type"]);
  });

  it("RED-before: a forwarder that prefers the inbound header fails this cell", () => {
    const preferInbound = (inbound: Headers, token: string) => {
      const h = new Headers();
      h.set("authorization", inbound.get("authorization") ?? `Bearer ${token}`);
      return h;
    };
    assert.throws(() => {
      const out = preferInbound(new Headers({ authorization: `Bearer ${B}` }), A);
      assert.equal(out.get("authorization"), `Bearer ${A}`);
    }, /token-B/);
  });
});

describe("CAPABILITY legs — the upload token travels, the JWT does not", () => {
  it("the capability is forwarded on BOTH capability legs", () => {
    for (const [method, leg] of CAPABILITY_CALLS) {
      const inbound = new Headers({
        authorization: `Bearer ${CAPABILITY}`,
        "content-type": "application/octet-stream",
      });
      const out = headersOf(buildOutbound(inbound, method, leg, A));
      assert.equal(
        out.get("authorization"),
        `Bearer ${CAPABILITY}`,
        `${method} ${leg.join("/")} lost the upload capability`,
      );
      assert.ok(!String(out.get("authorization")).includes(A), "the session JWT reached a capability leg");
    }
  });

  it("a JWT-shaped bearer is REFUSED — never both credentials", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";
    assert.equal(isJwtShaped(jwt), true);
    const r = buildOutbound(new Headers({ authorization: `Bearer ${jwt}` }), "PUT", BYTES, A);
    assert.equal(r.ok, false);
    assert.equal((r as { response: Response }).response.status, CAPABILITY_LEG_REFUSAL_STATUS);
  });

  it("a REAL capability is not mistaken for a JWT — the wall cannot false-positive", () => {
    assert.equal(isJwtShaped(CAPABILITY), false, "the wall would refuse every legitimate upload");
    assert.equal(isJwtShaped("eyJ.eyJ."), true, "an empty signature segment must still count as JWT-shaped");
    assert.equal(isJwtShaped("a.b"), false, "two segments are not a JWT");
  });

  it("no inbound credential → none forwarded, never a substitute", () => {
    const out = headersOf(buildOutbound(new Headers({ "content-length": "9" }), "PUT", BYTES, A));
    assert.equal(out.get("authorization"), null, "the session JWT was substituted onto a capability leg");
    assert.equal(out.get("content-length"), "9");
  });

  it("RED-before: an UNCONDITIONAL overwrite fails this cell — it is what broke intake", () => {
    const alwaysOverwrite = (_inbound: Headers, token: string) => {
      const h = new Headers();
      h.set("authorization", `Bearer ${token}`);
      return h;
    };
    assert.throws(() => {
      const out = alwaysOverwrite(new Headers({ authorization: `Bearer ${CAPABILITY}` }), A);
      assert.equal(out.get("authorization"), `Bearer ${CAPABILITY}`, "lost the upload capability");
    }, /lost the upload capability/);
  });
});
