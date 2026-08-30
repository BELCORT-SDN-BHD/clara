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
// THE `server-only` QUESTION, ANSWERED HONESTLY. The order asked for
// `import "server-only"` in the transport and the courier. That package is NOT
// installed in this workspace (`node_modules/server-only` does not exist) and a
// lane may not run `pnpm install`, so adding the import would red every gate
// rather than protect anything. The ESTATE'S EXISTING MECHANISM for the identical
// question is the import-closure walk in `tests/firm-scope-db-pins.test.ts`
// ("client-importable modules never drag next/headers into the bundle"), minted
// when P4-5 hit this exact class. The walk below is that instrument pointed at
// these two modules, and it is strictly stronger than the import in one respect:
// `server-only` fails at BUILD time in a bundler, while this fails in `pnpm test`
// with the offending edge named. Recorded as an owner item in the PR body.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CAN_MINT_MAX_PAGES,
  CAN_MINT_PAGE_SIZE,
  classifyProviderStatus,
  InviteMailFailure,
  isConfirmedUser,
  isInviteMailFailure,
  productionInviteMailer,
  RESEND_ENDPOINT,
  sameAddress,
  type InviteMailConfig,
} from "../lib/members/invite-mail";
import { stripComments } from "../test/sourceOracle";

const WEB_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// `PLACEHOLDER` is what `scripts/check-leaks.mjs` accepts as an EXPLICIT
// placeholder (`SECRET_PLACEHOLDER`, `check-leaks.mjs:40`). The two key fields
// are deliberately DIFFERENT strings so a cell can tell which one travelled.
const CONFIG: InviteMailConfig = {
  supabaseUrl: "https://rig.supabase.test",
  serviceRoleKey: "PLACEHOLDER-service",
  resendApiKey: "PLACEHOLDER-resend",
  from: "Clara <invites@example.test>",
};

type AdminUser = { email?: string | null };
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
  const pageOf = (emails: string[]): ListResult => ({ data: { users: emails.map((email) => ({ email })) }, error: null });

  test("a match on page 1 is already_registered", async () => {
    const client = recordingClient({ listUsers: () => pageOf(["taken@example.test"]) });
    const mailer = productionInviteMailer(CONFIG, { createClient: client.createClient });
    assert.deepEqual(await mailer.canMintFor("taken@example.test"), { ok: false, reason: "already_registered" });
    assert.equal(client.listUsersCalls.length, 1, "it stops the moment it has a positive answer");
  });

  test("N2(3): an UNCONFIRMED matching row proceeds — only a CONFIRMED one is already_registered", async () => {
    // CODEX ROUND 2, N2(3). The scan treated the mere EXISTENCE of a matching row
    // as the refusal condition. Supabase rejects `generateLink({type:"invite"})`
    // only for a CONFIRMED user and permits an unconfirmed one — so refusing
    // those was a self-inflicted 409 on a flow that would have worked.
    const unconfirmed = recordingClient({
      listUsers: (p) =>
        (p.page ?? 1) === 1
          ? { data: { users: [{ email: "pending@example.test", email_confirmed_at: null, confirmed_at: null }] }, error: null }
          : { data: { users: [] }, error: null },
    });
    assert.deepEqual(
      await productionInviteMailer(CONFIG, { createClient: unconfirmed.createClient }).canMintFor("pending@example.test"),
      { ok: true },
      "an unconfirmed account may still be invited",
    );

    const confirmed = recordingClient({
      listUsers: () => ({
        data: { users: [{ email: "live@example.test", email_confirmed_at: "2026-08-01T00:00:00Z", confirmed_at: null }] },
        error: null,
      }),
    });
    assert.deepEqual(
      await productionInviteMailer(CONFIG, { createClient: confirmed.createClient }).canMintFor("live@example.test"),
      { ok: false, reason: "already_registered" },
    );
  });

  test("N2(3): confirmation is read FAIL-CLOSED — an unreadable field counts as confirmed", async () => {
    // The two directions are not symmetric. Wrongly "confirmed" annoys an admin
    // and mints nothing; wrongly "unconfirmed" mints a DEAD invite and blocks the
    // address for seven days. So only an explicit null on BOTH fields is a
    // positive reading of "not confirmed"; absence or an odd type is not an
    // answer, and an unanswered question never licenses the mint.
    for (const user of [
      { email: "x@example.test" }, // both fields ABSENT — cannot tell
      { email: "x@example.test", email_confirmed_at: undefined, confirmed_at: undefined },
      { email: "x@example.test", email_confirmed_at: 17, confirmed_at: null },
      { email: "x@example.test", email_confirmed_at: "2026-08-01T00:00:00Z" },
      { email: "x@example.test", confirmed_at: "2026-08-01T00:00:00Z" }, // phone-confirmed account
    ]) {
      const client = recordingClient({ listUsers: () => ({ data: { users: [user] }, error: null }) });
      assert.deepEqual(
        await productionInviteMailer(CONFIG, { createClient: client.createClient }).canMintFor("x@example.test"),
        { ok: false, reason: "already_registered" },
        `${JSON.stringify(user)} must fail CLOSED — a dead invite is the expensive direction`,
      );
    }

    // POSITIVE CONTROL: the one readable shape that really does mean "not
    // confirmed" still lets the invite through, so the rule above is a
    // discrimination and not a blanket refusal.
    assert.equal(isConfirmedUser({ email_confirmed_at: null, confirmed_at: null }), false);
    assert.equal(isConfirmedUser({ email_confirmed_at: "2026-08-01T00:00:00Z", confirmed_at: null }), true);
    assert.equal(isConfirmedUser(null), true, "a non-object row is not an answer either");
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

  test("InviteMailFailure's message is COMPOSED from code and status — there is no text channel", () => {
    assert.equal(new InviteMailFailure("provider_rejected", 422).message, "invite mail: provider_rejected (422)");
    assert.equal(new InviteMailFailure("directory_too_large").message, "invite mail: directory_too_large");
    assert.equal(isInviteMailFailure(new Error("nope")), false, "…and the guard is by class, not by shape");
  });
});

// ---------------------------------------------------------------------------
// LOW-7 (the `server-only` half) — THE ESTATE'S OWN MECHANISM
// ---------------------------------------------------------------------------

describe("no client-importable module reaches the courier or the mail transport", () => {
  // The same instrument as `tests/firm-scope-db-pins.test.ts`'s isomorphic wall,
  // pointed at the two server-only modules of this train. Value edges only:
  // `import type` is erased and drags nothing into a bundle.
  function resolveLocal(fromFile: string, spec: string): string | null {
    const base = spec.startsWith("@/")
      ? join(WEB_ROOT, spec.slice(2))
      : spec.startsWith(".")
        ? join(dirname(join(WEB_ROOT, fromFile)), spec)
        : null;
    if (base === null) return null;
    for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = `${base}${ext}`;
      if (existsSync(candidate)) return candidate.slice(WEB_ROOT.length + 1).split(sep).join("/");
    }
    return null;
  }

  function valueImports(webRelative: string): string[] {
    const code = stripComments(readFileSync(join(WEB_ROOT, webRelative), "utf8"));
    const out: string[] = [];
    for (const m of code.matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
      if (/^\s*type\s/.test(m[1] as string)) continue;
      out.push(m[2] as string);
    }
    for (const m of code.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1] as string);
    return out;
  }

  function closure(entry: string): Set<string> {
    const files = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      if (files.has(current)) continue;
      files.add(current);
      for (const spec of valueImports(current)) {
        const local = resolveLocal(current, spec);
        if (local !== null) queue.push(local);
      }
    }
    return files;
  }

  const SERVER_ONLY = ["lib/members/invite-mail.ts", "lib/members/courier.ts"];
  const CLIENT_ENTRIES = [
    "components/admin/members-panel.tsx",
    "components/admin/invite-dialog.tsx",
    "components/admin/member-row-menu.tsx",
    "lib/members/doors.ts",
    "lib/members/reads.ts",
  ];

  for (const entry of CLIENT_ENTRIES) {
    test(`${entry} reaches neither server-only module`, () => {
      const files = closure(entry);
      for (const forbidden of SERVER_ONLY) {
        assert.ok(
          !files.has(forbidden),
          `${entry} transitively value-imports ${forbidden} — the service-role key and the plaintext token would be bundled for a browser`,
        );
      }
    });
  }

  test("VACUITY CONTROL: the walk DOES find the transport from the courier", () => {
    // Without this every assertion above is equally true of a walk that resolves
    // nothing at all — the absence-from-the-wrong-instrument class.
    const files = closure("lib/members/courier.ts");
    assert.ok(files.has("lib/members/invite-mail.ts"), "the walk cannot see a one-hop edge");
    assert.ok(files.has("lib/same-origin.ts"), "…nor a second one");
  });

  test("VACUITY CONTROL: the client entries were really walked", () => {
    const files = closure("components/admin/members-panel.tsx");
    assert.ok(files.size > 5, `the panel's closure resolved only ${files.size} files`);
    assert.ok(files.has("lib/members/doors.ts"), "the panel's own door module is missing from its closure");
  });

  test("the two server-only modules are marked as such in their own headers", () => {
    // Prose, but checkable prose: if `server-only` is ever installed, this is the
    // list of files that must gain the import. Named so the follow-up is findable.
    for (const file of SERVER_ONLY) {
      const src = readFileSync(join(WEB_ROOT, file), "utf8");
      assert.match(src, /SERVER[ -]ONLY|server-only/i, `${file} does not declare itself server-only anywhere`);
    }
  });
});
