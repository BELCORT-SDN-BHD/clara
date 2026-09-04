"use client";

// The client register (owner ruling Q3) — clara.clients, the real clients the RLS
// session can see, each linking into its workspace. Enriched with entity_type/msic
// from clara.client_facts where a live fact exists (this build's coordinator
// ruling): a client with no such fact renders it absent, never inferred.
//
// N15 (independent review, 2026-08-27): the facts enrichment read is DECOUPLED
// from the primary client read — a `Promise.all` would have failed the WHOLE
// register (names, links, status — everything) if only the facts relation
// refused (e.g. a narrower grant on client_facts than on clients). The primary
// read's failure still fails the whole register (there is nothing to show
// without it); a facts-read failure degrades only the two enrichment columns,
// with an honest caption distinguishing "could not be loaded" from "no fact
// recorded" — law 2: a failed read is not evidence of absence.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadClientRegister, loadClientRegisterFacts, type ClientRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataTableCard } from "@/components/common/data-table-card";
import { Input } from "@/components/ui/input";
import { StateBanner } from "@/components/common/state";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { OnboardingDoorDialog } from "@/components/clara/OnboardingDoorDialog";
import { findDoAction, isDoActionPermitted, type DoActionEnv } from "@/lib/command/do-actions";
import { loadDoEnv, runDoAction } from "@/lib/command/do-dispatch";
import { meetsFloor } from "@/lib/identity/caller-context";
import { onClientRecordChanged } from "@/lib/command/bus";
import { isDoorRefusal } from "@/lib/doors";
import { DataState } from "./data-state";

type EnrichedRow = { client: ClientRow; entityType: string | null; msic: string | null };
type EnrichedRegister = { rows: EnrichedRow[]; factsAvailable: boolean };

async function loadEnrichedRegister(): Promise<EnrichedRegister> {
  const clients = await loadClientRegister(sessionTokenAccessor);

  const byClient = new Map<string, { entityType: string | null; msic: string | null }>();
  let factsAvailable = true;
  try {
    const facts = await loadClientRegisterFacts(sessionTokenAccessor);
    for (const f of facts) {
      const entry = byClient.get(f.client_id) ?? { entityType: null, msic: null };
      if (f.fact_key === "entity_type") entry.entityType = typeof f.fact_value === "string" ? f.fact_value : null;
      if (f.fact_key === "msic") entry.msic = typeof f.fact_value === "string" ? f.fact_value : null;
      byClient.set(f.client_id, entry);
    }
  } catch {
    factsAvailable = false; // the register itself still renders — see header
  }

  return {
    factsAvailable,
    rows: clients.map((client) => ({
      client,
      entityType: byClient.get(client.id)?.entityType ?? null,
      msic: byClient.get(client.id)?.msic ?? null,
    })),
  };
}

/**
 * ============================================================================
 * H-51 / CB-AE2E-024 — "Add client" ON THE REGISTER.
 * ============================================================================
 *
 * WHAT WAS MISSING. `/clients` is the page a person goes to when they want to add a client,
 * and it was the one surface with no affordance for it: the page renders a header and this
 * read-only table, and neither file imported a door. Two entry points DID exist — ⌘K's "Do"
 * row, and the firm-altitude Clara rail's own Begin card — but both are somewhere else.
 *
 * IT REUSES THE FLOW, IT DOES NOT MINT A THIRD ONE. The dispatch is ⌘K's own:
 * `loadDoEnv` reads what the DATABASE says this caller may do, `isDoActionPermitted` is the
 * SAME predicate the palette filters with (never a copy of it — 裁-107a), and `runDoAction`
 * performs the one governed call and reports where to look. So this inherits 裁-141's
 * pre-filter, the fail-closed-twice discipline, and `do-action-floors.test.ts`'s drift guard
 * for free, and adds no new call site for `begin_client_onboarding`.
 *
 * THE TWO GATES ARE DIFFERENT QUESTIONS, and each is asked of the right thing. The TRIGGER
 * asks "could this caller ever dispatch this?" — `meetsFloor` against the action's own
 * transcribed floor, which is the first conjunct of `isDoActionPermitted` called from the same
 * module, not a re-derivation of it. The CONFIRM asks the full question, name included, and
 * `runDoAction` asks it a third time before touching the door. The DATABASE is still the wall
 * behind all three: `begin_client_onboarding` is `security definer` with its own admin
 * `_human_ctx` floor and raises CLR04 for a caller under it, rendered here VERBATIM.
 */
function AddClientControl({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("ClientsRegister");
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ message: string; code: string | null } | null>(null);
  // ONE READ, on mount — the same shape the palette makes on every open. A FAILED read yields
  // no env at all, which renders the honest "we could not find out" line rather than an
  // absence that would read as "your role grants nothing".
  const env = useAsyncRead(() => loadDoEnv(sessionTokenAccessor, null));

  const spec = findDoAction("beginClientOnboarding");
  if (spec === null) return null;

  if (env.loading) return null;
  if (env.error || env.data === null) {
    return <p className="text-xs text-warning">{t("addClientAuthorityUnreadable")}</p>;
  }
  if (!meetsFloor(env.data.ctx, spec.floor)) return null;

  const doEnv: DoActionEnv = { ...env.data, query: name };

  return (
    <div className="flex flex-col gap-2">
      {refusal ? (
        <StateBanner tone="error" code={refusal.code ?? undefined}>{refusal.message}</StateBanner>
      ) : null}
      <OnboardingDoorDialog
        triggerLabel={t("addClientTrigger")}
        triggerVariant="default"
        title={t("addClientTitle")}
        description={t("addClientDescription")}
        confirmLabel={t("addClientConfirm")}
        busy={busy}
        confirmDisabled={!isDoActionPermitted(spec, doEnv)}
        onConfirm={async () => {
          setBusy(true);
          setRefusal(null);
          try {
            const result = await runDoAction(spec, doEnv, sessionTokenAccessor);
            if (result.kind === "refused") {
              // `runDoAction` re-evaluates `isDoActionPermitted` against the same env before it
              // touches the door (裁-107a's third check). Returning silently made that
              // indistinguishable from a click that did nothing, on a governed act — so it says
              // so, and says the door was never called, which is the part that matters.
              //
              // BELT, AND LABELLED AS ONE — no cell, and the reason is measurable rather than
              // lazy. This Confirm is `disabled` on exactly `!isDoActionPermitted(spec, doEnv)`,
              // `clickButton` refuses a disabled node, and `doEnv` cannot change between the
              // click and the re-check (it is rebuilt per render from the same `env.data` and
              // the same typed `name`). So a `refused` result is unreachable from THIS surface
              // today, and the fold round's mutant panel measured that: deleting this line
              // leaves every cell green. It stays because the predicate is deliberately asked
              // three times and the third answer must never be swallowed — the day an env can
              // change under an open dialog, this is the arm that speaks.
              setRefusal({ message: t("addClientNotPermitted"), code: null });
              return;
            }
            setName("");
            // Hydrate-never-trust: the register RE-READS rather than splicing in a row built
            // from the door's own reply. The navigation is to the id the DATABASE returned.
            onCreated();
            if (result.kind === "navigated") router.push(result.href);
          } catch (err) {
            // A DoorRefusal renders VERBATIM and is never retried (apps/web/AGENTS.md).
            if (isDoorRefusal(err)) setRefusal({ message: err.message, code: err.code });
            else setRefusal({ message: err instanceof Error ? err.message : String(err), code: null });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          aria-label={t("addClientNameLabel")}
          placeholder={t("addClientNamePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </OnboardingDoorDialog>
    </div>
  );
}

export function ClientRegisterList() {
  const t = useTranslations("ClientsRegister");
  const { data, loading, error, reload } = useAsyncRead(loadEnrichedRegister);
  const rows = data?.rows ?? [];

  // H-50 — the same mount-only read the client Home tab has, and the same staleness: a client
  // committed or cancelled from the Clara rail keeps its old status here on a back-navigation.
  // One subscription, one re-read; the event carries no status to trust.
  useEffect(() => onClientRecordChanged(() => void reload()), [reload]);

  const statusLabels: Record<string, string> = {
    active: t("statuses.active"),
    archived: t("statuses.archived"),
    onboarding: t("statuses.onboarding"),
  };

  const factCell = (value: string | null) => {
    if (!data?.factsAvailable) return t("factsUnavailable");
    return value ?? t("factAbsent");
  };

  return (
    <div className="flex flex-col gap-2">
      {/* H-51 — ABOVE the DataState, so it is offered on an EMPTY register too: a firm with no
          clients yet is precisely the firm that needs this control, and putting it inside the
          table's own state would have hidden it exactly then. */}
      <div className="self-start">
        <AddClientControl onCreated={() => void reload()} />
      </div>
      {data && !data.factsAvailable ? <p className="text-xs text-warning">{t("factsUnavailableNote")}</p> : null}
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("emptyMessage")}>
        {/* P3 polish: the hand-rolled `<table className="w-full text-left
            text-sm">` with `py-2 pr-4` cells became components/ui/table.tsx —
            the SAME primitive the Documents tab already used, so every data
            table in the product now shares one density, one hairline and one
            row-hover. It sits inside a Card because every other panel-level
            block on a page does; a bare table floating on the shell grey was
            the one surface with no edge at all. */}
        <DataTableCard>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnName")}</TableHead>
              <TableHead>{t("columnStatus")}</TableHead>
              <TableHead>{t("columnEntityType")}</TableHead>
              <TableHead>{t("columnMsic")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ client, entityType, msic }) => (
              <TableRow key={client.id}>
                <TableCell>
                  <Link href={`/clients/${client.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {client.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">{statusLabels[client.status] ?? client.status}</TableCell>
                <TableCell className="text-muted-foreground">{factCell(entityType)}</TableCell>
                <TableCell className="text-muted-foreground">{factCell(msic)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTableCard>
      </DataState>
    </div>
  );
}
