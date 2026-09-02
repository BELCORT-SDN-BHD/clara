import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addressedPublicOrigin,
  isSameOriginRequest,
  proveSameOrigin,
  readSameOriginConfig,
} from "../lib/same-origin";

/**
 * Finding 11 (LOW) — same-site logout CSRF. `SameSite=Lax` blocks cross-SITE
 * POSTs but not a same-site cross-ORIGIN one, so a hostile sibling origin
 * (`evil.clara.example`) could POST /logout and end the victim's session.
 */

const APP_URL = "https://app.clara.example/logout";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("isSameOriginRequest — accepts only proved same-origin requests", () => {
  it("accepts the app's own fetch", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://app.clara.example",
          host: "app.clara.example",
          "sec-fetch-site": "same-origin",
        }),
        APP_URL,
      ),
      true,
    );
  });

  it("N3: a FORWARDED HOST alone no longer licenses anything — the allowlist does", () => {
    // CODEX ROUND 2, N3. This cell used to assert `true` for exactly this
    // request, on the reasoning that a proxy rewrites the request URL and
    // `x-forwarded-host` is how the real host survives. The hole: that header is
    // written by whoever spoke to us, so an attacker sends BOTH it and the
    // matching `Origin` and the wall compares their input against itself.
    // Cloudflare documents that it generally passes incoming headers through,
    // and nothing in this repo strips this one.
    const proxied = headers({
      origin: "https://app.clara.example",
      "x-forwarded-host": "app.clara.example",
      "sec-fetch-site": "same-origin",
    });

    // UNCONFIGURED → refused. Fail-closed and visible, rather than trusting the
    // hop blindly.
    assert.equal(
      isSameOriginRequest(proxied, "https://internal.worker.local/logout", {
        publicOrigins: [],
        allowInsecureLoopback: false,
      }),
      false,
      "a forwarded host with no configured allowlist must not prove anything",
    );

    // CONFIGURED → accepted, because the OPERATOR named this origin. The proxied
    // deployment still works; what changed is where the authority comes from.
    assert.equal(
      isSameOriginRequest(proxied, "https://internal.worker.local/logout", {
        publicOrigins: ["https://app.clara.example"],
        allowInsecureLoopback: false,
      }),
      true,
      "an allowlisted origin is proof of authority however the hop was rewritten",
    );
  });

  it("N3: THE ATTACK — a spoofed forwarded host cannot license the attacker's own origin", () => {
    // The real Host is Clara's; the attacker supplies both the Origin and a
    // matching X-Forwarded-Host. Under the old wall the proof came back
    // `{ok:true, origin:"https://attacker.example"}` and the courier mailed BOTH
    // bearer factors to a link on the attacker's domain.
    const spoofed = headers({
      origin: "https://attacker.example",
      host: "app.clara.example",
      "x-forwarded-host": "attacker.example",
      "sec-fetch-site": "same-origin",
    });
    for (const config of [
      { publicOrigins: [], allowInsecureLoopback: false },
      { publicOrigins: ["https://app.clara.example"], allowInsecureLoopback: false },
    ]) {
      assert.equal(
        isSameOriginRequest(spoofed, "https://app.clara.example/api/invite", config),
        false,
        `the spoofed forwarded host was accepted with publicOrigins=${JSON.stringify(config.publicOrigins)}`,
      );
    }
  });

  it("N3: the allowlist is parsed exactly — unparseable entries widen nothing", () => {
    const { publicOrigins } = readSameOriginConfig({
      CLARA_PUBLIC_ORIGINS: " https://app.clara.example/ , not a url , , https://second.example:8443 ",
    });
    assert.deepEqual(
      publicOrigins,
      ["https://app.clara.example", "https://second.example:8443"],
      "entries normalise through URL.origin; junk is DROPPED, never admitted",
    );
    assert.deepEqual(readSameOriginConfig({}).publicOrigins, [], "absent means not configured, not permissive");
  });

  it("N3: configured entries must be exact canonical origins, with only an optional trailing slash", () => {
    for (const invalid of [
      "https://app.clara.example/path",
      "https://user:password@app.clara.example",
      "https://app.clara.example?mode=invite",
      "https://app.clara.example#invite",
      "https:app.clara.example",
      "https://App.Clara.example",
      "https://app.clara.example:443",
    ]) {
      assert.deepEqual(
        readSameOriginConfig({ CLARA_PUBLIC_ORIGINS: invalid }).publicOrigins,
        [],
        `${invalid} is a URL, but not an exact canonical origin`,
      );
    }
    assert.deepEqual(
      readSameOriginConfig({
        CLARA_PUBLIC_ORIGINS: "https://app.clara.example, https://second.example:8443/",
      }).publicOrigins,
      ["https://app.clara.example", "https://second.example:8443"],
    );
  });

  it("LOW-A: the configured allowlist widens the Host proof; it never replaces it", () => {
    const requestHeaders = headers({
      origin: "https://app.example",
      host: "app.example",
      "sec-fetch-site": "same-origin",
    });
    const config = { publicOrigins: ["https://unrelated.example"], allowInsecureLoopback: false };
    assert.deepEqual(
      proveSameOrigin(requestHeaders, "https://app.example/api/invite", config),
      { ok: true, origin: "https://app.example" },
    );

    const replacementMutant = (origin: string): boolean => config.publicOrigins.includes(origin);
    assert.equal(
      replacementMutant("https://app.example"),
      false,
      "RED-BEFORE: replacing the Host proof with the allowlist alone rejects this valid request",
    );
  });

  it("accepts a browser that sends no Sec-Fetch-Site but a matching Origin", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://app.clara.example",
          host: "app.clara.example",
        }),
        APP_URL,
      ),
      true,
    );
  });
});

describe("isSameOriginRequest — refusals", () => {
  it("refuses a hostile SIBLING origin (the finding's exploit)", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://evil.clara.example",
          host: "app.clara.example",
          "sec-fetch-site": "same-site",
        }),
        APP_URL,
      ),
      false,
    );
  });

  it("refuses a sibling origin even without the Sec-Fetch-Site hint", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://evil.clara.example",
          host: "app.clara.example",
        }),
        APP_URL,
      ),
      false,
    );
  });

  it("refuses a cross-site origin", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://evil.example",
          host: "app.clara.example",
          "sec-fetch-site": "cross-site",
        }),
        APP_URL,
      ),
      false,
    );
  });

  it("refuses a MISSING Origin — absence is never evidence", () => {
    assert.equal(
      isSameOriginRequest(headers({ host: "app.clara.example" }), APP_URL),
      false,
    );
  });

  it("refuses an unparseable Origin", () => {
    assert.equal(
      isSameOriginRequest(
        headers({ origin: "not a url", host: "app.clara.example" }),
        APP_URL,
      ),
      false,
    );
  });

  it("refuses the opaque `null` Origin (sandboxed iframe, redirected POST)", () => {
    assert.equal(
      isSameOriginRequest(
        headers({ origin: "null", host: "app.clara.example" }),
        APP_URL,
      ),
      false,
    );
  });

  it("refuses a host-prefix lookalike", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://app.clara.example.evil.test",
          host: "app.clara.example",
        }),
        APP_URL,
      ),
      false,
    );
  });

  it("refuses when nothing names the addressed host", () => {
    assert.equal(
      isSameOriginRequest(
        headers({ origin: "https://app.clara.example" }),
        "::::not a url",
      ),
      false,
    );
  });

  it("refuses a plain-HTTP Origin against a matching prod-like host (reviewer note 2)", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "http://app.clara.example",
          host: "app.clara.example",
          "sec-fetch-site": "same-origin",
        }),
        APP_URL,
      ),
      false,
    );
  });
});

describe("isSameOriginRequest — scheme check (reviewer note 2)", () => {
  it("accepts loopback http (local dev only ever serves HTTP)", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "http://localhost:3000",
          host: "localhost:3000",
          "sec-fetch-site": "same-origin",
        }),
        "http://localhost:3000/logout",
        readSameOriginConfig({ CLARA_ALLOW_INSECURE_LOOPBACK: "1" }),
      ),
      true,
    );
  });

  it("accepts loopback http via 127.0.0.1", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "http://127.0.0.1:3000",
          host: "127.0.0.1:3000",
          "sec-fetch-site": "same-origin",
        }),
        "http://127.0.0.1:3000/logout",
        readSameOriginConfig({ CLARA_ALLOW_INSECURE_LOOPBACK: "1" }),
      ),
      true,
    );
  });

  it("N5: the SAME loopback request is refused in production and accepted in development", () => {
    // CODEX ROUND 2, N5. The two cells above pinned the loopback exception as
    // UNCONDITIONAL, which is right for local dev and wrong everywhere else: a
    // production invite could be mailed with both bearer factors pointing at
    // `http://localhost/...`, i.e. at whatever is listening on the recipient's
    // own machine. One request, two configs, two answers — so this measures the
    // boundary rather than either side of it.
    for (const [origin, url] of [
      ["http://localhost:3000", "http://localhost:3000/logout"],
      ["http://127.0.0.1:3000", "http://127.0.0.1:3000/logout"],
    ] as const) {
      const request = headers({ origin, host: new URL(origin).host, "sec-fetch-site": "same-origin" });
      assert.equal(
        isSameOriginRequest(request, url, { publicOrigins: [], allowInsecureLoopback: true }),
        true,
        `${origin} must still work in development`,
      );
      assert.equal(
        isSameOriginRequest(request, url, { publicOrigins: [], allowInsecureLoopback: false }),
        false,
        `${origin} MUST NOT be accepted in production — that link carries both invite secrets`,
      );
    }
  });

  it("N5: loopback is enabled only by development mode or the explicit flag", () => {
    assert.equal(readSameOriginConfig({ NODE_ENV: "production" }).allowInsecureLoopback, false);
    assert.equal(readSameOriginConfig({ NODE_ENV: "development" }).allowInsecureLoopback, true);
    for (const env of [
      {},
      { NODE_ENV: "test" },
      { NODE_ENV: "staging" },
      { NODE_ENV: "Development" },
      { NODE_ENV: "garbage" },
    ]) {
      assert.equal(readSameOriginConfig(env).allowInsecureLoopback, false, JSON.stringify(env));
    }
    assert.equal(readSameOriginConfig({ CLARA_ALLOW_INSECURE_LOOPBACK: "1" }).allowInsecureLoopback, true);
    assert.equal(readSameOriginConfig({ NODE_ENV: "test", CLARA_ALLOW_INSECURE_LOOPBACK: "1" }).allowInsecureLoopback, true);
    assert.equal(
      readSameOriginConfig({ NODE_ENV: "production", CLARA_ALLOW_INSECURE_LOOPBACK: "1" }).allowInsecureLoopback,
      false,
      "production kills the development-only escape hatch even when the flag is present",
    );
    assert.equal(readSameOriginConfig({ CLARA_ALLOW_INSECURE_LOOPBACK: "true" }).allowInsecureLoopback, false);
  });

  it("N5: an allowlisted HTTP loopback origin is still refused in production", () => {
    // The allowlist widens the HOST match, never the SCHEME ruling. Naming
    // `http://localhost:3000` in `CLARA_PUBLIC_ORIGINS` must not resurrect the
    // insecure-scheme exception in production.
    assert.equal(
      isSameOriginRequest(
        headers({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }),
        "https://app.clara.example/logout",
        { publicOrigins: ["http://localhost:3000"], allowInsecureLoopback: false },
      ),
      false,
    );
  });

  it("refuses http for a non-loopback host even with a matching Host header", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "http://staging.clara.example",
          host: "staging.clara.example",
          "sec-fetch-site": "same-origin",
        }),
        "http://staging.clara.example/logout",
      ),
      false,
    );
  });
});

/**
 * F1 of the independent review of #507. The password-recovery callback is a
 * top-level navigation out of a mail client — no `Origin` header exists to
 * judge — so it asks a different question of the same allowlist, through the
 * same module. These cells drive `addressedPublicOrigin` directly; the handler's
 * own cells (`tests/password-recovery-handler.test.ts`) prove the route uses it.
 */
describe("addressedPublicOrigin — which of our own origins did this request address", () => {
  const TWO = {
    publicOrigins: ["https://first.clara.example", "https://second.clara.example"],
    allowInsecureLoopback: false,
  } as const;

  it("returns the request URL's own origin when it is an allowlist member", () => {
    assert.equal(
      addressedPublicOrigin(
        headers({ host: "second.clara.example" }),
        "https://second.clara.example/auth/recover?code=x",
        TWO,
      ),
      "https://second.clara.example",
    );
  });

  it("NEVER answers with the first entry when the request addressed the second", () => {
    // The defect itself: `publicOrigins[0]` sealed the recovery cookie on one
    // origin and bounced the browser to another. Both directions are pinned so
    // an implementation that simply reverses the index cannot pass.
    for (const addressed of TWO.publicOrigins) {
      assert.equal(
        addressedPublicOrigin(headers({ host: new URL(addressed).host }), "http://internal.hop/x", TWO),
        addressed,
      );
    }
  });

  it("takes the SCHEME from the matched allowlist entry, never from x-forwarded-proto", () => {
    // Deliberately the SECOND member, so a `publicOrigins[0]` implementation
    // cannot pass this cell by coincidence.
    assert.equal(
      addressedPublicOrigin(
        headers({ host: "second.clara.example", "x-forwarded-proto": "http" }),
        "http://internal.hop/auth/recover",
        TWO,
      ),
      "https://second.clara.example",
    );
  });

  it("refuses a Host that names no member, whatever the forwarded headers say", () => {
    assert.equal(
      addressedPublicOrigin(
        headers({
          host: "attacker.example",
          "x-forwarded-host": "first.clara.example",
          "x-forwarded-proto": "https",
        }),
        "http://internal.hop/auth/recover",
        TWO,
      ),
      null,
    );
  });

  it("refuses when there is no Host header at all — absence is not evidence", () => {
    assert.equal(addressedPublicOrigin(headers({}), "http://internal.hop/auth/recover", TWO), null);
  });

  it("refuses an AMBIGUOUS host — one authority named under two schemes is not an answer", () => {
    assert.equal(
      addressedPublicOrigin(headers({ host: "both.clara.example" }), "http://internal.hop/x", {
        publicOrigins: ["http://both.clara.example", "https://both.clara.example"],
        allowInsecureLoopback: false,
      }),
      null,
    );
  });

  it("matches the Host case-insensitively, and a duplicated Host header refuses", () => {
    assert.equal(
      addressedPublicOrigin(headers({ host: "First.Clara.Example" }), "http://internal.hop/x", TWO),
      "https://first.clara.example",
    );
    const duplicated = new Headers();
    duplicated.append("host", "first.clara.example");
    duplicated.append("host", "second.clara.example");
    assert.equal(addressedPublicOrigin(duplicated, "http://internal.hop/x", TWO), null);
  });

  it("UNCONFIGURED: with no allowlist the request URL's own origin is the answer", () => {
    const unconfigured = { publicOrigins: [], allowInsecureLoopback: false };
    assert.equal(
      addressedPublicOrigin(headers({ host: "anything.example" }), "https://internal.example/x", unconfigured),
      "https://internal.example",
    );
    assert.equal(addressedPublicOrigin(headers({}), "not a url", unconfigured), null);
  });
});
