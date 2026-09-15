// #633 AC2 — ONE named phrase per `clara.documents.document_kind`, plus the NAMED
// "Needs classification" state for null.
//
// THIS MODULE OVERTURNS A WRITTEN DECISION, BY NAME. `lib/documents/copy.ts:115-119`
// recorded that `document_kind` is a DB-owned enum string rather than chrome prose, and
// that there is "no fixed enumeration of kinds worth a full key set (DOCUMENT_KINDS
// already has 20 members)". Both halves are reversed here, deliberately:
//   * the enumeration IS fixed and closed — `documents_document_kind_check`
//     (packages/db/migrations/0123_f_a7_gamma_egress.sql:2056-2061), mirrored verbatim by
//     `types.ts`'s DOCUMENT_KINDS, and re-derived by `clara._document_kind_roster()`
//     (0165) for the capability registry's own seed;
//   * 20 members is the REASON for a key set, not an argument against one. Before this
//     module `document-admin.tsx:77` rendered `ssm_company_doc` into a Select, and
//     `document-metadata.tsx` interpolated the same raw token into a badge.
//
// The KEY is returned, never English text (STYLE law; copy.ts's own N12 note) — the `t()`
// call happens at the component boundary, exactly like `extractionStatusKey` and
// `queueRecoveryLabelKey` beside it. This module carries no policy beyond "which key".

import { DOCUMENT_KINDS, type DocumentKind } from "./types";

/** The named state a null kind wears on a LIST or RECEIPT row (#633 AC3(a)): not an
 *  absence, not a blank cell — a state with a name and, on the surfaces that mount
 *  #646's `set_document_kind` control, an action. */
export const KIND_UNCLASSIFIED_KEY = "kind.unclassified" as const;

/** A value the CHECK admits that this app has never seen. The raw token is carried
 *  INSIDE the phrase as a parameter, never rendered as the label itself — the honest
 *  unknown arm `document-facts-table.tsx` already uses for an unseen check name, minus
 *  its bare-name fallback. */
export const KIND_UNRECOGNISED_KEY = "kind.unrecognised" as const;

const KIND_SET: ReadonlySet<string> = new Set(DOCUMENT_KINDS);

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && KIND_SET.has(value);
}

/** Every key this module can ever emit — the census `kind-label.test.ts` pins against
 *  DOCUMENT_KINDS and against `messages/en.json`, so a kind added to the DB CHECK and
 *  mirrored into `types.ts` without a phrase reds rather than rendering as a token. */
export const KIND_LABEL_KEYS: readonly string[] = [
  ...DOCUMENT_KINDS.map((kind) => `kind.${kind}`),
  KIND_UNCLASSIFIED_KEY,
  KIND_UNRECOGNISED_KEY,
];

export type KindLabel = { key: string; params?: { value: string } };

/** The next-intl key (and, for the unrecognised arm only, its one parameter) for a
 *  document kind. `null`/`undefined`/blank is the NAMED unclassified state. */
export function kindLabel(kind: string | null | undefined): KindLabel {
  if (typeof kind !== "string" || kind.trim() === "") return { key: KIND_UNCLASSIFIED_KEY };
  if (isDocumentKind(kind)) return { key: `kind.${kind}` };
  return { key: KIND_UNRECOGNISED_KEY, params: { value: kind } };
}

/** The one-call form for a component that already holds a `ClientDocuments` translator. */
export function renderKindLabel(
  kind: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const label = kindLabel(kind);
  return label.params ? t(label.key, label.params) : t(label.key);
}

/** True when this row's kind is the actionable "Needs classification" state — the
 *  predicate the list/receipt surfaces use to decide whether to mount #646's existing
 *  `set_document_kind` control. An UNRECOGNISED kind is NOT this state: something was
 *  classified, this app simply has no phrase for it yet. */
export function needsClassification(kind: string | null | undefined): boolean {
  return kindLabel(kind).key === KIND_UNCLASSIFIED_KEY;
}
