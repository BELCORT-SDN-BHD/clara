// `clara.accept_legal_document` — the governed write behind #621's legal stage.
// Mocked-fetch style (`./doors.test.ts`'s precedent): what is pinned here is
// the argument names the door requires, the VERBATIM forwarding of the hash and
// the op key, the positive checks on the answer, and the classification of a
// refusal by CODE AND REASON rather than by its sentence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACCEPT_LEGAL_DOCUMENT_DOOR,
  acceptLegalDocument,
  isStaleAcceptReason,
} from "./legal-doors";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";

type Seen = { url: string; body: Record<string, unknown> };

function withDoor(
  reply: () => Response,
  run: (calls: Seen[]) => Promise<void>,
): Promise<void> {
  const calls: Seen[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return reply();
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(calls).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const params = {
  documentKind: "dpa" as const,
  version: 4,
  bodySha256: "\\xdeadbeef",
  opKey: "op-key-held-by-the-caller",
};

test("the door is called by name with its FOUR arguments, and the hash and key travel VERBATIM", async () => {
  await withDoor(
    () => json({ status: "accepted", kind: "dpa", version: 4, body_sha256: "\\xdeadbeef", accepted_at: "2026-09-02T00:00:00Z" }),
    async (calls) => {
      const outcome = await acceptLegalDocument(params);
      assert.deepEqual(outcome, {
        kind: "accepted",
        documentKind: "dpa",
        version: 4,
        acceptedAt: "2026-09-02T00:00:00Z",
        replay: false,
      });
      assert.equal(calls.length, 1);
      assert.match(calls[0]!.url, new RegExp(`/rest/v1/rpc/${ACCEPT_LEGAL_DOCUMENT_DOOR}$`));
      assert.deepEqual(calls[0]!.body, {
        p_kind: "dpa",
        p_version: 4,
        // THE WHOLE WALL: the hash the caller was shown, not one recomputed
        // here. A recomputed hash would make the door agree with itself
        // unconditionally and delete the only thing binding an acceptance to
        // the bytes the accepter read.
        p_body_sha256: "\\xdeadbeef",
        // And the CALLER'S key, so a resubmit after a lost response replays.
        p_op_key: "op-key-held-by-the-caller",
      });
    },
  );
});

test("`already_accepted` is a REPLAY, reported as one — never a second receipt", async () => {
  await withDoor(
    () => json({ status: "already_accepted", kind: "dpa", version: 4, body_sha256: "\\xdeadbeef", accepted_at: "2026-09-02T00:00:00Z" }),
    async () => {
      const outcome = await acceptLegalDocument(params);
      assert.equal(outcome.kind, "accepted");
      assert.equal(outcome.kind === "accepted" ? outcome.replay : null, true);
    },
  );
});

test("A 200 THAT PROVES NOTHING IS `unavailable`, never an acceptance", async () => {
  const refusedShapes: Array<[string, unknown]> = [
    ["no status at all", { kind: "dpa", version: 4, accepted_at: "2026-09-02T00:00:00Z" }],
    ["an unknown status", { status: "queued", kind: "dpa", version: 4, accepted_at: "2026-09-02T00:00:00Z" }],
    ["a DIFFERENT kind than the one asked for", { status: "accepted", kind: "terms", version: 4, accepted_at: "2026-09-02T00:00:00Z" }],
    ["no accepted_at", { status: "accepted", kind: "dpa", version: 4 }],
    ["an empty accepted_at", { status: "accepted", kind: "dpa", version: 4, accepted_at: "" }],
    ["a non-integer version", { status: "accepted", kind: "dpa", version: 4.5, accepted_at: "2026-09-02T00:00:00Z" }],
  ];
  for (const [label, body] of refusedShapes) {
    await withDoor(
      () => json(body),
      async () => {
        assert.deepEqual(
          await acceptLegalDocument(params),
          { kind: "unavailable" },
          `${label} was read as a recorded acceptance`,
        );
      },
    );
  }
});

test("REFUSALS ARE CLASSIFIED BY CODE AND REASON, and the DB's sentence is carried verbatim", async () => {
  const cases: Array<{ code: string; reason: string; stale: boolean }> = [
    { code: "CLR10", reason: "invalid_kind", stale: false },
    { code: "CLR10", reason: "hash_mismatch", stale: true },
    { code: "CLR09", reason: "not_published", stale: false },
    { code: "CLR09", reason: "stale_version", stale: true },
  ];
  for (const { code, reason, stale } of cases) {
    await withDoor(
      () => json({ code, message: `refused: ${reason}`, details: JSON.stringify({ reason }) }, 400),
      async () => {
        const outcome = await acceptLegalDocument(params);
        assert.equal(outcome.kind, "refused", `${code}/${reason} did not classify as a refusal`);
        if (outcome.kind !== "refused") return;
        assert.equal(outcome.code, code);
        assert.equal(outcome.reason, reason);
        assert.equal(outcome.message, `refused: ${reason}`, "the DB's own sentence was re-worded");
        assert.equal(
          outcome.stale,
          stale,
          `${reason}: the "re-read and show the new version" flag is wrong`,
        );
      },
    );
  }
  // CLR04 — an agent or unknown actor. A refusal, and never stale: there is no
  // newer version to go and read.
  await withDoor(
    () => json({ code: "CLR04", message: "unknown actor" }, 400),
    async () => {
      const outcome = await acceptLegalDocument(params);
      assert.equal(outcome.kind, "refused");
      assert.equal(outcome.kind === "refused" ? outcome.stale : null, false);
    },
  );
});

test("THE STALE PREDICATE is exactly the two reasons that mean 'go and re-read'", () => {
  assert.equal(isStaleAcceptReason("stale_version"), true);
  assert.equal(isStaleAcceptReason("hash_mismatch"), true);
  assert.equal(isStaleAcceptReason("not_published"), false);
  assert.equal(isStaleAcceptReason("invalid_kind"), false);
  assert.equal(isStaleAcceptReason(null), false);
});

test("a transport failure is `unavailable` — distinct from a refusal, because nothing was decided", async () => {
  await withDoor(
    () => new Response("gateway", { status: 502 }),
    async () => assert.deepEqual(await acceptLegalDocument(params), { kind: "unavailable" }),
  );
});
