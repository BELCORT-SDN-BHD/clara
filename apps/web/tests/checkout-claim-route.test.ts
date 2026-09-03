// `POST /checkout/success/claim` — server entry 3 of 3, the door that CREATES
// THE FIRM (裁-89's folded `claim_paid_firm`).
//
// The single most consequential POST in the product, so the cells below assert
// what did NOT happen at least as hard as what did: no door on a cross-origin
// request, no door for a caller with nothing to claim, no second call once a
// firm exists, and no identifier of any kind read out of the request.

import assert from "node:assert/strict";
import { test } from "node:test";

import { NextResponse } from "next/server";

import { handleClaimPaidFirmPost } from "../app/(entry)/checkout/success/claim/handler";
import { checkoutFlashCookie } from "@/lib/checkout/checkout-flash";
import type { OwnRegistrationResult } from "@/lib/registration/server-reads";

const SUBJECT = "22222222-2222-2222-2222-222222222222";
const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const FIRM = "44444444-4444-4444-4444-444444444444";
const ORIGIN = "https://app.clarabook.example";

function postRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}/checkout/success/claim`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      host: "app.clarabook.example",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    // A body the handler must never read. If a later change starts trusting
    // one, these values are what it would trust.
    body: new URLSearchParams({ registration: "99999999-9999-9999-9999-999999999999" }),
  });
}

function registrationResult(over: Record<string, unknown> = {}, progress = { checkoutOpen: true, paidUnconsumed: true }): OwnRegistrationResult {
  return {
    ok: true,
    subject: SUBJECT,
    rows: [{
      id: REGISTRATION,
      applicant: SUBJECT,
      firm_name: "ROME PROPERTIES",
      note: null,
      status: "open",
      decided_by: null,
      decided_at: null,
      reason: null,
      firm_id: null,
      created_at: "2026-09-02T00:00:00Z",
      ...over,
    }],
    context: { ok: false, reason: "no_membership" },
    checkoutProgress: progress,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function withDoor<T>(
  calls: Array<{ fn: string; args: Record<string, unknown> }>,
  answer: () => Response,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      fn: /\/rpc\/([A-Za-z0-9_]+)/.exec(String(input))?.[1] ?? "",
      args: JSON.parse(String(init?.body ?? "{}")),
    });
    return answer();
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

function readFlash(response: Response): Record<string, unknown> {
  const raw = (response as NextResponse).cookies.get(checkoutFlashCookie().name)?.value;
  assert.ok(raw, "no flash cookie was set");
  const url = new URL(response.headers.get("location") as string);
  assert.equal(url.pathname, "/checkout/success");
  assert.deepEqual([...url.searchParams.keys()], ["claim"]);
  const payload = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(payload.nonce, url.searchParams.get("claim"));
  return payload;
}

const deps = (over: Partial<{
  resolveSession: () => Promise<{ accessToken: string; subject: string } | null>;
  loadRegistration: () => Promise<OwnRegistrationResult>;
}> = {}) => ({
  resolveSession: over.resolveSession ?? (async () => ({ accessToken: "tok", subject: SUBJECT })),
  loadRegistration: over.loadRegistration ?? (async () => registrationResult()),
  newOpKey: () => "op-key-fixture",
});

test("THE HAPPY PATH: one door call, and the registration comes from the SESSION not the body", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const response = await withDoor(
    calls,
    () => json({ firm_id: FIRM, plan_id: "plan-1", registration_id: REGISTRATION }),
    () => handleClaimPaidFirmPost(postRequest(), deps()),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.deepEqual(calls.map((c) => c.fn), ["claim_paid_firm"]);
  // NIT-6: no id crosses the wire. The body named a DIFFERENT registration and
  // the handler must not have read it.
  assert.equal(calls[0]!.args.p_registration, REGISTRATION);
  assert.notEqual(calls[0]!.args.p_registration, "99999999-9999-9999-9999-999999999999");
  assert.deepEqual(Object.keys(calls[0]!.args).sort(), ["p_op_key", "p_registration"]);
});

test("cross-origin is 403 BEFORE the door, the session, or the registration read", async () => {
  const CROSS_ORIGIN: ReadonlyArray<Record<string, string>> = [
    { origin: "https://evil.example" },
    { origin: "null" },
    { origin: "https://app.clarabook.example", "sec-fetch-site": "cross-site" },
  ];
  for (const headers of CROSS_ORIGIN) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    let sessionReads = 0;
    let registrationReads = 0;
    const response = await withDoor(calls, () => json({}), () =>
      handleClaimPaidFirmPost(postRequest(headers), {
        resolveSession: async () => { sessionReads += 1; return { accessToken: "t", subject: SUBJECT }; },
        loadRegistration: async () => { registrationReads += 1; return registrationResult(); },
      }),
    );
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.deepEqual(calls, [], "a refused request created a firm");
    assert.equal(sessionReads, 0);
    assert.equal(registrationReads, 0);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("a caller with NOTHING TO CLAIM never reaches the door", async () => {
  // Each of these is a state the success page renders its own card for; none
  // of them may run a tenant-creating door "just in case". The pre-check is a
  // rendering decision, and the door still judges independently — but a door
  // call that cannot succeed is a wasted op key on a money surface.
  for (const [label, result] of [
    ["no payment observed", registrationResult({}, { checkoutOpen: true, paidUnconsumed: false })],
    ["no registration at all", { ok: true, subject: SUBJECT, rows: [], context: { ok: false, reason: "no_membership" }, checkoutProgress: { checkoutOpen: false, paidUnconsumed: false } } as OwnRegistrationResult],
    ["no session", { ok: false, reason: "no_session" } as OwnRegistrationResult],
    ["a malformed row", registrationResult({ id: 7 })],
    ["somebody else's row", registrationResult({ applicant: "33333333-3333-3333-3333-333333333333" })],
    ["a decided registration", registrationResult({ status: "rejected" })],
  ] as const) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const response = await withDoor(calls, () => json({}), () =>
      handleClaimPaidFirmPost(postRequest(), deps({ loadRegistration: async () => result })),
    );
    assert.equal(readFlash(response).kind, "unavailable", label);
    assert.deepEqual(calls, [], `${label}: the firm-creating door ran anyway`);
  }
});

test("an ALREADY-OPEN firm redirects home WITHOUT calling the door again", async () => {
  // `claim_paid_firm` would replay harmlessly, but a person cannot tell a
  // replay from a first run, and re-calling a tenant-creating door to learn
  // something a read already answered is not a shape to normalise.
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const response = await withDoor(calls, () => json({}), () =>
    handleClaimPaidFirmPost(
      postRequest(),
      deps({ loadRegistration: async () => registrationResult({ firm_id: FIRM, status: "approved" }) }),
    ),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.deepEqual(calls, [], "the door ran for a registration that already had a firm");
});

test("the door's refusal renders VERBATIM — code and sentence, never re-worded", async () => {
  for (const [code, message] of [
    ["CLR04", "not your registration request"],
    ["CLR09", "no completed payment for this registration"],
    ["CLR09", "the data processing agreement is not signed"],
    ["CLR04", "a verified email claim is required"],
  ]) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const response = await withDoor(calls, () => json({ code, message }, 400), () =>
      handleClaimPaidFirmPost(postRequest(), deps()),
    );
    const flash = readFlash(response);
    assert.equal(flash.kind, "refused", message);
    assert.equal(flash.code, code);
    assert.equal(flash.message, message, "the door's sentence was re-worded");
    assert.equal(calls.length, 1, "a refusal was retried");
  }
});

test("a 200 the door could not have meant is NOT a firm — unavailable, never a redirect home", async () => {
  // The UI never invents a receipt: a partial answer must not send someone to
  // a firm home that may not exist.
  //
  // BOTH ARMS ARE ASSERTED SEPARATELY. A first cut branched on the observed
  // redirect and checked the positive case inside the `if` — which never ran,
  // because every fixture in that list was partial. A cell whose positive
  // control cannot fire is a cell that only ever proves one direction.
  const partials = [{}, { firm_id: "" }, { firm_id: FIRM }, { firm_id: FIRM, plan_id: "p" },
    { firm_id: FIRM, registration_id: REGISTRATION }];
  for (const body of partials) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const response = await withDoor(calls, () => json(body), () =>
      handleClaimPaidFirmPost(postRequest(), deps()),
    );
    assert.equal(
      new URL(response.headers.get("location") as string).pathname,
      "/checkout/success",
      `a partial answer redirected home: ${JSON.stringify(body)}`,
    );
    assert.equal(readFlash(response).kind, "unavailable", JSON.stringify(body));
  }

  // MUST-NOT-RED CONTROL: the complete answer DOES redirect home, so the
  // refusals above are discriminating rather than a blanket refusal.
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const ok = await withDoor(
    calls,
    () => json({ firm_id: FIRM, plan_id: "plan-1", registration_id: REGISTRATION }),
    () => handleClaimPaidFirmPost(postRequest(), deps()),
  );
  assert.equal(new URL(ok.headers.get("location") as string).pathname, "/");
});
