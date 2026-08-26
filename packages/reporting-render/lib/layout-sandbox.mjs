// @frozen — determinism-critical (Wave F Track-A, F-A5b card 1; walks a sandbox view's typed
// `body.blocks` and the widened `clara.sandbox_export_payload`).
//
// THE SANDBOX ASSEMBLER — THE SECOND ENTRANCE, AND THE SUBSTITUTION SEAM'S RENDER-TIME HALF.
//
// WHY THIS IS A SIBLING MODULE AND NOT AN EXPORT ADDED TO layout.mjs. The design permits either
// ("or a sibling module, per the package's own convention"). The live estate settles it:
// layout.mjs is `deployed: true` in frozen-workflows.json, and check-frozen-workflows.mjs's
// append-only-vs-base rule (REHASHED-VS-BASE) makes a deployed frozen body immutable versus
// origin/main. Adding an export there would change its hash and be rejected — correctly. So the
// new entrance lands beside it, marked @frozen and registered UNDEPLOYED, which is the same
// posture layout.mjs itself carried before its ceremony.
//
// WHAT A PLACEHOLDER BLOCK IS, AND WHY IT EXISTS. Hard constraint 2 says the DB owns every
// authoritative number. Before the substitution seam, a sandbox export carrying a FIGURE had only
// one shape: a model typing the numeral into a text block's `displayed_text`. A `placeholder`
// block carries NO numeral-shaped field at all — only `{kind, basis_ref}` — so the figure enters
// as a POINTER the database resolves. This module is where that pointer becomes bytes, and it
// resolves it ONLY from the payload the database built by joining on the cell id FROZEN in the
// view's own `basis` array at mint time.
//
// EVERY STRING FROM THE DATABASE IS EMITTED AS A TYPST STRING LITERAL, never as markup —
// layout.mjs's rule, inherited verbatim, which is why `typstString` is imported from there rather
// than reimplemented. A wording row, a client name or a substituted figure can never become
// typesetting markup.
//
// THIS ASSEMBLER NEVER FORMATS A NUMBER (E-R8 floor 1). A placeholder prints the database's own
// `displayed_text` for the pinned cell, byte for byte. There is no rounding, no scale, no
// thousands separator and no locale formatting anywhere in this file — a second authority for one
// presentation is how a figure drifts.
//
// AN UNKNOWN BLOCK KIND IS A REFUSAL, and so is a payload entry that is present but malformed. A
// narrative export that silently dropped a block, or silently printed an empty string where a
// figure belonged, is worse than one that fails to render: the reader cannot see what is missing.

import { RenderRefusal } from "./decisions.mjs";
import { typstString } from "./layout.mjs";

/** The block kinds this assembler admits. Closed, and closed deliberately. */
export const SANDBOX_BLOCK_KINDS = Object.freeze(["text", "placeholder"]);

/**
 * The fail-closed accessor. An ABSENT key is a refusal, never an `undefined` that flows onward
 * into a coercion.
 *
 * IT IS A DELIBERATE DUPLICATE OF layout.mjs's OWN `need()`, AND THAT IS NOT DRIFT. Three facts
 * force it, and they are recorded here so the next reader does not "fix" it by exporting the
 * original: (1) `need` is module-private in layout.mjs, so there is nothing to import; (2)
 * layout.mjs is `deployed: true` in frozen-workflows.json, which makes its body immutable versus
 * origin/main — adding an export to it is exactly the change check-frozen-workflows' REHASHED-VS-
 * BASE rule exists to reject, and constraint 9 says the same thing about a deployed body; and
 * (3) the two copies are behaviourally identical BY CONSTRUCTION, not by coincidence — the shape
 * is four lines whose whole content is "throw a typed refusal on a missing key", and the sibling
 * battery forces that refusal directly (B3.2) rather than trusting the copy to have stayed true.
 * If layout.mjs is ever unfrozen and `need` exported, this copy should collapse into that import.
 */
function need(map, key, kind) {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) {
    throw new RenderRefusal(`${kind}_unresolved`,
      `the sandbox body references ${kind} "${key}" and the payload does not resolve it`,
      { kind, key });
  }
  return map[key];
}

/**
 * Reshape what `clara.sandbox_export_payload` returned into what `layoutSandbox` consumes —
 * the sibling of render-worker.mjs's own `shapePayload`.
 *
 * IT COPIES, IT DOES NOT DERIVE. Every field here comes from the payload verbatim; nothing is
 * defaulted, substituted or re-resolved. In particular `cellsByBasisRef` is the payload's own
 * `cells` object, which the database built by joining on the EXACT cell id recorded in the minted
 * `sandbox_views.basis` array — never a "latest cell for this definition" lookup. Re-deriving any
 * part of that here would put a second resolver beside the pinned one, which is the whole failure
 * mode the pin exists to prevent.
 */
export function shapeSandboxPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new RenderRefusal("sandbox_payload_absent",
      "the database returned no payload for a sandbox export this worker holds");
  }
  const body = payload.body;
  if (!body || typeof body !== "object" || !Array.isArray(body.blocks) || body.blocks.length === 0) {
    throw new RenderRefusal("sandbox_body_malformed",
      "a sandbox view body must carry at least one typed block",
      { blocks: Array.isArray(body?.blocks) ? body.blocks.length : null });
  }
  // The `cells` map is `{}` for a body with no placeholder block — an honest empty, not an
  // absence. A payload that omits the key entirely predates the seam and must NOT be treated as
  // "no cells": it is a payload this assembler cannot reason about, so it refuses.
  if (!Object.prototype.hasOwnProperty.call(payload, "cells")
      || payload.cells === null || typeof payload.cells !== "object" || Array.isArray(payload.cells)) {
    throw new RenderRefusal("sandbox_payload_unseamed",
      "the payload carries no `cells` object — this renderer requires the widened sandbox_export_payload that pre-joins cited cells by their pinned basis id",
      { cells: typeof payload.cells });
  }
  return {
    sandboxExportId: payload.sandbox_export_id,
    sandboxViewId: payload.sandbox_view_id,
    firmId: payload.firm_id,
    locale: payload.locale,
    bodySha256: payload.body_sha256,
    blocks: body.blocks,
    cellsByBasisRef: payload.cells,
    // Carried verbatim from the pinned watermark policy version the REQUEST froze — never
    // re-resolved from "today's effective policy" and never authored here.
    watermark: payload.watermark,
  };
}

/**
 * The unconditional sandbox watermark wall (sandbox-export-design.md §3.6a, C-23).
 *
 * A sandbox export is a WORKING ANALYSIS and must say so on its face. The wall is unconditional
 * and it is a REFUSAL rather than a default: a renderer that supplied its own wording when the
 * pinned policy text was missing would be authoring disclosure language, which is exactly what
 * E-R8 and the manifest rulings forbid. An absent or blank watermark is a defect upstream.
 */
function watermarkTextOrRefuse(shaped) {
  const raw = shaped.watermark && typeof shaped.watermark === "object"
    ? shaped.watermark.watermark : null;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new RenderRefusal("sandbox_watermark_unsealed",
      "the pinned sandbox watermark policy version carries no watermark text; this renderer does not author disclosure language",
      { sandbox_export_id: shaped.sandboxExportId });
  }
  return raw;
}

/**
 * Assemble a sandbox view's typed body into deterministic typesetting source.
 *
 * Returns both the source and the list of substituted figures it actually DREW — the sandbox
 * analogue of `assemble()`'s drawn-placeholder list, and the thing a gate can cross-check against
 * the extracted text of the produced PDF.
 *
 * @param {{ payload: object, decision?: object }} args
 */
export function layoutSandbox({ payload, decision } = {}) {
  const shaped = shapeSandboxPayload(payload);
  const watermark = watermarkTextOrRefuse(shaped);
  const substituted = [];

  const rendered = shaped.blocks.map((block) => {
    if (!block || typeof block !== "object" || typeof block.kind !== "string") {
      throw new RenderRefusal("sandbox_body_malformed",
        "a sandbox body block is not a typed block object", { block: typeof block });
    }
    switch (block.kind) {
      case "text": {
        if (typeof block.displayed_text !== "string" || block.displayed_text.trim() === "") {
          throw new RenderRefusal("sandbox_body_malformed",
            "a text block must carry non-blank displayed_text",
            { basis_ref: block.basis_ref });
        }
        return `#par[#s(${typstString(block.displayed_text)})]`;
      }
      case "placeholder": {
        const cell = need(shaped.cellsByBasisRef, block.basis_ref, "sandbox_cell");
        // TWO DIFFERENT DEFENCE AXES AGAINST TWO DIFFERENT PAYLOAD-BUILDER FAILURE MODES, and
        // neither is against a live-data race — there is none, because a metric_cells row is
        // permanently immutable and the mint already refused any placeholder citing a non-'ok'
        // cell. `sandbox_cell_unresolved` (above) answers an ABSENT key; this answers a
        // PRESENT-but-wrong-shaped one.
        //
        // IT MUST RUN BEFORE typstString, and that ordering is the whole point. typstString is
        // `'"' + String(value ?? "") ...` — it coerces null and undefined to the empty string and
        // NEVER THROWS, so a malformed entry reaching it would render a figure as nothing at all,
        // silently, inside a document a human is about to rely on.
        if (!cell || typeof cell !== "object"
            || cell.cell_status !== "ok" || typeof cell.displayed_text !== "string") {
          throw new RenderRefusal("sandbox_cell_malformed",
            `the payload's resolved cell for "${block.basis_ref}" is not a well-formed 'ok' cell`,
            { basis_ref: block.basis_ref, cell_status: cell?.cell_status ?? null });
        }
        substituted.push({
          basis_ref: block.basis_ref, cell_id: cell.cell_id, displayed_text: cell.displayed_text,
        });
        // THE DATABASE'S OWN displayed_text, VERBATIM. There is deliberately NO `na_label`-shaped
        // fallback branch here, unlike metric_ref's: a placeholder block has no fallback string,
        // the mint already refused a non-'ok' citation, and cells are immutable — so a cell that
        // was 'ok' at mint can never be anything else at render. The alternative to refusing is
        // printing something no evaluator produced.
        return `#par[#s(${typstString(cell.displayed_text)})]`;
      }
      default:
        throw new RenderRefusal("sandbox_block_kind_unsupported",
          `sandbox block kind "${block.kind}" is not one this assembler renders; a narrative export that silently drops a block it did not recognise is worse than one that fails`,
          { kind: block.kind });
    }
  });

  return {
    source: rendered.join("\n"),
    watermark,
    substituted,
    bodySha256: shaped.bodySha256,
    locale: shaped.locale,
    decision: decision ?? null,
  };
}
