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

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane, ROLES, roleQuery,
  opk, reverseEntry, postingCoreReady, packSpliceReady,
  gatePack, gateCore, wakePostEntry, agentPostable, bodyOf,
  F_A2_POST_VERBS, PR2_PENDING,
} from "./f-a2-post-world.mjs";
import { WB_AUTHORITY_FNS, WB_WIKI_WHITELIST, WB_WIKI_RELATIONS } from "./wave-b/wb-helpers.mjs";

let world = null;
before(async () => { if ((await postingCoreReady()) || (await packSpliceReady())) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-pack");
  printSkipCount("f-a2-pack");
  await endPool();
});

const A1 = () => world.clients.A1;
const OWNER = () => world.users.alice;

const PACK_BLOCK = "approved_coding_patterns";
const PACK_COLUMNS = ["counterparty_id", "coding_kind", "account_code", "side", "n", "first_seen", "last_seen"];

async function pack(client, purpose = "coding") {
  const r = await roleQuery(ROLES.agentRo,
    "select clara.get_context_pack(p_client => $1, p_purpose => $2) as p", [client, purpose]);
  return r.rows[0].p;
}
const blockOf = (p) => p?.[PACK_BLOCK] ?? p?.blocks?.[PACK_BLOCK] ?? null;

// ===========================================================================
// C.10 — the fifth splice. PR-1b.
// ===========================================================================

test("f-a2.c10.block the approved_coding_patterns block appears, client-scoped and budget-capped", async (t) => {
  if (await gatePack(t)) return;
  if (await gateCore(t)) return;
  const p = await agentPostable(OWNER(), { client: A1(), amount: 710000 });
  await wakePostEntry(p.cred, p.args);
  const block = blockOf(await pack(A1()));
  assert.ok(Array.isArray(block), `c10.block: the block is present and is a list (got ${JSON.stringify(block)?.slice(0, 120)})`);
  assert.ok(block.length > 0, "c10.block: …and the just-posted entry contributed a row");
  for (const col of PACK_COLUMNS) {
    assert.ok(Object.prototype.hasOwnProperty.call(block[0], col),
      `c10.block: each row carries '${col}' (§D.4's column list)`);
  }
  const foreign = blockOf(await pack(world.clients.B1));
  assert.ok(!Array.isArray(foreign) || foreign.length === 0 || foreign.every((r) => !block.some((b) => b.account_code === r.account_code && b.n === r.n)),
    "c10.block: CLIENT-SCOPED — another client's pack does not carry this client's rows");
  const raw = JSON.stringify(block);
  assert.ok(raw.length < 200_000,
    `c10.block: BUDGET-CAPPED — an unbounded block would silently eat the prompt window that the rest of the pack needs (${raw.length} bytes)`);
});

test("f-a2.c10.recomputed the block is computed from approved+unreversed, and MOVES when an entry is reversed", async (t) => {
  if (await gatePack(t)) return;
  if (await gateCore(t)) return;
  // The observable consequence of "recomputed, never accrued". An ACCRUED aggregate would keep
  // the reversed entry's contribution forever, because nothing ever goes back to unlearn it.
  const p = await agentPostable(OWNER(), { client: A1(), amount: 720000 });
  const wire = await wakePostEntry(p.cred, p.args);
  if (wire?.posted !== true) { noteLane(`c10.recomputed: the entry did not post (${JSON.stringify(wire?.refusal)})`); return; }
  const before = blockOf(await pack(A1()));
  await reverseEntry(OWNER(), { entry: p.args.entry, reason: "c10 reversal", opKey: opk("c10rev") })
    .catch((e) => noteLane(`c10.recomputed: reverse_entry raised ${e.code}: ${e.message}`));
  const after = blockOf(await pack(A1()));
  assert.notEqual(JSON.stringify(after), JSON.stringify(before),
    "c10.recomputed: reversing an entry MOVES the block. An accrued aggregate would not move, and would then be a second copy of the truth that drifts from the books");
});

test("f-a2.c10.no-sightings the block reads NO rule_sightings / coding_rules row", async (t) => {
  if (await gatePack(t)) return;
  const src = await bodyOf("clara.get_context_pack(uuid,text)");
  assert.ok(src, "c10.no-sightings: the pack body resolves");
  const bare = src.replace(/--[^\n]*/g, " ");
  for (const rel of ["rule_sightings", "coding_rules"]) {
    assert.ok(!new RegExp(`\\b${rel}\\b`).test(bare),
      `c10.no-sightings: the pack does not read clara.${rel}. Those rows are KEPT as data but are a FROZEN CORPUS superseded by the recomputed aggregate — reading both would mean learning twice from the same events`);
  }
  assert.match(bare, /journal_entries/, "c10.no-sightings: it reads the BOOKS instead");
  assert.match(bare, /reversed_by/, "c10.no-sightings: …filtered on reversed_by, which is what makes the reversal cell above true");
});

test("f-a2.c10.markers all FIVE prior splice markers survive the fifth splice", async (t) => {
  if (await gatePack(t)) return;
  // `0036:1826-1850`'s tail asserts that EVERY post-0016 surgery marker survived. F-A2's splice
  // adds its own to that list and RE-ASSERTS the prior five — a splice that quietly dropped one
  // is the exact failure the tail exists to catch.
  const src = await bodyOf("clara.get_context_pack(uuid,text)");
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
  const src = await bodyOf("clara.get_context_pack(uuid,text)");
  assert.ok(src, "c10.anchor: the pack body resolves");
  const n = src.split(PACK_BLOCK).length - 1;
  assert.ok(n >= 1, `c10.anchor: the block name appears in the live body (found ${n}) — the splice CHANGED the result`);
  const inserts = src.split(`'${PACK_BLOCK}'`).length - 1;
  assert.ok(inserts <= 2,
    `c10.anchor: the block is emitted ONCE, not duplicated by a double-matching anchor (found ${inserts} quoted occurrences)`);
});

test("f-a2.c10.wiki-gate the wiki block still gates on purpose + pack_consumer", async (t) => {
  if (await gatePack(t)) return;
  const src = await bodyOf("clara.get_context_pack(uuid,text)");
  assert.ok(src, "c10.wiki-gate: the pack body resolves");
  assert.match(src, /pack_consumer/,
    "c10.wiki-gate: the pack_consumer capability token still gates the wiki block — the fifth splice is a pure ADDITION and moves no existing gate");
  assert.match(src, /p_purpose|purpose/,
    "c10.wiki-gate: …and so does the purpose");
  noteLane(`c10.wiki-gate: autoDraft_v9 keeps sending pack_consumer='v25' — a CAPABILITY TOKEN, not a version assertion (D22). The runtime half is ${PR2_PENDING}`);
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
