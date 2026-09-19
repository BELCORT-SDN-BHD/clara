// #635 — the accept dialog's four load-bearing properties, mounted.
//
// Each is a property of the ACT, not of the copy, and each has its own cell:
//   1. the op key is minted ONCE per (kind, version) and HELD across a retry — otherwise a lost
//      response accepts twice instead of replaying (0185:766-775);
//   2. `bodySha256` is forwarded BYTE-IDENTICALLY, asserted on the captured call — the wall that
//      binds an acceptance to the text the accepter actually saw;
//   3. a `stale_version` refusal RE-READS rather than resubmitting, and the re-read mints a NEW
//      key because a different version is a different act;
//   4. a draft renders no accept control at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { findIn } from "../admin/members-fixtures";
import { enableDomInspection } from "../../test/domInspect";
import { AcceptLegalDialog } from "./accept-legal-dialog";
import type { AcceptLegalDocumentOutcome } from "../../lib/registration/legal-doors";
import type { LegalDocumentRow } from "../../lib/registration/legal-reads";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const SHA_V2 = "62feff217a5b4609d3a3a8a470b76947fc09840e1b140c25328ff574b01e6f39";
const SHA_V3 = "6d1c97a5cf8a22994b12dcb1b113c53bc2b1edb282f5c1237ff1ef12c679c7b3";

function row(over: Partial<LegalDocumentRow> = {}): LegalDocumentRow {
  return {
    kind: "terms",
    version: 2,
    status: "published",
    title: "Terms of Service (Clara beta)",
    body: "The agreement text, exactly as the door returned it.",
    body_sha256: SHA_V2,
    effective_from: "2026-09-12T16:00:00.000Z",
    published_at: "2026-09-18T13:46:54.777Z",
    accepted_at: null,
    accepted_version: null,
    ...over,
  };
}

type Call = { version: number; bodySha256: string; opKey: string };

async function mount(opts: {
  rows: () => LegalDocumentRow[];
  outcomes: AcceptLegalDocumentOutcome[];
  calls: Call[];
  minted: string[];
  onAccepted?: () => void;
}) {
  let mintCount = 0;
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(AcceptLegalDialog, {
        kind: "terms",
        open: true,
        onOpenChange: () => {},
        onAccepted: opts.onAccepted ?? (() => {}),
        loadDocuments: async () => opts.rows(),
        accept: async (params) => {
          opts.calls.push({ version: params.version, bodySha256: params.bodySha256, opKey: params.opKey });
          return opts.outcomes.shift() ?? { kind: "unavailable" };
        },
        mintOpKey: () => {
          mintCount += 1;
          const key = `op-key-${mintCount}`;
          opts.minted.push(key);
          return key;
        },
      }),
    }),
  );
  // A Base UI dialog PORTALS its content out of the mount root, so a container-scoped walk sails
  // straight past every control under test. The container is appended to `document.body` and every
  // query below walks the BODY — `components/admin/invite-dialog-a11y.test.tsx`'s own idiom.
  const body = (globalThis as unknown as { document: { body: Stub & { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 4; i += 1) await h.settle();
  return { h, body };
}

/** NEVER hand one of these stubs to `assert.equal(..., null)`: node serialises the whole DOM node
 *  into the failure message and the process runs out of memory before it can print. Compare
 *  `confirmButton(body) !== null` instead — measured while writing these cells. */
function confirmButton(body: Stub): Stub | null {
  return findIn(body as never, (n) => (n as Stub).tagName === "BUTTON" && textOf(n as never).includes("I accept this agreement")) as Stub | null;
}

function bodyText(body: Stub): string {
  return textOf(body as never);
}

test("p635.web.accept_op_key_held a retry after an unreached door reuses the SAME op key — a replay, never a second acceptance", async () => {
  const calls: Call[] = [];
  const minted: string[] = [];
  const { h, body } = await mount({
    rows: () => [row()],
    // First attempt: nothing was decided. Second: the door answers, and it is a REPLAY, which is
    // only possible because the key did not move.
    outcomes: [
      { kind: "unavailable" },
      { kind: "accepted", documentKind: "terms", version: 2, acceptedAt: "2026-09-19T01:00:00.000Z", replay: true },
    ],
    calls,
    minted,
  });
  try {
    await clickButton(confirmButton(body)!);
    await h.settle();
    assert.match(bodyText(body), /This did not reach the database\. Nothing was recorded/);

    await clickButton(confirmButton(body)!);
    await h.settle();
    assert.equal(calls.length, 2);
    assert.equal(calls[0]!.opKey, calls[1]!.opKey,
      "minting a fresh key per attempt destroys the one property the key exists for");
    assert.equal(minted.length, 1, "…and the mint really happened once");
    assert.match(bodyText(body), /Already accepted on/, "the replay is reported as a replay, not as a second receipt");
  } finally { await h.unmount(); }
});

test("p635.web.accept_sha_verbatim the digest the door returned is forwarded byte-identically", async () => {
  const calls: Call[] = [];
  const { h, body } = await mount({
    rows: () => [row()],
    outcomes: [{ kind: "accepted", documentKind: "terms", version: 2, acceptedAt: "2026-09-19T01:00:00.000Z", replay: false }],
    calls,
    minted: [],
  });
  try {
    await clickButton(confirmButton(body)!);
    await h.settle();
    assert.equal(calls[0]!.bodySha256, SHA_V2,
      "never recomputed on this side — that would make the DB's hash_mismatch wall agree with itself unconditionally");
    assert.equal(calls[0]!.version, 2);
    assert.match(bodyText(body), /Accepted on/);
    assert.equal(confirmButton(body) !== null, false, "a completed acceptance retires its own control");
  } finally { await h.unmount(); }
});

test("p635.web.accept_stale_rereads a stale_version refusal re-reads and mints a NEW key for the new version — it never resubmits", async () => {
  const calls: Call[] = [];
  const minted: string[] = [];
  let current = row();
  const { h, body } = await mount({
    rows: () => [current],
    outcomes: [
      { kind: "refused", code: "CLR09", reason: "stale_version", message: "that terms version is no longer the published one", stale: true },
      { kind: "accepted", documentKind: "terms", version: 3, acceptedAt: "2026-09-19T02:00:00.000Z", replay: false },
    ],
    calls,
    minted,
  });
  try {
    await clickButton(confirmButton(body)!);
    await h.settle();
    assert.match(bodyText(body), /This agreement changed while you were reading it/);
    assert.match(bodyText(body), /Read it and accept that one instead/);
    assert.equal(confirmButton(body) !== null, false,
      "no resubmit is offered against the stale digest — re-posting it could only refuse again");

    // The shelf moved under the reader; the re-read control fetches what is current NOW.
    current = row({ version: 3, body_sha256: SHA_V3, body: "Version three's text." });
    const reread = findIn(body as never, (n) => (n as Stub).tagName === "BUTTON" && textOf(n as never).includes("Show me the current version")) as Stub | null;
    assert.ok(reread, "the stale banner carries the re-read action");
    await clickButton(reread as Stub);
    await h.settle();
    assert.match(bodyText(body), /Version three's text\./, "the NEW bytes are rendered");

    await clickButton(confirmButton(body)!);
    await h.settle();
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.version, 3);
    assert.equal(calls[1]!.bodySha256, SHA_V3, "the NEW digest, forwarded verbatim in its turn");
    assert.notEqual(calls[0]!.opKey, calls[1]!.opKey,
      "a different version is a different act, so the key is re-minted rather than carried over");
    assert.equal(minted.length, 2);
  } finally { await h.unmount(); }
});

test("p635.web.accept_draft_no_control a draft is a labelled preview with no accept control", async () => {
  const calls: Call[] = [];
  const { h, body } = await mount({
    rows: () => [row({ status: "draft", published_at: null })],
    outcomes: [],
    calls,
    minted: [],
  });
  try {
    assert.match(bodyText(body), /It cannot be accepted, and nothing in Clara depends on it yet/);
    assert.equal(confirmButton(body) !== null, false,
      "accept_legal_document refuses a draft CLR09/not_published; offering the control anyway is the defect");
    assert.equal(calls.length, 0);
  } finally { await h.unmount(); }
});

test("p635.web.accept_read_failed a document that could not be read offers nothing to accept", async () => {
  const calls: Call[] = [];
  const { h, body } = await mount({ rows: () => [], outcomes: [], calls, minted: [] });
  try {
    assert.match(bodyText(body), /The agreement text could not be read, so there is nothing to accept yet/);
    assert.equal(confirmButton(body) !== null, false);
  } finally { await h.unmount(); }
});

test("p635.web.accept_refusal_verbatim a non-stale governed refusal is printed with the database's own words and code", async () => {
  const calls: Call[] = [];
  const { h, body } = await mount({
    rows: () => [row()],
    outcomes: [{ kind: "refused", code: "CLR04", reason: "agent_actor", message: "the agent identity cannot accept a legal document", stale: false }],
    calls,
    minted: [],
  });
  try {
    await clickButton(confirmButton(body)!);
    await h.settle();
    assert.match(bodyText(body), /the agent identity cannot accept a legal document/, "verbatim, never paraphrased");
    assert.match(bodyText(body), /CLR04/);
  } finally { await h.unmount(); }
});
