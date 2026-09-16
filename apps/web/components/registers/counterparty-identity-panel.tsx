"use client";

// ONE COUNTERPARTY'S IDENTITY — #647's routed detail (migration 0200, journey C13/A6/C6).
//
// WHY A ROUTE AND NOT A SHEET. Appendix D's overlay hierarchy puts durable detail, history and
// shareable outcomes behind a real URL; a Sheet is for supporting context that complements the
// page you are on. An identity's correction history is exactly the thing a reviewer links to, so
// it lives at /clients/:clientId/knowledge/parties/:counterpartyId and Back returns to Knowledge.
//
// THE REUSE BOUNDARY, stated because it is not uniform (brief §"Surface ownership"). Called
// VERBATIM from ./knowledge-shared.tsx: `KnowledgeSourceBlock` (the source link AND its
// inaccessible-source face). NOT called, though the shape is followed: `KnowledgeBadges`,
// `KnowledgeApplicability` and `KnowledgeProvenance` all take a `KnowledgeRecordRow`, whose
// `recorded_via` is the two-value union `"human_ui" | "clara_runtime"` rendered through
// `ClientKnowledge.recordedVia`, which has exactly those two keys. #647's four lanes
// (human_ui / agent / seeding / legacy_unknown) would neither typecheck nor translate there, and
// `lib/registers/knowledge.ts` is #654's register — widening it would put every existing call
// site on keys that do not exist. The counterparty-typed equivalents below keep the same dl /
// label shape and read their strings from `ArApCounterparty.recordedVia`.
//
// EVERY NUMBER AND EVERY SENTENCE COMES FROM A READ THAT RAN (H-34's REDESIGN obligation). The
// counts are the database's own (`clara.get_counterparty_identity` computes them); an empty
// aliases list says that no alias was EVER recorded, which is a different sentence from a
// filtered list finding nothing.
//
// HYDRATE-NEVER-TRUST: every act reloads the read and renders what came back; nothing here
// paints the value it just sent.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessDateTime } from "@/lib/business-date";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
import {
  getCounterpartyIdentity,
  type CounterpartyAliasRow,
  type CounterpartyIdentityConflict,
  type CounterpartyIdentityRevision,
  type CounterpartyMergeRow,
} from "@/lib/registers/counterparty-identity";
import {
  addCounterpartyAlias, retireCounterpartyAlias, setCounterpartyIdentifiers,
  type CounterpartyAliasOrigin,
} from "@/lib/registers/counterparty-doors";
import { KnowledgeSourceBlock } from "./knowledge-shared";
import { AddCounterpartyAliasDialog } from "./AddCounterpartyAliasDialog";
import { RetireCounterpartyAliasDialog } from "./RetireCounterpartyAliasDialog";
import { SetCounterpartyIdentifiersDialog } from "./SetCounterpartyIdentifiersDialog";

/** The alias origin, as a word. A value the CHECK admits but no door in this build writes
 *  (`agent_proposed`) is still rendered: a row that exists must be readable. */
function originKey(origin: string): string {
  switch (origin) {
    case "former_name": return "originFormerName";
    case "trade_name": return "originTradeName";
    case "human": return "originHuman";
    case "extracted": return "originExtracted";
    case "agent_proposed": return "originAgentProposed";
    default: return "originHuman";
  }
}

function actKey(act: string): string {
  switch (act) {
    case "rename": return "actRename";
    case "alias_added": return "actAliasAdded";
    case "alias_retired": return "actAliasRetired";
    case "identifiers_set": return "actIdentifiersSet";
    case "merged": return "actMerged";
    default: return "actRename";
  }
}

/** THE COUNTERPARTY-TYPED PROVENANCE LINE — `KnowledgeProvenance`'s shape, this domain's four
 *  lanes. An unrecognised lane falls back to the recorded-unknown wording rather than throwing a
 *  missing-key error at a reader. */
export function IdentityRecordedVia({ via }: { via: string }) {
  const t = useTranslations("ArApCounterparty.recordedVia");
  const known = ["human_ui", "agent", "seeding", "legacy_unknown"].includes(via);
  return <span>{t((known ? via : "legacy_unknown") as "human_ui")}</span>;
}

function AliasItem({
  clientId, alias, busy, refusal, onRetire,
}: {
  clientId: string;
  alias: CounterpartyAliasRow;
  busy: boolean;
  refusal: ReturnType<typeof toDialogRefusal>;
  onRetire: (aliasId: string) => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.identity");
  // Item (33): a compact row anatomy, and NEVER a clickable row disguised as static — the only
  // interactive things in here are real controls and a real link inside the source block.
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-card-foreground">{alias.alias_display}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{t(originKey(alias.origin) as "originHuman")}</Badge>
          {alias.retired_at ? (
            <Badge variant="secondary">{t("aliasRetired", { at: businessDateTime(alias.retired_at) })}</Badge>
          ) : (
            <Badge variant="outline">{t("aliasLive")}</Badge>
          )}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {alias.created_by_name ?? alias.created_by}
        {" · "}
        <IdentityRecordedVia via={alias.recorded_via} />
        {" · "}
        {businessDateTime(alias.created_at)}
      </p>
      {alias.recorded_basis ? (
        <p className="text-xs text-card-foreground">{alias.recorded_basis}</p>
      ) : null}
      {/* VERBATIM reuse: the same source block C13 uses, including its inaccessible-source face.
          `work_id` is null because an identity act is never inside a Work bundle, and the source
          kind is `document_extraction` where an extraction pin rides and `user_statement`
          otherwise — both existing `ClientKnowledge.sourceKind.*` keys. */}
      <KnowledgeSourceBlock
        clientId={clientId}
        source={{ ...alias.source, work_id: null }}
        sourceKind={alias.source.extraction_id ? "document_extraction" : "user_statement"}
      />
      {alias.retired_at ? null : (
        <div className="flex flex-wrap gap-1.5">
          <RetireCounterpartyAliasDialog
            aliasDisplay={alias.alias_display}
            busy={busy}
            refusal={refusal}
            onSubmit={() => onRetire(alias.id)}
          />
        </div>
      )}
    </li>
  );
}

function RevisionItem({ rev }: { rev: CounterpartyIdentityRevision }) {
  const t = useTranslations("ArApCounterparty.identity");
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{t("revisionLabel", { n: rev.revision_n })}</span>
        <Badge variant="outline">{t(actKey(rev.act) as "actRename")}</Badge>
      </div>
      <p className="text-xs text-card-foreground">{rev.basis}</p>
      <p className="text-xs text-muted-foreground">
        {t("revisionBy", {
          who: rev.changed_by_name ?? rev.changed_by,
          at: businessDateTime(rev.changed_at),
        })}
        {" · "}
        <IdentityRecordedVia via={rev.recorded_via} />
      </p>
    </li>
  );
}

function MergeItem({ merge }: { merge: CounterpartyMergeRow }) {
  const t = useTranslations("ArApCounterparty.identity");
  const at = businessDateTime(merge.merged_at);
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
      <span className="text-card-foreground">
        {merge.side === "survivor"
          ? t("mergeSurvivor", { name: merge.merged_name ?? merge.merged_id, at })
          : t("mergeMerged", { name: merge.survivor_name ?? merge.survivor_id, at })}
      </span>
      <p className="text-xs text-muted-foreground">{t("mergeReason", { reason: merge.reason })}</p>
      <p className="text-xs text-muted-foreground">
        {merge.merged_by_name ?? merge.merged_by}
      </p>
    </li>
  );
}

function ConflictItem({ conflict }: { conflict: CounterpartyIdentityConflict }) {
  const t = useTranslations("ArApCounterparty.identity");
  if (conflict.kind === "cross_kind_same_name") {
    return (
      <li>
        <StateBanner tone="warning">
          {t("conflictCrossKind", {
            partyName: conflict.other_counterparty_name ?? conflict.other_counterparty_id,
            role: conflict.other_kind === "vendor" ? t("roleVendor") : t("roleCustomer"),
          })}
        </StateBanner>
      </li>
    );
  }
  return (
    <li>
      <StateBanner tone="warning">
        {t("conflictCrossClient", {
          clientName: conflict.other_client_name ?? conflict.other_client_id,
          identifier: conflict.identifier_kind === "tin" ? t("identifierTin") : t("identifierRegistration"),
          value: conflict.value ?? "",
          partyName: conflict.other_counterparty_name ?? conflict.other_counterparty_id,
        })}
      </StateBanner>
    </li>
  );
}

export function CounterpartyIdentityPanel({
  clientId,
  counterpartyId,
}: {
  clientId: string;
  counterpartyId: string;
}) {
  const t = useTranslations("ArApCounterparty.identity");
  const read = useAsyncRead(() =>
    getCounterpartyIdentity(clientId, counterpartyId, { session: sessionTokenAccessor }));
  const data = read.data ?? null;
  const refusal = toDialogRefusal(read.error);

  async function runAddAlias(alias: string, origin: CounterpartyAliasOrigin, basis: string | null) {
    return read.act(async () => {
      await addCounterpartyAlias(clientId, counterpartyId, alias, origin, { basis },
        { session: sessionTokenAccessor });
    });
  }
  async function runRetireAlias(aliasId: string) {
    return read.act(async () => {
      await retireCounterpartyAlias(clientId, aliasId, { session: sessionTokenAccessor });
    });
  }
  async function runSetIdentifiers(registrationNo: string | null, tin: string | null) {
    return read.act(async () => {
      await setCounterpartyIdentifiers(clientId, counterpartyId, registrationNo, tin,
        { session: sessionTokenAccessor });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Link className="w-fit text-xs underline underline-offset-4" href={`/clients/${clientId}/knowledge`}>
        {t("backToKnowledge")}
      </Link>

      {/* `loading` ONLY while nothing is known yet — knowledge-detail.tsx's measured rule: act()
          reloads after every write, so a plain `read.loading` would blank this subtree on a
          REFUSAL and take the open dialog, and the text the human had just typed, with it. */}
      <DataState
        loading={read.loading && data === null}
        error={data === null ? read.error : null}
        isEmpty={false}
        emptyMessage={t("emptyBoth")}
      >
        {data ? (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-card-foreground">{data.current.name}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">
                    {data.current.kind === "vendor" ? t("roleVendor") : t("roleCustomer")}
                  </Badge>
                  {data.current.merged_into ? <Badge variant="secondary">{t("actMerged")}</Badge> : null}
                </span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>{t("identifierRegistration")}</dt>
                <dd>{data.current.registration_no ?? "—"}</dd>
                <dt>{t("identifierTin")}</dt>
                <dd>{data.current.tin ?? "—"}</dd>
              </dl>
              {data.current.merged_into ? (
                <StateBanner tone="neutral">
                  {t("canonicalNow", {
                    name: data.merges.find((m) => m.survivor_id === data.current.merged_into)?.survivor_name
                      ?? data.current.merged_into,
                  })}
                </StateBanner>
              ) : null}
              {/* AC4, STATED rather than merely true. */}
              <p className="text-xs text-muted-foreground">{t("neverGrants")}</p>
              <p className="text-xs text-muted-foreground">{t("asOf", { at: data.as_of })}</p>
              <div className="flex flex-wrap gap-2">
                <SetCounterpartyIdentifiersDialog
                  counterpartyName={data.current.name}
                  currentRegistrationNo={data.current.registration_no}
                  currentTin={data.current.tin}
                  busy={read.busy}
                  refusal={refusal}
                  onSubmit={runSetIdentifiers}
                />
                <AddCounterpartyAliasDialog
                  counterpartyName={data.current.name}
                  busy={read.busy}
                  refusal={refusal}
                  onSubmit={runAddAlias}
                />
              </div>
            </section>

            {/* The STANDING refusal lives outside every dialog so it survives one closing and the
                reload that always follows (doors.ts's law). A persistent banner, never a Toast. */}
            {read.error ? <ErrorMessage error={read.error} /> : null}

            <section className="flex flex-col gap-2">
              <SectionHeader level={2}>{t("conflictsHeading")}</SectionHeader>
              {data.conflicts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("conflictsEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.conflicts.map((c) => (
                    <ConflictItem key={`${c.kind}-${c.other_counterparty_id}-${c.identifier_kind ?? "name"}`} conflict={c} />
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeader level={2}>{t("aliasesHeading")}</SectionHeader>
              {/* H-34, said precisely: every count on this page is derived from a read that RAN.
                  On the LIST it is the database's own aggregate (clara.list_counterparty_identity
                  computes alias_count / live_alias_count / revision_count / unsourced_alias_count
                  in SQL); HERE it is counted over the collections get_counterparty_identity
                  actually returned, which it returns unbounded. Neither is a guess, and neither is
                  a filtered array's length standing in for a total. */}
              <p className="text-xs text-muted-foreground">
                {t("countAliases", { n: data.aliases.filter((a) => a.retired_at === null).length })}
                {" · "}
                {t("countUnsourced", {
                  n: data.aliases.filter((a) => a.retired_at === null && a.source.document_id === null).length,
                })}
              </p>
              {data.aliases.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("aliasesEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.aliases.map((a) => (
                    <AliasItem
                      key={a.id}
                      clientId={clientId}
                      alias={a}
                      busy={read.busy}
                      refusal={refusal}
                      onRetire={runRetireAlias}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeader level={2}>{t("mergesHeading")}</SectionHeader>
              {data.merges.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("mergesEmpty")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.merges.map((m) => <MergeItem key={m.id} merge={m} />)}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <SectionHeader level={2}>{t("historyHeading")}</SectionHeader>
              <p className="text-xs text-muted-foreground">
                {t("countRevisions", { n: data.identifier_revisions.length })}
              </p>
              {data.identifier_revisions.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("historyEmpty")}</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {data.identifier_revisions.map((r) => (
                    <RevisionItem key={`${r.revision_n}-${r.act}`} rev={r} />
                  ))}
                </ol>
              )}
            </section>
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
