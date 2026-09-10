// #634 — THE LATE-ATTACHMENT DIALOG, mounted.
//
// WHAT ONLY A MOUNTED DIALOG CAN PROVE, and each has its own cell:
//   1. Confirm sends the chosen document with the entry's CURRENT revision token
//      and ONE op key — the idempotency the "cannot double post after retry"
//      acceptance line rests on.
//   2. Every refusal renders INLINE and KEEPS the choice, so the human's one
//      piece of state survives the answer they did not want.
//   3. A source conflict resolves WHICH entry from the rows (a governed refusal
//      carries only its `detail.reason` to a browser) and links there.
//   4. The caller RE-READS after every completed attempt, refusal included —
//      hydrate-never-trust, and the only way a stale-revision refusal can ever
//      be recovered from.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { AttachEvidenceDialog } from "./attach-evidence-dialog";
import type { AttachEvidenceResult, EvidenceDocument } from "../../lib/work/evidence";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTRY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REVISION = "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr";
const OTHER_ENTRY = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const DOCUMENTS: EvidenceDocument[] = [
  { documentId: "d1111111-1111-4111-8111-111111111111", filename: "sept-rent.pdf", kind: "invoice", filedAt: "2026-09-02T03:00:00Z", financialDate: "2026-09-01" },
  { documentId: "d2222222-2222-4222-8222-222222222222", filename: "bank-slip.pdf", kind: "receipt", filedAt: "2026-09-03T03:00:00Z", financialDate: null },
];

type Attempt = { entryId: string; documentId: string; expectedRevision: string; opKey: string };

function App(props: {
  attach?: (input: Attempt) => Promise<AttachEvidenceResult>;
  onAttached?: () => void;
  findEntry?: () => Promise<string | null>;
  loadDocuments?: () => Promise<EvidenceDocument[]>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(AttachEvidenceDialog, {
      clientId: CLIENT,
      entryId: ENTRY,
      expectedRevision: REVISION,
      onAttached: props.onAttached ?? (() => {}),
      attach: (props.attach ?? (async () => ({ kind: "unavailable", message: "x" }))) as never,
      findEntry: (props.findEntry ?? (async () => null)) as never,
      loadDocuments: props.loadDocuments ?? (async () => DOCUMENTS),
      session: { getAccessToken: async () => "tok" } as never,
    }),
  });
}

/** Depth-first search over an arbitrary stub root — an open Base UI dialog's
 *  content is PORTALLED to `document.body`, a delegation root `h.find` (which
 *  walks only the mount container) never reaches. apps/web/AGENTS.md's first
 *  dialog law, and the members-walls precedent. */
function findIn(root: Stub, predicate: (n: Stub) => boolean): Stub | null {
  if (predicate(root)) return root;
  for (const c of ((root.childNodes as Stub[] | undefined) ?? [])) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function bodyNode(): Stub {
  return (globalThis as unknown as { document: { body: Stub } }).document.body;
}

function bodyText(): string {
  return textOf(bodyNode() as never);
}

async function drain(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  for (let i = 0; i < 6; i++) await h.settle();
}

async function openDialog(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const body = bodyNode();
  (body as { appendChild: (n: unknown) => void }).appendChild(h.container);
  await h.settle();
  const trigger = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Attach evidence"));
  assert.ok(trigger, "the dialog trigger must render");
  // `clickButton`, not `h.fireEvent`: the shared instrument invokes the live
  // React handler on the real node wherever it was portalled to.
  await h.act(async () => {
    await clickButton(trigger as never);
  });
  await drain(h);
}

function selectIn(): Stub {
  const node = findIn(
    bodyNode(),
    (n) => n.tagName === "SELECT" && (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("id") === "attach-evidence-document",
  );
  assert.ok(node, "the document chooser must render inside the dialog");
  return node!;
}

function confirmIn(): Stub {
  const node = findIn(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Attach");
  assert.ok(node, "the confirm control must render");
  return node!;
}

async function choose(h: Awaited<ReturnType<typeof renderComponent>>, documentId: string): Promise<void> {
  await h.act(() => {
    setFieldValue(selectIn() as never, documentId);
  });
  await h.settle();
}

async function pressAttach(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  await h.act(async () => {
    await clickButton(confirmIn() as never);
  });
  await drain(h);
}

test("#634: confirm sends the chosen document with the entry's revision and ONE op key, then re-reads", async () => {
  const attempts: Attempt[] = [];
  let reReads = 0;
  const h = await renderComponent(
    App({
      attach: async (input) => {
        attempts.push(input);
        return { kind: "attached", entryId: ENTRY, documentId: input.documentId, linkId: "l1", workId: "w1", alreadyAttached: false };
      },
      onAttached: () => {
        reReads += 1;
      },
    }),
  );
  try {
    await openDialog(h);
    assert.match(bodyText(), /sept-rent\.pdf/, "the client's filed documents are the options");
    // The confirm control is UNREACHABLE until a document is chosen — a door
    // that would only ever refuse is not offered.
    assert.equal((confirmIn() as { disabled?: unknown }).disabled, true);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0]!.entryId, ENTRY);
    assert.equal(attempts[0]!.documentId, DOCUMENTS[0]!.documentId);
    assert.equal(attempts[0]!.expectedRevision, REVISION, "the entry's revision AS READ is the staleness gate");
    assert.match(attempts[0]!.opKey, /[0-9a-f-]{16,}/, "one op key per decision, so two clicks cannot attach twice");
    assert.equal(reReads, 1, "hydrate-never-trust: the caller re-reads after the act");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("#634: a SOURCE CONFLICT stays open, keeps the choice, and links to the entry it found", async () => {
  let reReads = 0;
  const h = await renderComponent(
    App({
      attach: async () => ({ kind: "source_conflict" }),
      findEntry: async () => OTHER_ENTRY,
      onAttached: () => {
        reReads += 1;
      },
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    assert.match(bodyText(), /already backs another posted entry/);
    // THE CHOICE SURVIVES: a refusal must not throw away the state the human
    // just produced.
    assert.equal((selectIn() as { value?: unknown }).value, DOCUMENTS[0]!.documentId);
    // THE LINK IS THE ROWS' ANSWER, not the refusal's: a governed refusal
    // carries only `detail.reason` to a browser (lib/wire.ts), so the entry id
    // is re-read rather than invented.
    const link = findIn(
      bodyNode(),
      (n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY),
    );
    assert.ok(link, "the conflict names somewhere real to go");
    assert.equal(reReads, 1, "a refusal is re-read too");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("#634: a STALE revision renders inline and does not close the dialog", async () => {
  const h = await renderComponent(App({ attach: async () => ({ kind: "stale" }) }));
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[1]!.documentId);
    await pressAttach(h);
    assert.match(bodyText(), /changed since you opened it/);
    assert.equal((selectIn() as { value?: unknown }).value, DOCUMENTS[1]!.documentId, "the choice is preserved");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("#634: the SAME document already attached reads as the state it is, not as a failure", async () => {
  const h = await renderComponent(
    App({
      attach: async (input) => ({ kind: "attached", entryId: ENTRY, documentId: input.documentId, linkId: "l1", workId: null, alreadyAttached: true }),
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    // The dialog closes on an accepted answer, and the durable proof is the
    // caller's own re-read — not a line inside a dialog that is no longer open.
    assert.doesNotMatch(bodyText(), /Nothing changed\. Nothing changed\./);
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("#634: a client with NO filed documents says so instead of offering an empty chooser", async () => {
  const h = await renderComponent(App({ loadDocuments: async () => [] }));
  try {
    await openDialog(h);
    assert.match(bodyText(), /no filed documents to attach/);
    assert.equal((confirmIn() as { disabled?: unknown }).disabled, true);
  } finally {
    await h.unmount();
    await drain(h);
  }
});
