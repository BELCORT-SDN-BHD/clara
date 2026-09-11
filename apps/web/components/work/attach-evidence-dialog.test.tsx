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
  findEntry?: () => Promise<{ entryId: string; clientId: string } | null>;
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
      findEntry: async () => ({ entryId: OTHER_ENTRY, clientId: CLIENT }),
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
    // `assert.ok(a === b)`, never `assert.equal` — two stub-DOM nodes handed to node:assert's
    // deep-equality path HANG the runner on this harness (LANE-RECIPE's own measured note).
    assert.ok(activeElement() === heading, "focus lands on the landmark, never on <body>, once the affordance is gone");
    assert.equal((heading as { getAttribute?: (k: string) => string | null }).getAttribute?.("tabindex"), "-1",
      "a heading is not natively focusable — the fix must give it tabIndex=-1 to be a real target");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728: a REFUSED attach keeps the dialog open and puts focus on the control the refusal asks about", async () => {
  const h = await renderComponent(App({ attach: async () => ({ kind: "invalid_document" }) }));
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    for (let i = 0; i < 4; i++) await h.settle();

    // A POSITIVE TARGET, not "not the landmark" (review round, N13): `busy` disables the select,
    // Cancel AND Attach for the duration of the write, so the button focus was on is disabled
    // under the person's cursor and a real browser drops focus to <body> — re-enabling does not
    // bring it back. "Focus is not on the landmark" would pass with focus nowhere at all, which is
    // exactly the defect. Assert where it IS: the one control this refusal asks them to change.
    const select = selectIn();
    assert.ok(select, "the chooser is still mounted — the dialog stays open through a refusal");
    assert.ok(activeElement() === select, "focus returns to the chooser, never stranded on <body>");
    const heading = findIn(bodyNode(), (n) => n.tagName === "H2" && textOf(n as never) === "What was recorded");
    assert.ok(activeElement() !== heading, "…and NOT on the landmark, which belongs to the path that unmounts this affordance");
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

    // WHILE BROWSING: the reason rides the OPTION's own label (bounded — one option, one label)
    // and ONE summary line says how many are unavailable. The per-document paragraph-and-link the
    // first cut rendered for EVERY spoken-for document is gone: on a client a year in, that list is
    // most of its filing history (review round, N9).
    assert.match(textOf(spokenForOption as never), /already backs a posted entry/,
      "the disabled option says WHY on itself — C08.6, and the one place a browsing person reads");
    assert.match(bodyText(), /already backs a posted journal entry and cannot be chosen/,
      "one summary line beside the select, whatever the count");
    const unselectedLink = findIn(
      bodyNode(),
      (n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY),
    );
    assert.equal(unselectedLink, null,
      "…and NO link while nothing is selected — the link belongs to the one document whose conflict is the person's own");

    // WHEN THEIR OWN CHOICE IS THE CONFLICTED ONE: the sentence and the link appear, once.
    await setFieldValue(select as never, DOCUMENTS[0]!.documentId);
    await h.settle();
    const entryLink = findIn(
      bodyNode(),
      (n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY),
    );
    assert.ok(entryLink, "the selected document's own reason links to the entry it already backs");
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
    // THE LOOP BELOW IS VACUOUS ON AN EMPTY LIST, and an empty list is exactly what a refactor
    // that folded the two reads back into one effect would produce — a failing spoken-for read
    // running the DOCUMENTS catch, leaving `documents = []` and the picker offering nothing at
    // all, while the banner assertion still matched (delta review [6]). Count first.
    assert.equal(options.length, DOCUMENTS.length + 1,
      `the chooser still offers every document plus the "no document" option (saw ${options.length})`);
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

test("t728: a door REFUSAL whose entry belongs to a sibling client links into THAT client's journals", async () => {
  // The advisory read is not the law: `attach_entry_evidence`'s own CLR13 is, and it resolves the
  // holding entry FIRM-WIDE. `findEntryForDocument` therefore answers firm-wide too and carries
  // the claimant with the entry (delta review [4]) — a client-scoped lookup returned null here
  // and the refusal rendered with no link at all.
  const h = await renderComponent(
    App({
      attach: async () => ({ kind: "source_conflict" }),
      findEntry: async () => ({ entryId: OTHER_ENTRY, clientId: OTHER_CLIENT }),
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    const href = String(
      (findIn(bodyNode(), (n) => n.tagName === "A" && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY)) as
        { getAttribute?: (k: string) => string | null } | null)?.getAttribute?.("href") ?? "",
    );
    assert.ok(href.includes(OTHER_CLIENT),
      "the refusal's link targets the CLAIMANT client's Journals route");
    assert.equal(href.includes(CLIENT), false,
      "…and not the asking client's, whose journal never contains that entry");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728: a REFUSED attach does NOT steal focus the person placed somewhere themselves", async () => {
  // `busy` does not disable everything — DialogContent renders its own close X with NO disabled
  // prop (components/ui/dialog.tsx), and Escape and the backdrop are never gated (delta review
  // [5]). During the write that X is the one live control inside the focus trap, so it is exactly
  // where a keyboard user ends up; the refusal landing must not yank focus off it. The write is
  // PARKED on a gate so the focus is placed WHILE `busy` is true, which is the only ordering that
  // exercises the guard at all.
  let release!: () => void;
  const parked = new Promise<void>((resolve) => { release = resolve; });
  const h = await renderComponent(App({
    attach: async () => { await parked; return { kind: "invalid_document" }; },
  }));
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);
    // Still mid-write: the close X is enabled, and this is the person tabbing to it.
    const closeX = findIn(bodyNode(),
      (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Close"));
    assert.ok(closeX, "the dialog's own close control is rendered and reachable during the write");
    assert.notEqual((closeX as { disabled?: unknown }).disabled, true,
      "…and it is NOT disabled by `busy` — the premise of this cell, and of the guard");
    (closeX as { focus?: () => void }).focus?.();
    release();
    for (let i = 0; i < 6; i++) await h.settle();
    assert.ok(activeElement() === closeX,
      "focus stays where the person put it — the post-refusal move is guarded, not unconditional");
    assert.match(bodyText(), /not an active filed document/, "…and the refusal still rendered");
  } finally {
    release();
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
    // The sibling-client sentence belongs to the SELECTED document's own note — see SpokenForNotes.
    await setFieldValue(selectIn() as never, DOCUMENTS[0]!.documentId);
    await h.settle();
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

test("t728f: the dialog's refusal NAMES the sibling client its link leads to, and says nothing of the kind for this client's own entry", async () => {
  // Delta review round 3, finding [5] — the same defect as the composer's, on the other surface:
  // the link leaves this client's books for a sibling's Journals route, and the copy said only
  // "That document already backs another posted entry".
  const named = await renderComponent(
    App({
      attach: async () => ({ kind: "source_conflict" }),
      findEntry: async () => ({ entryId: OTHER_ENTRY, clientId: OTHER_CLIENT, clientName: "Beta Sdn Bhd" }),
    }),
  );
  try {
    await openDialog(named);
    await choose(named, DOCUMENTS[0]!.documentId);
    await pressAttach(named);
    assert.match(textOf(bodyNode()), /belongs to Beta Sdn Bhd/,
      "the refusal names the claimant before offering the door out of this client");
    assert.match(textOf(bodyNode()), /leaves this client/,
      "…and says plainly that following the link leaves these books");
  } finally {
    await named.unmount();
    await drain(named);
  }

  // …and the claimant that IS this client keeps the plain sentence: nothing is being left.
  const own = await renderComponent(
    App({
      attach: async () => ({ kind: "source_conflict" }),
      findEntry: async () => ({ entryId: OTHER_ENTRY, clientId: CLIENT, clientName: "Acme Sdn Bhd" }),
    }),
  );
  try {
    await openDialog(own);
    await choose(own, DOCUMENTS[0]!.documentId);
    await pressAttach(own);
    assert.match(textOf(bodyNode()), /already backs another posted entry/,
      "this client's own entry keeps the plain refusal");
    assert.doesNotMatch(textOf(bodyNode()), /leaves this client/,
      "…and nothing claims the link goes somewhere else");
    assert.doesNotMatch(textOf(bodyNode()), /belongs to/,
      "…and no claimant is named, because the claimant is these very books");
  } finally {
    await own.unmount();
    await drain(own);
  }
});

// ---------------------------------------------------------------------------
// #728 delta review round 4 — the refusal's focus recovery is not hostage to a
// cosmetic read, and the refusal is announced once.
// ---------------------------------------------------------------------------

/** Every node that ANNOUNCES on its own AND has something to say. Empty live regions are excluded
 *  deliberately: this dialog and the page behind it mount standing, empty `role="alert"` slots,
 *  and an empty live region speaks nothing — counting those would make the assertion about how
 *  the tree is built rather than about what a person HEARS (§5's one-announcement-owner rule). */
function liveRegionsIn(root: Stub): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
    const role = get ? get.call(n, "role") : null;
    const live = get ? get.call(n, "aria-live") : null;
    if ((role === "alert" || role === "status" || (live !== null && live !== "off"))
      && textOf(n as never).trim() !== "") out.push(n);
    for (const c of ((n as { childNodes?: Stub[] }).childNodes ?? [])) walk(c);
  };
  walk(root);
  return out;
}

/** True when `needle` IS `haystack` or sits anywhere beneath it. */
function containsNode(haystack: Stub, needle: Stub): boolean {
  if (haystack === needle) return true;
  for (const c of ((haystack as { childNodes?: Stub[] }).childNodes ?? [])) {
    if (containsNode(c, needle)) return true;
  }
  return false;
}

test("t728g: a claimant read that never answers does not hold the refusal's focus recovery", async () => {
  // Delta review round 4, SHOULD-FIX [6] / NIT [4]. Round 1's N8 fix exists because `busy`
  // disables the Attach button UNDER the cursor, so a real browser drops focus to <body> and
  // re-enabling the control does not bring it back. Round 3 then put the claimant read — which
  // the code's own comment calls an upgrade that "must cost a link, not the dialog" — IN FRONT of
  // that recovery, bounded only by a 5 s timeout. A PostgREST worker that accepts the connection
  // and stalls therefore leaves a keyboard or screen-reader user inside an open modal with focus
  // on <body> for five seconds — and longer still, because `getRows` awaits
  // `session.getAccessToken()` BEFORE the signal ever reaches the wire (lib/read.ts), so a stalled
  // token refresh is outside the timeout altogether. The composer solved this by moving the read
  // into an effect; this cell holds the dialog to the same answer, with a read that NEVER settles.
  let armed: AbortSignal | null = null;
  const h = await renderComponent(
    App({
      attach: async () => ({ kind: "source_conflict" }),
      findEntry: ((_documentId: string, opts?: { signal?: AbortSignal }) => {
        armed = opts?.signal ?? null;
        return new Promise(() => {});
      }) as never,
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);

    // The refusal is on screen and the controls are live, with the claimant read still outstanding.
    assert.match(bodyText(), /already backs another posted entry/,
      "the refusal paints while the claimant read is still in flight");
    // …and focus is back on the one control this refusal asks them to change, NOW — not in 5 s.
    // `assert.ok(a === b)`, never `assert.equal`: the house harness's stub nodes are cyclic, and
    // node-assert's diff of two of them exhausts the heap (apps/web AGENTS.md's own note).
    const active = activeElement();
    assert.ok(active === selectIn(),
      "focus is on the document chooser immediately after the refusal, not parked on <body> for the "
      + `length of an advisory read (active element was ${String((active as { tagName?: string } | null)?.tagName ?? "none")})`);
    assert.ok(armed !== null, "the claimant read is armed with an AbortSignal (vacuity control)");
    assert.equal((armed as AbortSignal).aborted, false, "…which is still live while the refusal stands");
    // No link yet — nothing has named the claimant — but that costs a link, not the focus.
    assert.equal(
      findIn(bodyNode(), (n) => n.tagName === "A"
        && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY)),
      null,
      "the link waits for the claimant; the person's place in the dialog does not");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728g: the dialog's source_conflict refusal is ONE alert, and its text does not change when the claimant lands", async () => {
  // The other half of finding [7], on this surface. `StateBanner tone="error"` computes
  // `role="alert"`, and the dialog's claimant arrives strictly after the paint — so writing the
  // claimant sentence and the <Link> INTO that box announces one refusal twice. The alert carries
  // the refusal and nothing else; the claimant line and its link are a plain sibling with no role.
  let release: ((v: { entryId: string; clientId: string; clientName: string | null }) => void) | null = null;
  const h = await renderComponent(
    App({
      attach: async () => ({ kind: "source_conflict" }),
      findEntry: (() => new Promise((resolve) => { release = resolve; })) as never,
    }),
  );
  try {
    await openDialog(h);
    await choose(h, DOCUMENTS[0]!.documentId);
    await pressAttach(h);

    const before = liveRegionsIn(bodyNode());
    assert.equal(before.length, 1,
      `one refusal owns exactly one announcement — found ${before.length}: `
      + JSON.stringify(before.map((n) => textOf(n as never))));
    const spoken = textOf(before[0]! as never);
    assert.match(spoken, /already backs another posted entry/,
      "…and it is the refusal that is announced (vacuity control)");

    await h.act(() => { release!({ entryId: OTHER_ENTRY, clientId: OTHER_CLIENT, clientName: "Beta Sdn Bhd" }); });
    await drain(h);

    const after = liveRegionsIn(bodyNode());
    assert.equal(after.length, 1,
      `still exactly one announcement after the claimant resolves — found ${after.length}: `
      + JSON.stringify(after.map((n) => textOf(n as never))));
    assert.equal(textOf(after[0]! as never), spoken,
      "the ALERT's own text is unchanged by the claimant read — an assertive region rewritten after "
      + `paint is a second interruption for one refusal (was ${JSON.stringify(spoken)}, now `
      + `${JSON.stringify(textOf(after[0]! as never))})`);

    assert.match(bodyText(), /Beta Sdn Bhd/,
      "the claimant sentence still renders (vacuity control for the assertion above)");
    const link = findIn(bodyNode(), (n) => n.tagName === "A"
      && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY));
    assert.ok(link, "…and so does the link");
    assert.equal(containsNode(after[0]!, link as Stub), false,
      "the late link sits OUTSIDE the alert: inserting a node into an assertive region re-announces it");
  } finally {
    await h.unmount();
    await drain(h);
  }
});

test("t728g: the claimant read is abandoned by its own TIMEOUT, not only by closing the dialog", async () => {
  // Delta review round 4, NIT [8]. `AbortSignal.timeout(CLAIMANT_READ_TIMEOUT_MS)` was the bound
  // round 3 added here, and no cell exercised it firing: the existing cells hand `findEntry` a
  // stub that never reads `opts.signal`, so deleting the `signal:` property kept everything green
  // and the branch could drift back to a read that holds a fetch for the tab's lifetime. This
  // cell moves the clock instead of waiting on it, and asserts what a person is left with.
  let armed: AbortSignal | null = null;
  const realSetTimeout = globalThis.setTimeout;
  const timers: Array<() => void> = [];
  (globalThis as { setTimeout: unknown }).setTimeout = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms === 5000) {
      timers.push(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return (realSetTimeout as (...a: unknown[]) => unknown)(fn, ms, ...rest) as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  try {
    const h = await renderComponent(
      App({
        attach: async () => ({ kind: "source_conflict" }),
        findEntry: ((_documentId: string, opts?: { signal?: AbortSignal }) => {
          armed = opts?.signal ?? null;
          return new Promise(() => {});
        }) as never,
      }),
    );
    try {
      await openDialog(h);
      await choose(h, DOCUMENTS[0]!.documentId);
      await pressAttach(h);

      assert.equal(timers.length, 1,
        `the claimant read arms exactly one 5000 ms abort timer — found ${timers.length}`);
      assert.ok(armed !== null, "…and the read is armed with the signal that timer fires");
      assert.equal((armed as AbortSignal).aborted, false, "…which is live while the read is outstanding");

      await h.act(() => { timers[0]!(); });
      await drain(h);

      assert.equal((armed as AbortSignal).aborted, true,
        "the timeout ABORTS the read — without it the fetch outlives the dialog and the banner waits "
        + "for a link that will never come");
      assert.match(bodyText(), /already backs another posted entry/,
        "the refusal still stands after the read is abandoned");
      assert.equal(
        findIn(bodyNode(), (n) => n.tagName === "A"
          && String((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href") ?? "").includes(OTHER_ENTRY)),
        null,
        "…and no link was invented for a claimant nobody read");
      assert.ok(activeElement() === selectIn(),
        "…and focus was never the timeout's hostage: it was restored when the refusal painted");
    } finally {
      await h.unmount();
      await drain(h);
    }
  } finally {
    (globalThis as { setTimeout: unknown }).setTimeout = realSetTimeout;
  }
});
