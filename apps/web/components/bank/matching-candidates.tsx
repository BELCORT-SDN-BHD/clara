"use client";

// #657 · AC7/AC8/AC13 — THE CANDIDATE SURFACE, side by side with the line.
//
// One row per approved journal entry with remaining capacity on this bank account, carrying
// everything a human needs to decide WITHOUT opening the journal: posting date, memo,
// counterparty NAME (not a uuid), the JE reference, per-side remaining capacity, this entry's
// recent match history on this bank account, and the deterministic BASIS of its relation to the
// line being cleared.
//
// THE BASIS IS NOT A SCORE, AND THAT IS A RULING, NOT A TASTE (Q3 / SYNTHESIS J2). Four facts,
// each one checkable by the human against the statement in front of them:
//   amount exact        the line's amount equals this entry's remaining capacity on the side
//                       the line would clear. Yes or no.
//   date               the signed whole-day distance between the line's entry date and the
//                       entry's posting date.
//   counterparty       'id'   an identifier of the canonical counterparty appears as a whole
//                             word in the line description;
//                      'name' its name-family token does;
//                      'none' neither, or the entry names no counterparty.
//   class hint         what the line's own description looks like (payroll, LHDN, bank charges…).
// There is no 0–1 number anywhere. `list_bank_line_suggestions` was dropped whole at 0129:395
// and is not revived here, and #665 is retiring classifiers — the two tickets must not fight.
//
// "UNIQUE SUFFICIENT" IS A DISPLAY, NOT A NEW DB RUNG (AC8). When exactly one candidate has an
// exact amount match, this surface says so — the same fact the agent's own `same_amount_ambiguous`
// rung reads (0121:5907-5923), rendered for a human instead of scored for a model. When more
// than one does, it says THAT instead, and offers no tie-break: choosing is the human's act.
//
// WHY NO COMBOBOX (AC13, measured). `pnpm --filter @clara/web ui:add combobox --dry-run`
// REFUSES on this project: the payload would overwrite `components/ui/button.tsx`, which is on
// `scripts/protected-components.json` because it carries owner-ruled fixes. `ui:add popover
// --dry-run` fails in the CLI itself on this project's `base-nova` style with
// `"registries": {}` (appendix D records that CLI failure; the shadcn MCP server was
// unreachable this session too). Overriding the guard would clobber an owner ruling to gain a
// picker, so this surface does the honest thing instead: a plain search field over a `Table`,
// which is exactly the fallback AC13 names for small sets, applied to large ones as well. The
// residual is named in #657's report rather than bought with `CLARA_UI_ADD_OVERWRITE=1`.

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, FieldError } from "@/components/ui/field";
import { MoneyInput } from "@/components/common/money-input";
import { EmptyState } from "@/components/common/state";
import { formatMyr } from "@/lib/bank/money";
import type { MatchCandidateEntryRow } from "@/lib/bank/match-types";
import type { MatchBasisRow } from "@/lib/bank/matching-context-types";

/** The search threshold: below it the filter field is pointless furniture, at or above it a
 *  human cannot scan the list. Measured against nothing — it is a judgement, and it is the ONLY
 *  number in this file that is. */
const SEARCHABLE_FROM = 8;

export function MatchingCandidates({
  candidates,
  basis,
  selectedEntryIds,
  matchedCents,
  centsValid,
  onToggleEntry,
  onCentsChange,
  disabled,
}: {
  candidates: MatchCandidateEntryRow[];
  basis: MatchBasisRow[];
  selectedEntryIds: ReadonlySet<string>;
  matchedCents: Record<string, number | null>;
  centsValid: Record<string, boolean>;
  onToggleEntry: (entryId: string) => void;
  onCentsChange: (entryId: string, cents: number | null, ok: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("ClientBank.matching");
  const [query, setQuery] = useState("");
  const filterId = useId();

  const basisFor = useMemo(() => {
    const map = new Map<string, MatchBasisRow>();
    for (const b of basis) map.set(b.entry_id, b);
    return map;
  }, [basis]);

  const exactCount = useMemo(
    () => candidates.filter((c) => basisFor.get(c.entry_id)?.amount_exact === true).length,
    [candidates, basisFor],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return candidates;
    return candidates.filter((c) =>
      [c.memo, c.counterparty_name, c.coding_kind, c.entry_id, c.posting_date]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [candidates, query]);

  if (candidates.length === 0) {
    return <EmptyState>{t("emptyCandidates")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p data-testid="candidate-sufficiency" className="text-xs text-muted-foreground">
        {exactCount === 1 ? t("uniqueSufficient") : exactCount > 1 ? t("ambiguousAmount", { count: exactCount }) : t("noExactAmount")}
      </p>

      {candidates.length >= SEARCHABLE_FROM && (
        <div className="grid gap-1.5">
          <Label htmlFor={filterId}>{t("filterCandidatesLabel")}</Label>
          <Input
            id={filterId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("filterCandidatesPlaceholder")}
            disabled={disabled}
          />
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState>{t("noCandidateMatchesFilter")}</EmptyState>
      ) : (
        <Table aria-label={t("candidatesTableLabel")}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("colSelect")}</TableHead>
              <TableHead scope="col">{t("colPostingDate")}</TableHead>
              <TableHead scope="col">{t("colMemo")}</TableHead>
              <TableHead scope="col">{t("colCounterparty")}</TableHead>
              <TableHead scope="col">{t("colCapacity")}</TableHead>
              <TableHead scope="col">{t("colBasis")}</TableHead>
              <TableHead scope="col">{t("colHistory")}</TableHead>
              <TableHead scope="col">{t("colMatchedCents")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((c) => {
              const b = basisFor.get(c.entry_id);
              const selected = selectedEntryIds.has(c.entry_id);
              const ok = centsValid[c.entry_id] !== false;
              return (
                <TableRow key={c.entry_id} data-testid={`candidate-${c.entry_id}`} data-selected={selected ? "true" : "false"}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={t("selectEntryNamed", { memo: c.memo ?? c.entry_id })}
                      checked={selected}
                      disabled={disabled}
                      onChange={() => onToggleEntry(c.entry_id)}
                    />
                  </TableCell>
                  <TableCell>{c.posting_date ?? "—"}</TableCell>
                  <TableCell>
                    <span className="block">{c.memo ?? "—"}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{c.entry_id}</span>
                    {c.high_stakes && <span data-testid={`high-stakes-${c.entry_id}`} className="text-[11px] font-medium">{t("highStakes")}</span>}
                  </TableCell>
                  {/* An honest em dash ONLY when the name is genuinely absent — never as a
                      stand-in for "this read does not carry names", which is what it meant
                      before migration 0226 made the field real. */}
                  <TableCell data-testid={`counterparty-${c.entry_id}`}>{c.counterparty_name ?? "—"}</TableCell>
                  <TableCell>
                    <span className="block">{t("capacityDebit", { amount: formatMyr(c.debit_remaining_cents ?? 0) })}</span>
                    <span className="block">{t("capacityCredit", { amount: formatMyr(c.credit_remaining_cents ?? 0) })}</span>
                  </TableCell>
                  <TableCell data-testid={`basis-${c.entry_id}`}>
                    {b ? (
                      <ul className="list-none space-y-0.5 text-[11px]">
                        <li>{b.amount_exact ? t("basisAmountExact") : t("basisAmountNotExact")}</li>
                        <li>{b.date_delta_days === null ? t("basisDateUnknown") : t("basisDateDelta", { days: b.date_delta_days })}</li>
                        <li>{t(`basisCounterparty_${b.counterparty_match}`)}</li>
                        <li>{b.class_hint ? t("basisClassHint", { hint: b.class_hint }) : t("basisClassHintNone")}</li>
                      </ul>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">{t("basisAbsent")}</span>
                    )}
                  </TableCell>
                  <TableCell data-testid={`history-${c.entry_id}`}>
                    {c.match_history.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">{t("historyNone")}</span>
                    ) : (
                      <ul className="list-none space-y-0.5 text-[11px]">
                        {c.match_history.map((h) => (
                          <li key={h.match_id}>
                            {t("historyRow", {
                              status: h.status ?? "—",
                              amount: formatMyr(h.matched_cents ?? 0),
                              when: h.acted_at?.slice(0, 10) ?? "—",
                            })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    <Field data-invalid={ok ? undefined : true}>
                      <MoneyInput
                        containerClassName="w-32 shrink-0"
                        className="h-8 w-full"
                        placeholder={t("matchedCentsPlaceholder")}
                        aria-label={t("matchedCentsLabelNamed", { memo: c.memo ?? c.entry_id })}
                        aria-invalid={ok ? undefined : true}
                        cents={matchedCents[c.entry_id] ?? null}
                        mode="signed"
                        disabled={disabled}
                        onValueChange={(change) => onCentsChange(c.entry_id, change.ok ? change.cents : null, change.ok)}
                      />
                      {!ok && <FieldError>{t("invalidMatchedCents")}</FieldError>}
                    </Field>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
