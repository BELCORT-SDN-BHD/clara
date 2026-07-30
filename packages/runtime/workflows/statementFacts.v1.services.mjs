// The injected service bundle for statementFacts_v1 (Wave C-b design §4.3 / part2 §5).
// INFRASTRUCTURE — NOT frozen; assembled here and injected into
// globalThis.__claraStatementFactsServices by the supervisor (plugins/startWorld.ts),
// exactly as makeInvoiceFactsServices() is for the invoice lane.
//
// WHAT IS AND IS NOT IN THE FROZEN CLOSURE, and why the line sits here. The frozen closure
// (statementFacts.v1.ts / .impl.ts / .behavior.mjs) owns ORCHESTRATION and AUTHORIZATION:
// which lane runs, that the typed dispatch wraps only the vendor call, that a transient
// fault retries and a terminal one settles through the audited writer. Everything that
// READS A PAGE lives out here — reader-1's layout parse, the vendor adapter, the CSV/OFX
// parsers, the corroborator and the payload builder — because those are exactly the parts
// that will be tuned against real Maybank output, and the AB-16 precedent is that vendor
// and parser tuning must never be a workflow-version change.
//
// The bundle is FROZEN as an object (Object.freeze) so a lane cannot be swapped at runtime,
// and it carries the temp-file lifecycle + canonical download from the shared document
// services rather than re-implementing them.

import { makeDocumentServices } from "../lib/intake.mjs";
import { readStatementLayout } from "../lib/statement-layout-reader.mjs";
import { parseStatementFile } from "../lib/statement-parse.mjs";
import {
  buildStatementPersistPayload,
  corroborateChain,
  corroborateTwoReaders,
  preflightRead,
} from "../lib/statement-corroboration.mjs";
import { analyzeBankStatement } from "./statementFacts.v1.engine.mjs";

export function makeStatementFactsServices() {
  const base = makeDocumentServices();
  return Object.freeze({
    taskTempPath: base.taskTempPath,
    removeTempFile: base.removeTempFile,
    downloadCanonical: base.downloadCanonical,
    // Reader-1 — a DB read plus arithmetic over committed geometry. No egress.
    readStatementLayout,
    // Reader-2 — the ONLY vendor call on either lane.
    analyzeBankStatement,
    // The structured lane's deterministic parsers (csv now, ofx behind the same interface).
    parseStatementFile,
    // Judges ONE read, so the workflow can refuse before spending a vendor call or a
    // single-use governed-egress authorization on a statement that cannot corroborate.
    preflightRead,
    corroborateTwoReaders,
    corroborateChain,
    buildStatementPersistPayload,
    noteTaskFailure: base.noteTaskFailure,
  });
}
