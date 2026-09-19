// #903 (item 1) — `NeedsYouCounts`'s own header comment said the live envelope carries EIGHT
// counts; it renders NINE chips (the ninth, `work_questions`, was added by #629 after that
// comment was written). This file pins the chip count so a stale comment cannot recur silently,
// and source-pins the comment text itself so it cannot drift from the render again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { NeedsYouCounts } from "./needs-you-counts";
import type { ReviewQueueCounts } from "../../lib/firm/needs-you";
import messages from "../../messages/en.json";

enableDomInspection();

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
    const badges = (h.container.childNodes?.[0]?.childNodes ?? []) as Parameters<typeof textOf>[0][];
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

test("903.comment — the component's own header states the CURRENT chip count, not a stale one", async () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(dir, "needs-you-counts.tsx"), "utf8");
  assert.doesNotMatch(source, /EIGHT counts, not six/i,
    "the FIX-4 comment's stale count ('eight') must not survive — nine chips render today");
  assert.match(source, /NINE counts/i, "the comment must name the count that actually renders");
});
