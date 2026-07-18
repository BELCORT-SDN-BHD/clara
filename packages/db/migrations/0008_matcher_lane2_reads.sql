-- Slice 5 follow-on — matcher lane-2 read set (as-built §3.10 completion)
--
-- WHAT: completes the grant matrix for the matcher consumer's lane-2 candidate
-- computation (S5-D2 / contract §4.4, companion §3.4). The ratified design gives
-- clara_runtime SELECT on client_identifiers/client_aliases explicitly FOR the
-- matcher ("SQL hard-scopes firm"), but the §3.10 matrix omitted the read set the
-- matcher needs to COMPUTE name/alias candidates: the extraction facts and the
-- client-name registry. Surfaced by the matcher build lane (a 42501 on
-- document_regions/clients under SET ROLE clara_runtime); adjudicated as a matrix
-- omission, not an intent — recorded as a Slice-5 §13 as-built amendment + in
-- ADR-018.
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

reset role;
