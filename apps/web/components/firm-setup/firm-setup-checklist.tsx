"use client";

// #648 (journey A5) — THE FIRM SETUP CHECKLIST.
//
// "Resume setup → answer only missing firm facts → saved progress → usable firm Home" (appendix C,
// A5). Everything on this surface is read from ONE door, `clara.get_firm_setup()`, and every write
// goes through one of the four `clara.*_firm_setup*` doors. There is no second read path.
//
// THE COUNTER IS THE DATABASE'S, AND IT IS A COUNT. `required_answered / required_total`, both
// computed inside `clara.get_firm_setup` over `clara.firm_setup_keys`' own required set. Never a
// percentage, never a sum over facets that may overlap (#650 AC2), and never #636's deferred
// cross-batch aggregate progress. While the envelope is unread the counter is ABSENT rather than
// zero: a "0 of 0" that later becomes "3 of 8" is a lie told during loading.
//
// ONE FACT IS A FIELD; A GROUP IS A BOUNDED WALK. Each Card is one group of the catalogue. An
// individual pending item opens as a single `Field`; a group with two or more pending items can be
// answered as a local next/back/review stepper. Both are `FirmSetupItemForm`; the difference is
// how many items it is handed.
//
// THE SEVEN FACES THIS SURFACE OWNS, each rendered and each tested:
//   loading           the house prose loader, NAMING what it is reading, and no placeholder count.
//                     (`components/common/state.tsx`'s own header records why this product's
//                     loading idiom is an honest sentence rather than a skeleton.)
//   not started       every catalogue row is `unseeded`: the checklist is shown, read-only, with
//                     the one action that starts it.
//   in progress       the groups, the counter, and the outstanding required facts.
//   completion        every catalogue row settled — distinct from "not yet seeded", which also has
//                     nothing pending.
//   partial / stale   a CLR06 convergence, INLINE, on the re-read plan, with the typed draft kept.
//   denied            a bookkeeper's deep link: a named face with ZERO write controls.
//   failed            a transport failure: re-read first, then offer the SAME request again, which
//                     REPLAYS rather than answering twice.
//
// ANNOUNCEMENT OWNERSHIP (§5: one owner per transition). The FORM announces what happened to an
// answer (accepted, stale, refused, failed); this component announces what happened to the PLAN
// (seeded, committed) and what a read failure was. They are different transitions, so they never
// speak over each other.
//
// STABLE URL AND BACK. `/settings/setup` is this section's whole address. Opening an item, walking
// a group and opening the correction dialog are LOCAL state — no route change, no query parameter,
// no history entry — so Back returns to wherever the person came from (the firm home tile, in the
// journey this ticket owns) rather than unwinding a form.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { DoorDialogRefusal, toDialogRefusal } from "@/components/common/dialog-refusal";
import { ErrorMessage } from "@/components/firm/data-state";
import { isDoorRefusal } from "@/lib/doors";
import { loadCallerContext } from "@/lib/firm/caller-context";
import { ADMIN_RANK } from "@/lib/members/reads";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { correctKnowledge, withdrawKnowledge } from "@/lib/registers/knowledge";
import {
  answerFirmSetupItem,
  commitFirmSetup,
  deferFirmSetupItem,
  loadFirmSetup,
  seedFirmSetup,
} from "@/lib/firm-setup/api";
import {
  answerText,
  firmSetupGroups,
  isPending,
  type FirmSetupEnvelope,
  type FirmSetupItem,
} from "@/lib/firm-setup/types";
import { FirmConfirmedFactsPanel } from "./firm-confirmed-facts-panel";
import { FirmSetupItemForm, type FirmSetupSubmitEntry, type FirmSetupSubmitOutcome } from "./firm-setup-item-form";

// The rank this section needs comes from `lib/members/reads.ts`'s own `ADMIN_RANK` — the one the
// members lane already floors at — rather than a second literal here. It matches
// `SETTINGS_SECTIONS`' `minimumRole: "admin"` for `setup`, and `clara.get_firm_setup` floors at the
// same rank: the menu hides the section, and the database refuses a deep link.

type OpenTarget = { kind: "item"; itemKey: string } | { kind: "group"; groupKey: string } | null;

export function FirmSetupChecklist() {
  const t = useTranslations("FirmSetup");
  const caller = useAsyncRead(() => loadCallerContext(sessionTokenAccessor));
  const setup = useAsyncRead(() => loadFirmSetup());

  const [open, setOpen] = useState<OpenTarget>(null);
  const [skipping, setSkipping] = useState<FirmSetupItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"seeded" | "committed" | null>(null);
  const [writeError, setWriteError] = useState<unknown>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const context = caller.data?.length === 1 ? (caller.data[0] ?? null) : null;
  const env = setup.data;

  /**
   * FOCUS RETURN, and it runs in an EFFECT rather than in the handler.
   *
   * The control a form has to hand focus back to may not exist yet at the moment the form closes:
   * closing is a state change, and the trigger is re-rendered by the SAME pass that unmounts the
   * form. So the handler records WHERE focus belongs and the effect below moves it once that render
   * has happened. If the exact trigger is gone — the item is now answered, so its Answer button no
   * longer renders — focus falls back to the first surviving trigger in the SAME group, which is
   * next to where the person was. It never falls through to the document body: a control
   * disappearing after a successful act is precisely the case §4 names ("a list row disappearing
   * after resolution does not dump focus onto the document body").
   */
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const closeAndReturn = useCallback((focusKey: string) => {
    setOpen(null);
    setPendingFocus(focusKey);
  }, []);
  useEffect(() => {
    if (pendingFocus === null) return;
    const live = (el: HTMLButtonElement | null | undefined): HTMLButtonElement | null =>
      el && el.isConnected !== false ? el : null;
    const exact = live(triggerRefs.current[pendingFocus]);
    if (exact) { exact.focus(); setPendingFocus(null); return; }
    const group = `${pendingFocus.split(":")[0] ?? ""}:`;
    for (const [key, el] of Object.entries(triggerRefs.current)) {
      if (!key.startsWith(group)) continue;
      const candidate = live(el);
      if (candidate) { candidate.focus(); break; }
    }
    setPendingFocus(null);
  }, [pendingFocus]);

  const classify = useCallback((err: unknown, itemKey: string): FirmSetupSubmitOutcome => {
    if (isDoorRefusal(err)) {
      if (err.code === "CLR06" && err.reason === "stale_plan") return { ok: false, kind: "stale" };
      if (err.code === "CLR04") return { ok: false, kind: "denied", message: err.message, code: err.code };
      if (err.reason === "knowledge_already_live") {
        return { ok: false, kind: "already_live", message: err.message, code: err.code };
      }
      // #654's TWO WALLS, mapped AHEAD of the migration that raises them (0205). Both are
      // `CLR10`s from a BEFORE INSERT trigger on `clara.knowledge_records`, and both are about
      // the KEY or the SOURCE rather than about the value a person typed — so neither belongs in
      // a field error beside a control. They get their own named faces, and they are mapped now
      // because a refusal that arrives before its face does reaches a practitioner as a raw
      // database sentence. Unexercised on this branch (0205 is not applied here) and named as
      // such in the report rather than claimed as tested.
      if (err.reason === "knowledge_scope_not_firm_defaultable") {
        return { ok: false, kind: "not_firm_defaultable", message: err.message, code: err.code };
      }
      if (err.reason === "firm_scope_client_evidence") {
        return { ok: false, kind: "client_evidence", message: err.message, code: err.code };
      }
      return { ok: false, kind: "invalid", itemKey, message: err.message, code: err.code, reason: err.reason };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, kind: "failed", message, code: null };
  }, []);

  /** Submit one item, or a group's items in order. THE CAS TOKEN ROTATES AFTER EVERY ACCEPTED
   *  ANSWER, so the chain carries the token each door hands back rather than the one this render
   *  started with — which is why the walk submits here and not inside the form. */
  const submit = useCallback(async (entries: FirmSetupSubmitEntry[]): Promise<FirmSetupSubmitOutcome> => {
    if (!env?.plan_id || !env.revision_token) return { ok: false, kind: "failed", message: "", code: null };
    setBusy(true);
    setWriteError(null);
    let revision = env.revision_token;
    let failing = entries[0]?.itemKey ?? "";
    try {
      for (const entry of entries) {
        failing = entry.itemKey;
        const receipt = await answerFirmSetupItem({
          plan: env.plan_id, expectedRevision: revision, itemKey: entry.itemKey, answer: entry.answer,
        });
        revision = receipt.revision_token;
      }
      await setup.reload();
      return { ok: true };
    } catch (err) {
      // HYDRATE-NEVER-TRUST, and the lost-response rule in one act: whatever went wrong, the
      // AUTHORITATIVE plan is re-read before anything is offered again. A replay of the same
      // request then carries the same op key and replays its receipt instead of answering twice.
      setWriteError(err);
      await setup.reload();
      return classify(err, failing);
    } finally {
      setBusy(false);
    }
  }, [classify, env, setup]);

  const runSeed = useCallback(async () => {
    setBusy(true);
    setWriteError(null);
    setNotice(null);
    try {
      await seedFirmSetup();
      await setup.reload();
      setNotice("seeded");
    } catch (err) {
      setWriteError(err);
      await setup.reload();
    } finally {
      setBusy(false);
    }
  }, [setup]);

  const runCommit = useCallback(async () => {
    if (!env?.plan_id || !env.revision_token) return;
    setBusy(true);
    setWriteError(null);
    setNotice(null);
    try {
      await commitFirmSetup({ plan: env.plan_id, expectedRevision: env.revision_token });
      await setup.reload();
      setNotice("committed");
    } catch (err) {
      setWriteError(err);
      await setup.reload();
    } finally {
      setBusy(false);
    }
  }, [env, setup]);

  const runSkip = useCallback(async (item: FirmSetupItem, reason: string): Promise<boolean> => {
    if (!env?.plan_id || !env.revision_token) return false;
    setBusy(true);
    setWriteError(null);
    try {
      await deferFirmSetupItem({
        plan: env.plan_id, expectedRevision: env.revision_token, itemKey: item.item_key, reason,
      });
      await setup.reload();
      return true;
    } catch (err) {
      setWriteError(err);
      await setup.reload();
      return false;
    } finally {
      setBusy(false);
    }
  }, [env, setup]);

  const factAct = useMemo(() => ({
    busy,
    error: writeError,
    correct: async (args: { recordId: string; value: unknown; reason: string }) => {
      setBusy(true); setWriteError(null);
      try {
        await correctKnowledge({ recordId: args.recordId, value: args.value, reason: args.reason });
        await setup.reload();
        return true;
      } catch (err) { setWriteError(err); await setup.reload(); return false; } finally { setBusy(false); }
    },
    withdraw: async (args: { recordId: string; reason: string }) => {
      setBusy(true); setWriteError(null);
      try {
        await withdrawKnowledge({ recordId: args.recordId, reason: args.reason });
        await setup.reload();
        return true;
      } catch (err) { setWriteError(err); await setup.reload(); return false; } finally { setBusy(false); }
    },
  }), [busy, setup, writeError]);

  // ---------------------------------------------------------------------------------------
  // THE DENIED FACE. Two independent walls agree here: the caller's rank, read from
  // `caller_context`, and `clara.get_firm_setup`'s own admin floor. Either one renders the same
  // named face with ZERO write controls — never a blank page, and never a form whose Save is the
  // thing that tells you that you cannot.
  // ---------------------------------------------------------------------------------------
  // Fail-closed on a NULL rank, the `coalesce(clara.actor_role_rank(), -1)` idiom the views use.
  const rankDenied = context !== null && (context.role_rank ?? -1) < ADMIN_RANK;
  const readDenied = setup.error !== null && setup.error !== undefined
    && isDoorRefusal(setup.error) && setup.error.code === "CLR04";
  if (rankDenied || readDenied) {
    return (
      <div data-testid="firm-setup-denied">
        <StateBanner tone="warning">
          <p className="font-medium">{t("denied.title")}</p>
          <p>{t("denied.body")}</p>
        </StateBanner>
      </div>
    );
  }

  if (setup.loading && env === null) {
    return (
      <div data-testid="firm-setup-loading">
        <LoadingState>{t("loading")}</LoadingState>
      </div>
    );
  }
  if (setup.error && env === null) return <ErrorMessage error={setup.error} />;
  if (env === null) return <EmptyState>{t("unavailable")}</EmptyState>;
  if (env.plan_id === null) {
    return (
      <div data-testid="firm-setup-no-plan"><StateBanner tone="neutral">{t("noPlan")}</StateBanner></div>
    );
  }

  const groups = firmSetupGroups(env);
  const committed = env.state === "committed";
  const notStarted = !env.seeded && env.items.every((i) => i.state === "unseeded");
  const allSettled = env.seeded && env.items.every((i) => !isPending(i));
  const openItems: FirmSetupItem[] =
    open === null ? []
      : open.kind === "item"
        ? env.items.filter((i) => i.item_key === open.itemKey)
        : env.items.filter((i) => i.group_key === open.groupKey && isPending(i));

  return (
    <div className="flex flex-col gap-6" data-testid="firm-setup-checklist">
      {/* THE COUNTER. A count, from the database, of required facts — and the outstanding ones are
          NAMED rather than summarised, because "3 of 8" does not tell anyone what to do next. */}
      <section aria-labelledby="firm-setup-progress" className="flex flex-col gap-2">
        <SectionHeader level={2} id="firm-setup-progress">{t("progress.heading")}</SectionHeader>
        <p className="text-sm" data-testid="firm-setup-counter">
          {t("progress.counter", {
            answered: env.counter.required_answered,
            total: env.counter.required_total,
          })}
        </p>
        {env.required_outstanding.length > 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="firm-setup-outstanding">
            {t("progress.outstanding", {
              items: env.required_outstanding
                .map((key) => env.items.find((i) => i.item_key === key)?.question ?? key)
                .join("; "),
            })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("progress.workspaceStaysOpen")}</p>
      </section>

      {notice === "seeded" ? (
        <div data-testid="firm-setup-seeded-notice"><StateBanner tone="info">{t("notice.seeded")}</StateBanner></div>
      ) : null}
      {notice === "committed" ? (
        <div data-testid="firm-setup-committed-notice"><StateBanner tone="info">{t("notice.committed")}</StateBanner></div>
      ) : null}
      {/* A WRITE failure that no form is mounted to render (a seed, a commit, a skip) still has to
          be said. A form-owned refusal is rendered by the form, so this never doubles up. */}
      {writeError !== null && writeError !== undefined && open === null && skipping === null ? (
        <ErrorMessage error={writeError} />
      ) : null}

      {committed ? (
        <div data-testid="firm-setup-completed">
          <StateBanner tone="neutral">
            <p className="font-medium">{t("completed.title")}</p>
            <p>{t("completed.body")}</p>
          </StateBanner>
        </div>
      ) : notStarted ? (
        <div data-testid="firm-setup-not-started">
          <StateBanner tone="info">
            <p className="font-medium">{t("notStarted.title")}</p>
            <p>{t("notStarted.body", { count: env.catalogue_total })}</p>
          </StateBanner>
        </div>
      ) : null}

      {!committed && !env.seeded ? (
        <div>
          <Button type="button" disabled={busy} data-testid="firm-setup-seed" onClick={() => void runSeed()}>
            {busy ? t("seed.working") : t("seed.action")}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{t("seed.help")}</p>
        </div>
      ) : null}

      {groups.map((group) => {
        const pending = group.items.filter(isPending);
        const groupOpen = open?.kind === "group" && open.groupKey === group.key;
        return (
          <Card key={group.key} data-testid={`firm-setup-group-${group.key}`}>
            <CardHeader>
              <CardTitle>
                <SectionHeader level={2} id={`firm-setup-group-${group.key}`}>
                  {t(`groups.${group.key}.heading` as "groups.identity.heading")}
                </SectionHeader>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {t(`groups.${group.key}.purpose` as "groups.identity.purpose")}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* THE BOUNDED RELATED SET. Offered only where there is more than one thing left to
                  ask in this group, because a "walk" through one question is just a question. */}
              {!committed && pending.length > 1 && !groupOpen ? (
                <div>
                  <Button
                    type="button" variant="outline" disabled={busy}
                    data-testid={`firm-setup-answer-group-${group.key}`}
                    ref={(el) => { triggerRefs.current[`${group.key}:group`] = el; }}
                    onClick={() => { setOpen({ kind: "group", groupKey: group.key }); setNotice(null); }}
                  >
                    {t("groups.answerAll", { count: pending.length })}
                  </Button>
                </div>
              ) : null}

              {groupOpen && context ? (
                <FirmSetupItemForm
                  items={openItems}
                  userId={context.user_id}
                  firmId={context.firm_id}
                  revision={env.revision_token}
                  busy={busy}
                  onSubmit={submit}
                  onCancel={() => closeAndReturn(`${group.key}:group`)}
                />
              ) : null}

              <ul className="flex flex-col gap-3">
                {group.items.map((item) => {
                  const itemOpen = open?.kind === "item" && open.itemKey === item.item_key;
                  const settled = answerText(item);
                  return (
                    <li key={item.item_key} className="flex flex-col gap-2" data-testid={`firm-setup-item-${item.item_key}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm">{item.question}</span>
                        <span className="flex items-center gap-1.5">
                          {item.required ? (
                            <Badge variant="outline">{t("item.required")}</Badge>
                          ) : (
                            <Badge variant="outline">{t("item.optional")}</Badge>
                          )}
                          {/* The state word, never a colour alone (appendix D row 7). */}
                          <Badge
                            variant={item.state === "pending" || item.state === "unseeded" ? "outline" : "secondary"}
                            data-testid={`firm-setup-state-${item.item_key}`}
                          >
                            {t(`item.state.${item.state}` as "item.state.pending")}
                          </Badge>
                        </span>
                      </div>
                      {settled !== null ? (
                        <p className="text-sm wrap-anywhere" data-testid={`firm-setup-answer-${item.item_key}`}>
                          {item.state === "deferred" ? t("item.skippedBecause", { reason: settled }) : settled}
                        </p>
                      ) : null}
                      {item.answered_at ? (
                        <p className="text-xs text-muted-foreground">
                          {t("item.recordedBy", { who: item.answered_by_name ?? item.answered_by ?? "" })}
                        </p>
                      ) : null}

                      {!committed && isPending(item) && !itemOpen && !groupOpen ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button" variant="outline" size="sm" disabled={busy}
                            data-testid={`firm-setup-answer-${item.item_key}-action`}
                            ref={(el) => { triggerRefs.current[`${group.key}:${item.item_key}`] = el; }}
                            onClick={() => { setOpen({ kind: "item", itemKey: item.item_key }); setNotice(null); }}
                          >
                            {t("item.answer")}
                          </Button>
                          {!item.required ? (
                            <Button
                              type="button" variant="ghost" size="sm" disabled={busy}
                              data-testid={`firm-setup-skip-${item.item_key}`}
                              onClick={() => setSkipping(item)}
                            >
                              {t("item.skip")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {itemOpen && context ? (
                        <FirmSetupItemForm
                          items={openItems}
                          userId={context.user_id}
                          firmId={context.firm_id}
                          revision={env.revision_token}
                          busy={busy}
                          onSubmit={submit}
                          onSkip={(skipItem) => setSkipping(skipItem)}
                          onCancel={() => closeAndReturn(`${group.key}:${item.item_key}`)}
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      {!committed && env.seeded ? (
        <section aria-labelledby="firm-setup-finish" className="flex flex-col gap-2">
          <SectionHeader level={2} id="firm-setup-finish">{t("commit.heading")}</SectionHeader>
          <p className="text-sm text-muted-foreground">
            {allSettled ? t("commit.ready") : t("commit.notReady")}
          </p>
          <div>
            <Button
              type="button"
              disabled={busy || env.required_outstanding.length > 0}
              data-testid="firm-setup-commit"
              onClick={() => void runCommit()}
            >
              {busy ? t("commit.working") : t("commit.action")}
            </Button>
          </div>
        </section>
      ) : null}

      {/* THE CORRECTION PATH SURVIVES THE COMMIT, deliberately: a committed checklist does not
          freeze a fact on the canonical register — that is what clara.correct_knowledge is for. */}
      <FirmConfirmedFactsPanel facts={env.confirmed_facts} items={env.items} act={factAct} />

      {skipping ? (
        <SkipDialog
          item={skipping}
          busy={busy}
          error={writeError}
          onConfirm={async (reason) => {
            const ok = await runSkip(skipping, reason);
            if (ok) setSkipping(null);
            return ok;
          }}
          onClose={() => setSkipping(null)}
        />
      ) : null}
    </div>
  );
}

/** ONE BOUNDED DECISION — a Dialog (appendix D row 23). The door refuses an empty reason, so this
 *  form refuses it first, beside the control, rather than sending a blank and rendering the
 *  database's refusal of something the person never meant to send. */
function SkipDialog({
  item, busy, error, onConfirm, onClose,
}: {
  item: FirmSetupItem;
  busy: boolean;
  error: unknown;
  onConfirm: (reason: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("FirmSetup");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <Dialog open onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <DialogContent data-testid="firm-setup-skip-dialog">
        <DialogHeader>
          <DialogTitle>{t("skip.title")}</DialogTitle>
          <DialogDescription>{t("skip.description", { question: item.question })}</DialogDescription>
        </DialogHeader>
        <Field data-invalid={problem || undefined}>
          <FieldContent>
            <FieldLabel htmlFor="firm-setup-skip-reason">
              <FieldTitle>{t("skip.reasonLabel")}</FieldTitle>
            </FieldLabel>
          </FieldContent>
          <Textarea
            id="firm-setup-skip-reason"
            rows={2}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setProblem(false); }}
          />
          {problem ? (
            <p className="text-sm text-destructive" data-testid="firm-setup-skip-problem">
              {t("skip.reasonRequired")}
            </p>
          ) : null}
        </Field>
        <DoorDialogRefusal refusal={toDialogRefusal(error)} attempt={attempt} />
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("skip.cancel")}</DialogClose>
          <Button
            type="button"
            disabled={busy}
            data-testid="firm-setup-skip-confirm"
            onClick={() => {
              if (reason.trim() === "") { setProblem(true); return; }
              setAttempt((n) => n + 1);
              void onConfirm(reason.trim());
            }}
          >
            {busy ? t("skip.working") : t("skip.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { FirmSetupEnvelope };
