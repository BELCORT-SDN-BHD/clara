import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { callerSubjectFromAccessToken, type SessionRow } from "./api";
import { claraThreadStore } from "./threadStore";
import { sessionBelongsToClient } from "./thread-scope";
import { selectOwnSession, visibleThreadForAltitude } from "./useActiveThread";

const ME = "11111111-1111-1111-1111-111111111111";
const COLLEAGUE = "22222222-2222-2222-2222-222222222222";

function token(subject: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString("base64url");
  return `header.${payload}.signature`;
}

function session(overrides: Partial<SessionRow>): SessionRow {
  return {
    id: "session-own",
    title: null,
    client_id: "client-a",
    visibility: "private",
    created_by: ME,
    created_at: "2026-09-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("Clara rail altitude and ownership", () => {
  it("takes the caller subject from the exact bearer and fails closed on malformed claims", () => {
    assert.equal(callerSubjectFromAccessToken(token(ME)), ME);
    assert.equal(callerSubjectFromAccessToken(token("not-a-uuid")), null);
    assert.equal(callerSubjectFromAccessToken("not-a-jwt"), null);
  });

  it("chooses the caller's own thread when a newer colleague thread is visible first", () => {
    const newestColleague = session({ id: "session-colleague", visibility: "firm", created_by: COLLEAGUE });
    const own = session({ created_at: "2026-09-01T02:00:00.000Z" });
    assert.equal(selectOwnSession([newestColleague, own], ME, "client-a")?.id, "session-own");
    assert.equal(selectOwnSession([newestColleague], ME, "client-a"), undefined);
  });

  it("never exposes a resolved thread from the previous client during navigation", () => {
    assert.deepEqual(
      visibleThreadForAltitude({ altitude: "client-a", threadId: "thread-a", error: null }, "client-b"),
      { threadId: null, error: null },
    );
  });

  it("evicts a reset thread's resident messages", () => {
    claraThreadStore.hydrateMessages("thread-a", [
      { id: "message-a", role: "user", parts: [], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00.000Z" },
    ]);
    assert.equal(claraThreadStore.getThread("thread-a").messages.length, 1);
    claraThreadStore.reset("thread-a");
    assert.deepEqual(claraThreadStore.getThread("thread-a").messages, []);
    assert.equal(claraThreadStore.getThread("thread-a").messagesLoaded, false);
  });

  it("accepts only a positively seen session whose client matches the URL, both polarities", () => {
    const clientA = { ...session({}), firm_id: "firm-a" };
    assert.equal(sessionBelongsToClient(clientA, "client-a"), true);
    assert.equal(sessionBelongsToClient(clientA, "client-b"), false);
    assert.equal(sessionBelongsToClient(null, "client-a"), false);
  });
});
