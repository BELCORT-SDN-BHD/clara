"use client";

import { useState } from "react";

import { EntryLinesEditor } from "@/components/journals/entry-lines-editor";
import type { CoaAccountRow, EntryLineInput } from "@/lib/journals/types";

const ACCOUNTS: CoaAccountRow[] = [
  {
    client_id: "money-input-e2e",
    account_code: "1000",
    name: "Cash",
    account_type: "asset",
    is_active: true,
  },
];

const INITIAL_LINES: EntryLineInput[] = [
  { account_code: "1000", description: "Browser harness", debit_cents: 0, credit_cents: 0 },
];

/** E2E-only caller of the production EntryLinesEditor. SignupPage renders it
 * only when e2e/run.mjs's build-time flag and an explicit query are both set,
 * so an ordinary production build has no path to this face. */
export function MoneyInputE2EHarness() {
  const [lines, setLines] = useState(INITIAL_LINES);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <EntryLinesEditor lines={lines} onChange={setLines} accounts={ACCOUNTS} />
      <p className="mt-3 text-sm text-muted-foreground">
        Accepted debit cents: <output data-testid="accepted-debit-cents">{lines[0]?.debit_cents ?? 0}</output>
      </p>
    </section>
  );
}
