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
import { documentIngest_v1 } from "./documentIngest.v1.js";
import { invoiceFacts_v1 } from "./invoiceFacts.v1.js";

export const workflows = {
  closeExample: closeExampleV1,
  chatTurn: chatTurn_v2,
  documentIngest: documentIngest_v1,
  invoiceFacts: invoiceFacts_v1,
} as const;

// Slice 6 repoints `chatTurn:` from v1 to v2. The v1 body stays frozen + built and
// its export is kept reachable here so parked v1 runs are never stranded (policy (c));
// new admissions target v2, and the engine resumes existing v1 runs by run id. Drop
// this re-export only once zero non-terminal v1 runs remain.
export { chatTurn_v1 };

export const workflowNames: string[] = Object.keys(workflows);
