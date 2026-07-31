"use client";

// The matching workspace (design part1 §4.6 / part2 §4.7) for the CURRENTLY
// SELECTED unmatched line(s): match_bank_line (N lines × M existing approved
// entries) or, for exactly one line, settle_from_bank_line (a brand-new
// settlement against open items). This file is just the mode switch; the two
// verbs' UIs live in MatchLinesPanel / SettleLinePanel (repo file-size discipline).

import { useState } from "react";
import type { BankStatementLineRow, BankStatementRow } from "./model";
import type { CounterpartyKind } from "../shared/counterpartyApi";
import { MatchLinesPanel } from "./MatchLinesPanel";
import { SettleLinePanel } from "./SettleLinePanel";
import styles from "./bank.module.css";

export function MatchingWorkspace({
  token, clientId, statement, selectedLines, onDone, viaRuleId, suggestedCounterpartyId, suggestedKind,
}: {
  token: string;
  clientId: string;
  statement: BankStatementRow;
  selectedLines: BankStatementLineRow[];
  onDone: () => void;
  /** Wave C-c suggestion-chip pre-fill (design §7): a confirmed
   *  `list_bank_line_suggestions` match/settle chip carries the signed rule
   *  id through to whichever panel submits, plus (for a settle-shaped
   *  proposal) the proposed counterparty/domain — defaulting this workspace
   *  straight into "settle" mode instead of the usual single-line default. */
  viaRuleId?: string | null;
  suggestedCounterpartyId?: string | null;
  suggestedKind?: CounterpartyKind | null;
}) {
  const canSettle = selectedLines.length === 1;
  const [mode, setMode] = useState<"match" | "settle">(canSettle ? "settle" : "match");

  return (
    <div className={styles.workspace}>
      <p className={styles.sectionTitle}>
        Matching workspace — {selectedLines.length} line{selectedLines.length === 1 ? "" : "s"} selected
      </p>
      <div className={styles.actions}>
        <button className={mode === "match" ? styles.button : styles.buttonSecondary} onClick={() => setMode("match")}>
          Match to existing entries
        </button>
        {canSettle ? (
          <button className={mode === "settle" ? styles.button : styles.buttonSecondary} onClick={() => setMode("settle")}>
            Settle from this line
          </button>
        ) : null}
      </div>
      {mode === "match" ? (
        <MatchLinesPanel token={token} clientId={clientId} statement={statement} selectedLines={selectedLines} onDone={onDone} viaRuleId={viaRuleId} />
      ) : (
        <SettleLinePanel
          token={token} clientId={clientId} statement={statement} line={selectedLines[0]!} onDone={onDone}
          viaRuleId={viaRuleId} initialCounterpartyId={suggestedCounterpartyId} initialKind={suggestedKind}
        />
      )}
    </div>
  );
}
