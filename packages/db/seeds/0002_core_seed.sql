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
  k_cmt constant uuid := '5eed0000-0000-4000-8000-00000000c317';
  v_firm_a uuid; v_firm_b uuid;
  v_plan uuid; v_prev uuid;
  v_client uuid; v_res uuid; v_entry uuid; v_tok uuid;
  v_doc uuid; v_doc_firm uuid; v_sha text; v_seed_doc jsonb;
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
    (k_erin,  'Erin Wong',   'erin@synthetic.test'),
    (k_cmt,   'Cara Commit', 'cara@synthetic.test'); -- [R3-F2] the clean Gate-O committer
  -- 裁-16b (pre-beta hardening batch): firm_admissions stores token_hash only. k_tok_a/k_tok_b
  -- stay as VALUES (public, checked-in synthetic constants, not secrets) -- only the target
  -- column changes; create_firm(k_tok_a, ...) below is called with the SAME plaintext uuid.
  insert into clara.firm_admissions (token_hash, note) values
    (sha256(convert_to(k_tok_a::text, 'UTF8')), 'synthetic firm A bootstrap'),
    (sha256(convert_to(k_tok_b::text, 'UTF8')), 'synthetic firm B bootstrap');

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

    -- [R3-F2] the legacy creator now births ONBOARDING + a plan (no Gate-O
    -- bypass), so the seed drives its operational clients active THROUGH the
    -- audited verbs. PROBED law: the creator-opener is a contributor and the
    -- bookkeeper counts as an eligible checker (so self-attestation refuses,
    -- CLR05) yet cannot execute the admin-floored commit (CLR04) — the lawful
    -- committer is a DISTINCT clean ADMIN: the synthetic k_cmt admin added per
    -- firm below (memberships removed at the end). Bimodal-safe: on a pre-flip
    -- schema the status is already 'active' and this block skips.
    if (select status from clara.clients where id = cid) = 'onboarding' then
      select id, revision_token into v_plan, v_prev from clara.onboarding_plans
        where client_id = cid and state = 'open' order by created_at desc limit 1;
      perform clara.update_onboarding_plan(p_plan => v_plan, p_expected_revision => v_prev,
        p_items => '[{"item_kind":"todo","item_key":"carry_down_deferred","state":"deferred"}]'::jsonb,
        p_answered_by => case when exists (select 1 from clara.clients c where c.id = cid and c.firm_id = v_firm_a)
                              then k_alice else k_dave end,
        p_op_key => 'seed-plan-'||cid);
      select revision_token into v_prev from clara.onboarding_plans where id = v_plan;
      -- one-ACTIVE-firm law: k_cmt holds one membership at a time — hop firms
      -- through the audited member verbs as each firm's clients come up.
      if not exists (select 1 from clara.firm_memberships fm
          where fm.user_id = k_cmt and fm.status = 'active'
            and fm.firm_id = (select c2.firm_id from clara.clients c2 where c2.id = cid)) then
        if exists (select 1 from clara.firm_memberships fm where fm.user_id = k_cmt and fm.status = 'active') then
          perform set_config('request.jwt.claims', json_build_object('sub',
            case when exists (select 1 from clara.firm_memberships fm
                   where fm.user_id = k_cmt and fm.status = 'active' and fm.firm_id = v_firm_a)
                 then k_alice else k_dave end)::text, true);
          perform clara.remove_member(fm.id, 'seed-hop-cmt-'||cid)
            from clara.firm_memberships fm where fm.user_id = k_cmt and fm.status = 'active';
        end if;
        perform set_config('request.jwt.claims', json_build_object('sub',
          case when exists (select 1 from clara.clients c2 where c2.id = cid and c2.firm_id = v_firm_a)
               then k_alice else k_dave end)::text, true);
        perform clara.add_member((select c2.firm_id from clara.clients c2 where c2.id = cid),
          k_cmt, 'admin', 'seed-add-cmt-'||cid);
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', k_cmt)::text, true);
      perform clara.commit_client_onboarding(p_client => cid, p_plan => v_plan,
        p_expected_plan_revision => v_prev, p_op_key => 'seed-commit-'||cid);
      perform set_config('request.jwt.claims', json_build_object('sub',
        case when exists (select 1 from clara.clients c where c.id = cid and c.firm_id = v_firm_a)
             then k_alice else k_dave end)::text, true);
    end if;

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

    -- A transport-free VERIFIED fixture through 0007's owner-only seed helper.
    -- The helper creates the optional filing + its authoritative resolution; direct
    -- bytes_verified_at seeding is forbidden by the Slice-5 citability law.
    select firm_id into v_doc_firm from clara.clients where id = cid;
    v_sha := encode(sha256(convert_to(cid::text, 'UTF8')), 'hex');
    v_seed_doc := clara._seed_verified_document(
      v_doc_firm, cid, v_sha, 'synthetic-opening-'||cid||'.pdf', 'application/pdf', 2048,
      'firms/'||v_doc_firm||'/docs/'||v_sha||'.pdf',
      case when v_doc_firm = v_firm_a then k_alice else k_dave end);
    v_doc := (v_seed_doc ->> 'document_id')::uuid;
    v_res := (v_seed_doc ->> 'resolution_id')::uuid;

    -- One balanced approved opening entry (RM5,000 — below the RM10,000
    -- high-stakes threshold), citing the filing-bound verified document.
    v_entry := (clara.draft_entry(cid, v_res, current_date, 'Opening capital injection',
        '[{"account_code":"1000","debit_cents":500000},{"account_code":"3000","credit_cents":500000}]'::jsonb,
        v_doc, v_sha, '{}'::jsonb, 'seed-de-'||cid) ->> 'entry_id')::uuid;
    select revision_token into v_tok from clara.journal_entries where id = v_entry;
    perform clara.approve_entry(v_entry, v_tok, null, 'seed-ap-'||cid);
  end loop;

  -- [R3-F2] retire the synthetic Gate-O committer's memberships (the audited
  -- verb; the user row stays — synthetic worlds keep their audit trail).
  perform set_config('request.jwt.claims', json_build_object('sub', k_alice)::text, true);
  perform clara.remove_member(m.id, 'seed-rm-cmt-a')
    from clara.firm_memberships m where m.firm_id = v_firm_a and m.user_id = k_cmt and m.status = 'active';
  perform set_config('request.jwt.claims', json_build_object('sub', k_dave)::text, true);
  perform clara.remove_member(m.id, 'seed-rm-cmt-b')
    from clara.firm_memberships m where m.firm_id = v_firm_b and m.user_id = k_cmt and m.status = 'active';

  raise notice 'core seed applied: 2 firms, 5 users, 3 clients, charts + opening entries';
end $$;
