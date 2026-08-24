// F-A2 — Annex C.10 (the context pack's fifth splice) and C.11 (law 8 / law 73).
//
// TWO DIFFERENT GATES, and the split is deliberate. C.10 rides PR-1b — the `get_context_pack`
// fifth splice, a READ body with no D1 window — so its cells gate on `f_a2_pack_splice$` and
// SKIP until that PR lands. C.11's roster cells are mostly pure JS plus a catalog read, so most
// of them run at EVERY frontier: they are the cells that would catch a post-path verb added
// without joining `WB_AUTHORITY_FNS`, and a cell that only ran after F-A2 could not catch that.
//
// THE LAW THE WHOLE FILE IS ABOUT. `get_context_pack` reads wiki, and now reads approved
// history; NEITHER may ever be read by a gate, a bound or a floor. The pack lawfully INFORMS the
// judgement that IS the posting authority — that is law 73 working as designed. What it may
// never do is BE the authority, because a wall whose answer is learned from the books drifts
// with the books it is supposed to be judging. `WB_AUTHORITY_FNS` is the mechanism; F-A2 extends
// it with the three post-path verbs and keeps `get_context_pack` off it.
//
// AND THE COROLLARY NOBODY SHOULD BUILD (§D.4). The patterns block is RECOMPUTED on read, never
// accrued. That removes a write from the approve core — the sighting insert dies with the
// breeding block rather than surviving as a vestigial accrual — and it CANNOT drift from the
// books, because there is no second copy. Two consequences follow and both get cells: the block
// MOVES when an entry is reversed, and the historical `rule_sightings` / `coding_rules` rows,
// though KEPT as data, are NOT read by the pack. Reading both would mean learning twice from the
// same events.
//
// ---------------------------------------------------------------------------------------------
// THREE DEFECTS PR-1b FIXED IN THIS FILE, written down because a reviewer who sees only the new
// assertions cannot tell which of them were repairs. All six C.10 cells gate on
// `f_a2_pack_splice$`, which does not exist below PR-1b — so before this PR **`pack()` had never
// executed once**, and nothing in the battery lane's runs could have caught any of these.
//
//   (1) `pack()` read the pack through `roleQuery(ROLES.agentRo, …)` — a bare SET ROLE with no
//       wake secret and no jwt claims. That takes the pack's HUMAN branch and raises
//       `CLR04 no authenticated actor`. Measured on the rig, not inferred. Every C.10 cell would
//       have red on arrival. It now reads the way `autoDraft` does: a live client-pinned
//       AUTODRAFT wake credential over `clara_agent_ro`, through wave-b's own `packWake` shape,
//       and `autodraft -> get_context_pack` is an EXISTING allowlist row — no authority is
//       manufactured here to make a cell pass.
//   (2) The client-scoping foil was `clients.B1`, which is in a DIFFERENT FIRM. The pack's own
//       `cl.firm_id = v_firm` predicate makes it return NULL wholesale, so the cell proved firm
//       isolation while CLAIMING to prove client scoping — and it would have stayed green with
//       client scoping removed entirely. The foil is now `clients.A2`: SAME firm, different
//       client, so the two packs are genuinely differential.
//   (3) The scoping assertion was `!Array.isArray(foreign) || foreign.length === 0 || …`, whose
//       FIRST disjunct is satisfied by `null`. A pack that refused for ANY reason passed the
//       cell. It is now two POSITIVE assertions — the foil's pack returns a block, and that
//       block does not carry this client's rows — because a read that cannot say NO has a
//       meaningless YES.
// ---------------------------------------------------------------------------------------------

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  opk, reverseEntry, postingCoreReady, packSpliceReady, autodraftCred, CHART,
  gatePack, gateCore, wakePostEntry, agentPostable, bodyOfName,
  F_A2_POST_VERBS, PR2_PENDING,
} from "./f-a2-post-world.mjs";
import {
  WB_AUTHORITY_FNS, WB_WIKI_WHITELIST, WB_WIKI_RELATIONS,
  packWake, WB_V7_PURPOSE, WB_PACK_CONSUMER,
} from "./wave-b/wb-helpers.mjs";

let world = null;
before(async () => { if ((await postingCoreReady()) || (await packSpliceReady())) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-pack");
  printSkipCount("f-a2-pack");
  await endPool();
});

const A1 = () => world.clients.A1;
/** The client-scoping FOIL: same firm as A1, different client. A different-FIRM foil would be
 *  refused by the pack's firm predicate and prove nothing about client scoping. */
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;

const PACK_BLOCK = "approved_coding_patterns";
const PACK_COLUMNS = ["counterparty_id", "coding_kind", "account_code", "side", "n", "first_seen", "last_seen"];

/**
 * The pack, read through the REAL agent lane. The credential is minted per call and the mint is
 * ASSERTED: a fixture that failed to construct must throw, never hand back a shape that reads as
 * an empty pack.
 */
async function pack(client, { purpose = "coding", consumerGuc = null } = {}) {
  const cred = await autodraftCred(client);
  assert.ok(cred?.secret,
    "pack(): the autodraft wake credential minted — without one this reads the pack's human branch and raises CLR04");
  return packWake(cred, { client, purpose, consumerGuc });
}

/** The block, from a pack that MUST have returned. A NULL pack is a REFUSAL, and reading it as
 *  "no rows" is exactly how a scoping cell stops being able to fail. */
function blockOfStrict(p, who) {
  assert.ok(p && typeof p === "object",
    `${who}: the pack itself returned (a null pack is a refusal, not an empty block)`);
  const b = p[PACK_BLOCK] ?? p.blocks?.[PACK_BLOCK] ?? null;
  assert.ok(Array.isArray(b),
    `${who}: the '${PACK_BLOCK}' block is present and is a list (got ${JSON.stringify(b)?.slice(0, 120)})`);
  return b;
}

/** The entry's counterparty and its per-leg (account_code, side) pairs, read from the CATALOG —
 *  the same facts the block claims to aggregate, derived independently of it. */
async function entryShape(entry) {
  const r = await rootQuery(
    `select (select l2.counterparty_id from clara.journal_lines l2
               where l2.entry_id=$1 and l2.counterparty_id is not null
               order by l2.line_no limit 1) as cp,
            l.account_code,
            case when l.debit_cents>0 then 'debit' else 'credit' end as side
       from clara.journal_lines l
      where l.entry_id=$1 and (l.debit_cents>0 or l.credit_cents>0)
      order by l.line_no`, [entry]);
  return { cp: r.rows[0]?.cp ?? null, legs: r.rows.map((x) => ({ account_code: x.account_code, side: x.side })) };
}

const rowFor = (block, cp, leg) => block.find(
  (b) => b.counterparty_id === cp && b.account_code === leg.account_code && b.side === leg.side);

// ===========================================================================
// C.10 — the fifth splice. PR-1b.
// ===========================================================================

test("f-a2.c10.block the approved_coding_patterns block appears, client-scoped and budget-capped", async (t) => {
  if (await gatePack(t)) return;
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), amount: 710000 });
  const wire = await wakePostEntry(p.cred, p.args);
  // FORCED: the block aggregates an APPROVED population, so an entry that never posted would
  // leave every assertion below comparing an empty set with an empty set.
  assert.equal(wire?.posted, true,
    `c10.block: the entry POSTS, so there is an approved population to aggregate (${JSON.stringify(wire?.refusal)})`);
  const mine = await entryShape(p.args.entry);
  assert.ok(mine.cp, "c10.block: the posted entry carries a counterparty on its control leg (0011:3057) — the block keys on it");
  assert.ok(mine.legs.length > 0, "c10.block: …and it has at least one non-zero leg to aggregate");

  const block = blockOfStrict(await pack(A1()), "c10.block");
  assert.ok(block.length > 0, "c10.block: the just-posted entry contributed at least one row");
  for (const row of block) {
    for (const col of PACK_COLUMNS) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, col),
        `c10.block: EVERY row carries '${col}' (§D.4's column list) — checking only row 0 would miss a partial projection`);
    }
  }
  for (const leg of mine.legs) {
    assert.ok(rowFor(block, mine.cp, leg),
      `c10.block: the posted entry's leg (${leg.account_code}/${leg.side}) is in the block — the aggregate is derived from THIS entry, not from anything that merely resembles it`);
  }

  // CLIENT-SCOPED, DIFFERENTIALLY. A2 is in A1's own firm, so the pack answers for it rather
  // than refusing — which is the only shape in which client scoping is actually under test.
  const q = await agentPostable(OWNER(), { client: A2(), amount: 640000 });
  const qwire = await wakePostEntry(q.cred, q.args);
  assert.equal(qwire?.posted, true,
    `c10.block: the FOIL client's entry posts too, so its block is non-empty and the exclusion below is a real absence (${JSON.stringify(qwire?.refusal)})`);
  const theirs = await entryShape(q.args.entry);
  assert.ok(theirs.cp && theirs.cp !== mine.cp,
    "c10.block: the two clients hold DISTINCT counterparties (counterparties are client-scoped) — identical ids would make the exclusion below untestable");
  const foil = blockOfStrict(await pack(A2()), "c10.block(foil)");
  assert.ok(foil.length > 0, "c10.block: the foil client's block is NON-EMPTY — an empty foil could not distinguish scoping from silence");
  assert.ok(!foil.some((r) => r.counterparty_id === mine.cp),
    "c10.block: CLIENT-SCOPED — the same-firm sibling's pack does NOT carry this client's counterparty");
  assert.ok(!block.some((r) => r.counterparty_id === theirs.cp),
    "c10.block: …and the exclusion holds in the other direction too");

  const raw = JSON.stringify(block);
  assert.ok(raw.length < 200_000,
    `c10.block: BUDGET-CAPPED — an unbounded block would silently eat the prompt window that the rest of the pack needs (${raw.length} bytes)`);
});

test("f-a2.c10.recomputed the block is computed from approved+unreversed, and MOVES when an entry is reversed", async (t) => {
  if (await gatePack(t)) return;
  if (await gateCore(t)) return;
  // The observable consequence of "recomputed, never accrued". An ACCRUED aggregate would keep
  // the reversed entry's contribution forever, because nothing ever goes back to unlearn it.
  // Measured PER LEG rather than by whole-block inequality: "something changed" is satisfied by
  // any noise, and this cell is about a specific contribution disappearing.
  const p = await agentPostable(OWNER(), { client: A1(), amount: 720000 });
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, true,
    `c10.recomputed: the entry POSTS, so there is a contribution for the reversal to remove (${JSON.stringify(wire?.refusal)})`);
  const mine = await entryShape(p.args.entry);
  assert.ok(mine.cp && mine.legs.length > 0, "c10.recomputed: the posted entry has a counterparty and non-zero legs");

  const before = blockOfStrict(await pack(A1()), "c10.recomputed(before)");
  const priors = mine.legs.map((leg) => ({ leg, row: rowFor(before, mine.cp, leg) }));
  for (const { leg, row } of priors) {
    assert.ok(row, `c10.recomputed: the block carries (${leg.account_code}/${leg.side}) BEFORE the reversal — a cell that reversed an absent contribution would prove nothing`);
  }

  // FORCED: the reversal is a PREMISE, so it is asserted from the catalog rather than inferred
  // from a call that did not raise. A swallowed reversal would leave the block legitimately
  // unchanged and the cell green.
  await reverseEntry(OWNER(), { entry: p.args.entry, reason: "c10 reversal", opKey: opk("c10rev") });
  const rv = await rootQuery("select reversed_by from clara.journal_entries where id=$1", [p.args.entry]);
  assert.ok(rv.rows[0]?.reversed_by,
    "c10.recomputed: the entry is actually REVERSED in the books — the premise of everything below");

  const after = blockOfStrict(await pack(A1()), "c10.recomputed(after)");
  for (const { leg, row } of priors) {
    const now = rowFor(after, mine.cp, leg);
    assert.equal(now ? now.n : 0, row.n - 1,
      `c10.recomputed: (${leg.account_code}/${leg.side}) lost EXACTLY the reversed entry's contribution (${row.n} -> ${now ? now.n : 0}). An accrued aggregate would not move, and would then be a second copy of the truth that drifts from the books`);
  }
  assert.ok(after.length <= before.length,
    `c10.recomputed: the reversal ENTRY itself contributed nothing (${before.length} -> ${after.length} rows) — a reversal is not a coding decision, and its flipped legs would teach the reader the opposite of the firm's own`);
});

test("f-a2.c10.no-sightings the block reads NO rule_sightings / coding_rules row", async (t) => {
  if (await gatePack(t)) return;
  if (await gateCore(t)) return;
  // HALF ONE — the call edge, by token scan of the LIVE body. This half proves a NON-read, which
  // behaviour can only ever sample.
  const src = (await bodyOfName("get_context_pack")).src;
  assert.ok(src, "c10.no-sightings: the pack body resolves");
  const bare = src.replace(/--[^\n]*/g, " ");
  for (const rel of ["rule_sightings", "coding_rules"]) {
    assert.ok(!new RegExp(`\\b${rel}\\b`).test(bare),
      `c10.no-sightings: the pack does not read clara.${rel}. Those rows are KEPT as data but are a FROZEN CORPUS superseded by the recomputed aggregate — reading both would mean learning twice from the same events`);
  }
  assert.match(bare, /journal_entries/, "c10.no-sightings: it reads the BOOKS instead");
  assert.match(bare, /reversed_by/, "c10.no-sightings: …filtered on reversed_by, which is what makes the reversal cell above true");

  // HALF TWO — BEHAVIOURAL, and it is the half that makes the first one worth anything. A
  // historical corpus row is planted for a (counterparty, account) pair the BOOKS do not carry.
  // An accrual-reading pack would surface it; a recomputed one cannot see it at all.
  const p = await agentPostable(OWNER(), { client: A1(), amount: 730000 });
  const wire = await wakePostEntry(p.cred, p.args);
  assert.equal(wire?.posted, true,
    `c10.no-sightings: the anchor entry POSTS, so the block is non-empty and "absent" means absent rather than silent (${JSON.stringify(wire?.refusal)})`);
  const mine = await entryShape(p.args.entry);
  assert.ok(mine.cp, "c10.no-sightings: the anchor entry carries a counterparty");

  // An account that EXISTS in the chart and appears on NO line — so the only thing that could
  // put it in the block is the corpus row.
  const unused = (await rootQuery(
    `select a.account_code from clara.coa_accounts a
      where a.client_id=$1
        and not exists (select 1 from clara.journal_lines l
                          where l.client_id=a.client_id and l.account_code=a.account_code)
      order by a.account_code limit 1`, [A1()])).rows[0]?.account_code;
  assert.ok(unused,
    "c10.no-sightings: the client holds a chart account with no journal line — the fixture needs one, and its absence is a fixture failure, not a pass");
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0]?.firm_id;
  assert.ok(firm, "c10.no-sightings: the client's firm resolves");
  await rootQuery(
    `insert into clara.rule_sightings(firm_id,client_id,counterparty_id,account_code,entry_id,side)
     values ($1,$2,$3,$4,$5,'debit')
     on conflict on constraint uq_rule_sightings_mapping do nothing`,
    [firm, A1(), mine.cp, unused, p.args.entry]);
  const planted = await rootQuery(
    "select count(*)::int as n from clara.rule_sightings where client_id=$1 and account_code=$2",
    [A1(), unused]);
  assert.equal(planted.rows[0].n, 1,
    "c10.no-sightings: the historical corpus row LANDED — an insert that silently did nothing would make the absence below meaningless");

  const block = blockOfStrict(await pack(A1()), "c10.no-sightings");
  assert.ok(block.some((r) => r.account_code === CHART.expense),
    "c10.no-sightings: the block is populated from the books (the anchor entry's expense leg is there) — so the exclusion below is a real absence");
  assert.ok(!block.some((r) => r.account_code === unused),
    `c10.no-sightings: the planted corpus row for ${unused} does NOT reach the block. The rows are KEPT as data and are readable by everything that always read them; the PACK is not one of those readers (D16)`);
});

test("f-a2.c10.markers all FIVE prior splice markers survive the fifth splice", async (t) => {
  if (await gatePack(t)) return;
  // `0036:1826-1850`'s tail asserts that EVERY post-0016 surgery marker survived. F-A2's splice
  // adds its own to that list and RE-ASSERTS the prior five — a splice that quietly dropped one
  // is the exact failure the tail exists to catch.
  const src = (await bodyOfName("get_context_pack")).src;
  assert.ok(src, "c10.markers: the pack body resolves");
  const PRIOR = ["sst_registration_watch", "'wiki'", "bound_scope_", "stale_at", "has_stale_sources"];
  for (const m of PRIOR) {
    assert.ok(src.includes(m), `c10.markers: prior marker '${m}' survives`);
  }
  const msic = src.split("'msic'").length - 1;
  assert.ok(msic > 0, `c10.markers: the 'msic' exact-count check still has something to count (found ${msic})`);
  assert.ok(src.includes(PACK_BLOCK), "c10.markers: …and F-A2's own marker joined the list");
});

test("f-a2.c10.anchor the splice anchor matched EXACTLY ONCE and the result CHANGED", async (t) => {
  if (await gatePack(t)) return;
  // The estate's anchoring rule (0018:452-461, 0019:1019-1032). A splice that matched TWICE, or
  // that matched and changed NOTHING, is the failure mode the discipline exists to catch — and
  // both are invisible to a migration that only checks it applied cleanly.
  const src = (await bodyOfName("get_context_pack")).src;
  assert.ok(src, "c10.anchor: the pack body resolves");
  const n = src.split(PACK_BLOCK).length - 1;
  assert.ok(n >= 1, `c10.anchor: the block name appears in the live body (found ${n}) — the splice CHANGED the result`);
  const inserts = src.split(`'${PACK_BLOCK}'`).length - 1;
  assert.equal(inserts, 1,
    `c10.anchor: the block is emitted EXACTLY ONCE, not duplicated by a double-matching anchor (found ${inserts} quoted occurrences)`);
  // The anchor the splice prepended to is still there, still singular: a later splice that
  // matched it twice would land its own block twice for the same reason.
  const anchors = src.split("'sst_registration_watch'").length - 1;
  assert.equal(anchors, 1,
    `c10.anchor: the anchor itself survived the splice byte-for-byte and is still unique (found ${anchors})`);
});

test("f-a2.c10.wiki-gate the wiki block still gates on purpose + pack_consumer", async (t) => {
  if (await gatePack(t)) return;
  if (await gateCore(t)) return;
  // BEHAVIOURAL, both directions, because the claim is "the fifth splice is a pure ADDITION and
  // moves no existing gate" — and a substring match on the body cannot tell a live gate from a
  // commented-out one. The proof of a wall is a cell that makes the wall REFUSE.
  const dark = await pack(A1(), { purpose: WB_V7_PURPOSE });
  assert.ok(dark, "c10.wiki-gate: the pack returns for the wiki purpose");
  assert.ok(!("wiki" in dark),
    "c10.wiki-gate: the wiki purpose ALONE stays dark — the pack_consumer capability token is still required");
  const lit = await pack(A1(), { purpose: WB_V7_PURPOSE, consumerGuc: WB_PACK_CONSUMER });
  assert.ok("wiki" in lit,
    "c10.wiki-gate: purpose AND the capability token light it — the gate still ADMITS, so the refusal above is a gate and not a breakage");
  const wrongPurpose = await pack(A1(), { purpose: "coding", consumerGuc: WB_PACK_CONSUMER });
  assert.ok(!("wiki" in wrongPurpose),
    "c10.wiki-gate: the token WITHOUT the purpose stays dark — the purpose half of the gate is intact too");

  // …and the fifth splice rides in every one of those three shapes, because it is gated on
  // neither. A patterns block that appeared only in the wiki-lit shape would be a coupling
  // nobody designed.
  for (const [label, p] of [["dark", dark], ["lit", lit], ["wrong-purpose", wrongPurpose]]) {
    assert.ok(Array.isArray(p[PACK_BLOCK]),
      `c10.wiki-gate: the patterns block is present in the ${label} shape — it is purpose-independent by design`);
  }

  const src = (await bodyOfName("get_context_pack")).src;
  assert.match(src, /pack_consumer/,
    "c10.wiki-gate: …and the capability token is still spelled in the live body, where the behaviour above says it is");
  noteLane(`c10.wiki-gate: autoDraft_v9 keeps sending pack_consumer='${WB_PACK_CONSUMER}' — a CAPABILITY TOKEN, not a version assertion (D22). The runtime half is ${PR2_PENDING}`);
});

// ===========================================================================
// C.11 — law 8 / law 73. Mostly UNGATED: these must be able to catch a verb added tomorrow.
// ===========================================================================

test("f-a2.c11.roster WB_AUTHORITY_FNS covers the three new post-path verbs", () => {
  for (const v of F_A2_POST_VERBS) {
    assert.ok(WB_AUTHORITY_FNS.includes(v),
      `c11.roster: '${v}' is on the authority roster — otherwise no scan ever asks whether the post path reads wiki or patterns`);
  }
  assert.equal(new Set(WB_AUTHORITY_FNS).size, WB_AUTHORITY_FNS.length,
    "c11.roster: the roster carries no duplicate — an extend-only edit that appended an existing name would hide a removal");
  for (const keep of ["_approve_entry_core", "_draft_entry_core", "approve_entry", "coding_lane"]) {
    assert.ok(WB_AUTHORITY_FNS.includes(keep),
      `c11.roster: EXTEND-ONLY — '${keep}' is still there. The eleven retirement removals are PR-3's, not this lane's`);
  }
});

test("f-a2.c11.closed-world the test FAILS if a new post-path verb is added without joining the roster", async (t) => {
  if (await gateCore(t)) return;
  // The closed-world half, and it is the half that makes the cell above worth anything. A roster
  // is only a mechanism if something notices when reality outgrows it: every clara function whose
  // name matches the post path's grammar must be ON the roster, or named here as a deliberate
  // non-member with a reason.
  const POST_PATH_RE = "^(wake_post_entry|_agent_post_entry_core|_tf_assert_agent_post_receipt"
    + "|_approve_entry_core|approve_entry|_agent_post|_tf_assert_agent_post)";
  const live = await rootQuery(
    `select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname ~ $1 order by 1`, [POST_PATH_RE]);
  const missing = live.rows.map((x) => x.proname).filter((n) => !WB_AUTHORITY_FNS.includes(n));
  assert.deepEqual(missing, [],
    `c11.closed-world: every live post-path verb is on WB_AUTHORITY_FNS. Unrostered: ${missing.join(", ")} — a new wall that never joins the roster is a wall nobody ever scans`);
});

test("f-a2.c11.no-wiki-in-walls no §3.2 wall references a wiki table or the patterns block", async (t) => {
  if (await gateCore(t)) return;
  const wikiRe = new RegExp(`\\b(${WB_WIKI_RELATIONS.join("|")})\\b`);
  const checked = [];
  for (const fn of WB_AUTHORITY_FNS) {
    const rows = await rootQuery(
      `select p.oid::regprocedure::text as sig, p.prosrc from pg_proc p
         join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1`, [fn]);
    for (const row of rows.rows) {
      const bare = row.prosrc.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
      assert.ok(!wikiRe.test(bare),
        `c11.no-wiki-in-walls: ${row.sig} references a wiki relation (${bare.match(wikiRe)?.[0]}) — a gate, bound or floor may never read wiki (law 73)`);
      assert.ok(!bare.includes(PACK_BLOCK),
        `c11.no-wiki-in-walls: ${row.sig} references the patterns block — the same law, and the reason F-A2's addition to this roster is not bookkeeping`);
      checked.push(row.sig);
    }
  }
  assert.ok(checked.length >= WB_AUTHORITY_FNS.length - 12,
    `c11.no-wiki-in-walls: the scan actually resolved most of the roster (${checked.length} signatures for ${WB_AUTHORITY_FNS.length} names) — a scan that silently resolved nothing would be a green that measured nothing`);
});

test("f-a2.c11.pack-off-roster get_context_pack is NOT on the authority roster — and IS on the wiki whitelist", () => {
  assert.ok(!WB_AUTHORITY_FNS.includes("get_context_pack"),
    "c11.pack-off-roster: the pack is a READER. Putting it on the authority roster would assert it is a wall, which is the exact confusion law 73 exists to prevent");
  assert.ok(WB_WIKI_WHITELIST.includes("get_context_pack"),
    "c11.pack-off-roster: …and it is on the wiki whitelist, where a lawful reader of wiki belongs. The two lists are opposite ends of one law");
  assert.ok(!WB_WIKI_WHITELIST.some((n) => F_A2_POST_VERBS.includes(n)),
    "c11.pack-off-roster: and no post-path verb is whitelisted to read wiki — the separation holds in both directions");
});
