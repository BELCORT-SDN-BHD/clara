// Synthetic 15-cell runner used only by binding-pr-3-post-time-gate.test.mjs to pin Node's
// observable skip/hook/test failure classes. It lives outside tests/ so the package's bare
// directory argument cannot collect its deliberately failing sentinel cells.

import { before, test } from "node:test";
import {
  decideBindingPr3Gate,
  readBindingPr3Migration,
  readBindingPr3PrePin,
} from "../tests/binding-pr-3-post-time-gate.mjs";

const decision = decideBindingPr3Gate({
  prosrcSha: process.env.CLARA_BINDING_PR3_GATE_PROBE_SHA ?? null,
  prePin: readBindingPr3PrePin(),
  preload: process.env.CLARA_BINDING_PR3_GATE_PROBE_PRELOAD,
});
const reason = `named pre-integration skip: ${readBindingPr3Migration().basename}`;

before(() => {
  if (decision === "fail") throw new Error("focused PR-3 run saw the exact pre-image");
});

for (let i = 1; i <= 15; i += 1) {
  test(`bpr3-probe.${String(i).padStart(2, "0")}`, (t) => {
    if (decision === "skip") { t.skip(reason); return; }
    throw new Error("behavioural sentinel: this cell executed");
  });
}
