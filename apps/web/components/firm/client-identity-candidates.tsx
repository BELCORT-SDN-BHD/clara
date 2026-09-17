"use client";

// #649 AC1 — the candidate face. What the DATABASE already holds under this name, shown to the
// person about to mint another record, with a real link to each one and the reason it matched.
//
// PRESENTATIONAL ONLY, ON PURPOSE. It runs no predicate, makes no read and decides nothing: the
// rows arrive from `clara.client_identity_candidates` (arity 0/1) or from that same door's CLR10
// `name_family_collision` detail (arity >= 2), and the arity the human is told is the DATABASE's
// own number. A client-side "does this look like a duplicate" heuristic would be a second opinion
// about one fact — exactly what the definer wrapper exists to prevent.
//
// EVERY ROW IS A REAL LINK, because "we already have one of these" is only actionable if the
// person can go and look. A counterparty candidate links to the CLIENT it belongs to (the family
// predicate unions clients and live counterparties, 0103:764-771), and a row the database could
// not bind to a client renders its name without a link rather than a dead one.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import type { ClientIdentityCandidate } from "@/lib/onboarding/identity";

/** The `match_reason` values 0219 emits. An unrecognised one renders its own raw token rather
 *  than being folded into a known arm — a later migration's fourth reason must read honestly. */
const KNOWN_REASONS = new Set(["exact_name", "name_family", "identifier"]);
const KNOWN_KINDS = new Set(["client", "counterparty"]);

export function ClientIdentityCandidateList({
  candidates,
  arity,
  onNavigate,
}: {
  candidates: readonly ClientIdentityCandidate[];
  /** The DATABASE's own count. Rendered rather than `candidates.length`, so a row this browser
   *  could not read lowers nothing the human is told. */
  arity: number;
  /** Fired when a candidate link is followed — the caller closes its dialog so focus is not
   *  stranded on a control that is about to unmount. */
  onNavigate?: () => void;
}) {
  const t = useTranslations("ClientIdentity");

  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-card-foreground" id="client-identity-candidates-label">
        {t("candidatesLabel", { count: arity })}
      </p>
      <ul aria-labelledby="client-identity-candidates-label" className="flex list-none flex-col gap-1 p-0">
        {candidates.map((c) => {
          const reason = KNOWN_REASONS.has(c.matchReason)
            ? t(`reason.${c.matchReason}` as "reason.exact_name")
            : t("reason.unknown", { reason: c.matchReason });
          const kind = KNOWN_KINDS.has(c.partyKind)
            ? t(`kind.${c.partyKind}` as "kind.client")
            : t("kind.unknown", { kind: c.partyKind });
          return (
            <li key={`${c.partyKind}:${c.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm">
              {c.clientId ? (
                <Link
                  href={`/clients/${c.clientId}`}
                  onClick={onNavigate}
                  className="min-h-6 py-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  {c.name}
                </Link>
              ) : (
                <span className="font-medium text-card-foreground">{c.name}</span>
              )}
              <Badge tone="neutral">{kind}</Badge>
              {c.status ? <Badge tone="neutral">{c.status}</Badge> : null}
              <span className="text-xs text-muted-foreground">{reason}</span>
              {c.clientId ? null : (
                <span className="text-xs text-muted-foreground">{t("noLink")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
