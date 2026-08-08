// 0051 §2 — the recovery door's answer must be WIRED, not merely derivable.
//
// intakeRecovery.test.ts states the rule exhaustively and costs nothing: given a receipt,
// `recoveryCopy` returns the right label and detail. But that rule was ALWAYS derivable — the
// bug both review lanes found was that neither upload path ever asked. `finalizeIntake` was
// declared `Promise<void>` and its body was thrown away in two places, so a refusal reached
// nobody. A rule that is right in isolation and unreached in the hook is exactly the failure
// this was, so these cells mount the REAL hooks and drive the REAL transport over a stubbed
// fetch (the useInterviewRun.test.ts doctrine, and the same two instruments it names).
//
// BOTH consumers are covered, deliberately. The documents tab and the chat composer were fixed
// by the same two lines each, and the chat one matters more: an attachment that reads "Stored"
// is about to be submitted into a turn on the understanding that Clara will read it. If the
// re-upload was refused, the document exists but will never be read, and the turn is built on
// a misunderstanding. A symmetric fix deserves symmetric evidence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useComposerAttachments } from "../chat/attachments";
import { useUploadQueue } from "../documents/useUploadQueue";

const CALLER = "jwt-fixture";
const INTAKE = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";

const REFUSED = {
  status: "adopted", document_id: DOC,
  recovery_refused: {
    reason: "not_retryable", error_code: "corrupt",
    remedy: "this document could not be read in its current form.",
  },
};
const MINTED = { status: "adopted", document_id: DOC, recovery: { mode: "mint", lane: "ocr", task_id: "t-1" } };
const PLAIN = { status: "adopted", document_id: DOC };

/** Route-dispatched fetch over the four calls an upload makes. `receipt` is what the finalize
 *  endpoint answers — the only thing that varies between these cells. */
function installFetch(receipt: unknown) {
  const previous = globalThis.fetch;
  const json = (body: unknown) => ({
    ok: true, status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as Response;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/intake/documents")) {
      return json({ intake_id: INTAKE, upload_token: "up-cap", expires_at: new Date(Date.now() + 6e5).toISOString() });
    }
    if (url.includes("/bytes")) return json({});
    if (url.includes("/finalize")) return json(receipt);
    if (url.includes("/rest/v1/document_intakes_visible")) {
      return json([{ id: INTAKE, status: "adopted", document_id: DOC, failure_code: null }]);
    }
    throw new Error(`unstubbed fetch: ${url}`);
  }) as typeof fetch;
  return () => { globalThis.fetch = previous; };
}

const settled = (s: string) => s === "ready" || s === "failed" || s === "error";

/** NOT `items.every(settled)`: `[].every(...)` is vacuously TRUE, so an empty queue reads as
 *  "finished" and the cell then asserts against `items[0] === undefined`. That produced an
 *  ALTERNATING pass/fail across these six cells until it was found — a wait condition that can
 *  be satisfied by the absence of the thing being waited for is its own small evidence-law
 *  violation. Require a row to EXIST first. */
const done = (items: Row[]) => items.length > 0 && items.every((a) => settled(a.state));

type Row = { state: string; label: string; error: string | null };

/** Mount a hook, add one file, and let its transport settle. `renderHook` is async and exposes
 *  `settle()` — a real macrotask hop, which this surface needs: each step awaits a fetch and
 *  then its `.json()`, so a single microtask drain would leave the chain mid-flight. */
async function drive(mount: () => { items: Row[] }, add: (api: never) => void, receipt: unknown): Promise<Row> {
  const restore = installFetch(receipt);
  let h: Awaited<ReturnType<typeof renderHook<{ items: Row[] }>>> | null = null;
  try {
    h = await renderHook(mount);
    await h.act(() => add(h!.current as never));
    for (let i = 0; i < 60 && !done(h.current.items); i += 1) {
      await h.settle();
    }
    const row = h.current.items[0];
    if (!done(h.current.items) || !row) {
      throw new Error("the upload never settled — the cell would otherwise assert against an absent row");
    }
    return row;
  } finally {
    if (h) await h.unmount();
    restore();
  }
}

const pdf = () => new File(["%PDF-1.7"], "x.pdf", { type: "application/pdf" });

const SURFACES = [
  ["chat composer", (receipt: unknown) => drive(
    () => useComposerAttachments(CALLER, () => {}),
    (api: never) => (api as unknown as { add: (f: File[], s: string) => void }).add([pdf()], "sess-1"),
    receipt,
  )],
  ["documents tab", (receipt: unknown) => drive(
    () => useUploadQueue(CALLER, () => {}, () => {}),
    (api: never) => (api as unknown as { add: (f: File[]) => void }).add([pdf()]),
    receipt,
  )],
] as const;

for (const [surface, run] of SURFACES) {
  test(`[0051 §2] ${surface}: a REFUSED recovery reaches the row — label and remedy, not "Stored"`, async () => {
    const row = await run(REFUSED);
    assert.equal(row.state, "ready",
      "the row stays READY because the document really WAS stored — marking it failed would be "
      + "the lie; what changes is what it SAYS");
    assert.match(row.label, /not re-read/i, "…the label says nothing was retried");
    assert.doesNotMatch(row.label, /matched an existing document/i,
      "…and never the generic adoption copy, which is the defect both reviews found");
    assert.equal(row.error, REFUSED.recovery_refused.remedy,
      "…with the door's OWN remedy text carried through verbatim");
  });

  test(`[0051 §2] ${surface}: a MINTED recovery says the document is being re-read`, async () => {
    const row = await run(MINTED);
    assert.equal(row.state, "ready", "the document is stored and usable");
    assert.match(row.label, /re-reading/i, "…and the person is told a fresh read is under way");
    assert.equal(row.error, null, "…with nothing to remedy");
  });

  test(`[0051 §2] ${surface}: a PLAIN adoption is unchanged`, async () => {
    const row = await run(PLAIN);
    assert.equal(row.state, "ready", "an ordinary duplicate still adopts");
    assert.equal(row.error, null, "…with no notice");
    assert.doesNotMatch(row.label, /not re-read|re-reading/i,
      "…and none of the recovery copy leaks into the overwhelmingly common path");
  });
}
