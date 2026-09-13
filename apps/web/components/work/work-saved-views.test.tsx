// #641 fix round — THE SAVED-VIEW CAPS, mirrored from 0189 and said in words.
//
// WHY THIS FILE EXISTS. `clara.save_my_preferences`'s `interface.workViews` arm accepts an array
// of AT MOST 20 views, each with a `query` of at most 512 characters, and refuses everything else
// under the single field path `interface.workViews` — one taxonomy, which is right for a wire
// contract and useless as a sentence to a person. The first cut of this component mirrored the
// door's SHAPES (a 64-character name, unique ids) but not its SIZES, so a twenty-first save and an
// over-long filter set both surfaced the generic "That view could not be saved" banner: a refusal
// the person could not act on, for a rule nothing on screen had ever stated.
//
// THE SHARPEST CELLS ARE THE ONES THAT ASSERT NO WRITE WAS MADE, and that the naming form never
// opened. A guard that showed the right sentence and still asked somebody to name a view it was
// going to refuse would be a politer version of the same defect.
//
// THE TWO DOORS ARE INJECTED (`loadPreferences`/`savePreferences`), so no cell here reaches a
// socket; `packages/db/tests/work-list.test.mjs` wl.25 owns the half where the database enforces
// the same two numbers.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import type { MyPreferences, WorkSavedView } from "../../lib/settings/preferences";
import { parseWorkListUrlState } from "../../lib/work/work-list-url-state";
import { WorkSavedViews } from "./work-saved-views";

enableDomInspection();

type Harness = Awaited<ReturnType<typeof renderComponent>>;

function prefs(views: WorkSavedView[]): MyPreferences {
  return { version: 3, interface: { workViews: views }, notifications: {}, updatedAt: null };
}

function App(opts: {
  search: string;
  views: WorkSavedView[];
  save: (version: number, views: WorkSavedView[], opKey: string) => Promise<MyPreferences>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      PathnameContext.Provider as never,
      { value: "/work" as never },
      createElement(WorkSavedViews, {
        state: parseWorkListUrlState(new URLSearchParams(opts.search)),
        loadPreferences: async () => prefs(opts.views),
        savePreferences: opts.save,
      }),
    ),
  });
}

const buttonNamed = (h: Harness, label: string) =>
  h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n) === label);

const nameField = (h: Harness) =>
  h.find((n) => (n as { getAttribute?: (k: string) => string | null })
    .getAttribute?.("id") === "work-save-view-name");

/** Invoke the naming form's OWN submit handler. The stub DOM has no native form submission, so a
 *  click on a `type="submit"` button reports success and reaches nothing — the measured hazard
 *  `components/clara/onboarding-progress-sync.test.tsx` records for the same shape. The submit
 *  control's live `disabled` is asserted FIRST, so this can never manufacture a green on a gate
 *  that would have stopped a person. */
async function submitNamingForm(h: Harness): Promise<void> {
  const submit = buttonNamed(h, "Save view");
  assert.ok(submit, "the naming form carries its Save control");
  assert.equal((submit as unknown as { disabled?: boolean }).disabled, false,
    "assert the gate, then act: a named view must enable Save");
  const form = h.find((n) => (n as { tagName?: string }).tagName === "FORM");
  assert.ok(form, "the naming form is a real form");
  const propsKey = Object.keys(form as object).find((k) => k.startsWith("__reactProps"));
  const onSubmit = propsKey
    ? (form as unknown as Record<string, { onSubmit?: (e: unknown) => unknown }>)[propsKey]?.onSubmit
    : undefined;
  assert.ok(onSubmit, "…carrying the real submit handler");
  await h.act(async () => {
    await onSubmit({ preventDefault() {}, stopPropagation() {}, target: form, currentTarget: form });
  });
  await h.settle();
}

const view = (i: number): WorkSavedView => ({
  id: `view-${i}`, name: `View ${i}`, query: `status=failed&q=v${i}`,
});

test("the twenty-first save is refused HERE, in words, and no naming form and no write follow", async () => {
  let writes = 0;
  const h = await renderComponent(App({
    // A filter set that is not already one of the twenty, so the control is offered at all.
    search: "q=rent",
    views: Array.from({ length: 20 }, (_, i) => view(i)),
    save: async (_version, views) => { writes += 1; return prefs(views); },
  }));
  try {
    await h.settle();
    const save = buttonNamed(h, "Save this view");
    assert.ok(save, "the control is still offered — the cap is explained, not hidden");
    await h.act(async () => { await clickButton(save as never); });
    await h.settle();

    assert.equal(writes, 0, "a write the door would refuse is never sent");
    assert.equal(nameField(h), null, "nobody is asked to name a view that cannot be stored");
    const text = h.text();
    assert.match(text, /You already have 20 saved views/);
    assert.match(text, /Remove one before saving another/);
    assert.doesNotMatch(text, /That view could not be saved/,
      "the generic banner is exactly what this guard exists to replace");
  } finally {
    await h.unmount();
  }
});

test("a filter set too long to store is refused by LENGTH, naming the limit", async () => {
  let writes = 0;
  // 0189 caps a view's whole `query` at 512 characters; `q=` plus 520 characters of search text is
  // over it before any other axis is counted.
  const h = await renderComponent(App({
    search: `q=${"r".repeat(520)}`,
    views: [],
    save: async (_version, views) => { writes += 1; return prefs(views); },
  }));
  try {
    await h.settle();
    const save = buttonNamed(h, "Save this view");
    assert.ok(save);
    await h.act(async () => { await clickButton(save as never); });
    await h.settle();

    assert.equal(writes, 0, "a write the door would refuse is never sent");
    assert.equal(nameField(h), null);
    assert.match(h.text(), /too long to save as a view \(the limit is 512 characters\)/);
  } finally {
    await h.unmount();
  }
});

test("a lawful save under both caps goes through, storing the CANONICAL query and keeping the rest", async () => {
  const seen: WorkSavedView[][] = [];
  const h = await renderComponent(App({
    search: "status=failed,awaiting_input&q=rent&cursor=page3",
    views: [view(1)],
    save: async (_version, views) => { seen.push(views); return prefs(views); },
  }));
  try {
    await h.settle();
    const save = buttonNamed(h, "Save this view");
    assert.ok(save, "a lawful filter set offers the control");
    await h.act(async () => { await clickButton(save as never); });
    await h.settle();

    const field = nameField(h);
    assert.ok(field, "…and the guard does not stand in the way of the naming form");
    await h.act(() => setFieldValue(field, "Rent trouble"));
    await submitNamingForm(h);

    assert.equal(seen.length, 1, "one write, for one save");
    const saved = seen[0]!;
    assert.equal(saved.length, 2, "the existing view is preserved beside the new one");
    assert.equal(saved[1]!.name, "Rent trouble");
    assert.equal(saved[1]!.id, "rent-trouble", "the id is derived from the name");
    // The canonical spelling: axes in a fixed order, list values sorted, and NO cursor — a view
    // that remembered page 3 would open on a fence into a result set that has since changed.
    assert.equal(saved[1]!.query, "status=awaiting_input%2Cfailed&q=rent");
  } finally {
    await h.unmount();
  }
});
