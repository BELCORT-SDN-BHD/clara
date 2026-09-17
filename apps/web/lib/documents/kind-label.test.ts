// #633 AC2 — the 20 `document_kind` values plus null/unclassified, each rendered
// DISTINCTLY and none of them as a raw DB enum string.
//
// This file exists to overturn a WRITTEN decision by name: `lib/documents/copy.ts:115-119`
// declared that `document_kind` is "itself a DB-owned enum string … not chrome prose" and
// that there is "no fixed enumeration of kinds worth a full key set (DOCUMENT_KINDS already
// has 20 members)". The enumeration is fixed (`documents_document_kind_check`, 0123:2056-2061,
// mirrored verbatim in `types.ts`'s DOCUMENT_KINDS), and 20 members is an argument FOR a key
// set, not against one — `document-admin.tsx:77` was rendering `ssm_company_doc` at a
// professional.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DOCUMENT_KINDS } from "./types";
import {
  KIND_LABEL_KEYS, KIND_UNCLASSIFIED_KEY, KIND_UNRECOGNISED_KEY, isDocumentKind, kindLabel,
} from "./kind-label";
import messages from "../../messages/en.json";

const CD = (messages as { ClientDocuments: Record<string, unknown> }).ClientDocuments;

test("kindLabel: the key set is EXACTLY DOCUMENT_KINDS + unclassified + unrecognised — no kind is missing and none is invented", () => {
  const expected = [
    ...DOCUMENT_KINDS.map((k) => `kind.${k}`),
    KIND_UNCLASSIFIED_KEY,
    KIND_UNRECOGNISED_KEY,
  ].sort();
  assert.deepEqual([...KIND_LABEL_KEYS].sort(), expected);
  assert.equal(KIND_LABEL_KEYS.length, DOCUMENT_KINDS.length + 2);
});

test("kindLabel: every one of the 20 kinds resolves to its OWN key (distinctly renderable — AC2)", () => {
  const seen = new Set<string>();
  for (const kind of DOCUMENT_KINDS) {
    const label = kindLabel(kind);
    assert.equal(label.key, `kind.${kind}`);
    assert.equal(label.params, undefined);
    assert.equal(seen.has(label.key), false, `two kinds share one key: ${label.key}`);
    seen.add(label.key);
  }
  assert.equal(seen.size, 20);
});

test("kindLabel: null / undefined / empty is the NAMED 'Needs classification' state, not an absent one", () => {
  for (const absent of [null, undefined, "", "   "]) {
    assert.deepEqual(kindLabel(absent), { key: KIND_UNCLASSIFIED_KEY });
  }
});

test("kindLabel: an unrecognised value never reaches the DOM as a bare enum — it is carried INSIDE a named sentence", () => {
  const label = kindLabel("some_future_kind");
  assert.equal(label.key, KIND_UNRECOGNISED_KEY);
  assert.deepEqual(label.params, { value: "some_future_kind" });
  // The honest-unknown arm must never borrow another kind's phrase.
  assert.notEqual(label.key, KIND_UNCLASSIFIED_KEY);
});

test("isDocumentKind: exactly the 20 live CHECK values", () => {
  for (const kind of DOCUMENT_KINDS) assert.equal(isDocumentKind(kind), true);
  for (const nope of ["", "invoice ", "INVOICE", "some_future_kind", null, undefined, 7]) {
    assert.equal(isDocumentKind(nope), false, `${String(nope)} must not pass`);
  }
});

test("every key this module can emit EXISTS in messages/en.json under ClientDocuments (message-key law)", () => {
  const kindGroup = CD.kind as Record<string, string> | undefined;
  assert.ok(kindGroup && typeof kindGroup === "object", "ClientDocuments.kind namespace is missing");
  for (const key of KIND_LABEL_KEYS) {
    const leaf = key.slice("kind.".length);
    assert.equal(typeof kindGroup[leaf], "string", `missing message ClientDocuments.${key}`);
    assert.notEqual((kindGroup[leaf] ?? "").trim(), "", `blank message ClientDocuments.${key}`);
  }
});

test("no rendered label is the raw enum spelling (AC2: 'render all document_kind values distinctly', not echo them)", () => {
  const kindGroup = CD.kind as Record<string, string>;
  for (const kind of DOCUMENT_KINDS) {
    assert.notEqual(kindGroup[kind], kind, `ClientDocuments.kind.${kind} is the raw enum string`);
    assert.equal(/^[a-z_]+$/.test(kindGroup[kind] ?? ""), false, `ClientDocuments.kind.${kind} reads as a snake_case enum`);
  }
  // Distinct phrases, not one shared word.
  const phrases = DOCUMENT_KINDS.map((k) => kindGroup[k]);
  assert.equal(new Set(phrases).size, phrases.length, "two kinds share one phrase");
});
