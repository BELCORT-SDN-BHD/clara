// #633 AC8 — a file's SIZE as a phrase, for the queue's own column.
//
// Returns a next-intl KEY plus its parameters, never English (STYLE law; the same
// shape `copy.ts`'s label functions use). The exact byte count is always available
// to a caller that wants it in a `title`; what renders is the rounded unit, because
// "20,971,520 bytes" is not a size a person reads at a glance.
//
// ROUNDING IS TOWARD THE HUMAN, NOT TOWARD THE LIMIT. 1 KB is 1024 bytes here (the
// same base the 20 MB intake wall uses — `MAX_FILE_BYTES = 20 * 1024 * 1024`,
// types.ts), so a file this app calls "20.0 MB" is exactly the file the runtime wall
// measures. A decimal-MB spelling would have let a 20.8-MB (decimal) file read as
// "20.8 MB" and be refused for being over "20 MB", which is a lie about the rule.

const KB = 1024;
const MB = 1024 * 1024;

export type FileSizeLabel =
  | { key: "sizeBytes"; params: { count: number } }
  | { key: "sizeKb"; params: { value: string } }
  | { key: "sizeMb"; params: { value: string } };

export function fileSizeLabel(bytes: number): FileSizeLabel {
  if (!Number.isFinite(bytes) || bytes < 0) return { key: "sizeBytes", params: { count: 0 } };
  if (bytes < KB) return { key: "sizeBytes", params: { count: Math.round(bytes) } };
  if (bytes < MB) return { key: "sizeKb", params: { value: (bytes / KB).toFixed(1) } };
  return { key: "sizeMb", params: { value: (bytes / MB).toFixed(1) } };
}

/** The one-call form for a component holding a `ClientDocuments` translator. */
export function renderFileSize(
  bytes: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const label = fileSizeLabel(bytes);
  return t(label.key, label.params);
}
