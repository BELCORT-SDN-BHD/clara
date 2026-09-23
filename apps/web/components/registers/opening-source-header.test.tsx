// #986 — THE BASIS'S STATE SHOWS WHICH READING IT STANDS ON, AFTER THE MOMENT HAS PASSED.
//
// #986 AC2: the prior parse's targets "are retired and replaced … and the basis's state shows
// which". The retire-and-replace half is `clara.refresh_opening_targets_from_reread`'s and the
// database battery drives it. THIS half is the reader's: until it existed, the only record of a
// refresh was the 202 banner on the tab that ran it, held in component state and gone on reload.
// A colleague opening the basis an hour later saw a target set with nothing saying an earlier
// reading had been retired from under it — and the retired figures are exactly the kind of thing
// an approver has to know about before committing an opening position.
//
// THE COMPONENT MINTS NOTHING, which is this file's own standing rule: the counts and the date
// come off the receipt `clara.opening_target_refreshes` recorded, and the only arithmetic is
// `refreshes.length + 1`, because the FIRST reading leaves no receipt (it retired nothing).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import type { ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { OpeningSourceHeader } from "./opening-source-header";
import type {
  OpeningSeedRow, OpeningTargetRefreshRow, OpeningTbTargetRow,
} from "@/lib/registers/opening-types";

enableDomInspection();

const SEED = "55555555-6666-4777-8888-999999999999";
const DOC = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const TIED_SEED = {
  id: SEED,
  tie_document_id: DOC,
  tie_document_sha256: "abcdef0123456789".repeat(4),
} as unknown as OpeningSeedRow;

const TARGET = {
  id: "t1", seed_id: SEED, line_key: "r:1", account_code: "1000",
  provenance_kind: "document", debit_cents: 10500000, credit_cents: 0,
} as unknown as OpeningTbTargetRow;

const REFRESH = (over: Partial<OpeningTargetRefreshRow> = {}): OpeningTargetRefreshRow => ({
  id: "rf-1",
  seed_id: SEED,
  document_id: DOC,
  from_extraction_id: "ext-1",
  to_extraction_id: "ext-2",
  retired_count: 3,
  recorded_count: 5,
  refreshed_at: "2026-09-21T04:05:06Z",
  ...over,
});

function app(node: ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: node });
}

type Node = { getAttribute?: (k: string) => string | null };

async function drive(node: ReactElement, run: (h: Awaited<ReturnType<typeof renderComponent>>) => void) {
  const h = await renderComponent(app(node));
  try {
    await h.settle();
    run(h);
  } finally {
    await h.unmount();
  }
}

const refreshed = (h: { find: (p: (n: Node) => boolean) => unknown }) =>
  h.find((n) => n.getAttribute?.("data-testid") === "opening-source-refreshed");

test("opening.source-header — a basis that has never been refreshed says nothing about refreshes", async () => {
  await drive(
    createElement(OpeningSourceHeader, { seed: TIED_SEED, targets: [TARGET], refreshes: [] }),
    (h) => {
      assert.match(h.text(), /From the bound document/, "the provenance line is unchanged");
      assert.equal(refreshed(h), null,
        "a basis read once has no retired reading, and silence is the honest answer");
    },
  );
});

test("opening.source-header — ticket 986: a refreshed basis names the retirement, how many lines replaced how many, and how many readings it has stood on", async () => {
  await drive(
    createElement(OpeningSourceHeader, {
      seed: TIED_SEED, targets: [TARGET], refreshes: [REFRESH()],
    }),
    (h) => {
      assert.ok(refreshed(h), "the basis's own state carries the refresh, not only the banner that ran it");
      const text = h.text();
      assert.match(text, /stood on 2 readings/, "one refresh means two readings: the receipt records the second");
      assert.match(text, /on 2026-09-21/, "…and WHEN the reading it left was retired");
      assert.match(text, /replaced 3 line\(s\) with 5/,
        `both counts, because "3 replaced 3" and "3 replaced 5" are different facts about the document; got: ${text}`);
    },
  );
});

test("opening.source-header — the NEWEST receipt is the one named, and a second refresh moves the count on", async () => {
  await drive(
    createElement(OpeningSourceHeader, {
      seed: TIED_SEED,
      targets: [TARGET],
      // Newest first, exactly as `loadOpeningTargetRefreshes` orders them.
      refreshes: [
        REFRESH({ id: "rf-2", refreshed_at: "2026-09-22T00:00:00Z", retired_count: 5, recorded_count: 5 }),
        REFRESH(),
      ],
    }),
    (h) => {
      const text = h.text();
      assert.match(text, /stood on 3 readings/);
      assert.match(text, /on 2026-09-22/, "the NEWEST retirement, never the first one");
      assert.match(text, /replaced 5 line\(s\) with 5/);
      assert.doesNotMatch(text, /2026-09-21/, "a superseded receipt is not the basis's current state");
    },
  );
});

test("opening.source-header — a KEYED basis carries no refresh line at all: there is no document to read again", async () => {
  const keyedSeed = { id: SEED, tie_document_id: null, tie_document_sha256: null } as unknown as OpeningSeedRow;
  const keyedTarget = { ...TARGET, provenance_kind: "keyed" } as unknown as OpeningTbTargetRow;
  await drive(
    createElement(OpeningSourceHeader, {
      seed: keyedSeed, targets: [keyedTarget], refreshes: [REFRESH()],
    }),
    (h) => {
      assert.match(h.text(), /Keyed by a person of your firm/);
      assert.equal(refreshed(h), null,
        "the refresh door is the document lane's; a keyed basis must never be told a reading was retired");
    },
  );
});
