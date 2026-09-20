// #633 AC2, the DOM half — NO RAW `document_kind` ENUM REACHES A PROFESSIONAL.
//
// `lib/documents/kind-label.test.ts` pins the key set and the message file. This file
// pins the three surfaces that were rendering the enum token itself before #633:
//   * the detail surface's classify control — every SelectItem was `{k}`, so it offered
//     "ssm_company_doc" and "e_invoice_xml" as choices. AT WAVE INTEGRATION that control
//     MOVED: #646 lifted it out of `document-admin.tsx` into its own exported
//     `document-kind-dialog.tsx` (so #633's list/receipt entrance can mount the same
//     component), and #633's phrase graft moved with it. The two cells below therefore
//     drive `DocumentKindDialog`, which is where that Select and that `kindCurrent` line
//     live today — same properties, same surface, new file;
//   * the same control's `kindCurrent` line, interpolating `doc.document_kind` raw;
//   * `document-metadata.tsx`'s `documentKind` badge, via `copy.ts`'s own
//     `badgeLabel` arm that returned `badge.value` verbatim — the arm whose comment
//     (`copy.ts:115-119`) is the WRITTEN DECISION this ticket overturns by name.
//
// The assertion is deliberately structural rather than a list of expected phrases: a
// snake_case token anywhere in the rendered text of these components is the defect,
// whatever its spelling. `assertNoRawKind` therefore scans for EVERY member of
// DOCUMENT_KINDS that contains an underscore (the 14 that are self-evidently machine
// spellings) plus the single-word ones matched whole-word — "invoice" as a bare word
// is the enum, "Invoice" and "e-Invoice (XML)" are prose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { DocumentKindDialog } from "./document-kind-dialog";
import { DocumentMetadata } from "./document-metadata";
import { DOCUMENT_KINDS } from "../../lib/documents/types";
import messages from "../../messages/en.json";

enableDomInspection();

const DOC = {
  id: "d1111111-1111-4111-8111-111111111111",
  sha256: "a".repeat(64),
  original_filename: "ssm-form-24.pdf",
  mime_type: "application/pdf",
  byte_size: 20480,
  storage_path: "docs/pdf",
  uploaded_by: "u1",
  created_at: "2026-04-01T00:00:00Z",
  bytes_verified_at: "2026-04-01T00:00:01Z",
  page_count: 1,
  extraction_status: "done" as const,
  document_kind: "ssm_company_doc",
  financial_date: null,
  retention_state: "unanchored" as const,
  retain_until: null,
  retention_basis: null,
  legal_hold: false,
  legal_hold_reason: null,
};

function wrap(node: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children: node,
  });
}

/** Every DB spelling that must never survive to the rendered text. */
function assertNoRawKind(text: string, where: string): void {
  for (const kind of DOCUMENT_KINDS) {
    if (kind.includes("_")) {
      assert.equal(text.includes(kind), false, `${where}: the raw enum "${kind}" reached the DOM`);
    }
  }
}

type Node_ = { tagName?: string; childNodes?: Node_[]; getAttribute?: (k: string) => string | null };

function body(): Node_ {
  return (globalThis as unknown as { document: { body: Node_ } }).document.body;
}

/** Mount `DocumentKindDialog` for one document and OPEN it. The dialog PORTALS, so its
 *  contents live under `document.body` rather than the render container — the idiom
 *  `document-revision-dialog.test.tsx` established for the same primitive. */
async function openKindDialog(currentKind: string | null): Promise<{
  h: Awaited<ReturnType<typeof renderComponent>>; b: Node_; text: () => string; close: () => Promise<void>;
}> {
  const h = await renderComponent(wrap(createElement(DocumentKindDialog, {
    documentId: DOC.id, currentKind, busy: false, act: async () => true,
  })));
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  const trigger = h.find((n) => n.tagName === "BUTTON" && /^Set kind$/.test(textOf(n)));
  assert.ok(trigger, "the kind-change trigger must render");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 6; i++) await h.settle();
  return {
    h, b,
    text: () => textOf(b as never),
    close: async () => {
      await h.unmount();
      const el = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
      if (el.childNodes?.includes(h.container)) el.removeChild(h.container);
    },
  };
}

test("the detail surface's classify Select offers 20 PHRASES, never the DB enum tokens", async () => {
  const d = await openKindDialog("ssm_company_doc");
  try {
    const text = d.text();
    assertNoRawKind(text, "DocumentKindDialog");
    // Non-vacuity: the control really did render. `@base-ui` renders the option list
    // lazily, so assert on the ONE kind the current line always shows.
    assert.match(text, /SSM company document/, "the current kind must render as its phrase");
  } finally {
    await d.close();
  }
});

test("every one of the 20 kinds renders as its own phrase in the classify control's option list", async () => {
  // Drives the option list directly through the shared label module rather than
  // through @base-ui's lazily-mounted popup: the DOM assertion above proves the
  // component consumes the module, and this proves the module covers the roster.
  const { kindLabel } = await import("../../lib/documents/kind-label");
  const cd = (messages as { ClientDocuments: { kind: Record<string, string> } }).ClientDocuments.kind;
  const rendered = DOCUMENT_KINDS.map((k) => cd[kindLabel(k).key.slice("kind.".length)]);
  assert.equal(rendered.every((p) => typeof p === "string" && p.length > 0), true, "a kind has no phrase");
  assert.equal(new Set(rendered).size, DOCUMENT_KINDS.length, "two kinds share one phrase");
});

test("DocumentMetadata's kind badge renders the phrase, not the enum (copy.ts:115-119 overturned)", async () => {
  const h = await renderComponent(wrap(createElement(DocumentMetadata, {
    document: DOC, tasks: [], clientId: "c1111111-1111-4111-8111-111111111111",
  })));
  try {
    const text = h.text();
    assertNoRawKind(text, "DocumentMetadata");
    assert.match(text, /SSM company document/, "the kind badge must render as its phrase");
  } finally {
    await h.unmount();
  }
});

test("an UNCLASSIFIED document names that state on the detail surface — never a blank badge", async () => {
  const d = await openKindDialog(null);
  try {
    const text = d.text();
    assert.match(text, /Needs classification/, "a null kind must render as the NAMED state");
    assert.equal(text.includes("unclassified"), false, "the raw word 'unclassified' is not a phrase");
  } finally {
    await d.close();
  }
});

test("[633] fix round: the list/receipt classify control never offers a kind the door ALWAYS refuses", async () => {
  // Review finding 633-ADV-7. `clara.set_document_kind` raises CLR28 ("consent-evidence
  // classification is owned by the egress consent path") for `consent_evidence` on either
  // side of the change — measured on the #633 rig — so offering it here could only ever
  // produce an honest-but-useless refusal. The audited path is
  // `classifyConsentEvidenceDocument` (`lib/documents/doors.ts:189`), owner-floored.
  //
  // The DETAIL surface's own classify Select (`document-kind-dialog.tsx` since #646 moved it
  // out of `DocumentAdmin`) offered the full roster at the time this cell was written; #633
  // recorded that on purpose as an observation it would not change. #878 re-opened it — see
  // the next test — and the dialog now imports this SAME constant rather than the full
  // `DOCUMENT_KINDS`, so there is exactly one roster, not two.
  const { CLASSIFIABLE_DOCUMENT_KINDS } = await import("./document-kind-control");
  assert.equal(CLASSIFIABLE_DOCUMENT_KINDS.includes("consent_evidence" as never), false,
    "a kind the door always refuses must not be offered");
  // Non-vacuity: everything ELSE the roster carries is still offered — this is a single
  // named exclusion, not a quietly narrowed vocabulary.
  assert.deepEqual(
    [...CLASSIFIABLE_DOCUMENT_KINDS].sort(),
    DOCUMENT_KINDS.filter((k) => k !== "consent_evidence").sort(),
  );
  assert.equal(CLASSIFIABLE_DOCUMENT_KINDS.length, DOCUMENT_KINDS.length - 1);
});

test("[878] the DETAIL surface's classify Select also stops offering a kind the door always refuses", async () => {
  // The DOM idiom above cannot enumerate a live option list — `@base-ui`'s Select popup is
  // Portal + Positioner (floating-ui) backed and mounts lazily, and no test anywhere in this
  // repo drives one open (`grep -rl "select-item\|SelectItem" apps/web --include=*.test.tsx`
  // returns only this file, and only as a source-text match, confirmed 2026-09-20 CRS-07-09
  // fix round). Opening a real Select popup here would need the same class of new harness
  // plumbing `test/domInspect.ts`'s own header describes abandoning for axe-core — floating-ui
  // positioning, not just the zero-geometry `getBoundingClientRect` stub that already lets
  // `@base-ui/react`'s Menu/Dialog backdrops mount — which is disproportionate build-out for
  // this one minor finding. The house proof for "which roster backs this Select", established
  // by the [633] fix-round cell above, is therefore the SOURCE the component actually imports:
  // one shared constant, never a second copy of the filter.
  const dialogSource = textOfFile("document-kind-dialog.tsx");
  assert.match(
    dialogSource,
    /import\s*\{\s*CLASSIFIABLE_DOCUMENT_KINDS\s*\}\s*from\s*"\.\/document-kind-control"/,
    "the dialog must import the SAME filtered roster the sibling list/receipt control exports, not re-derive it",
  );
  assert.match(
    dialogSource,
    /CLASSIFIABLE_DOCUMENT_KINDS\.map\(/,
    "the dialog's Select must map the filtered roster",
  );
  assert.doesNotMatch(
    dialogSource,
    /\bDOCUMENT_KINDS\.map\(/,
    "the dialog must not fall back to mapping the full, unfiltered roster",
  );
  // CRS-07-09 (code-review recheck) — the three assertions above prove the Select's OPTIONS
  // come from the filtered roster's `.map(...)`, but say nothing about a hand-written
  // `<SelectItem value="consent_evidence">` (or a `.flatMap`/spread that side-steps the single
  // `.map(` call) added elsewhere in the same file — that would leave every assertion above
  // green while the defect returned. This closes that gap directly: the literal string must
  // not appear ANYWHERE in the dialog's source, not merely absent from the mapped roster.
  assert.doesNotMatch(
    dialogSource,
    /consent_evidence/,
    "'consent_evidence' must not appear anywhere in the dialog's source — not just absent from the CLASSIFIABLE_DOCUMENT_KINDS.map(...) roster",
  );
});

function textOfFile(rel: string): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, rel), "utf8");
}
