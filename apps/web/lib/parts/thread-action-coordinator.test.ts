import { test } from "node:test";
import assert from "node:assert/strict";

import { threadActionOpKey } from "./thread-action-coordinator";

const ACTOR_A = "11111111-1111-4111-8111-111111111111";
const ACTOR_B = "33333333-3333-4333-8333-333333333333";

const keyFor = (callerId: string, reason: string) => threadActionOpKey({
  callerId,
  objectType: "close-proposal",
  objectId: "proposal-1",
  action: "withdraw-close-proposal",
  intent: [reason],
});

test("threadActionOpKey: the same actor and normalized intent replay the same opaque key", async () => {
  const first = await keyFor(ACTOR_A, "  Statement not received.  ");
  const retry = await keyFor(ACTOR_A, "Statement not received.");

  assert.equal(first, retry);
  assert.doesNotMatch(first, /Statement|received/, "human prose must be hashed, never embedded in the operation key");
});

test("threadActionOpKey: a different positively read actor produces a different key", async () => {
  assert.notEqual(
    await keyFor(ACTOR_A, "Statement not received."),
    await keyFor(ACTOR_B, "Statement not received."),
  );
});

test("threadActionOpKey: changed normalized intent produces a different key", async () => {
  assert.notEqual(
    await keyFor(ACTOR_A, "Statement not received."),
    await keyFor(ACTOR_A, "Statement received but unreconciled."),
  );
});
