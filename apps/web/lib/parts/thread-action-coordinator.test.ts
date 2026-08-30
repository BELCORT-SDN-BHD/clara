import { test } from "node:test";
import assert from "node:assert/strict";

import { threadActionOpKey } from "./thread-action-coordinator";

const ACTOR_A = "11111111-1111-4111-8111-111111111111";
const ACTOR_B = "33333333-3333-4333-8333-333333333333";

const DOORS = [
  {
    name: "resolve_firm_question",
    objectType: "firm-question",
    objectId: "question-1",
    action: "resolve-firm-question",
    firstIntent: ["  It belongs to ROME PROPERTIES.  ", "client-rome"],
    replayIntent: ["It belongs to ROME PROPERTIES.", "client-rome"],
    correctedIntent: ["It belongs to ROME SECRETARY.", "client-secretary"],
  },
  {
    name: "dismiss_firm_question",
    objectType: "firm-question",
    objectId: "question-1",
    action: "dismiss-firm-question",
    firstIntent: ["  Duplicate question.  "],
    replayIntent: ["Duplicate question."],
    correctedIntent: ["Source document is not a client record."],
  },
  {
    name: "settle_close_proposal",
    objectType: "close-proposal",
    objectId: "proposal-1",
    action: "withdraw-close-proposal",
    firstIntent: ["  Statement not received.  "],
    replayIntent: ["Statement not received."],
    correctedIntent: ["Statement received but unreconciled."],
  },
] as const;

for (const door of DOORS) {
  const keyFor = (callerId: string, intent: readonly string[]) => threadActionOpKey({
    callerId,
    objectType: door.objectType,
    objectId: door.objectId,
    action: door.action,
    intent,
  });

  test(`${door.name}: same actor/args replay, second actor and corrected args mint distinct keys`, async () => {
    const first = await keyFor(ACTOR_A, door.firstIntent);
    const retry = await keyFor(ACTOR_A, door.replayIntent);
    const secondActor = await keyFor(ACTOR_B, door.replayIntent);
    const corrected = await keyFor(ACTOR_A, door.correctedIntent);

    assert.equal(first, retry, "normalising whitespace must preserve deterministic replay for the same human act");
    assert.notEqual(first, secondActor, "a second bookkeeper must never replay the first actor's stored result");
    assert.notEqual(first, corrected, "corrected arguments must not collide with the earlier attempt");
    assert.doesNotMatch(first, /ROME|Duplicate|Statement/, "human prose must be hashed, never embedded in the operation key");
  });
}
