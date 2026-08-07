-- =====================================================================================
-- CLIENT HARD-IDENTIFIER SEED — rides the 0049 ceremony. NOT APPLIED BY THE AUTHOR.
--
-- WHY IT RIDES THIS CEREMONY. 0049 makes 'purchase' a conclusion that needs positive
-- evidence. The evidence a client can offer about ITSELF is its hard identifiers, and two of
-- the three real BELCORT clients hold none at all (measured read-only 2026-08-08:
-- BEE CREATIVE SOLUTION — no client_identifiers row of any kind; ROME PROPERTIES SDN BHD —
-- one row, kind='bank_account'; ROME SECRETARY SDN BHD — ssm, seeded at task #23; the
-- sandbox's Fictional Test Services — ssm + tin). Seeding what we can EVIDENCE is what keeps
-- a real pipeline resolving by identity instead of by name spelling.
--
-- WHAT IT ACTUALLY BUYS, STATED HONESTLY (this is not the "queue impact is zero on day one"
-- claim it might look like — that claim is measured FALSE either way, because no live filing
-- currently reaches the arm these rows feed):
--   * THE SALES ARM. A registration MATCH is decisive and kind-agnostic: once BEE's own
--     registration is on file, BEE's own sales invoice resolves to 'sales' by identity rather
--     than by its name surviving OCR. That is exactly what task #23 bought for ROME SECRETARY,
--     where seeding flipped a real document from 'purchase' to 'sales' with no code change.
--   * (P1). The buyer arm reads customer_registration / customer_taxid against the same rows.
--   * It does NOT turn (P2)'s registration limb on. That limb needs BOTH hard kinds (tin AND
--     ssm) because `invoice.vendor_registration` carries either and never says which, and
--     neither client's TIN is evidenced anywhere in our own data. Do not invent one. When a
--     client's LHDN TIN is known from a real document, add it with the same verb and the limb
--     turns on for that client permanently.
--
-- WHAT MAKES THIS SAFE TO RUN AND SAFE TO RE-RUN:
--   * It uses the AUDITED VERB clara.add_client_identifier — never a hand-written row. The
--     verb is op_key-idempotent (clara._reserve_op on client+kind+value), so a second run
--     returns the first run's receipt instead of a duplicate. (ROME SECRETARY's four rows for
--     two values are what re-running WITHOUT a stable op_key looks like — do not repeat it.)
--   * Every value is RE-DERIVED FROM THIS DATABASE at run time and the script REFUSES if the
--     evidence it cites is not there. It never trusts the constants below on their own.
--   * It refuses unless the operator explicitly confirms, because a client identifier is a
--     statement about a real registered entity and the owner is the authority on it.
--
-- HOW TO RUN (ceremony step, AFTER 0049 is applied and postverified):
--     python ~/.clara-tools/live_psql_file.py packages/db/deploy/client-identifiers-0049-seed.sql
--   with the confirmation set — the script tells you the exact line if you forget.
--
-- THE EVIDENCE, CITED PER VALUE (verify before confirming):
--   BEE CREATIVE SOLUTION  ssm 0516352-X
--     a document region of BEE's own filed corpus renders its customer as
--     "Bee Creative Solution (0516352-X)" — the bracketed number is a sole-proprietor
--     business registration. Result set (E1) below prints the region that says so.
--   ROME PROPERTIES SDN BHD  ssm 202501005621  and  ssm 1607035-V
--     clara.counterparties holds a row IN ROME PROPERTIES' OWN BOOKS naming the client itself
--     with registration_no '202501005621 (1607035-V)' — the new-format and old-format pair,
--     the same shape ROME SECRETARY carries (202501019265 / 1620678M). Result set (E2) prints
--     it. TWO ROWS ARE SEEDED, one per format, because a document may state either.
-- =====================================================================================

\set ON_ERROR_STOP on

-- ARMING. The confirmation arrives as a SESSION GUC, not a psql variable: psql does not
-- interpolate `:vars` inside dollar-quoted bodies, and the whole seed is one. Unset means
-- unarmed, and unarmed means every statement below is a read.
--     $env:PGOPTIONS = "-c clara.seed_confirm=YES"   (PowerShell, before the python call)
--     PGOPTIONS="-c clara.seed_confirm=YES" python ~/.clara-tools/live_psql_file.py <this file>

\echo '=== (E1) EVIDENCE — the region that states BEE CREATIVE SOLUTION''s registration ==='
select c.name as client, r.field_path, r.text_content
  from clara.document_regions r
  join clara.document_extractions e on e.id = r.extraction_id
  join clara.document_filings df on df.document_id = e.document_id and df.retired_at is null
  join clara.clients c on c.id = df.client_id
 where c.name = 'BEE CREATIVE SOLUTION'
   and r.text_content ilike '%0516352%';

\echo '=== (E2) EVIDENCE — the counterparty row that states ROME PROPERTIES'' registration ==='
select c.name as owner_client, cp.name as counterparty, cp.kind, cp.registration_no
  from clara.counterparties cp
  join clara.clients c on c.id = cp.client_id
 where c.name = 'ROME PROPERTIES SDN BHD'
   and cp.name_normalized = 'romepropertiessdnbhd';

\echo '=== (S) THE SEED ==='
do $seed$
declare
  v_confirm  text := nullif(btrim(coalesce(current_setting('clara.seed_confirm', true), '')), '');
  v_bee      uuid;
  v_rp       uuid;
  v_actor    uuid;
  v_firm     uuid;
  v_n        int;
  r          record;
  v_seeded   int := 0;
begin
  -- (1) THE CLIENTS, RESOLVED BY NAME AND PINNED BY ID. Both must agree: a uuid typed into a
  -- deploy file is a spelling, and a name is a projection — requiring BOTH to point at the
  -- same row is what makes this a proof rather than a guess.
  select id into v_bee from clara.clients
   where id = '9e957c0f-cc92-423c-88f2-e1fc701a1172' and name = 'BEE CREATIVE SOLUTION';
  select id into v_rp  from clara.clients
   where id = 'e2b0f365-09c5-4f6a-953a-52a18c1bcc8a' and name = 'ROME PROPERTIES SDN BHD';
  if v_bee is null or v_rp is null then
    raise exception 'seed: the pinned client ids do not resolve to the expected names on % (BEE %, ROME PROPERTIES %) -- this file was written for the live BELCORT firm and must not run anywhere else',
      current_database(), coalesce(v_bee::text,'<not found>'), coalesce(v_rp::text,'<not found>');
  end if;

  -- (2) THE EVIDENCE IS RE-READ, NOT TRUSTED. If the citing document or counterparty row is
  -- gone, the constants below have no support and the script refuses rather than asserting a
  -- registered identity on somebody's real books.
  select count(*) into v_n from clara.document_regions r
    join clara.document_extractions e on e.id = r.extraction_id
    join clara.document_filings df on df.document_id = e.document_id and df.retired_at is null
   where df.client_id = v_bee and r.text_content ilike '%0516352%';
  if v_n = 0 then
    raise exception 'seed: no document region of BEE CREATIVE SOLUTION states 0516352 any more -- the cited evidence for its ssm is gone; re-derive it before seeding';
  end if;
  select count(*) into v_n from clara.counterparties cp
   where cp.client_id = v_rp and cp.name_normalized = 'romepropertiessdnbhd'
     and cp.registration_no ilike '%202501005621%' and cp.registration_no ilike '%1607035%';
  if v_n = 0 then
    raise exception 'seed: no counterparty row in ROME PROPERTIES'' books states 202501005621 / 1607035 any more -- the cited evidence for its ssm pair is gone; re-derive it before seeding';
  end if;

  -- (3) THE CONFIRMATION. A client identifier is a claim about a real registered entity.
  if v_confirm is distinct from 'YES' then
    raise exception E'seed: NOT ARMED (clara.seed_confirm = %). The evidence above checks out on this database; READ IT, confirm the two registrations against the owner''s records, then re-run armed:\n    $env:PGOPTIONS = "-c clara.seed_confirm=YES"; python ~/.clara-tools/live_psql_file.py packages/db/deploy/client-identifiers-0049-seed.sql',
      coalesce(v_confirm,'<unset>');
  end if;

  -- (4) THE ACTOR. The verb is a HUMAN one (bookkeeper rank), so it runs under a real firm
  -- member's identity and lands in clara.audit_log under that name. The firm owner is the
  -- authority for a client-identity statement, so that is who is asked for.
  select fm.user_id, fm.firm_id into v_actor, v_firm
    from clara.firm_memberships fm
    join clara.clients c on c.firm_id = fm.firm_id
   where c.id = v_bee and fm.role = 'owner'
   order by fm.user_id limit 1;
  if v_actor is null then
    raise exception 'seed: no owner membership found for the firm holding BEE CREATIVE SOLUTION -- refusing to attribute a client-identity statement to nobody';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor)::text, true);
  -- set_config, not `SET LOCAL ROLE`: both work, but this one is the form PL/pgSQL is
  -- documented to take, and its is_local=true is visible in the call rather than in a keyword.
  perform set_config('role', 'clara_authenticated', true);

  -- (5) THE SEED ITSELF — audited verb, stable op_key, one row per (client, kind, value).
  -- The op_key is DERIVED from the value, so re-running is a no-op and adding a value later
  -- cannot collide with one already granted.
  for r in
    select * from (values
      (v_bee, 'ssm', '0516352-X',    'bee-ssm-brn'),
      (v_rp,  'ssm', '202501005621', 'rp-ssm-new'),
      (v_rp,  'ssm', '1607035-V',    'rp-ssm-old')
    ) as t(client, kind, value, tag)
  loop
    perform clara.add_client_identifier(r.client, r.kind, r.value, '0049-idseed-' || r.tag);
    v_seeded := v_seeded + 1;
  end loop;
  perform set_config('role', 'none', true);
  raise notice 'seed: % identifier statements issued through clara.add_client_identifier (idempotent; a re-run returns the same receipts)', v_seeded;
end
$seed$;

\echo '=== (V) VERIFY — the hard-identifier estate after the seed ==='
select c.name as client,
       coalesce(string_agg(ci.kind || '=' || ci.value_normalized, ' ' order by ci.kind, ci.value_normalized), '<none>') as identifiers
  from clara.clients c
  left join clara.client_identifiers ci on ci.client_id = c.id and ci.kind in ('tin','ssm')
 group by c.name
 order by c.name;
