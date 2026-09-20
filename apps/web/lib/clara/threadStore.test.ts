// #614 A7 — the composer draft's storage seam, pinned at the store level so the
// scope-isolation rules do not depend on a mounted `ClaraThreadView` to prove them.
// `components/clara/composer-attachment-scope.test.tsx` drives the same rules
// through the real composer; these cells are the pure store underneath it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { claraThreadStore } from "./threadStore";

const FIRM = "firm";
const CLIENT_A = "22222222-2222-4222-8222-222222222222";
const CLIENT_B = "55555555-5555-4555-8555-555555555555";
const THREAD_1 = "11111111-1111-4111-8111-111111111111";
const THREAD_2 = "99999999-9999-4999-8999-999999999999";

describe("claraThreadStore drafts (#614 A7)", () => {
  it("a key that was never written reads back \"\" — the same honest default as getThread", () => {
    assert.equal(claraThreadStore.getDraft(FIRM, THREAD_1), "");
  });

  it("set then get round-trips for one (altitude, threadId) key", () => {
    claraThreadStore.setDraft(FIRM, THREAD_1, "reconcile the July bank statement");
    try {
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_1), "reconcile the July bank statement");
    } finally {
      claraThreadStore.clearDraft(FIRM, THREAD_1);
    }
  });

  it("clearDraft empties exactly the one key it is given, nothing else", () => {
    claraThreadStore.setDraft(FIRM, THREAD_1, "keep me");
    try {
      claraThreadStore.clearDraft(FIRM, THREAD_2); // a DIFFERENT threadId, same altitude
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_1), "keep me", "clearing an unrelated key must not touch this one");
      claraThreadStore.clearDraft(FIRM, THREAD_1);
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_1), "");
    } finally {
      claraThreadStore.clearDraft(FIRM, THREAD_1);
    }
  });

  it("ISOLATION BY THREAD: two threads at the same altitude never share a draft", () => {
    claraThreadStore.setDraft(FIRM, THREAD_1, "for thread one");
    claraThreadStore.setDraft(FIRM, THREAD_2, "for thread two");
    try {
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_1), "for thread one");
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_2), "for thread two");
    } finally {
      claraThreadStore.clearDraft(FIRM, THREAD_1);
      claraThreadStore.clearDraft(FIRM, THREAD_2);
    }
  });

  it("ISOLATION BY ALTITUDE: the SAME threadId under two altitudes never shares a draft — the exact hazard a bare clientId prop change can hit with no remount", () => {
    // A real thread only ever resolves under one altitude, but the full-screen
    // mount can flip `clientId` as a bare prop change while `threadId` momentarily
    // still names the OUTGOING scope's thread (see threadStore.ts's own header on
    // `drafts`) — so the key must discriminate on altitude even when the thread
    // half happens to collide, which this cell forces by construction.
    claraThreadStore.setDraft(CLIENT_A, THREAD_1, "client A's draft");
    claraThreadStore.setDraft(CLIENT_B, THREAD_1, "client B's draft");
    try {
      assert.equal(claraThreadStore.getDraft(CLIENT_A, THREAD_1), "client A's draft");
      assert.equal(claraThreadStore.getDraft(CLIENT_B, THREAD_1), "client B's draft");
      claraThreadStore.clearDraft(CLIENT_A, THREAD_1);
      assert.equal(claraThreadStore.getDraft(CLIENT_A, THREAD_1), "", "clearing A's draft must not touch B's");
      assert.equal(claraThreadStore.getDraft(CLIENT_B, THREAD_1), "client B's draft");
    } finally {
      claraThreadStore.clearDraft(CLIENT_A, THREAD_1);
      claraThreadStore.clearDraft(CLIENT_B, THREAD_1);
    }
  });

  it("setDraft notifies subscribers — a mounted view re-renders on a change made anywhere", () => {
    let notifications = 0;
    const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
    try {
      claraThreadStore.setDraft(FIRM, THREAD_1, "typed one character");
      assert.equal(notifications, 1);
    } finally {
      unsubscribe();
      claraThreadStore.clearDraft(FIRM, THREAD_1);
    }
  });

  it("setDraft is a no-op (no emit) when the text has not actually changed", () => {
    claraThreadStore.setDraft(FIRM, THREAD_1, "steady text");
    try {
      let notifications = 0;
      const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
      try {
        claraThreadStore.setDraft(FIRM, THREAD_1, "steady text");
        assert.equal(notifications, 0, "writing the same value again must not re-notify every mounted view");
      } finally {
        unsubscribe();
      }
    } finally {
      claraThreadStore.clearDraft(FIRM, THREAD_1);
    }
  });

  it("clearDraft notifies subscribers, but only when there was something to clear", () => {
    claraThreadStore.setDraft(FIRM, THREAD_1, "something");
    let notifications = 0;
    const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
    try {
      claraThreadStore.clearDraft(FIRM, THREAD_1);
      assert.equal(notifications, 1);
      claraThreadStore.clearDraft(FIRM, THREAD_1); // already empty
      assert.equal(notifications, 1, "clearing an already-empty draft must not notify a second time");
    } finally {
      unsubscribe();
    }
  });

  it("reset(threadId) ALSO forgets that thread's draft, in every altitude it was filed under — the isolation composer-keyboard.test.tsx's five cells lean on", () => {
    claraThreadStore.setDraft(FIRM, THREAD_1, "firm draft");
    claraThreadStore.setDraft(CLIENT_A, THREAD_1, "client A draft for the same thread id");
    claraThreadStore.setDraft(FIRM, THREAD_2, "an unrelated thread's draft");
    claraThreadStore.reset(THREAD_1);
    try {
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_1), "", "reset must clear the firm-altitude draft");
      assert.equal(claraThreadStore.getDraft(CLIENT_A, THREAD_1), "", "reset must clear it under every altitude, not just one");
      assert.equal(claraThreadStore.getDraft(FIRM, THREAD_2), "an unrelated thread's draft", "reset(THREAD_1) must never touch a different thread's draft");
    } finally {
      claraThreadStore.clearDraft(FIRM, THREAD_2);
    }
  });
});

describe("claraThreadStore interview drafts (#897)", () => {
  it("a client that was never written reads back \"\" — the same honest default as getDraft", () => {
    assert.equal(claraThreadStore.getInterviewDraft(CLIENT_A), "");
  });

  it("set then get round-trips, keyed by CLIENT ALONE — no threadId or runId in the key", () => {
    claraThreadStore.setInterviewDraft(CLIENT_A, "Rome Advisory Sdn Bhd");
    try {
      assert.equal(claraThreadStore.getInterviewDraft(CLIENT_A), "Rome Advisory Sdn Bhd");
    } finally {
      claraThreadStore.clearInterviewDraft(CLIENT_A);
    }
  });

  it("ISOLATION BY CLIENT: two clients' interview drafts never share a value", () => {
    claraThreadStore.setInterviewDraft(CLIENT_A, "client A's typed answer");
    claraThreadStore.setInterviewDraft(CLIENT_B, "client B's typed answer");
    try {
      assert.equal(claraThreadStore.getInterviewDraft(CLIENT_A), "client A's typed answer");
      assert.equal(claraThreadStore.getInterviewDraft(CLIENT_B), "client B's typed answer");
      claraThreadStore.clearInterviewDraft(CLIENT_A);
      assert.equal(claraThreadStore.getInterviewDraft(CLIENT_A), "", "clearing A's draft must not touch B's");
      assert.equal(claraThreadStore.getInterviewDraft(CLIENT_B), "client B's typed answer");
    } finally {
      claraThreadStore.clearInterviewDraft(CLIENT_A);
      claraThreadStore.clearInterviewDraft(CLIENT_B);
    }
  });

  it("setInterviewDraft notifies subscribers — a mounted card re-renders on a change made anywhere", () => {
    let notifications = 0;
    const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
    try {
      claraThreadStore.setInterviewDraft(CLIENT_A, "typed one character");
      assert.equal(notifications, 1);
    } finally {
      unsubscribe();
      claraThreadStore.clearInterviewDraft(CLIENT_A);
    }
  });

  it("setInterviewDraft is a no-op (no emit) when the text has not actually changed", () => {
    claraThreadStore.setInterviewDraft(CLIENT_A, "steady text");
    try {
      let notifications = 0;
      const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
      try {
        claraThreadStore.setInterviewDraft(CLIENT_A, "steady text");
        assert.equal(notifications, 0, "writing the same value again must not re-notify every mounted view");
      } finally {
        unsubscribe();
      }
    } finally {
      claraThreadStore.clearInterviewDraft(CLIENT_A);
    }
  });

  it("clearInterviewDraft notifies subscribers, but only when there was something to clear", () => {
    claraThreadStore.setInterviewDraft(CLIENT_A, "something");
    let notifications = 0;
    const unsubscribe = claraThreadStore.subscribe(() => { notifications += 1; });
    try {
      claraThreadStore.clearInterviewDraft(CLIENT_A);
      assert.equal(notifications, 1);
      claraThreadStore.clearInterviewDraft(CLIENT_A); // already empty
      assert.equal(notifications, 1, "clearing an already-empty draft must not notify a second time");
    } finally {
      unsubscribe();
    }
  });

  it("SURVIVES A REMOUNT WITH NO runId: the whole point of #897 — a fresh read before any run is re-attached still sees the earlier keystrokes", () => {
    // `InterviewRunCard`'s own `runId` local state is `null` on every mount, including the
    // remount the rail <-> full-screen altitude change causes. This cell proves the store
    // needs no runId at all to hand the draft back — CLIENT_A alone is enough.
    claraThreadStore.setInterviewDraft(CLIENT_A, "typed before the altitude change");
    try {
      // Simulates the next mount's very first read, before `startClientInterview` has
      // resolved a runId for this fresh component instance.
      assert.equal(claraThreadStore.getInterviewDraft(CLIENT_A), "typed before the altitude change");
    } finally {
      claraThreadStore.clearInterviewDraft(CLIENT_A);
    }
  });
});
