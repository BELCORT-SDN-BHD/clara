// Adjustments register — plain RLS table reads (this build's coordinator ruling),
// not the RPC summaries. clara.adjustment_templates (packages/db/migrations/
// 0045_wave_d_b2_recurring_adjustments.sql:1139-1238, granted :1445) and
// clara.adjustment_runs (0045:1459-1482, granted :1515) — both firm-scoped by RLS
// (firm_id = jwt_firm()); the client_id filter below narrows to this workspace.

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

export type AdjustmentTemplateRow = {
  id: string;
  client_id: string;
  status: "proposed" | "live" | "retired" | string;
  name: string;
  cadence: "monthly" | "annual" | string;
  start_date: string;
  end_date: string | null;
  auto_reverse: boolean;
  memo_template: string;
};

const TEMPLATE_COLS = "id,client_id,status,name,cadence,start_date,end_date,auto_reverse,memo_template";

export function loadAdjustmentTemplates(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentTemplateRow[]> {
  return getRows<AdjustmentTemplateRow>("adjustment_templates", {
    select: TEMPLATE_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "start_date.desc",
    session,
  });
}

export type AdjustmentRunRow = {
  id: string;
  client_id: string;
  template_id: string;
  period_start: string;
  period_end: string;
  mode: "post" | "draft" | string;
  entry_id: string;
  reversal_entry_id: string | null;
  amount_cents: number;
  created_at: string;
};

const RUN_COLS =
  "id,client_id,template_id,period_start,period_end,mode,entry_id,reversal_entry_id,amount_cents,created_at";

export function loadAdjustmentRuns(session: SessionTokenAccessor, clientId: string): Promise<AdjustmentRunRow[]> {
  return getRows<AdjustmentRunRow>("adjustment_runs", {
    select: RUN_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "period_end.desc",
    session,
  });
}
