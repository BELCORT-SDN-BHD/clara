// Wave-B battery — migration 0020 §6: THE LEGACY BYTE-IDENTITY CLOSED SET.
//
// §1.1 withdrew v0.1's central decision for TWO independently fatal reasons, both
// verified at source in this tree:
//   (a) the LIVE invoice-facts predicate is purpose-BLIND — `select 1 from
//       clara.client_egress_consents c where c.client_id=f.client_id and
//       c.revoked_at is null` (the 0015 conflict-of-record body, NOT the 0011 one).
//       A typed row on that table would make a wiki grant ALSO authorize
//       invoice-facts egress.
//   (b) `revoke_client_egress` selects the live row `where client_id=p_client and
//       revoked_at is null for update` — no purpose, no ordering, no STRICT. With
//       two live rows PL/pgSQL's SELECT INTO keeps an arbitrary one and silently
//       discards the rest, so a withdrawal control becomes NONDETERMINISTIC.
// Neither can bite as long as the legacy relation, its one-live index, its
// writers, its revoker and the 0015 claim body are BYTE-IDENTICAL. This file is
// the exact-diff pin for that claim.
//
// THE BASELINE IS REAL, NOT ASSUMED. The normalized-prosrc digests below were
// captured from the 19-MIGRATION PRESTATE of this very rig (the migration source
// on disk is not the same text as pg_get_functiondef, so a source-file diff would
// prove nothing). A digest mismatch means 0020 touched a body §6 says it must not.
// CONTRACT-BLIND; FAILS below 0020.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ROLES, rootQuery, opk, endPool, printLaneNotes, noteLane, assertRaises, assertRaisesOneOf,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, createClient, seedOpeningCoa, filedDocument,
  LEGACY_CONSENT_TABLE, TYPED_CONSENT_TABLE,
  grantClientEgress, revokeClientEgress, grantPurpose, consentEvidenceDoc,
  livePurposeConsent, liveLegacyConsentCount, normSrc, overloadCount, fnFacts,
  eventsOf, opReceiptRow, countRows,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

/** §6's closed set: fn → the 19-migration prestate's normalized-prosrc digest,
 *  its expected overload count, and its expected EXACT identity signature.
 *  Captured from clara_0020_rig at migration 19 (2026-07-25). */
//
//  RATCHET R1-F4 (2026-07-25). `sha` is the NORMALIZED digest (comments stripped, whitespace
//  collapsed, lowercased) — useful for a readable diff, but NOT byte identity: normalization
//  reaches inside string literals, so renaming a case-sensitive refusal token would pass it.
//  `exact` is the SHA-256 of the UNMODIFIED prosrc, and it is the assertion §6's words actually
//  promise. Both are checked; only `exact` is load-bearing.
// =========================================================================
// AMENDMENT 0038 (Wave C-b, ratified WCB-R1 + design v2.1, 2026-07-31). TWO members of the
// closed set gain a further deliberate edit: claim_document_processing_task's kill-switch /
// attempt-cap / concurrency lane lists widen to statement_facts (the attempt-cap sum
// re-keys per lane), and _enqueue_invoice_facts_core gains the two statement arms, the
// csv/ofx mime dispatch, the per-lane already_completed engine-kind map, the enqueue-time
// typed-consent gate and the statement page-budget reservation. Same discipline as
// A7/A9/A10/A11: the pins are NOT retuned. The reversal pairs below are MACHINE-DERIVED
// from the migration files (predecessor body vs the 0038 recut body) and mechanically
// verified to reconstruct the predecessor EXACTLY; they reverse outermost-first, then the
// existing A10/A11/A9 reversals run unchanged and the remainder must hash to the untouched
// 19-migration prestate.
// =========================================================================
// AMENDMENT F-A1 (Wave-F Track A, PR-1 "the walls", 0090_f_a1_walls.sql). Both
// members of §6's closed set gain a THIRD deliberately-changed layer, OUTERMOST of all
// (authored latest, so reversed FIRST — the same "reverse outermost-first" discipline
// the 0038 block above states). claim_document_processing_task: llm_witness joins the
// kill-switch triple and the attempt cap, gains its OWN concurrency window (M10, never
// folded into the shared ocr/invoice_facts/statement_facts count), and the attempt-cap
// terminal-event CASE gains a lane-true 'document.llm_witness_failed' arm (M9).
// _enqueue_invoice_facts_core gains ONE new elsif branch: the INERT witness_extraction
// typed-consent gate, byte-verified inert (v_lane is never assigned 'llm_witness'
// anywhere at this frontier — no mime/kind arm mints it before PR-3). Pairs below are
// MACHINE-DERIVED (packages/db/scratch — reverseApply against the real dumped pre/post
// prosrc, byte-equality asserted) exactly like 0038's own pairs, and mechanically
// verified to reconstruct the 0038-era predecessor EXACTLY; they reverse first, then
// RESTORE_0038's own pairs run unchanged, then A10/A11's for claim.
const RESTORE_FA1 = {
"claim": [
[
"  if t.lane in ('ocr','invoice_facts','statement_facts','llm_witness')\n     and not coalesce(p_egress_approved,false) then",
"  if t.lane in ('ocr','invoice_facts','statement_facts')\n     and not coalesce(p_egress_approved,false) then",
],
[
"  -- 0038: the attempt cap is now PER EGRESSING LANE. The sum was keyed on the literal\n  -- 'invoice_facts' while the branch it guards was too; widening the branch without re-keying\n  -- the sum would let one lane's attempts cap the other's. F-A1 PR-1: llm_witness joins the\n  -- same per-lane cap.\n  if t.lane in ('invoice_facts','statement_facts','llm_witness') then\n    select coalesce(sum(attempt_count),0)::int into v_attempts\n      from clara.document_processing_tasks where document_id=t.document_id\n        and lane=t.lane;\n    if v_attempts>=3 then\n      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',\n        finished_at=now() where id=p_task;\n      perform clara._refund_processing_call(p_task,'attempt_cap');\n      -- 0038 as-built fix: the terminal event follows the LANE -- a statement task's cap\n      -- must fire the statement feed (its subscribed twin), never wake the autodraft\n      -- consumer with a phantom invoice failure. F-A1 PR-1 (M9): llm_witness gets its OWN\n      -- twin -- the subscriber census (packages/runtime/lib/autodraft.mjs's\n      -- AUTODRAFT_EVENT_TYPES, and a repo-wide grep for both existing type strings) found\n      -- no consumer of either existing type that a witness-lane failure could misfire into,\n      -- so the lane-true default applies rather than folding into the invoice twin.\n      perform clara._append_event(t.firm_id,\n        case when t.lane='statement_facts' then 'document.statement_facts_failed'\n             when t.lane='llm_witness' then 'document.llm_witness_failed'\n             else 'document.invoice_facts_failed' end,\n        null,null,null,null,\n        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));\n      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');\n    end if;\n  end if;",
"  -- 0038: the attempt cap is now PER EGRESSING LANE. The sum was keyed on the literal\n  -- 'invoice_facts' while the branch it guards was too; widening the branch without re-keying\n  -- the sum would let one lane's attempts cap the other's.\n  if t.lane in ('invoice_facts','statement_facts') then\n    select coalesce(sum(attempt_count),0)::int into v_attempts\n      from clara.document_processing_tasks where document_id=t.document_id\n        and lane=t.lane;\n    if v_attempts>=3 then\n      update clara.document_processing_tasks set status='failed',error_code='attempt_cap',\n        finished_at=now() where id=p_task;\n      perform clara._refund_processing_call(p_task,'attempt_cap');\n      -- 0038 as-built fix: the terminal event follows the LANE -- a statement task's cap\n      -- must fire the statement feed (its subscribed twin), never wake the autodraft\n      -- consumer with a phantom invoice failure.\n      perform clara._append_event(t.firm_id,\n        case when t.lane='statement_facts' then 'document.statement_facts_failed'\n             else 'document.invoice_facts_failed' end,\n        null,null,null,null,\n        null,t.document_id,null,jsonb_build_object('task_id',p_task,'reason','attempt_cap'));\n      return jsonb_build_object('task_id',p_task,'status','failed','reason','attempt_cap');\n    end if;\n  end if;",
],
[
"  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f\n    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;\n  select count(*)::int into v_running from clara.document_processing_tasks\n    where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts')\n      and status='running';\n  if t.lane in ('ocr','invoice_facts','statement_facts') and v_running>=v_cap then\n    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';\n  end if;\n  -- F-A1 PR-1 (M10): llm_witness gets its OWN concurrency window, counted over\n  -- lane='llm_witness' alone -- it must NEVER be folded into the shared ocr/invoice_facts/\n  -- statement_facts count above, or the slowest lane could starve the others' throughput.\n  -- The limit column (llm_witness_concurrency) is nullable with a table-level default of 2,\n  -- coalesced here exactly the way ocr_concurrency is above.\n  if t.lane='llm_witness' then\n    select coalesce(l.llm_witness_concurrency,2) into v_cap from clara.firms f\n      left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;\n    select count(*)::int into v_running from clara.document_processing_tasks\n      where firm_id=t.firm_id and lane='llm_witness' and status='running';\n    if v_running>=v_cap then\n      raise exception 'document-processing concurrency limit reached' using errcode='CLR18';\n    end if;\n  end if;",
"  select coalesce(l.ocr_concurrency,2) into v_cap from clara.firms f\n    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=t.firm_id;\n  select count(*)::int into v_running from clara.document_processing_tasks\n    where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts')\n      and status='running';\n  if t.lane in ('ocr','invoice_facts','statement_facts') and v_running>=v_cap then\n    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';\n  end if;",
]
],
"router": [
[
"      return jsonb_build_object('task_id',v_task,'document_id',p_document,\n        'status','failed','reason',v_gate);\n    end if;\n  elsif v_lane='llm_witness' then\n    -- F-A1 PR-1 (design SS3.5/SS6, wall 6): the SAME enqueue-time typed-consent gate, keyed\n    -- on purpose='witness_extraction' instead of 'statement_extraction', with its OWN named\n    -- refusal codes (wall 7) rather than a reuse of the statement family's bare literals --\n    -- witness and statement consent are granted independently, so the codes must stay\n    -- distinguishable. INERT AT PR-1: nothing in this body (or anywhere else at this\n    -- frontier) ever assigns v_lane:='llm_witness' -- no mime/kind arm mints it yet, and the\n    -- lane CHECK plus enqueueForLane's runtime allowlist keep an old image from reaching this\n    -- branch even by accident. Wired now so the gate exists the moment PR-3's router recut\n    -- adds the classification arm, rather than landing a second CoR on this pinned body then.\n    select array_agg(distinct f.client_id) into v_stmt_clients\n      from clara.document_filings f\n      where f.document_id=p_document and f.retired_at is null;\n    if coalesce(array_length(v_stmt_clients,1),0)>1 then\n      v_gate:='witness_multi_client';\n    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then\n      -- Zero active filings: no client exists who could have authorized this read. Fail closed.\n      v_gate:='witness_consent_inactive';\n    else\n      v_stmt_client:=v_stmt_clients[1];\n      if not exists(select 1 from clara.client_egress_purpose_activations a\n          join clara.client_egress_purpose_consents c\n            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id\n              and c.purpose=a.purpose\n          where a.firm_id=d.firm_id and a.client_id=v_stmt_client\n            and a.purpose='witness_extraction'\n            and a.deactivated_at is null and c.revoked_at is null) then\n        v_gate:='witness_consent_inactive';\n      end if;\n    end if;\n    if v_gate is not null then\n      update clara.document_processing_tasks\n        set status='failed', error_code=v_gate, finished_at=now()\n        where document_id=p_document and lane=v_lane and status='queued';\n      get diagnostics v_flip = row_count;\n      if v_flip = 0 then\n        select id into v_task from clara.document_processing_tasks\n          where document_id=p_document and lane=v_lane\n            and status='failed' and error_code=v_gate\n          order by version_n desc limit 1;\n        if v_task is not null then\n          return jsonb_build_object('task_id',v_task,'document_id',p_document,\n            'status','failed','reason',v_gate);\n        end if;\n        select coalesce(max(version_n),0)+1 into v_version\n          from clara.document_processing_tasks\n          where document_id=p_document and lane=v_lane;\n        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,\n            engine_config,version_n,lane,status,error_code,finished_at)\n          values(d.firm_id,p_document,v_engine,'{}'::jsonb,\n            v_version,v_lane,'failed',v_gate,now())\n          returning id into v_task;\n      else\n        select id into v_task from clara.document_processing_tasks\n          where document_id=p_document and lane=v_lane\n            and status='failed' and error_code=v_gate\n          order by version_n desc limit 1;\n      end if;\n      perform clara._append_event(d.firm_id,'document.llm_witness_failed',\n        null,null,null,null,\n        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));\n      return jsonb_build_object('task_id',v_task,'document_id',p_document,\n        'status','failed','reason',v_gate);\n    end if;\n  end if;",
"      return jsonb_build_object('task_id',v_task,'document_id',p_document,\n        'status','failed','reason',v_gate);\n    end if;\n  end if;",
]
]
};
function applyRestoreFA1(member, src) {
  for (const [frm, to] of RESTORE_FA1[member]) {
    if (src.split(frm).length !== 2) {
      throw new Error(`F-A1 restore(${member}): pair not found exactly once -- the live body drifted from the ratified F-A1 walls shape: ${frm.slice(0, 100)}`);
    }
    src = src.replace(frm, to);
  }
  return src;
}

// =========================================================================
// AMENDMENT F-A1 PR-3 (the CUTOVER, 0097_f_a1_cutover.sql). ONE member of §6's closed
// set -- _enqueue_invoice_facts_core ("router") -- gains a FOURTH deliberately-changed
// layer, OUTERMOST of ALL (authored latest: after PR-1's own inert-gate branch, which this
// amendment's edits sit textually ABOVE, in the earlier mime-routing block the PR-1 layer
// never touched). PR-3 makes THREE edits (the first cut of this amendment said TWO and was
// caught by this very cell on the first full CI chain -- the M-4 review round added edit 3
// to 0097 S1 after the pairs were authored): (1) the invoice-kind arm mints llm_witness
// (engine llm-openai:gpt-5.6-terra:v1) instead of invoice_facts -- the SAME four
// document_kind values, never widened; (2) the already_completed short-circuit's per-lane
// engine_kind map gains llm_witness -> llm_text_facts; (3) the already_completed lookup
// gains the M-4 either-regime legacy fallback (a done invoice_facts row ALSO suppresses,
// consulted only when the witness lookup found nothing). Pairs 1-2 machine-derived
// (packages/db/scratch -- reverseApply against the real dumped pre/post prosrc,
// byte-equality asserted); pair 3 transcribed verbatim from 0097 S1's own v_frm3/v_to3
// splice literals. Reversed FIRST -- before RESTORE_FA1's own PR-1 pair
// runs -- because the two amendments touch DISJOINT text spans (PR-3's edits sit in the
// earlier mime-routing block; PR-1's sits in the later enqueue-time consent-gate block PR-3
// does not touch at all), so composition order between the two is safe either way, but
// "reverse outermost-first" stays the stated discipline every prior amendment here uses.
const RESTORE_FA1_PR3 = {
"router": [
[
"    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then\n      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness\n      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm\n      -- served (mirrored above, never widened here). v_engine MUST string-equal\n      -- WITNESS_ENGINE_SNAPSHOT.engineId in witnessFacts.v1.services.mjs -- battery cell\n      -- f-a1.cutover-engine-literal reads both sides and asserts equality.\n      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v1';",
"    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then\n      v_lane:='invoice_facts'; v_engine:='azure-di:prebuilt-invoice:2024-11-30';",
],
[
"    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')\n                       then 'statement_facts'  -- BOTH statement lanes settle a\n                       -- statement_facts extraction (the lane records how the read was\n                       -- bought; the engine_kind what it is -- the 0026:709 precedent)\n                       when v_lane='llm_witness'\n                       then 'llm_text_facts'  -- F-A1 PR-3: the CANONICAL witness row --\n                       -- a done text row proves a done PAIR (one atomic writer transaction,\n                       -- 0095 section 8), so a re-fire is suppressed the moment the pair lands.\n                       else 'invoice_facts' end;",
"    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')\n                       then 'statement_facts'  -- BOTH statement lanes settle a\n                       -- statement_facts extraction (the lane records how the read was\n                       -- bought; the engine_kind what it is -- the 0026:709 precedent)\n                       else 'invoice_facts' end;",
],
[
"    select e.id into v_task from clara.document_extractions e\n      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'\n      order by e.version_n desc limit 1;\n    -- F-A1 PR-3 (M-4, RULED): for the invoice-shaped lane ONLY, a done LEGACY extraction ALSO\n    -- suppresses -- v_engine_kind above already names the witness side (llm_text_facts); this\n    -- is the legacy side of the EITHER-REGIME check, consulted only when the witness lookup\n    -- just found nothing.\n    if v_task is null and v_lane='llm_witness' then\n      select e.id into v_task from clara.document_extractions e\n        where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'\n        order by e.version_n desc limit 1;\n    end if;\n    if v_task is not null then",
"    select e.id into v_task from clara.document_extractions e\n      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'\n      order by e.version_n desc limit 1;\n    if v_task is not null then",
]
]
};
function applyRestoreFA1PR3(member, src) {
  for (const [frm, to] of RESTORE_FA1_PR3[member]) {
    if (src.split(frm).length !== 2) {
      throw new Error(`F-A1 PR-3 restore(${member}): pair not found exactly once -- the live body drifted from the ratified F-A1 cutover shape: ${frm.slice(0, 100)}`);
    }
    src = src.replace(frm, to);
  }
  return src;
}

// =========================================================================
// AMENDMENT F-A2 OPENER 2 (the engine-identity bump, UNNUMBERED_f_a2_nil_tax_arm.sql S2).
// The SAME §6 member -- _enqueue_invoice_facts_core ("router") -- gains a FIFTH deliberately-
// changed layer, now the OUTERMOST of all (authored latest). ONE edit: the invoice-kind mint
// arm's engine literal moves llm-openai:gpt-5.6-terra:v1 -> :v2, carrying its comment with it,
// because witnessFacts.v2 is a new frozen prompt closure and its reads must be distinguishable
// rows from every v1-era read. The pair below is the EXACT INVERSE of that migration's own
// v_frm/v_to splice literals, transcribed from them -- which is why the migration anchors the
// whole comment block rather than the bare literal: a reversal pair that only swapped ":v2" for
// ":v1" could not carry the comment back, and this battery compares TEXT.
// Reversed FIRST, before F-A1 PR-3's pair, per the standing "reverse outermost-first" discipline.
const RESTORE_FA2_ENGINE = {
"router": [
[
"    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then\n      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness\n      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm\n      -- served (mirrored above, never widened here). F-A2 OPENER 2: the engine identity moves\n      -- to :v2 because witnessFacts.v2 is a NEW frozen prompt closure and its reads answer\n      -- different questions -- v_engine MUST string-equal WITNESS_ENGINE_SNAPSHOT.engineId in\n      -- the witnessFacts.v2 services module -- battery cell f-a2.engine-literal reads both\n      -- sides and asserts equality.\n      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v2';",
"    elsif d.document_kind in ('invoice','credit_note','debit_note','receipt') then\n      -- F-A1 PR-3 CUTOVER (design SS3.8/D9): the invoice path now mints llm_witness\n      -- DIRECTLY -- NO DUAL-RUN. Exactly the SAME document-kind set the invoice_facts arm\n      -- served (mirrored above, never widened here). v_engine MUST string-equal\n      -- WITNESS_ENGINE_SNAPSHOT.engineId in witnessFacts.v1.services.mjs -- battery cell\n      -- f-a1.cutover-engine-literal reads both sides and asserts equality.\n      v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5.6-terra:v1';",
]
]
};
function applyRestoreFA2Engine(member, src) {
  for (const [frm, to] of RESTORE_FA2_ENGINE[member]) {
    // DORMANCY vs DRIFT. On a chain where the F-A2 window has NOT been applied the router still
    // carries the :v1 text and there is nothing to reverse -- that is a pre-F-A2 database, not a
    // broken one, so the layer is a no-op. Anything else (the pair present twice, or a body that
    // carries neither shape) is drift and must fail loudly rather than restore a wrong body.
    const n = src.split(frm).length - 1;
    if (n === 0) continue;
    if (n !== 1) {
      throw new Error(`F-A2 restore(${member}): the engine-bump pair appears ${n} times -- the live body drifted from the ratified F-A2 shape`);
    }
    src = src.replace(frm, to);
  }
  return src;
}

const RESTORE_0038 = {
"claim": [
[
"  -- The lease check precedes EVERY dispatching branch. Only the EGRESSING lanes\n  -- (ocr, invoice_facts and -- 0038 -- statement_facts) are kill-switch-gated; invoice_facts\n  -- additionally requires every active filing client to hold a live LEGACY consent. Local\n  -- lanes (structured_parse, local_facts, classify, statement_parse) never hold.\n  --\n  -- 0038 (design 4.3/4.4): statement_facts joins the KILL SWITCH and nothing else here. The\n  -- typed (consent, activation) it needs is checked at ENQUEUE -- the 0020 section 6\n  -- byte-identity battery asserts this body carries no call edge into the typed-consent\n  -- surface, and the two questions are orthogonal anyway: the switch asks whether the vendor is\n  -- safe right now, the typed gate asks whether this client authorized this purpose. Widening\n  -- the LEGACY branch below to statement_facts would make a purpose-blind consent authorize a\n  -- statement-specific read, which is what 0020 section 1 built a separate relation to prevent.\n  if t.lane in ('ocr','invoice_facts','statement_facts')\n     and not coalesce(p_egress_approved,false) then",
"  -- The lease check precedes EVERY dispatching branch. Only the two EGRESSING lanes\n  -- (ocr, invoice_facts) are kill-switch-gated; invoice_facts additionally requires\n  -- every active filing client to hold a live consent. Local lanes never hold.\n  if t.lane in ('ocr','invoice_facts')\n     and not coalesce(p_egress_approved,false) then"
],
[
"  -- 0038: the attempt cap is now PER EGRESSING LANE. The sum was keyed on the literal\n  -- 'invoice_facts' while the branch it guards was too; widening the branch without re-keying\n  -- the sum would let one lane's attempts cap the other's.\n  if t.lane in ('invoice_facts','statement_facts') then\n    select coalesce(sum(attempt_count),0)::int into v_attempts",
"  if t.lane='invoice_facts' then\n    select coalesce(sum(attempt_count),0)::int into v_attempts"
],
[
"        and lane=t.lane;\n    if v_attempts>=3 then",
"        and lane='invoice_facts';\n    if v_attempts>=3 then"
],
[
"    where firm_id=t.firm_id and lane in ('ocr','invoice_facts','statement_facts')\n      and status='running';\n  if t.lane in ('ocr','invoice_facts','statement_facts') and v_running>=v_cap then\n    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';",
"    where firm_id=t.firm_id and lane in ('ocr','invoice_facts') and status='running';\n  if t.lane in ('ocr','invoice_facts') and v_running>=v_cap then\n    raise exception 'document-processing concurrency limit reached' using errcode='CLR18';"
],
[
"      -- 0038 as-built fix: the terminal event follows the LANE -- a statement task's cap\n      -- must fire the statement feed (its subscribed twin), never wake the autodraft\n      -- consumer with a phantom invoice failure.\n      perform clara._append_event(t.firm_id,\n        case when t.lane='statement_facts' then 'document.statement_facts_failed'\n             else 'document.invoice_facts_failed' end,\n        null,null,null,null,",
"      perform clara._append_event(t.firm_id,'document.invoice_facts_failed',null,null,null,null,"
]
],
"router": [
[
"  v_engine_kind text; v_stmt_clients uuid[]; v_stmt_client uuid; v_gate text; v_flip int;\nbegin",
"begin"
],
[
"  -- 0038 (design 4.3): 'bank_statement' now has TWO homes -- the vendor OCR lane for a\n  -- pdf/image and the free local parse lane for a csv/ofx export.\n  if lower(coalesce(d.mime_type,''))='application/pdf'",
"  if lower(coalesce(d.mime_type,''))='application/pdf'"
],
[
"    elsif d.document_kind='bank_statement' then\n      -- 0038 arm 1: the statementFacts_v1 OCR lane. This is the arm that closes the\n      -- bank_statement -> skipped_kind dead end 0026:392-410 left behind.\n      -- as-built ladder fix 2026-07-31, Codex wave: the stamp names `prebuilt-bankStatement.us`,\n      -- which is the model the runtime ACTUALLY invokes. Provenance must name the engine that\n      -- received the egress -- a stamp naming a model nobody called is a false receipt, and the\n      -- \".us\" suffix is the whole model identity here, not a regional decoration.\n      v_lane:='statement_facts'; v_engine:='azure-di:prebuilt-bankStatement.us:2024-11-30';\n    else",
"    else"
],
[
"  elsif lower(coalesce(d.mime_type,'')) in ('text/csv','application/csv',\n      'application/x-ofx','application/ofx') then\n    -- 0038 arm 2 (design 4.3): the csv/ofx mimes JOIN the dispatch. They dead-ended at\n    -- skipped_type before the kind test could ever run. ONLY a bank statement routes; every\n    -- other kind keeps the byte-identical skipped_type verdict it has today, so nothing that\n    -- is not a statement changes behaviour.\n    if d.document_kind='bank_statement' then\n      v_lane:='statement_parse'; v_engine:='clara-statement-parse:v1';\n    else\n      return jsonb_build_object('document_id',p_document,'status','skipped_type');\n    end if;\n  else",
"  else"
],
[
"    -- 0038 (design 4.3): PER-LANE engine-kind. This short-circuit was hard-coded to\n    -- 'invoice_facts', which is correct for invoice_facts AND for local_facts (both settle an\n    -- invoice_facts extraction) and WRONG for either statement lane -- a fully ingested\n    -- statement would read as un-extracted on every re-fire and re-buy a vendor read. The map\n    -- preserves the two existing lanes exactly and names the two new ones.\n    v_engine_kind := case when v_lane in ('statement_facts','statement_parse')\n                       then 'statement_facts'  -- BOTH statement lanes settle a\n                       -- statement_facts extraction (the lane records how the read was\n                       -- bought; the engine_kind what it is -- the 0026:709 precedent)\n                       else 'invoice_facts' end;\n    select e.id into v_task from clara.document_extractions e",
"    select e.id into v_task from clara.document_extractions e"
],
[
"      where e.document_id=p_document and e.engine_kind=v_engine_kind and e.status='done'\n      order by e.version_n desc limit 1;",
"      where e.document_id=p_document and e.engine_kind='invoice_facts' and e.status='done'\n      order by e.version_n desc limit 1;"
],
[
"    end if;\n  end if;\n  -- 0038 (design 4.3/4.4, WCB-R1): THE ENQUEUE-TIME TYPED-CONSENT GATE, statement lanes only.\n  -- It is here rather than in the claim body because the ratified 0020 section 6 byte-identity\n  -- battery asserts claim_document_processing_task carries no call edge into the typed-consent\n  -- surface -- and because enqueue is the earlier, more honest place: an unauthorized client\n  -- should never have a task queued in their name at all. Both verdicts write the terminal\n  -- NEVER-CLAIMED failed receipt (the skipped_kind idiom), never a raise: this function runs\n  -- inside file_document / finalize_document_intake / confirm_attribution_candidate /\n  -- approve_wrong_client_correction, and a raise would abort an unrelated filing transaction.\n  --\n  -- ORDERING, decided here because the design does not fix it: the gate runs AFTER the\n  -- already_completed short-circuit (an ingested statement raises no consent question and must\n  -- not generate noise on a re-fire) and BEFORE the in-flight short-circuit. The other order\n  -- has a real hole: a statement enqueued while one client held it, then filed to a SECOND\n  -- client, would hit the in-flight branch and return the queued task, so the vendor read\n  -- would proceed on a document with no answerable consent client. A re-fire whose gate now\n  -- fails should say so even while a task is queued.\n  if v_lane in ('statement_facts','statement_parse') then\n    select array_agg(distinct f.client_id) into v_stmt_clients\n      from clara.document_filings f\n      where f.document_id=p_document and f.retired_at is null;\n    if coalesce(array_length(v_stmt_clients,1),0)>1 then\n      v_gate:='statement_multi_client';\n    elsif coalesce(array_length(v_stmt_clients,1),0)=0 then\n      -- Zero active filings: no client exists who could have authorized this read. Fail closed.\n      v_gate:='consent_inactive';\n    else\n      v_stmt_client:=v_stmt_clients[1];\n      if not exists(select 1 from clara.client_egress_purpose_activations a\n          join clara.client_egress_purpose_consents c\n            on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id\n              and c.purpose=a.purpose\n          where a.firm_id=d.firm_id and a.client_id=v_stmt_client\n            and a.purpose='statement_extraction'\n            and a.deactivated_at is null and c.revoked_at is null) then\n        v_gate:='consent_inactive';\n      end if;\n    end if;\n    if v_gate is not null then\n      -- AS-BUILT LADDER FIX (2026-07-31): the gate ACTS ON any in-flight queued task rather\n      -- than writing a receipt beside it -- the ordering rationale above promises the vendor\n      -- read stops, so it stops: the queued row flips to the gate verdict in this same\n      -- transaction (never-claimed failed rows are legal for both gate codes -- the widened\n      -- binding CHECK). A running task is past claiming and settles through its own persist.\n      update clara.document_processing_tasks\n        set status='failed', error_code=v_gate, finished_at=now()\n        where document_id=p_document and lane=v_lane and status='queued';\n      get diagnostics v_flip = row_count;\n      if v_flip = 0 then\n        select id into v_task from clara.document_processing_tasks\n          where document_id=p_document and lane=v_lane\n            and status='failed' and error_code=v_gate\n          order by version_n desc limit 1;\n        if v_task is not null then\n          -- Re-read of an EXISTING terminal receipt: this call acted on nothing, so it\n          -- emits nothing (delta-review round 2, 2026-07-31: the unconditional emit here\n          -- re-fired on every dark re-try and, picked by uuid order, could name an older\n          -- task than the one the verdict actually acted on). The verdict reached the\n          -- spine when its receipt was minted; re-reads only report it.\n          return jsonb_build_object('task_id',v_task,'document_id',p_document,\n            'status','failed','reason',v_gate);\n        end if;\n        select coalesce(max(version_n),0)+1 into v_version\n          from clara.document_processing_tasks\n          where document_id=p_document and lane=v_lane;\n        insert into clara.document_processing_tasks(firm_id,document_id,engine_id,\n            engine_config,version_n,lane,status,error_code,finished_at)\n          values(d.firm_id,p_document,v_engine,'{}'::jsonb,\n            v_version,v_lane,'failed',v_gate,now())\n          returning id into v_task;\n      else\n        -- The flip acted: name the newest flipped row (version order, never uuid order).\n        select id into v_task from clara.document_processing_tasks\n          where document_id=p_document and lane=v_lane\n            and status='failed' and error_code=v_gate\n          order by version_n desc limit 1;\n      end if;\n      -- 0038 as-built fix (2026-07-31): every statement-lane terminal receipt this core\n      -- mints reaches the spine as the STATEMENT twin with its reason -- and EXACTLY ONCE\n      -- per verdict instance: only the two acting branches (the flip, the fresh insert)\n      -- reach this emit; the re-read branch returned above. The wrapper\n      -- (enqueue_invoice_facts, recut in E2b) no longer emits its invoice twin for\n      -- statement lanes, so this is the single emit site on every caller path --\n      -- file_document's direct core calls included.\n      perform clara._append_event(d.firm_id,'document.statement_facts_failed',\n        null,null,null,null,\n        null,p_document,null,jsonb_build_object('task_id',v_task,'reason',v_gate));\n      return jsonb_build_object('task_id',v_task,'document_id',p_document,\n        'status','failed','reason',v_gate);\n    end if;",
"    end if;"
],
[
"  -- Only the AZURE lanes consume the page budget; classify, the local parse and the local\n  -- statement parse reserve nothing. 0038 adds statement_facts to the reserving set, which is\n  -- what \"the statement lane joins every existing spend control\" means concretely.\n  if v_lane in ('invoice_facts','statement_facts') then\n    v_pages := greatest(coalesce(d.page_count,1),1);",
"  -- Only the Azure lane consumes the page budget; classify + the local parse\n  -- reserve nothing.\n  if v_lane='invoice_facts' then\n    v_pages := greatest(coalesce(d.page_count,1),1);"
],
[
"    -- Delta-review round 2 (2026-07-31): the XML arm was KIND-BLIND -- a bank_statement\n    -- xml rode the myinvois local lane into the INVOICE parser (wrong worker, wrong\n    -- events, a phantom autodraft wake if it happened to parse). No xml statement parser\n    -- exists in C-b (the structured lane is csv/ofx by design 4.3), so the honest verdict\n    -- is the same terminal skipped_type a csv non-statement gets: never a misroute.\n    if d.document_kind='bank_statement' then\n      return jsonb_build_object('document_id',p_document,'status','skipped_type');\n    end if;\n",
""
],
[
"    -- 0038 as-built fix (2026-07-31, regression-cells lane finding): THIS branch, not the\n    -- claim-time belt, is the one a capped statement actually reaches -- the running attempt\n    -- sum already reads 3 when the next enqueue fires, so the pre-fail intercepts before any\n    -- claim exists to emit. Without an emit here the statement feed never learns its document\n    -- died. Statement lanes only: the invoice lane's enqueue-time cap has been event-silent\n    -- since 0026, and lighting it now would wake the autodraft consumer on a path Wave A\n    -- never exercised -- that silence stays, recorded here as a pre-existing residual.\n    if v_lane in ('statement_facts','statement_parse') then\n      perform clara._append_event(d.firm_id, 'document.statement_facts_failed',\n        null,null,null,null,\n        null,p_document,null,jsonb_build_object('task_id',v_task,'reason','attempt_cap'));\n    end if;\n",
""
],
[
"      -- 0038 as-built fix (2026-07-31): the statement lane's budget verdict reaches the\n      -- spine as the STATEMENT twin (single emit site -- the wrapper, recut in E2b,\n      -- suppresses its invoice twin for statement lanes). The invoice lane keeps its\n      -- pre-existing shape: silent here, emitted by the wrapper.\n      if v_lane='statement_facts' then\n        perform clara._append_event(d.firm_id,'document.statement_facts_failed',\n          null,null,null,null,\n          null,p_document,null,jsonb_build_object('task_id',v_task,'reason','budget'));\n      end if;\n",
""
]
]
};
function applyRestore0038(member, src) {
  for (const [frm, to] of RESTORE_0038[member]) {
    if (src.split(frm).length !== 2) {
      throw new Error(`0038 restore(${member}): pair not found exactly once -- the live body drifted from the ratified 0038 shape: ${frm.slice(0, 100)}`);
    }
    src = src.replace(frm, to);
  }
  return src;
}

const BYTE_IDENTICAL = {
  grant_client_egress: {
    sig: "clara.grant_client_egress(uuid,uuid,text,text)",
    len: 2352, sha: "45c9c5fe1e21d6e39c05f6d44b1b45ef5750e7f3d39d8010fa5fa191b54d81fd",
    exact: "86c35e8d529f2dc3cb824d7f63ba7cf75fda97c287fadf8562dacdf955d03dcf",
    acl: ["clara_fn_owner=X/clara_fn_owner", "clara_authenticated=X/clara_fn_owner"],
  },
  revoke_client_egress: {
    sig: "clara.revoke_client_egress(uuid,text,text)",
    len: 1348, sha: "1799808550d7f46fa651081e9f56b65062cddcf6203d1f937de19581242e43ec",
    exact: "192339765ddaab2f53f09020e7443b8c5fd236c9518e22362d130569d5c07e07",
    acl: ["clara_fn_owner=X/clara_fn_owner", "clara_authenticated=X/clara_fn_owner"],
  },
  // AMENDMENT A10 (ratified 2026-07-28, cross-model review Q1 — the 4th round on the
  // classify_document race review). §6's closed set gains a THIRD deliberately-changed
  // member (A7 was record_wiki_source_ingest, A9 was _enqueue_invoice_facts_core in 0025).
  // claim_document_processing_task now mints a random claim-secret CAPABILITY on every
  // fresh queued->running transition, storing ONLY its sha256 digest (new column,
  // claim_secret_digest) and returning the preimage ONLY to that claiming session — the
  // structural fix for Q1 (workflow_run_id is readable by any clara_runtime session via
  // 0008's table-wide SELECT, so it alone cannot authorize classify_document's settle).
  // Same discipline as A7/A9: the pin is NOT retuned — restore reverses exactly the three
  // textual insertions (the v_secret declare, the mint+digest-column line pair, and the
  // 'claim_secret' return key) and re-hashes the remainder against the UNCHANGED
  // 19-migration prestate, so the cell proves the ratified edit is present in its exact
  // shape AND that nothing else in this body moved (this function also carries 0011's
  // egress-hold lease-check machinery, itself already part of the untouched prestate —
  // the read-the-live-body discipline 0024/0025's own headers record).
  claim_document_processing_task: {
    sig: "clara.claim_document_processing_task(uuid,text,boolean)",
    len: 3637, sha: "d02763514e282f8f041137cc4aba5f3c8187019f4dfe543cf96edd5e7495acd9",
    exact: "f9da98aa7c3a7a37ee79f5e67e523429c83f10bf4247489946f66457e80f312d",
    acl: ["clara_fn_owner=X/clara_fn_owner", "clara_runtime=X/clara_fn_owner"],
    // F-A1 is the OUTERMOST (newest) layer: reverse it FIRST, on the raw live body, so the
    // 0038 pairs below then find the EXACT pre-F-A1 text they were derived against.
    restore: (src) => applyRestore0038("claim", applyRestoreFA1("claim", src))
      .replace(
        "  t record; d record; v_cap int; v_running int; v_attempts int;\n  v_clients int; v_consented int; v_hold_reason text; v_secret text;\n",
        "  t record; d record; v_cap int; v_running int; v_attempts int;\n  v_clients int; v_consented int; v_hold_reason text;\n",
      )
      .replace(
        "  -- Q1: the CAPABILITY minted on this fresh claim — a random preimage whose digest ALONE\n  -- is stored (never the preimage). Returned once, below, to this session only.\n  v_secret:=gen_random_uuid()::text;\n  update clara.document_processing_tasks set status='running',\n    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1,\n    claim_secret_digest=sha256(convert_to(v_secret,'UTF8'))\n    where id=p_task;\n",
        "  update clara.document_processing_tasks set status='running',\n    workflow_run_id=p_workflow_run_id,started_at=now(),attempt_count=attempt_count+1\n    where id=p_task;\n",
      )
      .replace(
        "    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size,\n    'claim_secret',v_secret);\n",
        "    'sha256',d.sha256,'mime_type',d.mime_type,'byte_size',d.byte_size);\n",
      ),
    restoreMust: [
      // Widened to admit EITHER the 0038-only three-lane form (checked after F-A1's own
      // reversal has already run but before 0038's) OR the F-A1 four-lane form the live
      // body actually carries today — an unqualified three-lane literal no longer occurs
      // verbatim once llm_witness joins the list.
      /lane in \('ocr','invoice_facts','statement_facts'(,'llm_witness')?\)/,
      /if t\.lane in \('invoice_facts','statement_facts'(,'llm_witness')?\) then/,
      /v_secret:=gen_random_uuid\(\)::text;/,
      /claim_secret_digest=sha256\(convert_to\(v_secret,'UTF8'\)\)/,
      /'claim_secret',v_secret\);/,
      // F-A1's own markers: present in the live body, must be GONE after the full reversal.
      /t\.lane='llm_witness'/,
      /document\.llm_witness_failed/,
      /llm_witness_concurrency/,
    ],
  },
  // AMENDMENT (ratified 2026-07-28, owner ruling on task #27 — Gate P blocker: "the facts
  // lane excludes 'receipt', where Malaysian SST actually lives" — AUTO-ROUTE ALL RECEIPTS).
  // Migration 0025 is the SECOND deliberate edit to this closed set (the FIRST being A7's
  // record_wiki_source_ingest below), and — like A7 — it is TWO ratified edits, not one:
  //   (a) widens the kind gate's admitted list from three kinds to four (task #27 itself).
  //   (b) P4 (cross-model review, third round): locks the document row (FOR UPDATE) before
  //       reading its kind, closing the SAME-SHAPED TOCTOU O2 closed on request_reextraction
  //       — a concurrent classify_document/set_document_kind call could otherwise commit a
  //       kind change this function would route on a stale snapshot of.
  // Same discipline as A7: `restore` REVERSES BOTH edits and the remainder is compared
  // against the UNCHANGED 19-migration prestate, so this cell proves both that the ratified
  // edits are present in their exact shape AND that nothing else in this body moved (the
  // read-the-live-body-not-the-file discipline 0025's own header records — a wrong-base CoR
  // would fail THIS reversal in an entirely different way, not just at the final hash).
  //
  // AMENDMENT A11 (ratified 2026-07-28, ledger #32, Gate-S critical path — migration 0026).
  // §6's closed set gains a FOURTH deliberate edit — the THIRD to THIS specific member
  // (A9 above was the second). 0026 widens document_processing_tasks' unique key to
  // (document_id,engine_id,version_n,lane); this function's own ON CONFLICT target needed
  // no edit (it was already the unqualified `on conflict do nothing`, which matches ANY
  // unique violation regardless of column list), but its FALLBACK does: the re-select is
  // now unconditional on status (a genuine same-lane conflict may already be terminal by
  // the time it looks again) and RAISES impossible-state (CLR35) if the colliding row
  // cannot be found — where it used to silently return {"task_id": null, "status": null},
  // which is the exact silence Gate-S measured. A new local variable (v_task_status)
  // replaces the old code's re-use of the `t` record's status field. Same discipline as
  // A7/A9: `restore` reverses this edit FIRST (it is textually outermost — the 0026 block
  // wraps around, not inside, A9's own two edits) and then A9's two, and the remainder is
  // compared against the UNCHANGED 19-migration prestate.
  _enqueue_invoice_facts_core: {
    sig: "clara._enqueue_invoice_facts_core(uuid)",
    len: 4312, sha: "86ff810a99e7bf230017f8565d930b64c16e4f6c6e16cd6084a5cebdff1a27f0",
    exact: "0165a1f471a6f29e01ff759f982d19175d0553ed4a811971b42d2dd197dd103e",
    acl: ["clara_fn_owner=X/clara_fn_owner"],
    // F-A2 is the OUTERMOST (newest) layer: reverse it FIRST (the one engine-literal + comment
    // block), then F-A1 PR-3 (the invoice-kind mint arm + the already_completed engine_kind
    // map, both in the earlier mime-routing block PR-1 never touched), then F-A1 PR-1 (the ONE
    // inert llm_witness elsif branch, wall 6, in the later consent-gate block PR-3 never
    // touched), so 0038's own pairs then find the exact pre-F-A1 text.
    restore: (src) => applyRestore0038("router", applyRestoreFA1("router",
      applyRestoreFA1PR3("router", applyRestoreFA2Engine("router", src))))
      .replace(
        "  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;\n  v_lane text; v_engine text; v_task_status text;\n",
        "  d record; t record; v_task uuid; v_version int; v_attempts int; v_pages int;\n  v_lane text; v_engine text;\n",
      )
      .replace(
        "  if v_task is null then\n"
        + "    -- 0026 (amendment A11): the widened (document_id,engine_id,version_n,lane) key means a\n"
        + "    -- conflict HERE is now a genuine same-lane duplicate — a cross-lane collision is\n"
        + "    -- structurally impossible, lane joins the key. The exact colliding row must exist\n"
        + "    -- regardless of its current status (it may already be done/failed by the time we look\n"
        + "    -- again); silence hid this for the product's whole life, so an absent row here is\n"
        + "    -- impossible-state-loud, not a null task_id.\n"
        + "    select id,status into v_task,v_task_status from clara.document_processing_tasks\n"
        + "      where document_id=p_document and engine_id=v_engine and version_n=v_version and lane=v_lane;\n"
        + "    if v_task is null then\n"
        + "      raise exception 'impossible state: an ON CONFLICT fired for (document=%,engine=%,version=%,lane=%) but no row exists at that key',\n"
        + "        p_document,v_engine,v_version,v_lane using errcode='CLR35';\n"
        + "    end if;\n"
        + "    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',v_task_status);\n"
        + "  end if;",
        "  if v_task is null then\n"
        + "    select id,status into v_task,t.status from clara.document_processing_tasks\n"
        + "      where document_id=p_document and lane=v_lane\n"
        + "        and status in ('queued','held_egress','running') order by id limit 1;\n"
        + "    return jsonb_build_object('task_id',v_task,'document_id',p_document,'status',t.status);\n"
        + "  end if;",
      )
      .replace(
        "d.document_kind in ('invoice','credit_note','debit_note','receipt')",
        "d.document_kind in ('invoice','credit_note','debit_note')",
      )
      .replace(
        "select * into d from clara.documents where id=p_document for update;",
        "select * into d from clara.documents where id=p_document;",
      ),
    restoreMust: [
      /v_task_status text;/,
      /amendment A11/,
      /d\.document_kind in \('invoice','credit_note','debit_note','receipt'\)/,
      /where id=p_document for update;\n {2}if not found then raise exception 'document not found'/,
      // F-A1 PR-1's own marker: present in the live body, must be GONE after the full reversal.
      /elsif v_lane='llm_witness' then/,
      /witness_multi_client/,
      /witness_consent_inactive/,
      // F-A1 PR-3's own markers (the cutover): present in the live body, must be GONE after
      // the full reversal. THE ENGINE VERSION IS F-A2's, not PR-3's: opener ② moved the mint
      // arm's literal :v1 -> :v2, so :v2 is what the LIVE body carries and :v1 is now an
      // INTERMEDIATE state that exists only between the F-A2 reversal and the PR-3 one. Pinning
      // :v1 here would assert the live body still carries a literal the newest ratified layer
      // deliberately replaced.
      /v_lane:='llm_witness'; v_engine:='llm-openai:gpt-5\.6-terra:v2';/,
      /then 'llm_text_facts'/,
      /if v_task is null and v_lane='llm_witness' then/,
    ],
  },
  // AMENDMENTS A6→A7 (ratified 2026-07-25, contract v1.4 §5.6/§5.7). This is the ONE member of
  // §6's closed set that 0020 deliberately changes, and A7 makes it TWO edits, not one: the
  // CANONICAL SOURCE-PAGE FORM (title and body derived from the document uuid alone — no
  // p_note, no original_filename) and the note floor, now placed BEHIND _reserve_op so op-key
  // replay still replays. The pins below are therefore NOT retuned to post-A7 hashes —
  // retuning would reduce this cell to "it is whatever it is now" and would silently absorb any
  // OTHER edit shipped in the same migration. Instead `restore` REVERSES both ratified edits
  // and the remainder is compared against the UNCHANGED 19-migration prestate, so the cell
  // proves both halves: both edits are present in their exact shape, and nothing else in that
  // body moved. This mirrors the migration's own §6 tail assertion.
  record_wiki_source_ingest: {
    sig: "clara.record_wiki_source_ingest(uuid,uuid,text,text)",
    len: 2515, sha: "65609d6f4a9e0399985f5568f960ae6cbcc7457bb372ee38c4520bf20662aaac",
    exact: "0c3adf2dc31ff2780df85b27ae3d5a09f76ae7f98cf7b816d557c74c8fdb484c",
    acl: ["clara_fn_owner=X/clara_fn_owner", "clara_runtime=X/clara_fn_owner"],
    restore: (src) => src
      .replace(/\n {2}-- \[0020 A7] THE DETERMINISTIC-CONTENT FLOOR,[\s\S]*?\n {2}end if;/, "")
      .replace(/\n {2}-- \[0020 A7] THE CANONICAL SOURCE-PAGE FORM\.[\s\S]*?\n {2}v_content:=/,
        "\n  v_content:=")
      .replace("v_content:='Source document: '||p_document::text;",
        "v_content:=coalesce(nullif(btrim(p_note),''),\n"
        + "    'Source document: '||coalesce(d.original_filename,p_document::text));")
      .replace("v_title:='Source: '||p_document::text;",
        "v_title:='Source: '||coalesce(d.original_filename,p_document::text);"),
    restoreMust: [
      /source_note_not_permitted/,
      /v_content:='Source document: '\|\|p_document::text;/,
      /v_title:='Source: '\|\|p_document::text;/,
    ],
  },
};

/** The 19-migration prestate's structural fingerprint of the LEGACY relation:
 *  constraints + indexes + non-internal triggers + policies, serialized in a
 *  stable order. §6 says every one of these is unchanged. */
const LEGACY_TABLE_SHA = "8dbdff82c3338a9ba5811428e0b412cabdda57944b8de63a4ead08c9e5751523";

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function legacyTableFingerprint() {
  const rel = `clara.${LEGACY_CONSENT_TABLE}`;
  const cons = await rootQuery(
    "select conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid=$1::regclass order by conname", [rel]);
  const idx = await rootQuery(
    "select indexrelid::regclass::text n, pg_get_indexdef(indexrelid) d from pg_index where indrelid=$1::regclass order by 1", [rel]);
  const trg = await rootQuery(
    "select tgname from pg_trigger where tgrelid=$1::regclass and not tgisinternal order by 1", [rel]);
  const pol = await rootQuery(
    "select polname, pg_get_expr(polqual,polrelid) q from pg_policy where polrelid=$1::regclass order by 1", [rel]);
  const blob = JSON.stringify({ cons: cons.rows, idx: idx.rows, trg: trg.rows, pol: pol.rows });
  return { blob, sha: sha256(blob) };
}

async function freshClient(tag) {
  const c = await createClient(w.users.alice, { name: `${w.prefix}_${tag}`, opKey: opk("cli") });
  await seedOpeningCoa(w.users.alice, c);
  return c;
}

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-legacy"); await endPool(); });

test("META: 0020 applied — the legacy byte-identity battery is armed", async () => {
  fail0020(live);
  assert.ok(w, "world built");
});

test("[0020 §6 — THE exact-diff pin]: the five closed-set functions have ONE overload each, the SAME identity signature, and a normalized prosrc BYTE-IDENTICAL to the 19-migration prestate", async () => {
  fail0020(live);
  const drift = [];
  for (const [name, pin] of Object.entries(BYTE_IDENTICAL)) {
    assert.equal(await overloadCount(name), 1,
      `clara.${name} has EXACTLY one overload (0020 added no sibling)`);
    const facts = await fnFacts(pin.sig);
    assert.ok(facts, `${pin.sig} resolves — the EXACT argument signature is unchanged`);
    // [A7] For the one deliberately-amended member, REVERSE exactly the two ratified edits and
    // hold the REMAINDER to the untouched prestate pins. The assertions around it make the
    // reversal itself load-bearing: every ratified marker must be present BEFORE it and absent
    // AFTER it, and the reversal must actually change something — so this cannot degrade into
    // "rewrite whatever makes the hash match".
    let src = facts.src;
    if (pin.restore) {
      for (const must of pin.restoreMust) {
        assert.match(src, must, `${name}: a ratified A7 edit is MISSING from the live body`);
      }
      src = pin.restore(facts.src);
      assert.notEqual(src, facts.src,
        `${name}: the A7 reversal matched nothing — it has drifted from the migration's`);
      for (const must of pin.restoreMust) {
        assert.doesNotMatch(src, must,
          `${name}: the reversal must undo the WHOLE edit, not part of it`);
      }
    }
    const n = normSrc(src);
    if (sha256(n) !== pin.sha) {
      drift.push(`${name}: prestate len=${pin.len} sha=${pin.sha} → now len=${n.length} sha=${sha256(n)}`);
    }
    // R1-F4: the pin §6 actually promises. Normalization is a readability aid, not identity.
    if (sha256(src) !== pin.exact) {
      drift.push(`${name}: EXACT prosrc sha ${pin.exact} → ${sha256(src)} (a change invisible to the normalized digest is still a change)`);
    }
    assert.equal(facts.secdef, true, `${name} is still SECURITY DEFINER`);
    assert.equal(facts.owner, ROLES.fnOwner, `${name} is still owned by clara_fn_owner`);
    assert.match(String(facts.config), /search_path=clara/, `${name} keeps its pinned search_path`);
  }
  assert.deepEqual(drift, [],
    `§6 declares these bodies BYTE-IDENTICAL. 0020 changed:\n  ${drift.join("\n  ")}\nA legitimate change here needs a contract amendment, not a test edit.`);
});

test("[0020 §6]: the closed set's ACLs are unchanged — grant/revoke stay clara_authenticated, the claim body stays clara_runtime, and _enqueue_invoice_facts_core stays UNGRANTED", async () => {
  fail0020(live);
  for (const [name, pin] of Object.entries(BYTE_IDENTICAL)) {
    const r = await rootQuery(
      "select coalesce(array_to_string(p.proacl,'|'),'(null)') acl from pg_proc p where p.oid=to_regprocedure($1)",
      [pin.sig]);
    const acl = String(r.rows[0].acl).split("|").filter(Boolean).sort();
    assert.deepEqual(acl, [...pin.acl].sort(),
      `clara.${name} ACL unchanged (got ${acl.join("|")})`);
  }
});

test("[0020 §6 — THE structural pin]: clara.client_egress_consents' constraints, indexes, triggers and policy are BYTE-IDENTICAL to the 19-migration prestate", async () => {
  fail0020(live);
  const { blob, sha } = await legacyTableFingerprint();
  assert.equal(sha, LEGACY_TABLE_SHA,
    `the legacy consent relation's structure changed under 0020.\nNOW: ${blob}`);
  // The two properties that make §1.1's two fatal failure modes unreachable.
  assert.ok(blob.includes("uq_client_egress_consents_one_live ON clara.client_egress_consents USING btree (client_id) WHERE (revoked_at IS NULL)"),
    "the one-live index is still keyed on (client_id) ALONE — a per-purpose relaxation here would let two live rows coexist and make revoke_client_egress nondeterministic");
  assert.ok(!/purpose/i.test(blob), "no purpose vocabulary anywhere in the legacy relation's structure");
});

test("[0020 §6/§9.2]: the 0015 invoice-facts predicate still names ONLY clara.client_egress_consents — it can never see a typed row, structurally", async () => {
  fail0020(live);
  const src = normSrc((await fnFacts(BYTE_IDENTICAL.claim_document_processing_task.sig)).src);
  assert.ok(src.includes("clara.client_egress_consents"),
    "the claim body reads the LEGACY consent relation (the purpose-blind predicate, 0015)");
  assert.ok(!src.includes(TYPED_CONSENT_TABLE),
    `the claim body does NOT read clara.${TYPED_CONSENT_TABLE} — this is the property the separate-relation decision buys (§6)`);
  assert.ok(!src.includes("client_egress_purpose_activations"),
    "…nor the activation relation");
  assert.ok(!src.includes("prepare_egress_dispatch") && !src.includes("consume_egress_dispatch"),
    "…and carries no call edge into the 0020 authorization surface");
});

test("[0020 §6/§9.2]: the legacy grant/revoke RECEIPTS, EVENT payloads and OP HASHES are byte-identical to as-built — and the 0014 event reroute (evidence in the payload, never the typed document_id column) is preserved", async () => {
  fail0020(live);
  const client = await freshClient("lg_receipt");
  const ev1 = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  const gKey = opk("lgg");
  const grantReceipt = await grantClientEgress(w.users.alice, {
    client, evidenceDocument: ev1.documentId, scopeNote: "byte-identity probe", opKey: gKey });
  assert.deepEqual(Object.keys(grantReceipt).sort(), ["consent_id", "status"],
    `the legacy grant receipt is EXACTLY {consent_id,status} (got ${JSON.stringify(grantReceipt)})`);
  assert.equal(grantReceipt.status, "live", "…status 'live'");
  const gEvents = await eventsOf(w.firms.A, "egress.consent_granted", grantReceipt.consent_id);
  assert.equal(gEvents.length, 1, "exactly one egress.consent_granted event");
  assert.equal(gEvents[0].document_id, null,
    "the 0014 reroute holds: the evidence document is NOT in the typed document_id column");
  assert.deepEqual(Object.keys(gEvents[0].payload).sort(), ["consent_id", "evidence_document_id"],
    `the legacy grant payload is EXACTLY {consent_id,evidence_document_id} — 0020 added no purpose key (got ${JSON.stringify(gEvents[0].payload)})`);

  const rKey = opk("lgr");
  const revokeReceipt = await revokeClientEgress(w.users.alice, { client, reason: "byte-identity probe", opKey: rKey });
  assert.deepEqual(Object.keys(revokeReceipt).sort(), ["consent_id", "status"],
    `the legacy revoke receipt is EXACTLY {consent_id,status} (got ${JSON.stringify(revokeReceipt)})`);
  assert.equal(revokeReceipt.status, "revoked");
  const rEvents = await eventsOf(w.firms.A, "egress.consent_revoked", revokeReceipt.consent_id);
  assert.deepEqual(Object.keys(rEvents[0].payload).sort(),
    ["consent_id", "evidence_document_id", "reason"],
    `the legacy revoke payload is EXACTLY {consent_id,evidence_document_id,reason} (got ${JSON.stringify(rEvents[0].payload)})`);
  // The OP HASH: a same-key/different-args replay must still be CLR10, and a
  // same-key/same-args replay must return the stored receipt byte-identically.
  const replay = await grantClientEgress(w.users.alice, {
    client, evidenceDocument: ev1.documentId, scopeNote: "byte-identity probe", opKey: gKey });
  assert.deepEqual(replay, grantReceipt, "the legacy grant's op receipt replays BYTE-IDENTICALLY");
  assert.ok(await opReceiptRow("grant_client_egress", gKey), "…from clara.op_receipts under the same fn/key");
  await assertRaises("CLR10",
    () => grantClientEgress(w.users.alice, {
      client, evidenceDocument: ev1.documentId, scopeNote: "DIFFERENT note", opKey: gKey }),
    "the legacy grant's op-hash mismatch");
});

test("[0020 §6/§9.7 — the wave-a-egress invariant, verbatim]: with a typed consent ALSO live, 'exactly one LIVE consent row per client' still holds on the legacy relation, and grant→revoke→grant still leaves ≥2 audit rows", async () => {
  fail0020(live);
  const client = await freshClient("lg_invariant");
  const ev1 = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  const ev2 = await filedDocument(w.users.alice, { firm: w.firms.A, client });
  // A typed consent is live for the SAME client — the exact shape that would have
  // broken the invariant had typed purposes landed on the legacy table.
  const typedEv = await consentEvidenceDoc(w.users.alice, { firm: w.firms.A });
  await grantPurpose(w.users.alice, { client, evidenceDocument: typedEv.documentId, opKey: opk("lg_tp") });
  assert.ok(await livePurposeConsent(client), "the typed consent is live");

  await grantClientEgress(w.users.alice, { client, evidenceDocument: ev1.documentId, scopeNote: "grant 1" });
  await assertRaisesOneOf(["CLR28", "23505"],
    () => grantClientEgress(w.users.alice, { client, evidenceDocument: ev2.documentId, scopeNote: "dup" }),
    "a SECOND live legacy consent while one is live");
  await revokeClientEgress(w.users.alice, { client, reason: "rotate" });
  await grantClientEgress(w.users.alice, { client, evidenceDocument: ev2.documentId, scopeNote: "grant 2" });
  assert.equal(await liveLegacyConsentCount(client), 1,
    "exactly ONE live legacy consent row per client (wave-a-egress.test.mjs:175-176, unchanged)");
  assert.ok(await countRows(LEGACY_CONSENT_TABLE, "where client_id=$1", [client]) >= 2,
    "grant→revoke→grant left ≥2 legacy audit rows");
  // …and the revoker found the RIGHT row every time: the typed consent is untouched.
  assert.ok(await livePurposeConsent(client),
    "the typed consent survived two legacy revocations — §1.1(b)'s nondeterministic-revocation failure mode is structurally unreachable");
});

test("[0020 §6 / §1.3]: the 0012 owner-declaration path (null evidence document) is STILL available on the legacy writer, and STILL unavailable on the typed one", async () => {
  fail0020(live);
  const client = await freshClient("lg_ownerdecl");
  // Legacy: a null evidence document is accepted (0012(A), untouched by 0020).
  const r = await grantClientEgress(w.users.alice, {
    client, evidenceDocument: null, scopeNote: "owner declaration — 0012(A) path" });
  assert.equal(r.status, "live", "the legacy owner-declaration path still works");
  // Typed: the same input is refused. Typed consent starts where ADR-024 ended.
  await assertRaises("CLR28",
    () => grantPurpose(w.users.alice, { client, evidenceDocument: null, opKey: opk("lg_td") }),
    "the typed writer's owner-declaration path");
  assert.equal(await countRows(TYPED_CONSENT_TABLE, "where client_id=$1", [client]), 0,
    "no typed consent row from the refused declaration");
  noteLane("[0020 §1.3] the 0012 evidence-optional weakening remains scoped to the LEGACY relation exactly as §1.3 states; typed consent has no owner-declaration path");
});

test("[0020 §6]: 0020 introduced NO new SQLSTATE — every 0020 function body raises only codes that already existed at 19", async () => {
  fail0020(live);
  // §7.1: "0020 introduces no new error codes." The prestate's Clara families run
  // CLR01..CLR34 (0017's four provisional families landed as CLR31..CLR34).
  const bad = await rootQuery(`
    select p.oid::regprocedure::text sig, m[1] code
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      cross join lateral regexp_matches(p.prosrc, 'CLR[0-9]{2}', 'g') m
     where n.nspname='clara'
       and p.proname in ('prepare_egress_dispatch','consume_egress_dispatch',
                         'resolve_document_client','resolve_and_ingest_wiki_source',
                         'classify_consent_evidence_document',
                         'grant_client_egress_purpose','activate_client_egress_purpose',
                         'deactivate_client_egress_purpose','revoke_client_egress_purpose')
       and m[1] !~ '^CLR(0[1-9]|1[0-2]|2[0-9]|3[0-4])$'
     order by 1`);
  assert.equal(bad.rows.length, 0,
    `0020 raised an out-of-family SQLSTATE: ${bad.rows.map((r) => `${r.sig}:${r.code}`).join(", ")}`);
});
