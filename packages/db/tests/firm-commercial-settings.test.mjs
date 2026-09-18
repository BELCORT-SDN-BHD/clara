// #635 — the firm's real legal, commercial and usage state, as three granted reads plus one
// governed RECUT. Migration 0233_firm_commercial_settings.sql.
//
// WHAT THIS BATTERY EXISTS FOR, IN FOUR SENTENCES:
//   1. LEGAL STANDING is the firm's, not the caller's: whether ONE ACTIVE OWNER holds BOTH
//      currently-published acceptances — the same predicate `clara._accounting_work_egress_live`
//      derives model-egress authority from (0195:890-906) — and it must move the moment that
//      fact moves (a publication, a demotion, a split between two people).
//   2. COMMERCIAL STATE says what the DATABASE holds and nothing else: an UNRULED plan carries
//      no figure at all, a payment is two booleans and a date, and no Stripe identifier ever
//      leaves the database.
//   3. MODEL USAGE keeps 0110's two buckets apart, publishes its unpriced tripwire, and labels
//      its money USD from `llm_price_table`'s own CHECK rather than from a belief.
//   4. THE RECUT closes the hole C55.21 charters this ticket to close: before 0233 a VIEWER
//      could read the firm's whole model spend (measured on this rig — cell
//      `p635.measure.usage_viewer_today`, brief §4). After it, the floor lives on the DOOR.
//
// EVERY CELL ASSERTS THROUGH `humanQuery` — a real least-privileged `clara_authenticated`
// session. `rootQuery` appears only for LABELLED fixture arrangement and for reading catalog
// facts a masked door deliberately never returns (ACLs, `prosrc`, table grants).

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, assertRaises, opk, rootQuery, humanQuery, insertUser, addMember, setMemberRole,
  membershipId, ensureReady, endPool,
} from "./rig-fixtures.mjs";
import {
  firmScene, acceptKind, acceptBothKinds, readLegalBaseline, publishNextVersion,
  consumedPayment, seedUsage, legalStanding, commercialState, aiUsage, documentOf,
} from "./firm-commercial-settings-fixtures.mjs";

const STANDING_DOOR = "clara.get_firm_legal_standing()";
const COMMERCIAL_DOOR = "clara.get_firm_commercial_state()";
const USAGE_DOOR = "clara.get_firm_ai_usage(date)";
const USAGE_BASE = "clara.get_llm_usage_summary(uuid,date,uuid)";
const MIGRATION = "0233_firm_commercial_settings.sql";

/** THE PRE-IMAGE of the ONE body 0233 recuts, MEASURED on this rig at 219 migrations
 *  (0001→0224) before 0233 existed — `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed by
 *  `to_regprocedure`, never transcribed from 0110's file text. 0233's own §0 prestate carries
 *  the same number and refuses to apply if it has moved; this constant is the other half of
 *  the pair, used by `p635.db.usage_base_prosrc_delta` to prove the live body is NO LONGER it
 *  and that the ONLY textual delta is the floor statement. */
const USAGE_BASE_PREIMAGE_SHA = "51621dea548b02bf9c5e9b1999bc338aee8229f3c8caac11ece911cdff1dd745";

/** The SAME body with every whitespace character removed, measured at the same instant. The
 *  pair is what makes `p635.db.usage_base_prosrc_delta` an EXACT statement: subtract 0233's
 *  addition from the live body and the remainder must hash to this. */
const USAGE_BASE_PREIMAGE_SQUEEZED = "d8a0b939cb1d897a8be96fa16647cbe97c12f2c97ba1dbd99b109f59e1a06968";

/** The floor statement 0233 adds. */
const FLOOR_STATEMENT = "perform clara._human_ctx(clara.role_rank('admin'));";

/** THE WHOLE OF 0233's addition to that body — its comment lines included. Written out here
 *  independently of the migration (this battery is the other side of the pair), and compared
 *  after squeezing whitespace so the comparison is about meaning, not indentation. */
const FLOOR_BLOCK = `
  -- #635 (0233): THE RANK FLOOR THIS DOOR NEVER HAD -- the FIRST statement, so an under-ranked
  -- caller meets CLR04 whatever firm they name and the CLR11 firm wall below stays intact for
  -- everyone who clears it. See 0233's header for the measurement and the blast radius.
  perform clara._human_ctx(clara.role_rank('admin'));
`;

/** The exact ACL text every one of the three NEW doors must carry — grantor included, so a
 *  WITH GRANT OPTION or a PUBLIC grant cannot hide behind a `has_function_privilege` probe
 *  (0224 §T.1's shape). */
const EXPECTED_ACL = "clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner";

let ready = false;
let baseline = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery("select to_regprocedure($1) is not null as present", [STANDING_DOOR]);
  if (catalog.rows[0]?.present !== true) {
    if (process.env.CLARA_ALLOW_MISSING_FIRM_COMMERCIAL_SETTINGS !== "1") {
      throw new Error(
        `firm-commercial-settings premise ${MIGRATION} is not applied (${STANDING_DOOR} does not ` +
          "resolve) and CLARA_ALLOW_MISSING_FIRM_COMMERCIAL_SETTINGS is unset -- this is a FOCUSED " +
          "run and must fail loudly, not skip. Preload " +
          "./tests/firm-commercial-settings-preintegration-gate.mjs for an estate sweep against a " +
          "pre-PR chain.",
      );
    }
    ready = false;
  }
  if (ready) baseline = await readLegalBaseline();
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

// =====================================================================================
// LEGAL STANDING — cells 1-8.
// =====================================================================================

test("p635.db.legal_standing_shape one entry per kind by 0185's own selection, and NO body key", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("shape");
  const standing = await legalStanding(sc.owner);

  assert.ok(Array.isArray(standing.documents), "the door must answer a documents array");
  const kinds = standing.documents.map((d) => d.kind).sort();
  assert.deepEqual(kinds, ["dpa", "terms"], "one entry per kind present on the shelf");

  for (const doc of standing.documents) {
    assert.ok(Number.isInteger(doc.version) && doc.version >= 1, `${doc.kind} carries a version`);
    assert.ok(["published", "draft"].includes(doc.status),
      `${doc.kind} carries 0185:653-659's own status selection, got ${doc.status}`);
    assert.equal(typeof doc.title, "string");
    assert.ok(doc.title.length > 0, `${doc.kind} carries its title`);
    assert.ok("effective_from" in doc, `${doc.kind} carries effective_from`);
    assert.ok("published_at" in doc, `${doc.kind} carries published_at`);
    // THE ONE KEY THAT MAY NEVER APPEAR. The BYTES stay `get_current_legal_documents`' job
    // (0185:634-671): two surfaces rendering the same agreement from two reads is two chances
    // to render bytes a third digest was taken over.
    assert.equal("body" in doc, false, `${doc.kind}: the standing door must not carry the body`);
    assert.equal("body_sha256" in doc, false, `${doc.kind}: nor the digest`);
  }
  assert.equal(typeof standing.standing_live, "boolean");
  assert.equal(typeof standing.can_accept_for_firm, "boolean");
  assert.equal(typeof standing.masked, "boolean");
});

test("p635.db.legal_standing_live_true an active owner holding BOTH acceptances makes standing live, and it EQUALS the egress basis' limb (a)", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("live");
  const before_ = await legalStanding(sc.owner);
  assert.equal(before_.standing_live, false, "a firm whose owner has accepted nothing is not live");

  await acceptBothKinds(sc.owner);
  const after_ = await legalStanding(sc.owner);
  assert.equal(after_.standing_live, true, "one owner holding BOTH current acceptances is the whole rule");
  for (const kind of ["terms", "dpa"]) {
    const doc = documentOf(after_, kind);
    assert.equal(doc.firm_accepted, true, `${kind} reads accepted for the firm`);
    assert.equal(doc.accepted_by, sc.owner, `${kind} attributes the acceptance to the owner who made it`);
    assert.ok(typeof doc.accepted_at === "string" && doc.accepted_at.length > 0,
      `${kind} carries the instant of the firm's acceptance`);
  }

  // THE SAME QUESTION, ASKED OF THE FUNCTION THAT ACTUALLY GOVERNS MODEL EGRESS. 0195's basis
  // is limb (a) AND limb (b); with an ACTIVE client in place limb (b) is true, so the two must
  // agree. `_accounting_work_egress_live` is UNGRANTED (0195:911) — read as root, deliberately,
  // because no human may call it and this cell is comparing the door to the wall.
  const clientRow = await humanQuery(
    sc.owner, "select clara.create_client(p_name => $1, p_op_key => $2) as receipt",
    [`P635 live client`, opk("live_client")],
  );
  const clientId = clientRow.rows[0].receipt.client_id;
  await rootQuery("update clara.clients set status = 'active' where id = $1", [clientId]); // LABELLED FIXTURE DML
  const basis = await rootQuery(
    "select clara._accounting_work_egress_live($1,$2) as b", [sc.firm, clientId],
  );
  assert.equal(basis.rows[0].b.live, true,
    "the standing door says live; 0195's own basis must say the same for the same firm");
  assert.equal(basis.rows[0].b.owner, sc.owner, "…and name the same owner");
});

test("p635.db.legal_standing_owner_removed demoting the accepting owner flips standing false with no data change", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("demote");
  await acceptBothKinds(sc.owner);
  assert.equal((await legalStanding(sc.owner)).standing_live, true);

  // A SECOND OWNER FIRST: 0185/0005's last-owner protection refuses to demote the only one, and
  // a cell that could not arrange the state it asserts on would be asserting nothing.
  const second = await insertUser("p635", "demote_second");
  await addMember(sc.owner, { firm: sc.firm, user: second, role: "owner", opKey: opk("demote_second") });
  const membership = await membershipId(sc.firm, sc.owner);
  await setMemberRole(second, { membership, role: "admin", opKey: opk("demote_do") });

  const after_ = await legalStanding(second);
  assert.equal(after_.standing_live, false,
    "the acceptance rows are untouched; the person who holds them is no longer an owner");
  const terms = documentOf(after_, "terms");
  assert.equal(terms.firm_accepted, false, "…and the per-kind fact follows the same predicate");

  // NOTHING WAS DELETED. The append-only acceptance survives the demotion; only its authority
  // to stand for the firm is gone.
  const rows = await rootQuery(
    "select count(*)::int as n from clara.legal_acceptances where user_id = $1", [sc.owner],
  );
  assert.equal(rows.rows[0].n, 2, "a demotion moves no acceptance row");
});

test("p635.db.legal_standing_two_people acceptances split across two owners never make standing live", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("split");
  const second = await insertUser("p635", "split_second");
  await addMember(sc.owner, { firm: sc.firm, user: second, role: "owner", opKey: opk("split_add") });

  await acceptKind(sc.owner, "terms");
  await acceptKind(second, "dpa");

  const standing = await legalStanding(sc.owner);
  assert.equal(standing.standing_live, false,
    "0195:896-906 binds BOTH kinds to the SAME actor; two halves from two people is not a firm acceptance");
  assert.equal(documentOf(standing, "terms").firm_accepted, true, "each half is still reported honestly");
  assert.equal(documentOf(standing, "dpa").firm_accepted, true);
});

test("p635.db.legal_standing_new_version publishing a new version flips standing false AT PUBLICATION, before any sweep", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("publish");
  await acceptBothKinds(sc.owner);
  assert.equal((await legalStanding(sc.owner)).standing_live, true);

  const v = await publishNextVersion("terms"); // LABELLED FIXTURE DML — see the fixtures header.
  const after_ = await legalStanding(sc.owner);
  assert.equal(after_.standing_live, false,
    "0195:890-892 — a newer publication withdraws authority the moment it lands");
  const terms = documentOf(after_, "terms");
  assert.equal(terms.version, v, "the door reports the NEW version, not the accepted one");
  assert.equal(terms.firm_accepted, false, "…which nobody has accepted yet");
  assert.equal(documentOf(after_, "dpa").firm_accepted, true, "the untouched kind is unaffected");

  // AND THE REMEDY WORKS FROM HERE: the owner accepts the new version in-app and standing
  // returns. This is the third recovery path ARCHITECTURE:393-403 names and #635 builds.
  await acceptKind(sc.owner, "terms", { opKey: opk("republish_accept") });
  assert.equal((await legalStanding(sc.owner)).standing_live, true,
    "accepting the new version restores the firm's standing with no other act");

  // NO RESTORE IS ATTEMPTED, AND THAT IS THE HOUSE PRECEDENT RATHER THAN A SHORTCUT. 0185 makes
  // the shelf append-only in both directions: `t_legal_documents_append_only` refuses every
  // DELETE and `_tf_legal_documents_transition` (0185:299-302) allows only draft->published and
  // published->superseded, so a published row cannot be put back. `checkout-gate-c1.test.mjs:393`
  // and `checkout-gate-c3.test.mjs:266` already supersede-and-publish the same way and leave the
  // successor standing, which is why every battery in this estate reads the CURRENT published
  // version from the catalog instead of assuming 0187's v1 — this one included (see
  // `acceptKind`, which goes through get_current_legal_documents()).
  assert.ok(baseline.length >= 2, "the pre-run shelf was recorded for the report: " +
    baseline.map((b) => `${b.kind} v${b.version} ${b.status}`).join(", "));
});

test("p635.db.legal_standing_mask_viewer a viewer sees masked==true with no attribution, and firm_accepted intact", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("mask", ["bookkeeper", "viewer"]);
  await acceptBothKinds(sc.owner);

  const asViewer = await legalStanding(sc.members.viewer);
  assert.equal(asViewer.masked, true, "below bookkeeper the attribution is masked");
  for (const kind of ["terms", "dpa"]) {
    const doc = documentOf(asViewer, kind);
    assert.equal(doc.firm_accepted, true, `${kind}: WHETHER the firm accepted is not masked`);
    assert.equal(doc.accepted_by, null, `${kind}: WHO is`);
    assert.equal(doc.accepted_at, null, `${kind}: and WHEN`);
    assert.equal(doc.accepted_by_name, null, `${kind}: and the name`);
  }

  const asBookkeeper = await legalStanding(sc.members.bookkeeper);
  assert.equal(asBookkeeper.masked, false, "0141:526 is the row floor this mask mirrors");
  assert.equal(documentOf(asBookkeeper, "terms").accepted_by, sc.owner);
  assert.ok((documentOf(asBookkeeper, "terms").accepted_by_name ?? "").length > 0,
    "the name is resolved INSIDE the definer body, not through users_visible");

  // THE VIEWER'S OWN ACCEPTANCE IS NEVER MASKED — it is their own act.
  await acceptKind(sc.members.viewer, "terms", { opKey: opk("mask_viewer_own") });
  const again = await legalStanding(sc.members.viewer);
  const terms = documentOf(again, "terms");
  assert.equal(terms.my_accepted_version, terms.version, "the caller's own acceptance reads back at every rank");
  assert.ok(typeof terms.my_accepted_at === "string", "…with its own instant");
  assert.equal(terms.accepted_by, null, "…and still no attribution of anybody else's");
});

test("p635.db.legal_standing_can_accept true for an ACTIVE OWNER only", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("canaccept", ["admin", "bookkeeper", "viewer"]);
  assert.equal((await legalStanding(sc.owner)).can_accept_for_firm, true, "the owner may accept for the firm");
  for (const role of ["admin", "bookkeeper", "viewer"]) {
    assert.equal((await legalStanding(sc.members[role])).can_accept_for_firm, false,
      `${role} may not accept for the firm — 0195:905's predicate is owner-only`);
  }

  // A REMOVED OWNER IS NOT AN ACTIVE ONE. Add a second owner first (last-owner protection), then
  // remove the first and read as the survivor.
  const second = await insertUser("p635", "canaccept_second");
  await addMember(sc.owner, { firm: sc.firm, user: second, role: "owner", opKey: opk("ca_add") });
  const membership = await membershipId(sc.firm, sc.owner);
  await setMemberRole(second, { membership, role: "viewer", opKey: opk("ca_demote") });
  assert.equal((await legalStanding(sc.owner)).can_accept_for_firm, false,
    "a demoted owner may no longer accept for the firm");
  assert.equal((await legalStanding(second)).can_accept_for_firm, true, "and the survivor may");
});

test("p635.db.legal_standing_no_client_arg the standing door has arity 0, forever", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select p.pronargs::int as n, p.proname
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.proname = 'get_firm_legal_standing'`,
  );
  assert.equal(r.rowCount, 1, "exactly one get_firm_legal_standing overload exists");
  assert.equal(r.rows[0].n, 0,
    "a client argument would re-open the per-client existence oracle 0195:871-874 deliberately closed");
});

// =====================================================================================
// COMMERCIAL STATE — cells 9-13.
// =====================================================================================

test("p635.db.commercial_admin_only bookkeeper and viewer meet CLR04; admin and owner are admitted", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("commrank", ["admin", "bookkeeper", "viewer"]);
  await assertRaises(CLR.authz, () => commercialState(sc.members.bookkeeper), "bookkeeper on the commercial door");
  await assertRaises(CLR.authz, () => commercialState(sc.members.viewer), "viewer on the commercial door");
  const asAdmin = await commercialState(sc.members.admin);
  assert.equal(asAdmin.firm.id, sc.firm, "the admin is admitted and bound to their own firm");
  const asOwner = await commercialState(sc.owner);
  assert.equal(asOwner.firm.id, sc.firm);
  assert.equal(asOwner.firm.name, sc.name);
  assert.equal(asOwner.firm.is_operator, false);
});

test("p635.db.commercial_plan_unruled the plan travels with amounts_ruled=false and is the SAME is_current row get_current_checkout_plan reads", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("plan");
  const state = await commercialState(sc.owner);
  assert.equal(state.plan.amounts_ruled, false,
    "0163:214-215 seeds the beta plan UNRULED — this is the DATABASE saying the price is not set");
  assert.equal(state.plan.local_key, "clara-beta-2026");
  assert.equal(state.plan.name, "Clara Beta");
  assert.equal(state.plan.currency, "MYR");
  assert.equal(Number(state.plan.amount_cents), 0);

  // THE SAME ROW, not a second idea of "the current plan": `get_current_checkout_plan`
  // (0164:134-135) reads `where is_current`, and so does this door. A rotation cannot make the
  // two disagree, and this cell is what says so.
  const checkout = await humanQuery(sc.owner, "select * from clara.get_current_checkout_plan()");
  assert.equal(checkout.rows[0].local_key, state.plan.local_key,
    "both doors must name the same is_current plan");
});

test("p635.db.commercial_payment_booleans a consumed payment reads as booleans and a date, and NO stripe identifier is anywhere in the payload", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("payment");
  const empty = await commercialState(sc.owner);
  assert.equal(empty.payment.recorded, false, "the ABSENT branch is the primary branch (rig: zero rows)");
  assert.equal(empty.payment.recorded_at, null);
  assert.equal(empty.payment.subscription_present, false);
  assert.equal(empty.payment.customer_present, false);

  const receipt = await acceptKind(sc.owner, "dpa", { opKey: opk("pay_dpa") });
  const payment = await consumedPayment(sc.firm, {
    applicant: sc.owner, acceptanceId: receipt.acceptance_id,
  });
  const state = await commercialState(sc.owner);
  assert.equal(state.payment.recorded, true);
  assert.ok(typeof state.payment.recorded_at === "string" && state.payment.recorded_at.length > 0);
  assert.equal(state.payment.subscription_present, true);
  assert.equal(state.payment.customer_present, true);

  // D1/H3 — THE RAW IDENTIFIERS NEVER LEAVE THE DATABASE. A string scan over the WHOLE payload,
  // not a key-by-key check: a value that arrived under an unexpected key is exactly the failure
  // this cell exists to catch.
  const asText = JSON.stringify(state);
  assert.equal(asText.includes("cus_"), false, "no stripe_customer_id value may cross the wire");
  assert.equal(asText.includes("sub_"), false, "no stripe_subscription_id value may cross the wire");
  assert.equal(asText.includes(payment.customerId), false);
  assert.equal(asText.includes(payment.subscriptionId), false);
});

test("p635.db.commercial_foreign_firm another firm's admin sees their OWN zeros, never this firm's payment", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("mine");
  const other = await firmScene("theirs", ["admin"]);
  const receipt = await acceptKind(sc.owner, "dpa", { opKey: opk("fk_dpa") });
  await consumedPayment(sc.firm, { applicant: sc.owner, acceptanceId: receipt.acceptance_id });

  const theirs = await commercialState(other.members.admin);
  assert.equal(theirs.firm.id, other.firm, "the door binds jwt_firm() INSIDE the database; no firm id crosses the wire");
  assert.equal(theirs.payment.recorded, false, "a foreign firm's payment is not this firm's");
  const mine = await commercialState(sc.owner);
  assert.equal(mine.payment.recorded, true, "positive control on the same instrument");
});

test("p635.db.commercial_invoices_constant invoices are declared unavailable with a typed reason", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("invoices");
  const state = await commercialState(sc.owner);
  assert.equal(state.invoices.available, false,
    "no subscription invoice is collected anywhere in this estate");
  assert.equal(state.invoices.reason, "not_collected",
    "an absence with a reason, never an empty list a surface could render as 'none yet'");

  // CAPACITY comes from the ONE relation, and says so. On this rig no firm carries a
  // firm_document_limits row at all, so the honest answer is NULL rather than the table's
  // column defaults — the enforcing doors coalesce to their own fallbacks (0090:422-436), and
  // publishing a number nobody stored would be this door inventing one.
  assert.equal(state.capacity.source, "firm_document_limits");
  assert.equal(state.capacity.docs_per_day, null, "no row on this rig -> no stored cap");
  await rootQuery( // LABELLED FIXTURE DML: firm_document_limits has no human writer (0196:36-40)
    `insert into clara.firm_document_limits(firm_id, docs_per_day, pages_per_day, ocr_concurrency,
       llm_witness_concurrency) values ($1, 250, 2500, 3, 4)`, [sc.firm],
  );
  const withRow = await commercialState(sc.owner);
  assert.equal(withRow.capacity.docs_per_day, 250);
  assert.equal(withRow.capacity.pages_per_day, 2500);
  assert.equal(withRow.capacity.ocr_concurrency, 3);
  assert.equal(withRow.capacity.llm_witness_concurrency, 4);
});

// =====================================================================================
// USAGE — the recut (14-17) and the wrapper (18-21).
// =====================================================================================

test("p635.db.usage_base_floor_added the RECUT refuses a viewer and a bookkeeper with CLR04, and still answers an admin and an owner", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("basefloor", ["admin", "bookkeeper", "viewer"]);
  const period = "2026-05-01";
  const call = (sub) => humanQuery(
    sub, "select * from clara.get_llm_usage_summary($1, $2::date, null)", [sc.firm, period],
  );
  // RED BEFORE 0233 BY CONSTRUCTION: `p635.measure.usage_viewer_today` (brief §4) measured a
  // VIEWER succeeding at this door on this rig before the migration existed.
  await assertRaises(CLR.authz, () => call(sc.members.viewer), "viewer on the base rollup");
  await assertRaises(CLR.authz, () => call(sc.members.bookkeeper), "bookkeeper on the base rollup");
  assert.ok(Array.isArray((await call(sc.members.admin)).rows), "admin is admitted");
  assert.ok(Array.isArray((await call(sc.owner)).rows), "owner is admitted");
});

test("p635.db.usage_base_firm_wall_intact a foreign firm still meets CLR11 client_not_in_firm", async (t) => {
  if (unready(t)) return;
  const mine = await firmScene("wallmine");
  const theirs = await firmScene("wallyours");
  const err = await assertRaises(CLR.notFound, () => humanQuery(
    theirs.owner, "select * from clara.get_llm_usage_summary($1, date '2026-05-01', null)", [mine.firm],
  ), "another firm's owner naming this firm's id");
  assert.match(String(err.detail ?? ""), /client_not_in_firm/,
    "the f-a9.C19 contract, re-proven at this boundary: the FIRM wall is still the firm wall");
  // ORDER MATTERS. The floor is the FIRST statement, so an under-ranked caller naming a FOREIGN
  // firm meets CLR04 (authority) rather than CLR11 (not-in-your-firm) — the door answers the
  // question it is allowed to answer first.
  const under = await firmScene("wallunder", ["viewer"]);
  await assertRaises(CLR.authz, () => humanQuery(
    under.members.viewer, "select * from clara.get_llm_usage_summary($1, date '2026-05-01', null)", [mine.firm],
  ), "an under-ranked caller naming a foreign firm");
});

test("p635.db.usage_base_prosrc_delta the live body is no longer the pinned pre-image, and the ONLY delta is the floor statement", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha, p.prosrc
       from pg_proc p where p.oid = $1::regprocedure`, [USAGE_BASE],
  );
  assert.notEqual(r.rows[0].sha, USAGE_BASE_PREIMAGE_SHA,
    "0233 recuts this body; a live sha equal to the pre-image means the recut did not apply");
  const src = r.rows[0].prosrc;
  assert.ok(src.includes(FLOOR_STATEMENT), "the floor statement is in the live body");

  // THE NORMALISED DIFF. Remove the floor statement and all whitespace from the LIVE body; what
  // remains must be 0110's own body under the same normalisation. That is what makes this a
  // "nothing else moved" assertion rather than a "something moved" one.
  const squeeze = (s) => s.replace(/\s+/g, "");
  const stripped = squeeze(src).replace(squeeze(FLOOR_BLOCK), "");
  const remainder = await rootQuery(
    "select encode(sha256(convert_to($1,'UTF8')),'hex') as sha", [stripped],
  );
  assert.equal(remainder.rows[0].sha, USAGE_BASE_PREIMAGE_SQUEEZED,
    "the live body MINUS 0233's floor block must be exactly the pre-image: a smuggled query " +
    "change, a dropped bucket, a moved filter or a re-worded refusal all move this hash");
  assert.ok(stripped.includes("TWOBUCKETS,NEVERONEFIGURE"),
    "0110:718's own rule comment is carried verbatim through the recut");
  assert.ok(stripped.includes(squeeze("(pv.created_at at time zone 'utc')::date between v_from and v_to")),
    "0110:750's UTC row filter is carried verbatim — the window the screen labels is the window the door used");
  assert.ok(stripped.includes(squeeze("p_firm is distinct from clara.jwt_firm()")),
    "0110:714-717's firm wall still sits in the body, AFTER the floor");
  assert.ok(src.indexOf(FLOOR_STATEMENT) < src.indexOf("p_firm is distinct from clara.jwt_firm()"),
    "the floor is the FIRST statement of the body, before the firm wall");
});

test("p635.db.usage_base_acl_unmoved the recut preserved the grant: clara_authenticated yes, PUBLIC no", async (t) => {
  if (unready(t)) return;
  const acl = await rootQuery(
    `select array_to_string(p.proacl, ',') as acl, pg_get_userbyid(p.proowner) as owner,
            array_to_string(p.proconfig, ',') as cfg, p.prosecdef
       from pg_proc p where p.oid = $1::regprocedure`, [USAGE_BASE],
  );
  assert.equal(acl.rows[0].acl, EXPECTED_ACL,
    "create or replace preserves the ACL; 0233 re-issues no grant and this proves it");
  assert.equal(acl.rows[0].owner, "clara_fn_owner");
  assert.equal(acl.rows[0].prosecdef, true);
  assert.equal(acl.rows[0].cfg, "search_path=clara, pg_temp");
  const probe = await rootQuery(
    `select has_function_privilege('clara_authenticated', $1, 'EXECUTE') as granted,
            has_function_privilege('public', $1, 'EXECUTE') as public_granted`, [USAGE_BASE],
  );
  assert.equal(probe.rows[0].granted, true, "the ACL f-a9-usage-reshape.test.mjs:671-679 pins is unmoved");
  assert.equal(probe.rows[0].public_granted, false);
});

test("p635.db.usage_wrapper_admin_only the wrapper refuses below admin and takes NO firm argument", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("wrapper", ["admin", "bookkeeper", "viewer"]);
  await assertRaises(CLR.authz, () => aiUsage(sc.members.viewer, "2026-05-01"), "viewer on the wrapper");
  await assertRaises(CLR.authz, () => aiUsage(sc.members.bookkeeper, "2026-05-01"), "bookkeeper on the wrapper");
  assert.ok(Array.isArray(await aiUsage(sc.members.admin, "2026-05-01")), "admin is admitted");

  // A CALLER CANNOT NAME A FIRM. The firm is bound by `clara.jwt_firm()` INSIDE the body, so
  // there is no argument through which another firm could be asked for.
  const sig = await rootQuery(
    `select p.pronargs::int as n, pg_get_function_arguments(p.oid) as args
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.proname = 'get_firm_ai_usage'`,
  );
  assert.equal(sig.rowCount, 1, "exactly one get_firm_ai_usage overload");
  assert.equal(sig.rows[0].n, 1, "one argument: the period");
  assert.equal(sig.rows[0].args, "p_period date");

  // A NULL period is a caller-side fact that depends on no data, so naming it honestly is safe.
  const err = await assertRaises(CLR.badRequest, () => aiUsage(sc.owner, null), "a null period");
  assert.match(String(err.detail ?? ""), /invalid_period/, "…with a typed detail reason");
});

test("p635.db.usage_buckets_separate the firm bucket and the platform bucket come back as separate rows, never summed", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("buckets");
  const period = "2026-04-01";
  await seedUsage(sc.firm, { period, callKind: "chat", scope: "firm" });
  await seedUsage(sc.firm, { period, callKind: "chat", scope: "platform" });

  const rows = await aiUsage(sc.owner, period);
  const firmRow = rows.find((r) => r.scope === "firm" && r.call_kind === "chat");
  const platformRow = rows.find((r) => r.scope === "platform" && r.call_kind === "chat");
  assert.ok(firmRow, "the firm bucket is present");
  assert.ok(platformRow, "the platform bucket is present");
  assert.equal(Number(firmRow.calls), 1,
    "the firm bucket counts THIS firm's one row and nothing else -- the platform rows beside it " +
    "are not folded in (R-L10)");
  assert.equal(Number(firmRow.spend_cents), 200, "1M in @100c/1M + 1M out @100c/1M = 200 cents");
  // THE PLATFORM BUCKET IS ESTATE-GLOBAL BY CONSTRUCTION: a scope='platform' row carries no
  // firm at all (0110:355-358), so every firm sees every platform row and an ABSOLUTE count
  // here would couple this cell to whatever else ran on the cluster. What matters is that it
  // arrives as its OWN row.
  assert.ok(Number(platformRow.calls) >= 1, "the platform bucket carries at least the row just seeded");
});

test("p635.db.usage_unpriced a day with no price row publishes unpriced_calls and excludes it from spend", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("unpriced");
  const period = "2026-03-01";
  await seedUsage(sc.firm, { period, callKind: "web_fetch", priced: false });
  const rows = await aiUsage(sc.owner, period);
  const row = rows.find((r) => r.call_kind === "web_fetch");
  assert.ok(row, "an unpriced call must still be COUNTED — 0110:702-704's published tripwire");
  assert.equal(Number(row.unpriced_calls), 1);
  assert.equal(Number(row.priced_calls), 0);
  assert.equal(Number(row.spend_cents), 0, "…and contribute no spend");
  assert.equal(Number(row.input_tokens), 1_000_000, "tokens and calls are always readable, priced or not");
});

test("p635.db.usage_currency_literal every row says USD, and llm_price_table's own CHECK still pins it", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("currency");
  const period = "2026-02-01";
  await seedUsage(sc.firm, { period, callKind: "reporting" });
  const rows = await aiUsage(sc.owner, period);
  assert.ok(rows.length > 0);
  for (const row of rows) assert.equal(row.price_currency, "USD");

  // THE LITERAL ASSERTED AGAINST ITS SOURCE, not assumed. If a later migration widens
  // `llm_price_table.currency`, this reds here rather than letting the wrapper silently
  // mislabel money (0110:494-497's FX non-goal).
  const check = await rootQuery(
    `select pg_get_constraintdef(c.oid) as d from pg_constraint c
      where c.conrelid = 'clara.llm_price_table'::regclass and c.conname = 'llm_price_table_currency_check'`,
  );
  assert.equal(check.rowCount, 1, "the currency CHECK still exists");
  assert.match(check.rows[0].d, /'USD'/, "…and still pins USD");
});

// =====================================================================================
// POSTURE — cells 22-24.
// =====================================================================================

test("p635.db.acl_census the three new doors are reachable by clara_authenticated and by nobody else", async (t) => {
  if (unready(t)) return;
  for (const sig of [STANDING_DOOR, COMMERCIAL_DOOR, USAGE_DOOR]) {
    const r = await rootQuery(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef,
              coalesce(array_to_string(p.proconfig, ','), '<none>') as cfg,
              coalesce(array_to_string(p.proacl, ','), '<null>') as acl
         from pg_proc p where p.oid = $1::regprocedure`, [sig],
    );
    assert.equal(r.rows[0].owner, "clara_fn_owner", `${sig} owner`);
    assert.equal(r.rows[0].prosecdef, true, `${sig} is SECURITY DEFINER`);
    assert.match(r.rows[0].cfg, /search_path=clara, pg_temp/, `${sig} pins its search_path`);
    assert.equal(r.rows[0].acl, EXPECTED_ACL, `${sig} ACL (grantor included)`);
    for (const role of ["clara_runtime", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive"]) {
      const probe = await rootQuery(
        "select to_regrole($1) is null or not has_function_privilege($1, $2, 'EXECUTE') as blocked",
        [role, sig],
      );
      assert.equal(probe.rows[0].blocked, true, `${role} must not EXECUTE ${sig}`);
    }
  }
  // THE TWO FIRM-BOUND READS RE-PLAN PER CALL (0185:643-646's rule, restated at 0195:879-880):
  // both bind the caller and the firm as parameters.
  for (const sig of [STANDING_DOOR, COMMERCIAL_DOOR]) {
    const r = await rootQuery(
      "select coalesce(array_to_string(p.proconfig, ','), '') as cfg from pg_proc p where p.oid = $1::regprocedure",
      [sig],
    );
    assert.match(r.rows[0].cfg, /plan_cache_mode=force_custom_plan/, `${sig} pins force_custom_plan`);
  }
});

test("p635.db.no_new_table_grant the four money/legal relations still carry ZERO application-role grants, and firm_document_limits' grant is unmoved", async (t) => {
  if (unready(t)) return;
  const zero = await rootQuery(
    `select table_name, count(*)::int as n from information_schema.role_table_grants
      where table_schema = 'clara'
        and table_name in ('legal_documents','legal_acceptances','billing_plans','firm_registration_payments')
        and grantee in ('clara_authenticated','clara_runtime','clara_agent_ro',
                        'clara_wake_interactive','clara_wake_proactive','PUBLIC')
      group by table_name`,
  );
  assert.deepEqual(zero.rows, [],
    "0233 reads these four through a DEFINER door precisely so none of them needs a grant");

  // firm_document_limits KEEPS its viewer-readable SELECT (0007:810-811, :2742-2744). Rendering
  // it behind admin+ on the settings page is an AFFORDANCE, not a wall, and this cell is the
  // measurement that says so rather than a sentence claiming it.
  const kept = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'firm_document_limits'
        and grantee = 'clara_authenticated' order by privilege_type`,
  );
  assert.deepEqual(kept.rows.map((r) => r.privilege_type), ["SELECT"],
    "0233 neither widens nor narrows 0007's written, reviewed grant");
});

test("p635.db.accept_replay a replayed acceptance returns the ORIGINAL instant", async (t) => {
  if (unready(t)) return;
  const sc = await firmScene("replay");
  const key = opk("replay_terms");
  const first = await acceptKind(sc.owner, "terms", { opKey: key });
  assert.equal(first.status, "accepted");
  const second = await acceptKind(sc.owner, "terms", { opKey: key });
  assert.equal(second.status, "already_accepted", "0185:766-775 — a retry replays, it does not re-accept");
  assert.equal(second.accepted_at, first.accepted_at, "…at the ORIGINAL instant, which no retry may move");
  assert.equal(second.acceptance_id, first.acceptance_id);

  // AND THE ACCEPTANCE DOOR ITSELF IS UNTOUCHED BY 0233 — no rank floor was added to it. An
  // `(entry)` applicant accepts BEFORE any membership exists, so a `_human_ctx` there would
  // refuse the shipped registration flow outright (D2).
  const src = await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.accept_legal_document(text,integer,text,text)'::regprocedure",
  );
  assert.equal(src.rows[0].prosrc.includes("_human_ctx"), false,
    "no rank floor may be added to the acceptance door");
});
