import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAPABILITY_LEGS,
  CAPABILITY_LEG_REFUSAL_STATUS,
  buildOutbound,
  isJwtShaped,
  legFor,
} from "../lib/runtime/outbound";

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

function headersOf(r: ReturnType<typeof buildOutbound>): Headers {
  assert.equal(r.ok, true, "expected a forwardable header set, got a refusal");
  return (r as { headers: Headers }).headers;
}

describe("the leg switch is the runtime's own contract", () => {
  it("begin takes a JWT; bytes AND finalize take the capability", () => {
    assert.equal(legFor(BEGIN), "session");
    assert.equal(legFor(BYTES), "capability");
    assert.equal(
      legFor(FINALIZE),
      "capability",
      "finalize is the SECOND capability leg — the ruling named only bytes, the contract names both",
    );
    assert.equal(legFor(VIEWER), "session", "the evidence viewer rides the JWT lane");
  });

  it("an UNKNOWN leg defaults to our own verified identity", () => {
    assert.equal(legFor(["something", "new"]), "session");
    assert.equal(legFor([]), "session");
    assert.equal(
      legFor(["intake", "documents", "i-1", "bytes", "extra"]),
      "session",
      "a longer path must not match a capability leg by prefix",
    );
  });

  it("every registered capability leg cites where the contract says so", () => {
    assert.equal(CAPABILITY_LEGS.length, 2);
    for (const leg of CAPABILITY_LEGS) {
      assert.match(leg.why, /packages\/runtime/, `${leg.path.join("/")} carries no citation`);
    }
  });
});

describe("SESSION legs — the guard's own token, the caller's never read", () => {
  it("cookie A + header B → the runtime receives A, never B", () => {
    const inbound = new Headers({ authorization: `Bearer ${B}`, "content-type": "application/json" });
    const out = headersOf(buildOutbound(inbound, BEGIN, A));
    assert.equal(out.get("authorization"), `Bearer ${A}`);
    assert.ok(!String(out.get("authorization")).includes(B), "the caller's bearer survived to the runtime");
  });

  it("a MISSING inbound Authorization still forwards A", () => {
    const out = headersOf(buildOutbound(new Headers({ "content-type": "application/json" }), BEGIN, A));
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
    const out = headersOf(buildOutbound(inbound, BEGIN, A));
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
    for (const leg of [BYTES, FINALIZE]) {
      const inbound = new Headers({
        authorization: `Bearer ${CAPABILITY}`,
        "content-type": "application/octet-stream",
      });
      const out = headersOf(buildOutbound(inbound, leg, A));
      assert.equal(out.get("authorization"), `Bearer ${CAPABILITY}`, `${leg.join("/")} lost the upload capability`);
      assert.ok(!String(out.get("authorization")).includes(A), "the session JWT reached a capability leg");
    }
  });

  it("a JWT-shaped bearer is REFUSED — never both credentials", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";
    assert.equal(isJwtShaped(jwt), true);
    const r = buildOutbound(new Headers({ authorization: `Bearer ${jwt}` }), BYTES, A);
    assert.equal(r.ok, false);
    assert.equal((r as { response: Response }).response.status, CAPABILITY_LEG_REFUSAL_STATUS);
  });

  it("a REAL capability is not mistaken for a JWT — the wall cannot false-positive", () => {
    assert.equal(isJwtShaped(CAPABILITY), false, "the wall would refuse every legitimate upload");
    assert.equal(isJwtShaped("eyJ.eyJ."), true, "an empty signature segment must still count as JWT-shaped");
    assert.equal(isJwtShaped("a.b"), false, "two segments are not a JWT");
  });

  it("no inbound credential → none forwarded, never a substitute", () => {
    const out = headersOf(buildOutbound(new Headers({ "content-length": "9" }), BYTES, A));
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
