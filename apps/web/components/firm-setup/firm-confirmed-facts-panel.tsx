"use client";

// #648 (journey A5) — "FACTS CONFIRMED IN SETUP".
//
// WHAT THIS PANEL IS, AND WHAT IT IS NOT. It renders the firm-scope `clara.knowledge_records` rows
// THIS setup produced — the same canonical register Settings and Knowledge read — with their scope,
// source, actor and trust, and the correction path that reaches them. It is NOT the firm knowledge
// REGISTER: the cross-client "firm rule versus client exception" pair, `list_firm_knowledge` and
// the Promote dialog belong to #654 (docs/PRD.md:121), and building a second register here would
// give the product two answers to the same question.
//
// IT REUSES `components/registers/knowledge-shared.tsx` ON PURPOSE. A trust badge that said
// "unverified" on C13 and nothing here would be two products. The value renderer and the trust
// vocabulary are the ones C13 already uses, from the module that owns them.
//
// TWO THINGS THIS PANEL SAYS THAT C13 DOES NOT, because they are true here and nowhere else:
//   · AUTHORITY IS JUDGED BY THE AUTHOR'S CURRENT RANK. `clara.get_firm_setup` recomputes it on
//     every read (the 0192:1694-1703 rule applied to a read), so an author who has since been
//     downgraded or removed is visible ON THE FACT, not only in an audit log.
//   · A FIRM DEFAULT NEVER SHADOWS A LEGACY CLIENT FACT. For the five keys still carried in
//     `clara.client_facts`, the legacy row is what the estate acts on and is never hidden
//     (0192 §D.8) — so the panel says so beside any fact whose key is one of those five, rather
//     than leaving the register looking self-contradictory.
//
// THE CORRECTION PATH IS REAL, and it has to be: `clara.answer_firm_setup_item` refuses a SECOND
// answer to a fact already on the register with `knowledge_already_live` (0192's own designed
// refusal — a live record is CORRECTED, never captured twice), so without a correction control
// here the journey would dead-end at its own refusal. Correct and Withdraw go through
// `clara.correct_knowledge` / `clara.withdraw_knowledge` — the doors #644 already shipped and
// `lib/registers/knowledge.ts` already wraps — never through a second writer of this file's own.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { DoorDialogRefusal, toDialogRefusal } from "@/components/common/dialog-refusal";
import { EmptyState } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { businessDateTime } from "@/lib/business-date";
import { knowledgeValueText } from "@/components/registers/knowledge-shared";
import { buildAnswer, validateAnswer, type FirmSetupFact, type FirmSetupItem } from "@/lib/firm-setup/types";

export type FirmFactAct = {
  correct: (args: { recordId: string; value: unknown; reason: string }) => Promise<boolean>;
  withdraw: (args: { recordId: string; reason: string }) => Promise<boolean>;
  busy: boolean;
  /** The last failure of either act, kept sticky across the reload it triggers. */
  error: unknown;
};

export function FirmConfirmedFactsPanel({
  facts, items, act,
}: {
  facts: readonly FirmSetupFact[];
  /** The catalogue rows, so a correction reuses the SAME answer grammar the capture used. */
  items: readonly FirmSetupItem[];
  act: FirmFactAct | null;
}) {
  const t = useTranslations("FirmSetup");
  const tk = useTranslations("ClientKnowledge");
  const [open, setOpen] = useState<{ fact: FirmSetupFact; mode: "correct" | "withdraw" } | null>(null);

  return (
    <Card data-testid="firm-setup-confirmed-facts">
      <CardHeader>
        <CardTitle>
          <SectionHeader level={2}>{t("facts.heading")}</SectionHeader>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("facts.purpose")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {facts.length === 0 ? (
          <EmptyState>{t("facts.empty")}</EmptyState>
        ) : (
          facts.map((fact) => (
            <div key={fact.record_id} className="flex flex-col gap-2 border-t border-border pt-4 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{fact.question}</p>
                <span className="flex flex-wrap items-center gap-1.5">
                  {/* Every badge carries its WORD; colour is never the only cue (appendix D row 7). */}
                  <Badge variant="secondary">{tk("scope.firm")}</Badge>
                  <Badge variant="outline">{tk(`trust.${fact.trust}` as "trust.asserted")}</Badge>
                  {fact.authority_bearing ? <Badge variant="outline">{t("facts.authorityBearing")}</Badge> : null}
                  {fact.state === "withdrawn" ? <Badge variant="destructive">{t("facts.withdrawn")}</Badge> : null}
                </span>
              </div>
              <p className="text-sm wrap-anywhere" data-testid={`firm-setup-fact-${fact.knowledge_key}`}>
                {knowledgeValueText(fact.value)}
              </p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>{t("facts.sourceLabel")}</dt>
                <dd>{tk(`sourceKind.${fact.source_kind}` as "sourceKind.user_statement")}</dd>
                <dt>{t("facts.basisLabel")}</dt>
                <dd className="wrap-anywhere">{fact.basis}</dd>
                <dt>{t("facts.actorLabel")}</dt>
                <dd data-testid={`firm-setup-fact-actor-${fact.knowledge_key}`}>
                  {fact.asserted_by_name ?? fact.asserted_by}
                  {" · "}
                  {businessDateTime(fact.recorded_at)}
                </dd>
              </dl>
              {/* THE AUTHORITY SENTENCE, and it is the point of the cell behind it: the record is
                  never rewritten, so the only honest place to say "the person who stated this no
                  longer holds the rank it needs" is beside the fact, at read time. */}
              {!fact.authority_current ? (
                <p className="text-xs text-warning" data-testid={`firm-setup-fact-authority-${fact.knowledge_key}`}>
                  {fact.asserted_by_active
                    ? t("facts.authorityDowngraded", { role: fact.asserted_by_role ?? "" })
                    : t("facts.authorityRemoved")}
                </p>
              ) : null}
              {fact.legacy_client_fact_key ? (
                <p className="text-xs text-muted-foreground" data-testid={`firm-setup-fact-legacy-${fact.knowledge_key}`}>
                  {t("facts.legacyNotShadowed")}
                </p>
              ) : null}
              {act && fact.correctable ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button" variant="outline" size="sm" disabled={act.busy}
                    data-testid={`firm-setup-correct-${fact.knowledge_key}`}
                    onClick={() => setOpen({ fact, mode: "correct" })}
                  >
                    {t("facts.correct")}
                  </Button>
                  <Button
                    type="button" variant="ghost" size="sm" disabled={act.busy}
                    data-testid={`firm-setup-withdraw-${fact.knowledge_key}`}
                    onClick={() => setOpen({ fact, mode: "withdraw" })}
                  >
                    {t("facts.withdrawAction")}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("facts.notCorrectable")}</p>
              )}
            </div>
          ))
        )}
      </CardContent>

      {open && act ? (
        <FactDialog
          key={`${open.fact.record_id}-${open.mode}`}
          fact={open.fact}
          mode={open.mode}
          item={items.find((i) => i.item_key === open.fact.item_key) ?? null}
          act={act}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Card>
  );
}

/** ONE BOUNDED DECISION, so a Dialog (appendix D row 23): a new value and the reason it changed,
 *  or a withdrawal and its reason. The dialog STAYS OPEN on a refusal and carries the refusal
 *  itself — a banner on the page behind a modal backdrop cannot be read. */
function FactDialog({
  fact, mode, item, act, onClose,
}: {
  fact: FirmSetupFact;
  mode: "correct" | "withdraw";
  item: FirmSetupItem | null;
  act: FirmFactAct;
  onClose: () => void;
}) {
  const t = useTranslations("FirmSetup");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  /** Bumped on every settled confirm, so a SECOND identical refusal still re-announces. */
  const [attempt, setAttempt] = useState(0);
  const options = item?.answer_options ?? [];

  const confirm = async () => {
    if (reason.trim() === "") { setProblem("reasonRequired"); return; }
    if (mode === "withdraw") {
      setAttempt((n) => n + 1);
      const ok = await act.withdraw({ recordId: fact.record_id, reason: reason.trim() });
      if (ok) onClose();
      return;
    }
    if (item === null) { setProblem("noGrammar"); return; }
    const constraint = validateAnswer(item, value);
    if (constraint !== null) { setProblem(constraint); return; }
    setAttempt((n) => n + 1);
    const ok = await act.correct({
      recordId: fact.record_id, value: buildAnswer(item, value), reason: reason.trim(),
    });
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent data-testid={`firm-setup-fact-dialog-${mode}`}>
        <DialogHeader>
          <DialogTitle>{mode === "correct" ? t("facts.correctTitle") : t("facts.withdrawTitle")}</DialogTitle>
          <DialogDescription>
            {mode === "correct"
              ? t("facts.correctDescription", { question: fact.question })
              : t("facts.withdrawDescription", { question: fact.question })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {mode === "correct" && item ? (
            <Field data-invalid={problem && problem !== "reasonRequired" ? true : undefined}>
              <FieldContent>
                <FieldLabel htmlFor="firm-setup-fact-value">
                  <FieldTitle>{t("facts.newValue")}</FieldTitle>
                </FieldLabel>
              </FieldContent>
              {options.length > 0 ? (
                <NativeSelect
                  id="firm-setup-fact-value" className="w-full" value={value}
                  onChange={(e) => { setValue(e.target.value); setProblem(null); }}
                >
                  <option value="">{t("form.chooseValue")}</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </NativeSelect>
              ) : (
                <Input
                  id="firm-setup-fact-value" value={value}
                  onChange={(e) => { setValue(e.target.value); setProblem(null); }}
                />
              )}
            </Field>
          ) : null}
          <Field data-invalid={problem === "reasonRequired" ? true : undefined}>
            <FieldContent>
              <FieldLabel htmlFor="firm-setup-fact-reason">
                <FieldTitle>{t("facts.reasonLabel")}</FieldTitle>
              </FieldLabel>
            </FieldContent>
            <Textarea
              id="firm-setup-fact-reason" rows={2} value={reason}
              onChange={(e) => { setReason(e.target.value); setProblem(null); }}
            />
          </Field>
          {problem ? (
            <p className="text-sm text-destructive" data-testid="firm-setup-fact-dialog-problem">
              {t(`facts.problem.${problem}` as "facts.problem.reasonRequired")}
            </p>
          ) : null}
          {/* THE REFUSAL RIDES INSIDE THE DIALOG, focused and announced, because a banner on
              the page behind a modal backdrop cannot be read (components/common/dialog-refusal.tsx). */}
          <DoorDialogRefusal refusal={toDialogRefusal(act.error)} attempt={attempt} />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={act.busy} />}>{t("facts.cancel")}</DialogClose>
          <Button
            type="button" disabled={act.busy}
            data-testid="firm-setup-fact-dialog-confirm"
            onClick={() => void confirm()}
          >
            {act.busy ? t("facts.working") : mode === "correct" ? t("facts.correct") : t("facts.withdrawAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
