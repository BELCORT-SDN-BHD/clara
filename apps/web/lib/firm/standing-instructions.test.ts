// #1147 — what a WITHDRAWAL now answers with, and what this module is allowed to say about it.
//
// Migration 0362 §B adds ONE key to `clara.withdraw_firm_standing_instruction`'s receipt:
// `plans_still_posting`, the count of this firm's LIVE plans that the withdrawn instruction
// authorised and that keep posting under the member who authorised them. Withdrawal does NOT stop
// them — whether it should is an owner ruling #1050 was never given — so the count is the only way
// a firm learns, at the moment it takes the instruction back, what it has NOT stopped.
//
// Mocked-fetch style (`lib/firm/capacity-doors.test.ts`'s precedent, which is
// `lib/registration/legal-doors.test.ts`'s). What is pinned here: the door's argument names, and
// that the count is carried only when the DATABASE said it — a build that guessed would tell a
// firm "nothing is still running" on a database whose door does not answer that yet.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  newStandingInstructionOpKey,
  PREPAYMENT_SCHEDULE_AT_CLOSE,
  recordPrepaymentStandingInstruction,
  WITHDRAW_STANDING_INSTRUCTION_DOOR,
  withdrawPrepaymentStandingInstruction,
} from "./standing-instructions";
import { configureSessionTokenSource, resetSessionTokenSource } from "@/lib/session-accessor";

type Seen = { url: string; body: Record<string, unknown> };

function withDoor(reply: () => Response, run: (calls: Seen[]) => Promise<void>): Promise<void> {
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

const INSTRUCTION = "bbbbbbbb-2222-4222-8222-222222222222";
const MEMBER = "cccccccc-3333-4333-8333-333333333333";

/** A withdrawal receipt exactly as migration 0362 §B's `_finish_op` builds it — transcribed from
 *  the door's OWN battery (`packages/db/tests/standing-instruction-agent-read.test.mjs`,
 *  `p1147.withdraw.counts`), never from this module's decoder. */
const WITHDRAWN = {
  instruction_id: INSTRUCTION,
  instruction_key: PREPAYMENT_SCHEDULE_AT_CLOSE,
  recorded_by: MEMBER,
  withdrawn_by: MEMBER,
  active: false,
  plans_still_posting: 2,
};

test("#1147 the withdraw door is called by name with its three arguments, and the count of plans that keep posting reaches the caller", async () => {
  await withDoor(
    () => json(WITHDRAWN),
    async (calls) => {
      const outcome = await withdrawPrepaymentStandingInstruction({
        reason: "We will set these up by hand this year.",
        opKey: "op-standing-held-by-the-caller",
      });

      assert.equal(calls.length, 1);
      const call = calls[0] as Seen;
      assert.ok(call.url.endsWith(`/rpc/${WITHDRAW_STANDING_INSTRUCTION_DOOR}`), call.url);
      assert.deepEqual(call.body, {
        p_instruction_key: PREPAYMENT_SCHEDULE_AT_CLOSE,
        p_reason: "We will set these up by hand this year.",
        p_op_key: "op-standing-held-by-the-caller",
      });

      assert.deepEqual(outcome, {
        kind: "withdrawn",
        instructionId: INSTRUCTION,
        plansStillPosting: 2,
      });
    },
  );
});

test("#1147 ZERO is a number the firm is told, not an absence: a withdrawal that stopped nothing running says so", async () => {
  await withDoor(
    () => json({ ...WITHDRAWN, plans_still_posting: 0 }),
    async () => {
      const outcome = await withdrawPrepaymentStandingInstruction({ reason: "r", opKey: "k" });
      assert.deepEqual(outcome, { kind: "withdrawn", instructionId: INSTRUCTION, plansStillPosting: 0 });
    },
  );
});

test("#1147 a receipt that does NOT carry the count leaves it unknown rather than zero — this build never tells a firm nothing is running on a database whose door did not say", async () => {
  // 0338's own receipt shape, which is what a database below 0362 answers. A decoder that
  // defaulted to 0 would state, in words, that no plan keeps posting — the exact claim #1147
  // exists to make honest.
  const { plans_still_posting: _omitted, ...pre0362 } = WITHDRAWN;
  await withDoor(
    () => json(pre0362),
    async () => {
      const outcome = await withdrawPrepaymentStandingInstruction({ reason: "r", opKey: "k" });
      assert.deepEqual(outcome, { kind: "withdrawn", instructionId: INSTRUCTION, plansStillPosting: null });
    },
  );
  // …and so does a value this build will not act on.
  for (const bad of [-1, 1.5, "2", null]) {
    await withDoor(
      () => json({ ...WITHDRAWN, plans_still_posting: bad }),
      async () => {
        const outcome = await withdrawPrepaymentStandingInstruction({ reason: "r", opKey: "k" });
        assert.deepEqual(outcome, { kind: "withdrawn", instructionId: INSTRUCTION, plansStillPosting: null },
          `plans_still_posting=${JSON.stringify(bad)} was acted on`);
      },
    );
  }
});

test("#1147 the RECORDING door is untouched: it carries no count, because giving an instruction stops nothing", async () => {
  await withDoor(
    () => json({
      instruction_id: INSTRUCTION,
      instruction_key: PREPAYMENT_SCHEDULE_AT_CLOSE,
      reason: "Our subscriptions are all annual and we close monthly.",
      recorded_by: MEMBER,
      active: true,
    }),
    async () => {
      const outcome = await recordPrepaymentStandingInstruction({ reason: "r", opKey: "k" });
      assert.deepEqual(outcome, { kind: "recorded", instructionId: INSTRUCTION });
    },
  );
});

test("#1147 a governed refusal still reaches the caller with its code, reason and axis, and carries no count at all", async () => {
  await withDoor(
    () => json({
      code: "CLR11",
      message: "this firm has no standing instruction of that kind to withdraw",
      details: JSON.stringify({ reason: "firm_standing_instruction_absent" }),
    }, 400),
    async () => {
      const outcome = await withdrawPrepaymentStandingInstruction({ reason: "r", opKey: "k" });
      assert.equal(outcome.kind, "refused");
      if (outcome.kind !== "refused") return;
      assert.equal(outcome.code, "CLR11");
      assert.equal(outcome.reason, "firm_standing_instruction_absent");
      assert.equal(outcome.axis, null);
    },
  );
});

test("#1147 a fresh op key per submission — giving, taking back and giving again are three acts and each owes its own row", () => {
  const keys = new Set([
    newStandingInstructionOpKey(), newStandingInstructionOpKey(), newStandingInstructionOpKey(),
  ]);
  assert.equal(keys.size, 3);
  for (const k of keys) assert.match(k, /^op-standing-/);
});
