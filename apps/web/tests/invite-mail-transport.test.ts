// THE PRODUCTION MAIL TRANSPORT — `productionInviteMailer`, driven for real.
// P4-4, folding LOW-7 and MEDIUM-3 of the independent review of #455.
//
// WHY THIS FILE EXISTS. `tests/invite-courier.test.ts` drives the courier
// through an INTERFACE, so every cell there is true of any object shaped like an
// `InviteMailer` — including one that never touches Supabase or Resend at all.
// The two claims `lib/members/invite-mail.ts`'s header makes are claims about the
// REAL transport, and nothing that mocks the transport can check them:
//
//   1. THE SERVICE-ROLE KEY IS PASSED TO THE CLIENT CONSTRUCTOR AND NOWHERE ELSE.
//      It never reaches Resend, never reaches a URL, never reaches a log.
//   2. THE ONLY ADMIN OPERATIONS THIS APP PERFORMS ARE `listUsers` AND
//      `generateLink`. Measured by recording every property read off
//      `auth.admin`, so a third operation cannot be added unnoticed.
//
// So `productionInviteMailer` takes its two outside worlds as injectable deps
// (both defaulting to the real thing) and this file drives the SHIPPING body.
//
// THE `server-only` QUESTION is answered in `tests/server-boundary.test.ts`, not
// here — see the note at the foot of this file for what moved and why.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CAN_MINT_MAX_PAGES,
  CAN_MINT_PAGE_SIZE,
  classifyProviderStatus,
  escapeHtml,
  integerStatus,
  InviteMailFailure,
  isConfirmedUser,
  isInviteMailFailure,
  productionInviteMailer,
  renderInviteEmail,
  RESEND_ENDPOINT,
  sameAddress,
  type InviteMailConfig,
} from "../lib/members/invite-mail";

// `PLACEHOLDER` is what `scripts/check-leaks.mjs` accepts as an EXPLICIT
// placeholder (`SECRET_PLACEHOLDER`, `check-leaks.mjs:40`). The two key fields
// are deliberately DIFFERENT strings so a cell can tell which one travelled.
const CONFIG: InviteMailConfig = {
  supabaseUrl: "https://rig.supabase.test",
  serviceRoleKey: "PLACEHOLDER-service",
  resendApiKey: "PLACEHOLDER-resend",
  from: "Clara <invites@example.test>",
};

type AdminUser = {
  email?: string | null;
  email_confirmed_at?: unknown;
  phone_confirmed_at?: unknown;
  confirmed_at?: unknown;
};
type ListResult = { data: { users: AdminUser[] } | null; error: { message: string; status?: number } | null };

/** THE RECORDING CLIENT. Every argument the constructor received, and every
 *  property NAME read off `auth.admin` — the latter through a Proxy, so "the only
 *  admin operations are these two" is a measurement rather than a claim. */
function recordingClient(script: {
  listUsers?: (p: { page?: number; perPage?: number }) => ListResult;
  generateLink?: (a: { type: string; email: string }) => {
    data: { properties?: { hashed_token?: unknown } } | null;
    error: { message: string; status?: number } | null;
  };
}) {
  const constructedWith: { url: string; key: string; opts: unknown }[] = [];
  const adminOps: string[] = [];
  const listUsersCalls: { page?: number; perPage?: number }[] = [];
  const generateLinkCalls: { type: string; email: string }[] = [];

  const admin = new Proxy(
    {
      listUsers: async (p: { page?: number; perPage?: number }) => {
        listUsersCalls.push(p);
        return script.listUsers?.(p) ?? { data: { users: [] }, error: null };
      },
      generateLink: async (a: { type: string; email: string }) => {
        generateLinkCalls.push(a);
        return script.generateLink?.(a) ?? { data: { properties: { hashed_token: "h" } }, error: null };
      },
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (typeof prop === "string") adminOps.push(prop);
        return target[prop as string];
      },
    },
  );

  const createClient = ((url: string, key: string, opts: unknown) => {
    constructedWith.push({ url, key, opts });
    return { auth: { admin } };
  }) as never;

  return { createClient, constructedWith, adminOps, listUsersCalls, generateLinkCalls };
}

/** A fetch that records the WHOLE call — url, method, headers and body — so a
 *  cell can assert what a key did NOT travel in. */
function recordingFetch(reply: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return reply();
  }) as never;
  return { fetch: fn, calls };
}

function serialise(call: { url: string; init: RequestInit }): string {
  return JSON.stringify({ url: call.url, headers: call.init.headers, body: call.init.body });
}

// ---------------------------------------------------------------------------
// LOW-7 (1) — THE SERVICE-ROLE KEY GOES TO THE CONSTRUCTOR AND NOWHERE ELSE
// ---------------------------------------------------------------------------

describe("the service-role key's only destination is the Supabase client constructor", () => {
  test("canMintFor constructs with (url, serviceRoleKey, no-session opts) and reads only listUsers", async () => {
    const client = recordingClient({ listUsers: () => ({ data: { users: [] }, error: null }) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });

    assert.deepEqual(await mailer.canMintFor("nobody@example.test"), { ok: true });

    assert.equal(client.constructedWith.length, 1, "one client per call — never a module-scope singleton");
    assert.equal(client.constructedWith[0]!.url, CONFIG.supabaseUrl);
    assert.equal(client.constructedWith[0]!.key, CONFIG.serviceRoleKey, "the SERVICE key, not the anon key");
    assert.deepEqual(client.constructedWith[0]!.opts, {
      auth: { autoRefreshToken: false, persistSession: false },
      // A client that persisted or refreshed a session would outlive the request
      // that made it — the header's own reason for building per request.
    });
    assert.deepEqual([...new Set(client.adminOps)], ["listUsers"], "NO OTHER ADMIN OPERATION MAY BE TOUCHED");
  });

  test("mintSupabaseTokenHash reads only generateLink, and asks for an invite link", async () => {
    const client = recordingClient({
      generateLink: () => ({ data: { properties: { hashed_token: "hashed-abc" } }, error: null }),
    });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });

    assert.equal(await mailer.mintSupabaseTokenHash("new@example.test"), "hashed-abc");
    assert.deepEqual([...new Set(client.adminOps)], ["generateLink"]);
    assert.deepEqual(client.generateLinkCalls, [{ type: "invite", email: "new@example.test" }]);
    assert.equal(client.constructedWith[0]!.key, CONFIG.serviceRoleKey);
  });

  test("send authorises with the RESEND key, and the SERVICE key appears nowhere in the request", async () => {
    const net = recordingFetch(() => new Response("{}", { status: 200 }));
    const mailer = productionInviteMailer(CONFIG, { fetch: net.fetch });

    await mailer.send({ to: "new@example.test", subject: "s", html: "<p>h</p>" });

    assert.equal(net.calls.length, 1);
    const call = net.calls[0]!;
    assert.equal(call.url, RESEND_ENDPOINT, "one endpoint, imported rather than retyped");
    assert.equal(call.init.method, "POST");
    const wire = serialise(call);
    assert.ok(wire.includes(CONFIG.resendApiKey), "POSITIVE CONTROL: the Resend key IS on this request…");
    assert.ok(
      !wire.includes(CONFIG.serviceRoleKey),
      "…AND THE SERVICE-ROLE KEY IS NOT. It has no business at a third-party mail provider.",
    );
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      from: CONFIG.from,
      to: ["new@example.test"],
      subject: "s",
      html: "<p>h</p>",
    });
  });

  test("send constructs NO Supabase client at all — the two worlds do not touch", async () => {
    const client = recordingClient({});
    const net = recordingFetch(() => new Response("{}", { status: 200 }));
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient, fetch: net.fetch });
    await mailer.send({ to: "a@b.test", subject: "s", html: "h" });
    assert.equal(client.constructedWith.length, 0);
    assert.deepEqual(client.adminOps, []);
  });
});

// ---------------------------------------------------------------------------
// FIND-1's SOUNDNESS — WHICH END-OF-LIST SIGNAL, AND WHY
// ---------------------------------------------------------------------------

describe("canMintFor answers {ok:true} only when it has SEEN the whole directory", () => {
  const pageOf = (emails: string[]): ListResult => ({
    data: { users: emails.map((email) => ({ email, email_confirmed_at: "2026-08-01T00:00:00Z" })) },
    error: null,
  });

  test("a match on page 1 is already_registered", async () => {
    const client = recordingClient({ listUsers: () => pageOf(["taken@example.test"]) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    assert.deepEqual(await mailer.canMintFor("taken@example.test"), { ok: false, reason: "already_registered" });
    assert.equal(client.listUsersCalls.length, 1, "it stops the moment it has a positive answer");
  });

  test("N2(3): a serialised UNCONFIRMED row with email_confirmed_at OMITTED proceeds", async () => {
    // CODEX ROUND 2, N2(3). The scan treated the mere EXISTENCE of a matching row
    // as the refusal condition. Supabase rejects `generateLink({type:"invite"})`
    // only for a CONFIRMED user and permits an unconfirmed one — so refusing
    // those was a self-inflicted 409 on a flow that would have worked.
    const unconfirmed = recordingClient({
      listUsers: (p) =>
        (p.page ?? 1) === 1
          ? { data: { users: [{ email: "pending@example.test" }] }, error: null }
          : { data: { users: [] }, error: null },
    });
    assert.deepEqual(
      await productionInviteMailer(CONFIG, { createClient: unconfirmed.createClient }).canMintFor("pending@example.test"),
      { ok: true },
      "an unconfirmed account may still be invited",
    );

  });

  test("N2(3): phone-only confirmation does not make the email confirmed", async () => {
    const phoneOnly = recordingClient({
      listUsers: (p) =>
        (p.page ?? 1) === 1
          ? {
              data: {
                users: [{
                  email: "phone-only@example.test",
                  phone_confirmed_at: "2026-08-01T00:00:00Z",
                  confirmed_at: "2026-08-01T00:00:00Z",
                }],
              },
              error: null,
            }
          : { data: { users: [] }, error: null },
    });
    assert.deepEqual(
      await productionInviteMailer(CONFIG, { createClient: phoneOnly.createClient }).canMintFor("phone-only@example.test"),
      { ok: true },
      "GoTrue's invite decision is email confirmation, not legacy confirmed_at",
    );
  });

  test("N2(3): an EMAIL-confirmed matching row is already_registered", async () => {
    const confirmed = recordingClient({
      listUsers: () => ({
        data: { users: [{ email: "live@example.test", email_confirmed_at: "2026-08-01T00:00:00Z" }] },
        error: null,
      }),
    });
    assert.deepEqual(
      await productionInviteMailer(CONFIG, { createClient: confirmed.createClient }).canMintFor("live@example.test"),
      { ok: false, reason: "already_registered" },
    );
  });

  test("N2(3): malformed email confirmation timestamps make the directory unreadable", async () => {
    for (const user of [
      { email: "x@example.test", email_confirmed_at: "" },
      { email: "x@example.test", email_confirmed_at: "not-a-date" },
      { email: "x@example.test", email_confirmed_at: 17 },
    ]) {
      const client = recordingClient({ listUsers: () => ({ data: { users: [user] }, error: null }) });
      await assert.rejects(
        () => productionInviteMailer(CONFIG, { createClient: client.createClient }).canMintFor("x@example.test"),
        (e: unknown) => isInviteMailFailure(e) && e.code === "directory_unreadable",
        `${JSON.stringify(user)} must refuse as MALFORMED, never become unconfirmed → mint`,
      );
      assert.deepEqual(client.generateLinkCalls, [], "the malformed row never reaches the provider mint");
    }

    assert.equal(isConfirmedUser({}), false, "omitempty makes a missing field the real unconfirmed wire shape");
    assert.equal(isConfirmedUser({ email_confirmed_at: null }), false);
    assert.equal(isConfirmedUser({ email_confirmed_at: "2026-08-01T00:00:00Z" }), true);
    assert.equal(isConfirmedUser({ email_confirmed_at: "2099-01-01T00:00:00Z" }), true, "future is still confirmed");
    assert.throws(
      () => isConfirmedUser({ email_confirmed_at: "" }),
      (e: unknown) => isInviteMailFailure(e) && e.code === "directory_unreadable",
    );
  });

  test("the match is case- and whitespace-insensitive, exactly as the door normalises", async () => {
    // `0147:379` applies `lower(btrim(p_email))`. A check that disagreed with the
    // door about what "the same address" means would refuse the wrong requests.
    const client = recordingClient({ listUsers: () => pageOf(["Taken@Example.TEST"]) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    assert.deepEqual(await mailer.canMintFor("  taken@example.test "), { ok: false, reason: "already_registered" });
    assert.equal(sameAddress(" A@B.test", "a@b.TEST "), true);
  });

  test("A SHORT PAGE IS NOT THE END: a clamped per_page must not hide page 2", async () => {
    // THE HAZARD THIS SIGNAL EXISTS FOR. `perPage` goes straight through to
    // GoTrue's `per_page`, and a server that CLAMPS it returns a short page for
    // EVERY page. Reading "short" as "last" would answer 'not registered' for an
    // address on page 2 — re-opening the exact bug FIND-1 closes, invisibly.
    const pages: ListResult[] = [pageOf(["someone@example.test"]), pageOf(["target@example.test"]), pageOf([])];
    const client = recordingClient({ listUsers: (p) => pages[(p.page ?? 1) - 1] ?? pageOf([]) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });

    assert.deepEqual(
      await mailer.canMintFor("target@example.test"),
      { ok: false, reason: "already_registered" },
      "an address on page 2 was missed — the walk stopped at a short page",
    );
    assert.equal(client.listUsersCalls.length, 2, "it read page 2 to find it");
    assert.ok(
      (pages[0]!.data?.users.length ?? 0) < CAN_MINT_PAGE_SIZE,
      "VACUITY GUARD: page 1 must actually be SHORT for this to discriminate",
    );
  });

  test("an EMPTY page is the end of the list, and the walk stops there", async () => {
    const client = recordingClient({ listUsers: (p) => ((p.page ?? 1) === 1 ? pageOf(["other@example.test"]) : pageOf([])) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    assert.deepEqual(await mailer.canMintFor("free@example.test"), { ok: true });
    assert.equal(client.listUsersCalls.length, 2, "page 1 had rows, page 2 was empty — two reads, then done");
  });

  test("LOW-5: the two pagination constants are pinned to their LITERALS, not to themselves", async () => {
    // Native review LOW-5. Every other cell here compares the constants against
    // THEMSELVES (`users.length < CAN_MINT_PAGE_SIZE`, `listUsersCalls.length ===
    // CAN_MINT_MAX_PAGES`), so halving either one — or dropping the ceiling to 1 —
    // stayed green while silently changing what the check can see. A constant that
    // only ever validates against itself is not pinned at all.
    //
    // THE ARITHMETIC THESE NUMBERS EXIST FOR, from the module's own header: 40
    // pages × 1000 covers 40,000 accounts at the requested page size, and 2,000
    // even if the server clamps `per_page` to GoTrue's own 50 default. Both are
    // orders of magnitude beyond an accounting firm's staff roster. Past the
    // ceiling the answer is an EXCEPTION, never an optimistic `{ok:true}` — so
    // WIDENING these is a cost decision (more service-role calls per probe, which
    // is the rate-limit surface the authority preflight also bounds) and
    // NARROWING them makes a legitimate directory unreadable. Either way it should
    // be a deliberate edit that reds this cell, not a silent one.
    assert.equal(CAN_MINT_PAGE_SIZE, 1000);
    assert.equal(CAN_MINT_MAX_PAGES, 40);
    assert.equal(CAN_MINT_PAGE_SIZE * CAN_MINT_MAX_PAGES, 40_000, "the documented ceiling at the requested page size");
    assert.equal(50 * CAN_MINT_MAX_PAGES, 2_000, "…and the floor if GoTrue clamps per_page to its own default");
  });

  test("the page request carries the documented PageParams and nothing else", async () => {
    const client = recordingClient({ listUsers: () => pageOf([]) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    await mailer.canMintFor("free@example.test");
    assert.deepEqual(client.listUsersCalls, [{ page: 1, perPage: CAN_MINT_PAGE_SIZE }]);
  });

  test("A DIRECTORY THAT NEVER ENDS REFUSES — it never becomes an optimistic yes", async () => {
    const client = recordingClient({ listUsers: () => pageOf(["someone@example.test"]) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    await assert.rejects(
      () => mailer.canMintFor("free@example.test"),
      (e: unknown) => isInviteMailFailure(e) && e.code === "directory_too_large",
    );
    assert.equal(client.listUsersCalls.length, CAN_MINT_MAX_PAGES, "it walked its whole ceiling before refusing");
  });

  test("AN ERROR IS CHECKED BEFORE THE EMPTY-PAGE SIGNAL — auth-js returns users:[] WITH its error", async () => {
    // Read in the shipped client (`@supabase/auth-js@2.112.4`,
    // `GoTrueAdminApi.js`'s own `listUsers`): on an AuthError it returns
    // `{ data: { users: [] }, error }`. So an unreadable directory arrives
    // looking EXACTLY like the end of the list. Testing `error` first is what
    // keeps "I could not read it" from becoming "there is nobody there".
    const client = recordingClient({
      listUsers: () => ({ data: { users: [] }, error: { message: "bad jwt", status: 401 } }),
    });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    await assert.rejects(
      () => mailer.canMintFor("free@example.test"),
      (e: unknown) => isInviteMailFailure(e) && e.code === "directory_unreadable" && e.providerStatus === 401,
      "AN EMPTY PAGE CARRYING AN ERROR MUST NOT LICENSE {ok:true}",
    );
  });

  test("A NULL OR MALFORMED PAYLOAD IS NOT AN EMPTY DIRECTORY — it refuses", async () => {
    // CODEX ROUND 2, N2(1), and the cell that used to sit here BLESSED the
    // defect: it asserted `{ok:true}` for `data: null` on the reasoning that "a
    // null payload cannot hide a matching address". That reasoning is exactly
    // backwards. A null payload cannot REVEAL one either — and `{ok:true}` is not
    // "no match found", it is the positive claim "I have read the entire
    // directory and this address is free", which then licenses a mint. A derived
    // state standing in as positive evidence is what review law 2 forbids, and
    // here it buys a dead invite and a seven-day block on the address.
    for (const payload of [
      { data: null, error: null },
      { data: {} as { users: AdminUser[] }, error: null },
      { data: { users: null } as unknown as { users: AdminUser[] }, error: null },
      { data: { users: "nope" } as unknown as { users: AdminUser[] }, error: null },
    ]) {
      const client = recordingClient({ listUsers: () => payload });
      const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
      await assert.rejects(
        () => mailer.canMintFor("free@example.test"),
        (e: unknown) => isInviteMailFailure(e) && e.code === "directory_unreadable",
        `a payload of ${JSON.stringify(payload.data)} must refuse, never answer {ok:true}`,
      );
    }
  });

  test("POSITIVE CONTROL: a genuinely present EMPTY array still answers {ok:true}", async () => {
    // Without this the cell above is equally green on a transport that refuses
    // everything — and the empty-page signal is the only thing that ever
    // licenses a mint, so it has to keep working.
    const client = recordingClient({ listUsers: () => ({ data: { users: [] }, error: null }) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    assert.deepEqual(await mailer.canMintFor("free@example.test"), { ok: true });
  });
});

// ---------------------------------------------------------------------------
// MEDIUM-3 — EVERY FAILURE IS A CODE, NEVER A PROVIDER'S SENTENCE
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LOW-3 — THE MAIL BODY'S ESCAPING
// ---------------------------------------------------------------------------

describe("LOW-3: renderInviteEmail escapes every value that reaches the markup", () => {
  // Native review LOW-3: `escapeHtml` and its three call sites had ZERO coverage —
  // replacing the body with `(v) => v` left the whole suite green. Three of the
  // four values in this template are attacker-influenced or free text: the FIRM
  // NAME is typed by a person, the ROLE comes off the request body, and the URL is
  // composed. The invitee has no Clara account yet, so the audience for an
  // injected payload is whoever opens the mail.

  const HOSTILE = '<img src=x onerror=1>';

  test("a hostile firm name reaches the body ESCAPED, and never as live markup", () => {
    const content = renderInviteEmail({
      firmName: HOSTILE,
      role: "bookkeeper",
      inviteUrl: "https://app.clara.example/invite/abc?ct=xyz",
      expiresAt: "2026-09-06T00:00:00Z",
    });

    assert.ok(!content.html.includes(HOSTILE), "the raw payload must not appear in the HTML at all");
    assert.ok(
      content.html.includes("&lt;img src=x onerror=1&gt;"),
      "…and the escaped bytes must — a name is displayed, not executed",
    );
    assert.ok(!/<img/i.test(content.html), "no <img element may exist in the rendered body");
    assert.ok(!/onerror/i.test(content.html.replace(/onerror=1&gt;/g, "")), "no live event handler survives");
  });

  test("the role and the URL are escaped on the same path", () => {
    const content = renderInviteEmail({
      firmName: null,
      role: '"><script>alert(1)</script>',
      inviteUrl: 'https://app.clara.example/invite/a"><script>x</script>?ct=y',
      expiresAt: "2026-09-06T00:00:00Z",
    });
    assert.ok(!/<script/i.test(content.html), "no <script element may exist in the rendered body");
    assert.ok(content.html.includes("&lt;script&gt;"), "the role's payload is escaped, not dropped");
    // THE HREF IS STILL A USABLE LINK. Escaping must not break the one thing the
    // mail exists to carry, so the attribute's quotes are the escaped form and
    // the URL's own characters survive round-tripping.
    const href = /href="([^"]+)"/.exec(content.html)?.[1];
    assert.ok(href, "the mail must still carry an href");
    assert.ok((href as string).startsWith("https://app.clara.example/invite/"), "…pointing where it was built to point");
    assert.ok(!(href as string).includes('"'), "an unescaped quote would break out of the attribute");
  });

  test("the ORDINARY case still renders the firm name and the link intact", () => {
    // The positive control: escaping that mangled a normal name or a normal URL
    // would be a different bug, and the cells above would not see it.
    const content = renderInviteEmail({
      firmName: "ROME PROPERTIES",
      role: "admin",
      inviteUrl: "https://app.clara.example/invite/abc?ct=xyz",
      expiresAt: "2026-09-06T00:00:00Z",
    });
    assert.match(content.subject, /ROME PROPERTIES/);
    assert.match(content.html, /<strong>ROME PROPERTIES<\/strong>/);
    assert.equal(/href="([^"]+)"/.exec(content.html)?.[1], "https://app.clara.example/invite/abc?ct=xyz");
  });

  test("RED-BEFORE: an IDENTITY escapeHtml passes the old suite and fails these cells", () => {
    // The measurement that makes LOW-3 a finding rather than a preference: the
    // mutant the reviewer describes, run here.
    const identity = (v: string): string => v;
    const mutated = `<p>You have been invited to join <strong>${identity(HOSTILE)}</strong> on Clara.</p>`;
    assert.ok(mutated.includes(HOSTILE), "the identity mutant emits the payload verbatim…");
    assert.ok(/<img/i.test(mutated), "…as LIVE markup, which the cells above would catch");
    // …and the shipped function does not.
    assert.equal(escapeHtml(HOSTILE), "&lt;img src=x onerror=1&gt;");
    assert.equal(escapeHtml(`a&b<c>d"e'f`), "a&amp;b&lt;c&gt;d&quot;e&#39;f", "all five entities, ampersand first");
  });
});

describe("the transport throws codes, never upstream text", () => {
  test("a non-2xx from Resend is classified by STATUS, and its body is never read", async () => {
    let bodyRead = false;
    const net = recordingFetch(
      () =>
        new Response(JSON.stringify({ message: "PROVIDER-SAID your key PLACEHOLDER-resend is bad" }), {
          status: 401,
        }),
    );
    const mailer = productionInviteMailer(CONFIG, {
      fetch: (async (u: RequestInfo | URL, i?: RequestInit) => {
        const res = await (net.fetch as unknown as typeof fetch)(u, i);
        const original = res.json.bind(res);
        res.json = async () => {
          bodyRead = true;
          return original();
        };
        return res;
      }) as never,
    });

    await assert.rejects(
      () => mailer.send({ to: "a@b.test", subject: "s", html: "h" }),
      (e: unknown) => {
        assert.ok(isInviteMailFailure(e));
        assert.equal(e.code, "provider_unauthorized");
        assert.equal(e.providerStatus, 401);
        assert.ok(!e.message.includes("PROVIDER-SAID"), "the provider's sentence must not be in the message");
        assert.ok(!e.message.includes(CONFIG.resendApiKey), "…nor the key it was complaining about");
        return true;
      },
    );
    assert.equal(bodyRead, false, "READING THE BODY ONLY CREATES SOMETHING TO LEAK");
  });

  test("every status maps into the closed set", () => {
    assert.equal(classifyProviderStatus(401), "provider_unauthorized");
    assert.equal(classifyProviderStatus(403), "provider_unauthorized");
    assert.equal(classifyProviderStatus(429), "provider_rate_limited");
    assert.equal(classifyProviderStatus(500), "provider_unavailable");
    assert.equal(classifyProviderStatus(503), "provider_unavailable");
    assert.equal(classifyProviderStatus(422), "provider_rejected");
  });

  test("a network throw is DROPPED, not wrapped — its message can carry the request URL", async () => {
    const mailer = productionInviteMailer(CONFIG, {
      fetch: (async () => {
        throw new Error(`PROVIDER-SAID connect ECONNREFUSED ${RESEND_ENDPOINT}`);
      }) as never,
    });
    await assert.rejects(
      () => mailer.send({ to: "a@b.test", subject: "s", html: "<a href='secret'>x</a>" }),
      (e: unknown) => {
        assert.ok(isInviteMailFailure(e));
        assert.equal(e.code, "provider_unreachable");
        assert.ok(!e.message.includes("PROVIDER-SAID"));
        assert.ok(!e.message.includes("api.resend.com"), "the endpoint the secret URL was posted to must not survive");
        return true;
      },
    );
  });

  test("a generateLink error becomes provider_rejected, and an empty hash becomes no_token_returned", async () => {
    const rejecting = recordingClient({
      generateLink: () => ({ data: null, error: { message: "PROVIDER-SAID email exists", status: 422 } }),
    });
    await assert.rejects(
      () => productionInviteMailer(CONFIG, { createClient: rejecting.createClient }).mintSupabaseTokenHash("a@b.test"),
      (e: unknown) => isInviteMailFailure(e) && e.code === "provider_rejected" && e.providerStatus === 422 && !e.message.includes("PROVIDER-SAID"),
    );

    for (const properties of [{ hashed_token: "" }, { hashed_token: 7 }, {}]) {
      const empty = recordingClient({ generateLink: () => ({ data: { properties }, error: null }) });
      await assert.rejects(
        () => productionInviteMailer(CONFIG, { createClient: empty.createClient }).mintSupabaseTokenHash("a@b.test"),
        (e: unknown) => isInviteMailFailure(e) && e.code === "no_token_returned",
        `absence is not evidence: ${JSON.stringify(properties)} must not build a link with an empty path segment`,
      );
    }
  });

  test("M6: a NON-INTEGER provider status is discarded, never carried into the message or the log", () => {
    // Native review M6. `error.status` is typed `number | undefined` but arrives
    // from the wire, and the whole MEDIUM-3 promise is that only a code from a
    // closed set and a NUMBER can reach a log line. `?? null` passed anything
    // non-undefined straight through — so a provider answering
    // `status: "429 Too Many Requests"` would have put that string in
    // `providerStatus` and in the composed message.
    for (const hostile of ["429 PROVIDER-SAID slow down", { code: 429 }, 4.5, NaN, true, null, undefined]) {
      assert.equal(integerStatus(hostile), null, `${JSON.stringify(hostile)} is not a status this app can read`);
    }
    assert.equal(integerStatus(401), 401, "POSITIVE CONTROL: a real integer status survives");
    assert.equal(integerStatus(0), 0);

    const client = recordingClient({
      listUsers: () => ({
        data: null,
        error: { message: "PROVIDER-SAID rate limited", status: "429 PROVIDER-SAID slow down" as unknown as number },
      }),
    });
    return assert.rejects(
      () => productionInviteMailer(CONFIG, { createClient: client.createClient }).canMintFor("a@b.test"),
      (e: unknown) => {
        assert.ok(isInviteMailFailure(e));
        assert.equal(e.providerStatus, null, "the string status was discarded");
        assert.ok(!e.message.includes("PROVIDER-SAID"), "…and never reached the composed message");
        return true;
      },
    );
  });

  test("InviteMailFailure's message is COMPOSED from code and status — there is no text channel", () => {
    assert.equal(new InviteMailFailure("provider_rejected", 422).message, "invite mail: provider_rejected (422)");
    assert.equal(new InviteMailFailure("directory_too_large").message, "invite mail: directory_too_large");
    assert.equal(isInviteMailFailure(new Error("nope")), false, "…and the guard is by class, not by shape");
  });
});

// THE `server-only` HALF OF LOW-7 MOVED OUT, and was rebuilt (Codex round 2, N6).
// It used to live here as an import-closure walk over FIVE HAND-LISTED client
// roots that followed only static imports — true of the tree it was pointed at,
// blind to a new "use client" file, a re-export barrel or a dynamic import. It is
// now `tests/server-boundary.test.ts`, which DISCOVERS every Client Component from
// the tree and follows every bundler-relevant value edge.
