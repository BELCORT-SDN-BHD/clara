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
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { AttachEvidenceDialog } from "./attach-evidence-dialog";
import type { AttachEvidenceResult, EvidenceDocument, SpokenForDocumentRow } from "../../lib/work/evidence";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ENTRY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REVISION = "rrrrrrrr-rrrr-4rrr-8rrr-rrrrrrrrrrrr";
const OTHER_ENTRY = "ffffffff-ffff-4fff-8fff-ffffffffffff";
/** A SIBLING client of the same firm. One document may be actively filed to two clients at once
 *  (uq_document_filing_active is per (document, client), 0007:93) while the evidence invariant is
 *  firm-wide — so the entry that already holds a document may belong to a DIFFERENT client than
 *  the one this dialog is attaching for, and the note must say so and link THERE. */
const OTHER_CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
  loadSpokenFor?: () => Promise<SpokenForDocumentRow[]>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    // #728 finding 3 — a <section>/<h2> WRAPPER, the SAME shape work-detail.tsx renders this
    // dialog inside of (its "What was recorded" SectionHeader): `landmarkHeadingFor` walks up to
    // the nearest `<section>` and finds the first heading inside it, and without a real one here
    // the success-focus cell could not prove anything about where focus actually lands.
    children: createElement(
      "section",
      null,
      createElement("h2", null, "What was recorded"),
      createElement(AttachEvidenceDialog, {
        clientId: CLIENT,
        entryId: ENTRY,
        expectedRevision: REVISION,
        onAttached: props.onAttached ?? (() => {}),
        attach: (props.attach ?? (async () => ({ kind: "unavailable", message: "x" }))) as never,
        findEntry: (props.findEntry ?? (async () => null)) as never,
        loadDocuments: props.loadDocuments ?? (async () => DOCUMENTS),
        loadSpokenFor: props.loadSpokenFor ?? (async () => []),
        session: { getAccessToken: async () => "tok" } as never,
      }),
    ),
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

// THE `t634` PREFIX IS NOT A TYPO. A string literal containing `#634` is a valid
// three-digit CSS hex colour, and this app's `no-restricted-syntax` raw-colour
// rule (owner ruling Q4) reds every one of them. Ticket ids stay in COMMENTS,
// where the rule does not look; test NAMES carry the bare number.


test("t634: confirm sends the chosen document with the entry's revision and ONE op key, then re-reads", async () => {
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

test("t634: a SOURCE CONFLICT stays open, keeps the choice, and links to the entry it found", async () => {
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

test("t634: a STALE revision renders inline and does not close the dialog", async () => {
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

test("t634: the SAME document already attached reads as the state it is, not as a failure", async () => {
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

test("t634: a client with NO filed documents says so instead of offering an empty chooser", async () => {
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

// ---------------------------------------------------------------------------
// Review round — the two states that were being told as something they are not.
// ---------------------------------------------------------------------------

test("t634: an UNOBSERVED outcome keeps the op key, so the retry replays instead of attaching twice", async () => {
  // THE DEFECT THIS CELL FENCES. The key was re-minted after EVERY attempt,
  // `unavailable` included — and `unavailable` is precisely the case where
  // nothing was observed: the request may have reached the door and written the
  // link, and only the response may have been lost. Under a FRESH key the retry
  // is a NEW operation as far as `clara._reserve_op` is concerned, so the
  // database has no way to recognise it as the same press. §3's rule is the
  // opposite: same operation identity for a retry, a new identity only for a new
  // intent.
  const attempts: Attempt[] = [];
  const h = await renderComponent(
    App({
      attach: async (input) => {
        attempts.push(input);
        return attempts.length === 1
          ? { kind: "unavailable", message: "socket hang up" }
          : { kind: "attached", entryId: ENTRY, documentId: input.documentId, linkId: "l1", workId: "w1", alreadyAttached: true };
      },
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    assert.match(bodyText(), /could not reach the server/, "the lost answer is reported as unknown, not as a refusal");
    await pressAttach(h);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1]!.opKey, attempts[0]!.opKey,
      "a retry after an UNOBSERVED outcome must ride the SAME key — the database decides whether "
      + "it already happened, not the browser");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t634: a SETTLED outcome DOES rotate the key — a second decision is not a duplicate of the first", async () => {
  // The other half of the rule, and the reason the fix is a condition rather
  // than a deletion: a typed refusal IS an answer the database stored under that
  // key, so the next press must not replay it.
  const attempts: Attempt[] = [];
  const h = await renderComponent(
    App({
      attach: async (input) => {
        attempts.push(input);
        return attempts.length === 1
          ? { kind: "invalid_document" }
          : { kind: "attached", entryId: ENTRY, documentId: input.documentId, linkId: "l1", workId: "w1", alreadyAttached: false };
      },
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    await choose(h, DOCUMENTS[1]!.documentId);
    await pressAttach(h);
    assert.equal(attempts.length, 2);
    assert.notEqual(attempts[1]!.opKey, attempts[0]!.opKey,
      "a new decision under the old key would replay the refusal the database already stored");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t634: an UNREADABLE documents list is not the sentence 'this client has none'", async () => {
  const h = await renderComponent(App({ loadDocuments: async () => { throw new Error("gateway"); } }));
  try {
    await openDialog(h);
    const text = bodyText();
    assert.match(text, /could not read this client's documents/, "the dialog says what it could not do");
    assert.ok(!/no filed documents to attach/.test(text),
      "a failed read must never assert a fact about the client's records");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t634: a REVERSED entry's refusal is named, not folded into the generic one", async () => {
  const h = await renderComponent(App({ attach: async () => ({ kind: "entry_reversed" }) }));
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    assert.match(bodyText(), /has been reversed/, "the one next action is on the entry that replaced it");
    assert.equal((selectIn() as { value?: unknown }).value, DOCUMENTS[0]!.documentId,
      "the choice survives the refusal");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

// ---------------------------------------------------------------------------
// #728 finding 3 — late-attach success no longer drops focus to <body>.
// ---------------------------------------------------------------------------

test("t728: a SUCCESSFUL attach moves focus to the 'What was recorded' landmark, not <body>", async () => {
  const h = await renderComponent(
    App({
      attach: async (input) => ({ kind: "attached", entryId: ENTRY, documentId: input.documentId, linkId: "l1", workId: "w1", alreadyAttached: false }),
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    // Two extra settle passes: the fix awaits `nextPaint()` (a frame + a macrotask) before moving
    // focus, on purpose — see attach-evidence-dialog.tsx's own comment on `confirm`.
    for (let i = 0; i < 4; i++) await h.settle();

    const heading = findIn(bodyNode(), (n) => n.tagName === "H2" && textOf(n as never) === "What was recorded");
    assert.ok(heading, "the section heading must render");
    assert.equal(activeElement(), heading, "focus lands on the landmark, never on <body>, once the affordance is gone");
    assert.equal((heading as { getAttribute?: (k: string) => string | null }).getAttribute?.("tabindex"), "-1",
      "a heading is not natively focusable — the fix must give it tabIndex=-1 to be a real target");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728: a REFUSED attach leaves the dialog open and does NOT move focus to the landmark", async () => {
  const h = await renderComponent(App({ attach: async () => ({ kind: "invalid_document" }) }));
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    for (let i = 0; i < 4; i++) await h.settle();

    const heading = findIn(bodyNode(), (n) => n.tagName === "H2" && textOf(n as never) === "What was recorded");
    assert.notEqual(activeElement(), heading,
      "a refusal changes nothing about focus — the dialog stays open (this file's own header), so the landmark fix must not fire");
    // The dialog is still open and showing the refusal, per the existing refusal cells above.
    assert.match(bodyText(), /not an active filed document/);
  } finally {
    await h.unmount();
    await drain(h);
  }
});

// ---------------------------------------------------------------------------
// #728 finding 5 — the evidence picker disables documents that already back a posted entry.
// ---------------------------------------------------------------------------

test("t728: a document already spoken for renders DISABLED with a reason and a link to the entry it backs; the other option stays free", async () => {
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: OTHER_ENTRY, client_id: CLIENT, client_name: "Acme Sdn Bhd", via: "evidence_link" },
      ],
    }),
  );
  try {
    await openDialog(h);
    const select = selectIn();
    const options = ((select as { childNodes?: Stub[] }).childNodes ?? []).filter((n) => n.tagName === "OPTION");
    const spokenForOption = options.find((o) => (o as { getAttribute?: (k: string) => string | null }).getAttribute?.("value") === DOCUMENTS[0]!.documentId);
    const freeOption = options.find((o) => (o as { getAttribute?: (k: string) => string | null }).getAttribute?.("value") === DOCUMENTS[1]!.documentId);
    assert.ok(spokenForOption, "the spoken-for document is still OFFERED, never hidden");
    assert.equal((spokenForOption as { disabled?: unknown }).disabled, true, "…but disabled — a native <option disabled> is announced as unselectable on its own (C08.6, not colour alone)");
    assert.ok(freeOption, "the other document is still offered");
    assert.notEqual((freeOption as { disabled?: unknown }).disabled, true, "…and stays selectable — the advisory read must not disable what it did not name");

    assert.match(bodyText(), /already backs a posted journal entry/, "the reason renders beside the select, where an <option> has no room for it");
    const entryLink = findIn(
      bodyNode(),
      (n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY),
    );
    assert.ok(entryLink, "the reason links to the entry the document already backs");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728: a FAILED spoken-for read disables nothing and says the check was unavailable — exactly as documentsUnavailable does for the document list", async () => {
  const h = await renderComponent(App({ loadSpokenFor: async () => { throw new Error("gateway"); } }));
  try {
    await openDialog(h);
    const select = selectIn();
    const options = ((select as { childNodes?: Stub[] }).childNodes ?? []).filter((n) => n.tagName === "OPTION");
    for (const opt of options) {
      assert.notEqual((opt as { disabled?: unknown }).disabled, true,
        "a failed check must never be read as 'nothing is spoken for' — see mergeSpokenFor's own note");
    }
    assert.match(bodyText(), /could not check which documents already back a posted entry/);
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728: a SIBLING client's entry holding the document is named, and the link goes to THAT client's journals", async () => {
  const h = await renderComponent(
    App({
      loadSpokenFor: async () => [
        { document_id: DOCUMENTS[0]!.documentId, entry_id: OTHER_ENTRY, client_id: OTHER_CLIENT, client_name: "Beta Sdn Bhd", via: "coding" },
      ],
    }),
  );
  try {
    await openDialog(h);
    assert.match(bodyText(), /already backs a posted journal entry for Beta Sdn Bhd/,
      "the sentence names WHOSE entry holds it — 'already backs a posted entry' is unactionable without that");
    const href = String(
      (findIn(bodyNode(), (n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY)) as
        { getAttribute?: (k: string) => string | null } | null)?.getAttribute?.("href") ?? "",
    );
    assert.ok(href.includes(OTHER_CLIENT),
      "the link targets the CLAIMANT client's Journals route — the asking client's would show a journal the entry is not in");
    assert.equal(href.includes(CLIENT), false, "…and not this dialog's own client");
  } finally {
    await h.unmount();
    await drain(h);
  }
});
