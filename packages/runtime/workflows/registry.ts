// Workflow registry — names the NEWEST version of each workflow class.
//
// Appendix A policy (b): enqueue sites import from HERE so they always target
// the newest version. When a behavioural change is needed, add
// closeExample.v2.ts and repoint the entry below; keep the old export until
// zero non-terminal runs reference it (never rename/delete an export with
// in-flight runs — a rename strands parked runs, policy (c)).

import { closeExampleV1 } from "./closeExample.v1.js";
import { chatTurn_v1 } from "./chatTurn.v1.js";
import { chatTurn_v2 } from "./chatTurn.v2.js";
import { chatTurn_v3 } from "./chatTurn.v3.js";
import { chatTurn_v4 } from "./chatTurn.v4.js";
import { chatTurn_v5 } from "./chatTurn.v5.js";
import { documentIngest_v1 } from "./documentIngest.v1.js";
import { invoiceFacts_v1 } from "./invoiceFacts.v1.js";
import { autoDraft_v1 } from "./autoDraft.v1.js";

export const workflows = {
  closeExample: closeExampleV1,
  chatTurn: chatTurn_v5,
  documentIngest: documentIngest_v1,
  invoiceFacts: invoiceFacts_v1,
  autoDraft: autoDraft_v1,
} as const;

// Slice 6 repointed `chatTurn:` v1→v2, then v2→v3 (the GATE-3 live find: v2's
// park-resume re-sent collected stream output as an assistant INPUT message,
// which fails model-input validation after a WDK replay — v3 sanitizes the park
// message to text + the clarify tool-call only). Wave A2 repointed v3→v4 (the §9
// live find: v3's frozen draft tool was supplier-bill-only — it hardcoded
// coding_kind 'supplier_bill' — while the 0015 DB floor already enforced the
// sales/CN shapes; v4 passes the model's coding_kind through). The v1/v2/v3
// bodies stay frozen + built and their exports reachable so no parked run is
// ever stranded (policy (c)); new admissions target v4; the engine resumes old
// runs by run id. Wave A2 then repointed v4→v5 (the §9 Gate-B live find: no chat
// version could send a NULL coding_kind, so the generic voucher lane the DB has
// always accepted was undraftable via chat; v5 adds "journal_entry"->NULL). Drop a
// re-export only once zero non-terminal runs of that version remain.
export { chatTurn_v1 };
export { chatTurn_v2 };
export { chatTurn_v3 };
export { chatTurn_v4 };

export const workflowNames: string[] = Object.keys(workflows);
