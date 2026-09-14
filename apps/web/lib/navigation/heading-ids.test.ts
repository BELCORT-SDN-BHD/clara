// #733's sweep, the three remaining pages — the `<h1>` id each of them renders.
//
// WHAT THESE CELLS CAN AND CANNOT SEE, stated first so a green here is not read as
// more than it is. The defect this sweep closes lives at the RSC boundary, and this
// harness has no RSC bundler: `import { X } from "<a use client module>"` resolves to
// the real string here whatever the boundary would have done in a real build. So the
// cells below fence the two halves that ARE checkable from here — that every page
// takes its id from the plain module (a source-level claim, the same instrument
// `tests/parity-holes.test.ts` uses for its own cross-file rules), and that the id
// reaches the rendered `<h1>` as the literal string. The browser leg for the third
// half — that the id survives into the real server-rendered document — is
// `e2e/journal-work-walk.spec.ts:655` (`#work-detail-heading` takes focus),
// `e2e/activity-feed-walk.spec.ts` and `e2e/operator-support-walk.spec.ts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { PageHeader } from "../../components/common/page-shell";
import { ACTIVITY_HEADING_ID, OPERATOR_HEADING_ID, WORK_HEADING_ID } from "./heading-ids";

enableDomInspection();

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The subset of the mounted stub node these cells read — installed by `enableDomInspection`. */
type El = { getAttribute(name: string): string | null; querySelectorAll(selector: string): El[] };

const PAGES: Array<[surface: string, page: string, constant: string, id: string]> = [
  ["/activity", "app/(firm)/activity/page.tsx", "ACTIVITY_HEADING_ID", ACTIVITY_HEADING_ID],
  ["/clients/:clientId/work/:workId", "app/(firm)/clients/[clientId]/work/[workId]/page.tsx", "WORK_HEADING_ID", WORK_HEADING_ID],
  ["/operator", "app/(firm)/operator/page.tsx", "OPERATOR_HEADING_ID", OPERATOR_HEADING_ID],
];

for (const [surface, page, constant, id] of PAGES) {
  test(`${surface}: its page takes ${constant} from the plain module, never across a "use client" boundary`, () => {
    const source = readFileSync(join(WEB_ROOT, page), "utf8");
    // The page renders it, so it must have it as a real string on the SERVER.
    assert.match(source, new RegExp(`headingId=\\{${constant}\\}`), `${page} must render the id on its <h1>`);
    assert.match(
      source,
      new RegExp(`import \\{ ${constant} \\} from "@/lib/navigation/heading-ids";`),
      `${page} must import ${constant} from the plain module — a "use client" module hands the server a client reference, not the string`,
    );
    const clientImport = new RegExp(`import \\{[^}]*\\b${constant}\\b[^}]*\\} from "@/components/`);
    assert.doesNotMatch(source, clientImport, `${page} must not import ${constant} from a client component`);
  });

  test(`${surface}: the rendered <h1> carries the string "${id}", and is focusable`, async () => {
    const h = await renderComponent(createElement(PageHeader, { title: surface, headingId: id }));
    try {
      const headings = (h.container as unknown as El).querySelectorAll("h1");
      assert.equal(headings.length, 1, "one <h1> per page header");
      assert.equal(headings[0]!.getAttribute("id"), id);
      // An <h1> is not focusable without it, so the id alone would be a dead address.
      assert.equal(headings[0]!.getAttribute("tabIndex") ?? headings[0]!.getAttribute("tabindex"), "-1");
    } finally {
      await h.unmount();
    }
  });
}

test("the three ids are plain distinct string literals — one home, one spelling each", () => {
  const ids = [ACTIVITY_HEADING_ID, WORK_HEADING_ID, OPERATOR_HEADING_ID];
  for (const id of ids) assert.equal(typeof id, "string");
  assert.equal(new Set(ids).size, 3);
});
