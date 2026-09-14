import { ReportsPage } from "@/components/reports/ReportsPage";
import { REPORT_PARAM, parseReportParam } from "@/lib/reports/url-state";

/**
 * "/clients/:clientId/reports" — one tab of the client workspace (owner ruling
 * Q3). Three direct DB-read surfaces: the sealed statutory close-report
 * archive (0127), the watermarked analysis sandbox's history (0132 — its
 * mint/request verbs are agent-lane only, see components/reports/
 * SandboxExportsPanel.tsx), and the freeform read audit log (0131). This
 * route only threads `clientId` down to the client component that does the
 * reading.
 *
 * #719 — `?report=` IS READ HERE, on the server, and handed down as a plain prop. The same choice
 * the Journals route makes for `?entry=` and for the same reason: a `useSearchParams()` in the
 * client component would work too, but it forces a Suspense boundary on every build of this route
 * for a value that is only ever the OPENING state. (The Documents route DOES carry that boundary,
 * because its workbench keeps WRITING the parameter as the reader steps between documents; nothing
 * on this tab writes it — the addressed state is cleared in place.) The address matters because an
 * item link — the Activity feed's own `activityReportsHref` — must be able to name one sealed
 * artifact rather than the whole archive.
 */
export default async function ClientReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const query = (await searchParams) ?? {};
  const raw = query[REPORT_PARAM];
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? (raw[0] ?? "") : "";
  return <ReportsPage clientId={clientId} addressedReport={parseReportParam(one)} />;
}
