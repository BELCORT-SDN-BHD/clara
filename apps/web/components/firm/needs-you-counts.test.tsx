// #903 (item 1) — `NeedsYouCounts`'s own header comment said the live envelope carries EIGHT
// counts; it renders NINE chips (the ninth, `work_questions`, was added by #629 after that
// comment was written). This file pins the chip count so a stale comment cannot recur silently.
//
// STD-04 (code-review fix round) — this file used to ALSO source-pin the header comment's own
// prose (readFileSync + a regex on "EIGHT counts"/"NINE counts"). Dropped: `903.chips` below
// already renders the real component and counts its real output, which is a strictly stronger,
// behavioural proof that the comment's claim ("nine counts") is true — a prose assertion added
// nothing 903.chips didn't already cover, and it broke on a wording-only edit with zero behaviour
// change (the /tdd side-channel anti-pattern: "the test breaks when you refactor but behavior
// hasn't changed"). Unlike document-kind-labels.test.tsx's [878] source-pin (justified there by a
// stated, specific constraint — Base UI's Select popup mounts lazily and no test here drives one
// open), nothing about a header COMMENT's wording is unobservable through the DOM.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { NeedsYouCounts } from "./needs-you-counts";
import type { ReviewQueueCounts } from "../../lib/firm/needs-you";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = { childNodes?: Stub[] };

const COUNTS: ReviewQueueCounts = {
  ready: 1,
  needs_review: 2,
  needs_you: 3,
  open_drafts: 4,
  open_questions: 5,
  open_tasks: 6,
  compliance_watches: 7,
  lint_findings: 8,
  work_questions: 9,
};

function app(node: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: node });
}

test("903.chips — the live envelope's counts render as exactly NINE chips, one per key", async () => {
  const h = await renderComponent(app(createElement(NeedsYouCounts, { counts: COUNTS })));
  try {
    const badges = ((h.container as Stub).childNodes?.[0]?.childNodes ?? []) as Parameters<typeof textOf>[0][];
    assert.equal(badges.length, 9, "one chip per ReviewQueueCounts key, work_questions included");
    const badgeTexts = badges.map(textOf);
    for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      assert.ok(badgeTexts.some((t) => t.trim().endsWith(`: ${value}`)),
        `chip for count ${value} must render; got ${JSON.stringify(badgeTexts)}`);
    }
  } finally {
    await h.unmount();
  }
});
