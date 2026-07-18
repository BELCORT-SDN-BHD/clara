// Workflow registry — names the NEWEST version of each workflow class.
//
// Appendix A policy (b): enqueue sites import from HERE so they always target
// the newest version. When a behavioural change is needed, add
// closeExample.v2.ts and repoint the entry below; keep the old export until
// zero non-terminal runs reference it (never rename/delete an export with
// in-flight runs — a rename strands parked runs, policy (c)).

import { closeExampleV1 } from "./closeExample.v1.js";
import { chatTurn_v1 } from "./chatTurn.v1.js";
import { documentIngest_v1 } from "./documentIngest.v1.js";

export const workflows = {
  closeExample: closeExampleV1,
  chatTurn: chatTurn_v1,
  documentIngest: documentIngest_v1,
} as const;

export const workflowNames: string[] = Object.keys(workflows);
