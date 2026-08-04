// 0042 Wave D-b — as-built ladder ROUND-10 FIX WAVE, lane O3: THE WALL-CENSUS INSTRUMENT,
// WIDENED FROM AXIS SETS TO REFUSAL SITES. (Not a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it. It is imported by BOTH x42-r9-n2.test.mjs — whose
// f1-census cell is the one this replaces — and x42-r10-o3.test.mjs, so there is exactly ONE
// copy of the scanner and the two cells cannot drift apart. The repo's 500-line file ceiling
// is the other reason for the split; the x42-r8-seam-kit.mjs precedent.)
//
// WHAT ROUND 10 MEASURED ABOUT THE ROUND-9/O2 CENSUS (Codex r10 finding 2, MEDIUM; probe
// scratchpad/o3/probes/p3-census-axis-reuse.mjs, run against the LIVE belt on this rig):
//
//   * IT COMPARED AXIS LITERALS AS A SET. Planting a SIXTH, un-mirrored reversal refusal that
//     uses a NEW reason (`advance_leg_unbacked_by_particulars`) with the EXISTING axis
//     (`unregistered_mirror`) left both sets equal to {unregistered_mirror} and `missing` empty
//     — MEASURED GREEN over exactly the defect the cell exists to catch. The axis is not the
//     wall's identity; the (reason, axis) PAIR is what a caller keys on, and the pair is what a
//     mirroring admission arm has to carry.
//   * A NON-LITERAL AXIS WAS REPORTED AS A "BARE RAISE". `'axis', v_axis` went red — correctly
//     — but under a message that said the raise names NO axis, which is a different fact. An
//     instrument that is right for the wrong reason teaches the next reader the wrong lesson.
//   * IT NEVER ENUMERATED THE ADMISSION BODY'S CONSUMERS. Codex named this as the reason its
//     own HIGH (the correction door advertising a verb the fifth wall refuses) also slipped
//     past: proving belt->admission mirroring says nothing about whether the bodies that
//     PROMISE a reversal outcome ever ask the admission body at all. That arm lives in
//     x42-r10-o3.test.mjs, built on `admissionConsumers` below.
//
// WHAT THIS SCANNER DOES INSTEAD. It enumerates REFUSAL SITES, not axis strings:
//   site = { reason, axis, evidence relations of its GUARDING PREDICATE's source span }
// and requires, for every belt site, an admission arm carrying the SAME (reason, axis) pair
// CO-LOCATED in one jsonb_build_object, whose own guard span consults every book the belt's
// guard tests. `reason`/`axis` that are absent or non-literal are reported BY NAME, separately.
//
// WHAT IT STILL CANNOT SEE, stated rather than left to be re-discovered: a sixth wall that
// reuses BOTH the reason AND the axis AND consults only books an existing arm already consults
// is textually indistinguishable from the wall it clones. Z2's own round-10 fix_direction ruled
// that un-catchable by any text census and deferred it to the BEHAVIOURAL pairing cells
// (x42-r8-seam2 w1/w2, which drive the admission body and the belt against the same fixtures).
// The site-COUNT arm below narrows even that: a pair may not appear at MORE sites in the belt
// than it has arms in the admission body.

/** Comment-strip (line comments only — plpgsql bodies here carry no block comments in the
 *  scanned regions, and stripping `/* *\/` naively would eat a `/` in a message). */
export const stripLineComments = (s) => String(s ?? "").replace(/--[^\n]*/g, " ");

/** Balanced `if ... end if` walk from `openIdx` (the position of an `if` token). Unchanged in
 *  mechanism from the round-9 scanner — a NESTED if inside the branch does not truncate it. */
export function balancedIfBlock(src, openIdx) {
  let depth = 0;
  let scan = openIdx;
  while (scan < src.length) {
    const nextIf = /\bif\b/i.exec(src.slice(scan));
    const nextEnd = /\bend\s+if\b/i.exec(src.slice(scan));
    const ifAt = nextIf ? scan + nextIf.index : Infinity;
    const endAt = nextEnd ? scan + nextEnd.index : Infinity;
    if (endAt === Infinity) return null;
    if (ifAt < endAt) { depth += 1; scan = ifAt + 2; }
    else {
      depth -= 1; scan = endAt + 6;
      if (depth === 0) return { text: src.slice(openIdx, endAt), start: openIdx, end: endAt };
    }
  }
  return null;
}

/** Every top-level `if <cond> then` block whose condition mentions `pattern` — robust to a
 *  COMPOUND condition (r10 Z2 evasion C) and to MORE THAN ONE such guard existing. The
 *  negative lookbehind excludes the bare `if` INSIDE `end if` from opening a bogus candidate
 *  (measured while building the round-10 O2 scanner: without it, `end if;\n if v_backed then`
 *  reads as a fresh `if` whose condition swallows the next real guard). */
export function scopedBlocks(src, pattern) {
  const openRe = /(?<!\bend\s{1,4})\bif\b([\s\S]{0,300}?)\bthen\b/gi;
  const blocks = [];
  let om;
  while ((om = openRe.exec(src)) !== null) {
    if (!pattern.test(om[1])) continue;
    const b = balancedIfBlock(src, om.index);
    if (b) blocks.push(b);
  }
  return blocks;
}

/** Each `raise exception ...` statement's OWN text extent inside `block` (one raise to the
 *  next, or to the block's end) — so a raise is judged on its own text, never on whether SOME
 *  OTHER raise in the same block happens to carry the key being looked for (r10 Z2 evasion E). */
export function raiseExtents(block) {
  const raiseRe = /raise\s+exception/gi;
  const starts = [];
  let rm;
  while ((rm = raiseRe.exec(block)) !== null) starts.push(rm.index);
  return starts.map((s, i) => ({
    text: block.slice(s, i + 1 < starts.length ? starts[i + 1] : block.length),
    offset: s,
  }));
}

/** A jsonb key's value, classified. `literal` is the only shape a text census can compare;
 *  `dynamic` (an expression) and `absent` are each reported BY THEIR OWN NAME, because
 *  conflating them is what made the round-9/O2 message wrong about the dynamic case. */
export function keyLiteral(extent, key) {
  const m = new RegExp(`'${key}'\\s*,\\s*'([a-z0-9_]+)'`, "i").exec(extent);
  if (m) return { kind: "literal", value: m[1] };
  if (new RegExp(`'${key}'\\s*,`, "i").test(extent)) return { kind: "dynamic", value: null };
  return { kind: "absent", value: null };
}

/** The BOOKS a source span reads — `from/join/update/into clara.<relation>` only, so prose in
 *  a refusal message that happens to name `clara.something` is not mistaken for evidence.
 *  Leading-underscore names (helper FUNCTIONS) cannot match: the class is `[a-z]` first. */
export const evidenceRelations = (span) => [...new Set(
  [...String(span).matchAll(/\b(?:from|join|update|into)\s+(?:only\s+)?clara\.([a-z][a-z0-9_]*)/gi)]
    .map((m) => m[1].toLowerCase()),
)].sort();

/** The start of the innermost enclosing `for ... loop` header before `at` (0 when there is
 *  none). The GUARDING PREDICATE of a refusal inside a row loop includes the loop's own
 *  SELECT — that is where the belt states which lines it is judging and where the admission
 *  body states which lines it walks — so a span that stopped at the `if` would compare two
 *  guards with half their evidence missing. */
export function enclosingLoopStart(src, at) {
  const re = /\bfor\b[\s\S]{0,1200}?\bloop\b/gi;
  let best = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index < at) best = m.index; else break;
  }
  return best;
}

/** Every reversal-path CLR40 refusal SITE in a belt/trigger body. */
export function refusalSites(rawSrc, { scope = /new\.reversal_of/i, errcode = "clr40" } = {}) {
  const src = stripLineComments(rawSrc);
  const sites = [];
  for (const b of scopedBlocks(src, scope)) {
    for (const r of raiseExtents(b.text)) {
      if (!new RegExp(`errcode\\s*=\\s*'${errcode}'`, "i").test(r.text)) continue;
      const abs = b.start + r.offset;
      const span = src.slice(Math.min(enclosingLoopStart(src, abs), b.start), abs);
      sites.push({
        reason: keyLiteral(r.text, "reason"),
        axis: keyLiteral(r.text, "axis"),
        relations: evidenceRelations(span),
        head: r.text.slice(0, 90).replace(/\s+/g, " "),
      });
    }
  }
  return sites;
}

/** Every `raise exception` in a body's reversal-scoped block, classified by how its errcode is
 *  sourced: a LITERAL errcode is a wall this body states ITSELF (and therefore one an admission
 *  body must mirror); a NON-LITERAL one is DELEGATED — the body is re-raising somebody else's
 *  answer, which is the shape the round-8/9 fixes moved every advance wall into. */
export function raiseClassification(rawSrc, { scope = /e\.reversal_of/i } = {}) {
  const src = stripLineComments(rawSrc);
  const out = [];
  for (const b of scopedBlocks(src, scope)) {
    for (const r of raiseExtents(b.text)) {
      const m = /errcode\s*=\s*'([a-z0-9]+)'/i.exec(r.text);
      out.push({
        errcode: m ? m[1].toUpperCase() : null,
        delegated: !m,
        reason: keyLiteral(r.text, "reason"),
        axis: keyLiteral(r.text, "axis"),
        head: r.text.slice(0, 90).replace(/\s+/g, " "),
      });
    }
  }
  return out;
}

/** Every ARM of an admission body: a `jsonb_build_object(...)` carrying BOTH a literal
 *  `reason` and a literal `axis`, keyed by that PAIR, with the evidence relations of its own
 *  guard span. The extent is walked by BALANCED PARENS, not by a lazy regex, so a nested
 *  build (the `detail` object inside the envelope) is measured on its own terms too — it
 *  carries the same pair by construction and only ever ADDS relations, so the union below is
 *  unchanged by counting it. */
export function admissionArms(rawSrc) {
  const src = stripLineComments(rawSrc);
  const arms = [];
  const re = /jsonb_build_object\s*\(/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = src.indexOf("(", m.index);
    let depth = 0;
    let end = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    const extent = src.slice(m.index, end + 1);
    const reason = keyLiteral(extent, "reason");
    const axis = keyLiteral(extent, "axis");
    if (reason.kind !== "literal" || axis.kind !== "literal") continue;
    arms.push({
      reason: reason.value,
      axis: axis.value,
      relations: evidenceRelations(src.slice(enclosingLoopStart(src, m.index), m.index)),
    });
  }
  return arms;
}

export const pairKey = (reason, axis) => `${reason}|${axis}`;

/** pair -> { arms: n, relations: Set } over an admission body. */
export function armIndex(arms) {
  const idx = new Map();
  for (const a of arms) {
    const k = pairKey(a.reason, a.axis);
    if (!idx.has(k)) idx.set(k, { arms: 0, relations: new Set() });
    const e = idx.get(k);
    e.arms += 1;
    for (const r of a.relations) e.relations.add(r);
  }
  return idx;
}

/** THE VERDICT. Everything a cell needs to fail with a sentence naming what broke. */
export function censusVerdict(sites, arms) {
  const idx = armIndex(arms);
  const nonLiteral = sites
    .filter((s) => s.reason.kind !== "literal" || s.axis.kind !== "literal")
    .map((s) => `${s.head} [reason:${s.reason.kind} axis:${s.axis.kind}]`);
  const literal = sites.filter((s) => s.reason.kind === "literal" && s.axis.kind === "literal");
  const unmirrored = [];
  const underConsulted = [];
  const overSited = [];
  const counted = new Map();
  for (const s of literal) {
    const k = pairKey(s.reason.value, s.axis.value);
    counted.set(k, (counted.get(k) ?? 0) + 1);
    const e = idx.get(k);
    if (!e) { unmirrored.push(k); continue; }
    const missing = s.relations.filter((r) => !e.relations.has(r));
    if (missing.length) underConsulted.push(`${k} -> books the admission arms never read: ${missing.join(", ")}`);
  }
  for (const [k, n] of counted) {
    const e = idx.get(k);
    if (e && n > e.arms) overSited.push(`${k}: ${n} belt site(s) vs ${e.arms} admission arm(s)`);
  }
  return { nonLiteral, unmirrored, underConsulted, overSited, pairs: [...counted.keys()].sort() };
}

/** The bodies that CALL an authority, straight from pg_proc — the "consumer census" half Codex
 *  named as the reason a text census of the walls alone could not catch the round-10 HIGH. */
export const admissionConsumers = async (rootQuery, fn) => (await rootQuery(
  `select coalesce(string_agg(p.proname, ', ' order by p.proname), '') as n
     from pg_proc p
    where p.pronamespace = 'clara'::regnamespace and p.proname <> $2
      and position($1 in coalesce(p.prosrc, '')) > 0`,
  [`clara.${fn}(`, fn],
)).rows[0].n;
