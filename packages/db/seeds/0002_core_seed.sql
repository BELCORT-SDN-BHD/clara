-- 0002_core_seed — SYNTHETIC governed-core data, built ENTIRELY THROUGH THE
-- AUDITED WRITERS (never a hand-INSERT of a books row — CLAUDE.md law). Two firms,
-- four human users (+ the global agent identity, already seeded by migration 0002),
-- three clients, a ~12-account chart per client INCLUDING one special rounding
-- account, and a handful of approved entries.
--
-- IDEMPOTENCY = a seeded sentinel guard, NOT truncate-reload (design v1 §7 as
-- amended): approved entries are immutable, so a re-run detects the sentinel user
-- and SKIPs. This seed NEVER touches clara.slice1_smoke (the Slice-1 placeholder
-- keeps its own truncate-style seed). It runs as the deploy role but sets the jwt
-- GUC per persona so create_firm/create_client/... resolve the right human actor.

do $$
declare
  -- Fixed synthetic identities (so a re-run is detectable and FKs are stable).
  k_alice constant uuid := '5eed0000-0000-4000-8000-00000000a11e';
  k_bob   constant uuid := '5eed0000-0000-4000-8000-00000000b0b1';
  k_dave  constant uuid := '5eed0000-0000-4000-8000-00000000da5e';
  k_erin  constant uuid := '5eed0000-0000-4000-8000-00000000e21f';
  k_tok_a constant uuid := '5eed0000-0000-4000-8000-0000000a0001';
  k_tok_b constant uuid := '5eed0000-0000-4000-8000-0000000a0002';
  v_firm_a uuid; v_firm_b uuid;
  v_client uuid; v_res uuid; v_entry uuid; v_tok uuid;
  v_clients uuid[] := '{}';
  cid uuid; acct record; n int;
begin
  -- Sentinel: alice present ⇒ already seeded (the seed file runs in ONE txn, so a
  -- failed first run rolls back entirely and re-runs clean).
  if exists (select 1 from clara.users where id = k_alice) then
    raise notice 'core seed already applied — skipping';
    return;
  end if;

  -- Provision synthetic users (the auth plane's job in production; synthetic here)
  -- and operator admission tokens (fail-closed firm creation, v2 §F/F23).
  insert into clara.users (id, display_name, email) values
    (k_alice, 'Alice Tan',   'alice@synthetic.test'),
    (k_bob,   'Bob Lim',     'bob@synthetic.test'),
    (k_dave,  'Dave Rahman', 'dave@synthetic.test'),
    (k_erin,  'Erin Wong',   'erin@synthetic.test');
  insert into clara.firm_admissions (token, note) values
    (k_tok_a, 'synthetic firm A bootstrap'),
    (k_tok_b, 'synthetic firm B bootstrap');

  -- ===== FIRM A (alice owner, bob bookkeeper): two clients =====
  perform set_config('request.jwt.claims', json_build_object('sub', k_alice)::text, true);
  v_firm_a := (clara.create_firm('Alara Advisory Sdn Bhd', k_tok_a, 'seed-firm-a') ->> 'firm_id')::uuid;
  perform clara.add_member(v_firm_a, k_bob, 'bookkeeper', 'seed-add-bob');
  v_clients := array[
    (clara.create_client('Sunrise Retail Sdn Bhd', 'seed-cli-1') ->> 'client_id')::uuid,
    (clara.create_client('Meridian Logistics Sdn Bhd', 'seed-cli-2') ->> 'client_id')::uuid
  ];

  -- ===== FIRM B (dave owner, erin bookkeeper): one client =====
  perform set_config('request.jwt.claims', json_build_object('sub', k_dave)::text, true);
  v_firm_b := (clara.create_firm('Borneo Books & Co', k_tok_b, 'seed-firm-b') ->> 'firm_id')::uuid;
  perform clara.add_member(v_firm_b, k_erin, 'bookkeeper', 'seed-add-erin');
  v_clients := v_clients ||
    (clara.create_client('Highland Coffee Sdn Bhd', 'seed-cli-3') ->> 'client_id')::uuid;

  -- ===== Per-client: a ~12-account chart (+ one rounding account) and one
  --       approved opening entry, drafted+approved by that client's firm owner. =====
  foreach cid in array v_clients loop
    -- Act as the owner of the client's firm (client_id -> firm -> owner).
    perform set_config('request.jwt.claims',
      json_build_object('sub',
        case when exists (select 1 from clara.clients c where c.id = cid and c.firm_id = v_firm_a)
             then k_alice else k_dave end
      )::text, true);

    for acct in select * from (values
      ('1000','Cash at Bank','asset'), ('1100','Accounts Receivable','asset'),
      ('1200','Inventory','asset'),    ('1500','Fixed Assets','asset'),
      ('2000','Accounts Payable','liability'), ('2100','Accruals','liability'),
      ('3000','Share Capital','equity'),       ('3900','Retained Earnings','equity'),
      ('4000','Sales','income'),               ('4100','Other Income','income'),
      ('5000','Cost of Sales','expense'),      ('6000','Operating Expenses','expense')
    ) as t(code, nm, typ) loop
      -- op_key is mandatory now (MEDIUM 15); a stable per-(client,code) key keeps the
      -- seed idempotent under the standard receipt dedupe.
      perform clara.upsert_account(cid, acct.code, acct.nm, acct.typ, null, 'seed-acct-'||cid||'-'||acct.code);
    end loop;
    perform clara.upsert_account(cid, '9990', 'Rounding', 'expense', 'rounding', 'seed-acct-'||cid||'-9990');

    -- A human-attributed resolution, then one balanced approved opening entry
    -- (RM5,000 — below the RM10,000 high-stakes threshold, so a routine approval).
    v_res := (clara.record_client_resolution(cid, 'manual', null, 0.99, 'human', '{}'::jsonb, 'seed-res-'||cid)
              ->> 'resolution_id')::uuid;
    v_entry := (clara.draft_entry(cid, v_res, current_date, 'Opening capital injection',
        '[{"account_code":"1000","debit_cents":500000},{"account_code":"3000","credit_cents":500000}]'::jsonb,
        null, null, '{}'::jsonb, 'seed-de-'||cid) ->> 'entry_id')::uuid;
    select revision_token into v_tok from clara.journal_entries where id = v_entry;
    perform clara.approve_entry(v_entry, v_tok, null, 'seed-ap-'||cid);
  end loop;

  raise notice 'core seed applied: 2 firms, 4 users, 3 clients, charts + opening entries';
end $$;
