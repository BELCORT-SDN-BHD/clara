// components/bank/matching-residual.tsx — #657 AC7.
//
// The residual is a PREVIEW and the component must say so. Two things are asserted:
//   1. it recomputes on every selection change (a stale residual is worse than none — it tells
//      a human a group ties when it no longer does);
//   2. it never claims to be the authority. The tie identity is the DEFERRED constraint trigger
//      `clara._tf_bank_match_group_tie()` (0038:3249, live arm :3314-3326), and the copy names
//      the database. A cell on the WORDS is deliberate: this is the one place the surface could
//      quietly teach a human to trust the wrong thing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { MatchingResidual } from "./matching-residual";
import messages from "../../messages/en.json";

function mount(lineCents: number, entryCents: number, adjustmentCents = 0) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(MatchingResidual, { lineCents, entryCents, adjustmentCents }),
    }),
  );
}

test("p657.web.residual · the residual recomputes on every selection change and reports a one-cent difference AS a difference", async () => {
  const ties = await mount(-1500, -1500);
  try {
    assert.match(ties.text(), /RM 0\.00/, "a tying group shows a zero residual");
    assert.match(ties.text(), /This group ties\./);
  } finally {
    await ties.unmount();
  }

  // The one-cent difference AS a difference (AC11): the only token the estate carries for this
  // today is `amount_beyond_tolerance`, raised by the deferred tie trigger AFTER submission.
  // Seeing it before submitting is the whole point of this line.
  const offByOne = await mount(-1500, -1499);
  try {
    assert.match(offByOne.text(), /-?RM 0\.01/, "a one-cent difference renders as one cent, not as 'does not tie' alone");
    assert.match(offByOne.text(), /This group does not tie yet\./);
  } finally {
    await offByOne.unmount();
  }

  // A second selection changes the number — the component is pure in its inputs, so a re-mount
  // with different props is exactly what a selection change produces.
  const twoLines = await mount(-3000, -1500);
  try {
    assert.match(twoLines.text(), /-?RM 15\.00/, "adding a second line moves the residual");
  } finally {
    await twoLines.unmount();
  }
});

test("p657.web.residual · the adjustment term is shown even though it is always zero on this lane, and the database is named as the authority", async () => {
  const h = await mount(-1500, -1400, 0);
  try {
    const text = h.text();
    assert.match(text, /adjustments =/, "the adjustment term is rendered rather than silently dropped — a residual missing a term cannot be checked");
    assert.match(
      text,
      /The database enforces the tie when you submit; this figure is a preview\./,
      "the copy names the DATABASE as the authority; this component's arithmetic is a preview and must never read as the rule",
    );
  } finally {
    await h.unmount();
  }
});
