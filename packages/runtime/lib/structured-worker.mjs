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

function valuesFromSheet(xml, shared) {
  const cells = [];
  const re = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let match;
  while ((match = re.exec(xml)) && cells.length < MAX_ITEMS) {
    const attrs = match[1];
    const body = match[2];
    const ref = /\br="([^"]+)"/.exec(attrs)?.[1] || `C${cells.length + 1}`;
    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] || "";
    const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "";
    const value = type === "s" ? shared[Number(raw)] ?? "" : xmlDecode(raw);
    cells.push({ ref, value: String(value) });
  }
  return cells;
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
    for (const cell of cells) {
      regions.push({ locator_kind: "sheet_cell_range", locator: { sheet: s + 1, range: cell.ref }, field_path: `sheets.${s}.${cell.ref}`, text_content: cell.value.slice(0, 16_384), engine_confidence: null, monetary_raw: null, monetary_cents: null });
    }
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
