import { parentPort, workerData } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { readZipEntries, readZipEntry } from "./scan.mjs";
import { parseUblIdentity, parseUblFacts } from "./myinvois.mjs";

const MAX_ITEMS = 50_000;
const MAX_TEXT = 4 * 1024 * 1024;

function xmlDecode(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function parseDelimitedLine(line, delimiter) {
  const out = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(value);
      value = "";
    } else value += ch;
  }
  out.push(value);
  return out;
}

async function parseCsv(path, format, task) {
  const text = await readFile(path, "utf8");
  if (text.length > MAX_TEXT * 4) throw Object.assign(new Error("CSV parse cap exceeded"), { code: "limit" });
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.length > 0);
  const delimiter = format === "tsv" ? "\t" : lines.some((l) => l.includes(",")) ? "," : ";";
  const rows = lines.slice(0, MAX_ITEMS).map((line) => parseDelimitedLine(line, delimiter));
  const regions = rows.map((row, i) => ({
    locator_kind: "row_col",
    locator: { row: i + 1, column_start: 1, column_end: row.length },
    field_path: `rows.${i}`,
    text_content: row.join(" | ").slice(0, 16_384),
    engine_confidence: null,
    monetary_raw: null,
    monetary_cents: null,
  }));
  return { pageCount: 1, envelope: { schema_version: 1, engine: { id: task.engineId, kind: "structured_parse", version_n: task.versionN }, format, rows }, regions };
}

/** An A1-style spreadsheet cell reference, and NOTHING else. `^[A-Za-z]{1,3}[0-9]{1,7}$` is the
 *  whole of what a single cell's `r=` can legitimately be: XLSX columns run A..XFD (three letters)
 *  and rows to 1,048,576 (seven digits). */
const XLSX_CELL_REF = /^[A-Za-z]{1,3}[0-9]{1,7}$/;

/** The declared `r=` when it is an A1 reference, else a synthetic ordinal.
 *
 *  WHY THIS IS CLAMPED AT ALL, and it is not tidiness. `ref` is interpolated into a `field_path`
 *  (`sheets.${s}.${ref}`, in sheetCellRegion below) and `clara.persist_document_extraction`
 *  validates that path against the canonical grammar as the FIRST statement of its region loop
 *  (migration 0191). The `r=` attribute is whatever the workbook says it is — `A1:B1` on a merged
 *  range, `$A$1` from a hand-edited sheet, an entity-escaped or wholly junk value — and none of
 *  those is a legal field_path. Passing one through would refuse the whole persist with CLR10,
 *  roll the transaction back, leave the task `running`, and burn the document's attempt cap on a
 *  file that stored perfectly well before the validator existed. The grammar is right to refuse a
 *  malformed path; the fix belongs HERE, where the malformed path is born.
 *
 *  A REJECTED REF FALLS BACK TO THE SYNTHETIC ORDINAL rather than being dropped: the cell's VALUE
 *  is real evidence and must still be stored. The locator keeps the raw `r=` verbatim (see
 *  sheetCellRegion), so nothing is lost — the ordinal names the region, the locator preserves what
 *  the workbook actually claimed.
 *
 *  `cell_<n>` RATHER THAN `C<n>`, and the underscore is the whole reason. An A1 reference is
 *  letters-then-digits and can never contain one, so a fallback cannot collide with a ref another
 *  cell of the same sheet legitimately declared — whereas `C3` (the shape this replaced) collides
 *  with the perfectly ordinary address C3. There is no unique index on (extraction_id, field_path)
 *  in 0007, so such a collision is not refused: it silently produces two regions claiming one
 *  cell, and the workbench's fact→region link then has two answers. */
export function normalizeCellRef(raw, ordinal) {
  return typeof raw === "string" && XLSX_CELL_REF.test(raw) ? raw : `cell_${ordinal}`;
}

export function valuesFromSheet(xml, shared) {
  const cells = [];
  const re = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let match;
  while ((match = re.exec(xml)) && cells.length < MAX_ITEMS) {
    const attrs = match[1];
    const body = match[2];
    const declared = /\br="([^"]+)"/.exec(attrs)?.[1] ?? null;
    const ref = normalizeCellRef(declared, cells.length + 1);
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || "";
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "";
    const value = type === "s" ? shared[Number(raw)] ?? "" : xmlDecode(raw);
    const cell = { ref, value: String(value) };
    // Carried ONLY when the workbook's own claim was rejected: an accepted ref already IS `ref`,
    // and repeating it in every cell of every envelope would be noise stored a million times over.
    if (declared !== null && declared !== ref) cell.declared_ref = declared;
    cells.push(cell);
  }
  return cells;
}

/** One `sheet_cell_range` region for one cell. The region is NAMED by `cell.ref` (clamped above)
 *  and the locator carries the workbook's raw `r=` beside it whenever the clamp rejected it, so
 *  the evidence of what the file actually claimed survives the normalisation. */
export function sheetCellRegion(sheetIndex, cell) {
  return {
    locator_kind: "sheet_cell_range",
    locator: cell.declared_ref === undefined
      ? { sheet: sheetIndex + 1, range: cell.ref }
      : { sheet: sheetIndex + 1, range: cell.ref, declared_ref: cell.declared_ref },
    field_path: `sheets.${sheetIndex}.${cell.ref}`,
    text_content: cell.value.slice(0, 16_384),
    engine_confidence: null,
    monetary_raw: null,
    monetary_cents: null,
  };
}

async function parseXlsx(path, task) {
  const entries = await readZipEntries(path);
  const sharedEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
  const shared = [];
  if (sharedEntry) {
    const xml = (await readZipEntry(path, sharedEntry)).toString("utf8");
    for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1])).join(""));
    }
  }
  const sheets = [];
  const regions = [];
  const sheetEntries = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name));
  for (let s = 0; s < sheetEntries.length; s++) {
    const cells = valuesFromSheet((await readZipEntry(path, sheetEntries[s])).toString("utf8"), shared);
    sheets.push({ name: sheetEntries[s].name, cells });
    for (const cell of cells) regions.push(sheetCellRegion(s, cell));
  }
  return { pageCount: Math.max(1, sheets.length), envelope: { schema_version: 1, engine: { id: task.engineId, kind: "structured_parse", version_n: task.versionN }, format: "xlsx", sheets }, regions };
}

async function parseDocx(path, task) {
  const entries = await readZipEntries(path);
  const doc = entries.find((e) => e.name === "word/document.xml");
  if (!doc) throw Object.assign(new Error("DOCX document.xml missing"), { code: "corrupt" });
  const xml = (await readZipEntry(path, doc)).toString("utf8");
  const paragraphs = [];
  for (const p of xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)) {
    const text = [...p[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => xmlDecode(m[1])).join("");
    if (text) paragraphs.push(text);
    if (paragraphs.length >= MAX_ITEMS) break;
  }
  const regions = paragraphs.map((text, i) => ({ locator_kind: "paragraph_run", locator: { paragraph: i + 1, run_start: 0, run_end: text.length }, field_path: `paragraphs.${i}`, text_content: text.slice(0, 16_384), engine_confidence: null, monetary_raw: null, monetary_cents: null }));
  return { pageCount: 1, envelope: { schema_version: 1, engine: { id: task.engineId, kind: "structured_parse", version_n: task.versionN }, format: "docx", paragraphs }, regions };
}

// MyInvois UBL XML — the identity pass (lane 'structured_parse', via the frozen
// documentIngest lane) emits the parties' identity regions; the facts pass (lane
// 'local_facts', via the new local_facts consumer) emits the full §3.2 vocabulary.
// The two passes are told apart by the task's lane; both run here so a large/hostile
// XML parse never blocks the supervisor event loop.
async function parseUbl(path, task) {
  const text = await readFile(path, "utf8");
  if (text.length > MAX_TEXT * 4) throw Object.assign(new Error("XML parse cap exceeded"), { code: "limit" });
  return task?.lane === "local_facts" ? parseUblFacts(text, task) : parseUblIdentity(text, task);
}

if (parentPort) {
  try {
    const { filePath, format, task } = workerData;
    const result =
      format === "xlsx"
        ? await parseXlsx(filePath, task)
        : format === "docx"
          ? await parseDocx(filePath, task)
          : format === "xml"
            ? await parseUbl(filePath, task)
            : await parseCsv(filePath, format, task);
    parentPort.postMessage({ ok: true, result });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String(err?.message || err), code: err?.code || "corrupt" });
  }
}
