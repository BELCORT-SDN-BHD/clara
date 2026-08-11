// Wave B — migration 0019 §4: the `document.filing_retired` → stale CONSUMER
// LANE, unit half (no DB). Written by the CONTRACT-BLIND test lane straight from
// `docs/plan/completed/wave-b-migration-0019-design.md` v1.0 §4/§5/§10 — the 0019 consumer
// diff is NEVER read. A divergence between an expectation here and observed
// behaviour is a FINDING for orchestrator adjudication, never a silent edit.
//
// These are the cells the DB battery structurally cannot reach (@clara/db has no
// dependency on @clara/runtime): the subscription-set membership, the planEvent
// case and its receipt shape, the null-key terminal, and — explicitly required by
// §4 — the PER-EVENT surface gate when the writer is absent.
//
// AMBIGUITIES this lane encodes:
//   [D19-20] §4 pins the null-key terminal as `skip('skipped_kind')` but leaves
//            the MISSING-SURFACE status unnamed ("a checkpoint-only skip").
//            Encoded as: mutate === null and a status beginning 'skipped'. A
//            concrete name at integration is a finding, not a failure here.
//   [D19-21] §4 pins the gate as "a to_regprocedure check on
//            clara.mark_wiki_citations_stale (the wikiColdStartReady pattern …
//            evaluated per event here)" without pinning the probe's column name.
//            The stub answers any to_regproc* probe with several plausible
//            column shapes at once, so the cell tests the BEHAVIOUR (skip vs
//            plan) rather than the query text.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { planEvent, WIKI_PROJECTION_EVENT_TYPES } from "../lib/wiki-projection.mjs";

const FIRM = randomUUID();
const CLIENT = randomUUID();
const DOC = randomUUID();
const SEQ = 4242;
const STALE_REASON = "source_filing_retired";

/** A stubbed pg client. `surface` drives the §4 per-event writer-presence gate;
 *  every plausible column name for that probe is answered at once [D19-21]. */
function stubClient({ status = "active", surface = true } = {}) {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql), params });
      const s = String(sql);
      if (/to_regproc/i.test(s)) {
        const reg = surface ? "clara.mark_wiki_citations_stale(uuid,uuid,text,text)" : null;
        return {
          rows: [{
            surface, ready: surface, present: surface, ok: surface, exists: surface,
            writer: surface, reg, to_regprocedure: reg, to_regproc: reg,
          }],
          rowCount: 1,
        };
      }
      if (/from clara\.clients/.test(s)) return { rows: [{ status }], rowCount: 1 };
      if (/projected_from_seq/.test(s)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
}

const retiredEvent = (over = {}) => ({
  seq: SEQ, id: randomUUID(), firmId: FIRM, eventType: "document.filing_retired",
  clientId: CLIENT, documentId: DOC, payload: { filing_id: randomUUID() }, ...over,
});

const isSkip = (plan) => plan.mutate == null && String(plan.status ?? "").startsWith("skipped");

test("[0019 §4]: document.filing_retired JOINS the wiki-projection subscription set", () => {
  assert.ok([...WIKI_PROJECTION_EVENT_TYPES].includes("document.filing_retired"),
    `the lane subscribes the retirement event — without it the loop treats it as a checkpoint-only advance and the citation stays unmarked forever (got ${JSON.stringify([...WIKI_PROJECTION_EVENT_TYPES].sort())})`);
  // …and nothing else was added: the amendment-4 event is DROPPED, so there is
  // no wiki.* type in the subscription set to loop on.
  assert.ok(![...WIKI_PROJECTION_EVENT_TYPES].some((t) => t.startsWith("wiki.")),
    "NO wiki.* type is subscribed — the lane's own effects emit no event, so there is no self-subscription");
  // MIGRATION 0020 WIDENED THE SET, and 0019's own §4 is unaffected by the widening.
  // The closed-set assertion below was written when 0019 was the tip; it read "the
  // 0017 seven PLUS document.filing_retired". 0020 §5.4 adds `document.filed` — the
  // OTHER half of the filing-topology surface, without which a document classified
  // while unfiled can only ever be re-driven by a RETIREMENT — and §4.2 adds the four
  // `egress.purpose_*` typed events for observability and ordering. Each addition is
  // document.* or egress.*, so the P17 property this cell actually guards (no wiki.*
  // self-subscription, asserted above) is untouched. Re-aimed, not relaxed: the set is
  // still pinned EXACTLY, and 0019's own membership claim is asserted first.
  assert.deepEqual([...WIKI_PROJECTION_EVENT_TYPES].sort(), [
    "counterparty.created", "counterparty.merged", "document.classified",
    "document.filed", "document.filing_retired",
    "egress.consent_granted", "egress.consent_revoked",
    "egress.purpose_activated", "egress.purpose_consent_granted",
    "egress.purpose_consent_revoked", "egress.purpose_deactivated",
    "entry.approved", "seeding.proposal_decided",
  ], "the subscription set is the 0017 seven PLUS 0019's document.filing_retired PLUS 0020's document.filed + four egress.purpose_* types");
});

test("[0019 §4]: the plan is {status:'citations_staled', lane:'filing_retired'} and its mutate calls the writer with the pinned args", async () => {
  const plan = await planEvent(stubClient(), { firmId: FIRM, ev: retiredEvent(), deps: {} });
  assert.equal(plan.status, "citations_staled", `the declared receipt status (got ${plan.status})`);
  assert.equal(plan.lane, "filing_retired", `the declared lane (got ${plan.lane})`);
  assert.equal(typeof plan.mutate, "function", "the plan carries a mutate");
  const cap = stubClient();
  await plan.mutate(cap);
  const call = cap.calls.find((x) => /mark_wiki_citations_stale/.test(x.sql));
  assert.ok(call, "mutate calls clara.mark_wiki_citations_stale");
  // The DB signature is (p_client, p_document, p_reason, p_op_key) — the order is
  // structural, not a style choice, so the positions are pinned.
  assert.equal(call.params[0], CLIENT, "p_client = the event's client_id");
  assert.equal(call.params[1], DOC, "p_document = the event's document_id");
  assert.equal(call.params[2], STALE_REASON, "p_reason = the single pinned reason");
  assert.equal(call.params[3], `wikistale:${CLIENT}:${SEQ}`,
    "p_op_key = the seq-embedded idiom `wikistale:<client>:<seq>` (the shape wikihold/wikiproj already use) — at-least-once safety depends on it");
  // The lane appends NOTHING: no publication, no event.
  assert.ok(!cap.calls.some((x) => /publish_wiki_page_version|_append_event/.test(x.sql)),
    "the stale lane publishes nothing and appends no event (amendment 4)");
});

test("[0019 §4]: a NULL client or a NULL document is a CHECKPOINT-ONLY SKIP — never a dead-letter, never a call with nulls", async () => {
  for (const [over, label] of [
    [{ clientId: null }, "a null clientId"],
    [{ documentId: null }, "a null documentId"],
    [{ clientId: null, documentId: null }, "both keys null"],
  ]) {
    const c = stubClient();
    const plan = await planEvent(c, { firmId: FIRM, ev: retiredEvent(over), deps: {} });
    assert.ok(isSkip(plan), `${label} → a checkpoint-only skip (got ${JSON.stringify({ status: plan.status, mutate: typeof plan.mutate })})`);
    assert.ok(!c.calls.some((x) => /mark_wiki_citations_stale/.test(x.sql)),
      `${label} → the writer is NEVER called with a null key`);
  }
});

test("[0019 §4/D19-20]: with the WRITER ABSENT the lane is a checkpoint-only skip — the load-bearing safety of the runtime-image-first ceremony", async () => {
  // Window A of §11 (new image deployed, 0019 not yet applied) is EXPOSURE:NONE
  // only because of this gate. It must be evaluated PER EVENT, not once at cold
  // start, or the first retirement after deploy dead-letters.
  const c = stubClient({ surface: false });
  const plan = await planEvent(c, { firmId: FIRM, ev: retiredEvent(), deps: {} });
  assert.ok(isSkip(plan),
    `the absent writer makes the event a checkpoint-only skip, NOT a dead-letter (got ${JSON.stringify({ status: plan.status, mutate: typeof plan.mutate })})`);
  // The surface PROBE necessarily names the function, so a bare name match would flag
  // the gate itself. What must never happen is an INVOCATION.
  assert.ok(!c.calls.some((x) => /mark_wiki_citations_stale/.test(x.sql) && !/to_regproc/i.test(x.sql)),
    "…and the absent function is never INVOKED (the to_regprocedure probe naming it does not count)");
  assert.ok(c.calls.some((x) => /to_regproc/i.test(x.sql)),
    "…because the lane probed the surface for THIS event");
  // …and with the surface back, the same event plans normally.
  const back = await planEvent(stubClient({ surface: true }), { firmId: FIRM, ev: retiredEvent(), deps: {} });
  assert.equal(back.status, "citations_staled", "the gate is not sticky — the surface returning re-arms the lane");
});

test("[0019 §5/§4]: the CLR32 reason `stale_projected_from_seq` maps to 'already_projected', not 'skipped_bad_state'", async () => {
  // Unknown CLR32 reasons currently fall through to 'skipped_bad_state', which
  // would misreport a benign convergence as a malformed write. terminalStatusFor
  // is not exported today, so this cell asserts the mapping through the module's
  // public surface if it is exported, and otherwise records the gap loudly.
  const mod = await import("../lib/wiki-projection.mjs");
  const mapper = mod.terminalStatusFor;
  assert.ok(typeof mapper === "function",
    "terminalStatusFor must be EXPORTED for the §4 mapping to be unit-testable (it is module-private in the 0017/v25 shape — exporting it is this lane's request)");
  const err = Object.assign(new Error("wiki page version is not newer"), {
    code: "CLR32", detail: JSON.stringify({ reason: "stale_projected_from_seq" }),
  });
  assert.equal(mapper(err), "already_projected",
    "CLR32/stale_projected_from_seq → 'already_projected' → checkpointOnly");
  const other = Object.assign(new Error("wiki page metadata is malformed"), {
    code: "CLR32", detail: JSON.stringify({ reason: "bad_state" }),
  });
  assert.equal(mapper(other), "skipped_bad_state",
    "…and every OTHER CLR32 reason keeps its existing mapping (the change is additive)");
});
