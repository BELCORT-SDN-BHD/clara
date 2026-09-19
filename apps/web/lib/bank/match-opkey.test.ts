// #657 · D15 — ONE DECISION, ONE KEY, on the bank matching lane.
//
// These three cells are written against the RENEWAL RULE in match-opkey.ts's header, not
// against its implementation, because a wrong answer here silently reproduces the exact defect
// AC4 and AC10 exist to fix: a lost response followed by an identical resubmit reaching the
// database as a SECOND operation and meeting `already_matched` — a refusal for something the
// human had in fact already succeeded at.
//
//   p657.web.opkey-stable-across-retry      a failed/timed-out submit, an intervening act()
//                                           reload, a parent re-render, NO human edit ⇒ the
//                                           SAME p_op_key, so the stored receipt comes back.
//   p657.web.opkey-renews-on-intent-change  a different entry, a different line set or a
//                                           different typed cents ⇒ a DIFFERENT key.
//   p657.web.opkey-does-not-renew-on-noise  a dismissed refusal, a tab switch away and back,
//                                           a parent re-render and a reload ⇒ UNCHANGED.

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchOpKeyFor, canonicalMatchIntent, entryGeneration, type MatchIntent } from "./match-opkey";
import { matchBankLine } from "./match-doors";
import type { SessionTokenAccessor } from "@/lib/session";

const INTENT: MatchIntent = {
  clientId: "11111111-1111-4111-8111-111111111111",
  lineIds: ["aaaaaaa1-1111-4111-8111-111111111111", "aaaaaaa2-1111-4111-8111-111111111111"],
  entries: [{ entry_id: "eeeeeee1-1111-4111-8111-111111111111", matched_cents: 128_000 }],
  ackPeriodExceptions: false,
};

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

test("p657.web.opkey-stable-across-retry · a failed submit, a reload and a re-render with NO human edit produce the SAME p_op_key", async () => {
  // The door itself is what must carry the key, so this cell drives the DOOR, not the helper:
  // a cell that only compared two calls of `matchOpKeyFor` would pass even if match-doors.ts
  // still minted `crypto.randomUUID()` per call, which is the defect.
  const keys: unknown[] = [];
  await withMockedFetch(
    async (_u, init) => {
      const body = JSON.parse(String(init?.body));
      keys.push(body.p_op_key);
      // Attempt 1 is a LOST RESPONSE (a 503 the human never sees resolved either way).
      if (keys.length === 1) return jsonResponse({ code: "503", message: "gateway" }, 503);
      return jsonResponse({ match_id: "m1" });
    },
    async () => {
      const args = {
        clientId: INTENT.clientId,
        lineIds: [...INTENT.lineIds],
        entries: [...INTENT.entries],
        ackPeriodExceptions: false,
      };
      await matchBankLine(args, { session: fakeSession("tok") }).catch(() => undefined);
      // …the surface reloads unconditionally after a failed act (matching-section's own N7
      // comment), the parent re-renders, and the human presses the same button again with
      // NOTHING edited. A fresh args object is exactly what a re-render produces.
      await matchBankLine(
        {
          clientId: INTENT.clientId,
          lineIds: [...INTENT.lineIds],
          entries: INTENT.entries.map((e) => ({ ...e })),
          ackPeriodExceptions: false,
        },
        { session: fakeSession("tok") },
      );
      assert.equal(keys.length, 2);
      assert.equal(keys[0], keys[1],
        "a retry of the SAME intent must carry the SAME p_op_key, or the database sees two operations");
      assert.match(String(keys[0]), /^match_bank_line:[0-9a-f]{32}$/,
        "the key names its verb and carries a stable digest, so it is readable in op_receipts and in a refusal");
    },
  );
});

test("p657.web.opkey-renews-on-intent-change · a different entry, line set or typed cents produces a DIFFERENT key", async () => {
  const base = matchOpKeyFor(INTENT);
  const differentEntry = matchOpKeyFor({
    ...INTENT,
    entries: [{ entry_id: "eeeeeee2-1111-4111-8111-111111111111", matched_cents: 128_000 }],
  });
  const differentCents = matchOpKeyFor({
    ...INTENT,
    entries: [{ entry_id: INTENT.entries[0]!.entry_id, matched_cents: 128_001 }],
  });
  const differentLines = matchOpKeyFor({ ...INTENT, lineIds: [INTENT.lineIds[0]!] });
  const differentAck = matchOpKeyFor({ ...INTENT, ackPeriodExceptions: true });
  const differentClient = matchOpKeyFor({ ...INTENT, clientId: "22222222-2222-4222-8222-222222222222" });

  const all = [base, differentEntry, differentCents, differentLines, differentAck, differentClient];
  assert.equal(new Set(all).size, all.length,
    "every intentional change to WHAT is submitted is a different decision and gets its own key");
});

test("p657.web.opkey-does-not-renew-on-noise · selection order, a dismissed refusal, a tab switch and a reload leave the key UNCHANGED", async () => {
  const base = matchOpKeyFor(INTENT);

  // SELECTION ORDER IS NOISE. A Set iterates in insertion order, so ticking line B then line A
  // produces a different array than A then B — the same decision, spelled two ways.
  const reordered = matchOpKeyFor({
    ...INTENT,
    lineIds: [...INTENT.lineIds].reverse(),
    entries: [...INTENT.entries].reverse(),
  });
  assert.equal(reordered, base, "the order the human ticked the boxes in is not part of the decision");

  // A FRESH OBJECT GRAPH IS NOISE. Every re-render, every reload, every tab switch away and
  // back rebuilds these arrays from the read; none of them is a new decision.
  const rebuilt = matchOpKeyFor({
    clientId: INTENT.clientId,
    lineIds: INTENT.lineIds.map((l) => `${l}`),
    entries: INTENT.entries.map((e) => ({ entry_id: `${e.entry_id}`, matched_cents: e.matched_cents })),
    ackPeriodExceptions: false,
  });
  assert.equal(rebuilt, base, "a rebuilt object graph for the same decision is the same decision");

  // The canonical form is what carries these rules, and it is asserted directly so a future
  // change to the hash cannot quietly change the ORDERING law with it.
  assert.equal(
    canonicalMatchIntent({ ...INTENT, lineIds: [...INTENT.lineIds].reverse() }),
    canonicalMatchIntent(INTENT),
    "the canonical intent sorts its id sets",
  );
  assert.equal(
    canonicalMatchIntent({ ...INTENT, entries: [{ entry_id: INTENT.entries[0]!.entry_id, matched_cents: 128_000.4 }] }),
    canonicalMatchIntent(INTENT),
    "cents are integers; a fractional cents value cannot mint a second key for one decision",
  );
});

// ===========================================================================
// p657.web.opkey-renews-after-unmatch — THE FIX-ROUND CELL (review SP1 / A1).
//
// The blocker both review lenses measured on the live rig: `match -> unmatch -> resubmit the
// IDENTICAL selection` is an ordinary re-decision, and a key that is a PURE function of
// {client, lines, entries, cents, ack} cannot tell it from a lost-response retry. The database
// is right to replay — `clara._reserve_op` keys on (firm, fn, op_key) and knows nothing about
// whether the match it describes is still live — so the second submission returns the DEAD
// match's receipt, the face renders "no new cash entry was created" naming a match the database
// has recorded as `unmatched`, and the line never leaves the unmatched report.
//
// So the intent tuple carries each selected entry's WORLD GENERATION: the shape of the
// `match_history` the recut `list_bank_match_candidates` already puts on the wire (0226 §3). An
// unmatch flips that entry's newest history row from `live` to `unmatched`, so the re-decision
// hashes differently, while a lost response, a reload and a re-render — which write nothing —
// leave it byte-identical. The key still renews on a property of the DATA, never on a
// component's lifecycle (D15).
// ===========================================================================

const LIVE_HISTORY = [{ match_id: "bbbbbbb1-1111-4111-8111-111111111111", status: "live", matched_cents: 128_000, acted_at: "2026-09-18T00:00:00Z" }];
const UNMATCHED_HISTORY = [{ match_id: "bbbbbbb1-1111-4111-8111-111111111111", status: "unmatched", matched_cents: 128_000, acted_at: "2026-09-18T00:00:00Z" }];

test("p657.web.opkey-renews-after-unmatch · the same selection re-decided after an unmatch is a DIFFERENT operation", async () => {
  const keys: unknown[] = [];
  await withMockedFetch(
    async (_u, init) => {
      const body = JSON.parse(String(init?.body));
      keys.push(body.p_op_key);
      // The wire body must stay EXACTLY the door's arity: a generation is key material, never
      // an argument. `clara._reserve_op` re-hashes the real arguments and refuses a key whose
      // request hash disagrees, so smuggling a field into p_entries would break every replay.
      assert.deepEqual(
        Object.keys(body).sort(),
        ["p_ack_period_exceptions", "p_adjustments", "p_client", "p_entries", "p_lines", "p_op_key"],
        "the door body carries no extra field",
      );
      for (const e of body.p_entries) {
        assert.deepEqual(Object.keys(e).sort(), ["entry_id", "matched_cents"],
          "p_entries carries the door's two fields and nothing else");
      }
      return jsonResponse({ match_id: "m1" });
    },
    async () => {
      const args = () => ({
        clientId: INTENT.clientId,
        lineIds: [...INTENT.lineIds],
        entries: INTENT.entries.map((e) => ({ ...e })),
        ackPeriodExceptions: false,
      });
      // 1 · the first decision, against an entry whose history ends `live`.
      await matchBankLine(
        { ...args(), entryGenerations: { [INTENT.entries[0]!.entry_id]: entryGeneration({ match_history: LIVE_HISTORY }) } },
        { session: fakeSession("tok") },
      );
      // 2 · the human unmatches it and re-decides the SAME selection. The candidate read has
      //     been re-read (the surface reloads after every act), so that entry's newest history
      //     row now reads `unmatched`.
      await matchBankLine(
        { ...args(), entryGenerations: { [INTENT.entries[0]!.entry_id]: entryGeneration({ match_history: UNMATCHED_HISTORY }) } },
        { session: fakeSession("tok") },
      );
      assert.equal(keys.length, 2);
      assert.notEqual(keys[0], keys[1],
        "a re-decision after an unmatch must NOT replay the dead match's receipt");
    },
  );
});

test("p657.web.opkey-generation-is-data-not-lifecycle · a reload that changes nothing leaves the generation, and the key, unchanged", () => {
  // The generation is read off the wire shape, so two reads of an unchanged world produce the
  // same string — a reload is not a decision.
  assert.equal(entryGeneration({ match_history: LIVE_HISTORY }), entryGeneration({ match_history: LIVE_HISTORY.map((h) => ({ ...h })) }));
  assert.notEqual(entryGeneration({ match_history: LIVE_HISTORY }), entryGeneration({ match_history: UNMATCHED_HISTORY }));
  // An entry nobody has ever matched has no generation, and that is a value, not an absence of
  // one: it must be stable across reads too.
  assert.equal(entryGeneration({ match_history: [] }), null);
  assert.equal(entryGeneration(null), null);
  assert.equal(entryGeneration(undefined), null);

  const withGen: MatchIntent = {
    ...INTENT,
    entries: [{ ...INTENT.entries[0]!, generation: "1:bbbbbbb1-1111-4111-8111-111111111111:live" }],
  };
  assert.notEqual(matchOpKeyFor(withGen), matchOpKeyFor(INTENT),
    "an entry carrying a generation is a different decision from the same entry carrying none");
  assert.equal(matchOpKeyFor(withGen), matchOpKeyFor({ ...withGen, entries: withGen.entries.map((e) => ({ ...e })) }),
    "the generation is part of the canonical form, so it is stable across a rebuilt object graph");
});
