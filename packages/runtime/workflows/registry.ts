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
import { chatTurn_v6 } from "./chatTurn.v6.js";
import { chatTurn_v7 } from "./chatTurn.v7.js";
import { documentIngest_v1 } from "./documentIngest.v1.js";
import { invoiceFacts_v1 } from "./invoiceFacts.v1.js";
import { autoDraft_v1 } from "./autoDraft.v1.js";
import { autoDraft_v2 } from "./autoDraft.v2.js";
import { autoDraft_v3 } from "./autoDraft.v3.js";
import { firmInterview_v1 } from "./firmInterview.v1.js";
import { firmInterview_v2 } from "./firmInterview.v2.js";
import { clientOnboarding_v1 } from "./clientOnboarding.v1.js";
import { clientOnboarding_v2 } from "./clientOnboarding.v2.js";

export const workflows = {
  closeExample: closeExampleV1,
  chatTurn: chatTurn_v7,
  documentIngest: documentIngest_v1,
  invoiceFacts: invoiceFacts_v1,
  autoDraft: autoDraft_v3,
  firmInterview: firmInterview_v2,
  clientOnboarding: clientOnboarding_v2,
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
// always accepted was undraftable via chat; v5 adds "journal_entry"->NULL). Wave A2.1
// repointed v5→v6 (PROMPT-only: the SST registration-watch surfacing framing + the
// purchase 3-leg visibility-split guidance + direction-first vocabulary; the draft
// schema/steps are byte-identical to v5) and autoDraft v1→v2 (the same purchase 3-leg
// guidance + an sst_registration_watch awareness note for the unattended sweep). Wave B
// (v25, WB-R18 ceremony) repointed v6→v7 and autoDraft v2→v3: v7/v3 fetch the pack with
// the 'wiki_coding' purpose + the txn-local clara.pack_consumer='v25' GUC (FORK-6/AMB-1/
// AMB-2 — the 0017 pack v4 wiki block renders ONLY under both), pin the tool's purpose to
// a z.literal, and carry the WB-R6(4) wiki framing + citation-visible-reasoning prompt
// law; the frozen v1–v6/v1–v2 closures stay wiki-dark by construction. Wave B also added
// the two durable interview classes (FORK-8): firmInterview_v1 + clientOnboarding_v1
// (hook-per-question parks, P19 plan-checkpoint persistence). Post-Wave-B repointed BOTH
// interview classes v1→v2 (interview_v2, F1+F2): v1's registration validator anchored on a
// leading digit and refused a state-prefixed ROB number outright — a sole-proprietor client
// could not be onboarded at all — and its framework question offered only MPERS/MFRS, which is
// a Sdn Bhd's choice presented as everyone's (no approved standard is imposed on an LLP or a
// ROBA-registered business). v2 accepts every printed registration form and asks two
// entity-type-aware axes (framework + accounting basis) over a config table. The v1 bodies stay
// frozen, built and EXPORTED so no parked run is stranded (policy (c)) — this class's parks are
// the ≥48h kind, so a live run on v1 is the expected case, not a corner one; the engine resumes
// them by run id. Drop a re-export only once zero non-terminal runs of that version remain.
export { firmInterview_v1 };
export { clientOnboarding_v1 };
export { chatTurn_v1 };
export { chatTurn_v2 };
export { chatTurn_v3 };
export { chatTurn_v4 };
export { chatTurn_v5 };
export { chatTurn_v6 };
export { autoDraft_v1 };
export { autoDraft_v2 };

export const workflowNames: string[] = Object.keys(workflows);
