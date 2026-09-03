import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleEmailConfirmationPost,
  type EmailConfirmationRouteClient,
} from "../../app/(entry)/auth/confirm/verify/handler";

// THE SAME-ORIGIN REFUSAL MATRIX for the confirm verify POST. Split from
// `email-confirmation.test.tsx` under the estate's 500-line document gate;
// the two files together own that handler's walls.
//
// WHAT EACH ROW PROVES, and why the order of the assertions matters as much
// as the 403. `proveSameOrigin` runs FIRST and unconditionally, before the
// body is read and before any auth client exists — so a refused request has
// no cookie-writing capability at all, and (under FS-4) never spends one of
// the applicant's five rate-wall attempts either. Asserting only the status
// would leave every one of those properties free to regress: a handler that
// read the body, called the wall, and THEN refused would still be 403.

const REFUSAL_CASES: ReadonlyArray<{
  readonly name: string;
  readonly headers: Record<string, string>;
  readonly requestUrl?: string;
  readonly nodeEnv?: string;
}> = [
  {
    name: "cross-origin",
    headers: { origin: "https://evil.example", host: "app.clarabook.example" },
  },
  {
    name: "same-site sibling",
    headers: {
      origin: "https://evil.clarabook.example",
      host: "app.clarabook.example",
      "sec-fetch-site": "same-site",
    },
  },
  {
    name: "missing Origin",
    headers: { host: "app.clarabook.example" },
  },
  {
    name: "cross-site Fetch Metadata",
    headers: {
      origin: "https://app.clarabook.example",
      host: "app.clarabook.example",
      "sec-fetch-site": "cross-site",
    },
  },
  {
    name: "production localhost loopback",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    requestUrl: "http://localhost:3000/auth/confirm/verify",
    nodeEnv: "production",
  },
  {
    name: "production 127.0.0.1 loopback",
    headers: {
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
    },
    requestUrl: "http://127.0.0.1:3000/auth/confirm/verify",
    nodeEnv: "production",
  },
];

for (const refusal of REFUSAL_CASES) {
  test(`NEW-1: ${refusal.name} refuses before body parsing, the wall, or auth`, async () => {
    const mutableEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = process.env.NODE_ENV;
    if (refusal.nodeEnv) mutableEnv.NODE_ENV = refusal.nodeEnv;
    let bodyReads = 0;
    let clientCreations = 0;
    let wallCalls = 0;
    const request = {
      headers: new Headers(refusal.headers),
      url: refusal.requestUrl ?? "https://app.clarabook.example/auth/confirm/verify",
      async formData() {
        bodyReads += 1;
        const form = new FormData();
        form.set("email", "attacker@example.com");
        form.set("token", "000000");
        return form;
      },
    } as unknown as Request;

    try {
      const response = await handleEmailConfirmationPost(
        request,
        async () => {
          clientCreations += 1;
          return {
            supabase: { auth: { setSession: async () => ({ data: { session: null }, error: null }) } },
            sealResponse: (r) => r,
          } as EmailConfirmationRouteClient;
        },
        async () => {
          wallCalls += 1;
          return { kind: "unavailable" };
        },
      );

      assert.equal(response.status, 403, `${refusal.name} was not refused`);
      assert.deepEqual(await response.json(), { ok: false, error: "cross-origin" });
      assert.equal(bodyReads, 0, `${refusal.name} was parsed before the wall`);
      assert.equal(wallCalls, 0, `${refusal.name} reached the attempt wall`);
      assert.equal(clientCreations, 0, `${refusal.name} created an auth client`);
      assert.equal(response.headers.get("set-cookie"), null, `${refusal.name} wrote a cookie`);
      assert.equal(response.headers.get("location"), null, `${refusal.name} redirected`);
    } finally {
      if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
      else mutableEnv.NODE_ENV = originalNodeEnv;
    }
  });
}
