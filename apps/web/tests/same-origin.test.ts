import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSameOriginRequest } from "../lib/same-origin";

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

  it("accepts when only the forwarded host is available (behind a proxy)", () => {
    assert.equal(
      isSameOriginRequest(
        headers({
          origin: "https://app.clara.example",
          "x-forwarded-host": "app.clara.example",
          "sec-fetch-site": "same-origin",
        }),
        "https://internal.worker.local/logout",
      ),
      true,
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
      ),
      true,
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
