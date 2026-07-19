// Slice-6 matcher regression: the seven new S6 event types are NON-matcher events —
// the matcher must walk past them (checkpoint-only advance) and NEVER run its lane-1/
// lane-2 effects on them. Load-bearing case: `document.invoice_facts_completed` carries
// an `extraction_id` in its payload (like the matcher's own trigger), yet the matcher
// keys on event_type ONLY, so a facts completion must not be mistaken for the layout
// `document.extraction_completed` that legitimately drives attribution.
//
// 0009-GATED: the seven types are registered in `event_types` by 0009 (their taxonomy
// coupling is a 0009 additive pair), and `_append_event` rejects an unregistered type.
// The test therefore uses the REAL registered names and SKIPS until 0009 is applied — it
// never self-registers them (that would collide with 0009's own plain INSERT on a
// migrate-onto-existing DB). Contract §7 / companion §1; INTERFACE-PINS §5(C).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  skip,
  rootQuery,
  headSeq,
  buildFirmWithClients,
  seedVerifiedDocument,
  seedExtraction,
  drainMatcher,
  attemptsFor,
  ruleResolutionsFor,
  matcherCheckpoint,
  emitExtractionCompleted,
} from "./matcher-testkit.mjs";

// The additive coupled event pairs 0009 inserts into the ACTIVE taxonomy (companion §1).
const S6_EVENT_TYPES = [
  "counterparty.created",
  "entry.revised",
  "entry.withdrawn",
  "coding_task.opened",
  "coding_task.closed",
  "document.invoice_facts_completed",
  "document.invoice_facts_failed",
];

// 0009 surface probe (counterparties table + revise_entry fn) — the S6 event types are
// registered by 0009, so skip cleanly until it is applied.
async function s6Ready() {
  const r = await rootQuery(
    `select (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='clara' and c.relname='counterparties' limit 1) as tbl,
            (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='clara' and p.proname='revise_entry' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}
const skip6 = skip || ((await s6Ready()) ? false : "Slice-6 (0009) coding-floor surface absent — migrate 0009 first");

/** Append one event of an arbitrary type via the audited helper (superuser EXECUTE). */
async function emitEvent(firm, type, { document = null, payload = {} } = {}) {
  const r = await rootQuery(
    "select clara._append_event($1,$2,null,null,null,null,null,$3,null,$4::jsonb) as seq",
    [firm, type, document, JSON.stringify(payload)],
  );
  return Number(r.rows[0].seq);
}

test("matcher walks past every new Slice-6 event type with zero effects", { skip: skip6 }, async () => {
  const { owner, firm } = await buildFirmWithClients(1);
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  const before = (await attemptsFor(document)).length;

  // Emit all seven new types; the facts-completed one carries an extraction_id payload
  // exactly like the matcher's real trigger — the discriminant is the type, not the shape.
  for (const t of S6_EVENT_TYPES) {
    await emitEvent(firm, t, { document, payload: { extraction_id: randomUUID() } });
  }

  await drainMatcher(firm);

  assert.equal(await matcherCheckpoint(firm), await headSeq(firm), "checkpoint walked to head over all new S6 events");
  assert.equal((await attemptsFor(document)).length, before, "no attribution attempt created by any new S6 event");
  assert.equal((await ruleResolutionsFor(firm, document)).length, 0, "no rule resolution triggered by any new S6 event");
});

test("interleaved: only document.extraction_completed drives the matcher, not invoice_facts_completed", { skip: skip6 }, async () => {
  const { owner, firm } = await buildFirmWithClients(1);
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });

  // A facts-completed event (its own facts extraction) BEFORE the layout trigger, and
  // another AFTER — only the single layout extraction_completed may produce an attempt.
  const factsExtA = await seedExtraction({ firm, document, versionN: 2 });
  await emitEvent(firm, "document.invoice_facts_completed", { document, payload: { extraction_id: factsExtA } });
  const layoutExt = await seedExtraction({ firm, document, versionN: 1 });
  await emitExtractionCompleted({ firm, document, extraction: layoutExt });
  await emitEvent(firm, "document.invoice_facts_completed", { document, payload: { extraction_id: factsExtA } });

  await drainMatcher(firm);

  assert.equal(await matcherCheckpoint(firm), await headSeq(firm), "checkpoint reached head");
  const attempts = (await attemptsFor(document)).filter((a) => a.matcher_version === "matcher-v1");
  assert.equal(attempts.length, 1, "exactly one matcher attempt — from the layout extraction_completed alone");
});
