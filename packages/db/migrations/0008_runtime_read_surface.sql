-- Slice 5 follow-on — runtime READ-surface completion (as-built §3.10 amendments)
--
-- TWO §3.10 matrix omissions surfaced by the build lanes, both read-only:
--
-- (1) Matcher lane-2 candidate computation (S5-D2 / contract §4.4, companion
-- §3.4). The ratified design gives clara_runtime SELECT on client_identifiers/
-- client_aliases explicitly FOR the matcher ("SQL hard-scopes firm"), but the
-- matrix omitted the read set the matcher needs to COMPUTE name/alias
-- candidates: the extraction facts and the client-name registry. Surfaced by
-- the matcher build lane (a live 42501 under SET ROLE clara_runtime).
--
-- (2) The runtime's OWN control tables (companion §3.9). The reconciler design
-- REQUIRES the runtime to see queued-unbound/stranded processing tasks and
-- expired intakes/reservations ("re-enqueues queued-UNBOUND tasks (crash
-- between finalize and workflow start)") — but the matrix granted runtime
-- "full via writers" with no SELECT, forcing a file-sidecar workaround with an
-- irreducible finalizer crash window (REPORT-R1 deviation 2). The 0006
-- convention (runtime policies on its own control tables) makes the intent
-- clear. DML stays writer-only — this adds READ visibility only, which closes
-- the crash window: the DB-first sweep sees the committed task even when the
-- process died before any sidecar was written.
--
-- Both adjudicated as matrix omissions, not intent — recorded as Slice-5 §13
-- as-built amendments + in ADR-018.
--
-- Firm hard-scoping REMAINS in the matcher's SQL per §3.4 — the runtime lane's
-- using(true) policies are the 0006/0007 convention (RLS is NOT the tenant
-- boundary for clara_runtime). Lane 1 is untouched: record_rule_resolution keeps
-- recomputing server-side under the runtime-login-only EXECUTE surface.
--
-- Authority: slice5-document-pipeline-contract.md v1.2 §4.4 + companion §3.4/§3.10;
-- ADR-018 (lands with the Slice-5 build PR).

set role clara_fn_owner;

grant select on clara.document_extractions to clara_runtime;
grant select on clara.document_regions    to clara_runtime;
grant select on clara.clients             to clara_runtime;

create policy p_document_extractions_runtime_read on clara.document_extractions
  for select to clara_runtime using (true);
create policy p_document_regions_runtime_read on clara.document_regions
  for select to clara_runtime using (true);
create policy p_clients_runtime_read on clara.clients
  for select to clara_runtime using (true);

-- (2) runtime control-table read visibility (DML remains writer-only).
grant select on clara.document_intakes            to clara_runtime;
grant select on clara.document_processing_tasks   to clara_runtime;
grant select on clara.document_ingest_reservations to clara_runtime;

create policy p_document_intakes_runtime_read on clara.document_intakes
  for select to clara_runtime using (true);
create policy p_document_processing_tasks_runtime_read on clara.document_processing_tasks
  for select to clara_runtime using (true);
create policy p_document_ingest_reservations_runtime_read on clara.document_ingest_reservations
  for select to clara_runtime using (true);

reset role;
